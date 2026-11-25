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

/** What the guidance plan may lay the condition lane's notice over when no place clears it (battleHudLayout.ts GUIDANCE_SOFT:
 *  the map, the ears, the feed lanes and ribbon, the side toasts). The plan says so by the tier it records
 *  (body[data-hud-guidance-plan] toasts[4] = 1: clear of the hard boxes alone); a notice on one of these at tier 0 is a fault. */
export const SOFT = Object.freeze(['.cot-minimap', '.cot-ear.l', '.cot-ear.r', '.cot-kill-lane.l', '.cot-kill-lane.r', '.cot-ribbon.on',
  '.cot-si-toasthost']);
const CONDITION = NOTICES[1];

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
 *  notice in it says so first, "notice ... on ...", and a feed row on anything else "feed ... on ..."). Empty is a pass.
 *  `conditionTier` is the tier the guidance plan cleared for the condition lane's notice: at 1 (no place cleared the soft
 *  boxes) its crossing of a SOFT box is the plan's ruled fallback, reported as "soft: ..." beside the verdict. */
export function overlapProblems(rects, width, height, { conditionTier = 0 } = {}) {
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
      if (isNotice(n) && n.selector === CONDITION && conditionTier === 1 && SOFT.includes(o.selector) && !isNotice(o)) {
        problems.push(`soft: notice ${n.name} on ${o.name} ${size} (no place clears the soft boxes)`);
        continue;
      }
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

// ---- the notices' lanes (notices-polish-277; Kevin 2026-11-24: "this notification type ... needs to not bounce from top or
// bottom of screen, it should be in one place, that bottom spot is saved for kills")

/** The lanes a notice is shown in, each its own seat: the condition lane (battleNotices.ts, the kit's region: one place under
 *  the score, guidancePlan.ts conditionLane), the event lane (battleNoticeEvents.ts, the planners' alert seat), and the kill
 *  card's seat at the foot (hudKillRibbon.ts), which no notice takes. */
export const LANE_SEATS = Object.freeze({ condition: NOTICES[1], event: NOTICES[0], kill: '.cot-ribbon.on' });

/**
 * Every notice kind's lane, from the modules that raise them (their sources): a `.condition({ kind: ... })` raise is the
 * condition lane's, an `events.raise({ kind: ... })` or a BATTLE_EVENT payload the event lane's. A kind raised in both is a
 * kind in two places: it is returned under `both`. `sources` maps a file to its text.
 */
export function kindLanes(sources, kinds) {
  const lanes = new Map();
  const note = (kind, lane) => { if (kinds.includes(kind)) (lanes.get(kind) ?? lanes.set(kind, new Set()).get(kind)).add(lane); };
  for (const text of Object.values(sources)) {
    // (a raise's object literal, up to its first few hundred characters: its kind is written first or near it)
    // (each raise's head, then its next few hundred characters, so one raise's text never hides the next raise)
    for (const m of text.matchAll(/(\.condition|events\.raise|emit\(BATTLE_EVENT,)\s*\(?\s*\{/g)) {
      const verb = m[1], call = text.slice(m.index, m.index + 300);
      const kind = /\bkind:\s*(?:rollover \? )?'([A-Za-z]+)'/.exec(call)?.[1];
      const alt = /\bkind:\s*rollover \? '([A-Za-z]+)' : '([A-Za-z]+)'/.exec(call);
      const lane = verb === '.condition' ? 'condition' : 'event';
      if (alt) { note(alt[1], lane); note(alt[2], lane); } else if (kind) note(kind, lane);
    }
    // (a plate raised through a helper that passes its kind on: Air Support's plate(id, kind, ...) into notices.condition)
    for (const m of text.matchAll(/\bplate\([A-Z_]+, '([A-Za-z]+)'/g)) note(m[1], 'condition');
  }
  const out = {}, both = [];
  for (const [kind, set] of lanes) { out[kind] = [...set].sort(); if (set.size > 1) both.push(kind); }
  return { lanes: out, both: both.sort() };
}

/** The band a box stands in: over the window's middle (`top`) or under it (`bottom`). */
const band = (box, height) => ((box.y + box.bottom) / 2 < height / 2 ? 'top' : 'bottom');

/** The HUD's head in one state: the foot of the score, the objective and the zone chips (the lane stands under it). */
const HEAD = ['.cot-top', '.cot-mode-status.show', '.cot-pips.show'];
const headFoot = (rects) => Math.max(0, ...rects.filter((r) => HEAD.includes(r.selector) && r.y < 200).map((r) => r.bottom));

/**
 * One window's lanes over every state it was measured in: `seen` is [{ state, rects }] (the probe's +notices states).
 * - The condition lane keeps one place: its top the same in every state (within `tolerance` px), or the same distance under
 *   the HUD's head where a mode's head is taller (a sector mode's chips: that battle's lane starts under them, and never
 *   moves in it); it stands over the window's middle.
 * - The kill card's seat holds nothing but the kill card.
 * - The event lane's seat is recorded with any movement as a note (the planners still move the alert round a view's sight
 *   and controls; Main 2026-11-25: report it, the fix is the planner yielding, not the lane moving).
 * Returns { problems, notes, record } (record: { lane: { state: [x, y, right, bottom] } }).
 */
export function laneProblems(seen, height, tolerance = 2) {
  const record = {}, problems = [], notes = [];
  const heads = Object.fromEntries(seen.map(({ state, rects }) => [state, headFoot(rects)]));
  for (const [lane, selector] of Object.entries(LANE_SEATS)) {
    const at = {};
    for (const { state, rects } of seen) {
      const box = rects.find((r) => r.selector === selector);
      if (box) at[state] = [Math.round(box.x), Math.round(box.y), Math.round(box.right), Math.round(box.bottom)];
    }
    record[lane] = at;
    const boxes = Object.entries(at);
    if (!boxes.length || lane === 'kill') continue;
    const spread = (values) => Math.max(...values) - Math.min(...values);
    const tops = boxes.map(([, b]) => b[1]);
    const underHead = boxes.map(([s, b]) => b[1] - heads[s]);
    const moves = spread(tops) > tolerance && spread(underHead) > tolerance;
    const bands = new Set(boxes.map(([, b]) => band({ y: b[1], bottom: b[3] }, height)));
    const where = boxes.map(([s, b]) => `${s} y${b[1]}`).join(', ');
    if (lane === 'event') {
      if (moves || bands.size > 1) notes.push(`lane event: the planners move its seat (${where})`);
      continue;
    }
    if (moves) problems.push(`lane ${lane}: its seat moves (${where})`);
    if (bands.size > 1) problems.push(`lane ${lane}: in both bands (${boxes.map(([s, b]) => `${s} ${band({ y: b[1], bottom: b[3] }, height)}`).join(', ')})`);
    if (bands.has('bottom')) problems.push(`lane ${lane}: under the middle, where the kill card stands`);
  }
  for (const { state, rects } of seen) {
    const kill = rects.find((r) => r.selector === LANE_SEATS.kill);
    if (!kill) continue;
    for (const notice of rects.filter((r) => NOTICES.includes(r.selector))) {
      if (band(notice, height) === 'bottom' && notice.x < kill.right && notice.right > kill.x) problems.push(`lane kill: ${notice.name} in the kill card's seat (${state})`);
    }
  }
  return { problems, notes, record };
}
