// Ensure process.env exists when the module is loaded directly in browser UMD
// builds. Same shim used by @page-speed/img and @page-speed/video.
type GlobalWithProcess = typeof globalThis & { process?: NodeJS.Process };

const globalObject =
  typeof globalThis !== "undefined"
    ? (globalThis as GlobalWithProcess)
    : undefined;

if (globalObject) {
  if (!globalObject.process) {
    globalObject.process = {
      env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
    } as NodeJS.Process;
  } else {
    const env =
      globalObject.process.env ??
      (globalObject.process.env = {} as NodeJS.ProcessEnv);
    if (typeof env.NODE_ENV === "undefined") {
      env.NODE_ENV = "production";
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

// Core components
export {
  ImmersiveFeed,
  ImmersiveFeedProvider,
  useImmersiveFeed,
  useActionContext,
  ImmersiveViewer,
  ImmersiveViewerHeader,
  ImmersiveViewerActions,
  ImmersiveViewerCaption,
} from "./core/index.js";
export type {
  ImmersiveFeedProps,
  ImmersiveFeedProviderProps,
  ImmersiveViewerProps,
  ImmersiveViewerHeaderProps,
  ImmersiveViewerActionsProps,
  ImmersiveViewerCaptionProps,
} from "./core/index.js";

// Thumbnail primitives
export {
  ThumbnailCard,
  ThumbnailStrip,
} from "./thumbnails/index.js";
export type {
  ThumbnailCardProps,
  ThumbnailStripProps,
  ThumbnailSize,
} from "./thumbnails/index.js";

// Portal
export {
  ImmersivePortal,
  injectScopedStylesheet,
  ejectScopedStylesheet,
} from "./portal/index.js";
export type { ImmersivePortalProps } from "./portal/index.js";

// Hooks
export {
  useScrollLock,
  useResponsiveness,
  useKeyboardShortcuts,
  useVerticalPagerGestures,
} from "./hooks/index.js";
export type {
  Breakpoint,
  ResponsivenessInfo,
  UseVerticalPagerGesturesOptions,
  UseVerticalPagerGesturesResult,
} from "./hooks/index.js";

// Types
export type {
  MediaItem,
  ImmersiveAction,
  ActionContext,
  ImmersiveFeedHandle,
  ImmersiveFeedState,
  ImmersiveTheme,
} from "./types/index.js";
