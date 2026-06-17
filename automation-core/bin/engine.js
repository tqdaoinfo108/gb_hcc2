#!/usr/bin/env node
'use strict';
/*
 * Smart Kiosk — Automation Engine (Tauri-first, single process, OVERLAY model).
 *
 * One Node process, spawned and supervised by the Tauri Rust shell as a child
 * over stdio. It owns Playwright Chromium and serves BOTH roles from the SAME
 * codebase (selected per command, never two processes):
 *
 *   • RECORDER  (admin authoring)  — {cmd:'start-record', url, bounds}
 *       Opens a CHROMELESS on-screen Chromium (--app) positioned over the
 *       kiosk UI's "frame" region. The admin clicks the REAL portal directly;
 *       an injected capture listener turns each click/field-change into a
 *       semantic step streamed back to the WebView (saved via PUT steps).
 *
 *   • EXECUTOR  (kiosk runtime)    — {cmd:'start-job', jobId, bounds}
 *       Runs a saved workflow for a citizen in the same chromeless overlay
 *       window. Auto steps run; the citizen watches/touches the real portal.
 *       Native concerns (uploads, OTP/VNeID/confirm) are requested over IPC —
 *       the WebView hides the browser, shows its overlay, and the reply comes
 *       back as a command.
 *
 * Transport: stdio NDJSON (stdio-conn.js). The Rust shell relays each line
 * to/from the WebView over Tauri IPC. NO WebRTC, NO localhost WebSocket, NO
 * port; the API is never in the media path. The real browser window IS the
 * "video" — positioned by Browser.setWindowBounds (CDP), driven by frame
 * bounds the WebView computes and sends as {cmd:'set-bounds', bounds}.
 *
 * Logs MUST go to stderr (console.error) — stdout is the protocol stream.
 */

const os = require('os');
const core = require('../src');
const api = require('../src/api');
const { installRecorder } = require('../src/recorder-inject');
const { createStdioConn } = require('../src/stdio-conn');

const ROLE = (process.env.ENGINE_ROLE || 'executor').toLowerCase(); // 'executor' | 'recorder'
const RUNNER_ID = process.env.RUNNER_ID || `kiosk-${os.hostname()}`;
const RUNNER_NAME = process.env.RUNNER_NAME || os.hostname();
const HEARTBEAT_MS = 20000;
const RECORD_IDLE_MS = Number(process.env.RECORD_IDLE_MS || 600000);
const INTERACTIVE_IDLE_MS = Number(process.env.INTERACTIVE_IDLE_MS || 120000);
const INTERACTIVE_MAX_MS = Number(process.env.INTERACTIVE_MAX_MS || 600000);

function log(...a) { console.error('[engine]', ...a); }     // stderr — never stdout
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let conn = null;
let shuttingDown = false;
/** The single active session — a record session OR a job (one at a time). */
let session = null;
/** Latest frame bounds from the WebView; the overlay window is glued to this. */
let lastBounds = { left: -32000, top: -32000, width: 1366, height: 900 };

/* ── Shared teardown ─────────────────────────────────────────────── */
async function stopActive(reason) {
  if (!session) return;
  const s = session;
  session = null;
  if (reason) log(`closing ${s.kind} session${s.jobId ? ' ' + s.jobId : ''}: ${reason}`);
  if (s.idleTimer) clearInterval(s.idleTimer);
  try { s.context && await s.context.close(); } catch { /* ignore */ }
  try { s.browser && await s.browser.close(); } catch { /* ignore */ }
}

/* ── Overlay window helpers ──────────────────────────────────────── */
// A chromeless --app window still has a thin OS title bar on Windows (~32px),
// which pushes the WEB CONTENT down inside the frame. Set OVERLAY_TITLEBAR_PX to
// grow the window up by that much so the content (not the title bar) aligns with
// the frame top. Default 0 = outer window == frame (title bar sits in-frame).
const TITLEBAR_PX = Number(process.env.OVERLAY_TITLEBAR_PX || 0);

