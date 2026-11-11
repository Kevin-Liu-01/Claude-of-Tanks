// (round 8 Y6 s4-02, fix-up r1) A drone shot down in the solo battle never flies home, on the real path end to end. The
// solo step (game/state.ts simStep: its GunContext's droneHit, strikeDrone and 'drone:down' for the carrier) downs a
// drone hovering 33 m off an M1A1's bow (sim/counterDroneEngagement.test-support.mjs soloHoverCounterDrone, the hover
// weaponReload pins), while the real FX runtime (fx/effects.ts createFx) hears that bus and draws the step's own shells
// each step, as the battle does; the carrier's dock is the production mount (missionAttachmentVisual, synced each
// frame), so a flight home could land. The key the fix rests on is the sim's own: drone:down names the carrier
// (state.ts droneHit: { id: carrier.id }) and the drone's shell is the carrier's (aerialCombat.ts launch:
// createShell(DRONE_WARHEAD, entity.id, ...)), which effects.ts hands the presentation as the flight's owner
// (drones.write(..., shell.shooterId)) and markDowned matches. Before the fix (H0) the FX log read
// ['<shell>:start:owner pilot'] and the airframe flew home while the crew called it down, whenever the frame after the
// downing came a step later (below 60 fps; at one step a frame the stale view cut it short at once). The network half (the
// authority's drone_down { id: carrier.id }, relayed as drone:down by battlePresentation with the same id) is pinned by
// counterDroneEngagement.selftest (the event names the pilot) and battlePresentation.selftest (the relay keeps the id).
// Run with: node src/fx/droneDownedSolo.selftest.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';
import { DRONE_RETURN } from './droneArrival.ts';
import { createGameState, createBus, simStep } from '../game/state.ts';
import { missionAttachmentVisualFrame, syncMissionAttachment } from '../game/missionAttachmentVisual.ts';
import { soloHoverCounterDrone } from '../sim/counterDroneEngagement.test-support.mjs';
import { missionAttachmentTurretPivot } from '../sim/missionAttachment.ts';
import { SIM_DT } from '../sim/movement.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
camera.position.set(0, 3, -40); camera.lookAt(0, 2, 0); camera.updateMatrixWorld(true);
let game = null, pilot = null;
const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
  { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) },
  { seed: 5, resolveEntity: (id) => game?.tankById.get(id) ?? null, auxiliaryEntities: () => game?.tanks ?? [] });
scene.add(fx.group);
const downs = [], droneShells = new Map();
let stepArgs = null;
/** The pilot's hull as the battle shows it: its turret pivot carries the dock (the harness's visual is a bare group). */
function mountDock() {
  pilot = game.tankById.get('pilot');
  const root = pilot.visual.root, turret = new THREE.Group();
  turret.name = 'rig_turret'; turret.position.set(...missionAttachmentTurretPivot(pilot.spec)); root.add(turret);
  root.position.copy(pilot.state.pos); root.rotation.y = pilot.state.yaw; root.updateMatrixWorld(true);
}
/** One rendered frame as the battle draws it: the carrier's dock, then the effects over the step's own shells. */
function draw() {
  syncMissionAttachment(pilot.visual.root, pilot.spec, pilot.aerial, !!pilot.combat.destroyed, SIM_DT);
  fx.update(SIM_DT, game.shells, camera, (id) => game.tankById.get(id) ?? null);
}
const solo = {
  createGameState: () => (game = createGameState()),
  // the step's bus is the FX runtime's, as the battle's is (drone:down recorded here for the key)
  createBus(record) {
    const bus = createBus((name, payload) => { if (name === 'drone:down') downs.push(payload); record(name, payload); });
    fx.bindBus(bus);
    return bus;
  },
  simStep(...args) {
    if (!pilot) mountDock();
    stepArgs = args;
    const downsBefore = downs.length;
    simStep(...args);
    for (const shell of game.shells) if (!shell.dead && shell.spec?.tracer === 'DRONE') droneShells.set(shell.id, shell.shooterId);
    // a frame per step, except that the downing step shares its frame with the next step (a frame of two fixed steps,
    // as below 60 fps): the downing step's own stepAerial ran before the strike, so its carrier still reads flying, and
    // a frame drawn right after it cut H0's flight home short at once ('carrier flying again'); a frame after the next
    // step sees the carrier's settled view (its drone lost), where H0's airframe flew home and landed on its dock
    if (downs.length === downsBefore) draw();
  },
};
// bounded: the hover downs the drone 3.5 s in (210 steps); 6 s is the cap
const hover = soloHoverCounterDrone({ specId: 'm1a1', solo, seconds: 6 });
assert.ok(hover.downAt !== null, `the solo step downs the hovering drone (${JSON.stringify(hover.rounds)} rounds)`);
assert.ok(missionAttachmentVisualFrame(pilot.visual.root), 'the carrier has its dock: a flight home could start and land');
// the battle goes on past a flight home's grace (the hover stops at the downing): the carrier's view settles (its drone
// lost, the cooldown running, no relaunch: the last input asks for none), so a flight home would be in transit by now
for (let i = 0; i < Math.ceil((DRONE_RETURN.graceS + 0.5) / SIM_DT); i++) solo.simStep(...stepArgs);
assert.ok(pilot.aerial.active === false && pilot.aerial.cooldownS > 0, 'the carrier\'s drone is lost and its cooldown runs');
assert.equal(droneShells.size, 1, `one flight (${[...droneShells.keys()]})`);
const [[shellId, shooterId]] = droneShells;
assert.deepEqual(downs.map((d) => d.id), ['pilot'], 'the solo step\'s drone:down names the carrier, once');
assert.equal(String(shooterId), downs[0].id, 'the drone\'s shell is the carrier\'s: the key markDowned matches on');
const log = (fx.group.userData.droneFlightsHomeLog ?? []).map((e) => `${e.id}:${e.event}:${e.reason.split(' (')[0]}`);
assert.deepEqual([fx.group.userData.droneFlightsHome().size, log], [0, [`${shellId}:skip:downed`]],
  `a drone shot down in the solo battle never flies home (${JSON.stringify(log)})`);
fx.resetAll();
console.log(`droneDownedSolo: the solo step's drone:down (carrier ${downs[0].id}, ${hover.rounds} rounds, ${hover.downAt} s) reaches the FX runtime keyed to its shell ${shellId}: no flight home, one end (downed)`);
