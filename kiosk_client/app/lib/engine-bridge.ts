"use client";
/*
 * Engine bridge — the WebView side of the Tauri-first automation transport.
 *
 * The Playwright + WebRTC engine runs as a Node child of the Tauri shell. There
 * is NO localhost WebSocket: control commands and the WebRTC SDP/ICE handshake
 * flow over Tauri IPC.
 *   • engine → WebView : `engine://message` events (one per engine stdout line)
 *   • WebView → engine : invoke('engine_send', { msg })  → engine stdin
 *   • lifecycle        : `engine://status` { ready } when the child spawns/exits
 *
 * Outside Tauri (plain-browser dev) automation is unavailable — the engine can
 * only be reached through the desktop shell. The helpers degrade to no-ops so
 * the UI can show a graceful "desktop only" state instead of throwing.
 */

export type EngineMessage = Record<string, unknown>;
export type Unsubscribe = () => void;

/** Screen-space bounds (physical px) for positioning the overlay browser window. */
export interface OverlayBounds { left: number; top: number; width: number; height: number }

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Compute the on-screen rectangle of a frame element so the engine can position
 * the real chromeless Chromium window exactly over it.
 *
 * UNITS: CDP Browser.setWindowBounds takes CSS pixels (DIP), NOT physical px.
 * Tauri's innerPosition() is PHYSICAL, so divide by the scale factor to get DIP;
 * getBoundingClientRect() is already CSS px (and already accounts for the kiosk
 * canvas scale transform). Getting this wrong on a non-100% display mis-sizes /
 * mis-positions the overlay window (and pushes native <select> popups off-screen).
 */
export async function computeOverlayBounds(el: HTMLElement): Promise<OverlayBounds | null> {
  if (!isTauri() || !el) return null;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const [inner, sf] = await Promise.all([win.innerPosition(), win.scaleFactor()]);
    const scale = sf || 1;
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(inner.x / scale + r.left),
      top: Math.round(inner.y / scale + r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  } catch {
    return null;
  }
}

/** Lift/restore the kiosk always-on-top lock so the overlay browser is visible. */
export async function setOverlayActive(active: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_overlay_active", { active });
  } catch {
    /* not in Tauri */
  }
}

/**
 * Force the overlay Chromium window(s) top-most so the fullscreen Tauri window
 * can't cover the live-view frame. Call repeatedly while overlaying (new tabs /
 * SSO popups need it too, and Tauri may re-raise on focus). No-op outside Tauri.
 */
export async function raiseOverlayBrowser(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("raise_overlay_browser");
  } catch {
    /* not in Tauri */
  }
}

/** Send one control/signaling message to the engine (no-op outside Tauri). */
export async function engineSend(msg: EngineMessage): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("engine_send", { msg });
  } catch {
    /* engine not ready yet — caller retries on engine://status */
  }
}

/** Subscribe to engine protocol messages. Returns a cleanup that detaches. */
export function onEngineMessage(cb: (msg: EngineMessage) => void): Unsubscribe {
  return subscribe<EngineMessage>("engine://message", cb);
}

/** Subscribe to engine lifecycle. `ready` flips true on spawn, false on exit. */
export function onEngineStatus(cb: (status: { ready: boolean }) => void): Unsubscribe {
  return subscribe<{ ready: boolean }>("engine://status", cb);
}

/* Shared listen() wrapper. listen() resolves async, so we guard against an
 * unsubscribe that fires before the listener is attached. */
function subscribe<T>(event: string, cb: (payload: T) => void): Unsubscribe {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | null = null;
  let disposed = false;
  (async () => {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      const off = await listen<T>(event, (e) => cb(e.payload));
      if (disposed) off();
      else unlisten = off;
    } catch {
      /* not in Tauri / event API unavailable */
    }
  })();
  return () => {
    disposed = true;
    if (unlisten) unlisten();
  };
}
