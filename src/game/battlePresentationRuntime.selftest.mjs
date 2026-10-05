import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera, Scene, Vector3, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';

import { createBattlePresentationRuntime } from './battlePresentationRuntime.ts';
import {
  advanceTankPresentationPose,
  createTankPresentationPose,
  resetTankPresentationPose,
  sampleTankPresentationPose,
} from './presentationPose.ts';

function createEntity({
  id = 'tank',
  team = 'ally',
  isPlayer = false,
  position = new Vector3(0, 0, -20),
  speed = 0,
} = {}) {
  const root = new Object3D();
  const syncs = [];
  const visibility = [];
  const visual = {
    root,
    setVisible(value) { root.visible = value; visibility.push(value); },
    syncFromState(...args) { syncs.push(args); },
  };
  return {
    entity: {
      id,
      team,
      isPlayer,
      state: { pos: position, yaw: 0, speed },
      combat: { destroyed: false },
      visual,
      spec: {
        era: 'modern',
        topSpeedKmh: 60,
        dims: { heightM: 2.5, widthM: 3.5, hullLengthM: 7 },
      },
      input: { throttle: 0 },
    },
    root,
    visual,
    syncs,
    visibility,
  };
}

function createHarness({
  tanks = [],
  network = false,
  spotted = true,
  world = null,
  phase = 'battle',
  fxEnabled = true,
  cinematic = false,
  pedestalVisual = null,
  player = undefined,
} = {}) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 16 / 9, 0.5, 4000);
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 1, -20);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  for (const tank of tanks) scene.add(tank.visual.root);
  const effects = { dust: [], exhaust: [], crushed: [] };
  const fx = {
    dust(position, forward, intensity) {
      effects.dust.push({ position: position.clone(), forward: forward.clone(), intensity });
    },
    exhaust(position, load, diesel) {
      effects.exhaust.push({ position: position.clone(), load, diesel });
    },
    propCrush(position, direction, height) {
      effects.crushed.push({ position: position.clone(), direction: direction.clone(), height });
    },
    loosePropHit(position, direction, height) {
      effects.crushed.push({ position: position.clone(), direction: direction.clone(), height, loose: true });
    },
  };
  const game = {
    phase,
    tanks,
    player: player !== undefined ? player : tanks.find((tank) => tank.isPlayer) || tanks[0] || null,
    spotting: { isSpotted: () => spotted },
  };
  const runtime = createBattlePresentationRuntime({
    game,
    camera,
    scene,
    battleClient: {
      advanceTankPresentationPose,
      createTankPresentationPose,
      resetTankPresentationPose,
      sampleTankPresentationPose,
      isPostwarVehicleEra: (era) => era !== 'ww2',
    },
    getFx: () => fxEnabled ? fx : null,
    getWorld: () => world,
    isNetworkMatchActive: () => network,
    getPedestalVisual: () => pedestalVisual,
    isCinematicActive: () => cinematic,
  });
  return { runtime, game, scene, camera, effects };
}

{
  const { entity, syncs } = createEntity({ isPlayer: true, position: new Vector3(0, 0, -20) });
  const { runtime } = createHarness({ tanks: [entity] });
  runtime.resetSoloPoses();
  entity.state.pos.set(2, 0, -20);
  runtime.captureSoloPoses();
  runtime.update(1 / 120, 0.5);
  assert.equal(syncs.length, 1);
  assert.equal(syncs[0][3].pos.x, 1, 'solo presentation samples between fixed steps');
  const stablePose = syncs[0][3];
  runtime.update(1 / 120, 0.75);
  assert.equal(syncs[1][3], stablePose, 'solo interpolation reuses its presented pose');
}

{
  const { entity, syncs } = createEntity({ isPlayer: true });
  const { runtime } = createHarness({ tanks: [entity], network: true });
  runtime.update(1 / 60, 0.25);
  assert.equal(syncs[0][3], entity.state,
    'network bridge poses bypass the solo interpolation buffer');
}

