import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
await import('./suppliedSourceArmorInitialization.test-support.mjs');
const {createTank}=await import('./tankFactory.ts');
const {getSpec}=await import('./specs.ts');
const {SUPPLIED_SOURCE_IDS,synchronizeSuppliedSourceCombatMetadata}=await import('./suppliedSourceFleetSpecs.ts');
const {ensureInteriorFills}=await import('./interiorFills.ts');
const {stripActivatedEra}=await import('../game/eraActivation.ts');

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
