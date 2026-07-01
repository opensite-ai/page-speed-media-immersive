# AGENTS.md — @page-speed/media-immersive

This file is written for AI coding agents (Claude Code, Codex, Cursor, Copilot, Perplexity Computer) working in this repo. It describes the architecture, the invariants that must be preserved, and the non-obvious decisions embedded in the code.

## Mental model

`@page-speed/media-immersive` is a **TikTok/Reels/Shorts-style vertical video feed** with a portal-mounted fullscreen viewer. It composes `@page-speed/img` (posters/thumbnails) and `@page-speed/video` (HLS + mp4 fallback playback) — this library does **not** own video playback mechanics.

The three consumer patterns are:
1. **Carousel row + fullscreen viewer** (default `<ImmersiveFeed variant="carousel">`).
2. **Controlled** — viewer portal only, triggered imperatively via `ref`.
3. **Fully custom** — bring your own layout with `<ImmersiveFeedProvider>` + primitives.

State (`items`, `activeIndex`, `isOpen`, `isMuted`) lives in `ImmersiveFeedProvider`. All primitives read it via `useImmersiveFeed()`.

## Golden rules (do not violate)

1. **Do not add heavy runtime dependencies.** No `framer-motion`, no `react-spring`, no `@radix-ui/*`, no gesture library. The library must stay small (target: <15KB gzipped for the full feed). The pointer-events pager and CSS transforms in `useVerticalPagerGestures` are hand-rolled specifically to avoid these.
2. **Do not couple to a specific consumer.** The library ships **zero default actions** for the right rail and no baked-in brand chrome. The rail is empty until the consumer passes `actions={[...]}`. This is required for JV partners (restaurants, charter schools, etc.) who need very different action sets.
3. **Do not replace the transform-based pager with CSS `scroll-snap`.** This was deliberately not chosen. See § "Why not scroll-snap" below.
4. **Do not import from `@page-speed/lightbox` at runtime.** Match its hook signatures (`useKeyboardShortcuts`, gallery-state shape) for developer consistency, but keep this library dependency-free from lightbox at runtime.
5. **Every layout-critical CSS property must be applied inline**, not only via the injected stylesheet. The stylesheet is polish; failing to load it must not break positioning.
6. **All internal imports must use `.js` extensions** (not `.ts` or extensionless). Required by `moduleResolution: "NodeNext"`. Test files are the exception (vitest resolves `.ts` fine).
7. **Every source file that touches the DOM starts with `"use client"`.** Required for RSC integration in Toastability/app and consumer Next.js apps.
8. **`sideEffects: false` and per-subpath single-file exports are non-negotiable.** Do not add barrels or side-effectful modules that break tree-shaking. Every `./x` export in package.json must map to one compiled file.

## Repository layout

```
page-speed-media-immersive/
├── src/
│   ├── index.ts                              # public re-exports (root)
│   ├── core/
│   │   ├── index.ts                          # core barrel
│   │   ├── ImmersiveFeed.tsx                 # <ImmersiveFeed> convenience wrapper
│   │   ├── ImmersiveFeedProvider.tsx         # Context + state + useImmersiveFeed()
│   │   ├── ImmersiveViewer.tsx               # Fullscreen viewer (largest file)
│   │   ├── ImmersiveViewerHeader.tsx         # Top chrome (close, counter, mute)
│   │   ├── ImmersiveViewerActions.tsx        # Right-side action rail
│   │   └── ImmersiveViewerCaption.tsx        # Bottom caption card
│   ├── thumbnails/
│   │   ├── index.ts
│   │   ├── ThumbnailCard.tsx                 # Single tappable poster tile
│   │   └── ThumbnailStrip.tsx                # Horizontal scroll-snap row
│   ├── hooks/
│   │   ├── index.ts
│   │   ├── useVerticalPagerGestures.ts       # ← Critical file. See § "The pager"
│   │   ├── useScrollLock.ts                  # iOS-safe body scroll lock
│   │   ├── useKeyboardShortcuts.ts           # Mirrors @page-speed/lightbox signature
│   │   └── useResponsiveness.ts              # Breakpoint hook (same shape as lightbox)
│   ├── portal/
│   │   ├── index.ts
│   │   ├── ImmersivePortal.tsx               # createPortal + scoped-reset root
│   │   └── injectScopedStylesheet.ts         # One-shot <style> injection
│   ├── types/
│   │   └── index.ts                          # MediaItem, ImmersiveAction, handles
│   ├── utils/
│   │   ├── clamp.ts
│   │   ├── formatDuration.ts
│   │   ├── prefersReducedMotion.ts
│   │   └── resolveIndex.ts
│   └── __tests__/
│       └── *.test.{ts,tsx}
├── scripts/
│   └── emit-cjs.js                           # Copies dist/*.js → dist/*.cjs
├── DESIGN.md                                 # The approved design spec
├── AGENTS.md                                 # (this file)
├── README.md                                 # Consumer-facing docs
├── package.json
├── tsconfig.json                             # NodeNext, ES2022, strict
└── vitest.config.ts                          # happy-dom
```

