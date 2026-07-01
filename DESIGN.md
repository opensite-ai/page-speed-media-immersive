# @page-speed/media-immersive — Design Spec (v0)

**Status:** Awaiting sign-off from Jordan before implementation.
**Author:** Computer, drafted from HTML prototypes + demo MP4s + review of `@page-speed/img` and `@page-speed/video`.
**Repo:** `opensite-ai/page-speed-media-immersive` → npm `@page-speed/media-immersive`

---

## 1. What we are building

A TikTok/Reels/Shorts-style vertical video component system, composable enough to support three consumer patterns observed in the Encapsa prototypes:

- **P1 — Carousel row.** A horizontal row of tappable vertical thumbnails ("Watch how it works"). Tapping opens fullscreen feed at that video.
- **P2 — Inline hero card.** A single tappable thumbnail embedded in a compound card (the "AI-generated reel · Play reel" callout inside Market Analysis / Brand Voice sections).
- **P3 — Fullscreen feed.** The takeover viewer. Vertical swipe/scroll between videos, per-video progress, right-side action rail, caption card, mute toggle, close, keyboard controls, index counter. Portalled to `document.body` with scoped-reset CSS isolation.

The three must share state (which video is playing, whether muted, current index) and share a single source-of-truth list of media items.

## 2. Consumer scenarios (canonical usage)

### 2.1 Simple: carousel + fullscreen
```tsx
import { ImmersiveFeed } from "@page-speed/media-immersive";

<ImmersiveFeed
  items={reels}                        // MediaItem[]
  variant="carousel"                   // renders inline row + hosts the portal
  onIndexChange={(i) => track(i)}
/>
```
`ImmersiveFeed` renders the inline carousel AND owns the portal. Tapping a card opens the fullscreen viewer over `document.body`.

### 2.2 Single call-out card (P2)
```tsx
<ImmersiveMediaCard
  item={brandReel}
  size="hero"                          // "sm" | "md" | "hero"
  cta={{ label: "Play reel", icon: "play" }}
  onOpen={() => feedRef.current?.openAt(brandReel.id)}
/>
```
The card is dumb — it renders the thumbnail + overlay chrome. `onOpen` is caller's responsibility so the caller can hand off to the shared `ImmersiveFeed` instance elsewhere on the page, or open a one-off `ImmersiveViewer` directly.

### 2.3 Programmatic control (advanced)
```tsx
const controllerRef = useRef<ImmersiveFeedHandle>(null);

<ImmersiveFeed ref={controllerRef} items={reels} variant="controlled" />
<button onClick={() => controllerRef.current?.open("v-tour")}>Open tour</button>
```
`variant="controlled"` renders nothing visible — only the portal. Consumer drives it.

### 2.4 Fully custom composition (site-rendering use case)
```tsx
import {
  ImmersiveFeedProvider,
  ThumbnailStrip,
  ThumbnailCard,
  ImmersiveViewer,
  useImmersiveFeed,
} from "@page-speed/media-immersive";

<ImmersiveFeedProvider items={reels}>
  <MyCustomLayout>
    <ThumbnailStrip renderItem={(item, i) => <MyCustomCard item={item} />} />
    <ThumbnailCard itemId="v-brand" size="hero" />
    <ImmersiveViewer />               {/* portalled automatically */}
  </MyCustomLayout>
</ImmersiveFeedProvider>
```
Every primitive is exported. The provider owns state; primitives read from it via `useImmersiveFeed()`.

## 3. Component tree and exports

### Public component API
| Component | Purpose |
|---|---|
| `<ImmersiveFeed>` | High-level convenience component. Renders one of the three variants and owns provider + viewer. |
| `<ImmersiveFeedProvider>` | Context provider. State: `items`, `activeIndex`, `isOpen`, `isMuted`. |
| `<ThumbnailStrip>` | Horizontal snap-scroll carousel row. Handles native touch swipe (CSS scroll-snap). |
| `<ThumbnailCard>` | Single tappable thumbnail. Renders poster + badge + title + duration + audio-bars + progress hint. Sizes: `sm` (88px), `md` (152px), `hero` (200px+). |
| `<ImmersiveViewer>` | The fullscreen takeover. Portalled to `document.body`. Owns the vertical pager, gestures, keyboard, action rail, caption. |
| `<ImmersiveViewerHeader>` | Slot: top bar (close, counter, mute). Exported for override. |
| `<ImmersiveViewerActions>` | Slot: right rail (like/ask/share). Exported for override. |
| `<ImmersiveViewerCaption>` | Slot: bottom caption card. Exported for override. |

