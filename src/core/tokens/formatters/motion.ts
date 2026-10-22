/**
 * CSS rendering for motion tokens (Figma TIMING / EASING variables).
 *
 * The converter emits them in DTCG shape — duration as `{ value, unit }` and
 * cubicBezier as `[p1x, p1y, p2x, p2y]` — which CSS-like formats used to
 * print as raw JSON (`{"value":200,"unit":"ms"}`, `0.4,0,0.2,1`).
 */
import { num } from "./composed-color.js";

/**
 * The CSS text for a duration or cubicBezier literal, or null when the value
 * is not one (the caller then renders it as usual).
 */
export function motionCssValue(value: unknown, type: string): string | null {
  if (type === "duration") {
    if (typeof value === "number") return `${num(value)}ms`;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const d = value as { value?: unknown; unit?: unknown };
      if (typeof d.value === "number" && (d.unit === "ms" || d.unit === "s")) return `${num(d.value)}${d.unit}`;
    }
    return null;
  }
  if (type === "cubicBezier" && Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === "number")) {
    return `cubic-bezier(${value.map((n) => num(n as number)).join(", ")})`;
  }
  return null;
}
