// airSupportNotices.selftest.mjs — Air Support's air lane (air-support-275; notices-276b, Kevin 2026-11-24: "should we
// combine stuff"): every live air event one plate of the condition lane (battleNotices.ts), never an event:
// - INCOMING (a strike whose footprint covers the crew): airIncoming at NOTICE_PRIORITY.threat, its countdown updated in
//   place only when its whole seconds change, taken down when the danger has passed;
// - the crew's own call-in (airOrder, answered): the refusal it met, the order under way, then its run's countdown;
// - an aircraft the crew brought down (airDown, answered), for the event lane's time, with its aircraft's render;
// - the condition lane is the page's: driven through the real battle HUD (initHud) over the recording DOM, the page's HUD
//   raises the plates and a couch pane's HUD (view.own 'frame', couchPaneViews.ts) raises none.
import { created } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { createSpecialActionState } from '../sim/specialActionPolicy.ts';
import { AIR_SUPPORT_RULES as R } from '../sim/matchRuleset.ts';
import { createBus } from '../game/stateCore.ts';
import { battleNotices, NOTICE_PRIORITY } from './battleNotices.ts';
import { BATTLE_EVENT, EVENT_HOLD_MS } from './battleNoticeEvents.ts';
import { createAirSupportHud, DOWN_NOTICE, INCOMING_NOTICE, ORDER_NOTICE } from './airSupportHud.ts';
import { initHud } from './hud.ts';
import { t } from './i18n.ts';

void created;
/** A bomb run of the other side over the crew at the origin, landing at 14 s. */
const strike = (over = {}) => ({ id: 1, kind: 'bomb', team: 'bravo', x: 0, y: 0, z: 0, heading: 0, calledS: 6,
  landsS: 14, endS: 22, hp: 1, maxHp: 1, downedS: null, downedBy: null, mine: false, ...over });
const view = (nowS, strikes) => ({ nowS, points: 0, strikes });
const ORIGIN = { x: 0, y: 0, z: 0 };

/** A port that records what it was asked. */
function recordingPort() {
  const calls = [];
  return { calls, condition(options) { calls.push({ op: 'condition', ...options }); }, dismiss(id) { calls.push({ op: 'dismiss', id }); } };
}

// ---- the module on its own: the INCOMING condition, at the threat rung, changed only when its seconds change
{
  const bus = createBus(), port = recordingPort(), events = [];
  bus.on(BATTLE_EVENT, (event) => events.push(event));
  const parent = globalThis.document.createElement('div');
  const hud = createAirSupportHud(parent, bus, port);
  hud.update(view(10, [strike()]), ORIGIN, ORIGIN, 'alpha', 10, true, 'X');
  hud.update(view(10.2, [strike()]), ORIGIN, ORIGIN, 'alpha', 10.2, true, 'X');
  assert.equal(port.calls.length, 1, 'one condition while its whole seconds hold');
  const [raised] = port.calls;
  assert.equal(raised.op, 'condition');
  assert.equal(raised.id, INCOMING_NOTICE);
  assert.equal(raised.priority, NOTICE_PRIORITY.threat, 'INCOMING is a threat');
  assert.equal(raised.text, t('airSupport.incoming.bomb'));
  assert.equal(raised.detail, '4 s', 'its countdown');
  assert.equal(raised.durationMs, null, 'it holds until the danger passes');
  assert.equal(raised.severity, 'warning', "the other side's strike");
  assert.equal(raised.kind, 'airIncoming', 'a declared kind (noticeKinds.ts)');
  assert.equal(raised.art, 'f16', 'with its aircraft\'s render');
  hud.update(view(11.1, [strike()]), ORIGIN, ORIGIN, 'alpha', 11.1, true, 'X');
  assert.deepEqual(port.calls.slice(1).map((call) => [call.op, call.id, call.detail]), [['condition', INCOMING_NOTICE, '3 s']], 'updated in place');
  // a strike of our own side over us (friendly fire is on) is told, in the quieter severity
  hud.update(view(11.2, [strike({ team: 'alpha' })]), ORIGIN, ORIGIN, 'alpha', 11.2, true, 'X');
  assert.equal(port.calls.at(-1).severity, 'info', 'our own strike over us');
  // past its danger: taken down
  const pastS = 14 + R.bomb.warningS + 60;
  hud.update(view(pastS, [strike()]), ORIGIN, ORIGIN, 'alpha', pastS, true, 'X');
  assert.deepEqual(port.calls.at(-1), { op: 'dismiss', id: INCOMING_NOTICE }, 'taken down when the danger has passed');
  assert.equal(events.length, 0, 'the warning raises no event');

  // a refused call-in: the crew's plate says so (airOrder, answered, its aircraft's render), never an event; an unknown
  // call-in raises nothing
  const at = port.calls.length;
  bus.emit('ui:strikeRefusal', { kind: 'missile', reason: 'POINTS' });
  bus.emit('ui:strikeRefusal', { kind: 'nonsense', reason: 'POINTS' });
  hud.update(view(pastS + 0.1, []), ORIGIN, ORIGIN, 'alpha', pastS + 0.1, true, 'X');
  const order = port.calls.slice(at).filter((call) => call.op === 'condition');
  assert.deepEqual(order.map((call) => [call.kind, call.id, call.text, call.detail, call.severity, call.priority, call.art]), [
    ['airOrder', ORDER_NOTICE, t('airSupport.kind.missile'), t('airSupport.state.points'), 'warning', NOTICE_PRIORITY.answered, 'f16'],
  ], 'the refusal is the crew\'s plate');
  // it holds the event lane's time, then the plate goes
  const later = pastS + 0.1 + EVENT_HOLD_MS / 1000 + 0.1;
  hud.update(view(later, []), ORIGIN, ORIGIN, 'alpha', later, true, 'X');
  assert.deepEqual(port.calls.at(-1), { op: 'dismiss', id: ORDER_NOTICE }, 'and goes after its time');
  // the crew's own run in the air (not over the crew): the same plate, its countdown
  const far = { x: 900, y: 0, z: 900 };
  hud.update(view(later + 1, [strike({ id: 2, kind: 'strafe', team: 'alpha', mine: true, landsS: later + 4.5 })]), far, far, 'alpha', later + 1, true, 'X');
  const run = port.calls.at(-1);
  assert.deepEqual([run.kind, run.id, run.text, run.detail, run.art], ['airOrder', ORDER_NOTICE, t('airSupport.kind.strafe'), '4 s', 'a10'],
    'the crew\'s run counts down on the same plate');
  // an aircraft brought down: its own plate for the event lane's time
  bus.emit('ui:aircraftDowned', { kind: 'bomb' });
  const down = port.calls.at(-1);
  assert.deepEqual([down.kind, down.id, down.text, down.detail, down.durationMs, down.art],
    ['airDown', DOWN_NOTICE, t('airSupport.downed'), t('airSupport.kind.bomb'), EVENT_HOLD_MS, 'f16'], 'a shoot-down is a timed plate');
  assert.equal(events.length, 0, 'Air Support raises no event: the air lane is the condition lane\'s');
}