async function positionActive(bounds) {
  if (!session || !session.page || !bounds) {
    log('positionActive skipped', { hasSession: !!session, hasPage: !!(session && session.page), hasBounds: !!bounds });
    return;
  }
  const b = TITLEBAR_PX
    ? { left: bounds.left, top: bounds.top - TITLEBAR_PX, width: bounds.width, height: bounds.height + TITLEBAR_PX }
    : bounds;
  log('position →', b);
  await core.setPageWindowBounds(session.page, b).catch((e) => log('setWindowBounds failed', e && e.message));
}
/** Hide the real browser so a WebView overlay (OTP/VNeID/upload/confirm) shows. */
async function hideBrowser() {
  if (!session || !session.page) return;
  await core.moveWindowOffscreen(session.page).catch(() => undefined);
}
/** Bring the real browser back over the frame after a WebView overlay closes. */
async function showBrowser() {
  await positionActive(lastBounds);
}

/** Surface page crashes/closes as a visible error instead of a silent blank. */
function guardPage(page) {
  page.on('crash', () => {
    log('page crashed');
    try { conn.send({ evt: 'error', message: 'Trang bị treo (crash) — vui lòng thử lại.' }); } catch { /* ignore */ }
  });
  // Diagnostics: why does dynamic content (e.g. the VNeID QR) fail to render in
  // the overlay browser but not a normal browser? Surface console errors, page
  // JS errors, blocked requests, and 4xx/5xx responses to stderr.
  if (process.env.ENGINE_DEBUG_PAGE !== '0') {
    page.on('console', (m) => { if (m.type() === 'error') log('console.error:', m.text().slice(0, 300)); });
    page.on('pageerror', (e) => log('pageerror:', (e && e.message || String(e)).slice(0, 300)));
    page.on('requestfailed', (r) => {
      const f = r.failure();
      log('requestfailed:', r.method(), r.url().slice(0, 160), '—', f && f.errorText);
    });
    page.on('response', (r) => {
      const s = r.status();
      if (s >= 400) log('http', s, r.request().method(), r.url().slice(0, 160));
    });
    page.on('websocket', (ws) => {
      log('ws open:', ws.url().slice(0, 160));
      ws.on('socketerror', (err) => log('ws error:', ws.url().slice(0, 120), '—', err));
      ws.on('close', () => log('ws close:', ws.url().slice(0, 120)));
    });
  } else {
    page.on('pageerror', () => { /* suppressed */ });
  }
}

/* ══════════════════════ RECORDER role ══════════════════════ */
async function startRecord(payload) {
  await stopActive('superseded');
  const url = payload.url || 'https://dichvucong.gov.vn/';
  if (payload.bounds) lastBounds = payload.bounds;
  const onscreen = lastBounds && lastBounds.left > -10000;
  log('start-record →', url, 'bounds:', lastBounds, onscreen ? '(on-screen)' : '(OFF-SCREEN — waiting for set-bounds)');

  const { context, browser, page } = await core.launchAppWindow({ url, bounds: lastBounds });
  session = { kind: 'record', browser, context, page, lastInput: Date.now(), idleTimer: null };
  guardPage(page);

  // Newly opened popups (SSO/VNeID/new tabs) cover the same frame; keep them
  // on-screen, guard them, and follow the latest for the page-url display.
  context.on('page', (np) => {
    guardPage(np);
    core.setPageWindowBounds(np, lastBounds).catch(() => undefined);
    np.bringToFront().catch(() => undefined);
    np.on('framenavigated', (frame) => {
      try { if (session && session.kind === 'record' && frame === np.mainFrame()) conn.send({ evt: 'page-url', url: np.url() }); } catch { /* ignore */ }
    });
  });

  page.on('framenavigated', (frame) => {
    try { if (session && frame === page.mainFrame()) conn.send({ evt: 'page-url', url: page.url() }); } catch { /* ignore */ }
  });

  await installRecorder(context, page, (action) => {
    if (!session) return;
    session.lastInput = Date.now();
    try { conn.send({ evt: 'recorded', action }); } catch { /* ignore */ }
  });

  conn.send({ evt: 'recorded', action: { kind: 'open', url } }); // opening nav is step 1
  conn.send({ evt: 'ready' });
  await positionActive(lastBounds);

  session.idleTimer = setInterval(() => {
    if (session && session.kind === 'record' && Date.now() - session.lastInput > RECORD_IDLE_MS) {
      log('record idle — auto-closing');
      stopActive('idle');
    }
  }, 15000);
}

