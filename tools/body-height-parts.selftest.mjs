// The geometry gate's dims rows measure the BODY (Main's ruling 2026-10-30): whips, antennas and roof weapons leave it,
// on the build and on the oracle alike (tools/body-height-parts.mjs). The gate's own side trace and body extent run on a
// CPU raster of a real build's side view: a 1 m whip added as a fitting, or drawn into a turret bucket under the
// 'antenna' seat role, leaves the measured height unchanged (negative controls), while raising the hull moves it. Main's
// later rulings: a published height is an interval (body top to roof-fittings top, whips out of both) and hull length
// comes from the hull's own trace, so a thick barrel column never counts as hull.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import '../src/vehicles/tankFactory.ts';
import { createTank } from '../src/vehicles/tankFactoryCore.ts';
import { FITTINGS } from '../src/vehicles/profiles/kit.ts';
import { ORACLE_ROOF_FITTING_NODES, bodyExtent, bodyGeometryWithout, columnTrace, heightIntervalPct, isAntennaTag,
  oracleRoofFittingTag, roofFittingParts, roofFittingTag } from './body-height-parts.mjs';

const isRenderNode = (o) => (o.isMesh || o.isInstancedMesh) && o.geometry;
const visible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
const SIZE = 512;

// The side mask (camera on +x: columns run along z, row 0 at the bottom) of every visible render node, in a fixed frame.
function sideMask(root, frame, { body = false, roof = false, oracle = false } = {}) {
  root.updateMatrixWorld(true);
  const parts = body || roof ? roofFittingParts(root, { isRenderNode, oracle }) : { nodes: new Map(), trimmed: new Map() };
  // the roof mode (the top of a published height's interval) keeps the roof weapons and leaves only the antennas out
  if (roof) parts.nodes = new Map([...parts.nodes].filter(([, tag]) => isAntennaTag(tag)));
  const mask = new Uint8Array(SIZE * SIZE);
  const toPx = (v, c) => ((v - c) / frame.half + 1) / 2 * SIZE - 0.5;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Matrix4(), w = new THREE.Matrix4();
  const fill = (geometry, matrix) => {
    const pos = geometry.getAttribute('position'), index = geometry.index;
    const n = index ? index.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      a.fromBufferAttribute(pos, index ? index.getX(t) : t).applyMatrix4(matrix);
      b.fromBufferAttribute(pos, index ? index.getX(t + 1) : t + 1).applyMatrix4(matrix);
      c.fromBufferAttribute(pos, index ? index.getX(t + 2) : t + 2).applyMatrix4(matrix);
      // camera on +x looking -x with +y up: screen right is world -z
      const P = [[toPx(-a.z, -frame.cz), toPx(a.y, frame.cy)], [toPx(-b.z, -frame.cz), toPx(b.y, frame.cy)],
        [toPx(-c.z, -frame.cz), toPx(c.y, frame.cy)]];
      const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(SIZE - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(SIZE - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
      const edge = (p, q, x, y) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
      const area = edge(P[0], P[1], P[2][0], P[2][1]);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const e0 = edge(P[1], P[2], x, y), e1 = edge(P[2], P[0], x, y), e2 = edge(P[0], P[1], x, y);
        // a sliver thinner than a pixel still lights the pixel its centre line crosses (thin rods are the subject)
        if (Math.abs(area) < 1e-9 ? false : area > 0 ? (e0 >= 0 && e1 >= 0 && e2 >= 0) : (e0 <= 0 && e1 <= 0 && e2 <= 0)) mask[y * SIZE + x] = 1;
      }
      for (const p of P) { const x = Math.round(p[0]), y = Math.round(p[1]); if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) mask[y * SIZE + x] = 1; }
    }
  };
  root.traverse((o) => {
    if (!isRenderNode(o) || !visible(o) || /shadow/i.test(o.name || '') || parts.nodes.has(o)) return;
    const geometry = parts.trimmed.get(o) ?? o.geometry;
    if (o.isInstancedMesh) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); fill(geometry, w.multiplyMatrices(o.matrixWorld, m)); }
    else fill(geometry, o.matrixWorld);
  });
  return { mask, parts };
}
const heightOf = (root, frame, options) => {
  const { mask, parts } = sideMask(root, frame, options);
  return { ext: bodyExtent(columnTrace(mask, SIZE, frame.half)), parts };
};

