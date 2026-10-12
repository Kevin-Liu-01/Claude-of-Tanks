// The fracture kit contract (world/fractureAnatomy.ts; the destruction core with the destructible-buildings redesign
// lane, 2026-10-10): a kind's pieces are its own contiguous triangle runs covering the whole build, each inside its box,
// at most six scores inside it, links between real pieces, and every piece held by an anchor. A kit that breaks any of
// it is named, piece by piece.
import assert from 'node:assert/strict';
import { checkKitFracture, FRACTURE_PIECE_CAP } from './fractureAnatomy.ts';

/** A box's twelve triangles (non-indexed), its corners turned by q = (x, y, z, w) about its centre. */
function boxTriangles(c, h, q = [0, 0, 0, 1]) {
  const [qx, qy, qz, qw] = q;
  const turn = (x, y, z) => {
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    return [c[0] + x + qw * tx + (qy * tz - qz * ty), c[1] + y + qw * ty + (qz * tx - qx * tz), c[2] + z + qw * tz + (qx * ty - qy * tx)];
  };
  const corner = (i) => turn(i & 1 ? h[0] : -h[0], i & 2 ? h[1] : -h[1], i & 4 ? h[2] : -h[2]);
  const quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  const out = [];
  for (const [a, b, c2, d] of quads) for (const i of [a, b, c2, a, c2, d]) out.push(...corner(i));
  return out;
}

// a lean-to: a sill on the ground (the anchor), two posts on it, a wall panel of boards between them, a roof sheet on
// the posts, the sheet turned 12 degrees about x (its pitch)
const pitch = 12 * Math.PI / 180, roofQ = [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)];
const parts = [
  { role: 'sill', material: 'timber', c: [0, 0.06, 0], h: [1.5, 0.06, 0.08], anchor: true, face: 'back' },
  { role: 'post', material: 'timber', c: [-1.4, 1.1, 0], h: [0.06, 1.0, 0.06], scores: [-0.3, 0.4] },
  { role: 'post', material: 'timber', c: [1.4, 1.1, 0], h: [0.06, 1.0, 0.06], scores: [0.2] },
  { role: 'board', material: 'plank', c: [0, 1.1, 0], h: [1.3, 0.95, 0.012], scoreAxis: 0, scores: [-0.6, 0.1, 0.7], face: 'back' },
  { role: 'sheet', material: 'metal', c: [0, 2.25, 0.8], h: [1.6, 0.01, 1.0], q: roofQ, face: 'roof' },
];
let positions = [], tri = 0;
const pieces = parts.map((part) => {
  const triangles = boxTriangles(part.c, part.h, part.q);
  positions.push(...triangles);
  const piece = { bucket: 'structureWood', massKg: 20, q: [0, 0, 0, 1], ...part, tri0: tri, triN: triangles.length / 9 };
  tri += piece.triN;
  return piece;
});
const links = [{ a: 0, b: 1, kind: 'nail' }, { a: 0, b: 2, kind: 'nail' }, { a: 1, b: 3, kind: 'nail' }, { a: 2, b: 3, kind: 'nail' },
  { a: 1, b: 4, kind: 'nail' }, { a: 2, b: 4, kind: 'rest', strengthN: 4000 }];
const anatomy = { kind: 'leanto', pieces, links };
positions = Float32Array.from(positions);
assert.deepEqual(checkKitFracture(anatomy, positions), [], 'a sound lean-to passes (a pitched sheet in its turned box)');

const variant = (edit) => {
  const copy = { kind: anatomy.kind, pieces: anatomy.pieces.map((p) => ({ ...p })), links: anatomy.links.map((l) => ({ ...l })) };
  edit(copy);
  return checkKitFracture(copy, positions);
};
const says = (problems, pattern, label) => assert.ok(problems.some((p) => pattern.test(p)), `${label}: ${JSON.stringify(problems)}`);
says(variant((a) => { a.pieces[2].tri0 += 1; }), /gap or overlap/, 'a run that skips a triangle');
says(variant((a) => { a.pieces.pop(); }), /runs end at triangle/, 'triangles no piece owns');
says(variant((a) => { a.pieces[1].h = [0.03, 1.0, 0.06]; }), /outside its box/, 'a box tighter than its triangles');
says(variant((a) => { a.pieces[4].q = [0, 0, 0, 1]; }), /outside its box/, 'a pitched sheet in an unturned box');
says(variant((a) => { a.pieces[1].scores = [1.2]; }), /outside its box/, 'a score past the end of its piece');
says(variant((a) => { a.pieces[3].scores = [-1, -0.8, -0.4, 0, 0.3, 0.6, 0.9]; }), /7 scores/, 'seven scores');
says(variant((a) => { a.pieces[0].anchor = undefined; }), /no anchor/, 'nothing anchored');
says(variant((a) => { a.links = a.links.filter((l) => l.b !== 4); }), /not held by any anchor: 4/, 'a roof sheet nothing holds');
says(variant((a) => { a.links.push({ a: 3, b: 3, kind: 'nail' }); }), /bad ends/, 'a link to itself');
says(variant((a) => { a.links.push({ a: 4, b: 1, kind: 'bolt' }); }), /twice/, 'the same link twice');
says(variant((a) => { a.pieces[2].q = [0, 0, 0.5, 0.5]; }), /not unit/, 'a quaternion that is not unit');
says(variant((a) => { a.pieces[3].massKg = 0; }), /mass 0/, 'a weightless panel');
const crowd = { kind: 'crowd', pieces: [], links: [] };
let crowdPositions = [];
for (let i = 0; i < FRACTURE_PIECE_CAP.light + 1; i++) {
  const t = boxTriangles([i * 0.3, 0.1, 0], [0.1, 0.1, 0.1]);
  crowd.pieces.push({ role: 'board', material: 'plank', bucket: 'structureWood', tri0: i * 12, triN: 12, c: [i * 0.3, 0.1, 0],
    h: [0.1, 0.1, 0.1], q: [0, 0, 0, 1], massKg: 2, ...(i === 0 ? { anchor: true } : {}) });
  if (i) crowd.links.push({ a: i - 1, b: i, kind: 'nail' });
  crowdPositions.push(...t);
}
says(checkKitFracture(crowd, crowdPositions), /over the cap of 48/, 'a light kind of 49 pieces');
assert.deepEqual(checkKitFracture(crowd, crowdPositions, FRACTURE_PIECE_CAP.fortified), [], 'within a fortified kind\'s cap');
console.log(`fractureAnatomy.selftest: a sound lean-to passes; ${12} broken variants and an over-cap kind are each named`);
