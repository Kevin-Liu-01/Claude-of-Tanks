// Release 227: the fleet Type 96B's gun clears its hull through the whole traverse and pitch range. Before, the mantlet
// boot (buildType96Turret's Object_6 underside) hung 4-10 cm below the turret's floor: it crossed the hull roof at almost
// every traverse, the driver's hatch lid at rest, and dipped 5.6 cm into the roof at full elevation; with the turret
// reversed, the barrel entered the rear-deck panels at full depression. Now the fleet build clips the boot's underside
// (type96bX.ts TYPE96B_BOOT_FLOOR) and the spec stops depression over the rear arc (gunPitchByYawDeg). The three Type 96
// concepts carry the same turret on T-72B3, T-80U and T-72B3M decks (22-36 crossing poses in a 30-degree sweep): each
// clips the boot to its own floors (sinoSovietConcepts.ts BOOT_FLOOR) and carries its own measured curve
// (fleetRenewalSpecs.ts CONCEPT_GUN_PITCH_BY_YAW_DEG).
// Every gun triangle is tested against every hull triangle (exact segment-triangle crossings both ways on a uniform
// grid) at 2-degree turret steps: at the spec's minimum mechanical pitch for that yaw, at rest, and at half and full
// elevation (each held at or above that minimum, as the sim holds it), at both qualities. The box sight over the
// mantlet rides the gun on all four, and it clears the turret at every half-degree of pitch. Negative control: full depression with the turret reversed (below each curve) crosses
// the deck.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { minimumMechanicalGunPitch } from '../../sim/gunPitchLimits.ts';

const CELL = .06;

/** Triangles of the meshes under root (skipping the excluded subtree and unwanted names), in the frame `toFrame`. */
function soup(root, exclude, skip, toFrame) {
  const out = [], m = new THREE.Matrix4(), v = new THREE.Vector3();
  root.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.visible || skip.test(mesh.name)) return;
    for (let p = mesh; p; p = p.parent) if (p === exclude) return;
    m.multiplyMatrices(toFrame, mesh.matrixWorld);
    const pos = mesh.geometry.getAttribute('position'), index = mesh.geometry.index, n = index ? index.count : pos.count;
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(m); out.push(v.x, v.y, v.z); }
  });
  return new Float64Array(out);
}

function boxOf(T, o) {
  return [Math.min(T[o], T[o + 3], T[o + 6]), Math.min(T[o + 1], T[o + 4], T[o + 7]), Math.min(T[o + 2], T[o + 5], T[o + 8]),
    Math.max(T[o], T[o + 3], T[o + 6]), Math.max(T[o + 1], T[o + 4], T[o + 7]), Math.max(T[o + 2], T[o + 5], T[o + 8])];
}

function grid(T) {
  const cells = new Map(), c = (v) => Math.floor(v / CELL);
  for (let o = 0; o < T.length; o += 9) {
    const b = boxOf(T, o);
    for (let i = c(b[0]); i <= c(b[3]); i++) for (let j = c(b[1]); j <= c(b[4]); j++) for (let k = c(b[2]); k <= c(b[5]); k++) {
      const key = `${i},${j},${k}`; let list = cells.get(key); if (!list) cells.set(key, list = []); list.push(o);
    }
  }
  return { T, cells, c };
}

// does the open segment a->b cross triangle o of T (Moller-Trumbore, interior of the segment)?
function segmentCrosses(T, o, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const e1x = T[o + 3] - T[o], e1y = T[o + 4] - T[o + 1], e1z = T[o + 5] - T[o + 2];
  const e2x = T[o + 6] - T[o], e2y = T[o + 7] - T[o + 1], e2z = T[o + 8] - T[o + 2];
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-15) return false;
  const inv = 1 / det, tx = ax - T[o], ty = ay - T[o + 1], tz = az - T[o + 2], u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return false;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return false;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 1e-6 && t < 1 - 1e-6;
}

function trianglesCross(A, a, B, b) {
  for (const [i, j] of [[0, 3], [3, 6], [6, 0]]) {
    if (segmentCrosses(B, b, A[a + i], A[a + i + 1], A[a + i + 2], A[a + j], A[a + j + 1], A[a + j + 2])) return true;
    if (segmentCrosses(A, a, B[b + i], B[b + i + 1], B[b + i + 2], B[b + j], B[b + j + 1], B[b + j + 2])) return true;
  }
  return false;
}

/** Number of moving triangles that cross the static grid. */
function crossings(M, G) {
  let count = 0;
  const seen = new Set();
  for (let a = 0; a < M.length; a += 9) {
    const b = boxOf(M, a);
    seen.clear();
    let crossed = false;
    for (let i = G.c(b[0]); i <= G.c(b[3]) && !crossed; i++) for (let j = G.c(b[1]); j <= G.c(b[4]) && !crossed; j++)
      for (let k = G.c(b[2]); k <= G.c(b[5]) && !crossed; k++) {
        for (const o of G.cells.get(`${i},${j},${k}`) ?? []) {
          if (seen.has(o)) continue; seen.add(o);
          const s = boxOf(G.T, o);
          if (s[0] > b[3] || s[3] < b[0] || s[1] > b[4] || s[4] < b[1] || s[2] > b[5] || s[5] < b[2]) continue;
          if (trianglesCross(M, a, G.T, o)) { crossed = true; break; }
        }
      }
    if (crossed) count++;
  }
  return count;
}

