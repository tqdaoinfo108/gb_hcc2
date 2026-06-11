'use strict';
/*
 * Recorder helpers — capture a robust selector for the element under a point,
 * so the CMS can turn admin clicks on the live portal into workflow steps.
 */

/**
 * Inspect the element at viewport coords (x,y) and return a robust selector
 * + metadata. Runs entirely in the page context.
 */
async function captureElementAt(page, x, y) {
  return page.evaluate(
    ({ x, y }) => {
      function isStableId(id) {
        // Reject auto-generated ids (long random / many digits)
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

        // Fallback: short nth-of-type path
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

      // Resolve the human-visible label for a field, so the recorder can
      // auto-bind "Tỉnh/Thành phố" → {{citizen.province}} even when the
      // element's name/id is opaque.
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
          // Preceding label-ish sibling
          let sib = el.previousElementSibling;
          let n = 0;
          while (sib && n < 2) {
            if (/LABEL|SPAN|DIV|P/.test(sib.tagName) && sib.textContent && sib.textContent.trim().length <= 40) {
              return sib.textContent.trim();
            }
            sib = sib.previousElementSibling;
            n++;
          }
        } catch { /* ignore */ }
        return null;
      }

      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const tag = el.tagName.toLowerCase();
      const inputType = (el.getAttribute('type') || '').toLowerCase();
      const r = buildSelector(el);
      const nonText = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'range', 'color'];
      const isInput =
        tag === 'textarea' || el.isContentEditable === true ||
        (tag === 'input' && !nonText.includes(inputType));
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
    },
    { x, y },
  );
}

module.exports = { captureElementAt };
