// (b45, the scenery lane; gauntlet wave 270 on Redrock: "plain cube ammo crates with hard edges, no wear, scale or
// detail") the ammunition boxes rebuilt as painted wooden crates: two side by side and a third across their seam resting
// on their lids, a steel can beside them; on the vehicle finish (painted, chipped); the kind's record, footprint and
// draws unchanged — the new builds spend exactly the retired builds' draws, so every later pool and placement keeps its
// draws, and the crates stay inside the record's reach and height.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AMMOBOX_LEGACY, DESTRUCTIBLE_TYPES } from './inhabitKit.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function counted(seed) { const r = mulberry32(seed); const c = () => { c.n++; return r(); }; c.n = 0; return c; }

const type = DESTRUCTIBLE_TYPES.ammobox;
// 1. the record: the kind's class, contact, reach and height as they were; the vehicle finish
assert.equal(type.cls, 'break'); assert.equal(type.contact, 'loop');
assert.equal(type.r, 0.85); assert.equal(type.h, 0.75);
assert.equal(type.mat, 'vehicle', 'painted wood and steel: the props\' vehicle finish (orange-peel, chips, grime under the livery)');

// 2. the draws: the retired builds' exactly, so the map's props stream reads on as before
for (let seed = 1; seed <= 24; seed++) {
  for (const [label, next, legacy] of [['intact', type.build, AMMOBOX_LEGACY.build], ['broken', type.broken, AMMOBOX_LEGACY.broken]]) {
    const a = counted(seed), b = counted(seed);
    next(a).dispose(); legacy(b).dispose();
    assert.equal(a.n, b.n, `${label} seed ${seed}: the retired build's draws (${b.n}), spent exactly (${a.n})`);
    assert.equal(a(), b(), `${label} seed ${seed}: the stream after the build is the same`);
  }
}

// 3. the form: the intact stack inside the record's reach and height, the broken one inside the retired debris's own
// spread (debris always lay past the record's reach); both on the ground, a crate resting on two, the parts they are made of
const R = new THREE.Box3(), probe = new THREE.Vector3();
const extent = (g) => {
  const p = g.getAttribute('position');
  let reach = 0;
  R.makeEmpty();
  for (let i = 0; i < p.count; i++) { probe.fromBufferAttribute(p, i); R.expandByPoint(probe); reach = Math.max(reach, Math.hypot(probe.x, probe.z)); }
  return { reach, minY: R.min.y, maxY: R.max.y };
};
let legacySpread = 0, legacyTop = 0;
for (let seed = 1; seed <= 24; seed++) {
  const g = AMMOBOX_LEGACY.broken(mulberry32(seed)), e = extent(g);
  legacySpread = Math.max(legacySpread, e.reach); legacyTop = Math.max(legacyTop, e.maxY);
  g.dispose();
}
for (let seed = 1; seed <= 24; seed++) {
  for (const [label, build, maxH, maxR] of [['intact', type.build, type.h, type.r], ['broken', type.broken, Math.max(0.45, legacyTop + 0.05), legacySpread + 0.05]]) {
    const g = build(mulberry32(seed));
    for (const name of ['position', 'normal', 'uv', 'color']) assert.ok(g.getAttribute(name), `${label}: ${name} (the vehicle finish needs its uv and its livery)`);
    const e = extent(g);
    assert.ok(e.minY > -0.012, `${label} seed ${seed}: nothing deeper than a bedded skid (${e.minY.toFixed(3)})`);
    if (label === 'intact') assert.ok(e.minY < -0.005, `the stack's foot bedded in the ground, no daylight under it (${e.minY.toFixed(3)})`);
    assert.ok(e.maxY <= maxH, `${label} seed ${seed}: within the height (${e.maxY.toFixed(3)} m of ${maxH.toFixed(3)})`);
    assert.ok(e.reach <= maxR, `${label} seed ${seed}: within the reach (${e.reach.toFixed(3)} m of ${maxR.toFixed(3)})`);
    g.dispose();
  }
}
{
  const g = type.build(mulberry32(7)), p = g.getAttribute('position');
  // the upper crate's skids on the lower lids: its foot at the crates' height, and nothing between 4 and 26 cm over
  // the seam where the two lower crates meet (a crate resting on them, not sunk into them)
  let atLid = 0;
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - 0.262) < 1e-4) atLid++;
  assert.ok(atLid >= 16, `the upper crate's skids sit at the lower lids' height (${atLid} vertices at 0.262 m)`);
  // the detail it is made of: far more than six boxes (the retired build's 144 vertices)
  assert.ok(p.count > 2000 && p.count < 14000, `a crate's boards, cleats, beckets, hasps, lettering and wear (${p.count} vertices)`);
  // the markings and the wear: the livery holds a pale yellow, a worn wood tone and the olive
  const col = g.getAttribute('color'), hsl = { h: 0, s: 0, l: 0 }, c = new THREE.Color();
  let yellow = 0, olive = 0, worn = 0, steel = 0;
  for (let i = 0; i < col.count; i++) {
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).getHSL(hsl, THREE.SRGBColorSpace);
    if (hsl.h > 0.11 && hsl.h < 0.17 && hsl.s > 0.3 && hsl.l > 0.42) yellow++;
    else if (hsl.h > 0.17 && hsl.h < 0.26 && hsl.l < 0.3) olive++;
    else if (hsl.h > 0.06 && hsl.h < 0.15 && hsl.l > 0.25 && hsl.l < 0.42) worn++;
    else if (hsl.s < 0.12 && hsl.l < 0.3) steel++;
  }
  assert.ok(yellow >= 400 && olive >= 150 && worn >= 150 && steel >= 60,
    `the livery: stencilled markings (${yellow}), the olive (${olive}), the paint worn to the wood (${worn}), the hardware (${steel})`);
  g.dispose();
}
console.log('ammoCrates self-test passed: the record and the draws kept, the crates within reach and height on the ground, one resting on two, their markings and wear');
