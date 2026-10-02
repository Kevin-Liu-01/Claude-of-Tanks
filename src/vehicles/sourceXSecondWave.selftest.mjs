import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { SECOND_WAVE_X_IDS, SECOND_WAVE_X_DONORS } from './sourceXSecondWaveSpecs.ts';
import { PROCEDURAL_PROFILES } from './profiledProcedurals.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { geometryFingerprint } from './tankAssets.ts';
import { tankTier } from './tier.ts';
import { donorSpec } from './donorSpecs.ts';

// 2026-10-01 (owner: retire frozen pins): the nineteen pinned pre-work donor fingerprints are gone; the
// fleet geometry ledger owns whole-tank change detection. Each draft is compared with its donor built
// live at the same quality in this run, so original geometry still cannot masquerade as new.
// 2026-09-23 (owner: "no hidden tanks"): these donor records retired; no buildable original remains.
const RETIRED_DONORS = new Set(['t72b_1987', 't72b3', 'jpz_e100']);
const options = {proceduralOnly:true,geometryReceipt:true,quality:'high',camoSeed:4242};
const donorFingerprints = new Map();
function donorFingerprint(donor, quality) {
  const key = `${donor}/${quality}`;
  if (!donorFingerprints.has(key)) {
    assert.ok(ALL_TANK_IDS.includes(donor), `${donor}: registered donor`);
    const tank = createTank(donor, null, {...options,quality});
    try { donorFingerprints.set(key, geometryFingerprint(tank.root)); } finally { tank.dispose(); }
  }
  return donorFingerprints.get(key);
}
// Main's tactical roles intentionally give replicas and retired donor templates
// different handling. Preserve the complete weapon payload and firing bloom;
// the tactical-role regression owns aiming and movement/traverse dispersion.
function armament({aimTimeS, baseAccuracy, bloom, ...weapon}) {
  const {move, hullRot, turret, ...firingBloom} = bloom;
  return {...weapon, bloom: firingBloom};
}
for (const id of SECOND_WAVE_X_IDS) {
  const donor = SECOND_WAVE_X_DONORS[id], spec = TANK_SPECS[id], donorRow = donorSpec(TANK_SPECS, donor);
  assert.equal(ALL_TANK_IDS.filter(x=>x===id).length, 1, `${id}: distinct selectable identity`);
  assert.ok(!spec.name.endsWith(' X'), `${id}: the X suffix was retired (owner 2026-09-15)`);
  // 2026-09-15 owner rulings (evening): the Leopard 2A6 study is tier X, the Jagdpanzer E100 study tier VII.
  // 2026-09-16: the Leclerc XLR and AMX 56 studies are tier X ("the newer models are the tier 10s")
  // 2026-09-23 (owner: "no hidden tanks"): the t72b_1987 and t72b3 donor records retired, so tier.ts no longer carries
  // the rows this check read for their studies; the donors' last published tier (VIII at a10d0a30b) is pinned here.
  const ruled = { k1a1_x: 10, leo2a6_x: 10, jpz_e100_x: 7, leclerc_x: 10, leclerc_classic_x: 10, ariete_c1_x: 10,
    t72b_1987_x: 8, t72b3_x: 8 }[id];
  assert.equal(tankTier(id), ruled ?? tankTier(donor), `${id}: rebuild must not silently increase combat tier`);
  assert.equal(MODEL_SOURCE[id].source, 'procedural');
  assert.equal(spec.community, undefined);
  assert.equal(spec.publicVisualFallback, undefined);
  assert.ok(FLEET_GROUP_BY_ID[id].endsWith('X'));
  assert.equal(typeof PROCEDURAL_PROFILES[id].build, 'function');
  assert.notEqual(PROCEDURAL_PROFILES[id].build, PROCEDURAL_PROFILES[donor]?.build);
  assert.deepEqual(armament(spec.gun), armament(donorRow.gun), `${id}: donor weapon payload retained`);
  assert.equal(spec.hp, donorRow.hp);
  assert.notEqual(spec.armor, donorRow.armor);
  for (const quality of ['high','low']) {
    const tank = createTank(id, null, {...options,quality});
    try {
      assert.ok(tank.root.getObjectByName('hull')?.geometry);
      if (!RETIRED_DONORS.has(donor)) assert.notEqual(geometryFingerprint(tank.root), donorFingerprint(donor, quality),
        `${id}/${quality}: original geometry cannot masquerade as new`);
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
console.log(`sourceXSecondWave: ${donorFingerprints.size} live donor builds; ${SECOND_WAVE_X_IDS.length} independent draft IDs differ from their donors; native gear and combat metadata pass (not visual qualification)`);
