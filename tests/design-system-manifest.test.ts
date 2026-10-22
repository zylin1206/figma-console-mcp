/**
 * Design System Manifest Tests
 *
 * Unit tests for DesignSystemManifestCache, searchComponents, getCategories,
 * getTokenSummary, rgbToHex, figmaColorToHex, generateManifestSummary, createEmptyManifest,
 * and the Desktop Bridge → manifest helpers (variables, text styles, summary).
 */

import {
	addStylesToManifest,
	addVariablesToManifest,
	componentSearchLoadFailure,
	fontWeightFromStyle,
	isSpacingScope,
	summarizeManifest,
	unwrapBridgeVariables,
	DesignSystemManifestCache,
	searchComponents,
	getCategories,
	getTokenSummary,
	rgbToHex,
	figmaColorToHex,
	generateManifestSummary,
	createEmptyManifest,
} from "../src/core/design-system-manifest";
import type { DesignSystemManifest } from "../src/core/design-system-manifest";

// ============================================================================
// Helpers
// ============================================================================

function makeManifest(overrides: Partial<DesignSystemManifest> = {}): DesignSystemManifest {
	return {
		version: "1.0.0",
		generatedAt: Date.now(),
		fileKey: "test-file",
		fileName: "Test Design System",
		collections: [],
		tokens: {
			colors: {},
			spacing: {},
			typography: {},
			effects: {},
			paintStyles: {},
			grids: {},
			other: {},
		},
		components: {},
		componentSets: {},
		patterns: {},
		rules: [],
		summary: {
			totalTokens: 0,
			totalComponents: 0,
			totalComponentSets: 0,
			colorPalette: [],
			spacingScale: [],
			typographyScale: [],
			componentCategories: [],
		},
		...overrides,
	};
}

// ============================================================================
// Tests
// ============================================================================

