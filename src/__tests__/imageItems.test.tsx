import { describe, it, expect } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";
import { ImmersiveFeed } from "../core/ImmersiveFeed.js";
import type { MediaItem } from "../types/index.js";

// Helpers to reach the active slide's <section> in the portalled dialog.
function activeSection(index: number): HTMLElement {
  const el = document.querySelector(
    `section[data-psmi-index="${index}"]`,
  ) as HTMLElement | null;
  expect(el).not.toBeNull();
  return el!;
}
function mutePill(): HTMLElement | null {
  return document.querySelector(
    'button[aria-label="Muted"], button[aria-label="Sound on"]',
  ) as HTMLElement | null;
}

describe("<ImmersiveViewer> image items", () => {
  it("renders an <img> (not a <video>) for an image item and suppresses the mute pill", () => {
    const items: MediaItem[] = [
      {
        id: "img-1",
        type: "image",
        poster: "/photo.jpg",
        title: "A still photo",
        // These video-only fields must be ignored for image items.
        src: "/should-be-ignored.mp4",
      },
    ];
    render(<ImmersiveFeed items={items} initiallyOpen />);
    const section = activeSection(0);
    // No <video> element is ever attached for an image slide.
    expect(section.querySelector("video")).toBeNull();
    // The poster image renders full-bleed as the content.
    expect(section.querySelector("img")).not.toBeNull();
    // There is no audio to toggle, so the mute pill is not rendered.
    expect(mutePill()).toBeNull();
    // The close button is still present.
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('button[aria-label="Close"]')).not.toBeNull();
  });

  it("does not render the progress bar or playback glyph for an image slide", () => {
    const items: MediaItem[] = [
      { id: "img-1", type: "image", poster: "/photo.jpg", title: "Still" },
    ];
    render(<ImmersiveFeed items={items} initiallyOpen />);
    // The delayed-show spinner/glyph wrappers are video-only chrome.
    expect(document.querySelector(".psmi-delayed-show")).toBeNull();
    expect(document.querySelector(".psmi-delayed-show-fast")).toBeNull();
    // No tap-to-play overlay either — the whole card navigates, IG-style.
    expect(document.querySelector("[data-psmi-tap-overlay]")).toBeNull();
  });

  it("transitions cleanly video -> image -> video in a mixed feed", () => {
    const items: MediaItem[] = [
      { id: "v1", poster: "/a.jpg", title: "Video one", src: "/a.mp4" },
      { id: "i1", type: "image", poster: "/b.jpg", title: "Image two" },
      { id: "v2", poster: "/c.jpg", title: "Video three", src: "/c.mp4" },
    ];
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={0} />);
    const dialog = document.querySelector('[role="dialog"]')!;

    // Index 0 (video): active slide has a <video>, mute pill is present.
    expect(activeSection(0).querySelector("video")).not.toBeNull();
    expect(mutePill()).not.toBeNull();

    const nextBtn = dialog.querySelector(
      'button[aria-label="Next video"]',
    ) as HTMLButtonElement;

    // Advance to index 1 (image): active slide has NO <video>, an <img>, and
    // the mute pill is suppressed. The teardown of the outgoing <video> slide
    // must not assume the incoming active slide is a <video>.
    act(() => {
      nextBtn.click();
    });
    const imageSlide = activeSection(1);
    expect(imageSlide.querySelector("video")).toBeNull();
    expect(imageSlide.querySelector("img")).not.toBeNull();
    expect(mutePill()).toBeNull();

    // Advance to index 2 (video): playback chrome returns.
    act(() => {
      (
        dialog.querySelector(
          'button[aria-label="Next video"]',
        ) as HTMLButtonElement
      ).click();
    });
    expect(activeSection(2).querySelector("video")).not.toBeNull();
    expect(mutePill()).not.toBeNull();
  });
});
