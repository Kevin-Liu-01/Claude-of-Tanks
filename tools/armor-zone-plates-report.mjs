#!/usr/bin/env node
// Zone plates (262 phase 2) gate report: what turning sim/armorZonePlates.ts on would change, fleet-wide. CPU only:
// no tank builds, the specs' armour models only.
//
//   node tools/armor-zone-plates-report.mjs [--ids=a,b] [--json=out.json] [--seeds=5] [--angles=face|plate]
//
// For every playable tank, a fixed corpus of shots at 300 m: 12 bearings round the tank (0 = head-on) at two
// elevations (2° and 10°), each a 9 x 5 grid of aim points over the silhouette of its cells. Each shot is queried as the
// HUD and the flashlight do (queryAimArmor + estimatePenRatio) with the flag off (the hull-triangle plates) and on (the
// zone plates), with three reference rounds: the tank's own first round (a mirror match), a 25 mm APFSDS (an
// autocannon) and a 120 mm APFSDS (a modern tank gun). It reports:
//   census       every shot that meets a cell resolves to a zone (coverage); no shot that met armour meets none
//   parity       per zone, the share of shots whose first plate is the same, the mean change of impact angle, and the
//                verdicts (penetrates: ratio >= 1) that flip, each way, with the reason (zone changed, angle changed)
//   fairness     per tier, the frontal (|bearing| <= 30°) and side penetration rates with the mirror round, off vs on
//   determinism  the on-mode corpus digest twice from fresh copies of the cells (sealed again), and under seeded jitters of the aim
//                points (--seeds), each twice: equal digests
//   gaps         see-through cracks between the cells' slices, off vs on (sealed seams): at every boundary two slices
//                share, rays across the hull (along x, then down y) every 10 cm, at 1 cm steps through boundary ± 4 cm;
//                a ray that meets no plate while those 6 cm either side both do went through a crack
//   mantlet      Main's ruling (262): every forward turret cell face (outward normal z > 0.2) whose centre lies over a
//                mantlet or gun-notch plate's footprint (its x range, its height ± 0.1 m, its z range ± 0.35 m) reads
//                that plate on: zoneAt at its centre (a face that reads another is a failure); off, the faces the cells'
//                own plate gives another
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { uniqueIds } from './id-list.mjs';

await import('../src/vehicles/tankFactory.ts');
const fleet = await import('../src/vehicles/specs.ts');
const { tankTier } = await import('../src/vehicles/tier.ts');
const { queryAimArmor } = await import('../src/sim/armor.ts');
const { estimatePenRatio } = await import('../src/sim/damage.ts');
const { setArmorZonePlates, zonePlateCounters } = await import('../src/sim/armorZonePlates.ts');
const { zoneAt, zonePlates } = await import('../src/sim/armorZones.ts');

const arg = (name, fallback = null) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const ids = arg('ids') ? uniqueIds(arg('ids').split(','), 'armor-zone-plates-report --ids') : [...fleet.ALL_TANK_IDS];
const seeds = Number(arg('seeds', '3'));
// --angles=plate: the zone plates at their own plates' angles (the variant beside the default, each cell face's angle)
const angles = arg('angles', 'face') === 'plate' ? 'plate' : 'face';
const RANGE_M = 300;
const BEARINGS = [0, 30, 60, 90, 120, 150, 180, -150, -120, -90, -60, -30];
const ELEVATIONS = [2, 10];
const GRID = [9, 5];

const reference = {
  autocannon: fleet.getSpec('m2a2_bradley').gun.shells[0],
  tankGun: fleet.getSpec('leo2a6').gun.shells[0],
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The cells of a model, fresh arrays (new identities: sealed again). */
function freshArmor(armor) {
  return {
    ...armor,
    collisionShells: {
      hull: armor.collisionShells?.hull ? [...armor.collisionShells.hull] : undefined,
      turret: armor.collisionShells?.turret ? [...armor.collisionShells.turret] : undefined,
    },
  };
}

const pose = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 };
const _from = new THREE.Vector3(), _dir = new THREE.Vector3(), _aim = new THREE.Vector3(), _right = new THREE.Vector3();
const _up = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

