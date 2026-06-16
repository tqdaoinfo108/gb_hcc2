'use strict';
/*
 * Shared message schema for the WebRTC link between the Playwright automation
 * engine (bin/engine.js) and its viewer (the Tauri WebView).
 *
 * Two transports carry these:
 *   • The stdio control channel (engine ⇄ Rust ⇄ WebView via Tauri IPC) —
 *     control commands + SDP/ICE. No socket, no port (see stdio-conn.js).
 *   • The WebRTC DataChannel ("input") — realtime input + input-request replies.
 *
 * Coordinates are always in the LOGICAL viewport space (1366×900), independent
 * of the browser's deviceScaleFactor. Both sides agree on these dimensions.
 */

const VIEW_W = 1366;
const VIEW_H = 900;

/* ── Control-channel messages (viewer ⇄ engine, over stdio/IPC) ───── */
// viewer → host (control)
//   { cmd: 'start-record', templateId, url }      recorder
//   { cmd: 'start-job',    jobId }                 executor
//   { cmd: 'stop' }
// host → viewer (status)
//   { evt: 'ready' } | { evt: 'error', message }
// either direction (WebRTC signaling, the host is the offerer)
//   { kind: 'offer',  sdp }
//   { kind: 'answer', sdp }
//   { kind: 'ice',    candidate }

const SIGNAL_KINDS = ['offer', 'answer', 'ice'];

/* ── DataChannel "input" messages ─────────────────────────────────── */
// viewer → host (input)
//   { t: 'click'|'touchStart'|'touchMove'|'touchEnd', x, y }
//   { t: 'type', text } | { t: 'key', key }
//   { t: 'scroll', deltaX, deltaY }
//   { t: 'fill', selector, selectorType, text }   (recorder preview-fill)
//   { t: 'finish' }
//   { t: 'citizen-input', kind, value }           (reply to request-input)
//   { t: 'upload-file', path }                    (native file picked locally)
// host → viewer (signals)
//   { t: 'focus', focused }                       (auto virtual keyboard)
//   { t: 'request-input', kind, payload }         kind: UPLOAD|VNEID_QR|OTP_SMS|CONFIRM_DATA
//   { t: 'recorded', action }                     (recorder — captured step)
//   { t: 'page-url', url }                         (recorder — page navigated)

const INPUT_EVENT_TYPES = ['click', 'touchStart', 'touchMove', 'touchEnd', 'type', 'key', 'scroll'];

function isSignal(msg) {
  return !!msg && typeof msg === 'object' && SIGNAL_KINDS.includes(msg.kind);
}

module.exports = { VIEW_W, VIEW_H, SIGNAL_KINDS, INPUT_EVENT_TYPES, isSignal };
