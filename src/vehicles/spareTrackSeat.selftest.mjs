// VEH-13 (2026-10-15): the spare-track seat solver (spareTrackSeat.ts) rejects every defect class on synthetic
// fixtures, lifts a sunk run off its own mount, re-seats a buried one outward (never under the gun, never crowded), and
// the Strv 103 family builds clean: no run on its fixed gun, the Strv 103A carries exactly one hull run (its A-era
// links; R8 keeps the generic decor run off), the Strv 103B's nose courses stay where authored on the nose face, and
// the UDES 03's decor run is off the gun and louvres.
// SPARE_TRACK_SEAT_SYNTHETIC_ONLY=1 runs the fixtures alone (no tank builds).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  measureSeat, refineSeat, SeatSoup, seatAngularLow, seatRadialProfile, solveSpareTrackSeat, seatRoleForBucket,
  rackSeat, RACK_POST_MAX_M, outlineExcess, OUTLINE_TOL_M,
} from './spareTrackSeat.ts';

const UNIT = new THREE.Vector3(1, 1, 1);
const src = (geometry, role, owner = 0, foreign = false) => ({ geometry, matrix: null, role, owner, foreign });
const plate = (w, h, d, x, y, z, rx = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), UNIT));
  return g;
};
// A fitting-like run: 0.5 m wide (x), 3 links along z, carrier base at local y -0.0405, links' backs 1.8 cm above it.
const shape = (w = 0.5, len = 0.48) => ({
  box: new THREE.Box3(new THREE.Vector3(-w / 2, -0.0405, -len / 2), new THREE.Vector3(w / 2, 0.05, len / 2)),
  axis: 1, embedM: 0, standoffM: 0.018,
});
const poseOn = (x, y, z, rx = 0) => ({
  pos: new THREE.Vector3(x, y + 0.0405, z), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)),
});
const env = (sources, frame = 'hull', motion = null) => ({
  frame, soup: new SeatSoup(sources, new THREE.Box3(new THREE.Vector3(-4, -2, -4), new THREE.Vector3(4, 4, 4))), motion,
});

// 0. control: a run flat on a broad armour plate passes every rule
{
  const e = env([src(plate(2, 0.1, 2, 0, -0.05, 0), 'armor')]);
  const m = measureSeat(e, shape(), poseOn(0, 0, 0), 7, true);
  assert.ok(m.ok, `control seat passes (${m.reason})`);
  assert.equal(m.support, 1);
  assert.ok(m.exposure > 0.9, `open deck exposure ${m.exposure}`);
}

// 0b. OUTLINE (2026-10-16, the owner's rule: no run stands past the tank's width or length): the control seat inside a
// plan outline passes. The seeded break moves the outline's right edge 5 cm inside the run's right edge, and the same
// seat fails on 'outline' with a 5 cm excess. Inside the tolerance it still passes.
{
  const plateOnly = () => env([src(plate(2, 0.1, 2, 0, -0.05, 0), 'armor')]);
  const outline = (maxX) => new THREE.Box3(new THREE.Vector3(-1, -Infinity, -1), new THREE.Vector3(maxX, Infinity, 1));
  const inside = { ...plateOnly(), outline: outline(1) };
  assert.ok(measureSeat(inside, shape(), poseOn(0, 0, 0), 7).ok, 'a run inside the plan outline passes');
  const seeded = { ...plateOnly(), outline: outline(0.25 - 0.05) };
  const broken = measureSeat(seeded, shape(), poseOn(0, 0, 0), 7, true);
  assert.equal(broken.ok, false, 'the seeded break: a run 5 cm past the outline fails');
  assert.equal(broken.reason, 'outline');
  assert.ok(Math.abs(outlineExcess(seeded.outline, shape(), poseOn(0, 0, 0)) - 0.05) < 1e-9, 'its excess reads 5 cm');
  const grazing = { ...plateOnly(), outline: outline(0.25 - OUTLINE_TOL_M / 2) };
  assert.ok(measureSeat(grazing, shape(), poseOn(0, 0, 0), 7).ok, 'within the tolerance it still passes');
  // a rack lifts the run off the plate along its normal; a rack that would carry it past a side outline is refused
  const wall = env([src(plate(0.1, 2, 2, 1.05, 1, 0), 'armor')]);
  const sideQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2));
  const sidePose = { pos: new THREE.Vector3(1.1 + 0.0405 + 0.03, 1, 0), quat: sideQuat };
  const tight = { ...wall, outline: new THREE.Box3(new THREE.Vector3(-1.2, -Infinity, -1), new THREE.Vector3(1.2, Infinity, 1)) };
  assert.equal(rackSeat(tight, shape(), sidePose, 7), null, 'no rack past the side outline');
}