// ---- through the real HUD: the page's HUD raises the condition, a couch pane's raises none
const SPEC = 'm1a1_abrams_hc';
await ensureAuthorityFleet([SPEC]);
const spec = getSpec(SPEC);
const tank = (id, team, isPlayer = false) => ({
  id, team, isPlayer, displayName: id, spec, combat: createCombatState(spec), specialAction: createSpecialActionState(spec),
  state: { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, speed: 0, atGunLimit: false, gunLimitSpec: false },
  visual: { gunMuzzleWorld(out) { out.set(0, 2, 0); }, gunDirWorld(out) { out.set(0, 0, 1); } },
});
const seat1 = tank('Seat 1', 'player', true);
const seat2 = tank('Seat 2', 'player');
const tanks = [seat1, seat2, tank('e1', 'enemy')];
const aim = { singleReticle: false, point: new THREE.Vector3(0, 0, 100), distM: 100, dispersionRadM: 1, gunLimitSpec: false,
  reload: { t: 0, totalS: 0 }, magazine: { rounds: 0, capacity: 0, launcher: false }, shellSlot: 0, shells: [], zoom: 1,
  gunDistM: 0, gunTargetId: null, gunMarker: new THREE.Vector3(), blockedDistM: null, blockedLabel: false, penRatio: null };
const spotting = { isSpotted: () => true };

// the page's one condition lane, recorded (battleNotices is the module's port object)
const pageLane = recordingPort();
const realCondition = battleNotices.condition, realDismiss = battleNotices.dismiss;
battleNotices.condition = (options) => pageLane.condition(options);
battleNotices.dismiss = (id) => pageLane.dismiss(id);

/** One HUD through a battle's first frames with a strike over `player`; what it raised in the page's lane and its events. */
function runHud(hudView, player) {
  const from = pageLane.calls.length;
  const bus = createBus(), events = [];
  bus.on(BATTLE_EVENT, (event) => events.push(event));
  const hud = initHud(bus, hudView);
  bus.emit('ui:battleStart', { playerId: player.id, specId: SPEC, mapId: 'steppe' });
  hud.setMode('battle');
  bus.emit('phase:change', { phase: 'battle' });
  let timeS = 10;
  for (let i = 0; i < 4; i++) {
    timeS += 1 / 60;
    hud.update({ timeS, mode: 'battle', player, tanks, spotting, aim, camera: null,
      matchModeState: { id: 'air_support', perspectiveTeam: 'alpha', air: view(timeS, [strike()]) } });
  }
  bus.emit('ui:aircraftDowned', { kind: 'strafe' });
  const raised = pageLane.calls.slice(from).filter((call) => call.op === 'condition');
  return { incoming: raised.filter((call) => call.id === INCOMING_NOTICE), down: raised.filter((call) => call.id === DOWN_NOTICE), events };
}
try {
  const pane = runHud({ mount: globalThis.document.body, own: 'frame' }, seat2);
  assert.equal(pane.incoming.length, 0, "a couch pane's HUD raises no INCOMING condition in the page's lane");
  assert.equal(pane.down.length, 0, "nor its seat's shoot-down");
  assert.equal(pane.events.length, 0, 'and no event for it');
  const page = runHud(null, seat1);
  assert.equal(page.incoming.length, 1, "the page's HUD raises the INCOMING condition");
  assert.equal(page.incoming[0].priority, NOTICE_PRIORITY.threat);
  assert.equal(page.down.length, 1, "and its crew's shoot-down");
} finally {
  battleNotices.condition = realCondition;
  battleNotices.dismiss = realDismiss;
}

console.log('airSupportNotices.selftest: the air lane: INCOMING a threat-rung plate updated in place and taken down after its '
  + 'danger; the crew\'s call-in one plate from its refusal or order to its run\'s countdown; a shoot-down a timed plate; no '
  + 'event; through the real HUD the page raises them and a couch pane raises none: PASS');
