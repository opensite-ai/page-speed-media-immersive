# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1] - 2026-07-11

### Fixed
- **Mobile side gutters in the fullscreen viewer.** The media pane's 9:16
  clamp (`max-width: calc(100dvh * 9 / 16)`, inline) could compute *narrower
  than the screen* on phones whenever browser chrome shrank `100dvh` (e.g. a
  ~660px visible viewport clamps the pane to ~371px on a 390px-wide phone),
  leaving thin black gutters on both sides. Panes now carry a `psmi-pane`
  class and the scoped stylesheet drops the clamp at the 540px breakpoint
  (`max-width: none !important`), so phones render full-bleed like
  Instagram/TikTok — the media's existing `object-fit: cover` center-crops
  the 9:16 content instead. Desktop keeps the centered, letterboxed 9:16
  column (the inline value remains the desktop layout per the
  stylesheet-optional rule). Affects every consumer (dt-cms website-status
  reels, `@opensite/ui` `instagram-post-grid`, client sites).

## [0.5.0] - 2026-07-10

### Added
- **Image items — first-class alongside videos.** `MediaItem` gains
  `type?: "video" | "image"`. It defaults to `"video"` when omitted, so every
  existing consumer is unaffected. For `type: "image"`, `poster` **is** the
  image and all video-only fields (`src`, `masterPlaylistUrl`, `fallbackSrc`,
  `durationMs`, `durationLabel`) are ignored.
  - **Viewer.** Image slides render `poster` full-bleed via `@page-speed/img`,
    sharing the video slide's 9:16 layout/letterboxing. All video chrome is
    suppressed for image slides: the mute pill (header), the progress bar, the
    playback glyph/spinner, the tap-to-play overlay, and the autoplay
    watchdogs (no `<video>` is attached, so the play/mute/watchdog effects
    no-op). Navigation (swipe / chevrons / keyboard), header, caption card,
    and the actions rail work identically. Image slides never auto-advance —
    they are navigated manually, IG-style. Mixed video/image feeds transition
    cleanly in both directions.
  - **Thumbnail card.** Image items render a static poster (`autoplayPreview`
    is a no-op), with no audio-bars glyph, no duration, and no mute icon. The
    center glyph is an expand (maximize) icon instead of a play triangle.
- **`ThumbnailCard` `badgeSlot?: React.ReactNode`.** When provided, fully
  **replaces** the built-in top-left `item.badge` chip with a caller-owned,
  unstyled slot in the same position — for the IG-style like-count badge.
- **`ThumbnailCard` `showDuration?: boolean` (default `true`).** When `false`,
  removes the duration label (and its audio-bars glyph) from the caption while
  keeping the title — unlike `hideCaption`, which removes the whole overlay.
- **`ThumbnailCard` `glyphMode?: "always" | "hover" | "none"` (default
  `"always"`).** `"always"` keeps the pre-0.5 behavior (reveal on hover for
  pointer devices, always visible on touch). `"hover"` hides the glyph until
  the card is hovered (mouse) or focused (keyboard a11y) and keeps it hidden on
  touch devices — where the whole card is the tap target. `"none"` renders no
  glyph. `ThumbnailStrip` forwards `showDuration` and `glyphMode` to its
  default cards.
- **`ThumbnailCard`/`ThumbnailStrip` `"ig"` size preset (264px).** A vertical
  9:16 tile deliberately larger than the client-portal presets
  (`sm`/`md`/`hero`) so posters read like a social feed.
- **`ImmersiveViewerHeader` `hideMute?: boolean` (default `false`).** Hides the
  mute toggle; set by the viewer when the active slide is an image. The
  `renderHeader` render-prop now also receives `hideMute`.

## [0.4.1] - 2026-07-06

### Fixed
- **Mobile: videos silently never started after a few swipes (iOS WebKit).**
  After 3–4 swipes the newly-active video could stall forever on its first
  frame with no spinner, no glyph, and no way to know anything was wrong —
  a tap (which "paused" the zombie, then a second tap) was the only way out.
  Root cause is a WebKit blind spot the event-driven autoplay pipeline
  couldn't see: `play()` is *accepted* (`el.paused` flips `false`) but the
  media engine never starts — no `playing`, no `pause`, and, because the
  wrapped `<video>` uses `<source>` children, no promise rejection either
  (Chromium bug 718647 / WebKit bug 115000 family). The old retries only
  rode on `canplay`/`loadedmetadata`, which never re-fire once data has
  arrived, and the UI derived "playing" from `paused === false`. Fixes:
  - **Start-of-playback watchdog.** If the active video hasn't reached real
    playback (`currentTime` advancing) ~900ms after a page becomes active,
    it is re-kicked through the guaranteed muted-autoplay path (`pause()`
    to reset the wedged request, then a fresh muted `play()`), up to 3
    times with the buffering spinner showing. On give-up the UI degrades
    honestly to the tap-to-play glyph and fires `onAutoplayBlocked`.
  - **Gesture-time priming.** On swipe commit the incoming video now gets
    a muted `play()` synchronously inside the `pointerup` call stack —
    claiming the (tiny) iOS media/decoder slot before React's effect
    timing, the way TikTok-style feeds do.
  - **Honest tap toggle.** Tapping keys off what the user *sees* (playback
    state + rendered frames), not `el.paused` alone — a tap on a stalled
    video now starts it instead of silently "pausing" a zombie.
