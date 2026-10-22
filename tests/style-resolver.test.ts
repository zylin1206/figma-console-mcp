/**
 * Tests for bridge-first style resolution.
 * Verifies the Desktop Bridge is preferred (it sees every local style, published
 * or not, with its value) and the REST Styles API — published styles only — is
 * the fallback. Also runs the plugin script against a mock `figma` global, the
 * way code.js does, so a script bug fails here and not in Figma.
 */

import {
  LOCAL_STYLES_CODE,
  resolveStyles,
  unwrapBridgeStyles,
} from '../src/core/style-resolver.js';

const rgba = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a });

// A mock of the Plugin API's local-style getters, shaped like SensaUI's styles.
const mockFigma = {
  getLocalPaintStylesAsync: async () => [
    { id: 'S:1,', key: 'k1', name: 'Border/Glass', description: '', paints: [
      { type: 'GRADIENT_LINEAR', visible: true, opacity: 1, blendMode: 'NORMAL',
        gradientStops: [{ position: 0, color: rgba(1, 1, 1, 0.16) }, { position: 1, color: rgba(1, 1, 1, 0.16) }] },
    ] },
    { id: 'S:2,', key: 'k2', name: 'Brand/Primary', description: 'Main', paints: [
      { type: 'SOLID', visible: true, opacity: 0.5, blendMode: 'NORMAL', color: { r: 0, g: 0, b: 1 },
        boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'VariableID:1' } } },
    ] },
    { id: 'S:3,', key: 'k3', name: 'Avatars/1', description: '', paints: [
      { type: 'IMAGE', visible: true, opacity: 1, blendMode: 'NORMAL', imageHash: 'abc', scaleMode: 'FILL' },
    ] },
  ],
  getLocalTextStylesAsync: async () => [
    { id: 'S:4,', key: 'k4', name: 'Display/1', description: '',
      fontName: { family: 'Inter', style: 'Semi Bold' }, fontSize: 78,
      lineHeight: { unit: 'PIXELS', value: 88 }, letterSpacing: { unit: 'PIXELS', value: -4.4 },
      paragraphSpacing: 0, textCase: 'ORIGINAL', textDecoration: 'NONE',
      boundVariables: { fontSize: { type: 'VARIABLE_ALIAS', id: 'VariableID:2' } } },
  ],
  getLocalEffectStylesAsync: async () => [
    { id: 'S:5,', key: 'k5', name: 'Effect/Container', description: '', effects: [
      { type: 'DROP_SHADOW', visible: true, radius: 24, spread: -16, offset: { x: 0, y: 8 }, color: rgba(0, 0, 0, 0.04) },
      { type: 'LAYER_BLUR', visible: false, radius: 4 },
    ] },
  ],
  getLocalGridStylesAsync: async () => [
    { id: 'S:6,', key: 'k6', name: '12 col', description: '', layoutGrids: [
      { pattern: 'COLUMNS', visible: true, count: 12, gutterSize: 24, offset: 80, alignment: 'STRETCH', color: rgba(1, 0, 0, 0.1) },
    ] },
  ],
};

/** Run the plugin script the way code.js does: wrapped in an async IIFE. */
async function runPluginScript(figma: any): Promise<any> {
  // eslint-disable-next-line no-new-func
  const run = new Function('figma', `return (async function() {\n${LOCAL_STYLES_CODE}\n})()`);
  return run(figma);
}

