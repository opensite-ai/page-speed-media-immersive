"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ActionContext,
  ImmersiveAction,
  ImmersiveFeedHandle,
  ImmersiveFeedState,
  ImmersiveTheme,
  MediaItem,
} from "../types/index.js";
import { resolveIndex } from "../utils/resolveIndex.js";
import { clamp } from "../utils/clamp.js";

/**
 * Props accepted by `<ImmersiveFeedProvider>`.
 *
 * The provider owns feed state (items, activeIndex, isOpen, isMuted) and
 * exposes it to descendants via `useImmersiveFeed()`. It is safe to render
 * even when the fullscreen viewer is not present.
 */
export interface ImmersiveFeedProviderProps {
  items: MediaItem[];
  /** Initial mute state. Default `true` (required for autoplay on most browsers). */
  initiallyMuted?: boolean;
  /** Initial open state. Default `false`. */
  initiallyOpen?: boolean;
  /** Initial active index. Default `0`. */
  initialIndex?: number;
  /** Actions rendered on the fullscreen viewer's right rail. Default `[]` (no rail). */
  actions?: ImmersiveAction[];
  /**
   * Optional theme applied via CSS custom properties on the portal root.
   * Consumers using `@page-speed/skins` may pass token values directly.
   */
  theme?: ImmersiveTheme;
  /** Called after the active index changes, whether by gesture, keyboard, or `next()`/`prev()`. */
  onIndexChange?: (index: number, item: MediaItem) => void;
  /** Called when the fullscreen viewer opens. */
  onOpen?: (item: MediaItem) => void;
  /** Called when the fullscreen viewer closes. */
  onClose?: () => void;
  /**
   * Called when the browser refuses autoplay (typically iOS Safari without a
   * prior user gesture). Consumers should show a "tap to play" affordance.
   */
  onAutoplayBlocked?: (item: MediaItem) => void;
  children?: React.ReactNode;
}

interface FeedContextValue extends ImmersiveFeedState {
  actions: ImmersiveAction[];
  theme: ImmersiveTheme | undefined;
  open: (idOrIndex: string | number) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  seek: (index: number) => void;
  setMuted: (m: boolean | ((prev: boolean) => boolean)) => void;
  reportAutoplayBlocked: (item: MediaItem) => void;
  // Convenience derived state, matching @page-speed/lightbox's useGalleryState
  // shape so consumers who know one library know the other.
  currentItem: MediaItem | null;
  prevItem: MediaItem | null;
  nextItem: MediaItem | null;
  canNext: boolean;
  canPrev: boolean;
}

const FeedContext = createContext<FeedContextValue | null>(null);

/**
 * Provider that owns feed state. Wrap `<ThumbnailStrip>`, `<ThumbnailCard>`,
 * and `<ImmersiveViewer>` with this. When using `<ImmersiveFeed>` you don't
 * need to render this yourself.
 */
export const ImmersiveFeedProvider = React.forwardRef<
  ImmersiveFeedHandle,
  ImmersiveFeedProviderProps
