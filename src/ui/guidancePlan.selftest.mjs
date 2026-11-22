#!/usr/bin/env node
// guidancePlan.selftest.mjs — the battle's guidance in one place, laid out at every recorded HUD size (274).
// Copyright © 2026 Kevin B. Liu.
//
// Kevin, 2026-11-18: "the armor shader hexagon and the tutorial squares at top overlap. there should be one unified thing
// for this". For every size the HUD was recorded at (tools/fixtures/hud-sight-furniture.json: desktop windows, phone
// portrait and phone landscape, each with and without the objective), with the tutorial's card alone, the toasts alone
// and both, it lays the guidance out (src/ui/guidancePlan.ts) among the recorded instruments and controls and the centre
// detection (the fixture's notices on touch; the stack's reserve under the score on a mouse layout), and holds:
//  1. no guidance surface overlaps another (the card, the toasts, the detection and the alert), and each stays on screen;
//     where no order keeps the card off the centre notices (the smallest landscapes, never a named size) the card gives
//     way while one shows;
//  2. none overlaps a shell or kit button (nor any control a player presses), at any size, whatever tier it took; where
//     nothing keeps the toasts off the controls and the other surfaces
//     they wait for it (never on it), and the card always has a place;
//  3. at the named sizes (desktop 1440x900 and 900x720, phone portrait 390x844 and 375x667, phone landscape 844x390 and
//     667x375) every surface clears every instrument and control (cleared), off the centre line only where none holds it;
//  4. the plan is deterministic and keeps to the centre line, but for a last resort where no centred band holds a surface;
//  5. the wiring: battleHudLayout.ts plans the card, the centre notices and the toasts in that one order and writes their
//     places, the toasts' region and the tutorial's battle card read them, and the card asks for a re-plan as it changes;
//  6. a card mid-swap (its overlay open, the card measuring nothing for a pass) keeps its place and the toasts stay off it:
//     the case the first browser check found at 1440x900, which the old wiring planned onto the card;
//  7. the card's natural size is held for its step, and the same inputs plan the same places;
//  8. the live loop iterated six passes at 390x844 and 1440x900, each reading the card at the width the last plan gave it:
//     the places settle after one pass; and the flicker's mechanism as a property: the held size never moves with the
//     width a plan gives the card (the old estimate's does, the input a two-place cycle needs);
//  9. the card's box is never shorter than its words at the box's width (Main, after 273.2's phone frame cut a line in
//     half: a box 148 px tall over 241 px of words): at every recorded size, and on the live battle-sight HUD of that frame
//     (tools/fixtures/hud-battle-sight-390x844.json) over every natural height a card may have, whole words or a type
//     step smaller wherever a place holds them, and scrolling under its affordance only where none does; the live loop on
//     that HUD settles, and every pass's box holds the words it shows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardNaturalSize, GUIDANCE_COMPACT_H, guidanceOverlaps, heldCardSize, planGuidance, planTouchGuidance } from './guidancePlan.ts';
import { planTouchNotices, TOUCH_COMPACT_ALERT, TOUCH_COMPACT_NOTICE, TOUCH_ONE_ROW, touchSightKeepOut } from './touchNoticePlan.ts';

const FURNITURE = JSON.parse(readFileSync(new URL('../../tools/fixtures/hud-sight-furniture.json', import.meta.url), 'utf8'));
const HARD = new Set(['.cot-top', '.cot-drive', '.cot-vehicle-controls>button', '.cot-shell', '.cot-con', '.cot-dp', '.cot-touch.on .quick',
  '.cot-touch.on .joy', '.cot-touch.on .round', '.cot-scope-vision', '.cot-aim-warning', '.cot-mode-status.show']);
const SOFT = new Set(['.cot-minimap', '.cot-ear']);
const KIT = new Set(['.cot-shell', '.cot-con']);
/** Never covered, even where nothing clears: every control a player presses (the shell and kit buttons among them). */
const CONTROLS = new Set(['.cot-shell', '.cot-con', '.cot-vehicle-controls>button', '.cot-touch.on .quick', '.cot-touch.on .joy',
  '.cot-touch.on .round', '.cot-scope-vision']);
const NAMED = ['1440x900', '900x720', '390x844t', '375x667t', '844x390t', '667x375t'];

