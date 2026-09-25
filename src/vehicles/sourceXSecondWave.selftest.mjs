import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { SECOND_WAVE_X_IDS, SECOND_WAVE_X_DONORS } from './sourceXSecondWaveSpecs.ts';
import { PROCEDURAL_PROFILES } from './profiledProcedurals.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { geometryFingerprint } from './tankAssets.ts';
import { tankTier } from './tier.ts';
import { donorSpec } from './donorSpecs.ts';

// Independent pre-work geometry receipts from origin/main c26b3194200f52be,
// measured before any second-wave authored builder or registry change.
// Includes all 22 requested originals, not merely the completed draft subset.
// 2026-09-12 fleet visual standard: the shared pressed-disc road wheel (rib
// motif, pressed-six/pressed-eight) keeps its former rib envelope with the
// holes, hub well and drum inside it (tankFactoryCore 'rib'), so every rib-
// wheel scene digest below moved together; repinned from the current build.
const original = {
// 2026-09-12 fleet track/wheel standard: Russian X bands .030 (pads .036, webs .018),
// the fleet .024 band on AMX-30 X / AMX-40 X / Chieftain 5 X (course datums re-seated),
// and the scheme-painted pressed dish (plate 0.82 r) move every affected digest;
// values below are repinned from the current build.
// 2026-09-13 watertight bodies (owner's pour-water test): buildLeclerc gained buried
// solids (sponson band to the tub, bow/glacis underfill, turret cores) inside its
// existing surfaces; the leclerc digest is repinned from the current build.
// 2026-09-13 wheel review: challenger1's fixed wheel dressing (face disc / hub) re-seated from
// 7 cm outboard of the tire to the tire plane; repinned from the current build.
// 2026-09-22 nation wheel standard (owner: "standardize our wheels across NATIONS! then we can delete any wheels we
// dont use anymore"): every second-wave hull below except the period jpz_e100 draws its nation construction
// (nationWheelSets.ts / nationWheelConstructions.ts) at its own radius, so the digests are repinned from the current build.
// 2026-09-23 (owner: "no hidden tanks"): the t72b_1987 (e7d8bce1), t72b3 (a6d86dc3) and jpz_e100 (9c2fc966) donor
// records retired with the hidden fleet, so their original pins left with them; the three studies' combat donors now
// resolve through the unregistered donorSpecs.ts templates.
  ariete_c1:'e9af928b', challenger1:'aa084d4d', leclerc:'0d0ed003',
  chieftain5:'af6150d8', chieftain_mk10:'81cf7e9f', leo2a6:'1f08700c',
  k1a1:'febc57cf', strv122:'8bc6e141', t62mv1:'35f1a225',
  // 2026-09-25 FSP-03: the fleet T-72/T-90 pre-X goldens (t72b3m, t72bu, t90, Burlak, T-90MS) re-pinned once — three fitted return rollers per side again.
  t72b3m:'dbbc46ad',
  t72bu:'404a5f01', t80u:'2b1a556f', type10:'51be775e', type90:'de3a7d14',
  amx30:'af643005', amx40:'b94b2314',
  t90:'accad0d5', t90a_burlak:'8a91a11d', t90ms:'f03c2eb8',
};
const options = {proceduralOnly:true,geometryReceipt:true,quality:'high',camoSeed:4242};
for (const [id, expected] of Object.entries(original)) {
  const tank = createTank(id, null, options);
  try { assert.equal(geometryFingerprint(tank.root), expected, `${id}: original model must remain untouched`); }
  finally { tank.dispose(); }
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
  assert.deepEqual(spec.gun, donorRow.gun);
  assert.equal(spec.hp, donorRow.hp);
  assert.notEqual(spec.armor, donorRow.armor);
  for (const quality of ['high','low']) {
    const tank = createTank(id, null, {...options,quality});
    try {
      assert.ok(tank.root.getObjectByName('hull')?.geometry);
      // A retired donor (t72b_1987, t72b3, jpz_e100) has no buildable original left to differ from.
      if (original[donor]) assert.notEqual(geometryFingerprint(tank.root), original[donor], `${id}: original geometry cannot masquerade as new`);
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
console.log(`sourceXSecondWave: ${Object.keys(original).length} originals preserved; ${SECOND_WAVE_X_IDS.length} independent draft IDs, native gear and combat metadata pass (not visual qualification)`);
