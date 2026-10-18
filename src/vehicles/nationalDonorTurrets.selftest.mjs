// Owner 2026-10-15 (VEH-19..VEH-22): "adopt its turret to actually use the ztz-99a2 turret", "make the kunlun usee the
// type 96b turret", "turrets properly based off the t72 b3m 2016, t72 b3"; release 227 (owner 2026-10-16): the Yun on the
// Type 96B, the Qilin's 99A2 cut 10 % at its bustle. Each listed concept's turret is the donor
// fleet turret itself, emitted by the donor's own builder: every vertex of the donor's turret casting and of its main
// gun appears in the concept at the same turret-frame position, the turret rides the listed ring seat, and the combat
// spec carries the donor turret's own trunnion, barrel, turret plates and turret modules.
import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { NATIONAL_DONOR_TURRETS } from './nationalDonorTurrets.ts';
import { bustleCutZ, ZTZ99A2_BUSTLE_CUT_FRONT_Z } from './donorBustleCut.ts';

const key = (x, y, z) => [x, y, z].map((v) => Math.round(v * 1e4)).join(',');
function vertexSet(mesh) {
  const set = new Set(), p = mesh.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) set.add(key(p.getX(i), p.getY(i), p.getZ(i)));
  return set;
}
function owned(tank, rigName, meshName) {
  const rig = tank.root.getObjectByName(rigName), mesh = rig?.getObjectByName(meshName);
  assert(mesh?.isMesh, `${rigName}/${meshName} mesh`);
  return mesh;
}

const donors = new Map();
for (const [id, d] of Object.entries(NATIONAL_DONOR_TURRETS)) {
  if (!donors.has(d.donor)) {
    const donor = createTank(d.donor, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
    donors.set(d.donor, { turret: vertexSet(owned(donor, 'rig_turret', 'turret')), gun: vertexSet(owned(donor, 'rig_gun', 'gun')) });
    donor.dispose();
  }
  const { turret, gun } = donors.get(d.donor);
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
  try {
    const rig = tank.root.getObjectByName('rig_turret');
    rig.position.toArray().forEach((v, i) => assert(Math.abs(v - d.pivot[i]) < 1e-6, `${id}: turret rides its listed ring seat`));
    assert.equal(rig.userData.nationalDonorTurret?.donor, d.donor, `${id}: donor turret receipt`);
    const concept = vertexSet(owned(tank, 'rig_turret', 'turret'));
    // Release 227: a donor built with its bustle cut (the Qilin's ZTZ-99A2) is compared to the donor's casting with the
    // same cut: each vertex's z maps through bustleCutZ. Its omitted rear flank fit (rearFlank: false: the rear stowage
    // box among the casting's own parts) and the gun throat's clip seams (|x| 0.40 and its rear wall at z 0.20, where the
    // floor and crown fans' slopes changed under the mantlet) are the only donor vertices not carried over.
    const cut = Number(d.builderOptions?.bustleCutM ?? 0);
    const mapped = cut > 0 ? new Set([...turret].map((k) => { const [x, y, z] = k.split(',').map(Number); return key(x / 1e4, y / 1e4, bustleCutZ(z / 1e4, cut)); })) : turret;
    // A donor built with its own ring collar (ringCollar: the Qilin's turns in place on its pivot) leaves out the 99A2's
    // collar (cylY 1.08/1.14, y -0.08..0.02, centred 0.12 m behind the pivot: its rims and cap centres), and carries its
    // own, concentric.
    const collar = d.builderOptions?.ringCollar;
    const fleetCollar = (x, y, z) => Boolean(collar) && y > -.0805 && y < .0205 && (Math.hypot(x, z + .12) < 1e-3 || (Math.hypot(x, z + .12) > 1.075 && Math.hypot(x, z + .12) < 1.145));
    const omitted = (k) => { const [x, y, z] = k.split(',').map((n) => n / 1e4); if (fleetCollar(x, y, z)) return true; if (!(cut > 0)) return false;
      return (d.builderOptions?.rearFlank === false && Math.abs(x) > 1.19 && Math.abs(x) < 1.41 && y > .40 && z < ZTZ99A2_BUSTLE_CUT_FRONT_Z)
        || Math.abs(Math.abs(x) - .40) < 2e-4 || (Math.abs(x) < .40 && Math.abs(z - .20) < 2e-4); };
    if (collar) {
      const ring = [...concept].map((k) => k.split(',').map((n) => n / 1e4)).filter(([x, y, z]) => Math.abs(y + .08) < 2e-4 && Math.abs(Math.hypot(x, z - collar.z) - collar.radiusM) < 2e-3);
      assert.ok(ring.length >= 14, `${id}: its own ring collar's skirt, r ${collar.radiusM} round (0, ${collar.z}) (${ring.length} vertices)`);
    }
    const missing = [...mapped].filter((v) => !concept.has(v) && !omitted(v));
    assert.equal(missing.length, 0, `${id}: ${missing.length} of the ${d.donor} turret casting's vertices are missing${cut > 0 ? ' (with its bustle cut)' : ''}: ${missing.slice(0, 4).join(' ; ')}`);
    const barrel = vertexSet(owned(tank, 'rig_gun', 'gun'));
    const lost = [...gun].filter((v) => !barrel.has(v));
    assert.equal(lost.length, 0, `${id}: ${lost.length} of the ${d.donor} main gun's vertices are missing`);
    const spec = getSpec(id), donorSpec = getSpec(d.donor);
    assert.deepEqual(spec.armor.turretPivot, [...d.pivot], `${id}: combat pivot on the ring seat`);
    assert.deepEqual(spec.armor.gunPivot, donorSpec.armor.gunPivot, `${id}: the donor's trunnion`);
    assert.deepEqual(spec.armor.gunBarrel, donorSpec.armor.gunBarrel, `${id}: the donor's barrel`);
    // Authored plates only: the anatomy calibration appends each vehicle's own measured roof structures (cupolas,
    // hatches: <frame>_<kind>_<nn>_<face>) from its own geometry.
    const structure = /^turret_[a-z_]+_\d{2}_(front|rear|left|right|top)$/;
    const names = (plates) => [...new Set(plates.filter((p) => p.kind !== 'era' && !structure.test(p.name)).map((p) => p.name))].sort();
    // (a concept built without the 96B's open side bins, bins: false, carries no stowage-screen plates: its own armour
    // housing fills their volume)
    const donorPlates = d.builderOptions?.bins === false ? donorSpec.armor.turretPlates.filter((p) => !/^turret_stowage_screen_[LR]$/.test(p.name)) : donorSpec.armor.turretPlates;
    assert.deepEqual(names(spec.armor.turretPlates), names(donorPlates), `${id}: the donor turret's plates`);
    const turretModules = (s) => s.armor.modules.filter((m) => m.turretLocal).map((m) => m.module).sort();
    assert.deepEqual(turretModules(spec).filter((m) => m !== 'roofGun'), turretModules(donorSpec).filter((m) => m !== 'roofGun'),
      `${id}: the donor turret's modules`);
    let stations = 0; tank.root.traverse((o) => { if (o.userData.remoteControlled) stations++; });
    assert.equal(stations, 1, `${id}: one working roof gun (the donor's commander gun gives way to the concept's station)`);
  } finally { tank.dispose(); }
  console.log(`${id}: the ${d.donor} turret and gun, on its ring seat, with the donor's combat turret`);
}
console.log(`nationalDonorTurrets: ${Object.keys(NATIONAL_DONOR_TURRETS).length} concepts carry their donor turrets PASS`);
