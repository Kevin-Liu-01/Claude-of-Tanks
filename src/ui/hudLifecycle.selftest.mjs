// 2026-11-02 audit F8: the battle HUD's lifecycle. Its per-battle reset hung on one setMode('hidden' -> 'battle') edge
// while a frame's mode flipped the HUD out of hidden without it; the hidden cleanup missed the revive countdown (a
// 100 ms wall-clock interval that kept ticking in the Garage), the aerial body class and the ready pulse; the scope
// attribute outlived a killcam; four writers raced for the root's display (a sniper flip undid the replay veil, a veil
// lifted after the Garage return showed an empty HUD); the HUD and the Watch HUD both wrote body.cot-spectating; a
// watcher's side change kept the old spawn flags. Driven through the real HUD (initHud) over the recording DOM.
import { created } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { createSpecialActionState } from '../sim/specialActionPolicy.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';
import { createBus } from '../game/stateCore.ts';
import { initHud } from './hud.ts';
import { setBodyFlag } from './bodyFlags.ts';

await ensureAuthorityFleet(['m1a1_abrams_hc']);
const bus = createBus();
const hud = initHud(bus);
const spec = getSpec('m1a1_abrams_hc');
const tank = (id, team, x, z) => ({
  id, team, isPlayer: id === 'player', spec, combat: createCombatState(spec), specialAction: createSpecialActionState(spec),
  state: { pos: new THREE.Vector3(x, 0, z), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, speed: 0, atGunLimit: false, gunLimitSpec: false },
  visual: { gunMuzzleWorld(out) { out.set(0, 2, 0); }, gunDirWorld(out) { out.set(0, 0, 1); } },
});
const player = tank('player', 'player', 0, -100);
const tanks = [player, tank('ally', 'player', 10, -100), tank('foe', 'enemy', 0, 100), tank('foe2', 'enemy', 10, 100)];
const aim = { singleReticle: false, point: new THREE.Vector3(0, 0, 100), distM: 100, dispersionRadM: 1, gunLimitSpec: false,
  reload: { t: 0, totalS: 0 }, magazine: { rounds: 0, capacity: 0, launcher: false }, shellSlot: 0, shells: [], zoom: 1,
  gunDistM: 0, gunTargetId: null, gunMarker: new THREE.Vector3(), blockedDistM: null, blockedLabel: false, penRatio: null };
let timeS = 0;
const frame = (mode = 'battle', step = 1 / 60) => {
  timeS += step;
  hud.update({ timeS, mode, player, tanks, spotting: { isSpotted: () => true }, aim, camera: null });
};
const one = (cls) => created.find((e) => e.classes.has(cls));
const root = one('cot-hud');
const sixth = one('cot-sixth');
const revive = one('cot-revive');
const html = document.documentElement;
const body = document.body;

// --- battle 1 ends with the sixth-sense fuse armed; a frame (not setMode) brings the HUD back for the next battle ---
hud.setMode('battle');
timeS = 100;
frame();
bus.emit('player:spotted', { timeS }); // the fuse: the lamp lights 3 s later
hud.setMode('hidden');
timeS = 0; // the next battle's sim clock restarts
frame('battle'); // battleHudFrameRuntime's frame.mode, no setMode('battle')
while (timeS < 104) frame('battle', 0.25);
assert.equal(sixth.classes.has('on'), false,
  'a frame that brings the HUD out of hidden runs the per-battle reset (no fuse from the last battle lights this one)');

// --- the hidden cleanup: the revive countdown, the aerial class, the scope attribute ---
hud.setMode('hidden');
hud.setMode('battle');
hud.setPreBattleRules(matchRulesetFor('capture_the_flag'));
frame();
bus.emit('tank:destroyed', { id: 'player', killerId: 'foe', cause: 'shot', pos: [0, 0, 0] });
player.combat.destroyed = true; // waiting for the revive when the battle ends
assert.equal(revive.classes.has('on'), true, 'the revive count shows');
player.aerial = { kind: 'drone', active: true, launching: false, x: 0, y: 30, z: 0, yaw: 0, pitch: 0, batteryS: 60, cooldownS: 0 };
frame();
assert.equal(body.classes.has('cot-hud-aerial'), true);
player.aerial = null;
frame('sniper');
assert.equal(html.hasAttribute('data-cot-scoped'), true);
player.aerial = { kind: 'drone', active: true, launching: false, x: 0, y: 30, z: 0, yaw: 0, pitch: 0, batteryS: 60, cooldownS: 0 };
frame('battle');
hud.setMode('hidden'); // the Garage return
assert.equal(revive.classes.has('on'), false, 'the revive count leaves with the battle');
assert.equal(body.classes.has('cot-hud-aerial'), false, 'the aerial class leaves with the battle');
player.aerial = null;
player.combat.destroyed = false;