const D = Math.PI / 180;
for (const id of ['type96b', 'type96_72_long', 'type96_80_feng', 'type96_72m_lei']) for (const quality of ['high', 'low']) {
  const spec = getSpec(id);
  assert.ok(spec.gunPitchByYawDeg, `${id}: the spec declares its deck gun clearance`);
  const tank = createTank(id, null, { proceduralOnly: true, quality, geometryReceipt: true, camoSeed: 4242 });
  try {
    tank.root.updateMatrixWorld(true);
    const hull = tank.root.getObjectByName('rig_hull'), turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
    const toHull = hull.matrixWorld.clone().invert();
    // the hull's surfaces (its field net and garnish are cloth over them; interior fills sit inside them)
    const G = grid(soup(hull, turret, /Shadow|_ghillie_|InteriorFill/, toHull));
    // the whole gun once, in its own frame; each pose only moves it into the hull's
    const gunFrame = soup(gun, null, /Shadow/, gun.matrixWorld.clone().invert()), moved = new Float64Array(gunFrame.length);
    const yaw0 = turret.rotation.y, pitch0 = gun.rotation.x, m = new THREE.Matrix4();
    const pose = (yawDeg, pitchRad) => {
      turret.rotation.y = yaw0 + yawDeg * D; gun.rotation.x = pitch0 - pitchRad; tank.root.updateMatrixWorld(true);
      const e = m.multiplyMatrices(toHull, gun.matrixWorld).elements;
      for (let i = 0; i < gunFrame.length; i += 3) {
        const x = gunFrame[i], y = gunFrame[i + 1], z = gunFrame[i + 2];
        moved[i] = e[0] * x + e[4] * y + e[8] * z + e[12]; moved[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; moved[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
      return crossings(moved, G);
    };
    const failures = [];
    for (let yaw = 0; yaw < 360; yaw += 2) {
      // the reachable pitches: the sim never holds the gun below its curve (movement.ts clamps it there)
      const lowest = minimumMechanicalGunPitch(spec, yaw * D);
      for (const pitch of new Set([lowest, 0, spec.gunElevationDeg * D / 2, spec.gunElevationDeg * D].map((p) => Math.max(p, lowest)))) {
        const n = pose(yaw, pitch);
        if (n) failures.push(`yaw ${yaw} pitch ${(pitch / D).toFixed(2)}: ${n} gun triangles cross the hull`);
      }
    }
    assert.deepEqual(failures, [], `${id}/${quality}: the gun clears the hull through traverse and pitch`);
    assert.ok(pose(180, -spec.gunDepressionDeg * D) > 0, `${id}/${quality}: negative control: full depression over the rear deck crosses it`);

    // The box sight over the mantlet rides the gun (buildType96Turret boxSightOnGun): turret-fixed, the pitching boot passed
    // through it at every pitch. No turret part carries it any more (the gunner's sight and every roof fitting stay), and
    // its own triangles (the box, bezel and glass: gunMount* triangles reaching above the boot's crown, gun-frame y > .36)
    // cross no turret triangle at any pitch from full depression to full elevation. (The boot and the tube stand in the
    // turret's closed front by design: they are not the sight's.)
    gun.rotation.x = pitch0; turret.rotation.y = yaw0; tank.root.updateMatrixWorld(true);
    const glass = []; gun.traverse((o) => { if (o.isMesh && o.name === 'gunMountGlass') glass.push(o); });
    assert.equal(glass.length, 1, `${id}/${quality}: the box sight's glass rides the gun`);
    const toTurret = turret.matrixWorld.clone().invert(), toGun = gun.matrixWorld.clone().invert();
    const T = grid(soup(turret, gun, /Shadow|_ghillie_|InteriorFill/, toTurret));
    const sightTris = [];
    gun.traverse((o) => {
      if (!o.isMesh || !/^gunMount/.test(o.name)) return;
      const tri = soup(o, null, /Shadow/, toGun);
      for (let i = 0; i < tri.length; i += 9) {
        const ys = [tri[i + 1], tri[i + 4], tri[i + 7]], xs = [tri[i], tri[i + 3], tri[i + 6]];
        if (o.name === 'gunMount' && !(Math.max(...ys) > .36 && Math.max(...xs.map(Math.abs)) < .2)) continue;
        for (let k = 0; k < 9; k++) sightTris.push(tri[i + k]);
      }
    });
    const sight = new Float64Array(sightTris), sightMoved = new Float64Array(sight.length);
    assert.ok(sight.length / 9 >= 100, `${id}/${quality}: the box sight's triangles (${sight.length / 9})`);
    const sightCrossings = [];
    for (let deg = -spec.gunDepressionDeg; deg <= spec.gunElevationDeg; deg += .5) {
      gun.rotation.x = pitch0 - deg * D; tank.root.updateMatrixWorld(true);
      const e = m.multiplyMatrices(toTurret, gun.matrixWorld).elements;
      for (let i = 0; i < sight.length; i += 3) {
        const x = sight[i], y = sight[i + 1], z = sight[i + 2];
        sightMoved[i] = e[0] * x + e[4] * y + e[8] * z + e[12]; sightMoved[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; sightMoved[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
      const n = crossings(sightMoved, T);
      if (n) sightCrossings.push(`pitch ${deg}: ${n}`);
    }
    assert.deepEqual(sightCrossings, [], `${id}/${quality}: the gun-mounted box sight clears the turret at every pitch`);
  } finally { tank.dispose(); }
}
console.log('type96MantletClearance selftest: OK');
