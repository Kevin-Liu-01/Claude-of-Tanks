// src/fx/combat/combatFx.selftest.mjs — the combat media layer's structure (combat-fx lane, 2026-10-05).
//
// The recipes are plain functions over a context, so this receipt drives them with a recording context and checks the
// STRUCTURE the critics asked for, on the shader's own motion law (context.ts mediaPositionAt): a ground impact throws
// a dense fountain that tops out at a few metres and falls back, clods that land on the ground under them, a surge
// that spreads low, and a crown that rises and drifts DOWNWIND; the muzzle gas burns only for its first frames and
// the overpressure cloud stalls within metres; a low bore over dust lifts a ring of dust and a high one does not; an
// ammo rack stays hot for most of a second, cooks off on its schedule and starts a column that widens as it climbs and
// leans downwind. Then the real layer (pools, sheets, craters) on the same seed twice: identical bytes, a reset that
// empties it, a clock rebase that keeps ages, the mobile tier's halved counts, and no Math.random anywhere.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { mulberry32 } from '../particles.ts';
import { groundBurst, waterBurst } from './impactBurst.ts';
import { muzzleBlast } from './muzzleBlast.ts';
import { COOK_OFF_S, columnPuff, killBlast } from './killBlast.ts';
import { classifySurface } from './surface.ts';
import { mediaPositionAt } from './context.ts';
import { makeMediaPuff, MEDIA_CARD_RADIUS } from './mediaPool.ts';
import { makeClodRecord, landClod } from './clods.ts';
import { createCombatFx, groundWindFromAloft } from './combatFx.ts';
import { bakeMediaAtlasSteps } from './mediaAtlas.ts';

const WIND = [2.2, 0, 1.1];
// a field: soil around the origin, sand east of x = 200, snow west of x = -200, a lake north of z = 200 (bog shore),
// a road along z = -100
const field = {
  getHeightAt: (x, z) => 0.002 * x,
  getWaterMaskAt: (x, z) => (z > 200 ? 1 : 0),
  getTrackSurfaceAt: (x, z) => (Math.abs(z + 100) < 14 ? 0 : x > 200 ? 2 : x < -200 ? 3 : 0),
  getGroundType: (x, z) => (Math.abs(z + 100) < 4.3 ? 'hard' : z > 190 && z <= 200 ? 'soft' : 'medium'),
  getNormalAt: () => ({ y: 1 }),
};
assert.equal(classifySurface(field, 0, 0), 'soil');
assert.equal(classifySurface(field, 300, 0), 'sand');
assert.equal(classifySurface(field, -300, 0), 'snow');
assert.equal(classifySurface(field, 0, 250), 'water');
assert.equal(classifySurface(field, 0, 195), 'mud');
assert.equal(classifySurface(field, 0, -100), 'rock', 'a road through fields throws grit');
assert.equal(classifySurface(field, 300, -100), 'sand', 'a road through the desert throws sand');
assert.equal(classifySurface(field, -300, -100), 'snow', 'a road through snow throws snow');

function recorder(seed, tier = 1) {
  const rng = mulberry32(seed);
  const rec = { earth: [], smoke: [], clods: [], craters: [], flash: 0, fire: 0, sparks: 0, jets: 0, pulses: [] };
  const C = {
    rand: rng,
    groundY: field.getHeightAt,
    field,
    earth: (m) => rec.earth.push({ ...m }),
    smoke: (m) => rec.smoke.push({ ...m }),
    clod: (k) => rec.clods.push({ ...k }),
    crater: (x, z, r, kind, explosive, bo) => rec.craters.push({ x, z, r, kind, explosive, bo }),
    flash: () => { rec.flash++; }, fire: () => { rec.fire++; }, sparks: () => { rec.sparks++; }, jet: () => { rec.jets++; },
    lightPulse: (x, y, z, k, delay) => rec.pulses.push(delay),
    distBoost: () => 1,
    tier,
    m: makeMediaPuff(), k: makeClodRecord(),
    bp: { pos: [0, 0, 0], vel: [0, 0, 0], col0: [0, 0, 0], col1: [0, 0, 0] },
    bs: { pos: [0, 0, 0], vel: [0, 0, 0], col: [0, 0, 0] },
    bj: { pos: [0, 0, 0], axis: [0, 0, 0], col: [0, 0, 0] },
  };
  return { C, rec };
}
const at = (m, t) => mediaPositionAt(m, WIND[0], WIND[2], t, [0, 0, 0]);
const peak = (m) => { let best = -Infinity; for (let t = 0; t <= m.life; t += 0.02) best = Math.max(best, at(m, t)[1]); return best; };

