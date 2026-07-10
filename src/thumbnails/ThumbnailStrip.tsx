"use client";

import React from "react";
import type { MediaItem } from "../types/index.js";
import { ThumbnailCard } from "./ThumbnailCard.js";
import type { ThumbnailSize } from "./ThumbnailCard.js";
import { useImmersiveFeed } from "../core/ImmersiveFeedProvider.js";

/**
 * Horizontal snap-scrolling row of `<ThumbnailCard>`s.
 *
 * Two modes:
 *
 * 1. **Provider-connected (default).** When rendered inside
 *    `<ImmersiveFeedProvider>` or `<ImmersiveFeed>`, `items` and `onOpen`
 *    are derived from feed state.
 *
 * 2. **Standalone.** Pass `items` and `onOpen` explicitly. Useful when the
 *    strip renders in a completely different part of the tree from the
 *    fullscreen viewer, or when using multiple independent feeds on one
 *    page.
 *
 * All layout-critical styles are applied inline so the strip renders
 * correctly on first paint, even before the library's scoped stylesheet
 * has been injected (which only happens when <ImmersivePortal> first
 * mounts). Previously the flex/scroll-snap rules lived only in the
 * stylesheet, so the strip fell back to normal block layout and
 * cards wrapped to a grid until the user opened and closed a video.
 */
export interface ThumbnailStripProps {
  /** Override items shown. Defaults to items from the surrounding provider. */
  items?: MediaItem[];
  /** Override open handler. Defaults to the provider's `open()`. */
  onOpen?: (id: string) => void;
  /** Size preset for cards. Default `"md"`. */
  size?: ThumbnailSize;
  /** Aria label for the scroll region. Default `"Video thumbnails"`. */
  ariaLabel?: string;
  /** Render override for individual cards. */
  renderItem?: (item: MediaItem, index: number) => React.ReactNode;
  /** Gap between cards in px. Default 12. */
  gap?: number;
  /**
   * Horizontal padding applied to the scroll container in px. Defaults to
   * a small value so the first/last card's shadow isn't clipped by the
   * scroll edge. Pass `0` to butt cards against the container edges.
   */
  edgePadding?: number;
  /**
   * When true (default), each card auto-plays a muted, looping video
   * preview instead of a static poster. Consumers that want static
   * thumbnails (better on low-power devices or when data is expensive)
   * can pass `false`.
   */
  autoplayPreview?: boolean;
  /**
   * Passed through to every default-rendered `<ThumbnailCard>`. See
   * {@link ThumbnailCardProps.showDuration}. Default `true`. Ignored when a
   * `renderItem` override is supplied (the consumer owns the card then).
   */
  showDuration?: boolean;
  /**
   * Passed through to every default-rendered `<ThumbnailCard>`. See
   * {@link ThumbnailCardProps.glyphMode}. Default `"always"`. Ignored when a
   * `renderItem` override is supplied.
   *
   * Per-item slots (e.g. a like-count `badgeSlot`) are not strip-level props —
   * use `renderItem` to supply them per card.
   */
  glyphMode?: "always" | "hover" | "none";
  className?: string;
  style?: React.CSSProperties;
}

// Read the provider context softly — no throw if outside the provider.
// `useImmersiveFeed()` calls `useContext` unconditionally and only throws
// on null, so wrapping in try/catch does not violate Rules of Hooks.
function useOptionalFeed() {
  try {
    return useImmersiveFeed();
  } catch {
    return null;
  }
}

/**
 * A horizontally-scrolling row of thumbnails.
 *
 * Uses native `scroll-snap-type: x proximity` for the expected mobile
 * swipe behavior with no custom gesture code.
 */
export function ThumbnailStrip({
  items,
  onOpen,
  size = "md",
  ariaLabel = "Video thumbnails",
  renderItem,
  gap = 12,
  edgePadding = 4,
  autoplayPreview = true,
  showDuration = true,
  glyphMode = "always",
  className,
  style,
}: ThumbnailStripProps) {
  const feed = useOptionalFeed();
  const resolvedItems = items ?? feed?.items ?? [];
  const resolvedOpen = onOpen ?? feed?.open;

  if (!resolvedOpen) {
    // Explicit and vocal failure mode: without a way to open, the strip is
    // decorative. Match the error style of `useImmersiveFeed`.
    throw new Error(
      "<ThumbnailStrip> needs either an `onOpen` prop or an `<ImmersiveFeedProvider>` ancestor.",
    );
  }

  if (resolvedItems.length === 0) return null;

  return (
    <div
      data-psmi-scope="strip"
      role="region"
      aria-label={ariaLabel}
      className={className}
      style={style}
    >
      <div
        className="psmi-strip"
        // Inline layout: do NOT rely on the scoped stylesheet for the flex
        // + snap rules. Prevents the initial-paint grid-wrap bug when the
        // strip renders before <ImmersivePortal> injects styles.
        style={{
          display: "flex",
          gap,
          overflowX: "auto",
          overflowY: "hidden",
          padding: `4px ${edgePadding}px 12px`,
          scrollSnapType: "x proximity",
          scrollPaddingLeft: edgePadding,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {resolvedItems.map((item, i) =>
          renderItem ? (
            <React.Fragment key={item.id}>{renderItem(item, i)}</React.Fragment>
          ) : (
            <ThumbnailCard
              key={item.id}
              item={item}
              size={size}
              onOpen={resolvedOpen}
              autoplayPreview={autoplayPreview}
              showDuration={showDuration}
              glyphMode={glyphMode}
            />
          ),
        )}
      </div>
    </div>
  );
}
