// Owner 2026-10-15 (VEH-19..VEH-22): "adopt its turret to actually use the ztz-99a2 turret", "make the kunlun usee the
// type 96b turret", "turrets properly based off the t72 b3m 2016, t72 b3"; release 227 (owner 2026-10-16): the Yun on the
// Type 96B; 252 (owner: "redesign the qilin around a type 96b inspired Yun like turret"): the Qilin on the Type 96B too.
// Each listed concept's turret is the donor
// fleet turret itself, emitted by the donor's own builder: every vertex of the donor's turret casting and of its main
// gun appears in the concept at the same turret-frame position, the turret rides the listed ring seat, and the combat
// spec carries the donor turret's own trunnion, barrel, turret plates and turret modules. 252: each turret is seated over
// its own hull's deck (turretSeatRace.ts, from its ring receipt; the Qilin's 96B collar stands 11 mm into the B3 deck's
// seat plane as authored), so the casting identity compares the turrets as authored: the donor and each concept built
// without their ring receipts.
import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { NATIONAL_DONOR_TURRETS } from './nationalDonorTurrets.ts';
import { combatAnatomyCalibration, registerCombatAnatomyCalibrations } from './combatAnatomyCalibrationRegistry.ts';
import { betweenBuilds } from '../../tools/build-loop-yield.mjs';
import { registerProfiledBuilders } from './tankFactoryCore.ts';
import { PROFILED_BUILDERS } from './profiledProcedurals.ts';
import { buildT72B3MX } from './profiles/t72b3mX.ts';

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

/** Build with the ids' ring receipts set aside (the turrets as authored), then restore the committed rows. */
function authored(ids, build) {
  const committed = ids.map((id) => combatAnatomyCalibration(id));
  registerCombatAnatomyCalibrations(Object.fromEntries(ids.map((id, i) => { const { turretRing: _ring, ...bare } = committed[i]; return [id, bare]; })));
  try { return build(); } finally { registerCombatAnatomyCalibrations(Object.fromEntries(ids.map((id, i) => [id, committed[i]]))); }
}

// 1126bb0274 (Main, 2026-10-31, nationalGunMantlet): the T-72B3M family's own build (familyFinish: the 2016 and the
// 2022) draws the fatter 2A46M-5 sleeve (fume extractor r .1475, clamp bands, seams); the national concepts on its turret
// keep the measured sleeve their gun curves were swept for. Their main gun is that donor gun as its turret builder draws
// it without the family finish; the turret casting is still the donor's own.
const NATIONAL_GUN_BUILDS = Object.freeze({ t72b3m_2016: (port) => buildT72B3MX(port, { familyFinish: false }) });
const donors = new Map();
for (const [id, d] of Object.entries(NATIONAL_DONOR_TURRETS)) {
  await betweenBuilds(); // the last build is free to go (tools/build-loop-yield.mjs)
  if (!donors.has(d.donor)) {
    const build = () => authored([d.donor], () => createTank(d.donor, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 }));
    const donor = build();
    const entry = { turret: vertexSet(owned(donor, 'rig_turret', 'turret')), gun: vertexSet(owned(donor, 'rig_gun', 'gun')) };
    donor.dispose();
    if (NATIONAL_GUN_BUILDS[d.donor]) {
      try {
        registerProfiledBuilders({ [d.donor]: NATIONAL_GUN_BUILDS[d.donor] });
        const national = build();
        const gun = vertexSet(owned(national, 'rig_gun', 'gun'));
        national.dispose();
        assert.ok([...entry.gun].some((v) => !gun.has(v)), `${d.donor}: the family finish still draws its own sleeve (else drop its NATIONAL_GUN_BUILDS row)`);
        entry.gun = gun;
      } finally {
        registerProfiledBuilders({ [d.donor]: PROFILED_BUILDERS[d.donor] });
      }
    }
    donors.set(d.donor, entry);
  }
  const { turret, gun } = donors.get(d.donor);
  const tank = authored([id], () => createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 }));
  try {
    const rig = tank.root.getObjectByName('rig_turret');
    rig.position.toArray().forEach((v, i) => assert(Math.abs(v - d.pivot[i]) < 1e-6, `${id}: turret rides its listed ring seat`));
    assert.equal(rig.userData.nationalDonorTurret?.donor, d.donor, `${id}: donor turret receipt`);
    const concept = vertexSet(owned(tank, 'rig_turret', 'turret'));
    const missing = [...turret].filter((v) => !concept.has(v));
    assert.equal(missing.length, 0, `${id}: ${missing.length} of the ${d.donor} turret casting's vertices are missing: ${missing.slice(0, 4).join(' ; ')}`);
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