>(function ImmersiveFeedProvider(
  {
    items,
    initiallyMuted = true,
    initiallyOpen = false,
    initialIndex = 0,
    actions = [],
    theme,
    onIndexChange,
    onOpen,
    onClose,
    onAutoplayBlocked,
    children,
  },
  ref,
) {
  const [activeIndex, setActiveIndex] = useState(() =>
    clamp(initialIndex, 0, Math.max(0, items.length - 1)),
  );
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [isMuted, setIsMutedState] = useState(initiallyMuted);

  // Latest-refs so callbacks stay referentially stable while still reading
  // the freshest handler set (avoids re-subscribes on unrelated re-renders).
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onAutoplayBlockedRef = useRef(onAutoplayBlocked);
  onAutoplayBlockedRef.current = onAutoplayBlocked;

  const open = useCallback((target: string | number) => {
    const list = itemsRef.current;
    if (list.length === 0) return;
    const i = resolveIndex(list, target);
    if (i < 0) return;
    setActiveIndex(i);
    setIsOpen(true);
    // Request sound on for the takeover — open() is invoked from a user
    // gesture, which satisfies the browser's autoplay-with-sound policy for
    // *this* media session, but not for the specific <video> element that
    // hasn't mounted yet. The viewer handles the second half by mounting
    // muted, starting playback, and imperatively flipping .muted = false
    // after play() resolves. See ImmersiveViewer for the details.
    setIsMutedState(false);
    onOpenRef.current?.(list[i]!);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    onCloseRef.current?.();
  }, []);

  const seek = useCallback((i: number) => {
    setActiveIndex((prev) => {
      const list = itemsRef.current;
      const next = clamp(i, 0, Math.max(0, list.length - 1));
      if (next !== prev) {
        const item = list[next];
        if (item) onIndexChangeRef.current?.(next, item);
      }
      return next;
    });
  }, []);

  const next = useCallback(() => {
    setActiveIndex((prev) => {
      const list = itemsRef.current;
      if (prev >= list.length - 1) return prev;
      const n = prev + 1;
      const item = list[n];
      if (item) onIndexChangeRef.current?.(n, item);
      return n;
    });
  }, []);

  const prev = useCallback(() => {
    setActiveIndex((p) => {
      if (p <= 0) return p;
      const n = p - 1;
      const item = itemsRef.current[n];
      if (item) onIndexChangeRef.current?.(n, item);
      return n;
    });
  }, []);

  const setMuted = useCallback((m: boolean | ((prev: boolean) => boolean)) => {
    setIsMutedState((prev) => (typeof m === "function" ? m(prev) : m));
  }, []);

  const reportAutoplayBlocked = useCallback((item: MediaItem) => {
    onAutoplayBlockedRef.current?.(item);
  }, []);

  // Clamp active index if items shrinks below current index.
  useEffect(() => {
    setActiveIndex((prev) => clamp(prev, 0, Math.max(0, items.length - 1)));
  }, [items.length]);

  // Latest-refs for state used inside the imperative handle's `getState`.
  // This keeps the handle referentially stable while still letting callers
  // read the freshest state at any time.
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  // Expose imperative handle. Factory has no state deps because it reads
  // from refs — the handle instance can stay stable across renders.
  React.useImperativeHandle(
    ref,
    (): ImmersiveFeedHandle => ({
      open,
      close,
      next,
      prev,
      seek,
      setMuted: (m: boolean) => setMuted(m),
      getState: () => ({
        items: itemsRef.current,
        activeIndex: activeIndexRef.current,
        isOpen: isOpenRef.current,
        isMuted: isMutedRef.current,
      }),
    }),
    [open, close, next, prev, seek, setMuted],
  );

  const contextValue = useMemo<FeedContextValue>(
    () => ({
      items,
      activeIndex,
      isOpen,
      isMuted,
      actions,
      theme,
      open,
      close,
      next,
      prev,
      seek,
      setMuted,
      reportAutoplayBlocked,
      currentItem: items[activeIndex] ?? null,
      prevItem: activeIndex > 0 ? items[activeIndex - 1] ?? null : null,
      nextItem:
        activeIndex < items.length - 1 ? items[activeIndex + 1] ?? null : null,
      canNext: activeIndex < items.length - 1,
      canPrev: activeIndex > 0,
    }),
    [
      items,
      activeIndex,
      isOpen,
      isMuted,
      actions,
      theme,
      open,
      close,
      next,
      prev,
      seek,
      setMuted,
      reportAutoplayBlocked,
    ],
  );

  return <FeedContext.Provider value={contextValue}>{children}</FeedContext.Provider>;
});

/**
 * Access the feed state and actions from inside `<ImmersiveFeedProvider>`.
 * Throws if used outside the provider.
 */
export function useImmersiveFeed() {
  const ctx = useContext(FeedContext);
  if (!ctx) {
    throw new Error(
      "useImmersiveFeed() must be used inside <ImmersiveFeedProvider> (or <ImmersiveFeed>).",
    );
  }
  return ctx;
}

/**
 * Build the ActionContext passed to `ImmersiveAction.onPress` handlers.
 * Exposed for consumers who render custom action UIs.
 */
export function useActionContext(): ActionContext {
  const { close, next, prev, activeIndex } = useImmersiveFeed();
  return useMemo(
    () => ({ close, next, prev, index: activeIndex }),
    [close, next, prev, activeIndex],
  );
}
