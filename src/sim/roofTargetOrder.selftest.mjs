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
 * no wreck or seen enemy hull box the round would strike first. The hull box sampled along the lane, independently of
 * the station's slab test. */
function referenceLaneClear(shooter, target, context, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, length = dx * dx + dy * dy + dz * dz;
  for (const other of context.entities) {
    if (other === shooter || other === target || other.modeActive === false) continue;
    if (other.team === shooter.team) {
      const p = other.state.pos, y = p.y + (other.spec.dims?.heightM ?? 2.5) * 0.5;
      const t = ((p.x - a.x) * dx + (y - a.y) * dy + (p.z - a.z) * dz) / (length || 1);
      if (t > 0 && t < 1 && (a.x + t * dx - p.x) ** 2 + (a.z + t * dz - p.z) ** 2 < 9 && Math.abs(a.y + t * dy - y) < 2.5) return false;
      continue;
    }
    if (!other.combat.destroyed && !context.visible(other, shooter)) continue;
    const s = other.state, c = Math.cos(s.yaw), n = Math.sin(s.yaw), h = other.spec.dims?.heightM ?? 2.5;
    for (let k = 1; k < 4000; k++) {
      const t = k / 4000, x = a.x + t * dx - s.pos.x, y = a.y + t * dy, z = a.z + t * dz - s.pos.z;
      if (Math.abs(x * c - z * n) <= 1.7 && Math.abs(x * n + z * c) <= 3.3 && y >= s.pos.y && y <= s.pos.y + h) return false;
    }
  }
  return true;
}

// a lane's answer is a fixed function of where it ends (the same lane answers the same in both scans)
const laneHash = (b) => { const h = Math.sin(b.x * 12.9898 + b.y * 4.1414 + b.z * 78.233) * 43758.5453; return h - Math.floor(h); };

let rosters = 0, chosen = 0, none = 0, ties = 0, fastTests = 0, referenceTests = 0;
for (let n = 0; n < 4000; n++) {
  const count = 2 + pick(28), blockedShare = [0, 0.3, 0.7, 0.95][n % 4];
  // a coarse grid makes equal distances common (ties must keep entity order)
  const grid = n % 3 === 0 ? 50 : 0;
  const coordinate = () => (grid ? (pick(7) - 3) * grid : (random() - 0.5) * 1600);
  const entities = Array.from({ length: count }, (_, i) => ({
    id: `e${i}`, team: random() < 0.5 ? 'alpha' : 'bravo',
    spec: { id: 'm1a1_abrams_hc', dims: grid ? { heightM: 2.4 } : random() < 0.8 ? { heightM: 2 + pick(3) * 0.4 } : undefined },
    state: { pos: { x: coordinate(), y: grid ? 0 : (random() - 0.5) * 30, z: coordinate() }, yaw: 0, turretYaw: 0 },
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
assert.ok(ties > 5, `equal distances covered (${ties})`);
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
console.log(`roofTargetOrder.selftest: ${rosters} rosters, the same target every time (${chosen} chosen, ${none} none, ${ties} with equal distances); lane tests ${fastTests} vs ${referenceTests} (${(100 * fastTests / referenceTests).toFixed(1)} %)`);
