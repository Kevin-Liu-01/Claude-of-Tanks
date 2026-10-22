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

console.log('[4] the no-ram rule: a rusher never drives its hull into another hull (round 3, the critic\'s E-R2-2)');
{
  // footprints as oriented rectangles (an independent separating-axis test), and the rusher's own speed toward the other
  const corners = (e) => {
    const l = (e.spec.dims.hullLengthM || e.spec.dims.lengthM || 6) / 2, w = (e.spec.dims.widthM || 3) / 2;
    const fx = Math.sin(e.state.yaw), fz = Math.cos(e.state.yaw);
    return [[l, w], [l, -w], [-l, -w], [-l, w]].map(([a, b]) => [e.state.pos.x + fx * a + fz * b, e.state.pos.z + fz * a - fx * b]);
  };
  const overlap = (a, b) => {
    const ca = corners(a), cb = corners(b);
    for (const poly of [ca, cb]) for (let i = 0; i < 4; i++) {
      const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % 4], nx = z1 - z0, nz = x0 - x1;
      const pa = ca.map(([x, z]) => x * nx + z * nz), pb = cb.map(([x, z]) => x * nx + z * nz);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
    return true;
  };
  const closing = (h, o) => {
    const dx = o.state.pos.x - h.state.pos.x, dz = o.state.pos.z - h.state.pos.z, d = Math.hypot(dx, dz) || 1;
    return (Math.sin(h.state.yaw) * dx + Math.cos(h.state.yaw) * dz) / d * h.state.speed;
  };
  const rush = rulesetBotDoctrine(matchRulesetFor('endless_horde'), 'bravo');
  const scenarios = [
    // a hull broadside in the lane, the hunt point beyond it
    { label: 'a seen enemy hull broadside 30 m ahead', other: () => tank('in-lane', 'm1a1_abrams_hc', 'alpha', 0, 30, Math.PI / 2), enemy: true },
    // an enemy hull crossing the lane at 7 m/s
    { label: 'an enemy hull crossing the lane', other: () => { const t = tank('crosser', 'm1a1_abrams_hc', 'alpha', -28, 34, Math.PI / 2); t.state.speed = 7; t.input.throttle = 0.6; return t; }, enemy: true },
    // a friend of the pack stopped in the lane (a fodder hull dies to a friend's bump as to an enemy's)
    // the orbit round its quarry runs into the quarry's neighbours, standing on the ring either side of it
    { label: 'the orbit past the quarry\'s neighbours on its ring', other: () => tank('quarry', 'm1a1_abrams_hc', 'alpha', 0, 34, Math.PI),
      extra: () => [tank('left', 'm1a1_abrams_hc', 'alpha', -27, 30, 0), tank('right', 'm1a1_abrams_hc', 'alpha', 27, 30, 0)], enemy: true },
    // (the pack's own hulls are the ally avoidance's, which yields: no contact, and the rolling is not asked of it)
    { label: 'a stopped friend of the pack 26 m ahead', other: () => tank('friend', 'm1a1_abrams_hc', 'bravo', 0, 26, Math.PI / 2), enemy: false, yields: true },
  ];
  for (const sc of scenarios) {
    const bot = tank('rusher', 'm1a1_abrams_hc', 'bravo', 0, 0, 0);
    bot.state.speed = 11;
    const other = sc.other(), extra = sc.extra?.() ?? [], hulls = [other, ...extra];
    let rams = 0, minGap = Infinity, moving = 0, ticks = 0;
    const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(5), doctrine: () => rush, deps: {
      heightField: field, raycast: () => null, getEnemies: () => (sc.enemy ? hulls : []), getAllies: () => (sc.enemy ? [] : hulls),
      getObstacles: () => [], spotting: { isSpotted: () => true }, getObjective: () => ({ x: 0, z: 220, radiusM: 12, mission: 'hunt' }),
    } });
    for (let i = 0; i < 7 / SIM_DT; i++) {
      ctl.update(SIM_DT, 1 + i * SIM_DT);
      updateTank(bot, field, SIM_DT, null);
      for (const h of hulls) {
        updateTank(h, field, SIM_DT, null);
        minGap = Math.min(minGap, Math.hypot(bot.state.pos.x - h.state.pos.x, bot.state.pos.z - h.state.pos.z));
        if (overlap(bot, h) && closing(bot, h) > 1) rams++;
      }
      ticks++; if (Math.abs(bot.state.speed) > 0.75) moving++;
    }
    ok(rams === 0, `${sc.label}: no contact while driving into it (${rams} ticks; closest ${minGap.toFixed(1)} m between centres)`);
    if (!sc.yields) ok(moving / ticks > 0.8, `${sc.label}: the rusher keeps rolling, round it or on (moving ${(100 * moving / ticks).toFixed(0)} % of the time)`);
  }
}

if (failures) { console.error(`ai.honestSenses.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.honestSenses.selftest: the honest kite, the no-ram lane and the sortie act only on what the team spots');