const box = ([, x0, y0, x1, y1]) => ({ x0, y0, x1, y1 });
/** The card's words at a box's width as the plan models them (their height reflowing as the width narrows), at its fit's
 *  type step. */
const wordsAt = (card, place) => Math.ceil(card.h * (place.fit === 'compact' ? GUIDANCE_COMPACT_H : 1) * (card.w / (place.x1 - place.x0)));
/** 9. A card's box holds its words, or scrolls (under the affordance) only because no place holds them. */
const holdsWords = (card, place, label) => {
  if (place.fit === 'tight') assert.ok(place.y1 - place.y0 < wordsAt(card, { ...place, fit: 'full' }), `${label}: a card marked tight is shorter than its words`);
  else assert.ok(place.y1 - place.y0 >= wordsAt(card, place) - 1,
    `${label}: the card's box (${Math.round(place.y1 - place.y0)} px) is shorter than its words at its width (${wordsAt(card, place)} px), fit ${place.fit}`);
};
let laid = 0;
const uncleared = [], waits = [], offCentre = [], yields = [], scrolls = [], compacts = [], captionWaits = [];
for (const [key, entries] of Object.entries(FURNITURE.sizes)) {
  const size = key.split(':')[0];
  const [width, height] = size.replace('t', '').split('x').map(Number);
  const touch = size.endsWith('t');
  const known = new Set(entries.map((entry) => entry[0]));
  for (const selector of known) assert.ok(HARD.has(selector) || SOFT.has(selector), `${key}: ${selector} is classed hard or soft`);
  const hard = entries.filter((entry) => HARD.has(entry[0])).map(box);
  const soft = entries.filter((entry) => SOFT.has(entry[0])).map(box);
  const kit = entries.filter((entry) => KIT.has(entry[0])).map(box);
  const controls = entries.filter((entry) => CONTROLS.has(entry[0])).map(box);
  const scoreBottom = Math.max(0, ...entries.filter((entry) => entry[0] === '.cot-top').map((entry) => entry[4]));
  // the sight (its ring at full bloom and the column under it), kept clear where the screen has room
  const r = Math.min(width, height) * 0.15;
  const sight = { x0: width / 2 - r * 1.6, y0: height / 2 - r * 1.6, x1: width / 2 + r * 1.6, y1: height / 2 + r * 1.6 + 40 };
  const card = touch ? { w: width - 32, h: 270 } : { w: Math.min(480, width - 32), h: 250 };
  const toasts = { w: Math.min(420, width - 32), h: 52 };
  /** The centre notices: on a mouse layout the stack's reserve under the score, planned before the guidance; on touch the
   *  touch planner's detection and alert, planned round the card (null: no card up). */
  const centreNotices = (cardPlace) => {
    if (!touch) return [{ x0: width / 2 - 124, y0: scoreBottom + 8, x1: width / 2 + 124, y1: scoreBottom + 8 + 32 + 6 + 40 }];
    const oneRow = width > height ? height <= 340 : width <= 340;
    const plan = planTouchNotices({ width, height, top: scoreBottom + 6,
      obstacles: [...hard, ...(cardPlace ? [cardPlace] : [])].map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 })),
      soft: soft.map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 })), scope: entries.some((entry) => entry[0] === '.cot-scope-vision'),
      seated: true, notice: { w: 214, h: 32 }, alert: { w: 214, h: 40 }, alertCompact: { w: 136, h: 34 }, countdown: null, banner: null,
      fallbackTop: scoreBottom + 8, oneRow });
    const size = (compact, full) => (plan.oneRow ? TOUCH_ONE_ROW : compact ? (full === 'n' ? TOUCH_COMPACT_NOTICE : TOUCH_COMPACT_ALERT) : { w: 214, h: full === 'n' ? 32 : 40 });
    const at = (top, sz) => ({ x0: width / 2 - sz.w / 2, y0: top, x1: width / 2 + sz.w / 2, y1: top + sz.h });
    return [at(plan.noticeTop, size(plan.noticeCompact, 'n')), at(plan.alertTop, size(plan.alertCompact, 'a'))];
  };
  for (const [state, withCard, withToasts, withCaptions] of [['card', true, false], ['toasts', false, true], ['both', true, true],
    ['captions', false, true, true], ['all', true, true, true]]) {
    const base = { width, height, top: scoreBottom + 6, hard, soft: [...soft, sight], never: controls,
      card: withCard ? card : null, toasts: withToasts ? toasts : null,
      captions: withCaptions ? { w: Math.min(560, width - 32), h: 32 } : null, sight: [sight] };
    // the order battleHudLayout keeps: a touch layout's card first and the centre notices round it; a mouse layout's
    // centre notices first and the card round them
    let notices, plan, cardYields = false;
    if (touch) {
      ({ plan, notices, cardYields } = planTouchGuidance(base, centreNotices));
      if (cardYields) {
        assert.ok(!NAMED.includes(key), `${key} ${state}: the card gives way to a centre notice at a named size`);
        yields.push(`${key} ${state}`);
      }
    } else {
      notices = centreNotices(null);
      plan = planGuidance({ ...base, never: [...controls, ...notices] });
    }
    assert.deepEqual(planGuidance({ ...base, never: [...controls, ...notices] }, plan.card), plan, `${key} ${state}: deterministic`);
    const places = [plan.card, plan.toasts, plan.captions].filter(Boolean);
    laid += places.length;
    // (notices-audit-275) the caption line: below the window's middle, never on the sight, never on an instrument
    if (plan.captions) {
      assert.ok(plan.captions.y0 >= Math.max(scoreBottom + 6, height / 2) - 0.5, `${key} ${state}: the caption line below the middle`);
      assert.ok(!guidanceOverlaps(plan.captions, sight), `${key} ${state}: the caption line on the sight`);
      for (const box of hard) assert.ok(!guidanceOverlaps(plan.captions, box), `${key} ${state}: the caption line on an instrument`);
    } else if (withCaptions) captionWaits.push(`${key} ${state}`);
    for (const place of places) {
      if (!place.offCentre) assert.ok(Math.abs((place.x0 + place.x1) / 2 - width / 2) < 0.5, `${key} ${state}: on the centre line`);
      else offCentre.push(`${key} ${state}`);
      assert.ok(place.x0 >= 0 && place.y0 >= 0 && place.x1 <= width && place.y1 <= height, `${key} ${state}: on screen`);
      // 2. never a shell or kit button, nor any other control
      for (const button of kit) assert.ok(!guidanceOverlaps(place, button), `${key} ${state}: a guidance surface over a shell or kit button`);
      for (const control of controls) assert.ok(!guidanceOverlaps(place, control), `${key} ${state}: a guidance surface over a control`);
    }
    // 1. no guidance surface on another: the card, the toasts, the detection and the alert
    const surfaces = [...places, ...notices];
    for (let i = 0; i < surfaces.length; i++) for (let j = i + 1; j < surfaces.length; j++) {
      if (i >= places.length && j >= places.length) continue; // the notice planners' own pair is their receipts'
      // (a card that gives way is hidden while a centre notice shows: apart in time)
      if (cardYields && surfaces[i] === plan.card && j >= places.length) continue;
      if (!guidanceOverlaps(surfaces[i], surfaces[j])) continue;
      assert.fail(`${key} ${state}: guidance surfaces overlap ${JSON.stringify([surfaces[i], surfaces[j]])}`);
    }
    if (!plan.cleared) uncleared.push(`${key} ${state}`);
    if (plan.toastsWait) waits.push(`${key} ${state}`);
    // (toasts wait where nothing keeps them off the controls and the other notices: behind a card, or on the smallest
    // phones; never at a named size, below)
    if (withCard) assert.ok(plan.card, `${key} ${state}: the card always has a place`);
    if (plan.card) {
      holdsWords(card, plan.card, `${key} ${state}`);
      if (plan.card.fit === 'tight') scrolls.push(`${key} ${state}`);
      if (plan.card.fit === 'compact') compacts.push(`${key} ${state}`);
    }
    // 3. the named sizes clear everything
    if (NAMED.includes(key)) {
      // (a surface may stand off the centre line there, clear of everything: a phone landscape's upper right, where a
      // centred one would sit on the sight)
      assert.ok(plan.cleared && (!plan.toastsWait || withCard), `${key} ${state}: every surface clears the instruments and controls, toasts waiting only behind a card (${JSON.stringify(plan)})`);
      for (const place of places) for (const obstacle of hard) assert.ok(!guidanceOverlaps(place, obstacle), `${key} ${state}: clear of every control`);
    }
  }
}
for (const named of NAMED) assert.ok(FURNITURE.sizes[named], `the fixture holds ${named}`);