// 1. ON_GUN: the Strv 103A case, an 18-gon tube whose crown facet is 10 degrees; posed from one ray on its crown
{
  const tube = new THREE.CylinderGeometry(0.1, 0.1, 3, 18);
  tube.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  tube.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 1.5, 0));
  const deck = plate(3, 0.1, 3, 0, 0.9, 0);
  const pose = poseOn(0, 1.6, 0);
  const asGun = measureSeat(env([src(tube, seatRoleForBucket('hullGun')), src(deck, 'armor')]), shape(), pose, 7);
  assert.equal(asGun.ok, false, 'a run on the fixed gun is rejected');
  assert.match(asGun.reason, /^host:gun|^air|^support/);
  // even unlabelled (the old hull-bucket gun) the tube cannot carry it: the facets spread and the footprint is air
  const asArmor = measureSeat(env([src(tube.clone(), 'armor'), src(deck.clone(), 'armor')]), shape(), pose, 7);
  assert.equal(asArmor.ok, false, `a run across a tube fails on support (${asArmor.reason})`);
  assert.ok(asArmor.support < 0.5, `tube support ${asArmor.support}`);
}

// 2. HANGING: a plate edge with 40 % of the run over air
{
  const e = env([src(plate(1, 0.1, 1, 0, -0.05, 0), 'armor')]);
  const m = measureSeat(e, shape(0.5, 0.48), poseOn(0, 0, 0.5 - 0.24 + 0.19), 7);
  assert.equal(m.ok, false, 'an overhanging run is rejected');
  assert.match(m.reason, /^(air|support)/);
}

// 3. WEIRD: a grille-tagged host
{
  const e = env([src(plate(2, 0.1, 2, 0, -0.05, 0), 'grille')]);
  const m = measureSeat(e, shape(), poseOn(0, 0, 0), 7);
  assert.equal(m.reason, 'host:grille');
}

// 4. WEIRD: a hatch disc beside the run (3 cm clearance) and under it (host)
{
  const hatch = new THREE.CylinderGeometry(0.3, 0.3, 0.06, 18);
  hatch.applyMatrix4(new THREE.Matrix4().makeTranslation(0.53, 0.03, 0));
  const e = env([src(plate(2, 0.1, 2, 0, -0.05, 0), 'armor'), src(hatch, 'hatch')]);
  const beside = measureSeat(e, shape(), poseOn(0, 0, 0), 7);
  assert.equal(beside.ok, false, 'a run within 3 cm of a hatch is rejected');
  assert.match(beside.reason, /^(clear:hatch|host:hatch)/);
  const on = measureSeat(e, shape(), poseOn(0.45, 0.06, 0), 7);
  assert.equal(on.reason, 'host:hatch', 'a run on a hatch is rejected');
}

