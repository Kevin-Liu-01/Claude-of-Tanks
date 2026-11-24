// Release 276 (cn-turrets-276; Kevin 2026-11-24: "clean up and redesign the vt 4a1 ztz 99a2 and ztz99a turrets which
// are a little messy esp with cheeks"): the closed-cheek receipt. Each of the three turrets lofts its shell, body and
// cheek modules, as one closed solid from its plan outline (chineseTurretOutlines.ts) and seats its face tiles on that
// solid's planar faces (chineseTurretSolid.ts). This receipt holds, per id:
//   - the solid is closed (every edge shared by exactly two triangles, once each way) with a positive volume, and so is
//     every part the gun channel's cut leaves of it (chineseGunOpening.ts);
//   - every cheek face (front and outer, each course) is planar;
//   - every tile of the built tank is a closed block whose underside lies on its own face, inside it, sunk 0-6 mm (no
//     daylight under a tile, no tile hanging past its face), and no tile reaches into another;
//   - the cheek corners are vertices of the built turret shell, so the cheek and the body share their faces (no join).
// Planted controls (each must fail): a solid with one triangle dropped, a face twisted 5 mm, a tile lifted 8 mm off its
// face, a tile slid past its face's edge, and two tiles overlapping.
import assert from 'node:assert/strict';
import '../../../tools/tank-surface-collect.mjs';
import { Vector3 } from 'three';
import { createTank } from '../tankFactory.ts';
import { addChineseThroatStock } from './chineseGunOpening.ts';
import { CHINESE_TURRET_OUTLINES, cheekFaceQuad } from './chineseTurretOutlines.ts';
import { outlineSolid } from './chineseTurretSolid.ts';

const GUN_Z = { ztz99a2: 0.78, ztz99a: 0.75, vt4a1: 0.75 };
const TILES = { ztz99a2: 36, ztz99a: 8, vt4a1: 8 };

/** Edges not shared by exactly two triangles in opposite directions, and the signed volume. */
function closure(geometry) {
  const p = geometry.getAttribute('position'), directed = new Map();
  const key = (i) => [p.getX(i), p.getY(i), p.getZ(i)].map((n) => n.toFixed(5)).join(',');
  let volume = 0;
  for (let i = 0; i < p.count; i += 3) {
    const a = new Vector3().fromBufferAttribute(p, i), b = new Vector3().fromBufferAttribute(p, i + 1);
    const c = new Vector3().fromBufferAttribute(p, i + 2);
    volume += a.dot(b.clone().cross(c)) / 6;
    for (let j = 0; j < 3; j++) {
      const u = key(i + j), v = key(i + (j + 1) % 3);
      if (u === v) continue;
      directed.set(`${u}>${v}`, (directed.get(`${u}>${v}`) || 0) + 1);
    }
  }
  let bad = 0;
  for (const [edge, uses] of directed) {
    const [u, v] = edge.split('>');
    if (uses !== 1 || directed.get(`${v}>${u}`) !== 1) bad++;
  }
  return { bad, volume };
}

function assertClosed(label, geometry) {
  const { bad, volume } = closure(geometry);
  assert.equal(bad, 0, `${label}: ${bad} edges not shared by exactly two triangles, once each way`);
  assert(volume > 0, `${label}: positive volume, outward winding (${volume.toFixed(4)})`);
}

const vec = (p) => new Vector3(p[0], p[1], p[2]);
function planeOf(q) {
  const [a, b, , d] = q.map(vec);
  const n = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
  return { n, a };
}
function twistM(q) {
  const [a, b, c, d] = q.map(vec), n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  return Math.abs(d.clone().sub(a).dot(n));
}
function assertPlanar(label, q) {
  const t = twistM(q);
  assert(t < 5e-5, `${label}: face is planar (${(t * 1000).toFixed(3)} mm out of plane)`);
}