/** The corpus of one tank: { bearing, elevation, from, dir } shots through its cells' silhouette. */
function corpus(armor, jitter = null) {
  const box = new THREE.Box3();
  const pivot = armor.turretPivot || [0, 0, 0];
  for (const [key, offset] of [['hull', [0, 0, 0]], ['turret', pivot]]) {
    for (const cell of armor.collisionShells?.[key] || []) {
      box.expandByPoint(new THREE.Vector3(cell.min[0] + offset[0], cell.min[1] + offset[1], cell.min[2] + offset[2]));
      box.expandByPoint(new THREE.Vector3(cell.max[0] + offset[0], cell.max[1] + offset[1], cell.max[2] + offset[2]));
    }
  }
  const centre = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  const shots = [];
  for (const bearing of BEARINGS) for (const elevation of ELEVATIONS) {
    const b = THREE.MathUtils.degToRad(bearing), e = THREE.MathUtils.degToRad(elevation);
    // from the tank's bearing `bearing` (0: in front, +Z), looking back at it
    const view = new THREE.Vector3(-Math.sin(b) * Math.cos(e), -Math.sin(e), -Math.cos(b) * Math.cos(e));
    _right.crossVectors(view, UP).normalize();
    _up.crossVectors(_right, view).normalize();
    for (let i = 0; i < GRID[0]; i++) for (let j = 0; j < GRID[1]; j++) {
      let u = (i + 0.5) / GRID[0] * 2 - 1, v = (j + 0.5) / GRID[1] * 2 - 1;
      if (jitter) { u += (jitter() - 0.5) * 0.1; v += (jitter() - 0.5) * 0.1; }
      _aim.copy(centre).addScaledVector(_right, u * radius * 0.8).addScaledVector(_up, v * radius * 0.5);
      const from = _aim.clone().addScaledVector(view, -RANGE_M);
      shots.push({ bearing, elevation, from, dir: view.clone() });
    }
  }
  return shots;
}

function shoot(armor, shot, shell) {
  const info = queryAimArmor(shot.from, shot.dir, RANGE_M + 20, pose, armor);
  if (!info) return null;
  return { zone: info.plate?.name ?? '?', angle: info.impactAngleDeg, ratio: estimatePenRatio(shell, info.distM, info) };
}

function digest(values) {
  let h = 0x811c9dc5;
  for (const value of values) {
    const text = typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(6) : String(value)) : String(value);
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return h.toString(16).padStart(8, '0');
}

