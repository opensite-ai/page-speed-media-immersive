"use client";

import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Img } from "@page-speed/img";
import type { MediaItem } from "../types/index.js";
import { formatDuration } from "../utils/formatDuration.js";
import { prefersReducedMotion } from "../utils/prefersReducedMotion.js";
import { isImageItem } from "../utils/isImageItem.js";

/**
 * Preset thumbnail sizes.
 *
 * - `sm`  — 88px wide  (used in the "AI-generated reel" callout in the design)
 * - `md`  — 152px wide (used in the horizontal carousel row)
 * - `hero` — 200px wide (a heavier featured thumbnail)
 * - `ig`  — 264px wide (the Instagram-style feed tile — deliberately larger
 *   than the client-portal presets above so posters read like a social feed
 *   rather than a compact carousel)
 *
 * All presets render a vertical 9:16 tile; pass a raw pixel width for anything
 * in between.
 */
export type ThumbnailSize = "sm" | "md" | "hero" | "ig" | number;

/**
 * Props for `<ThumbnailCard>`.
 *
 * The card renders a 9:16 poster with overlay chrome (badge, title, duration,
 * audio-bars glyph, progress hint). Tapping/clicking it calls
 * `onOpen(item.id)`.
 *
 * The card is intentionally "dumb" — it does not know about feed state. When
 * rendered inside `<ImmersiveFeedProvider>` (or `<ImmersiveFeed>`), pass
 * `onOpen` = the provider's `open` function; otherwise supply your own.
 */
export interface ThumbnailCardProps {
  item: MediaItem;
  /** Called with the item id when the card is activated. */
  onOpen: (id: string) => void;
  /** Preset size, or a raw pixel width. Default `"md"`. */
  size?: ThumbnailSize;
  /**
   * Show the small muted-speaker icon in the top-right of the card.
   * Default in v0.2+: hidden. At thumbnail sizes, the audio-bars glyph in
   * the caption already communicates that video has sound; the extra icon
   * only adds noise. In v0.1 the icon was on by default (opt-out via
   * `hideMutedIcon`); that behavior can be restored with `showMutedIcon`.
   */
  showMutedIcon?: boolean;
  /**
   * @deprecated Prefer `showMutedIcon={false}` (which is now the default).
   * Retained for backwards compatibility with v0.1.x consumers. When
   * `showMutedIcon` is unset and `hideMutedIcon` is provided, the boolean
   * is inverted.
   */
  hideMutedIcon?: boolean;
  /** Hide the bottom title/duration overlay. */
  hideCaption?: boolean;
  /**
   * When provided, **replaces** the top-left badge chip entirely. Rendered in
   * the same top-left position but as an unstyled slot — the consumer owns all
   * of the pill's styling (background, padding, radius, colour). Used for the
   * IG-style like-count badge that supersedes the `item.badge` string chip.
   * When omitted, the built-in `item.badge` chip renders as before.
   */
  badgeSlot?: React.ReactNode;
  /**
   * Show the duration label in the caption overlay. Default `true`. When
   * `false`, the duration (whether from `item.durationLabel` or derived from
   * `item.durationMs`) and its audio-bars glyph are removed while the title is
   * KEPT — unlike `hideCaption`, which removes the whole overlay. Image items
   * never show a duration regardless of this flag.
   */
  showDuration?: boolean;
  /**
   * Controls when the center glyph (a play triangle for videos, an expand
   * icon for images) is shown.
   *
   * - `"always"` (default) — the pre-0.5 behavior: revealed on hover for
   *   pointer devices, always visible on touch devices.
   * - `"hover"` — hidden until the card is hovered (mouse) or focused
   *   (keyboard a11y). On touch devices (no hover) the glyph stays hidden and
   *   the whole card is the tap target.
   * - `"none"` — the glyph is never rendered.
   */
  glyphMode?: "always" | "hover" | "none";
  /** Hide the animated progress hint line at the bottom. */
  hideProgressHint?: boolean;
  /**
   * When true (default), the card plays a muted, looping preview of the
   * video instead of showing a static poster. Automatically disabled when
   * the user has `prefers-reduced-motion: reduce`, or when the item has no
   * video source. Falls back to `poster` in both cases.
   */
  autoplayPreview?: boolean;
  /**
   * Elevate the card with a stronger drop-shadow. Default `true`. Set false
   * for flat layouts or when the card is inside a container that already
   * provides elevation (e.g. the section-level "AI-generated reel" callout).
   */
  elevated?: boolean;
  /** Additional class name applied to the outer element. */
  className?: string;
  /** Additional inline style applied to the outer element. */
  style?: React.CSSProperties;
  /**
   * Extra props forwarded to the internal `@page-speed/img` `<Img>` that
   * renders the poster (the static-poster branch — not the autoplay-preview
   * `<video>`). Use this to pass consumer concerns such as `className`,
   * `optixFlowConfig`, `sizes`, `loading`, or `data-*` attributes down to the
   * image.
   *
   * These are spread onto the `<Img>` but the card retains ownership of the
   * load-bearing poster contract: `src` and `alt` (and the card's positioning
   * `style`) are always applied by the card and CANNOT be overridden here —
   * any `src`/`alt` keys passed in are ignored. A `style` passed here is
   * shallow-merged UNDER the card's own positioning style.
   */
  posterImgProps?: Record<string, unknown>;
}

