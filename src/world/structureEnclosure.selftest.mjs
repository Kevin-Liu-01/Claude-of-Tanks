// structureEnclosure.selftest.mjs — one drawn enclosure per structure, and the damage writers that place against it
// (destruction-slabs 227, 2026-10-17; the owner, of Verdant's church in battle: "for building destruction, these weird
// ugly boxes/surfaces still randomly come up. fix").
//
// Synthetic and fast. A house of walls (10 x 6 m, 3 m storeys, a door) encloses its plan: its interior is its rooms, its
// faces' setbacks read its walls (0 on a face that is its wall, the true distance on a face of a bigger box, NaN past
// it), its storey room is the walls' inside (never the box's). A forecourt slab and a canopy's valance enclose nothing;
// an open frame's posts and braces enclose nothing (no room); a court open to the sky gets no ceiling over it; an
// L-shaped hall's room follows the L. And the source rule (docs/DESTRUCTION.md §18): the room, floor and ruin writers
// place through structureEnclosure, never off the anatomy's w x d or the faces' rectangles alone.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  enclosedAt, faceSetback, measureEnclosure, standsOnPosts, storeyInterior, wallAlong, wallClusters, wallTopAt,
} from './structureEnclosure.ts';

/** A box's 12 triangles (non-indexed) into a geometry. */
function boxGeo(x0, y0, z0, x1, y1, z1, userData = {}) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  Object.assign(g.userData, userData);
  return g;
}
/** A flat horizontal quad (a slab, a roof deck). */
function deck(x0, z0, x1, z1, y) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).toNonIndexed();
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return g;
}
/** Anatomy storeys over a box (x0..x1, z0..z1): faces as the default kit lays them. */
function storeys(x0, x1, z0, z1, heights) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  let y = 0;
  return heights.map((h, i) => {
    const y0 = y; y += h;
    const faces = [
      { name: 'front', origin: [cx, y0, z1], u: [1, 0, 0], out: [0, 0, 1], width: w, height: h },
      { name: 'right', origin: [x1, y0, cz], u: [0, 0, -1], out: [1, 0, 0], width: d, height: h },
      { name: 'back', origin: [cx, y0, z0], u: [-1, 0, 0], out: [0, 0, -1], width: w, height: h },
      { name: 'left', origin: [x0, y0, cz], u: [0, 0, 1], out: [-1, 0, 0], width: d, height: h },
    ].map((f, k) => ({ ...f, section: i * 4 + k, bucket: 'stone', layers: [{ material: 'stone', bucket: 'stone', tint: [1, 1, 1], thicknessM: 0.4, share: 1 }],
      openings: [], members: [], masonry: null }));
    return { index: i, y0, y1: y, jetty: [0, 0, 0, 0], framed: false, faces, floor: i ? { thicknessM: 0.22, structure: { material: 'timber', bucket: 'wood', tint: [1, 1, 1], thicknessM: 0.22, share: 1 }, joistPitchM: 0.6 } : null };
  });
}
/** A house's walls: 10 x 6 m, 0.3 m thick, `h` high, a 1.2 m door in its front. */
function houseWalls(h, door = true) {
  const t = 0.3;
  const front = door ? [boxGeo(-5, 0, 2.7, -0.6, h, 3), boxGeo(0.6, 0, 2.7, 5, h, 3), boxGeo(-0.6, 2.2, 2.7, 0.6, h, 3)] : [boxGeo(-5, 0, 2.7, 5, h, 3)];
  return [...front, boxGeo(-5, 0, -3, 5, h, -3 + t), boxGeo(-5, 0, -3, -5 + t, h, 3), boxGeo(5 - t, 0, -3, 5, h, 3)];
}

// ---- a house: its plan enclosed, its faces its walls --------------------------------------------------------------
{
  const parts = { stone: houseWalls(6), roof: [deck(-5.5, -3.5, 5.5, 3.5, 6.1)], glass: [] };
  const a = { storeys: storeys(-5, 5, -3, 3, [3, 3]) };
  const enc = measureEnclosure(parts, a);
  a.enclosure = enc;
  assert.ok(enc && enc.bands.length === 2, 'two bands');
  for (const b of enc.bands) {
    assert.ok(b.share > 0.85, `the house encloses its plan (share ${b.share.toFixed(2)})`);
    assert.ok(Math.abs(b.interiorBox[0] + 4.7) < 0.8 && Math.abs(b.interiorBox[2] - 4.7) < 0.8, `its interior is inside its walls (${[...b.interiorBox].map((v) => v.toFixed(2))})`);
  }
  // the faces are its walls: setback 0 (within a cell), the door's stretch included (the lintel stands over it)
  for (const u of [-4, -2, 0, 2, 4]) {
    const sb = faceSetback(a, 0, 0, u);
    assert.ok(Number.isFinite(sb) && Math.abs(sb) < 0.4, `front face setback at u ${u}: ${sb}`);
  }
  assert.equal(enclosedAt(a, 0, 0, 0), true, 'the middle is enclosed');
  assert.equal(enclosedAt(a, 0, 6, 0), false, 'the yard is not');
  assert.ok(Math.abs(wallTopAt(a, -5, 0) - 6) < 0.2, `the walls' top is drawn at 6 m (${wallTopAt(a, -5, 0)})`);
  // the room behind a hole in the front wall: the walls' inside, under the roof, its ceiling under the storey's top
  const room = storeyInterior(a, 0, 0, 2);
  assert.ok(room, 'a room is laid behind the hole');
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [ax, az, bx, bz] of room.rects) { x0 = Math.min(x0, ax); x1 = Math.max(x1, bx); z0 = Math.min(z0, az); z1 = Math.max(z1, bz); }
  assert.ok(x0 >= -5 && x1 <= 5 && z0 >= -3 && z1 <= 3, `the room stands inside the walls (${[x0, z0, x1, z1].map((v) => v.toFixed(2))})`);
  assert.ok((x1 - x0) * (z1 - z0) > 40, 'and fills them');
  assert.ok(room.y1 <= 3 && room.y1 > 2, `its ceiling under the storey's top (${room.y1.toFixed(2)})`);
  assert.ok(room.walls.length >= 4, 'its walls face in along its boundary');
  for (const [, , , , nx, nz] of room.walls) assert.ok(Math.abs(Math.hypot(nx, nz) - 1) < 1e-9, 'wall normals are level units');
}