{
  const hidden = createEntity({ id: 'hidden', team: 'enemy' });
  // Opponents are whoever is not on the player's team: the player (off scene) is on 'player'.
  const me = createEntity({ id: 'me', team: 'player', isPlayer: true }).entity;
  const harness = createHarness({ tanks: [hidden.entity], spotted: false, player: me });
  harness.runtime.update(1 / 60);
  assert.equal(hidden.root.parent, null, 'fully hidden opponents leave scene traversal');
  assert.equal(hidden.root.userData.battleVisibilityDetached, true);
  assert.equal(hidden.syncs.length, 0, 'hidden opponents skip visual and track work');
  assert.equal(harness.effects.exhaust.length, 0, 'hidden opponents leak no FX');

  harness.game.spotting.isSpotted = () => true;
  harness.runtime.update(1);
  assert.equal(hidden.root.parent, harness.scene,
    'a legal spotting edge restores owner-detached residency before sync');
  assert.equal(hidden.syncs.length, 1);
  harness.runtime.update();
  assert.equal(hidden.entity._spotFade, 1,
    'an undelimited presentation update resolves the spotting fade immediately');
}

{
  const foreign = createEntity({ id: 'foreign', team: 'enemy' });
  const me = createEntity({ id: 'me', team: 'player', isPlayer: true }).entity;
  const harness = createHarness({ tanks: [foreign.entity], spotted: true, player: me });
  foreign.root.removeFromParent();
  harness.runtime.update(1 / 60);
  assert.equal(foreign.root.parent, null,
    'spotting cannot resurrect a visual detached by another lifecycle owner');
}

{
  const near = createEntity({ id: 'near', position: new Vector3(0, 0, -20) });
  const offscreen = createEntity({ id: 'offscreen', position: new Vector3(500, 0, -20) });
  const harness = createHarness({ tanks: [near.entity, offscreen.entity], network: true });
  harness.runtime.update(1 / 60);
  assert.equal(near.syncs[0][4], true, 'on-screen running gear retains full detail cadence');
  assert.equal(offscreen.syncs[0][4], false,
    'off-screen running gear receives the reduced-detail signal');
  harness.runtime.update(1 / 60);
  assert.equal(near.syncs.length, 2, 'visible actors remain presentation-synced every frame');
  assert.equal(offscreen.syncs.length, 1,
    'off-screen actors skip hierarchy work between their bounded cadence');
  harness.runtime.update(1 / 60);
  assert.equal(offscreen.syncs.length, 2, 'off-screen actors catch up at 30 Hz');
  assert.ok(Math.abs(offscreen.syncs[1][1] - 1 / 30) < 1e-9,
    'off-screen presentation receives the accumulated elapsed time');
  offscreen.entity.state.pos.set(0, 0, -20);
  harness.runtime.update(1 / 120);
  assert.equal(offscreen.syncs.length, 3,
    'viewport re-entry synchronizes the exact pose on its first visible frame');
}

{
  const sixty = createEntity({ isPlayer: true, speed: 10 });
  const sixtyHarness = createHarness({ tanks: [sixty.entity] });
  sixtyHarness.runtime.update(1 / 60);
  const oneTwenty = createEntity({ isPlayer: true, speed: 10 });
  const oneTwentyHarness = createHarness({ tanks: [oneTwenty.entity] });
  oneTwentyHarness.runtime.update(1 / 120);
  oneTwentyHarness.runtime.update(1 / 120);
  assert.equal(sixtyHarness.effects.exhaust.length, 1);
  assert.equal(oneTwentyHarness.effects.exhaust.length, 1,
    'vehicle FX density is display-refresh independent');
  assert.equal(sixtyHarness.effects.dust.length, oneTwentyHarness.effects.dust.length);
}

{
  const moving = createEntity({ isPlayer: true, speed: 10 });
  const harness = createHarness({ tanks: [moving.entity] });
  for (let frame = 0; frame < 4; frame += 1) harness.runtime.update(1 / 60);
  assert.equal(harness.effects.dust.length, 2,
    'travel-based dust emits once per side after crossing its spacing threshold');

  const cinematic = createEntity({ isPlayer: true, speed: 0 });
  const cinematicHarness = createHarness({ tanks: [cinematic.entity], cinematic: true });
  cinematicHarness.runtime.update();
  assert.equal(cinematicHarness.effects.exhaust[0].load, 0.3,
    'cinematic idle preserves a readable exhaust load without frame delta input');
}

{
  const flyer = createEntity({ isPlayer: true, speed: 12 });
  flyer.entity.state.grounded = false;
  const harness = createHarness({ tanks: [flyer.entity], network: true });
  for (let frame = 0; frame < 120; frame++) harness.runtime.update(1 / 60);
  assert.equal(harness.effects.dust.length, 0, 'airborne tracks emit neither spray nor ground dust');
  assert.ok(harness.effects.exhaust.length > 0, 'airborne engines still emit exhaust');
  flyer.entity.state.grounded = true;
  for (let frame = 0; frame < 6; frame++) harness.runtime.update(1 / 60);
  assert.ok(harness.effects.dust.length > 0, 'track contact FX resume after landing');
}

