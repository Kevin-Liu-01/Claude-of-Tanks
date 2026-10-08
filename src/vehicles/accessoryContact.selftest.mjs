// Accessory contact receipt (tank-accessories round 5, 2026-10-08; the coordinator after wave 253: "extend your support
// audit so any accessory triangle more than a few mm from its support fails ... make it a receipt, so nothing floats
// again"). Every connected piece of the accessory geometry (decor under rig_decor_*, and every FITTINGS group) on the
// critics' wave tanks and a fixed fleet sample must touch the rest of the vehicle: the nearest distance from its
// vertices to any other piece's triangles is at most 15 mm (a gap a close-up shows as daylight). Ghillie suits are
// measured by their own receipts.
//
// The round-4 census found 64 pieces that touch nothing (contact occlusion quads riding 5 cm above a turret roof, a
// 2.4 m rack rail with nothing within 10 cm, RWS covers and remote-gun parts on standoffs that were never modelled,
// light-cluster guards, tow cables). KNOWN_FLOATING is a ratchet: a tank may not gain a floating piece, and every fix
// lowers its entry; round 5 drives it to zero.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const TOUCH_M = 0.015;
const CELL_M = 0.1;
// the waves' close-up tanks, the weathering wave's Leopard 2A6, and every 24th fleet id (ALL_TANK_IDS index 7, 31, ...)
const IDS = Object.freeze([
  'm1a2_sepv3', 'leo2a4', 't90m_proryv', 'ua_t84_oplot_m', 'challenger1', 'm60a1', 'type99a', 'pt91_twardy', 'strv103a',
  'leclerc', 'merkava4_trophy', 't72b3m', 'm1a2_tusk', 'leo2a6',
  'abramsx', 'cv90_x', 'bmp2', 'leo2_revolution', 'fv510_milan', 'm46_patton', 'bmp3m_dragun125_x', 't62mv1_x', 'griffin_viper',
]);
// the ratchet (2026-10-08, round 4's census at 31247cc05, cell borders searched): floating accessory pieces per tank; any other tank is held to 0
// 2026-10-08 (round 5, guns helper): the gun and weapon-station pieces are seated (m1a2_sepv3 1 -> 0, t90m_proryv 1 -> 0,
// abramsx 17 -> 1, t72b3m 7 -> 6, bmp3m_dragun125_x 4 -> 1, t62mv1_x 2 -> 0); the rest are decor and props.
const KNOWN_FLOATING = Object.freeze({
  leo2a4: 2, ua_t84_oplot_m: 5, challenger1: 2, m60a1: 1, type99a: 1, leclerc: 1,
  merkava4_trophy: 2, t72b3m: 6, m1a2_tusk: 1, leo2a6: 2, abramsx: 1, cv90_x: 2, fv510_milan: 3, m46_patton: 8,
  bmp3m_dragun125_x: 1, griffin_viper: 2,
});

function accessoryKind(object) {
  let kind = null;
  for (let p = object; p; p = p.parent) {
    if (/^rig_decor_/.test(p.name || '')) kind = 'decor';
    if (p.userData?.fittingRoot) kind = kind || `fitting:${p.userData.fitting}`;
  }
  return /_ghillie_/.test(object.name) ? null : kind;
}

