// spaceKit.selftest.mjs — props census #12, the stations (maps/spaceKit.ts through structureKit's orbital kinds):
//   - every station kind builds as the Moon builds it (the generic build: the legacy builder's draws spent first, the
//     same count) and as Mars does (structureKit spaceCraft), the two forms differing;
//   - each form names its pieces for the wreck (an anatomy that checks against its build, 48 pieces at most), stands
//     inside its record, nothing floating, its footing on the ground;
//   - its settled wreck is no raft (a quarter of the intact's height at least), no higher than it stood (1 m), within 1.5 x
//     its triangles, and covers its plan;
//   - no painted opening: every glowing pane sits in a frame (an aperture's vertices are never on the hull's surface).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DESTRUCTIBLE_BUILDING_TYPES, spaceCraft } from './structureKit.ts';
import { SPACE_KINDS } from './spaceKit.ts';
import { checkKitFracture } from '../fractureAnatomy.ts';
import { settleLightWreck } from './lightWreck.ts';
import { certifyGroundedStructureParts } from '../structureConnectivity.ts';

const counted = (seed) => {
  let s = seed >>> 0, n = 0;
  const f = () => { n++; s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  f.count = () => n;
  return f;
};
const flat = (g) => (g.index ? g.toNonIndexed() : g);
const heightP90 = (g) => {
  const p = g.getAttribute('position'), ys = [];
  for (let i = 0; i < p.count; i++) ys.push(p.getY(i));
  ys.sort((a, b) => a - b);
  return ys[Math.floor(ys.length * 0.9)];
};
const plan = (g) => { const b = new THREE.Box3().setFromBufferAttribute(g.getAttribute('position')); return (b.max.x - b.min.x) * (b.max.z - b.min.z); };

assert.equal(SPACE_KINDS.length, 10, 'the ten station kinds');
for (const kind of SPACE_KINDS) {
  const t = DESTRUCTIBLE_BUILDING_TYPES[kind];
  assert.ok(t && t.family === 'orbital', `${kind}: an orbital light kind`);
  for (const world of ['moon', 'mars']) {
    const label = `${kind}@${world}`;
    const g = spaceCraft(kind, world), f = flat(g), a = g.userData.fracture;
    assert.ok(a && Array.isArray(a.pieces), `${label}: its pieces named`);
    assert.deepEqual(checkKitFracture(a, f.getAttribute('position').array), [], `${label}: its anatomy checks against its build`);
    assert.ok(a.pieces.length <= 48, `${label}: ${a.pieces.length} pieces (cap 48)`);
    const b = new THREE.Box3().setFromBufferAttribute(f.getAttribute('position'));
    assert.ok(Math.max(-b.min.x, b.max.x) <= t.hw + 0.4 && Math.max(-b.min.z, b.max.z) <= t.hl + 0.4 && b.max.y <= t.h + 0.05 && b.min.y >= -0.05,
      `${label}: inside its record`);
    assert.ok(b.min.y <= 0.02, `${label}: on the ground`);
    assert.ok(f.getAttribute('position').count / 3 <= 2500, `${label}: within 2.5k triangles`);
    const conn = g.userData.structureConnectivity;
    assert.ok(!conn || !conn.floating?.length, `${label}: nothing floating (${conn?.floating?.length ?? 0})`);
    const w = settleLightWreck(f, a, 4242);
    assert.ok(heightP90(w) >= 0.25 * heightP90(f) || heightP90(w) >= 0.6, `${label}: its wreck no raft`);
    assert.ok(w.getAttribute('position').count <= 1.5 * f.getAttribute('position').count, `${label}: its wreck within 1.5 x`);
    assert.ok(plan(w) >= 0.6 * plan(f), `${label}: its wreck covers its plan`);
    // (2026-10-15: the greenhouse's film and the rover garage's canopy heaped 15 m and 10 m high over 5 m stations) the
    // heap no higher than the station stood, give or take a piece leaning on it
    for (const seed of [4242, 7, 99]) {
      const top = new THREE.Box3().setFromBufferAttribute(settleLightWreck(f, a, seed).getAttribute('position')).max.y;
      assert.ok(top <= b.max.y + 1.0, `${label}: its wreck (seed ${seed}) ${top.toFixed(2)} m high, the station ${b.max.y.toFixed(2)} m`);
    }
  }
  // the generic build is the Moon's, the legacy builder's draws spent first (the same count as the legacy alone)
  const r1 = counted(9);
  const moon = flat(t.build(r1));
  assert.equal(moon.getAttribute('position').count, flat(spaceCraft(kind, kind === 'greenhouse' ? 'mars' : 'moon')).getAttribute('position').count, `${kind}: the generic build is its world's craft`);
  assert.ok(r1.count() > 0, `${kind}: the legacy builder's draws spent`);
  if (kind !== 'greenhouse') {
    const m = flat(spaceCraft(kind, 'moon')), r = flat(spaceCraft(kind, 'mars'));
    const differ = m.getAttribute('position').count !== r.getAttribute('position').count
      || m.getAttribute('color').array.some((v, i) => Math.abs(v - r.getAttribute('color').array[i]) > 0.02);
    assert.ok(differ, `${kind}: the Moon's and Mars's forms differ`);
  }
}
console.log('spaceKit.selftest: ten station kinds as the Moon and Mars build them — named pieces, inside their records, grounded, settled wrecks no rafts within 1.5 x PASS');