// 6. A card mid-swap (Main, after the first browser check: at 1440x900 a toast sat under the card while this receipt
// passed). A pass measures the card; the next, its overlay still open, measures it as nothing (a step's swap, a pause's
// hide and show). The size held from the last measure keeps the card's place, and the toasts stay off it; the old wiring
// (the card taken as gone, 36bb485fd0) planned the toasts into the card's row, which this case shows too.
{
  const replay = (key) => {
    const entries = FURNITURE.sizes[key];
    const size = key.split(':')[0];
    const [width, height] = size.replace('t', '').split('x').map(Number);
    const touch = size.endsWith('t');
    const hard = entries.filter((entry) => HARD.has(entry[0])).map(box);
    const soft = entries.filter((entry) => SOFT.has(entry[0])).map(box);
    const controls = entries.filter((entry) => CONTROLS.has(entry[0])).map(box);
    const scoreBottom = Math.max(0, ...entries.filter((entry) => entry[0] === '.cot-top').map((entry) => entry[4]));
    const notices = touch ? [] : [{ x0: width / 2 - 124, y0: scoreBottom + 8, x1: width / 2 + 124, y1: scoreBottom + 8 + 32 + 6 + 40 }];
    const toasts = { w: Math.min(420, width - 32), h: 52 };
    const pass = (card) => planGuidance({ width, height, top: scoreBottom + 6, hard, soft, never: [...controls, ...notices], card, toasts });
    const natural = touch ? { w: width - 32, h: 270 } : { w: Math.min(480, width - 32), h: 250 };
    // pass 1: the card measured
    let held = heldCardSize(null, true, natural);
    const first = pass(held);
    assert.ok(first.card && first.toasts && !guidanceOverlaps(first.card, first.toasts), `${key}: the measured pass keeps them apart`);
    // pass 2: the overlay open, the card measuring nothing
    held = heldCardSize(held, true, { w: natural.w, h: 0 });
    assert.deepEqual(held, natural, `${key}: the size is held while the overlay is open`);
    const second = pass(held);
    assert.deepEqual(second.card, first.card, `${key}: the card keeps its place through the swap`);
    assert.ok(second.toasts && !guidanceOverlaps(second.toasts, first.card), `${key}: the toasts stay off the card's held box`);
    // the old wiring: the card taken as gone for that pass; the toasts took the card's row (the browser check's frame)
    const gone = pass(null);
    assert.ok(gone.toasts && guidanceOverlaps(gone.toasts, first.card), `${key}: without the held size the toasts land on the card (the case this guards)`);
    // the overlay closed: nothing held
    assert.equal(heldCardSize(natural, false, null), null, `${key}: a closed overlay holds nothing`);
  };
  replay('1440x900');
  replay('900x720');
}

