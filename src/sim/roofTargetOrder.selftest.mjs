// The roof gun's target scan orders its candidates before the lane tests (2026-10-13, the MP stream: the authority's
// tick). Every bot's roof gun scans every tick, and each candidate the one-pass scan reached cost a smoke check and a
// world ray. Ordered nearest first, the scan stops at the first clear lane. This receipt proves it picks exactly the
// target the one-pass scan picked (the nearest spotted enemy in range with a clear lane, ties to the first in entity
// order) over thousands of random rosters — duplicate distances, destroyed and inactive tanks, allies in the lane,
// blocked lanes — and counts the lane tests saved.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { selectRoofTarget } from './auxiliarySystems.ts';

let seed = 99991;
const random = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const pick = (n) => Math.floor(random() * n);

/** The pre-2026-10-13 scan, verbatim in its logic (with the lane law of 2026-10-19 below). */
function referenceTarget(entity, context, rangeM, from) {
  const point = new Vector3();
  let target = null, best = rangeM * rangeM;
  for (const other of context.entities) {
    if (other === entity || other.team === entity.team || other.combat.destroyed || other.modeActive === false || !context.visible(other, entity)) continue;
    point.set(other.state.pos.x, other.state.pos.y + (other.spec.dims?.heightM ?? 2.5) * 0.5, other.state.pos.z);
    const distance = from.distanceToSquared(point);
    if (distance < best && referenceLaneClear(entity, other, context, from, point) && context.clear(from, point)) { target = other; best = distance; }
  }
  return target;
}
/** The lane: no ally in the friendly-fire corridor and (2026-10-19, roof guns hold fire where their rounds cannot hurt)
 * no ally's, wreck's or seen enemy's hull box the round would strike first. The hull box (its dims, yaw and mode scale) tested by
 * separating axes, independently of the station's slab clipping. */
function referenceLaneClear(shooter, target, context, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, length = dx * dx + dy * dy + dz * dz;
  for (const other of context.entities) {
    if (other === shooter || other === target || other.modeActive === false) continue;
    if (other.team === shooter.team) {
      const p = other.state.pos, y = p.y + (other.spec.dims?.heightM ?? 2.5) * 0.5;
      const t = ((p.x - a.x) * dx + (y - a.y) * dy + (p.z - a.z) * dz) / (length || 1);
      if (t > 0 && t < 1 && (a.x + t * dx - p.x) ** 2 + (a.z + t * dz - p.z) ** 2 < 9 && Math.abs(a.y + t * dy - y) < 2.5) return false;
      if (segmentCrossesBox(other, a, b)) return false;
      continue;
    }
    if (!other.combat.destroyed && !context.visible(other, shooter)) continue;
    if (segmentCrossesBox(other, a, b)) return false;
  }
  return true;
}
/** Segment a→b against a hull box by separating axes (the box's three axes and their crosses with the segment) in the
 * hull's frame: half width (widthM, 3.4 m), half length (hullLengthM, 6.6 m), height (heightM, 2.5 m), times the mode's
 * scale. */
function segmentCrossesBox(other, a, b) {
  const s = other.state, dims = other.spec.dims, scale = s.modeScale ?? 1, c = Math.cos(s.yaw), n = Math.sin(s.yaw);
  const e = [(dims?.widthM ?? 3.4) * 0.5 * scale, (dims?.heightM ?? 2.5) * 0.5 * scale, (dims?.hullLengthM ?? 6.6) * 0.5 * scale];
  const local = (p) => { const x = p.x - s.pos.x, z = p.z - s.pos.z; return [x * c - z * n, p.y - s.pos.y - e[1], x * n + z * c]; };
  const pa = local(a), pb = local(b), m = [0, 1, 2].map((i) => (pa[i] + pb[i]) / 2), h = [0, 1, 2].map((i) => (pb[i] - pa[i]) / 2);
  for (let i = 0; i < 3; i++) if (Math.abs(m[i]) > e[i] + Math.abs(h[i])) return false;
  for (const [i, j] of [[1, 2], [2, 0], [0, 1]]) if (Math.abs(m[i] * h[j] - m[j] * h[i]) > e[i] * Math.abs(h[j]) + e[j] * Math.abs(h[i])) return false;
  return true;
}

