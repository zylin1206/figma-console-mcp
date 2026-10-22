/**
 * Design System Manifest Types
 *
 * A structured representation of a Figma design system that enables
 * high-fidelity AI-assisted design generation.
 */

// ============================================================================
// TOKEN TYPES
// ============================================================================

export interface ColorToken {
	name: string;
	value: string;  // Hex color like "#3B82F6"
	variableId?: string;
	description?: string;
	scopes?: string[];  // e.g., ["FRAME_FILL", "TEXT_FILL"]
}

export interface SpacingToken {
	name: string;
	value: number;  // Pixel value
	variableId?: string;
	description?: string;
}

export interface TypographyToken {
	name: string;
	fontFamily: string;
	fontSize: number;
	fontWeight: number;
	lineHeight: number | { value: number; unit: 'PIXELS' | 'PERCENT' | 'AUTO' };
	letterSpacing?: number;
	textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
	textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
	styleId?: string;
	description?: string;
}

export interface EffectToken {
	name: string;
	type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
	effects: Array<{
		type: string;
		color?: { r: number; g: number; b: number; a: number };
		offset?: { x: number; y: number };
		radius?: number;
		spread?: number;
		visible?: boolean;
	}>;
	styleId?: string;
	description?: string;
}

export interface TokenCollection {
	id: string;
	name: string;
	modes: Array<{
		modeId: string;
		name: string;
	}>;
	defaultModeId: string;
}

// ============================================================================
// COMPONENT TYPES
// ============================================================================

export interface ComponentVariant {
	name: string;
	values: string[];
	defaultValue?: string;
}

export interface ComponentProperty {
	name: string;
	type: 'TEXT' | 'BOOLEAN' | 'INSTANCE_SWAP' | 'VARIANT' | 'SLOT';
	defaultValue?: string | boolean;
	options?: string[];  // For INSTANCE_SWAP, available component keys
}

export interface ComponentSpec {
	key: string;  // For figma.importComponentByKeyAsync()
	nodeId: string;
	name: string;
	description?: string;
	variants?: ComponentVariant[];
	properties?: ComponentProperty[];
	defaultSize?: { width: number; height: number };
	boundVariables?: Record<string, string>;  // Property -> Variable ID
	usage?: string;  // AI guidance on when to use this component
	category?: string;  // e.g., "Buttons", "Inputs", "Cards"
}

export interface ComponentSet {
	key: string;
	nodeId: string;
	name: string;
	description?: string;
	variants: ComponentSpec[];
	variantAxes: ComponentVariant[];
}

// ============================================================================
// PATTERN TYPES
// ============================================================================

export interface LayoutPattern {
	name: string;
	description: string;
	properties: {
		padding?: string | number;  // Token name or pixel value
		gap?: string | number;
		borderRadius?: number;
		background?: string;  // Token name
		shadow?: string;  // Token name
		layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
		primaryAxisAlign?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
		counterAxisAlign?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
	};
	usage?: string;
}

// ============================================================================
// DESIGN RULES
// ============================================================================

export interface DesignRule {
	category: 'spacing' | 'color' | 'typography' | 'component' | 'layout';
	rule: string;
	priority: 'required' | 'recommended' | 'optional';
	examples?: string[];
}

// ============================================================================
// MAIN MANIFEST TYPE
// ============================================================================

export interface DesignSystemManifest {
	// Metadata
	version: string;
	generatedAt: number;
	fileKey: string;
	fileName?: string;
	fileUrl?: string;

	// Token Collections
	collections: TokenCollection[];

	// Tokens by Type
	tokens: {
		colors: Record<string, ColorToken>;
		spacing: Record<string, SpacingToken>;
		typography: Record<string, TypographyToken>;
		effects: Record<string, EffectToken>;
		other: Record<string, {
			name: string;
			type: string;
			value: any;
			variableId?: string;
		}>;
	};

	// Components
	components: Record<string, ComponentSpec>;
	componentSets: Record<string, ComponentSet>;

	// Patterns (detected or manually defined)
	patterns: Record<string, LayoutPattern>;

	// Design Rules
	rules: DesignRule[];