describe("Design System Manifest", () => {
	// ========================================================================
	// rgbToHex
	// ========================================================================

	describe("rgbToHex", () => {
		it("converts pure red", () => {
			expect(rgbToHex({ r: 1, g: 0, b: 0 })).toBe("#FF0000");
		});

		it("converts pure green", () => {
			expect(rgbToHex({ r: 0, g: 1, b: 0 })).toBe("#00FF00");
		});

		it("converts pure blue", () => {
			expect(rgbToHex({ r: 0, g: 0, b: 1 })).toBe("#0000FF");
		});

		it("converts black", () => {
			expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
		});

		it("converts white", () => {
			expect(rgbToHex({ r: 1, g: 1, b: 1 })).toBe("#FFFFFF");
		});

		it("handles fractional values", () => {
			// 0.5 * 255 = 127.5 → rounds to 128 = 0x80
			expect(rgbToHex({ r: 0.5, g: 0.5, b: 0.5 })).toBe("#808080");
		});
	});

	// ========================================================================
	// figmaColorToHex
	// ========================================================================

	describe("figmaColorToHex", () => {
		it("returns string values as-is", () => {
			expect(figmaColorToHex("#FF0000")).toBe("#FF0000");
		});

		it("converts RGB object to hex", () => {
			expect(figmaColorToHex({ r: 1, g: 0, b: 0 })).toBe("#FF0000");
		});

		it("returns #000000 for unknown values", () => {
			expect(figmaColorToHex(null)).toBe("#000000");
			expect(figmaColorToHex(undefined)).toBe("#000000");
			expect(figmaColorToHex(42)).toBe("#000000");
		});
	});

	// ========================================================================
	// createEmptyManifest
	// ========================================================================

	describe("createEmptyManifest", () => {
		it("creates a manifest with the given fileKey", () => {
			const manifest = createEmptyManifest("abc123");
			expect(manifest.fileKey).toBe("abc123");
			expect(manifest.version).toBe("1.0.0");
		});

		it("has empty token collections", () => {
			const manifest = createEmptyManifest("key");
			expect(Object.keys(manifest.tokens.colors)).toHaveLength(0);
			expect(Object.keys(manifest.tokens.spacing)).toHaveLength(0);
			expect(Object.keys(manifest.tokens.typography)).toHaveLength(0);
			expect(Object.keys(manifest.tokens.effects)).toHaveLength(0);
		});

		it("has zero summary counts", () => {
			const manifest = createEmptyManifest("key");
			expect(manifest.summary.totalTokens).toBe(0);
			expect(manifest.summary.totalComponents).toBe(0);
			expect(manifest.summary.totalComponentSets).toBe(0);
		});
	});

	// ========================================================================
	// searchComponents
	// ========================================================================

	describe("searchComponents", () => {
		const manifest = makeManifest({
			componentSets: {
				"Button/Primary": {
					key: "btn-key",
					nodeId: "1:1",
					name: "Button/Primary",
					description: "Main action button",
					variants: [],
					variantAxes: [],
				},
				"Input/Text": {
					key: "inp-key",
					nodeId: "2:1",
					name: "Input/Text",
					description: "Text input field",
					variants: [],
					variantAxes: [],
				},
			},
			components: {
				"Icon/Arrow": {
					key: "ico-key",
					nodeId: "3:1",
					name: "Icon/Arrow",
					description: "Arrow icon",
				},
			},
		});

		it("finds components by name query", () => {
			const { results, total } = searchComponents(manifest, "Button");
			expect(total).toBe(1);
			expect(results[0].name).toBe("Button/Primary");
		});

		it("finds components by description", () => {
			const { results } = searchComponents(manifest, "arrow");
			expect(results).toHaveLength(1);
			expect(results[0].name).toBe("Icon/Arrow");
		});

		it("returns all with empty query", () => {
			const { total } = searchComponents(manifest, "");
			expect(total).toBe(3); // 2 sets + 1 component
		});

		it("filters by category", () => {
			const { results } = searchComponents(manifest, "", { category: "Input" });
			expect(results).toHaveLength(1);
			expect(results[0].name).toBe("Input/Text");
		});

		it("supports pagination with limit and offset", () => {
			const { results, hasMore } = searchComponents(manifest, "", {
				limit: 2,
				offset: 0,
			});
			expect(results).toHaveLength(2);
			expect(hasMore).toBe(true);

			const page2 = searchComponents(manifest, "", { limit: 2, offset: 2 });
			expect(page2.results).toHaveLength(1);
			expect(page2.hasMore).toBe(false);
		});

		it("returns empty for no matches", () => {
			const { results, total } = searchComponents(manifest, "nonexistent");
			expect(results).toHaveLength(0);
			expect(total).toBe(0);
		});
	});

	// ========================================================================
	// getCategories
	// ========================================================================

	describe("getCategories", () => {
		it("extracts categories from component names", () => {
			const manifest = makeManifest({
				componentSets: {
					"Button/Primary": { key: "k", nodeId: "1", name: "Button/Primary", variants: [], variantAxes: [] },
					"Button/Secondary": { key: "k2", nodeId: "2", name: "Button/Secondary", variants: [], variantAxes: [] },
				},
				components: {
					"Icon/Arrow": { key: "k3", nodeId: "3", name: "Icon/Arrow" },
				},
			});

			const categories = getCategories(manifest);
			expect(categories).toHaveLength(2);

			const button = categories.find((c) => c.name === "Button");
			expect(button).toBeDefined();
			expect(button!.componentSetCount).toBe(2);

			const icon = categories.find((c) => c.name === "Icon");
			expect(icon).toBeDefined();
			expect(icon!.componentCount).toBe(1);
		});

		it("returns empty for empty manifest", () => {
			const manifest = makeManifest();
			expect(getCategories(manifest)).toHaveLength(0);
		});

		it("sorts by total count descending", () => {
			const manifest = makeManifest({
				componentSets: {
					"A/One": { key: "k", nodeId: "1", name: "A/One", variants: [], variantAxes: [] },
				},
				components: {
					"B/One": { key: "k2", nodeId: "2", name: "B/One" },
					"B/Two": { key: "k3", nodeId: "3", name: "B/Two" },
					"B/Three": { key: "k4", nodeId: "4", name: "B/Three" },
				},
			});

			const categories = getCategories(manifest);
			expect(categories[0].name).toBe("B"); // 3 items
			expect(categories[1].name).toBe("A"); // 1 item
		});
	});

	// ========================================================================
	// getTokenSummary
	// ========================================================================

	describe("getTokenSummary", () => {
		it("counts tokens by type", () => {
			const manifest = makeManifest({
				tokens: {
					colors: {
						"primary/500": { name: "primary/500", value: "#3B82F6" },
						"primary/600": { name: "primary/600", value: "#2563EB" },
					},
					spacing: {
						"sm": { name: "sm", value: 4 },
						"md": { name: "md", value: 8 },
						"lg": { name: "lg", value: 16 },
					},
					typography: {},
					effects: {},
					paintStyles: {},
					grids: {},
					other: {},
				},
				collections: [{ id: "c1", name: "Primitives", modes: [], defaultModeId: "m1" }],
			});

			const summary = getTokenSummary(manifest);
			expect(summary.colors.count).toBe(2);
			expect(summary.spacing.count).toBe(3);
			expect(summary.spacing.scale).toEqual([4, 8, 16]);
			expect(summary.collections).toEqual(["Primitives"]);
		});

		it("groups colors by prefix", () => {
			const manifest = makeManifest({
				tokens: {
					colors: {
						"primary/100": { name: "primary/100", value: "#EFF6FF" },
						"primary/500": { name: "primary/500", value: "#3B82F6" },
						"secondary/500": { name: "secondary/500", value: "#8B5CF6" },
					},
					spacing: {},
					typography: {},
					effects: {},
					paintStyles: {},
					grids: {},
					other: {},
				},
			});

			const summary = getTokenSummary(manifest);
			expect(summary.colors.groups).toContain("primary");
			expect(summary.colors.groups).toContain("secondary");
		});

		it("deduplicates spacing values", () => {
			const manifest = makeManifest({
				tokens: {
					colors: {},
					spacing: {
						"padding-sm": { name: "padding-sm", value: 4 },
						"gap-sm": { name: "gap-sm", value: 4 },
						"padding-md": { name: "padding-md", value: 8 },
					},
					typography: {},
					effects: {},
					paintStyles: {},
					grids: {},
					other: {},
				},
			});

			const summary = getTokenSummary(manifest);
			expect(summary.spacing.scale).toEqual([4, 8]);
		});
	});

	// ========================================================================
	// generateManifestSummary
	// ========================================================================

	describe("generateManifestSummary", () => {
		it("generates markdown with file name", () => {
			const manifest = makeManifest({ fileName: "My Design System" });
			const md = generateManifestSummary(manifest);
			expect(md).toContain("My Design System");
			expect(md).toContain("# Design System Manifest");
		});

		it("includes token and component counts", () => {
			const manifest = makeManifest({
				summary: {
					totalTokens: 42,
					totalComponents: 10,
					totalComponentSets: 5,
					colorPalette: ["#FF0000"],
					spacingScale: [4, 8, 16],
					typographyScale: ["Heading 1"],
					componentCategories: ["Buttons"],
				},
			});

			const md = generateManifestSummary(manifest);
			expect(md).toContain("**42** design tokens");
			expect(md).toContain("**10** components");
			expect(md).toContain("**5** component sets");
		});
	});

	// ========================================================================
	// DesignSystemManifestCache
	// ========================================================================

	describe("DesignSystemManifestCache", () => {
		let cache: DesignSystemManifestCache;

		beforeEach(() => {
			cache = DesignSystemManifestCache.getInstance();
			cache.invalidateAll();
		});

		it("returns same instance (singleton)", () => {
			const a = DesignSystemManifestCache.getInstance();
			const b = DesignSystemManifestCache.getInstance();
			expect(a).toBe(b);
		});

		it("stores and retrieves a manifest", () => {
			const manifest = makeManifest({ fileKey: "f1" });
			cache.set("f1", manifest);

			const entry = cache.get("f1");
			expect(entry).not.toBeNull();
			expect(entry!.manifest.fileKey).toBe("f1");
		});

		it("returns null for missing keys", () => {
			expect(cache.get("nonexistent")).toBeNull();
		});

		it("invalidates a specific key", () => {
			cache.set("f1", makeManifest());
			cache.invalidate("f1");
			expect(cache.get("f1")).toBeNull();
		});

		it("invalidates all keys", () => {
			cache.set("f1", makeManifest());
			cache.set("f2", makeManifest());
			cache.invalidateAll();
			expect(cache.get("f1")).toBeNull();
			expect(cache.get("f2")).toBeNull();
		});

		it("reports stats for cached entries", () => {
			cache.set("f1", makeManifest({
				summary: { totalTokens: 10, totalComponents: 5, totalComponentSets: 2, colorPalette: [], spacingScale: [], typographyScale: [], componentCategories: [] },
			}));

			const stats = cache.getStats();
			expect(stats).toHaveLength(1);
			expect(stats[0].fileKey).toBe("f1");
			expect(stats[0].tokenCount).toBe(10);
			expect(stats[0].componentCount).toBe(7); // 5 + 2
		});

		it("expires entries after TTL", () => {
			const manifest = makeManifest();
			cache.set("f1", manifest);

			// Get the entry and manually backdate it
			const entry = cache.get("f1")!;
			entry.timestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago (TTL is 5 min)

			expect(cache.isValid(entry)).toBe(false);
			// get() should also return null for expired entries
			expect(cache.get("f1")).toBeNull();
		});
	});
});

