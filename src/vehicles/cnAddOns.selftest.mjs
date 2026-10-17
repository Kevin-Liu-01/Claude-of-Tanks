// Release 227 (owner 2026-10-16): "make the qqilin turret 10% shorter. and make the yun keep all its extra add ons and
// modifications but altered slightly to be wrapped around the type 96b turret base, and redesign the qilin turret around
// this principle." The CN track's add-on inventory: every Yun add-on (wrapped round its Type 96B) and every Qilin add-on
// (wrapped round its cut ZTZ-99A2) is present with its role (userData.chineseModernization.role) and seated on real stock;
// the Qilin's body is 90 % of the 99A2's length with nothing ahead of the cut band moved; the lamp census is as authored.
// Round 2 (critic D5): the seating is the full census of cnTurretGeometry.test-support.mjs seatingCensus (a chain of
// contacts to permanent stock for every tagged part, never through ERA; burial depth per role, both ways; separate
// cassettes never crossing; no visible z-fighting; no thin slots between armour pieces), with two negative controls that
// must fail it: the Yun's antenna lifted 50 mm off its foot, and its sight hood's top plate sunk 60 mm into the gunner's
// sight. The moving-part clearances are cnClearance.selftest.mjs.
// M1 (2026-10-17): the sight fields. Each donor sight aperture (the 96B gunner's sight, box sight and the commander's
// forward periscope; the 99A2 gunner's sight and commander's sight head) looks out through its glass rectangle swept
// 3 m forward, widening 8 degrees a side and covering -2..+8 degrees in elevation; no part the CN kit adds (a tagged
// role) may enter it, and the 226 Kunlun lamp seat (|x| 0.55, z 0.86, ahead of the 96B gunner's sight) must fail it.
// Every turret lamp's lens (driving lamps and Shtora) shines out unobstructed for 3 m with the gun at rest, fully
// depressed and fully elevated (rays from its whole aperture), and each lamp pair is a mirror pair.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { NATIONAL_DONOR_TURRETS, QILIN_BUSTLE_CUT_M } from './nationalDonorTurrets.ts';
import { bustleCutZ, ZTZ99A2_BUSTLE_CUT_FRONT_Z } from './donorBustleCut.ts';
import { censusPart, seatingCensus, SurfaceGrid, sightField, sightFieldApproach, densePoints, meshTriangles } from './cnTurretGeometry.test-support.mjs';
import { getSpec } from './specs.ts';

// role -> [minimum parts, exact reactive cassettes (parts with ERA hit faces) or null]
const INVENTORY = {
  t80u_yun: {
    'wrap-housing': [2, 0], chevron: [24, 12], 'flank-tile': [12, 6], 'bustle-module': [4, 0], 'rear-band': [3, 0],
    'cage-root': [2, 0], 'cage-front-post': [2, 0], 'cage-side-rail': [2, 0], 'cage-post': [2, 0], 'cage-rear-rail': [4, 0], 'cage-floor': [3, 0],
    'smoke-tube': [8, 0], 'smoke-cradle': [2, 0], 'service-case': [3, 0], 'spine-frame': [7, 0], 'low-optic': [3, 0], cable: [2, 0], antenna: [3, 0],
    'sight-hood': [3, 0], 'spine-sensor': [3, 0], 'slit-lamp': [2, 0], 'monocle-eye': [4, 0], 'side-electronics': [6, 0],
    'gun-band': [5, 0], 'muzzle-strip': [1, 0], 'ring-race': [1, 0], 'marking-board': [2, 0], 'met-sensor': [2, 0],
    'dock-bearer': [2, 0], 'dock-landing': [1, 0],
  },
  t72b3_qilin: {
    'flank-sleeve': [2, 0], 'brow-chevron': [16, 8], 'flank-tile': [12, 6], 'rail-post': [4, 0],
    'rear-box-seam': [2, 0], 'rear-box-mark': [2, 0], 'bustle-plate': [1, 0], rack: [7, 0], 'flat-eye': [4, 0], 'split-sensor': [3, 0],
    lamp: [2, 0], camera: [3, 0], 'field-box': [1, 0], 'tool-chest': [1, 0], roll: [4, 0], carrier: [3, 0], cable: [2, 0],
    'cage-root': [2, 0], 'cage-front-post': [2, 0], 'cage-side-rail': [2, 0], 'cage-post': [2, 0], 'cage-rear-rail': [3, 0], 'cage-floor': [4, 0],
  },
};
const LIGHTS = { t80u_yun: [6, 0], t72b3_qilin: [4, 0], t72b3m_kunlun: [6, 2] };
// the lenses on the turret (its lamp pair, and the Kunlun's Shtora pair); the rest are the hull's driving lamps
const TURRET_LENSES = { t80u_yun: 2, t72b3_qilin: 2, t72b3m_kunlun: 4 };