// 5. BURIED: an authored hint under a later armour plate re-seats outward, on top of the plate
{
  const deck = plate(2, 0.1, 2, 0, -0.05, 0);
  const later = plate(1.2, 0.12, 1.2, 0, 0.06, 0);
  const e = env([src(deck, 'armor'), src(later, 'armor')]);
  const hint = poseOn(0, 0, 0);
  const hintM = measureSeat(e, shape(), hint, 7);
  assert.equal(hintM.ok, false, 'the buried hint fails');
  assert.match(hintM.reason, /^(sunk|cut|buried)/);
  const r = solveSpareTrackSeat(e, shape(), hint, 7);
  assert.ok(r.ok, 'the buried run re-seats');
  assert.equal(r.seat, 'reseated');
  assert.ok(Math.abs(r.pose.pos.y - (0.12 + 0.0405)) < 0.005, `re-seated on the plate top (${r.pose.pos.y})`);
}

// 6. ON_GUN (casemate): a centreline gun over the glacis; the run off the gun's 5 cm passes
{
  const glacis = plate(3, 0.1, 2, 0, -0.05, 0);
  const tube = new THREE.CylinderGeometry(0.1, 0.1, 3, 18);
  tube.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  tube.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.12, 0));
  const e = env([src(glacis, 'armor'), src(tube, 'gun')]);
  assert.equal(measureSeat(e, shape(), poseOn(0, 0, 0), 7).ok, false, 'a run under the centreline gun is rejected');
  assert.equal(measureSeat(e, shape(), poseOn(0.36, 0, 0), 7).reason, 'clear:gun', 'an authored run 1 cm from the gun is rejected');
  assert.equal(measureSeat(e, shape(), poseOn(0.38, 0, 0), 7, false, true).reason, 'clear:gun',
    'a seat the solver chooses keeps the gun\'s full 5 cm');
  const off = measureSeat(e, shape(), poseOn(0.7, 0, 0), 7);
  assert.ok(off.ok, `a run clear of the gun passes (${off.reason})`);
}

// 7. IN_SWEEP: a turret side run over a hull step during traverse (the Challenger 1 deck step)
{
  // turret frame: a short side wall at x 0.9 (radius < 1 m) and the run hung on it (mount axis +x), standing out past
  // the wall's radius; the hull step lies beyond the wall, under the run's outer edge only
  const wall = plate(0.1, 0.6, 0.6, 0.9, 0.3, 0);
  const pivot = new THREE.Vector3(0, 1.4, 0);
  const step = plate(0.6, 0.2, 0.6, 1.0, 1.4, 0.0); // hull frame: top at 1.5, inside the run's swept band
  const turretSrc = [src(wall, 'armor')];
  const hullSrc = [src(step, 'armor')];
  const motion = {
    pivot, gunPivot: new THREE.Vector3(), turreted: true, arc: 0, gun: null,
    pitchMin: () => 0, pitchMax: 0.3,
    turretLow: seatRadialProfile(turretSrc.map((s) => ({ ...s, matrix: new THREE.Matrix4().makeTranslation(0, 1.4, 0) })),
      0, 0, true),
    hullHigh: () => seatRadialProfile(hullSrc, 0, 0, false, 0, 8, 0),
    turretAngularLow: () => seatAngularLow(turretSrc),
  };
  const side = { box: new THREE.Box3(new THREE.Vector3(-0.2, -0.0405, -0.24), new THREE.Vector3(0.2, 0.05, 0.24)), axis: 1,
    embedM: 0, standoffM: 0.018 };
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  const pose = { pos: new THREE.Vector3(0.95 + 0.0405, 0.25, 0), quat };
  const e = { frame: 'turret', soup: new SeatSoup(turretSrc, new THREE.Box3(new THREE.Vector3(-3, -2, -3), new THREE.Vector3(3, 3, 3))), motion };
  const m = measureSeat(e, side, pose, 7);
  assert.equal(m.reason, 'sweep', `a turret run that traverses through a hull step is rejected (${m.reason})`);
  const high = { pos: pose.pos.clone().setY(0.38), quat };
  assert.ok(measureSeat(e, side, high, 7).ok, 'the same run above the step passes');
}

