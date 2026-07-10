/**
 * Public types for @page-speed/media-immersive.
 *
 * These types describe the data flowing through the library. They are consumer-facing
 * and are re-exported from the package root as well as from `./types`.
 */

import type React from "react";

/**
 * A single media item in the feed.
 *
 * Items are either **videos** (the default) or **images**. For videos, the two
 * most important fields are `poster` (used for the thumbnail card and as the
 * initial paint for the fullscreen viewer) and one of the video source fields
 * (`src`, `masterPlaylistUrl`, or `fallbackSrc`) which are passed through to
 * `@page-speed/video`.
 *
 * For images (`type: "image"`), `poster` **is** the image — it is rendered
 * full-bleed by `@page-speed/img` in both the thumbnail card and the viewer,
 * and every video-only field (`src`, `masterPlaylistUrl`, `fallbackSrc`,
 * `durationMs`, `durationLabel`) is ignored.
 */
export interface MediaItem {
  /** Stable unique id. Used for `open(id)` and for React keys. */
  id: string;

  /**
   * Discriminates the media kind. `"video"` (the default when omitted — so all
   * pre-existing consumers are unaffected) plays through `@page-speed/video`;
   * `"image"` renders `poster` as a full-bleed still through `@page-speed/img`
   * and suppresses all playback chrome (mute pill, progress bar, playback
   * glyph/spinner, autoplay watchdogs). Image slides never auto-advance —
   * they are navigated manually, IG-style.
   */
  type?: "video" | "image";

  /**
   * For videos: the poster/thumbnail image shown while the video loads.
   * For images (`type: "image"`): **this is the image itself**, rendered
   * full-bleed. Rendered by `@page-speed/img` so it benefits from AVIF/WebP
   * negotiation and lazy loading when applicable.
   */
  poster: string;

  /**
   * Video source URL. May be a progressive mp4, or a URL that the Octane
   * transform layer will convert to HLS. Passed to `<Video src={...}>`.
   * Ignored when `type: "image"`.
   */
  src?: string;

  /**
   * Pre-computed HLS master playlist URL. When provided, `<Video>` skips
   * its transform call and streams directly. Ignored when `type: "image"`.
   */
  masterPlaylistUrl?: string;

  /**
   * Progressive mp4 fallback if HLS fails or is unsupported.
   * Ignored when `type: "image"`.
   */
  fallbackSrc?: string;

  /**
   * Optional pre-computed duration in milliseconds. If omitted, the underlying
   * `<video>` element will report it once metadata loads.
   * Ignored when `type: "image"`.
   */
  durationMs?: number;

  /**
   * Optional pre-formatted duration label (e.g. "1:32"). When omitted, and
   * `durationMs` is provided, the library formats it automatically for display.
   * Ignored when `type: "image"`.
   */
  durationLabel?: string;

  /**
   * Short badge shown top-left of the thumbnail and the fullscreen viewer.
   * Examples from the reference designs: "INTRO", "PRODUCT TOUR", "WHY".
   */
  badge?: string;

  /**
   * Descriptive category shown alongside the brand chip in the caption.
   * Examples: "Demo", "Testimonial", "Explainer".
   */
  kind?: string;

  /**
   * Title shown on the thumbnail overlay and in the fullscreen caption card.
   */
  title: string;

  /** Long caption shown only in the fullscreen viewer. */
  caption?: string;

  /**
   * Free-form bag of consumer-defined metadata. The library never reads
   * from this — it exists so that action callbacks and analytics hooks
   * can attach domain data (order ids, menu items, lesson refs, etc.).
   */
  meta?: Record<string, unknown>;
}

/**
 * An action rendered in the fullscreen viewer's right-side rail.
 *
 * The library ships **no default actions**. Consumers must pass their own
 * `actions` array (or leave it empty for no rail).
 */
export interface ImmersiveAction {
  /** Stable id, used as React key. */
  id: string;

  /**
   * Icon node, or a render function that receives the current active state
   * (e.g. for toggle actions like Like / Bookmark).
   */
  icon: React.ReactNode | ((state: { active: boolean }) => React.ReactNode);

  /** Short label shown under the icon (e.g. "412", "Save", "Share"). */
  label: React.ReactNode | ((state: { active: boolean }) => React.ReactNode);

  /** Called when the action is pressed. */
  onPress: (item: MediaItem, ctx: ActionContext) => void;

  /**
   * Optional predicate for toggle-style actions. When it returns true,
   * the `icon`/`label` render functions receive `active: true`.
   */
  active?: (item: MediaItem) => boolean;

  /** Optional aria-label override; falls back to a string form of `label`. */
  ariaLabel?: string;
}

/** Context passed to action handlers so they can drive feed state. */
export interface ActionContext {
  /** Close the fullscreen viewer. */
  close: () => void;
  /** Advance to next video. Noop when already at the last item. */
  next: () => void;
  /** Go back to previous video. Noop when at the first item. */
  prev: () => void;
  /** Current active index. */
  index: number;
}

/**
 * Imperative handle exposed by `<ImmersiveFeed>` via `ref` and returned by
 * `useImmersiveFeed()` inside the provider tree.
 */
export interface ImmersiveFeedHandle {
  /** Open the fullscreen viewer at the given item id or index. */
  open: (idOrIndex: string | number) => void;
  /** Close the viewer. */
  close: () => void;
  /** Advance to next video. */
  next: () => void;
  /** Go back to previous video. */
  prev: () => void;
  /** Seek to a specific index without opening/closing state changes. */
  seek: (index: number) => void;
  /** Set the global (feed-wide) mute state. */
  setMuted: (muted: boolean) => void;
  /** Read current state (non-reactive; use `useImmersiveFeed()` for reactive). */
  getState: () => ImmersiveFeedState;
}

/** Current feed state. */
export interface ImmersiveFeedState {
  items: MediaItem[];
  activeIndex: number;
  isOpen: boolean;
  isMuted: boolean;
}

/**
 * Optional theming applied via CSS custom properties on the portal root.
 * All fields are optional; unset values inherit library defaults.
 *
 * Consumers using `@page-speed/skins` may pass raw token values here — no
 * skin-package import is required.
 */
export interface ImmersiveTheme {
  /** Primary accent (default `#f39e1e`). Used for badge dot and progress bar. */
  accent?: string;
  /** Brand mark background (default `#182b4a`). */
  brandBg?: string;
  /** Brand mark foreground / text on dark chrome (default `#ffffff`). */
  brandFg?: string;
  /** Backdrop color of the fullscreen viewer (default `#05070d`). */
  viewerBg?: string;
  /** Chrome (buttons/pills) background rgba (default `rgba(255,255,255,0.16)`). */
  chromeBg?: string;
  /** Chrome text color (default `#ffffff`). */
  chromeFg?: string;
  /** Font family stack. Defaults to system UI. */
  fontFamily?: string;
}