/** Admin "preview fill" — type a value into the real page to sanity-check.
 * Searches every frame (the form may sit in an embedded iframe). */
async function previewFill(msg) {
  if (!session || session.kind !== 'record' || !msg.selector) return;
  session.lastInput = Date.now();
  const sel = msg.selectorType === 'XPATH' ? `xpath=${msg.selector}`
    : msg.selectorType === 'ID' ? `#${msg.selector}`
    : msg.selectorType === 'NAME' ? `[name="${msg.selector}"]`
    : msg.selector;
  for (const frame of session.page.frames()) {
    try {
      const loc = frame.locator(sel).first();
      if ((await loc.count().catch(() => 0)) === 0) continue;
      try {
        await loc.fill(msg.text || '', { timeout: 5000 });
      } catch {
        await loc.click({ timeout: 3000 });
        await session.page.keyboard.type(msg.text || '', { delay: 10 });
      }
      return;
    } catch { /* try next frame */ }
  }
}

/* ══════════════════════ EXECUTOR role ══════════════════════ */
async function report(jobId, patch) {
  let pageUrl;
  try { pageUrl = session && session.page ? session.page.url() : undefined; } catch { /* page closing */ }
  try { conn.send({ evt: 'progress', pageUrl, ...patch }); } catch { /* ignore */ }
  await api.updateStatus(jobId, patch).catch(() => undefined);
}

function citizenMsg(step) {
  switch (step.stepType) {
    case 'OPEN_URL': case 'NAVIGATE': return 'Đang mở cổng dịch vụ công…';
    case 'SEARCH_PROCEDURE': return 'Đang tìm thủ tục…';
    case 'WAIT_VNEID_LOGIN': return 'Vui lòng đăng nhập VNeID…';
    case 'UPLOAD_DOCUMENT': case 'UPLOAD': return 'Đang xử lý tài liệu đính kèm…';
    case 'WAIT_SUBMIT': return 'Đang gửi hồ sơ…';
    case 'DETECT_SUCCESS_TEXT': return 'Đang xác nhận kết quả…';
    default: return 'Đang xử lý…';
  }
}

/** Wait for a citizen-input/upload-file reply (sent over IPC), with a timeout.
 * Hides the real browser while waiting so the WebView overlay is visible. */
function waitForInput(ms) {
  return new Promise((resolve) => {
    if (!session) return resolve(null);
    hideBrowser();
    const finish = (payload) => { showBrowser(); resolve(payload); };
    const timer = setTimeout(() => { if (session) session.pendingInput = null; finish(null); }, ms);
    session.pendingInput = (payload) => { clearTimeout(timer); session.pendingInput = null; finish(payload); };
  });
}

async function handleJobInput(msg) {
  if (!session || session.kind !== 'job') return;
  session.lastActivity = Date.now();
  if (msg.cmd === 'finish' || msg.t === 'finish') { session.finished = true; return; }
  if (msg.cmd === 'citizen-input' || msg.cmd === 'upload-file' || msg.t === 'citizen-input' || msg.t === 'upload-file') {
    const fn = session.pendingInput;
    if (fn) fn(msg);
  }
}