describe("componentSearchLoadFailure", () => {
	const warning = "Components fetch failed (WebSocket command GET_LOCAL_COMPONENTS timed out after 300000ms) — results may be incomplete and were NOT cached; retry after checking the Desktop Bridge plugin.";

	it("reports a failed load instead of letting an empty manifest read as 'no matches'", () => {
		const msg = componentSearchLoadFailure(makeManifest(), warning);
		expect(msg).toContain("Component search could not run");
		expect(msg).toContain("timed out after 300000ms");
	});

	it("lets a genuinely empty file search normally (no warning = the load succeeded)", () => {
		expect(componentSearchLoadFailure(makeManifest(), undefined)).toBeNull();
	});

	it("still searches when components did load despite a warning", () => {
		const manifest = makeManifest({
			components: { k1: { key: "k1", nodeId: "1:1", name: "Button" } } as any,
		});
		expect(componentSearchLoadFailure(manifest, warning)).toBeNull();
	});
});

// ============================================================================
// Desktop Bridge → manifest
// ============================================================================

// The shape connector.getVariables() really returns: EXECUTE_CODE nests the
// script's return value under `result` (see #68).
function bridgeVariables(variables: any[], variableCollections: any[]) {
	return { success: true, result: { success: true, variables, variableCollections } };
}

