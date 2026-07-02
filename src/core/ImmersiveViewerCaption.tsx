"use client";

import React from "react";
import type { MediaItem } from "../types/index.js";

/**
 * Props for the bottom caption card.
 */
export interface ImmersiveViewerCaptionProps {
  item: MediaItem;
  /** Displayed as the brand chip. Consumers should override for non-Encapsa uses. */
  brandName?: string;
  /** Optional brand icon override. Defaults to a generic sparkle mark. */
  brandIcon?: React.ReactNode;
  /** Whether an actions rail is present. When true, we reserve right padding. */
  hasActionsRail?: boolean;
}

const DEFAULT_BRAND_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.8 4.9L18.7 9l-4.9 1.8L12 16l-1.8-5.2L5.3 9z" />
  </svg>
);

/**
 * Bottom caption card of the fullscreen viewer.
 */
export function ImmersiveViewerCaption({
  item,
  brandName,
  brandIcon = DEFAULT_BRAND_ICON,
  hasActionsRail = false,
}: ImmersiveViewerCaptionProps) {
  return (
    <div
      style={{
        position: "absolute",
        left: 16,
        right: hasActionsRail ? 78 : 16,
        bottom: 34,
        color: "var(--psmi-chrome-fg, #fff)",
        zIndex: 2,
      }}
    >
      {(brandName || item.kind) && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
          {brandName ? (
            <>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "var(--psmi-brand-bg, #182b4a)",
                  color: "var(--psmi-accent, #f39e1e)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {brandIcon}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{brandName}</span>
            </>
          ) : null}
          {item.kind ? (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
              {brandName ? "· " : ""}
              {item.kind}
            </span>
          ) : null}
        </div>
      )}
      {/*
        Inline badge — mobile only (.psmi-badge-inline is display:none on
        wide viewports; the top-left corner badge shows there instead).
        Sits between the brand row and the title, matching the annotated
        design: on phones the top-left corner is occupied by the close
        button, so this is where the category chip lives.
      */}
      {item.badge ? (
        <div
          className="psmi-badge-inline"
          style={{
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: 999,
            background: "rgba(8,12,24,0.5)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            marginBottom: 8,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--psmi-accent, #f39e1e)",
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.07em",
              color: "#fff",
            }}
          >
            {item.badge}
          </span>
        </div>
      ) : null}
      <div
        style={{
          fontSize: 19,
          fontWeight: 700,
          lineHeight: 1.25,
          textShadow: "0 2px 8px rgba(0,0,0,0.5)",
        }}
      >
        {item.title}
      </div>
      {item.caption ? (
        <div
          style={{
            fontSize: 13.5,
            color: "rgba(255,255,255,0.82)",
            marginTop: 6,
            lineHeight: 1.45,
            textShadow: "0 1px 6px rgba(0,0,0,0.5)",
          }}
        >
          {item.caption}
        </div>
      ) : null}
    </div>
  );
}
