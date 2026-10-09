#!/usr/bin/env node
/**
 * Fixed-step determinism audit (lane mp/world-state-audit, 2026-10-01): the shared authority (`src/sim/authoritativeMatch.ts`,
 * the simulation the solo integration and the multiplayer host both step at SIM_DT) is run twice from the same seed with
 * the same scripted inputs on the map's collision shard (crushable trees, destructible props, shells, bots), and a hash
 * of every tank's pose and combat state, every shell, the destroyed-obstacle list and every emitted event is compared
 * every 60 ticks. Any wall-clock read or unseeded randomness in the authoritative step shows up as the first differing
 * tick. Node-only, no renderer.
 *
 *   node tools/sim-determinism-audit.mjs                 # verdant, 2 humans + 4 bots, 3600 ticks
 *   node tools/sim-determinism-audit.mjs --map=alpine --ticks=7200 --seed=11
 *   node tools/sim-determinism-audit.mjs --craters      # craters on, h2 firing HE at the ground (crater-render-spec §F)
 */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import '../src/vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { SIM_DT } from '../src/sim/movement.ts';
import { matchRulesetFor } from '../src/sim/matchRuleset.ts';
import { getSpec } from '../src/vehicles/specs.ts';
import { isHeClass } from '../src/sim/damage.ts';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';

const arg = (name, fallback) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };

function scriptedInput(index, tick, shellSlot = 0, aimPitch = 0.02) {
  const t = tick + index * 97;
  return {
    throttle: t > 120 ? (t % 1400 < 1100 ? 1 : 0.2) : 0,
    steer: Math.sin(t / 240) * 0.6,
    brake: false,
    fire: t % 240 === 0 && t > 200,
    fireIntentSeq: t % 240 === 0 && t > 200 ? Math.floor(t / 240) : null,
    aimLocked: false,
    shellSlot,
    actionBits: 0,
    aimYaw: Math.sin(t / 400) * 1.2,
    aimPitch,
    aimDistance: 300,
  };
}

const round = (value) => Math.round(value * 1000) / 1000;

function stateDigest(match, events) {
  const hash = createHash('sha256');
  for (const entity of match.entities) {
    const s = entity.state;
    const c = entity.combat;
    hash.update(`${entity.id}|${round(s.pos.x)},${round(s.pos.y)},${round(s.pos.z)}|${round(s.yaw)}|${round(s.speed)}|${round(s.turretYaw)}|${round(s.gunPitch)}|${round(c.hp)}|${c.destroyed ? 1 : 0}|${c.ammo?.join(',') ?? ''}|${round(c.reload?.t ?? 0)}|${c.fire?.burning ? 1 : 0}|${entity.kills}|${round(entity.damage)}\n`);
  }
  const snapshot = match.snapshot({ tick: 0, serverTimeMs: 0, viewerId: '__audit__', ackInputSeq: null });
  for (const shell of snapshot.shells) hash.update(`shell ${shell.id} ${shell.shooterId} ${shell.x} ${shell.y} ${shell.z} ${shell.vx} ${shell.vy} ${shell.vz}\n`);
  hash.update(`destroyed ${JSON.stringify(snapshot.meta.destroyedObstacleIndices)} rev ${snapshot.meta.destructibleRevision}\n`);
  // destruction (2026-10-07): the structures' log (stages, breaches, craters) is authoritative state too
  hash.update(`destruction ${JSON.stringify(snapshot.meta.destructionLog ?? [])}\n`);
  hash.update(`events ${events.length} ${events.map((e) => `${e.type}:${JSON.stringify(e).length}`).join(',')}\n`);
  return hash.digest('hex').slice(0, 16);
}

/**
 * `craters` (destruction core lane, 2026-10-08; crater-render-spec §F): the match plays with craters on whatever the
 * ruleset's switch says, and h2 fires its HE round down at the ground near it, so the dug ground and its log are in the
 * hash.
 */