// --- ground impacts: a fountain, clods, a surge, a crown, a crater
const origin = { x: 0, y: 0, z: 0 };
const he = recorder(5126);
assert.equal(groundBurst(he.C, origin, 120, true), 'soil');
const kin = recorder(5126);
groundBurst(kin.C, origin, 120, false);
for (const { rec } of [he, kin]) {
  assert.equal(rec.craters.length, 1, 'every ground impact leaves a crater');
  for (const m of [...rec.earth, ...rec.smoke]) {
    for (const v of Object.values(m)) assert.ok(Number.isFinite(v), 'every puff field is finite');
    assert.ok(m.life > 0 && m.size1 > 0 && m.alpha > 0 && m.alpha <= 1);
  }
}
const fountain = (rec) => [...rec.earth, ...rec.smoke].filter((m) => m.grav <= -4);
const heFountain = fountain(he.rec), kinFountain = fountain(kin.rec);
assert.ok(heFountain.length >= 14, `an explosive burst throws a dense fountain (${heFountain.length})`);
const hePeak = Math.max(...heFountain.map(peak)), kinPeak = Math.max(...kinFountain.map(peak));
assert.ok(hePeak > 4.5 && hePeak < 12, `the 120 mm HE fountain tops out at a few metres (${hePeak.toFixed(1)} m)`);
assert.ok(kinPeak > 2 && kinPeak < hePeak, `a kinetic strike throws lower (${kinPeak.toFixed(1)} < ${hePeak.toFixed(1)} m)`);
for (const m of heFountain) {
  assert.ok(m.r0 < 0.06 && m.alpha >= 0.9 && m.fadeIn < 0.02, 'the fountain is born dense and dark, at once');
  assert.ok(at(m, m.life)[1] < peak(m) - 0.5, 'and falls back');
}
assert.ok(he.rec.clods.length >= 15, `clods are thrown (${he.rec.clods.length})`);
for (const k of he.rec.clods) {
  const s = (1 - Math.exp(-0.35 * k.landS)) / 0.35;
  const y = k.py + k.vy * s - 4.9 * k.landS * k.landS;
  assert.ok(Math.abs(y - (k.restY + k.scale * 0.35)) < 0.25, 'a clod lands on the ground under its landing point');
  assert.ok(k.life > k.landS, 'and rests there before it fades');
}
const landing = he.rec.earth.filter((m) => m.birthOffset > 0.3 && m.size0 < 0.6);
assert.ok(landing.length >= 3, `landing clods kick secondary puffs at their landing time (${landing.length})`);
const surge = he.rec.earth.filter((m) => m.flatten < 0.7 && m.grav === 0);
assert.ok(surge.length >= 8, 'a base surge');
for (const m of surge) {
  const p = at(m, 0.5);
  assert.ok(Math.hypot(p[0] - m.px, p[2] - m.pz) > 1.5 && p[1] - m.py < 1.5,
    `the surge runs out low along the ground (${Math.hypot(p[0] - m.px, p[2] - m.pz).toFixed(2)} m out, ${(p[1] - m.py).toFixed(2)} m up, flat ${m.flatten})`);
}
const crown = he.rec.earth.filter((m) => m.birthOffset >= 0.1 && m.size1 > 4 && m.flatten > 0.8);
assert.ok(crown.length >= 8, `a crown (${crown.length})`);
let down = 0, rise = 0;
for (const m of crown) {
  const a = at(m, 1.0), b = at(m, 4.0);
  down += ((b[0] - a[0]) * WIND[0] + (b[2] - a[2]) * WIND[2]) / Math.hypot(WIND[0], WIND[2]);
  rise += b[1] - a[1];
}
assert.ok(down / crown.length > 3, `the crown drifts downwind (${(down / crown.length).toFixed(1)} m in 3 s)`);
assert.ok(rise / crown.length > 1, `and rises (${(rise / crown.length).toFixed(1)} m)`);
assert.ok(he.rec.smoke.some((m) => m.heat > 0.5) && he.rec.flash >= 2 && he.rec.fire >= 3, 'HE: flash, fireball, glowing residue');
assert.ok(kin.rec.smoke.every((m) => m.heat === 0) && kin.rec.fire === 0, 'a kinetic strike has no fireball');

