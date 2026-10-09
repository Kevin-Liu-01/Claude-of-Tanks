// Accessory contact receipt (tank-accessories round 5, 2026-10-08; the coordinator after wave 253: "extend your support
// audit so any accessory triangle more than a few mm from its support fails ... make it a receipt, so nothing floats
// again"). Every connected piece of the accessory geometry (decor under rig_decor_*, and every FITTINGS group) on the
// critics' wave tanks and a fixed fleet sample must touch the rest of the vehicle: the nearest distance from its
// vertices to any other piece's triangles is at most 15 mm (a gap a close-up shows as daylight). Ghillie suits are
// measured by their own receipts.
//
// The round-4 census found 64 pieces that touch nothing by that vertex measure (contact occlusion quads riding 5 cm
// above a turret roof, a 2.4 m rack rail with nothing within 10 cm, RWS covers and remote-gun parts on standoffs that
// were never modelled, light-cluster guards, tow cables). KNOWN_FLOATING is a ratchet: a tank may not gain a floating
// piece, and every fix lowers its entry; round 5 drives it to zero.
//
// Round 5 (2026-10-08, the props helper with the coordinator): the vertex measure missed contact along an edge. A piece
// whose vertices all lie more than 15 mm from every other piece can still lie along a surface (a gasket band round a
// rounded case) or cross one (a smoke-bank bracket set diagonally into the turret cheek), so its edges are sampled
// every 3 cm as well: 51 of the 64 were in contact, 13 really float. A piece in contact only because an edge crosses
// another piece's triangle is CLIPPING (flasks standing through a closed crate lid, a tool handle through a solid clamp
// block, a foot plate cut into a sloped plate, a pad tilted through a crowned roof): that is a defect of its own, held
// by its own ratchet (KNOWN_CLIPPING), so a fix in geometry can't come back unseen.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const TOUCH_M = 0.015;
const CELL_M = 0.1;
/** Edge sample spacing (m): a crossing lies within half of it of a sample, so within TOUCH_M of the surface it crosses. */
const SAMPLE_M = 0.03;
// the waves' close-up tanks, the weathering wave's Leopard 2A6, and every 24th fleet id (ALL_TANK_IDS index 7, 31, ...)
const IDS = Object.freeze([
  'm1a2_sepv3', 'leo2a4', 't90m_proryv', 'ua_t84_oplot_m', 'challenger1', 'm60a1', 'type99a', 'pt91_twardy', 'strv103a',
  'leclerc', 'merkava4_trophy', 't72b3m', 'm1a2_tusk', 'leo2a6',
  'abramsx', 'cv90_x', 'bmp2', 'leo2_revolution', 'fv510_milan', 'm46_patton', 'bmp3m_dragun125_x', 't62mv1_x', 'griffin_viper',
]);
// the ratchets: floating and clipping accessory pieces per tank; any other tank is held to 0. Round 4's census at
// fcc68d78b (cell borders searched, edges sampled) found 13 and 49; round 5's stowage pass (2026-10-08) took them to 12
// and 22: smoke brackets laid on the cheek, hung loads' wall feet under their arms, cans racks' straps clear of the
// cans, tool and cable clamps under straps, the bucket's ears on its wall, the crate's flasks under its lid.
// 2026-10-08, over push 3b (main's 5f8eefaa4 field upgrades): the Oplot-M's floating fender piece is gone (1 -> 0), and
// its clipping took 4 -> 8: the three overlaps main's own roof station is built with (the muzzle sleeve over the barrel,
// the trunnions through the cradle shroud, the ammunition-box lid seated on the box; a station is a fitting, so this
// receipt reads it) and the second decor smoke bank, which main's screens and cage-wing legs moved forward along the
// cheek, its bracket set into the armour like every other bank's (round 5's seat lays it flush there too).
// 2026-10-08 (round 5, the guns helper over the lane head 5729f2d5b): the gun and weapon-station pieces are seated
// (699f6c176, 8c6fca407, cb11de6ba): floating abramsx 8 -> 0, bmp3m_dragun125_x 2 -> 0; clipping abramsx 8 -> 1,
// bmp3m_dragun125_x 2 -> 1, t62mv1_x 2 -> 0, t90m_proryv 1 -> 0, t72b3m 7 -> 6 (the station's Kord replaces the 0.8 m
// bar). What remains is decor, tow cables, racks, jerrycans, light guards and the Oplot-M's own roof station.
// 2026-10-08, round 5's stowage batches 2a and 2b over 3b and the guns helper's head 863dd3711 (side loads clear the
// turret, banks seated to their wall, decor kept off the guns' bodies; tow-cable eyes, lamp guards, the can strap and
// the rack crate): floating 0, clipping 6 (23 tanks), measured on the merged tree.
const KNOWN_FLOATING = Object.freeze({});
// 2026-10-09 (launch RC): the field roof station's parts are seated face to face (profiles/fieldRoofWeapon.ts), which
// clears leo2_revolution's 30 mm station (3, never ratcheted) and the Oplot-M's 12.7 mm one (3), and zero-area triangles
// no longer turn a distance into NaN, which had held the Oplot-M's pair of banks ahead of its side screens as clipping:
// the Oplot-M 5 -> 0
const KNOWN_CLIPPING = Object.freeze({
  // the bank no wall seat backs, which keeps the old fan so its sockets hold: the T-72B3M's left (+X) bank
  t72b3m: 1,
});

