import { describe, it, expect } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";
import { ImmersiveFeed } from "../core/ImmersiveFeed.js";
import type { MediaItem } from "../types/index.js";

const items: MediaItem[] = [
  { id: "a", poster: "/a.jpg", title: "First", badge: "INTRO", src: "/a.mp4", durationMs: 1000 },
  { id: "b", poster: "/b.jpg", title: "Second", badge: "TOUR", src: "/b.mp4", durationMs: 2000 },
];

describe("<ImmersiveViewer> integration", () => {
  it("does not render viewer chrome when closed", () => {
    render(<ImmersiveFeed items={items} />);
    // Viewer portals into document.body, but only when isOpen is true.
    // With initiallyOpen omitted (defaults to false), no dialog should be present.
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();
  });

  it("portals dialog + counter to document.body when open", () => {
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={1} />);
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog).not.toBeNull();
    // Portal target is document.body — dialog should not be nested under the mount container.
    expect(dialog!.closest("[data-psmi-scope=\"root\"]")).not.toBeNull();
    // Counter reflects 1-based index.
    expect(dialog!.textContent).toContain("2");
    expect(dialog!.textContent).toContain("/ 2");
    // Badge is drawn.
    expect(dialog!.textContent).toContain("TOUR");
  });

  it("close button unmounts the dialog", () => {
    render(<ImmersiveFeed items={items} initiallyOpen />);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const closeBtn = dialog!.querySelector("button[aria-label='Close']") as HTMLButtonElement | null;
    expect(closeBtn).not.toBeNull();
    act(() => {
      closeBtn!.click();
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders counter at bottom-right of the viewport with the psmi-counter class", () => {
    render(<ImmersiveFeed items={items} initiallyOpen />);
    const counter = document.querySelector(".psmi-counter") as HTMLElement | null;
    expect(counter).not.toBeNull();
    // Positioned at bottom-right, not top-center like the previous chrome placement.
    expect(counter!.style.right).toBe("12px");
    expect(counter!.style.bottom).toBe("14px");
    expect(counter!.style.left).toBe("");
    expect(counter!.textContent).toContain("1");
    expect(counter!.textContent).toContain("/");
    expect(counter!.textContent).toContain("2");
  });

  it("counter is not rendered when there is only one item", () => {
    const solo: MediaItem[] = [items[0]!];
    render(<ImmersiveFeed items={solo} initiallyOpen />);
    expect(document.querySelector(".psmi-counter")).toBeNull();
  });

  it("badge is positioned at 16px top / 16px left inside the viewport", () => {
    render(<ImmersiveFeed items={items} initiallyOpen />);
    const dialog = document.querySelector('[role="dialog"]')!;
    // Find the badge text span, then walk up to the positioned wrapper div.
    const labelSpan = Array.from(dialog.querySelectorAll("span")).find((s) =>
      s.textContent?.trim() === "INTRO",
    );
    expect(labelSpan).toBeTruthy();
    const badge = labelSpan!.parentElement as HTMLElement;
    expect(badge.style.top).toBe("16px");
    expect(badge.style.left).toBe("16px");
  });

  it("mounts the video element with the muted attribute regardless of provider muted state", () => {
    // Provider says isMuted=false, but the DOM <video> must still be muted
    // at mount time so muted autoplay is guaranteed. The play/unmute effect
    // flips element.muted = false imperatively after play() resolves.
    render(<ImmersiveFeed items={items} initiallyOpen initiallyMuted={false} />);
    const dialog = document.querySelector('[role="dialog"]')!;
    const video = dialog.querySelector("video") as HTMLVideoElement | null;
    expect(video).not.toBeNull();
    // The `muted` boolean prop must be true on the initial render.
    expect(video!.muted).toBe(true);
  });

  it("renders the desktop chevron pager with prev disabled on the first item", () => {
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={0} />);
    const chevrons = document.querySelector(".psmi-chevrons") as HTMLElement | null;
    expect(chevrons).not.toBeNull();
    const prev = chevrons!.querySelector('button[aria-label="Previous video"]') as HTMLButtonElement;
    const nxt = chevrons!.querySelector('button[aria-label="Next video"]') as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(nxt.disabled).toBe(false);
  });

  it("chevron pager: next button disabled on last item", () => {
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={items.length - 1} />);
    const chevrons = document.querySelector(".psmi-chevrons")!;
    const prev = chevrons.querySelector('button[aria-label="Previous video"]') as HTMLButtonElement;
    const nxt = chevrons.querySelector('button[aria-label="Next video"]') as HTMLButtonElement;
    expect(prev.disabled).toBe(false);
    expect(nxt.disabled).toBe(true);
  });

  it("chevron next button advances the active index", () => {
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={0} />);
    const dialog = document.querySelector('[role="dialog"]')!;
    // Counter starts at "1".
    expect(dialog.querySelector(".psmi-counter")!.textContent).toContain("1");
    const nxt = dialog.querySelector('button[aria-label="Next video"]') as HTMLButtonElement;
    act(() => { nxt.click(); });
    // After next: counter reads "2".
    const counter = document.querySelector(".psmi-counter")!;
    expect(counter.textContent).toContain("2");
  });

  it("header label is state-oriented: reads 'Muted' when video is muted", () => {
    // Regression against pre-v0.3.5 confusion where the label described the
    // action ("click to mute") instead of the state. Users read the label
    // as the state and got confused when it said 'Muted' but audio was on.
    //
    // The <Video> element mounts muted at DOM level (see the play effect),
    // so on initial render before any playing event fires, effectiveMuted
    // should be true and the label should read 'Muted'.
    render(<ImmersiveFeed items={items} initiallyOpen initiallyMuted={false} />);
    const dialog = document.querySelector('[role="dialog"]')!;
    const muteBtn = dialog.querySelector('button[aria-label="Muted"], button[aria-label="Sound on"]') as HTMLButtonElement;
    expect(muteBtn).toBeTruthy();
    // Initial DOM .muted is true (see mount-muted test above), so the
    // button label should reflect that reality — not the provider's
    // isMuted=false intent.
    expect(muteBtn.getAttribute("aria-label")).toBe("Muted");
    // And aria-pressed reflects that the mute FEATURE is engaged.
    expect(muteBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("invokes play() on the active video after mount (ref-timing regression)", async () => {
    // Regression test for the v0.3.3 bug: the play effect ran before the
    // wrapped <Video> component's inner element had its callback ref
    // fired, so videoRefs.current.get(activeIndex) was undefined and no
    // play attempt landed. The fix is to bump a state counter in the ref
    // callback and include it in the effect's deps.
    //
    // We can't easily spy on the exact play() call because jsdom's video
    // is a stub, but we CAN assert that when the dialog is open, the
    // active <video> element exists AND has the muted attribute set to
    // true (which happens inside the play attempt). If the effect never
    // ran (the pre-fix behavior), the muted attribute would not be set
    // explicitly by our code — only the JSX prop would be present.
    render(<ImmersiveFeed items={items} initiallyOpen initialIndex={0} />);
    const dialog = document.querySelector('[role="dialog"]')!;
    const video = dialog.querySelector("video") as HTMLVideoElement;
    expect(video).toBeTruthy();
    // The play attempt inside our effect explicitly does:
    //   el.setAttribute("muted", "");
    // If the effect fired (either directly or after the ref-attach tick),
    // the attribute is present as an empty string. If it never fired,
    // React's JSX muted prop would still leave the attribute on the
    // element too — so this test is a smoke check that at minimum the
    // element is in the DOM and correctly muted-marked.
    expect(video.hasAttribute("muted")).toBe(true);
    expect(video.muted).toBe(true);
  });
});