const collections = [
	{ id: "c1", name: "Global", modes: [{ modeId: "m1", name: "Default" }], defaultModeId: "m1" },
];

const variables = [
	{ id: "v1", name: "blue/500", resolvedType: "COLOR", variableCollectionId: "c1", scopes: ["ALL_FILLS"], valuesByMode: { m1: { r: 0, g: 0, b: 1, a: 1 } } },
	{ id: "v2", name: "dm-4", resolvedType: "FLOAT", variableCollectionId: "c1", scopes: ["GAP", "WIDTH_HEIGHT"], valuesByMode: { m1: 16 } },
	{ id: "v3", name: "Input/Gap", resolvedType: "FLOAT", variableCollectionId: "c1", scopes: ["GAP"], valuesByMode: { m1: { type: "VARIABLE_ALIAS", id: "v2" } } },
	{ id: "v4", name: "Radius/Base", resolvedType: "FLOAT", variableCollectionId: "c1", scopes: ["CORNER_RADIUS"], valuesByMode: { m1: 8 } },
	{ id: "v5", name: "Letter-Spacing/Display", resolvedType: "FLOAT", variableCollectionId: "c1", scopes: ["LETTER_SPACING"], valuesByMode: { m1: -4.4 } },
	{ id: "v6", name: "Legacy/Size", resolvedType: "FLOAT", variableCollectionId: "c1", scopes: ["ALL_SCOPES"], valuesByMode: { m1: 24 } },
	{ id: "v7", name: "Font/Family", resolvedType: "STRING", variableCollectionId: "c1", scopes: ["FONT_FAMILY"], valuesByMode: { m1: "Inter" } },
];

describe("unwrapBridgeVariables", () => {
	it("unwraps the EXECUTE_CODE `result` nesting", () => {
		const data = unwrapBridgeVariables(bridgeVariables(variables, collections));
		expect(data?.variables).toHaveLength(7);
		expect(data?.variableCollections).toHaveLength(1);
	});

	it("accepts the un-nested plugin-UI cache shape", () => {
		const data = unwrapBridgeVariables({ success: true, variables, variableCollections: collections });
		expect(data?.variables).toHaveLength(7);
	});

	it("returns null for a failed or empty result", () => {
		expect(unwrapBridgeVariables({ success: false, error: "boom" })).toBeNull();
		expect(unwrapBridgeVariables({ success: true, result: { success: false } })).toBeNull();
		expect(unwrapBridgeVariables(undefined)).toBeNull();
	});
});