export function runDeterminismAudit({ mapId = 'verdant', ticks = 3600, seed = 7, every = 60, log = () => {}, craters = false } = {}) {
  const standard = matchRulesetFor('standard');
  const ruleset = craters ? { ...standard, destruction: { ...standard.destruction, craters: true } } : undefined;
  const heSlot = (specId) => Math.max(0, getSpec(specId).gun.shells.findIndex((shell) => isHeClass(shell?.type)));
  const players = [
    { id: 'h1', specId: 'm1a2', team: 'alpha' },
    { id: 'h2', specId: 't90m', team: 'bravo' },
    { id: 'b1', specId: 'leo2a7v', team: 'alpha', bot: true, difficulty: 'normal' },
    { id: 'b2', specId: 'm1a2', team: 'bravo', bot: true, difficulty: 'normal' },
    { id: 'b3', specId: 't90m', team: 'alpha', bot: true, difficulty: 'hard' },
    { id: 'b4', specId: 'leo2a7v', team: 'bravo', bot: true, difficulty: 'easy' },
  ];
  const run = () => {
    const world = createDedicatedWorldCollision(mapId, { retain: true });
    const match = createAuthoritativeMatch({ players: players.map((p) => ({ ...p })), mapId, seed, countdownS: 0, gameMode: 'standard', worldCollision: world,
      ...(ruleset ? { ruleset } : {}) });
    match.onMatchReady();
    const digests = [];
    const events = [];
    let crushes = 0;
    let impacts = 0;
    let hits = 0;
    let stages = 0;
    let dug = 0;
    const inputs = new Map();
    const h2Slot = craters ? heSlot('t90m') : 0;
    for (let tick = 1; tick <= ticks; tick++) {
      inputs.set('h1', scriptedInput(0, tick));
      inputs.set('h2', craters ? scriptedInput(1, tick, h2Slot, -0.03) : scriptedInput(1, tick));
      match.step({ dt: SIM_DT, inputs });
      const pending = match.eventsForViewer('__audit__');
      for (const event of pending) {
        events.push(event);
        if (event.type === 'world_prop_destroyed') crushes++;
        else if (event.type === 'shell_impact') impacts++;
        else if (event.type === 'shell_hit') hits++;
        else if (event.type === 'structure_stage') stages++;
        else if (event.type === 'terrain_crater') dug++;
      }
      match.afterEventBroadcast();
      if (tick % every === 0) digests.push([tick, stateDigest(match, events)]);
    }
    world.release?.();
    return { digests, counts: { events: events.length, crushes, impacts, hits, stages, craters: dug }, final: stateDigest(match, events) };
  };
  const started = performance.now();
  const a = run();
  const midMs = performance.now();
  const b = run();
  const wallMs = Math.round(performance.now() - started);
  let firstDiffTick = null;
  for (let index = 0; index < a.digests.length; index++) {
    if (a.digests[index][1] !== b.digests[index][1]) { firstDiffTick = a.digests[index][0]; break; }
  }
  const report = { mapId, ticks, seed, every, runs: 2, identical: firstDiffTick === null && a.final === b.final, firstDiffTick, finalA: a.final, finalB: b.final, countsA: a.counts, countsB: b.counts, wallMs, runMs: [Math.round(midMs - started), Math.round(performance.now() - midMs)] };
  log(JSON.stringify(report));
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = runDeterminismAudit({ mapId: arg('map', 'verdant'), ticks: Number(arg('ticks', 3600)), seed: Number(arg('seed', 7)),
    craters: process.argv.includes('--craters') });
  console.log(`sim determinism: ${report.mapId} seed ${report.seed}, ${report.ticks} ticks × 2 runs in ${report.wallMs} ms — ${report.identical ? 'IDENTICAL' : `DIVERGED at tick ${report.firstDiffTick}`}; run A ${JSON.stringify(report.countsA)}, run B ${JSON.stringify(report.countsB)}; final ${report.finalA} / ${report.finalB}`);
  process.exitCode = report.identical ? 0 : 1;
}