describe('LOCAL_STYLES_CODE (plugin script)', () => {
  it('reads every local style with its value', async () => {
    const result = await runPluginScript(mockFigma);
    expect(result.success).toBe(true);
    expect(result.styles.map((s: any) => s.style_type)).toEqual(['FILL', 'FILL', 'FILL', 'TEXT', 'EFFECT', 'GRID']);
  });

  it('serialises paints: gradient stops, solid color with opacity, image hash, bound variables', async () => {
    const { styles } = await runPluginScript(mockFigma);
    expect(styles[0].value.fills[0]).toEqual({
      type: 'GRADIENT_LINEAR',
      gradientStops: [{ position: 0, color: '#FFFFFF29' }, { position: 1, color: '#FFFFFF29' }],
    });
    expect(styles[1]).toMatchObject({ name: 'Brand/Primary', description: 'Main', key: 'k2', id: 'S:2,' });
    expect(styles[1].value.fills[0]).toEqual({
      type: 'SOLID', opacity: 0.5, color: '#0000FF', boundVariables: { color: 'VariableID:1' },
    });
    expect(styles[2].value.fills[0]).toEqual({ type: 'IMAGE', imageHash: 'abc', scaleMode: 'FILL' });
  });

  it('serialises text, effect and grid values', async () => {
    const { styles } = await runPluginScript(mockFigma);
    expect(styles[3].value.typography).toMatchObject({
      fontFamily: 'Inter', fontStyle: 'Semi Bold', fontSize: 78,
      lineHeight: { unit: 'PIXELS', value: 88 }, boundVariables: { fontSize: 'VariableID:2' },
    });
    expect(styles[4].value.effects).toEqual([
      { type: 'DROP_SHADOW', radius: 24, color: '#0000000A', offset: { x: 0, y: 8 }, spread: -16 },
      { type: 'LAYER_BLUR', radius: 4, visible: false },
    ]);
    expect(styles[5].value.grids).toEqual([
      { pattern: 'COLUMNS', count: 12, gutterSize: 24, offset: 80, alignment: 'STRETCH', color: '#FF00001A' },
    ]);
  });

  it('reports a Plugin API failure instead of throwing', async () => {
    const result = await runPluginScript({
      ...mockFigma,
      getLocalGridStylesAsync: async () => { throw new Error('not a design file'); },
    });
    expect(result).toEqual({ success: false, error: 'not a design file' });
  });
});

describe('unwrapBridgeStyles', () => {
  it('unwraps the EXECUTE_CODE `result` nesting (#68)', () => {
    expect(unwrapBridgeStyles({ success: true, result: { success: true, styles: [{ name: 'a' }] } })).toEqual([{ name: 'a' }]);
  });

  it('returns null for a failed run', () => {
    expect(unwrapBridgeStyles({ success: true, result: { success: false, error: 'x' } })).toBeNull();
    expect(unwrapBridgeStyles({ success: false, error: 'timeout' })).toBeNull();
  });
});

describe('resolveStyles', () => {
  const restApi = (styles: any[]) => ({ getStyles: jest.fn(async () => ({ meta: { styles } })) });

  it('prefers the Desktop Bridge and returns every local style with values', async () => {
    const connector = {
      executeCodeViaUI: jest.fn(async (code: string) => ({ success: true, result: await runPluginScript(mockFigma) })),
    };
    const api = restApi([]);
    const resolved = await resolveStyles({
      getDesktopConnector: async () => connector,
      getFigmaAPI: async () => api as any,
      fileKey: 'file1',
    });
    expect(resolved.source).toBe('desktop_bridge');
    expect(resolved.styles).toHaveLength(6);
    expect(resolved.styles[5].value).toBeDefined();
    expect(connector.executeCodeViaUI).toHaveBeenCalledWith(LOCAL_STYLES_CODE, 30000, 'file1');
    expect(api.getStyles).not.toHaveBeenCalled();
  });

  it('falls back to the REST API (published styles only) when the bridge fails', async () => {
    const connector = { executeCodeViaUI: jest.fn(async () => { throw new Error('no plugin connected'); }) };
    const api = restApi([{ key: 'k', name: 'Published/One', style_type: 'FILL', description: '', node_id: '1:2' }]);
    const resolved = await resolveStyles({
      getDesktopConnector: async () => connector,
      getFigmaAPI: async () => api as any,
      fileKey: 'file1',
    });
    expect(resolved.source).toBe('rest_api');
    expect(resolved.styles).toEqual([{ key: 'k', name: 'Published/One', style_type: 'FILL', description: '', node_id: '1:2' }]);
  });

  it('falls back to the REST API when the bridge returns no styles', async () => {
    const connector = { executeCodeViaUI: jest.fn(async () => ({ success: true, result: { success: false, error: 'x' } })) };
    const api = restApi([]);
    const resolved = await resolveStyles({
      getDesktopConnector: async () => connector,
      getFigmaAPI: async () => api as any,
      fileKey: 'file1',
    });
    expect(resolved.source).toBe('rest_api');
    expect(api.getStyles).toHaveBeenCalledWith('file1');
  });

  it('uses the REST API directly when no bridge is available', async () => {
    const api = restApi([]);
    const resolved = await resolveStyles({ getFigmaAPI: async () => api as any, fileKey: 'file1' });
    expect(resolved.source).toBe('rest_api');
  });
});
