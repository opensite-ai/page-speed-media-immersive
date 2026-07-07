import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";
import { ImmersiveFeed } from "../core/ImmersiveFeed.js";
import type { MediaItem } from "../types/index.js";

const items: MediaItem[] = [
  { id: "a", poster: "/a.jpg", title: "First", badge: "INTRO", src: "/a.mp4", durationMs: 1000 },
  { id: "b", poster: "/b.jpg", title: "Second", badge: "TOUR", src: "/b.mp4", durationMs: 2000 },
  { id: "c", poster: "/c.jpg", title: "Third", badge: "STORY", src: "/c.mp4", durationMs: 3000 },
];

/**
 * Regression suite for the mobile "silent stall" bug (v0.4.1).
 *
 * On iOS WebKit, after a few swipes the newly-active video's play() can be
 * accepted (el.paused flips false) but the media engine never actually
 * starts — no `playing`, no `pause`, no rejection (with <source> children
 * the promise never rejects). Pre-fix, the UI derived "playing" from
 * paused===false and showed NO overlay for the whole stall, retries only
 * rode on canplay/loadedmetadata (which never re-fire once data is
 * loaded), the recovery tap actually called pause() on the zombie, and
 * every committed swipe play()ed the OUTGOING video from a stale closure.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getVideos(): HTMLVideoElement[] {
  const dialog = document.querySelector('[role="dialog"]')!;
  return Array.from(dialog.querySelectorAll("video"));
}

function getPagerContainer(): HTMLElement {
  return document.querySelector(".psmi-scrollhide") as HTMLElement;
}

function pointerEvent(type: string, y: number): MouseEvent {
  // The gesture engine reads clientX/clientY/pointerId/button off the raw
  // event; MouseEvent carries the coordinates and happy-dom delivers it to
  // addEventListener("pointer*") listeners just fine.
  return new MouseEvent(type, { bubbles: true, clientX: 50, clientY: y, button: 0 });
}

/** Simulate a committed upward swipe (next video) on the pager container. */
function swipeUp(container: HTMLElement) {
  act(() => {
    container.dispatchEvent(pointerEvent("pointerdown", 500));
    // First move locks vertical intent (>=10px dominant axis).
    container.dispatchEvent(pointerEvent("pointermove", 470));
    container.dispatchEvent(pointerEvent("pointermove", 430));
    // happy-dom clientHeight is 0 so the hook's height fallback (1px) makes
    // any distance commit — pointerup at dy=-70 commits to index+1.
    container.dispatchEvent(pointerEvent("pointerup", 430));
  });
}

/** Simulate a drag that returns to its origin (rubber-band, no commit). */
function swipeAborted(container: HTMLElement) {
  act(() => {
    container.dispatchEvent(pointerEvent("pointerdown", 500));
    container.dispatchEvent(pointerEvent("pointermove", 460));
    container.dispatchEvent(pointerEvent("pointermove", 500));
    container.dispatchEvent(pointerEvent("pointerup", 500));
  });
}

/** Stub play/pause with spies. play() returns a forever-pending promise
 *  (the WebKit zombie shape) unless a custom impl is given. */
function stubMedia(
  video: HTMLVideoElement,
  opts: { play?: () => Promise<void> } = {},
) {
  const play = vi.fn(opts.play ?? (() => new Promise<void>(() => {})));
  const pause = vi.fn();
  video.play = play as unknown as typeof video.play;
  video.pause = pause as unknown as typeof video.pause;
  return { play, pause };
}

function setMediaState(
  video: HTMLVideoElement,
  state: {
    paused?: boolean;
    currentTime?: number;
    readyState?: number;
    ended?: boolean;
  },
) {
  if (state.paused !== undefined) {
    Object.defineProperty(video, "paused", { configurable: true, get: () => state.paused });
  }
  if (state.currentTime !== undefined) {
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      get: () => state.currentTime,
      set: () => {},
    });
  }
  if (state.readyState !== undefined) {
    Object.defineProperty(video, "readyState", { configurable: true, get: () => state.readyState });
  }
  if (state.ended !== undefined) {
    Object.defineProperty(video, "ended", { configurable: true, get: () => state.ended });
  }
}

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// 1. Swipe-commit behavior
// ---------------------------------------------------------------------------

