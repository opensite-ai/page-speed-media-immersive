import { describe, it, expect } from "vitest";
import * as api from "../index.js";

describe("public API surface", () => {
  it("exports the documented components", () => {
    expect(typeof api.ImmersiveFeed).toBe("object"); // forwardRef → object
    expect(typeof api.ImmersiveFeedProvider).toBe("object");
    expect(typeof api.ImmersiveViewer).toBe("function");
    expect(typeof api.ImmersiveViewerHeader).toBe("function");
    expect(typeof api.ImmersiveViewerActions).toBe("function");
    expect(typeof api.ImmersiveViewerCaption).toBe("function");
    expect(typeof api.ThumbnailCard).toBe("object"); // forwardRef
    expect(typeof api.ThumbnailStrip).toBe("function");
    expect(typeof api.ImmersivePortal).toBe("function");
  });

  it("exports the documented hooks", () => {
    expect(typeof api.useImmersiveFeed).toBe("function");
    expect(typeof api.useActionContext).toBe("function");
    expect(typeof api.useScrollLock).toBe("function");
    expect(typeof api.useResponsiveness).toBe("function");
    expect(typeof api.useKeyboardShortcuts).toBe("function");
    expect(typeof api.useVerticalPagerGestures).toBe("function");
  });

  it("exports portal helpers", () => {
    expect(typeof api.injectScopedStylesheet).toBe("function");
    expect(typeof api.ejectScopedStylesheet).toBe("function");
  });
});
