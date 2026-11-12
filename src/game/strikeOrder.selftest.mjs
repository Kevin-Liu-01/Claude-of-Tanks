// The strike order (air-support-runs-272; owner 2026-11-11: "sometimes in air support u cant order airstrikes and stuff
// even though its been called"). The crew's real order path end to end, on one bus: the action owner
// (game/playerBattleActions.ts) takes the press, the solo step (game/state.ts simStep) takes the call into the real mode
// controller, and the authority's verdict (mode:strike_called, mode:strike_denied) comes back on the same bus.
//
// Each sequence is one the base let stick:
//   A. a late call in one battle, then a call in the next battle on the same page: the strike view's lock was a
//      module singleton on the battle clock, never reset, so the next battle's presses were dropped (no bit, no sound)
//      and the plate read CALLED until the new clock passed the old battle's time;
//   B. the side's one AC-130 is up (a bot teammate's): the HUD's readiness was its own copy of the sim's refusal and
//      missed the gunship cap, so the plate said CALLED and the authority refused in silence;
//   C. a call the authority refuses for a reason the viewer could not see yet (a teammate's call filled the air in
//      the same step): the refusal never reached the order, so it read CALLED and held the lock;
//   D. an accepted call reads CALLED from the authority's acceptance, holds the reticle, then lowers the binoculars.
// The plate's state is read through the same seam on the base and after the fix: `ui:strikeCalled` (the plate turns
// CALLED) and `ui:strikeDenied` (the plate names the refusal), and on the base its readiness as the base HUD wrote it.
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import '../vehicles/tankFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { createTankState } from '../sim/movement.ts';
import { createBus, createGameState, simStep } from './state.ts';
import { AIR_STRIKE_KINDS, AIR_SUPPORT_RULES as R, matchRulesetFor } from '../sim/matchRuleset.ts';
import { createMatchModeController } from '../sim/matchModes.ts';
import { AIR_STRIKE_BITS } from '../sim/playerActions.ts';
import { createPlayerBattleActions } from './playerBattleActions.ts';
import { strikeView } from './strikeViewState.ts';

// after the fix the order has one owner (game/strikeOrder.ts) and the readiness is one shared rule (sim/strikeCall.ts,
// the action owner's port as main.ts hands it); on the base it was the HUD's own blocker()
const order = await import('./strikeOrder.ts').catch(() => null);
const call = await import('../sim/strikeCall.ts').catch(() => null);

const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
const collider = { setSelf() {}, collide: () => false, pendingCrush: [], pendingRams: [], queueRam() {} };
function tank(id, team, z, isPlayer) {
  const spec = getSpec('m1a1_abrams_hc'), combat = createCombatState(spec);
  combat.equipMults = {};
  const input = { throttle: 0, steer: 0, brake: true, fire: false, shellSlot: 0, aimYaw: 0, aimPitch: 0, aimDistance: 100, actionBits: 0,
    aimPoint: new Vector3(0, 0, 0), auxiliaryBits: 0 };
  return { id, specId: spec.id, spec, isPlayer, bot: !isPlayer, team, combat, input, state: createTankState(spec, new Vector3(0, 0, z), 0),
    visual: { root: new Group(), gunMuzzleWorld: (out) => out.set(0, 3, z + 4), gunDirWorld: (out) => out.set(0, 0, 1), recoilKick() {} } };
}

// the page's one game object and one bus (main.ts mutates the game in place from battle to battle)
const game = createGameState();
const log = [];
const bus = createBus((name, payload) => log.push({ name, timeS: game.timeS, payload }));
let pilot, ally, enemy;
function startBattle(atS) {
  game.ruleset = matchRulesetFor('air_support');
  pilot = tank('pilot', 'player', -200, true); ally = tank('ally', 'player', -210, false); enemy = tank('e1', 'enemy', 150, false);
  // the other crews are driven by nobody here: their calls are the sequences' own, never a bot's of its own choosing
  ally.bot = false; enemy.bot = false;
  game.tanks = [pilot, ally, enemy]; game.allTanks = game.tanks; game.player = pilot;
  game.tankById.clear();
  for (const t of game.tanks) game.tankById.set(t.id, t);
  game.timeS = atS;
  game.result = null;
  game.phase = 'battle';
  game.matchModeController = createMatchModeController({ mode: 'air_support', entities: game.tanks, seed: 3, ruleset: game.ruleset,
    revive() {}, terrainHeight: () => 0, emit: (type, payload) => game.modeEvents.push({ type, payload }) });
  game.matchModeState = game.matchModeController.serialize('pilot');
  const air = game.matchModeController.airSupport;
  const saved = air.capture(); saved.points = [['pilot', R.points.cap], ['ally', R.points.cap], ['e1', 0]]; air.restore(saved);
  // (soloBattleStartRuntime.ts: a battle's start resets the tray's own state)
  actions.resetConsumables();
  return air;
}
const step = (n = 1) => {
  for (let i = 0; i < n; i++) {
    // the bots hold still and call nothing of their own here (their calls are the sequences' own)
    ally.input.auxiliaryBits = 0; enemy.input.auxiliaryBits = 0;
    simStep(game, bus, { heightField: flat, raycast: () => null }, null, collider);
    pilot.state.pos.set(0, 0, -200); ally.state.pos.set(0, 0, -210); enemy.state.pos.set(0, 0, 150);
    hudFrame();
  }
};

