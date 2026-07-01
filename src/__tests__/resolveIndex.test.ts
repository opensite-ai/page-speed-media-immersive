import { describe, it, expect } from "vitest";
import { resolveIndex } from "../utils/resolveIndex.js";
import type { MediaItem } from "../types/index.js";

const items: MediaItem[] = [
  { id: "a", poster: "/a.jpg", title: "A" },
  { id: "b", poster: "/b.jpg", title: "B" },
  { id: "c", poster: "/c.jpg", title: "C" },
];

describe("resolveIndex", () => {
  it("resolves valid string ids", () => {
    expect(resolveIndex(items, "a")).toBe(0);
    expect(resolveIndex(items, "c")).toBe(2);
  });

  it("returns -1 for unknown ids", () => {
    expect(resolveIndex(items, "z")).toBe(-1);
    expect(resolveIndex(items, "")).toBe(-1);
  });

  it("resolves valid numeric indices", () => {
    expect(resolveIndex(items, 0)).toBe(0);
    expect(resolveIndex(items, 2)).toBe(2);
  });

  it("returns -1 for out-of-range or invalid numeric indices", () => {
    expect(resolveIndex(items, -1)).toBe(-1);
    expect(resolveIndex(items, 3)).toBe(-1);
    expect(resolveIndex(items, Number.NaN)).toBe(-1);
    expect(resolveIndex(items, Number.POSITIVE_INFINITY)).toBe(-1);
  });

  it("truncates fractional numeric indices toward zero", () => {
    expect(resolveIndex(items, 1.7)).toBe(1);
    expect(resolveIndex(items, 0.9)).toBe(0);
  });
});