// --- the revive count runs on the battle's clock: a pause (no frames, sim time still) holds it ---
hud.setMode('battle');
frame();
bus.emit('tank:destroyed', { id: 'player', killerId: 'foe', cause: 'shot', pos: [0, 0, 0] });
player.combat.destroyed = true;
const reviveNumber = created.find((e) => e.parentNode === revive && e.classes.has('n'));
const count = () => Number(reviveNumber.textContent);
const startCount = count();
assert.ok(startCount >= 2, `the count starts at the ruleset's delay (${startCount})`);
await new Promise((resolve) => setTimeout(resolve, 1300)); // wall time passes with the battle paused
frame('battle', 0); // the frame after the pause: sim time has not moved
assert.equal(count(), startCount, 'a paused battle holds the revive count');
for (let i = 0; i < 70; i++) frame();
assert.equal(count(), startCount - 1, 'a second of battle takes a second off');
player.combat.destroyed = false;
frame();
assert.equal(revive.classes.has('on'), false);

// --- the scope attribute does not outlive a killcam (the HUD gets no frame while the replay owns it) ---
frame('sniper');
assert.equal(html.hasAttribute('data-cot-scoped'), true);
bus.emit('killcam:begin', {});
assert.equal(html.hasAttribute('data-cot-scoped'), false, 'a replay drops the scoped attribute');
bus.emit('killcam:done', {});
frame('battle');

// --- one visibility owner: the veil and the mode both feed the root's display ---
hud.setVeiled(true);
frame('sniper');
frame('battle'); // a sniper exit inside the veil
assert.equal(root.style.display, 'none', 'a scope flip does not undo the veil');
hud.setVeiled(false);
assert.equal(root.style.display, 'block');
hud.setVeiled(true);
hud.setMode('hidden');
hud.setVeiled(false); // the veil lifted after the Garage return
assert.equal(root.style.display, 'none', 'a lifted veil never shows a hidden HUD');
hud.setVeiled(true); // a replay's veil the Garage return never lifted (killcam.cancel drops its onDone)
hud.setMode('battle');
assert.equal(root.style.display, 'block', 'a new battle starts unveiled');

// --- body.cot-spectating: the spectate bar and the Watch HUD each hold their own reason ---
setBodyFlag('cot-spectating', 'watch', true); // the Watch HUD flying the drone
bus.emit('spectate:begin', { id: 'ally', name: 'Ally', vehicle: 'M1', count: 1, index: 1, allies: ['ally'] });
bus.emit('spectate:end', {});
assert.equal(body.classes.has('cot-spectating'), true, 'the bar leaving keeps the drone view\'s own-tank furniture off');
setBodyFlag('cot-spectating', 'watch', false);
assert.equal(body.classes.has('cot-spectating'), false);

// --- a watcher who changes side reads the spawn flags from the new side ---
hud.setMode('hidden');
hud.setMode('battle');
frame();
const flags = hud.getSpawnFlags();
assert.ok(flags, 'the spawn flags were captured');
const own = flags.find((flag) => flag.side === 'own');
assert.ok(own.z < 0, 'the own base is the player\'s spawn');
hud.setWatchSide('enemy');
frame();
const swapped = hud.getSpawnFlags().find((flag) => flag.side === 'own');
assert.ok(swapped.z > 0, 'after the side change the own base is the new side\'s spawn');

console.log('hudLifecycle.selftest: the frame-mode entry resets, the hidden cleanup (revive count, aerial class), the revive count on the battle clock, the scope attribute through a killcam, one display owner, the spectating reasons and the re-sided spawn flags pass');