/** The base HUD's frame (ui/airSupportHud.ts update): it wrote strikeView.ready from its own blocker(). */
function hudFrame() {
  const air = game.matchModeState?.air;
  const aim = pilot.input.aimPoint, hull = pilot.state.pos;
  const rangeM = Math.hypot(aim.x - hull.x, aim.z - hull.z);
  strikeView.x = aim.x; strikeView.y = aim.y; strikeView.z = aim.z;
  if (rangeM > 1) strikeView.heading = Math.atan2(aim.x - hull.x, aim.z - hull.z);
  if (order || !air) return;
  const why = (air.points ?? 0) < R[strikeView.kind].cost ? 'points' : (air.cooldowns?.[strikeView.kind] ?? 0) > 0 ? 'cooldown'
    : air.teamAirFull ? 'air' : rangeM > R.callRangeM ? 'range' : null;
  strikeView.ready = !why;
}

const input = (() => {
  const handlers = new Map();
  return {
    onAction(action, listener) { let group = handlers.get(action); if (!group) handlers.set(action, group = new Set()); group.add(listener); return () => group.delete(listener); },
    press(action, code = 'KeyX') { for (const listener of handlers.get(action) || []) listener(code); },
  };
})();
const actions = createPlayerBattleActions({
  game, bus, input,
  rules: { rulesetUnlimitedFor: () => false, hasAmmunition: () => true, shellAmmunitionCapacity: () => 1 },
  strikes: { kinds: AIR_STRIKE_KINDS, bit: (kind) => AIR_STRIKE_BITS[kind],
    ...(call ? { blocker: (air, kind, rangeM) => call.strikeCallBlocker(R, air, kind, rangeM) } : {}) },
  isSettingsOpen: () => false,
  network: { isActive: () => false, queueConsumable() {}, queueAction() {} },
});

/** Raise the binoculars, pick `kind`, aim at (x, z) and press the trigger; the log from the press on. */
function press(kind, x, z) {
  pilot.input.aimPoint.set(x, 0, z);
  hudFrame();
  if (!strikeView.open) bus.emit('ui:strikeViewToggle', {});
  bus.emit('ui:strikePick', { kind });
  hudFrame();
  const from = log.length;
  input.press('fire');
  return from;
}
const since = (from, name, pred = () => true) => log.slice(from).filter((e) => e.name === name && pred(e.payload));
const mine = (e) => e.callerId === 'pilot' || e.id === 'pilot';
const lower = () => { if (strikeView.open) bus.emit('ui:strikeViewClose', {}); };

const verdicts = [];
function check(label, fn) {
  try { fn(); verdicts.push(`ok   ${label}`); }
  catch (error) { verdicts.push(`FAIL ${label}: ${error.message.split('\n')[0]}`); }
}

// ---- B. the side's one AC-130 is up (a bot teammate's): the press is refused at the plate, never "called" in silence
// (each sequence's battle starts past every earlier lock, so on the base it fails for its own cause, not A's)
let air = startBattle(0);
step(10);
assert.ok(air.requestStrike('ally', 'gunship', 0, 100, game.timeS), `the teammate's AC-130 is up (${JSON.stringify(game.modeEvents.at(-1))})`);
step(2);
let from = press('gunship', 0, 130);
step(4);
check('B  a call the authority will refuse never reads CALLED', () => {
  assert.equal(since(from, 'mode:strike_called', mine).length, 0, 'no second AC-130 (the side\'s cap)');
  assert.equal(since(from, 'ui:strikeCalled').length, 0, 'the plate said CALLED for a call nobody took');
  const denied = since(from, 'ui:strikeDenied');
  assert.ok(denied.length >= 1 && denied.at(-1).payload.reason === 'GUNSHIP_UP',
    `the plate names why (${JSON.stringify(denied.map((e) => e.payload))})`);
});
step(60);
lower();

