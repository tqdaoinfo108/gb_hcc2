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
      try {
        await loc.first().selectOption({ label: val }, { timeout });
      } catch {
        await loc.first().selectOption(val, { timeout }).catch(async () => {
          // fall back to clicking an option with matching text
          await page.getByText(val, { exact: false }).first().click({ timeout });
        });
      }
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
