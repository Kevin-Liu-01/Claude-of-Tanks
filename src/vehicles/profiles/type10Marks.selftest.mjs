// Release 267 (Main 2026-10-31, the Japan line: "one base"): the Type 10 marks draw the one modern Type 10
// (profiles/type10X.ts) at its true size. 'type10_tk_x' is the TK-X prototype (the base's prototype forms and its trials
// rack), 'type10b' the later production tank with the upgrade programme's fit (a remote station, active protection and
// reactive armour), each with the Type 10's combat frame (type10FamilyFrames.ts). This receipt is both marks' photo
// packet fixture (docs/references/photos/type10-tk-x-20261031.json, type10b-20261031.json).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

// the build's smoke sockets (vehicleAuxiliaryGeometry.ts: one per marked discharger aperture, on the merged meshes)
const smokeApertures = (root) => { let n = 0; root.traverse((o) => { n += o.userData.smokeSockets?.length ?? 0; }); return n; };
const named = (root, name) => root.getObjectByName(name);

// the frames: the Type 10's structural dimensions and rig, each mark's own plates
const type10 = getSpec('type10');
for (const id of ['type10_tk_x', 'type10b']) {
  const spec = getSpec(id);
  for (const key of ['hullLengthM', 'overallLengthM', 'widthM', 'heightM']) assert.equal(spec.dims[key], type10.dims[key], `${id}: the Type 10's ${key}`);
  assert.equal(spec.gun.caliberMm, 120, `${id}: the 120 mm gun`);
  assert.equal(spec.armor.crew.length, 3, `${id}: three crew`);
}
// the 10B's reactive seeds, fitted by the anatomy pass one plate per cassette it draws: six a side on the hull's skirt,
// seven a side over the turret's side blocks
for (const [list, seed, perSide] of [['hullPlates', 'skirt', 6], ['turretPlates', 'turret', 7]]) {
  for (const tag of ['L', 'R']) {
    const n = getSpec('type10b').armor[list].filter((p) => p.name === `type10b_${seed}_era_${tag}`).length;
    assert.equal(n, perSide, `type10b: ${perSide} ${seed} cassettes fitted on its ${tag} side (${n})`);
  }
}

for (const quality of ['high', 'low']) {
  const build = (id) => createTank(id, null, { quality, proceduralOnly: true, geometryReceipt: true, camoSeed: 4242 });
  const tanks = Object.fromEntries(['type10', 'type10_tk_x', 'type10b', 'type10_dozer'].map((id) => [id, build(id)]));
  try {
    for (const [id, tank] of Object.entries(tanks)) {
      tank.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(tank.root);
      assert.ok(Math.abs(box.max.z - box.min.z - 9.42) < 0.002, `${quality}: ${id} keeps the Type 10's 9.42 m (${(box.max.z - box.min.z).toFixed(4)})`);
      // four 76 mm dischargers a side: the base's own in the front blocks, or the Kaitaku's banks on its appliqué
      assert.equal(smokeApertures(tank.root), 8, `${quality}: ${id} fires eight smoke charges`);
    }
    // the roof weapons: the base's manual M2 on the TK-X and the Type 10, the 10B's remote station in its place
    assert.ok(named(tanks.type10.root, 'type10RemoteM2') && named(tanks.type10_tk_x.root, 'type10RemoteM2'), `${quality}: the Type 10 and the TK-X keep the ring M2`);
    assert.ok(!named(tanks.type10b.root, 'type10RemoteM2') && named(tanks.type10b.root, 'type10bRemoteM2'), `${quality}: the 10B carries its remote station instead`);
    const rws = named(tanks.type10b.root, 'type10bRemoteM2');
    assert.ok(rws.getObjectByName('auxiliaryWeaponPitch'), `${quality}: the 10B's station pitches its gun`);
    // the TK-X's prototype forms and the production parts it lacks: the base's TK-X draws fewer meshes on its sides, no
    // basket mesh, and carries the trials rack
    let tkxWires = 0, t10Wires = 0;
    tanks.type10_tk_x.root.traverse((o) => { if (o.isMesh && /OpenLattice/.test(o.name)) tkxWires++; });
    tanks.type10.root.traverse((o) => { if (o.isMesh && /OpenLattice/.test(o.name)) t10Wires++; });
    assert.ok(tkxWires <= t10Wires, `${quality}: the TK-X's open basket fence carries no more lattice than the production basket`);
  } finally { for (const tank of Object.values(tanks)) tank.dispose(); }
}
console.log('type10Marks.selftest: the TK-X and the Type 10B draw the modern Type 10 at 9.42 m with its frame; eight smoke charges on every mark; the 10B\'s remote station in the ring M2\'s place');
