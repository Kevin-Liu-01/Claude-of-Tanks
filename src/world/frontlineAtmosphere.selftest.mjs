import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { notifyShellImpact, notifyShellSweep } from './destructibles.ts';
import {
  createFrontlineAtmosphere, FRONTLINE_INTENSITY, FRONTLINE_LIMITS, resolveFrontBearingDeg,
} from './frontlineAtmosphere.ts';
import { MAP_IDS } from './maps/catalog.ts';

// Every map has an authored front (0 = silent) and nothing leaves [0, 1].
assert.deepEqual(Object.keys(FRONTLINE_INTENSITY).sort(), [...MAP_IDS].sort(), 'one intensity per map, no strays');
for (const id of MAP_IDS) {
  const k = FRONTLINE_INTENSITY[id];
  assert.ok(k >= 0 && k <= 1, `${id}: intensity ${k} inside [0, 1]`);
}
assert.ok(FRONTLINE_INTENSITY.frontier > FRONTLINE_INTENSITY.verdant && FRONTLINE_INTENSITY.verdant > FRONTLINE_INTENSITY.whiteout,
  'front is loudest where the map is a front');

// Bearing: from the player spawn toward the enemy centroid, fallback otherwise.
assert.equal(resolveFrontBearingDeg({ player: { pos: [0, 0, 0] }, enemies: [{ pos: [0, 0, 100] }] }, 7), 0);
assert.equal(Math.round(resolveFrontBearingDeg({ player: { pos: [0, 0, 0] }, enemies: [{ pos: [100, 0, 0] }] }, 7)), 90);
assert.equal(resolveFrontBearingDeg({ player: { pos: [0, 0, 0] }, enemies: [] }, 7), 7);
assert.equal(resolveFrontBearingDeg(null, 33), 33);

function make(seedBus) {
  const parent = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 4000);
  camera.position.set(0, 30, -200);
  const events = [];
  const bus = { emit: (event, payload) => { events.push([event, payload]); seedBus?.(event, payload); } };
  const runtime = createFrontlineAtmosphere({
    parent, camera, bus,
    getHeightField: () => ({ getHeightAt: (x, z) => Math.sin(x * 0.01) * 4 + Math.cos(z * 0.013) * 3 }),
    getSpawns: () => ({ player: { pos: [0, 0, -300] }, enemies: [{ pos: [80, 0, 320] }, { pos: [-60, 0, 300] }] }),
  });
  return { parent, camera, runtime, events };
}

function run(runtime, seconds, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) runtime.update(dt);
}

// Determinism: the same seed and map replay the same event log; another seed differs.
const a = make(), b = make(), c = make();
a.runtime.prepare(1337, 'frontier'); b.runtime.prepare(1337, 'frontier'); c.runtime.prepare(2025, 'frontier');
run(a.runtime, 180); run(b.runtime, 180); run(c.runtime, 180);
assert.ok(a.runtime.log.length > 0, 'events fired within three minutes');
assert.deepEqual(a.runtime.log, b.runtime.log, 'seed + map replay byte-identical event logs');
assert.notDeepEqual(a.runtime.log.map((e) => e.timeS), c.runtime.log.map((e) => e.timeS), 'another seed schedules differently');
assert.equal(a.events.length, a.runtime.log.length, 'every logged event reached the bus');
for (const [name, payload] of a.events) {
  assert.ok(['atmosphere:artillery', 'atmosphere:flak', 'atmosphere:flyover', 'atmosphere:aa'].includes(name));
  const pos = payload.pos || payload.p0;
  assert.ok(pos.every(Number.isFinite), `${name}: finite position`);
}

// Cadence follows intensity: the front (0.9) fires more than an orchard (0.3).
const quiet = make(); quiet.runtime.prepare(1337, 'orchard'); run(quiet.runtime, 180);
const artillery = (log) => log.filter((e) => e.kind === 'artillery').length;
assert.ok(artillery(a.runtime.log) > artillery(quiet.runtime.log) * 1.5, `front ${artillery(a.runtime.log)} vs orchard ${artillery(quiet.runtime.log)}`);
const gapsWithin = (log, kind, range) => {
  const times = log.filter((e) => e.kind === kind).map((e) => e.timeS);
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    assert.ok(gap >= range[0] * 0.98 && gap <= range[1] / 0.15 + 0.2, `${kind} gap ${gap.toFixed(2)} within the authored interval law`);
  }
};
gapsWithin(a.runtime.log, 'artillery', FRONTLINE_LIMITS.artilleryIntervalS);
gapsWithin(a.runtime.log, 'flyover', FRONTLINE_LIMITS.flyoverIntervalS);

