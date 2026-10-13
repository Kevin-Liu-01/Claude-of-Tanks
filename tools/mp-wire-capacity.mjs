#!/usr/bin/env node
/**
 * Multiplayer wire capacity (2026-10-13, the MP stream; MP-SINCE-0930 plan step 14 and §5b D). A keyframe carries the
 * persistent world state whole: the destroyed-prop list (at most MAX_DESTROYED_PER_SNAPSHOT indices, else the encoder
 * throws) and the destruction log (at most MAX_DESTRUCTION_PER_SNAPSHOT entries, else it throws), inside one message of
 * at most MAX_MESSAGE_BYTES. A match that grows past any of them can no longer publish a keyframe: a late joiner, a
 * rejoin, a reconnect and a migration all stall. Nothing measured how close a long match comes.
 *
 * Part 1 (static, every battlefield and variant the host can play): the upper bounds — every crushable prop down, every
 * structure at its last stage, every hole and section fall the sections allow, every crater the ruleset allows — for each
 * mode's destruction rules (the current switches, and with sections and craters on), the bytes they encode to, and a
 * 28-hull keyframe's base measured from a real actor; flagged where a bound passes a cap.
 * Part 2 (--sim=<map>[,<map>]... --minutes=N [--sim-mode=zone_control]): a real authority on the map's collision world
 * with 28 bots in a respawning mode for N minutes of match time, sampling the destroyed list and the log every simulated
 * minute, and the bytes they encode to (an encode error is the stall a keyframe past a cap would cause).
 *
 *   node tools/mp-wire-capacity.mjs [--json] [--maps=verdant,urban] [--sim=verdant,urban --minutes=10] [--out=<file>]
 */
import { writeFileSync } from 'node:fs';
import { ByteWriter } from '../src/mp/wire/bytes.ts';
import { writeIndexList } from '../src/mp/wire/rows.ts';
import { MAX_DESTRUCTION_PER_SNAPSHOT, writeDestructionEntries } from '../src/mp/wire/destructionLog.ts';
import { MAX_DESTROYED_PER_SNAPSHOT, MAX_MESSAGE_BYTES } from '../src/mp/wire/constants.ts';
import { STRUCTURE_HOLES_PER_SECTION } from '../src/world/collision.ts';
import { MAX_STOREYS } from '../src/sim/structureSections.ts';
import { GAME_MODE_IDS } from '../src/sim/matchModes.ts';
import { matchRulesetFor } from '../src/sim/matchRuleset.ts';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';

