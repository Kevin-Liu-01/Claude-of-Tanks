import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PerspectiveCamera, Vector3 } from 'three';

import { createBattleHudFrameRuntime } from './battleHudFrameRuntime.ts';

const player = {
  id: 'player', team: 'alpha', state: {},
  combat: { shellSlot: 1 },
  visual: { root: { visible: true } },
  spec: { gun: { shells: ['ap', 'heat'] } },
};
const enemy = {
  id: 'enemy', team: 'bravo', state: {}, combat: { destroyed: false },
  visual: { root: { visible: true } },
};
const hiddenEnemy = {
  id: 'hidden', team: 'bravo', state: {}, combat: { destroyed: false },
  visual: { root: { visible: false } },
};
const ally = {
  id: 'ally', team: 'alpha', state: {}, combat: { destroyed: false },
  visual: { root: { visible: true } },
};
const game = {
  phase: 'battle', timeS: 12, player,
  tanks: [player, enemy, hiddenEnemy, ally], shells: [{ id: 1 }],
  spotting: {
    isSpotted: (id, team, receiver) => id === 'enemy' && team === 'player' && receiver === player,
    getConcealment: (entity, timeS) => ({ id: entity.id, timeS }),
  },
};
const camera = new PerspectiveCamera();
camera.userData.scoped = true;
const rig = { mode: 'SNIPER' };
const hudFrames = [];
const damageFrames = [];
const overlayFrames = [];
let overlayHides = 0;
let aimUpdates = 0;
let perspective = null;
let wallMs = 400;
const networkSession = {
  match: { client: { rttMs: 73 } },
  spectator: false,
  bridge: {
    entities: new Map(),
    roster: ['server-roster'],
    setPerspective: (id) => { perspective = id; },
  },
};
const killcam = {
  active: false,
  isActive() { return this.active; },
  spectate: { active: false, targetId: null },
};
const runtime = createBattleHudFrameRuntime({
  game,
  camera,
  rig,
  input: { getSettings: () => ({ armorAimOverlay: true }) },
  aimController: {
    update: () => { aimUpdates += 1; },
    raycast: () => null,
    gunCenterRay: () => 0,
    muzzlePathBlockDist: () => null,
  },
  armorAimOverlay: {
    update: (frame) => overlayFrames.push(frame),
    hide: () => { overlayHides += 1; },
  },
  networkSession,
  killcam,
  muzzleScratch: new Vector3(1, 2, 3),
  getHud: () => ({ update: (frame) => hudFrames.push(frame) }),
  getDamagePanel: () => ({ update: (combat) => damageFrames.push(combat) }),
  now: () => wallMs,
});

const stableFrame = runtime.frameInfo;
runtime.update(true, false);
assert.equal(runtime.frameInfo, stableFrame, 'the HUD frame record is retained');
assert.equal(hudFrames.length, 1);
assert.equal(hudFrames[0].player, player);
assert.equal(hudFrames[0].mode, 'sniper');
assert.equal(hudFrames[0].pingMs, 73);
assert.deepEqual(hudFrames[0].rosterTanks, ['server-roster']);
assert.deepEqual(hudFrames[0].spotting.player, { id: 'player', timeS: 12 });
assert.equal(hudFrames[0].spotting.isSpotted('enemy'), true);
assert.equal(aimUpdates, 1);
assert.equal(damageFrames[0], player.combat);
assert.deepEqual(overlayFrames[0].targets, [enemy], 'only visible opponents reach armor inspection');
assert.equal(overlayFrames[0].shellSpec, 'heat');
assert.equal(overlayFrames[0].nowMs, 400);

runtime.redrawFrozen();
assert.equal(hudFrames.length, 2, 'capture mode can redraw the retained frame');

const observer = { id: 'observer', team: 'alpha', state: {}, combat: { destroyed: false } };
game.player = null;
networkSession.spectator = true;
networkSession.bridge.entities.set('observer', observer);
killcam.spectate = { active: true, targetId: 'observer' };
runtime.update(true, false);
assert.equal(perspective, 'observer');
assert.equal(runtime.frameInfo.player, observer);
assert.equal(aimUpdates, 1, 'spectators do not run local gun aim');
assert.equal(overlayHides, 1, 'spectators cannot reveal plate inspection');
assert.equal(damageFrames.at(-1), observer.combat);

killcam.active = true;
runtime.update(true, false);
assert.equal(hudFrames.length, 3, 'live replay activation suppresses the HUD transaction');
assert.equal(overlayHides, 2);

game.tanks = [enemy];
game.shells = [];
runtime.reset();
assert.equal(runtime.frameInfo.player, null);
assert.equal(runtime.frameInfo.tanks, game.tanks);
assert.equal(runtime.frameInfo.shells, game.shells);

assert.throws(() => createBattleHudFrameRuntime({}), /requires every presentation port/);

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.doesNotMatch(mainSource, /const frameInfo\s*=\s*\{/,
  'main must not rebuild the mutable HUD frame');
assert.doesNotMatch(mainSource, /const armorScopeTargets\s*=\s*\[/,
  'main must not own scoped opponent filtering');
assert.match(mainSource, /battleHudFrame\.update\(inBattle, kcActive\)/,
  'the render loop delegates one HUD transaction');

console.log('battleHudFrameRuntime.selftest: all assertions passed');
