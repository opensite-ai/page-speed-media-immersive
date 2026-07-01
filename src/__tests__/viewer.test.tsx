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
});
