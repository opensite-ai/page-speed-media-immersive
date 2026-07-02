"use client";

import React from "react";

/**
 * Props for the fullscreen viewer top bar.
 */
export interface ImmersiveViewerHeaderProps {
  /** 1-based active index for display ("3 / 7"). */
  activeIndex1Based: number;
  /** Total items. */
  total: number;
  /** Current mute state. */
  muted: boolean;
  /** Called when the close button is pressed. */
  onClose: () => void;
  /** Called when the mute toggle is pressed. */
  onToggleMute: () => void;
  /** Label overrides for i18n. */
  labels?: {
    close?: string;
    soundOn?: string;
    muted?: string;
  };
}

const DEFAULT_LABELS = {
  close: "Close",
  // Labels are STATE-oriented, not action-oriented, so what the user
  // reads matches what they hear:
  //   soundOn  = audio is currently ON  (button shows a speaker — click to mute)
  //   muted    = audio is currently OFF (button shows a muted speaker — click to unmute)
  // This mirrors TikTok / Reels / Shorts and eliminates the pre-v0.3.5
  // confusion where the label read as the ACTION the button would take.
  soundOn: "Sound on",
  muted: "Muted",
};

/**
 * Top chrome of the fullscreen viewer: close button (left), index counter
 * (center), mute toggle (right).
 *
 * Exported so consumers can override it via the `header` prop on
 * `<ImmersiveViewer>` when they need custom chrome.
 */
export function ImmersiveViewerHeader({
  activeIndex1Based,
  total,
  muted,
  onClose,
  onToggleMute,
  labels,
}: ImmersiveViewerHeaderProps) {
  const L = { ...DEFAULT_LABELS, ...labels };
  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        left: 12,
        right: 12,
        display: "flex",
        alignItems: "center",
        gap: 10,
        zIndex: 3,
        pointerEvents: "none",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={L.close}
        style={{
          pointerEvents: "auto",
          width: 38,
          height: 38,
          border: "none",
          borderRadius: "50%",
          background: "var(--psmi-chrome-bg, rgba(255,255,255,0.16))",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          color: "var(--psmi-chrome-fg, #fff)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/*
        Spacer only — the media counter ("3 / 7") is rendered separately at
        the bottom-right of the video viewport (see <ImmersiveViewer>), where
        it stays legible against varying video backgrounds and hides on
        mobile via the .psmi-counter media query in the scoped stylesheet.
      */}
      <div style={{ flex: 1 }} />

      <button
        type="button"
        onClick={onToggleMute}
        // State-oriented labeling: label reflects the CURRENT audio state.
        // muted=true  → aria-label="Muted"   (audio is off)
        // muted=false → aria-label="Sound on" (audio is on)
        // aria-pressed reflects whether the mute FEATURE is engaged.
        aria-label={muted ? L.muted : L.soundOn}
        aria-pressed={muted}
        style={{
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "0 14px 0 6px",
          height: 38,
          border: "none",
          borderRadius: 999,
          background: "var(--psmi-chrome-bg, rgba(255,255,255,0.16))",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          color: "var(--psmi-chrome-fg, #fff)",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.16)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {muted ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9H3v6h3l5 4z" />
              <line x1="22" y1="9" x2="16" y2="15" />
              <line x1="16" y1="9" x2="22" y2="15" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9H3v6h3l5 4z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path d="M18.5 5.5a9 9 0 0 1 0 13" />
            </svg>
          )}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{muted ? L.muted : L.soundOn}</span>
      </button>
    </div>
  );
}
