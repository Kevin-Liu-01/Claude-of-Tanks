// 2026-11-02 audit M7: what reaches a bot between two updates (gunshots heard, its own shell results, hits on its
// team, a commander's order) is queued and applied in one declared order: by the drivers' flush (ai.newsFlush.selftest
// pins where), or, for a controller stepped alone as here, at the top of its next update. The
// integrations call these callbacks in their own orders (the solo step and the authority loop and filter differently;
// a commander's answer lands whenever it arrives), and each one changed the mode, started flanks or hit reactions and
// drew from the bot's seeded stream on the spot, so the same step told in another order made another bot. Reproduced
// on the lane base: two unseen guns firing and hitting in one step, told in the reverse order, left a different
// suspect, reaction and drive. Pins: the reverse telling now gives the identical bot, tick for tick; the events wait
// for the next update (nothing applies between ticks) and land before that tick's decisions.
// Round 2 (U17, Q8): the order was not total. Events of one kind from one hull (two shell results on one target, two
// hits from one gun) still applied in the order they were told: on 50197fdf43 [nonpen, nonpen, pen] on the target ended
// in a flank and [nonpen, pen, nonpen] in engage. Pins: [3] such events, told in any order, make the same bot.
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createAI, mulberry32 } from './ai.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const field = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
function tank(id, specId, team, x, z, yaw = 0) {
  const spec = getSpec(specId);
  return { id, specId: spec.id, spec, team, state: createTankState(spec, new Vector3(x, 0, z), yaw),
    combat: { hp: 1000, maxHp: 1000, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
    aiCtl: null };
}
function scene(spotted) {
  const bot = tank('bot', 't90am', 'alpha', 0, 0);
  const left = tank('a-left', 'm1a1_abrams_hc', 'bravo', -110, 120, Math.PI);
  const right = tank('b-right', 'm1a1_abrams_hc', 'bravo', 120, 90, Math.PI);
  const enemies = [left, right];
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(57), deps: {
    heightField: field, raycast: () => null, getEnemies: () => enemies, getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: (id) => spotted.has(id) },
  } });
  let t = 1;
  const trace = [];
  const run = (seconds) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      ctl.update(SIM_DT, t);
      const d = ctl.debugInfo(), input = bot.input;
      trace.push([input.throttle, input.steer, input.fire, input.aimPoint.x, input.aimPoint.z, d.mode, d.targetId,
        d.suspectId, d.reaction, d.reactions, d.lastSeenX, d.lastSeenZ, d.driveOwner].join('|'));
      updateTank(bot, field, SIM_DT, null);
    }
  };
  return { ctl, run, trace, left, right, bot };
}
// one step's news: both guns fired and both shells struck this hull, then a commander's hold order
function tell(s, reverse) {
  const news = [
    () => s.ctl.notifyEnemyFired(s.left),
    () => s.ctl.notifyEnemyFired(s.right),
    () => s.ctl.notifyUnderFire(s.left, { selfHit: true, damaging: true, kind: 'pen' }),
    () => s.ctl.notifyUnderFire(s.right, { selfHit: true, damaging: false, kind: 'nonpen' }),
    () => s.ctl.notifyUnderFire(s.right, { selfHit: false, damaging: true, kind: 'pen' }),
    () => s.ctl.setOrder({ posture: 'hold', targetId: null, fire: null, threat: 1, point: null, untilS: 40 }),
  ];
  if (reverse) news.reverse();
  for (const item of news) item();
}

