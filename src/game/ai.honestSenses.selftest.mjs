// What a bot may act on (gameplay-modes-228 round 2; the critic's E5/E6 mutations survived the round-1 receipts): an honest
// side (searchRouting 'spotted') kites only from a hull its team has spotted; a rusher's no-ram lane brakes only for a hull
// its team sees (braking for a hidden one acted on knowledge it does not have and gave the bush away); a zone holder's
// sortie never chases an attacker its team no longer spots. Each scenario runs its control too, so the pin is the guard.
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { CLASSIC_BOT_DOCTRINE, matchRulesetFor, rulesetBotDoctrine } from '../sim/matchRuleset.ts';
import { createAI, mulberry32, roleOf } from './ai.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const field = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
function tank(id, specId, team, x, z, yaw = 0) {
  const spec = getSpec(specId);
  return { id, specId: spec.id, spec, team, modeActive: true, state: createTankState(spec, new Vector3(x, 0, z), yaw),
    combat: { hp: spec.hp, maxHp: spec.hp, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 } };
}
function run(bot, enemies, { doctrine, spotted, objective = null, seconds = 8, each = null }) {
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(3), doctrine: () => doctrine, deps: {
    heightField: field, raycast: () => null, getEnemies: () => enemies, getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: (id) => spotted(id) }, getObjective: () => objective,
  } });
  bot.aiCtl = ctl;
  for (let i = 0; i < seconds / SIM_DT; i++) {
    const t = 1 + i * SIM_DT;
    ctl.update(SIM_DT, t);
    updateTank(bot, field, SIM_DT, null);
    for (const e of enemies) updateTank(e, field, SIM_DT, null);
    each?.(t, ctl);
  }
  return ctl;
}

console.log('[1] the scout kite: from a spotted hull only, under the honest routing');
{
  const scoutId = ['ajax', 'cv90', 'm551_sheridan', 'bmp3'].find((id) => { try { return roleOf(getSpec(id)) === 'scout'; } catch { return false; } });
  const kites = (routing, hiddenSpotted) => {
    const bot = tank('scout', scoutId, 'alpha', 0, 0);
    const far = tank('far', 'm1a1_abrams_hc', 'bravo', 0, 260, Math.PI);
    const near = tank('near', 'm1a1_abrams_hc', 'bravo', 45, -40, 0);
    let kiting = 0;
    run(bot, [far, near], { doctrine: { ...CLASSIC_BOT_DOCTRINE, openingRead: false, searchRouting: routing },
      spotted: (id) => id === 'far' || (hiddenSpotted && id === 'near'), seconds: 10,
      each: (t, ctl) => { if (ctl.debugInfo().kiting) kiting++; } });
    return kiting;
  };
  ok(!!scoutId, `a scout hull (${scoutId})`);
  const control = kites('live', false);
  const honest = kites('spotted', false);
  const seen = kites('spotted', true);
  ok(control > 0, `the live routing kites from the near hull it cannot see (${control} ticks): the scenario reaches the kite`);
  ok(seen > 0, `the honest routing kites from a near hull its team spots (${seen} ticks)`);
  ok(honest === 0, `the honest routing never kites from a hidden near hull (${honest} ticks)`);
}

console.log('[2] the rusher\'s no-ram lane: a hull its team sees, never a hidden one');
{
  const rush = rulesetBotDoctrine(matchRulesetFor('endless_horde'), 'bravo');
  const holdOffs = (visible) => {
    const bot = tank('zombie', 'm1a1_abrams_hc', 'bravo', 0, 0, 0);
    bot.state.speed = 12;
    const hull = tank('survivor', 'm1a1_abrams_hc', 'alpha', 0, 22, 0);
    const ctl = run(bot, [hull], { doctrine: rush, spotted: () => visible, seconds: 1.5,
      objective: { x: 0, z: 300, radiusM: 12, mission: 'hunt' } });
    return ctl.debugInfo().ramHoldOffs;
  };
  const seen = holdOffs(true), hidden = holdOffs(false);
  ok(seen > 0, `a seen hull 22 m ahead holds the rusher off (${seen} ticks)`);
  ok(hidden === 0, `a hidden hull ahead is not braked for (${hidden} ticks)`);
}

console.log('[3] the zone sortie: never at an attacker the team no longer spots');
{
  const defender = rulesetBotDoctrine(matchRulesetFor('frontline_assault'), 'bravo');
  const closes = (staysSpotted) => {
    const bot = tank('def', 'm1a1_abrams_hc', 'bravo', 0, 0, Math.PI);
    const attacker = tank('atk', 'm1a1_abrams_hc', 'alpha', 0, -95, 0);
    let start = null, end = null;
    run(bot, [attacker], { doctrine: defender, seconds: 9,
      spotted: (id) => id === 'atk' && (staysSpotted || false),
      objective: { x: 0, z: 0, radiusM: 30, mission: 'assault' },
      each: (t) => {
        const d = Math.hypot(bot.state.pos.x - attacker.state.pos.x, bot.state.pos.z - attacker.state.pos.z);
        if (t >= 3 && start == null) start = d;
        end = d;
      } });
    return start - end;
  };
  // the sortie's target is claimed while spotted; the scenario then hides it (the controller keeps a lost target in memory)
  const spottedThenHidden = (() => {
    const bot = tank('def', 'm1a1_abrams_hc', 'bravo', 0, 0, Math.PI);
    const attacker = tank('atk', 'm1a1_abrams_hc', 'alpha', 0, -95, 0);
    let start = null, end = null;
    run(bot, [attacker], { doctrine: defender, seconds: 10,
      spotted: (id) => id === 'atk' && hiddenAfter == null,
      objective: { x: 0, z: 0, radiusM: 30, mission: 'assault' },
      each: (t, ctl) => {
        if (hiddenAfter == null && ctl.debugInfo().targetId === 'atk' && t > 2) hiddenAfter = t;
        const d = Math.hypot(bot.state.pos.x - attacker.state.pos.x, bot.state.pos.z - attacker.state.pos.z);
        if (hiddenAfter != null && start == null) start = d;
        end = d;
      } });
    return { gained: start == null ? null : start - end, hiddenAfter };
  });
  var hiddenAfter = null;
  const seen = closes(true);
  const hidden = spottedThenHidden();
  ok(seen > 10, `a spotted attacker 65 m off the zone's edge draws the sortie (${seen.toFixed(1)} m closed)`);
  ok(hidden.hiddenAfter != null, `the defender claimed the attacker before it was hidden (at ${hidden.hiddenAfter?.toFixed(1)} s)`);
  ok(hidden.gained != null && hidden.gained < 5, `once hidden, no sortie drives at it (${hidden.gained?.toFixed(1)} m closed after)`);
}

if (failures) { console.error(`ai.honestSenses.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.honestSenses.selftest: the honest kite, the no-ram lane and the sortie act only on what the team spots');