// ---- the same house read by a box 4 m too wide at the front (a forecourt's): the setback finds the wall ----------
{
  const parts = { stone: [...houseWalls(3, false), deck(-8, 3, 8, 9, 0.12)], roof: [deck(-5.5, -3.5, 5.5, 3.5, 3.1)] };
  const a = { storeys: storeys(-8, 8, -3, 7, [3]) };
  const enc = measureEnclosure(parts, a);
  a.enclosure = enc;
  const sb = faceSetback(a, 0, 0, 0);
  assert.ok(Math.abs(sb - 4) < 0.45, `the front face 4 m proud of the wall reads its setback (${sb})`);
  assert.ok(!Number.isFinite(faceSetback(a, 0, 0, -7)), 'past the wall\'s end the face has none (NaN)');
  assert.equal(enclosedAt(a, 0, 5, 0), false, 'the forecourt slab encloses nothing');
  const room = storeyInterior(a, 0, 0, 1.5);
  assert.ok(room, 'a room behind the drawn wall');
  for (const [, az, , bz] of room.rects) assert.ok(az >= -3 && bz <= 3, `the room stays inside the walls, off the forecourt (z ${az}..${bz})`);
  // a ruin's stub meant for the box's edge stands on the drawn wall in from it
  const d = wallAlong(a, 0, 0, 7, 0, -1, 8);
  assert.ok(Math.abs(d - 4) < 0.5, `in from the box's edge to the wall: ${d}`);
}

// ---- a canopy's valance and its posts enclose nothing; an open frame gets no room ---------------------------------
{
  const posts = [];
  for (const x of [-4, 0, 4]) for (const z of [-2, 2]) posts.push(boxGeo(x - 0.12, 0, z - 0.12, x + 0.12, 3, z + 0.12));
  const valance = [boxGeo(-4.5, 2.7, -2.5, 4.5, 3, -2.45), boxGeo(-4.5, 2.7, 2.45, 4.5, 3, 2.5), boxGeo(-4.5, 2.7, -2.5, -4.45, 3, 2.5), boxGeo(4.45, 2.7, -2.5, 4.5, 3, 2.5)];
  // diagonal braces between the posts along each side (thin)
  const braces = [];
  for (const z of [-2, 2]) for (const [xa, xb] of [[-4, 0], [0, 4]]) {
    const g = new THREE.BoxGeometry(Math.hypot(xb - xa, 3), 0.1, 0.1).toNonIndexed();
    g.rotateZ(Math.atan2(3, xb - xa)); g.translate((xa + xb) / 2, 1.5, z); braces.push(g);
  }
  const parts = { wood: [...posts, ...valance, ...braces], roof: [deck(-4.5, -2.5, 4.5, 2.5, 3.05)] };
  const a = { storeys: storeys(-4.5, 4.5, -2.5, 2.5, [3]) };
  a.enclosure = measureEnclosure(parts, a);
  assert.ok(a.enclosure.bands[0].share < 0.5, `a canopy on posts encloses nothing (share ${a.enclosure.bands[0].share.toFixed(2)})`);
  assert.equal(storeyInterior(a, 0, 0, 0), null, 'no room under a canopy');
  assert.ok(standsOnPosts(a), 'it reads as an open frame (on posts)');
  const legs = wallClusters(a, 0, 8);
  assert.ok(legs.length >= 4 && legs.every((c) => c.top > 2.5), `its own posts are its legs (${legs.length})`);
}

