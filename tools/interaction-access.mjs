// Keyboard and touch, at runtime (INTERACTION-REDESIGN.md part D, extending UI-GAUNTLET line 12; owner 2026-10-26: "make
// map selection much more intituitve, as well as camo, i really mean update all legacy interaction surfaces and
// systems"). Copyright © 2026 Kevin B. Liu.
//
// After a probe, a gauntlet capture or a click-timeline path sets a screen and state, `accessProblems(page)` judges every
// visible control on it:
// - name: it has a name for assistive tech (aria-labelledby, aria-label, its text, an image's alt, a title);
// - reach: Tab reaches it, or it sits in a roving group (radiogroup, tablist, listbox, toolbar, menu, grid) that Tab
//   reaches, whose arrows move inside;
// - mouse-only: nothing that only a pointer can press (a pointer cursor with no focusable control under it);
// - ring: focused from the keyboard it shows the kit's ring (--focus-ring, the tokens' ":focus-visible everywhere"), on
//   itself, a pseudo-element or its cell;
// - target: at least 44 px a side on a phone and 24 px on a desktop, as the gauntlet's line 12 has it.
// A disabled control is exempt, and so is a link inside running text (WCAG 2.5.8's inline exception). The pure judge,
// judgeAccess(), is pinned by tools/interaction-access.selftest.mjs; the page half collects facts only.
//   import { accessProblems } from '<lane>/tools/interaction-access.mjs';
//   problems.push(...await accessProblems(page, { phone: true }));               // targets and names on a phone
//   problems.push(...await accessProblems(page, { scope: '#cot-battle-menu' }));  // one surface, with the Tab walk

/** The smallest side a control may have: a phone's finger, a desktop's pointer (UI-GAUNTLET line 12). */
export const TARGET_PX = Object.freeze({ phone: 44, desktop: 24 });
/** Roles whose items move by arrows inside one Tab stop. */
export const ROVING_ROLES = Object.freeze(['radiogroup', 'tablist', 'listbox', 'toolbar', 'menu', 'menubar', 'grid', 'tree', 'tree-grid']);

/**
 * Runs in the page (page.evaluate): self-contained, its inputs serialisable. Every visible control in `scope` (minus
 * `exclude`) as plain facts, each stamped data-access-probe="<n>" so the Tab walk can name what it reaches. Over the whole
 * page an open modal (aria-modal, an open <dialog>) is the screen.
 */
function accessFactsInPage({ scope = 'body', exclude = '', roving }) {
  const CONTROL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab],'
    + ' [role=radio], [role=option], [role=switch], [role=checkbox], [role=menuitem], [role=slider], [role=spinbutton],'
    + ' [tabindex]:not([tabindex="-1"]), [contenteditable=""], [contenteditable=true]';
  const FOCUSABLE = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [tabindex], [contenteditable=""], [contenteditable=true]';
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    && el.getBoundingClientRect().width >= 1 && el.getBoundingClientRect().height >= 1;
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 3).join('.')}` : ''}`;
  const text = (el) => (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const nameOf = (el) => {
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const named = by.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map(text).join(' ').trim();
      if (named) return named;
    }
    const aria = el.getAttribute('aria-label')?.trim();
    if (aria) return aria;
    if (el.labels?.length) { const from = [...el.labels].map(text).join(' ').trim(); if (from) return from; }
    const own = text(el);
    if (own) return own;
    const alt = [...el.querySelectorAll('img[alt]')].map((img) => img.alt.trim()).find(Boolean)
      ?? el.querySelector('svg title')?.textContent?.trim();
    if (alt) return alt;
    if (el.placeholder) return el.placeholder;
    return el.getAttribute('title')?.trim() || el.getAttribute('data-tip')?.trim() || '';
  };
  const modal = scope === 'body'
    ? [...document.querySelectorAll('[aria-modal="true"], dialog[open]')].filter((el) => shown(el)).pop() : null;
  const roots = modal ? [modal] : [...document.querySelectorAll(scope)];
  const controls = new Set();
  for (const root of roots) {
    if (root.matches?.(CONTROL)) controls.add(root);
    for (const el of root.querySelectorAll(CONTROL)) controls.add(el);
  }
  // pointer-only: a pointer cursor with no control on or above it (counted once, at its top element)
  const pointerOnly = [];
  for (const root of roots) {
    for (const el of root.querySelectorAll('*')) {
      if ((exclude && el.closest(exclude)) || el.closest(CONTROL) || el.closest('label') || !shown(el)) continue;
      if (getComputedStyle(el).cursor !== 'pointer') continue;
      if (el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer' && !el.parentElement.closest(CONTROL)) continue;
      pointerOnly.push(label(el));
    }
  }
  const facts = [];
  for (const el of controls) {
    if ((exclude && el.closest(exclude)) || !shown(el)) continue;
    // a control inside another (a fav star in a picker cell is its own; an icon in a button is not a control)
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const group = el.parentElement?.closest(roving.map((role) => `[role=${role}]`).join(','));
    const block = el.closest('p, li, td, dd, figcaption');
    const n = facts.length;
    el.setAttribute('data-access-probe', String(n));
    facts.push({
      n, element: label(el), role: el.getAttribute('role') ?? el.tagName.toLowerCase(), name: nameOf(el),
      width: Math.round(box.width), height: Math.round(box.height),
      disabled: el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true',
      focusable: el.matches(FOCUSABLE) && el.tabIndex >= -1,
      tabStop: el.tabIndex >= 0 && !el.matches(':disabled'),
      group: group ? label(group) : null,
      // a link inside a line of running text: its size is the text's (WCAG 2.5.8's inline exception)
      inline: el.tagName === 'A' && style.display === 'inline' && !!block && text(block).length > text(el).length + 20,
      ring0: { shadow: style.boxShadow, outline: `${style.outlineStyle} ${style.outlineWidth}` },
    });
  }
  return { facts, pointerOnly: [...new Set(pointerOnly)] };
}