/** Whether point p lies inside the convex quad q (within tol, in the quad's plane). */
function insideQuad(q, p, tol) {
  const pts = q.map(vec), { n } = planeOf(q);
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], edgeIn = n.clone().cross(b.clone().sub(a)).normalize();
    const centre = pts.reduce((s, v) => s.add(v), new Vector3()).multiplyScalar(0.25);
    const sign = Math.sign(centre.clone().sub(a).dot(edgeIn)) || 1;
    if (sign * p.clone().sub(a).dot(edgeIn) < -tol) return false;
  }
  return true;
}

/** A tile's seat on the face it belongs to: the underside's depth into the face (m, +: sunk) at each of its four bottom
 * corners, and whether all four lie inside the face. */
function tileSeat(o, record) {
  const q = cheekFaceQuad(o, record.side, record.face, record.course), { n, a } = planeOf(q);
  const out = vec(record.normal), sign = Math.sign(n.dot(out)) || 1;
  const bottom = record.corners.slice(0, 4).map(vec);
  const depths = bottom.map((p) => -sign * p.clone().sub(a).dot(n));
  const projected = bottom.map((p) => p.clone().addScaledVector(n, -p.clone().sub(a).dot(n)));
  return { depths, inside: projected.every((p) => insideQuad(q, p, 1e-4)) };
}
function assertSeated(label, o, record) {
  const { depths, inside } = tileSeat(o, record);
  assert(depths.every((d) => d >= -0.0005 && d <= 0.006),
    `${label}: tile underside sits on its face, sunk 0-6 mm (${depths.map((d) => (d * 1000).toFixed(1)).join(', ')} mm)`);
  assert(inside, `${label}: tile stands inside its face (none hangs past an edge)`);
}

/** The six outward planes of a convex eight-corner block (bottom 0-3, top 4-7). */
function blockPlanes(corners) {
  const c = corners.map(vec), centre = c.reduce((s, v) => s.add(v), new Vector3()).multiplyScalar(1 / 8);
  return [[0, 1, 2], [4, 5, 6], [0, 1, 5], [1, 2, 6], [2, 3, 7], [3, 0, 4]].map(([i, j, k]) => {
    const n = c[j].clone().sub(c[i]).cross(c[k].clone().sub(c[i])).normalize();
    if (n.dot(centre.clone().sub(c[i])) > 0) n.negate();
    return { n, a: c[i] };
  });
}
/** Whether any of a 3 x 3 x 3 grid of interior points of block A (trilinear in its corners) lies inside block B by more
 * than tol. */
function blocksOverlap(A, B, tol = 0.001) {
  const planes = blockPlanes(B), c = A.map(vec), probes = [];
  const lerp = (p, q, t) => p.clone().lerp(q, t);
  for (const w of [0.25, 0.5, 0.75]) for (const u of [0.25, 0.5, 0.75]) for (const v of [0.25, 0.5, 0.75]) {
    const bottom = lerp(lerp(c[0], c[1], u), lerp(c[3], c[2], u), v), top = lerp(lerp(c[4], c[5], u), lerp(c[7], c[6], u), v);
    probes.push(lerp(bottom, top, w));
  }
  return probes.some((p) => planes.every(({ n, a }) => p.clone().sub(a).dot(n) < -tol));
}
function assertDisjoint(label, records) {
  for (let i = 0; i < records.length; i++) for (let j = i + 1; j < records.length; j++) {
    assert(!blocksOverlap(records[i].corners, records[j].corners) && !blocksOverlap(records[j].corners, records[i].corners),
      `${label}: tiles ${i} and ${j} do not reach into each other`);
  }
}

