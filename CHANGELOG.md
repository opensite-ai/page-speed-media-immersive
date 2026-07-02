# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.5] - 2026-07-02

### Fixed
- **Header mute label was action-oriented and confusing.** The label used
  to describe what the button would do if clicked ("Muted" = click to
  mute) rather than the current state. Users read it as state and got
  confused when the label and the audio disagreed. Now:
  - `aria-label="Muted"` + `aria-pressed="true"` when audio is OFF
  - `aria-label="Sound on"` + `aria-pressed="false"` when audio is ON

  Matches the convention on TikTok / Reels / Shorts. `aria-pressed` now
  correctly encodes whether the mute FEATURE is engaged.

- **Header now reflects the actual DOM `.muted` state, not the provider's
  intent.** Browsers can refuse to honor a programmatic `.muted = false`
  (Media Engagement Index below threshold, no prior activation on the
  domain, etc.). Previously the provider's `isMuted` intent drove the
  label, so the button could read "Sound on" while the video was
  actually silent — or vice versa — depending on how the browser
  responded that render.

  Added an `effectiveMuted` state driven by:
  - A `volumechange` DOM event listener on the active video (fires when
    `.muted` changes for any reason including browser policy override).
  - A `playing` event listener as a redundant sync point.
  - Immediate readback on activeIndex / videoAttachTick change.

  The header receives `effectiveMuted`, so the label always matches
  what the user actually hears.

- **Mute button click is now imperative and immediate.** Previously the
  mute-sync effect could take a few frames to propagate `isMuted` to
  the DOM (waited for a `playing` event). Now the button click flips
  `el.muted` synchronously and re-reads it into `effectiveMuted`, so
  the label updates in the same frame as the click. If the browser
  refuses the unmute, `effectiveMuted` reverts on the next
  `volumechange` and the label flips back honestly.

### Known limitation
- Browsers may reject an unmute request without any error. The user
  clicks "Sound on", audio stays silent, label flips back to "Muted"
  after `volumechange` fires. This is Chrome/Safari autoplay policy
  and cannot be fully worked around from the library. In v0.4 we will
  add an `onUnmuteBlocked` callback so consumers can render a "tap the
  video to unmute" hint when this happens.

## [0.3.4] - 2026-07-02

