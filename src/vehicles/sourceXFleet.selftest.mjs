import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { SOURCE_X_IDS, SOURCE_X_DONORS } from './sourceXFleetSpecs.ts';
import { PROCEDURAL_PROFILES } from './profiledProcedurals.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { geometryFingerprint } from './tankAssets.ts';
import { tankTier } from './tier.ts';
import { k2SourceMetadata } from './xk2Specs.ts';
import {withHistoricalT90MLamps,assertCurrentT90MLampSeats} from './historicalT90MLamps.test-support.mjs';

// 2026-09-15 owner rulings: the four T-90 X studies are tier X ("all should be tier 10 and prominent");
// evening: "make the leopard 2a5m, leopard 2a5, leopard 2a6 tier 10" (the 2A5M and 2A5 studies live here).
// Every other X study still may not out-tier its donor without an explicit ruling here.
const OWNER_TIER_RULINGS = Object.freeze({ k2_x: 10, t90a_x: 10, t90a_vladimir_x: 10, t90m_x: 10, t90sm_x: 10, leo2a4m_x: 10, leo2a5_x: 10 });

// Independent geometry-only fingerprints measured from the completed
// pre-X commit 2c22d203d8726cfceefbe427f3930a000524da32 at seed4242.
// Hashes include instanced wheel/track transforms; no supplied model involved.
const original = {
// 2026-09-12 fleet track/wheel standard: Russian X bands .030 (pads .036, webs .018),
// the fleet .024 band on AMX-30 X / AMX-40 X / Chieftain 5 X (course datums re-seated),
// and the scheme-painted pressed dish (plate 0.82 r) move every affected digest;
// values below are repinned from the current build.
// 2026-09-13 sealed-hull pass (tools/tank-sealed-check.mjs, docs/geometry-gate/
// sealed.json): the T-14 roof loft caps now face outward (polyMultiLoft orients
// its fans from geometry), both chin slabs are wound clockwise and the raked
// lower bow frustum's front/rear z are in order — the same corners, outward
// faces; only the t14 digest moves (61ce3db7 → 30f61a47).
// 2026-09-22 nation wheel standard (owner: "standardize our wheels across NATIONS! then we can delete any wheels we
// dont use anymore"): every non-donor hull below draws its nation construction — the Leopards the 2A6 X paired
// dish, the Merkavas the Mk 4B dished face, the T-90s the T-90M X pressed face — so their digests are repinned from the
// current build; k2, kf51 and t14 are donors and did not move.
  leo2a7v:'15763cef', leo2a6m:'df810ba9', leo2a4m:'ddb30ac2', leo2a5:'027706d9',
  merkava4:'3e147cc7', merkava3d:'90ea21fd', k2:'36af3795', kf51:'f5de9458',
  t90a:'5230416c', t90a_vladimir:'aa8a18d8', t90m:'7c1a8780', t90sm:'7b200f8f', t14:'3aa21a37',
};
// Owner 2026-09-21 explicitly replaces XK2's turret with the current K1A1.
// xk2.selftest verifies complete donor geometry and hull/suspension seating;
// this pins the resulting assembly while retaining the old history above.
// Owner 2026-09-22 also selects production K2 road wheels. The wheel-seat
// regression compares their actual geometry in HIGH/LOW/AI; the before/after
// mesh audit preserves all hull armor, turret, gun and end-wheel geometry.
const ownerRebuilds = { k2: '98d535e0' }; // K1A1-turret assembly was 15a3e8d2.
const options = { proceduralOnly:true, geometryReceipt:true, quality:'high', camoSeed:4242 };
for (const [id, hash] of Object.entries(original)) {
  const tank = createTank(id, null, options);
  try {
    if(id==='t90m'){
      assertCurrentT90MLampSeats(tank);
      const historical=withHistoricalT90MLamps(()=>createTank(id,null,options));
      try{assert.equal(geometryFingerprint(historical.root),hash,
        't90m: original geometry after the four authenticated published lamp-pose inverses');}
      finally{historical.dispose();}
    }else assert.equal(geometryFingerprint(tank.root), ownerRebuilds[id] ?? hash, `${id}: preserve the selected assembly`);
  }
  finally { tank.dispose(); }
}
assert.equal(SOURCE_X_IDS.length, 13);
for (const id of SOURCE_X_IDS) {
  const donor = SOURCE_X_DONORS[id], spec = TANK_SPECS[id];
  assert.equal(ALL_TANK_IDS.filter(value => value === id).length, 1, `${id}: exactly one selectable row`);
  // 2026-09-15 owner roster pass: the X suffix is retired — the study carries the canonical public name
  assert.ok(!spec.name.endsWith(' X'), `${id}: no X suffix on a shipped study`);
  assert.equal(tankTier(id), OWNER_TIER_RULINGS[id] ?? tankTier(donor), `${id}: no implicit combat tier increase`);
  assert.equal(MODEL_SOURCE[id].source, 'procedural');
  assert.equal(spec.community, undefined);
  assert.ok(FLEET_GROUP_BY_ID[id].endsWith('X'), `${id}: independently demand-loaded builder`);
  assert.equal(typeof PROCEDURAL_PROFILES[id].build, 'function');
  assert.notEqual(PROCEDURAL_PROFILES[id].build, PROCEDURAL_PROFILES[donor]?.build);
  assert.deepEqual(spec.gun, donor === 'k2' ? k2SourceMetadata().gun : TANK_SPECS[donor].gun,
    `${id}: production donor combat balance remains independent of the XK2 hybrid`);
  assert.equal(spec.hp, TANK_SPECS[donor].hp);
  assert.notEqual(spec.armor, TANK_SPECS[donor].armor);
  const tank = createTank(id, null, options);
  try {
    assert.ok(tank.root.getObjectByName('hull')?.geometry);
    assert.ok(tank.root.getObjectByName('turret')?.geometry);
    assert.notEqual(geometryFingerprint(tank.root), original[donor], `${id}: genuinely new authored geometry`);
  } finally { tank.dispose(); }
}
console.log('sourceXFleet: 13 original geometry histories preserved (four published T-90M lamp moves explicitly isolated); 13 independent procedural X builds, identities and combat metadata pass');