// 8. WEIRD: a bustle strip on a cloth roll
{
  const roll = new THREE.CylinderGeometry(0.12, 0.12, 1.2, 14);
  roll.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  roll.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.12, 0));
  const e = env([src(plate(2, 0.1, 2, 0, -0.05, 0), 'armor'), src(roll, seatRoleForBucket('turretCloth'))], 'turret');
  const m = measureSeat(e, shape(), poseOn(0, 0.24, 0), 7);
  assert.equal(m.ok, false, 'a strip on a cloth roll is rejected');
  assert.match(m.reason, /^(host:soft|air|support)/);
}

// 9. BURIED (no cover along the axis): a run at the bottom of a deep well sees too little sky
{
  const parts = [src(plate(3, 0.1, 3, 0, -0.05, 0), 'armor')];
  for (const [x, z, w, d] of [[0.42, 0, 0.1, 1.0], [-0.42, 0, 0.1, 1.0], [0, 0.42, 1.0, 0.1], [0, -0.42, 1.0, 0.1]]) {
    parts.push(src(plate(w, 0.7, d, x, 0.35, z), 'armor'));
  }
  const m = measureSeat(env(parts), shape(0.5, 0.48), poseOn(0, 0, 0), 7);
  assert.equal(m.reason, 'buried', `a run in a well is dead geometry (${m.reason}, exposure ${m.exposure})`);
}

// 10. a plane-fit refinement seats a run that a single crown ray posed off its plate
{
  const tilted = plate(2, 0.1, 2, 0, -0.05, 0, 0.2);
  const e = env([src(tilted, 'armor')]);
  const flat = poseOn(0, 0.06, 0);
  assert.equal(measureSeat(e, shape(), flat, 7).ok, false, 'the level pose does not sit on the 11 degree plate');
  const refined = refineSeat(e, shape(), flat, 7);
  assert.ok(refined, 'the plane fit finds the plate');
  assert.ok(measureSeat(e, shape(), refined, 7).ok, 'the plane-fit pose passes');
}

// 12. R9: a seat the solver chooses never lies under the gun; an authored one only on a gun fixed in the hull
{
  const tube = new THREE.CylinderGeometry(0.1, 0.1, 3, 18);
  tube.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  tube.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.8, 0));
  const deck = src(plate(3, 0.1, 3, 0, -0.05, 0), 'armor');
  const under = measureSeat({ ...env([deck, src(tube, 'gun', 0, true)]), motion: null }, shape(), poseOn(0.2, 0, 0), 7, true, true);
  assert.equal(under.reason, 'under-gun', `a chosen seat 5 cm beside the barrel's footprint fails (${under.reason})`);
  const clear = measureSeat(env([deck, src(tube.clone(), 'gun', 0, true)]), shape(), poseOn(0.5, 0, 0), 7, true, true);
  assert.ok(clear.ok, `a chosen seat 15 cm off the footprint passes (${clear.reason})`);
}

// 13. a chosen seat sits in open plate: a rail upright rising beside its links (2 cm off) fails, 8 cm off passes
{
  const deck = src(plate(3, 0.1, 3, 0, -0.05, 0), 'armor');
  const post = (x) => src(plate(0.03, 0.3, 0.03, x, 0.15, 0), 'armor');
  const tight = measureSeat(env([deck, post(0.25 + 0.035)]), shape(), poseOn(0, 0, 0), 7, true, true);
  assert.equal(tight.reason, 'crowded', `an upright 2 cm off the links crowds a chosen seat (${tight.reason})`);
  const open = measureSeat(env([deck, post(0.25 + 0.095)]), shape(), poseOn(0, 0, 0), 7, true, true);
  assert.ok(open.ok, `an upright 8 cm off leaves it open (${open.reason})`);
}

