import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { SOURCE_X_IDS, SOURCE_X_DONORS } from './sourceXFleetSpecs.ts';
import { PROCEDURAL_PROFILES } from './profiledProcedurals.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { geometryFingerprint } from './tankAssets.ts';
import { tankTier } from './tier.ts';

// Independent geometry-only fingerprints measured from the completed
// pre-X commit 2c22d203d8726cfceefbe427f3930a000524da32 at seed4242.
// Hashes include instanced wheel/track transforms; no supplied model involved.
const original = {
  leo2a7v:'0408e8a9', leo2a6m:'ff243603', leo2a4m:'4d18c11e', leo2a5:'b933c5f8',
  merkava4:'e068d72b', merkava3d:'6edda570', k2:'d578727f', kf51:'97f0ccbb',
  t90a:'09387506', t90a_vladimir:'16077e28', t90m:'ffbd40d4', t90sm:'6b86f1e1', t14:'61ce3db7',
};
const options = { proceduralOnly:true, geometryReceipt:true, quality:'high', camoSeed:4242 };
for (const [id, hash] of Object.entries(original)) {
  const tank = createTank(id, null, options);
  try { assert.equal(geometryFingerprint(tank.root), hash, `${id}: existing geometry must be preserved`); }
  finally { tank.dispose(); }
}
assert.equal(SOURCE_X_IDS.length, 13);
for (const id of SOURCE_X_IDS) {
  const donor = SOURCE_X_DONORS[id], spec = TANK_SPECS[id];
  assert.equal(ALL_TANK_IDS.filter(value => value === id).length, 1, `${id}: exactly one selectable row`);
  assert.ok(spec.name.endsWith(' X'), `${id}: temporary X suffix`);
  assert.equal(tankTier(id), tankTier(donor), `${id}: no implicit combat tier increase`);
  assert.equal(MODEL_SOURCE[id].source, 'procedural');
  assert.equal(spec.community, undefined);
  assert.ok(FLEET_GROUP_BY_ID[id].endsWith('X'), `${id}: independently demand-loaded builder`);
  assert.equal(typeof PROCEDURAL_PROFILES[id].build, 'function');
  assert.notEqual(PROCEDURAL_PROFILES[id].build, PROCEDURAL_PROFILES[donor]?.build);
  assert.deepEqual(spec.gun, TANK_SPECS[donor].gun, `${id}: current donor combat balance`);
  assert.equal(spec.hp, TANK_SPECS[donor].hp);
  assert.notEqual(spec.armor, TANK_SPECS[donor].armor);
  const tank = createTank(id, null, options);
  try {
    assert.ok(tank.root.getObjectByName('hull')?.geometry);
    assert.ok(tank.root.getObjectByName('turret')?.geometry);
    assert.notEqual(geometryFingerprint(tank.root), original[donor], `${id}: genuinely new authored geometry`);
  } finally { tank.dispose(); }
}
console.log('sourceXFleet: all 13 original models preserved; 13 independent procedural X builds, identities and combat metadata pass');
