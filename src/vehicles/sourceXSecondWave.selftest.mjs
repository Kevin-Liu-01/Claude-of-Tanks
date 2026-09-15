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
  ariete_c1:'8c06b45a', challenger1:'3d5d8586', leclerc:'13b758e3',
  chieftain5:'0e4c53e4', chieftain_mk10:'68478b83', leo2a6:'d8373bad',
  k1a1:'485a880a', strv122:'c17ae6bd', t62mv1:'374dffcc',
  t72b_1987:'8580b42f', t72b3:'e4193ead', t72b3m:'f7517bfa',
  t72bu:'9569ccf4', t80u:'13e36eca', type10:'5d2faa11', type90:'303aec4e',
  jpz_e100:'68750c36', amx30:'e946cb12', amx40:'0236741e',
  t90:'cb4ab582', t90a_burlak:'cf5005a1', t90ms:'70e931ad',
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