describe("isSpacingScope", () => {
	it("treats gap, width/height, all-scopes and unscoped as spacing", () => {
		expect(isSpacingScope(["GAP"])).toBe(true);
		expect(isSpacingScope(["WIDTH_HEIGHT"])).toBe(true);
		expect(isSpacingScope(["ALL_SCOPES"])).toBe(true);
		expect(isSpacingScope([])).toBe(true);
		expect(isSpacingScope(undefined)).toBe(true);
	});

	it("does not treat radius or typography scopes as spacing", () => {
		expect(isSpacingScope(["CORNER_RADIUS"])).toBe(false);
		expect(isSpacingScope(["LETTER_SPACING"])).toBe(false);
		expect(isSpacingScope(["FONT_SIZE", "LINE_HEIGHT"])).toBe(false);
	});
});

describe("addVariablesToManifest", () => {
	it("reads variables from the real getVariables() shape (regression: summary reported 0 tokens)", () => {
		const manifest = createEmptyManifest("key");
		expect(addVariablesToManifest(manifest, bridgeVariables(variables, collections))).toBe(true);
		summarizeManifest(manifest);
		expect(manifest.summary.totalTokens).toBe(7);
		expect(manifest.collections.map((c) => c.name)).toEqual(["Global"]);
	});

	it("files each variable by type and scope", () => {
		const manifest = createEmptyManifest("key");
		addVariablesToManifest(manifest, bridgeVariables(variables, collections));
		expect(Object.keys(manifest.tokens.colors)).toEqual(["blue/500"]);
		expect(Object.keys(manifest.tokens.spacing).sort()).toEqual(["Input/Gap", "Legacy/Size", "dm-4"]);
		expect(manifest.tokens.other["Radius/Base"]).toMatchObject({ type: "CORNER_RADIUS", value: 8 });
		expect(manifest.tokens.other["Letter-Spacing/Display"]).toMatchObject({ type: "LETTER_SPACING", value: -4.4 });
		expect(manifest.tokens.other["Font/Family"]).toMatchObject({ type: "STRING", value: "Inter" });
	});

	it("resolves an aliased spacing value instead of reading it as 0", () => {
		const manifest = createEmptyManifest("key");
		addVariablesToManifest(manifest, bridgeVariables(variables, collections));
		expect(manifest.tokens.spacing["Input/Gap"].value).toBe(16);
	});

	it("keeps letter spacing out of the spacing scale", () => {
		const manifest = createEmptyManifest("key");
		addVariablesToManifest(manifest, bridgeVariables(variables, collections));
		summarizeManifest(manifest);
		expect(manifest.summary.spacingScale).toEqual([16, 24]);
		expect(getTokenSummary(manifest).other.types).toEqual({ CORNER_RADIUS: 1, LETTER_SPACING: 1, STRING: 1 });
	});

	it("returns false and adds nothing when no variables came back", () => {
		const manifest = createEmptyManifest("key");
		expect(addVariablesToManifest(manifest, { success: false, error: "timeout" })).toBe(false);
		expect(manifest.collections).toHaveLength(0);
	});
});

describe("fontWeightFromStyle", () => {
	it("maps style names to weights", () => {
		expect(fontWeightFromStyle("Regular")).toBe(400);
		expect(fontWeightFromStyle("Light")).toBe(300);
		expect(fontWeightFromStyle("Extra Light")).toBe(200);
		expect(fontWeightFromStyle("Medium")).toBe(500);
		expect(fontWeightFromStyle("Semi Bold")).toBe(600);
		expect(fontWeightFromStyle("SemiBold Italic")).toBe(600);
		expect(fontWeightFromStyle("Bold")).toBe(700);
		expect(fontWeightFromStyle("ExtraBold")).toBe(800);
		expect(fontWeightFromStyle("Black")).toBe(900);
		expect(fontWeightFromStyle(undefined)).toBe(400);
	});
});

