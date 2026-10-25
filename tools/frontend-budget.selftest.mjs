// frontend-budget.selftest.mjs — the frontend budget receipt's scoring (UI-LOCKDOWN E, 2026-10-25).
//
// Fixture runs in a temporary folder: a public page that misses LCP on the phone and holds every other budget, Garage
// presses with one long task and a dropped frame, a Settings memory cycle that leaks. The receipt names each miss with
// its owning lane, takes INP at the 98th percentile and every other metric at its worst sample, and --check fails on a
// new miss or a known one past its recorded value, never on a known one that held.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUDGETS, collect, compare, evaluate, ownerOf, surfaceOf } from './frontend-budget.mjs';

// which screen each recorded press or step is, and who owns it
for (const [kind, surface] of [['home-load', 'home'], ['cn-home', 'home'], ['docs-to-topic', 'docs'], ['not-found', '404'],
  ['gallery-row', 'gallery'], ['studio-open', 'studio'], ['roster-next', 'garage'], ['pick:m60a2', 'garage'],
  ['sweep:3:deploy', 'garage'], ['deploy-mode', 'deploy'], ['deploy-launch', 'battle-load'], ['end-to-garage', 'battle-end'],
  ['watch-hop', 'watch'], ['battle-steady', 'battle-hud'], ['settings-open', 'settings'], ['memory:record', 'record'],
  ['context-restore', 'recovery'], ['chunk-fail-studio', 'recovery'], ['gate-to-garage', 'boot'],
  ['canvas:gallery:dpr-2', 'gallery'], ['canvas:garage:act3', 'garage']]) {
  assert.equal(surfaceOf(kind), surface, `${kind} is the ${surface}`);
}
assert.equal(ownerOf('home'), 'premiere-site');
assert.equal(ownerOf('studio'), 'premiere-gallery-studio');
assert.equal(ownerOf('battle-end'), 'premiere-battle');
assert.equal(ownerOf('battle-hud'), 'perf');

