#!/usr/bin/env node
// Kevin B. Liu — the main gun's depression by turret yaw, measured (release 227).
//   node tools/gun-depression-sweep.mjs --ids=<id,...> [--keep=0.026] [--tol=0.35] [--no-suit] [--barrel]
//   node tools/gun-depression-sweep.mjs --envelope=<sweep.json,...> [--keep-published] [--tol=0.35]
// For each id, at every absolute turret yaw 0..180 degrees (both sides; the worse side counts), the lowest gun pitch at
// which the whole gun keeps --keep metres from its hull (src/vehicles/gunHullClearance.test-support.mjs: every gun mesh,
// the recoiling parts in battery and at 0.135 m, against every hull mesh). The pitch is scanned down from full elevation
// in 1-degree steps to the first pose that comes too close, then bisected to 0.05 degrees, so every pitch from the floor
// up to full elevation is clear. Then a conservative symmetric gunPitchByYawDeg curve (src/sim/gunPitchLimits.ts): each
// degree needs its shallowest neighbour's floor; stations are greedy, rounded shallower to 0.1 degree and linear between
// them, never deeper than the need at any degree, never more than --tol degrees shallower, and at the full depression
// wherever the need is. --no-suit leaves out the hull's camouflage suit (ghillieSuit.ts cuts it to the gun's own stops, so
// it follows whatever curve it is given); --barrel measures the recoiling parts alone. --envelope fits one curve over the shallowest curve floor of each degree across earlier sweeps of
// the same curve (one id's geometry on several branches, or the ids that share a curve), so the curve holds on each; --keep-published also holds each degree at
// least as high as the curve the spec published within half a degree (a stop is only ever added). Prints one JSON line
// per id:
// { id, keep, depressionDeg, elevationDeg, floors: [[yaw, floorDeg]], curveFloors (the floors the curve follows),
//   parts: {yaw: hull mesh}, blockedAtElevation: [[yaw, highest clear pitch, hull mesh]] (a conflict at full elevation,
//   which no depression curve cures), mountConflicts: [[yaw, whole-gun floor, barrel floor, hull mesh]] (the mount held
//   2 degrees over the barrel above level, or kept from full elevation: a standing geometry conflict; the curve follows the
//   barrel there and the selftest holds only the barrel inside the conflict's window until the geometry is fixed), curve
//   (null when the gun keeps its full depression all round), published: the spec's current curve }.
import { readFileSync } from 'node:fs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const ids = arg('ids', '').split(',').filter(Boolean), envelope = arg('envelope', '').split(',').filter(Boolean);
const keep = Number(arg('keep', '.026')), tol = Number(arg('tol', '.35')), BARREL = process.argv.includes('--barrel');
if (!(ids.length || envelope.length) || !(keep > 0) || !(tol > 0)) {
  console.error('usage: node tools/gun-depression-sweep.mjs --ids=<id,...> [--keep=0.026] [--tol=0.35] | --envelope=<sweep.json,...>');
  process.exit(2);
}
const DEG = Math.PI / 180, round2 = (x) => Math.round(x * 100) / 100;

/** At one signed yaw, for the gun's `parts` (probe.distance): the floor (radians; every pitch from it up to the
 * ceiling is clear) and the ceiling (full elevation, or the highest clear pitch below it when the gun comes too close at
 * full elevation); both Infinity when no pitch is clear. */
