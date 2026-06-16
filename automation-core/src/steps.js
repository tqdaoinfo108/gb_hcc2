'use strict';
/* Executes one configured WorkflowStep against a Playwright page.
   Supports both the semantic CMS step types and low-level primitives.
   Ported verbatim from kiosk_runner/src/steps.js — the matching logic
   (diacritic-tolerant cascade select, admin-prefix stripping) is unchanged. */

/** Resolve {{citizen.field}} / {{form.field}} templates from job input. */
function resolveTemplate(value, ctx) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const parts = key.split('.');
    let cur = ctx;
    for (const p of parts) cur = cur == null ? undefined : cur[p];
    return cur == null ? '' : String(cur);
  });
}

/** Strip Vietnamese diacritics → lowercase, for fuzzy option matching. */
function stripVi(s) {
  return (s == null ? '' : String(s))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drop the administrative prefix so "Thành phố Hà Nội" matches CCCD's "Hà Nội". */
function stripAdminPrefix(s) {
  return stripVi(s)
    .replace(/^(tinh|thanh pho|tp\.?|quan|huyen|thi xa|thi tran|phuong|xa)\s+/, '')
    .trim();
}

/** Score how well an <option> label matches the target value (higher = better). */
function matchScore(optionLabel, target) {
  const a = stripVi(optionLabel);
  const b = stripVi(target);
  if (!a || !b) return 0;
  if (a === b) return 100;
  const ap = stripAdminPrefix(optionLabel);
  const bp = stripAdminPrefix(target);
  if (ap && ap === bp) return 90;
  if (ap && bp && (ap.includes(bp) || bp.includes(ap))) return 70;
  if (a.includes(b) || b.includes(a)) return 50;
  return 0;
}

/** Robustly select a value in a NATIVE <select>, waiting for cascade-loaded options. */
async function selectNativeOption(loc, target, timeout) {
  const el = loc.first();
  const deadline = Date.now() + timeout;
  let options = [];
  while (Date.now() < deadline) {
    options = await el.evaluate((node) => {
      if (!(node instanceof HTMLSelectElement)) return null;
      return Array.from(node.options).map((o) => ({ value: o.value, label: o.textContent || '' }));
    }).catch(() => null);
    if (options === null) return false; // not a native select
    const real = options.filter((o) => o.value && o.value !== '0');
    if (real.length >= 1) break;
    await el.page().waitForTimeout(300);
  }
  if (!options || options.length === 0) return false;

  let best = null;
  for (const o of options) {
    const score = matchScore(o.label, target);
    if (score > 0 && (!best || score > best.score)) best = { ...o, score };
  }
  if (!best) return false;

  await el.selectOption({ value: best.value }, { timeout }).catch(async () => {
    await el.selectOption({ label: best.label.trim() }, { timeout });
  });
  await el.dispatchEvent('change').catch(() => undefined);
  return true;
}

/** Default phrases that indicate a logged-in session on dichvucong.gov.vn. */
const LOGIN_SUCCESS_HINTS = ['đăng xuất', 'dang xuat', 'thông tin tài khoản', 'thoát', 'xin chào', 'tài khoản của tôi'];
/** Default phrases that indicate a failed / rejected login. */
const LOGIN_FAIL_HINTS = ['sai tên', 'sai mật khẩu', 'không đúng', 'thất bại', 'đã bị khóa', 'tài khoản bị khóa', 'hết hạn', 'từ chối'];
/** URL fragments that mean we're still on the login / SSO page. */
const LOGIN_URL_HINTS = ['login', 'signin', 'sso', 'dangnhap', 'dang-nhap', 'oauth', 'authorize'];

/**
 * Poll the page until login clearly succeeds or fails (or we time out).
 * Success: `successSel` appears, OR `successText`/default hints are in the body
 *          AND we've left the login/SSO URL.
 * Failure: `failText`/default fail hints appear in the body.
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
async function waitForLogin(page, { successSel, successText, failText, timeout }) {
  const deadline = Date.now() + timeout;
  const startUrl = page.url();
  while (Date.now() < deadline) {
    // Explicit success selector wins immediately.
    if (successSel) {
      const n = await page.locator(successSel).count().catch(() => 0);
      if (n > 0) return { ok: true, reason: 'selector' };
    }
    const body = (await page.textContent('body').catch(() => '') || '').toLowerCase();
    const url = (page.url() || '').toLowerCase();

    if (failText && body.includes(failText.toLowerCase())) return { ok: false, reason: 'fail-text' };
    if (LOGIN_FAIL_HINTS.some((h) => body.includes(h))) return { ok: false, reason: 'fail-hint' };

    const onLoginUrl = LOGIN_URL_HINTS.some((h) => url.includes(h));
    if (successText) {
      if (body.includes(successText.toLowerCase())) return { ok: true, reason: 'success-text' };
    } else if (!onLoginUrl && LOGIN_SUCCESS_HINTS.some((h) => body.includes(h))) {
      return { ok: true, reason: 'success-hint' };
    }
    // Navigated away from the login/SSO URL we started on → treat as success.
    if (!successSel && !successText && onLoginUrl === false && url !== startUrl.toLowerCase()
        && LOGIN_URL_HINTS.some((h) => startUrl.toLowerCase().includes(h))) {
      return { ok: true, reason: 'left-login-url' };
    }
    await page.waitForTimeout(1000);
  }
  return { ok: false, reason: 'timeout' };
}

/** Build a Playwright locator from a step's selector + selectorType. */
function locate(page, step) {
  const sel = step.selector;
  if (!sel) return null;
  switch (step.selectorType) {
    case 'XPATH': return page.locator(`xpath=${sel}`);
    case 'ID': return page.locator(`#${sel}`);
    case 'NAME': return page.locator(`[name="${sel}"]`);
    case 'TEXT': return page.getByText(sel, { exact: false });
    case 'LINK_TEXT': return page.getByRole('link', { name: sel });
    default: return page.locator(sel);
  }
}

async function tryLocate(page, step) {
  const primary = locate(page, step);
  if (primary && (await primary.count()) > 0) return primary;
  if (step.selectorAlt) {
    const alt = page.locator(step.selectorAlt);
    if ((await alt.count()) > 0) return alt;
  }
  return primary;
}

/**
 * Execute a single step.
 * @returns {Promise<{extracted?: any, needsInput?: object}>}
 * Throws on hard failure (caller handles onFailure).
 */
async function executeStep(page, step, ctx, helpers) {
  const t = step.stepType;
  const timeout = step.waitTimeoutMs || 10000;

  switch (t) {
    case 'OPEN_URL':
    case 'NAVIGATE': {
      const url = resolveTemplate(step.url || step.inputValue, ctx);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout });
      return {};
    }

    case 'CLICK_MENU':
    case 'SELECT_RESULT':
    case 'CLICK': {
      const loc = await tryLocate(page, step);
      await loc.first().click({ timeout });
      return {};
    }

    case 'SEARCH_PROCEDURE': {
      const loc = await tryLocate(page, step);
      const term = resolveTemplate(step.inputValue, ctx);
      await loc.first().fill(term, { timeout });
      await loc.first().press('Enter');
      if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout });
      return {};
    }

    case 'INPUT_FIELD':
    case 'FILL': {
      const loc = await tryLocate(page, step);
      const val = resolveTemplate(step.inputValue, ctx);
      await loc.first().fill(val, { timeout });
      return {};
    }

    case 'SELECT_OPTION':
    case 'SELECT': {
      const loc = await tryLocate(page, step);
      const val = resolveTemplate(step.inputValue, ctx);
      if (!val) return {};

      const didNative = await selectNativeOption(loc, val, timeout).catch(() => false);
      if (didNative) return {};

      await loc.first().click({ timeout }).catch(() => undefined);
      await page.waitForTimeout(400);
      const target = stripAdminPrefix(val);
      const opt = page.locator('li, [role="option"], .option, .ant-select-item, .select2-results__option');
      const count = await opt.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const text = (await opt.nth(i).textContent().catch(() => '')) || '';
        if (matchScore(text, val) >= 70 || stripAdminPrefix(text) === target) {
          await opt.nth(i).click({ timeout }).catch(() => undefined);
          return {};
        }
      }
      await page.getByText(val, { exact: false }).first().click({ timeout }).catch(() => undefined);
      return {};
    }

    case 'WAIT': {
      if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout });
      else await page.waitForTimeout(Math.min(timeout, 5000));
      return {};
    }

    case 'WAIT_VNEID_LOGIN': {
      // Keep the REAL portal visible — the citizen scans the portal's own VNeID
      // QR / logs in directly. We do NOT hide the browser; we DETECT the result
      // by polling the page so the workflow knows the next step.
      //   step.waitFor   = success selector (most reliable, set during recording)
      //   step.assertText = success text   | step.selectorAlt = failure text
      const loginTimeout = step.waitTimeoutMs || 180000; // VNeID can be slow
      if (helpers.notify) helpers.notify('Vui lòng đăng nhập VNeID trên màn hình…');
      const res = await waitForLogin(page, {
        successSel: step.waitFor,
        successText: step.assertText,
        failText: step.selectorAlt, // reuse as optional fail-text (no schema change)
        timeout: loginTimeout,
      });
      if (!res.ok) {
        // Timed out or detected failure → hand to the citizen / staff instead of
        // silently moving on. Caller's onFailure decides skip vs interactive.
        throw new Error(res.reason === 'timeout'
          ? 'Chưa phát hiện đăng nhập VNeID thành công (hết thời gian chờ)'
          : 'Đăng nhập VNeID thất bại hoặc bị từ chối');
      }
      return { extracted: { vneidLogin: 'SUCCESS' } };
    }

    case 'UPLOAD_DOCUMENT':
    case 'UPLOAD': {
      await helpers.requestInput('UPLOAD', { uploadField: step.uploadField });
      const input = await helpers.waitForInput(120000);
      if (!input) throw new Error('No document provided for upload');
      const filePath = await helpers.materializeFile(input);
      const fileInput = step.selector ? page.locator(step.selector) : page.locator('input[type=file]');
      await fileInput.first().setInputFiles(filePath, { timeout });
      return {};
    }

    case 'WAIT_SUBMIT': {
      const loc = await tryLocate(page, step);
      if (loc) await loc.first().click({ timeout }).catch(() => undefined);
      if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout }).catch(() => undefined);
      await page.waitForLoadState('networkidle', { timeout }).catch(() => undefined);
      return {};
    }

    case 'DETECT_SUCCESS_TEXT':
    case 'ASSERT': {
      const needle = (step.assertText || '').toLowerCase();
      const body = (await page.textContent('body').catch(() => '') || '').toLowerCase();
      const ok = needle ? body.includes(needle) : true;
      if (!ok) throw new Error(`Success text not found: "${step.assertText}"`);
      return { extracted: { success: true } };
    }

    case 'EXTRACT_APPLICATION_CODE':
    case 'EXTRACT': {
      const loc = await tryLocate(page, step);
      let code = '';
      try { code = (await loc.first().textContent({ timeout }))?.trim() || ''; } catch { /* */ }
      return { extracted: { applicationCode: code } };
    }

    case 'SCREENSHOT': {
      await helpers.screenshot(step);
      return {};
    }

    case 'COMPLETE':
      return { extracted: { completed: true } };

    case 'SCROLL': {
      const loc = await tryLocate(page, step);
      if (loc) await loc.first().scrollIntoViewIfNeeded({ timeout });
      return {};
    }

    default:
      return {};
  }
}

module.exports = { executeStep, resolveTemplate };
