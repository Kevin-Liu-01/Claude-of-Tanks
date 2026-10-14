// src/ui/damagePanelWreckPose.selftest.mjs — a destroyed tank's damage panel holds still (owner 2026-10-13:
// "even if im destroyed, the tank in bottom left corner can have its turret rotating, fix").
//
// The bottom-left panel is camera-up: hud.ts feeds it the player's hull yaw, hull-relative turret yaw and the
// camera yaw every frame (setPose), and the turret+gun layer turns by camYaw - hullYaw - turretYaw. Two sources
// kept that angle moving after the player died:
//   1. the solo sim kept laying the wreck's gun: the dead player's input left aimLocked false while the camera
//      rig kept writing the live sight into input.aimPoint, so state.turretYaw chased the mouse (reviving modes
//      keep the live chase camera through the respawn countdown);
//   2. the camera itself turns (the death cam orbit, an ally's spectate camera), which spins the camera-up plan.
// The receipt drives the REAL panel through live, dead and respawned frames (pose fed before update, the HUD's
// order) and the REAL frame-input owner plus the REAL movement step for the dead player's wreck.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createDamagePanel } from './damagePanel.ts';
import { createPlayerFrameInput } from '../game/playerFrameInput.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';

// ---------------------------------------------------------------------------
// part 1: the panel holds the pose of the last live frame while its vehicle is a wreck
// ---------------------------------------------------------------------------
function fakeElement(tag) {
  const selected = new Map();
  const element = {
    tagName: tag.toUpperCase(), id: '', className: '', textContent: '', innerHTML: '',
    style: {}, dataset: {}, children: [],
    appendChild(child) { element.children.push(child); return child; },
    querySelector(selector) {
      let found = selected.get(selector);
      if (!found) { found = fakeElement('span'); selected.set(selector, found); }
      return found;
    },
  };
  return element;
}

/** A Canvas2D stub that counts the draws it is asked for (a repaint is visible as new draws). */
function countingContext() {
  const counter = { draws: 0 };
  return new Proxy(counter, {
    get: (target, key) => {
      if (key in target) return target[key];
      if (key === 'drawImage' || key === 'arcTo' || key === 'fill' || key === 'stroke') return () => { target.draws++; };
      return () => undefined;
    },
    set: (target, key, value) => { target[key] = value; return true; },
  });
}

function fakeCanvas(context) {
  const canvas = fakeElement('canvas');
  canvas.width = 0;
  canvas.height = 0;
  canvas.getContext = () => context;
  return canvas;
}