### Hooks
| Hook | Returns |
|---|---|
| `useImmersiveFeed()` | `{ items, activeIndex, isOpen, isMuted, open, close, next, prev, seek, setMuted }` |
| `useVerticalPagerGestures(opts)` | Low-level: pointer events → index delta with rubber-band + velocity. |
| `useMediaSessionMetadata(item)` | Wires MediaSession API (lockscreen controls) to the active video. |
| `useScrollLock(active)` | Body scroll lock + iOS-safe implementation. Restore on close. |
| `useResponsiveViewport()` | Reports `isMobile` (pointer:coarse + width) so consumers can branch layout. |

### Types
```ts
export interface MediaItem {
  id: string;
  /** Video source. Prefer HLS master; falls back to progressive mp4. */
  src?: string;
  masterPlaylistUrl?: string;
  fallbackSrc?: string;
  /** Poster image URL (used for thumbnails and preload) */
  poster: string;
  /** Optional pre-computed duration (ms). If omitted, read from video metadata. */
  durationMs?: number;
  /** Display duration string ("1:32"). If omitted, formatted from durationMs. */
  durationLabel?: string;
  /** Small badge shown top-left ("INTRO", "PRODUCT TOUR"). */
  badge?: string;
  /** Category / byline shown next to the brand chip. */
  kind?: string;
  /** Card title (used on thumbnail overlay + fullscreen caption). */
  title: string;
  /** Long caption shown in fullscreen only. */
  caption?: string;
  /** Optional like count (rendered on action rail). */
  likes?: string | number;
  /** Arbitrary bag for consumer-specific metadata (analytics, custom actions). */
  meta?: Record<string, unknown>;
}

export interface ImmersiveAction {
  id: string;
  icon: React.ReactNode | ((state: { active: boolean }) => React.ReactNode);
  label: string;
  onPress: (item: MediaItem, ctx: { close: () => void }) => void;
  active?: (item: MediaItem) => boolean;
}

export interface ImmersiveFeedHandle {
  open: (idOrIndex: string | number) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  setMuted: (m: boolean) => void;
}
```

### Package `exports` map (mirrors sibling libs, per-subpath tree-shaking)
```json
{
  ".": "./dist/index.js",
  "./core": "./dist/core/index.js",
  "./core/feed": "./dist/core/ImmersiveFeed.js",
  "./core/provider": "./dist/core/ImmersiveFeedProvider.js",
  "./core/viewer": "./dist/core/ImmersiveViewer.js",
  "./thumbnails": "./dist/thumbnails/index.js",
  "./thumbnails/strip": "./dist/thumbnails/ThumbnailStrip.js",
  "./thumbnails/card": "./dist/thumbnails/ThumbnailCard.js",
  "./hooks": "./dist/hooks/index.js",
  "./portal": "./dist/portal/index.js",
  "./types": "./dist/types/index.js"
}
```
Every subpath is a `.js` file (not a barrel) so bundlers can drop unused entry points entirely. `sideEffects: false` enforced.

## 4. Interaction spec

### 4.1 Thumbnail carousel (inline row)
- Container: `display:flex; gap:12px; overflow-x:auto; scroll-snap-type:x proximity`.
- Card: `flex:none; aspect-ratio:9/16; scroll-snap-align:start`. Sizes per prop.
- Hover (desktop only, `hover:hover`): scale-up + play-button reveal.
- Focus-visible: 2px outline (`accent`) — a11y-required.
- Tap/click: calls `open(item.id)`.
- On mobile: relies on native touch scroll — no custom swipe handler needed (matches user expectation, tested via demo mp4).

### 4.2 Fullscreen viewer

**Layout (mobile-first, scales up on desktop):**
- Fixed viewport, `100dvh` height (handles iOS URL bar correctly, unlike `100vh`).
- Video container: `max-width: calc(100dvh * 9/16)`, centered. Desktop shows black gutters left/right.
- Poster shown via `<Img>` during load. Once `<Video>` reports `ready`, it fades in via opacity transition (150ms).

**Header (top overlay):**
- Left: close (X) button — 38px circle, `rgba(255,255,255,.16)` + `backdrop-filter: blur(8px)`.
- Center: index counter — "`3 / 7`".
- Right: mute toggle — pill button, icon + "Sound on" / "Muted" label.

**Action rail (right side, bottom):**
- Vertical stack of `ImmersiveAction` items.
- Default actions: Like, Ask, Share (matches prototype).
- Fully overridable via `actions` prop or `<ImmersiveViewerActions>` slot.

**Caption card (bottom):**
- Brand mark + brand name + `·` + `item.kind`.
- Title (19px on desktop, 17px on mobile, bold).
- Caption (regular, 82% opacity).
- Animation: `translateY(16px → 0)` on becoming active; matches prototype.

**Progress bar (bottom edge):**
- Full-width 3px track. Live progress from `<Video>` `timeupdate`. On completion → auto-advance to next; hide auto-advance if at last item.

