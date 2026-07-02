# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-07-01

### Fixed
- **`<ThumbnailStrip>` first-paint layout regression.** The flex + horizontal
  scroll + `scroll-snap-type: x proximity` rules were living only in the
  scoped stylesheet, which is not injected until `<ImmersivePortal>` first
  mounts. On pages where the viewer is closed on load, cards wrapped into a
  grid until the user opened and closed a video. Layout is now applied
  inline on the strip's inner container, matching the library's own AGENTS.md
  invariant that "every layout-critical CSS property must be applied inline."
- Card outline + shadow tuned so cards read as distinct from the page
  background on light layouts.

### Added
- `<ThumbnailCard>` autoplay preview: cards now render a muted, looping,
  in-viewport-only `<video>` preview instead of a static poster. Powered by
  IntersectionObserver — offscreen cards are paused, so bandwidth is only
  spent on visible previews. Opt-out with `autoplayPreview={false}`.
- `<ThumbnailCard>` respects `prefers-reduced-motion: reduce`: falls back
  to the static poster when the user has requested reduced motion.
- `<ThumbnailStrip>` new props: `gap` (default `12`) and `edgePadding`
  (default `4`) to prevent card shadows from being clipped at the scroll
  container's left/right edge, and `autoplayPreview` forwarded to cards.
- `<ThumbnailCard>` new prop: `elevated` (default `true`). Set false when
  the card is embedded inside a container that already provides depth.

### Changed
- **`<ThumbnailCard>` mute-icon default flipped to hidden.** At thumbnail
  sizes, the audio-bars glyph in the caption already communicates that
  video has sound; the small speaker-with-slash icon in the corner was
  visual noise. v0.1 consumers who want the old behavior can pass
  `showMutedIcon` (new preferred prop) or `hideMutedIcon={false}` (legacy).
  The `hideMutedIcon` prop is now deprecated but still honored.

## [0.1.0] - 2026-07-01

### Added
- Initial release of @page-speed/media-immersive