// 7. The plan is a fixed point (the final browser check's phone frame flipped between two places): the card's natural
// size is held for its step, so a pass that reads the card at the narrower place the plan gave it plans the same place.
{
  const natural = 358;
  let held = cardNaturalSize(null, { step: 'training.driveTouch', width: 358, scrollHeight: 270 }, natural);
  assert.deepEqual(held, { step: 'training.driveTouch', size: { w: 358, h: 270 }, exact: true });
  // read again at the narrower place (its words wrapped: taller): the exact size stands
  assert.deepEqual(cardNaturalSize(held, { step: 'training.driveTouch', width: 245, scrollHeight: 360 }, natural), held, 'a narrow read keeps the exact size');
  // a step first read at a narrow place: one estimate, then held whatever later narrow reads say
  let narrow = cardNaturalSize(null, { step: 'training.firePenTouch', width: 245, scrollHeight: 360 }, natural);
  assert.equal(narrow.exact, false);
  assert.deepEqual(cardNaturalSize(narrow, { step: 'training.firePenTouch', width: 300, scrollHeight: 320 }, natural), narrow, 'an estimate is held for its step');
  // an exact read replaces an estimate; a new step reads anew; nothing read keeps what is held
  assert.equal(cardNaturalSize(narrow, { step: 'training.firePenTouch', width: 358, scrollHeight: 290 }, natural).size.h, 290);
  assert.equal(cardNaturalSize(held, { step: 'training.fireHETouch', width: 358, scrollHeight: 200 }, natural).size.h, 200);
  assert.equal(cardNaturalSize(held, null, natural), held);
  // and the plan from the held size is the same pass after pass at the recorded phone and desktop sizes
  for (const key of ['390x844t', '1440x900']) {
    const entries = FURNITURE.sizes[key];
    const [width, height] = key.replace('t', '').split('x').map(Number);
    const input = { width, height, top: 68, hard: entries.filter((e) => HARD.has(e[0])).map(box), soft: entries.filter((e) => SOFT.has(e[0])).map(box),
      never: entries.filter((e) => CONTROLS.has(e[0])).map(box), card: { w: Math.min(480, width - 32), h: 270 }, toasts: { w: Math.min(420, width - 32), h: 44 } };
    const once = planGuidance(input);
    assert.deepEqual(planGuidance(input), once, `${key}: the same inputs plan the same places`);
  }
}

