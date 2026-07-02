import { describe, it, expect } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";
import { ImmersiveFeed } from "../core/ImmersiveFeed.js";
import type { MediaItem } from "../types/index.js";

const items: MediaItem[] = [
  { id: "a", poster: "/a.jpg", title: "First", badge: "INTRO", src: "/a.mp4", durationMs: 1000 },
  { id: "b", poster: "/b.jpg", title: "Second", badge: "TOUR", src: "/b.mp4", durationMs: 2000 },
];

describe("<ImmersiveViewer> integration", () => {
  it("does not render viewer chrome when closed", () => {
    render(<ImmersiveFeed items={items} />);
    // Viewer portals into document.body, but only when isOpen is true.
    // With initiallyOpen omitted (defaults to false), no dialog should be present.
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();
  });

  it("portals dialog + counter to document.body when open", () => {
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={1} />);
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog).not.toBeNull();
    // Portal target is document.body — dialog should not be nested under the mount container.
    expect(dialog!.closest("[data-psmi-scope=\"root\"]")).not.toBeNull();
    // Counter reflects 1-based index.
    expect(dialog!.textContent).toContain("2");
    expect(dialog!.textContent).toContain("/ 2");
    // Badge is drawn.
    expect(dialog!.textContent).toContain("TOUR");
  });

  it("close button unmounts the dialog", () => {
    render(<ImmersiveFeed items={items} initiallyOpen />);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const closeBtn = dialog!.querySelector("button[aria-label='Close']") as HTMLButtonElement | null;
    expect(closeBtn).not.toBeNull();
    act(() => {
      closeBtn!.click();
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders counter at bottom-right of the viewport with the psmi-counter class", () => {
    render(<ImmersiveFeed items={items} initiallyOpen />);
    const counter = document.querySelector(".psmi-counter") as HTMLElement | null;
    expect(counter).not.toBeNull();
    // Positioned at bottom-right, not top-center like the previous chrome placement.
    expect(counter!.style.right).toBe("12px");
    expect(counter!.style.bottom).toBe("14px");
    expect(counter!.style.left).toBe("");
    expect(counter!.textContent).toContain("1");
    expect(counter!.textContent).toContain("/");
    expect(counter!.textContent).toContain("2");
  });

  it("counter is not rendered when there is only one item", () => {
    const solo: MediaItem[] = [items[0]!];
    render(<ImmersiveFeed items={solo} initiallyOpen />);
    expect(document.querySelector(".psmi-counter")).toBeNull();
  });

  it("badge is positioned at 16px top / 16px left inside the viewport", () => {
    render(<ImmersiveFeed items={items} initiallyOpen />);
    const dialog = document.querySelector('[role="dialog"]')!;
    // Find the badge text span, then walk up to the positioned wrapper div.
    const labelSpan = Array.from(dialog.querySelectorAll("span")).find((s) =>
      s.textContent?.trim() === "INTRO",
    );
    expect(labelSpan).toBeTruthy();
    const badge = labelSpan!.parentElement as HTMLElement;
    expect(badge.style.top).toBe("16px");
    expect(badge.style.left).toBe("16px");
  });
});
