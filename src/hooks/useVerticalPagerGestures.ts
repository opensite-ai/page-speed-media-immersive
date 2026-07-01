import { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "../utils/clamp.js";

/**
 * Configuration for the vertical pager gesture handler.
 */
export interface UseVerticalPagerGesturesOptions {
  /** Total number of pages. */
  itemCount: number;
  /** Current active index (controlled by caller). */
  index: number;
  /** Called with the new committed index after a gesture resolves. */
  onCommit: (nextIndex: number) => void;
  /** Distance-fraction threshold to commit to a swap (0..1). Default 0.2. */
  commitDistanceRatio?: number;
  /** Velocity threshold (px/ms) to commit even below the distance threshold. Default 0.5. */
  commitVelocity?: number;
  /** Overscroll rubber-band factor at start/end (0..1). Default 0.35. */
  rubberBand?: number;
  /** Called on gesture start (useful to pause videos). */
  onDragStart?: () => void;
  /** Called on gesture end regardless of whether it committed. */
  onDragEnd?: (committed: boolean) => void;
}

/**
 * Result: a set of pointer handlers to spread on a container, plus live
 * gesture state so the render can position pages.
 */
export interface UseVerticalPagerGesturesResult {
  /** Live vertical translation offset in px, relative to the resting position. */
  offset: number;
  /** True while a pointer drag is active. */
  isDragging: boolean;
  /** Height of the viewport (px). Updated on resize. */
  height: number;
  /** Ref to attach to the pager container. Typed as MutableRefObject for
   *  compatibility with both React 18 (`RefObject<T>`) and React 19
   *  (`RefObject<T | null>`) ref-assignment rules. */
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
}

interface PointerState {
  id: number;
  startY: number;
  startX: number;
  startTime: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  intentLocked: null | "vertical" | "horizontal";
}

/**
 * Pointer-events-based vertical pager gesture engine.
 *
 * Design notes:
 * - Uses transform-based paging, not CSS scroll-snap. The prototype used
 *   scroll-snap, but that has documented issues on iOS Safari (address-bar
 *   collapse causes jitter) and fights programmatic seeks. Transform + spring
 *   is what TikTok/Reels/Shorts use on the web.
 * - Detects primary gesture axis in the first ~10px to avoid stealing
 *   horizontal drags (useful when nested inside horizontal carousels).
 * - Rubber-bands at first/last page instead of committing off-list moves.
 */
export function useVerticalPagerGestures(
  opts: UseVerticalPagerGesturesOptions,
): UseVerticalPagerGesturesResult {
  const {
    itemCount,
    index,
    onCommit,
    commitDistanceRatio = 0.2,
    commitVelocity = 0.5,
    rubberBand = 0.35,
    onDragStart,
    onDragEnd,
  } = opts;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [height, setHeight] = useState(0);
  const pointerRef = useRef<PointerState | null>(null);

  // Observe container height changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight);
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const handleDown = useCallback((e: PointerEvent) => {
    if (pointerRef.current) return;
    // Only respond to primary pointer buttons.
    if (e.button !== undefined && e.button !== 0) return;
    pointerRef.current = {
      id: e.pointerId,
      startY: e.clientY,
      startX: e.clientX,
      startTime: e.timeStamp,
      lastY: e.clientY,
      lastTime: e.timeStamp,
      velocity: 0,
      intentLocked: null,
    };
  }, []);

  const handleMove = useCallback(
    (e: PointerEvent) => {
      const p = pointerRef.current;
      if (!p || p.id !== e.pointerId) return;

      const dy = e.clientY - p.startY;
      const dx = e.clientX - p.startX;

      // Lock intent after 10px of movement in the dominant axis.
      if (p.intentLocked === null) {
        if (Math.abs(dy) < 10 && Math.abs(dx) < 10) return;
        p.intentLocked = Math.abs(dy) > Math.abs(dx) ? "vertical" : "horizontal";
        if (p.intentLocked === "horizontal") {
          pointerRef.current = null;
          return;
        }
        setIsDragging(true);
        onDragStart?.();
        try {
          containerRef.current?.setPointerCapture(e.pointerId);
        } catch {
          // ignore — some browsers throw on already-captured pointers
        }
      }

      // Rubber-band at ends.
      let effective = dy;
      if (index === 0 && dy > 0) {
        effective = dy * rubberBand;
      } else if (index === itemCount - 1 && dy < 0) {
        effective = dy * rubberBand;
      }

      // Track velocity via last-sample delta (px/ms).
      const dt = e.timeStamp - p.lastTime;
      if (dt > 0) {
        p.velocity = (e.clientY - p.lastY) / dt;
      }
      p.lastY = e.clientY;
      p.lastTime = e.timeStamp;

      setOffset(effective);
    },
    [index, itemCount, rubberBand, onDragStart],
  );

  const handleUp = useCallback(
    (e: PointerEvent) => {
      const p = pointerRef.current;
      if (!p || p.id !== e.pointerId) return;

      if (p.intentLocked !== "vertical") {
        pointerRef.current = null;
        return;
      }

      const h = containerRef.current?.clientHeight || height || 1;
      const dy = e.clientY - p.startY;
      const velocity = p.velocity; // px/ms; negative = upward
      const distanceMet = Math.abs(dy) > h * commitDistanceRatio;
      const velocityMet = Math.abs(velocity) > commitVelocity;

      let target = index;
      if (dy < 0 && (distanceMet || velocityMet) && index < itemCount - 1) {
        target = index + 1;
      } else if (dy > 0 && (distanceMet || velocityMet) && index > 0) {
        target = index - 1;
      }

      const committed = target !== index;
      pointerRef.current = null;
      setIsDragging(false);
      setOffset(0);
      if (committed) onCommit(clamp(target, 0, itemCount - 1));
      onDragEnd?.(committed);
    },
    [height, index, itemCount, commitDistanceRatio, commitVelocity, onCommit, onDragEnd],
  );

  const handleCancel = useCallback(() => {
    if (!pointerRef.current) return;
    pointerRef.current = null;
    setIsDragging(false);
    setOffset(0);
    onDragEnd?.(false);
  }, [onDragEnd]);

  // Attach listeners imperatively so we can use non-passive listeners where needed
  // and cleanly capture the pointer.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const down = handleDown as EventListener;
    const move = handleMove as EventListener;
    const up = handleUp as EventListener;
    const cancel = handleCancel as EventListener;

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
    };
  }, [handleDown, handleMove, handleUp, handleCancel]);

  return { offset, isDragging, height, containerRef };
}
