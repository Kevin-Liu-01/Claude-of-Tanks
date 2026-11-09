// A live wreck draws one barrel (2026-11-05; the owner: "the double barrel gun is on tanks you play in the game as well,
// like those kind of tanks when destroyed you can still see the double barrles").
//
// setDestroyed kinks the gun (wreckDents.ts planBend; tankFactoryCore planLiveCrumple), moving corners only. A triangle
// with corners either side of the crease drew a straight chord from the breech run to the turned muzzle run, so a tube
// authored with rings only at its ends stayed straight while its sleeves and evacuator turned: a second barrel beside
// the bent one (the T-72B3 Bastion-M), or a straight barrel with its evacuator floating off it (the M1A1, the
// Centurions). On origin/main 2cd74ad446, 242 of the 279 public tanks drew a gun piece off the kink by more than
// 1.5 cm, 88 of them by 10 cm or more (the Carro 45t 33 cm). cutAtKink now cuts every such triangle along the crease
// first. Held here, on the battle bot's build (LOW geometry, the static batches and the 'dual' merge: the wrecks a
// player sees most) of every public tank, plain kill then cook-off: every drawn piece of the gun is the kink of the
// same piece alive (points along each triangle that crossed the crease, turned by the plan the gun took, rig_gun
// userData.wreckBend, lie on the piece's drawn surface within 1.5 cm), no instanced piece reaches past the crease
// unbent, and the rematch restores the gun's own geometry.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

installCanvasFixture();
const { bendGeometry, cutAtKink, kinkPoint, planBend, wreckRandom } = await import('./wreckDents.ts');
const { createTank, ensureTankBuilder, battleStaticDrawMerge, battleGeometryQuality } = await import('./fleetFactory.ts');
const { PRODUCTION_TANK_IDS, getSpec } = await import('./specs.ts');
const { createTankState } = await import('../sim/movement.ts');

const TOL_M = 0.015;
const BIN_M = 0.05;
const _tri = new THREE.Triangle(), _q = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

/** A geometry's triangles through `m`, as flat corners. */
function trianglesOf(geometry, m) {
  const position = geometry.attributes.position, index = geometry.index;
  const corners = index ? index.count : position.count, out = new Float64Array(corners * 3), v = new THREE.Vector3();
  for (let c = 0; c < corners; c++) {
    v.fromBufferAttribute(position, index ? index.getX(c) : c).applyMatrix4(m);
    out[c * 3] = v.x; out[c * 3 + 1] = v.y; out[c * 3 + 2] = v.z;
  }
  return out;
}

/**
 * The worst miss (m) of the kink of `original` against `bent` (both through `m` into the gun's frame): points along every
 * triangle of the original that crosses the crease (its corners, edge quarters and centroid), turned by the plan, and
 * their distance to the bent surface.
 */
function chordMiss(original, bent, bend, m) {
  const src = trianglesOf(original, m), dst = trianglesOf(bent, m);
  const bins = new Map();
  for (let t = 0; t < dst.length; t += 9) {
    const lo = Math.floor(Math.min(dst[t + 2], dst[t + 5], dst[t + 8]) / BIN_M), hi = Math.floor(Math.max(dst[t + 2], dst[t + 5], dst[t + 8]) / BIN_M);
    for (let b = lo; b <= hi; b++) { if (!bins.has(b)) bins.set(b, []); bins.get(b).push(t); }
  }
  const distance = (p) => {
    let best = Infinity;
    const home = Math.floor(p.z / BIN_M);
    for (let b = home - 1; b <= home + 1; b++) {
      for (const t of bins.get(b) ?? []) {
        _tri.a.set(dst[t], dst[t + 1], dst[t + 2]); _tri.b.set(dst[t + 3], dst[t + 4], dst[t + 5]); _tri.c.set(dst[t + 6], dst[t + 7], dst[t + 8]);
        best = Math.min(best, _tri.closestPointToPoint(p, _q).distanceTo(p));
      }
    }
    return best;
  };
  let worst = 0;
  const crease = bend.z0 + bend.ramp;
  for (let t = 0; t < src.length; t += 9) {
    _a.set(src[t], src[t + 1], src[t + 2]); _b.set(src[t + 3], src[t + 4], src[t + 5]); _c.set(src[t + 6], src[t + 7], src[t + 8]);
    if (Math.max(_a.z, _b.z, _c.z) <= bend.z0 || Math.min(_a.z, _b.z, _c.z) >= crease) continue;
    const samples = [_a.clone().add(_b).add(_c).divideScalar(3)];
    for (const [p, q] of [[_a, _b], [_b, _c], [_c, _a]]) for (const s of [0.25, 0.5, 0.75]) samples.push(p.clone().lerp(q, s));
    for (const p of samples) { kinkPoint(bend, p); worst = Math.max(worst, distance(p)); }
  }
  return worst;
}