// surfaces set colour and mass
const look = (x, z) => { const r = recorder(77); groundBurst(r.C, { x, y: 0, z }, 120, true); return r.rec; };
const sand = look(300, 0), snow = look(-300, 0), mud = look(0, 195);
const lum = (m) => m.r0 * 0.3 + m.g0 * 0.6 + m.b0 * 0.1;
const avgLum = (arr) => arr.reduce((a, m) => a + lum(m), 0) / arr.length;
assert.ok(avgLum(fountain(sand)) > avgLum(heFountain) * 3, 'sand bursts pale');
assert.ok(avgLum(fountain(snow)) > avgLum(fountain(sand)), 'snow bursts white');
assert.ok(fountain(snow).some((m) => lum(m) < 0.08), 'an explosive burst throws dark soil through the snow');
assert.ok(mud.clods.every((k) => k.wet === 1) && mud.earth.length < he.rec.earth.length, 'mud: wet clods, little dust');
assert.ok(sand.clods.length < he.rec.clods.length, 'sand throws few clods');
assert.equal(sand.craters[0].kind, 1); assert.equal(snow.craters[0].kind, 2); assert.equal(mud.craters[0].kind, 3);

// water: a column that collapses, a crown, a mist; no clods, no crater
const wat = recorder(31);
groundBurst(wat.C, { x: 0, y: 0, z: 250 }, 120, true);
assert.equal(wat.rec.clods.length, 0); assert.equal(wat.rec.craters.length, 0);
const column = [...wat.rec.earth, ...wat.rec.smoke].filter((m) => m.grav < -5 && m.vy > 15);
assert.ok(column.length >= 10, 'a water column');
const colPeak = Math.max(...column.map(peak));
assert.ok(colPeak > 7 && colPeak < 22, `the column climbs high (${colPeak.toFixed(1)} m) and falls back`);
const wat2 = recorder(31);
waterBurst(wat2.C, { x: 0, y: 0, z: 250 }, 120, true, 0, 0.3);
assert.equal(wat2.rec.earth.length, wat.rec.earth.length, 'waterBurst is the water branch of groundBurst');

// --- muzzle blast
const dir = new THREE.Vector3(1, 0, 0);
const blast = (y, scoped = false) => {
  const r = recorder(9);
  muzzleBlast(r.C, { pos: { x: 0, y, z: 0 }, dir, caliberMm: 120, birthOffset: 0, scoped, nearAtt: 1 });
  return r.rec;
};
const low = blast(2.3), high = blast(7), scoped = blast(2.3, true);
const gas = low.smoke.filter((m) => m.heat >= 0.9);
assert.ok(gas.length >= 4, 'the propellant gas burns as it leaves the bore');
for (const m of gas) assert.ok(m.heat * Math.exp(-m.cool * 0.25) < 0.05, 'only for its first frames');
const shell = low.smoke.filter((m) => m.drag >= 6);
assert.ok(shell.length >= 8, 'an overpressure shell');
for (const m of shell) {
  const p1 = at(m, 0.6), p2 = at(m, 1.6);
  assert.ok(Math.hypot(p1[0] - m.px, p1[2] - m.pz) < 6, 'stalls within metres');
  assert.ok(m.size1 > m.size0 * 3, 'keeps expanding as it thins');
  assert.ok(((p2[0] - p1[0]) * WIND[0] + (p2[2] - p1[2]) * WIND[2]) > 0, 'then drifts with the wind');
}
const leak = low.smoke.filter((m) => m.birthOffset > 0.1);
assert.ok(leak.length >= 4, 'the barrel keeps smoking after the shot');
assert.ok(low.earth.length >= 12, `a low bore lifts dust off the ground (${low.earth.length})`);
assert.equal(high.earth.length, 0, 'a bore 7 m up lifts none');
assert.ok(scoped.earth.length === 0 && scoped.smoke.every((m) => m.heat === 0), 'the scoped own gun keeps only a thin haze');
const sandBlast = recorder(9);
muzzleBlast(sandBlast.C, { pos: { x: 300, y: 2.9, z: 0 }, dir, caliberMm: 120, birthOffset: 0, scoped: false, nearAtt: 1 });
assert.ok(sandBlast.rec.earth.length > low.earth.length, 'sand lifts more dust than soil');