// 8. The live loop, iterated (Main, for the final check's phone flicker): each pass reads the card at the width the last
// pass's plan gave it, its words wrapped there (a line model: the card's chrome, then its text in lines of the width
// left inside its padding), and plans again, six passes, as battleHudLayout.ts does pass after pass. With the size held
// for its step (cardNaturalSize, heldCardSize) the places settle after the first pass and never change; the estimate the
// layout made inline before (281835400c: the height read at the plan's width, scaled back by width) alternates between
// two places at 390x844, the flicker the browser check's phone still showed.
{
  const CHROME = 150, PAD = 32, LINE = 21, TEXT_W = 610; // the battle card: head, bar, hint and buttons; ~80 characters of body
  const wrap = (width) => CHROME + Math.ceil(TEXT_W / Math.max(1, width - PAD)) * LINE;
  const oldEstimate = (natural, reading) => ({ w: natural, h: Math.ceil(reading.scrollHeight * Math.min(1, reading.width / natural)) });
  const iterate = (key, rule) => {
    const entries = FURNITURE.sizes[key];
    const [width, height] = key.replace('t', '').split('x').map(Number);
    const touch = key.endsWith('t');
    const natural = Math.min(480, width - 32);
    const base = { width, height, top: Math.max(0, ...entries.filter((e) => e[0] === '.cot-top').map((e) => e[4])) + 6,
      hard: entries.filter((e) => HARD.has(e[0])).map(box), soft: entries.filter((e) => SOFT.has(e[0])).map(box),
      never: entries.filter((e) => CONTROLS.has(e[0])).map(box), toasts: { w: Math.min(420, width - 32), h: 44 } };
    let held = null, natural$ = null, shownWidth = natural;
    const places = [];
    for (let pass = 0; pass < 6; pass++) {
      const reading = { step: 'training.drive', width: shownWidth, scrollHeight: wrap(shownWidth) };
      let size;
      if (rule === 'held') { natural$ = cardNaturalSize(natural$, reading, natural); size = natural$.size; }
      else size = oldEstimate(natural, reading);
      held = heldCardSize(held, true, size);
      // a touch layout's order, as the live loop runs it: the card first, the touch planner's detection and alert round it
      const plan = touch ? planTouchGuidance({ ...base, card: held }, (card) => {
        const placed = planTouchNotices({ width, height, top: base.top,
          obstacles: [...base.hard, ...base.never, ...(card ? [{ x0: card.x0, y0: card.y0, x1: card.x1, y1: card.y1 }] : [])],
          soft: base.soft, scope: entries.some((e) => e[0] === '.cot-scope-vision'), seated: true, notice: { w: 214, h: 32 },
          alert: { w: 214, h: 40 }, alertCompact: { w: 136, h: 34 }, countdown: null, banner: null, fallbackTop: base.top + 2,
          oneRow: width > height ? height <= 340 : width <= 340 });
        const at = (y, h) => ({ x0: width / 2 - 107, y0: y, x1: width / 2 + 107, y1: y + h });
        return [at(placed.noticeTop, 32), at(placed.alertTop, 40)];
      }).plan : planGuidance({ ...base, card: held });
      places.push(JSON.stringify([plan.card && [plan.card.x0, plan.card.y0, plan.card.x1, plan.card.y1], plan.toasts && [plan.toasts.y0]]));
      shownWidth = plan.card ? plan.card.x1 - plan.card.x0 : natural;
    }
    return places;
  };
  for (const key of ['390x844t', '1440x900']) {
    const places = iterate(key, 'held');
    assert.ok(places.slice(1).every((place) => place === places[1]), `${key}: the places settle after the first pass (${places.join(' | ')})`);
  }
  // The flicker's mechanism, held as a property (the recorded fixture is the sniper stage's HUD, where the phone's card
  // fits at its full width and the old rule never reads it narrowed; the live battle-sight frame narrowed it to 246 px):
  // a two-place cycle needs the card's size input to change with the width the last plan gave it. The held size cannot:
  // after a read at the natural width, no later read of the step at any width moves it. The old estimate does.
  const natural = 358;
  const widths = [358, 246, 300, 220, 358, 246, 280, 200, 358];
  let held = null;
  const heldSizes = widths.map((width) => (held = cardNaturalSize(held, { step: 'training.driveTouch', width, scrollHeight: wrap(width) }, natural)).size.h);
  assert.equal(new Set(heldSizes).size, 1, `the held size never moves after its exact read, whatever width the plan gives (${heldSizes.join(',')})`);
  const oldSizes = widths.map((width) => oldEstimate(natural, { width, scrollHeight: wrap(width) }).h);
  assert.ok(new Set(oldSizes).size > 1, `the old estimate's size follows the plan's width (${oldSizes.join(',')}): the input a cycle needs`);
  // first read narrowed (a step whose card first shows at a place the last step's plan gave it): one estimate, then held
  held = null;
  const narrowFirst = [246, 300, 220, 280].map((width) => (held = cardNaturalSize(held, { step: 'training.firePenTouch', width, scrollHeight: wrap(width) }, natural)).size.h);
  assert.equal(new Set(narrowFirst).size, 1, `a narrowed first read is estimated once and held (${narrowFirst.join(',')})`);
}