console.log('[1] the same step told in the reverse order makes the same bot');
for (const spotted of [new Set(), new Set(['a-left', 'b-right'])]) {
  const a = scene(spotted), b = scene(spotted);
  a.run(1); b.run(1);
  tell(a, false); tell(b, true);
  a.run(4); b.run(4);
  let first = -1;
  for (let i = 0; i < a.trace.length && first < 0; i++) if (a.trace[i] !== b.trace[i]) first = i;
  const da = a.ctl.debugInfo(), db = b.ctl.debugInfo();
  ok(first < 0, `${spotted.size ? 'both guns spotted' : 'both guns unseen'}: identical for ${a.trace.length} ticks`
    + (first < 0 ? '' : ` (first difference at tick ${first}: suspect ${da.suspectId}/${db.suspectId}, reaction ${da.reaction}/${db.reaction})`));
  ok(da.reactions >= 1 && da.ordersTaken === 1, `the news was taken (reactions ${da.reactions}, orders ${da.ordersTaken})`);
}

console.log('[2] with no flush, news waits for the next update and lands before that tick\'s decisions');
{
  const s = scene(new Set(['a-left', 'b-right']));
  s.run(0.1);
  ok(s.ctl.targetId === null, 'no target claimed yet');
  s.ctl.notifyUnderFire(s.right, { selfHit: true, damaging: true, kind: 'pen' });
  ok(s.ctl.debugInfo().pendingEvents === 1 && s.ctl.targetId === null && s.ctl.debugInfo().reactions === 0,
    'between ticks the hit is queued: no claim, no reaction yet');
  s.run(SIM_DT);
  const info = s.ctl.debugInfo();
  ok(info.pendingEvents === 0 && s.ctl.targetId === 'b-right', `the next update claims the shooter (${s.ctl.targetId})`);
  ok(info.reactions === 1 && info.driveOwner === 'reaction', `and the struck hull reacts that same tick (${info.reaction}, owner ${info.driveOwner})`);
}

console.log('[3] one hull\'s events of one kind, told in another order, make the same bot');
{
  const spotted = new Set(['a-left', 'b-right']);
  const orders = {
    // three results of this bot's rounds on its target: two non-penetrations start a flank wherever the penetration falls
    results: [['nonpen', 'nonpen', 'pen'], ['nonpen', 'pen', 'nonpen'], ['pen', 'nonpen', 'nonpen']],
    // two rounds of one gun strike this hull, low on hit points and reloading: one bites (a backoff), one glances off (a jink)
    hits: [[['pen', true], ['ricochet', false]], [['ricochet', false], ['pen', true]]],
  };
  for (const [name, tellings] of Object.entries(orders)) {
    const runs = tellings.map((telling) => {
      const s = scene(spotted);
      if (name === 'hits') s.bot.combat.hp = 350;
      for (let i = 0; i < 100 && s.ctl.targetId === null; i++) s.run(0.1); // the reaction time, then a target
      const targetId = s.ctl.targetId;
      if (name === 'hits') s.bot.combat.reload.t = 3;
      for (const item of telling) {
        if (name === 'results') s.ctl.notifyShellResult({ targetId, kind: item });
        else s.ctl.notifyUnderFire(s.right, { selfHit: true, damaging: item[1], kind: item[0] });
      }
      s.run(3);
      return { s, targetId, info: s.ctl.debugInfo() };
    });
    const [first, ...rest] = runs;
    ok(first.targetId !== null, `${name}: the bot has a target before the news (${first.targetId})`);
    for (let r = 0; r < rest.length; r++) {
      let diverged = -1;
      for (let i = 0; i < first.s.trace.length && diverged < 0; i++) if (first.s.trace[i] !== rest[r].s.trace[i]) diverged = i;
      ok(diverged < 0, `${name}: [${tellings[r + 1].join(' ')}] makes the bot [${tellings[0].join(' ')}] makes`
        + (diverged < 0 ? ` (identical for ${first.s.trace.length} ticks, mode ${first.info.mode})`
          : ` (first difference at tick ${diverged} of ${first.s.trace.length}: ${first.s.trace[diverged]} / ${rest[r].s.trace[diverged]})`));
    }
  }
}

if (failures) { console.error(`ai.eventOrder.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.eventOrder.selftest: between-tick news lands at the next update in one declared order');