// a lane's answer is a fixed function of where it ends (the same lane answers the same in both scans)
const laneHash = (b) => { const h = Math.sin(b.x * 12.9898 + b.y * 4.1414 + b.z * 78.233) * 43758.5453; return h - Math.floor(h); };

/** A hull's footprint (sometimes absent: the station's 3.4 x 6.6 m default). */
const hull = () => (random() < 0.75 ? { widthM: 2.4 + random() * 1.6, hullLengthM: 4.5 + random() * 4 } : {});
let rosters = 0, chosen = 0, none = 0, ties = 0, fastTests = 0, referenceTests = 0;
for (let n = 0; n < 4000; n++) {
  const count = 2 + pick(28), blockedShare = [0, 0.3, 0.7, 0.95][n % 4];
  // a coarse grid makes equal distances common (ties must keep entity order)
  const grid = n % 3 === 0 ? 50 : 0;
  const coordinate = () => (grid ? (pick(7) - 3) * grid : (random() - 0.5) * 1600);
  const entities = Array.from({ length: count }, (_, i) => ({
    id: `e${i}`, team: random() < 0.5 ? 'alpha' : 'bravo',
    spec: { id: 'm1a1_abrams_hc', dims: grid ? { heightM: 2.4 } : random() < 0.8 ? { heightM: 2 + pick(3) * 0.4, ...hull() } : undefined },
    state: { pos: { x: coordinate(), y: grid ? 0 : (random() - 0.5) * 30, z: coordinate() }, yaw: (random() - 0.5) * 2 * Math.PI, turretYaw: 0,
      ...(random() < 0.2 ? { modeScale: 0.6 + random() } : {}) },
    combat: { destroyed: random() < 0.1 },
    modeActive: random() < 0.07 ? false : undefined,
  }));
  const shooter = entities[0];
  const from = grid ? new Vector3(shooter.state.pos.x, 1.2, shooter.state.pos.z) // level with every centre: grid ties
    : new Vector3(shooter.state.pos.x + 0.3, shooter.state.pos.y + 2.9, shooter.state.pos.z - 0.2);
  const visibleSet = new Set(entities.filter(() => random() < 0.8).map((e) => e.id));
  let tests = 0;
  const context = {
    entities,
    visible: (target) => visibleSet.has(target.id),
    clear: (a, b) => { tests++; assert.ok(a.equals(from), 'the lane starts at the gun'); return laneHash(b) >= blockedShare; },
  };
  const rangeM = [300, 800, 1200][n % 3];
  tests = 0;
  const expected = referenceTarget(shooter, context, rangeM, from);
  referenceTests += tests;
  tests = 0;
  const got = selectRoofTarget(shooter, context, rangeM, from);
  fastTests += tests;
  assert.equal(got?.id ?? null, expected?.id ?? null, `roster ${n}: the same target`);
  rosters++;
  if (expected) {
    chosen++;
    const d = (e) => from.distanceToSquared(new Vector3(e.state.pos.x, e.state.pos.y + (e.spec.dims?.heightM ?? 2.5) * 0.5, e.state.pos.z));
    if (entities.some((e) => e !== expected && e.team !== shooter.team && d(e) === d(expected))) ties++;
  } else none++;
}
assert.ok(chosen > 1000 && none > 300, `both outcomes covered (${chosen} chosen, ${none} none)`);
// (allies' hull boxes block some of the grid's lanes since 2026-10-19: five random ties, and two built below)
assert.ok(ties >= 5, `equal distances covered (${ties})`);
// the hull boxes in the lane (2026-10-19): rosters strung along the line to a far enemy, each hull within a few metres
// of it at any yaw, footprint and mode scale — wrecks, seen and hidden enemies, allies — so the hull-box law decides
let laneRosters = 0, hullBlocked = 0, hiddenPassed = 0;
for (let n = 0; n < 3000; n++) {
  const far = 60 + random() * 300, heading = random() * 2 * Math.PI, count = 1 + pick(5);
  const at = (t, offset) => ({ x: Math.sin(heading) * far * t + Math.cos(heading) * offset, z: Math.cos(heading) * far * t - Math.sin(heading) * offset });
  const tank = (id, team, p, extra = {}) => ({ id, team, spec: { id: 'bmp2', dims: { heightM: 1.8 + random(), ...hull() } },
    state: { pos: { x: p.x, y: (random() - 0.5) * 2, z: p.z }, yaw: (random() - 0.5) * 2 * Math.PI, turretYaw: 0, ...(random() < 0.2 ? { modeScale: 0.6 + random() } : {}) },
    combat: { destroyed: false }, ...extra });
  const shooter = tank('me', 'alpha', { x: 0, z: 0 }), target = tank('target', 'bravo', at(1, 0));
  const blockers = Array.from({ length: count }, (_, i) => {
    const blocker = tank(`b${i}`, random() < 0.25 ? 'alpha' : 'bravo', at(0.1 + random() * 0.8, (random() - 0.5) * 12));
    if (random() < 0.3) blocker.combat.destroyed = true;
    return blocker;
  });
  const entities = [shooter, ...blockers, target];
  const hidden = new Set(blockers.filter(() => random() < 0.3).map((b) => b.id));
  const context = { entities, visible: (other) => !hidden.has(other.id), clear: () => true };
  const from = new Vector3(0, 2.6, 0);
  const point = new Vector3(target.state.pos.x, target.state.pos.y + target.spec.dims.heightM * 0.5, target.state.pos.z);
  const expected = referenceTarget(shooter, context, far * 1.5, from);
  const got = selectRoofTarget(shooter, context, far * 1.5, from);
  assert.equal(got?.id ?? null, expected?.id ?? null, `lane roster ${n}: the same target`);
  const enemyHull = (b) => b.team === 'bravo' || b.combat.destroyed;
  if (blockers.some((b) => enemyHull(b) && (b.combat.destroyed || !hidden.has(b.id)) && segmentCrossesBox(b, from, point))) hullBlocked++;
  if (blockers.some((b) => b.team === 'bravo' && !b.combat.destroyed && hidden.has(b.id) && segmentCrossesBox(b, from, point))) hiddenPassed++;
  laneRosters++;
}
assert.ok(hullBlocked > 300, `hull boxes decide lanes (${hullBlocked} of ${laneRosters})`);
assert.ok(hiddenPassed > 30, `hidden hulls in the line never hold the lane (${hiddenPassed})`);
// and the tie by construction: two clear enemies at one distance, either order — the first in entity order wins
for (const order of [['east', 'west'], ['west', 'east']]) {
  const tank = (id, team, x) => ({ id, team, spec: { id: 'm1a1_abrams_hc', dims: { heightM: 2.4 } }, state: { pos: { x, y: 0, z: 0 }, yaw: 0, turretYaw: 0 }, combat: {} });
  const shooter = tank('me', 'alpha', 0);
  const enemies = order.map((id) => tank(id, 'bravo', id === 'east' ? 120 : -120));
  const context = { entities: [shooter, tank('far', 'bravo', 400), ...enemies], visible: () => true, clear: () => true };
  const from = new Vector3(0, 1.2, 0);
  assert.equal(selectRoofTarget(shooter, context, 800, from)?.id, order[0], `tie goes to ${order[0]}`);
  assert.equal(referenceTarget(shooter, context, 800, from)?.id, order[0]);
}
assert.ok(fastTests <= referenceTests, `no more lane tests than before (${fastTests} vs ${referenceTests})`);
console.log(`roofTargetOrder.selftest: ${rosters} rosters, the same target every time (${chosen} chosen, ${none} none, ${ties} with equal distances); lane tests ${fastTests} vs ${referenceTests} (${(100 * fastTests / referenceTests).toFixed(1)} %); ${laneRosters} lane rosters at any yaw, footprint and scale (${hullBlocked} held by a hull box, ${hiddenPassed} past a hidden hull)`);