// The welded rear cage and the dock's bearers are one item: their beams cross at every joint.
const family = (role) => (/^(cage-|dock-)/.test(role) ? 'cage' : role);
// Burial allowances (m), the larger of the two parts' when both are tagged. Welded armour housings are built into the
// shell (their inner edges at least 20 mm in, the bustle module 50 mm into the 96B's rear cap); cage roots and floor bars
// end 30 mm inside the wall plus their own radius; a thin part (cable, post, strip, seam, mark) crosses a face by no more
// than its own half-thickness and a few millimetres (a gun band's bore is 2 mm inside the barrel's skin);
// a shaped foot (6 mm into the roof at its corners) swallows the roof's camber under it up to 16 mm, 22 mm where the
// split sensor's foot welds over the chevron's raised upper root.
const HOUSINGS = new Set(['wrap-housing', 'flank-sleeve', 'bustle-module']);
const THIN = new Set(['cable', 'rail-post', 'rear-band', 'rear-box-seam', 'rear-box-mark', 'marking-board', 'muzzle-strip', 'gun-band']);
function allowance(p) {
  if (HOUSINGS.has(p.role)) return .40;
  if (family(p.role) === 'cage') return .046;
  if (p.role === 'ring-race') return .040;
  if (THIN.has(p.role)) return .013;
  if (p.role === 'split-sensor') return .022;
  return .016;
}

function build(id, quality) {
  const parts = [];
  const tank = createTank(id, null, { proceduralOnly: true, quality, geometryReceipt: true, camoSeed: 4242,
    partCensus(bucket, g) { parts.push({ ...censusPart(bucket, g), hit: (g.userData?.eraHitFaceVertexStarts?.length ?? 0) > 0, lens: Boolean(g.userData?.vehicleNightLens) }); } });
  tank.root.updateMatrixWorld(true);
  return { tank, parts };
}
const owner = (p) => (p.bucket.startsWith('turret') ? 'turret' : p.bucket.startsWith('gun') ? 'gun' : 'hull');
/** A shifted copy of a census part (a negative control). */
function shifted(p, dy) {
  const tri = Float64Array.from(p.tri); for (let i = 1; i < tri.length; i += 3) tri[i] += dy;
  return { ...p, tri, box: p.box.clone().translate(new THREE.Vector3(0, dy, 0)), dense: undefined, samples: undefined };
}


