"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Video } from "@page-speed/video";
import { Img } from "@page-speed/img";
import type { ImmersiveAction, MediaItem } from "../types/index.js";
import { useImmersiveFeed, useActionContext } from "./ImmersiveFeedProvider.js";
import { ImmersivePortal } from "../portal/ImmersivePortal.js";
import { useScrollLock } from "../hooks/useScrollLock.js";
import { useVerticalPagerGestures } from "../hooks/useVerticalPagerGestures.js";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts.js";
import { prefersReducedMotion } from "../utils/prefersReducedMotion.js";
import { ImmersiveViewerHeader } from "./ImmersiveViewerHeader.js";
import { ImmersiveViewerActions } from "./ImmersiveViewerActions.js";
import { ImmersiveViewerCaption } from "./ImmersiveViewerCaption.js";

/**
 * Props for the fullscreen immersive viewer.
 *
 * The viewer draws its state from `<ImmersiveFeedProvider>`. Rendering
 * `<ImmersiveViewer />` when the provider's `isOpen` is `false` results in
 * a no-op — nothing is portalled to the DOM.
 */
export interface ImmersiveViewerProps {
  /** Brand label shown in the caption card (e.g. "Encapsa", "Carlos O'Brien's"). */
  brandName?: string;
  /** Custom brand icon; falls back to a generic sparkle. */
  brandIcon?: React.ReactNode;
  /** Custom mount container; defaults to document.body. */
  container?: HTMLElement | null;
  /** Aria label for the dialog. Default: `"Immersive video viewer"`. */
  ariaLabel?: string;
  /** Labels used in header controls (i18n). */
  labels?: {
    close?: string;
    soundOn?: string;
    muted?: string;
    swipeForNext?: string;
  };
  /** Custom header renderer. Advanced. */
  renderHeader?: (props: {
    activeIndex1Based: number;
    total: number;
    muted: boolean;
    onClose: () => void;
    onToggleMute: () => void;
  }) => React.ReactNode;
  /** Custom actions renderer. Advanced. */
  renderActions?: (props: {
    item: MediaItem;
    actions: ImmersiveAction[];
  }) => React.ReactNode;
  /** Custom caption renderer. Advanced. */
  renderCaption?: (item: MediaItem) => React.ReactNode;
  /** Show/hide the "Swipe for next" hint at the bottom. Default: true. */
  showSwipeHint?: boolean;
}

const TRANSITION_MS = 320;

// Start-of-playback watchdog tuning. After a page becomes active, the active
// video must reach REAL playback (currentTime advancing) within the initial
// window; otherwise the watchdog re-kicks it every retry window, and after
// the final retry it gives up and surfaces the tap-to-play glyph. Totals
// ~3.6s from swipe to honest give-up — long enough for a slow network,
// short enough that users are never stranded on a silent frozen frame.
const WATCHDOG_INITIAL_DELAY_MS = 900;
const WATCHDOG_RETRY_DELAY_MS = 900;
const WATCHDOG_MAX_RETRIES = 3;

/** True for the DOMException play() rejects with when the play request was
 *  interrupted by OUR OWN pause()/source churn (e.g. pausing the outgoing
 *  video mid-swipe). That is not an autoplay block — the browser never
 *  refused playback — so it must not flip the UI to "paused" nor fire the
 *  consumer's onAutoplayBlocked. */
function isSelfInterruptedPlay(err: unknown): boolean {
  return (err as DOMException | null)?.name === "AbortError";
}

/**
 * The fullscreen TikTok/Reels/Shorts-style vertical video viewer.
 *
 * Portals into `document.body` with a scoped CSS root so consumer styles do
 * not bleed in. Renders 3 videos at a time (previous, active, next), driven
 * by a transform-based pager with pointer gestures + keyboard controls.
 */