**"Swipe for next" hint:**
- Bottom-center, 55% opacity. Shows on first visit (dismisses after first swipe or 4s). Hidden when at last item.

### 4.3 Vertical pager (the critical part — see §1 pushback)

**Not scroll-snap.** Implementation is:

1. Container: `position:fixed; inset:0; overflow:hidden; touch-action: pan-y`.
2. Inner track: `transform: translate3d(0, -activeIndex * 100dvh, 0); transition: transform 320ms cubic-bezier(0.2, 0.8, 0.3, 1)`.
3. Render only `activeIndex - 1`, `activeIndex`, `activeIndex + 1` — three at a time. `<Video>` outside this window is unmounted (releases hls.js instance).
4. Gestures: pointer events (unified for touch/mouse/pen).
   - `pointerdown`: capture start.
   - `pointermove`: `translate3d(0, -activeIndex * H + deltaY, 0)`, no transition (real-time).
   - `pointerup`: decide.
     - If `|deltaY| > H * 0.2` OR `|velocity| > 0.5 px/ms`: commit to next/prev.
     - Otherwise: snap back.
   - Rubber-band at ends: `deltaY *= 0.35` when pulling past first/last.
5. Keyboard: ArrowUp/Left → prev, ArrowDown/Right → next, Escape → close, Space → toggle play/pause, M → mute toggle. (Prototype omits Space/M; I'm adding them as expected TikTok/Shorts behavior.)
6. Auto-advance: when active `<Video>` reaches end, call `next()`.

### 4.4 Playback rules

- **Active video plays. Neighbors are paused and time=0.** Enforced via effect on `activeIndex`.
- Initial mute state: **`true` by default** (autoplay policy — see §1 pushback #5). Configurable via `initiallyMuted` prop.
- Toggling mute: applies to *all* videos in the feed (single mute state, matches TikTok).
- Sound-on gesture: first tap on the mute button enables sound. Any user interaction counts as a gesture for the autoplay policy.
- **Fallback:** if the play promise rejects (iOS Safari blocks autoplay), emit `onAutoplayBlocked` and force a tap-to-play overlay on that video.

### 4.5 Scroll lock (body)
When viewer opens:
- Save `document.documentElement.style.overflow`, `document.body.style.overflow`.
- Save current `window.scrollY`.
- Apply `position: fixed; top: -scrollY; width: 100%; overflow: hidden` to body.
- On close: restore + `window.scrollTo(0, savedScrollY)`.
- This is the iOS-safe pattern (`overflow:hidden` alone doesn't work on iOS Safari <17).

## 5. Portal + CSS isolation

- Portal target: `document.body` (append at end).
- Root element: `<div class="psmi-root" data-psmi-scope="root">`.
- Root styles applied inline **and** via a scoped stylesheet injected once per page:
  ```css
  [data-psmi-scope="root"] {
    all: revert-layer;
    contain: layout paint style;
    isolation: isolate;
    z-index: 2147483000;
    position: fixed; inset: 0;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color-scheme: dark;
  }
  [data-psmi-scope="root"] * { box-sizing: border-box; }
  ```
- Every element under the root uses `psmi-*` class prefix to avoid consumer-side selector collisions.
- All layout-critical properties (position, transform, size, z-index, background) are set via inline `style`, not classes. If a consumer has `psmi-*` selectors of their own by coincidence, layout still holds.
- No global CSS variables assumed. All theming via `style` prop or `theme` prop.
- **Theme prop** (optional): `theme={{ accent: "#f39e1e", brandBg: "#182b4a", brandFg: "#fff" }}` — cascades to internal via CSS custom properties on the root.

## 6. Dependency & tree-shaking policy

- Peer: `react`, `react-dom` ≥ 17.
- Runtime dep: `@page-speed/img` (used for posters — takes advantage of AVIF/WebP and lazy loading).
- Runtime dep: `@page-speed/video` (used for actual video element with HLS support).
- **No** `framer-motion`, **no** `react-spring`, **no** `@radix-ui`, **no** `react-use-gesture`. Every gesture and animation is implemented with vanilla pointer events + CSS transforms. Rationale: keeps the bundle tiny (target: <15KB gzipped for the feed, <5KB gzipped for individual thumbnail primitives). Tree-shaking is meaningless if we ship 40KB of motion library.
- All internal imports use `.js` extensions in source (per the sibling repos' NodeNext resolution).
- `sideEffects: false`.
- Each of the per-subpath exports maps to a **single compiled file**, not a barrel. Consumers who only need `<ThumbnailCard>` should pay for `<ThumbnailCard>` only, not the whole feed.

## 7. Build & test

- Build: `tsc` → ESM `.js` + `.d.ts` in `dist/`, then `scripts/emit-cjs.js` copies to `.cjs`. (Same as `page-speed-img`/`video`. Boilerplate's `tsup.config.ts` will be removed.)
- Tests: `vitest` + `happy-dom` + `@testing-library/react` (same as siblings, no `jest-dom` — assertion style is `.toBeTruthy()` / `container.querySelector`).
- Tests will cover:
  - Public API smoke (exports present, correct types).
  - `<ImmersiveFeedProvider>` state transitions (open/close/next/prev/seek).
  - Thumbnail render + click → open.
  - Pager gesture math (unit test on the pure gesture reducer).
  - Scroll lock apply/restore.
  - Portal mount/unmount lifecycle (does not leak DOM nodes).
- Coverage target: ≥85% lines on state + hooks; visual components tested for structure only.

## 8. Explicit decisions on ambiguous prototype behavior

| Question | Decision | Rationale |
|---|---|---|
| Auto-advance at last video? | Stop, do not loop. | Matches TikTok when at end of user feed. Loop is easily added later. |
| "Swipe for next" hint at last item? | Hide. | Confusing otherwise. |
| Restore scroll position on close? | Yes. | Demo mp4 shows the user returns to a further-down page position. |
| Video autoplay initial state? | Muted. | Browser policy. Configurable. |
| Mute is per-video or global? | Global. | Matches TikTok. |
| Tap on video (not action button) does what? | Toggle play/pause. | Standard mobile-video convention. |
| Double-tap? | Not implemented in v0. | Prototype doesn't have it; can add later as `onDoubleTap` prop. |
| Sharing implementation? | Slot only, we don't call `navigator.share`. | Consumer decides. |
| Prefetch policy? | Poster for all items eagerly (small); video only for active + next. | Balances feel and bandwidth. |

## 9. File layout

```
src/
  index.ts                                # public re-exports
  core/
    index.ts
    ImmersiveFeed.tsx                     # convenience: provider + strip + viewer
    ImmersiveFeedProvider.tsx             # context + state
    ImmersiveViewer.tsx                   # fullscreen: pager + chrome
    ImmersiveViewerHeader.tsx
    ImmersiveViewerActions.tsx
    ImmersiveViewerCaption.tsx
  thumbnails/
    index.ts
    ThumbnailStrip.tsx
    ThumbnailCard.tsx
  hooks/
    index.ts
    useImmersiveFeed.ts
    useVerticalPagerGestures.ts
    useScrollLock.ts
    useResponsiveViewport.ts
    useMediaSessionMetadata.ts
  portal/
    index.ts
    ImmersivePortal.tsx                   # portal + scoped-reset stylesheet injection
    injectScopedStylesheet.ts
  utils/
    formatDuration.ts
    prefersReducedMotion.ts
    clamp.ts
  types/
    index.ts                              # MediaItem, ImmersiveAction, handles
  __tests__/
    ...
```

## 10. Non-goals (v0)

- No comments/threads UI (only Like/Ask/Share slots).
- No CDN/UMD build (can add later — sibling libs have one, but not needed for the first Toastability/app integration).
- No RSC/server-only exports beyond `"use client"` boundaries.
- No analytics events baked in — consumer wires via `onIndexChange`, `onOpen`, `onClose`, `onActionPress`.
- No advanced video processing (HLS is handled by `@page-speed/video`).
- No storybook / demo site in this repo (can add later).

## 11. Open questions

These are the specific things I want your call on before I write code:

1. **Naming.** I've used `<ImmersiveFeed>` / `<ImmersiveViewer>` / `<ThumbnailStrip>` / `<ThumbnailCard>`. Alternatives: `<Reels>` / `<ReelsViewer>` (matches prototype vocabulary) or `<VerticalVideoFeed>` / `<VerticalVideoViewer>` (most descriptive). Reels has trademark/association issues with Meta — I'd avoid it in a public npm package. Preference?
2. **Composability escape hatch.** Should we also expose lower-level `<VerticalPager>` as a generic component (any children, not just videos)? Some client features might want this. My default: yes, but not v0 — ship it in v0.2 if a need appears.
3. **Default actions.** The prototype shows Like / Ask / Share. Should the library ship these as *defaults* (with no-op handlers + warnings if not overridden), or ship *no defaults* and require the consumer to always pass an `actions` array? I lean towards no defaults — forces the consumer to think about them.
4. **Theme system.** I'm proposing a small `theme` prop with CSS-custom-property fallbacks. Do you want to wire it to `@page-speed/skins` (the skin system `@page-speed/video` uses) instead, so themes are shared across the ecosystem?
5. **HLS + `<Video>` autoplay.** `@page-speed/video` uses `preferNativeControls: true` by default. For the immersive feed we want native controls hidden and our own chrome. I'll pass `preferNativeControls={false}` and use the `skinClasses` mechanism. Confirm this is the right coupling, or would you prefer we render `<VideoPlayer>` directly and manage HLS ourselves?
