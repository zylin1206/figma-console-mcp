/**
 * Bridge-first style resolution.
 *
 * Figma's Styles REST API (`/files/:key/styles`) returns only **published**
 * library styles. A file whose styles were never published — the usual case
 * for a working design-system file — comes back with zero styles, so
 * `figma_get_styles` and `figma_get_design_system_kit` reported none while the
 * file's Styles panel listed dozens. The Desktop Bridge and cloud relay read
 * them through the Plugin API (`figma.getLocal*StylesAsync`), which sees every
 * local style, published or not, with its value.
 *
 *   1. Desktop Bridge / cloud relay (local styles, with values)  ← preferred
 *   2. REST Styles API (published styles, metadata only)          ← fallback
 *
 * Styles come back in the REST shape (`key`, `name`, `style_type`,
 * `description`, `node_id`) so existing consumers keep working; bridge styles
 * add `id` and `value`.
 */

import { withTimeout, type FigmaAPI } from "./figma-api.js";
import { createChildLogger } from "./logger.js";

const logger = createChildLogger({ component: "style-resolver" });

export type StyleType = "FILL" | "TEXT" | "EFFECT" | "GRID";

export interface ResolvedStyle {
	key: string;
	name: string;
	style_type: StyleType;
	description: string;
	/** REST only: the node that defines the style. */
	node_id?: string;
	/** Bridge only: the Plugin API style id ("S:…"). */
	id?: string;
	/**
	 * Bridge only: the style's value, keyed by type — `fills` (FILL),
	 * `typography` (TEXT), `effects` (EFFECT), `grids` (GRID).
	 */
	value?: Record<string, any>;
}

export interface ResolvedStyles {
	styles: ResolvedStyle[];
	/** Which transport actually produced the data. */
	source: "desktop_bridge" | "rest_api";
}

/**
 * Plugin-context script that reads every local style with its value.
 *
 * IMPORTANT: bare try/catch with top-level `return`, NO inner IIFE — code.js
 * wraps every EXECUTE_CODE payload in its own async IIFE (see #68 and
 * websocket-connector.ts getVariables).
 */
export const LOCAL_STYLES_CODE = `
  try {
    function hex(c) {
      function h(n) { var s = Math.round(n * 255).toString(16); return s.length < 2 ? '0' + s : s; }
      var out = '#' + h(c.r) + h(c.g) + h(c.b);
      if (c.a !== undefined && c.a < 1) out += h(c.a);
      return out.toUpperCase();
    }
    function bound(b) {
      if (!b) return undefined;
      var out = {}; var any = false;
      for (var k in b) {
        var v = b[k];
        if (Array.isArray(v)) v = v[0];
        if (v && v.id) { out[k] = v.id; any = true; }
      }
      return any ? out : undefined;
    }
    function base(s, type) {
      return { id: s.id, key: s.key, name: s.name, description: s.description || '', style_type: type };
    }
    var styles = [];
    var paints = await figma.getLocalPaintStylesAsync();
    for (var i = 0; i < paints.length; i++) {
      var p = paints[i]; var st = base(p, 'FILL');
      st.value = { fills: p.paints.map(function(f) {
        var o = { type: f.type };
        if (f.visible === false) o.visible = false;
        if (f.opacity !== undefined && f.opacity !== 1) o.opacity = f.opacity;
        if (f.color) o.color = hex(f.color);
        if (f.gradientStops) o.gradientStops = f.gradientStops.map(function(g) { return { position: g.position, color: hex(g.color) }; });
        if (f.type === 'IMAGE') { o.imageHash = f.imageHash; o.scaleMode = f.scaleMode; }
        if (f.blendMode && f.blendMode !== 'NORMAL') o.blendMode = f.blendMode;
        var bv = bound(f.boundVariables); if (bv) o.boundVariables = bv;
        return o;
      }) };
      styles.push(st);
    }
    var texts = await figma.getLocalTextStylesAsync();
    for (var j = 0; j < texts.length; j++) {
      var t = texts[j]; var tt = base(t, 'TEXT');
      tt.value = { typography: {
        fontFamily: t.fontName ? t.fontName.family : undefined,
        fontStyle: t.fontName ? t.fontName.style : undefined,
        fontSize: t.fontSize,
        lineHeight: t.lineHeight,
        letterSpacing: t.letterSpacing,
        paragraphSpacing: t.paragraphSpacing,
        textCase: t.textCase,
        textDecoration: t.textDecoration,
        variationSettings: t.fontName && t.fontName.variationSettings ? t.fontName.variationSettings : undefined,
        textWrapStyle: t.textWrapStyle && t.textWrapStyle !== 'AUTO' ? t.textWrapStyle : undefined,
        boundVariables: bound(t.boundVariables)
      } };
      styles.push(tt);
    }
    var effects = await figma.getLocalEffectStylesAsync();
    for (var k = 0; k < effects.length; k++) {
      var e = effects[k]; var et = base(e, 'EFFECT');
      et.value = { effects: e.effects.map(function(x) {
        var o = { type: x.type, radius: x.radius };
        if (x.visible === false) o.visible = false;
        if (x.color) o.color = hex(x.color);
        if (x.offset) o.offset = x.offset;
        if (x.spread !== undefined) o.spread = x.spread;
        var bv = bound(x.boundVariables); if (bv) o.boundVariables = bv;
        return o;
      }) };
      styles.push(et);
    }
    var grids = await figma.getLocalGridStylesAsync();
    for (var m = 0; m < grids.length; m++) {
      var g = grids[m]; var gt = base(g, 'GRID');
      gt.value = { grids: g.layoutGrids.map(function(x) {
        var o = { pattern: x.pattern };
        if (x.visible === false) o.visible = false;
        if (x.sectionSize !== undefined) o.sectionSize = x.sectionSize;
        if (x.count !== undefined) o.count = x.count;
        if (x.gutterSize !== undefined) o.gutterSize = x.gutterSize;
        if (x.offset !== undefined) o.offset = x.offset;
        if (x.alignment) o.alignment = x.alignment;
        if (x.color) o.color = hex(x.color);
        return o;
      }) };
      styles.push(gt);
    }
    return { success: true, styles: styles };
  } catch (error) {
    return { success: false, error: error.message };
  }
`;

