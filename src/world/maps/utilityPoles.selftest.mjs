// utilityPoles.selftest — the regional utility lines (props lane A, #21): every line's pole stands on the ground through
// its own members, its timber marked for the timber material (concrete and steel left in their tones), within budget
// (pole 450, far 60 triangles), its conductors on its insulators (each seat at an insulator's neck or a cable clamp), at
// most six of them (the wires' pool at most three times the two it always carried, in its one draw); a map without a
// regional line keeps the sourced pole and the network's two conductors.
import assert from 'node:assert/strict';
import { floatingMembers, toParts } from '../../../tools/r2-standard.mjs';
import { createUtilityNetwork } from '../utilityNetwork.ts';
import { utilityConductorsOf, utilityLineFormOf, utilityPoleDistanceGeometry, utilityPoleGeometry } from './utilityPoles.ts';

const MAPS = ['fjord', 'autumn', 'alpine', 'foundry', 'winter', 'blackglass', 'monsoon', 'verdant', 'steppe', 'railyard', 'frontier', 'urban',
  'titan_gorge', 'skybridge', 'caldera', 'desert', 'badlands', 'coastal', 'whiteout'];
const TIMBER = new Set(['open-wire', 'soviet-strut', 'german-timber', 'us-crossarm', 'eu-abc']);
const tris = (g) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
const seen = new Map();
for (const mapId of MAPS) {
  const kind = utilityLineFormOf(mapId);
  assert.ok(kind, `${mapId}: its region's line`);
  if (seen.has(kind)) continue;
  const full = utilityPoleGeometry(mapId, () => { throw new Error('no sourced pole on a regional line'); }), far = utilityPoleDistanceGeometry(mapId);
  assert.ok(tris(full) <= 450, `${kind}: pole ${tris(full)} triangles (cap 450)`);
  assert.ok(tris(far) <= 60, `${kind}: far ${tris(far)} triangles (cap 60)`);
  // the timber the poles' material paints, by its own tone
  const wood = full.getAttribute('aPoleWood'), marked = Array.from(wood.array).filter((v) => v > 0).length;
  assert.equal(marked > 0, TIMBER.has(kind), `${kind}: ${TIMBER.has(kind) ? 'its timber marked' : 'no timber'}`);
  // grounded: every member reaches the ground through members it touches
  const floating = floatingMembers(toParts(full), { groundM: 0.05, contactM: 0.03 });
  assert.deepEqual(floating.map((f) => f.min), [], `${kind}: every member of the pole grounded`);
  // the conductors sit on it: each seat within a hand of a vertex of the pole (an insulator's neck, a cable clamp)
  const conductors = utilityConductorsOf(mapId);
  assert.ok(conductors.length >= 1 && conductors.length <= 6, `${kind}: ${conductors.length} conductors`);
  const p = full.getAttribute('position');
  for (const c of conductors) {
    let near = Infinity;
    for (let i = 0; i < p.count; i++) near = Math.min(near, Math.hypot(p.getX(i) - c.across, p.getY(i) - (6.5 + c.up), p.getZ(i)));
    assert.ok(near <= 0.08, `${kind}: a conductor at (${c.across}, ${6.5 + c.up}) is ${near.toFixed(2)} m off its pole`);
  }
  seen.set(kind, `${tris(full)}/${tris(far)}/${conductors.length}`);
}
// the network lays a line's conductors: its pool one slot per conductor per segment, each span's ends on its seats
{
  const conductors = utilityConductorsOf('fjord'), net = createUtilityNetwork([{ x: 0, y: 1, z: 0, yaw: 0.3 }, { x: 4, y: 1, z: 20, yaw: 0.3 }], [[0, 1]], { conductors });
  assert.equal(net.conductors, conductors.length);
  assert.equal(net.instanceCount, conductors.length * net.segments);
  const pts = new Float64Array((net.segments + 1) * 3);
  for (const [k, c] of conductors.entries()) {
    net.writeSpanPoints(0, k, pts);
    assert.ok(Math.abs(pts[0] - Math.cos(0.3) * c.across) < 1e-9 && Math.abs(pts[1] - (1 + 6.5 + c.up)) < 1e-9 && Math.abs(pts[2] + Math.sin(0.3) * c.across) < 1e-9, 'a span starts on its seat');
  }
  assert.equal(new Set(Array.from({ length: conductors.length }, (_, k) => net.instanceIndex(0, k, 3))).size, conductors.length, 'each conductor its own slots');
}
assert.equal(utilityLineFormOf('mars'), null);
assert.equal(utilityConductorsOf('mars'), undefined, 'no regional line: the network\'s two conductors');
console.log(`utilityPoles selftest: ${MAPS.length} maps, ${seen.size} lines (${[...seen].map(([k, v]) => `${k} ${v}`).join(', ')}) grounded, marked, on budget, their conductors on their insulators PASS`);
process.exit(0);
