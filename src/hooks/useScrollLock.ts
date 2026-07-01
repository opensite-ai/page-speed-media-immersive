import { useEffect } from "react";

/**
 * Lock body scroll while `active` is `true`. Restores the previous scroll
 * position and inline styles on release.
 *
 * iOS-safe: uses the `position: fixed; top: -scrollY` technique because
 * `overflow: hidden` alone does not prevent scroll on iOS Safari.
 *
 * SSR-safe: no-op when `document` is undefined.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof document === "undefined") return;

    const body = document.body;
    const html = document.documentElement;

    const originalBodyStyle = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    const originalHtmlOverflow = html.style.overflow;
    const scrollY = window.scrollY || window.pageYOffset || 0;

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";

    return () => {
      body.style.position = originalBodyStyle.position;
      body.style.top = originalBodyStyle.top;
      body.style.left = originalBodyStyle.left;
      body.style.right = originalBodyStyle.right;
      body.style.width = originalBodyStyle.width;
      body.style.overflow = originalBodyStyle.overflow;
      html.style.overflow = originalHtmlOverflow;
      // Restore scroll position atomically (no smooth behavior).
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
