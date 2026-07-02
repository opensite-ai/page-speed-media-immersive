const STYLE_ID = "psmi-scoped-styles";

/**
 * The library's minimal scoped stylesheet. Prefixed selectors ensure zero
 * collision with consumer CSS. Every rule targets a `data-psmi-scope="root"`
 * ancestor, so nothing leaks outside the portal.
 *
 * Layout-critical properties (position, size, transform, z-index) are also
 * applied inline in components, so this stylesheet failing to load never
 * breaks the viewer — only the reset polish disappears.
 */
const SCOPED_CSS = `
[data-psmi-scope="root"] {
  all: revert-layer;
  contain: layout paint style;
  isolation: isolate;
  color-scheme: dark;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-family: var(--psmi-font-family, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
}
[data-psmi-scope="root"] * { box-sizing: border-box; }
[data-psmi-scope="root"] button { -webkit-tap-highlight-color: transparent; }
[data-psmi-scope="root"] .psmi-scrollhide { scrollbar-width: none; -ms-overflow-style: none; }
[data-psmi-scope="root"] .psmi-scrollhide::-webkit-scrollbar { display: none; width: 0; height: 0; }
[data-psmi-scope="root"] .psmi-kb { animation: psmi-kenburns 17s ease-in-out infinite alternate; }
[data-psmi-scope="root"] .psmi-eq { display: inline-flex; align-items: flex-end; gap: 2px; height: 10px; }
[data-psmi-scope="root"] .psmi-eq i { display: block; width: 2.5px; height: 100%; background: currentColor; border-radius: 2px; transform-origin: bottom; animation: psmi-eq 0.85s ease-in-out infinite; }
[data-psmi-scope="root"] .psmi-eq i:nth-child(2) { animation-delay: 0.18s; }
[data-psmi-scope="root"] .psmi-eq i:nth-child(3) { animation-delay: 0.36s; }
[data-psmi-scope="root"] .psmi-eq i:nth-child(4) { animation-delay: 0.5s; }
[data-psmi-scope="root"] .psmi-fade-in { animation: psmi-fadein 0.28s ease; }
@keyframes psmi-kenburns {
  0% { transform: scale(1) translate(0,0); }
  100% { transform: scale(1.06) translate(-1%, -0.5%); }
}
@keyframes psmi-eq {
  0%, 100% { transform: scaleY(0.35); }
  50% { transform: scaleY(1); }
}
@keyframes psmi-fadein {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  [data-psmi-scope="root"] .psmi-kb,
  [data-psmi-scope="root"] .psmi-eq i,
  [data-psmi-scope="root"] .psmi-fade-in {
    animation: none !important;
  }
}
/* Media counter ("3 / 7") is decorative on phones — the swipe hint already
   communicates that there are more videos, and the counter eats caption space.
   540px is the same coarse breakpoint we use for the thumbnail strip layout. */
@media (max-width: 540px) {
  [data-psmi-scope="root"] .psmi-counter { display: none; }
}
/* Desktop-only up/down chevron pager. Touch devices swipe instead — the
   chevrons would just consume space and steal the tap target. */
@media (hover: none), (max-width: 540px) {
  [data-psmi-scope="root"] .psmi-chevrons { display: none !important; }
}
/* Thumbnail carousel styles (also scoped so they can be applied within a
   consumer page - the thumbnail primitives use data-psmi-scope="strip"). */
[data-psmi-scope="strip"] .psmi-strip {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 3px 3px 9px;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;
}
[data-psmi-scope="strip"] .psmi-strip::-webkit-scrollbar { height: 6px; }
[data-psmi-scope="strip"] .psmi-strip::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.15);
  border-radius: 6px;
  border: 2px solid transparent;
  background-clip: content-box;
}
[data-psmi-scope="strip"] .psmi-card {
  transition: transform 0.18s cubic-bezier(0.2,0.8,0.3,1), box-shadow 0.2s ease;
  scroll-snap-align: start;
}
@media (hover: hover) {
  [data-psmi-scope="strip"] .psmi-card:hover { transform: translateY(-3px); box-shadow: 0 10px 26px rgba(16,24,40,0.24); }
  [data-psmi-scope="strip"] .psmi-card:hover .psmi-play-btn { transform: scale(1); opacity: 1; }
  [data-psmi-scope="strip"] .psmi-card:hover .psmi-play-hover { background: rgba(8,12,24,0.32); }
}
[data-psmi-scope="strip"] .psmi-card:focus-visible {
  outline: 2px solid var(--psmi-accent, #f39e1e);
  outline-offset: 2px;
}
[data-psmi-scope="strip"] .psmi-play-btn {
  transform: scale(0.7);
  opacity: 0;
  transition: transform 0.22s cubic-bezier(0.2,0.8,0.3,1), opacity 0.2s ease;
}
@media (hover: none) {
  [data-psmi-scope="strip"] .psmi-play-btn { opacity: 0.92; transform: scale(1); }
}
`.trim();

/**
 * Inject (once) the library's scoped stylesheet into `<head>`.
 * Safe to call on every mount — idempotent via a fixed element id.
 */
export function injectScopedStylesheet(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.setAttribute("data-psmi", "scoped");
  el.textContent = SCOPED_CSS;
  document.head.appendChild(el);
}

/**
 * Remove the injected stylesheet. Primarily useful in tests. Consumers do
 * not need to call this — the stylesheet is a trivial cost and living for
 * the page lifetime is fine.
 */
export function ejectScopedStylesheet(): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(STYLE_ID);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}
