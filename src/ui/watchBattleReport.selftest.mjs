// watchBattleReport.selftest.mjs — (watch-mode-243 follow-up) a watched battle has no human side: driven through the
// real HUD (initHud), its shotInfo ledger and the end screen over the recording DOM, a spectator riding a Bravo tank
// reads the battle as it stands (the score labelled Alpha and Bravo, Alpha's kills in the left lane, the ridden tank's
// kills and death named by its callsign and only highlighted, its pip and roster row ringed on Bravo's side), a taken
// seat is the player's own HUD again, and the end screen names the winning side with its flag, the score by side and
// the battle's own timeline, never VICTORY, DEFEAT, a personal debrief or "You".
import { created } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { createSpecialActionState } from '../sim/specialActionPolicy.ts';
import { createBus } from '../game/stateCore.ts';
import { initHud } from './hud.ts';
import { t } from './i18n.ts';

await ensureAuthorityFleet(['m1a1_abrams_hc', 'm1a3', 'type90']);
const bus = createBus();
const hud = initHud(bus);
hud.setMode('battle');
function tank(id, specId, team) {
  const spec = getSpec(specId);
  return { id, team, isPlayer: false, spec, combat: createCombatState(spec), specialAction: createSpecialActionState(spec),
    state: { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, speed: 0, atGunLimit: false, gunLimitSpec: false },
    visual: { gunMuzzleWorld(out) { out.set(0, 2, 0); }, gunDirWorld(out) { out.set(0, 0, 1); } } };
}
// the watched seat (Alpha's slot 0, team 'player'), an Alpha bot, and Bravo's three; the watcher rides Bravo's b0
const seat = tank('a0', 'm1a1_abrams_hc', 'player');
const alpha = tank('a1', 'm1a3', 'player');
const ridden = tank('b0', 'type90', 'enemy');
const bravo = [ridden, tank('b1', 'm1a3', 'enemy'), tank('b2', 'm1a3', 'enemy')];
const tanks = [seat, alpha, ...bravo];
const aim = { singleReticle: false, point: new THREE.Vector3(0, 0, 100), distM: 100, dispersionRadM: 1, gunLimitSpec: false,
  reload: { t: 0, totalS: 0 }, magazine: { rounds: 0, capacity: 0, launcher: false }, shellSlot: 0, shells: [], zoom: 1,
  gunDistM: 0, gunTargetId: null, gunMarker: new THREE.Vector3(), blockedDistM: null, blockedLabel: false, penRatio: null };
let timeS = 20;
let focus = ridden;
const frame = () => { timeS += 1 / 60; hud.update({ timeS, mode: 'battle', player: focus, tanks, spotting: { isSpotted: () => true }, aim, camera: null, auxiliaryKeyLabels: { missile: 'E' } }); };

hud.setWatchSide('player');
hud.setWatchDrone(null);
frame(); frame();

// --- the battle's frame while riding Bravo's tank --------------------------------------------------------------------
const label = created.find((element) => element.text === t('hud.side.alpha'));
assert.ok(label, 'the score\'s own side reads Alpha');
assert.ok(created.some((element) => element.text === t('hud.side.bravo')), 'and the other Bravo, whichever tank is ridden');
const pips = created.filter((element) => element.classes.has('pip') && element.parentNode);
const ringed = pips.filter((pip) => pip.classes.has('me'));
assert.equal(ringed.length, 1, 'one pip is ringed: the ridden tank\'s');
assert.ok(ringed[0].parentNode.classes.has('enemy'), 'on Bravo\'s side of the strip, never counted as the watcher\'s');
assert.equal(pips.filter((pip) => pip.parentNode.classes.has('own')).length, 2, 'Alpha\'s two pips on the own side');
const rows = created.filter((element) => element.classes.has('cot-er') && element.parentNode);
assert.equal(rows.filter((row) => row.classes.has('me')).length, 1, 'one roster row highlighted: the ridden tank\'s');

const feedItem = () => created.filter((element) => element.classes.has('cot-kf')).at(-1);
bus.emit('tank:destroyed', { id: 'a1', specId: 'm1a3', killerId: 'b0', cause: 'shot', pos: [0, 0, 0], timeS: 140 });
frame();
let item = feedItem();
assert.notEqual(item.querySelector('.k').textContent, t('hud.feed.you'), 'the ridden tank\'s kill names its own callsign, never You');
assert.ok(item.parentNode.classes.has('r'), 'a Bravo kill rides Bravo\'s lane');
assert.equal(item.dataset.relation, 'ridden', 'and is highlighted as the ridden tank\'s');
assert.ok(!item.innerHTML.includes('class="relation"'), 'with no "your kill" mark');
bus.emit('tank:destroyed', { id: 'b1', specId: 'm1a3', killerId: 'a0', cause: 'shot', pos: [0, 0, 0], timeS: 200 });
frame();
item = feedItem();
assert.ok(item.parentNode.classes.has('l'), 'an Alpha kill rides Alpha\'s lane');
assert.equal(item.dataset.relation, undefined, 'a kill the ridden tank had no part in is not highlighted');
const ribbon = created.find((element) => element.classes.has('cot-ribbon'));
assert.ok(ribbon && !ribbon.classes.has('on'), 'no kill ribbon claims the ridden tank\'s kill as the watcher\'s');