{
  const reverse = createEntity({ isPlayer: true, speed: -4 });
  const world = {
    crushables: [{ x: 0, y: 0, z: -20, h: 2, dynamic: false }],
    crushCalls: [],
    crushProp(index, x, z, speed) {
      this.crushCalls.push({ index, x, z, speed });
      return true;
    },
  };
  const harness = createHarness({ tanks: [reverse.entity], world });
  harness.runtime.update(1 / 60);
  assert.ok(world.crushCalls[0].z < 0,
    'reverse impacts use travel direction rather than hull facing');
  assert.ok(harness.effects.crushed[0].direction.z < 0);
}

{
  const mover = createEntity({ isPlayer: true, speed: 4 });
  const world = {
    crushables: [
      { x: 0, y: 0, z: -20, h: 1, toppled: true },
      { x: 100, y: 0, z: -20, h: 1 },
      { x: 1, y: 0, z: -20, h: 1 },
      { x: -1, y: 0, z: -20, h: 2, dynamic: true },
    ],
    crushCalls: [],
    crushProp(index, x, z, speed) {
      this.crushCalls.push({ index, x, z, speed });
      return index === 3;
    },
  };
  const harness = createHarness({ tanks: [mover.entity], world });
  harness.runtime.update(1 / 60);
  assert.deepEqual(world.crushCalls.map(({ index }) => index), [2, 3],
    'toppled and out-of-reach props leave the crush provider untouched');
  assert.equal(harness.effects.crushed[0].loose, true,
    'dynamic props use the loose-prop impact path after a confirmed crush');
}

{
  const parked = createEntity({ isPlayer: true });
  const harness = createHarness({
    tanks: [parked.entity],
    phase: 'garage',
    pedestalVisual: parked.visual,
    fxEnabled: false,
  });
  harness.runtime.update(1 / 60);
  assert.equal(parked.syncs.length, 0,
    'the retained Garage hero remains owned by the pedestal presenter');
  harness.runtime.captureSoloPoses();
  assert.ok(parked.entity._soloRenderPose,
    'capture initializes a missing solo pose outside active battle');
}

{
  const missingState = createEntity({ id: 'missing-state' });
  const missingCombat = createEntity({ id: 'missing-combat' });
  const missingVisual = createEntity({ id: 'missing-visual' });
  const harness = createHarness({
    tanks: [missingState.entity, missingCombat.entity, missingVisual.entity],
    world: {},
  });
  missingState.entity.state = null;
  missingCombat.entity.combat = null;
  missingVisual.entity.visual = null;
  harness.runtime.resetSoloPoses();
  harness.runtime.captureSoloPoses();
  harness.runtime.update(1 / 60);
  harness.runtime.primeDeploymentTerrainTiles();
  assert.equal(missingCombat.syncs.length, 0);
  assert.equal(missingVisual.syncs.length, 0,
    'incomplete lifecycle records are ignored by pose, frame, and terrain passes');
}

{
  const first = createEntity({ position: new Vector3(4, 0, 7) });
  const second = createEntity({ position: new Vector3(-3, 0, 9) });
  let warmedPoints = null;
  const world = {
    heightField: {
      *warmFastTilesAround(points) { warmedPoints = points; yield 1; yield 2; },
    },
    crushProp: () => false,
  };
  const harness = createHarness({ tanks: [first.entity, second.entity], world });
  harness.runtime.primeDeploymentTerrainTiles();
  assert.deepEqual(warmedPoints, [
    { x: 4, z: 7, radiusM: 0 },
    { x: -3, z: 9, radiusM: 0 },
  ]);
}

console.log('battlePresentationRuntime.selftest: interpolation, visibility, detail, FX, and terrain passed');

{
 const {entity,root}=createEntity({isPlayer:true});
 const material=new MeshStandardMaterial(),mesh=new Mesh(new BoxGeometry(),material);root.add(mesh);
 entity.state.modeScale=1.12;entity.combat.hp=100;entity.combat.maxHp=100;
 const {runtime,game}=createHarness({tanks:[entity]});
 runtime.update(.016,1);assert.notEqual(mesh.material,material);
 game.phase='ended';runtime.update(.016,1);assert.equal(mesh.material,material,'post-battle readout clears the aura');assert.equal(root.scale.x,1);
 game.phase='garage';game.matchModeState={boss:{id:entity.id}};runtime.update(.016,1);
 assert.equal(mesh.material,material,'stale boss identity/scale cannot reactivate a garage aura');assert.equal(root.scale.x,1);
 mesh.geometry.dispose();material.dispose();
}