async function interactiveWait(jobId, outputData) {
  const deadline = Date.now() + INTERACTIVE_MAX_MS;
  let lastStatusCheck = Date.now();
  while (session && session.kind === 'job' && !session.finished && !shuttingDown && Date.now() < deadline) {
    const pages = session.context.pages().filter((p) => !p.isClosed());
    const latest = pages[pages.length - 1];
    if (latest && latest !== session.page) {
      session.page = latest;
      await core.setPageWindowBounds(latest, lastBounds).catch(() => undefined);
      await latest.bringToFront().catch(() => undefined);
    }
    if (Date.now() - session.lastActivity > INTERACTIVE_IDLE_MS) { log(`job ${jobId} idle — closing`); break; }
    if (Date.now() - lastStatusCheck > 2500) {
      lastStatusCheck = Date.now();
      try {
        const code = await session.page.evaluate(() => {
          const m = document.body?.innerText?.match(/(?:m[ãa]\s*h[ồo]\s*s[ơo]|m[ãa]\s*biên\s*nh[ậa]n)[:\s]*([A-Z0-9.\-/]{5,})/i);
          return m ? m[1] : null;
        }).catch(() => null);
        if (code && !outputData.applicationCode) outputData.applicationCode = code;
      } catch { /* ignore */ }
      try {
        const job = await api.getJob(jobId);
        if (job && ['CANCELLED', 'FAILED'].includes(job.status)) break;
      } catch { /* ignore */ }
    }
    await sleep(150);
  }
}

async function completeJob(jobId, outputData) {
  await report(jobId, {
    status: 'COMPLETED', progressPercent: 100, outputData,
    citizenMessage: outputData.applicationCode
      ? `Nộp hồ sơ thành công! Mã hồ sơ: ${outputData.applicationCode}`
      : 'Đã hoàn tất phiên nộp hồ sơ.',
  });
  log(`job ${jobId} COMPLETED`, outputData);
}

async function runJob(payload) {
  const jobId = payload.jobId;
  await stopActive('superseded');
  if (payload.bounds) lastBounds = payload.bounds;
  const job = await api.getJob(jobId);
  const steps = (job.template?.steps || []).slice().sort((a, b) => a.stepOrder - b.stepOrder);
  const input = job.inputData || {};
  const ctx = { citizen: input.citizenProfile || {}, form: input.formData || {} };
  const outputData = {};
  log(`job ${jobId} — "${job.template?.name}" (${steps.length} steps)`);
  await report(jobId, { status: 'RUNNING', progressPercent: 0, citizenMessage: 'Đang khởi tạo quy trình…' });

  const firstNavigates = steps[0] && ['OPEN_URL', 'NAVIGATE'].includes(steps[0].stepType);
  const initialUrl = firstNavigates ? (steps[0].url || job.template?.targetUrl) : (job.template?.targetUrl || 'about:blank');

  const onscreen = lastBounds && lastBounds.left > -10000;
  log(`job ${jobId} launching →`, initialUrl, 'bounds:', lastBounds, onscreen ? '(on-screen)' : '(OFF-SCREEN — waiting for set-bounds)');
  const { context, browser, page } = await core.launchAppWindow({ url: initialUrl, bounds: lastBounds });
  guardPage(page);
  context.on('page', (np) => {
    guardPage(np);
    core.setPageWindowBounds(np, lastBounds).catch(() => undefined);
    np.bringToFront().catch(() => undefined);
  });
  session = { kind: 'job', jobId, browser, context, page, pendingInput: null, finished: false, lastActivity: Date.now(), idleTimer: null };
  conn.send({ evt: 'ready' });
  await positionActive(lastBounds);

  const helpers = {
    requestInput: (kind, payload2) => { try { conn.send({ evt: 'request-input', kind, payload: payload2 }); } catch { /* ignore */ } },
    waitForInput: (ms) => waitForInput(ms),
    notify: (msg) => { try { conn.send({ evt: 'progress', citizenMessage: msg }); } catch { /* ignore */ } },
    materializeFile: (i) => i.path || i.value, // native picker → local path → setInputFiles
    screenshot: () => undefined,
  };

  try {
    for (let i = 0; i < steps.length; i++) {
      if (!session) return; // cancelled mid-run
      const step = steps[i];
      const started = Date.now();
      await report(jobId, {
        status: 'RUNNING', progressPercent: Math.round((i / steps.length) * 100),
        currentStepOrder: step.stepOrder, citizenMessage: citizenMsg(step),
      });
      try {
        const r = await core.executeStep(session.page, step, ctx, helpers);
        if (r?.extracted) Object.assign(outputData, r.extracted);
        await api.addLog(jobId, { stepOrder: step.stepOrder, stepName: step.name, level: 'INFO', message: `OK: ${step.stepType}`, durationMs: Date.now() - started }).catch(() => undefined);
      } catch (err) {
        await api.addLog(jobId, { stepOrder: step.stepOrder, stepName: step.name, level: 'ERROR', message: `FAIL: ${step.stepType} — ${err.message}`.slice(0, 400), durationMs: Date.now() - started }).catch(() => undefined);
        if (step.onFailure === 'SKIP') continue;
        log(`job ${jobId} step ${step.stepOrder} failed → interactive`);
        await report(jobId, { status: 'RUNNING', currentStepOrder: step.stepOrder, citizenMessage: 'Tự động dừng tại bước này — mời bạn thao tác trực tiếp trên màn hình.' });
        await interactiveWait(jobId, outputData);
        await completeJob(jobId, outputData);
        await stopActive('done');
        return;
      }
      if (step.delayAfterMs) await sleep(step.delayAfterMs);
    }
    await interactiveWait(jobId, outputData);
    await completeJob(jobId, outputData);
  } catch (err) {
    log(`job ${jobId} FAILED:`, err.message);
    await report(jobId, { status: 'FAILED', failReason: err.message?.slice(0, 400), citizenMessage: 'Rất tiếc, quy trình chưa hoàn tất. Vui lòng thử lại hoặc nhờ nhân viên hỗ trợ.' });
  } finally {
    await stopActive('finally');
  }
}

