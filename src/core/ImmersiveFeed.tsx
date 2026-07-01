"use client";

import React, { forwardRef } from "react";
import type {
  ImmersiveAction,
  ImmersiveFeedHandle,
  ImmersiveTheme,
  MediaItem,
} from "../types/index.js";
import {
  ImmersiveFeedProvider,
} from "./ImmersiveFeedProvider.js";
import type {
  ImmersiveFeedProviderProps,
} from "./ImmersiveFeedProvider.js";
import { ImmersiveViewer } from "./ImmersiveViewer.js";
import type { ImmersiveViewerProps } from "./ImmersiveViewer.js";
import { ThumbnailStrip } from "../thumbnails/ThumbnailStrip.js";
import type { ThumbnailSize } from "../thumbnails/ThumbnailCard.js";

/**
 * High-level convenience component. Combines `<ImmersiveFeedProvider>` +
 * (optionally) `<ThumbnailStrip>` + `<ImmersiveViewer>` in a single element.
 *
 * Three variants:
 *
 * - `"carousel"` (default): renders the horizontal thumbnail strip inline
 *   at the render site AND the fullscreen viewer via portal.
 *
 * - `"controlled"`: renders **only** the viewer via portal. Nothing is
 *   drawn inline. Use with `ref` to drive it programmatically. Ideal when
 *   the trigger UI (e.g. a `<ThumbnailCard>` inside a compound card) lives
 *   in a different part of the tree.
 *
 * - `"viewer-only"`: alias of `"controlled"` (kept for clarity).
 *
 * For fully custom layouts, do not use `<ImmersiveFeed>` — compose
 * `<ImmersiveFeedProvider>` + primitives yourself.
 */
export interface ImmersiveFeedProps
  extends Omit<ImmersiveFeedProviderProps, "children"> {
  variant?: "carousel" | "controlled" | "viewer-only";
  /** Size for cards when `variant="carousel"`. */
  cardSize?: ThumbnailSize;
  /** Props forwarded to the internal `<ImmersiveViewer>`. */
  viewerProps?: Omit<ImmersiveViewerProps, never>;
  /** Class name for the outer wrapper. Applies to the strip when variant is `carousel`. */
  className?: string;
  /** Inline style for the outer wrapper. */
  style?: React.CSSProperties;
}

/**
 * See {@link ImmersiveFeedProps}. Use `ref` to obtain an imperative handle.
 */
export const ImmersiveFeed = forwardRef<ImmersiveFeedHandle, ImmersiveFeedProps>(
  function ImmersiveFeed(
    {
      items,
      variant = "carousel",
      cardSize = "md",
      viewerProps,
      className,
      style,
      // Provider props
      initiallyMuted,
      initiallyOpen,
      initialIndex,
      actions,
      theme,
      onIndexChange,
      onOpen,
      onClose,
      onAutoplayBlocked,
    },
    ref,
  ) {
    const showStrip = variant === "carousel";
    return (
      <ImmersiveFeedProvider
        ref={ref}
        items={items}
        initiallyMuted={initiallyMuted}
        initiallyOpen={initiallyOpen}
        initialIndex={initialIndex}
        actions={actions}
        theme={theme}
        onIndexChange={onIndexChange}
        onOpen={onOpen}
        onClose={onClose}
        onAutoplayBlocked={onAutoplayBlocked}
      >
        {showStrip ? (
          <ThumbnailStrip
            size={cardSize}
            className={className}
            style={style}
          />
        ) : null}
        <ImmersiveViewer {...viewerProps} />
      </ImmersiveFeedProvider>
    );
  },
);

// Re-export common types for convenience alongside the component.
export type {
  MediaItem,
  ImmersiveAction,
  ImmersiveFeedHandle,
  ImmersiveTheme,
};
