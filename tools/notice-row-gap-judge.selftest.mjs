// notice-row-gap-judge.selftest.mjs — a notice row's glyph-to-label gap holds through its entry, its hold and its exit
// (notices-polish-277; Kevin 2026-11-24: "as it disappears it looks like that space disappears. fix that."). Copyright ©
// 2026 Kevin B. Liu.
// - the judge: a shown-state gate that lays a row out is found; a row whose gap closes as it leaves fails, one that holds
//   passes, one missing a phase fails;
// - the class, in source: no battle notice sheet gates a row's layout on :not([hidden]) (the gun-limit chip's gap and seat
//   were the case Kevin saw: the chip leaves on cot-m-drop, on screen while hidden);
// - the chip itself: its gap and its seat are on rules the exit keeps.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAP_PHASES, gapProblems, shownStateLayout } from './notice-row-gap-judge.mjs';

// ---- the judge
assert.deepEqual(GAP_PHASES, ['enter', 'mid', 'exit']);
assert.deepEqual(shownStateLayout('.a:not([hidden]){display:flex}.b[hidden]{display:none}'), [], 'a gate that decides display alone');
assert.deepEqual(shownStateLayout('/* .x:not([hidden]){gap:1px} */.a:not([hidden]){display:flex;align-items:center;gap:6px}'),
  [{ selector: '.a:not([hidden])', props: ['align-items', 'gap'] }], 'a gate that lays the row out is found (comments skipped)');
assert.deepEqual(shownStateLayout('@media (pointer:coarse){.s[data-seat]:not([hidden]){left:var(--x);display:flex}}'),
  [{ selector: '.s[data-seat]:not([hidden])', props: ['left'] }], 'inside an at-rule too');
const row = (phase, gap, row = 'aimLimit', lane = 'event') => ({ row, lane, phase, gap });
// (the 276 chip: 6 px in, held, then 0 as it leaves)
assert.deepEqual(gapProblems([row('enter', 6), row('mid', 6), row('exit', 0)]),
  ['event:aimLimit: the glyph-to-label gap moves 6.00 px (enter 6.00, mid 6.00, exit 0.00)']);
assert.deepEqual(gapProblems([row('enter', 12), row('mid', 12.2), row('exit', 12)]), [], 'sub-pixel rounding holds');
assert.deepEqual(gapProblems([row('enter', 12), row('mid', 12), row('exit', null)]), [], 'a row gone at its exit has no gap to close');
assert.deepEqual(gapProblems([row('enter', null), row('mid', 12), row('exit', 12)]), ['event:aimLimit: not on screen at enter']);
assert.deepEqual(gapProblems([row('enter', 12, 'fire', 'condition'), row('mid', 12, 'fire', 'condition'), row('exit', 12, 'fire', 'condition'),
  row('enter', 6, 'chip', 'chip'), row('exit', 0, 'chip', 'chip')]), ['chip:chip: not on screen at mid'], 'rows judged apart');

// ---- a frame trace's phases (the probe traces every frame from the raise until the row is gone)
{
  const { tracePhases } = await import('./notice-row-gap-judge.mjs');
  const frames = [{ t: 16, gap: 6, opacity: 0.2 }, { t: 33, gap: 6, opacity: 0.7 }, { t: 50, gap: 6, opacity: 1 }, { t: 900, gap: 6, opacity: 1 },
    { t: 916, gap: 0, opacity: 0.6 }, { t: 933, gap: 0, opacity: 0.02 }];
  const traced = tracePhases('aimLimit', 'chip', frames);
  assert.deepEqual(traced.samples.map((s) => s.gap), [6, 6, 0], 'entry, hold, and the last frame seen leaving');
  assert.equal(traced.spread, 6);
  assert.equal(traced.frames, 5, 'a frame under 5 % opaque is gone');
  assert.deepEqual(gapProblems(traced.samples), ['chip:aimLimit: the glyph-to-label gap moves 6.00 px (enter 6.00, mid 6.00, exit 0.00)']);
  assert.deepEqual(tracePhases('x', 'event', []).samples.map((s) => s.gap), [null, null, null], 'never on screen');
}

// ---- the class in source: the battle notices' sheets lay no row out behind a shown-state gate
const SHEETS = ['src/ui/hud.ts', 'src/ui/battleHudLayout.css', 'src/ui/components/notices.css', 'src/ui/airSupportHud.css',
  'src/ui/pointers/pointers.css', 'src/ui/hudKillRibbon.ts', 'src/ui/components/surfaceMotion.css'];
for (const sheet of SHEETS) {
  assert.deepEqual(shownStateLayout(readFileSync(sheet, 'utf8')), [], `${sheet}: a :not([hidden]) gate decides display alone`);
}

// ---- the chip: its row's gap on the base rule, its seat under the HUD without a shown-state gate
const hud = readFileSync('src/ui/hud.ts', 'utf8');
const layout = readFileSync('src/ui/battleHudLayout.css', 'utf8');
assert.match(hud, /\n\.cot-aim-warning\{display:flex;align-items:center;justify-content:center;gap:6px\}/, 'the chip\'s gap on its base rule');
assert.match(layout, /\.cot-aim-warning\[hidden\]\{display:none\}/, '[hidden] ends only its display');
assert.match(layout, /\n\.cot-hud \.cot-aim-warning\[data-seat='sight'\]\{left:var\(--hud-aim-warning-x\);top:var\(--hud-aim-warning-y\);/,
  'the seat holds while the chip leaves');
assert.match(readFileSync('src/ui/hud.ts', 'utf8'), /el\('div', 'cot-aim-warning cot-m-drop', root\)/, 'the chip leaves on the motion vocabulary');
console.log('notice-row-gap-judge: ok');
