/**
 * Name mappings between a token file and Figma:
 *   - figma_import_tokens `collectionMapping` (input set → Figma collection)
 *   - tokens.config.json `modes.map` (Figma mode → code mode): applied on
 *     export, and in reverse on import when no `modeMapping` is passed.
 *
 * Both were declared in the schemas but never applied.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyCollectionMapping,
  registerExportTokensTool,
  registerImportTokensTool,
} from "../src/core/tokens-tools";
import type { TokenDocument } from "../src/core/tokens";

/** A Figma file with one "Theme" collection: Light/Dark, one color. */
function figmaState() {
  return {
    success: true,
    variableCollections: [
      {
        id: "C:1",
        name: "Theme",
        modes: [{ modeId: "m1", name: "Light" }, { modeId: "m2", name: "Dark" }],
        defaultModeId: "m1",
        variableIds: ["V:1"],
      },
    ],
    variables: [
      {
        id: "V:1",
        name: "color/primary",
        resolvedType: "COLOR",
        variableCollectionId: "C:1",
        valuesByMode: { m1: { r: 1, g: 0, b: 0, a: 1 }, m2: { r: 1, g: 0, b: 0, a: 1 } },
      },
    ],
  };
}

/** Records the update script's payload; answers like the plugin would. */
function mockConnector() {
  const updates: any[] = [];
  return {
    updates,
    getVariablesFromPluginUI: async () => figmaState(),
    executeCodeViaUI: async (script: string) => {
      const marker = "const updates = ";
      const start = script.indexOf(marker) + marker.length;
      const batch = JSON.parse(script.slice(start, script.indexOf(";\n", start)));
      updates.push(...batch);
      return {
        success: true,
        result: { applied: batch.length, failed: 0, results: batch.map((u: any) => ({ id: u.variableId, success: true })) },
      };
    },
  };
}

function handlerFor(register: typeof registerImportTokensTool | typeof registerExportTokensTool, connector: any, remote: boolean) {
  let handler: (args: any) => Promise<any> = async () => undefined;
  const server = { tool: (_n: string, _d: string, _s: any, h: any) => { handler = h; } };
  register(server as any, async () => connector, { isRemoteMode: remote });
  return async (args: any) => {
    const res = await handler(args);
    expect(res.isError).toBeFalsy();
    return JSON.parse(res.content[0].text);
  };
}

describe("applyCollectionMapping", () => {
  const doc = (): TokenDocument => ({
    sets: [
      {
        name: "primitives",
        modes: ["Default"],
        tokens: [{ path: ["blue"], type: "color", values: { Default: { literal: "#0000FF" } } }],
      },
      {
        name: "semantic",
        modes: ["Default"],
        tokens: [
          { path: ["link"], type: "color", values: { Default: { reference: "{primitives.blue}" } } },
          {
            path: ["scrim"],
            type: "color",
            values: { Default: { literal: "#0000FF80", composed: { color: { reference: "{primitives.blue}" }, opacity: { literal: 50 } } } },
            extensions: {
              "figma-console-mcp": {
                composedColor: { Default: { color: "{primitives.blue}", opacity: 50 } },
                lastSyncedValue: { Default: { reference: "{primitives.blue}" } },
              },
            },
          },
        ],
      },
    ],
  } as any);

  it("renames the set and rewrites set-qualified references to it", () => {
    const warnings: string[] = [];
    const d = applyCollectionMapping(doc(), { primitives: "Primitive Tokens" }, warnings);
    expect(d.sets.map((s) => s.name)).toEqual(["Primitive Tokens", "semantic"]);
    const [link, scrim] = d.sets[1].tokens as any[];
    expect(link.values.Default.reference).toBe("{primitive-tokens.blue}");
    expect(scrim.values.Default.composed.color.reference).toBe("{primitive-tokens.blue}");
    expect(scrim.extensions["figma-console-mcp"].composedColor.Default.color).toBe("{primitive-tokens.blue}");
    expect(scrim.extensions["figma-console-mcp"].lastSyncedValue.Default.reference).toBe("{primitive-tokens.blue}");
    expect(warnings).toEqual([]);
  });

  it("refuses to map two sets onto one name", () => {
    const warnings: string[] = [];
    const d = applyCollectionMapping(doc(), { primitives: "All", semantic: "All" }, warnings);
    expect(d.sets.map((s) => s.name)).toEqual(["All", "semantic"]);
    expect(warnings.join("\n")).toMatch(/"semantic" → "All" skipped/);
  });
});

