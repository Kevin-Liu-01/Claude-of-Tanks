// colorVision.selftest.mjs — the Custom team-colour check (brand-ui SPEC 4.4, 4.5, 4.6; PLAN BUI-F9).
// Copyright © 2026 Kevin B. Liu.
//
// 1. The runtime maths is the token receipt's: WCAG contrast and Machado 2009 / CIE76 ΔE equal tools/gen-tokens.mjs on
//    a seeded sample of colours in every vision view.
// 2. The floors are SPEC 4.5's (own~enemy 40, enemy~squad 25, own~squad 12), the shape-coded pairs' 12, and SPEC 4.4's
//    4.5:1 text on every surface and the HUD plate over white.
// 3. The default pair passes; SPEC 4.5's "today's team pair" (#7ee87e vs #f05a5a, deutan 19.3) and the other failures
//    are refused with the failing check and view named, worst first; anything but #rrggbb fails outright.
import assert from 'node:assert/strict';
import { VISION_VIEWS as TOOL_VIEWS, contrast as toolContrast, deltaE as toolDeltaE, hexToRgb } from '../../tools/gen-tokens.mjs';
import { CUSTOM_TEAM_FLOORS, VISION_VIEWS, checkCustomTeamColours, contrastRatio, deltaE, parseHex } from './colorVision.ts';
import { TOKENS } from './tokens/tokens.ts';

assert.deepEqual([...VISION_VIEWS], [...TOOL_VIEWS], 'the same four views as the token receipt');
let seed = 0x9e3779b9;
const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const rgb = () => [0, 0, 0].map(() => Math.floor(rand() * 256));
let samples = 0;
for (let i = 0; i < 400; i++) {
  const a = rgb();
  const b = rgb();
  assert.ok(Math.abs(contrastRatio(a, b) - toolContrast(a, b)) < 1e-12, `contrast ${a} ${b}`);
  for (const view of VISION_VIEWS) {
    assert.ok(Math.abs(deltaE(view, a, b) - toolDeltaE(view, a, b)) < 1e-9, `ΔE ${view} ${a} ${b}`);
    samples++;
  }
}
assert.deepEqual(parseHex('#57B8FF'), hexToRgb('#57b8ff'));
for (const bad of ['57b8ff', '#57b8f', '#57b8ffaa', 'blue', null, 7]) assert.equal(parseHex(bad), null, `not a colour: ${bad}`);

assert.deepEqual({ ...CUSTOM_TEAM_FLOORS }, { ownEnemy: 40, enemySquad: 25, ownSquad: 12, shape: 12, text: 4.5 },
  'SPEC 4.5 floors for the team pairs, 12 for the shape-coded pairs, SPEC 4.4 4.5:1 for text');

const defaults = checkCustomTeamColours(TOKENS['team-own'], TOKENS['team-enemy']);
assert.equal(defaults.ok, true, `the default team colours pass (${defaults.failures.map((f) => `${f.check} ${f.view} ${f.value.toFixed(1)}`).join(', ')})`);
assert.deepEqual(defaults.failures, []);

const old = checkCustomTeamColours('#7ee87e', '#f05a5a');
assert.equal(old.ok, false, "SPEC 4.5's previous team pair is refused");
const deutan = old.failures.find((f) => f.check === 'own~enemy' && f.view === 'deutan');
assert.ok(deutan && Math.abs(deutan.value - 19.3) < 0.05, `own~enemy deutan is SPEC 4.5's 19.3 (${deutan?.value})`);
for (let i = 1; i < old.failures.length; i++) {
  const [p, q] = [old.failures[i - 1], old.failures[i]];
  assert.ok(p.value / p.floor <= q.value / q.floor, 'failures are listed worst margin first');
}

const lowContrast = checkCustomTeamColours('#1d3f8a', TOKENS['team-enemy']);
assert.ok(lowContrast.failures.some((f) => f.check === 'own on surface-page' && f.view === 'text'), 'a dark ally colour fails as text on the page');
const sameHue = checkCustomTeamColours('#ff5a4e', '#ff6a5e');
assert.ok(sameHue.failures.some((f) => f.check === 'own~enemy' && f.view === 'normal'), 'two near colours fail in normal vision');
const accentLike = checkCustomTeamColours(TOKENS['team-own'], '#f0a030');
assert.ok(accentLike.failures.some((f) => f.check === 'enemy~accent'), 'an enemy in the accent amber fails the shape-coded floor');
for (const [own, enemy, side] of [['blue', '#ff5a4e', 'own colour'], ['#57b8ff', '', 'enemy colour']]) {
  const r = checkCustomTeamColours(own, enemy);
  assert.equal(r.ok, false);
  assert.equal(r.failures[0].check, side, `a malformed ${side} fails outright`);
}

console.log(`colour vision: ${samples} ΔE and ${samples / VISION_VIEWS.length} contrast samples equal the token receipt; default pair passes; `
  + `SPEC 4.5's old pair refused (own~enemy deutan ${deutan.value.toFixed(1)}), ${old.failures.length} failures named`);
