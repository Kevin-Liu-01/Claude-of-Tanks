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
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { NATIONAL_DONOR_TURRETS, QILIN_BUSTLE_CUT_M } from './nationalDonorTurrets.ts';
import { bustleCutZ, ZTZ99A2_BUSTLE_CUT_FRONT_Z } from './donorBustleCut.ts';
import { censusPart, seatingCensus, SurfaceGrid } from './cnTurretGeometry.test-support.mjs';

// role -> [minimum parts, exact reactive cassettes (parts with ERA hit faces) or null]
const INVENTORY = {
  t80u_yun: {
    'wrap-housing': [2, 0], chevron: [24, 12], 'flank-tile': [12, 6], 'bustle-module': [4, 0], 'rear-band': [3, 0],
    'cage-root': [2, 0], 'cage-front-post': [2, 0], 'cage-side-rail': [2, 0], 'cage-post': [2, 0], 'cage-rear-rail': [4, 0], 'cage-floor': [3, 0],
    'smoke-tube': [16, 0], 'service-case': [3, 0], 'spine-frame': [7, 0], 'low-optic': [3, 0], cable: [2, 0], antenna: [3, 0],
    'sight-hood': [3, 0], 'spine-sensor': [3, 0], 'slit-lamp': [2, 0], 'monocle-eye': [4, 0], 'side-electronics': [6, 0],
    'gun-band': [5, 0], 'muzzle-strip': [1, 0], 'ring-race': [1, 0], 'marking-board': [2, 0], 'met-sensor': [2, 0],
    'dock-bearer': [2, 0], 'dock-landing': [1, 0],
  },
  t72b3_qilin: {
    brow: [2, 0], 'brow-chevron': [16, 8], 'rear-flank-housing': [2, 0], 'flank-tile': [12, 6], 'rail-post': [4, 0],
    'rear-box-seam': [2, 0], 'rear-box-mark': [2, 0], 'bustle-plate': [1, 0], rack: [7, 0], 'flat-eye': [4, 0], 'split-sensor': [3, 0],
    lamp: [2, 0], camera: [3, 0], 'field-box': [1, 0], 'tool-chest': [1, 0], roll: [4, 0], carrier: [3, 0], cable: [2, 0],
    'cage-root': [2, 0], 'cage-front-post': [2, 0], 'cage-side-rail': [2, 0], 'cage-post': [2, 0], 'cage-rear-rail': [3, 0], 'cage-floor': [4, 0],
  },
};
const LIGHTS = { t80u_yun: [6, 0], t72b3_qilin: [4, 0], t72b3m_kunlun: [6, 2] };

// The welded rear cage and the dock's bearers are one item: their beams cross at every joint.
const family = (role) => (/^(cage-|dock-)/.test(role) ? 'cage' : role);
// Burial allowances (m), the larger of the two parts' when both are tagged. Welded armour housings are built into the
// shell (their inner edges at least 20 mm in, the bustle module 50 mm into the 96B's rear cap); cage roots and floor bars
// end 30 mm inside the wall plus their own radius; a thin part (cable, post, strip, seam, mark) crosses a face by no more
// than its own half-thickness and a few millimetres (a gun band's bore is 2 mm inside the barrel's skin);
// a shaped foot (6 mm into the roof at its corners) swallows the roof's camber under it up to 16 mm, 22 mm where the
// split sensor's foot welds over the chevron's raised upper root.
const HOUSINGS = new Set(['wrap-housing', 'rear-flank-housing', 'brow', 'bustle-module']);
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
    partCensus(bucket, g) { parts.push({ ...censusPart(bucket, g), hit: (g.userData?.eraHitFaceVertexStarts?.length ?? 0) > 0 }); } });
  tank.root.updateMatrixWorld(true);
  return { tank, parts };
}
const owner = (p) => (p.bucket.startsWith('turret') ? 'turret' : p.bucket.startsWith('gun') ? 'gun' : 'hull');
/** A shifted copy of a census part (a negative control). */
function shifted(p, dy) {
  const tri = Float64Array.from(p.tri); for (let i = 1; i < tri.length; i += 3) tri[i] += dy;
  return { ...p, tri, box: p.box.clone().translate(new THREE.Vector3(0, dy, 0)), dense: undefined, samples: undefined };
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
      console.log(`${id}/${quality}: add-ons ${want ? Object.keys(want).length : 0} roles present and seated PASS`);
    } finally { tank.dispose(); }
  }
}
console.log('cnAddOns: the Yun and Qilin add-ons wrapped round their base turrets and seated, the Qilin 10 % shorter PASS');
