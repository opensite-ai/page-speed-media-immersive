# @page-speed/media-immersive

TikTok / Reels / Shorts-style vertical video feed for React, portalled with CSS isolation so it renders correctly inside arbitrary customer sites. Built on `@page-speed/img` and `@page-speed/video`.

- **Portal-isolated fullscreen viewer** — `Portal + all: revert-layer` so consumer CSS cannot leak in.
- **Pointer-driven vertical pager** — transform + spring, not CSS scroll-snap. Works around iOS Safari address-bar snap bugs.
- **Native-feeling swipe** — pointer events, rubber-band at ends, velocity + distance thresholds.
- **HLS with mp4 fallback** — delegates to `@page-speed/video`, which decides the optimal source at runtime.
- **iOS-safe body scroll lock** with `position:fixed` restore, not just `overflow:hidden`.
- **Zero-defaults action rail.** No coupling to Toastability / any specific consumer.
- **Tree-shakable per-subpath exports** — pull in only what you use.
- **SSR-safe** — no browser API access during server render.
- **Full keyboard support** — `↑↓←→`, `Space`, `M`, `Esc`.
- **`prefers-reduced-motion`** — animations disabled when the user requests it.

## Install

```bash
pnpm add @page-speed/media-immersive @page-speed/img @page-speed/video react react-dom
```

`@page-speed/img` and `@page-speed/video` are runtime dependencies. React ≥17 is a peer dependency.

## The 60-second version

```tsx
import { ImmersiveFeed } from "@page-speed/media-immersive";

const items = [
  {
    id: "intro",
    poster: "https://cdn.example.com/reel-1.jpg",
    src: "https://cdn.example.com/reel-1.mp4",
    badge: "INTRO",
    kind: "Welcome",
    title: "Meet Encapsa — your site, built by AI",
    caption: "A 90-second tour of everything we just researched, wrote and designed for you.",
    durationMs: 92000,
  },
  // ...
];

export function Page() {
  return (
    <ImmersiveFeed
      items={items}
      onIndexChange={(i, item) => analytics.track("reel_view", { id: item.id })}
    />
  );
}
```

This renders a horizontal thumbnail carousel where the user is, and portals a fullscreen viewer to `document.body` when a card is tapped.

## Three composition patterns

### 1. Carousel + viewer (default)

```tsx
<ImmersiveFeed items={items} variant="carousel" />
```

### 2. Controlled — trigger from anywhere on the page

```tsx
import { useRef } from "react";
import { ImmersiveFeed, ThumbnailCard } from "@page-speed/media-immersive";
import type { ImmersiveFeedHandle } from "@page-speed/media-immersive";

function Page() {
  const feedRef = useRef<ImmersiveFeedHandle>(null);
  return (
    <>
      {/* Trigger UI can live anywhere */}
      <ThumbnailCard
        item={heroItem}
        size="hero"
        onOpen={(id) => feedRef.current?.open(id)}
      />

      {/* Viewer is portalled from here — nothing rendered inline */}
      <ImmersiveFeed ref={feedRef} items={items} variant="controlled" />
    </>
  );
}
```

### 3. Fully custom composition

```tsx
import {
  ImmersiveFeedProvider,
  ThumbnailStrip,
  ThumbnailCard,
  ImmersiveViewer,
  useImmersiveFeed,
} from "@page-speed/media-immersive";

function MyMenu() {
  return (
    <ImmersiveFeedProvider items={menuVideos}>
      <div className="menu-grid">
        {menuVideos.map((v) => (
          <MyMenuTile key={v.id} item={v} />
        ))}
      </div>
      <ImmersiveViewer brandName="Carlos O'Brien's" />
    </ImmersiveFeedProvider>
  );
}

function MyMenuTile({ item }) {
  const { open } = useImmersiveFeed();
  return (
    <ThumbnailCard item={item} onOpen={open} size="hero" />
  );
}
```

## The `MediaItem` shape

Every consumer works with a `MediaItem[]`. Only three fields are required.

