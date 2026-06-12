'use strict';
/*
 * Smart Kiosk — Selenium/Playwright Runner Agent
 *
 * Registers with the API, claims QUEUED workflow jobs for this runner, and
 * drives an isolated browser context through the CMS-configured steps against
 * the target government portal (e.g. https://dichvucong.gov.vn/).
 *
 * Run:  API_BASE=http://localhost:3001 RUNNER_ID=runner-01 node src/runner.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const api = require('./api');
const { executeStep } = require('./steps');
const { captureElementAt } = require('./recorder');
const { createLiveStreamer } = require('./screencast');

const RUNNER_ID   = process.env.RUNNER_ID   || 'runner-01';
const RUNNER_NAME = process.env.RUNNER_NAME || 'Local Playwright Runner';
const BROWSER_MODE = (process.env.BROWSER_MODE || (process.env.HEADLESS === 'false' ? 'hidden' : 'headless')).toLowerCase();
const HEADLESS    = BROWSER_MODE === 'headless';
const HIDE_BROWSER_WINDOW = !HEADLESS && BROWSER_MODE !== 'visible';
const HIDDEN_BROWSER_ARGS = ['--window-position=-32000,-32000', '--window-size=1366,900'];
// Poll fast so a dispatched job starts within ~1s instead of up to 3s.
const POLL_MS     = Number(process.env.POLL_MS || 1000);
const HEARTBEAT_MS = 20000;
const LIVE_FRAME_INTERVAL_MS = Number(process.env.LIVE_FRAME_INTERVAL_MS || 140);
// Render scale of the browser surface. Screencast downscales to SCREENCAST_MAX_W,
// so 1.5× gives sharp frames without over-taxing the compositor.
const LIVE_SCALE = Number(process.env.LIVE_SCALE || 1.5);
// Auto-reclaim abandoned live sessions so browsers don't pile up.
const INTERACTIVE_IDLE_MS = Number(process.env.INTERACTIVE_IDLE_MS || 120000); // 2 min no activity
const INTERACTIVE_MAX_MS  = Number(process.env.INTERACTIVE_MAX_MS || 600000);  // 10 min hard cap
const RECORD_IDLE_MS      = Number(process.env.RECORD_IDLE_MS || 300000);      // 5 min no activity
// Delete generated screenshots older than this so disk doesn't grow unbounded.
const SHOT_TTL_MS         = Number(process.env.SHOT_TTL_MS || 6 * 3600 * 1000); // 6 h
const SHOT_SWEEP_MS       = Number(process.env.SHOT_SWEEP_MS || 30 * 60 * 1000); // every 30 min
// Screenshots written here so the API can serve them at /uploads/selenium/...
const SHOT_DIR = process.env.SHOT_DIR
  || path.resolve(__dirname, '../../kiosk_api/uploads/selenium');

let runnerUuid = null;
let activeJobs = 0;
let shuttingDown = false;

function log(...a) { console.log(`[runner ${RUNNER_ID}]`, ...a); }
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
    touchPoints: type === 'touchEnd'
      ? []
      : [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 0 }],
  });
}

async function reportFocusedInput(page, jobId) {
  try {
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      const type = (el.getAttribute && (el.getAttribute('type') || '')).toLowerCase();
      const nonText = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image'];
      return tag === 'TEXTAREA' || el.isContentEditable === true ||
        (tag === 'INPUT' && !nonText.includes(type));
    });
    await api.reportFocus(jobId, focused).catch(() => undefined);
  } catch { /* page may have navigated */ }
}

async function moveBrowserWindowOffscreen(page) {
  if (!HIDE_BROWSER_WINDOW) return;
  try {
    const session = await page.context().newCDPSession(page);
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: { left: -32000, top: -32000, width: 1366, height: 900, windowState: 'normal' },
    });
    await session.detach().catch(() => undefined);
  } catch (error) {
    log('could not move browser window offscreen:', error.message);
  }
}

/* ── Citizen-input bridge (VNeID / OTP / upload) ─────────── */
async function waitForInput(jobId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const input = await api.pollInput(jobId).catch(() => null);
    if (input && Object.keys(input).length) return input;
    await sleep(2000);
  }
  return null;
}