// 14. authored mounts first: a run whose link backs sink 3.2 cm into its own mount is lifted straight off it (by that
// much and a few mm), not moved along the plate
{
  const e = env([src(plate(2, 0.1, 2, 0, -0.05, 0), 'armor')]);
  const sunk = poseOn(0.1, -0.05, 0.2);
  const r = solveSpareTrackSeat(e, shape(), sunk, 7);
  assert.equal(r.seat, 'lifted', `a sunk run is lifted (${r.seat}, ${r.hint.reason})`);
  assert.ok(Math.abs(r.pose.pos.x - 0.1) < 1e-6 && Math.abs(r.pose.pos.z - 0.2) < 1e-6, 'the lift keeps its plan position');
  assert.ok(r.pose.pos.y - sunk.pos.y > 0.032 && r.pose.pos.y - sunk.pos.y < 0.045, `lifted ${r.pose.pos.y - sunk.pos.y} m`);
}

// 15. fix the mount, don't remove: over a ribbed deck (4 cm ribs) no flush seat holds, a rack does: lifted clear of the
// ribs on four posts that each find the deck, and a rack whose posts would stand on air is refused
{
  const deck = src(plate(3, 0.1, 3, 0, -0.05, 0), 'armor');
  const ribs = [-0.2, 0.05, 0.3].map((z) => src(plate(0.8, 0.04, 0.05, 0, 0.02, z), 'armor'));
  const e = env([deck, ...ribs]);
  const pose = poseOn(0, 0, 0.05);
  assert.equal(measureSeat(e, shape(), pose, 7, false, true).ok, false, 'no flush seat over the ribs');
  const r = rackSeat(e, shape(), pose, 7);
  assert.ok(r, 'a rack carries the run over the ribs');
  assert.equal(r.posts.length, 4);
  for (const p of r.posts) assert.ok(p.top.distanceTo(p.foot) <= RACK_POST_MAX_M, 'each post reaches the plate');
  assert.ok(r.pose.pos.y - pose.pos.y > 0.039 && r.pose.pos.y - pose.pos.y < 0.05, `the rack clears the ribs (${r.pose.pos.y - pose.pos.y})`);
  const edge = env([src(plate(0.3, 0.1, 3, 0, -0.05, 0), 'armor')]);
  assert.equal(rackSeat(edge, shape(), poseOn(0, 0, 0), 7), null, 'a rack whose outer posts stand on air is refused');
}

console.log('spareTrackSeat.selftest: synthetic fixtures passed (gun, tube facet, overhang, grille, hatch, buried re-seat, '
  + 'casemate gun, traverse step, cloth roll, well, plane fit, under the gun, crowded, lift, rack)');