function resolveWidth(size: ThumbnailSize): number {
  if (typeof size === "number") return size;
  if (size === "sm") return 88;
  if (size === "hero") return 200;
  if (size === "ig") return 264;
  return 152; // "md"
}

function resolveBorderRadius(size: ThumbnailSize): number {
  const w = resolveWidth(size);
  if (w <= 100) return 11;
  if (w <= 160) return 16;
  return 18;
}

/**
 * A single tappable thumbnail representing one MediaItem.
 */
export const ThumbnailCard = forwardRef<HTMLButtonElement, ThumbnailCardProps>(
  function ThumbnailCard(
    {
      item,
      onOpen,
      size = "md",
      showMutedIcon,
      hideMutedIcon,
      hideCaption,
      badgeSlot,
      showDuration = true,
      glyphMode = "always",
      hideProgressHint,
      autoplayPreview = true,
      elevated = true,
      className,
      style,
      posterImgProps,
    },
    ref,
  ) {
    const width = resolveWidth(size);
    const radius = resolveBorderRadius(size);
    // Image items are a static poster with no playback affordances: no video
    // preview, no audio-bars glyph, no duration, no mute icon. The center
    // glyph becomes an "expand" icon instead of a play triangle.
    const isImage = isImageItem(item);
    // Duration only applies to videos, and only when the consumer keeps it on.
    const durationLabel =
      isImage || !showDuration
        ? ""
        : (item.durationLabel ??
          (item.durationMs != null ? formatDuration(item.durationMs) : ""));

    // Decide the visual: autoplay preview (muted looping <video>) vs. static
    // poster (<Img>). Reasons we would NOT autoplay:
    //   1. The item is an image — `autoplayPreview` is a no-op, poster only.
    //   2. Consumer explicitly opted out via `autoplayPreview={false}`.
    //   3. User has `prefers-reduced-motion: reduce` (accessibility respect).
    //   4. Item has no video source to preview — poster is the only option.
    const videoSrc = isImage
      ? undefined
      : (item.src ?? item.masterPlaylistUrl ?? item.fallbackSrc ?? undefined);
    const wantsPreview =
      autoplayPreview && Boolean(videoSrc) && !prefersReducedMotion();

    // Glyph visibility for `glyphMode="hover"` is JS-driven so it is testable
    // and works for standalone cards (outside a <ThumbnailStrip> scope, where
    // the injected :hover stylesheet does not reach). `"always"` keeps the
    // legacy CSS-driven reveal; `"none"` renders no glyph at all.
    const [glyphHovered, setGlyphHovered] = useState(false);

    // Resolve mute-icon visibility. Both props are optional. When both are
    // omitted, the icon is hidden (new default). When `showMutedIcon` is
    // explicitly set it wins. Otherwise fall back to the inverted legacy
    // `hideMutedIcon` (undefined → hidden, false → shown, true → hidden).
    const muteIconVisible =
      showMutedIcon !== undefined
        ? showMutedIcon
        : hideMutedIcon === false;

    // Pause the preview when the card is scrolled out of view — matches
    // TikTok/Reels behavior on the web and avoids burning bandwidth on
    // off-screen previews. Only active when we're actually rendering the
    // <video>-preview branch.
    const videoRef = useRef<HTMLVideoElement | null>(null);
    useEffect(() => {
      if (!wantsPreview) return;
      const el = videoRef.current;
      if (!el) return;
      if (typeof IntersectionObserver === "undefined") {
        // Older browsers (or SSR shim): just try to play, don't fail hard.
        el.play().catch(() => {});
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          if (entry.isIntersecting) {
            el.play().catch(() => {
              // Browser refused autoplay (rare with muted=true). Non-fatal.
            });
          } else {
            el.pause();
          }
        },
        { threshold: 0.25 },
      );
      observer.observe(el);
      return () => observer.disconnect();
    }, [wantsPreview]);

    const handleActivate = () => onOpen(item.id);

    // Consumer-supplied poster <Img> props, sanitized. `src`/`alt` are owned
    // by the card (the poster contract) and stripped here so a consumer
    // cannot break them; everything else (className, optixFlowConfig, sizes,
    // loading, data-*, style, …) is forwarded onto the <Img>. A consumer
    // `style` is kept on the object but is shallow-merged UNDER the card's own
    // positioning style at the render site below.
    const safePosterImgProps = useMemo<Record<string, unknown> | undefined>(() => {
      if (!posterImgProps) return undefined;
      const next: Record<string, unknown> = { ...posterImgProps };
      delete next.src;
      delete next.alt;
      return next;
    }, [posterImgProps]);

    // A single memo to avoid recreating the outer style object on every render.
    const rootStyle = useMemo<React.CSSProperties>(
      () => ({
        position: "relative",
        // `flex: none` is inherited from the parent strip, but assert it
        // here too so the card renders correctly even when a consumer
        // places it outside the library's <ThumbnailStrip>.
        flex: "none",
        flexShrink: 0,
        width,
        aspectRatio: "9 / 16",
        borderRadius: radius,
        overflow: "hidden",
        cursor: "pointer",
        background: "#0e1526",
        boxShadow: elevated
          ? "0 6px 20px rgba(16, 24, 40, 0.24), 0 1px 3px rgba(16, 24, 40, 0.18)"
          : "0 1px 3px rgba(16, 24, 40, 0.14)",
        padding: 0,
        // A hairline outline in the same tone as the shadow gives the card
        // definition on light backgrounds without adding weight.
        border: "1px solid rgba(16, 24, 40, 0.08)",
        color: "inherit",
        font: "inherit",
        ...style,
      }),
      [width, radius, elevated, style],
    );

    return (
      <button
        ref={ref}
        type="button"
        aria-label={`${isImage ? "Expand" : "Play"} ${item.title}`}
        onClick={handleActivate}
        // Hover/focus only drives the glyph in `"hover"` mode. The pointer
        // guard keeps touch taps (pointerType "touch") from revealing it —
        // per the spec, on touch the whole card is the tap target and the
        // glyph stays hidden.
        onPointerEnter={
          glyphMode === "hover"
            ? (e) => {
                if (e.pointerType === "mouse") setGlyphHovered(true);
              }
            : undefined
        }
        onPointerLeave={
          glyphMode === "hover" ? () => setGlyphHovered(false) : undefined
        }
        // Focus reveals the glyph ONLY for keyboard focus (`:focus-visible`).
        // Touch taps also focus the button (per the pointer/focus spec), but
        // the "hover" contract says the glyph must stay hidden on touch — the
        // whole card is the tap target there. `:focus-visible` is the
        // browser's own "did this focus come from the keyboard?" signal, so
        // we gate on it. If the engine doesn't implement `:focus-visible`
        // (older jsdom/happy-dom), `matches` may throw or return false — in
        // that case we keep the glyph hidden.
        onFocus={
          glyphMode === "hover"
            ? (event) => {
                let focusVisible = false;
                try {
                  focusVisible =
                    event.currentTarget.matches?.(":focus-visible") ?? false;
                } catch {
                  focusVisible = false;
                }
                if (focusVisible) setGlyphHovered(true);
              }
            : undefined
        }
        onBlur={
          glyphMode === "hover" ? () => setGlyphHovered(false) : undefined
        }
        className={`psmi-card psmi-glyph-${glyphMode} ${className ?? ""}`}
        style={rootStyle}
      >
        {/*
          Media backdrop. In `autoplayPreview` mode we render a muted,
          looping, inline <video> so the thumbnail previews motion — the
          most obvious signal that this is a video (not just an image).
          Otherwise, static poster via @page-speed/img with lazy-load +
          AVIF/WebP negotiation.
        */}
        {wantsPreview && videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            poster={item.poster}
            muted
            loop
            playsInline
            // IntersectionObserver drives play/pause instead of `autoplay`
            // so off-screen cards don't burn bandwidth. When it enters the
            // viewport, the effect above calls .play().
            disablePictureInPicture
            preload="metadata"
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              pointerEvents: "none",
            }}
          />
        ) : (
          <Img
            // Consumer passthrough first so the card's own load-bearing props
            // (src/alt/aria-hidden and positioning style) always win below.
            {...(safePosterImgProps as React.ComponentProps<typeof Img>)}
            src={item.poster}
            // For image items the poster IS the content, so it carries the
            // item title as its accessible name; for video posters it stays
            // decorative (the <video> preview or the caption conveys meaning).
            alt={isImage ? item.title : ""}
            aria-hidden={isImage ? undefined : "true"}
            style={{
              // Consumer style merged UNDER the card's positioning contract.
              ...(safePosterImgProps?.style as React.CSSProperties | undefined),
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}

        {/* Bottom-half gradient scrim to keep the caption readable over
            bright frames of the video preview. Pointer-events-none so it
            doesn't intercept clicks. */}
        {!hideCaption && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "60%",
              background:
                "linear-gradient(180deg, rgba(5,7,13,0) 0%, rgba(5,7,13,0.55) 60%, rgba(5,7,13,0.85) 100%)",
              pointerEvents: "none",
            }}
          />
        )}

        {/*
          Top-left badge. `badgeSlot`, when provided, fully REPLACES the
          built-in chip — the wrapper only positions it (top-left); the
          consumer owns the pill's styling. Falls back to the `item.badge`
          string chip when no slot is passed.
        */}
        {badgeSlot !== undefined ? (
          <span
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            {badgeSlot}
          </span>
        ) : item.badge ? (
          <span
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(8,12,24,0.65)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              color: "#fff",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.07em",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--psmi-accent, #f39e1e)",
              }}
            />
            {item.badge}
          </span>
        ) : null}

        {/* Muted-speaker icon (top-right). Off by default — at this size
            the audio-bars glyph in the caption already conveys audio.
            Never drawn for image items (no audio affordances). */}
        {muteIconVisible && !isImage ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "rgba(8,12,24,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9H3v6h3l5 4z" />
              <line x1="22" y1="9" x2="16" y2="15" />
              <line x1="16" y1="9" x2="22" y2="15" />
            </svg>
          </span>
        ) : null}

        {/*
          Center glyph. The icon auto-selects by media kind: a play triangle
          for videos, an expand (maximize) icon for images.

          Visibility by `glyphMode`:
          - "none"   → not rendered at all.
          - "always" → legacy CSS-driven reveal (hover on pointer devices,
                       always-on for touch), no inline opacity so the injected
                       stylesheet owns it.
          - "hover"  → JS-driven (`glyphHovered`): hidden until mouse-hover or
                       keyboard focus; stays hidden on touch.
        */}
        {glyphMode === "none" ? null : (
          <span
            aria-hidden="true"
            className="psmi-play-hover"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                glyphMode === "hover"
                  ? glyphHovered
                    ? "rgba(8,12,24,0.32)"
                    : "rgba(8,12,24,0)"
                  : "rgba(8,12,24,0)",
              transition: "background 0.2s",
              pointerEvents: "none",
            }}
          >
            <span
              className="psmi-play-btn"
              style={{
                width: 46,
                height: 46,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.94)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
                // "hover" mode owns opacity/scale inline so it works even for
                // standalone cards outside a <ThumbnailStrip> scope (where the
                // scoped :hover stylesheet does not reach). "always" leaves
                // these unset so the legacy stylesheet drives the reveal.
                ...(glyphMode === "hover"
                  ? {
                      opacity: glyphHovered ? 1 : 0,
                      transform: glyphHovered ? "scale(1)" : "scale(0.7)",
                      transition:
                        "transform 0.22s cubic-bezier(0.2,0.8,0.3,1), opacity 0.2s ease",
                    }
                  : null),
              }}
            >
              {isImage ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#182b4a"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#182b4a" style={{ marginLeft: 2 }}>
                  <path d="M7 5v14l12-7z" />
                </svg>
              )}
            </span>
          </span>
        )}

        {/* Caption + duration */}
        {hideCaption ? null : (
          <span
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "10px 10px 11px",
              display: "block",
              textAlign: "left",
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: 11.5,
                fontWeight: 700,
                color: "#fff",
                lineHeight: 1.25,
                textShadow: "0 1px 4px rgba(0,0,0,0.45)",
              }}
            >
              {item.title}
            </span>
            {/*
              Audio-bars glyph + duration. Videos only — image items have no
              audio and no timeline, so the whole line is dropped for them.
              The duration text itself is further gated by `showDuration`
              (durationLabel is "" when that flag is false).
            */}
            {isImage ? null : (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 6,
                  color: "#fff",
                }}
              >
                <span className="psmi-eq" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                {durationLabel ? (
                  <span
                    style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.75)",
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    }}
                  >
                    {durationLabel}
                  </span>
                ) : null}
              </span>
            )}
            {hideProgressHint ? null : (
              <span
                aria-hidden="true"
                style={{
                  display: "block",
                  height: 2.5,
                  borderRadius: 2,
                  background: "rgba(255,255,255,0.25)",
                  marginTop: 8,
                  overflow: "hidden",
                }}
              />
            )}
          </span>
        )}
      </button>
    );
  },
);
