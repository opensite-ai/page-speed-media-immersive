import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";
import { ThumbnailCard } from "../thumbnails/ThumbnailCard.js";
import { ThumbnailStrip } from "../thumbnails/ThumbnailStrip.js";
import { ImmersiveFeedProvider } from "../core/ImmersiveFeedProvider.js";
import type { MediaItem } from "../types/index.js";

const items: MediaItem[] = [
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

  it("honors hideCaption and hideMutedIcon flags", () => {
    const { container } = render(
      <ThumbnailCard
        item={items[0]!}
        onOpen={() => {}}
        hideCaption
        hideMutedIcon
      />,
    );
    expect(container.textContent).not.toContain("First");
    expect(container.textContent).not.toContain("1:32");
  });
});

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
