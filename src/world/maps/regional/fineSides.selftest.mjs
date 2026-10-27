// A part's sides are fine joinery only while it lies within the contact of its wall (259; the owner, 2026-10-26, on
// Blackglass's Bund towers: "fix these floating bits around the building. not sure if theyre jsut not loading in"). A box
// under EmitOptions.fineSides keeps its outward face coarse and draws its sides, caps and back as fine joinery, which a
// phone never builds and a desktop hides past the fine-detail distance: the stepped crown's fins (36 cm deep) and the
// setbacks' finials (50 cm) stood there as bare faces in the air. Now a box to FINE_SIDES_MAX_DEPTH_M (5 cm: a shutter
// leaf) keeps its face coarse as before; to FINE_FLUSH_MAX_DEPTH_M (15 cm: a surround, a sill, a timber) the whole box
// is fine joinery and one flush face on its back stands in for it at range (a phone's old cost); deeper, every face
// coarse. A member and a strut follow the same rule; the
// buckets the props batch by fine-detail cell are the ones geometry.ts names (props.ts reads them there). Every kit's
// builds in the far view and a phone's are held by the building-integrity census's strand counts (the ledger).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PartSink, faceBox, flushFaceM, FINE_SIDES_MAX_DEPTH_M, FINE_CELLED_BUCKETS, DESKTOP_FINE_CELLED_BUCKETS } from './geometry.ts';

const face = { origin: [0, 0, 5], u: [1, 0, 0], out: [0, 0, 1], width: 10 };
/** Coarse and fine triangles of one emission. */
function split(emit) {
  const sink = new PartSink([0, 0]);
  emit(sink);
  const out = { coarse: 0, fine: 0 };
  for (const list of Object.values(sink.finish())) for (const g of list) out[g.userData.fine ? 'fine' : 'coarse'] += g.getAttribute('position').count / 3;
  return out;
}

assert.equal(FINE_SIDES_MAX_DEPTH_M, 0.05, 'the building-integrity census contact (tools/building-integrity-core.mjs CONTACT_VOXEL_M)');
// a shutter leaf, 4 cm: its face coarse, its four sides fine (the back is seated, never drawn)
assert.deepEqual(split((s) => faceBox(s, 'structureWood', face, 0, 1, 0.02, 0.5, 1.2, 0.04, { decor: true, fineSides: true })), { coarse: 2, fine: 8 });
// a crown fin, 36 cm and a centimetre off its drum (its back drawn): every face coarse, its depth reads at range
assert.deepEqual(split((s) => faceBox(s, 'stone', face, 0, 1.6, 0.19, 0.28, 3.2, 0.36, { decor: true, fineSides: true })), { coarse: 12, fine: 0 });
// a beam 9 cm proud ('near' as well): its face and its top (from its face to the wall) at range, its sides fine, no
// face added
assert.deepEqual(split((s) => faceBox(s, 'structureWood', face, 0, 1, 0.045, 1.5, 0.09, 0.09, { decor: true, fineSides: 'near' })), { coarse: 4, fine: 6 });
// without its top (caps hidden: it abuts), a flush face on its back stands in for it at range
assert.deepEqual(split((s) => faceBox(s, 'structureWood', face, 0, 1, 0.045, 0.2, 1.5, 0.09, { decor: true, fineSides: true }, 'caps')), { coarse: 2, fine: 6 });
// a sill 13 cm proud, run back 12 cm through its reveal: its face and its top (from the face into the wall) at range,
// no face added
assert.deepEqual(split((s) => faceBox(s, 'stone', face, 0, 1, 0.005, 1.2, 0.09, 0.25, { decor: true, fineSides: true })), { coarse: 4, fine: 6 });
// in a bucket a desktop draws whole at every range (plaster3), the flush face is a phone's alone
{
  const sink = new PartSink([0, 0]);
  faceBox(sink, 'plaster3', face, 0, 1, 0.08, 0.24, 2, 0.16, { decor: true, fineSides: true });
  const list = sink.finish().plaster3;
  assert.equal(list.filter((g) => g.userData.phoneOnly).reduce((n, g) => n + g.getAttribute('position').count / 3, 0), 2, 'its flush face built for a phone');
  assert.ok(list.filter((g) => g.userData.phoneOnly).every((g) => !g.userData.fine && g.userData.noCollision), 'coarse dressing');
}
// the flush face stands in the box, within its wall's contact, clear of the wall's depth
for (const d of [0.051, 0.09, 0.15]) {
  const z = flushFaceM(d);
  assert.ok(z > 0.02 && z < d && z <= FINE_SIDES_MAX_DEPTH_M, `a ${d * 100} cm box's flush face ${z * 100} cm off its back`);
}
// a casting part keeps every face coarse whatever its depth (as before)
assert.deepEqual(split((s) => faceBox(s, 'structureWood', face, 0, 1, 0.02, 0.5, 1.2, 0.04, { decor: true, shadow: true, fineSides: true })), { coarse: 10, fine: 0 });
// a framing member 3 cm proud: its face coarse, its sides fine; 12 cm: all fine and a flush face; 30 cm: all coarse
assert.deepEqual(split((s) => s.member('structureWood', [0, 0, 5], [0, 2, 5], 0.1, 0.03, [0, 0, 1], { decor: true })), { coarse: 2, fine: 4 });
assert.deepEqual(split((s) => s.member('structureWood', [0, 0, 5], [0, 2, 5], 0.1, 0.12, [0, 0, 1], { decor: true })), { coarse: 2, fine: 6 });
assert.deepEqual(split((s) => s.member('structureWood', [0, 0, 5], [0, 2, 5], 0.1, 0.3, [0, 0, 1], { decor: true })), { coarse: 6, fine: 0 });

// the props' fine-detail cells are the buckets geometry.ts names
const props = readFileSync(new URL('../../props.ts', import.meta.url), 'utf8');
assert.match(props, /const CELLED = FINE_CELLED_BUCKETS;/, 'props.ts batches the cells geometry.ts names');
assert.match(props, /const DESKTOP_CELLED = DESKTOP_FINE_CELLED_BUCKETS;/, 'and the desktop-only cells');
assert.deepEqual([...FINE_CELLED_BUCKETS, ...DESKTOP_FINE_CELLED_BUCKETS].sort(), ['regionalPlaster', 'regionalStone', 'structureMetal', 'structureWood']);

console.log('fineSides.selftest: the depth rule and the props\' fine-detail cells PASS');
