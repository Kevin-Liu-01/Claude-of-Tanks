// structureHanging.selftest.mjs — what a building's damage leaves hanging comes down (destruction-slabs 227 round 3; the
// engineering critic of round 2: a mill's sails stood crossed in the air over its fallen body, a farmhouse's chimney and roof
// ladder beside its gable, verge boards as an A-frame over roofless walls).
//
// Synthetic, fast and deterministic: a 10 x 6 m house of four walls under a roof, a chimney and a ladder of two rails on the
// roof, a sign on a wall, and a mast standing on the ground beside it with a sail cross on its head. Nothing comes down
// from the intact house. With the roof hidden, the chimney and the ladder's rails come down (one body each cluster: the two
// rails touch, so they are one); the sign and the walls stand. With the mast hidden, the sail cross comes down whole. A
// room cut loose from its walls goes; a fracture face's piece over nothing goes; its pieces on the ground stand.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHangingSweep } from './structureHanging.ts';

const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
function box(x0, y0, z0, x1, y1, z1) {
  const p = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  return [
    ...quad(p(0), p(1), p(3), p(2)), ...quad(p(4), p(6), p(7), p(5)), ...quad(p(0), p(4), p(5), p(1)),
    ...quad(p(2), p(3), p(7), p(6)), ...quad(p(0), p(2), p(6), p(4)), ...quad(p(1), p(5), p(7), p(3)),
  ];
}
/** A bucket mesh at identity holding `parts` ([name, triangles]) one after another; a span for each. */
function bucket(name, parts) {
  const all = parts.flatMap(([, tris]) => tris);
  const attr = new THREE.Float32BufferAttribute(all, 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', attr);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  mesh.name = name;
  mesh.updateMatrixWorld(true);
  let first = 0;
  const spans = parts.map(([part, tris]) => {
    const span = { mesh, geometryId: null, instanceId: null, position: attr, bucket: name, partClass: part, first, count: tris.length / 3, piece: null };
    first += tris.length / 3;
    return span;
  });
  return { mesh, spans };
}
const walls = bucket('wall', [['wall', [...box(0, 0, 0, 10, 6, 0.3), ...box(0, 0, 5.7, 10, 6, 6), ...box(0, 0, 0, 0.3, 6, 6), ...box(9.7, 0, 0, 10, 6, 6)]]]);
const roof = bucket('roof', [['roof', box(-0.3, 6, -0.3, 10.3, 6.2, 6.3)]]);
const trim = bucket('trim', [
  ['trim', [...box(4, 6.2, 2, 4.6, 7.7, 2.6), ...box(6, 6.2, 1, 6.15, 6.35, 5), ...box(6.15, 6.2, 1, 6.3, 6.35, 5), ...box(-0.1, 3, 2, 0, 4, 3.5)]],
]);
// a mast beside the house and its sail cross (two crossed stocks welded at the hub, on the mast's head)
const mast = bucket('mast', [['wall', box(14, 0, 2.9, 14.2, 8, 3.1)], ['trim', [...box(12, 8, 2.9, 16.2, 8.2, 3.1), ...box(14, 6, 2.9, 14.2, 10.2, 3.1)]]]);
const seam = { structureIdx: 1, spans: [...walls.spans, ...roof.spans, ...trim.spans, ...mast.spans] };
const originals = new Map();
const hide = (span) => {
  const arr = span.position.array;
  if (!originals.has(span)) originals.set(span, arr.slice(span.first * 3, (span.first + span.count) * 3));
  for (let i = span.first; i < span.first + span.count; i++) { arr[i * 3] = arr[span.first * 3]; arr[i * 3 + 1] = arr[span.first * 3 + 1]; arr[i * 3 + 2] = arr[span.first * 3 + 2]; }
};
const sweep = createHangingSweep({ originalOf: (span) => originals.get(span) ?? null, groundAt: () => 0 });
const none = { faces: [], runs: [], rooms: [] };
const centreOf = (group) => {
  let x = 0, y = 0, z = 0, n = 0;
  for (const t of group) { const a = t.span.position.array; x += a[t.at * 3]; y += a[t.at * 3 + 1]; z += a[t.at * 3 + 2]; n++; }
  return [x / n, y / n, z / n];
};

assert.equal(sweep.sweep(seam, none).groups.length, 0, 'nothing comes down from the intact house');
hide(roof.spans[0]);
const afterRoof = sweep.sweep(seam, none).groups.map(centreOf);
assert.ok(afterRoof.some(([x, y, z]) => Math.abs(x - 4.3) < 0.6 && y > 6 && Math.abs(z - 2.3) < 0.6), `the chimney over the hidden roof comes down (${JSON.stringify(afterRoof)})`);
assert.ok(afterRoof.some(([x, y]) => x > 5.9 && x < 6.4 && y > 6), `the ladder's rails come down (${JSON.stringify(afterRoof)})`);
assert.ok(!afterRoof.some(([x]) => x < 0.2), 'the sign on the wall stands');
assert.ok(!afterRoof.some(([x]) => x > 11), 'the mast and its sails stand');
hide(mast.spans[0]);
const afterMast = sweep.sweep(seam, none).groups.map(centreOf);
assert.ok(afterMast.some(([x, y]) => Math.abs(x - 14.1) < 1.5 && y > 6), `the sail cross on a hidden mast comes down (${JSON.stringify(afterMast)})`);

// what the presentation draws: a room standing on nothing comes down, a face's piece hanging over nothing comes down, a
// face's piece on the ground stands
const mesh = (tris) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  m.updateMatrixWorld(true);
  return m;
};
const face = mesh([...box(20, 0, 0, 24, 3, 0.3), ...box(20, 5, 0, 24, 6, 0.3)]);
const room = mesh(box(30, 4, 0, 33, 6.5, 3));
const r = sweep.sweep(seam, { faces: [face], runs: [], rooms: [room] });
assert.equal(r.rooms.length, 1, 'a room touching nothing that stands goes');
assert.equal(r.faces.length, 1, 'the face\'s piece over nothing comes down, its piece on the ground stands');
assert.ok(r.faces[0].tris.length === 12, `the loose piece is the upper box (${r.faces[0]?.tris.length} triangles)`);
console.log('structureHanging selftest: nothing comes down intact; a hidden roof\'s chimney and ladder come down, a sign stands; a hidden mast\'s sails come down; a loose room and a face\'s loose piece go — ok');