	// Summary for AI context
	summary: {
		totalTokens: number;
		totalComponents: number;
		totalComponentSets: number;
		colorPalette: string[];  // Main color tokens
		spacingScale: number[];  // Available spacing values
		typographyScale: string[];  // Typography style names
		componentCategories: string[];
	};
}

// ============================================================================
// MANIFEST GENERATION OPTIONS
// ============================================================================

export interface ManifestGenerationOptions {
	includeTokens?: boolean;
	includeComponents?: boolean;
	includeStyles?: boolean;
	includePatterns?: boolean;
	componentCategories?: string[];  // Filter to specific categories
	tokenCollections?: string[];  // Filter to specific collections
	inferPatterns?: boolean;  // Auto-detect common patterns
	verbose?: boolean;  // Include all details vs summary
}

// ============================================================================
// DESIGN SYSTEM CACHE
// ============================================================================

export interface ManifestCacheEntry {
	manifest: DesignSystemManifest;
	timestamp: number;
	fileKey: string;
	rawComponents?: {
		components: any[];
		componentSets: any[];
	};
}

/**
 * Cache for design system manifests with TTL-based invalidation.
 * Singleton pattern to share cache across tool calls.
 */
export class DesignSystemManifestCache {
	private static instance: DesignSystemManifestCache;
	private cache: Map<string, ManifestCacheEntry> = new Map();
	private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

	private constructor() {}

	static getInstance(): DesignSystemManifestCache {
		if (!DesignSystemManifestCache.instance) {
			DesignSystemManifestCache.instance = new DesignSystemManifestCache();
		}
		return DesignSystemManifestCache.instance;
	}

	get(fileKey: string): ManifestCacheEntry | null {
		const entry = this.cache.get(fileKey);
		if (!entry) return null;
		if (!this.isValid(entry)) {
			this.cache.delete(fileKey);
			return null;
		}
		return entry;
	}

	set(fileKey: string, manifest: DesignSystemManifest, rawComponents?: { components: any[]; componentSets: any[] }): void {
		this.cache.set(fileKey, {
			manifest,
			timestamp: Date.now(),
			fileKey,
			rawComponents,
		});
	}

	invalidate(fileKey: string): void {
		this.cache.delete(fileKey);
	}

	invalidateAll(): void {
		this.cache.clear();
	}

	isValid(entry: ManifestCacheEntry): boolean {
		return Date.now() - entry.timestamp < this.TTL_MS;
	}

	getStats(): { fileKey: string; age: number; componentCount: number; tokenCount: number }[] {
		const stats: { fileKey: string; age: number; componentCount: number; tokenCount: number }[] = [];
		for (const [fileKey, entry] of this.cache) {
			stats.push({
				fileKey,
				age: Math.round((Date.now() - entry.timestamp) / 1000),
				componentCount: entry.manifest.summary.totalComponents + entry.manifest.summary.totalComponentSets,
				tokenCount: entry.manifest.summary.totalTokens,
			});
		}
		return stats;
	}
}

// ============================================================================
// COMPONENT SEARCH UTILITIES
// ============================================================================

export interface ComponentSearchResult {
	name: string;
	key: string;
	nodeId: string;
	type: 'component' | 'componentSet';
	description?: string;
	descriptionTruncated?: boolean;
	category?: string;
	variantCount?: number;
	defaultSize?: { width: number; height: number };
}

/**
 * Decide whether a component search can be answered from this manifest.
 *
 * When the components fetch failed (`loadWarning` set) and the manifest holds
 * no components at all, there is nothing to search — and an empty result list
 * would read as "no such component exists". Returns the error message to
 * surface in that case, or null when the search can proceed (including a
 * genuinely empty file, which loads WITHOUT a warning).
 */
export function componentSearchLoadFailure(
	manifest: DesignSystemManifest,
	loadWarning: string | undefined,
): string | null {
	if (!loadWarning) return null;
	const loaded =
		Object.keys(manifest.components).length +
		Object.keys(manifest.componentSets).length;
	if (loaded > 0) return null;
	return `Component search could not run: ${loadWarning}`;
}

/**
 * Search components by name, category, or description
 */
