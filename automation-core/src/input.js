'use strict';
/*
 * Apply a viewer-originated input event to a Playwright page.
 * Ported from kiosk_runner runner.js (applyEvent / applyRecordEvent), but the
 * HTTP side-effects (api.reportFocus / api.recordAction) are replaced with
 * caller-supplied callbacks so this stays transport-agnostic — the executor
 * sends focus/record over the WebRTC DataChannel, the recorder over HTTP.
 */

const { dispatchTouch, isTextInputFocused } = require('./browser');
const { captureElementAt } = require('./recorder');

/**
 * Execute-mode input (citizen driving the live portal).
 * @param onFocus  optional (focused:boolean) => void — drives the virtual keyboard
 */
async function applyEvent(page, ev, { onFocus } = {}) {
  switch (ev.t || ev.type) {
    case 'click':
      if (typeof ev.x !== 'number' || typeof ev.y !== 'number') return;
      await page.mouse.click(ev.x, ev.y);
      if (onFocus) onFocus(await isTextInputFocused(page));
      break;
    case 'touchStart':
      if (typeof ev.x !== 'number' || typeof ev.y !== 'number') return;
      await dispatchTouch(page, 'touchStart', ev.x, ev.y);
      break;
    case 'touchMove':
      if (typeof ev.x !== 'number' || typeof ev.y !== 'number') return;
      await dispatchTouch(page, 'touchMove', ev.x, ev.y);
      break;
    case 'touchEnd':
      await dispatchTouch(page, 'touchEnd', ev.x || 0, ev.y || 0);
      if (onFocus) onFocus(await isTextInputFocused(page));
      break;
    case 'type':
      if (ev.text) await page.keyboard.type(ev.text, { delay: 15 });
      break;
    case 'key':
      if (ev.key) await page.keyboard.press(ev.key);
      break;
    case 'scroll':
      await page.mouse.wheel(ev.deltaX || 0, ev.deltaY || 0);
      break;
  }
}

/** Race a promise against a timeout so a navigating click can't stall the loop. */
function withTimeout(promise, ms) {
  return Promise.race([
    Promise.resolve(promise).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);
}

/**
 * Record-mode input (admin clicking the live portal to author steps).
 * @param onRecord  (action) => void — receives the captured semantic action
 */
async function applyRecordEvent(page, ev, { onRecord } = {}) {
  const emit = (a) => { try { onRecord && onRecord(a); } catch { /* ignore */ } };
  if (ev.t === 'click' || ev.type === 'click') {
    if (typeof ev.x !== 'number' || typeof ev.y !== 'number') return;
    // Capture the selector BEFORE the click (the click may navigate the page).
    const info = await withTimeout(captureElementAt(page, ev.x, ev.y), 3000);
    await withTimeout(page.mouse.click(ev.x, ev.y), 3000);
    if (info && info.selector) emit({ kind: 'click', ...info });
  } else if (ev.t === 'fill' || ev.type === 'fill') {
    if (!ev.selector) return;
    try {
      await page.locator(ev.selector).first().fill(ev.text || '', { timeout: 5000 });
    } catch {
      try {
        await page.locator(ev.selector).first().click({ timeout: 3000 });
        await page.keyboard.type(ev.text || '', { delay: 10 });
      } catch { /* ignore */ }
    }
    emit({ kind: 'fill', selector: ev.selector, selectorType: ev.selectorType || 'CSS', value: ev.text || '' });
  } else if (ev.t === 'scroll' || ev.type === 'scroll') {
    await page.mouse.wheel(ev.deltaX || 0, ev.deltaY || 0).catch(() => undefined);
  } else if (ev.t === 'type' || ev.type === 'type') {
    if (ev.text) await page.keyboard.type(ev.text, { delay: 12 }).catch(() => undefined);
  } else if (ev.t === 'key' || ev.type === 'key') {
    if (ev.key) await page.keyboard.press(ev.key).catch(() => undefined);
  }
}

module.exports = { applyEvent, applyRecordEvent, withTimeout };