function limitsAt(probe, yaw, parts = 'all') {
  const lo = -probe.depression, hi = probe.elevation, blocked = (p) => probe.distance(yaw, p, keep, parts) < keep;
  let ceiling = null, ceilingPart = null, prev = null;
  for (let p = hi; ; p = Math.max(lo, p - DEG)) {
    if (!blocked(p)) { if (ceiling === null) ceiling = p; prev = p; }
    else if (ceiling === null) { if (ceilingPart === null) { probe.distance(yaw, p, 0, parts); ceilingPart = probe.part; } }
    else {
      let a = p, b = prev;
      while (b - a > .05 * DEG) { const m = (a + b) / 2; if (blocked(m)) a = m; else b = m; }
      probe.distance(yaw, a, 0, parts);
      return { floor: b, part: probe.part, ceiling, ceilingPart };
    }
    if (p === lo) return ceiling === null ? { floor: Infinity, part: ceilingPart, ceiling: Infinity, ceilingPart } : { floor: lo, part: null, ceiling, ceilingPart };
  }
}

/** A conservative curve over per-degree floors (degrees), or null when every floor is the full depression. */
function fitCurve(floors, front) {
  const L = floors.map((f) => Math.max(front, f));
  if (L.every((f) => f === front)) return null;
  const need = L.map((_, a) => Math.max(L[Math.abs(a - 1)], L[a], L[a === 180 ? 179 : a + 1]));
  const up = (x) => Math.ceil(x * 10 - 1e-9) / 10;
  const stations = [[0, up(need[0])]];
  for (let a0 = 0; a0 < 180;) {
    const c0 = stations[stations.length - 1][1];
    let best = a0 + 1;
    for (let j = a0 + 1; j <= 180; j++) {
      const cj = up(need[j]);
      let ok = true;
      for (let a = a0; a <= j && ok; a++) {
        const c = c0 + (cj - c0) * (a - a0) / (j - a0);
        ok = c >= need[a] - 1e-9 && c <= need[a] + (need[a] > front + 1e-9 ? tol : 0) + 1e-9;
      }
      if (ok) best = j;
    }
    stations.push([best, up(need[best])]);
    a0 = best;
  }
  const curve = [stations[0]];
  for (let i = 1; i < stations.length - 1; i++) {
    const [a, b] = curve[curve.length - 1], [c, e] = stations[i], [f, g] = stations[i + 1];
    if (Math.abs((e - b) * (f - a) - (g - b) * (c - a)) > 1e-9) curve.push(stations[i]);
  }
  curve.push(stations[stations.length - 1]);
  const at = (a) => { for (let i = 1; i < curve.length; i++) if (a <= curve[i][0]) return curve[i - 1][1] + (curve[i][1] - curve[i - 1][1]) * (a - curve[i - 1][0]) / (curve[i][0] - curve[i - 1][0]); return curve[curve.length - 1][1]; };
  const short = need.findIndex((n, a) => at(a) < n - 1e-9);
  if (short >= 0) throw new Error(`curve fit leaves yaw ${short} deeper than its need`);
  return curve.map(([a, p]) => [a, Math.round(p * 10) / 10]);
}