// --- the tags: fittings and stations off the gun's rig, primary roof weapons kept, oracle node names ---------------
{
  const root = new THREE.Group(), turret = new THREE.Group(), gun = new THREE.Group(), whip = new THREE.Group();
  root.add(turret); turret.name = 'rig_turret'; gun.name = 'rig_gun'; turret.add(gun, whip);
  const mesh = () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  whip.userData.fitting = 'antennaWhip'; const rod = mesh(); whip.add(rod);
  const coax = new THREE.Group(); coax.userData.fitting = 'pintleMG'; gun.add(coax); const coaxBody = mesh(); coax.add(coaxBody);
  const rws = new THREE.Group(); rws.userData = { remoteControlled: true, auxiliaryPivot: [0, 0, 0] }; turret.add(rws);
  const rwsBody = mesh(); rws.add(rwsBody);
  const main = new THREE.Group(); main.userData = { remoteControlled: true, auxiliaryPivot: [0, 0, 0], primaryWeapon: true };
  turret.add(main); const mainBody = mesh(); main.add(mainBody);
  const log = new THREE.Group(); log.userData.fitting = 'unditchingLog'; turret.add(log); const logBody = mesh(); log.add(logBody);
  assert.match(roofFittingTag(rod, root), /^antennaWhip:/);
  assert.equal(roofFittingTag(coaxBody, root), null, 'a pintle gun on the main gun\'s rig stays body');
  assert.match(roofFittingTag(rwsBody, root), /^station:/);
  assert.equal(roofFittingTag(mainBody, root), null, 'a roof station that is the primary weapon stays body');
  assert.equal(roofFittingTag(logBody, root), null, 'other fittings stay body');
  for (const name of ['vehicle#antenna_04_163_0', 'vehicle#antenna01_24', 'vehicle#bone_mg_aa_v_105_0', 'Antenna',
    'vehicle#mg_aa_mount_v_44_0', 'vehicle#mg_aamount_h', 'vehicle#bone_mg_v_01_43_2', 'vehicle#mg_01_40_0',
    'vehicle#mg_mount_h_42_0', 'M240Pintle', 'AmmoCan', 'vehicle#aerial_stowed'])
    assert.match(name, ORACLE_ROOF_FITTING_NODES, `${name}: an oracle roof fitting`);
  for (const name of ['vehicle#bone_turret_98_0', 'vehicle#mg_twin_101_0', 'vehicle#bone_mg_twin_0', 'vehicle#bone_mg_gun_twin_01',
    'vehicle#ex_decor_antenna_mount', 'vehicle#hull', 'vehicle#ammo_body_01'])
    assert.doesNotMatch(name, ORACLE_ROOF_FITTING_NODES, `${name}: body`);
  const oracleWhip = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); oracleWhip.name = 'vehicle#antenna_01_166_0';
  root.add(oracleWhip);
  assert.match(oracleRoofFittingTag(oracleWhip, root), /^node:/);
  assert.equal(roofFittingParts(root, { isRenderNode }).nodes.has(oracleWhip), false, 'a build answers to its tags only');
  assert.equal(roofFittingParts(root, { isRenderNode, oracle: true }).nodes.has(oracleWhip), true);
}

// --- antenna or roof weapon, the interval, the hull's own length ------------------------------------------------------
for (const tag of ['antennaWhip:fitting_antennaWhip', 'antenna:barakRearWhips', 'node:vehicle#antenna_01_166_0', 'node:vehicle#aerial_stowed'])
  assert.equal(isAntennaTag(tag), true, `${tag}: an antenna`);
for (const tag of ['pintleMG:type74RoofM2', 'station:merkavaRoofMag1', 'auxiliaryWeapon:x', 'node:vehicle#bone_mg_aa_v_105_0'])
  assert.equal(isAntennaTag(tag), false, `${tag}: a roof weapon`);