{
 const {entity,root}=createEntity({id:'carrier',isPlayer:true});
 const material=new MeshStandardMaterial(),mesh=new Mesh(new BoxGeometry(),material);root.add(mesh);
 entity.combat.hp=80;entity.combat.maxHp=100;
 const {runtime,game}=createHarness({tanks:[entity]});
 const flag={team:'bravo',status:'carried',carrierId:entity.id};
 game.matchModeState={id:'capture_the_flag',perspectiveTeam:'alpha',flags:[flag]};
 runtime.update(.016,1);
 assert.equal(mesh.material.name,'Flag carrier surface highlight');
 assert.equal(root.scale.x,1,'carriers keep their actual dimensions');
 const shader={uniforms:{},vertexShader:'#include <common>\n#include <project_vertex>',fragmentShader:'#include <common>\n#include <opaque_fragment>'};
 mesh.material.onBeforeCompile(shader,{});
 assert.equal(shader.uniforms.energyColor.value.getHex(),0xf26a62,'enemy flag gives red energy');
 assert.equal(shader.uniforms.energyPattern.value,1,'carrier uses its own chevron pattern');
 game.matchModeState.perspectiveTeam='bravo';runtime.update(.016,1);
 assert.equal(shader.uniforms.energyColor.value.getHex(),0x6fe887,'color matches the flag marker for the local viewer');
 flag.carrierId=null;flag.status='dropped';runtime.update(.016,1);
 assert.equal(mesh.material,material,'dropping the flag removes its aura');
 game.matchModeState={id:'infected',factions:[{id:entity.id,team:'alpha'}]};runtime.update(.016,1);
 assert.equal(mesh.material,material,'survivors do not glow');
 game.matchModeState.factions[0].team='bravo';runtime.update(.016,1);
 mesh.material.onBeforeCompile(shader,{});
 assert.equal(shader.uniforms.energyColor.value.getHex(),0x80ef35);
 assert.equal(shader.uniforms.energyPattern.value,2,'infection uses uneven vein pulses');
 assert.equal(root.scale.x,1);
 entity.combat.destroyed=true;runtime.update(.016,1);assert.equal(mesh.material,material,'dead infected stops glowing');
 mesh.geometry.dispose();material.dispose();
}

{
 const {entity,root,syncs}=createEntity({isPlayer:true});
 const material=new MeshStandardMaterial(),mesh=new Mesh(new BoxGeometry(),material);root.add(mesh);
 entity.combat.hp=100;entity.combat.maxHp=100;
 const {runtime,game,effects}=createHarness({tanks:[entity],phase:'garage',network:true});
 game.matchModeState={id:'infected',factions:[{id:entity.id,team:'bravo'}]};
 runtime.prepareModeVisuals();
 assert.equal(mesh.material.name,'Infected surface highlight','network entry attaches mode shaders before activation/compile');
 assert.equal(game.phase,'garage','warm never activates gameplay');
 assert.equal(syncs.length,0,'warm never advances poses');
 assert.equal(effects.dust.length,0,'warm never emits driving effects');
 runtime.prepareModeVisuals();
 assert.equal(mesh.material.name,'Infected surface highlight');
 game.phase='ended';runtime.update(0);mesh.geometry.dispose();material.dispose();
}

// The retained battle player may also be the live Garage pedestal. The
// battle presenter must not tear down the Garage's freshly prepared shader.
{
 const {createGarageModePreview}=await import('./garageModePreview.ts');
 const {entity,root,visual}=createEntity({isPlayer:true});
 const paint=new MeshStandardMaterial(),geometry=new BoxGeometry(),mesh=new Mesh(geometry,paint);root.add(mesh);
 const {runtime}=createHarness({tanks:[entity],phase:'garage',pedestalVisual:visual});
 const preview=createGarageModePreview();preview.update(root,entity.spec,'juggernaut',0);
 const resident=mesh.material;let disposals=0;resident.addEventListener('dispose',()=>disposals++);
 for(let frame=0;frame<60;frame++){preview.update(root,entity.spec,'juggernaut',1/60);runtime.update(1/60);}
 assert.equal(mesh.material,resident,'Garage preview survives the subsequent battle-presentation stage');
 assert.equal(disposals,0,'Garage frames do not dispose and recreate energy shaders');
 preview.clear();geometry.dispose();paint.dispose();
}
