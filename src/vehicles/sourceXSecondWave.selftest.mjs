import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { SECOND_WAVE_X_IDS, SECOND_WAVE_X_DONORS } from './sourceXSecondWaveSpecs.ts';
import { PROCEDURAL_PROFILES } from './profiledProcedurals.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { geometryFingerprint } from './tankAssets.ts';
import { tankTier } from './tier.ts';

// Independent pre-work geometry receipts from origin/main c26b3194200f52be,
// measured before any second-wave authored builder or registry change.
// Includes all 22 requested originals, not merely the completed draft subset.
const original = {
  ariete_c1:'97251390', challenger1:'ed7cdac2', leclerc:'7a811037',
  chieftain5:'11e3c807', chieftain_mk10:'92e67621', leo2a6:'8d0ea8ec',
  k1a1:'0950361c', strv122:'41f744a6', t62mv1:'63809f27',
  t72b_1987:'4842e5a1', t72b3:'1aa57e0a', t72b3m:'7ea695fb',
  t72bu:'bbcead95', t80u:'14647ad6', type10:'cf3fcd26', type90:'711ec4b5',
  jpz_e100:'6f2fb18f', amx30:'6c814365', amx40:'c9d493c6',
  t90:'10422bf8', t90a_burlak:'160e0fb6', t90ms:'90d4108f',
};
const options = {proceduralOnly:true,geometryReceipt:true,quality:'high',camoSeed:4242};
for (const [id, expected] of Object.entries(original)) {
  const tank = createTank(id, null, options);
  try { assert.equal(geometryFingerprint(tank.root), expected, `${id}: original model must remain untouched`); }
  finally { tank.dispose(); }
}
for (const id of SECOND_WAVE_X_IDS) {
  const donor = SECOND_WAVE_X_DONORS[id], spec = TANK_SPECS[id];
  assert.equal(ALL_TANK_IDS.filter(x=>x===id).length, 1, `${id}: distinct selectable identity`);
  assert.ok(spec.name.endsWith(' X'));
  assert.equal(tankTier(id), tankTier(donor), `${id}: rebuild must not silently increase combat tier`);
  assert.equal(MODEL_SOURCE[id].source, 'procedural');
  assert.equal(spec.community, undefined);
  assert.equal(spec.publicVisualFallback, undefined);
  assert.ok(FLEET_GROUP_BY_ID[id].endsWith('X'));
  assert.equal(typeof PROCEDURAL_PROFILES[id].build, 'function');
  assert.notEqual(PROCEDURAL_PROFILES[id].build, PROCEDURAL_PROFILES[donor]?.build);
  assert.deepEqual(spec.gun, TANK_SPECS[donor].gun);
  assert.equal(spec.hp, TANK_SPECS[donor].hp);
  assert.notEqual(spec.armor, TANK_SPECS[donor].armor);
  for (const quality of ['high','low']) {
    const tank = createTank(id, null, {...options,quality});
    try {
      assert.ok(tank.root.getObjectByName('hull')?.geometry);
      assert.notEqual(geometryFingerprint(tank.root), original[donor], `${id}: original geometry cannot masquerade as new`);
      const gear = tank.root.getObjectByName('rig_hull').userData.runningGearReceipts;
      assert.equal(gear.length, 1, `${id}/${quality}: one native closed track course`);
      tank.root.traverse(object => {
        const position=object.geometry?.attributes.position;
        if(position) for(const coordinate of position.array) assert.ok(Number.isFinite(coordinate), `${id}: finite actual geometry`);
      });
    } finally { tank.dispose(); }
  }
}
assert.equal(TANK_SPECS.t62mv1.armor.hullPlates.some(p=>p.era), false,
  'original owner-renamed T-62 remains non-reactive');
for(const owner of ['hullPlates','turretPlates']) {
  const era = TANK_SPECS.t62mv1_x.armor[owner].filter(p=>p.era);
  const prefix=owner==='hullPlates'?'glacis':'turret';
  const expectedNames=[`${prefix}_era_L`,`${prefix}_era_R`];
  assert.deepEqual([...new Set(era.map(p=>p.name))].sort(),expectedNames,
    'exact two X-only reactive modules per owner, independent of generated skin tessellation');
  // The measured native cover stock generates 54 hull / 36 turret triangles
  // per named side. These are facets of two modules, not 108/72 new zones.
  const facesPerSide=owner==='hullPlates'?54:36;
  for(const name of expectedNames){
    const faces=era.filter(p=>p.name===name);
    assert.equal(faces.length,facesPerSide,`${name}: complete generated native cover faces`);
    for(const p of faces){
      assert.equal(p.kind,'era');assert.equal(p.physicalMm,15);
      assert.deepEqual(p.era,{keReduction:.05,ceFlatMm:280},'explicit X-only first-generation gameplay convention');
    }
  }
}
console.log(`sourceXSecondWave: 22 originals preserved; ${SECOND_WAVE_X_IDS.length} independent draft IDs, native gear and combat metadata pass (not visual qualification)`);
