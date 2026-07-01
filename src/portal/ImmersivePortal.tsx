"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ImmersiveTheme } from "../types/index.js";
import { injectScopedStylesheet } from "./injectScopedStylesheet.js";

/**
 * Props for the portal root element.
 */
export interface ImmersivePortalProps {
  /** Content to render inside the portal. */
  children: React.ReactNode;
  /** Theme applied via CSS custom properties on the portal root. */
  theme?: ImmersiveTheme;
  /**
   * Custom mount container. Defaults to `document.body`. Consumers with an
   * app-shell that requires a specific mount point (e.g. modals inside a
   * transform-scaled parent) may pass a different node.
   */
  container?: HTMLElement | null;
  /** Optional class name applied to the portal root. */
  className?: string;
  /** Optional aria label for the root element. */
  ariaLabel?: string;
}

/**
 * Portal for the immersive viewer's UI.
 *
 * - Portals children into `document.body` by default so viewer chrome is not
 *   trapped by `overflow:hidden` / stacking-context / transform-scaled ancestors.
 * - Applies `data-psmi-scope="root"` + `all: revert-layer` for consumer-CSS isolation.
 * - Injects a small stylesheet once per page for animation keyframes.
 * - SSR-safe: renders `null` until mounted on the client.
 *
 * The portal is intentionally always in the DOM when this component is rendered.
 * Callers (typically `<ImmersiveViewer>`) decide when to render this component
 * — the portal itself does not have an "open" state.
 */
export function ImmersivePortal({
  children,
  theme,
  container,
  className,
  ariaLabel,
}: ImmersivePortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    injectScopedStylesheet();
    setMounted(true);
  }, []);

  if (!mounted) return null;
  const target = container ?? (typeof document !== "undefined" ? document.body : null);
  if (!target) return null;

  const themeVars: Record<string, string> = {};
  if (theme) {
    if (theme.accent) themeVars["--psmi-accent"] = theme.accent;
    if (theme.brandBg) themeVars["--psmi-brand-bg"] = theme.brandBg;
    if (theme.brandFg) themeVars["--psmi-brand-fg"] = theme.brandFg;
    if (theme.viewerBg) themeVars["--psmi-viewer-bg"] = theme.viewerBg;
    if (theme.chromeBg) themeVars["--psmi-chrome-bg"] = theme.chromeBg;
    if (theme.chromeFg) themeVars["--psmi-chrome-fg"] = theme.chromeFg;
    if (theme.fontFamily) themeVars["--psmi-font-family"] = theme.fontFamily;
  }

  return createPortal(
    <div
      data-psmi-scope="root"
      className={className}
      aria-label={ariaLabel}
      style={{
        position: "fixed",
        inset: 0,
        // Highest practical value while staying safely below max-int (2^31-1).
        zIndex: 2147483000,
        ...themeVars,
      }}
    >
      {children}
    </div>,
    target,
  );
}