// --- kills
const rackKill = recorder(13);
killBlast(rackKill.C, { x: 0, y: 0, z: 0 }, 'ammorack', 0);
const shotKill = recorder(13);
killBlast(shotKill.C, { x: 0, y: 0, z: 0 }, 'shot', 0);
const heatAt = (m, t) => m.heat * Math.exp(-m.cool * t);
const core = rackKill.rec.smoke.filter((m) => m.heat > 1);
assert.ok(core.length >= 6, 'a white-hot fireball body');
assert.ok(core.every((m) => heatAt(m, 0.67) > 0.6), 'that still burns bright two thirds of a second in');
assert.ok(core.every((m) => heatAt(m, 3.0) < 0.25), 'and has cooled to soot by three seconds');
const coreTop = Math.max(...core.map((m) => at(m, 2)[1]));
assert.ok(coreTop > 8, `the fireball climbs as one buoyant mass (${coreTop.toFixed(1)} m at 2 s)`);
assert.equal(rackKill.rec.pulses.length, COOK_OFF_S.length, 'an ammo rack cooks off on its schedule');
assert.equal(shotKill.rec.pulses.length, 0, 'a plain kill does not');
assert.ok(rackKill.rec.smoke.length > shotKill.rec.smoke.length, 'an ammo rack is the bigger death');
const col = recorder(2);
for (let i = 0; i < 60; i++) columnPuff(col.C, 0, 0, 0, 1, 1.1, -i * 0.05);
let leanSum = 0, riseSum = 0;
for (const m of col.rec.smoke) {
  const p = at(m, 6);
  leanSum += ((p[0] - m.px) * WIND[0] + (p[2] - m.pz) * WIND[2]) / Math.hypot(WIND[0], WIND[2]);
  riseSum += p[1] - m.py;
  assert.ok(m.size1 > m.size0 * 3, 'column smoke swells as it climbs (the column widens with height)');
}
assert.ok(riseSum / col.rec.smoke.length > 12, `the column climbs (${(riseSum / col.rec.smoke.length).toFixed(1)} m in 6 s)`);
assert.ok(leanSum / col.rec.smoke.length > 6, `and leans downwind (${(leanSum / col.rec.smoke.length).toFixed(1)} m)`);

// --- mobile tier halves the counts
const mob = recorder(5126, 0.5);
groundBurst(mob.C, origin, 120, true);
const ratio = (mob.rec.earth.length + mob.rec.clods.length) / (he.rec.earth.length + he.rec.clods.length);
assert.ok(ratio > 0.35 && ratio < 0.65, `the mobile tier draws about half (${ratio.toFixed(2)})`);