/* ── Runner registration (executor role only) ────────────────────── */
let runnerUuid = null;
async function register() {
  for (let attempt = 1; !shuttingDown; attempt++) {
    try {
      const r = await api.registerRunner({ runnerId: RUNNER_ID, name: RUNNER_NAME, host: os.hostname(), browserType: 'CHROMIUM', version: '4.0.0', capacity: 1 });
      runnerUuid = r.id;
      log('registered as runner', runnerUuid);
      return;
    } catch (e) {
      if (attempt === 1 || attempt % 5 === 0) log(`waiting for API at ${api.API_BASE}… (${e.message.slice(0, 60)})`);
      await sleep(3000);
    }
  }
}
async function heartbeatLoop() {
  while (!shuttingDown) {
    await api.heartbeat(RUNNER_ID, { activeSessions: session && session.kind === 'job' ? 1 : 0 }).catch(() => undefined);
    await sleep(HEARTBEAT_MS);
  }
}

/* ── Wiring ──────────────────────────────────────────────────────── */
function main() {
  conn = createStdioConn();
  conn.onMessage = (msg) => {
    switch (msg.cmd) {
      case 'start-record':
        startRecord(msg).catch((e) => { log('start-record error', e.message); conn.send({ evt: 'error', message: e.message }); });
        return;
      case 'start-job':
        if (msg.jobId) runJob(msg).catch((e) => { log('runJob error', e.message); conn.send({ evt: 'error', message: e.message }); });
        return;
      case 'set-bounds':
        if (msg.bounds) { lastBounds = msg.bounds; positionActive(msg.bounds); }
        return;
      case 'show-browser':
        if (msg.visible === false) hideBrowser(); else showBrowser();
        return;
      case 'preview-fill':
        previewFill(msg).catch(() => undefined);
        return;
      case 'citizen-input':
      case 'upload-file':
      case 'finish':
        handleJobInput(msg).catch(() => undefined);
        return;
      case 'stop':
        stopActive('webview stop');
        return;
    }
  };
  conn.onClose = () => { log('stdin closed — shutting down'); shuttingDown = true; stopActive('stdin closed').finally(() => process.exit(0)); };

  log(`ready (role=${ROLE})`);
  conn.send({ evt: 'engine-ready', role: ROLE });

  if (ROLE === 'executor') register().then(() => heartbeatLoop());
}

process.on('SIGINT', () => { shuttingDown = true; stopActive('sigint').finally(() => setTimeout(() => process.exit(0), 300)); });
process.on('SIGTERM', () => { shuttingDown = true; stopActive('sigterm').finally(() => setTimeout(() => process.exit(0), 300)); });
main();