```ts
interface MediaItem {
  id: string;                    // stable id
  poster: string;                // video: thumbnail URL — image: the image itself
  title: string;                 // shown on card overlay + fullscreen caption

  type?: "video" | "image";      // defaults to "video" when omitted

  // At least one video source (any/all — @page-speed/video picks).
  // Ignored when type: "image":
  src?: string;                  // progressive mp4 or transform URL
  masterPlaylistUrl?: string;    // pre-computed HLS master
  fallbackSrc?: string;          // progressive mp4 fallback

  // Optional display metadata
  badge?: string;                // "INTRO", "PRODUCT TOUR", ...
  kind?: string;                 // "Demo", "Testimonial", ...
  caption?: string;              // long caption (fullscreen only)
  durationMs?: number;           // video only; pre-computed or read from metadata
  durationLabel?: string;        // video only; pre-formatted, else from durationMs

  // Free-form consumer metadata (analytics, order ids, lesson refs, ...)
  meta?: Record<string, unknown>;
}
```

## Image items

Set `type: "image"` to mix stills into the feed. `poster` **is** the image; it
renders full-bleed via `@page-speed/img` and shares the video slide's 9:16
layout and letterboxing. All video chrome is suppressed for image slides — the
mute pill, progress bar, playback glyph/spinner, and autoplay watchdogs — and
image slides never auto-advance (navigate them manually, IG-style). Navigation,
header, caption, and the actions rail behave identically to video slides. All
video-only fields (`src`, `masterPlaylistUrl`, `fallbackSrc`, `durationMs`,
`durationLabel`) are ignored.

```tsx
const items = [
  { id: "clip", poster: "/reel-1.jpg", src: "/reel-1.mp4", title: "The tour" },
  { id: "shot", type: "image", poster: "/photo-2.jpg", title: "On location" },
];

<ImmersiveFeed items={items} />
```

## Thumbnail card props for social-feed layouts

`<ThumbnailCard>` (and, where noted, `<ThumbnailStrip>`) support IG-style tiles:

| Prop | Type | Default | Notes |
|---|---|---|---|
| `badgeSlot` | `React.ReactNode` | — | **Replaces** the built-in `item.badge` chip with a caller-owned, unstyled slot in the same top-left position (e.g. a like-count badge). |
| `showDuration` | `boolean` | `true` | `false` removes the duration label (and its audio-bars glyph) while keeping the title. Not the same as `hideCaption`. Forwarded by `ThumbnailStrip`. Image items never show a duration. |
| `glyphMode` | `"always" \| "hover" \| "none"` | `"always"` | `"always"` = pre-0.5 behavior (hover reveal on pointer, always-on for touch). `"hover"` reveals only on mouse-hover or keyboard focus and stays hidden on touch (the whole card is the tap target). `"none"` renders no glyph. The glyph icon auto-selects: a play triangle for videos, an expand icon for images. Forwarded by `ThumbnailStrip`. |
| `size` | `"sm" \| "md" \| "hero" \| "ig" \| number` | `"md"` | The `"ig"` preset (264px) is a vertical 9:16 tile larger than the client-portal presets. |

Per-item slots such as `badgeSlot` are card-level, not strip-level — supply them
via `<ThumbnailStrip renderItem={...}>`.

## Actions rail (the right-side buttons)

**There are no default actions.** You must pass your own. Different consumers want very different action sets — a restaurant menu wants `Order`/`Directions`/`Save`; a charter school wants `Bookmark`/`Ask`/`Notes`; a marketing site wants `Like`/`Comment`/`Share`.

```tsx
const actions = [
  {
    id: "like",
    icon: ({ active }) => (active ? <HeartFilled /> : <HeartOutline />),
    label: ({ active }) => (active ? "Liked" : "Like"),
    active: (item) => likedIds.has(item.id),
    onPress: (item) => toggleLike(item.id),
  },
  {
    id: "share",
    icon: <ShareIcon />,
    label: "Share",
    onPress: async (item) => {
      if (navigator.share) await navigator.share({ url: item.meta?.shareUrl });
    },
  },
];

<ImmersiveFeed items={items} actions={actions} />
```

Leave `actions` unset (or `[]`) and the rail renders nothing; the caption expands to full width.

## Theming

Theme is applied via CSS custom properties on the portal root. Every field is optional.