assert.equal(heightIntervalPct(2.2, 2.6, 2.4), 0, 'a published height between the body top and the roof-fittings top passes');
assert.equal(heightIntervalPct(2.2, 2.6, 2.2), 0);
assert.equal(heightIntervalPct(2.2, 2.6, 2.6), 0);
assert.ok(Math.abs(heightIntervalPct(2.2, 2.6, 2.0) - 10) < 1e-9, 'below the body top: the gap over the published height');
assert.ok(Math.abs(heightIntervalPct(2.2, 2.6, 2.86) - 9.0909090909) < 1e-6, 'above the roof-fittings top');
assert.ok(Math.abs(heightIntervalPct(2.2, 2.1, 2.3) - 4.3478260870) < 1e-6, 'a roof top under the body top is the body top');
{
  // 20 hull columns 1.6 m tall and a 0.1 m mudguard lip at the bow, then a 0.4 m barrel column run past it: over 12 % of
  // the 2.5 m rough height
  const hull = Array.from({ length: 30 }, (_, i) => (i < 20 ? [i * 0.1, 1.6, 0] : i === 20 ? [2.0, 1.0, 0.9] : null));
  const whole = hull.map((c, i) => (i < 20 ? [i * 0.1, i > 5 && i < 15 ? 2.5 : 1.6, 0] : [i * 0.1, 2.2, i === 20 ? 0.9 : 1.8]));
  assert.ok(Math.abs(bodyExtent(whole).len - 2.9) < 1e-9, 'on the whole trace the barrel columns cross the 12 % band');
  assert.ok(Math.abs(bodyExtent(whole, hull).len - 2.0) < 1e-9, 'the hull trace\'s full span, mudguard lip included, is the hull length');
  assert.equal(bodyExtent(whole, hull).h, bodyExtent(whole).h, 'the hull trace does not touch the height');
  assert.equal(bodyExtent(whole, Array(30).fill(null)).len, bodyExtent(whole).len, 'no hull trace: the whole-body span');
  assert.equal(bodyExtent(whole).hMax, 2.5);
}

// --- the merged-bucket cut keeps every other triangle and shares the attributes ---------------------------------------
{
  const merged = new THREE.BoxGeometry(1, 1, 1);
  const n = merged.index.count;
  const body = bodyGeometryWithout(merged, [{ start: 6, count: 6, role: 'antenna' }]);
  assert.equal(body.index.count, n - 6);
  assert.equal(body.getAttribute('position') === merged.getAttribute('position'), true, 'the cut shares the vertex buffers');
  assert.deepEqual([...body.index.array.slice(0, 6)], [...merged.index.array.slice(0, 6)]);
  assert.deepEqual([...body.index.array.slice(6, 12)], [...merged.index.array.slice(12, 18)]);
  // a 1 m whip triangle over a hull triangle: the cut body's box (the gate's physical envelope) is the hull's alone
  const pair = new THREE.BufferGeometry();
  pair.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 1.5, 0, 0, 1.5, 0, 0.02, 1.5, 0, 0, 2.5, 0], 3));
  pair.setIndex([0, 1, 2, 3, 4, 5]);
  const cut = bodyGeometryWithout(pair, [{ start: 3, count: 3, role: 'antenna' }]);
  assert.equal(cut.boundingBox.max.y, 1.5, 'the cut whip leaves the bounding box');
  pair.computeBoundingBox();
  assert.equal(pair.boundingBox.max.y, 2.5, 'the uncut geometry keeps it');
}

// --- the gate's height on a real build ---------------------------------------------------------------------------
const tank = createTank('type74', null, { camoSeed: 4242, quality: 'high', proceduralOnly: true, geometryReceipt: true });
const root = tank.root;
// the gate pins every LOD to level 0 (the close-range silhouette)
root.traverse((o) => { if (o.isLOD) o.levels.forEach((level, i) => { if (level.object) level.object.visible = i === 0; }); });
root.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(root);
const frame = { half: Math.max(box.max.z - box.min.z, box.max.y - box.min.y) * 0.62, cz: (box.min.z + box.max.z) / 2, cy: (box.min.y + box.max.y) / 2 };
const before = heightOf(root, frame, { body: true });
const roofBefore = heightOf(root, frame, { roof: true });
const whole = heightOf(root, frame);
assert.ok(before.parts.nodes.size > 0, 'the Type 74 build carries tagged roof fittings (its whips and roof M2)');
assert.ok(whole.ext.h > before.ext.h + 0.02, `its fittings raise the whole p95 roof (${whole.ext.h.toFixed(3)} over ${before.ext.h.toFixed(3)})`);
assert.ok(roofBefore.ext.hMax > before.ext.hMax + 0.02, 'the roof-fittings top keeps the roof M2 over the body top');
assert.ok(roofBefore.ext.hMax < whole.ext.hMax - 0.1, 'and leaves the whips out');
const turret = root.getObjectByName('rig_turret');
const roofY = new THREE.Box3().setFromObject(turret).max.y - turret.getWorldPosition(new THREE.Vector3()).y;

