import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";
import { ThumbnailCard } from "../thumbnails/ThumbnailCard.js";
import { ThumbnailStrip } from "../thumbnails/ThumbnailStrip.js";
import { ImmersiveFeedProvider } from "../core/ImmersiveFeedProvider.js";
import type { MediaItem } from "../types/index.js";

const items: MediaItem[] = [
  // `src` is omitted so tests default to the poster branch (no <video>
  // preview) — keeps the assertions focused on chrome. The preview branch
  // is covered separately below.
  { id: "a", poster: "/a.jpg", title: "First", badge: "INTRO", durationMs: 92000 },
  { id: "b", poster: "/b.jpg", title: "Second", badge: "TOUR", durationMs: 64000 },
];

describe("<ThumbnailCard>", () => {
  it("renders title, badge, and duration label", () => {
    const { getByRole, container } = render(
      <ThumbnailCard item={items[0]!} onOpen={() => {}} />,
    );
    const btn = getByRole("button", { name: /Play First/i });
    expect(btn).toBeTruthy();
    expect(container.textContent).toContain("First");
    expect(container.textContent).toContain("INTRO");
    expect(container.textContent).toContain("1:32");
  });

  it("calls onOpen with item id on click", () => {
    const onOpen = vi.fn();
    const { getByRole } = render(
      <ThumbnailCard item={items[0]!} onOpen={onOpen} />,
    );
    act(() => {
      (getByRole("button") as HTMLButtonElement).click();
    });
    expect(onOpen).toHaveBeenCalledWith("a");
  });

  it("honors hideCaption flag", () => {
    const { container } = render(
      <ThumbnailCard item={items[0]!} onOpen={() => {}} hideCaption />,
    );
    expect(container.textContent).not.toContain("First");
    expect(container.textContent).not.toContain("1:32");
  });

  it("hides the muted-speaker icon by default in v0.2+", () => {
    const { container } = render(
      <ThumbnailCard item={items[0]!} onOpen={() => {}} />,
    );
    // The icon is a <svg> with a speaker-shape path. Zero <svg>s in the
    // top-right region means the icon is hidden.
    const svgs = container.querySelectorAll("svg");
    // There's still the play-button svg; the mute svg would be a second one.
    // Fall back to a text check on the aria-label — the icon wraps in a
    // <span aria-hidden> so no text ever appears, but the DOM SVG count
    // between hidden and shown differs by exactly one.
    const withIcon = renderCount(true);
    const withoutIcon = renderCount(false);
    expect(svgs.length).toBe(withoutIcon);
    expect(withoutIcon).toBeLessThan(withIcon);
  });

  it("shows the muted-speaker icon when `showMutedIcon` is true", () => {
    const { container } = render(
      <ThumbnailCard
        item={items[0]!}
        onOpen={() => {}}
        showMutedIcon
      />,
    );
    expect(container.querySelectorAll("svg").length).toBe(renderCount(true));
  });

  it("honors legacy `hideMutedIcon={false}` to show the icon", () => {
    const { container } = render(
      <ThumbnailCard
        item={items[0]!}
        onOpen={() => {}}
        hideMutedIcon={false}
      />,
    );
    expect(container.querySelectorAll("svg").length).toBe(renderCount(true));
  });

  it("renders a <video> preview when the item has a video source", () => {
    const withSrc: MediaItem = {
      ...items[0]!,
      src: "/a.mp4",
    };
    const { container } = render(
      <ThumbnailCard item={withSrc} onOpen={() => {}} />,
    );
    // happy-dom exposes video elements; verify one is present.
    expect(container.querySelector("video")).not.toBeNull();
    // No <img> should render alongside — the preview branch replaces it.
    expect(container.querySelectorAll("img").length).toBe(0);
  });

  it("falls back to poster <img> when autoplayPreview is disabled", () => {
    const withSrc: MediaItem = {
      ...items[0]!,
      src: "/a.mp4",
    };
    const { container } = render(
      <ThumbnailCard
        item={withSrc}
        onOpen={() => {}}
        autoplayPreview={false}
      />,
    );
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).not.toBeNull();
  });
});

// Helper: count expected <svg> elements in a rendered ThumbnailCard
// depending on whether the mute icon is drawn. Kept in sync with
// ThumbnailCard's SVG usage: badge dot (0 svgs; just a colored span),
// play button (1 svg), optional mute icon (1 svg).
function renderCount(iconShown: boolean): number {
  return iconShown ? 2 : 1;
}

describe("<ThumbnailStrip>", () => {
  it("renders cards from the surrounding provider", () => {
    const { getAllByRole } = render(
      <ImmersiveFeedProvider items={items}>
        <ThumbnailStrip />
      </ImmersiveFeedProvider>,
    );
    const buttons = getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it("renders nothing when the item list is empty", () => {
    const { container } = render(
      <ImmersiveFeedProvider items={[]}>
        <ThumbnailStrip />
      </ImmersiveFeedProvider>,
    );
    expect(container.textContent).toBe("");
  });

  it("throws when used without a provider AND without onOpen", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ThumbnailStrip items={items} />)).toThrow();
    errSpy.mockRestore();
  });

  it("accepts explicit items + onOpen without a provider", () => {
    const onOpen = vi.fn();
    const { getAllByRole } = render(
      <ThumbnailStrip items={items} onOpen={onOpen} />,
    );
    const buttons = getAllByRole("button");
    act(() => {
      (buttons[0] as HTMLButtonElement).click();
    });
    expect(onOpen).toHaveBeenCalledWith("a");
  });

  it("respects renderItem override", () => {
    const { container } = render(
      <ImmersiveFeedProvider items={items}>
        <ThumbnailStrip
          renderItem={(item) => (
            <div data-testid={`custom-${item.id}`}>custom-{item.title}</div>
          )}
        />
      </ImmersiveFeedProvider>,
    );
    expect(container.textContent).toContain("custom-First");
    expect(container.textContent).toContain("custom-Second");
  });
});
