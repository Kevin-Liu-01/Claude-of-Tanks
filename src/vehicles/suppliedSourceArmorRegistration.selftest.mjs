import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
await import('./suppliedSourceArmorInitialization.test-support.mjs');
const {createTank}=await import('./tankFactory.ts');
const {getSpec}=await import('./specs.ts');
const {SUPPLIED_SOURCE_IDS,synchronizeSuppliedSourceCombatMetadata}=await import('./suppliedSourceFleetSpecs.ts');
const {ensureInteriorFills}=await import('./interiorFills.ts');
const {stripActivatedEra}=await import('../game/eraActivation.ts');
const {combatAnatomyCalibration}=await import('./combatAnatomy.ts');

const owners = ['hull', 'turret'];
const rows = armor => owners.flatMap(owner => armor[`${owner}Plates`]
  .filter(p => p.kind === 'era').map(p => ({owner, name: p.name, era: p.era})));
const cases = [
  ['type96b_x', 'type99a', 'glacis_era_L'],
  ['aft10_x', 'm551_sheridan', 'sheridan_glacis_era'],
  ['sabra_mk2_x', 'm60a3', 'm60a3_turret_era_front_L'],
].map(([id, donorId, failureZone]) => {
  const spec = getSpec(id), donor = getSpec(donorId);
  const donorReactive = rows(donor.armor);
  assert.ok(donorReactive.length >= 4, `${id}: donor really has reactive protection`);
  assert.ok(donorReactive.some(r => r.name === failureZone), `${id}: original phantom zone exists on donor`);
  assert.deepEqual(rows(spec.armor), [], `${id}: factory startup removes unauthored donor ERA`);
  return {id, spec, donor, donorReactive, donorBefore: JSON.stringify(donor.armor),
    initialArmor: structuredClone(spec.armor)};
});
// Each vehicle's own combat-anatomy calibration appends its measured roof structures (hatches, cupolas) as permanent
// plates during finalization (combatAnatomy.ts appendStructurePlates: `${owner}_${kind}_NN_${face}`), which runs
// after donor synchronization. 2026-10-01: since 0e5fc79e2 made donor synchronization initialization-only, the loop
// below no longer re-clones the finalized donor (whose m551_sheridan hatch/cupola plates the AFT-10 never had in
// production: aft10_x read 10 hull plates on 581cd5119 too) and instead checks the production armor, so each
// side's own calibrated structures are told apart by name. Every excluded name must exist on its own vehicle.
const calibratedStructureNames = (id, owner) => {
  const names = [];
  (combatAnatomyCalibration(id)?.[`${owner}Structures`] || []).forEach((structure, index) => {
    const [x0, y0, z0] = structure.min, [x1, y1, z1] = structure.max;
    if (!(x1 > x0 && y1 > y0 && z1 > z0)) return;
    const prefix = `${owner}_${structure.kind || 'roof_structure'}_${String(index + 1).padStart(2, '0')}`;
    for (const face of ['front', 'rear', 'right', 'left', 'top']) names.push(`${prefix}_${face}`);
  });
  return names;
};
const withoutOwnStructures = (id, owner, plates) => {
  const own = calibratedStructureNames(id, owner);
  for (const name of own) assert.equal(plates.filter(p => p.name === name && p.kind === 'main' && !p.era).length, 1,
    `${id}/${owner}: calibrated structure plate ${name} is installed once`);
  return plates.filter(p => !own.includes(p.name));
};
for (const {id, spec, donor} of cases) {
  for (const owner of owners) {
    const permanent = withoutOwnStructures(donor.id, owner, donor.armor[`${owner}Plates`]).filter(p => p.kind !== 'era');
    const current = withoutOwnStructures(id, owner, spec.armor[`${owner}Plates`]);
    assert.deepEqual(current.map(p => [p.name,p.kind,p.physicalMm,p.keMm,p.ceMm,p.era]),
      permanent.map(p => [p.name,p.kind,p.physicalMm,p.keMm,p.ceMm,p.era]),
      `${id}/${owner}: permanent donor protection retained apart from each vehicle's own calibrated roof structures`);
  }
}
// Once role tuning and anatomy are finalized, synchronization is deliberately
// immutable. Changing donors here must not replace any finalized recipient.
const finalized = new Map(SUPPLIED_SOURCE_IDS.map(id => [id, JSON.stringify(getSpec(id))]));
const donorSnapshots = new Map(cases.map(({donor}) => [donor, structuredClone(donor)]));
try {
  for (const {donor} of cases) {
    donor.hp += 211;
    donor.armor.hullPlates.push({...structuredClone(donor.armor.hullPlates[0]),name:'after_finalization_sentinel'});
  }
  const mutatedDonors = new Map(cases.map(({donor}) => [donor, JSON.stringify(donor)]));
  for (let pass=0;pass<2;pass++) {
    synchronizeSuppliedSourceCombatMetadata();
    for (const [id,before] of finalized) assert.equal(JSON.stringify(getSpec(id)),before,`${id}: finalized recipient stays immutable`);
    for (const [donor,before] of mutatedDonors) assert.equal(JSON.stringify(donor),before,'no reverse mutation of donor');
  }
} finally {
  for (const [donor,snapshot] of donorSnapshots) {
    for (const key of Object.keys(donor)) delete donor[key];
    Object.assign(donor,snapshot);
  }
}

function stockHash(root) {
  const hash = createHash('sha256');
  root.traverse(o => {
    if (!o.geometry) return;
    hash.update(o.name);
    for (const key of Object.keys(o.geometry.attributes).sort()) {
      const a = o.geometry.attributes[key].array;
      hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
    }
    if (o.geometry.index) { const a=o.geometry.index.array; hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)); }
    if (o.instanceMatrix) { const a=o.instanceMatrix.array; hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)); }
  });
  return hash.digest('hex');
}
await ensureInteriorFills(cases.map(({id}) => id));
for (const {id, donor, donorReactive, donorBefore} of cases) {
  for (const quality of ['high','low']) {
    const tank = createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,deferStaticBatch:true});
    try {
      assert.deepEqual(tank.root.userData.eraVisualBindingReceipt.plates, [], `${id}/${quality}: no orphan binding`);
      assert.deepEqual(tank.root.userData.eraClusterNames, [], `${id}/${quality}: no invented destructible cluster`);
      assert.deepEqual(tank.root.userData.eraFinishReceipt?.sectors ?? [], [], `${id}/${quality}: no unbound reactive field`);
      const before = stockHash(tank.root);
      stripActivatedEra({eraActivations:donorReactive.map(r => ({plate:r.name}))}, tank);
      assert.equal(stockHash(tank.root), before, `${id}/${quality}: stale donor spent event cannot remove permanent stock`);
      assert.equal(tank.resetEra(), false, `${id}/${quality}: no phantom reactive reset`);
      assert.equal(stockHash(tank.root), before, `${id}/${quality}: reset preserves actual stock`);
    } finally { tank.dispose(); }
  }
  assert.equal(JSON.stringify(donor.armor), donorBefore, `${id}: donor unchanged after native builds`);
}
console.log('suppliedSourceArmorRegistration: Type96B/AFT10/Sabra have no phantom zones; permanent armor, frames, donor ERA, filled HIGH/LOW stock and stale-event controls pass');