/** The accessory pieces of one built tank that touch nothing within TOUCH_M. */
function floatingPieces(root) {
  root.traverse((o) => { if (o.isLOD && o.levels?.length) o.levels.forEach((level, i) => { level.object.visible = i === 0; }); });
  root.updateMatrixWorld(true);
  const tris = [], pieces = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry?.attributes?.position || /procShadow/.test(o.name)) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    const kind = accessoryKind(o);
    const pos = o.geometry.attributes.position, index = o.geometry.index, n = pos.count;
    const parent = new Int32Array(n).map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const welded = new Map();
    for (let i = 0; i < n; i++) {
      const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
      if (welded.has(key)) parent[find(i)] = find(welded.get(key)); else welded.set(key, i);
    }
    const corners = index ? index.count : n;
    const at = (t) => (index ? index.getX(t) : t);
    for (let t = 0; t < corners; t += 3) { parent[find(at(t + 1))] = find(at(t)); parent[find(at(t + 2))] = find(at(t)); }
    const world = Array.from({ length: n }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    const local = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!local.has(r)) { local.set(r, pieces.length); pieces.push({ mesh: o.name, kind, verts: [], box: new THREE.Box3() }); }
      const piece = pieces[local.get(r)]; piece.verts.push(world[i]); piece.box.expandByPoint(world[i]);
    }
    for (let t = 0; t < corners; t += 3) tris.push({ piece: local.get(find(at(t))), a: world[at(t)], b: world[at(t + 1)], c: world[at(t + 2)] });
  });
  const grid = new Map();
  tris.forEach((t, i) => {
    // registered in every cell within TOUCH_M of the triangle, so a vertex finds a triangle across a cell border
    const box = new THREE.Box3().setFromPoints([t.a, t.b, t.c]).expandByScalar(TOUCH_M);
    for (let x = Math.floor(box.min.x / CELL_M); x <= Math.floor(box.max.x / CELL_M); x++)
      for (let y = Math.floor(box.min.y / CELL_M); y <= Math.floor(box.max.y / CELL_M); y++)
        for (let z = Math.floor(box.min.z / CELL_M); z <= Math.floor(box.max.z / CELL_M); z++) {
          const key = `${x},${y},${z}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(i);
        }
  });
  const triangle = new THREE.Triangle(), closest = new THREE.Vector3();
  const out = [];
  pieces.forEach((piece, pi) => {
    if (!piece.kind) return;
    let best = Infinity;
    for (const v of piece.verts) {
      for (const ti of grid.get(`${Math.floor(v.x / CELL_M)},${Math.floor(v.y / CELL_M)},${Math.floor(v.z / CELL_M)}`) ?? []) {
        const t = tris[ti]; if (t.piece === pi) continue;
        triangle.set(t.a, t.b, t.c); triangle.closestPointToPoint(v, closest);
        best = Math.min(best, v.distanceTo(closest));
        if (best <= TOUCH_M) break;
      }
      if (best <= TOUCH_M) break;
    }
    if (best > TOUCH_M) out.push({ ...piece, gap: best });
  });
  return { checked: pieces.filter((p) => p.kind).length, floating: out };
}

const warn = console.warn;
console.warn = () => {};
const restoreCanvas = installCanvasFixture();
const counts = {};
const report = [];
let checked = 0;
try {
  for (const id of IDS) {
    const tank = createTank(id, null, { camoSeed: 4242, quality: 'high', decor: true, staticPreview: true });
    try {
      const result = floatingPieces(tank.root);
      checked += result.checked;
      counts[id] = result.floating.length;
      for (const f of result.floating) {
        const c = f.box.getCenter(new THREE.Vector3());
        report.push(`${id} ${f.kind} ${f.mesh} at ${c.toArray().map((x) => x.toFixed(2)).join(',')}: nearest ${Number.isFinite(f.gap) ? `${(f.gap * 100).toFixed(1)} cm` : '> 10 cm'}`);
      }
    } finally { tank.dispose(); }
  }
} finally { restoreCanvas(); console.warn = warn; }
if (process.env.ACCESSORY_CONTACT_PRINT) console.log(JSON.stringify(counts));
for (const id of IDS) {
  assert.ok((counts[id] ?? 0) <= (KNOWN_FLOATING[id] ?? 0),
    `${id}: ${counts[id]} accessory piece(s) touch nothing within ${TOUCH_M * 1000} mm (known ${KNOWN_FLOATING[id] ?? 0}):\n  `
    + report.filter((line) => line.startsWith(`${id} `)).join('\n  '));
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);
const known = Object.values(KNOWN_FLOATING).reduce((a, b) => a + b, 0);
console.log(`accessoryContact: ${IDS.length} tanks, ${checked} accessory pieces, ${total} touch nothing within ${TOUCH_M * 1000} mm (ratchet ${known})`);