describe("swipe commit playback handoff", () => {
  it("does NOT play() the outgoing video after a committed swipe (stale-closure regression)", () => {
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={0} />);
    const [v0, v1] = getVideos();
    // v0 starts out playing; pause() must genuinely flip its paused state,
    // otherwise onDragStart's pause leaves el.paused reading false and BOTH
    // the old and new onDragEnd skip the resume branch — making this test
    // pass vacuously (empirically verified by reverting the fix).
    const paused = { value: false };
    const m0 = stubMedia(v0!, { play: () => Promise.resolve() });
    Object.defineProperty(v0!, "paused", { configurable: true, get: () => paused.value });
    setMediaState(v0!, { currentTime: 1, readyState: 4 });
    m0.pause.mockImplementation(() => {
      paused.value = true;
    });
    stubMedia(v1!, { play: () => Promise.resolve() });

    swipeUp(getPagerContainer());

    // onDragStart paused the outgoing video...
    expect(m0.pause).toHaveBeenCalled();
    // ...and pre-fix, onDragEnd ignored `committed` and resumed it (its
    // stale closure still pointed at the OLD activeIndex) — a play() the
    // play-effect then immediately paused again (AbortError churn on the
    // media engine during every single swipe).
    expect(m0.play).not.toHaveBeenCalled();
  });

  it("primes the incoming video with a muted play() inside the pointerup call stack", () => {
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={0} />);
    const [v0, v1] = getVideos();
    stubMedia(v0!, { play: () => Promise.resolve() });
    setMediaState(v0!, { paused: false, currentTime: 1, readyState: 4 });
    // Record WHEN each play() lands: the pager counter still reads the OLD
    // index ("1 / 3") during the synchronous pointerup call stack, and the
    // NEW index ("2 / 3") once React has re-rendered and effects run. The
    // fix's whole point is that the play() happens in the former window —
    // the play effect would satisfy a bare "was play called" assertion on
    // its own (empirically verified by deleting the prime block).
    const counterAtCall: (string | null)[] = [];
    const v1paused = { value: true };
    const m1 = stubMedia(v1!, {
      play: () => {
        counterAtCall.push(
          document.querySelector(".psmi-counter")?.textContent ?? null,
        );
        v1paused.value = false; // a real play() flips paused synchronously
        return new Promise<void>(() => {});
      },
    });
    Object.defineProperty(v1!, "paused", { configurable: true, get: () => v1paused.value });
    setMediaState(v1!, { currentTime: 0, readyState: 2 });

    swipeUp(getPagerContainer());

    expect(m1.play).toHaveBeenCalledTimes(1);
    // The one play() came from the prime (counter still on the old page),
    // not from the post-render play effect.
    expect(counterAtCall[0]).toContain("1");
    // The prime must go through the guaranteed muted-autoplay path.
    expect(v1!.muted).toBe(true);
    expect(v1!.hasAttribute("muted")).toBe(true);
  });

  it("still resumes the current video after an aborted (uncommitted) drag", () => {
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={0} />);
    const [v0] = getVideos();
    const paused = { value: false };
    const m0 = stubMedia(v0!, { play: () => Promise.resolve() });
    Object.defineProperty(v0!, "paused", { configurable: true, get: () => paused.value });
    setMediaState(v0!, { currentTime: 1, readyState: 4 });
    m0.pause.mockImplementation(() => {
      paused.value = true;
    });

    swipeAborted(getPagerContainer());

    // onDragStart paused it; onDragEnd(committed=false) must resume it.
    expect(m0.pause).toHaveBeenCalled();
    expect(m0.play).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Start-of-playback watchdog
// ---------------------------------------------------------------------------

describe("playback watchdog", () => {
  it("retries a zombie pending play (paused=false, frozen at 0) and shows the spinner while retrying", async () => {
    vi.useFakeTimers();
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={0} />);
    const [v0] = getVideos();
    const m0 = stubMedia(v0!);
    // Zombie: play() was accepted (paused=false) but no frames ever render.
    setMediaState(v0!, { paused: false, currentTime: 0, readyState: 4 });
    // The UI believes it is playing (this is what the user saw: no overlay).
    act(() => {
      v0!.dispatchEvent(new Event("playing"));
    });
    expect(document.querySelector(".psmi-delayed-show")).toBeNull();
    expect(document.querySelector(".psmi-delayed-show-fast")).toBeNull();

    // First watchdog tick: detects no progress, re-kicks playback.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(m0.pause).toHaveBeenCalled(); // reset the wedged pending play()
    expect(m0.play).toHaveBeenCalled();
    // While retrying, the UI must be honest: buffering spinner, not "playing".
    expect(document.querySelector(".psmi-delayed-show")).not.toBeNull();
  });

  it("degrades to the tap-to-play glyph and reports autoplay-blocked after retries are exhausted", async () => {
    vi.useFakeTimers();
    const onAutoplayBlocked = vi.fn();
    render(
      <ImmersiveFeed
        items={items}
        initiallyOpen
        initialIndex={0}
        onAutoplayBlocked={onAutoplayBlocked}
      />,
    );
    const [v0] = getVideos();
    stubMedia(v0!);
    setMediaState(v0!, { paused: false, currentTime: 0, readyState: 4 });
    act(() => {
      v0!.dispatchEvent(new Event("playing"));
    });

    // Walk through every retry window plus the give-up tick.
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    // Honest terminal state: the paused glyph (tap-to-play), never an
    // infinite spinner and never a bare frozen frame.
    expect(document.querySelector(".psmi-delayed-show-fast")).not.toBeNull();
    expect(document.querySelector(".psmi-delayed-show")).toBeNull();
    expect(onAutoplayBlocked).toHaveBeenCalledTimes(1);
    expect(onAutoplayBlocked.mock.calls[0]![0]).toMatchObject({ id: "a" });
  });

  it("does nothing while the active video is genuinely advancing", async () => {
    vi.useFakeTimers();
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={0} />);
    const [v0] = getVideos();
    const m0 = stubMedia(v0!);
    let t = 0.5;
    Object.defineProperty(v0!, "paused", { configurable: true, get: () => false });
    Object.defineProperty(v0!, "currentTime", {
      configurable: true,
      get: () => (t += 0.9),
      set: () => {},
    });
    setMediaState(v0!, { readyState: 4 });
    act(() => {
      v0!.dispatchEvent(new Event("playing"));
    });

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    expect(m0.play).not.toHaveBeenCalled();
    expect(m0.pause).not.toHaveBeenCalled();
    expect(document.querySelector(".psmi-delayed-show")).toBeNull();
    expect(document.querySelector(".psmi-delayed-show-fast")).toBeNull();
  });

  it("never fights an explicit user pause", async () => {
    vi.useFakeTimers();
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={0} />);
    const [v0] = getVideos();
    const paused = { value: false };
    const m0 = stubMedia(v0!, { play: () => Promise.resolve() });
    Object.defineProperty(v0!, "paused", { configurable: true, get: () => paused.value });
    setMediaState(v0!, { currentTime: 2, readyState: 4 });
    m0.pause.mockImplementation(() => {
      paused.value = true;
      v0!.dispatchEvent(new Event("pause"));
    });
    act(() => {
      v0!.dispatchEvent(new Event("playing"));
    });

    // User taps to pause.
    const overlay = document.querySelector("[data-psmi-tap-overlay]") as HTMLElement;
    expect(overlay).not.toBeNull();
    act(() => {
      overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(m0.pause).toHaveBeenCalledTimes(1);
    const playCallsAfterPause = m0.play.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    // The watchdog must not auto-resume a video the user paused on purpose.
    expect(m0.play.mock.calls.length).toBe(playCallsAfterPause);
    // And the paused glyph is shown (user-paused, even at any currentTime).
    expect(document.querySelector(".psmi-delayed-show-fast")).not.toBeNull();
  });

  it("leaves a video that ENDED normally alone (no muted replay, no blocked report)", async () => {
    vi.useFakeTimers();
    const onAutoplayBlocked = vi.fn();
    render(
      <ImmersiveFeed
        items={items}
        initiallyOpen
        initialIndex={items.length - 1}
        onAutoplayBlocked={onAutoplayBlocked}
      />,
    );
    const videos = getVideos();
    const vLast = videos[videos.length - 1]!;
    const mLast = stubMedia(vLast);
    // Last item played to completion: paused, ended, resting on its end
    // frame. play() on an ended element seeks to 0 and REPLAYS it — the
    // watchdog must never do that to a video that finished normally.
    setMediaState(vLast, { paused: true, ended: true, currentTime: 5, readyState: 4 });
    act(() => {
      vLast.dispatchEvent(new Event("pause"));
    });

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    expect(mLast.play).not.toHaveBeenCalled();
    expect(onAutoplayBlocked).not.toHaveBeenCalled();
    // Resting state reads as paused (glyph), which is the honest affordance.
    expect(document.querySelector(".psmi-delayed-show-fast")).not.toBeNull();
  });

  it("give-up verdict is terminal: no further automatic attempts or duplicate reports after a definitive failure", async () => {
    const onAutoplayBlocked = vi.fn();
    const freshItems = (): MediaItem[] => items.map((it) => ({ ...it }));
    const { rerender } = render(
      <ImmersiveFeed
        items={freshItems()}
        initiallyOpen
        initialIndex={0}
        onAutoplayBlocked={onAutoplayBlocked}
      />,
    );
    const [v0] = getVideos();
    const err = new DOMException("denied", "NotAllowedError");
    const m0 = stubMedia(v0!, { play: () => Promise.reject(err) });
    setMediaState(v0!, { paused: true, currentTime: 0, readyState: 2 });

    // A retry lands and is definitively refused.
    await act(async () => {
      v0!.dispatchEvent(new Event("canplay"));
      await Promise.resolve();
    });
    expect(onAutoplayBlocked).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".psmi-delayed-show-fast")).not.toBeNull();
    const playCallsAfterVerdict = m0.play.mock.calls.length;

    // SSE-style churn: new items identity re-runs the play effect, and a
    // late canplay fires. Neither may re-attempt or re-report — pre-fix
    // this produced one onAutoplayBlocked per re-run and flickered the
    // glyph, and post-give-up watchdog re-arms turned it into a permanent
    // glyph->spinner oscillation.
    await act(async () => {
      rerender(
        <ImmersiveFeed
          items={freshItems()}
          initiallyOpen
          initialIndex={0}
          onAutoplayBlocked={onAutoplayBlocked}
        />,
      );
      v0!.dispatchEvent(new Event("canplay"));
      await Promise.resolve();
    });

    expect(m0.play.mock.calls.length).toBe(playCallsAfterVerdict);
    expect(onAutoplayBlocked).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".psmi-delayed-show-fast")).not.toBeNull();
  });

  it("keeps the spinner (no glyph, no blocked report) when giving up on a video that simply has no data yet", async () => {
    vi.useFakeTimers();
    const onAutoplayBlocked = vi.fn();
    render(
      <ImmersiveFeed
        items={items}
        initiallyOpen
        initialIndex={0}
        onAutoplayBlocked={onAutoplayBlocked}
      />,
    );
    const [v0] = getVideos();
    stubMedia(v0!);
    // Slow network: play() accepted but readyState never leaves HAVE_NOTHING.
    setMediaState(v0!, { paused: false, currentTime: 0, readyState: 0 });
    act(() => {
      v0!.dispatchEvent(new Event("waiting"));
    });

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    // A tap could not render frames either — "blocked" would be a lie and
    // the glyph a broken promise. The spinner is the truth on a slow link.
    expect(onAutoplayBlocked).not.toHaveBeenCalled();
    expect(document.querySelector(".psmi-delayed-show-fast")).toBeNull();
    expect(document.querySelector(".psmi-delayed-show")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Honest tap-to-play toggle
// ---------------------------------------------------------------------------

describe("tap toggle honesty", () => {
  it("a tap on a stalled (zombie) video STARTS playback instead of silently pausing it", () => {
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={0} />);
    const [v0] = getVideos();
    const m0 = stubMedia(v0!);
    // Zombie: paused=false but frozen at 0 — pre-fix the toggle keyed off
    // el.paused and PAUSED it, forcing the user to tap twice.
    setMediaState(v0!, { paused: false, currentTime: 0, readyState: 4 });
    act(() => {
      v0!.dispatchEvent(new Event("playing"));
    });

    const overlay = document.querySelector("[data-psmi-tap-overlay]") as HTMLElement;
    act(() => {
      overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(m0.play).toHaveBeenCalled();
  });

  it("a pause tap during a transient mid-play rebuffer is honored (not treated as resume)", () => {
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={0} />);
    const [v0] = getVideos();
    const m0 = stubMedia(v0!, { play: () => Promise.resolve() });
    // Mid-play network hiccup: still un-paused at t=5s, spinner showing.
    setMediaState(v0!, { paused: false, currentTime: 5, readyState: 2 });
    act(() => {
      v0!.dispatchEvent(new Event("playing"));
      v0!.dispatchEvent(new Event("waiting"));
    });
    expect(document.querySelector(".psmi-delayed-show")).not.toBeNull();

    const overlay = document.querySelector("[data-psmi-tap-overlay]") as HTMLElement;
    act(() => {
      overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Frames have demonstrably rendered (currentTime > 0), so the tap is an
    // intentional pause — it must not fall into the zombie-restart branch.
    expect(m0.pause).toHaveBeenCalledTimes(1);
    expect(m0.play).not.toHaveBeenCalled();
  });

  it("an aborted (rubber-band) drag does not resume a video the user paused", () => {
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={0} />);
    const [v0] = getVideos();
    const paused = { value: false };
    const m0 = stubMedia(v0!, { play: () => Promise.resolve() });
    Object.defineProperty(v0!, "paused", { configurable: true, get: () => paused.value });
    setMediaState(v0!, { currentTime: 2, readyState: 4 });
    m0.pause.mockImplementation(() => {
      paused.value = true;
      v0!.dispatchEvent(new Event("pause"));
    });
    act(() => {
      v0!.dispatchEvent(new Event("playing"));
    });

    // User taps to pause...
    const overlay = document.querySelector("[data-psmi-tap-overlay]") as HTMLElement;
    act(() => {
      overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(m0.pause).toHaveBeenCalledTimes(1);

    // ...then fidgets with a drag that rubber-bands back without committing.
    swipeAborted(getPagerContainer());

    // onDragEnd(committed=false) must respect the explicit pause.
    expect(m0.play).not.toHaveBeenCalled();
  });

  it("a tap on a genuinely playing video still pauses it", () => {
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={0} />);
    const [v0] = getVideos();
    const m0 = stubMedia(v0!, { play: () => Promise.resolve() });
    setMediaState(v0!, { paused: false, currentTime: 3.2, readyState: 4 });
    act(() => {
      v0!.dispatchEvent(new Event("playing"));
    });

    const overlay = document.querySelector("[data-psmi-tap-overlay]") as HTMLElement;
    const playCallsBefore = m0.play.mock.calls.length;
    act(() => {
      overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(m0.pause).toHaveBeenCalledTimes(1);
    expect(m0.play.mock.calls.length).toBe(playCallsBefore);
  });
});

// ---------------------------------------------------------------------------
// 4. AbortError is not an autoplay block
// ---------------------------------------------------------------------------

describe("play() rejection classification", () => {
  it("AbortError (self-interrupted play) does not flip UI to paused nor report blocked", async () => {
    const onAutoplayBlocked = vi.fn();
    render(
      <ImmersiveFeed
        items={items}
        initiallyOpen
        initialIndex={0}
        onAutoplayBlocked={onAutoplayBlocked}
      />,
    );
    const [v0] = getVideos();
    const err = new DOMException("interrupted by pause()", "AbortError");
    stubMedia(v0!, { play: () => Promise.reject(err) });
    setMediaState(v0!, { paused: true, currentTime: 0, readyState: 2 });

    // Re-trigger the play effect's attemptPlay via a canplay retry.
    await act(async () => {
      v0!.dispatchEvent(new Event("canplay"));
      await Promise.resolve();
    });

    expect(onAutoplayBlocked).not.toHaveBeenCalled();
    expect(document.querySelector(".psmi-delayed-show-fast")).toBeNull();
  });

  it("NotAllowedError still reports blocked and shows the tap-to-play glyph", async () => {
    const onAutoplayBlocked = vi.fn();
    render(
      <ImmersiveFeed
        items={items}
        initiallyOpen
        initialIndex={0}
        onAutoplayBlocked={onAutoplayBlocked}
      />,
    );
    const [v0] = getVideos();
    const err = new DOMException("denied", "NotAllowedError");
    stubMedia(v0!, { play: () => Promise.reject(err) });
    setMediaState(v0!, { paused: true, currentTime: 0, readyState: 2 });

    await act(async () => {
      v0!.dispatchEvent(new Event("canplay"));
      await Promise.resolve();
    });

    expect(onAutoplayBlocked).toHaveBeenCalled();
    // Even at currentTime===0, a definitively-blocked video must show the
    // glyph (pre-fix derivation mapped paused@0 to an infinite spinner).
    expect(document.querySelector(".psmi-delayed-show-fast")).not.toBeNull();
  });
});