const report = [];
for (const [id, o] of Object.entries(CHINESE_TURRET_OUTLINES)) {
  // rings stacked upward with one correspondence
  for (let k = 1; k < o.rings.length; k++) {
    assert.equal(o.rings[k].length, o.rings[0].length, `${id}: ring ${k} keeps the vertex correspondence`);
    o.rings[k].forEach((p, i) => assert(p[1] >= o.rings[k - 1][i][1], `${id}: ring ${k} vertex ${i} stands on the ring under it`));
  }
  const solid = outlineSolid(o.rings);
  assertClosed(`${id} outline solid`, solid);
  const parts = [];
  addChineseThroatStock({ gunG: { position: { z: GUN_Z[id] } }, add: (_bucket, g) => parts.push(g) }, solid.clone());
  assert.equal(parts.length, 3, `${id}: the channel cut leaves two wall parts and the centre behind it`);
  parts.forEach((g, i) => assertClosed(`${id} channel-cut part ${i}`, g));
  const courses = o.section.underRun > 0 ? ['under', 'band', 'slope'] : ['band', 'slope'];
  for (const side of [-1, 1]) for (const face of ['front', 'outer']) for (const course of courses) {
    assertPlanar(`${id} ${side > 0 ? 'R' : 'L'} ${face} ${course}`, cheekFaceQuad(o, side, face, course));
  }

  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  try {
    const turretRig = tank.root.getObjectByName('rig_turret');
    const records = turretRig.userData.cheekTileRecords;
    assert.equal(records?.length, TILES[id], `${id}: ${TILES[id]} face tiles are built and recorded`);
    records.forEach((r, i) => assertSeated(`${id} tile ${i} (${r.side > 0 ? 'R' : 'L'} ${r.face} ${r.course})`, o, r));
    assertDisjoint(id, records);
    // the cheek and body share their faces: the outline's roof corners are vertices of the built turret shell
    const shell = tank.root.getObjectByName('turret').geometry.getAttribute('position'), roof = o.rings.at(-1);
    const half = (roof.length + 2) / 2;
    for (const k of [2, 3]) for (const side of [-1, 1]) {
      const want = roof[side > 0 ? k : 2 * half - 2 - k];
      let found = false;
      for (let i = 0; i < shell.count && !found; i++) {
        found = Math.abs(shell.getX(i) - want[0]) < 1e-4 && Math.abs(shell.getY(i) - want[1]) < 1e-4
          && Math.abs(shell.getZ(i) - want[2]) < 1e-4;
      }
      assert(found, `${id}: the built turret shell carries the cheek's roof corner ${want.join(',')}`);
    }

    // ---- planted controls: each defect must be caught
    if (id === 'ztz99a2') {
      const dropped = solid.clone(), pos = dropped.getAttribute('position');
      dropped.setAttribute('position', new pos.constructor(pos.array.slice(0, pos.array.length - 9), 3));
      assert.throws(() => assertClosed('control: dropped triangle', dropped), assert.AssertionError, 'control: an open solid is caught');
      const q = cheekFaceQuad(o, 1, 'front', 'slope').map((p) => [...p]);
      q[3][2] += 0.005;
      assert.throws(() => assertPlanar('control: twisted face', q), assert.AssertionError, 'control: a 5 mm twist is caught');
      const lifted = { ...records[0], corners: records[0].corners.map((p) => p.map((v, k) => v + records[0].normal[k] * 0.008)) };
      assert.throws(() => assertSeated('control: lifted tile', o, lifted), assert.AssertionError, 'control: an 8 mm gap under a tile is caught');
      const fq = cheekFaceQuad(o, records[0].side, records[0].face, records[0].course).map(vec);
      const along = fq[1].clone().sub(fq[0]).normalize();
      const slid = { ...records[0], corners: records[0].corners.map((p) => p.map((v, k) => v - along.getComponent(k) * 0.08)) };
      assert.throws(() => assertSeated('control: slid tile', o, slid), assert.AssertionError, 'control: a tile past its face edge is caught');
      const twin = { ...records[1], corners: records[1].corners.map((p, i) => p.map((v, k) => (v + records[0].corners[i][k]) / 2)) };
      assert.throws(() => assertDisjoint('control: overlapping tiles', [records[0], twin]), assert.AssertionError, 'control: overlapping tiles are caught');
    }
  } finally { tank.dispose(); }
  report.push(`${id} ${TILES[id]} tiles`);
}
console.log(`chineseTurretCheeks.selftest: closed outline solids, planar cheek faces, seated and disjoint tiles (${report.join(', ')}), five planted controls caught PASS`);
