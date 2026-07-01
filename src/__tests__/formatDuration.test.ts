import { describe, it, expect } from "vitest";
import { formatDuration } from "../utils/formatDuration.js";

describe("formatDuration", () => {
  it("formats sub-minute durations as 0:SS", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(1000)).toBe("0:01");
    expect(formatDuration(38000)).toBe("0:38");
    expect(formatDuration(59999)).toBe("0:59");
  });

  it("formats minute+ durations as M:SS", () => {
    expect(formatDuration(60000)).toBe("1:00");
    expect(formatDuration(92000)).toBe("1:32");
    expect(formatDuration(64000)).toBe("1:04");
  });

  it("formats hour+ durations as H:MM:SS", () => {
    expect(formatDuration(3600000)).toBe("1:00:00");
    expect(formatDuration(3670000)).toBe("1:01:10");
    expect(formatDuration(2 * 3600000 + 5 * 60000 + 7000)).toBe("2:05:07");
  });

  it("returns empty string for invalid input", () => {
    expect(formatDuration(undefined)).toBe("");
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(-1)).toBe("");
    expect(formatDuration(Number.NaN)).toBe("");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("");
  });
});