/** Runs in the page: the kit's focus ring as the browser computes it (a probe wearing var(--focus-ring)). */
function kitRingInPage() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:-99px;top:0;width:4px;height:4px;box-shadow:var(--focus-ring)';
  document.body.append(probe);
  const ring = getComputedStyle(probe).boxShadow;
  probe.remove();
  return ring === 'none' ? null : ring;
}

/** Runs in the page: what the focused control shows (its probe number, and its ring on it, a pseudo-element or its cell). */
function focusedInPage(kitRing) {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const probe = el.closest('[data-access-probe]')?.getAttribute('data-access-probe');
  const looks = [getComputedStyle(el), getComputedStyle(el, '::before'), getComputedStyle(el, '::after'),
    el.parentElement ? getComputedStyle(el.parentElement) : null].filter(Boolean);
  const kit = !!kitRing && looks.some((style) => style.boxShadow.includes(kitRing) || kitRing.split(/,(?![^(]*\))/).every((layer) => style.boxShadow.includes(layer.trim())));
  const own = getComputedStyle(el);
  return { probe: probe == null ? null : Number(probe), kit,
    shadow: own.boxShadow, outline: `${own.outlineStyle} ${own.outlineWidth}`,
    element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 3).join('.')}` : ''}` };
}

/**
 * The Tab walk: press Tab until focus comes back to where it started (or `max` presses), recording what each press
 * reached and whether it wore the kit's ring. Shift+Tab is not walked: the order's reverse reaches the same stops.
 */
async function tabWalk(page, { max = 300 } = {}) {
  const kitRing = await page.evaluate(kitRingInPage);
  const stops = [];
  const seen = new Set();
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const at = await page.evaluate(focusedInPage, kitRing);
    if (!at) continue;
    const key = at.probe ?? at.element;
    if (seen.has(key)) break;
    seen.add(key);
    stops.push(at);
  }
  return { kitRing, stops };
}

/**
 * The verdict on one state, from its facts and its Tab walk (null when the walk did not run): problem lines, each
 * `<check> <element> "<name>": <what>`. Pure, so the selftest pins it.
 */
export function judgeAccess({ facts, pointerOnly = [] }, walk, { phone = false } = {}) {
  const problems = [];
  const min = phone ? TARGET_PX.phone : TARGET_PX.desktop;
  const reached = new Set((walk?.stops ?? []).filter((stop) => stop.probe != null).map((stop) => stop.probe));
  const reachedGroups = new Set(facts.filter((fact) => reached.has(fact.n) && fact.group).map((fact) => fact.group));
  const say = (check, fact, what) => problems.push(`${check} ${fact.element}${fact.name ? ` "${fact.name.slice(0, 40)}"` : ''}: ${what}`);
  for (const fact of facts) {
    if (fact.disabled) continue;
    if (!fact.name) say('name', fact, 'no name for assistive tech (aria-label, text, alt or labelledby)');
    if (!fact.inline && Math.min(fact.width, fact.height) < min) {
      say('target', fact, `${fact.width}x${fact.height} px, under ${min} px on a ${phone ? 'phone' : 'desktop'}`);
    }
    if (!walk) continue;
    if (!fact.focusable) say('reach', fact, 'not focusable: a keyboard cannot reach it');
    else if (!reached.has(fact.n) && !(fact.group && reachedGroups.has(fact.group)) && fact.tabStop) {
      say('reach', fact, 'Tab never reaches it');
    } else if (!reached.has(fact.n) && !fact.tabStop && !(fact.group && reachedGroups.has(fact.group))) {
      say('reach', fact, fact.group ? `its group ${fact.group} is never reached` : 'tabindex -1 outside a roving group');
    }
  }
  for (const element of pointerOnly) problems.push(`mouse-only ${element}: a pointer cursor with no control a keyboard can reach`);
  if (walk) {
    if (!walk.kitRing) problems.push('ring the page has no --focus-ring token');
    for (const stop of walk.stops) {
      if (stop.kit) continue;
      const fact = facts.find((one) => one.n === stop.probe);
      const ring0 = fact?.ring0;
      const changed = !ring0 || stop.shadow !== ring0.shadow || stop.outline !== ring0.outline;
      const visible = stop.shadow !== 'none' || !/^none /.test(stop.outline);
      problems.push(`ring ${stop.element}${fact?.name ? ` "${fact.name.slice(0, 40)}"` : ''}: ${changed && visible ? 'a focus style that is not the kit\'s ring' : 'no focus ring'}`);
    }
  }
  return problems;
}

/** The census of the page as it stands, as problem lines (empty when it holds). `walk: false` skips the Tab walk (a phone
 *  capture, or a state a Tab would leave). */
export async function accessProblems(page, { phone = false, scope = 'body', exclude = '', walk = !phone, max = 300 } = {}) {
  const facts = await page.evaluate(accessFactsInPage, { scope, exclude, roving: ROVING_ROLES });
  const stops = walk ? await tabWalk(page, { max }) : null;
  await page.evaluate(() => { for (const el of document.querySelectorAll('[data-access-probe]')) el.removeAttribute('data-access-probe'); }).catch(() => {});
  return judgeAccess(facts, stops, { phone });
}
