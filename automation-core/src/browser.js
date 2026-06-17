'use strict';
/*
 * Chromium lifecycle + low-level page helpers.
 *
 * NEW MODEL (overlay, no WebRTC): the browser runs HEADED and ON-SCREEN as a
 * CHROMELESS --app window (no tabs, no toolbar). The Tauri shell positions this
 * real OS window precisely over a "frame" region in the kiosk UI via CDP
 * Browser.setWindowBounds, so the portal renders natively — pixel-perfect, zero
 * codec/latency, and immune to the headless-WAF and mDNS/ICE problems the old
 * screencast→WebRTC path hit. The admin (recorder) / citizen (executor) touch
 * the real Chromium window directly; we only proxy native concerns (uploads).
 *
 * Layout stays at 1366×900 CSS px, deviceScaleFactor=1 — the on-screen window is
 * resized to the frame, and selector capture runs in the page.
 *
 * `launchContext` (offscreen, headless-ish) is kept for non-overlay/testing use.
 */

const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { VIEW_W, VIEW_H } = require('./protocol');

const HIDDEN_BROWSER_ARGS = [`--window-position=-32000,-32000`, `--window-size=${VIEW_W},${VIEW_H}`];
const OFFSCREEN_BOUNDS = { left: -32000, top: -32000, width: VIEW_W, height: VIEW_H };

/**
 * @param {object} [opts]
 * @param {string} [opts.browserMode] 'hidden' | 'visible' | 'headless'
 * @returns {Promise<{browser, context, hideWindow:boolean}>}
 */
async function launchContext(opts = {}) {
  const mode = (opts.browserMode || process.env.BROWSER_MODE || 'hidden').toLowerCase();
  const headless = mode === 'headless';
  const hideWindow = !headless && mode !== 'visible';

  const browser = await chromium.launch({
    headless,
    args: hideWindow ? HIDDEN_BROWSER_ARGS : [],
  });
  const context = await browser.newContext({
    locale: 'vi-VN',
    viewport: { width: VIEW_W, height: VIEW_H },
    deviceScaleFactor: 1,
    hasTouch: true,
  });
  return { browser, context, hideWindow };
}

/**
 * Launch a CHROMELESS, on-screen Chromium window (--app) for the overlay model.
 * Starts off-screen so it never flashes at the wrong spot before the WebView
 * sends the real frame bounds.
 *
 * @param {object} o
 * @param {string} o.url            initial URL (--app target)
 * @param {object} [o.bounds]       initial screen bounds; defaults off-screen
 * @returns {Promise<{context, browser, page}>}
 */
