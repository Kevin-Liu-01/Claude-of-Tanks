import * as THREE from 'three';
import {syncJuggernautVisual,pulseJuggernautImpact} from './juggernautVisual.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  clearBattleAfterExit,
  resetBattleTankForGarage,
} from './garageTankLifecycle.ts';

const order = [];
resetBattleTankForGarage({
  fx: { resetAll() { order.push('fx'); } },
  visual: { resetForGaragePresentation() { order.push('visual'); } },
});
assert.deepEqual(order, ['fx', 'visual'],
  'tank-parented FX detach before the visual becomes a garage hero');

let fallbackResets = 0;
resetBattleTankForGarage({
  fx: { resetAll() {} },
  visual: { resetDestroyed() { fallbackResets++; } },
});
assert.equal(fallbackResets, 1, 'legacy visuals still restore their intact state');

let emptyFxResets = 0;
resetBattleTankForGarage({
  fx: { resetAll() { emptyFxResets++; } },
  visual: null,
});
assert.equal(emptyFxResets, 1, 'battle FX clear even when no visual was fielded');

assert.throws(
  () => resetBattleTankForGarage({ fx: null, visual: null }),
  /FX reset owner/,
  'the phase boundary cannot silently omit the external FX owner',
);

// Reproduce the real ownership transfer: the player visual becomes the garage
// hero, every actor loses its battle state, and clean bot graphs move into the
// detached cache rather than retaining entity ownership.
const playerVisual = {
  disposed: false,
  dispose() { this.disposed = true; },
};
const botVisual = {
  visible: true,
  disposed: false,
  setVisible(value) { this.visible = value; },
  dispose() { this.disposed = true; },
};
const makeEntity = (visual, isPlayer) => ({
  visual,
  state: { yaw: 0.73 },
  combat: { destroyed: true, brokenTrack: true },
  specialAction: { active: true },
  equip: ['repair'],
  ai: {},
  aiCtl: {},
  team: isPlayer ? 'player' : 'enemy',
  isPlayer,
  _destroyedAnnounced: true,
  _glbContactStampedVisual: visual,
  _openingRoute: [[1, 2]],
  _lastImpactT: 12,
  _reloadEvent: { specId: 'old-battle' },
  _soloRenderPose: { yaw: 0.73 },
  _spotFade: 1,
  _fxAcc: 0.75,
  _dustTravelAcc: 4,
  rigidGear: true,
  contactGeom: { halfLenM: 4 },
  input: {
    throttle: 1,
    steer: -1,
    brake: true,
    fire: true,
    shellSlot: 2,
    aimPoint: { set(x, y, z) { this.xyz = [x, y, z]; } },
  },
});
const playerEntity = makeEntity(playerVisual, true);
const botEntity = makeEntity(botVisual, false);
const pooled = [];
const game = {
  allTanks: [playerEntity, botEntity],
  tanks: [playerEntity, botEntity],
  shells: [{ id: 7 }],
  player: playerEntity,
  spotting: {},
  result: 'victory',
  resultReason: 'elimination',
  preBattleS: 4,
  timeS: 92,
  fireTickAcc: 0.3,
  nextShellId: 8,
  openingRouteJobs: [() => {}],
};
clearBattleAfterExit({
  game,
  preservedVisual: playerVisual,
  visualPool: { release(visual) { pooled.push(visual); return true; } },
});
assert.equal(playerVisual.disposed, false,
  'the transferred garage hero survives battle teardown');
assert.equal(playerEntity.visual, null,
  'the garage hero is no longer reachable through its old battle entity');