/**
 * Unwrap a LOCAL_STYLES_CODE run. EXECUTE_CODE nests the script's return
 * value under `result` (#68). Returns null when no styles came back.
 */
export function unwrapBridgeStyles(raw: any): ResolvedStyle[] | null {
	const data = raw?.result?.styles ? raw.result : raw;
	if (!data?.success || !Array.isArray(data.styles)) return null;
	return data.styles;
}

/** Read every local style through the Desktop Bridge / cloud relay. */
export async function fetchBridgeStyles(
	connector: any,
	fileKey?: string,
	timeoutMs = 30000,
): Promise<ResolvedStyle[] | null> {
	const raw = await connector.executeCodeViaUI(LOCAL_STYLES_CODE, timeoutMs, fileKey);
	return unwrapBridgeStyles(raw);
}

/**
 * Resolve the file's styles, preferring the Desktop Bridge / cloud relay and
 * falling back to the REST Styles API (published styles only) when no bridge
 * is connected or it returned nothing.
 */
export async function resolveStyles(opts: {
	getDesktopConnector?: () => Promise<any>;
	getFigmaAPI: () => Promise<FigmaAPI>;
	fileKey: string;
	timeoutMs?: number;
}): Promise<ResolvedStyles> {
	const { getDesktopConnector, getFigmaAPI, fileKey } = opts;
	const timeoutMs = opts.timeoutMs ?? 30000;

	// 1. Desktop Bridge / cloud relay — every local style, with values.
	if (getDesktopConnector) {
		try {
			const connector = await getDesktopConnector();
			const styles = await withTimeout(
				fetchBridgeStyles(connector, fileKey, timeoutMs),
				timeoutMs + 2000,
				"Desktop Bridge styles",
			);
			if (styles) {
				logger.info(
					{ source: "desktop_bridge", styleCount: styles.length },
					"Resolved styles via Desktop Bridge",
				);
				return { styles, source: "desktop_bridge" };
			}
			logger.warn({ fileKey }, "Desktop Bridge returned no styles; falling back to REST API");
		} catch (err) {
			logger.warn(
				{ fileKey, error: err instanceof Error ? err.message : String(err) },
				"Desktop Bridge style fetch failed; falling back to REST API",
			);
		}
	}

	// 2. REST Styles API — published styles only, no values.
	const api = await getFigmaAPI();
	const stylesData = await withTimeout(api.getStyles(fileKey), timeoutMs, "getStyles");
	const styles: ResolvedStyle[] = stylesData?.meta?.styles || [];
	logger.info({ source: "rest_api", styleCount: styles.length }, "Resolved styles via REST API");
	return { styles, source: "rest_api" };
}