describe("figma_import_tokens — collectionMapping", () => {
  // The file calls the set "brand"; Figma calls the collection "Theme".
  const payload = JSON.stringify({
    brand: {
      color: {
        primary: {
          $type: "color",
          $value: "#0000FF",
          $extensions: { "figma-console-mcp": { primaryMode: "Light" } },
        },
      },
    },
  });

  it("updates the existing collection instead of planning a new one", async () => {
    const connector = mockConnector();
    const run = handlerFor(registerImportTokensTool, connector, true);
    const res = await run({ payload, strategy: "merge", collectionMapping: { brand: "Theme" } });
    expect(res.diff.summary.toCreate).toBe(0);
    expect(res.applyResult.applied).toBe(1);
    expect(connector.updates[0]).toMatchObject({ variableId: "V:1", valuesByMode: { m1: { r: 0, g: 0, b: 1 } } });
  });

  it("without it, the set is a new collection", async () => {
    const res = await handlerFor(registerImportTokensTool, mockConnector(), true)({ payload, dryRun: true });
    expect(res.diff.summary.toCreate).toBe(1);
  });
});

describe("tokens.config.json modes.map", () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "fcm-modes-map-")); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  function writeConfig(extra: Record<string, unknown> = {}) {
    const cfg = join(tmp, "tokens.config.json");
    writeFileSync(cfg, JSON.stringify({
      source: { dir: "tokens", canonical: "dtcg" },
      modes: { map: { Light: "day", Dark: "night" } },
      ...extra,
    }));
    mkdirSync(join(tmp, "tokens"), { recursive: true });
    return cfg;
  }

  it("export names the modes as the config maps them", async () => {
    const cfg = writeConfig();
    const run = handlerFor(registerExportTokensTool, mockConnector(), false);
    const res = await run({ configPath: cfg, format: "css-vars", strategy: "dry-run" });
    const css = res.outputs[0].preview;
    expect(css).toMatch(/\[data-theme="day"\]/);
    expect(css).toMatch(/\[data-theme="night"\]/);
  });

  it("import maps the code modes back onto Figma's", async () => {
    const cfg = writeConfig();
    writeFileSync(join(tmp, "tokens", "theme.tokens.json"), JSON.stringify({
      Theme: {
        color: {
          primary: { $type: "color", $value: "#0000FF", $extensions: { "figma-console-mcp": { primaryMode: "day" } } },
        },
      },
    }));
    const connector = mockConnector();
    const res = await handlerFor(registerImportTokensTool, connector, false)({ configPath: cfg, strategy: "merge" });
    expect(res.applyResult.applied).toBe(1);
    expect(connector.updates[0].valuesByMode).toEqual({ m1: { r: 0, g: 0, b: 1, a: 1 } });
  });

  it("import puts a token with no explicit mode in modes.default", async () => {
    const cfg = writeConfig({ modes: { default: "Dark" } });
    writeFileSync(join(tmp, "tokens", "theme.tokens.json"), JSON.stringify({
      Theme: { color: { primary: { $type: "color", $value: "#0000FF" } } },
    }));
    const connector = mockConnector();
    const res = await handlerFor(registerImportTokensTool, connector, false)({ configPath: cfg, strategy: "merge" });
    expect(res.applyResult.applied).toBe(1);
    expect(connector.updates[0].valuesByMode).toEqual({ m2: { r: 0, g: 0, b: 1, a: 1 } });
  });
});
