import { useEffect, useRef } from "react";

/**
 * Register keyboard shortcuts as a `{ key: handler }` map.
 *
 * Signature intentionally matches `@page-speed/lightbox`'s
 * `useKeyboardShortcuts` so the two libraries feel identical to consumers.
 * Not imported from lightbox to keep this library dependency-free.
 *
 * Handlers receive the raw `KeyboardEvent`; call `preventDefault()` inside
 * the handler to stop native behavior (e.g. Space page scroll).
 */
export function useKeyboardShortcuts(
  shortcuts: Record<string, (e: KeyboardEvent) => void>,
  enabled: boolean = true,
): void {
  // Store shortcuts in a ref so callers can pass inline object literals
  // without forcing a re-subscribe on every render.
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      const handler = shortcutsRef.current[e.key];
      if (handler) handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