// negative control 1: four 1 m whips on fitting roots across the turret roof
const mat = () => new THREE.MeshBasicMaterial();
const mats = { dark: mat(), detail: mat(), shadow: mat(), glass: mat(), hull: mat() };
const added = [];
for (const [x, z] of [[-0.7, -1.2], [0.7, -1.2], [-0.4, -0.6], [0.4, -0.6]]) {
  const whip = FITTINGS.antennaWhip({ mats, h: 1.0, rake: 0, seed: 7 });
  whip.position.set(x, roofY - 0.05, z);
  turret.add(whip); added.push(whip);
}
const withWhips = heightOf(root, frame, { body: true });
assert.equal(withWhips.ext.h, before.ext.h, 'four 1 m fitting whips leave the gate height unchanged');
assert.equal(withWhips.ext.len, before.ext.len);
assert.equal(heightOf(root, frame, { roof: true }).ext.hMax, roofBefore.ext.hMax, 'and the roof-fittings top');
assert.ok(heightOf(root, frame).ext.h > whole.ext.h + 0.3, 'the same whips do raise the whole (untagged) roof');

// negative control 2: a 1 m rod merged into a turret bucket under the 'antenna' seat role
const bucket = turret.getObjectByName('turretDark');
assert.ok(bucket, 'the turret has a turretDark bucket');
const original = bucket.geometry;
const rods = [-0.9, -0.3, 0.3, 0.9].map((z) => new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6).translate(0.5, roofY + 0.45, z).toNonIndexed());
const plain = original.index ? original.toNonIndexed() : original.clone();
const rodPositions = rods.map((g) => g.getAttribute('position').array);
const start = plain.getAttribute('position').count;
const positions = new Float32Array(start * 3 + rodPositions.reduce((s, a) => s + a.length, 0));
positions.set(plain.getAttribute('position').array);
let at = start * 3;
for (const a of rodPositions) { positions.set(a, at); at += a.length; }
const withRod = new THREE.BufferGeometry();
withRod.setAttribute('position', new THREE.BufferAttribute(positions, 3));
bucket.geometry = withRod;
bucket.userData.seatRoleRanges = [...(bucket.userData.seatRoleRanges ?? []), { start, count: (at / 3) - start, role: 'antenna' }];
const withSpan = heightOf(root, frame, { body: true });
assert.equal(withSpan.ext.h, withWhips.ext.h, 'a 1 m rod drawn under the antenna seat role leaves the gate height unchanged');
assert.equal(withSpan.parts.trimmed.has(bucket), true);
bucket.userData.seatRoleRanges = bucket.userData.seatRoleRanges.filter((r) => r.start !== start);
assert.ok(heightOf(root, frame, { body: true }).ext.h > withSpan.ext.h + 0.3, 'the same rod untagged is body');
bucket.geometry = original;

// positive control: raising the hull (and the turret riding it) moves the gate height
const hull = root.getObjectByName('rig_hull');
const lift = [];
hull.traverse((o) => { if (o.isMesh && /^hull/.test(o.name)) { lift.push(o); o.scale.y *= 1.15; } });
assert.ok(lift.length, 'the hull has its own buckets');
turret.position.y += 0.15;
const raised = heightOf(root, frame, { body: true });
assert.ok(raised.ext.h > withSpan.ext.h + 0.08, `raising the hull raises the gate height (${withSpan.ext.h.toFixed(3)} -> ${raised.ext.h.toFixed(3)})`);
for (const whip of added) turret.remove(whip);
tank.dispose?.();
console.log(`body-height-parts: tags, interval and hull-span length pass; type74 gate height ${before.ext.h.toFixed(3)} m `
  + `(roof-fittings top ${roofBefore.ext.hMax.toFixed(3)}, whole ${whole.ext.h.toFixed(3)}), unchanged by four 1 m whips and a 1 m `
  + `tagged bucket rod, ${raised.ext.h.toFixed(3)} m with the hull raised`);
