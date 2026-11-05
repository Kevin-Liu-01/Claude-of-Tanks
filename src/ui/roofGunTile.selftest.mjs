// roofGunTile.selftest — the HUD's roof-gun tile (the B toggle) reads the sim's switch law (round 2 U9 review,
// 2026-11-05). A red roofGun module silences every station while the switch stays on (auxiliarySystems.ts stepRoofGun),
// but the tile read the switch alone: it stayed lit and aria-pressed over a gun that could not fire, and it was disabled
// while red, so the crew could not switch the silenced gun off there. Driven through the real HUD (initHud) over the
// recording DOM: the tile keeps showing the switch (active, aria-pressed), marks a switched-on red gun 'silenced' (its
// icon struck in the danger ink, battleHudLayout.css) and says so in its tip and label, takes a press to switch a red gun
// off, and refuses only the switch on. The paint itself (the struck icon) needs a browser and is not reproduced here.
import { created } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { createSpecialActionState } from '../sim/specialActionPolicy.ts';
import { auxiliaryState } from '../sim/auxiliarySystems.ts';
import { createBus } from '../game/stateCore.ts';
import { initHud } from './hud.ts';

const english = JSON.parse(readFileSync(new URL('./i18nCatalog.en-US.json', import.meta.url), 'utf8'));
await ensureAuthorityFleet(['m1a1_abrams_hc']);
const bus = createBus();
const hud = initHud(bus);
hud.setMode('battle');
const spec = getSpec('m1a1_abrams_hc');
const player = {
  id: 'player', team: 'alpha', isPlayer: true, spec, combat: createCombatState(spec), specialAction: createSpecialActionState(spec),
  state: { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, speed: 0, atGunLimit: false, gunLimitSpec: false },
  visual: { gunMuzzleWorld(out) { out.set(0, 2, 0); }, gunDirWorld(out) { out.set(0, 0, 1); } },
};
const aux = auxiliaryState(player);
player.combat.modules.roofGun ??= { hp: 100, maxHp: 100, state: 'ok', repairT: 0 };
const roofModule = player.combat.modules.roofGun;
const aim = { singleReticle: false, point: new THREE.Vector3(0, 0, 100), distM: 100, dispersionRadM: 1, gunLimitSpec: false,
  reload: { t: 0, totalS: 0 }, magazine: { rounds: 0, capacity: 0, launcher: false }, shellSlot: 0, shells: [], zoom: 1,
  gunDistM: 0, gunTargetId: null, gunMarker: new THREE.Vector3(), blockedDistM: null, blockedLabel: false, penRatio: null };
let timeS = 20;
const frame = () => {
  timeS += 1 / 60;
  hud.update({ timeS, mode: 'battle', player, tanks: [player], spotting: { isSpotted: () => true }, aim, camera: null });
};
// the tile by its key cap (the battle key caps' receipt names each cap's action: dataset.keyCap)
const button = created.find((element) => element.dataset.keyCap === 'roofGun')?.parentNode;
assert.ok(button?.classes.has('cot-auxiliary'), 'the roof-gun tile exists');
const help = english['systems.roofGun.help'], silenced = english['systems.roofGun.silenced'];
assert.ok(silenced && silenced !== help, 'the catalog says what a silenced gun is');
const read = () => ({ hidden: button.hidden, active: button.classes.has('active'), silenced: button.classes.has('silenced'),
  pressed: button.getAttribute('aria-pressed'), disabled: button.disabled, label: button.getAttribute('aria-label'), tip: button.dataset.tip });

// switched on, module whole: lit and pressed, takes a press
aux.gunOn = true; Object.assign(roofModule, { state: 'ok' });
frame();
assert.deepEqual(read(), { hidden: false, active: true, silenced: false, pressed: 'true', disabled: false, label: help, tip: help },
  'a working switched-on gun reads as on');

// switched on, module red: still the switch's position, marked silenced, and the crew can switch it off
Object.assign(roofModule, { hp: 0, state: 'red', repairT: 0 });
frame();
assert.deepEqual(read(), { hidden: false, active: true, silenced: true, pressed: 'true', disabled: false, label: silenced, tip: silenced },
  'a switched-on red gun reads as silenced, not as firing, and takes a press to switch it off');

// switched off while red: plain, and the switch on is refused (as requestAuxiliary refuses it)
aux.gunOn = false;
frame();
assert.deepEqual(read(), { hidden: false, active: false, silenced: false, pressed: 'false', disabled: true, label: help, tip: help },
  'an off red gun is plain and refuses the switch on');

// repaired to yellow: the switch on is offered again; switched on, it reads as on
Object.assign(roofModule, { state: 'yellow' });
frame();
assert.equal(read().disabled, false, 'the repaired gun takes the switch on');
aux.gunOn = true;
frame();
assert.deepEqual(read(), { hidden: false, active: true, silenced: false, pressed: 'true', disabled: false, label: help, tip: help },
  'and reads as on once switched on');

// a destroyed tank's tile takes no press in any state
Object.assign(roofModule, { state: 'red' });
player.combat.destroyed = true;
frame();
assert.equal(read().disabled, true, 'a destroyed tank takes no press');

console.log('roofGunTile: the HUD tile shows the roof-gun switch, marks a switched-on red gun silenced, takes a press to switch it off and refuses only the switch on');
