// trailCadence.selftest.mjs — EF.01 (the owner, 2026-10-12: the dust and smoke behind tanks "separated into little clouds
// separated from each other, instead of being continuous. like how it was before"). The media tier's track skirt and
// exhaust are laid by the distance their source travels (trailCadence), sized so neighbours overlap. This receipt drives
// a hull through the battle's own emission law (battlePresentationRuntime emitDust/emitExhaust: the 60 Hz fx ticks, at
// most two a frame, a dust call every 0.45-0.7 m) at several frame rates, and measures the trail as a side camera sees
// it: the share of the trail's length that some body covers, and how even its opacity is. Deploy 208's coin toss per
// call (07512bb07, ac8ae8065), transcribed below with its recipes, is measured the same way.
import assert from 'node:assert/strict';
import { createTrailCadence, TRAIL_MAX_BIRTHS } from './trailCadence.ts';
import { trackSkirt, trackSkirtSpacing, exhaustPuff, exhaustSpacing } from './blastRecipes.ts';
import { SURFACE_LOOKS } from './surfaceLooks.ts';
import { makeVolumePuff, volumePositionAt } from './volumeMedia.ts';
import { mulberry32 } from './particles.ts';

// ---- 1. the cadence ------------------------------------------------------------------------------------------------
{
  const c = createTrailCadence(8);
  // a source first seen raises one body where it stands
  assert.equal(c.step(0, 0, 0, 0, 2, 0, 3), 1, 'a new source starts its trail');
  // 0.5 m calls at 2 m spacing: a body every fourth call, placed exactly 2 m apart
  const placed = [0];
  for (let i = 1; i <= 40; i++) {
    const n = c.step(0, 0, i * 0.5, i / 30, 2, 0, 3);
    for (let b = 0; b < n; b++) placed.push(c.births[b * 3 + 1]);
  }
  for (let i = 1; i < placed.length; i++) assert.ok(Math.abs(placed[i] - placed[i - 1] - 2) < 1e-4, `even spacing (${placed[i] - placed[i - 1]})`);
  // a long stride (a slow frame): the bodies fall along the segment, oldest first, each born back/speed earlier
  const d = createTrailCadence(8);
  d.step(0, 0, 0, 0, 0.4, 0, TRAIL_MAX_BIRTHS);
  const n = d.step(0, 0, 1.5, 0.1, 0.4, 0, TRAIL_MAX_BIRTHS);
  assert.equal(n, 3);
  assert.deepEqual([...d.births.slice(0, 9)].map((v) => +v.toFixed(4)), [0, 0.4, 0.0733, 0, 0.8, 0.0467, 0, 1.2, 0.02],
    'placed back along the stride and born that much earlier');
  // the two tracks of a narrow hull (2 m apart) keep their own slots; a third source far away takes its own
  const t = createTrailCadence(8);
  let left = 0, right = 0;
  for (let i = 0; i <= 60; i++) {
    left += t.step(0, -1, i * 0.6, i / 60, 1.2, 0, 3);
    right += t.step(0, 1, i * 0.6, i / 60, 1.2, 0, 3);
    t.step(1, 50, 0, i / 60, 1, 0.5, 3);
  }
  assert.equal(left, 31, 'left track: one body per 1.2 m of its 36 m');
  assert.equal(right, 31, 'right track: likewise, never matched to its neighbour');
  assert.equal(t.active(1), 3);
  // at rest a source breathes at its rate; a stall's catch-up is capped, never queued
  const r = createTrailCadence(4);
  let rest = r.step(1, 0, 0, 0, 1, 0.25, 3);
  for (let i = 1; i <= 60; i++) rest += r.step(1, 0, 0, i / 60, 1, 0.25, 3);
  assert.equal(rest, 5, 'one body at once, then one every 0.25 s for a second');
  const s = createTrailCadence(4);
  s.step(0, 0, 0, 0, 1, 0, 3);
  assert.equal(s.step(0, 0, 1.2, 0.3, 1, 0, 3), 1);
  assert.equal(s.step(0, 0, 1.5, 0.35, 1, 0, 3), 0, 'no burst after a stride');
  s.reset();
  assert.equal(s.active(0.35), 0, 'reset forgets every source');
}

