import type { MediaItem } from "../types/index.js";

/**
 * Resolve a caller-provided identifier (string id OR numeric index) to a
 * concrete index within `items`. Returns `-1` when unresolvable.
 */
export function resolveIndex(
  items: readonly MediaItem[],
  target: string | number,
): number {
  if (typeof target === "number") {
    if (!Number.isFinite(target)) return -1;
    const i = Math.trunc(target);
    if (i < 0 || i >= items.length) return -1;
    return i;
  }
  const i = items.findIndex((it) => it.id === target);
  return i;
}