## Public API (never break these without a major bump)

Root package exports:

```ts
// Components
ImmersiveFeed              // convenience: provider + strip + viewer
ImmersiveFeedProvider      // context/state owner
ImmersiveViewer            // fullscreen portal viewer
ImmersiveViewerHeader      // top chrome (override slot)
ImmersiveViewerActions     // right rail (override slot)
ImmersiveViewerCaption     // bottom caption (override slot)
ThumbnailCard              // single tappable card
ThumbnailStrip             // horizontal snap-scroll row
ImmersivePortal            // portal + scoped root (rarely used directly)

// Hooks
useImmersiveFeed           // consume feed state inside provider tree
useActionContext           // convenience: gets {close,next,prev,index}
useScrollLock              // iOS-safe body lock
useResponsiveness          // { breakpoint, isMobile, isTablet, isDesktop }
useKeyboardShortcuts       // shortcuts map, matches @page-speed/lightbox
useVerticalPagerGestures   // low-level pointer pager engine

// Portal internals
injectScopedStylesheet     // safe to re-call; idempotent
ejectScopedStylesheet      // tests only

// Types
MediaItem, ImmersiveAction, ActionContext, ImmersiveFeedHandle,
ImmersiveFeedState, ImmersiveTheme
```

Per-subpath exports (also in `package.json#exports`, used for granular tree-shaking): `./core`, `./core/feed`, `./core/provider`, `./core/viewer`, `./thumbnails`, `./thumbnails/card`, `./thumbnails/strip`, `./hooks`, `./portal`, `./types`. Each maps to a **single compiled file**, not a barrel — do not add re-export chains that re-introduce side effects.

## Non-obvious decisions

### Why not CSS `scroll-snap` for the vertical pager?

The Framer/Encapsa design prototype used `scroll-snap-type: y mandatory` on an `overflow-y: scroll` container. That was fine for a mockup; it is bad as a library primitive because:

- **iOS Safari address-bar collapse re-computes snap mid-scroll**, producing visible jitter and index drift.
- **Snap fights programmatic seeks.** The prototype had to disable-snap → jump → re-enable-snap with three timeouts to reliably `open(id)` at a non-zero index. Fragile at scale.
- **`overscroll-behavior: contain` doesn't fully prevent parent scroll on iOS < 16.** For a portal-into-body library targeting arbitrary customer sites, this is a real problem.
- **Snap containers keep all pages in the DOM.** With real `<Video>` elements (not mock posters), that means spawning `hls.js` for offscreen videos = wasted bandwidth.

Instead: pointer events → transform + spring (`useVerticalPagerGestures`), 3-page render window (`activeIndex - 1..+1`), and imperative play/pause on active. This is what TikTok/Reels/Shorts do on the web.

### Why hand-rolled pointer events instead of `react-use-gesture`?

Bundle size. `@use-gesture/react` is ~14KB gzipped. Our pager needs ~150 LOC of hand-rolled code that we control end-to-end. See `useVerticalPagerGestures.ts`.

Key rules encoded there:
- **Intent-locking after 10px** — if the user moves more horizontally than vertically in the first 10px, we surrender the gesture (matters when nested inside a horizontal carousel of feeds).
- **Rubber-band at ends** — `deltaY * 0.35` when pulling past first/last.
- **Commit thresholds** — distance ≥ 20% viewport OR velocity ≥ 0.5 px/ms.

### Why do we own scroll-lock instead of reusing lightbox's simpler version?

`@page-speed/lightbox` uses `document.body.style.overflow = "hidden"`. That works for a modal that doesn't need to fully block scroll on iOS Safari. Our fullscreen viewer needs harder guarantees — `body { position: fixed; top: -scrollY; overflow: hidden }` with restore. This is the industry-standard iOS-safe pattern (see Sentry Replay, Intercom, etc.).

**Do not simplify `useScrollLock`**. If you're tempted to, load the file on an iPhone and try scrolling behind an open viewer.