const saved = new Map(['document', 'window'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let stage = null;
Object.defineProperties(globalThis, {
  document: { configurable: true, value: {
    head: fakeElement('head'),
    getElementById: () => null,
    createElement(kind) {
      if (kind !== 'canvas') return fakeElement(kind);
      const context = countingContext();
      if (!stage) stage = context;
      return fakeCanvas(context);
    },
  } },
  window: { configurable: true, value: {} },
});

const spec = {
  id: 'wreck-pose-receipt', hp: 1000,
  dims: { hullLengthM: 7, widthM: 3.6, overallLengthM: 9.5 },
  armor: {
    turretPivot: [0, 1.4, -0.3],
    gunBarrel: { lengthM: 5 },
    modules: [
      { module: 'engine', min: [-0.6, 0, -2.4], max: [0.6, 1, -1.2] },
      { module: 'gun', min: [-0.1, 0, 0.2], max: [0.1, 1, 3], turretLocal: true },
    ],
    crew: [
      { crew: 'driver', min: [-0.4, 0.4, 1.4], max: [0.4, 1.2, 2.2] },
      { crew: 'gunner', min: [0.2, 0, -0.5], max: [0.6, 0.8, 0.1], turretLocal: true },
    ],
  },
};
const maskEntry = () => ({
  ready: true,
  hull: { canvas: fakeCanvas(countingContext()), camX: 0, camZ: 0, halfM: 5, cx: 0.1, cz: -0.2, radiusM: 4, widthM: 3.6, lengthM: 7 },
  turret: { canvas: fakeCanvas(countingContext()), camX: 0, camZ: -0.3, halfM: 4, radiusM: 3 },
  pivot: [0, -0.3],
  pxPerM: 19.2,
});
function healthyCombat() {
  return {
    hp: 1000, maxHp: 1000, destroyed: false,
    modules: { engine: { hp: 1, maxHp: 1, state: 'ok', repairT: 0 }, gun: { hp: 1, maxHp: 1, state: 'ok', repairT: 0 } },
    crew: { driver: true, gunner: true },
    fire: { burning: false, tickTimer: 0, ticksLeft: 0 },
  };
}

const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const near = (actual, expected, label) => assert.ok(Math.abs(wrap(actual - expected)) < 1e-12,
  `${label}: ${actual} vs ${expected}`);
/** The live pose at a frame: the hull turns, the turret slews, the camera orbits (as the death cam does). */
const poseAt = (frame) => ({ hull: 0.2 + 0.013 * frame, turret: -0.4 + 0.041 * frame, cam: 0.9 + 0.022 * frame });
const hullPhi = (p) => p.cam - p.hull;
const gunPhi = (p) => p.cam - p.hull - p.turret;

let panelChecks = 0;
try {
  const entry = maskEntry();
  const panel = createDamagePanel({
    maskSource: { get: () => entry, async prepare() { return entry; } },
    telemetry: null,
  });
  assert.ok(stage, 'the panel stage canvas is the counted context');
  panel.setTank(spec, null);
  const combat = healthyCombat();
  /** One HUD frame: hud.update feeds the pose, then the battle HUD frame updates the panel with the same combat. */
  const frame = (p) => { panel.setPose(p.hull, p.turret, p.cam); panel.update(combat); return panel.debugState(); };

  // live frames: the plan follows hull, turret and camera
  let last = null;
  for (let f = 0; f < 30; f++) {
    const state = frame(poseAt(f));
    near(state.hullPhi, hullPhi(poseAt(f)), `live frame ${f}: hull layer follows the live pose`);
    near(state.gunPhi, gunPhi(poseAt(f)), `live frame ${f}: turret layer follows the live pose`);
    last = poseAt(f);
    panelChecks += 2;
  }
  const liveMarkers = panel.debugState().markers.map((marker) => ({ ...marker }));
  assert.ok(liveMarkers.length > 0, 'the live plan paints its markers');

  // the vehicle dies: from its first destroyed frame on, the dead sight, the death cam orbit and any spectate
  // camera keep changing the pose the HUD feeds — the plan keeps the pose of its last live frame
  combat.destroyed = true;
  combat.hp = 0;
  for (let f = 30; f < 330; f++) {
    const drawsBefore = stage.draws;
    const state = frame(poseAt(f));
    near(state.hullPhi, hullPhi(last), `dead frame ${f}: the hull layer holds the pose it was destroyed in`);
    near(state.gunPhi, gunPhi(last), `dead frame ${f}: the turret layer holds the angle it was destroyed at`);
    assert.deepEqual(state.markers, liveMarkers, `dead frame ${f}: every marker stays where the tank died`);
    if (f > 30) assert.equal(stage.draws, drawsBefore, `dead frame ${f}: a wreck's plan is not repainted by pose changes`);
    panelChecks += 3;
  }
  // the back-compat turret shim cannot turn a wreck's turret either
  panel.setTurretYaw(2.5);
  panel.update(combat);
  near(panel.debugState().gunPhi, gunPhi(last), 'setTurretYaw on a wreck: the turret layer holds');
  panelChecks++;

  // a revive (reviving modes: same entity, alive again) resumes the live pose on its first live frame
  Object.assign(combat, healthyCombat());
  const revived = frame(poseAt(400));
  near(revived.hullPhi, hullPhi(poseAt(400)), 'revived: the hull layer is live again');
  near(revived.gunPhi, gunPhi(poseAt(400)), 'revived: the turret layer is live again');
  const revivedNext = frame(poseAt(401));
  near(revivedNext.gunPhi, gunPhi(poseAt(401)), 'revived: the turret keeps following');
  panelChecks += 3;

  // a new vehicle (setTank) first seen as a wreck shows the wreck's own pose once, then holds it
  panel.setTank({ ...spec, id: 'wreck-pose-receipt-2' }, null);
  combat.destroyed = true;
  const firstSeen = frame(poseAt(500));
  near(firstSeen.gunPhi, gunPhi(poseAt(500)), 'first seen as a wreck: the panel shows the wreck pose it was given');
  const heldSeen = frame(poseAt(560));
  near(heldSeen.gunPhi, gunPhi(poseAt(500)), 'first seen as a wreck: later poses do not turn it');
  near(heldSeen.hullPhi, hullPhi(poseAt(500)), 'first seen as a wreck: the hull holds too');
  // and a respawn into the new vehicle is live from its first frame
  combat.destroyed = false;
  const respawned = frame(poseAt(600));
  near(respawned.gunPhi, gunPhi(poseAt(600)), 'respawned into the new vehicle: the live turret drives the plan');
  panelChecks += 4;

  // the deterministic screenshot hook still places any pose directly
  panel.setState({ hpFrac: 0.4, pose: { hull: 1.1, turret: 0.7, cam: -0.3 } });
  near(panel.debugState().gunPhi, -0.3 - 1.1 - 0.7, 'setState: a staged screenshot pose is shown as given');
  panelChecks++;
} finally {
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

// ---------------------------------------------------------------------------
// part 2: the solo sim no longer lays a dead player's gun (the turret yaw the panel and the minimap read)
// ---------------------------------------------------------------------------
const frameInputPort = {
  onAction: () => () => {},
  getState: () => ({ forward: false, back: false, left: false, right: false, handbrake: false, fire: false }),
  getVirtualMove: () => false,
  isLocked: () => true,
  padActive: () => false,
  isCursorAim: () => false,
  virtualActive: () => false,
  consumeMouseDelta: (out) => { out.x = 0.01; out.y = 0; return out; },
  getCursorNdc: (out) => out,
  getSettings: () => ({ rmbMode: 'hold' }),
  isDown: () => false,
};
const frameInput = createPlayerFrameInput({ input: frameInputPort, hasAmmo: () => true, forceFire: () => false });

const MOVEMENT_SPEC = {
  name: 'wreck-pose-fixture',
  enginePowerHp: 500, weightTons: 33, topSpeedKmh: 42, reverseSpeedKmh: 15,
  hullTraverseDegS: 36, turretTraverseDegS: 36, gunPitchDegS: 24, gunElevationDeg: 25, gunDepressionDeg: 10,
  pivotStyle: 'pivot',
  terrainResistance: { hard: 1.0, medium: 1.2, soft: 2.2 },
  dims: { hullLengthM: 6.27, overallLengthM: 7.52, widthM: 3.0, heightM: 2.97 },
  gun: { caliberMm: 76, baseAccuracy: 0.38, aimTimeS: 2.3, bloom: { move: 0.2, hullRot: 0.2, turret: 0.12, afterShot: 4 } },
  armor: { boundingRadiusM: 3.8, turretPivot: [0, 1.55, 0], gunPivot: [0, 0.25, 0.3], gunBarrel: { lengthM: 4.0 } },
};
const flat = { getHeightAt: () => 0, getNormalAt: () => null, getGroundType: () => 'medium' };
const player = {
  spec: MOVEMENT_SPEC,
  state: createTankState(MOVEMENT_SPEC, new Vector3(0, 0, 0), 0),
  input: { throttle: 0, steer: 0, brake: false, fire: false, shellSlot: 0, aimLocked: false, aimPoint: new Vector3(0, 1.8, 120) },
  combat: { destroyed: false, modules: {}, crew: {} },
};
const sample = {
  dtSeconds: 1 / 60, inBattle: true, paused: false, killcamActive: false, cameraLocked: false, rigMode: 'ARCADE', player,
};
/** One rendered frame of the solo loop: poll the frame input, the rig writes the sight, the fixed step runs. */
const soloFrame = (sight) => {
  frameInput.poll(sample);
  player.input.aimPoint.copy(sight);
  updateTank(player, flat, SIM_DT);
};
const sightAt = (frame) => new Vector3(Math.sin(frame * 0.05) * 150, 1.8, Math.cos(frame * 0.05) * 150);

for (let f = 0; f < 60; f++) soloFrame(sightAt(0));
let simChecks = 0;
// alive: the gun follows the sight
const aliveYaw = player.state.turretYaw;
for (let f = 1; f <= 30; f++) soloFrame(sightAt(f));
assert.ok(Math.abs(wrap(player.state.turretYaw - aliveYaw)) > 0.2, 'alive: the turret follows a moving sight');
assert.equal(player.input.aimLocked, false, 'alive: the frame input leaves the gun free to lay');
simChecks += 2;

// destroyed: the camera rig keeps writing the live sight (reviving modes keep the chase view), the gun holds
player.combat.destroyed = true;
soloFrame(sightAt(31));
const deadYaw = player.state.turretYaw;
const deadPitch = player.state.gunPitch;
for (let f = 32; f < 32 + 600; f++) {
  soloFrame(sightAt(f));
  assert.equal(player.input.aimLocked, true, `dead frame ${f}: a wreck has no gunner — the frame input locks its gun`);
  assert.equal(player.state.turretYaw, deadYaw, `dead frame ${f}: the wreck's turret yaw holds while the sight moves`);
  assert.equal(player.state.gunPitch, deadPitch, `dead frame ${f}: the wreck's gun pitch holds`);
  simChecks += 3;
}

// revived: the lock releases on the first live frame and the gun lays again
player.combat.destroyed = false;
soloFrame(sightAt(700));
assert.equal(player.input.aimLocked, false, 'revived: the frame input releases the gun');
for (let f = 701; f < 760; f++) soloFrame(sightAt(f));
assert.ok(Math.abs(wrap(player.state.turretYaw - deadYaw)) > 0.2, 'revived: the turret follows the sight again');
simChecks += 2;

console.log(`damagePanelWreckPose.selftest: ${panelChecks} panel checks (a wreck's plan holds its last live pose; `
  + `revive and new vehicles resume) and ${simChecks} sim checks (a dead player's gun is not laid)`);