// ---- a ruin's ragged walls enclose little but are runs, not posts: no frame (round 2: the ruins read as frames) -------
{
  const t = 0.35;
  // three broken wall runs round a 6 x 8 m plan, gaps of 2-3 m between them, standing 1.5-4 m
  const walls = [boxGeo(-3, 0, -4, 0.5, 4, -4 + t), boxGeo(-3, 0, -4, -3 + t, 2.5, 1), boxGeo(3 - t, 0, -1, 3, 3, 4), boxGeo(-1, 0, 4 - t, 1.5, 1.5, 4)];
  const a = { storeys: storeys(-3, 3, -4, 4, [3, 6]) };
  a.enclosure = measureEnclosure({ stone: walls }, a);
  assert.ok(a.enclosure.bands.every((b) => b.share < 0.35), 'the broken shell encloses little');
  assert.equal(standsOnPosts(a), false, 'its walls are runs: a ruin, never a frame');
}

// ---- a court open to the sky: walls round it, no roof over it — its room has no ceiling there ----------------------
{
  const t = 0.3;
  const walls = [boxGeo(-6, 0, -6, 6, 3, -6 + t), boxGeo(-6, 0, 6 - t, 6, 3, 6), boxGeo(-6, 0, -6, -6 + t, 3, 6), boxGeo(6 - t, 0, -6, 6, 3, 6),
    // a wing along the west side, its inner wall with a door to the court
    boxGeo(-3, 0, -6, -3 + t, 3, -0.6), boxGeo(-3, 0, 0.6, -3 + t, 3, 6), boxGeo(-3, 2.2, -0.6, -3 + t, 3, 0.6)];
  const parts = { stone: walls, roof: [deck(-6.2, -6.2, -2.8, 6.2, 3.1)] };
  const a = { storeys: storeys(-6, 6, -6, 6, [3]) };
  a.enclosure = measureEnclosure(parts, a);
  const room = storeyInterior(a, 0, -4.5, 0);
  assert.ok(room, 'the wing has its room');
  for (const [, , bx] of room.rects) assert.ok(bx <= -2.5, `no floor or ceiling over the open court (rect to x ${bx})`);
}

// ---- an L-shaped hall: its room follows the L ------------------------------------------------------------------------
{
  const t = 0.3;
  const walls = [boxGeo(-6, 0, -4, 6, 4, -4 + t), boxGeo(-6, 0, -4, -6 + t, 4, 6), boxGeo(-6, 0, 6 - t, 0, 4, 6), boxGeo(-t, 0, 0, 0, 4, 6),
    boxGeo(0, 0, -t, 6, 4, 0), boxGeo(6 - t, 0, -4, 6, 4, 0)];
  const parts = { stone: walls, roof: [deck(-6, -4, 6, 0, 4.1), deck(-6, 0, 0, 6, 4.1)] };
  const a = { storeys: storeys(-6, 6, -4, 6, [4]) };
  a.enclosure = measureEnclosure(parts, a);
  const room = storeyInterior(a, 0, -3, 3);
  assert.ok(room, 'the L has a room');
  for (const [x0, z0, x1, z1] of room.rects) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    assert.ok(!(cx > 0.4 && cz > 0.4), `no part of the room in the L's notch (rect at ${cx.toFixed(1)}, ${cz.toFixed(1)})`);
  }
}

// ---- the source rule: the room, floor and ruin writers place through the enclosure ----------------------------------
{
  const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const body = (src, head) => {
    const at = src.indexOf(head);
    assert.ok(at >= 0, `${head} found`);
    // (the body's brace ends its line: a signature's type literal does not)
    let depth = 0, i = src.indexOf('{\n', at);
    const start = i;
    for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
    return src.slice(start, i + 1);
  };
  const noBox = (code, name) => assert.ok(!/\b(a|anatomy)\.(w|d)\b/.test(code), `${name} reads no anatomy w x d`);
  const stages = read('../fx/structureStages.ts'), fracture = read('../fx/structureFracture.ts'), bodies = read('../fx/collapseBodies.ts');
  const pieces = read('../fx/collapsePieces.ts'), ruin = read('./collapseRuin.ts');
  const li = body(stages, 'function layInterior(');
  assert.ok(/storeyInterior\(/.test(li), 'layInterior lays the drawn enclosure');
  noBox(li, 'layInterior');
  const rf = body(fracture, 'function roomFor(');
  assert.ok(/storeyInterior\(/.test(rf), 'the fracture\'s room is the drawn enclosure');
  noBox(rf, 'roomFor');
  const fr = body(bodies, 'function floorRecords(');
  assert.ok(/bandEnclosure\(/.test(fr), 'the collapse\'s floor records span the band\'s interior');
  assert.ok(/bandEnclosure\(anatomy, s \+ 1\)/.test(pieces), 'the collapse\'s floor pieces span the band\'s interior');
  for (const f of ['function cornerPiers(', 'function wallStubs(', 'function wallFragment(', 'function framePosts(']) {
    assert.ok(/inToWall\(/.test(body(ruin, f)), `${f.slice(9, -1)} stands on the drawn wall`);
  }
}

console.log('structureEnclosure selftest: a house encloses its plan (setbacks 0, room inside its walls); a box 4 m proud reads its setback, its room keeps off the forecourt; a canopy and a frame enclose nothing; a court has no ceiling; an L\'s room follows it; the writers place through the enclosure — ok');
