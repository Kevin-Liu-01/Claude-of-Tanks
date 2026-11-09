// strikeLooks.selftest.mjs — what a round throws off what it struck (impact-materials-269; Main 2026-11-04: "sparks only
// where steel was struck"). The table (strikeLooks.ts) has a look for every plate material and sparks on exactly the
// materials the audio rings steel on (audio/impactMaterials.ts); through a recording blast context, armour's hit is
// drawn as before, a rubber skirt's and a rack's throw their own cold chips and face, the running gear throws the
// ground it carries in that ground's colour, and a graze sprays its ground forward and low where a plunge stands it up;
// on the real FX runtime a ricochet off armour sparks, one off a rubber skirt or a rack does not, a track's sparks less.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { PLATE_MATERIALS } from '../sim/plateMaterial.ts';
import { MATERIAL_SOUNDS } from '../audio/impactMaterials.ts';
import { STRIKE_LOOKS, strikeLookOf } from './strikeLooks.ts';
import { armorHit, kineticStrike, partSpray } from './blastRecipes.ts';
import { surfaceLook } from './mapPalette.ts';
import { createFx } from './effects.ts';

// ---- the table: every material, sparks where the audio rings steel, and non-steel says what flies
for (const material of PLATE_MATERIALS) {
  const look = STRIKE_LOOKS[material];
  assert.ok(look, `${material} has a look`);
  assert.equal(look.sparks > 0, MATERIAL_SOUNDS[material].steel, `${material}: sparks exactly where the audio rings steel`);
  if (look.sparks === 0) assert.ok(look.chips && look.puff, `${material}: no steel struck, so it names its own chips and face`);
  assert.ok(look.ground >= 0 && look.ground <= 1 && look.chipK > 0);
}
assert.equal(strikeLookOf(undefined), STRIKE_LOOKS.armour, "an older peer's event names no material: armour, as before");
assert.equal(strikeLookOf('kevlar'), STRIKE_LOOKS.armour, 'an unknown name: armour');
assert.ok(STRIKE_LOOKS.trackLinks.ground > 0 && STRIKE_LOOKS.rubberSkirt.ground > 0 && STRIKE_LOOKS.armour.ground === 0,
  'the running gear and its skirt carry the ground; a hull plate does not');

// ---- the media recipes, through a recording blast context (seeded; every chunk and body kept)
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function recording(seed = 7) {
  const rng = mulberry(seed);
  const rec = { media: [], chunks: [], sparks: 0, flash: 0 };
  const scratch = () => new Proxy({}, { get(t, key) { if (typeof key === 'symbol' || key === 'toJSON' || key === 'then') return t[key];
    if (!(key in t)) t[key] = [0, 0, 0, 0]; return t[key]; } });
  const C = { tier: 1, m: scratch(), k: scratch(), lp: scratch(), ls: scratch(), lj: scratch(), rand: rng, groundY: () => 0, distBoost: () => 1,
    media: (m) => rec.media.push({ vx: m.vx, vy: m.vy, vz: m.vz, r0: m.r0, g0: m.g0, b0: m.b0, r1: m.r1, g1: m.g1, b1: m.b1 }),
    chunk: (k) => rec.chunks.push({ shape: k.shape, r: k.r, g: k.g, b: k.b, heat: k.heat }), sparks: () => rec.sparks++,
    flash: () => rec.flash++, fire: () => {}, jet: () => {}, shockRing: () => {}, lightPulse: () => {}, glow: () => {}, crowd: () => 0 };
  return { C, rec };
}
const hit = (kind, look) => { const r = recording(); armorHit(r.C, { x: 0, y: 1, z: 0, nx: 1, ny: 0, nz: 0, caliberMm: 120, kind, ...(look ? { look } : {}) }); return r.rec; };
for (const kind of ['pen', 'nonpen', 'ricochet', 'spaced', 'era']) {
  assert.deepEqual(hit(kind, STRIKE_LOOKS.armour), hit(kind, null), `armour's ${kind} is drawn exactly as before`);
}
for (const material of ['rubberSkirt', 'stowage']) {
  const look = STRIKE_LOOKS[material];
  for (const kind of ['nonpen', 'ricochet', 'spaced']) {
    const r = hit(kind, look);
    assert.ok(r.chunks.length > 0, `${material} ${kind}: its own chips fly`);
    assert.ok(r.chunks.every((c) => c.heat === 0), `${material} ${kind}: nothing hot where no steel was struck`);
    const shapes = new Set(look.chips.map((c) => c.shape));
    assert.ok(r.chunks.every((c) => shapes.has(c.shape)), `${material} ${kind}: ${[...shapes]} pieces, no steel shards`);
  }
}
assert.equal(hit('ricochet', STRIKE_LOOKS.armour).chunks.length, 0, 'a glance off armour throws no chips (as before)');

