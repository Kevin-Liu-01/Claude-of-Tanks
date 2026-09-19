import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { SUPPLIED_SOURCE_IDS, synchronizeSuppliedSourceCombatMetadata } from './suppliedSourceFleetSpecs.ts';
import { ensureInteriorFills } from './interiorFills.ts';
import { stripActivatedEra } from '../game/eraActivation.ts';

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
const originalArmor = new Map(SUPPLIED_SOURCE_IDS.map(id => [id, structuredClone(getSpec(id).armor)]));

// Re-run the actual post-balance path, which clones the donor armor afresh.
// A one-time startup patch would reintroduce the phantom zones here.
for (let pass = 0; pass < 2; pass++) {
  synchronizeSuppliedSourceCombatMetadata();
  for (const {id, spec, donor, donorBefore, initialArmor} of cases) {
    assert.deepEqual(rows(spec.armor), [], `${id}: synchronization cannot resurrect phantom ERA`);
    for (const owner of owners) {
      const permanent = donor.armor[`${owner}Plates`].filter(p => p.kind !== 'era');
      const current = spec.armor[`${owner}Plates`];
      assert.equal(current.length, permanent.length, `${id}/${owner}: all permanent donor plates retained`);
      assert.deepEqual(current.map(p => [p.name,p.kind,p.physicalMm,p.keMm,p.ceMm,p.era]),
        permanent.map(p => [p.name,p.kind,p.physicalMm,p.keMm,p.ceMm,p.era]),
        `${id}/${owner}: permanent protection identity/classification/strength unchanged`);
    }
    assert.deepEqual(spec.armor.turretPivot, initialArmor.turretPivot, `${id}: measured turret frame retained`);
    assert.deepEqual(spec.armor.gunPivot, initialArmor.gunPivot, `${id}: measured gun frame retained`);
    assert.deepEqual(spec.armor.gunBarrel, initialArmor.gunBarrel, `${id}: measured barrel metadata retained`);
    assert.equal(JSON.stringify(donor.armor), donorBefore, `${id}: real donor armor never changed`);
  }
}
// Production synchronizes before one-shot anatomy finalization. Restore every
// affected finalized armor snapshot after this deliberately repeated sync;
// its sealed spec marker cannot pretend to rerun anatomy finalization.
for (const [id, armor] of originalArmor) getSpec(id).armor = armor;

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