// Geometry envelope: columns beyond the playable half-map and below the horizon ring; aircraft inside the sky.
const columns = a.parent.getObjectByName('frontline-smoke-columns');
// 2026-09-15: a plume is FRONTLINE_LIMITS.columnPuffs billboard puffs sharing the column matrix
assert.equal(columns.count % FRONTLINE_LIMITS.columnPuffs, 0, 'whole plumes only');
const plumeCount = columns.count / FRONTLINE_LIMITS.columnPuffs;
assert.ok(plumeCount >= FRONTLINE_LIMITS.columns[0] && plumeCount <= FRONTLINE_LIMITS.columns[1], `${plumeCount} plumes`);
const puffs = columns.geometry.getAttribute('aPuff');
for (let i = 0; i < columns.count; i++) {
  assert.ok(puffs.getX(i) >= 0 && puffs.getX(i) < 1.05, 'rise phase in the cycle');
  assert.ok(puffs.getZ(i) >= 0.8 && puffs.getZ(i) <= 1.25, 'puff size scale');
  assert.ok([0, 1, 2, 3].includes(puffs.getW(i)), 'atlas variant');
}
const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
for (let i = 0; i < columns.count; i++) {
  columns.getMatrixAt(i, m); m.decompose(p, q, s);
  const r = Math.hypot(p.x, p.z);
  assert.ok(r >= FRONTLINE_LIMITS.columnRangeM[0] - 1 && r <= FRONTLINE_LIMITS.columnRangeM[1] + 1, `column ${i} at ${r.toFixed(0)} m`);
  assert.ok(s.y >= FRONTLINE_LIMITS.columnHeightM[0] && s.y <= FRONTLINE_LIMITS.columnHeightM[1]);
  // the front lies ahead of the player (toward the enemy centroid, bearing ~0 here) within its 130-degree fan
  const bearing = THREE.MathUtils.radToDeg(Math.atan2(p.x, p.z));
  assert.ok(Math.abs(((bearing - a.runtime.bearingDeg + 540) % 360) - 180) <= 66, `column ${i} inside the front fan`);
}
for (const e of a.runtime.log) {
  if (e.kind === 'flyover') {
    const alt = e.pos[1];
    assert.ok(alt > FRONTLINE_LIMITS.aircraftAltitudeM[0] - 20 && alt < FRONTLINE_LIMITS.aircraftAltitudeM[1] + 20, `aircraft altitude ${alt.toFixed(0)}`);
  }
}
const flyover = a.events.find(([name]) => name === 'atmosphere:flyover');
assert.ok(flyover, 'a flyover happened in three minutes on the front');
const speed = Math.hypot(...flyover[1].v);
assert.ok(speed >= FRONTLINE_LIMITS.aircraftSpeedMps[0] && speed <= FRONTLINE_LIMITS.aircraftSpeedMps[1]);
assert.ok(a.parent.getObjectByName('frontline-aircraft-0'), 'aircraft slot exists');

// campaign slice 2: anti-air guns sit behind the player's spawn, away from the
// front, and only fire tracer bursts while an aircraft is up and in range.
{
  const bases = a.parent.getObjectByName('frontline-aa-bases');
  const heads = a.parent.getObjectByName('frontline-aa-heads');
  assert.ok(bases.count >= FRONTLINE_LIMITS.aaGuns[0] && bases.count <= FRONTLINE_LIMITS.aaGuns[1], `${bases.count} guns`);
  assert.equal(heads.count, bases.count, 'every gun has a traversing head');
  const front = THREE.MathUtils.degToRad(a.runtime.bearingDeg);
  for (let i = 0; i < bases.count; i++) {
    bases.getMatrixAt(i, m); m.decompose(p, q, s);
    // behind the player spawn (0, -300) relative to the front direction
    const along = (p.x - 0) * Math.sin(front) + (p.z + 300) * Math.cos(front);
    assert.ok(along <= -FRONTLINE_LIMITS.aaBehindM[0] + 1 && along >= -FRONTLINE_LIMITS.aaBehindM[1] - 1, `gun ${i} ${along.toFixed(0)} m behind the line`);
  }
  const firstFlyover = a.runtime.log.find((e) => e.kind === 'flyover');
  const firstAa = a.runtime.log.find((e) => e.kind === 'aa');
  assert.ok(firstAa, 'the guns opened fire during three minutes on the front');
  assert.ok(firstAa.timeS >= firstFlyover.timeS, 'no anti-air fire before the first aircraft');
  const aaBursts = a.runtime.log.filter((e) => e.kind === 'aa');
  for (let i = 1; i < aaBursts.length; i++) {
    if (aaBursts[i].pos.join() === aaBursts[i - 1].pos.join()) {
      assert.ok(aaBursts[i].timeS - aaBursts[i - 1].timeS >= FRONTLINE_LIMITS.aaBurstIntervalS[0] * 0.98, 'one gun keeps its burst interval');
    }
  }
  const tracers = a.parent.getObjectByName('frontline-aa-tracers');
  assert.equal(tracers.count, FRONTLINE_LIMITS.tracerCap, 'tracer pool is capped');
}

