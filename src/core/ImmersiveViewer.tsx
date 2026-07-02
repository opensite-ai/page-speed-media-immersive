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
    onCommit: seek,
    onDragStart: () => {
      // Pause active video briefly during drag to avoid audio "chirp" when it
      // transitions to another video mid-swipe.
      const el = videoRefs.current.get(activeIndex);
      if (el && !el.paused) el.pause();
    },
    onDragEnd: () => {
      const el = videoRefs.current.get(activeIndex);
      if (el && el.paused && isOpen) {
        el.play().catch(() => {
          if (activeItem) reportAutoplayBlocked(activeItem);
        });
      }
    },
  });

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

  // Enforce play/pause invariant: only the active video plays. Reset others'
  // currentTime to 0.
  //
  // Autoplay policy handling (Chrome/Safari/Firefox all agree):
  //   - .play() on an unmuted <video> is rejected unless the element itself
  //     was directly activated by a user gesture. On open(), the gesture is
  //     on the thumbnail button — by the time this effect fires and the
  //     <video> is mounted, the gesture has been consumed and the browser
  //     will reject unmuted play with NotAllowedError.
  //   - .play() on a muted <video> is unconditionally allowed.
  //   - Once a play() promise resolves on a media element, subsequent
  //     programmatic .muted = false toggles are honored without a fresh
  //     gesture (the media element inherits the tab's activation state).
  //
  // Strategy: force the element to `muted=true` before calling .play(),
  // then after the promise resolves, sync it to the consumer's requested
  // muted state (`isMuted`). Transparent to the user — the video fades in
  // already playing, and audio comes on within one animation frame.
  //
  // A separate effect below keeps element.muted in sync with isMuted when
  // the user toggles the header mute button after the initial play.
  useEffect(() => {
    if (!isOpen) return;
    for (const [idx, el] of videoRefs.current.entries()) {
      if (idx === activeIndex) {
        // Start the play cycle muted so autoplay is guaranteed.
        el.muted = true;
        const p = el.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            // Sync to consumer's requested muted state after play succeeds.
            // Reads from a ref so this effect doesn't re-fire on every
            // mute toggle — mute changes are handled by the effect below.
            el.muted = isMutedRef.current;
          }).catch(() => {
            const item = items[idx];
            if (item) reportAutoplayBlocked(item);
          });
        } else {
          // Legacy return value — assume success synchronously.
          el.muted = isMutedRef.current;
        }
      } else {
        el.pause();
        try {
          el.currentTime = 0;
        } catch {
          // Some formats reject seek before metadata loads — safe to ignore.
        }
      }
    }
    // isMuted intentionally omitted — mute changes are handled separately
    // and this effect should not restart playback on toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, isOpen, items, reportAutoplayBlocked]);

  // Latest-ref for isMuted so the play effect above can read the freshest
  // value inside its play() promise without depending on it.
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  // Mute-sync effect: keep the active video element's .muted attribute in
  // sync with the provider state without restarting playback. Runs on both
  // active-index changes (new active video may need its muted flag synced)
  // and on mute-toggle.
  useEffect(() => {
    if (!isOpen) return;
    const el = videoRefs.current.get(activeIndex);
    if (!el) return;
    // Only sync if the initial play has already happened (readyState >= 2
    // means the browser has current data and playback is viable). Before
    // that, the play effect above owns the muted flag.
    if (el.readyState >= 2) {
      el.muted = isMuted;
    }
  }, [isMuted, activeIndex, isOpen]);

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
    if (el.paused) {
      el.play().catch(() => {
        if (activeItem) reportAutoplayBlocked(activeItem);
      });
    } else {
      el.pause();
    }
  }, [activeIndex, activeItem, reportAutoplayBlocked]);
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
        if (dx > 6 || dy > 6) return; // Was a drag, not a tap.
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
            touchAction: "pan-y",
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
                        if (el) videoRefs.current.set(idx, el);
                        else videoRefs.current.delete(idx);
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

        {/* Header (top chrome) */}
        {renderHeader
          ? renderHeader({
              activeIndex1Based: activeIndex + 1,
              total,
              muted: isMuted,
              onClose: close,
              onToggleMute: () => setMuted((m) => !m),
            })
          : (
            <ImmersiveViewerHeader
              activeIndex1Based={activeIndex + 1}
              total={total}
              muted={isMuted}
              onClose={close}
              onToggleMute={() => setMuted((m) => !m)}
              labels={labels}
            />
          )}

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
