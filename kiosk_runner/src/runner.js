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

const RUNNER_ID   = process.env.RUNNER_ID   || 'runner-01';
const RUNNER_NAME = process.env.RUNNER_NAME || 'Local Playwright Runner';
const BROWSER_MODE = (process.env.BROWSER_MODE || (process.env.HEADLESS === 'false' ? 'hidden' : 'headless')).toLowerCase();
const HEADLESS    = BROWSER_MODE === 'headless';
const HIDE_BROWSER_WINDOW = !HEADLESS && BROWSER_MODE !== 'visible';
const HIDDEN_BROWSER_ARGS = ['--window-position=-32000,-32000', '--window-size=1366,900'];
const POLL_MS     = Number(process.env.POLL_MS || 3000);
const HEARTBEAT_MS = 20000;
const LIVE_FRAME_INTERVAL_MS = Number(process.env.LIVE_FRAME_INTERVAL_MS || 140);
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
  // input may carry { fileUrl } (served by API) or { filePath }
  if (input.filePath && fs.existsSync(input.filePath)) return input.filePath;
  const url = input.fileUrl || input.url;
  if (!url) throw new Error('Upload input had no file');
  const abs = url.startsWith('http') ? url : `${api.API_BASE}${url}`;
  const res = await fetch(abs);
  if (!res.ok) throw new Error(`Download upload failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = path.join(os.tmpdir(), `kiosk_upload_${Date.now()}_${path.basename(url).slice(-40)}`);
  fs.writeFileSync(tmp, buf);
  return tmp;
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
  try {
    browser = await chromium.launch({
      headless: HEADLESS,
      args: HIDE_BROWSER_WINDOW ? HIDDEN_BROWSER_ARGS : [],
    });
    context = await browser.newContext({
      locale: 'vi-VN',
      viewport: { width: 1366, height: 900 },
      hasTouch: true,
    });
    context.on('page', async (newPage) => {
      await moveBrowserWindowOffscreen(newPage);
      if (newPage !== page) {
        page = newPage;
        await newPage.bringToFront().catch(() => undefined);
      }
    });
    page = await context.newPage();
    await moveBrowserWindowOffscreen(page);

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
        await interactiveLoop(job.id, page, outputData);
        await completeJob(job.id, outputData);
        return;
      }
      if (step.delayAfterMs) await sleep(step.delayAfterMs);
    }

    // All configured steps done — let the citizen review / finish on the live
    // frame before we mark the job complete (they tap "Tôi đã hoàn tất").
    await interactiveLoop(job.id, page, outputData);
    await completeJob(job.id, outputData);
  } catch (err) {
    log(`job ${job.id} FAILED:`, err.message);
    await api.updateStatus(job.id, {
      status: 'FAILED',
      failReason: err.message?.slice(0, 400),
      citizenMessage: 'Rất tiếc, quy trình nộp hồ sơ chưa hoàn tất. Vui lòng thử lại hoặc nhờ nhân viên hỗ trợ.',
    }).catch(() => undefined);
  } finally {
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
async function interactiveLoop(jobId, initialPage, outputData) {
  log(`job ${jobId} — interactive mode (citizen driving the live portal)`);
  const istep = { stepOrder: 50, name: 'Thao tác trực tiếp' };
  const context = initialPage.context();
  let page = initialPage;
  // Discard any taps queued while automation was still running
  await api.drainInteractions(jobId).catch(() => undefined);
  await captureLiveFrame(jobId, page, istep).catch(() => undefined);

  const deadline = Date.now() + 20 * 60 * 1000; // 20-minute safety cap
  let finished = false, lastShot = Date.now(), tick = 0, frameDirty = false;

  while (!finished && !shuttingDown && Date.now() < deadline) {
    const pages = context.pages().filter(candidate => !candidate.isClosed());
    const latestPage = pages[pages.length - 1];
    if (latestPage && latestPage !== page) {
      page = latestPage;
      await moveBrowserWindowOffscreen(page);
      await page.bringToFront().catch(() => undefined);
      frameDirty = true;
    }

    let events = [];
    try { events = await api.drainInteractions(jobId); } catch { events = []; }

    let changed = false;
    for (const ev of events) {
      if (ev.type === 'finish') { finished = true; break; }
      try { await applyEvent(page, jobId, ev); changed = true; } catch { /* ignore single event error */ }
    }
    if (changed) frameDirty = true;

    const now = Date.now();
    if ((frameDirty && now - lastShot >= LIVE_FRAME_INTERVAL_MS) || now - lastShot > 800) {
      await captureLiveFrame(jobId, page, istep).catch(() => undefined);
      lastShot = now;
      frameDirty = false;
    }

    // Every ~6s, opportunistically detect a submission/tracking code + check for cancel
    if (++tick % 10 === 0) {
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
  const file = `${jobId}_s${step.stepOrder || 0}_${Date.now()}.png`;
  const abs = path.join(SHOT_DIR, file);
  await page.screenshot({ path: abs, fullPage: false });
  const size = fs.statSync(abs).size;
  let pageUrl;
  try { pageUrl = page.url(); } catch { /* page may be closed */ }
  await api.addScreenshot(jobId, {
    storagePath: `selenium/${file}`, stepOrder: step.stepOrder, stepName: step.name, sizeBytes: size, pageUrl,
  }).catch(() => undefined);
}

async function captureLiveFrame(jobId, page, step) {
  const liveDir = path.join(SHOT_DIR, 'live');
  fs.mkdirSync(liveDir, { recursive: true });
  const file = `${jobId}.jpg`;
  const abs = path.join(liveDir, file);
  await page.screenshot({
    path: abs,
    type: 'jpeg',
    quality: 65,
    fullPage: false,
  });
  const size = fs.statSync(abs).size;
  let pageUrl;
  try { pageUrl = page.url(); } catch { /* page may be closed */ }
  await api.addScreenshot(jobId, {
    storagePath: `selenium/live/${file}`,
    stepOrder: step.stepOrder,
    stepName: step.name,
    sizeBytes: size,
    pageUrl,
    isLive: true,
  }).catch(() => undefined);
}

/* ── Lifecycle ───────────────────────────────────────────── */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
  log('polling for jobs…');
}

process.on('SIGINT', () => { shuttingDown = true; log('shutting down'); setTimeout(() => process.exit(0), 500); });
main().catch(e => { console.error('FATAL', e); process.exit(1); });
