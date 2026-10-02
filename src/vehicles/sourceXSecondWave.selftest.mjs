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
// 2026-10-01: two weapon relations moved with the owner's September rebuilds (fleetRenewalSpecs.ts, cdbfe54dc,
// national-modernization-20261001.md). t62mv1_x carries the complete T-72B 1987 upper assembly "and matching 125 mm
// weapon" (transplanted from t72b_1987_x). The t72b3m slot became the obr. 2022 on the T-90SM upper assembly, while
// t72b3m_x, now the obr. 2016, keeps the payload it synchronized from that slot before the transplant: the t72b3
// donor template's gun at the slot's authored 6.5 s reload (additionalFleetSpecs.ts make('t72b3', 't72b3m', ...)).
assert.deepEqual(armament(TANK_SPECS.t72b3m.gun), armament(TANK_SPECS.t90sm_x.gun),
  't72b3m: the obr. 2022 carries the T-90SM upper assembly gun');
const weaponReference = (id, donorRow) => id === 't62mv1_x' ? TANK_SPECS.t72b_1987_x.gun
  : id === 't72b3m_x' ? { ...donorSpec(TANK_SPECS, 't72b3').gun, reloadS: 6.5 } : donorRow.gun;
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
  assert.deepEqual(armament(spec.gun), armament(weaponReference(id, donorRow)), `${id}: donor weapon payload retained`);
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
// 2026-10-01: the rebuilt T-62MV-1 (owner, 4c34b3e8b + cdbfe54dc) keeps its first-generation Kontakt glacis pair,
// adds the two removable side fields of the rebuild and carries the transplanted T-72B 1987 turret's own reactive
// modules. Zones are counted independently of the generated skin tessellation.
{
  const era = owner => TANK_SPECS.t62mv1_x.armor[owner].filter(p=>p.era);
  const names = rows => [...new Set(rows.map(p=>p.name))].sort();
  const hull = era('hullPlates');
  assert.deepEqual(names(hull),['glacis_era_L','glacis_era_R','skirt_era_L','skirt_era_R'],
    't62mv1_x: Kontakt glacis pair plus the two rebuilt side fields, no other hull ERA');
  for(const name of names(hull)) assert.ok(hull.some(p=>p.name===name),`${name}: generated native cover faces`);
  for(const p of hull){
    assert.equal(p.kind,'era');assert.equal(p.physicalMm,15);
    assert.deepEqual(p.era,{keReduction:.05,ceFlatMm:280},'explicit X-only first-generation gameplay convention');
  }
  const signature = rows => rows.map(p=>[p.name,p.kind,p.physicalMm,p.keMm,p.ceMm,p.era]);
  assert.deepEqual(signature(era('turretPlates')),signature(TANK_SPECS.t72b_1987_x.armor.turretPlates.filter(p=>p.era)),
    't62mv1_x: the transplanted T-72B 1987 upper assembly brings exactly its own reactive modules');
}
console.log(`sourceXSecondWave: ${donorFingerprints.size} live donor builds; ${SECOND_WAVE_X_IDS.length} independent draft IDs differ from their donors; native gear and combat metadata pass (not visual qualification)`);
