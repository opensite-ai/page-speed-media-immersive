import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, act, fireEvent } from "@testing-library/react";
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

  it("badgeSlot replaces the built-in badge chip entirely", () => {
    const { container, queryByTestId } = render(
      <ThumbnailCard
        item={items[0]!}
        onOpen={() => {}}
        badgeSlot={<span data-testid="likes">42 likes</span>}
      />,
    );
    // The consumer's slot renders...
    expect(queryByTestId("likes")).not.toBeNull();
    expect(container.textContent).toContain("42 likes");
    // ...and the item.badge string ("INTRO") is NOT rendered.
    expect(container.textContent).not.toContain("INTRO");
  });

  it("showDuration={false} removes the duration but keeps the title", () => {
    const { container } = render(
      <ThumbnailCard item={items[0]!} onOpen={() => {}} showDuration={false} />,
    );
    expect(container.textContent).toContain("First"); // title kept
    expect(container.textContent).not.toContain("1:32"); // duration gone
    // Not the same as hideCaption — the caption overlay is still present.
    expect(container.querySelector(".psmi-card span")).not.toBeNull();
  });

  it("glyphMode='none' renders no center glyph", () => {
    const { container } = render(
      <ThumbnailCard item={items[0]!} onOpen={() => {}} glyphMode="none" />,
    );
    expect(container.querySelector(".psmi-play-hover")).toBeNull();
  });

  it("glyphMode='hover': glyph hidden until mouse hover, revealed on hover and focus", () => {
    const { getByRole, container } = render(
      <ThumbnailCard item={items[0]!} onOpen={() => {}} glyphMode="hover" />,
    );
    const btn = getByRole("button");
    const glyph = container.querySelector(".psmi-play-btn") as HTMLElement;
    // Hidden initially.
    expect(glyph.style.opacity).toBe("0");
    // Mouse hover reveals it.
    fireEvent.pointerEnter(btn, { pointerType: "mouse" });
    expect(glyph.style.opacity).toBe("1");
    // Leaving hides it again.
    fireEvent.pointerLeave(btn);
    expect(glyph.style.opacity).toBe("0");
    // Keyboard focus reveals it (a11y).
    fireEvent.focus(btn);
    expect(glyph.style.opacity).toBe("1");
    fireEvent.blur(btn);
    expect(glyph.style.opacity).toBe("0");
  });

  it("glyphMode='hover': touch (pointerType touch) does NOT reveal the glyph", () => {
    const { getByRole, container } = render(
      <ThumbnailCard item={items[0]!} onOpen={() => {}} glyphMode="hover" />,
    );
    const btn = getByRole("button");
    const glyph = container.querySelector(".psmi-play-btn") as HTMLElement;
    fireEvent.pointerEnter(btn, { pointerType: "touch" });
    expect(glyph.style.opacity).toBe("0");
  });

  it("uses a play glyph for videos and an expand glyph for images", () => {
    const videoItem: MediaItem = { ...items[0]!, src: "/a.mp4" };
    const { container: vc } = render(
      // autoplayPreview off so the <video> preview doesn't affect the glyph.
      <ThumbnailCard item={videoItem} onOpen={() => {}} autoplayPreview={false} />,
    );
    const videoGlyph = vc.querySelector(".psmi-play-btn svg") as SVGElement;
    // Play triangle: filled.
    expect(videoGlyph.getAttribute("fill")).toBe("#182b4a");

    const imageItem: MediaItem = {
      id: "im",
      type: "image",
      poster: "/p.jpg",
      title: "Pic",
    };
    const { container: ic } = render(
      <ThumbnailCard item={imageItem} onOpen={() => {}} />,
    );
    const imageGlyph = ic.querySelector(".psmi-play-btn svg") as SVGElement;
    // Expand icon: stroked outline, not a filled triangle.
    expect(imageGlyph.getAttribute("fill")).toBe("none");
    expect(imageGlyph.getAttribute("stroke")).toBe("#182b4a");
  });

  it("renders image items as a static poster with no video preview or audio bars", () => {
    const imageItem: MediaItem = {
      id: "im",
      type: "image",
      poster: "/p.jpg",
      title: "Pic",
      // Video-only fields must be ignored for image items.
      src: "/ignored.mp4",
      durationMs: 92000,
    };
    const { container, getByRole } = render(
      <ThumbnailCard item={imageItem} onOpen={() => {}} />,
    );
    // No <video> preview even though `src` is set and autoplayPreview defaults on.
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).not.toBeNull();
    // No audio-bars glyph, no duration.
    expect(container.querySelector(".psmi-eq")).toBeNull();
    expect(container.textContent).not.toContain("1:32");
    // Accessible name reflects the expand (not play) affordance.
    expect(getByRole("button").getAttribute("aria-label")).toBe("Expand Pic");
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

  it("passes showDuration and glyphMode through to default cards", () => {
    const { container } = render(
      <ThumbnailStrip
        items={items}
        onOpen={() => {}}
        showDuration={false}
        glyphMode="none"
      />,
    );
    // showDuration=false → no duration labels anywhere in the strip.
    expect(container.textContent).not.toContain("1:32");
    expect(container.textContent).not.toContain("1:04");
    // glyphMode="none" → no glyph rendered on any card.
    expect(container.querySelector(".psmi-play-hover")).toBeNull();
    // Titles are still present (showDuration only drops the duration).
    expect(container.textContent).toContain("First");
    expect(container.textContent).toContain("Second");
  });
});

describe("ThumbnailCard size presets", () => {
  it("renders the IG preset larger than the client-portal presets", () => {
    const widthOf = (size: "sm" | "md" | "hero" | "ig"): number => {
      const { container } = render(
        <ThumbnailCard item={items[0]!} onOpen={() => {}} size={size} />,
      );
      const btn = container.querySelector("button") as HTMLElement;
      return parseFloat(btn.style.width);
    };
    const ig = widthOf("ig");
    expect(ig).toBeGreaterThan(widthOf("hero"));
    expect(ig).toBeGreaterThan(widthOf("md"));
    expect(ig).toBeGreaterThan(widthOf("sm"));
  });
});