const zones = new Map(); // zone name -> { shots, same, angleDelta, flipsUp, flipsDown, zoneFlips, angleFlips }
const tiers = new Map(); // tier -> { front: [off pen, on pen, n], side: [...] }
const census = { tanks: 0, frames: 0, closed: 0, failed: [] };
const flips = [];
const determinism = [];
let totalShots = 0, hitShots = 0;
const t0 = performance.now();
for (const id of ids) {
  const spec = fleet.getSpec(id);
  const armor = spec?.armor;
  if (!armor?.collisionShells) { census.failed.push(`${id}: no collision shells`); continue; }
  census.tanks++;
  census.frames += (armor.collisionShells.hull?.length ? 1 : 0) + (armor.collisionShells.turret?.length ? 1 : 0);
  const mirror = spec.gun?.shells?.[0] ?? reference.tankGun;
  const tier = tankTier(id);
  const shots = corpus(armor);
  const onDigest = [];
  for (const shot of shots) {
    totalShots++;
    setArmorZonePlates(false);
    const off = shoot(armor, shot, mirror);
    const offRefs = [shoot(armor, shot, reference.autocannon), shoot(armor, shot, reference.tankGun)];
    setArmorZonePlates(true, { angles });
    const on = shoot(armor, shot, mirror);
    const onRefs = [shoot(armor, shot, reference.autocannon), shoot(armor, shot, reference.tankGun)];
    setArmorZonePlates(false);
    if (on) onDigest.push(on.zone, on.angle, on.ratio);
    if (!off && !on) continue;
    hitShots++;
    // a shot that passed through a crack between slices meets the sealed seam: a gap closed; one that met armour and
    // no longer does would be a hole opened
    if (!off) { census.closed++; continue; }
    if (!on) { census.failed.push(`${id}: a shot that met armour meets none (${shot.bearing}°, ${shot.elevation}°)`); continue; }
    let entry = zones.get(off.zone);
    if (!entry) { entry = { shots: 0, same: 0, angleDelta: 0, flipsUp: 0, flipsDown: 0, zoneFlips: 0, angleFlips: 0 }; zones.set(off.zone, entry); }
    entry.shots++;
    if (on.zone === off.zone) entry.same++;
    entry.angleDelta += Math.abs(on.angle - off.angle);
    const pairs = [[off, on], [offRefs[0], onRefs[0]], [offRefs[1], onRefs[1]]];
    for (const [a, b] of pairs) {
      if (!a || !b) continue;
      const before = a.ratio >= 1, after = b.ratio >= 1;
      if (before === after) continue;
      if (after) entry.flipsUp++; else entry.flipsDown++;
      if (a.zone !== b.zone) entry.zoneFlips++; else entry.angleFlips++;
      if (flips.length < 400) flips.push({ id, bearing: shot.bearing, elevation: shot.elevation, from: a.zone, to: b.zone, angle: [+a.angle.toFixed(1), +b.angle.toFixed(1)], ratio: [+a.ratio.toFixed(3), +b.ratio.toFixed(3)] });
    }
    const arc = Math.abs(shot.bearing) <= 30 ? 'front' : Math.abs(shot.bearing) >= 60 && Math.abs(shot.bearing) <= 120 ? 'side' : null;
    if (arc) {
      let line = tiers.get(tier);
      if (!line) { line = { front: [0, 0, 0], side: [0, 0, 0] }; tiers.set(tier, line); }
      line[arc][0] += off.ratio >= 1 ? 1 : 0; line[arc][1] += on.ratio >= 1 ? 1 : 0; line[arc][2]++;
    }
  }
  // determinism: the on-mode corpus again from freshly built panels, and under seeded jitters, each twice
  if (determinism.length < 40) {
    setArmorZonePlates(true, { angles });
    const fresh = freshArmor(armor);
    const again = [];
    for (const shot of shots) { const on = shoot(fresh, shot, mirror); if (on) again.push(on.zone, on.angle, on.ratio); }
    const row = { id, fresh: digest(again) === digest(onDigest), seeds: [] };
    for (let seed = 1; seed <= seeds; seed++) {
      const runs = [0, 1].map(() => {
        const values = [];
        const rebuilt = freshArmor(armor);
        for (const shot of corpus(rebuilt, mulberry32(seed))) { const on = shoot(rebuilt, shot, mirror); if (on) values.push(on.zone, on.angle, on.ratio); }
        return digest(values);
      });
      row.seeds.push(runs[0] === runs[1]);
    }
    setArmorZonePlates(false);
    determinism.push(row);
  }
}
// the corpus's own coverage (the gap census below traces bare frames, no plates: no zones)
const corpusCounters = { ...zonePlateCounters };
// gaps: the cracks between slices, off and on
const { traceTank } = await import('../src/sim/armor.ts');
const gapFrom = new THREE.Vector3(), gapTo = new THREE.Vector3();
function crackLines(armor) {
  let lines = 0;
  for (const key of ['hull', 'turret']) {
    const cells = armor.collisionShells?.[key] || [];
    if (!cells.length) continue;
    const model = { ...armor, hullPlates: [], turretPlates: [], externalWeapons: [], trackShapes: [], modules: [], crew: [],
      gunBarrel: null, collisionShells: key === 'hull' ? { hull: cells } : { turret: cells } };
    const o = key === 'turret' ? (armor.turretPivot || [0, 0, 0]) : [0, 0, 0];
    const meets = (x, y, z, axis) => {
      if (axis === 0) { gapFrom.set(o[0] - 12, o[1] + y, o[2] + z); gapTo.set(o[0] + 12, o[1] + y, o[2] + z); }
      else { gapFrom.set(o[0] + x, o[1] + 12, o[2] + z); gapTo.set(o[0] + x, o[1] - 12, o[2] + z); }
      return traceTank(gapFrom, gapTo, pose, model).some((hit) => hit.kind === 'plate');
    };
    const slices = cells.filter((cell) => !cell.structureKind);
    const bounds = [...new Set(slices.flatMap((cell) => [cell.min[2], cell.max[2]]).map((z) => Math.round(z * 1e4) / 1e4))].sort((p, q) => p - q);
    const ymin = Math.min(...cells.map((c) => c.min[1])), ymax = Math.max(...cells.map((c) => c.max[1]));
    const xmin = Math.min(...cells.map((c) => c.min[0])), xmax = Math.max(...cells.map((c) => c.max[0]));
    for (const z of bounds.slice(1, -1)) {
      for (const [axis, lo, hi] of [[0, ymin, ymax], [1, xmin, xmax]]) {
        for (let u = lo + 0.05; u < hi - 0.05; u += 0.1) {
          const x = axis === 0 ? 0 : u, y = axis === 0 ? u : 0;
          if (!meets(x, y, z - 0.06, axis) || !meets(x, y, z + 0.06, axis)) continue;
          for (let dz = -0.04; dz <= 0.0401; dz += 0.01) if (!meets(x, y, z + dz, axis)) { lines++; break; }
        }
      }
    }
  }
  return lines;
}
const gaps = { off: 0, on: 0, framesOff: 0, framesOn: 0, worst: [] };
for (const id of ids) {
  const armor = fleet.getSpec(id)?.armor;
  if (!armor?.collisionShells) continue;
  setArmorZonePlates(false);
  const off = crackLines(armor);
  setArmorZonePlates(true, { angles });
  const on = crackLines(armor);
  setArmorZonePlates(false);
  gaps.off += off; gaps.on += on;
  if (off) gaps.framesOff++;
  if (on) { gaps.framesOn++; gaps.worst.push(`${id}: ${off} -> ${on}`); }
}
const mantlet = { faces: 0, off: 0, offTanks: 0, on: 0, tanks: 0 };
for (const id of ids) {
  const armor = fleet.getSpec(id)?.armor;
  const cells = armor?.collisionShells?.turret || [];
  const mantlets = (armor?.turretPlates || []).filter((p) => p.kind === 'main' && /mantlet|gun_notch/i.test(p.name));
  if (!cells.length || !mantlets.length) continue;
  mantlet.tanks++;
  const zones = zonePlates(armor.turretPlates);
  let offHere = 0;
  for (const m of mantlets) {
    const lo = [0, 1, 2].map((k) => Math.min(...m.verts.map((v) => v[k]))), hi = [0, 1, 2].map((k) => Math.max(...m.verts.map((v) => v[k])));
    for (const cell of cells) for (const face of cell.faces) {
      const [x, y, z] = face.center;
      if (face.internal || face.normal[2] <= 0.2 || x < lo[0] || x > hi[0] || y < lo[1] - 0.1 || y > hi[1] + 0.1
        || z < lo[2] - 0.35 || z > hi[2] + 0.35) continue;
      mantlet.faces++;
      if (!mantlets.includes(face.plate)) { mantlet.off++; offHere++; }
      const index = zoneAt(zones, x, y, z, face.normal[0], face.normal[1], face.normal[2]);
      if (index < 0 || !mantlets.includes(zones[index].plate)) {
        mantlet.on++;
        census.failed.push(`${id}: a forward turret face over ${m.name}'s footprint reads ${index < 0 ? 'no zone' : zones[index].plate.name}`);
      }
    }
  }
  if (offHere) mantlet.offTanks++;
}
const ms = performance.now() - t0;

