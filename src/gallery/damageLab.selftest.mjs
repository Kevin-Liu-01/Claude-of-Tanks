import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../vehicles/tankFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createDamageLab } from './damageLab.ts';
import { createInspectionOverlay } from './overlays.ts';

function mockVisual(spec) {
  const root = new THREE.Group(), turret = new THREE.Group(), gun = new THREE.Group();
  turret.name = 'rig_turret'; gun.name = 'rig_gun'; root.add(turret); turret.add(gun);
  const plates = [...spec.armor.hullPlates || [], ...spec.armor.turretPlates || []].filter(p => p.kind === 'era');
  root.userData.eraClusterNames = plates.map(p => p.name);
  const removed = new Set(), modules = new Map(), tracks = new Map();
  return { root, removed, modules, tracks,
    stripEra(name) { if (!root.userData.eraClusterNames.includes(name)) return false; removed.add(name); return true; },
    resetEra() { removed.clear(); return true; }, setWeaponModuleState(key, state) { modules.set(key, state); },
    setTrackState(key, broken) { tracks.set(key, broken); }, setDestroyed() {},
    resetForGaragePresentation() { removed.clear(); }, syncFromState() {}, setGroundSampler() {},
  };
}
for (const id of ['t90m', 'm1a2', 'strv103a', 'kf41_lynx_x']) {
  const spec = getSpec(id), before = JSON.stringify(spec.armor), visual = mockVisual(spec);
  const lab = createDamageLab(spec, visual, 0);
  const engine = lab.targets.find(t => t.module === 'engine');
  assert.ok(engine, `${id}: canonical engine available`);
  assert.ok(lab.apply('damage', engine.key));
  assert.equal(lab.combat.modules.engine.state, 'yellow');
  assert.ok(lab.apply('disable', engine.key));
  assert.equal(lab.combat.modules.engine.hp, 0);
  assert.equal(visual.modules.get('engine'), 'red');
  assert.ok(lab.apply('repair', engine.key));
  assert.equal(lab.combat.modules.engine.hp, lab.combat.modules.engine.maxHp);
  const track = lab.targets.find(t => t.module === 'trackL');
  if (track) { lab.apply('disable', track.key); assert.equal(visual.tracks.get('trackL'), true); }
  const crew = lab.targets.find(t => t.kind === 'crew');
  lab.apply('disable', crew.key); assert.equal(lab.combat.crew[crew.name], false);
  lab.apply('repair', crew.key); assert.equal(lab.combat.crew[crew.name], true);
  const eras = lab.targets.filter(t => t.kind === 'era');
  for (const target of eras.slice(0, 2)) {
    assert.ok(lab.apply('detonate', target.key));
    assert.equal(lab.apply('detonate', target.key), false, 'one-shot ERA cannot explode twice');
    assert.ok(visual.removed.has(target.name));
    assert.ok(![...lab.armor().hullPlates || [], ...lab.armor().turretPlates || []].some(p => p.name === target.name));
    const overlay = createInspectionOverlay({ ...spec, armor: lab.armor() }, visual, 'armor');
    assert.ok(!overlay.pickables.some(p => p.userData.inspection.plateName === target.name), 'removed surface has no selectable ghost');
    overlay.clear();
  }
  if (eras.length > 1) { lab.apply('repair', eras[0].key); assert.ok(visual.removed.has(eras[1].name), 'repairing one tile does not repair another'); }
  lab.destroy(); assert.equal(lab.combat.destroyed, true); assert.equal(lab.apply('disable', engine.key), false);
  lab.reset();
  assert.equal(lab.combat.destroyed, false); assert.equal(lab.combat.eraSpent.size, 0);
  assert.ok(lab.snapshot().parts.every(part => part.state === 'ok'));
  assert.equal(JSON.stringify(spec.armor), before, `${id}: gallery damage never mutates the fleet`);
  const second = createDamageLab(spec, mockVisual(spec), 0);
  assert.ok(second.snapshot().parts.every(part => part.state === 'ok'), 'new specimens start intact');
  lab.dispose(); second.dispose();
}
console.log('damageLab: ERA lifetime, isolated state, module/crew damage, tracks, wreck and reset PASS');

// Exercise the real model binding as well as the state owner: collapsed stock
// must actually change, restore byte-for-byte, and remain separate from another specimen.
const realSpec = getSpec('t90m');
const real = createTank('t90m', null, {quality:'high',proceduralOnly:true,materialMode:'geometry-only'});
const realLab = createDamageLab(realSpec, real, 0);
const era = realLab.targets.find(t => t.kind === 'era');
assert.ok(era, 'real T-90M publishes removable ERA');
function geometrySignature(root) {
  let sum = 0;
  root.traverse(object => {
    const position = object.geometry?.getAttribute('position');
    if (position) for (let i=0; i<position.count; i++) sum += position.getY(i);
    if (object.isInstancedMesh) for (const value of object.instanceMatrix.array) sum += value;
  });
  return sum;
}
const intactGeometry = geometrySignature(real.root);
realLab.apply('detonate', era.key);
assert.notEqual(geometrySignature(real.root), intactGeometry, 'ERA changes live geometry, not just a label');
realLab.apply('repair', era.key);
assert.equal(geometrySignature(real.root), intactGeometry, 'repair restores native geometry exactly');
realLab.apply('disable','module:trackL'); realLab.syncPose(); realLab.update(1/60);
assert.ok(real.root.position.toArray().every(Number.isFinite));
realLab.reset(); realLab.dispose(); real.dispose();
console.log('damageLab: real T-90M ERA geometry removal/restore and running-gear update PASS');

const probePlate = {name:'probe_era',kind:'era',physicalMm:10,keMm:10,ceMm:10,
  verts:[[-1,0,2],[1,0,2],[1,2,2],[-1,2,2]]};
const screen = {...probePlate,name:'probe_screen',kind:'spaced'};
const probeSpec = {...getSpec('m1a2'),armor:{...getSpec('m1a2').armor,hullPlates:[probePlate],
  turretPlates:[],collisionShells:undefined,droneScreens:{hull:[screen]}}};
const probeVisual = mockVisual(probeSpec);probeVisual.root.userData.eraClusterNames.push(screen.name);
const probeLab = createDamageLab(probeSpec,probeVisual,0);
const from = new THREE.Vector3(0,1,10), to = new THREE.Vector3(0,1,-10);
const hasTile = () => probeLab.trace(from,to).some(hit=>hit.kind==='plate'&&hit.plate.name===probePlate.name);
assert.ok(hasTile(),'ray probe sees intact armor');
probeLab.apply('detonate','plate:probe_era');assert.equal(hasTile(),false,'ray probe cannot hit removed ERA');
probeLab.apply('repair','plate:probe_era');assert.ok(hasTile(),'ray probe sees repaired armor');
assert.ok(probeLab.targets.some(target=>target.name===screen.name),'bound anti-drone screens are available');
probeLab.apply('remove','plate:probe_screen');assert.equal(probeLab.armor().droneScreens.hull.length,0);
probeLab.reset();assert.equal(probeLab.armor().droneScreens.hull.length,1);
probeLab.dispose();
console.log('damageLab: live ray contacts, repaired contacts and bound anti-drone screens PASS');