if (envelope.length) {
  const runs = envelope.map((file) => JSON.parse(readFileSync(file, 'utf8').trim().split('\n').pop()));
  // one id on several trees, or the ids that share one curve (their depression and published curve the same)
  const id = [...new Set(runs.map((r) => r.id))].join(','), front = -runs[0].depressionDeg;
  if (runs.some((r) => r.depressionDeg !== runs[0].depressionDeg || JSON.stringify(r.published) !== JSON.stringify(runs[0].published)))
    throw new Error('--envelope takes sweeps of one curve (one depression, one published curve)');
  // a sweep's curve floors: its floors, the barrel's where the mount stands in conflict
  const curveFloorsOf = (r) => r.curveFloors?.map(([, f]) => f)
    ?? r.floors.map(([a, f]) => r.mountConflicts?.find(([m]) => m === a)?.[2] ?? f);
  const all = runs.map(curveFloorsOf), floors = Array.from({ length: 181 }, (_, a) => Math.max(...all.map((f) => f[a])));
  const published = runs[0].published;
  if (process.argv.includes('--keep-published') && published) {
    const at = (y) => { for (let i = 1; i < published.length; i++) if (y <= published[i][0]) return published[i - 1][1] + (published[i][1] - published[i - 1][1]) * (y - published[i - 1][0]) / (published[i][0] - published[i - 1][0]); return published[published.length - 1][1]; };
    for (let a = 0; a <= 180; a++) {
      const ys = [Math.max(0, a - .5), Math.min(180, a + .5), ...published.map(([y]) => y).filter((y) => Math.abs(y - a) <= .5)];
      floors[a] = Math.max(floors[a], ...ys.map(at));
    }
  }
  console.log(JSON.stringify({ id, envelope, depressionDeg: -front, curve: fitCurve(floors, front) }));
}
// the probe builds tanks: loaded only when there are tanks to measure (an --envelope fit needs no fleet)
const { gunHullProbe } = ids.length ? await import('../src/vehicles/gunHullClearance.test-support.mjs') : {};
for (const id of ids) {
  const t0 = Date.now(), probe = gunHullProbe(id, { suit: !process.argv.includes('--no-suit') });
  try {
    const floors = [], curveFloors = [], parts = {}, blockedAtElevation = [], mountConflicts = [];
    const deg = (x) => (x === Infinity ? round2(probe.elevation / DEG) : round2(x / DEG));
    for (let a = 0; a <= 180; a++) {
      let worst = { floor: -Infinity, part: null }, barrel = -Infinity, ceiling = Infinity, ceilingPart = null;
      for (const s of a === 0 || a === 180 ? [1] : [1, -1]) {
        const r = limitsAt(probe, s * a * DEG, BARREL ? 'barrel' : 'all');
        if (r.floor > worst.floor) worst = { ...r, side: s };
        if (r.ceiling < ceiling || (r.ceiling === Infinity && ceiling === Infinity && r.ceilingPart)) { ceiling = r.ceiling; ceilingPart = `${s < 0 ? '-' : ''}${r.ceilingPart}`; }
        // where the whole gun is held up, the barrel alone: a stop above level that the barrel does not need is the
        // mount's (mantlet, boot) standing conflict with the hull, which no depression stop cures
        barrel = Math.max(barrel, r.floor > -probe.depression + 1e-9 ? limitsAt(probe, s * a * DEG, 'barrel').floor : -probe.depression);
      }
      if (ceiling < probe.elevation || ceiling === Infinity) blockedAtElevation.push([a, ceiling === Infinity ? null : round2(ceiling / DEG), ceilingPart]);
      // the mount holds the gun where the whole gun needs more than the barrel and either cannot reach full elevation or
      // stays above level at least 2 degrees over the barrel's need (a standing conflict, not a stop the curve can take)
      const mountHeld = barrel < worst.floor - .05 * DEG
        && (ceiling < probe.elevation || ceiling === Infinity || (worst.floor > 1e-9 && worst.floor - Math.max(0, barrel) >= 2 * DEG));
      if (mountHeld) mountConflicts.push([a, deg(worst.floor), deg(barrel), `${worst.side < 0 ? '-' : ''}${worst.part}`]);
      floors.push(deg(worst.floor));
      curveFloors.push(deg(mountHeld ? barrel : worst.floor));
      if (worst.part) parts[a] = `${worst.side < 0 ? '-' : ''}${worst.part}`;
    }
    const front = -round2(probe.depression / DEG);
    console.log(JSON.stringify({ id, keep, depressionDeg: -front, elevationDeg: round2(probe.elevation / DEG), samples: probe.samples,
      turretOutlineM: [round2(Math.min(...probe.outline)), round2(Math.max(...probe.outline))],
      floors: floors.map((f, a) => [a, f]), curveFloors: curveFloors.map((f, a) => [a, f]), parts, blockedAtElevation, mountConflicts,
      curve: fitCurve(curveFloors, front),
      published: probe.spec.gunPitchByYawDeg ?? null, seconds: Math.round((Date.now() - t0) / 1000) }));
  } finally { probe.dispose(); }
}
