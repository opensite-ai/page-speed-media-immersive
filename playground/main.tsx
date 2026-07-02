// Playground / repro harness for the "randomly muted" bug.
//
// Mirrors the dt-cms /website/status integration:
//   - <ImmersiveFeedProvider items={...}> wrapping the page
//   - thumbnails that call open(id) from a click
//   - ?chaos=1 (default): the provider re-renders every 800ms with a FRESH
//     items array identity (same data), exactly like the SSE-driven status
//     page whose buildPlaceholder() creates new MediaItem objects per render.
//   - ?chaos=0: stable items identity, for control runs.
//
// Diagnostic instrumentation: every write to HTMLMediaElement.muted is
// logged with a short stack trace so we can see exactly WHO flips the flag.

import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ImmersiveFeedProvider,
  ImmersiveViewer,
  useImmersiveFeed,
} from "../src/index.js";
import type { MediaItem } from "../src/index.js";

// ─── instrumentation ────────────────────────────────────────────────────────

interface MuteLogEntry {
  t: number;
  value: boolean;
  stack: string;
}

declare global {
  interface Window {
    __muteLog: MuteLogEntry[];
    __videoStates: () => Array<Record<string, unknown>>;
  }
}

window.__muteLog = [];

const mutedDesc = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "muted",
)!;
Object.defineProperty(HTMLMediaElement.prototype, "muted", {
  configurable: true,
  get: mutedDesc.get,
  set(this: HTMLMediaElement, v: boolean) {
    const stack = (new Error().stack ?? "")
      .split("\n")
      .slice(2, 6)
      .map((l) => l.trim())
      .join(" <- ");
    window.__muteLog.push({ t: performance.now(), value: v, stack });
    console.log(`[MUTE-SET] ${v} :: ${stack}`);
    mutedDesc.set!.call(this, v);
  },
});

for (const type of [
  "playing",
  "pause",
  "volumechange",
  "canplay",
  "loadedmetadata",
  "waiting",
  "ended",
]) {
  document.addEventListener(
    type,
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLVideoElement)) return;
      console.log(
        `[EVT ${type}] muted=${el.muted} paused=${el.paused} rs=${el.readyState} src=…${el.currentSrc.slice(-10)}`,
      );
    },
    true,
  );
}

window.__videoStates = () =>
  Array.from(document.querySelectorAll("video")).map((v) => ({
    muted: v.muted,
    paused: v.paused,
    readyState: v.readyState,
    currentTime: Number(v.currentTime.toFixed(2)),
    src: v.currentSrc.slice(-10),
  }));

// ─── data (same public S3 assets the dashboard uses) ────────────────────────

const ASSETS = [
  {
    videoUrl:
      "https://toastability-production.s3.amazonaws.com/6sjz22neh3fa9oaf7s0p1jnzqaxi",
    posterUrl:
      "https://toastability-production.s3.amazonaws.com/k3cjuzl3eij10cf8jmou1f8hr7vu",
  },
  {
    videoUrl:
      "https://toastability-production.s3.amazonaws.com/nxg2psduqy7arsy0zz64qh0elbco",
    posterUrl:
      "https://toastability-production.s3.amazonaws.com/7fjf2qh245meawh7nghxuhhlp518",
  },
  {
    videoUrl:
      "https://toastability-production.s3.amazonaws.com/89cyariibnkb33tlx84y3w39u5mu",
    posterUrl:
      "https://toastability-production.s3.amazonaws.com/4p2lzvo5nsamw1xppj767srdpgym",
  },
  {
    videoUrl:
      "https://toastability-production.s3.amazonaws.com/swozrg5bhu738oh6xaftxbt3d5x4",
    posterUrl:
      "https://toastability-production.s3.amazonaws.com/atw5icwifd2o8rp9r5n78v2z61uu",
  },
  {
    videoUrl:
      "https://toastability-production.s3.amazonaws.com/x6c94mqbjpqx7r2scbyj5si3bw6f",
    posterUrl:
      "https://toastability-production.s3.amazonaws.com/8px5fzcpc3p3pzy28fzoiq2zr1mp",
  },
];

// Mirrors buildPlaceholder(): a FRESH array of FRESH objects on every call.
function buildItems(): MediaItem[] {
  return ASSETS.map((a, i) => ({
    id: `reel-${i}`,
    src: a.videoUrl,
    poster: a.posterUrl,
    badge: `REEL ${i + 1}`,
    kind: "Playground",
    title: `Playground reel ${i + 1}`,
    caption: "Repro harness for the muted-audio race.",
    durationMs: 30_000,
  }));
}

const STABLE_ITEMS: MediaItem[] = buildItems();

// ─── app ─────────────────────────────────────────────────────────────────────

const params = new URLSearchParams(location.search);
const CHAOS = params.get("chaos") !== "0";
const TICK_MS = Number(params.get("tickMs") ?? 800);

function Grid() {
  const feed = useImmersiveFeed();
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: 24 }}>
      {feed.items.map((it) => (
        <button
          key={it.id}
          data-testid={`thumb-${it.id}`}
          onClick={() => feed.open(it.id)}
          style={{
            padding: "18px 16px",
            borderRadius: 10,
            border: "1px solid #2a3145",
            background: "#141a2b",
            color: "#fff",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          ▶ {it.title}
        </button>
      ))}
    </div>
  );
}

function App() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!CHAOS) return;
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // CHAOS mode reproduces the dashboard's anti-pattern: new identity per render.
  const items = CHAOS ? buildItems() : STABLE_ITEMS;

  return (
    <ImmersiveFeedProvider
      items={items}
      onAutoplayBlocked={(it) => console.log(`[AUTOPLAY-BLOCKED] ${it.id}`)}
    >
      <div style={{ padding: "16px 24px", fontSize: 13, color: "#8b93a7" }}>
        mode: {CHAOS ? `CHAOS (items identity changes every ${TICK_MS}ms)` : "STABLE"} · render tick:{" "}
        <span data-testid="tick">{tick}</span>
      </div>
      <Grid />
      <ImmersiveViewer brandName="Playground" />
    </ImmersiveFeedProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
