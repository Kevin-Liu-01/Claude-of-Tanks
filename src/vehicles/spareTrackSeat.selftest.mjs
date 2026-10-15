// VEH-13 (2026-10-15): the spare-track seat solver (spareTrackSeat.ts) rejects every defect class on synthetic
// fixtures, re-seats a buried authored run outward, and the Strv 103 family builds clean: no run on its fixed gun, the
// Strv 103A carries exactly one hull run (its authored A-era links; R8 keeps the generic decor run off), the Strv 103B's
// dozer-face courses are seated (not sunk into the nose loft), and the UDES 03's decor run is off the gun and louvres.
// SPARE_TRACK_SEAT_SYNTHETIC_ONLY=1 runs the fixtures alone (no tank builds).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  measureSeat, refineSeat, SeatSoup, seatRadialProfile, solveSpareTrackSeat, seatRoleForBucket,
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
  assert.equal(measureSeat(e, shape(), poseOn(0.38, 0, 0), 7).reason, 'clear:gun', 'a run 3 cm from the gun is rejected');
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

console.log('spareTrackSeat.selftest: synthetic fixtures passed (gun, tube facet, overhang, grille, hatch, buried re-seat, '
  + 'casemate gun, traverse step, cloth roll, well, plane fit)');

if (process.env.SPARE_TRACK_SEAT_SYNTHETIC_ONLY !== '1') {
  const { createTank } = await import('./tankFactory.ts');
  const build = (id) => createTank(id, null, { proceduralOnly: true, decor: true, quality: 'high',
    geometryQuality: 'high', camoSeed: 4242, geometryReceipt: true });
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
  for (const id of ['strv103a', 'udes03', 'strv103']) {
    const tank = build(id);
    try {
      const root = tank.root;
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
        assert.equal(hull[0].source, 'fitting');
        assert.equal(hull[0].seat, 'authored', 'the A-era links stay as authored');
      }
      if (id === 'strv103') {
        const dozer = runs.filter((r) => /strv103b-dozer/.test(r.site));
        const rejected = (root.userData.spareTrackRejected ?? []).filter((r) => /strv103b-dozer/.test(r.site));
        assert.equal(dozer.length + rejected.length, 2, 'both dozer-face courses are registered');
        for (const run of dozer) assert.ok(run.maxEmbedCm <= 1, `${run.site}: links embed ${run.maxEmbedCm} cm`);
      }
      for (const run of runs) {
        assert.ok(run.support >= 80 && run.air <= 10 && run.exposure >= 30, `${id}/${run.site}: ${JSON.stringify(run)}`);
      }
    } finally {
      tank.dispose();
    }
  }
  console.log('spareTrackSeat.selftest: strv103a, udes03 and strv103 (Strv 103B) build clean');
}