```tsx
<ImmersiveFeed
  items={items}
  theme={{
    accent: "#f39e1e",
    brandBg: "#182b4a",
    brandFg: "#ffffff",
    viewerBg: "#05070d",
    chromeBg: "rgba(255,255,255,0.16)",
    chromeFg: "#ffffff",
    fontFamily: "Inter, system-ui, sans-serif",
  }}
/>
```

If you already use `@page-speed/skins`, pass token values directly here — no dependency required.

## Autoplay policy

Modern browsers refuse **unmuted** autoplay without a prior user gesture. Because of this, `initiallyMuted` defaults to `true`. When the browser refuses playback anyway (some iOS Safari edge cases), the library fires `onAutoplayBlocked(item)` so you can render a tap-to-play affordance. The built-in mute toggle acts as a user gesture, so the first tap enables sound for the whole session.

```tsx
<ImmersiveFeed
  items={items}
  initiallyMuted={true}
  onAutoplayBlocked={(item) => showTapToPlayHint(item.id)}
/>
```

## Keyboard controls

| Key | Action |
|---|---|
| `↑` / `←` | Previous video |
| `↓` / `→` | Next video |
| `Space` | Play / pause active video |
| `M` | Toggle mute (whole feed) |
| `Esc` | Close viewer |

Handlers use the same `useKeyboardShortcuts` shape as `@page-speed/lightbox`, exported as a hook so you can extend them:

```tsx
import { useKeyboardShortcuts } from "@page-speed/media-immersive/hooks";

useKeyboardShortcuts({
  L: () => toggleLike(currentItem.id),
}, viewerIsOpen);
```

## CSS isolation model (important for embedded use cases)

`<ImmersiveViewer>` portals its DOM into `document.body` and wraps it in `data-psmi-scope="root"` with `all: revert-layer` + a scoped stylesheet. Every internal class is prefixed `psmi-*`. **Every layout-critical property is applied inline**, so if the injected stylesheet is blocked or fails, the viewer still positions correctly — only decorative polish disappears.

**What this protects against:**
- Consumer `overflow:hidden` / `transform:scale` on ancestors (portal escapes them).
- Consumer's `body`/global resets bleeding into our scope (`all: revert-layer`).
- z-index stacking issues (root sits at `z-index: 2147483000`).

**What this does *not* protect against:**
- Consumer CSS using `!important` targeting body descendants unconditionally. If you're integrating into a site with hostile CSS, wrap the whole app in a container element and target styles by that container, or reach out about a Shadow DOM adapter.

## Tree-shaking

Each subpath in the `exports` map compiles to a **single file** (not a barrel):

```ts
import { ImmersiveFeed }    from "@page-speed/media-immersive";
import { ThumbnailCard }    from "@page-speed/media-immersive/thumbnails/card";
import { useKeyboardShortcuts } from "@page-speed/media-immersive/hooks";
import { ImmersivePortal }  from "@page-speed/media-immersive/portal";
```

Bundlers that respect `"sideEffects": false` drop unused entry points entirely.

## Full prop reference

See the type definitions — every prop has JSDoc:

- [`ImmersiveFeedProps`](./src/core/ImmersiveFeed.tsx)
- [`ImmersiveFeedProviderProps`](./src/core/ImmersiveFeedProvider.tsx)
- [`ImmersiveViewerProps`](./src/core/ImmersiveViewer.tsx)
- [`ThumbnailCardProps`](./src/thumbnails/ThumbnailCard.tsx)
- [`ThumbnailStripProps`](./src/thumbnails/ThumbnailStrip.tsx)
- [`MediaItem`, `ImmersiveAction`, `ImmersiveTheme`](./src/types/index.ts)

## Contributing

- `pnpm install` — install
- `pnpm build` — tsc → ESM + CJS pairs
- `pnpm test` — vitest (happy-dom)
- `pnpm typecheck` — no-emit type check

See [AGENTS.md](./AGENTS.md) for AI-agent contribution guidance, architectural invariants, and the reasoning behind the pointer-based pager and CSS isolation choices.

## License

BSD-3-Clause. Copyright OpenSite AI.
