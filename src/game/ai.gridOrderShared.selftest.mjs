// The bots' grid-order check, one walk a list (battle-spikes-253; docs/PERF-SPIKES.md "The bots' first step"): each
// controller's first box query asks whether the obstacle grid's order is the list's, a Map read a solid. Every bot used
// to walk the whole list for that answer, so a battle's first step walked it once a bot (the rollout's 33-42 ms step at
// 14 v 14 and 21 v 21). The answer is kept with the list (ai.ts gridOrderMatches): ten bots driving routes past a
// 3,000-solid list read the grid's slot map about once a solid, not ten times; and a new list is walked again.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, SIM_DT } from '../sim/movement.ts';
import { createObstacleGrid } from '../world/collision.ts';
import { createAI, mulberry32 } from './ai.ts';

const flat = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };

/** `count` small solids far east of the bots (their routes' boxes meet none of them). */
function solids(count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const x = 400 + (i % 60) * 6, z = -180 + Math.floor(i / 60) * 7;
    list.push({ min: [x, 0, z], max: [x + 2, 3, z + 2], kind: 'wall' });
  }
  return list;
}

/** The grid over `list`, its slot map's reads counted. */
function countedGrid(list) {
  const query = createObstacleGrid(list);
  const slotOf = query.rayOrder.slotOf;
  const read = slotOf.get.bind(slotOf);
  const counter = { reads: 0 };
  slotOf.get = (key) => { counter.reads++; return read(key); };
  return { query, counter };
}

function bots(count, list, query) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const spec = getSpec('m1a1_abrams_hc');
    const bot = {
      id: `b${i}`, specId: spec.id, spec, team: 'alpha', state: createTankState(spec, new Vector3(i * 12, 0, 0), 0),
      combat: { hp: spec.hp, maxHp: spec.hp, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
        modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
      input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
      aiCtl: null,
    };
    const ctl = createAI(bot, {
      difficulty: 'normal', rng: mulberry32(70 + i),
      deps: { heightField: flat, raycast: () => null, getEnemies: () => [], getAllies: () => [], getObstacles: () => list,
        queryObstacles: query, spotting: { isSpotted: () => true } },
    });
    ctl.setWaypoints([[i * 12, 200], [i * 12 + 50, 400]], { loop: false });
    bot.aiCtl = ctl;
    out.push(bot);
  }
  return out;
}

const list = solids(3000);
const { query, counter } = countedGrid(list);
const fleet = bots(10, list, query);
for (let tick = 0; tick < 30; tick++) for (const bot of fleet) bot.aiCtl.update(SIM_DT, 300 + tick * SIM_DT);
assert.ok(counter.reads >= list.length, `the list was checked against the grid (${counter.reads} reads)`);
assert.ok(counter.reads < list.length * 1.5, `ten bots read the grid's order about once a solid, not once a bot (${counter.reads} reads for ${list.length} solids)`);

// a new list (another battle's) is its own answer: walked again, once
const other = solids(1200);
const second = countedGrid(other);
const fleet2 = bots(6, other, second.query);
for (let tick = 0; tick < 30; tick++) for (const bot of fleet2) bot.aiCtl.update(SIM_DT, 300 + tick * SIM_DT);
assert.ok(second.counter.reads >= other.length && second.counter.reads < other.length * 1.5, `a new list walked once (${second.counter.reads} reads)`);
console.log(`ai.gridOrderShared.selftest: ten bots read a ${list.length}-solid list's grid order ${counter.reads} times (once a solid, not once a bot); a new list walked once PASS`);