// ---- the class: a one-segment tube (corners only at its ends) kinked with and without the cut --------------------------
{
  const tube = new THREE.CylinderGeometry(0.06, 0.06, 5, 12, 1).rotateX(Math.PI / 2).translate(0, 0, 2.5);
  const bend = planBend(0, 5, wreckRandom(11), true);
  const I = new THREE.Matrix4();
  const chord = tube.clone();
  bendGeometry(chord, bend, I, I);
  assert.ok(chordMiss(tube, chord, bend, I) > 0.05, 'the uncut tube bends as a chord, off the kink');
  const cut = cutAtKink(tube, bend, I);
  bendGeometry(cut, bend, I, I);
  assert.ok(chordMiss(tube, cut, bend, I) < 0.003, 'cut along the crease, it is the kink (within the eased crease)');
  for (const name of Object.keys(tube.attributes)) assert.ok(cut.attributes[name], `the cut keeps ${name}`);
  const normal = cut.attributes.normal;
  for (let i = 0; i < normal.count; i++) {
    assert.ok(Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1) < 1e-5, 'unit normals');
  }
  // the winding: every cut piece of the tube's side faces out, as its source did; the area is the source's
  const flat = cutAtKink(tube, bend, I), src = trianglesOf(tube, I), out = trianglesOf(flat, I);
  const n = new THREE.Vector3(), radial = new THREE.Vector3();
  const load = (tri, t) => _tri.set(_a.set(tri[t], tri[t + 1], tri[t + 2]), _b.set(tri[t + 3], tri[t + 4], tri[t + 5]),
    _c.set(tri[t + 6], tri[t + 7], tri[t + 8]));
  let srcArea = 0, outArea = 0;
  for (let t = 0; t < src.length; t += 9) srcArea += load(src, t).getArea();
  for (let t = 0; t < out.length; t += 9) {
    outArea += load(out, t).getArea();
    _tri.getNormal(n);
    if (Math.abs(n.z) > 0.5) continue;
    _tri.getMidpoint(radial).setZ(0).normalize();
    assert.ok(n.dot(radial) > 0.9, 'a cut side piece faces out');
  }
  assert.ok(Math.abs(outArea - srcArea) < 1e-6 * srcArea, 'the same surface, cut');
  // a geometry the crease never crosses is a plain copy (its index kept)
  const stub = new THREE.BoxGeometry(0.2, 0.2, 0.5).translate(0, 0, 0.25);
  const copy = cutAtKink(stub, bend, I);
  assert.ok(copy !== stub && copy.index && copy.index.count === stub.index.count, 'uncrossed: a clone');
  // material groups follow their triangles
  const grouped = tube.clone();
  const cutGrouped = cutAtKink(grouped, bend, I);
  assert.equal(cutGrouped.groups.length, grouped.groups.length);
  assert.equal(cutGrouped.groups.at(-1).start + cutGrouped.groups.at(-1).count, cutGrouped.attributes.position.count, 'the groups cover the cut');
}