export function searchComponents(
	manifest: DesignSystemManifest,
	query: string,
	options?: { category?: string; limit?: number; offset?: number }
): { results: ComponentSearchResult[]; total: number; hasMore: boolean } {
	const limit = options?.limit ?? 10;
	const offset = options?.offset ?? 0;
	const queryLower = query.toLowerCase();
	const categoryLower = options?.category?.toLowerCase();

	const allResults: ComponentSearchResult[] = [];

	// Search component sets first (they're typically the main design system components).
	// Manifest maps are keyed by component key — always read names from the entry.
	for (const compSet of Object.values(manifest.componentSets)) {
		const nameLower = compSet.name.toLowerCase();
		const descLower = compSet.description?.toLowerCase() || '';

		const matchesQuery = !query || nameLower.includes(queryLower) || descLower.includes(queryLower);
		const matchesCategory = !categoryLower || inferCategory(compSet.name).toLowerCase().includes(categoryLower);

		if (matchesQuery && matchesCategory) {
			allResults.push({
				name: compSet.name,
				key: compSet.key,
				nodeId: compSet.nodeId,
				type: 'componentSet',
				description: compSet.description,
				category: inferCategory(compSet.name),
				variantCount: compSet.variants?.length || 0,
			});
		}
	}

	// Then search standalone components
	for (const comp of Object.values(manifest.components)) {
		const nameLower = comp.name.toLowerCase();
		const descLower = comp.description?.toLowerCase() || '';

		const matchesQuery = !query || nameLower.includes(queryLower) || descLower.includes(queryLower);
		const matchesCategory = !categoryLower || inferCategory(comp.name).toLowerCase().includes(categoryLower);

		if (matchesQuery && matchesCategory) {
			allResults.push({
				name: comp.name,
				key: comp.key,
				nodeId: comp.nodeId,
				type: 'component',
				description: comp.description,
				category: inferCategory(comp.name),
				defaultSize: comp.defaultSize,
			});
		}
	}

	const total = allResults.length;
	// Truncate long doc blocks in search hits — full text is available via
	// figma_get_component_details.
	const paginatedResults = allResults.slice(offset, offset + limit).map((r) =>
		r.description && r.description.length > 200
			? { ...r, description: `${r.description.slice(0, 200)}…`, descriptionTruncated: true }
			: r,
	);
	const hasMore = offset + limit < total;

	return { results: paginatedResults, total, hasMore };
}

/**
 * Infer category from component name (e.g., "Button/Primary" -> "Button")
 */
function inferCategory(name: string): string {
	const parts = name.split('/');
	return parts[0] || 'Uncategorized';
}

/**
 * Get unique categories from manifest
 */
export function getCategories(manifest: DesignSystemManifest): { name: string; componentCount: number; componentSetCount: number }[] {
	const categories = new Map<string, { componentCount: number; componentSetCount: number }>();

	for (const compSet of Object.values(manifest.componentSets)) {
		const cat = inferCategory(compSet.name);
		const existing = categories.get(cat) || { componentCount: 0, componentSetCount: 0 };
		existing.componentSetCount++;
		categories.set(cat, existing);
	}

	for (const comp of Object.values(manifest.components)) {
		const cat = inferCategory(comp.name);
		const existing = categories.get(cat) || { componentCount: 0, componentSetCount: 0 };
		existing.componentCount++;
		categories.set(cat, existing);
	}

	return Array.from(categories.entries())
		.map(([name, counts]) => ({ name, ...counts }))
		.sort((a, b) => (b.componentCount + b.componentSetCount) - (a.componentCount + a.componentSetCount));
}

/**
 * Get token categories and counts for summary
 */