// ---- M1: the donor's sight apertures (census parts, turret-local; a gun-borne glass is moved into the turret frame at
// rest) and the parts the kit adds in front of them
const width = (p) => p.box.max.x - p.box.min.x, midX = (p) => (p.box.min.x + p.box.max.x) / 2;
function apertures(id, parts, gunToTurret) {
  const atRest = (p) => (owner(p) === 'gun' ? { ...p, box: p.box.clone().applyMatrix4(gunToTurret) } : p);
  const glass = parts.filter((p) => /Glass$/.test(p.bucket) && owner(p) !== 'hull' && !p.role && !p.lens).map(atRest);
  const one = (list, what) => { assert.equal(list.length, 1, `${id}: exactly one ${what} (${list.length})`); return list[0]; };
  if (id === 't72b3_qilin') return {
    "99A2 gunner's sight": one(glass.filter((p) => width(p) > .15 && midX(p) > 0 && p.box.max.y < 1.1), "99A2 gunner's sight glass"),
    "99A2 commander's sight head": one(glass.filter((p) => p.box.min.y > 1.1), "99A2 commander's sight head glass"),
  };
  const periscopes = glass.filter((p) => width(p) < .07 && p.box.min.y > .84 && p.box.max.y < .90);
  assert.equal(periscopes.length, 8, `${id}: the 96B cupola's eight periscopes`);
  return {
    "96B gunner's sight": one(glass.filter((p) => width(p) > .2 && midX(p) > 0), "96B gunner's sight glass"),
    '96B box sight': one(glass.filter((p) => Math.abs(midX(p)) < .01 && p.box.min.z > 1.5), '96B box sight glass'),
    "96B commander's forward periscope": periscopes.reduce((a, b) => (b.box.max.z > a.box.max.z ? b : a)),
  };
}
/** The worst approach of the kit's turret parts to each aperture's field: [name, margin m (< 0 clear), part]. */
function sightFieldCensus(id, parts, gunToTurret) {
  const kit = parts.filter((p) => p.role && owner(p) === 'turret');
  return Object.entries(apertures(id, parts, gunToTurret)).map(([name, glass]) => {
    const worst = sightFieldApproach(kit, sightField(glass)).reduce((a, b) => (b.m > a.m ? b : a), { m: -Infinity, part: null });
    return [name, worst.m, worst.part];
  });
}
/** A shifted copy of a census part in x, y and z. */
function moved(p, dx, dy, dz) {
  const tri = Float64Array.from(p.tri); for (let i = 0; i < tri.length; i += 3) { tri[i] += dx; tri[i + 1] += dy; tri[i + 2] += dz; }
  return { ...p, tri, box: p.box.clone().translate(new THREE.Vector3(dx, dy, dz)), dense: undefined, samples: undefined };
}
/** Möller-Trumbore: the distance along the unit ray (o, d) to triangle T[t..t+8], or Infinity. */
function rayTriangle(T, t, ox, oy, oz, dx, dy, dz) {
  const e1x = T[t + 3] - T[t], e1y = T[t + 4] - T[t + 1], e1z = T[t + 5] - T[t + 2], e2x = T[t + 6] - T[t], e2y = T[t + 7] - T[t + 1], e2z = T[t + 8] - T[t + 2];
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-14) return Infinity;
  const inv = 1 / det, tx = ox - T[t], ty = oy - T[t + 1], tz = oz - T[t + 2], u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return Infinity;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return Infinity;
  const d = (e2x * qx + e2y * qy + e2z * qz) * inv; return d > 0 ? d : Infinity;
}
/** Every turret lamp lens shines out for 3 m: rays from a 12 mm grid over each lens's marked aperture faces (the census
 * lens parts, turret-local) along the face's normal, against every other census part of the vehicle and the roof
 * station (turret frame), with the gun at rest, fully depressed and fully elevated. A lamp's own assembly (its role's
 * parts within 0.25 m: the guard posts, the Shtora's guard bars and hood) is the lamp. Returns the obstructions. */