// Sprite pools never exceed their cap and reset/dispose leave nothing behind.
const flashes = a.parent.getObjectByName('frontline-artillery-flashes');
assert.equal(flashes.count, FRONTLINE_LIMITS.spriteCap);
assert.equal(a.parent.children.length, 1, 'one group under the parent');
a.runtime.reset();
assert.equal(a.runtime.log.length, 0);
assert.equal(a.parent.getObjectByName('frontline-atmosphere').visible, false);
a.runtime.dispose();
assert.equal(a.parent.children.length, 0, 'dispose removes the group');

// Silent maps stay silent; scale can mute the layer for a quality tier.
const silent = make(); silent.runtime.setScale(0); silent.runtime.prepare(1337, 'urban'); run(silent.runtime, 60);
assert.equal(silent.runtime.log.length, 0, 'scale 0 fires nothing');
assert.equal(silent.parent.getObjectByName('frontline-atmosphere').visible, false);

// The runtime is wired behind the covered battle entry and ticks with the world.
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /createFrontlineAtmosphereAccess\(/, 'main owns the frontline access');
assert.match(main, /frontline\.prepare\(/, 'prepared with the battle atmosphere');
assert.match(main, /frontline\.reset\(\)/, 'reset with the garage presentation');
assert.match(main, /frontline\.update\(/, 'ticked from the battle frame');
const audio = readFileSync(new URL('../audio/audio.ts', import.meta.url), 'utf8');
for (const name of ['atmosphere:artillery', 'atmosphere:flak', 'atmosphere:flyover', 'atmosphere:aa']) {
  assert.ok(audio.includes(`'${name}'`), `audio subscribes to ${name}`);
}
console.log(`frontlineAtmosphere.selftest: ${MAP_IDS.length} map intensities, deterministic ${a.events.length}-event replay, cadence, envelope, caps, reset/dispose and wiring PASS`);


// AA guns are destructible (2026-09-13): an HE impact or a shell sweep through a
// gun's capsule knocks it out — it stops firing, logs 'aa-destroyed', tells the
// bus, and the standing guns keep working.
{
  const d = make();
  d.runtime.prepare(1337, 'frontier');
  run(d.runtime, 4);
  const guns = d.runtime.aaGuns;
  const gunCount = guns.length;
  assert.ok(gunCount >= FRONTLINE_LIMITS.aaGuns[0], `guns laid out (${gunCount})`);
  const g0 = guns[0], g1 = guns[1];
  notifyShellImpact(g0.pos.x + 0.8, g0.pos.y + 1.0, g0.pos.z, { r: 2.5, he: true });
  assert.equal(g0.destroyed, true, 'an HE impact beside the mount destroys it');
  assert.equal(g1.destroyed, false, 'the neighbour is untouched');
  notifyShellSweep(g1.pos.x - 8, g1.pos.y + 1.2, g1.pos.z, g1.pos.x + 8, g1.pos.y + 1.2, g1.pos.z);
  assert.equal(g1.destroyed, true, 'a shell sweeping through the capsule destroys it');
  notifyShellSweep(g1.pos.x - 8, g1.pos.y + 6, g1.pos.z, g1.pos.x + 8, g1.pos.y + 6, g1.pos.z);
  const destroyedEvents = d.runtime.log.filter((e) => e.kind === 'aa-destroyed');
  assert.equal(destroyedEvents.length, 2, 'one aa-destroyed event per kill');
  assert.equal(d.events.filter(([name]) => name === 'atmosphere:aa-destroyed').length, 2, 'the bus hears both kills');
  const before = d.runtime.log.length;
  run(d.runtime, 90);
  const laterBursts = d.runtime.log.slice(before).filter((e) => e.kind === 'aa');
  for (const burst of laterBursts) {
    for (const gun of [g0, g1]) {
      assert.ok(Math.hypot(burst.pos[0] - gun.pos.x, burst.pos[2] - gun.pos.z) > 0.5, 'a destroyed gun never bursts again');
    }
  }
  d.runtime.reset();
  notifyShellImpact(g0.pos.x, g0.pos.y + 1, g0.pos.z, { r: 3, he: true }); // unregistered after reset: no throw, no event
  assert.equal(d.runtime.log.length, 0, 'reset clears the log and unregisters the guns');
  console.log(`frontlineAtmosphere AA destructibles: ${gunCount} guns, impact + sweep kills, silence after, reset unregisters PASS`);
}