### Why compose `<Video>` at `preferNativeControls={false}` + layered chrome instead of using `skinClasses`?

`@page-speed/video`'s `skinClasses` mechanism is designed for *replacing* the standard control bar. Our chrome is completely different — action rail, caption card, progress bar, badge, header — all layered absolutely on top. Layering is simpler and gives us pixel control without contorting `skinClasses`.

Consequence: we do not benefit from `@page-speed/skins` skin JSON files here. If the user wants theming, they use our `theme` prop → CSS custom properties.

### Why the CSS-isolation strategy is `Portal + revert-layer + prefixed classes + inline layout`, not Shadow DOM?

Shadow DOM gives true style isolation but:
- Requires adopting stylesheets into the shadow root (breaks Tailwind reach).
- Complicates `@page-speed/img` and `@page-speed/video`, which rely on document-level styles.
- Breaks some assistive tech.

`Portal + all: revert-layer` handles ~99% of consumer sites (this is what Intercom, Chatra, Sentry Replay use). The remaining 1% (sites with `body *` `!important` selectors) is documented in the README as a known limitation.

**Do not switch to Shadow DOM without a discussion.** It's a large behavioral change that would break both `@page-speed/img` (media-selection events use document event bus) and the consumer's Tailwind reach.

### Why we do not use `@page-speed/icon`

`@page-speed/icon` is Iconify-backed with runtime CDN fetches (see its `fetchIconSvg`). For chrome that must render in the first frame with zero flicker (close, mute, play, arrow), inlining 4 tiny SVGs (< 300 bytes each gzipped) beats a network fetch. Consumers can pass their own icons via the render-props on `<ImmersiveViewerHeader>` and `<ImmersiveViewerActions>`.

### Why the imperative handle uses `latest-refs` instead of state deps

`useImperativeHandle(ref, factory, deps)` re-runs the factory when deps change, but consumers commonly hold onto the handle instance across renders. If `getState()` closed over `activeIndex` from the render at handle-creation time, consumers reading state through a stale handle reference would see stale data. Storing state in refs and reading `.current` inside `getState()` gives correct-latest semantics regardless of when the handle was captured.

## Common workflows

### Adding a new prop to `<ImmersiveFeed>` or `<ImmersiveViewer>`

1. Add prop + JSDoc to the component's `Props` interface.
2. Thread it through `ImmersiveFeedProvider` if it affects state, or handle inline if presentational.
3. **Add a test** in `src/__tests__/*.test.tsx`. Every prop must have at least one behavior test.
4. Update README's prop reference section if the prop is high-signal for consumers.

### Changing gesture behavior

1. Edit `src/hooks/useVerticalPagerGestures.ts`.
2. **Test on both `touch` and `mouse` inputs.** Vitest tests only pointer math; real gesture testing is manual.
3. Update the "Non-obvious decisions" section here if you change thresholds or the rubber-band rule.

### Adding a new export subpath

1. Add the source file under an appropriate `src/<area>/` directory.
2. Re-export from `src/<area>/index.ts` and from `src/index.ts`.
3. Add an entry to `package.json` `exports`.
4. Add a smoke assertion in `src/__tests__/smoke.test.tsx`.

## Verification commands

Before opening a PR:

```bash
pnpm install
pnpm typecheck    # must pass
pnpm test         # must pass (33/33 currently)
pnpm build        # must produce dist/ with per-subpath .js/.cjs/.d.ts triples
```

CI will run these same commands.

## Version compatibility

- React: ≥17 (peer dep). Ref-mutability differs between React 18 and 19; we use `MutableRefObject<T | null>` in hook return types to stay compatible with both.
- TypeScript: ≥5.6 (dev). Consumers can be on lower.
- Node: ≥18. pnpm ≥ 10 (matches sibling libs).

## Cross-repo etiquette

- `useKeyboardShortcuts` signature intentionally matches `@page-speed/lightbox`'s hook of the same name. If you change one, discuss aligning the other.
- `useResponsiveness` breakpoint shape intentionally matches `@page-speed/lightbox`'s hook. Keep them consistent.
- `MediaItem` shape must accept anything `@page-speed/video` accepts (`src`, `masterPlaylistUrl`, `fallbackSrc`, `poster`). Do not diverge — consumers pass items through both libraries.

## Where to ask for help

- Design questions: `DESIGN.md` in this repo (the approved v0 spec).
- Consumer questions: see `README.md`.
- Sibling library conventions: `page-speed-img/AGENTS.md` (authoritative for the tsc + emit-cjs pattern).