assert.deepEqual(pooled, [botVisual], 'clean bot visuals transfer to the detached pool');
assert.equal(botVisual.disposed, false, 'pool ownership avoids an unnecessary rebuild');
assert.deepEqual(game.tanks, [], 'the active battle roster is empty');
assert.deepEqual(game.shells, [], 'live shells are empty');
assert.equal(game.player, null, 'the battle player reference is empty');
assert.equal(game.spotting, null, 'spotting state is empty');
assert.equal(game.result, null, 'the completed battle result is empty');
for (const entity of game.allTanks) {
  assert.equal(entity.state, null, 'simulation pose is empty');
  assert.equal(entity.combat, null, 'damage and broken-track state are empty');
  assert.equal(entity.specialAction, null, 'special-action state is empty');
  assert.equal(entity.aiCtl, null, 'AI state is empty');
  assert.equal(entity._spotFade, undefined, 'spotting presentation state is empty');
  assert.equal(entity._soloRenderPose, null, 'interpolated battlefield pose is empty');
  assert.equal(entity._fxAcc, 0, 'per-actor FX cadence is reset');
  assert.equal(entity._dustTravelAcc, 0, 'dust travel state is reset');
  assert.equal(entity.contactGeom, null, 'visual-dependent contact geometry is empty');
  assert.deepEqual(entity.input.aimPoint.xyz, [0, 0, 0], 'aim state is reset');
}

const main = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const garageReturn = await readFile(new URL('./garageReturnRuntime.ts', import.meta.url), 'utf8');
const adoptAt = garageReturn.indexOf('const adoptedVisual = roster.adoptBattlePlayer');
const clearAt = garageReturn.indexOf('roster.clearBattle(adoptedVisual)', adoptAt);
assert.ok(adoptAt >= 0 && clearAt > adoptAt,
  'garage entry transfers its hero before clearing the completed battle');
const adapterAt = main.indexOf('clearBattle: (preservedVisual: BattleVisual | null) => clearBattleAfterExit<BattleVisual>({');
const preserveAt = main.indexOf('preservedVisual,', adapterAt);
const poolAt = main.indexOf('visualPool: battleVisualPool', preserveAt);
assert.ok(adapterAt >= 0 && preserveAt > adapterAt && poolAt > preserveAt,
  'battle teardown preserves only the adopted hero and hands bot visuals to the bounded pool');

console.log('garageTankLifecycle.selftest: FX and tank state end at the garage boundary');

// A victorious boss is adopted in-place: it need not emit Object3D.removed.
{
 const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);
 const source=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),source);root.add(mesh);
 const dims={widthM:3,hullLengthM:7,heightM:3};
 syncJuggernautVisual(root,dims,1.12,100,100,.016);pulseJuggernautImpact(root,[0,1,0]);
 const visual={root,resetForGaragePresentation(){
  assert.equal(mesh.material,source,'aura cleared before the showroom resets or adopts the hero');
  assert.equal(root.scale.x,1,'battle enlargement removed before showroom posing');
 }};
 resetBattleTankForGarage({fx:{resetAll(){}},visual});
 assert.equal(root.parent,scene,'no removal/reparent was required to clean the retained hero');
 assert.equal(pulseJuggernautImpact(root,[0,1,0]),false);
 syncJuggernautVisual(root,dims,1.12,100,100,.016);
 const game={allTanks:[{visual,team:'ally',isPlayer:true}],tanks:[],shells:[]};
 clearBattleAfterExit({game,preservedVisual:visual});
 assert.equal(mesh.material,source,'preserved and pooled actors are also cleared by roster teardown');assert.equal(root.scale.x,1);
 mesh.geometry.dispose();source.dispose();
}

// A wreck can save a live shield material, then restore it after death has
// disposed the effect. Repair also reattaches distance-hidden fittings.
{
 const root=new THREE.Group(),source=new THREE.MeshStandardMaterial();
 const geometry=new THREE.BoxGeometry(),mesh=new THREE.Mesh(geometry,source);
 root.add(mesh);
 const dims={widthM:3,hullLengthM:7,heightM:2.6};
 syncJuggernautVisual(root,dims,1.12,100,100,.016);
 const captured=mesh.material;
 const fitting=new THREE.Mesh(geometry,[captured,source]);
 syncJuggernautVisual(root,dims,1.12,0,100,.016);
 resetBattleTankForGarage({fx:{resetAll(){}},visual:{root,resetForGaragePresentation(){
   mesh.material=captured;root.add(fitting);
 }}});
 assert.equal(mesh.material,source,'repair cannot resurrect a disposed boss highlight');
 assert.deepEqual(fitting.material,[source,source],'reattached multi-material fittings are clean');
 assert.equal(root.scale.x,1);
 geometry.dispose();source.dispose();
}
