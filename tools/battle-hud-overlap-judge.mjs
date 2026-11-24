// The battle HUD overlap probe's judge (tools/battle-hud-overlap.browser.mjs): what it measures, what may lie on what, and the
// verdict over one state's boxes. Pure, so tools/battle-hud-overlap-judge.selftest.mjs runs it in Node on recorded boxes.
// Copyright © 2026 Kevin B. Liu.
import { VIEW_CONTROLS } from '../src/ui/hudViewControls.ts';

/** The battle's notices, in both lanes (battleNotices.ts): the event lane's seat and the condition lane's notice. */
export const NOTICES = ['.cot-alert.show', '.cot-battle-notices .cot-c-notice'];

/** The battle's feed (notices-276): the kill lanes and the player's kill ribbon, seated against the same control boxes as the
 *  notices (battleHudLayout.ts controlFloor, the ribbon's top). */
export const FEED = ['.cot-kill-lane.l', '.cot-kill-lane.r', '.cot-ribbon.on'];

/** The HUD's instruments, each a box another may not cross: the panels and controls, the notices, and the controls a view
 *  brings (src/ui/hudViewControls.ts, the list every notice planner keeps off), and Air Support's Support slot wherever it
 *  is seated (the tray's end on a desktop, its own dock on a touch layout). */
export const INSTRUMENTS = Object.freeze(['.cot-top', '.cot-pips.show', '.cot-mode-status.show', '.cot-net', '.cot-mp-status.battle',
  '.cot-ear.l', '.cot-ear.r', '.cot-kill-lane.l', '.cot-kill-lane.r', '.cot-sixth.on', ...NOTICES, '.cot-ribbon.on',
  '.cot-medal-toasts', '.cot-respawn:not([hidden])', '.cot-prebattle', '.cot-prebattle-rules', '.cot-aim-warning:not([hidden])',
  '.cot-si-toasthost', '.cot-si-log.open', '.cot-si-cardhost:not(:empty)', '.cot-room-chat:not([hidden])', '.cot-spec.show',
  '.cot-watch', '.cot-watch-rail', '.cot-hints.show', '.cot-drive', '.cot-dp', '.cot-minimap', '.cot-shell', '.cot-con', '.cot-vehicle-controls',
  '.cot-scope-vision', '.strike-support', '.cot-touch.on .joy', '.cot-touch.on .round', '.cot-touch.on .mobile-chrome', '.cot-touch.on .quick',
  ...VIEW_CONTROLS]);

/** Deliberate layerings: [selector a, selector b, why]. A pair matches in either order. */
export const ALLOWED = Object.freeze([
  // (the network strip hangs beside the corner plate, its slanted right edge 4 px off the plate's slanted left one
  // (battleHudLayout.ts NETWORK_PLATE_TUCK): their boxes cross only where the two slants interlock)
  ['.cot-net', '.cot-mp-status.battle', 'the strip tucked to the corner plate\'s slant'],
]);

/** The probe's planted controls (--plant): `seen` carries a view control's class, so the planners keep the notices off it
 *  (they read the live box); `unseen` a class no planner reads, which the probe measures: a notice under it must fail. */
export const PLANTS = Object.freeze({ seen: 'cot-strike-rack', unseen: 'cot-planted-control' });
export const PLANT_SELECTOR = `.${PLANTS.unseen}`;

const allowed = (a, b) => ALLOWED.some(([x, y]) => (a.selector === x && b.selector === y) || (a.selector === y && b.selector === x));
const isNotice = (box) => NOTICES.includes(box.selector);
const isFeed = (box) => FEED.includes(box.selector);

/** In the page: every visible instrument's box ({ selector, name, x, y, right, bottom }), nested ones folded into their
 *  outermost. */
export function measureInstruments(instruments) {
  const els = [];
  for (const selector of instruments) for (const el of document.querySelectorAll(selector)) {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    els.push({ el, selector, x: r.x, y: r.y, right: r.right, bottom: r.bottom });
  }
  // nested instruments fold into their outermost one (a slot inside a tray, a quick button inside the toolbar)
  const top = els.filter((a) => !els.some((b) => b !== a && b.el !== a.el && b.el.contains(a.el)));
  const seen = new Set();
  return top.filter((a) => (seen.has(a.el) ? false : (seen.add(a.el), true)))
    .map(({ el, selector, x, y, right, bottom }) => ({ selector, name: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`, x, y, right, bottom }));
}

/** The problems with one state's boxes in a width x height window: off screen, or two instruments crossing (a pair with a
 *  notice in it says so first, "notice ... on ...", and a feed row on anything else "feed ... on ..."). Empty is a pass. */
export function overlapProblems(rects, width, height) {
  const problems = [];
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i];
    if (a.x < -0.5 || a.y < -0.5 || a.right > width + 0.5 || a.bottom > height + 0.5) problems.push(`offscreen: ${a.name}`);
    for (const b of rects.slice(i + 1)) {
      const w = Math.min(a.right, b.right) - Math.max(a.x, b.x), h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      if (!(w > 1 && h > 1) || allowed(a, b)) continue;
      const size = `(${Math.round(w)} x ${Math.round(h)} px)`;
      const [n, o] = isNotice(b) && !isNotice(a) ? [b, a] : [a, b];
      const [f, c] = isFeed(b) && !isFeed(a) ? [b, a] : [a, b];
      problems.push(isNotice(n) ? `notice ${n.name} on ${o.name} ${size}`
        : isFeed(f) && !isFeed(c) ? `feed ${f.name} on ${c.name} ${size}` : `${a.name} overlaps ${b.name} ${size}`);
    }
  }
  return problems;
}

/** The notices a state shows: each lane's box, or why it has none (`waits`: the guidance plan holds the condition back while
 *  no place keeps it off the controls, body[data-hud-guidance~=toasts-wait]). */
export function noticeCoverage(rects, guidanceFlags) {
  const has = (selector) => rects.some((r) => r.selector === selector);
  return {
    event: has(NOTICES[0]) ? 'shown' : 'missing',
    condition: has(NOTICES[1]) ? 'shown' : String(guidanceFlags || '').split(' ').includes('toasts-wait') ? 'waits' : 'missing',
  };
}