// 9. The card's box holds its words (Main, after 273.2: at 390x844, step battle.driveTouch, the battle sight in arcade, the
// card stood at [72,438,318,586], 148 px over 241 px of words at 246 px: its last line cut in half, in two frames). The
// planner chose a shrunk card clear of the sight over a whole one on it, and the card scrolled with nothing to show it. On
// that frame's own HUD (the recorded instruments and controls, the risen sight that reproduces its plan), for every
// natural height a card may have, the plan gives the words whole, then a type step smaller, and only where no place holds
// either a scrolling box (the fade and chevron, data-more); the old order fails this at the frame's own card.
{
  const LIVE = JSON.parse(readFileSync(new URL('../../tools/fixtures/hud-battle-sight-390x844.json', import.meta.url), 'utf8'));
  const entries = LIVE.sizes['390x844t'];
  const width = 390, height = 844, natural = 358;
  const hard = entries.filter((e) => HARD.has(e[0])).map(box);
  const base = { width, height, top: LIVE.top, hard, soft: [...entries.filter((e) => SOFT.has(e[0])).map(box), ...touchSightKeepOut(width, height, false, true, LIVE.sightY)],
    never: entries.filter((e) => CONTROLS.has(e[0])).map(box), toasts: null };
  const centre = (card) => {
    const placed = planTouchNotices({ width, height, top: base.top, obstacles: [...hard, ...(card ? [{ x0: card.x0, y0: card.y0, x1: card.x1, y1: card.y1 }] : [])],
      soft: base.soft, scope: false, seated: true, notice: { w: 214, h: 32 }, alert: { w: 214, h: 40 }, alertCompact: { w: 136, h: 34 },
      countdown: null, banner: null, fallbackTop: base.top + 2, oneRow: false });
    const at = (y, h) => ({ x0: width / 2 - 107, y0: y, x1: width / 2 + 107, y1: y + h });
    return [at(placed.noticeTop, 32), at(placed.alertTop, 40)];
  };
  // the recorded frame: the box shorter than the words it held (the case)
  const [x0, y0, x1, y1] = LIVE.plan.card;
  assert.ok(y1 - y0 < LIVE.card.scrollHeight && Math.abs(x1 - x0 - LIVE.card.offsetWidth) <= 1,
    `the recorded frame cut the card (${y1 - y0} px over ${LIVE.card.scrollHeight} px of words at ${LIVE.card.offsetWidth} px)`);
  // the frame's card as a line model (its chrome, then the body in lines of the width inside its padding), set so it is
  // the recorded 241 px at 246 px; its natural height at 358 px is 220 px, the size that planned the recorded box before
  const CHROME = 136, PAD = 32, LINE = 21, TEXT_W = 1070;
  const words = (w, compact = false) => compact
    ? Math.round(CHROME + Math.ceil(TEXT_W * (13 / 14) / Math.max(1, w - PAD)) * LINE * (13 / 14))
    : CHROME + Math.ceil(TEXT_W / Math.max(1, w - PAD)) * LINE;
  assert.equal(words(LIVE.card.offsetWidth), LIVE.card.scrollHeight, 'the line model is the recorded card');
  const frameCard = { w: natural, h: words(natural) };
  const plan = planTouchGuidance({ ...base, card: frameCard }, centre).plan;
  holdsWords(frameCard, plan.card, '390x844 battle sight, the frame\'s card');
  assert.notEqual(plan.card.fit, 'tight', `the frame's card fits whole or a step smaller (${JSON.stringify(plan.card)})`);
  // every natural height a card may have on that HUD
  const fits = { full: 0, compact: 0, tight: 0 };
  for (let h = 120; h <= 420; h += 4) {
    const card = { w: natural, h };
    const { plan: at, notices } = planTouchGuidance({ ...base, card }, centre);
    holdsWords(card, at.card, `390x844 battle sight, a ${h} px card`);
    for (const control of base.never) assert.ok(!guidanceOverlaps(at.card, control), `a ${h} px card stays off the controls`);
    for (const notice of notices) assert.ok(!guidanceOverlaps(at.card, notice), `a ${h} px card stays off the centre notices`);
    fits[at.card.fit]++;
  }
  assert.ok(fits.full > 0 && fits.compact > 0, `the sweep meets whole and compact cards (${JSON.stringify(fits)})`);
  // the live loop on that HUD, iterated (as §8): each pass reads the card's natural height (the full type) at the width the
  // last plan gave it; the places settle after the first pass, and each pass's box holds the words the model says it shows
  // there (a compact box at the compact type: the card's own fit steps its type down)
  let held = null, size = null, shown = { w: natural };
  const places = [];
  for (let pass = 0; pass < 6; pass++) {
    const reading = { step: 'training.driveTouch', width: shown.w, scrollHeight: words(shown.w) };
    held = cardNaturalSize(held, reading, natural);
    size = heldCardSize(size, true, held.size);
    const at = planTouchGuidance({ ...base, card: size }, centre).plan.card;
    const tall = at.y1 - at.y0, need = words(at.x1 - at.x0, at.fit === 'compact');
    if (at.fit !== 'tight') assert.ok(tall >= need, `pass ${pass}: the box (${tall} px) holds the words it shows (${need} px)`);
    places.push(JSON.stringify([at.x0, at.y0, at.x1, at.y1, at.fit]));
    shown = { w: at.x1 - at.x0 };
  }
  assert.ok(places.slice(1).every((p) => p === places[1]), `the live loop settles after one pass (${places.join(' | ')})`);
  console.log(`guidancePlan §9: the 273.2 frame's card now ${places[1]}; ${JSON.stringify(fits)} over natural heights 120 to 420 px`);
}