// --- a taken seat is the player's own HUD: the sides re-seat around the driven tank ----------------------------------
ridden.isPlayer = true;
hud.setWatchSide(null);
frame();
assert.equal(label.text, t('hud.allies'), 'driving, the score is the player\'s again');
const drivenRows = created.filter((element) => element.classes.has('cot-er') && element.parentNode && element.classes.has('me'));
assert.equal(drivenRows.length, 1, 'the rosters re-seat with the driven tank\'s row as the player\'s');
bus.emit('tank:destroyed', { id: 'a0', specId: 'm1a1_abrams_hc', killerId: 'b0', cause: 'shot', pos: [0, 0, 0], timeS: 230 });
frame();
item = feedItem();
assert.equal(item.querySelector('.k').textContent, t('hud.feed.you'), 'the driver\'s own kill is You');
assert.ok(item.parentNode.classes.has('l'), 'in the driver\'s own lane');
ridden.isPlayer = false;
hud.setWatchSide('player');
frame();
assert.equal(label.text, t('hud.side.alpha'), 'handed back, the battle\'s frame returns');

// --- the end screen: the winning side, the score by side, the battle's timeline --------------------------------------
const roster = tanks.map((entity) => ({ id: entity.id, specId: entity.spec.id, vehicle: entity.spec.name, team: entity.team,
  alive: !['a0', 'a1', 'b1'].includes(entity.id), isPlayer: false }));
const before = created.length;
bus.emit('battle:ended', { result: 'defeat', reason: 'elimination', timeS: 300, map: 'steppe', mapId: 'steppe', watch: true,
  score: null, gameMode: 'standard', roster });
await new Promise((resolve) => setTimeout(resolve, 700)); // the report gate's no-replay flush
const report = created.find((element) => element.classes.has('cot-si-stats'));
assert.equal(report.dataset.winner, 'bravo', 'a defeat of the watched seat\'s side is Bravo\'s win');
assert.equal(report.dataset.banner, t('endScreen.watch.wins', { side: t('endScreen.side.bravo') }), 'the headline names the winner');
assert.equal(report.dataset.score, '1:2', 'the score by side: Alpha one kill, Bravo two');
const drawn = created.slice(before);
const words = drawn.map((element) => `${element.text} ${element.html ?? ''}`).join('\n');
for (const verdict of [t('endScreen.victory'), t('endScreen.defeat')]) {
  assert.ok(!words.includes(verdict), `no ${verdict} in a watched battle's report`);
}
assert.ok(!words.includes('class="you"'), 'no row reads You');
assert.ok(drawn.some((element) => (element.html ?? '').includes('class="fg bravo"')), 'the headline carries Bravo\'s flag');
assert.ok(!drawn.some((element) => element.classes.has('es-view-tabs') || element.classes.has('personal')),
  'no personal debrief: the report is the battle\'s');
const reportRows = drawn.filter((element) => element.classes.has('es-tr'));
assert.equal(reportRows.length, tanks.length, 'every tank has its row');
const me = reportRows.filter((row) => row.classes.has('me'));
assert.equal(me.length, 1, 'the ridden tank\'s row is the one highlighted');
assert.ok(me[0].classes.has('foe'), 'on Bravo\'s roster');
const marks = drawn.filter((element) => element.classes.has('ev'));
assert.ok(marks.some((mark) => mark.classes.has('k-kill') && mark.classes.has('s-bravo')), 'Bravo\'s kills on the line in Bravo\'s ink');
assert.ok(marks.some((mark) => mark.classes.has('k-kill') && mark.classes.has('s-alpha')), 'and Alpha\'s in Alpha\'s');
assert.ok(marks.some((mark) => mark.classes.has('end') && mark.classes.has('s-bravo')), 'the line ends on the winner');
assert.equal(report.dataset.beats, '3', 'every kill of the battle is a beat, whoever was ridden');

console.log('watchBattleReport: riding Bravo the HUD reads the battle (Alpha/Bravo score, lanes by side, the ridden tank ' +
  'only highlighted), a taken seat is the player\'s HUD, and the end screen names the winning side, the score by side ' +
  'and the battle\'s timeline with no VICTORY, DEFEAT or You');