// --- the real layer: two runs on the same seed are byte-identical; reset empties; rebase keeps ages
const sun = new THREE.Vector3(0.5, 0.6, -0.6).normalize();
const scene = { userData: { sunDirWorld: sun, lightRig: { sunIntensity: 4.5, sunColor: new THREE.Color(1, 0.96, 0.9),
  hemiIntensity: 1.1, hemiSky: new THREE.Color(0.6, 0.7, 0.9), hemiGround: new THREE.Color(0.3, 0.27, 0.2) },
volumetricClouds: { currentPreset: { windDirRad: 0.4, windSpeed: 6 } } } };
function layer(seed, tier = 'desktop') {
  let clock = 0;
  const rng = mulberry32(seed);
  const pulses = [];
  const fx = createCombatFx({
    seed, scene, field, rand: () => rng(), now: () => clock, tier,
    soft: { uSceneDepth: { value: null }, uSoftViewport: { value: new THREE.Vector2(1, 1) }, uCameraNear: { value: 0.5 },
      uCameraFar: { value: 4000 } },
    emitBattle: { flash() {}, fire() {}, sparks() {}, jet() {} },
    lightPulse: (...a) => pulses.push(a), distBoost: () => 1, explosionLight: null,
  });
  return { fx, tick: (dt) => { clock += dt; fx.update(); }, get clock() { return clock; } };
}
const bytes = (fx) => {
  const out = [];
  fx.group.traverse((o) => {
    const g = o.geometry;
    if (!g) return;
    for (const [name, attr] of Object.entries(g.attributes)) if (attr.isInstancedBufferAttribute || name === 'aInfo') out.push(Buffer.from(attr.array.buffer).toString('base64'));
  });
  return out.join('|');
};
const runs = [layer(5126), layer(5126)];
for (const L of runs) {
  L.fx.warmTextures();
  L.tick(1 / 60);
  L.fx.groundImpact({ x: 0, y: 0, z: 0 }, 120, true);
  L.fx.muzzleBlast({ pos: { x: 5, y: 2.3, z: 0 }, dir, caliberMm: 120, birthOffset: 0, scoped: false, nearAtt: 1 });
  L.fx.kill({ x: -10, y: 0, z: 4 }, 'ammorack');
  for (let i = 0; i < 40; i++) { L.fx.columnPuff(-10, 0, 4, 1, 1.1); L.tick(1 / 60); }
}
assert.equal(bytes(runs[0].fx), bytes(runs[1].fx), 'the same seed and timeline write the same bytes');
const st = runs[0].fx.stats();
assert.ok(st.baked && st.earth > 50 && st.smoke > 50 && st.clods > 10, `the layer drew (${JSON.stringify(st)})`);
assert.ok(Math.abs(Math.hypot(st.wind[0], st.wind[2]) - groundWindFromAloft(6)) < 1e-6, 'the wind is the cloud layer\'s, slowed to the ground');
assert.ok(Math.abs(Math.atan2(st.wind[2], st.wind[0]) - 0.4) < 1e-6, 'blowing the way the clouds drift');
assert.ok(runs[0].fx.isActive(), 'the late pass runs while media live');
scene.userData.surfaceWind = new THREE.Vector3(-1.5, 0, 2.5);
runs[1].tick(1 / 60);
assert.deepEqual(runs[1].fx.stats().wind, [-1.5, 0, 2.5], 'a published surface wind takes precedence over the clouds');
delete scene.userData.surfaceWind;
const birthsBefore = [];
runs[0].fx.group.traverse((o) => { if (o.geometry?.attributes?.aPB) birthsBefore.push(o.geometry.attributes.aPB.array[3]); });
runs[0].fx.shiftTime(100);
const birthsAfter = [];
runs[0].fx.group.traverse((o) => { if (o.geometry?.attributes?.aPB) birthsAfter.push(o.geometry.attributes.aPB.array[3]); });
birthsBefore.forEach((b, i) => assert.ok(Math.abs(birthsAfter[i] - (b + 100)) < 1e-3, 'a clock rebase keeps every age'));
runs[0].fx.resetAll();
const empty = runs[0].fx.stats();
assert.ok(empty.earth === 0 && empty.smoke === 0 && empty.clods === 0 && !runs[0].fx.isActive(), 'reset empties the layer');
const mobileLayer = layer(5126, 'mobile');
mobileLayer.fx.groundImpact({ x: 0, y: 0, z: 0 }, 120, true);
assert.ok(mobileLayer.fx.stats().earth < runs[1].fx.stats().earth, 'the mobile layer draws less');

// --- the sheets are deterministic and lobed (coverage in the middle, a transparent border)
const sheet = (style) => { const g = bakeMediaAtlasSteps(style, 5000); let r = g.next(); while (!r.done) r = g.next(); return r.value.image.data; };
const billow = sheet('billow');
assert.deepEqual(sheet('billow'), billow, 'the billow sheet bakes byte-identically');
const alphaAt = (data, x, y) => data[(y * 512 + x) * 4 + 3];
// every frame's content stays inside the card's octagon (mediaPool.ts MEDIA_CARD_RADIUS)
for (const [style, data] of [['billow', billow], ['wisp', sheet('wisp')]]) {
  let reach = 0;
  for (let f = 0; f < 16; f++) {
    const ox = (f % 4) * 128, oy = Math.floor(f / 4) * 128;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      if (alphaAt(data, ox + x, oy + y) <= 2) continue;
      reach = Math.max(reach, Math.hypot((x + 0.5) / 128 - 0.5, (y + 0.5) / 128 - 0.5));
    }
  }
  assert.ok(reach < MEDIA_CARD_RADIUS - 0.01, `${style}: the sheet's content stays inside the card (${reach.toFixed(3)})`);
}
assert.ok(alphaAt(billow, 64, 64) > 100 && alphaAt(billow, 0, 0) === 0 && alphaAt(billow, 127, 64) === 0,
  'frame 0: dense at its centre, clear at its border');

// --- no wall clock or Math.random in the layer
for (const name of readdirSync(new URL('.', import.meta.url))) {
  if (!name.endsWith('.ts')) continue;
  const src = readFileSync(new URL(name, import.meta.url), 'utf8');
  assert.ok(!/Math\.random|Date\.now|performance\.now/.test(src), `${name}: seeded and clock-free`);
}
console.log(`combatFx.selftest: fountain ${hePeak.toFixed(1)} m (HE) / ${kinPeak.toFixed(1)} m (AP), crown drift ${(down / crown.length).toFixed(1)} m, `
  + `column lean ${(leanSum / col.rec.smoke.length).toFixed(1)} m; surfaces, muzzle, kill, determinism, reset, rebase, tier PASS`);
