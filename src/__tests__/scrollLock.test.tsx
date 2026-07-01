import { describe, it, expect } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";
import { useScrollLock } from "../hooks/useScrollLock.js";

function LockHost({ active }: { active: boolean }) {
  useScrollLock(active);
  return null;
}

describe("useScrollLock", () => {
  it("applies fixed-position body styles when active and restores on unmount", () => {
    // Seed page state.
    document.body.style.position = "";
    document.documentElement.style.overflow = "";
    // Simulate a scrolled page (happy-dom exposes writeable scrollY via defineProperty).
    Object.defineProperty(window, "scrollY", { configurable: true, value: 250 });

    const { rerender, unmount } = render(<LockHost active={false} />);
    expect(document.body.style.position).toBe("");
    expect(document.documentElement.style.overflow).toBe("");

    act(() => {
      rerender(<LockHost active />);
    });

    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-250px");
    expect(document.body.style.width).toBe("100%");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");

    act(() => {
      unmount();
    });

    // Original values restored.
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
  });
});
