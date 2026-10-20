// killFeedSource.selftest.mjs — (lane ac130-fx-228 r3, the engineering critic's m1: killSurfaces' text checks let "the
// killer's name before the source" live, a drone's kill reading as its carrier tank) the battle HUD's kill feed names the
// platform the authority stamped on the kill: driven through the real HUD (initHud) over the recording DOM, an AC-130
// pilot's kill reads "AC-130" and a drone's kill reads the drone, never the pilot's or the carrier's garage tank; a
// tank's own kill keeps its vehicle.
import { created } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { createSpecialActionState } from '../sim/specialActionPolicy.ts';
import { createBus } from '../game/stateCore.ts';
import { initHud } from './hud.ts';
import { killSourceIdentity } from './killSourceIdentity.ts';

await ensureAuthorityFleet(['m1a1_abrams_hc', 'm1a3', 'type90']);
const bus = createBus();
const hud = initHud(bus);
hud.setMode('battle');
function tank(id, specId, team, extra = {}) {
  const spec = getSpec(specId);
  return { id, team, isPlayer: id === 'player', spec, combat: createCombatState(spec), specialAction: createSpecialActionState(spec),
    state: { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, speed: 0, atGunLimit: false, gunLimitSpec: false },
    visual: { gunMuzzleWorld(out) { out.set(0, 2, 0); }, gunDirWorld(out) { out.set(0, 0, 1); } }, ...extra };
}
const pilot = tank('player', 'm1a1_abrams_hc', 'alpha', { aerial: { kind: 'gunship', active: true, launching: false, x: 0, y: 240, z: 0, yaw: 0, pitch: -1, batteryS: 0, cooldownS: 0 } });
const carrier = tank('ally-1', 'type90', 'alpha');
const foes = ['foe-1', 'foe-2', 'foe-3'].map((id) => tank(id, 'm1a3', 'bravo'));
const tanks = [pilot, carrier, ...foes];
const aim = { singleReticle: false, point: new THREE.Vector3(0, 0, 100), distM: 100, dispersionRadM: 1, gunLimitSpec: false,
  reload: { t: 0, totalS: 0 }, magazine: { rounds: 0, capacity: 0, launcher: false }, shellSlot: 0, shells: [], zoom: 1,
  gunDistM: 0, gunTargetId: null, gunMarker: new THREE.Vector3(), blockedDistM: null, blockedLabel: false, penRatio: null };
let timeS = 20;
const frame = () => { timeS += 1 / 60; hud.update({ timeS, mode: 'battle', player: pilot, tanks, spotting: { isSpotted: () => true }, aim, camera: null, auxiliaryKeyLabels: { missile: 'E' } }); };
frame(); frame();
const feedKiller = () => {
  const items = created.filter((e) => e.classes.has('cot-kf'));
  return items.at(-1)?.querySelector('.k').textContent ?? null;
};
bus.emit('tank:destroyed', { id: 'foe-1', specId: 'm1a3', killerId: 'player', cause: 'shot', source: 'ac130', pos: [0, 0, 0] });
frame();
assert.equal(feedKiller(), killSourceIdentity('ac130').label, 'an AC-130 pilot\'s kill names the AC-130');
bus.emit('tank:destroyed', { id: 'foe-2', specId: 'm1a3', killerId: 'ally-1', cause: 'shot', source: 'drone', pos: [0, 0, 0] });
frame();
assert.equal(feedKiller(), killSourceIdentity('drone').label, 'a drone\'s kill names the drone, never its carrier tank');
bus.emit('tank:destroyed', { id: 'foe-3', specId: 'm1a3', killerId: 'ally-1', cause: 'shot', pos: [0, 0, 0] });
frame();
const own = feedKiller();
assert.ok(own && own !== killSourceIdentity('drone').label && own !== killSourceIdentity('ac130').label, `a tank's own kill keeps its vehicle (${own})`);
console.log(`killFeedSource: the kill feed names the AC-130 and the drone for their kills (${killSourceIdentity('ac130').label}, ${killSourceIdentity('drone').label}) and the tank for its own (${own})`);
