"use client";

import React, { useContext } from "react";
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
 *    `<ImmersiveFeedProvider>` or `<ImmersiveFeed>`, `items` and `onOpen` are
 *    derived from feed state.
 *
 * 2. **Standalone.** Pass `items` and `onOpen` explicitly. Useful when the
 *    strip renders in a completely different part of the tree from the
 *    fullscreen viewer, or when using multiple independent feeds on one page.
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
  className?: string;
  style?: React.CSSProperties;
}

// Read the provider context softly — no throw if outside the provider.
// We can't use `useImmersiveFeed()` directly because it throws; use a
// deferred read that swallows the not-in-provider case.
function useOptionalFeed() {
  try {
    return useImmersiveFeed();
  } catch {
    return null;
  }
}

/**
 * A horizontally-scrolling row of thumbnails. Native `scroll-snap-type: x proximity`
 * gives the expected mobile swipe behavior with no custom gesture code.
 */
export function ThumbnailStrip({
  items,
  onOpen,
  size = "md",
  ariaLabel = "Video thumbnails",
  renderItem,
  className,
  style,
}: ThumbnailStripProps) {
  const feed = useOptionalFeed();
  const resolvedItems = items ?? feed?.items ?? [];
  const resolvedOpen = onOpen ?? feed?.open;

  if (!resolvedOpen) {
    // Explicit and vocal failure mode: without a way to open, the strip is decorative.
    // Use the same error style as `useImmersiveFeed` so the origin is obvious.
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
      <div className="psmi-strip">
        {resolvedItems.map((item, i) =>
          renderItem ? (
            <React.Fragment key={item.id}>{renderItem(item, i)}</React.Fragment>
          ) : (
            <ThumbnailCard key={item.id} item={item} size={size} onOpen={resolvedOpen} />
          ),
        )}
      </div>
    </div>
  );
}
