import type { MediaItem } from "../types/index.js";

/**
 * True when a `MediaItem` is an image rather than a video.
 *
 * `type` is optional and defaults to `"video"` — an absent `type` (every
 * pre-image-support consumer) is treated as a video, so this only returns
 * `true` for the explicit `type: "image"` opt-in. Centralised so the viewer
 * and the thumbnail card agree on exactly one definition of "is an image".
 */
export function isImageItem(item: MediaItem): boolean {
  return item.type === "image";
}
