import { describe, it, expect, vi } from "vitest";
import React, { useRef } from "react";
import { render, act } from "@testing-library/react";
import {
  ImmersiveFeedProvider,
  useImmersiveFeed,
} from "../core/ImmersiveFeedProvider.js";
import type {
  ImmersiveFeedHandle,
  MediaItem,
} from "../types/index.js";

const items: MediaItem[] = [
  { id: "a", poster: "/a.jpg", title: "A", durationMs: 1000 },
  { id: "b", poster: "/b.jpg", title: "B", durationMs: 2000 },
  { id: "c", poster: "/c.jpg", title: "C", durationMs: 3000 },
];

function Probe() {
  const feed = useImmersiveFeed();
  return (
    <div>
      <span data-testid="idx">{feed.activeIndex}</span>
      <span data-testid="open">{String(feed.isOpen)}</span>
      <span data-testid="muted">{String(feed.isMuted)}</span>
      <span data-testid="can-next">{String(feed.canNext)}</span>
      <span data-testid="can-prev">{String(feed.canPrev)}</span>
      <span data-testid="current-id">{feed.currentItem?.id ?? ""}</span>
      <button data-testid="btn-next" onClick={feed.next}>next</button>
      <button data-testid="btn-prev" onClick={feed.prev}>prev</button>
      <button data-testid="btn-open-b" onClick={() => feed.open("b")}>open b</button>
      <button data-testid="btn-open-idx-2" onClick={() => feed.open(2)}>open idx 2</button>
      <button data-testid="btn-close" onClick={feed.close}>close</button>
      <button data-testid="btn-toggle-mute" onClick={() => feed.setMuted((m) => !m)}>toggle mute</button>
    </div>
  );
}

describe("ImmersiveFeedProvider", () => {
  it("provides initial state and derived flags", () => {
    const { getByTestId } = render(
      <ImmersiveFeedProvider items={items}>
        <Probe />
      </ImmersiveFeedProvider>,
    );
    expect(getByTestId("idx").textContent).toBe("0");
    expect(getByTestId("open").textContent).toBe("false");
    expect(getByTestId("muted").textContent).toBe("true"); // default
    expect(getByTestId("can-prev").textContent).toBe("false");
    expect(getByTestId("can-next").textContent).toBe("true");
    expect(getByTestId("current-id").textContent).toBe("a");
  });

  it("open(id) resolves to the right index and sets isOpen", () => {
    const onOpen = vi.fn();
    const { getByTestId } = render(
      <ImmersiveFeedProvider items={items} onOpen={onOpen}>
        <Probe />
      </ImmersiveFeedProvider>,
    );
    act(() => {
      getByTestId("btn-open-b").click();
    });
    expect(getByTestId("idx").textContent).toBe("1");
    expect(getByTestId("open").textContent).toBe("true");
    expect(getByTestId("current-id").textContent).toBe("b");
    expect(onOpen).toHaveBeenCalledWith(items[1]);
  });

  it("open() unmutes even when initiallyMuted is true (user-gesture policy)", () => {
    const { getByTestId } = render(
      <ImmersiveFeedProvider items={items} initiallyMuted>
        <Probe />
      </ImmersiveFeedProvider>,
    );
    // Default state: muted.
    expect(getByTestId("muted").textContent).toBe("true");
    act(() => {
      getByTestId("btn-open-b").click();
    });
    // After open(), muted is false so the video plays with sound.
    expect(getByTestId("muted").textContent).toBe("false");
  });

  it("open(index) also works", () => {
    const { getByTestId } = render(
      <ImmersiveFeedProvider items={items}>
        <Probe />
      </ImmersiveFeedProvider>,
    );
    act(() => {
      getByTestId("btn-open-idx-2").click();
    });
    expect(getByTestId("idx").textContent).toBe("2");
    expect(getByTestId("can-next").textContent).toBe("false");
  });

  it("next() and prev() clamp at bounds", () => {
    const { getByTestId } = render(
      <ImmersiveFeedProvider items={items}>
        <Probe />
      </ImmersiveFeedProvider>,
    );
    // From 0: prev is a no-op
    act(() => {
      getByTestId("btn-prev").click();
    });
    expect(getByTestId("idx").textContent).toBe("0");
    // Advance to end
    act(() => {
      getByTestId("btn-next").click();
    });
    expect(getByTestId("idx").textContent).toBe("1");
    act(() => {
      getByTestId("btn-next").click();
    });
    expect(getByTestId("idx").textContent).toBe("2");
    // At end: next is a no-op
    act(() => {
      getByTestId("btn-next").click();
    });
    expect(getByTestId("idx").textContent).toBe("2");
  });

  it("close() unsets isOpen and fires onClose", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(
      <ImmersiveFeedProvider items={items} initiallyOpen onClose={onClose}>
        <Probe />
      </ImmersiveFeedProvider>,
    );
    expect(getByTestId("open").textContent).toBe("true");
    act(() => {
      getByTestId("btn-close").click();
    });
    expect(getByTestId("open").textContent).toBe("false");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("setMuted supports functional and direct updates", () => {
    const { getByTestId } = render(
      <ImmersiveFeedProvider items={items} initiallyMuted={false}>
        <Probe />
      </ImmersiveFeedProvider>,
    );
    expect(getByTestId("muted").textContent).toBe("false");
    act(() => {
      getByTestId("btn-toggle-mute").click();
    });
    expect(getByTestId("muted").textContent).toBe("true");
  });

  it("fires onIndexChange with the new item", () => {
    const onIndexChange = vi.fn();
    const { getByTestId } = render(
      <ImmersiveFeedProvider items={items} onIndexChange={onIndexChange}>
        <Probe />
      </ImmersiveFeedProvider>,
    );
    act(() => {
      getByTestId("btn-next").click();
    });
    expect(onIndexChange).toHaveBeenCalledWith(1, items[1]);
  });

  it("exposes an imperative handle via ref", () => {
    // `refHolder.current` always reflects the latest handle instance, because
    // useImperativeHandle rewrites ref.current on every dependent render.
    const refHolder: { current: ImmersiveFeedHandle | null } = { current: null };
    function Wrapper() {
      const ref = useRef<ImmersiveFeedHandle>(null);
      // Layout-effect runs after commit AND after every re-render, so the
      // holder always tracks the latest handle written by useImperativeHandle.
      React.useLayoutEffect(() => {
        refHolder.current = ref.current;
      });
      return (
        <ImmersiveFeedProvider ref={ref} items={items}>
          <Probe />
        </ImmersiveFeedProvider>
      );
    }
    const { getByTestId } = render(<Wrapper />);
    expect(refHolder.current).toBeTruthy();
    act(() => {
      refHolder.current!.open("c");
    });
    expect(getByTestId("idx").textContent).toBe("2");
    expect(getByTestId("open").textContent).toBe("true");
    act(() => {
      refHolder.current!.close();
    });
    expect(getByTestId("open").textContent).toBe("false");
    // getState should reflect latest state.
    const s = refHolder.current!.getState();
    expect(s.items).toEqual(items);
    expect(s.activeIndex).toBe(2);
    expect(s.isOpen).toBe(false);
  });

  it("useImmersiveFeed() throws helpfully outside the provider", () => {
    // Suppress the expected error console noise for this test.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    function BadConsumer() {
      useImmersiveFeed();
      return null;
    }
    expect(() => render(<BadConsumer />)).toThrow(/ImmersiveFeedProvider/);
    errSpy.mockRestore();
  });
});
