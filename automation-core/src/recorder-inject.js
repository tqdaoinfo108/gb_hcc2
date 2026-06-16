'use strict';
/*
 * In-page recorder capture for the OVERLAY model.
 *
 * The admin clicks the REAL Chromium window directly (no coordinate proxy), so
 * we install a capture-phase listener inside every page that turns each click /
 * field change into a robust semantic action and ships it to the engine via an
 * exposed binding. The action shape matches captureElementAt() (recorder.js) so
 * the CMS / recorder UI step mapping is unchanged.
 */

const BINDING = '__kioskRecord';

/* The page-side installer. Self-contained (serialized into the page) — it must
 * not reference anything outside its own scope. Mirrors recorder.js selectors. */
function pageInstaller(bindingName) {
  if (window.__kioskRecInstalled) return;
  window.__kioskRecInstalled = true;
  const send = (a) => { try { window[bindingName](a); } catch (_) { /* binding gone */ } };

  function isStableId(id) {
    return id && /^[A-Za-z][\w-]{0,40}$/.test(id) && !/^[0-9]/.test(id) && !/\d{4,}/.test(id);
  }
  function cssEscape(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
  }
  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return null;
    const tag = el.tagName.toLowerCase();
    if (isStableId(el.id)) return { sel: '#' + cssEscape(el.id), type: 'CSS' };
    const name = el.getAttribute('name');
    if (name) return { sel: `${tag}[name="${name}"]`, type: 'CSS' };
    for (const a of ['data-testid', 'data-test', 'data-id', 'data-name', 'data-field']) {
      const v = el.getAttribute(a);
      if (v) return { sel: `[${a}="${v}"]`, type: 'CSS' };
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return { sel: `[aria-label="${aria}"]`, type: 'CSS' };
    const ph = el.getAttribute('placeholder');
    if (ph) return { sel: `${tag}[placeholder="${ph}"]`, type: 'CSS' };
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
    const role = el.getAttribute('role');
    if ((tag === 'a' || tag === 'button' || role === 'button' || el.type === 'submit') && text && text.length <= 50) {
      return { sel: text, type: 'TEXT' };
    }
    if (tag === 'a' && el.getAttribute('href')) {
      const href = el.getAttribute('href');
      if (href && href !== '#' && href.length < 80) return { sel: `a[href="${href}"]`, type: 'CSS' };
    }
    const path = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 5) {
      if (isStableId(node.id)) { path.unshift('#' + cssEscape(node.id)); break; }
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      path.unshift(part);
      node = node.parentElement;
      depth++;
    }
    return { sel: path.join(' > '), type: 'CSS' };
  }
  function resolveLabel(el) {
    try {
      const lblby = el.getAttribute && el.getAttribute('aria-labelledby');
      if (lblby) {
        const t = lblby.split(/\s+/).map((id) => {
          const n = document.getElementById(id);
          return n ? n.textContent : '';
        }).join(' ').trim();
        if (t) return t;
      }
      if (el.id) {
        const lab = document.querySelector(`label[for="${el.id}"]`);
        if (lab && lab.textContent) return lab.textContent.trim();
      }
      let p = el.parentElement;
      let depth = 0;
      while (p && depth < 3) {
        if (p.tagName === 'LABEL' && p.textContent) return p.textContent.trim();
        depth++;
        p = p.parentElement;
      }
      let sib = el.previousElementSibling;
      let n = 0;
      while (sib && n < 2) {
        if (/LABEL|SPAN|DIV|P/.test(sib.tagName) && sib.textContent && sib.textContent.trim().length <= 40) {
          return sib.textContent.trim();
        }
        sib = sib.previousElementSibling;
        n++;
      }
    } catch (_) { /* ignore */ }
    return null;
  }
  function describe(el) {
    const tag = el.tagName.toLowerCase();
    const inputType = (el.getAttribute('type') || '').toLowerCase();
    const r = buildSelector(el);
    const nonText = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'range', 'color'];
    const isInput = tag === 'textarea' || el.isContentEditable === true || (tag === 'input' && !nonText.includes(inputType));
    return {
      selector: r ? r.sel : null,
      selectorType: r ? r.type : 'CSS',
      tag,
      inputType,
      isInput,
      isSelect: tag === 'select',
      isCheckable: tag === 'input' && (inputType === 'checkbox' || inputType === 'radio'),
      text: (el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      name: el.getAttribute('name') || null,
      elId: el.id || null,
      ariaLabel: el.getAttribute('aria-label') || null,
      label: resolveLabel(el),
      placeholder: el.getAttribute('placeholder') || null,
      href: el.getAttribute('href') || null,
    };
  }

  // Click capture — fires before the page handles it (capture phase) so a
  // navigating click still records its selector.
  document.addEventListener('click', (e) => {
    const el = e.target && e.target.closest ? (e.target.closest('a,button,[role="button"],input,select,textarea,label') || e.target) : e.target;
    if (!el || el.nodeType !== 1) return;
    const info = describe(el);
    if (info.selector) send(Object.assign({ kind: 'click' }, info));
  }, true);

  // Field-value capture — record what was typed/selected (for sample values).
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || el.nodeType !== 1) return;
    const tag = el.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return;
    const r = buildSelector(el);
    if (!r || !r.sel) return;
    send({ kind: 'fill', selector: r.sel, selectorType: r.type, value: el.value != null ? String(el.value) : '' });
  }, true);
}

/**
 * Install the recorder into a context (future navigations) and the live page.
 * @param {import('playwright').BrowserContext} context
 * @param {import('playwright').Page} page
 * @param {(action:object)=>void} onAction
 */
async function installRecorder(context, page, onAction) {
  await context.exposeBinding(BINDING, (_source, action) => {
    try { onAction(action); } catch (_) { /* ignore */ }
  });
  // Apply to all future document loads…
  await context.addInitScript(pageInstaller, BINDING);
  // …and the document that --app already opened.
  await page.evaluate(pageInstaller, BINDING).catch(() => undefined);
}

module.exports = { installRecorder, RECORD_BINDING: BINDING };