const fmt = (x, digits = 1) => (x * 100).toFixed(digits);
const lines = [];
lines.push(`armor-zone-plates report (zone plates, ${angles} angles): ${census.tanks} tanks, ${census.frames} frames, ${totalShots} shots (${hitShots} meeting armour), ${(ms / 1000).toFixed(1)} s`);
lines.push(`census: zones resolved ${corpusCounters.resolved}, missed ${corpusCounters.missed} (coverage ${fmt(corpusCounters.resolved / Math.max(1, corpusCounters.resolved + corpusCounters.missed), 3)}%); corpus shots that went through a crack and now meet the sealed seam ${census.closed}; failures ${census.failed.length}`);
for (const failure of census.failed.slice(0, 20)) lines.push(`  FAIL ${failure}`);
let all = { shots: 0, same: 0, angleDelta: 0, flipsUp: 0, flipsDown: 0, zoneFlips: 0, angleFlips: 0 };
const zoneRows = [...zones].sort((a, b) => b[1].shots - a[1].shots);
for (const [, z] of zoneRows) for (const key of Object.keys(all)) all[key] += z[key];
lines.push(`parity: first plate unchanged on ${fmt(all.same / all.shots)}% of shots; mean |Δ impact angle| ${(all.angleDelta / all.shots).toFixed(2)}°; verdict flips (3 rounds) ${all.flipsUp} to penetrating, ${all.flipsDown} to stopped (${all.zoneFlips} where the zone changed, ${all.angleFlips} by the angle alone) of ${all.shots * 3} verdicts (${fmt((all.flipsUp + all.flipsDown) / (all.shots * 3), 2)}%)`);
lines.push('  zone                      shots   same%  |Δangle|°  flips +/-');
for (const [name, z] of zoneRows.slice(0, 24)) {
  lines.push(`  ${name.padEnd(24)} ${String(z.shots).padStart(6)}  ${fmt(z.same / z.shots).padStart(6)}  ${(z.angleDelta / z.shots).toFixed(2).padStart(8)}  ${z.flipsUp}/${z.flipsDown}`);
}
lines.push('fairness (mirror round, share of shots that penetrate): tier  front off -> on  side off -> on');
for (const [tier, line] of [...tiers].sort((a, b) => a[0] - b[0])) {
  const f = line.front, s = line.side;
  lines.push(`  ${String(tier).padStart(4)}  ${fmt(f[0] / f[2]).padStart(5)} -> ${fmt(f[1] / f[2]).padStart(5)}   ${fmt(s[0] / s[2]).padStart(5)} -> ${fmt(s[1] / s[2]).padStart(5)}   (${f[2]} / ${s[2]} shots)`);
}
lines.push(`gaps: lines through a crack between slices ${gaps.off} off (${gaps.framesOff} tanks) -> ${gaps.on} on, seams sealed (${gaps.framesOn} tanks${gaps.worst.length ? `: ${gaps.worst.slice(0, 8).join(', ')}` : ''})`);
lines.push(`mantlet: ${mantlet.faces} forward turret faces over a mantlet footprint (${mantlet.tanks} tanks); reading another plate off ${mantlet.off} (${mantlet.offTanks} tanks) -> on ${mantlet.on}`);
const determinismOk = determinism.every((row) => row.fresh && row.seeds.every(Boolean));
lines.push(`determinism: ${determinism.length} tanks, fresh cell copies ${determinism.filter((r) => r.fresh).length}/${determinism.length} equal, ${seeds} jitter seeds twice each ${determinism.filter((r) => r.seeds.every(Boolean)).length}/${determinism.length} equal: ${determinismOk ? 'PASS' : 'FAIL'}`);
console.log(lines.join('\n'));
if (arg('json')) writeFileSync(arg('json'), `${JSON.stringify({ census, counters: corpusCounters, mantlet, zones: Object.fromEntries(zones), tiers: Object.fromEntries(tiers), flips, determinism, gaps, lines }, null, 1)}\n`);
process.exitCode = census.failed.length || !determinismOk ? 1 : 0;
