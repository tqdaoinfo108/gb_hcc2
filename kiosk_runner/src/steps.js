'use strict';
/* Executes one configured WorkflowStep against a Playwright page.
   Supports both the semantic CMS step types and low-level primitives. */

const fs = require('fs');
const os = require('os');
const path = require('path');

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

/**
 * Score how well an <option> label matches the target value.
 * Higher = better; 0 = no match. Tolerates admin prefixes + diacritics so the
 * CCCD string ("Hà Nội", "Dịch Vọng") lines up with portal labels
 * ("Thành phố Hà Nội", "Phường Dịch Vọng").
 */
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

/**
 * Robustly select a value in a NATIVE <select>, waiting for cascade-loaded
 * options (province → district → ward AJAX) and matching by normalized label.
 * @returns true if a selection was made.
 */
async function selectNativeOption(loc, target, timeout) {
  const el = loc.first();
  const deadline = Date.now() + timeout;
  // Poll until the select has real options (cascade may still be loading).
  // The first option is often a "-- Chọn --" placeholder, so require >= 2.
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

  // Pick the best-scoring option.
  let best = null;
  for (const o of options) {
    const score = matchScore(o.label, target);
    if (score > 0 && (!best || score > best.score)) best = { ...o, score };
  }
  if (!best) return false;

  await el.selectOption({ value: best.value }, { timeout }).catch(async () => {
    await el.selectOption({ label: best.label.trim() }, { timeout });
  });
  // Fire change so dependent cascades (district/ward) repopulate.
  await el.dispatchEvent('change').catch(() => undefined);
  return true;
}

/** Build a Playwright locator from a step's selector + selectorType. */
function locate(page, step) {
  const sel = step.selector;
  if (!sel) return null;
  switch (step.selectorType) {
    case 'XPATH': return page.locator(`xpath=${sel}`);
    case 'ID':    return page.locator(`#${sel}`);
    case 'NAME':  return page.locator(`[name="${sel}"]`);
    case 'TEXT':  return page.getByText(sel, { exact: false });
    case 'LINK_TEXT': return page.getByRole('link', { name: sel });
    default:      return page.locator(sel);
  }
}

async function tryLocate(page, step) {
  // Primary selector, then fallback
  const primary = locate(page, step);
  if (primary && (await primary.count()) > 0) return primary;
  if (step.selectorAlt) {
    const alt = page.locator(step.selectorAlt);
    if ((await alt.count()) > 0) return alt;
  }
  return primary; // let the action throw a clear error if truly absent
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

      // 1) Native <select> — robust, prefix/diacritic-tolerant, cascade-aware.
      const didNative = await selectNativeOption(loc, val, timeout).catch(() => false);
      if (didNative) return {};

      // 2) Custom dropdown (div/ul based, common on modern portals): open it,
      //    then click the option whose normalized text best matches.
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
      // 3) Last resort: plain text click.
      await page.getByText(val, { exact: false }).first().click({ timeout }).catch(() => undefined);
      return {};
    }

    case 'WAIT': {
      if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout });
      else await page.waitForTimeout(Math.min(timeout, 5000));
      return {};
    }

    case 'WAIT_VNEID_LOGIN': {
      // Pause and ask the citizen to authenticate with VNeID on the portal.
      await helpers.requestInput('VNEID_QR', { message: 'Vui lòng đăng nhập VNeID trên màn hình' });
      const ok = await helpers.waitForInput(timeout); // citizen taps "đã đăng nhập" or selector appears
      // Best-effort: also wait for a post-login selector if configured
      if (step.waitFor) {
        await page.waitForSelector(step.waitFor, { timeout }).catch(() => undefined);
      }
      if (!ok && step.isRequired) throw new Error('VNeID login timed out');
      return {};
    }

    case 'UPLOAD_DOCUMENT':
    case 'UPLOAD': {
      // Ask the kiosk to provide a file (scanner / mobile capture / wallet)
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
      // Unknown / unsupported step type — log and continue
      return {};
  }
}

module.exports = { executeStep, resolveTemplate };
