// airSupportNotices.selftest.mjs — Air Support's three battle notices on notices-audit-275's two lanes (air-support-275):
// - INCOMING (a strike whose footprint covers the crew): a condition (battleNotices.ts) at NOTICE_PRIORITY.threat, its
//   countdown updated in place only when its whole seconds change, taken down when the danger has passed;
// - a refused call-in and an aircraft the crew brought down: events (battleNoticeEvents.ts BATTLE_EVENT) at
//   NOTICE_PRIORITY.answered, "line · call-in", on the HUD's own bus;
// - the condition lane is the page's: driven through the real battle HUD (initHud) over the recording DOM, the page's HUD
//   raises the INCOMING condition and a couch pane's HUD (view.own 'frame', couchPaneViews.ts) raises none, while the
//   pane still hears its own seat's events on its own bus.
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
import { BATTLE_EVENT } from './battleNoticeEvents.ts';
import { createAirSupportHud, INCOMING_NOTICE } from './airSupportHud.ts';
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

  // the events: a refused call-in and an aircraft brought down, "line · call-in", at the answered rung, on this bus
  bus.emit('ui:strikeRefusal', { kind: 'missile', reason: 'POINTS' });
  bus.emit('ui:aircraftDowned', { kind: 'bomb' });
  bus.emit('ui:strikeRefusal', { kind: 'nonsense', reason: 'POINTS' });
  assert.deepEqual(events.map((event) => [event.text, event.priority, event.severity]), [
    [`${t('airSupport.state.points')} · ${t('airSupport.kind.missile')}`, NOTICE_PRIORITY.answered, 'warning'],
    [`${t('airSupport.downed')} · ${t('airSupport.kind.bomb')}`, NOTICE_PRIORITY.answered, 'success'],
  ], 'a refusal and a shoot-down are answered events; an unknown call-in raises nothing');
  assert.ok(events.every((event) => typeof event.icon === 'string'), 'each with its call-in\'s glyph');
  assert.ok(port.calls.every((call) => call.id === INCOMING_NOTICE), 'the events never touch the condition lane');
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
  return { incoming: pageLane.calls.slice(from).filter((call) => call.id === INCOMING_NOTICE && call.op === 'condition'), events };
}
try {
  const pane = runHud({ mount: globalThis.document.body, own: 'frame' }, seat2);
  assert.equal(pane.incoming.length, 0, "a couch pane's HUD raises no INCOMING condition in the page's lane");
  assert.equal(pane.events.length, 1, "the pane's seat still hears its own shoot-down on its own bus");
  const page = runHud(null, seat1);
  assert.equal(page.incoming.length, 1, "the page's HUD raises the INCOMING condition");
  assert.equal(page.incoming[0].priority, NOTICE_PRIORITY.threat);
} finally {
  battleNotices.condition = realCondition;
  battleNotices.dismiss = realDismiss;
}

console.log('airSupportNotices.selftest: INCOMING is a threat-rung condition updated in place and taken down after its danger; '
  + 'a refused call-in and a shoot-down are answered events on the HUD\'s bus; through the real HUD the page raises the '
  + 'condition and a couch pane raises none: PASS');
