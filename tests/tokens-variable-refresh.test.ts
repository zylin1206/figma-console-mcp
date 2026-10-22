/**
 * figma_export_tokens / figma_import_tokens must read the variables as they
 * are now, not as they were when the plugin opened.
 *
 * Both read GET_VARIABLES_DATA, the snapshot the plugin UI takes at startup.
 * A collection created afterwards was "not found in Figma file", and an edited
 * value exported as its old value, until the user reopened the plugin.
 */

import { readCurrentVariables, registerExportTokensTool } from "../src/core/tokens-tools";

const collection = (variableIds: string[]) => ({
	id: "C:1",
	name: "Motion",
	modes: [{ modeId: "m1", name: "Default" }],
	defaultModeId: "m1",
	variableIds,
});
const AT_OPEN = {
	success: true,
	fileKey: "fileA",
	variableCollections: [collection(["V:1"])],
	variables: [{ id: "V:1", name: "fade", resolvedType: "FLOAT", variableCollectionId: "C:1", valuesByMode: { m1: 40 } }],
};
const NOW = {
	success: true,
	fileKey: "fileA",
	variableCollections: [collection(["V:1", "V:2"])],
	variables: [
		{ id: "V:1", name: "fade", resolvedType: "FLOAT", variableCollectionId: "C:1", valuesByMode: { m1: 25 } },
		{ id: "V:2", name: "mist", resolvedType: "FLOAT", variableCollectionId: "C:1", valuesByMode: { m1: 10 } },
	],
};

/** A plugin whose snapshot changes only when REFRESH_VARIABLES runs. */
function fakePlugin() {
	let snapshot: any = AT_OPEN;
	const calls: string[] = [];
	return {
		calls,
		connector: {
			refreshVariables: async (fileKey?: string) => {
				calls.push(`refresh:${fileKey ?? ""}`);
				snapshot = NOW;
				return { success: true, data: NOW };
			},
			getVariablesFromPluginUI: async (fileKey?: string) => {
				calls.push(`read:${fileKey ?? ""}`);
				return snapshot;
			},
		},
	};
}

describe("readCurrentVariables", () => {
	it("refreshes the plugin's snapshot before reading it", async () => {
		const { connector, calls } = fakePlugin();
		const data = await readCurrentVariables(connector, "fileA");
		expect(calls).toEqual(["refresh:fileA", "read:fileA"]);
		expect(data.variables.map((v: any) => v.name)).toEqual(["fade", "mist"]);
	});

	it("falls back to the snapshot when the refresh fails", async () => {
		const { connector } = fakePlugin();
		connector.refreshVariables = async () => { throw new Error("timeout"); };
		const data = await readCurrentVariables(connector);
		expect(data).toBe(AT_OPEN);
	});

	it("reads the snapshot from connectors without a refresh", async () => {
		const data = await readCurrentVariables({ getVariablesFromPluginUI: async () => AT_OPEN });
		expect(data).toBe(AT_OPEN);
	});
});

describe("figma_export_tokens reads current values", () => {
	it("exports a variable added and a value edited after the plugin opened", async () => {
		const { connector } = fakePlugin();
		let handler: (args: any) => Promise<any> = async () => undefined;
		const server = { tool: (_n: string, _d: string, _s: any, h: any) => { handler = h; } };
		registerExportTokensTool(server as any, async () => connector);

		const res = await handler({ format: "css-vars", sizeUnit: "px", strategy: "dry-run" });
		const css = JSON.parse(res.content[0].text).outputs[0].preview;
		expect(css).toMatch(/--fade: 25px;/);
		expect(css).toMatch(/--mist: 10px;/);
	});
});