const root = mkdtempSync(join(tmpdir(), 'frontend-budget-'));
try {
  const nav = join(root, 'nav', 'after');
  const click = join(root, 'click', 'after');
  mkdirSync(nav, { recursive: true });
  mkdirSync(click, { recursive: true });
  const step = (name, fields) => writeFileSync(join(nav, name), JSON.stringify({ group: 'public', fcp: 300, ...fields }));
  step('home-load.desktop.cold.json', { step: 'home-load', lcp: 900, cls: 0.004, tbt: 20, inp: null, consoleErrors: [],
    consoleWarnings: ['The resource was preloaded using link preload but not used within a few seconds'] });
  step('home-load.phone.cold.json', { step: 'home-load', lcp: 2900, cls: 0, tbt: 60, inp: null });
  step('docs-archive.desktop.warm.json', { step: 'docs-archive', lcp: null, cls: 0, tbt: 0, inp: 64 });
  writeFileSync(join(nav, 'gate-to-garage.desktop.cold.json'), JSON.stringify({ step: 'gate-to-garage', group: 'game', content: 150, fcp: 120, cls: 0, inp: 40 }));
  writeFileSync(join(nav, 'broken.desktop.cold.json'), JSON.stringify({ step: 'home-load', error: 'timeout' }));
  const press = (duration, census, extra = {}) => ({ kind: 'roster-next', duration, shownMs: 40, doneMs: 180, census, ...extra });
  const quiet = { worstLong: 0, droppedFrames: 0, consoleErrors: [], consoleWarnings: 0 };
  writeFileSync(join(click, 'roster-next.desktop.json'), JSON.stringify({ profile: 'desktop', samples: [
    ...Array.from({ length: 49 }, () => press(64, quiet)),
    press(160, { ...quiet, worstLong: 120, droppedFrames: 1 }),
    press(null, null, { error: 'not done' }),
  ] }));
  writeFileSync(join(click, 'memory-cycle.desktop.json'), JSON.stringify({ profile: 'desktop', samples: [
    { kind: 'memory:settings', heapDeltaBytes: 9 * 1048576, nodeDelta: 12 },
    { kind: 'memory:deploy', heapDeltaBytes: 1048576, nodeDelta: 4 },
    { kind: 'memory:record', error: 'no control on this layout' },
  ] }));
  writeFileSync(join(click, 'programs.after.desktop.garage-0.json'), JSON.stringify([]));
  writeFileSync(join(click, 'canvas-gallery.phone.json'), JSON.stringify({ profile: 'phone', samples: [
    { kind: 'canvas:gallery:start', canvas: { checked: 2, violations: [] } },
    { kind: 'canvas:gallery:act0', canvas: { checked: 2, violations: [{ canvas: '#stageInset canvas#stageScale', state: 'hidden-held' }] } },
    { kind: 'canvas:gallery:act1', error: 'nothing visible matches' },
  ] }));

  const rows = evaluate(collect({ nav: [nav], click: [click] }));
  const row = (key) => rows.find((r) => r.key === key);
  // public pages: LCP by rig; a step's error is skipped
  assert.equal(row('public/home/desktop/lcpMs').pass, true);
  assert.deepEqual([row('public/home/phone/lcpMs').value, row('public/home/phone/lcpMs').budget, row('public/home/phone/lcpMs').pass],
    [2900, BUDGETS.public.lcpMs.phone, false]);
  assert.equal(row('public/home/desktop/lcpMs').samples, 1, 'an errored step is not scored');
  assert.equal(row('public/docs/desktop/inpMs').value, 64);
  // the console census: a public page's warning is a miss on that page, its errors counted beside it
  assert.deepEqual([row('everywhere/home/desktop/consoleWarnings').value, row('everywhere/home/desktop/consoleWarnings').pass], [1, false]);
  assert.equal(row('everywhere/home/desktop/consoleErrors').pass, true);
  assert.equal(row('app/boot/desktop/contentMs').value, 150, 'a game step\'s content counts from its first paint at the latest');
  // app presses: INP at p98 holds past one slow press in fifty; the worst long task and dropped frame miss
  assert.equal(row('app/garage/desktop/inpP98Ms').value, 64, 'one slow press in fifty sits past the 98th percentile');
  assert.equal(row('app/garage/desktop/longTaskMs').value, 120);
  assert.equal(row('app/garage/desktop/longTaskMs').pass, false);
  assert.equal(row('app/garage/desktop/droppedFrames').pass, false, 'desktop allows no dropped frame');
  assert.equal(row('app/garage/desktop/contentMs').pass, true);
  // memory: heap and nodes by screen, a screen with no control skipped
  assert.equal(row('everywhere/settings/desktop/heapGrowthMb').pass, false);
  assert.equal(row('everywhere/deploy/desktop/heapGrowthMb').pass, true);
  assert.equal(rows.some((r) => r.surface === 'record'), false);
  // the canvas rule: a check's violations on its surface (a phone run), never scored as presses
  assert.deepEqual([row('everywhere/gallery/phone/canvasViolations').value, row('everywhere/gallery/phone/canvasViolations').samples], [1, 2]);
  assert.equal(rows.some((r) => r.cls === 'app' && r.surface === 'gallery'), false);
  // misses come first, each with its lane
  const misses = rows.filter((r) => !r.pass);
  assert.ok(rows.slice(0, misses.length).every((r) => !r.pass), 'misses lead the table');
  assert.deepEqual([...new Set(misses.map((r) => r.owner))].sort(), ['premiere-gallery-studio', 'premiere-site'], 'a leak is its screen\'s lane\'s');

  // --check: everything is a regression with no known list; a known miss that held passes; one far worse fails
  assert.equal(compare(rows, {}).regressions.length, misses.length);
  const known = Object.fromEntries(misses.map((r) => [r.key, { value: r.value }]));
  assert.deepEqual(compare(rows, known), { regressions: [], fixed: [] });
  const worse = { ...known, 'app/garage/desktop/longTaskMs': { value: 40 } };
  assert.deepEqual(compare(rows, worse).regressions.map((r) => r.key), ['app/garage/desktop/longTaskMs']);
  const stale = { ...known, 'app/garage/desktop/contentMs': { value: 900 } };
  assert.deepEqual(compare(rows, stale).fixed.map((r) => r.key), ['app/garage/desktop/contentMs'], 'a known miss that now passes is reported');
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('frontend-budget.selftest: surfaces, owners, budgets by rig, INP p98, memory, and --check against known misses PASS');
