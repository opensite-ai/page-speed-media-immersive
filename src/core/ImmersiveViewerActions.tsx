"use client";

import React from "react";
import type { ActionContext, ImmersiveAction, MediaItem } from "../types/index.js";

export interface ImmersiveViewerActionsProps {
  item: MediaItem;
  actions: ImmersiveAction[];
  context: ActionContext;
}

/**
 * Right-side action rail (Like / Ask / Share style).
 *
 * The library ships **no default actions** — consumers pass whatever they
 * need. Restaurants might pass Order/Save/Directions; charter schools might
 * pass Bookmark/Ask/Notes; a marketing site might pass Like/Comment/Share.
 *
 * Returns `null` when `actions` is empty so the caption gets full width.
 */
export function ImmersiveViewerActions({
  item,
  actions,
  context,
}: ImmersiveViewerActionsProps) {
  if (!actions || actions.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        right: 11,
        bottom: 135,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
        color: "var(--psmi-chrome-fg, #fff)",
        zIndex: 3,
      }}
    >
      {actions.map((action) => {
        const active = action.active ? action.active(item) : false;
        const icon =
          typeof action.icon === "function"
            ? action.icon({ active })
            : action.icon;
        const label =
          typeof action.label === "function"
            ? action.label({ active })
            : action.label;
        const ariaLabel =
          action.ariaLabel ??
          (typeof label === "string" ? label : action.id);
        return (
          <button
            key={action.id}
            type="button"
            aria-label={ariaLabel}
            aria-pressed={action.active ? active : undefined}
            onClick={(e) => {
              e.stopPropagation();
              action.onPress(item, context);
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              padding: 0,
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            <span
              style={{
                width: 46,
                height: 46,
                borderRadius: "50%",
                background: "var(--psmi-chrome-bg, rgba(255,255,255,0.14))",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "transform 0.18s ease, background 0.18s ease",
              }}
            >
              {icon}
            </span>
            {label != null && label !== "" ? (
              <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
