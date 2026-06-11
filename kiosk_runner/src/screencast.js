'use strict';
/*
 * Live browser streaming via Chrome DevTools Protocol `Page.startScreencast`.
 *
 * Chromium pushes JPEG frames as the page changes (event-driven, compositor
 * output) — far cheaper and smoother than polling page.screenshot() in a loop.
 * We forward each frame's base64 to the API, which relays it as binary over the
 * WebSocket to the kiosk / CMS recorder.
 *
 * Robustness:
 *  - Re-attaches automatically when the active page changes (popups/tabs).
 *  - Re-issues the screencast after a top-frame navigation (cross-document
 *    navigations can stop the cast).
 *  - Throttles POSTs to ~maxFps while always ACKing Chromium so it keeps
 *    emitting (no stalls).
 */

const api = require('./api');
const fs = require('fs');
const DBG = process.env.SC_DEBUG ? (m) => { try { fs.appendFileSync(process.env.SC_DEBUG, `${Date.now()} ${m}\n`); } catch {} } : () => {};

const QUALITY  = Number(process.env.SCREENCAST_QUALITY || 60);
const MAX_W    = Number(process.env.SCREENCAST_MAX_W || 1600);
const MAX_H    = Number(process.env.SCREENCAST_MAX_H || 1050);
const MAX_FPS  = Number(process.env.SCREENCAST_MAX_FPS || 12);
const MIN_INTERVAL = Math.floor(1000 / Math.max(1, MAX_FPS));

function createLiveStreamer(jobId) {
  let cdp = null;
  let curPage = null;
  let lastPost = 0;
  let stopped = false;
  let navHandler = null;

  let frameCount = 0;

  async function startCast() {
    if (!cdp) return;
    try {
      await cdp.send('Page.enable');
      await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: QUALITY,
        maxWidth: MAX_W,
        maxHeight: MAX_H,
        everyNthFrame: 1,
      });
      DBG(`startCast OK job=${jobId}`);
    } catch (e) {
      DBG(`startCast ERROR job=${jobId}: ${e.message}`);
      console.log(`[screencast ${jobId}] startCast error: ${e.message}`);
    }
  }

  async function attach(page) {
    if (stopped || !page || page === curPage) return;
    DBG(`attach job=${jobId}`);
    await detach();
    curPage = page;

    try {
      cdp = await page.context().newCDPSession(page);
    } catch (e) {
      DBG(`newCDPSession ERROR job=${jobId}: ${e.message}`);
      cdp = null;
      return;
    }

    cdp.on('Page.screencastFrame', (e) => {
      // ACK immediately so Chromium keeps streaming, even if we drop this frame.
      cdp?.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => undefined);
      if (++frameCount === 1) DBG(`first frame job=${jobId}`);
      const now = Date.now();
      if (now - lastPost < MIN_INTERVAL) return; // throttle bandwidth
      lastPost = now;
      let pageUrl;
      try { pageUrl = curPage && curPage.url(); } catch { /* page closing */ }
      api.sendFrameB64(jobId, e.data, { pageUrl, stepOrder: 0 })
        .catch((err) => DBG(`POST frame ERROR job=${jobId}: ${err.message}`));
    });

    // A cross-document navigation can silently stop the cast — re-issue it.
    navHandler = (frame) => {
      try { if (frame === page.mainFrame()) startCast(); } catch { /* ignore */ }
    };
    page.on('framenavigated', navHandler);

    await startCast();
  }

  async function detach() {
    if (navHandler && curPage) {
      try { curPage.off('framenavigated', navHandler); } catch { /* ignore */ }
      navHandler = null;
    }
    if (cdp) {
      try { await cdp.send('Page.stopScreencast'); } catch { /* ignore */ }
      try { await cdp.detach(); } catch { /* ignore */ }
      cdp = null;
    }
    curPage = null;
  }

  async function stop() {
    stopped = true;
    await detach();
  }

  return {
    attach,
    stop,
    /** Whether a frame was posted within the last `ms` — used by safety nets. */
    isFresh: (ms) => Date.now() - lastPost < ms,
  };
}

module.exports = { createLiveStreamer };