// ---- every public tank's live wreck --------------------------------------------------------------------------------
/** The gun's drawn meshes: visible, on the main layer, a LOD's nearest level, not a colourless proxy. */
function drawnGun(gunG) {
  const list = [];
  const walk = (o) => {
    if (!o.visible) return;
    if (o.isLOD) { if (o.levels.length) walk(o.levels[0].object); return; }
    if (o.isMesh && (o.layers.mask & 1) && o.geometry?.attributes?.position) {
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      if (materials[0] && materials[0].colorWrite !== false && !o.userData.authoredShadowProxy) list.push(o);
    }
    for (const child of o.children) walk(child);
  };
  walk(gunG);
  return list;
}

// (a lane's census: WRECK_GUN_IDS=a,b names the tanks; the receipt itself takes them all)
const ids = process.env.WRECK_GUN_IDS ? process.env.WRECK_GUN_IDS.split(',') : PRODUCTION_TANK_IDS;
const failures = [];
let bent = 0;
const gunInv = new THREE.Matrix4(), toGun = new THREE.Matrix4();
for (const id of ids) {
  await ensureTankBuilder(id);
  // the battle roster's bot build (rosterState.ts)
  const visual = createTank(id, null, { camoSeed: 4242, quality: 'high', geometryQuality: battleGeometryQuality(false, 'desktop'),
    batchStatic: true, battleDetailLod: true, eraVisualBindingReceipt: false, staticDrawMerge: battleStaticDrawMerge(id) });
  try {
    const gunG = visual.root.getObjectByName('rig_gun');
    const state = createTankState(getSpec(id), new THREE.Vector3(), 0);
    visual.syncFromState(state, 1 / 60, 60);
    // every piece of the gun alive, drawn or not (at range the 'dual' merge draws a far copy in its sources' place; a
    // wreck draws the sources)
    const alive = new Map();
    gunG.traverse((object) => { if (object.isMesh) alive.set(object, object.geometry); });
    for (const [pop, ageS] of [[false, 0], [true, 1000]]) {
      visual.setDestroyed({ pop, ageS });
      visual.syncFromState(state, 1 / 60, 60);
      const bend = gunG.userData.wreckBend;
      if (bend) {
        if (!pop) bent++;
        visual.root.updateMatrixWorld(true);
        gunInv.copy(gunG.matrixWorld).invert();
        for (const mesh of drawnGun(gunG)) {
          toGun.multiplyMatrices(gunInv, mesh.matrixWorld);
          const label = `${id} ${pop ? 'cook-off' : 'plain'} ${mesh.name || '(unnamed)'}`;
          if (mesh.isInstancedMesh) {
            mesh.geometry.computeBoundingBox();
            const reach = mesh.geometry.boundingBox.clone().applyMatrix4(toGun).max.z;
            if (reach > bend.z0) failures.push(`${label}: an instanced piece reaches past the crease (${reach.toFixed(2)} > ${bend.z0.toFixed(2)} m) unbent`);
            continue;
          }
          const original = alive.get(mesh);
          if (!original) { failures.push(`${label}: drawn on the wreck, no piece of the live gun`); continue; }
          const miss = chordMiss(original, mesh.geometry, bend, toGun);
          if (miss > TOL_M) failures.push(`${label}: off the kink by ${(miss * 100).toFixed(1)} cm (a straight chord beside the bent barrel)`);
        }
      }
      visual.resetDestroyed();
      for (const [mesh, geometry] of alive) {
        if (mesh.geometry !== geometry) failures.push(`${id}: ${mesh.name} keeps its wreck geometry after the rematch`);
      }
      if (gunG.userData.wreckBend) failures.push(`${id}: the rematch keeps the wreck's bend`);
    }
  } finally {
    visual.dispose();
  }
}
assert.deepEqual(failures, [], `a live wreck draws one barrel:\n${failures.join('\n')}`);
assert.ok(bent > ids.length * 0.9, `most guns bend (${bent} of ${ids.length})`);
console.log(`wreckGunBend: ${ids.length} public tanks, ${bent} guns kinked: one barrel each, plain and cook-off`);
