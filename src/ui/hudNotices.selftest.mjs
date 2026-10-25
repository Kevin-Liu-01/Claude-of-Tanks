// hudNotices.selftest.mjs — the battle's notices on the kit's notice grammar (owner 2026-10-25: "make notifications a lot
// better...stop using the box with one border colored... make much better primitives for stuff like this and more
// covering all edge cases"; the UI gauntlet's line 11). Every HUD notice, toast, card and banner is one plate ringed all
// round, its severity in its glyph's tone and a faint wash, never a stripe or a one-sided coloured border; and the
// centre alert follows the kit's rules: its severity named, an error assertive, a repeat counted, its time held through
// the game's pause.
import { created } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBus } from '../game/stateCore.ts';
import { initHud } from './hud.ts';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// --- the scan: the notice surfaces' rules carry no stripe and no one-sided coloured border ---
const NOTICE = /\.cot-(alert|sixth|aim-warning|kf|si-toast|si-card|ribbon|medal-toast|range-card|watch \.who|spec)\b|\.flight-console/;
const SOURCES = ['./hud.ts', './battleHudLayout.css', './shotInfo.ts', './hudKillRibbon.ts', './watchHud.ts', './provingRangeCard.ts',
  './aerialHud.css', './medalToast.ts', './spectatorSwitcher.ts'];
/** A one-sided border in a colour (neutral hairlines between a plate's own rows, var(--line-*), and transparent ones
 *  stay), or an inset bar on one edge. */
const ONE_EDGE = /border-(left|right|top|bottom)(-color)?\s*:\s*(?![^;}]*(var\(--line-|transparent|none|0[;}]))[^;}]+/;
// (a 1 px top bevel highlight is a plate's light, not a bar: a stripe is 2 px or more)
const STRIPE = /inset\s+-?([2-9]|\d{2,})(\.\d+)?px\s+0\s+0|inset\s+0\s+-?([2-9]|\d{2,})(\.\d+)?px(\s+0)?\s/;
let rules = 0;
for (const file of SOURCES) {
  const text = read(file);
  for (const block of text.split('}')) {
    const brace = block.lastIndexOf('{');
    if (brace < 0) continue;
    const selector = block.slice(0, brace).split('\n').at(-1);
    if (!NOTICE.test(selector)) continue;
    const declarations = block.slice(brace + 1);
    rules++;
    assert.doesNotMatch(declarations, ONE_EDGE, `${file} ${selector.trim().slice(-90)}: no one-sided coloured border`);
    assert.doesNotMatch(declarations, STRIPE, `${file} ${selector.trim().slice(-90)}: no stripe`);
  }
}
assert.ok(rules >= 60, `the scan reads the notices' rules (${rules})`);
// ...and no script sets one edge's colour inline (the shot card's outcome ink rode its right edge that way, gauntlet r2)
for (const file of SOURCES.filter((name) => name.endsWith('.ts'))) {
  assert.doesNotMatch(read(file), /style\.border(Left|Right|Top|Bottom)(Color)?\s*=/, `${file}: no inline one-edge border`);
}
// (the scan itself catches both forms)
assert.match('border-left:3px solid var(--tone)', ONE_EDGE); assert.match('box-shadow:inset 3px 0 0 var(--accent)', STRIPE);
assert.match('box-shadow:inset 0 -2px 0 var(--danger)', STRIPE); assert.doesNotMatch('box-shadow:inset 0 1px oklch(from var(--ink-1) l c h / .05)', STRIPE);
assert.doesNotMatch('border-top:1px solid var(--line-1)', ONE_EDGE); assert.doesNotMatch('border-left:2px solid transparent', ONE_EDGE);
// the player's own plates (the ribbon, the report's best) take the token: an accent ring, no stripe
const tokens = JSON.parse(read('./tokens/tokens.json'));
const edge = JSON.stringify(tokens).match(/"battle-edge-own":\{"value":"([^"]+)"/)?.[1];
assert.ok(edge && !STRIPE.test(`${edge} `), `battle-edge-own is a ring (${edge})`);
// the grammar itself: the tone by severity, the wash on a warning and an error
const hud = read('./hud.ts');
for (const [severity, tone] of [['success', 'ok'], ['warning', 'warn'], ['error', 'danger'], ['info', 'accent']]) {
  assert.match(hud, new RegExp(`\\.cot-hud \\[data-severity=${severity}\\]\\{--notice-tone:var\\(--text-${tone}\\);\\}`), `${severity} takes the ${tone} tone`);
}
assert.match(hud, /:is\(\.cot-sixth,\.cot-alert,\.cot-aim-warning\)\[data-severity=warning\]\{background:color-mix\(in srgb,var\(--text-warn\) 7%,var\(--hud-plate-strong\)\);\}/);
assert.match(hud, /:is\(\.cot-sixth,\.cot-alert,\.cot-aim-warning\)\[data-severity=error\]\{background:color-mix\(in srgb,var\(--text-danger\) 9%,var\(--hud-plate-strong\)\);\}/);
assert.doesNotMatch(hud, /--notice-edge/, 'the old edge variable is gone');

// --- the alert, live: severity, role, a repeat's count, the pause holding its time ---
const bus = createBus();
const realTimeout = globalThis.setTimeout, realClear = globalThis.clearTimeout;
const timers = new Map();
let serial = 0, now = 0;
globalThis.setTimeout = (fn, ms) => { const id = ++serial; timers.set(id, { fn, at: now + ms }); return id; };
globalThis.clearTimeout = (id) => { timers.delete(id); };
const realNow = performance.now.bind(performance);
performance.now = () => now;
const advance = (ms) => {
  now += ms;
  for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
};
try {
  const hudRuntime = initHud(bus);
  hudRuntime.setMode('battle');
  const alert = created.find((node) => node.classes.has('cot-alert'));
  const count = created.find((node) => node.classes.has('cot-alert-count'));
  bus.emit('ui:specialActionResult', { kind: 'hydropneumatic_aim', active: true });
  assert.equal(alert.classes.has('show'), true, 'the alert shows');
  assert.equal(alert.dataset.severity, 'success', 'an engaged suspension is a success');
  assert.equal(alert.getAttribute('role'), 'status', 'a success is polite');
  assert.equal(count.textContent, '', 'one alert carries no count');
  advance(1000);
  bus.emit('ui:specialActionResult', { kind: 'hydropneumatic_aim', active: true });
  assert.equal(count.textContent, '×2', 'a repeat while it shows raises its count');
  advance(2000);
  assert.equal(alert.classes.has('show'), true, 'a repeat restarts its time');
  bus.emit('ui:pause', { on: true });
  advance(10000);
  assert.equal(alert.classes.has('show'), true, 'the game\'s pause holds its time');
  bus.emit('ui:pause', { on: false });
  advance(500);
  assert.equal(alert.classes.has('show'), false, 'it leaves with the time it had left');
  bus.emit('ui:specialActionResult', { kind: 'hydropneumatic_aim', active: true });
  assert.equal(count.textContent, '', 'after it leaves, the count starts again');
  const sixth = created.find((node) => node.classes.has('cot-sixth'));
  assert.equal(sixth.dataset.severity, 'warning', 'detection is a warning');
} finally {
  globalThis.setTimeout = realTimeout; globalThis.clearTimeout = realClear; performance.now = realNow;
}

console.log(`hudNotices.selftest: ${rules} notice rules carry no stripe or one-sided coloured border; the alert names its severity, `
  + 'counts a repeat and holds its time through the pause');