// 5. The wiring: one owner places them all, and every surface reads its place from it.
{
  const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const layout = read('src/ui/battleHudLayout.ts');
  assert.match(layout, /planTouchGuidance\(base, touchCentre\)/, 'a touch layout plans the card and the centre notices in one order');
  assert.match(layout, /planTouchNotices\(\{ \.\.\.touchInput, obstacles: card \?/, 'the touch notices take the card as an obstacle');
  assert.match(layout, /guidance = planGuidance\(\{ \.\.\.base, never: \[\.\.\.base\.never, detection,/, 'a mouse layout plans the guidance off its centre notices');
  for (const name of ['--hud-guidance-card-left', '--hud-guidance-card-top', '--hud-guidance-card-width', '--hud-guidance-card-max-h',
    '--hud-battle-notices-left', '--hud-battle-notices-top', '--hud-battle-notices-width']) {
    assert.ok(layout.includes(`'${name}'`), `battleHudLayout writes ${name}`);
  }
  // one writer for the toasts' place: the guidance's (a second write later in the pass, the layout's properties table,
  // set them back under the card in the first browser check)
  assert.equal((layout.match(/battle-notices-top/g) ?? []).length, 1, 'only the guidance writes the toasts\' top');
  assert.equal((layout.match(/battle-notices-left/g) ?? []).length, 1, 'only the guidance writes the toasts\' left');
  const css = read('src/ui/battleHudLayout.css');
  assert.match(css, /\[data-hud-guidance~=toasts\] \.cot-battle-notices\[data-placement=top\]\{left:var\(--hud-battle-notices-left\);top:var\(--hud-battle-notices-top\)/,
    'the toasts stand where the plan puts them');
  assert.match(css, /\[data-hud-guidance~=toasts-wait\]/, 'and wait where it says');
  const tutorial = read('src/ui/tutorial/tutorial.css');
  assert.match(tutorial, /\[data-hud-guidance~=card\] \.cot-tut\[data-chapter=training\] \.cot-tut-card\{\s*left:var\(--hud-guidance-card-left\);top:var\(--hud-guidance-card-top\)/,
    'a training card stands where the plan puts it');
  assert.match(tutorial, /\[data-hud-guidance~=card-yields\]/, 'and gives way where it says');
  assert.match(layout, /const card = guidanceCardSize = heldCardSize\(guidanceCardSize, !!cardNode, measured\);/, 'the layout holds the card\'s size through a swap');
  assert.match(layout, /guidanceCardNatural = cardNaturalSize\(guidanceCardNatural,/, 'the layout holds the card\'s natural size for its step');
  // 9. (274) the card fits the plan's box itself and never scrolls: the plan reads its natural height (the full type,
  // before any fit step), the box is its max-height, and nothing scrolls or marks a scroll
  assert.match(layout, /Number\(cardNode\?\.dataset\.naturalH\)/, 'the layout reads the card\'s natural height');
  assert.ok(!/markCardMore|data-more'|card-\$\{card\.fit\}/.test(layout), 'no scroll marker and no fit flag: the card\'s own fit is the one mechanism');
  assert.match(tutorial, /max-height:var\(--hud-guidance-card-max-h\)/, 'the plan\'s box is the card\'s max-height');
  assert.ok(!/overflow:auto|overflow-y:auto|\[data-more\]/.test(tutorial), 'the card never scrolls');
  const overlay = read('src/ui/tutorial/tutorialOverlay.ts');
  assert.equal((overlay.match(/askLayout\(\);/g) ?? []).length, 3, 'the card asks the layout to re-plan when it shows, hides and goes');
}
// (the caption line waits where no band below the middle clears the sight, the instruments and the notices: count them)
console.log(`guidancePlan.selftest: the caption line placed below the sight or waiting (${captionWaits.length} waits: ${captionWaits.join(', ')})`);
console.log(`guidancePlan.selftest: PASS (${Object.keys(FURNITURE.sizes).length} recorded sizes, ${laid} places: no surface on another or on a shell or kit button; the ${NAMED.length} named sizes clear every control${uncleared.length ? `; ${uncleared.length} on an instrument elsewhere: ${uncleared.slice(0, 6).join(', ')}` : ''}${waits.length ? `; toasts wait behind the card at ${waits.length}: ${waits.slice(0, 6).join(', ')}` : ''}${offCentre.length ? `; off the centre line at ${offCentre.length}: ${offCentre.slice(0, 6).join(', ')}` : ''}${yields.length ? `; the card gives way to a centre notice at ${yields.length}: ${yields.join(', ')}` : ''}; the card's words whole or a type step smaller wherever a place holds them${compacts.length ? `, a type step smaller at ${compacts.length}` : ''}${scrolls.length ? `, tight (the card fits its words itself) at ${scrolls.length}: ${scrolls.slice(0, 6).join(', ')}` : ''})`);