// ---- C. the authority refuses a call the viewer saw as ready (the air filled in the same step)
air = startBattle(10);
step(10);
from = press('strafe', 0, 100);
// a teammate's two calls land in the step that takes the press (the side's air cap is two)
air.requestStrike('ally', 'recon', 0, 300, game.timeS);
air.requestStrike('ally', 'artillery', 50, 300, game.timeS);
step(4);
check('C  an authority refusal reaches the plate and frees the trigger', () => {
  assert.equal(since(from, 'mode:strike_denied', mine).length, 1, 'the authority refused it (AIR_FULL)');
  assert.equal(since(from, 'ui:strikeCalled').length, 0, 'the plate said CALLED for a refused call');
  if (order) {
    const state = strikeView.order.read(game.timeS);
    assert.equal(state.phase, 'denied', `the order reads the refusal (${state.phase})`);
    assert.equal(state.reason, 'AIR_FULL');
  } else {
    assert.fail('the base has no order state: the refusal is heard (ui_error) but the plate holds CALLED');
  }
});
step(60);
lower();

// ---- D. an accepted call: CALLED from the acceptance, the lock, then the binoculars come down
startBattle(20);
step(10);
from = press('strafe', 0, 100);
step(2);
check('D  an accepted call reads CALLED after the authority took it, then lowers', () => {
  const called = since(from, 'mode:strike_called', mine);
  assert.equal(called.length, 1, 'the strafe was called');
  const plate = since(from, 'ui:strikeCalled');
  assert.equal(plate.length, 1, 'the plate turned CALLED once');
  if (!order) assert.fail('the base turns CALLED at the press, before the authority has taken it');
  assert.ok(log.indexOf(plate[0]) > log.indexOf(called[0]), 'the plate turned CALLED after the authority took the call');
  assert.equal(strikeView.order.read(game.timeS).phase, 'called');
  step(60);
  assert.equal(strikeView.order.read(game.timeS).phase, 'idle', 'the lock ends');
});
// a second press of the same kind is refused at the plate by the cooldown the sim's ledger reports
from = press('strafe', 0, 100);
step(2);
check('D2 the cooldown is the ledger\'s and is named', () => {
  assert.equal(since(from, 'mode:strike_called', mine).length, 0);
  const denied = since(from, 'ui:strikeDenied');
  assert.ok(denied.length === 1 && denied[0].payload.reason === 'COOLDOWN', JSON.stringify(denied.map((e) => e.payload)));
});

// ---- A. a late call in one battle, then a call in the next battle on the same page
startBattle(600);
step(10);
from = press('bomb', 0, 120);
step(2);
check('A0 a call late in a long session is taken', () => {
  assert.equal(since(from, 'mode:strike_called', mine).length, 1, 'the bomb was called');
});
step(60 * 2);
lower();
startBattle(0);
step(60 * 5);
from = press('artillery', 0, 100);
step(2);
check('A  the next battle on the same page takes its first call', () => {
  assert.equal(since(from, 'mode:strike_called', mine).length, 1,
    `the artillery was not called (the plate: ${since(from, 'ui:strikeCalled').length ? 'CALLED' : 'silent'}; ${since(from, 'ui:strikeDenied').length} denials)`);
});
step(60 * 2);
lower();

// ---- E. the order's own clock (game/strikeOrder.ts): a verdict that never comes, and a clock that goes back
check('E  a lost verdict frees the trigger; a clock going back clears the order', () => {
  if (!order) assert.fail('the base has no order: its lock outlived the battle');
  const o = order.createStrikeOrder();
  assert.equal(o.press(10, 'bomb', null), 'sent');
  assert.equal(o.press(10.5, 'bomb', null), 'busy', 'a second press while one is under way is not sent twice');
  assert.equal(o.read(10 + order.STRIKE_SENT_TIMEOUT_S + 0.01).phase, 'denied', 'no verdict: the call is lost, not CALLED');
  assert.equal(o.read(10 + order.STRIKE_SENT_TIMEOUT_S + order.STRIKE_DENIED_S + 0.1).phase, 'idle');
  assert.equal(o.press(20, 'bomb', null), 'sent');
  assert.ok(o.accepted(20.1, 'bomb', 7));
  assert.equal(o.read(5).phase, 'idle', 'a new battle\'s clock (5 s) clears the last battle\'s lock (20 s)');
  assert.equal(o.press(5, 'recon', null), 'sent', 'and the first press of the new battle is sent');
  assert.equal(o.refused(5.1, 'bomb', 'POINTS'), false, 'a verdict for another kind does not answer it');
});
console.log(verdicts.join('\n'));
const failed = verdicts.filter((line) => line.startsWith('FAIL'));
assert.equal(failed.length, 0, `${failed.length} of ${verdicts.length} order sequences stuck`);
console.log(`strikeOrder: ${verdicts.length} order sequences, each called or refused with its reason`);