// ---- 2. the trail a side camera sees -------------------------------------------------------------------------------
const WIND = [1.2, 0.8];
function ctxFor(seed, sink) {
  return {
    rand: mulberry32(seed), groundY: () => 0, media: (p) => sink.push({ ...p, birth: sink.now + p.birthOffset }),
    chunk() {}, flash() {}, fire() {}, sparks() {}, jet() {}, shockRing() {}, lightPulse() {}, glow() {},
    distBoost: () => 1, tier: 1, m: makeVolumePuff(),
  };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _rec = new Float32Array(32), _out = [0, 0, 0];
/** coverage and opacity along u (the drive axis, z) from `from` back to `to` (m), as a camera off the flank sees it */
function sideView(bodies, now, from, to) {
  const live = [];
  for (const b of bodies) {
    const age = now - b.birth;
    if (age < 0 || age >= b.life) continue;
    const t = age / b.life;
    _rec[0] = b.x; _rec[1] = b.y; _rec[2] = b.z; _rec[4] = b.vx; _rec[5] = b.vy; _rec[6] = b.vz;
    _rec[8] = b.drag; _rec[9] = b.rise; _rec[10] = b.windK; _rec[11] = b.grav;
    volumePositionAt(_rec, 0, WIND[0], WIND[1], age, _out);
    const size = b.size0 + (b.size1 - b.size0) * (1 - Math.pow(1 - t, Math.max(b.growExp, 0.3)));
    // the burst/billow flipbooks' visible core is ~0.7 of the card; the fade erodes it from the edges in
    const fade = smooth(b.fadeOut, 1, t);
    const hw = 0.5 * size * Math.max(b.aspect || 1, 0.25) * 0.7 * (1 - 0.7 * fade);
    const a = b.density * (1 - fade * fade) * smooth(0, Math.max(b.fadeIn, 1e-3), age);
    if (a > 0.02 && hw > 0.05) live.push([_out[2], hw, a]);
  }
  let covered = 0, n = 0, sum = 0, sum2 = 0;
  for (let u = from; u >= to; u -= 0.1) {
    let clear = 1, hit = false;
    for (const [cz, hw, a] of live) {
      const q = (u - cz) / hw;
      if (q * q >= 1) continue;
      hit = true; clear *= 1 - a * (1 - q * q);
    }
    n++; if (hit) covered++;
    const op = 1 - clear; sum += op; sum2 += op * op;
  }
  const mean = sum / n;
  return { coverage: covered / n, mean, cv: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) / Math.max(mean, 1e-6), live: live.length };
}

// deploy 208's recipes and gates (07512bb07's skirt, ac8ae8065's exhaust), for the comparison
function oldTrackSkirt(C, x, gy, z, dx, dz, intensity, surface, k) {
  const L = SURFACE_LOOKS[surface], R = C.rand, m = C.m;
  const back = 0.6 + R() * 1.0;
  Object.assign(m, { x: x - dx * 0.4 + (R() - 0.5) * 0.6, y: gy + 0.35 + R() * 0.25, z: z - dz * 0.4 + (R() - 0.5) * 0.6, birthOffset: 0 });
  Object.assign(m, { vx: -dx * back + (R() - 0.5) * 0.8, vy: 0.25 + R() * 0.35, vz: -dz * back + (R() - 0.5) * 0.8, drag: 1.5,
    rise: 0.06 + R() * 0.08, windK: 1, grav: 0 });
  const life = (3.5 + R() * 2.5) * (0.7 + 0.5 * intensity) * L.hang;
  const size1 = (1.8 + R() * 1.4) * (0.7 + 0.6 * intensity) * Math.sqrt(k);
  Object.assign(m, { life, size0: size1 * 0.35, size1, growExp: 2, density: Math.min(0.55, (0.16 + 0.22 * intensity) * k),
    fadeIn: 0.15, fadeOut: 0.4, aspect: 1.8 + (R(), R(), R(), R(), R()) * 0.8 });
  C.media(m);
}
function oldExhaustPuff(C, x, y, z, vx, vz, fx, fz, intensity) {
  const R = C.rand, m = C.m;
  const exit = 1.2 + R() * 0.8 + intensity * 0.8;
  Object.assign(m, { x: x + (R() - 0.5) * 0.2, y: y + 0.15, z: z + (R() - 0.5) * 0.2, birthOffset: -R() * 0.03 });
  Object.assign(m, { vx: vx * 0.85 - fx * exit + (R() - 0.5) * 0.4, vy: 0.9 + R() * 0.6 + intensity * 0.8,
    vz: vz * 0.85 - fz * exit + (R() - 0.5) * 0.4, drag: 1.5, rise: 0.45 + R() * 0.35, windK: 1.15, grav: 0 });
  const life = 2.6 + R() * 1.4;
  const size1 = (2.2 + R() * 1.2) * (0.7 + 0.5 * intensity);
  Object.assign(m, { life, size0: 0.35, size1, growExp: 1.7, density: Math.min(0.62, 0.3 + 0.28 * intensity), fadeIn: 0.05,
    fadeOut: 0.6, aspect: 1 });
  C.media(m);
}

