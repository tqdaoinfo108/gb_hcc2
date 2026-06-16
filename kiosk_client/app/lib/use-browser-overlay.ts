"use client";
/*
 * useBrowserOverlay — keeps the real chromeless Chromium window glued to a
 * "frame" element in the kiosk UI (the OVERLAY model that replaced WebRTC).
 *
 * While enabled it:
 *   • lifts the kiosk always-on-top lock (set_overlay_active) so the OS-level
 *     browser window is visible above the Tauri window,
 *   • computes the frame's screen rect and sends {cmd:'set-bounds'} to the
 *     engine on mount, on window resize/move, and whenever the frame resizes,
 *   • restores the lock on unmount.
 *
 * Outside Tauri (plain-browser dev) it is a no-op — there is no real browser to
 * position, so the screens show their placeholder UI instead.
 */

import { useEffect } from "react";
import { computeOverlayBounds, engineSend, isTauri, raiseOverlayBrowser, setOverlayActive } from "./engine-bridge";

export function useBrowserOverlay(
  frameRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled || !isTauri()) return;
    let disposed = false;
    let raf = 0;
    let unlistenMoved: (() => void) | null = null;
    let unlistenResized: (() => void) | null = null;

    void setOverlayActive(true);
    // Keep the real browser above the fullscreen Tauri window. Re-raise on a
    // short interval so new tabs / SSO popups and Tauri focus-grabs can't bury it.
    void raiseOverlayBrowser();
    const raiseTimer = window.setInterval(() => void raiseOverlayBrowser(), 1500);

    const push = async () => {
      const el = frameRef.current;
      if (!el || disposed) return;
      const bounds = await computeOverlayBounds(el);
      if (bounds && !disposed) void engineSend({ cmd: "set-bounds", bounds });
    };
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => void push());
    };

    // Initial placement (the engine launches off-screen, then jumps to here).
    schedule();

    window.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (ro && frameRef.current) ro.observe(frameRef.current);

    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlistenMoved = await win.onMoved(schedule);
        unlistenResized = await win.onResized(schedule);
      } catch {
        /* event API unavailable */
      }
    })();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      window.clearInterval(raiseTimer);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
      if (unlistenMoved) unlistenMoved();
      if (unlistenResized) unlistenResized();
      void setOverlayActive(false);
    };
  }, [enabled, frameRef]);
}
