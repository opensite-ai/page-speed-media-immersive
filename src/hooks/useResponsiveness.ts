import { useEffect, useState } from "react";

/**
 * Coarse breakpoint classifier used across the OpenSite media stack.
 *
 * Kept internal to `@page-speed/media-immersive` (rather than importing from
 * `@page-speed/lightbox`) so this library remains dependency-free at runtime.
 * The shape intentionally mirrors `@page-speed/lightbox` so consumers who
 * already know one library know the other.
 */
export type Breakpoint = "mobile" | "tablet" | "desktop";

export interface ResponsivenessInfo {
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

/**
 * SSR-safe breakpoint hook. Returns `"desktop"` on the server and hydrates
 * to the actual viewport size on mount. Updates on window resize.
 */
export function useResponsiveness(): ResponsivenessInfo {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const w = window.innerWidth;
      if (w < 768) setBreakpoint("mobile");
      else if (w < 1024) setBreakpoint("tablet");
      else setBreakpoint("desktop");
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return {
    breakpoint,
    isMobile: breakpoint === "mobile",
    isTablet: breakpoint === "tablet",
    isDesktop: breakpoint === "desktop",
  };
}