/** A hull (7 m long, 3.6 m wide) driving +z at `speed` for `seconds`, its fx run by the battle's law at `hz` frames/s. */
function drive({ speed, top = 16.7, hz, seconds = 5, surface = 'soil', k = 0.55, old = false, seed = 9 }) {
  const skirt = [], exhaust = [];
  skirt.now = 0; exhaust.now = 0;
  const C = ctxFor(seed, skirt), E = ctxFor(seed + 1, exhaust);
  const cad = createTrailCadence(96);
  const intensity = Math.min(1, speed / top);
  const dustSpacing = 0.70 + (0.45 - 0.70) * intensity;
  let fxAcc = 0, dustAcc = 0, now = 0, hullZ = 0;
  for (let f = 0; f < seconds * hz; f++) {
    now += 1 / hz; hullZ += speed / hz; skirt.now = now; exhaust.now = now;
    fxAcc += 1 / hz;
    if (fxAcc < 1 / 60) continue;
    const ticks = Math.min(2, Math.floor(fxAcc * 60));
    fxAcc -= ticks / 60;
    dustAcc = Math.min(dustSpacing * 2, dustAcc + speed * (ticks / 60));
    if (dustAcc >= dustSpacing) {
      dustAcc -= dustSpacing;
      for (const side of [-1, 1]) {
        const x = side * 3.6 * 0.45, z = hullZ - 7 * 0.45;
        if (old) { if (C.rand() <= 0.15 * Math.min(1.3, k)) oldTrackSkirt(C, x, 0, z, 0, 1, intensity, surface, k); continue; }
        const n = cad.step(0, x, z, now, trackSkirtSpacing(intensity, k, 1), 0, 3);
        for (let i = 0; i < n; i++) trackSkirt(C, cad.births[i * 3], 0, cad.births[i * 3 + 1], 0, 1, intensity, surface, k, -cad.births[i * 3 + 2]);
      }
    }
    // the exhaust: once a frame (emitExhaust), a diesel under load
    const load = 0.9, rate = 3 + 4 * load, ez = hullZ - 7 * 0.42;
    if (old) { if (E.rand() <= rate / 60) oldExhaustPuff(E, 0, 1.8, ez, 0, speed, 0, 1, load); continue; }
    const n = cad.step(1, 0, ez, now, exhaustSpacing(speed, 1), 1 / rate, 4);
    for (let i = 0; i < n; i++) exhaustPuff(E, 0, 1.8, cad.births[i * 3 + 1], 0, speed, 0, 1, load, true, -cad.births[i * 3 + 2]);
  }
  // the young trail: what the hull left in the last 1.6 s (skirt) and 1 s (exhaust), where a gap reads as a break, not
  // as the old end of the trail thinning away
  const back = hullZ - 7 * 0.45;
  return {
    skirt: sideView(skirt, now, back - 2, back - Math.min(30, speed * 1.6)),
    exhaust: sideView(exhaust, now, back - 0.5, back - Math.min(15, speed * 1.0)),
    skirtLive: skirt.filter((b) => now - b.birth < b.life).length,
    exhaustLive: exhaust.filter((b) => now - b.birth < b.life).length,
  };
}

const report = [], checks = [];
const check = (ok, msg) => checks.push([ok, msg]);
for (const [surface, k] of [['soil', 0.55], ['concrete', 0.7], ['sand', 1.6]]) {
  for (const speed of [8, 16.7]) for (const hz of [60, 30, 15]) {
    const now = drive({ speed, hz, surface, k });
    const was = drive({ speed, hz, surface, k, old: true });
    report.push(`${surface} ${speed} m/s ${hz} Hz: skirt cover ${now.skirt.coverage.toFixed(2)} (208: ${was.skirt.coverage.toFixed(2)}) `
      + `cv ${now.skirt.cv.toFixed(2)} (${was.skirt.cv.toFixed(2)}) live ${now.skirtLive} (${was.skirtLive}); exhaust cover `
      + `${now.exhaust.coverage.toFixed(2)} (${was.exhaust.coverage.toFixed(2)}) live ${now.exhaustLive} (${was.exhaustLive})`);
    check(now.skirt.coverage >= 0.99, `${surface} ${speed} m/s at ${hz} Hz: the skirt is one continuous trail (${now.skirt.coverage.toFixed(3)})`);
    check(now.skirt.cv <= 0.5, `${surface} ${speed} m/s at ${hz} Hz: an even trail, not lumps (cv ${now.skirt.cv.toFixed(2)})`);
    check(now.exhaust.coverage >= 0.97, `${speed} m/s at ${hz} Hz: the exhaust is one streak (${now.exhaust.coverage.toFixed(3)})`);
    // the cost: bodies alive behind one hull at speed (two skirts and one stack), within the skirt budget's share
    check(now.skirtLive <= 80 && now.exhaustLive <= 36, `bodies per hull (${now.skirtLive} skirt, ${now.exhaustLive} exhaust)`);
    if (surface === 'soil' && speed > 10) {
      check(was.skirt.coverage < 0.8, `deploy 208's grass skirt was broken (${was.skirt.coverage.toFixed(2)}): the receipt can see it`);
      check(was.exhaust.coverage < 0.9, `deploy 208's exhaust at speed was beads (${was.exhaust.coverage.toFixed(2)})`);
    }
  }
}
console.log(report.join('\n'));
for (const [ok, msg] of checks) assert.ok(ok, msg);
console.log('trailCadence.selftest: skirt and exhaust trails continuous at every frame rate, evenly spaced, within budget');
