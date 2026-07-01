"use client";

import React, { forwardRef, useMemo } from "react";
import { Img } from "@page-speed/img";
import type { MediaItem } from "../types/index.js";
import { formatDuration } from "../utils/formatDuration.js";

/**
 * Preset thumbnail sizes.
 *
 * - `sm`  — 88px wide  (used in the "AI-generated reel" callout in the design)
 * - `md`  — 152px wide (used in the horizontal carousel row)
 * - `hero` — 200px wide (a heavier featured thumbnail)
 */
export type ThumbnailSize = "sm" | "md" | "hero" | number;

/**
 * Props for `<ThumbnailCard>`.
 *
 * The card renders a 9:16 poster with overlay chrome (badge, title, duration,
 * audio-bars glyph, progress hint). Tapping/clicking it calls `onOpen(item.id)`.
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
   * Hide the top-right muted-speaker icon. Useful for the small "AI-generated reel"
   * variant which shows only the audio-bars glyph.
   */
  hideMutedIcon?: boolean;
  /** Hide the bottom title/duration overlay. */
  hideCaption?: boolean;
  /** Hide the animated progress hint line at the bottom. */
  hideProgressHint?: boolean;
  /** Additional class name applied to the outer element. */
  className?: string;
  /** Additional inline style applied to the outer element. */
  style?: React.CSSProperties;
}

function resolveWidth(size: ThumbnailSize): number {
  if (typeof size === "number") return size;
  if (size === "sm") return 88;
  if (size === "hero") return 200;
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
      hideMutedIcon,
      hideCaption,
      hideProgressHint,
      className,
      style,
    },
    ref,
  ) {
    const width = resolveWidth(size);
    const radius = resolveBorderRadius(size);
    const durationLabel =
      item.durationLabel ??
      (item.durationMs != null ? formatDuration(item.durationMs) : "");

    const handleActivate = () => onOpen(item.id);

    // A single dependency-free memo to avoid recreating the outer style object on every render.
    const rootStyle = useMemo<React.CSSProperties>(
      () => ({
        position: "relative",
        flex: "none",
        width,
        aspectRatio: "9 / 16",
        borderRadius: radius,
        overflow: "hidden",
        cursor: "pointer",
        background: "#0e1526",
        boxShadow: "0 2px 10px rgba(16,24,40,0.14)",
        padding: 0,
        border: "none",
        color: "inherit",
        font: "inherit",
        ...style,
      }),
      [width, radius, style],
    );

    return (
      <button
        ref={ref}
        type="button"
        aria-label={`Play ${item.title}`}
        onClick={handleActivate}
        className={`psmi-card ${className ?? ""}`}
        style={rootStyle}
      >
        {/* Poster — @page-speed/img handles lazy loading + AVIF/WebP */}
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

        {/* Badge (top-left) */}
        {item.badge ? (
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
              background: "rgba(8,12,24,0.55)",
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

        {/* Muted-speaker icon (top-right) */}
        {hideMutedIcon ? null : (
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
        )}

        {/* Play-button hover reveal */}
        <span
          aria-hidden="true"
          className="psmi-play-hover"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(8,12,24,0)",
            transition: "background 0.2s",
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
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#182b4a" style={{ marginLeft: 2 }}>
              <path d="M7 5v14l12-7z" />
            </svg>
          </span>
        </span>

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
