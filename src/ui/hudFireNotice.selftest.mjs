// fire-visible-275 (Kevin 2026-11-22: "if a tank is on fire or our tank we have to see the fire effects"; his pick for the
// sight, an edge flicker with the notice): while our own tank burns, the condition lane says so at the threat rung, which
// shows while scoped, with the key of a fire kit that puts it out while one has a use left. Driven on the real battle HUD
// (initHud) over the recording DOM: a notice with "On fire" appears in the battle region, scoped or not, and goes when
// the fire does, at a death and when the battle ends.
import { created } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { createSpecialActionState } from '../sim/specialActionPolicy.ts';
import { createBus } from '../game/stateCore.ts';
import { initHud } from './hud.ts';

const SPEC = 'm1a1_abrams_hc';
await ensureAuthorityFleet([SPEC]);
const spec = getSpec(SPEC);
const tank = (id, team, isPlayer = false) => ({
  id, team, isPlayer, displayName: id, spec, combat: createCombatState(spec), specialAction: createSpecialActionState(spec),
  state: { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, speed: 0, atGunLimit: false, gunLimitSpec: false },
  visual: { gunMuzzleWorld(out) { out.set(0, 2, 0); }, gunDirWorld(out) { out.set(0, 0, 1); } },
});
const me = tank('me', 'player', true);
const tanks = [me, tank('e1', 'enemy')];
const aim = { singleReticle: false, point: new THREE.Vector3(0, 0, 100), distM: 100, dispersionRadM: 1, gunLimitSpec: false,
  reload: { t: 0, totalS: 0 }, magazine: { rounds: 0, capacity: 0, launcher: false }, shellSlot: 0, shells: [], zoom: 1,
  gunDistM: 0, gunTargetId: null, gunMarker: new THREE.Vector3(), blockedDistM: null, blockedLabel: false, penRatio: null };
const spotting = { isSpotted: () => true };

const bus = createBus();
const hud = initHud(bus, null);
bus.emit('ui:battleStart', { playerId: me.id, specId: SPEC, mapId: 'steppe' });
hud.setMode('battle');
bus.emit('phase:change', { phase: 'battle' });
let timeS = 0;
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };
async function frames(n = 3) {
  for (let i = 0; i < n; i++) { timeS += 1 / 60; hud.update({ timeS, mode: hud.getMode?.() ?? 'battle', player: me, tanks, spotting, aim, camera: null }); }
  await settle();
}
/** The fire notices standing in the page: the kit's toast plates with the fire glyph and "On fire", not leaving. */
const fireNotices = () => created.filter((el) => el.parentNode && el.classes?.has('cot-c-notice--toast')
  && el.dataset?.state !== 'exit' && /data-icon="statusFire"/.test(el.innerHTML) && />On fire</.test(el.innerHTML));
const keyLineShown = () => fireNotices().some((el) => /Puts it out/.test(el.innerHTML));

await frames();
assert.equal(fireNotices().length, 0, 'no fire, no notice');
me.combat.fire.burning = true;
await frames();
assert.equal(fireNotices().length, 1, 'our tank burning: one "On fire" notice');
assert.equal(keyLineShown(), true, 'the default loadout carries an extinguisher (slot 3): its key line "Puts it out"');
hud.setMode('sniper');
await frames();
assert.equal(fireNotices().length, 1, 'scoped: it stays (the threat rung shows in the sight)');
await frames(10);
assert.equal(fireNotices().length, 1, 'held, never raised twice, while the fire burns');
me.combat.fire.burning = false;
await frames();
await new Promise((resolve) => setTimeout(resolve, 600)); // the kit's exit
assert.equal(fireNotices().length, 0, 'the fire out: the notice goes');
me.combat.fire.burning = true;
await frames();
assert.equal(fireNotices().length, 1, 'a second fire raises it again');
me.combat.destroyed = true;
await frames();
await new Promise((resolve) => setTimeout(resolve, 600));
assert.equal(fireNotices().length, 0, 'a death takes it down');

console.log('hudFireNotice.selftest: our tank on fire raises one "On fire" threat notice, kept while scoped, gone with the fire and at a death');
process.exit(0);