function apertureRays(id, tank, parts) {
  const spec = getSpec(id), turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
  const tInv = new THREE.Matrix4().copy(turret.matrixWorld).invert();
  const hullToTurret = tInv.clone().multiply(turret.parent.matrixWorld);
  let station = null; turret.traverse((o) => { if (!station && o.userData.remoteControlled && o.userData.firingAxis === '+Z') station = o; });
  const stationMeshes = []; station?.traverse((o) => { if (o.isMesh && !/Shadow/.test(o.name)) stationMeshes.push(o); });
  const stationTris = meshTriangles(stationMeshes, tInv);
  const lenses = parts.filter((p) => p.lens && owner(p) === 'turret');
  const problems = [];
  const v = new THREE.Vector3();
  const placed = (p, M) => { if (!M) return p.tri; const T = new Float64Array(p.tri.length); for (let i = 0; i < T.length; i += 3) { v.set(p.tri[i], p.tri[i + 1], p.tri[i + 2]).applyMatrix4(M); T[i] = v.x; T[i + 1] = v.y; T[i + 2] = v.z; } return T; };
  for (const pitch of [0, -(spec.gunDepressionDeg ?? 6), spec.gunElevationDeg ?? 14]) {
    const gunToTurret = new THREE.Matrix4().copy(tInv).multiply(gun.parent.matrixWorld)
      .multiply(new THREE.Matrix4().compose(gun.position, new THREE.Quaternion().setFromEuler(new THREE.Euler(gun.rotation.x - pitch * Math.PI / 180, gun.rotation.y, gun.rotation.z)), gun.scale));
    const world = parts.filter((p) => !p.lens || owner(p) !== 'turret').map((p) => ({ p, T: placed(p, owner(p) === 'turret' ? null : owner(p) === 'gun' ? gunToTurret : hullToTurret) }));
    world.push({ p: { role: null, box: new THREE.Box3() }, T: stationTris });
    for (const lens of lenses) {
      const L = lens.tri, rays = [];
      for (let t = 0; t < L.length; t += 9) {
        const ux = L[t + 3] - L[t], uy = L[t + 4] - L[t + 1], uz = L[t + 5] - L[t + 2], vx = L[t + 6] - L[t], vy = L[t + 7] - L[t + 1], vz = L[t + 8] - L[t + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const a = Math.hypot(nx, ny, nz); if (a < 1e-12) continue;
        nx /= a; ny /= a; nz /= a; if (nz < .98) continue; // the forward aperture (markVehicleNightLens: +Z faces)
        const S = densePoints(L.slice(t, t + 9), .012);
        for (let i = 0; i < S.length; i += 3) rays.push([S[i] + nx * .002, S[i + 1] + ny * .002, S[i + 2] + nz * .002, nx, ny, nz]);
      }
      assert.ok(rays.length > 8, `${id}: lens [${lens.box.min.toArray().map((x) => x.toFixed(3))}] has a forward aperture`);
      const b = lens.box, own = b.clone().expandByScalar(.25), near = [];
      for (const { p, T } of world) {
        if (lens.role && p.role === lens.role && own.intersectsBox(p.box)) continue;
        for (let t = 0; t < T.length; t += 9) {
          let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z1 = -Infinity;
          for (let k = 0; k < 9; k += 3) { x0 = Math.min(x0, T[t + k]); x1 = Math.max(x1, T[t + k]); y0 = Math.min(y0, T[t + k + 1]); y1 = Math.max(y1, T[t + k + 1]); z1 = Math.max(z1, T[t + k + 2]); }
          if (x1 < b.min.x - .01 || x0 > b.max.x + .01 || y1 < b.min.y - .01 || y0 > b.max.y + .01 || z1 < b.max.z) continue;
          for (let k = 0; k < 9; k++) near.push(T[t + k]);
        }
      }
      let worst = null;
      for (const [ox, oy, oz, dx, dy, dz] of rays) for (let t = 0; t < near.length; t += 9) {
        const d = rayTriangle(near, t, ox, oy, oz, dx, dy, dz);
        if (d <= 3 && (!worst || d < worst.d)) worst = { d, at: [ox, oy, oz] };
      }
      if (worst) problems.push(`lens [${b.min.toArray().map((x) => x.toFixed(3))}..${b.max.toArray().map((x) => x.toFixed(3))}] (gun ${pitch} deg): a ray from ${worst.at.map((x) => x.toFixed(3))} meets a surface ${(worst.d * 1000).toFixed(0)} mm out`);
    }
  }
  return { problems, lenses: lenses.length };
}
/** Each lamp role's parts pair off with their mirror images across the turret's centre plane: in plan within 1.5 mm, in
 * height within 15 mm (each foot follows its own roof; the 99A2's crown is not symmetric under the Qilin's lamps). */
function asymmetricLamps(parts) {
  const out = [];
  for (const role of ['lamp', 'slit-lamp']) {
    const list = parts.filter((p) => p.role === role && owner(p) === 'turret');
    for (const p of list) if (!list.some((q) => Math.abs(q.box.min.x + p.box.max.x) < .0015 && Math.abs(q.box.max.x + p.box.min.x) < .0015
      && Math.abs(q.box.min.z - p.box.min.z) < .0015 && Math.abs(q.box.max.z - p.box.max.z) < .0015
      && Math.abs(q.box.min.y - p.box.min.y) < .015 && Math.abs(q.box.max.y - p.box.max.y) < .015))
      out.push(`${role} [${p.box.min.toArray().map((v) => v.toFixed(3))}..${p.box.max.toArray().map((v) => v.toFixed(3))}] has no mirror image`);
  }
  return out;
}

for (const quality of ['high', 'low']) {
  // ---- the fleet ZTZ-99A2's own shell ahead of the cut band
  const fleet = build('ztz99a2', quality);
  const key = (x, y, z) => [x, y, z].map((v) => Math.round(v * 1e4)).join(',');
  const fleetShell = new Set();
  for (const p of fleet.parts) if (p.bucket === 'turret') for (let i = 0; i < p.tri.length; i += 3)
    if (p.tri[i + 2] >= ZTZ99A2_BUSTLE_CUT_FRONT_Z) fleetShell.add(key(p.tri[i], p.tri[i + 1], p.tri[i + 2]));
  fleet.tank.dispose();

  for (const id of [...Object.keys(INVENTORY), 't72b3m_kunlun']) {
    const { tank, parts } = build(id, quality);
    try {
      // ---- inventory
      const want = INVENTORY[id];
      if (want) for (const [role, [min, cassettes]] of Object.entries(want)) {
        const list = parts.filter((p) => p.role === role);
        assert.ok(list.length >= min, `${id}/${quality}: add-on ${role} present (${list.length} of at least ${min} parts)`);
        if (cassettes !== null) assert.equal(list.filter((p) => p.hit).length, cassettes, `${id}/${quality}: ${role} reactive cassettes`);
      }
      // ---- seating: the full census, per owner, wherever a tagged part lives
      if (want) for (const o of ['turret', 'gun', 'hull']) {
        const P = parts.filter((p) => owner(p) === o);
        if (!P.some((p) => p.role)) continue;
        // the hull census only needs the tagged parts' neighbourhood
        const scope = o === 'hull' ? P.filter((p) => p.role || P.some((q) => q.role && q.box.clone().expandByScalar(.05).intersectsBox(p.box))) : P;
        const problems = seatingCensus(scope, { allowance, family });
        assert.deepEqual(problems, [], `${id}/${quality}: ${o} add-ons seated on real stock:\n  ${problems.join('\n  ')}`);
      }
      // ---- negative controls (high quality): a lifted antenna floats; a sunk sight-hood plate is buried in the sight
      if (id === 't80u_yun' && quality === 'high') {
        const turretParts = parts.filter((p) => owner(p) === 'turret');
        const around = (sel) => turretParts.filter((p) => sel.some((q) => q.box.clone().expandByScalar(.10).intersectsBox(p.box)));
        const antenna = turretParts.filter((p) => p.role === 'antenna');
        const lifted = around(antenna).map((p) => (p.role === 'antenna' ? shifted(p, .05) : p));
        assert.ok(seatingCensus(lifted, { allowance, family }).some((s) => s.startsWith('FLOAT antenna')), 'negative control: an antenna lifted 50 mm floats');
        const plate = turretParts.filter((p) => p.role === 'sight-hood').sort((a, b) => (b.box.max.x - b.box.min.x) - (a.box.max.x - a.box.min.x))[0];
        const sunk = around([plate]).map((p) => (p === plate ? shifted(p, -.06) : p));
        assert.ok(seatingCensus(sunk, { allowance, family }).some((s) => s.startsWith('CROSS') && s.includes('sight-hood')), 'negative control: a sight-hood plate sunk 60 mm is buried');
      }
      // ---- M3: the Yun's horseshoe corner round the bustle module: its rear end 30 mm ahead of the module's rear face, its
      // top at least 20 mm over the module's, its inner edge 85-90 mm inside the module's side; one cradle a side under
      // four tubes
      if (id === 't80u_yun') {
        const module = parts.find((p) => p.role === 'bustle-module' && p.bucket === 'turretExternalArmor');
        for (const wrap of parts.filter((p) => p.role === 'wrap-housing')) {
          assert.ok(Math.abs(wrap.box.min.z - (module.box.min.z + .03)) < .001, `Yun: the wrap's corner ends 30 mm ahead of the bustle module's rear face (${wrap.box.min.z.toFixed(4)})`);
          let cornerTop = -Infinity, inner = Infinity;
          for (let i = 0; i < wrap.tri.length; i += 3) if (wrap.tri[i + 2] < -1.99) { cornerTop = Math.max(cornerTop, wrap.tri[i + 1]); inner = Math.min(inner, Math.abs(wrap.tri[i])); }
          assert.ok(cornerTop >= module.box.max.y + .02 - 1e-6, `Yun: the corner's top ${cornerTop.toFixed(3)} stands 20 mm over the module's ${module.box.max.y.toFixed(3)}`);
          const moduleHalf = .94 + .06 * (-2.03 + 2.06) / .22;
          assert.ok(moduleHalf - inner >= .085 - 1e-6 && moduleHalf - inner <= .090 + 1e-6, `Yun: the corner's inner edge ${((moduleHalf - inner) * 1000).toFixed(1)} mm inside the module`);
        }
        const cradles = parts.filter((p) => p.role === 'smoke-cradle'), tubes = parts.filter((p) => p.role === 'smoke-tube');
        assert.equal(cradles.length, 2, 'Yun: one smoke cradle a side'); assert.equal(tubes.length, 8, 'Yun: its own eight smoke tubes');
        for (const c of cradles) assert.equal(tubes.filter((t) => Math.sign(t.box.min.x + t.box.max.x) === Math.sign(c.box.min.x + c.box.max.x)
          && t.box.min.z > c.box.min.z - .05 && t.box.max.z < c.box.max.z + .25).length, 4, 'Yun: four tubes on each cradle');
      }
      // ---- the Qilin: 10 % shorter, nothing ahead of the band moved, height kept
      if (id === 't72b3_qilin') {
        const body = new THREE.Box3(), shell = new THREE.Box3(), v = new THREE.Vector3();
        // the coordinator's ruling R1: the body is the shell and its permanent external armour front to rear, the front ERA
        // face included (the gun and the roof equipment not); nothing in those buckets is set aside
        for (const p of parts) {
          if (!['turret', 'turretExternalArmor'].includes(p.bucket)) continue;
          for (let i = 0; i < p.tri.length; i += 3) { v.set(p.tri[i], p.tri[i + 1], p.tri[i + 2]); body.expandByPoint(v); if (p.bucket === 'turret') shell.expandByPoint(v); }
        }
        const length = body.max.z - body.min.z;
        assert.ok(Math.abs(length - 3.559) <= .010, `Qilin: body length ${length.toFixed(4)} m (3.559 +- .010)`);
        assert.ok(Math.abs(length / 3.954 - .90) <= .003, `Qilin: ${(100 * length / 3.954).toFixed(2)} % of the 99A2 body's 3.954 m`);
        assert.ok(Math.abs(shell.max.y - shell.min.y - .9575) <= .001, `Qilin: shell height ${(shell.max.y - shell.min.y).toFixed(4)} m unchanged`);
        // every 99A2 shell vertex ahead of the band is a vertex of the Qilin's shell, or lies on its surface (round 2: the
        // loft's triangles are split at the band's ends before the cut, so the throat clip cuts them where it cuts the fleet's)
        const qilinShell = new Set(), qilinTris = [];
        for (const p of parts) if (p.bucket === 'turret') { qilinTris.push(...p.tri); for (let i = 0; i < p.tri.length; i += 3) qilinShell.add(key(p.tri[i], p.tri[i + 1], p.tri[i + 2])); }
        const surface = new SurfaceGrid(Float64Array.from(qilinTris), { cell: .05, rq: .002 });
        const moved = [...fleetShell].filter((k) => !qilinShell.has(k)).filter((k) => surface.distance(...k.split(',').map((n) => n / 1e4)) > 2e-4);
        assert.equal(moved.length, 0, `Qilin: ${moved.length} 99A2 shell points ahead of z ${ZTZ99A2_BUSTLE_CUT_FRONT_Z} moved off its surface: ${moved.slice(0, 8).join(' ; ')}`);
        // M2: one flank sleeve a side; no face of it parallel to the 99A2 forward side cassette's rear face (z -0.93,
        // yawed 0.04 rad) within 5 mm of that face's plane (the sleeve's 10 mm step stands 30-40 mm inside the cassette)
        const sleeves = parts.filter((p) => p.role === 'flank-sleeve');
        assert.equal(sleeves.length, 2, 'Qilin: one flank sleeve a side');
        for (const side of [-1, 1]) {
          const cassette = parts.find((p) => p.bucket === 'turretExternalArmor' && !p.role && !p.era && p.box.min.z > -.95 && p.box.min.z < -.91
            && Math.sign(p.box.min.x + p.box.max.x) === side && Math.min(Math.abs(p.box.min.x), Math.abs(p.box.max.x)) > 1.3);
          assert.ok(cassette, `Qilin: the 99A2 forward side cassette (side ${side})`);
          let rear = null; const T = cassette.tri;
          for (let t = 0; t < T.length; t += 9) {
            const ux = T[t + 3] - T[t], uy = T[t + 4] - T[t + 1], uz = T[t + 5] - T[t + 2], vx = T[t + 6] - T[t], vy = T[t + 7] - T[t + 1], vz = T[t + 8] - T[t + 2];
            const n = new THREE.Vector3(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx); if (n.length() < 1e-9) continue; n.normalize();
            if (Math.abs(n.z) > .95 && (T[t + 2] + T[t + 5] + T[t + 8]) / 3 < cassette.box.min.z + .02) { rear = { n, d: n.x * T[t] + n.y * T[t + 1] + n.z * T[t + 2] }; break; }
          }
          assert.ok(rear, `Qilin: the cassette's rear face (side ${side})`);
          const sleeve = sleeves.find((p) => Math.sign(p.box.min.x + p.box.max.x) === side), S = sleeve.tri;
          let closest = Infinity;
          for (let t = 0; t < S.length; t += 9) {
            const ux = S[t + 3] - S[t], uy = S[t + 4] - S[t + 1], uz = S[t + 5] - S[t + 2], vx = S[t + 6] - S[t], vy = S[t + 7] - S[t + 1], vz = S[t + 8] - S[t + 2];
            const n = new THREE.Vector3(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx); if (n.length() < 1e-9) continue; n.normalize();
            if (Math.abs(n.dot(rear.n)) < .95) continue;
            for (let k = 0; k < 9; k += 3) closest = Math.min(closest, Math.abs(rear.n.x * S[t + k] + rear.n.y * S[t + k + 1] + rear.n.z * S[t + k + 2] - rear.d));
          }
          assert.ok(closest > .005, `Qilin: the sleeve's step faces stand ${(closest * 1000).toFixed(1)} mm from the cassette's rear face plane (side ${side})`);
        }
        assert.equal(NATIONAL_DONOR_TURRETS.t72b3_qilin.builderOptions.bustleCutM, QILIN_BUSTLE_CUT_M);
        assert.ok(Math.abs(bustleCutZ(-2.265, QILIN_BUSTLE_CUT_M) - body.min.z) < .006, 'Qilin: the rear armour assembly moved forward by the cut');
        // the turret as drawn (the gun aside) is 10 % shorter than the 226 cast Qilin's 4.228 m too: the basket is 0.27 m deep
        const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
        const drawn = new THREE.Box3(), inv = new THREE.Matrix4().copy(turret.matrixWorld).invert();
        turret.traverse((o) => { if (!o.isMesh || /Shadow|^vehicleMarking/.test(o.name)) return; for (let q = o; q; q = q.parent) if (q === gun) return;
          drawn.union(new THREE.Box3().setFromBufferAttribute(o.geometry.attributes.position).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); });
        const drawnLength = drawn.max.z - drawn.min.z;
        assert.ok(drawnLength <= .905 * 4.228, `Qilin: the drawn turret is ${drawnLength.toFixed(3)} m, ${(100 * drawnLength / 4.228).toFixed(1)} % of the 226 turret's 4.228 m`);
      }
      // ---- lamps: real emitters only where authored
      const lights = tank.root.userData.nightLightCoverage;
      assert.equal(lights.headlights, LIGHTS[id][0], `${id}: headlight lenses`);
      assert.equal(lights.shtora ?? 0, LIGHTS[id][1], `${id}: Shtora lenses`);
      // ---- M1: the sight fields, the lamps' own beams, mirrored lamp pairs
      const turretRig = tank.root.getObjectByName('rig_turret'), gunRig = tank.root.getObjectByName('rig_gun');
      const gunToTurret = new THREE.Matrix4().copy(turretRig.matrixWorld).invert().multiply(gunRig.matrixWorld);
      const fields = sightFieldCensus(id, parts, gunToTurret);
      for (const [name, m, part] of fields) assert.ok(m < 0, `${id}/${quality}: ${part?.role} [${part?.box.min.toArray().map((v) => v.toFixed(3))}..${part?.box.max.toArray().map((v) => v.toFixed(3))}] stands ${(m * 1000).toFixed(1)} mm inside the ${name}'s field`);
      console.log(`${id}/${quality}: sight fields clear: ${fields.map(([name, m]) => `${name} ${(-m * 1000).toFixed(0)} mm`).join(', ')}`);
      assert.deepEqual(asymmetricLamps(parts), [], `${id}/${quality}: lamp pairs mirrored`);
      if (quality === 'high') {
        const rays = apertureRays(id, tank, parts);
        assert.equal(rays.lenses, TURRET_LENSES[id], `${id}: every turret lens ray-tested`);
        assert.deepEqual(rays.problems, [], `${id}: turret lamp lenses shine out unobstructed`);
        // negative control: the 226 Kunlun lamps (|x| 0.55, z 0.86 on the wedge falling 16 degrees forward) stand in the
        // 96B gunner's sight's field
        if (id === 't72b3m_kunlun') {
          const old = parts.map((p) => (p.role === 'lamp' ? moved(p, Math.sign(midX(p)) * .27, .19 * Math.tan(16 * Math.PI / 180), -.19) : p));
          const control = sightFieldCensus(id, old, gunToTurret).find(([name]) => name === "96B gunner's sight");
          assert.ok(control[1] >= 0 && control[2]?.role === 'lamp', `negative control: the 226 Kunlun lamp seat stands in the gunner's sight's field (${(control[1] * 1000).toFixed(1)} mm)`);
        }
      }
      console.log(`${id}/${quality}: add-ons ${want ? Object.keys(want).length : 0} roles present and seated PASS`);
    } finally { tank.dispose(); }
  }
}
console.log('cnAddOns: the Yun and Qilin add-ons wrapped round their base turrets and seated, the Qilin 10 % shorter PASS');