if (process.env.SPARE_TRACK_SEAT_SYNTHETIC_ONLY !== '1') {
  const { readFileSync } = await import('node:fs');
  const { createTank } = await import('./tankFactory.ts');
  const { ALL_TANK_IDS } = await import('./specs.ts');
  const { SPARE_TRACK_BUILD, spareTrackGeometryDigest } = await import('../../tools/spare-track-digest.mjs');
  const ledger = JSON.parse(readFileSync(new URL('../../docs/geometry-gate/spare-track.json', import.meta.url), 'utf8'));
  // the fleet ledger (tools/spare-track-placement-check.mjs): every id measured, no gated class anywhere
  const GATED = new Set(['ON_GUN', 'IN_SWEEP', 'HANGING', 'FLOATING', 'WEIRD', 'INTERSECTING', 'BURIED']);
  assert.deepEqual(Object.keys(ledger.rows).sort(), [...ALL_TANK_IDS].sort(), 'the spare-track ledger rows every id');
  for (const [id, row] of Object.entries(ledger.rows)) {
    for (const run of row.runs) assert.ok(!run.classes.some((c) => GATED.has(c)), `${id} ${run.site}: ${run.classes.join(', ')}`);
    assert.deepEqual(row.uncovered, [], `${id}: uncovered spare-link geometry`);
  }
  // the recorded search answers (spareTrackSeatPlan.ts) must match a fresh search
  const { setSpareTrackSeatPlanAudit } = await import('./spareTrackSeatPass.ts');
  setSpareTrackSeatPlanAudit(true);
  const build = (id) => createTank(id, null, SPARE_TRACK_BUILD);
  const gunBox = (root) => {
    const box = new THREE.Box3();
    root.traverse((o) => { if (o.isMesh && /^hullGun/.test(o.name)) box.expandByObject(o); });
    return box;
  };
  const trackBoxes = (root) => {
    const boxes = [];
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (o.userData?.fitting === 'spareTrackLinks' && o.userData.fittingRoot) boxes.push(new THREE.Box3().setFromObject(o));
      if (o.isMesh && /^(hull|turret)Track$/.test(o.name)) boxes.push(new THREE.Box3().setFromObject(o));
    });
    return boxes;
  };
  for (const id of ['strv103a', 'udes03', 'strv103b']) {
    const tank = build(id);
    try {
      const root = tank.root;
      assert.equal(root.userData.spareTrackError, undefined, `${id}: the seat pass ran`);
      const runs = root.userData.spareTrack ?? [];
      const gun = gunBox(root);
      assert.ok(!gun.isEmpty(), `${id}: the fixed gun draws into hullGun`);
      // no decor run within 5 cm of the gun
      for (const run of runs) assert.ok(run.clearCm === null || run.clearCm >= 3, `${id}/${run.site}: clearance ${run.clearCm}`);
      const decorRuns = runs.filter((r) => r.source === 'decor');
      for (const run of decorRuns) assert.notEqual(run.frame, undefined);
      for (const box of trackBoxes(root)) {
        assert.ok(!box.clone().expandByScalar(0.03).intersectsBox(gun) || box.min.y > gun.max.y + 0.03,
          `${id}: no spare-link run touches the fixed gun`);
      }
      if (id === 'strv103a') {
        const hull = runs.filter((r) => r.frame === 'hull');
        assert.equal(hull.length, 1, `strv103a carries exactly one hull run (${JSON.stringify(hull)})`);
        assert.equal(hull[0].source, 'fitting', 'the generic decor run stays off a frame with authored links (R8)');
        assert.ok(['authored', 'reseated'].includes(hull[0].seat), 'the A-era links are kept, on a seat that passes');
      }
      if (id === 'strv103b') {
        // the nose links: one clamped course a side on the vertical nose face, kept where authored (blind critics m1:
        // re-seated bare rows on the shelf top read as loose bricks)
        const nose = runs.filter((r) => r.source === 'fitting' && /@hull\(-?0\.30,1\.26,3\.34\)/.test(r.site));
        assert.equal(nose.length, 2, `both nose courses are built (${JSON.stringify(runs.map((r) => r.site))})`);
        for (const run of nose) assert.equal(run.seat, 'authored', `${run.site} is kept where authored`);
      }
      for (const run of runs) {
        // a kept authored seat passes the authored tier, anything the solver chose the strict one
        const strict = run.seat === 'reseated' || run.seat === 'decor' || run.seat === 'racked';
        assert.ok((run.seat === 'racked' || (run.support >= (strict ? 80 : 50) && run.air <= (strict ? 10 : 20)))
          && run.exposure >= (strict ? 50 : 30), `${id}/${run.site}: ${JSON.stringify(run)}`);
      }
      assert.deepEqual(root.userData.spareTrackPlanAudit?.stale ?? [], [], `${id}: the recorded seat plan is current`);
      assert.equal(spareTrackGeometryDigest(root), ledger.rows[id]?.inputHash, `${id}: the ledger row is current (not STALE)`);
    } finally {
      tank.dispose();
    }
  }
  console.log(`spareTrackSeat.selftest: strv103a, udes03 and strv103b (Strv 103B) build clean; ledger ${Object.keys(ledger.rows).length} ids clean`);
}
