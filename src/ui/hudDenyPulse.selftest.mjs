// life-reset-279 (Kevin 2026-11-24, live 276: a tray with HEAT 16 drawn in the red "out" state after a respawn: "theres a
// bug where if youve expended an ammo it doesnt clear the state once you die and respawn or even join another game").
// A refused pick on an empty rack pulses .deny on the slot, and .deny paints the plate in the danger ink; nothing took it
// off, so the slot stayed red for the rest of the life, the next lives and every battle after. The same held for the
// missile control's and the consumable tiles' refusals. Driven through the real HUD (initHud) over the recording DOM:
// a refusal still pulses, and the pulse is gone by the time any respawn or new battle could draw the tray.
import { created } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { createSpecialActionState } from '../sim/specialActionPolicy.ts';
import { createBus } from '../game/stateCore.ts';
import { initHud } from './hud.ts';

await ensureAuthorityFleet(['m1a1_abrams_hc']);
const bus = createBus();
const hud = initHud(bus);
const spec = getSpec('m1a1_abrams_hc');
const player = { id: 'player', team: 'player', isPlayer: true, spec, combat: createCombatState(spec),
  specialAction: createSpecialActionState(spec),
  state: { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, speed: 0 },
  visual: { gunMuzzleWorld(out) { out.set(0, 2, 0); }, gunDirWorld(out) { out.set(0, 0, 1); } } };
const shells = (counts) => counts.map((count, i) => ({ type: ['APFSDS', 'HEAT', 'HE'][i], name: ['APFSDS', 'HEAT', 'HE'][i],
  count, dmg: 300, penLabel: 300 }));
const aim = { point: new THREE.Vector3(0, 0, 100), distM: 100, dispersionRadM: 1, reload: { t: 0, totalS: 0 },
  magazine: { rounds: 0, capacity: 0 }, shellSlot: 0, shells: shells([24, 16, 12]), zoom: 1, gunMarker: new THREE.Vector3() };
let timeS = 0;
const frame = () => {
  timeS += 1 / 60;
  hud.update({ timeS, mode: 'battle', player, tanks: [player], spotting: { isSpotted: () => true }, aim, camera: null });
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
hud.setMode('battle');
frame();
const slots = created.filter((e) => e.classes?.has('cot-shell'));
const tiles = created.filter((e) => e.classes?.has('cot-con'));
const controls = created.filter((e) => e.classes?.has('cot-auxiliary'));
assert.equal(slots.length, 3, 'three ammunition slots');
assert.ok(tiles.length >= 1 && controls.length >= 2, 'the consumable tiles and the controls row');

// HEAT runs dry; a pick of it is refused (and a missile with it, and a consumable)
aim.shells = shells([24, 0, 12]);
frame();
bus.emit('ui:ammoSelectionDenied', { slot: 1, guided: true });
bus.emit('ui:consumableDenied', { slot: 0, reason: 'EMPTY' });
frame();
const missile = controls.find((e) => e.classes.has('deny')); // (the controls row's missile control: the one the refusal pulsed)
assert.ok(slots[1].classes.has('deny') && slots[1].classes.has('empty'), 'the refusal still pulses on the empty slot');
assert.ok(missile && tiles[0].classes.has('deny'), 'and on the missile control and the tile');

// a refusal pressed again restarts one pulse, never stacks a second timer
await wait(400);
bus.emit('ui:ammoSelectionDenied', { slot: 1, guided: false });
await wait(500);
assert.ok(slots[1].classes.has('deny'), 'the second refusal restarted the pulse (900 ms after the first)');

// the pulse is feedback: it is gone before any respawn (seconds) could draw the tray
await wait(400);
for (const [name, element] of [['HEAT slot', slots[1]], ['missile control', missile], ['consumable tile', tiles[0]]]) {
  assert.equal(element.classes.has('deny'), false, `the ${name}'s refusal pulse came off (the danger plate is not state)`);
}

// the next life: full racks, and the HEAT plate reads its live count, not the last life's refusal
player.combat = createCombatState(spec);
aim.shells = shells([24, 16, 12]);
frame();
assert.deepEqual([...slots[1].classes].sort(), ['cot-shell'], 'the respawned HEAT slot is a plain plate (16 rounds)');
// and the next battle
hud.setMode('hidden');
hud.setMode('battle');
frame();
assert.deepEqual([...slots[1].classes].sort(), ['cot-shell'], 'the next battle\'s HEAT slot too');

console.log('hudDenyPulse.selftest: a refused shell, missile or consumable pulses .deny and the pulse comes off within '
  + 'its shake, so a respawn or a new battle draws the tray from the live counts');
process.exit(0);