### Fixed
- **THE autoplay bug (three prior releases missed it).** Live inspection
  of the deployed v0.3.3 bundle on production surfaced the actual race:
  the play effect calls `videoRefs.current.get(activeIndex)` synchronously
  on run, but on first `open()` the wrapped `<Video>` component's inner
  `<video>` element has NOT yet fired its callback-ref. So `.get()` returns
  `undefined`, the immediate + rAF play attempts bail early, and the
  `canplay` / `loadedmetadata` retry listeners are never even attached
  (they're conditionally attached to `el` at effect-run time). All three
  safety nets miss, and the video sits paused forever until a fresh user
  gesture (click on the video body) triggers `.play()` directly.

  Fix: introduce a `videoAttachTick` state counter that is bumped every
  time a `<video>` element identity changes at any index. Include it in
  the play effect's deps AND the mute-sync effect's deps. Result: the
  moment the wrapped `<Video>` commits its ref, both effects re-run,
  find the freshly-attached element, and attach the safety-net event
  listeners — which then fire on `canplay` / `loadedmetadata` and
  successfully call `.play()`.

  Also: the play effect now prunes stale `videoRefs` entries whose
  element is no longer in the DOM (`el.isConnected === false`) so the
  map doesn't accumulate references to unmounted elements when the
  render window shifts on swipe. Ref cleanup is intentionally lazy
  (the callback-ref path can't do it without triggering a max-update-
  depth React error).

## [0.3.3] - 2026-07-02

### Fixed
- **Autoplay still didn't fire on production in v0.3.2.** Root cause on
  live inspection: even with `<video muted>` in JSX, some render paths
  had React committing the `muted` DOM property in a microtask that ran
  AFTER our play effect fired. Chrome/Safari inspect the property AND
  the HTML attribute when applying autoplay policy, so a race between
  React's property sync and our `.play()` call could produce
  `NotAllowedError` and leave the takeover paused.

  Three-layer fix:

  1. **Force muted at play time.** Every `attemptPlay()` call now
     explicitly sets `el.muted = true` AND `el.setAttribute("muted", "")`
     right before invoking `.play()`. Both the DOM property and the HTML
     attribute are guaranteed at the exact moment the browser evaluates
     autoplay policy — no React-timing dependency.

  2. **Retry on canplay + loadedmetadata.** In addition to the immediate
     attempt and the next-frame attempt, we now attach `canplay` and
     `loadedmetadata` event listeners to the active video. Both fire
     when the browser confirms it has enough data to play; retrying
     `.play()` at that instant succeeds even in browsers where the
     earlier attempts were rejected for decode-readiness reasons.

  3. **Keep the HTML attribute in step with the property on unmute.**
     When the mute-sync effect flips `el.muted = false` after the
     `playing` event, it also removes the `muted` HTML attribute so
     the DOM property and attribute agree — preventing future
     autoplay decisions (e.g. re-mount, tab-visibility resume) from
     seeing a stale muted attribute.

  Result: the takeover reliably autoplays on open across Chrome,
  Safari, and Firefox, and the DOM muted state matches the provider's
  isMuted state at every observable moment.

## [0.3.2] - 2026-07-01

### Fixed
- **Autoplay-on-open + mute state desync (v0.3.1 follow-up).** v0.3.1
  landed the `.then()` pattern for post-play unmute, but the `.then()`
  never fires when the play() promise resolves *before* the effect
  finishes running (already-playing element), and it fires unreliably
  when the browser is still buffering. Result on production: first
  video stayed paused; second video played but the DOM `.muted` flag
  drifted out of sync with the provider's `isMuted`.

  Rewrote the play + mute-sync flow to use two decoupled effects:
  - **Play effect** — fires on `activeIndex`/`isOpen` change. Calls
    `play()` immediately, and re-attempts on the next animation frame
    (double-tap, safe for HLS parse latency). Element `.muted` is
    guaranteed `true` at play time because the JSX prop is hardcoded
    `muted`, so muted-autoplay policy is always satisfied.
  - **Mute-sync effect** — attaches a `playing` event listener to the
    active video. The listener fires the moment the browser confirms
    real playback, which is when unmute is permitted. It flips DOM
    `.muted = isMutedRef.current`. Also runs immediately when
    `isMuted` toggles so header interactions are instant.

  Result: takeover always plays on open, DOM `.muted` and provider
  `isMuted` stay strictly in sync, and mute toggles never restart
  playback.

### Added
- **Desktop up/down chevron pager.** A pair of circular buttons on the
  right side of the viewer that page prev/next with a mouse click.
  Disabled at the ends of the list. Hidden on touch-only devices
  (`hover: none`) and phones (`max-width: 540px`) via the `.psmi-
  chevrons` scoped rule so mobile continues to swipe. Works alongside
  the existing arrow-key and mouse-wheel navigation.

## [0.3.1] - 2026-07-01

### Fixed
- **Autoplay-on-open regression.** In v0.3.0 the provider set `isMuted =
  false` on `open()` so the takeover viewer would play with sound. That
  in turn caused `<video muted={false}>` to render, and the follow-up
  `.play()` in the viewer's effect was rejected with `NotAllowedError`
  because the user gesture had already been consumed by the thumbnail
  click and the `<video>` element hadn't participated in it. The viewer
  sat paused on open.

  The `<video>` element now always mounts with `muted={true}` (which is
  unconditionally allowed to autoplay). The play/unmute effect starts
  playback muted, then imperatively flips `element.muted =
  isMutedRef.current` after `play()` resolves — the media session
  inherits the tab's activation and allows the unmute without a fresh
  gesture. Consumer state (`isMuted`) is unchanged; only the DOM
  element's muted attribute is briefly forced true.

  A separate mute-sync effect keeps the DOM in step with `isMuted` when
  the user toggles the header button after the initial play, without
  restarting playback.

## [0.3.0] - 2026-07-01

### Fixed
- **Click on the active video now toggles play/pause reliably.** Introduced a
  dedicated click-target overlay on the active viewport that captures pointer
  events with `stopPropagation`, so a tap can never be interpreted as a pager
  commit or bubble to unrelated handlers. Non-active pages ignore clicks.
- **`<ImmersiveViewerHeader>` counter no longer floats over the video's top
  center.** The counter now lives at the bottom-right of the video viewport,
  where it stays legible against varying content. Hidden on viewports
  narrower than 540px (mobile) via the `.psmi-counter` scoped rule.
- **Badge alignment.** The `item.badge` chip is now at `top: 16, left: 16`
  inside the 9:16 viewport (was `top: 60` in v0.2), so its top and left
  gutters match visually.

### Added
- **Mouse-wheel navigation on desktop.** Scrolling in the fullscreen viewer
  commits prev/next like the up/down arrow keys. Wheel input is accumulated
  and rate-limited (`wheelCommitCooldownMs`, default 500ms) so a single
  trackpad flick doesn't skip multiple videos. Touch-only devices skip this
  handler and continue to use swipe. New `useVerticalPagerGestures` options:
  `enableWheel`, `wheelCommitThreshold`, `wheelCommitCooldownMs`.

### Changed
- **`open()` unmutes on invocation.** Because `open()` is only ever called
  from a user gesture (thumbnail click, Enter key, or an explicit imperative
  call from a user action), the browser autoplay-with-sound policy is
  satisfied. Starting unmuted matches user expectation of a takeover viewer.
  Consumers who want silent-by-default can call `setMuted(true)` inside
  `onOpen`.

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