function accessoryKind(object) {
  let kind = null;
  for (let p = object; p; p = p.parent) {
    if (/^rig_decor_/.test(p.name || '')) kind = 'decor';
    if (p.userData?.fittingRoot) kind = kind || `fitting:${p.userData.fitting}`;
  }
  return /_ghillie_/.test(object.name) ? null : kind;
}

/**
 * The accessory pieces of one built tank that touch nothing within TOUCH_M (floating), and those in contact only because
 * an edge crosses another piece's triangle (clipping).
 */
function contactCensus(root) {
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
      if (!local.has(r)) { local.set(r, pieces.length); pieces.push({ mesh: o.name, kind, verts: [], tris: [], box: new THREE.Box3() }); }
      const piece = pieces[local.get(r)]; piece.verts.push(world[i]); piece.box.expandByPoint(world[i]);
    }
    for (let t = 0; t < corners; t += 3) {
      const piece = local.get(find(at(t)));
      pieces[piece].tris.push(tris.length);
      tris.push({ piece, a: world[at(t)], b: world[at(t + 1)], c: world[at(t + 2)] });
    }
  });
  const grid = new Map();
  const cell = (v) => grid.get(`${Math.floor(v.x / CELL_M)},${Math.floor(v.y / CELL_M)},${Math.floor(v.z / CELL_M)}`) ?? [];
  tris.forEach((t, i) => {
    // 2026-10-09 (launch RC): a zero-area triangle (the collapsed centre of a fan-capped tube, measuredPrimitives'
    // blindTube) has no surface to touch or cross, and its closest point is NaN, which made every distance it entered NaN
    // (leo2_revolution's 30 mm station barrel was reported as clipping, "nearest > 10 cm")
    if (new THREE.Triangle(t.a, t.b, t.c).getArea() < 1e-12) return;
    // registered in every cell within TOUCH_M of the triangle, so a vertex finds a triangle across a cell border
    const box = new THREE.Box3().setFromPoints([t.a, t.b, t.c]).expandByScalar(TOUCH_M);
    for (let x = Math.floor(box.min.x / CELL_M); x <= Math.floor(box.max.x / CELL_M); x++)
      for (let y = Math.floor(box.min.y / CELL_M); y <= Math.floor(box.max.y / CELL_M); y++)
        for (let z = Math.floor(box.min.z / CELL_M); z <= Math.floor(box.max.z / CELL_M); z++) {
          const key = `${x},${y},${z}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(i);
        }
  });
  const triangle = new THREE.Triangle(), closest = new THREE.Vector3(), q = new THREE.Vector3();
  const ray = new THREE.Ray(), hit = new THREE.Vector3(), dir = new THREE.Vector3();
  const floating = [], clipping = [];
  pieces.forEach((piece, pi) => {
    if (!piece.kind) return;
    let best = Infinity;
    for (const v of piece.verts) {
      for (const ti of cell(v)) {
        const t = tris[ti]; if (t.piece === pi) continue;
        triangle.set(t.a, t.b, t.c); triangle.closestPointToPoint(v, closest);
        best = Math.min(best, v.distanceTo(closest));
        if (best <= TOUCH_M) break;
      }
      if (best <= TOUCH_M) break;
    }
    if (best <= TOUCH_M) return;
    // every edge sampled every SAMPLE_M: a sample within TOUCH_M of another piece is contact along that edge; an edge
    // that crosses another piece's triangle is contact by clipping
    let crosses = false;
    for (const ti0 of piece.tris) {
      const t0 = tris[ti0];
      for (const [p0, p1] of [[t0.a, t0.b], [t0.b, t0.c], [t0.c, t0.a]]) {
        const len = p0.distanceTo(p1);
        if (len < 1e-6) continue;
        dir.subVectors(p1, p0).divideScalar(len);
        ray.set(p0, dir);
        const steps = Math.max(1, Math.ceil(len / SAMPLE_M));
        for (let k = 0; k <= steps; k++) {
          q.lerpVectors(p0, p1, k / steps);
          for (const ti of cell(q)) {
            const t = tris[ti]; if (t.piece === pi) continue;
            triangle.set(t.a, t.b, t.c); triangle.closestPointToPoint(q, closest);
            best = Math.min(best, q.distanceTo(closest));
            if (!crosses && ray.intersectTriangle(t.a, t.b, t.c, false, hit) && hit.distanceTo(p0) <= len) crosses = true;
          }
        }
      }
    }
    if (best > TOUCH_M) floating.push({ ...piece, gap: best });
    else if (crosses) clipping.push({ ...piece, gap: best });
  });
  return { checked: pieces.filter((p) => p.kind).length, floating, clipping };
}

const warn = console.warn;
console.warn = () => {};
const restoreCanvas = installCanvasFixture();
const counts = {}, clips = {};
const report = [];
let checked = 0;
const line = (id, what, f) => {
  const c = f.box.getCenter(new THREE.Vector3());
  return `${id} ${what} ${f.kind} ${f.mesh} at ${c.toArray().map((x) => x.toFixed(2)).join(',')}: nearest ${Number.isFinite(f.gap) ? `${(f.gap * 100).toFixed(1)} cm` : '> 10 cm'}`;
};
try {
  for (const id of IDS) {
    const tank = createTank(id, null, { camoSeed: 4242, quality: 'high', decor: true, staticPreview: true });
    try {
      const result = contactCensus(tank.root);
      checked += result.checked;
      counts[id] = result.floating.length;
      clips[id] = result.clipping.length;
      for (const f of result.floating) report.push(line(id, 'floating', f));
      for (const f of result.clipping) report.push(line(id, 'clipping', f));
    } finally { tank.dispose(); }
  }
} finally { restoreCanvas(); console.warn = warn; }
if (process.env.ACCESSORY_CONTACT_PRINT) console.log(JSON.stringify({ floating: counts, clipping: clips }), '\n' + report.join('\n'));
for (const id of IDS) {
  assert.ok((counts[id] ?? 0) <= (KNOWN_FLOATING[id] ?? 0),
    `${id}: ${counts[id]} accessory piece(s) touch nothing within ${TOUCH_M * 1000} mm (known ${KNOWN_FLOATING[id] ?? 0}):\n  `
    + report.filter((entry) => entry.startsWith(`${id} floating `)).join('\n  '));
  assert.ok((clips[id] ?? 0) <= (KNOWN_CLIPPING[id] ?? 0),
    `${id}: ${clips[id]} accessory piece(s) touch only by crossing another piece's surface (known ${KNOWN_CLIPPING[id] ?? 0}):\n  `
    + report.filter((entry) => entry.startsWith(`${id} clipping `)).join('\n  '));
}
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
console.log(`accessoryContact: ${IDS.length} tanks, ${checked} accessory pieces, ${sum(counts)} touch nothing within ${TOUCH_M * 1000} mm (ratchet ${sum(KNOWN_FLOATING)}), ${sum(clips)} touch only by clipping (ratchet ${sum(KNOWN_CLIPPING)})`);