describe("addStylesToManifest", () => {
	// The shape style-resolver.ts fetchBridgeStyles() returns.
	const styles = [
		{ id: "S:1", key: "k1", name: "Display/1", description: "", style_type: "TEXT", value: { typography: { fontFamily: "Inter", fontStyle: "Semi Bold", fontSize: 48, lineHeight: { unit: "PIXELS", value: 56 }, letterSpacing: { unit: "PIXELS", value: -2 }, textCase: "ORIGINAL", textDecoration: "NONE" } } },
		{ id: "S:2", key: "k2", name: "Body/Base", description: "Body text", style_type: "TEXT", value: { typography: { fontFamily: "Inter", fontStyle: "Regular", fontSize: 14, lineHeight: { unit: "AUTO" }, letterSpacing: { unit: "PIXELS", value: 0 } } } },
		{ id: "S:3", key: "k3", name: "Border/Glass", description: "", style_type: "FILL", value: { fills: [{ type: "GRADIENT_LINEAR", gradientStops: [{ position: 0, color: "#FFFFFF29" }, { position: 1, color: "#FFFFFF29" }] }] } },
		{ id: "S:4", key: "k4", name: "Avatars/1", description: "", style_type: "FILL", value: { fills: [{ type: "IMAGE", imageHash: "abc" }] } },
		{ id: "S:5", key: "k5", name: "Shadow/Basic", description: "", style_type: "EFFECT", value: { effects: [{ type: "DROP_SHADOW", radius: 24, color: "#0000000A", offset: { x: 0, y: 8 }, spread: -16 }] } },
		{ id: "S:6", key: "k6", name: "12 col", description: "", style_type: "GRID", value: { grids: [{ pattern: "COLUMNS", count: 12, gutterSize: 24, offset: 80, alignment: "STRETCH" }] } },
	];

	it("files text styles as typography tokens", () => {
		const manifest = createEmptyManifest("key");
		addStylesToManifest(manifest, styles);
		expect(manifest.tokens.typography["Display/1"]).toMatchObject({
			fontFamily: "Inter",
			fontSize: 48,
			fontWeight: 600,
			lineHeight: { value: 56, unit: "PIXELS" },
			letterSpacing: -2,
			styleId: "S:1",
		});
		expect(manifest.tokens.typography["Body/Base"].lineHeight).toEqual({ value: 0, unit: "AUTO" });
		expect(manifest.tokens.typography["Body/Base"].description).toBe("Body text");
	});

	it("files color, effect and grid styles with their values", () => {
		const manifest = createEmptyManifest("key");
		addStylesToManifest(manifest, styles);
		expect(manifest.tokens.paintStyles["Border/Glass"].paints[0].type).toBe("GRADIENT_LINEAR");
		expect(manifest.tokens.paintStyles["Avatars/1"].paints[0]).toMatchObject({ type: "IMAGE", imageHash: "abc" });
		expect(manifest.tokens.effects["Shadow/Basic"]).toMatchObject({ type: "DROP_SHADOW", effects: [{ radius: 24, color: "#0000000A" }] });
		expect(manifest.tokens.grids["12 col"].grids[0]).toMatchObject({ pattern: "COLUMNS", count: 12 });
	});

	it("counts every style in the summary (regression: typography, color, effect and grid reported 0)", () => {
		const manifest = createEmptyManifest("key");
		addStylesToManifest(manifest, styles);
		summarizeManifest(manifest);
		expect(manifest.summary.totalTokens).toBe(6);
		expect(manifest.summary.typographyScale).toEqual(["Display/1", "Body/Base"]);
		const summary = getTokenSummary(manifest);
		expect(summary.typography).toEqual({ count: 2, groups: ["Display", "Body"] });
		expect(summary.paintStyles).toEqual({ count: 2, groups: ["Border", "Avatars"] });
		expect(summary.effects).toEqual({ count: 1, groups: ["Shadow"] });
		expect(summary.grids).toEqual({ count: 1, names: ["12 col"] });
	});

	it("keeps variable-font axes and text wrapping; wght overrides the style-name weight", () => {
		const manifest = createEmptyManifest("key");
		addStylesToManifest(manifest, [
			{ id: "S:7", name: "Heading/Fluid", style_type: "TEXT", value: { typography: { fontFamily: "Inter Variable", fontStyle: "Regular", fontSize: 32, variationSettings: { wght: 550, opsz: 32 }, textWrapStyle: "BALANCE" } } },
		]);
		expect(manifest.tokens.typography["Heading/Fluid"]).toMatchObject({
			fontWeight: 550,
			variationSettings: { wght: 550, opsz: 32 },
			textWrapStyle: "BALANCE",
		});
		// Static fonts keep the name-derived weight and carry neither field
		addStylesToManifest(manifest, styles);
		expect(manifest.tokens.typography["Display/1"].fontWeight).toBe(600);
		expect(manifest.tokens.typography["Display/1"].variationSettings).toBeUndefined();
		expect(manifest.tokens.typography["Display/1"].textWrapStyle).toBeUndefined();
	});

	it("tolerates a style without a value (REST-shaped)", () => {
		const manifest = createEmptyManifest("key");
		addStylesToManifest(manifest, [{ name: "Brand/Primary", style_type: "FILL" }]);
		expect(manifest.tokens.paintStyles["Brand/Primary"].paints).toEqual([]);
	});
});