/** Turn a citizen-input payload into a local file path for upload. */
async function materializeFile(input) {
  // input may carry { fileUrl } / { value } / { payload:{fileUrl} } / { filePath }
  if (input.filePath && fs.existsSync(input.filePath)) return input.filePath;
  const url = input.fileUrl || input.url || input.value || input.payload?.fileUrl;
  if (!url) throw new Error('Upload input had no file');
  const abs = url.startsWith('http') ? url : `${api.API_BASE}${url}`;
  const res = await fetch(abs);
  if (!res.ok) throw new Error(`Download upload failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = path.join(os.tmpdir(), `kiosk_upload_${Date.now()}_${path.basename(url).slice(-40)}`);
  fs.writeFileSync(tmp, buf);
  return tmp;
}

/**
 * When the portal opens a file picker, intercept it: ask the kiosk for a file
 * (kiosk camera or phone QR), wait for it, then feed it to the file input.
 * Keeps the OS file dialog from ever appearing on the kiosk screen.
 */
function attachFileChooser(page, jobId) {
  page.on('filechooser', async (chooser) => {
    log(`job ${jobId} — portal requested a file upload`);
    try {
      await api.requestInput(jobId, 'UPLOAD', { uploadField: '' }).catch(() => undefined);
      const input = await waitForInput(jobId, 5 * 60 * 1000); // 5 min for citizen
      if (!input) { await chooser.setFiles([]).catch(() => undefined); return; }
      const filePath = await materializeFile(input);
      await chooser.setFiles(filePath);
      log(`job ${jobId} — uploaded ${filePath}`);
    } catch (e) {
      log(`job ${jobId} — filechooser error: ${e.message}`);
      await chooser.setFiles([]).catch(() => undefined);
    }
  });
}

/* ── Execute one job end-to-end ──────────────────────────── */
async function runJob(job) {
  activeJobs++;
  const steps = (job.template?.steps || []).slice().sort((a, b) => a.stepOrder - b.stepOrder);
  const input = job.inputData || {};
  const ctx = { citizen: input.citizenProfile || {}, form: input.formData || {} };
  // Default to ON_EACH_STEP so kiosk gets live screenshots pushed to it
  const screenshotMode = job.template?.screenshotMode || 'ON_EACH_STEP';
  const outputData = {};

  log(`job ${job.id} — "${job.template?.name}" (${steps.length} steps)`);
  await api.updateStatus(job.id, { status: 'RUNNING', progressPercent: 0, citizenMessage: 'Đang khởi tạo quy trình…' });

  let browser, context, page;
  const streamer = createLiveStreamer(job.id);
  try {
    browser = await chromium.launch({
      headless: HEADLESS,
      args: HIDE_BROWSER_WINDOW ? HIDDEN_BROWSER_ARGS : [],
    });
    context = await browser.newContext({
      locale: 'vi-VN',
      viewport: { width: 1366, height: 900 },
      // Render slightly above 1× so frames are crisp when scaled up on the kiosk
      // display. Layout stays at 1366×900 CSS px, so click/scroll coords from
      // the kiosk (logical space) are unaffected.
      deviceScaleFactor: LIVE_SCALE,
      hasTouch: true,
    });
    // Only do per-page SETUP here. Do NOT reassign `page` or move the live
    // stream to popups from this event — the run/record/interactive loops own
    // page selection. Otherwise a popup (e.g. the VNeID SSO window) would hijack
    // the stream to a blank page while the loop keeps driving the portal,
    // leaving the recorder frozen/white.
    context.on('page', async (newPage) => {
      await moveBrowserWindowOffscreen(newPage);
      attachFileChooser(newPage, job.id);
    });
    page = await context.newPage();
    await moveBrowserWindowOffscreen(page);
    attachFileChooser(page, job.id);

    // ── Record mode: open the target URL and let the admin click to capture steps ──
    if (input.recordMode) {
      const url = input.recordUrl || job.template?.targetUrl || 'https://dichvucong.gov.vn/';
      await streamer.attach(page).catch(() => undefined);
      await recordLoop(job.id, page, url, streamer);
      return;
    }

    // Start live screencast for the whole session — the citizen sees the portal
    // paint live (event-driven), not waiting on per-step screenshots.
    await streamer.attach(page).catch(() => undefined);

    // Navigate to the target URL up-front and push an early frame, so the kiosk
    // leaves the "đang kết nối" state as soon as the portal is visible — even
    // before the first configured step finishes. Skip if step 0 already
    // navigates (it would double-load the page).
    const firstNavigates = steps[0] && ['OPEN_URL', 'NAVIGATE'].includes(steps[0].stepType);
    if (job.template?.targetUrl && !firstNavigates) {
      // Screencast already streams the load live; just kick off navigation.
      await page.goto(job.template.targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const started = Date.now();
      const helpers = {
        requestInput: (type, payload) => api.requestInput(job.id, type, payload),
        waitForInput: (ms) => waitForInput(job.id, ms),
        materializeFile,
        screenshot: () => captureShot(job.id, page, step),
      };

      await api.updateStatus(job.id, {
        status: 'RUNNING',
        progressPercent: Math.round((i / steps.length) * 100),
        currentStepOrder: step.stepOrder,
        citizenMessage: citizenMsg(step),
      }).catch(() => undefined);

      try {
        const r = await executeStep(page, step, ctx, helpers);
        if (r?.extracted) Object.assign(outputData, r.extracted);
        await api.addLog(job.id, {
          stepOrder: step.stepOrder, stepName: step.name, level: 'INFO',
          message: `OK: ${step.stepType}`, durationMs: Date.now() - started,
        }).catch(() => undefined);
        if (screenshotMode === 'ON_EACH_STEP' || screenshotMode === 'ALWAYS') {
          await captureShot(job.id, page, step).catch(() => undefined);
        }
      } catch (err) {
        await api.addLog(job.id, {
          stepOrder: step.stepOrder, stepName: step.name, level: 'ERROR',
          message: `FAIL: ${step.stepType} — ${err.message}`.slice(0, 400),
          durationMs: Date.now() - started,
        }).catch(() => undefined);
        await captureShot(job.id, page, step).catch(() => undefined);

        if (step.onFailure === 'SKIP') continue;
        // Automation can't proceed automatically — hand control to the citizen
        // on the live frame instead of failing the whole job.
        log(`job ${job.id} step ${step.stepOrder} failed → switching to interactive mode`);
        await api.updateStatus(job.id, {
          status: 'RUNNING',
          currentStepOrder: step.stepOrder,
          citizenMessage: 'Tự động dừng tại bước này — mời bạn thao tác trực tiếp trên màn hình.',
        }).catch(() => undefined);
        await interactiveLoop(job.id, page, outputData, streamer);
        await completeJob(job.id, outputData);
        return;
      }
      if (step.delayAfterMs) await sleep(step.delayAfterMs);
    }

    // All configured steps done — let the citizen review / finish on the live
    // frame before we mark the job complete (they tap "Tôi đã hoàn tất").
    await interactiveLoop(job.id, page, outputData, streamer);
    await completeJob(job.id, outputData);
  } catch (err) {
    log(`job ${job.id} FAILED:`, err.message);
    await api.updateStatus(job.id, {
      status: 'FAILED',
      failReason: err.message?.slice(0, 400),
      citizenMessage: 'Rất tiếc, quy trình nộp hồ sơ chưa hoàn tất. Vui lòng thử lại hoặc nhờ nhân viên hỗ trợ.',
    }).catch(() => undefined);
  } finally {
    await streamer.stop().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    activeJobs--;
  }
}

/* ── Interactive remote control ──────────────────────────── */
/** Apply one kiosk-originated interaction event to the live page. */
async function applyEvent(page, jobId, ev) {
  switch (ev.type) {
    case 'click':
      if (typeof ev.x !== 'number' || typeof ev.y !== 'number') return;
      await page.mouse.click(ev.x, ev.y);
      await reportFocusedInput(page, jobId);
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
      await reportFocusedInput(page, jobId);
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

/** Let the citizen drive the live browser: apply taps/keys, stream screenshots,
 *  until they tap "Tôi đã hoàn tất" (finish event) or the job is cancelled. */
async function interactiveLoop(jobId, initialPage, outputData, streamer) {
  log(`job ${jobId} — interactive mode (citizen driving the live portal)`);
  const istep = { stepOrder: 50, name: 'Thao tác trực tiếp' };
  const context = initialPage.context();
  let page = initialPage;
  // Discard any taps queued while automation was still running
  await api.drainInteractions(jobId).catch(() => undefined);
  if (streamer) await streamer.attach(page).catch(() => undefined);
  else await captureLiveFrame(jobId, page, istep).catch(() => undefined);

  const deadline = Date.now() + INTERACTIVE_MAX_MS;
  let finished = false, lastShot = Date.now(), lastActivity = Date.now(), lastStatusCheck = Date.now();

  while (!finished && !shuttingDown && Date.now() < deadline) {
    const pages = context.pages().filter(candidate => !candidate.isClosed());
    const latestPage = pages[pages.length - 1];
    if (latestPage && latestPage !== page) {
      page = latestPage;
      await moveBrowserWindowOffscreen(page);
      await page.bringToFront().catch(() => undefined);
      if (streamer) await streamer.attach(page).catch(() => undefined);
    }

    let events = [];
    try { events = await api.drainInteractions(jobId); } catch { events = []; }

    for (const ev of events) {
      if (ev.type === 'finish') { finished = true; break; }
      try { await applyEvent(page, jobId, ev); } catch { /* ignore single event error */ }
    }
    if (events.length) lastActivity = Date.now();

    // Citizen walked away — reclaim the browser instead of holding it open.
    if (Date.now() - lastActivity > INTERACTIVE_IDLE_MS) {
      log(`job ${jobId} — interactive idle ${Math.round(INTERACTIVE_IDLE_MS / 1000)}s, auto-closing`);
      finished = true;
    }

    // Screencast pushes frames automatically. Safety net: if no frame has gone
    // out for >1.5s (e.g. cast stalled mid-navigation), force one screenshot.
    const now = Date.now();
    const stale = streamer ? !streamer.isFresh(1500) : (now - lastShot > 800);
    if (stale && now - lastShot > 700) {
      await captureLiveFrame(jobId, page, istep).catch(() => undefined);
      lastShot = now;
    }

    // Every ~2.5s: detect a submission/tracking code + check if the kiosk
    // cancelled (citizen left the screen) so we close the browser promptly.
    if (Date.now() - lastStatusCheck > 2500) {
      lastStatusCheck = Date.now();
      try {
        const code = await page.evaluate(() => {
          const m = document.body?.innerText?.match(/(?:m[ãa]\s*h[ồo]\s*s[ơo]|m[ãa]\s*biên\s*nh[ậa]n)[:\s]*([A-Z0-9.\-\/]{5,})/i);
          return m ? m[1] : null;
        });
        if (code && !outputData.applicationCode) outputData.applicationCode = code;
      } catch { /* ignore */ }
      try {
        const job = await api.getJob(jobId);
        if (job && ['CANCELLED', 'FAILED'].includes(job.status)) { finished = true; }
      } catch { /* ignore */ }
    }

    await sleep(events.length ? 20 : 70);
  }
}

async function completeJob(jobId, outputData) {
  await api.updateStatus(jobId, {
    status: 'COMPLETED',
    progressPercent: 100,
    outputData,
    citizenMessage: outputData.applicationCode
      ? `Nộp hồ sơ thành công! Mã hồ sơ: ${outputData.applicationCode}`
      : 'Đã hoàn tất phiên nộp hồ sơ.',
  }).catch(() => undefined);
  log(`job ${jobId} COMPLETED`, outputData);
}

/* ── Record mode (admin builds a template by clicking the live portal) ───── */
/** Race a promise against a timeout so a navigating click can't stall the loop. */
function withTimeout(promise, ms) {
  return Promise.race([
    Promise.resolve(promise).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);
}

async function applyRecordEvent(page, jobId, ev) {
  if (ev.type === 'click') {
    if (typeof ev.x !== 'number' || typeof ev.y !== 'number') return;
    // Capture the selector BEFORE the click (the click may navigate the page).
    const info = await withTimeout(captureElementAt(page, ev.x, ev.y), 3000);
    // Don't await the click open-ended — a click that triggers navigation or a
    // popup must never block the record loop (which would freeze the recorder).
    await withTimeout(page.mouse.click(ev.x, ev.y), 3000);
    if (info && info.selector) {
      await api.recordAction(jobId, { kind: 'click', ...info }).catch(() => undefined);
    }
  } else if (ev.type === 'fill') {
    if (!ev.selector) return;
    try {
      const loc = page.locator(ev.selector).first();
      await loc.fill(ev.text || '', { timeout: 5000 });
    } catch {
      // fallback: focus + type
      try { await page.locator(ev.selector).first().click({ timeout: 3000 }); await page.keyboard.type(ev.text || '', { delay: 10 }); } catch { /* ignore */ }
    }
    await api.recordAction(jobId, {
      kind: 'fill', selector: ev.selector, selectorType: ev.selectorType || 'CSS', value: ev.text || '',
    }).catch(() => undefined);
  } else if (ev.type === 'scroll') {
    await page.mouse.wheel(ev.deltaX || 0, ev.deltaY || 0).catch(() => undefined);
  } else if (ev.type === 'type') {
    if (ev.text) await page.keyboard.type(ev.text, { delay: 12 }).catch(() => undefined);
  } else if (ev.type === 'key') {
    if (ev.key) await page.keyboard.press(ev.key).catch(() => undefined);
  }
}

async function recordLoop(jobId, page, targetUrl, streamer) {
  log(`job ${jobId} — RECORD mode → ${targetUrl}`);
  await api.updateStatus(jobId, { status: 'RUNNING', progressPercent: 0, citizenMessage: 'Đang ghi quy trình…' }).catch(() => undefined);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
  await api.drainInteractions(jobId).catch(() => undefined);
  if (streamer) await streamer.attach(page).catch(() => undefined);
  else await captureLiveFrame(jobId, page, { stepOrder: 0, name: 'record' }).catch(() => undefined);
  // Record the opening navigation as the first step
  await api.recordAction(jobId, { kind: 'open', url: targetUrl }).catch(() => undefined);

  const deadline = Date.now() + INTERACTIVE_MAX_MS;
  let finished = false, lastShot = Date.now(), lastActivity = Date.now(), lastStatusCheck = Date.now();
  let pageCount = page.context().pages().length;

  while (!finished && !shuttingDown && Date.now() < deadline) {
    // Stay on the page the admin is recording. Do NOT auto-follow popups — a
    // VNeID/SSO popup must not hijack recording (it would show a blank frame and
    // capture useless selectors). Only switch if the current page was closed.
    if (page.isClosed()) {
      const open = page.context().pages().filter((p) => !p.isClosed());
      const next = open[open.length - 1];
      if (next) { page = next; await moveBrowserWindowOffscreen(page); await page.bringToFront().catch(() => undefined); if (streamer) await streamer.attach(page).catch(() => undefined); }
    } else {
      // A popup just opened (e.g. VNeID) — reclaim foreground for the recorded
      // page so its screencast keeps emitting, then ignore the popup.
      const n = page.context().pages().length;
      if (n > pageCount) { await page.bringToFront().catch(() => undefined); }
      pageCount = n;
    }

    let events = [];
    try { events = await api.drainInteractions(jobId); } catch { events = []; }
    for (const ev of events) {
      if (ev.type === 'finish') { finished = true; break; }
      try { await applyRecordEvent(page, jobId, ev); } catch (e) { log('record ev err', e.message); }
    }
    if (events.length) lastActivity = Date.now();

    // Admin closed the recorder without "finish", or job cancelled → reclaim.
    if (Date.now() - lastActivity > RECORD_IDLE_MS) {
      log(`job ${jobId} — record idle ${Math.round(RECORD_IDLE_MS / 1000)}s, auto-closing`);
      finished = true;
    }
    if (Date.now() - lastStatusCheck > 2500) {
      lastStatusCheck = Date.now();
      try {
        const job = await api.getJob(jobId);
        if (job && ['CANCELLED', 'FAILED', 'COMPLETED'].includes(job.status)) finished = true;
      } catch { /* ignore */ }
    }

    // Screencast streams automatically; safety net only if the cast stalls.
    const now = Date.now();
    const stale = streamer ? !streamer.isFresh(1500) : (now - lastShot > 700);
    if (stale && now - lastShot > 700) {
      await captureLiveFrame(jobId, page, { stepOrder: 0, name: 'record' }).catch(() => undefined);
      lastShot = now;
    }
    await sleep(events.length ? 20 : 60);
  }

  await api.updateStatus(jobId, { status: 'COMPLETED', progressPercent: 100, citizenMessage: 'Đã kết thúc ghi quy trình.' }).catch(() => undefined);
  log(`job ${jobId} — record finished`);
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

async function captureShot(jobId, page, step) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  // JPEG (not PNG) → a fraction of the size for the persisted step history.
  const file = `${jobId}_s${step.stepOrder || 0}_${Date.now()}.jpg`;
  const abs = path.join(SHOT_DIR, file);
  await page.screenshot({ path: abs, type: 'jpeg', quality: 70, fullPage: false });
  const size = fs.statSync(abs).size;
  let pageUrl;
  try { pageUrl = page.url(); } catch { /* page may be closed */ }
  await api.addScreenshot(jobId, {
    storagePath: `selenium/${file}`, stepOrder: step.stepOrder, stepName: step.name, sizeBytes: size, pageUrl,
  }).catch(() => undefined);
}

// Live frames go straight over the WebSocket as binary JPEG — no disk write,
// no second HTTP GET from the client. Much lower latency + smoother playback.
const LIVE_QUALITY = Number(process.env.LIVE_QUALITY || 72);

async function captureLiveFrame(jobId, page, step) {
  let buf;
  try {
    buf = await page.screenshot({ type: 'jpeg', quality: LIVE_QUALITY, fullPage: false });
  } catch {
    return; // page may be navigating / closed
  }
  let pageUrl;
  try { pageUrl = page.url(); } catch { /* page may be closed */ }
  await api.sendFrame(jobId, buf, {
    pageUrl,
    stepName: step.name,
    stepOrder: step.stepOrder,
  }).catch(() => undefined);
}

/* ── Lifecycle ───────────────────────────────────────────── */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Delete generated screenshots older than SHOT_TTL_MS so disk stays bounded. */
function sweepOldShots() {
  const dirs = [SHOT_DIR, path.join(SHOT_DIR, 'live')];
  const now = Date.now();
  let removed = 0;
  for (const dir of dirs) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch { continue; }
    for (const f of entries) {
      const fp = path.join(dir, f);
      try {
        const st = fs.statSync(fp);
        if (st.isFile() && now - st.mtimeMs > SHOT_TTL_MS) { fs.unlinkSync(fp); removed++; }
      } catch { /* file vanished / locked — skip */ }
    }
  }
  if (removed) log(`cleanup: removed ${removed} screenshot file(s) older than ${Math.round(SHOT_TTL_MS / 3600000)}h`);
}

async function sweepLoop() {
  while (!shuttingDown) {
    try { sweepOldShots(); } catch { /* ignore */ }
    await sleep(SHOT_SWEEP_MS);
  }
}

async function register() {
  // Retry until the API is reachable (it may still be booting from start.bat)
  for (let attempt = 1; !shuttingDown; attempt++) {
    try {
      const r = await api.registerRunner({
        runnerId: RUNNER_ID, name: RUNNER_NAME, host: os.hostname(),
        browserType: 'CHROMIUM', version: '1.0.0', capacity: 3,
      });
      runnerUuid = r.id;
      log('registered, uuid =', runnerUuid);
      return;
    } catch (e) {
      if (attempt === 1 || attempt % 5 === 0) {
        log(`waiting for API at ${api.API_BASE}… (${e.message.slice(0, 60)})`);
      }
      await sleep(3000);
    }
  }
}

async function pollLoop() {
  while (!shuttingDown) {
    try {
      if (activeJobs < 3) {
        const jobs = await api.dequeue(runnerUuid, 1);
        if (jobs.length) {
          // run without awaiting so heartbeat keeps flowing
          runJob(jobs[0]).catch(e => log('runJob error', e.message));
        }
      }
    } catch (e) {
      log('poll error:', e.message);
    }
    await sleep(POLL_MS);
  }
}

async function heartbeatLoop() {
  while (!shuttingDown) {
    await api.heartbeat(RUNNER_ID, { activeSessions: activeJobs }).catch(() => undefined);
    await sleep(HEARTBEAT_MS);
  }
}

async function main() {
  log('starting · API', api.API_BASE, '· browserMode', BROWSER_MODE, '· headless', HEADLESS);
  await register();
  heartbeatLoop();
  pollLoop();
  sweepLoop(); // prune old screenshots so disk doesn't grow unbounded
  log('polling for jobs…');
}

process.on('SIGINT', () => { shuttingDown = true; log('shutting down'); setTimeout(() => process.exit(0), 500); });
main().catch(e => { console.error('FATAL', e); process.exit(1); });