export function getTokenSummary(manifest: DesignSystemManifest): {
	colors: { count: number; groups: string[] };
	spacing: { count: number; scale: number[] };
	typography: { count: number; groups: string[] };
	effects: { count: number };
	other: { count: number; types: Record<string, number> };
	collections: string[];
} {
	// Count the other variables by type (e.g. CORNER_RADIUS, FONT_SIZE, STRING)
	const otherTypes: Record<string, number> = {};
	for (const token of Object.values(manifest.tokens.other)) {
		otherTypes[token.type] = (otherTypes[token.type] || 0) + 1;
	}

	// Group colors by prefix (e.g., "primary/500" -> "primary")
	const colorGroups = new Set<string>();
	for (const name of Object.keys(manifest.tokens.colors)) {
		const group = name.split('/')[0];
		colorGroups.add(group);
	}

	// Group typography by prefix
	const typographyGroups = new Set<string>();
	for (const name of Object.keys(manifest.tokens.typography)) {
		const group = name.split('/')[0];
		typographyGroups.add(group);
	}

	// Get spacing scale values
	const spacingValues = Object.values(manifest.tokens.spacing)
		.map(t => t.value)
		.filter((v, i, arr) => arr.indexOf(v) === i)
		.sort((a, b) => a - b);

	return {
		colors: {
			count: Object.keys(manifest.tokens.colors).length,
			groups: Array.from(colorGroups).slice(0, 10),
		},
		spacing: {
			count: Object.keys(manifest.tokens.spacing).length,
			scale: spacingValues.slice(0, 15),
		},
		typography: {
			count: Object.keys(manifest.tokens.typography).length,
			groups: Array.from(typographyGroups).slice(0, 10),
		},
		effects: {
			count: Object.keys(manifest.tokens.effects).length,
		},
		other: {
			count: Object.keys(manifest.tokens.other).length,
			types: otherTypes,
		},
		collections: manifest.collections.map(c => c.name),
	};
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert RGB color object to hex string
 */
export function rgbToHex(color: { r: number; g: number; b: number }): string {
	const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
	return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`.toUpperCase();
}

/**
 * Build a resolver from a raw Figma color value to the hex Figma renders in
 * each collection's default mode. Follows aliases and composed colors
 * ({ color, opacity } — opacity a percent, applied only to an opaque color).
 * Plain figmaColorToHex can't follow aliases, so an aliased color came out as
 * #000000.
 */
export function makeFigmaColorResolver(
	variables: Array<{ id: string; variableCollectionId?: string; valuesByMode?: Record<string, any> }>,
	collections: Array<{ id: string; defaultModeId?: string }>,
): (value: any) => string {
	const byId = new Map(variables.map((v) => [v.id, v]));
	const defaultMode = new Map(collections.map((c) => [c.id, c.defaultModeId]));
	const valueOf = (id: string): any => {
		const v = byId.get(id);
		if (!v?.valuesByMode) return undefined;
		const mode = (v.variableCollectionId && defaultMode.get(v.variableCollectionId)) || Object.keys(v.valuesByMode)[0];
		return v.valuesByMode[mode];
	};
	const resolve = (value: any, depth: number): any => {
		if (depth > 20 || value === undefined || value === null) return undefined;
		if (typeof value === 'object' && value.type === 'VARIABLE_ALIAS') return resolve(valueOf(value.id), depth + 1);
		if (typeof value === 'object' && 'color' in value && 'opacity' in value && !('r' in value)) {
			const color = resolve(value.color, depth + 1);
			const opacity = resolve(value.opacity, depth + 1);
			if (!color || typeof color !== 'object' || !('r' in color) || typeof opacity !== 'number') return undefined;
			const a = color.a ?? 1;
			return { ...color, a: a < 1 ? a : Math.max(0, Math.min(1, opacity / 100)) };
		}
		return value;
	};
	return (value: any) => {
		const resolved = resolve(value, 0);
		if (resolved && typeof resolved === 'object' && 'r' in resolved) {
			const hex = rgbToHex(resolved);
			const a = resolved.a ?? 1;
			return a < 1 ? `${hex}${Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase()}` : hex;
		}
		return figmaColorToHex(resolved);
	};
}

/**
 * Build a resolver from a raw Figma variable value to the value it has in its
 * collection's default mode, following aliases. Without it an aliased FLOAT
 * (e.g. a component size pointing at a global dimension) came out as 0.
 */
export function makeFigmaValueResolver(
	variables: Array<{ id: string; variableCollectionId?: string; valuesByMode?: Record<string, any> }>,
	collections: Array<{ id: string; defaultModeId?: string }>,
): (value: any) => any {
	const byId = new Map(variables.map((v) => [v.id, v]));
	const defaultMode = new Map(collections.map((c) => [c.id, c.defaultModeId]));
	const resolve = (value: any, depth: number): any => {
		if (depth > 20 || value === undefined || value === null) return undefined;
		if (typeof value !== 'object' || value.type !== 'VARIABLE_ALIAS') return value;
		const v = byId.get(value.id);
		if (!v?.valuesByMode) return undefined;
		const mode = (v.variableCollectionId && defaultMode.get(v.variableCollectionId)) || Object.keys(v.valuesByMode)[0];
		return resolve(v.valuesByMode[mode], depth + 1);
	};
	return (value: any) => resolve(value, 0);
}

/**
 * Unwrap connector.getVariables(). EXECUTE_CODE nests the script's return
 * value under `result`; the plugin-UI cache path does not. Reading `.data`
 * instead matched neither, so the design-system summary reported 0 tokens on
 * every file. See #68. Returns null when no variables came back.
 */
export function unwrapBridgeVariables(raw: any): { variables: any[]; variableCollections: any[] } | null {
	const data = raw?.result?.variables ? raw.result : raw;
	if (!data?.success || !Array.isArray(data.variables)) return null;
	return { variables: data.variables, variableCollections: data.variableCollections || [] };
}

/**
 * FLOAT scopes that make a variable a spacing/dimension token. A FLOAT scoped
 * only to something else — corner radius, font size, line height, letter
 * spacing, stroke, opacity — is not spacing; filing those there made the
 * spacing scale start at -4.4 (a letter spacing). A variable with no scopes
 * or ALL_SCOPES stays spacing, as before, because nothing says otherwise.
 */
const SPACING_SCOPES = new Set(['GAP', 'WIDTH_HEIGHT', 'ALL_SCOPES']);

export function isSpacingScope(scopes?: string[]): boolean {
	return !scopes || scopes.length === 0 || scopes.some((s) => SPACING_SCOPES.has(s));
}

/**
 * Add the Desktop Bridge variables to the manifest: collections, then each
 * variable by type. COLOR → colors, spacing-scoped FLOAT → spacing, every
 * other variable → other (typed by its first scope, or its resolved type).
 * Returns false when the result held no variables.
 */
export function addVariablesToManifest(manifest: DesignSystemManifest, raw: any): boolean {
	const data = unwrapBridgeVariables(raw);
	if (!data) return false;

	for (const collection of data.variableCollections) {
		manifest.collections.push({
			id: collection.id,
			name: collection.name,
			modes: (collection.modes || []).map((m: any) => ({ modeId: m.modeId, name: m.name })),
			defaultModeId: collection.defaultModeId,
		});
	}

	const colorHex = makeFigmaColorResolver(data.variables, manifest.collections);
	const resolveValue = makeFigmaValueResolver(data.variables, manifest.collections);
	for (const variable of data.variables) {
		const name = variable.name;
		const defaultModeId = manifest.collections.find((c) => c.id === variable.variableCollectionId)?.defaultModeId;
		const defaultValue = defaultModeId ? variable.valuesByMode?.[defaultModeId] : undefined;

		if (variable.resolvedType === 'COLOR') {
			manifest.tokens.colors[name] = {
				name,
				value: colorHex(defaultValue),
				variableId: variable.id,
				scopes: variable.scopes,
			};
		} else if (variable.resolvedType === 'FLOAT' && isSpacingScope(variable.scopes)) {
			const value = resolveValue(defaultValue);
			manifest.tokens.spacing[name] = {
				name,
				value: typeof value === 'number' ? value : 0,
				variableId: variable.id,
			};
		} else {
			manifest.tokens.other[name] = {
				name,
				type: (variable.resolvedType === 'FLOAT' && variable.scopes?.[0]) || variable.resolvedType,
				value: resolveValue(defaultValue),
				variableId: variable.id,
			};
		}
	}
	return true;
}

/**
 * Numeric weight for a font style name ("Semi Bold" → 600). Longer names are
 * tested first so "Extra Light" is not read as "Light", nor "Semi Bold" as
 * "Bold".
 */
const FONT_WEIGHTS: Array<[RegExp, number]> = [
	[/thin|hairline/i, 100],
	[/(extra|ultra)[\s-]?light/i, 200],
	[/(semi|demi)[\s-]?bold/i, 600],
	[/(extra|ultra)[\s-]?bold/i, 800],
	[/black|heavy/i, 900],
	[/light/i, 300],
	[/medium/i, 500],
	[/bold/i, 700],
];

export function fontWeightFromStyle(style?: string): number {
	for (const [pattern, weight] of FONT_WEIGHTS) {
		if (style && pattern.test(style)) return weight;
	}
	return 400;
}

/**
 * Add the local text styles (connector.getTextStyles(), shaped
 * { success, data: { styles } }) to the manifest's typography tokens. The
 * summary used to leave typography empty even on files with text styles.
 * Returns false when no styles came back.
 */
export function addTextStylesToManifest(manifest: DesignSystemManifest, raw: any): boolean {
	const styles = raw?.success ? raw.data?.styles : undefined;
	if (!Array.isArray(styles)) return false;

	for (const style of styles) {
		const lineHeight = style.lineHeight;
		manifest.tokens.typography[style.name] = {
			name: style.name,
			fontFamily: style.fontFamily,
			fontSize: style.fontSize,
			fontWeight: fontWeightFromStyle(style.fontStyle),
			lineHeight:
				lineHeight && typeof lineHeight === 'object'
					? { value: lineHeight.value ?? 0, unit: lineHeight.unit }
					: lineHeight ?? 0,
			letterSpacing: typeof style.letterSpacing === 'object' ? style.letterSpacing?.value : style.letterSpacing,
			textCase: style.textCase,
			textDecoration: style.textDecoration,
			styleId: style.id,
			description: style.description || undefined,
		};
	}
	return true;
}

/**
 * Recompute the manifest summary from its tokens and components. Every
 * variable and text style counts as a token.
 */
export function summarizeManifest(manifest: DesignSystemManifest): void {
	const { colors, spacing, typography, effects, other } = manifest.tokens;
	manifest.summary = {
		totalTokens:
			Object.keys(colors).length +
			Object.keys(spacing).length +
			Object.keys(typography).length +
			Object.keys(effects).length +
			Object.keys(other).length,
		totalComponents: Object.keys(manifest.components).length,
		totalComponentSets: Object.keys(manifest.componentSets).length,
		colorPalette: Object.keys(colors).slice(0, 10),
		spacingScale: [...new Set(Object.values(spacing).map((s) => s.value))].sort((a, b) => a - b).slice(0, 10),
		typographyScale: Object.keys(typography),
		componentCategories: [],
	};
}

/**
 * Parse a Figma color value to hex
 */
export function figmaColorToHex(value: any): string {
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object' && 'r' in value) {
		return rgbToHex(value);
	}
	return '#000000';
}

/**
 * Generate a human-readable summary of the manifest
 */
export function generateManifestSummary(manifest: DesignSystemManifest): string {
	const lines: string[] = [
		`# Design System Manifest`,
		``,
		`**File:** ${manifest.fileName || manifest.fileKey}`,
		`**Generated:** ${new Date(manifest.generatedAt).toISOString()}`,
		``,
		`## Summary`,
		`- **${manifest.summary.totalTokens}** design tokens`,
		`- **${manifest.summary.totalComponents}** components`,
		`- **${manifest.summary.totalComponentSets}** component sets`,
		``,
		`## Color Palette`,
		manifest.summary.colorPalette.slice(0, 10).map(c => `- ${c}`).join('\n'),
		``,
		`## Spacing Scale`,
		`${manifest.summary.spacingScale.join('px, ')}px`,
		``,
		`## Typography`,
		manifest.summary.typographyScale.slice(0, 10).map(t => `- ${t}`).join('\n'),
		``,
		`## Component Categories`,
		manifest.summary.componentCategories.map(c => `- ${c}`).join('\n'),
	];

	return lines.join('\n');
}

/**
 * Create an empty manifest template
 */
export function createEmptyManifest(fileKey: string): DesignSystemManifest {
	return {
		version: '1.0.0',
		generatedAt: Date.now(),
		fileKey,
		collections: [],
		tokens: {
			colors: {},
			spacing: {},
			typography: {},
			effects: {},
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
	};
}