async function launchAppWindow({ url, bounds }) {
  const b = bounds || OFFSCREEN_BOUNDS;
  const profileDir = path.join(os.tmpdir(), `kiosk-overlay-${process.pid}-${Date.now()}`);
  const args = [
    `--app=${url || 'about:blank'}`,
    `--window-position=${Math.round(b.left)},${Math.round(b.top)}`,
    `--window-size=${Math.round(b.width)},${Math.round(b.height)}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,TranslateUI',
  ];
  // The gov portal sits behind an F5/Shape anti-bot (the /TSbd/…?type=2 beacon).
  // It fingerprints Playwright's bundled Chromium at the TLS/automation layer and
  // RESETS the connection, so dynamic content (the VNeID QR) never loads. Launching
  // the REAL installed browser (Edge is always present on Win11, or Chrome) makes
  // the TLS/JA3 fingerprint match a "normal" browser. Set OVERLAY_BROWSER_CHANNEL
  // = 'msedge' | 'chrome' | 'chrome-beta' …; empty → Playwright's bundled Chromium.
  const channel = (process.env.OVERLAY_BROWSER_CHANNEL || '').trim() || undefined;
  const baseOpts = {
    headless: false,
    args,
    // Drop Playwright's automation flag so navigator.webdriver isn't trivially
    // true (the gov WAF flags it); a real on-screen window already looks human.
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: null, // null → page fills the real chromeless window size
    locale: 'vi-VN',
    hasTouch: true,
  };
  // Preference order — each falls back to the next only if launch FAILS, never
  // because of the QR (the QR depends on the TLS/anti-bot layer, not the sandbox):
  //   1. real browser + sandbox  → looks most human (NO --no-sandbox flag, which
  //      is itself an automation tell the anti-bot can read), no warning bar.
  //   2. bundled Chromium + sandbox.
  //   3/4. same but sandbox OFF — last resort so the kiosk never fails to launch
  //        (this re-adds --no-sandbox + its warning bar; only used if 1&2 can't start).
  const candidates = [];
  if (channel) candidates.push({ label: `${channel}+sandbox`, opts: { ...baseOpts, channel, chromiumSandbox: true } });
  candidates.push({ label: 'bundled+sandbox', opts: { ...baseOpts, chromiumSandbox: true } });
  if (channel) candidates.push({ label: `${channel}+no-sandbox`, opts: { ...baseOpts, channel, chromiumSandbox: false } });
  candidates.push({ label: 'bundled+no-sandbox', opts: { ...baseOpts, chromiumSandbox: false } });

  let context = null;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    try {
      // Fresh profile dir per attempt so a half-started launch can't lock the next.
      context = await chromium.launchPersistentContext(`${profileDir}-${i}`, c.opts);
      console.error('[engine] launched browser:', c.label);
      break;
    } catch (e) {
      console.error(`[engine] launch '${c.label}' failed: ${e && e.message}`);
    }
  }
  if (!context) throw new Error('Không khởi động được trình duyệt overlay (mọi phương án đều thất bại).');
  // Mask the most-checked automation signals. Init scripts run before page JS in
  // EVERY frame (incl. the cross-origin SSO iframe where the QR/anti-bot lives),
  // so this lands even though we keep the natural --app=url load (no CDP goto).
  await context.addInitScript(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch { /* sealed */ }
    try { if (!window.chrome) window.chrome = { runtime: {} }; } catch { /* ignore */ }
  }).catch(() => undefined);
  // The --app window is the page of the persistent context. Prefer a real
  // (non-blank) page in case Chromium also opened a stray about:blank.
  let page = context.pages().find((p) => !p.url().startsWith('about:')) || context.pages()[0];
  if (!page) page = await context.waitForEvent('page', { timeout: 15000 });
  console.error('[engine] launchAppWindow opened', context.pages().length, 'page(s); using', page.url(), '@', `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}`);
  // Close any extra blank windows so only the app window remains on-screen.
  for (const p of context.pages()) {
    if (p !== page && p.url().startsWith('about:')) p.close().catch(() => undefined);
  }
  return { context, browser: context.browser(), page };
}

/** Position the OS window that hosts `page` at the given screen bounds. */
async function setPageWindowBounds(page, bounds) {
  if (!page || !bounds) return;
  try {
    const session = await page.context().newCDPSession(page);
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: {
        left: Math.round(bounds.left),
        top: Math.round(bounds.top),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
        windowState: 'normal',
      },
    });
    await session.detach().catch(() => undefined);
  } catch { /* page may be navigating */ }
}

/** Shove the page's window off-screen (used while a WebView overlay is shown). */
async function moveWindowOffscreen(page) {
  return setPageWindowBounds(page, OFFSCREEN_BOUNDS);
}

async function moveBrowserWindowOffscreen(page, hideWindow) {
  if (!hideWindow) return;
  return setPageWindowBounds(page, OFFSCREEN_BOUNDS);
}

/* ── Touch dispatch (kiosk taps) via CDP ──────────────────────────── */
const touchSessions = new WeakMap();

async function getTouchSession(page) {
  let session = touchSessions.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    touchSessions.set(page, session);
  }
  return session;
}

async function dispatchTouch(page, type, x, y) {
  const session = await getTouchSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 0 }],
  });
}

/** Whether the active element is a text-entry field (drives the virtual keyboard). */
async function isTextInputFocused(page) {
  try {
    return await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      const type = (el.getAttribute && (el.getAttribute('type') || '')).toLowerCase();
      const nonText = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image'];
      return tag === 'TEXTAREA' || el.isContentEditable === true || (tag === 'INPUT' && !nonText.includes(type));
    });
  } catch {
    return false;
  }
}

module.exports = {
  launchContext,
  launchAppWindow,
  setPageWindowBounds,
  moveWindowOffscreen,
  moveBrowserWindowOffscreen,
  dispatchTouch,
  isTextInputFocused,
};