const arg = (name, fallback) => (process.argv.find((entry) => entry.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).slice(name.length + 3);
const json = process.argv.includes('--json');
const out = arg('out', '');
const mapFilter = arg('maps', '').split(',').filter(Boolean);
const simMaps = arg('sim', '').split(',').filter(Boolean);
const simMinutes = Number(arg('minutes', 10));
const simMode = arg('sim-mode', 'zone_control');
const log = (line) => { if (!json) process.stderr.write(`[mp-wire-capacity] ${line}\n`); };

/** Sections a structure can have at most: four walls per storey and the roof (structureSections.ts). */
const MAX_SECTIONS = MAX_STOREYS * 4 + 1;
const STAGE_BYTES = 13, BREACH_BYTES = 28, CRATER_BYTES = 19;

function destroyedListBytes(count) {
  const writer = new ByteWriter();
  writeIndexList(writer, Array.from({ length: count }, (_, index) => index), Number.MAX_SAFE_INTEGER);
  return writer.length;
}

/** Every distinct destruction rule set among the modes (the switches as they stand, then sections and craters on). */
function ruleSets() {
  const seen = new Map();
  for (const mode of GAME_MODE_IDS) {
    const rules = matchRulesetFor(mode).destruction;
    const key = JSON.stringify(rules);
    if (!seen.has(key)) seen.set(key, { modes: [], rules });
    seen.get(key).modes.push(mode);
  }
  const sets = [...seen.values()];
  const full = sets.find((set) => set.rules.structures);
  if (full) sets.push({ modes: ['(sections + craters on)'], rules: { ...full.rules, sections: true, craters: true } });
  return sets;
}

/** The battlefields the host can play: the index of committed manifests (maps and their mode variants). */
async function battlefields() {
  const { readFileSync } = await import('node:fs');
  const index = JSON.parse(readFileSync(new URL('../server/world-collision-manifests/index.json', import.meta.url), 'utf8'));
  const fields = Object.keys(index.maps ?? {}).map((id) => ({ id, variant: null }));
  for (const [variant, maps] of Object.entries(index.variants ?? {})) for (const id of Object.keys(maps)) fields.push({ id, variant });
  return fields;
}

function censusOf(world) {
  const obstacles = world.getObstacles();
  const colliders = typeof world.getColliders === 'function' ? world.getColliders() : [];
  const structures = new Map();
  for (const record of [...obstacles, ...colliders]) {
    if (record.structureIdx === undefined) continue;
    const entry = structures.get(record.structureIdx) ?? { landmark: false };
    if (record.structureRole === 'setpiece') entry.landmark = true;
    structures.set(record.structureIdx, entry);
  }
  const landmarks = [...structures.values()].filter((entry) => entry.landmark).length;
  return { obstacles: obstacles.length, crushable: obstacles.filter((record) => record.crushable).length, structures: structures.size, landmarks };
}

function boundsFor(census, rules) {
  const stages = rules.structures ? (census.structures - census.landmarks) * 3 + census.landmarks * 2 : 0;
  const breaches = rules.structures && rules.sections ? census.structures * MAX_SECTIONS * (STRUCTURE_HOLES_PER_SECTION + 1) : 0;
  const craters = rules.craters ? rules.maxCraters : 0;
  const entries = stages + breaches + craters;
  return {
    destroyed: census.crushable, entries, stages, breaches, craters,
    stateBytes: destroyedListBytes(census.crushable) + stages * STAGE_BYTES + breaches * BREACH_BYTES + craters * CRATER_BYTES,
  };
}

/** A 28-hull keyframe without world state, from a real actor (the base the world state adds to). */
async function baseKeyframeBytes() {
  const { ensureAuthorityFleet } = await import('../src/vehicles/authorityFleet.ts');
  const { createMatchActor } = await import('../server/match/matchActor.ts');
  const { createLoopbackLink } = await import('../server/match/link.ts');
  const { decodeMessage } = await import('../src/mp/wire/codec.ts');
  const { MESSAGE_TYPE, PROTOCOL_VERSION } = await import('../src/mp/wire/constants.ts');
  await ensureAuthorityFleet();
  let nowMs = 1000;
  const seats = Array.from({ length: 2 }, (_, i) => ({ seat: i, playerId: `p${i}`, name: `P${i}`, team: i ? 'bravo' : 'alpha', specId: 'm1a2' }));
  const bots = Array.from({ length: 26 }, (_, i) => ({ playerId: `bot-${i}`, name: `Bot ${i}`, specId: i % 2 ? 't90m' : 'leo2a7v', team: i % 2 ? 'bravo' : 'alpha' }));
  const actor = createMatchActor({ roomId: 'capacity', mapId: 'verdant', seed: 7, countdownS: 0, world: 'terrain', now: () => nowMs, schedule: () => () => {}, seats, bots, autoStart: false });
  const link = createLoopbackLink('p0');
  let keyframe = 0;
  link.client.onMessage((bytes) => {
    const decoded = decodeMessage(bytes, { resolveBaseline: () => null });
    if (decoded.ok && decoded.message.type === MESSAGE_TYPE.SNAPSHOT && decoded.message.keyframe) keyframe = Math.max(keyframe, bytes.length);
  });
  actor.attach(link.server, { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: 't', clientBuild: 'capacity' },
    { v: 1, roomId: 'capacity', seat: 0, playerId: 'p0', name: 'P0', team: 'alpha', specId: 'm1a2', iat: 0, exp: 1 });
  actor.start();
  for (let tick = 0; tick < 120; tick++) { nowMs += 1000 / 60; actor.advance(nowMs); await new Promise((resolve) => setImmediate(resolve)); }
  actor.stop?.();
  return { keyframeBytes: keyframe, hulls: seats.length + bots.length };
}

async function simulate(mapId, minutes) {
  const { ensureAuthorityFleet } = await import('../src/vehicles/authorityFleet.ts');
  const { createAuthoritativeMatch } = await import('../src/sim/authoritativeMatch.ts');
  const { SIM_DT } = await import('../src/sim/movement.ts');
  await ensureAuthorityFleet();
  const world = createDedicatedWorldCollision(mapId, { retain: true });
  const players = Array.from({ length: 28 }, (_, i) => ({ id: `bot-${i}`, specId: ['m1a2', 't90m', 'leo2a7v'][i % 3], team: i % 2 ? 'bravo' : 'alpha', bot: true }));
  // a respawning mode keeps 28 hulls fighting for the whole window (an elimination match ends in ~3.5 min)
  // (bots reach a mode's score target in ~3 min; a close human match runs to the clock: the target is lifted)
  const match = createAuthoritativeMatch({ mapId, seed: 11, countdownS: 0, worldCollision: world, players, gameMode: simMode, battleLimitS: minutes * 60 + 60,
    ruleset: { ...matchRulesetFor(simMode), scoreTarget: 1e9, timeLimitS: minutes * 60 + 60 } });
  match.onMatchReady();
  const samples = [];
  const ticksPerMinute = Math.round(60 / SIM_DT);
  const started = performance.now();
  for (let minute = 1; minute <= minutes; minute++) {
    for (let tick = 0; tick < ticksPerMinute; tick++) {
      match.step({ dt: SIM_DT, inputs: new Map() });
      match.afterEventBroadcast?.();
      if (match.result) break;
    }
    const meta = match.snapshot({ tick: minute * ticksPerMinute, serverTimeMs: minute * 60_000, viewerId: '__capacity__', ackInputSeq: null }).meta;
    const destroyed = [...new Set(meta.destroyedObstacleIndices ?? [])].sort((a, b) => a - b);
    const entries = meta.destructionLog ?? [];
    const writer = new ByteWriter();
    let encodeError = null;
    try { writeIndexList(writer, destroyed, MAX_DESTROYED_PER_SNAPSHOT); writeDestructionEntries(writer, entries); } catch (error) { encodeError = String(error?.message ?? error); }
    samples.push({ minute, destroyed: destroyed.length, logEntries: entries.length, stateBytes: writer.length, encodeError, alive: match.entities.filter((e) => !e.combat.destroyed).length, result: match.result ?? null });
    log(`${mapId} (${simMode}) minute ${minute}: destroyed ${destroyed.length}, log ${entries.length}, state ${writer.length} B${encodeError ? `, ENCODE ERROR ${encodeError}` : ''} (${((performance.now() - started) / 1000).toFixed(0)} s)`);
    if (match.result) break;
  }
  world.release?.();
  return { mapId, mode: simMode, minutes, wallS: Math.round((performance.now() - started) / 1000), samples };
}

const report = { caps: { destroyed: MAX_DESTROYED_PER_SNAPSHOT, entries: MAX_DESTRUCTION_PER_SNAPSHOT, messageBytes: MAX_MESSAGE_BYTES }, base: null, ruleSets: [], fields: [], flags: [], sims: [] };
report.base = await baseKeyframeBytes();
log(`base keyframe (${report.base.hulls} hulls, no world state): ${report.base.keyframeBytes} B`);
const sets = ruleSets();
report.ruleSets = sets.map((set) => ({ modes: set.modes, rules: set.rules }));
for (const field of await battlefields()) {
  if (mapFilter.length && !mapFilter.includes(field.id)) continue;
  let world;
  try { world = createDedicatedWorldCollision(field.id, { variant: field.variant }); } catch (error) { report.fields.push({ ...field, error: String(error?.message ?? error) }); continue; }
  const census = censusOf(world);
  world.release?.();
  const row = { map: field.variant ? `${field.id}@${field.variant}` : field.id, ...census, bounds: sets.map((set) => ({ modes: set.modes, ...boundsFor(census, set.rules) })) };
  report.fields.push(row);
  for (const bound of row.bounds) {
    const reasons = [];
    if (bound.destroyed > MAX_DESTROYED_PER_SNAPSHOT) reasons.push(`destroyed list ${bound.destroyed} > ${MAX_DESTROYED_PER_SNAPSHOT}`);
    if (bound.entries > MAX_DESTRUCTION_PER_SNAPSHOT) reasons.push(`log ${bound.entries} > ${MAX_DESTRUCTION_PER_SNAPSHOT}`);
    if (bound.stateBytes + report.base.keyframeBytes > MAX_MESSAGE_BYTES) reasons.push(`keyframe ${bound.stateBytes + report.base.keyframeBytes} B > ${MAX_MESSAGE_BYTES}`);
    if (reasons.length) report.flags.push({ map: row.map, modes: bound.modes.join(' '), reasons });
  }
  log(`${row.map}: ${census.crushable} crushable of ${census.obstacles}, ${census.structures} structures (${census.landmarks} landmarks); bound now ${row.bounds[0].entries} entries, ${row.bounds[0].stateBytes} B`);
}
for (const mapId of simMaps) report.sims.push(await simulate(mapId, simMinutes));

if (out) writeFileSync(out, JSON.stringify(report, null, 2));
if (json) console.log(JSON.stringify(report, null, 2));
else {
  const worst = [...report.fields].filter((row) => !row.error).sort((a, b) => b.crushable - a.crushable).slice(0, 5);
  console.log(`mp wire capacity: base keyframe ${report.base.keyframeBytes} B at ${report.base.hulls} hulls; ${report.fields.length} battlefields; caps ${MAX_DESTROYED_PER_SNAPSHOT} destroyed / ${MAX_DESTRUCTION_PER_SNAPSHOT} log entries / ${MAX_MESSAGE_BYTES} B`);
  console.log(`  most crushable: ${worst.map((row) => `${row.map} ${row.crushable}`).join(', ')}`);
  // one line per battlefield: the caps its bounds pass, with the rule sets that pass them
  const byMap = new Map();
  for (const flag of report.flags) {
    const row = byMap.get(flag.map) ?? new Map();
    for (const reason of flag.reasons) {
      const cap = reason.replace(/ \d+.*$/, '');
      const entry = row.get(cap) ?? { reason, sets: [] };
      entry.sets.push(flag.modes.startsWith('(') ? 'sections+craters' : flag.modes.split(' ').length > 2 ? 'every mode' : flag.modes);
      row.set(cap, entry);
    }
    byMap.set(flag.map, row);
  }
  for (const [map, row] of byMap) console.log(`  OVER ${map}: ${[...row.values()].map((entry) => `${entry.reason} (${[...new Set(entry.sets)].join(', ')})`).join('; ')}`);
  for (const sim of report.sims) {
    const last = sim.samples.at(-1);
    console.log(`  sim ${sim.mapId} ${sim.samples.length} min (28 bots, ${sim.wallS} s wall): destroyed ${sim.samples.map((s) => s.destroyed).join('/')}, log ${sim.samples.map((s) => s.logEntries).join('/')}, state ${last?.stateBytes ?? '-'} B at the end${sim.samples.some((s) => s.encodeError) ? ', ENCODE ERRORS' : ''}`);
  }
}