// the running gear throws the ground it carries, in that ground's colour
const closeTo = (a, b) => Math.abs(a - b) < 1e-6;
for (const surface of ['snow', 'sand', 'mud', 'soil']) {
  const r = recording();
  partSpray(r.C, { x: 0, y: 0.5, z: 0, nx: 1, ny: 0, nz: 0, caliberMm: 120, surface, k: 1 });
  const L = surfaceLook(surface);
  assert.ok(r.rec.media.length > 0 && r.rec.media.every((b) => closeTo(b.r1, L.dust[0]) && closeTo(b.b1, L.dust[2])),
    `a track hit on ${surface} throws ${surface}'s dust`);
  if (L.chunkK > 0) assert.ok(r.rec.chunks.length > 0 && r.rec.chunks.every((c) => c.shape === 'clod' && c.heat === 0), `and its clods (${surface})`);
}

// a graze sprays forward and low; a plunge stands its spurt up
const strike = (graze, surface) => {
  const r = recording();
  kineticStrike(r.C, { x: 0, y: 0, z: 0, dx: 0, dy: -0.05, dz: 1, caliberMm: 120, munition: 'kinetic', surface, graze });
  return r.rec;
};
const steepness = (rec) => { const spray = rec.media.filter((b) => Math.hypot(b.vx, b.vz) + Math.abs(b.vy) > 4);
  return spray.reduce((a, b) => a + b.vy / Math.max(1e-6, Math.hypot(b.vx, b.vz)), 0) / spray.length; };
for (const surface of ['snow', 'sand', 'soil', 'water']) {
  const skip = strike(true, surface), plunge = strike(false, surface);
  assert.ok(skip.media.length > 0, `a graze on ${surface} throws its ground`);
  const L = surfaceLook(surface);
  assert.ok(skip.media.every((b) => closeTo(b.r1, L.dust[0])), `in ${surface}'s colour`);
  if (surface !== 'water') {
    assert.ok(steepness(skip) < 0.5 && steepness(plunge) > 1, `a graze on ${surface} sprays low (rise/run ${steepness(skip).toFixed(2)}), a plunge stands up (${steepness(plunge).toFixed(2)})`);
    assert.ok(skip.media.filter((b) => Math.abs(b.vy) < Math.hypot(b.vx, b.vz)).every((b) => b.vz > 0), 'forward, along the round\'s path');
  }
}

// ---- the real runtime: the spark streaks a ricochet draws, by what it struck
function sparksOf(material) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
  camera.position.set(0, 3, -30); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(true);
  const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
    { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) }, { seed: 5 });
  const pools = fx.group.getObjectByName('fx-particles');
  assert.equal(pools?.children.length, 10, 'the particle pools (particles.ts order: smoke, fire, billow, psmoke, screen, dust, flash, jet, sparks, debris)');
  const sparks = pools.children[8].geometry;
  const before = sparks.instanceCount;
  fx.impact('ricochet', new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0), 120, material);
  const n = sparks.instanceCount - before;
  fx.resetAll();
  return n;
}
const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };
const armour = sparksOf(undefined), rubber = sparksOf('rubberSkirt'), rack = sparksOf('stowage'), track = sparksOf('trackLinks');
assert.ok(armour > 0, `a ricochet off armour sparks (${armour})`);
assert.equal(sparksOf('armour'), armour, 'named armour draws as an unnamed hit does');
assert.equal(rubber, 0, 'a ricochet off a rubber skirt throws no spark');
assert.equal(rack, 0, 'nor off a stowage rack');
assert.ok(track > 0 && track < armour, `the track links spark, less than a plate (${track} < ${armour})`);
console.log(`strikeLooks.selftest: ${PLATE_MATERIALS.length} materials, sparks where the audio rings steel; armour drawn as before; `
  + `rubber and racks cold; the running gear throws its ground; grazes spray low; ricochet sparks armour ${armour}, track ${track}, rubber 0, rack 0 PASS`);
process.exit(0);