export function ImmersiveViewer({
  brandName,
  brandIcon,
  container,
  ariaLabel = "Immersive video viewer",
  labels,
  renderHeader,
  renderActions,
  renderCaption,
  showSwipeHint = true,
}: ImmersiveViewerProps) {
  const feed = useImmersiveFeed();
  const {
    items,
    activeIndex,
    isOpen,
    isMuted,
    actions,
    theme,
    close,
    next,
    prev,
    seek,
    setMuted,
    reportAutoplayBlocked,
  } = feed;
  const actionContext = useActionContext();

  const total = items.length;
  const activeItem = items[activeIndex];

  const [progress, setProgress] = useState(0); // 0..1
  const [swipeHintDismissed, setSwipeHintDismissed] = useState(false);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  // Monotonically increasing counter bumped every time a <video> element
  // callback-ref fires with a non-null element. The play effect below
  // reads this in its deps so it re-runs whenever a new video is
  // attached to the DOM — solving the race where the effect runs BEFORE
  // the wrapped <Video> component's inner element has been committed.
  const [videoAttachTick, setVideoAttachTick] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<Element | null>(null);
  const [supportsReducedMotion, setSupportsReducedMotion] = useState(false);

  useScrollLock(isOpen);

  useEffect(() => {
    setSupportsReducedMotion(prefersReducedMotion());
  }, [isOpen]);

  // Vertical pager gestures. Only active while open.
  const { offset, isDragging, containerRef } = useVerticalPagerGestures({
    itemCount: total,
    index: activeIndex,
    onCommit: (nextIndex) => {
      // Prime the incoming video INSIDE the pointerup call stack, before
      // React re-renders. On iOS WebKit the concurrent-decoder budget is
      // tiny and a play() issued later from a passive effect can be
      // accepted (paused flips false) yet never actually start. Claiming
      // the media slot synchronously at commit — via the guaranteed
      // muted-autoplay path — is what TikTok-style feeds do. The play
      // effect then sees !el.paused and leaves the element alone; the
      // `playing` listener restores the user's mute intent.
      const el = videoRefs.current.get(nextIndex);
      if (el && el.paused) {
        el.muted = true;
        el.setAttribute("muted", "");
        const p = el.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
      seek(nextIndex);
    },
    onDragStart: () => {
      // Pause active video briefly during drag to avoid audio "chirp" when it
      // transitions to another video mid-swipe.
      const el = videoRefs.current.get(activeIndex);
      if (el && !el.paused) el.pause();
    },
    onDragEnd: (committed) => {
      // On a committed swipe the NEW active video is already primed (see
      // onCommit) and owned by the play effect. Resuming here would play
      // the OUTGOING video (this closure's activeIndex is the pre-commit
      // one) just for the play effect to pause it again — an AbortError
      // play/pause burst on the media engine during every single swipe,
      // and a spurious autoplay-blocked report.
      if (committed) return;
      const el = videoRefs.current.get(activeIndex);
      if (el && el.paused && !userPausedRef.current && isOpen) {
        // Rejections here are either self-interruptions (another gesture
        // started) or covered by the watchdog below — stay quiet.
        el.play().catch(() => {});
      }
    },
  });
  const isDraggingRef = useRef(isDragging);
  isDraggingRef.current = isDragging;

  // Auto-dismiss swipe hint after first index change (user got the gesture).
  useEffect(() => {
    if (activeIndex > 0) setSwipeHintDismissed(true);
  }, [activeIndex]);
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => setSwipeHintDismissed(true), 4000);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Reset progress on active index change.
  useEffect(() => {
    setProgress(0);
  }, [activeIndex]);

  // Autoplay strategy — the hard problem this whole feature revolves around.
  //
  // Browser autoplay rules (Chrome/Safari/Firefox agree):
  //   1. play() on a muted <video> is unconditionally allowed.
  //   2. play() on an unmuted <video> is rejected unless that specific
  //      element was directly activated by a user gesture within a short
  //      window. On open(), the gesture landed on the thumbnail button
  //      — by the time this viewer mounts, the gesture has been consumed
  //      and cannot transfer to a freshly-mounted <video>.
  //   3. Once a media element has actually started playing (a `playing`
  //      event fires), subsequent programmatic .muted = false toggles are
  //      honored without a fresh gesture.
  //
  // What we do:
  //   * The <video> element in JSX renders with the hardcoded prop `muted`.
  //     React never touches DOM .muted after mount (no prop diff), so an
  //     imperative .muted = false will stick.
  //   * We call .play() from an effect AND schedule a second attempt on the
  //     next animation frame. Multiple play() calls are safe.
  //   * A `playing` event listener on the active video fires the moment the
  //     browser confirms real playback — that's when it's safe to unmute.
  //     We flip element.muted = isMuted (the consumer's intent).
  //
  // The provider's isMuted state ("what does the user want?") and the DOM
  // element's .muted flag ("what audio is coming out right now?") are kept
  // in sync via the `playing` listener plus the mute-toggle effect below.

  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // The user's explicit pause intent. Set only by the tap/space toggle;
  // cleared when they tap play again, when real playback starts, or when
  // the active page changes. The watchdog consults this so it never
  // auto-resumes a video the user paused on purpose.
  const userPausedRef = useRef(false);
  // Sticky "playback definitively failed" marker for the ACTIVE page: set
  // when play() rejects with a real policy error or when the watchdog
  // exhausts its retries. The playback-state derivation consults it so a
  // failed video shows the tap-to-play glyph even at currentTime === 0
  // (which would otherwise read as "buffering" — an infinite spinner).
  // The watchdog and the play effect's retries also consult it, so the
  // give-up verdict survives their re-runs (videoAttachTick bumps, SSE-
  // driven items churn) instead of oscillating glyph -> spinner -> glyph.
  const playFailedRef = useRef(false);
  // At most ONE onAutoplayBlocked report per page activation, no matter
  // how many retry surfaces (play effect, watchdog, tap) reach a verdict.
  const blockReportedRef = useRef(false);

  // Playback-state indicator source of truth. Users could not tell a paused
  // video from a buffering one (both were just a still frame), so taps that
  // paused playback read as "the video broke". Tracks the ACTIVE video's
  // real state via media events; drives the centered glyph/spinner overlay.
  //   "playing"   → no overlay (TikTok-style)
  //   "paused"    → large play glyph (tap anywhere resumes)
  //   "buffering" → spinner, delay-faded so it never flashes on fast loads
  const [playbackState, setPlaybackState] = useState<
    "playing" | "paused" | "buffering"
  >("buffering");

  // Fresh page (or fresh open) = fresh playback intent: forget any explicit
  // pause, failure verdict, and blocked-report from the previous page.
  useEffect(() => {
    userPausedRef.current = false;
    playFailedRef.current = false;
    blockReportedRef.current = false;
  }, [activeIndex, isOpen]);

  const reportBlockedOnce = useCallback(
    (item: MediaItem | undefined) => {
      if (!item || blockReportedRef.current) return;
      blockReportedRef.current = true;
      reportAutoplayBlocked(item);
    },
    [reportAutoplayBlocked],
  );

  // Effective muted = the DOM element's actual .muted value, not just the
  // provider's intent. When the browser rejects an unmute (media-engagement-
  // index below threshold, no prior user activation on the domain, etc.),
  // the provider says isMuted=false but the video is still audibly silent.
  // Showing the wrong state in the header confuses users. This state tracks
  // what the browser is actually doing so the header label matches reality.
  const [effectiveMuted, setEffectiveMuted] = useState(isMuted);

  // Play effect: fires on open + on every activeIndex change.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    // Pause every non-active video and rewind it. Elements are only
    // pruned lazily (we can't do it in the callback-ref cleanup path
    // without hitting the infinite-update loop described near the ref
    // definition), so also drop entries whose element is no longer in
    // the DOM to keep the map from accumulating stale references.
    for (const [idx, el] of videoRefs.current.entries()) {
      if (!el.isConnected) {
        videoRefs.current.delete(idx);
        continue;
      }
      if (idx !== activeIndex) {
        el.pause();
        try {
          el.currentTime = 0;
        } catch {
          // Some codecs reject seek pre-metadata; ignore.
        }
      }
    }
    const attemptPlay = () => {
      if (cancelled) return;
      // Never override an explicit user pause: the retry listeners below
      // (canplay/loadedmetadata) can fire AFTER the user paused — e.g. a
      // pause during initial buffering followed by late-arriving data —
      // and must not force the video (muted!) back to life.
      // Likewise, once this page's playback definitively failed, further
      // automatic attempts are pointless retry-storms (and duplicate
      // blocked reports); only a user tap (which clears the flag) or a
      // page change re-opens the attempt window.
      if (userPausedRef.current || playFailedRef.current) return;
      const el = videoRefs.current.get(activeIndex);
      if (!el) return;
      // If the element is already playing (or a play() call is in flight —
      // .paused flips false synchronously), there is nothing to start.
      // Crucially, we must NOT force .muted = true here: an already-playing
      // element never fires another `playing` event, so the mute-sync
      // listener would never run again and the force-mute would stick —
      // silencing live audio. This guard is what makes re-runs of this
      // effect (items identity changes from consumer re-renders, or
      // videoAttachTick bumps from neighbouring pages mounting) safe
      // while audio is on.
      if (!el.paused) return;
      // A video that finished normally rests on its end frame — replaying
      // it (muted, no less) on an effect re-run (items churn, attach tick,
      // late canplay) would be a surprise restart. Explicit navigation
      // still replays: leaving the page rewinds it, which clears `ended`.
      if (el.ended) return;
      // Belt-and-suspenders: JSX renders <video muted> but React sets DOM
      // property .muted only on mount, and browsers consult BOTH the
      // property AND the HTML attribute when applying autoplay policy.
      // Force both explicitly at play time so the muted-autoplay path is
      // guaranteed regardless of React's internal timing.
      el.muted = true;
      el.setAttribute("muted", "");
      const p = el.play();
      if (p && typeof p.catch === "function") {
        p.catch((err: unknown) => {
          // AbortError = we interrupted this play() ourselves (pausing the
          // outgoing video on swipe, watchdog re-kick, source churn). The
          // browser never REFUSED playback, so it is not a block: stay
          // quiet and let the retry paths finish the job. And once this
          // effect run is cancelled the verdict belongs to a page we've
          // already left — flagging it now would poison the NEW page's
          // freshly-reset refs.
          if (cancelled || isSelfInterruptedPlay(err)) return;
          // Surface the blocked state as "paused" so the centered play
          // glyph renders — a tap-to-play affordance instead of an
          // indefinite spinner (the video IS paused; a tap starts it).
          // The sticky flag keeps later sync() runs (attach ticks, SSE
          // re-renders) from re-deriving "buffering" off currentTime 0
          // and stops further automatic attempts from re-reporting.
          playFailedRef.current = true;
          reportBlockedOnce(items[activeIndex]);
          setPlaybackState("paused");
        });
      }
    };
    // First attempt: right now (refs are populated by callback-ref).
    attemptPlay();
    // Second attempt: next frame, in case React's DOM commit finalizes
    // property sync between now and the next paint.
    const raf = requestAnimationFrame(attemptPlay);
    // Third safety net: listen for canplay and loadedmetadata events on
    // the active video. These fire when the browser has enough data to
    // start playback; retrying .play() at that moment succeeds even if
    // the earlier attempts were rejected because the element wasn't yet
    // decode-ready. (This is exactly what native <video autoplay muted>
    // does under the hood.)
    const el = videoRefs.current.get(activeIndex);
    const onReadyForPlay = () => attemptPlay();
    if (el) {
      el.addEventListener("canplay", onReadyForPlay);
      el.addEventListener("loadedmetadata", onReadyForPlay);
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (el) {
        el.removeEventListener("canplay", onReadyForPlay);
        el.removeEventListener("loadedmetadata", onReadyForPlay);
      }
    };
    // videoAttachTick is in the deps so the effect re-runs the moment a
    // freshly-mounted <video> is attached to videoRefs. Without this, the
    // very first open() can miss the window: the effect fires before the
    // wrapped <Video>'s inner element callback-ref has been committed, so
    // videoRefs.current.get(activeIndex) returns undefined and neither the
    // immediate attempt, the rAF attempt, nor the canplay/loadedmetadata
    // listeners land — the video sits paused forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, isOpen, items, reportBlockedOnce, videoAttachTick]);

  // Mute-sync effect: attach a `playing` listener to the active video so
  // that when the browser confirms real playback (which grants media-
  // element activation), we flip DOM .muted to match the consumer's intent.
  //
  // Also fires on mute toggles — if the video is ALREADY playing we sync
  // immediately; otherwise the listener catches the next play event.
  useEffect(() => {
    if (!isOpen) return;
    const el = videoRefs.current.get(activeIndex);
    if (!el) return;

    const syncMuted = () => {
      const wantMuted = isMutedRef.current;
      el.muted = wantMuted;
      // Keep the HTML attribute in step with the property so browsers that
      // consult the attribute (e.g. for autoplay decisions on the next
      // navigation) don't disagree with the property.
      if (wantMuted) el.setAttribute("muted", "");
      else el.removeAttribute("muted");
    };

    // Immediate sync if the element is already playing.
    if (!el.paused && el.readyState >= 2) {
      syncMuted();
    }
    // Also sync on every future `playing` event (fires on initial play and
    // on any resume after pause/seek).
    el.addEventListener("playing", syncMuted);
    return () => {
      el.removeEventListener("playing", syncMuted);
    };
    // videoAttachTick in deps so this effect ALSO re-runs when the active
    // video is (re-)attached to the DOM — same reasoning as the play
    // effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMuted, activeIndex, isOpen, videoAttachTick]);

  // Playback-state sync effect: listen to the active video's media events
  // and mirror them into playbackState. Re-runs on active-video swaps
  // (activeIndex / videoAttachTick) so the listeners always track the
  // element the user is actually watching.
  useEffect(() => {
    if (!isOpen) return;
    const el = videoRefs.current.get(activeIndex);
    if (!el) {
      setPlaybackState("buffering");
      return;
    }
    const sync = () => {
      if (el.paused) {
        // An explicit user pause or a definitive playback failure always
        // reads as "paused" (glyph) — even at currentTime 0, which would
        // otherwise be mistaken for "still spinning up" and render an
        // infinite spinner over a video that will never start by itself.
        if (userPausedRef.current || playFailedRef.current) {
          setPlaybackState("paused");
          return;
        }
        // currentTime > 0 = genuinely paused mid-video (show the glyph).
        // currentTime === 0 with low readiness = still spinning up (spinner).
        setPlaybackState(
          el.currentTime > 0 && el.readyState >= 2 ? "paused" : "buffering",
        );
      } else {
        setPlaybackState(el.readyState >= 3 ? "playing" : "buffering");
      }
    };
    sync();
    const onPlaying = () => {
      // Real playback reached — any pause intent or failure verdict is over.
      userPausedRef.current = false;
      playFailedRef.current = false;
      setPlaybackState("playing");
    };
    const onWaiting = () => setPlaybackState("buffering");
    el.addEventListener("playing", onPlaying);
    el.addEventListener("pause", sync);
    el.addEventListener("waiting", onWaiting);
    return () => {
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("pause", sync);
      el.removeEventListener("waiting", onWaiting);
    };
    // videoAttachTick re-binds listeners when the element is (re-)attached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, isOpen, videoAttachTick]);

  // Start-of-playback watchdog. The autoplay pipeline above is event-driven
  // (canplay / loadedmetadata retries), which has a blind spot on mobile
  // WebKit: play() can be ACCEPTED (el.paused flips false) while the media
  // engine never actually starts — no `playing`, no `pause`, and, because
  // the wrapped <video> uses <source> children, no promise rejection
  // either. The element sits frozen at currentTime 0 and every listener
  // stays silent, so pre-0.4.1 the UI showed a bare frozen frame forever.
  // The watchdog is the liveness check the events can't provide: if the
  // active video hasn't reached REAL playback (currentTime advancing)
  // within the window, re-kick it through the muted-autoplay path a few
  // times, showing the buffering spinner meanwhile; when the retries are
  // exhausted, give up honestly — tap-to-play glyph + onAutoplayBlocked.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    let retries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastTime = -1;

    const arm = (ms: number) => {
      if (cancelled) return;
      timer = setTimeout(check, ms);
    };

    const check = () => {
      if (cancelled) return;
      const el = videoRefs.current.get(activeIndex);
      // No element yet: the attach-tick dep re-runs this effect when one
      // arrives. Never fight an explicit user pause, and never re-open a
      // verdict this page already reached (attach-tick re-runs reset the
      // local retry budget, but the give-up must stay terminal or the UI
      // oscillates glyph -> spinner -> glyph on every neighbor mount).
      if (!el || userPausedRef.current || playFailedRef.current) return;
      // A video that finished normally is a healthy terminal state, not a
      // stall — play() on an ended element would seek to 0 and silently
      // REPLAY it (muted!). Leave it resting on its end frame.
      if (el.ended) return;
      // Mid-gesture the pager owns playback (it pauses on drag start);
      // check again once the finger lifts.
      if (isDraggingRef.current) {
        arm(WATCHDOG_RETRY_DELAY_MS);
        return;
      }
      const advancing =
        !el.paused && el.currentTime > 0 && el.currentTime !== lastTime;
      if (advancing) return; // Healthy: real playback reached. Disarm.
      if (retries >= WATCHDOG_MAX_RETRIES) {
        if (el.readyState >= 2) {
          // Data is there but the engine won't start: a tap WILL fix it.
          // Definitive give-up — honest tap-to-play glyph (never an
          // infinite spinner / silent frozen frame) + one consumer report.
          playFailedRef.current = true;
          setPlaybackState("paused");
          reportBlockedOnce(itemsRef.current[activeIndex]);
        }
        // readyState < 2 = the data genuinely hasn't arrived — a slow
        // network, not a block. A tap couldn't render frames either, so
        // the spinner stays (it is the truth) and the play effect's
        // canplay/loadedmetadata listeners own the recovery from here.
        return;
      }
      retries += 1;
      lastTime = el.currentTime;
      // Honest interim state: we are working on it, show the spinner.
      setPlaybackState("buffering");
      try {
        // A wedged pending play() only resets via pause(); the fresh
        // muted play() then re-enters the guaranteed-allowed autoplay
        // path. The `playing` listener restores the user's mute intent.
        if (!el.paused) el.pause();
        el.muted = true;
        el.setAttribute("muted", "");
        const p = el.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {
        // ignore — next tick re-evaluates
      }
      arm(WATCHDOG_RETRY_DELAY_MS);
    };

    arm(WATCHDOG_INITIAL_DELAY_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // videoAttachTick re-arms the watchdog when the element is (re-)attached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, isOpen, videoAttachTick, reportBlockedOnce]);

  // Track the ACTUAL DOM .muted state of the active video and expose it as
  // effectiveMuted for the header. Fires on:
  //   - volumechange: the canonical event when .muted flips (either from
  //     our code, from browser policy, or from the user pressing OS keys).
  //   - playing: covers the initial-play case where volumechange may not
  //     fire cleanly on some browsers.
  //   - activeIndex change: syncs when the active video swaps out from
  //     under us.
  useEffect(() => {
    if (!isOpen) return;
    const el = videoRefs.current.get(activeIndex);
    if (!el) return;
    const sync = () => setEffectiveMuted(el.muted);
    // Initial read — the play/mute-sync effects may have already flipped
    // the flag before we got here.
    sync();
    el.addEventListener("volumechange", sync);
    el.addEventListener("playing", sync);
    return () => {
      el.removeEventListener("volumechange", sync);
      el.removeEventListener("playing", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, isOpen, videoAttachTick]);

  // togglePlayPauseActive is declared below alongside the click handler; the
  // spacebar shortcut reads from a ref to keep the deps list stable.
  const togglePlayPauseActiveRef = useRef<() => void>(() => {});

  useKeyboardShortcuts(
    {
      Escape: (e) => {
        e.preventDefault();
        close();
      },
      ArrowDown: (e) => {
        e.preventDefault();
        next();
      },
      ArrowRight: (e) => {
        e.preventDefault();
        next();
      },
      ArrowUp: (e) => {
        e.preventDefault();
        prev();
      },
      ArrowLeft: (e) => {
        e.preventDefault();
        prev();
      },
      " ": (e) => {
        e.preventDefault();
        togglePlayPauseActiveRef.current();
      },
      m: (e) => {
        e.preventDefault();
        setMuted((mu) => !mu);
      },
      M: (e) => {
        e.preventDefault();
        setMuted((mu) => !mu);
      },
    },
    isOpen,
  );

  // Focus management: save previous focus, focus close button on open, restore on close.
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = typeof document !== "undefined" ? document.activeElement : null;
    // Focus the root so keyboard events land here. `tabIndex=-1` lets us programmatically focus it.
    const t = setTimeout(() => {
      rootRef.current?.focus();
    }, 0);
    return () => {
      clearTimeout(t);
      const prevEl = previouslyFocusedRef.current;
      if (prevEl && "focus" in prevEl && typeof (prevEl as HTMLElement).focus === "function") {
        try {
          (prevEl as HTMLElement).focus();
        } catch {
          // ignore
        }
      }
    };
  }, [isOpen]);

  const handleTimeUpdate = useCallback(
    (idx: number) => (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (idx !== activeIndex) return;
      const el = e.currentTarget;
      const d = el.duration;
      if (Number.isFinite(d) && d > 0) {
        setProgress(el.currentTime / d);
      }
    },
    [activeIndex],
  );

  const handleEnded = useCallback(
    (idx: number) => () => {
      if (idx !== activeIndex) return;
      if (activeIndex < total - 1) next();
    },
    [activeIndex, next, total],
  );

  // Tap on video area toggles play/pause. Ignore taps that are part of a drag
  // gesture (measured against the same 6px threshold below). We track
  // pointerdown position on the *video element itself* rather than the outer
  // section so ancestor click handlers, pager gesture logic, or other pages
  // in the render window cannot see or react to the tap.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const handleVideoPointerDown = useCallback((e: React.PointerEvent) => {
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const togglePlayPauseActive = useCallback(() => {
    const el = videoRefs.current.get(activeIndex);
    if (!el) return;
    // A wedged pending play() leaves paused === false while nothing has
    // ever rendered (currentTime stuck at 0) — the user sees a stalled
    // video, and their tap must START it. Pre-0.4.1 this keyed off
    // el.paused alone, so that tap silently "paused" the zombie and a
    // second tap was needed. currentTime > 0 = frames have demonstrably
    // rendered, so the tap is an intentional pause — honored even during
    // a transient mid-play rebuffer (paused === false, spinner showing).
    const genuinelyPlaying = !el.paused && el.currentTime > 0;
    if (genuinelyPlaying) {
      userPausedRef.current = true;
      el.pause();
      return;
    }
    userPausedRef.current = false;
    playFailedRef.current = false;
    try {
      // Reset a wedged pending play() so the fresh gesture-backed play()
      // below starts from a clean request.
      if (!el.paused) el.pause();
    } catch {
      // ignore
    }
    el.play().catch((err: unknown) => {
      if (isSelfInterruptedPlay(err)) return;
      reportBlockedOnce(activeItem);
    });
  }, [activeIndex, activeItem, reportBlockedOnce]);
  // Keep the keyboard-shortcut ref pointing at the latest instance.
  togglePlayPauseActiveRef.current = togglePlayPauseActive;
  const handleVideoClick = useCallback(
    (e: React.MouseEvent) => {
      // Prevent the click from bubbling to the pager container or reaching
      // any nested chrome (actions rail, caption, etc.). Only the video body
      // itself should ever trigger a play/pause toggle.
      e.stopPropagation();
      const start = dragStartRef.current;
      dragStartRef.current = null;
      if (start) {
        const dx = Math.abs(e.clientX - start.x);
        const dy = Math.abs(e.clientY - start.y);
        // 10px matches the pager's intent-lock slop: any movement small
        // enough that the pager didn't treat it as a drag counts as a tap
        // (thumbs wobble); anything at or past the pager's threshold never
        // toggles playback.
        if (dx > 10 || dy > 10) return; // Was a drag, not a tap.
      }
      togglePlayPauseActive();
    },
    [togglePlayPauseActive],
  );

  // Determine which pages to render (virtualization window).
  const renderWindow = useMemo(() => {
    const out: number[] = [];
    for (let i = Math.max(0, activeIndex - 1); i <= Math.min(total - 1, activeIndex + 1); i++) {
      out.push(i);
    }
    return out;
  }, [activeIndex, total]);

  if (!isOpen || total === 0 || !activeItem) return null;

  const trackTransform = `translate3d(0, ${-activeIndex * 100}dvh, 0) translate3d(0, ${offset}px, 0)`;

  return (
    <ImmersivePortal container={container} theme={theme} ariaLabel={ariaLabel}>
      {/* Root dialog */}
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className="psmi-fade-in"
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--psmi-viewer-bg, #05070d)",
          overflow: "hidden",
          outline: "none",
        }}
      >
        {/* Gesture-capturing pager container */}
        <div
          ref={containerRef}
          className="psmi-scrollhide"
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            // The viewer is a fullscreen modal and owns EVERY touch gesture.
            // This must be "none", not "pan-y": pan-y tells the browser IT
            // may handle vertical pans, so on touch devices the browser
            // claimed vertical swipes for (scroll-locked, no-op) scrolling
            // and fired pointercancel — killing the pager mid-gesture.
            // Users' swipes died, and their retry taps toggled play/pause
            // instead. With "none" the pointer stream always reaches the
            // pager engine, matching TikTok/Reels swipe behavior.
            touchAction: "none",
            overscrollBehavior: "contain",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              transform: trackTransform,
              transition: isDragging || supportsReducedMotion
                ? "none"
                : `transform ${TRANSITION_MS}ms cubic-bezier(0.2, 0.8, 0.3, 1)`,
              willChange: "transform",
            }}
          >
            {renderWindow.map((idx) => {
              const item = items[idx]!;
              const isActive = idx === activeIndex;
              return (
                <section
                  key={item.id}
                  aria-hidden={!isActive}
                  data-psmi-index={idx}
                  style={{
                    position: "absolute",
                    top: `${idx * 100}dvh`,
                    left: 0,
                    right: 0,
                    height: "100dvh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: isActive ? 1 : 0.32,
                    transition: `opacity ${TRANSITION_MS}ms ease`,
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      height: "100%",
                      width: "100%",
                      // Constrain to 9:16 on wide viewports; letterboxed with viewerBg.
                      maxWidth: "calc(100dvh * 9 / 16)",
                      margin: "0 auto",
                      overflow: "hidden",
                      background: "#000",
                    }}
                  >
                    {/* Poster while video loads */}
                    <Img
                      src={item.poster}
                      alt=""
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                    {/* Actual video — @page-speed/video handles HLS + mp4 fallback */}
                    <Video
                      src={item.src}
                      masterPlaylistUrl={item.masterPlaylistUrl}
                      fallbackSrc={item.fallbackSrc}
                      poster={item.poster}
                      preferNativeControls={false}
                      playsInline
                      // Always mount muted so muted-autoplay is guaranteed;
                      // the play/unmute effect above flips the DOM element's
                      // .muted flag imperatively after the initial play
                      // succeeds. Rendering `muted={isMuted}` here would
                      // cause NotAllowedError on open() when isMuted=false.
                      muted
                      loop={false}
                      preload={isActive ? "auto" : "metadata"}
                      onEnded={handleEnded(idx)}
                      onTimeUpdate={handleTimeUpdate(idx)}
                      ref={(el: HTMLVideoElement | null) => {
                        // React re-invokes inline callback refs on every
                        // render (destroy-with-null, then attach-with-el).
                        // We intentionally do NOT delete on null — that
                        // path fires between every commit even when the
                        // element is unchanged. The map is only cleaned
                        // up when the section actually leaves the render
                        // window (unmount runs its own null cleanup that
                        // we compare below).
                        if (!el) return;
                        const prev = videoRefs.current.get(idx);
                        if (prev === el) return;
                        videoRefs.current.set(idx, el);
                        // Element identity changed — a new <video> was
                        // attached at this index. Notify the play effect.
                        setVideoAttachTick((n) => n + 1);
                      }}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        background: "#000",
                      }}
                    />
                    {/* Gradient scrim */}
                    <div
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        background:
                          "linear-gradient(180deg,rgba(5,7,13,0.5) 0%,rgba(5,7,13,0) 22%,rgba(5,7,13,0) 55%,rgba(5,7,13,0.72) 100%)",
                      }}
                    />
                    {/*
                      Click/tap target overlay.
                      Sits above the <Video>, below the actions rail, caption,
                      and header (those have higher zIndex). Only the ACTIVE
                      page gets an interactive overlay — inactive pages ignore
                      clicks so they can never accidentally toggle a hidden
                      video or interfere with page navigation. Placed inside
                      the viewport (not the outer section) so the pager's
                      gesture container sees no click events from this layer,
                      guaranteeing a click can never be interpreted as a
                      pager commit.
                    */}
                    {isActive && (
                      <div
                        aria-hidden="true"
                        data-psmi-tap-overlay=""
                        onPointerDown={handleVideoPointerDown}
                        onClick={handleVideoClick}
                        style={{
                          position: "absolute",
                          inset: 0,
                          zIndex: 1,
                          cursor: "pointer",
                          background: "transparent",
                        }}
                      />
                    )}
                    {/*
                      Playback-state indicator (visual only — the tap overlay
                      above is the interactive surface, so pointerEvents:none
                      here keeps a single toggle path). Hidden while dragging:
                      the pager pauses the video mid-swipe and the glyph
                      would flicker. TikTok-style: nothing while playing, a
                      large play glyph while paused, a delayed spinner while
                      buffering so paused ≠ "is it broken?".
                    */}
                    {isActive && !isDragging && playbackState === "paused" && (
                      <div
                        aria-hidden="true"
                        className="psmi-delayed-show-fast"
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          zIndex: 2,
                          pointerEvents: "none",
                        }}
                      >
                        <span
                          style={{
                            width: 76,
                            height: 76,
                            borderRadius: "50%",
                            background: "rgba(8,12,24,0.55)",
                            backdropFilter: "blur(6px)",
                            WebkitBackdropFilter: "blur(6px)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <svg
                            width="34"
                            height="34"
                            viewBox="0 0 24 24"
                            fill="#fff"
                            style={{ marginLeft: 4 }}
                          >
                            <path d="M8 5.5v13l11-6.5z" />
                          </svg>
                        </span>
                      </div>
                    )}
                    {isActive && !isDragging && playbackState === "buffering" && (
                      <div
                        aria-hidden="true"
                        className="psmi-delayed-show"
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          zIndex: 2,
                          pointerEvents: "none",
                        }}
                      >
                        <span
                          className="psmi-spinner"
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: "50%",
                            border: "3px solid rgba(255,255,255,0.25)",
                            borderTopColor: "#fff",
                          }}
                        />
                      </div>
                    )}
                    {/*
                      Badge (top-left, inside the 9:16 viewport).
                      Aligned to the same 16px inset as the caption/left rail
                      so the top and left gutters match visually. The top
                      chrome (close button, mute pill) lives *outside* the
                      9:16 viewport on wide viewports (letterboxed) or
                      overlaps at higher zIndex on mobile, so the badge does
                      not collide with it.
                    */}
                    {item.badge ? (
                      <div
                        // Hidden on mobile (≤540px): the close button owns
                        // that corner there. The caption renders a
                        // .psmi-badge-inline twin between the brand row and
                        // the title instead. See the scoped stylesheet.
                        className="psmi-badge-top"
                        style={{
                          position: "absolute",
                          top: 16,
                          left: 16,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 10px",
                          borderRadius: 999,
                          background: "rgba(8,12,24,0.5)",
                          backdropFilter: "blur(6px)",
                          WebkitBackdropFilter: "blur(6px)",
                          zIndex: 2,
                          pointerEvents: "none",
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "var(--psmi-accent, #f39e1e)",
                          }}
                        />
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.07em",
                            color: "#fff",
                          }}
                        >
                          {item.badge}
                        </span>
                      </div>
                    ) : null}

                    {/* Right-side actions (only draw on active page) */}
                    {isActive && actions.length > 0 && (
                      renderActions ? (
                        <>{renderActions({ item, actions })}</>
                      ) : (
                        <ImmersiveViewerActions
                          item={item}
                          actions={actions}
                          context={actionContext}
                        />
                      )
                    )}

                    {/* Caption (only draw on active page) */}
                    {isActive && (
                      renderCaption ? (
                        <>{renderCaption(item)}</>
                      ) : (
                        <ImmersiveViewerCaption
                          item={item}
                          brandName={brandName}
                          brandIcon={brandIcon}
                          hasActionsRail={actions.length > 0}
                        />
                      )
                    )}

                    {/* Progress bar (bottom edge, active only) */}
                    {isActive && (
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: 3,
                          background: "rgba(255,255,255,0.2)",
                          zIndex: 2,
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.round(progress * 100)}%`,
                            background: "#fff",
                            transition: isDragging ? "none" : "width 120ms linear",
                          }}
                        />
                      </div>
                    )}

                    {/*
                      Media counter ("3 / 7") — bottom-right of the viewport,
                      above the progress bar. Hidden on narrow (mobile)
                      viewports via `.psmi-counter` in the scoped stylesheet:
                      on phones the position indicator is redundant with the
                      swipe hint and eats vertical caption space.
                    */}
                    {isActive && total > 1 && (
                      <div
                        className="psmi-counter"
                        aria-live="polite"
                        style={{
                          position: "absolute",
                          right: 12,
                          bottom: 14,
                          zIndex: 2,
                          padding: "3px 10px",
                          borderRadius: 999,
                          background: "rgba(8,12,24,0.55)",
                          backdropFilter: "blur(6px)",
                          WebkitBackdropFilter: "blur(6px)",
                          color: "var(--psmi-chrome-fg, #fff)",
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.02em",
                          pointerEvents: "none",
                        }}
                      >
                        {activeIndex + 1}
                        <span style={{ color: "rgba(255,255,255,0.55)" }}>
                          {" / "}
                          {total}
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        {/*
          Header (top chrome).
          We pass `effectiveMuted` (the DOM element's real .muted state)
          rather than the provider's isMuted intent, so the label matches
          what the user actually hears — even if the browser overrode our
          requested state (e.g. rejected an unmute for policy reasons).

          onToggleMute uses effectiveMuted as its source of truth too, so
          clicking the button reliably flips whatever the current audio
          state actually is, not what the provider thinks it should be.
        */}
        {renderHeader
          ? renderHeader({
              activeIndex1Based: activeIndex + 1,
              total,
              muted: effectiveMuted,
              onClose: close,
              onToggleMute: () => {
                const target = !effectiveMuted;
                setMuted(target);
                // Also flip the DOM immediately in case the mute-sync effect
                // is waiting for a `playing` event that isn't imminent.
                const el = videoRefs.current.get(activeIndex);
                if (el) {
                  el.muted = target;
                  if (target) el.setAttribute("muted", "");
                  else el.removeAttribute("muted");
                  setEffectiveMuted(el.muted);
                }
              },
            })
          : (
            <ImmersiveViewerHeader
              activeIndex1Based={activeIndex + 1}
              total={total}
              muted={effectiveMuted}
              onClose={close}
              onToggleMute={() => {
                const target = !effectiveMuted;
                setMuted(target);
                const el = videoRefs.current.get(activeIndex);
                if (el) {
                  el.muted = target;
                  if (target) el.setAttribute("muted", "");
                  else el.removeAttribute("muted");
                  setEffectiveMuted(el.muted);
                }
              }}
              labels={labels}
            />
          )}

        {/*
          Desktop up/down chevrons.
          A pair of circular buttons on the right side of the screen so
          mouse users can page through videos without hunting for scroll-
          wheel behavior. Hidden on touch-only devices via the `.psmi-
          chevrons` scoped rule in the stylesheet — phones use swipe.
          Individually disabled at the ends of the list.
        */}
        <div
          className="psmi-chevrons"
          role="group"
          aria-label="Video pager"
          style={{
            position: "absolute",
            top: "50%",
            right: 24,
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            zIndex: 3,
          }}
        >
          <button
            type="button"
            onClick={prev}
            disabled={activeIndex === 0}
            aria-label="Previous video"
            style={{
              width: 40,
              height: 40,
              border: "none",
              borderRadius: "50%",
              background: "var(--psmi-chrome-bg, rgba(255,255,255,0.16))",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              color: "var(--psmi-chrome-fg, #fff)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: activeIndex === 0 ? "default" : "pointer",
              opacity: activeIndex === 0 ? 0.35 : 1,
              transition: "opacity 0.15s ease",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={next}
            disabled={activeIndex >= total - 1}
            aria-label="Next video"
            style={{
              width: 40,
              height: 40,
              border: "none",
              borderRadius: "50%",
              background: "var(--psmi-chrome-bg, rgba(255,255,255,0.16))",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              color: "var(--psmi-chrome-fg, #fff)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: activeIndex >= total - 1 ? "default" : "pointer",
              opacity: activeIndex >= total - 1 ? 0.35 : 1,
              transition: "opacity 0.15s ease",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        {/* Swipe-for-next hint */}
        {showSwipeHint && !swipeHintDismissed && activeIndex < total - 1 && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 3,
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "rgba(255,255,255,0.55)",
              fontSize: 11,
              pointerEvents: "none",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
            {labels?.swipeForNext ?? "Swipe for next"}
          </div>
        )}
      </div>
    </ImmersivePortal>
  );
}