- **Every committed swipe replayed the outgoing video.** `onDragEnd`
  ignored the `committed` flag and resumed the stale (pre-commit) active
  video, which the play effect then immediately paused — an AbortError
  play/pause burst against the media engine on every single swipe, plus a
  spurious `onAutoplayBlocked` report. It now resumes only uncommitted
  (rubber-band) drags.
- **`AbortError` no longer misreported as autoplay-blocked.** Rejections
  caused by our own interruptions (swipe-away pause, watchdog re-kick) no
  longer flip the UI to "paused" nor fire `onAutoplayBlocked`; only real
  policy refusals (e.g. `NotAllowedError`) do — and those now show the
  tap-to-play glyph even at `currentTime === 0`, where the old derivation
  rendered an infinite spinner.
- **User pauses are never overridden.** Late `canplay`/`loadedmetadata`
  retries (and the watchdog) no longer force a video back to life — muted,
  no less — after the user explicitly paused it during buffering. Same for
  rubber-band drag releases: they resume only videos the pager itself
  paused, never an explicit user pause.
- **Videos that finished normally stay finished.** Both the watchdog and
  the play-effect retries now treat `el.ended` as a healthy terminal state.
  Previously (pre-dating 0.4.1 for the play effect), an SSE-driven items
  re-render could silently REPLAY the last video, muted, from its resting
  end frame (`play()` on an ended element seeks to 0). Explicit navigation
  still replays: leaving a page rewinds it, which clears `ended`.
- **Failure verdicts are terminal and reports are deduplicated.** Once a
  page's playback definitively fails, later effect re-runs (attach ticks,
  SSE churn) no longer restart the retry cycle — pre-fix that oscillated
  the UI glyph→spinner→glyph and fired `onAutoplayBlocked` once per
  re-run. `onAutoplayBlocked` now fires at most once per page activation;
  a user tap (or page change) is what re-opens the attempt window.
- **Give-up is readiness-aware.** The watchdog only declares "blocked"
  (glyph + `onAutoplayBlocked`) when data is actually available
  (`readyState >= HAVE_CURRENT_DATA`) — i.e. when a tap WILL start the
  video. A merely-slow network keeps the truthful buffering spinner and
  recovery stays with the `canplay` listeners, instead of reporting a
  false "blocked" on 3G.

## [0.4.0] - 2026-07-02

### Fixed
- **Mobile swipes died and taps toggled play/pause instead of paging.** The
  pager container used `touch-action: pan-y`, which tells the browser IT may
  handle vertical pans. On touch devices the browser claimed vertical swipes
  for (scroll-locked, no-op) scrolling and fired `pointercancel`, killing the
  pager mid-gesture; users' retry flicks then landed as clicks and toggled
  playback. The container is a fullscreen modal that owns every touch — it
  now uses `touch-action: none` (+ `overscroll-behavior: contain`), matching
  TikTok/Reels behavior.
- **Quick short flicks rubber-banded instead of committing.** Velocity was
  measured from the last pointer sample only; fingers decelerate just before
  lift-off, so flick momentum under-reported. Velocity is now exponentially
  smoothed across samples.

### Added
- **Playback-state indicator.** Users couldn't tell a paused video from a
  buffering one (both were a still frame). The active page now renders a
  centered TikTok-style overlay: a large play glyph while paused (with a
  120ms fade-delay so pager-induced micro-pauses never flash it), and a
  spinner while buffering (450ms fade-delay so it never flashes on fast
  loads). Nothing renders while playing. Autoplay-blocked videos surface the
  play glyph as an implicit tap-to-play affordance.
- **Icon-only mute pill on mobile (≤540px).** The "Sound on"/"Muted" label
  is desktop-only; on phones the pill collapses to the speaker icon so it
  can't cover video content. Aria labels unchanged.
- **Badge placement is responsive.** On phones the close button overlaps the
  viewport's top-left corner, so the item badge moves into the caption block
  between the brand row and the title (`.psmi-badge-inline`); the top-left
  badge (`.psmi-badge-top`) remains desktop-only. Exactly one is visible at
  a time.

### Changed
- Tap slop for the play/pause toggle raised from 6px to 10px to match the
  pager's intent-lock threshold — thumb wobble counts as a tap, anything the
  pager would treat as a drag never toggles playback.

## [0.3.6] - 2026-07-02

### Fixed
- **Videos randomly went silent while playing (and stayed silent).** The
  play effect — which re-runs whenever its dependencies change, including
  the `items` array identity — unconditionally forced the active video's
  `.muted = true` before calling `.play()`. When the video was *already
  playing* audibly, that force-mute silenced it permanently: an
  already-playing element never fires another `playing` event, so the
  mute-sync listener (the only thing that restores the consumer's unmuted
  intent) never ran again, and the mute-sync effect itself has no `items`
  dependency so it did not re-run either.

  Any consumer that rebuilds its `items` array per render (e.g. a
  dashboard re-rendering on every SSE event, or selectors that construct
  fresh `MediaItem` objects each call) hit this on a random cadence —
  audio died whenever a re-render landed while the takeover was open.

  `attemptPlay` now returns early when the element is not paused: an
  already-playing (or play-in-flight) video is never touched, so
  consumer re-renders, `items` identity churn, and `videoAttachTick`
  bumps from neighbouring pages mounting are all safe while audio is
  live. Regression-tested in `viewer.test.tsx` and verified in Chrome
  against an 800ms items-identity churn harness.

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
