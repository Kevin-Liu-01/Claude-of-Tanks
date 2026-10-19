#!/usr/bin/env node
// Mode balance probe (gameplay-227, owner 2026-10-17: "the zombies actually have low hp ... make this more fun").
// Runs the shared authority (createAuthoritativeMatch: the same mode controller and match ruleset the solo battle
// uses) headlessly for one mode, every seat bot-driven, and reports how the human side fares: the result, the human
// seat's survival, kills per minute per side, waves reached and ammunition exhaustion. Measurement only; not in the
// suite (a balanced round takes minutes of wall time per seed). docs/GAME-MODES.md "Zombie balance" records its runs.
//
//   node tools/mode-balance-probe.mjs --mode=infected --seed=1             one run, one JSON line on stdout
//   node tools/mode-balance-probe.mjs --mode=infected --seeds=1-8 --jobs=4 --out=DIR --tag=after
//                                                                          one capped child per seed, DIR/<tag>.<seed>.json
//   node tools/mode-balance-probe.mjs --table DIR <tag...>                 aggregate the rows of each tag
//   node tools/mode-balance-probe.mjs --record=src/sim/zombieBalance.measured.json --dir=DIR \
//     --tags=infected:<before>:<after>:<tuned>,endless_horde:<before>:<after>:<tuned>   (<before> `keep`: the record's own)
//                                                                          the band zombieBalance.selftest checks; <tuned>
//                                                                          (optional, e.g. 1-16) names the seeds the rules
//                                                                          were tuned on, and the record adds a hold-out
//                                                                          aggregate of every other seed
//
// Options: --map=verdant, --capS=900 (simulated seconds), --difficulty=normal (every seat; the ruleset may step the
// Horde's hostiles down), --hostileDifficulty (the hostile seats before that step), --rules='{json}' (a partial ruleset
// over the mode's table; infection and horde merge field by field), --before (the mode's table as it stood on
// 16aeab482, before the zombie rebalance and unlimited rounds), --detail (per-entity rows).
// Endless Horde ends when no non-bot human hull lives, so seat h1 is AI-driven but reads as human while the mode
// controller steps (a measurement shim: nothing in src changes). Every seat draws a seeded ground vehicle from the
// production fleet.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = new URL('../', import.meta.url);
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((entry) => entry.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => argv.includes(`--${name}`);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};

/** The zombie modes' tables on 16aeab482 (and Juggernaut's spec rounds), in today's schema: the "before" rows. */
const BEFORE = Object.freeze({
  infected: { ammo: 'spec', respawnS: 3, enemies: 4,
    infection: { infectedSpeed: 1.4, survivorHpScale: 0.3, infectedHpScale: 1.25, infectedReloadScale: 0.7, hunt: false } },
  endless_horde: { ammo: 'spec', hpScale: 1.25, allies: 2, enemies: 14,
    // in today's schema (gameplay-modes-228): +1 a wave, no curve, no special waves, the whole pool alive, the old 6 s lull
    horde: { waveSize: 5, waveStep: 1, waveCurve: 0, runnerEvery: 0, swarmEvery: 0, maxAlive: 14, maxAliveCap: 14, intermissionS: 6,
      hostileReloadScale: 1, spawnOutOfSight: false, hostileHpScale: 1.25, hpPerWave: 0.16, hpPerWaveLate: 0.16, speedPerWave: 0.045, speedPerWaveMax: 0.55,
      cacheHeal: { first: 0.62, perWave: 0.055, floor: 0.08 }, hostileDifficultyStep: 0 } },
  juggernaut: { ammo: 'spec' },
});

function parseSeeds(text) {
  const out = [];
  for (const part of String(text).split(',')) {
    const [a, b] = part.split('-').map(Number);
    if (Number.isFinite(a)) for (let s = a; s <= (Number.isFinite(b) ? b : a); s++) out.push(s);
  }
  return out;
}

function readRows(dir, tag) {
  return readdirSync(dir).filter((f) => f.startsWith(`${tag}.`) && f.endsWith('.json'))
    .map((f) => { try { return JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')); } catch { return null; } })
    .filter(Boolean).sort((a, b) => a.seed - b.seed);
}
/** One tag's runs in a row: human wins, the human seat's survival, kills per minute per side and their ratio, waves. */
function aggregate(rows) {
  const k = (side) => mean(rows.map((r) => r[side].killsPerMin));
  return {
    mode: rows[0].mode, runs: rows.length, seeds: rows.map((r) => r.seed), humanWins: rows.filter((r) => r.result === 'alpha').length,
    overrun: rows.filter((r) => r.result === 'bravo').length,
    endS: { mean: Math.round(mean(rows.map((r) => r.endS))), median: median(rows.map((r) => r.endS)) },
    humanSeatS: { mean: Math.round(mean(rows.map((r) => r.humanSurvivalS))), median: median(rows.map((r) => r.humanSurvivalS)) },
    humanSideMeanLifeS: Math.round(mean(rows.map((r) => r.alpha.meanSurvivalS))),
    killsPerMin: { human: +k('alpha').toFixed(2), zombie: +k('bravo').toFixed(2), ratio: +(k('alpha') / Math.max(1e-9, k('bravo'))).toFixed(2) },
    hull: { human: Math.round(mean(rows.map((r) => r.alpha.avgMaxHp))), zombie: Math.round(mean(rows.map((r) => r.bravo.avgMaxHp))) },
    waves: { mean: +mean(rows.map((r) => r.maxWave)).toFixed(2), best: Math.max(...rows.map((r) => r.maxWave)) },
    ranDry: { human: rows.reduce((s, r) => s + r.alpha.ranDry, 0), zombie: rows.reduce((s, r) => s + r.bravo.ranDry, 0) },
    results: rows.map((r) => `${r.seed}:${r.result ?? 'none'}@${r.endS}`).join(' '),
  };
}

if (flag('table')) {
  const tableAt = argv.indexOf('--table');
  const dir = argv[tableAt + 1];
  for (const tag of argv.slice(tableAt + 2).filter((entry) => !entry.startsWith('--'))) {
    const rows = readRows(dir, tag);
    console.log(rows.length ? JSON.stringify({ tag, ...aggregate(rows) }) : `${tag}: no rows`);
  }
  process.exit(0);
}

if (arg('record', null) != null) {
  // --record=OUT --dir=DIR --tags=infected:BEFORE_TAG:AFTER_TAG[:TUNED],endless_horde:... — the measured band
  // src/sim/zombieBalance.selftest.mjs checks: each mode's balance rules as measured, and its before/after aggregates;
  // TUNED seeds (the ones a rule was chosen on) also yield `after.<mode>.holdout`, the aggregate of the other seeds, so
  // the band is checked on runs the tuning never saw (critic 2026-10-17: a band fitted to its tuning seeds failed on 101-108)
  const { matchRulesetFor } = await import(new URL('src/sim/matchRuleset.ts', ROOT).href);
  const dir = arg('dir', '.');
  const record = { tool: 'tools/mode-balance-probe.mjs', map: 'verdant', difficulty: 'normal', rules: {}, before: {}, after: {} };
  for (const entry of arg('tags', '').split(',').filter(Boolean)) {
    const [mode, beforeTag, afterTag, tuned] = entry.split(':');
    const r = matchRulesetFor(mode);
    record.rules[mode] = JSON.parse(JSON.stringify({ hpScale: r.hpScale, reloadScale: r.reloadScale, damageScale: r.damageScale,
      speedMultiplier: r.speedMultiplier, ammo: r.ammo, respawnS: r.respawnS, timeLimitS: r.timeLimitS, allies: r.allies, enemies: r.enemies,
      infection: r.infection ?? null, horde: r.horde ?? null }));
    // a before tag of `keep` carries the before rows of the record already at OUT (the 16aeab482 runs: the table they
    // ran on predates today's Horde schema, so they are history, not something to re-run)
    if (beforeTag === 'keep') {
      const kept = JSON.parse(readFileSync(arg('record'), 'utf8')).before?.[mode];
      if (!kept) throw new Error(`--tags ${mode}:keep: ${arg('record')} has no before row for ${mode}`);
      record.before[mode] = kept;
    } else record.before[mode] = aggregate(readRows(dir, beforeTag));
    const afterRows = readRows(dir, afterTag);
    record.after[mode] = aggregate(afterRows);
    if (tuned) {
      const tunedSeeds = new Set(parseSeeds(tuned));
      record.after[mode].tunedSeeds = [...tunedSeeds];
      record.after[mode].holdout = aggregate(afterRows.filter((row) => !tunedSeeds.has(row.seed)));
    }
  }
  writeFileSync(arg('record'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`recorded ${Object.keys(record.rules).join(', ')} to ${arg('record')}`);
  process.exit(0);
}

if (arg('seeds', null) != null) {
  // one child per seed (isolated heaps), `jobs` at a time, each under a 4 GB heap and a wall-clock cap
  const seeds = parseSeeds(arg('seeds'));
  const jobs = Math.max(1, Number(arg('jobs', 4)));
  const out = arg('out', '.');
  const tag = arg('tag', arg('mode', 'infected'));
  const capWallS = Number(arg('wallS', 2400));
  mkdirSync(out, { recursive: true });
  const passThrough = argv.filter((entry) => !/^--(seeds|jobs|out|tag|wallS)=/.test(entry));
  const queue = seeds.slice();
  const runOne = (seed) => new Promise((resolve) => {
    const child = spawn(process.execPath, ['--max-old-space-size=4096', SELF, ...passThrough, `--seed=${seed}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), capWallS * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const line = stdout.trim().split('\n').pop() || '';
      if (code === 0 && line.startsWith('{')) writeFileSync(`${out}/${tag}.${seed}.json`, `${line}\n`);
      else writeFileSync(`${out}/${tag}.${seed}.err`, `exit ${code}\n${stderr}`);
      resolve();
    });
  });
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length) await runOne(queue.shift());
  }));
  process.exit(0);
}

await import(new URL('src/vehicles/tankFactory.ts', ROOT).href);
const { createAuthoritativeMatch } = await import(new URL('src/sim/authoritativeMatch.ts', ROOT).href);
const { SIM_DT } = await import(new URL('src/sim/movement.ts', ROOT).href);
const { matchRulesetFor } = await import(new URL('src/sim/matchRuleset.ts', ROOT).href);
const { getSpec, PRODUCTION_TANK_IDS } = await import(new URL('src/vehicles/specs.ts', ROOT).href);
const { totalAmmunition } = await import(new URL('src/sim/ammunition.ts', ROOT).href);
const { createDedicatedWorldCollision } = await import(new URL('server/dedicatedWorldCollision.ts', ROOT).href);

const mode = arg('mode', 'infected');
const seed = Number(arg('seed', 1));
const mapId = arg('map', 'verdant');
const capS = Number(arg('capS', 900));
const difficulty = arg('difficulty', 'normal');
const hostileDifficulty = arg('hostileDifficulty', difficulty);

function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed * 7919 + 13);
const pool = PRODUCTION_TANK_IDS.filter((id) => { const s = getSpec(id); return s && !s.aerial && s.gun?.shells?.length; });
const pick = () => pool[Math.floor(rng() * pool.length)];

const base = matchRulesetFor(mode);
const merge = (into, over) => ({ ...into, ...over,
  ...(over.infection ? { infection: { ...into.infection, ...over.infection } } : {}),
  ...(over.horde ? { horde: { ...into.horde, ...over.horde } } : {}) });
const over = merge(flag('before') ? (BEFORE[mode] ?? {}) : {}, JSON.parse(arg('rules', '{}')));
const rules = merge(base, over);
if (rules.infection) rules.enemies = Math.max(3, rules.enemies ?? 3);
const players = [];
const seat = (id, team, diff) => players.push({ id, specId: pick(), team, bot: true, difficulty: diff });
seat('h1', 'alpha', difficulty);
if (mode === 'juggernaut') {
  for (let i = 0; i < (rules.enemies ?? 12); i++) seat(`z${i}`, 'bravo', hostileDifficulty);
} else {
  const allies = rules.allies ?? 6;
  const enemies = rules.enemies ?? 7;
  for (let i = 0; i < allies; i++) seat(`a${i}`, 'alpha', difficulty);
  for (let i = 0; i < enemies; i++) seat(`z${i}`, 'bravo', hostileDifficulty);
}

const started = performance.now();
const world = createDedicatedWorldCollision(mapId, { retain: true });
const match = createAuthoritativeMatch({ players: players.map((p) => ({ ...p })), mapId, seed, countdownS: 0, gameMode: mode, worldCollision: world,
  ...(Object.keys(over).length ? { ruleset: Object.freeze(rules) } : {}) });
let inModeStep = false;
const controller = match.modeController;
const step = controller.step;
controller.step = function (dt, t) { inModeStep = true; try { return step.call(this, dt, t); } finally { inModeStep = false; } };
const h1 = match.entityById.get('h1');
if (mode === 'endless_horde') Object.defineProperty(h1, 'bot', { get: () => !inModeStep, configurable: true });
match.onMatchReady();

const start = new Map(match.entities.map((e) => [e.id, { team: e.team, maxHp: e.combat.maxHp }]));
const lastTeam = new Map(match.entities.map((e) => [e.id, e.team]));
const firstDeath = new Map();
const dryAt = new Map();
const hostileHull = [];
const kills = { alpha: 0, bravo: 0, self: 0 };
const shots = { alpha: 0, bravo: 0 };
const perShots = new Map();
let maxWave = 0;
let humanDeathS = null;
let conversions = 0;
const waves = [];
const inputs = new Map();
const ticks = Math.round(capS / SIM_DT);
for (let tick = 0; tick < ticks; tick++) {
  match.step({ dt: SIM_DT, inputs });
  const t = match.timeS;
  for (const event of match.eventsForViewer('__probe__')) {
    if (event.type === 'tank_destroyed') {
      const killerTeam = event.killerId && event.killerId !== event.id ? lastTeam.get(event.killerId) : null;
      if (killerTeam) kills[killerTeam] = (kills[killerTeam] || 0) + 1; else kills.self++;
      if (!firstDeath.has(event.id)) firstDeath.set(event.id, t);
      if (event.id === 'h1' && humanDeathS == null) humanDeathS = t;
    } else if (event.type === 'shell_fired') {
      const team = lastTeam.get(event.shooterId);
      if (team) shots[team]++;
      perShots.set(event.shooterId, (perShots.get(event.shooterId) || 0) + 1);
    } else if (event.type === 'mode_infected') conversions++;
    else if (event.type === 'mode_wave_started') {
      maxWave = Math.max(maxWave, event.wave ?? 0);
      if (waves.length < 12) waves.push([Math.round(t), event.wave, event.enemies]);
    }
  }
  match.afterEventBroadcast();
  for (const e of match.entities) {
    lastTeam.set(e.id, e.team);
    if (e.team !== 'alpha' && e.modeActive !== false && !e.combat.destroyed && hostileHull.length < 400 && tick % 600 === 0) hostileHull.push(e.combat.maxHp / Math.max(1, e.spec.hp));
    if (!dryAt.has(e.id) && e.modeActive !== false && !e.combat.destroyed && totalAmmunition(e.combat) === 0) dryAt.set(e.id, { t, team: e.team });
  }
  if (match.result && match.resultTimeS != null && t >= match.resultTimeS) break;
}
const endS = match.resultTimeS ?? match.timeS;
const minutes = endS / 60;
const side = (team) => [...start].filter(([, v]) => v.team === team).map(([id]) => id);
const survival = (ids) => ids.map((id) => Math.min(firstDeath.get(id) ?? endS, endS));
const avgMaxHp = (ids) => Math.round(mean(ids.map((id) => start.get(id).maxHp)));
const alphaIds = side('alpha');
const bravoIds = side('bravo');
const dry = (alpha) => [...dryAt.values()].filter((v) => (v.team === 'alpha') === alpha);
const report = {
  mode, seed, mapId, difficulty, hostileDifficulty, before: flag('before'), over,
  result: match.result, reason: match.resultReason, endS: Math.round(endS),
  alpha: { n: alphaIds.length, avgMaxHp: avgMaxHp(alphaIds), meanSurvivalS: Math.round(mean(survival(alphaIds))), aliveAtEnd: alphaIds.filter((id) => !firstDeath.has(id)).length,
    killsPerMin: +(kills.alpha / minutes).toFixed(2), kills: kills.alpha, shotsPerMin: +(shots.alpha / minutes).toFixed(1), ranDry: dry(true).length },
  bravo: { n: bravoIds.length, avgMaxHp: avgMaxHp(bravoIds), killsPerMin: +(kills.bravo / minutes).toFixed(2), kills: kills.bravo, shotsPerMin: +(shots.bravo / minutes).toFixed(1),
    ranDry: dry(false).length, liveHullOfOwn: +mean(hostileHull).toFixed(3) },
  humanSurvivalS: Math.round(humanDeathS ?? endS), humanDied: humanDeathS != null,
  conversions, maxWave, selfKills: kills.self, waves,
  wallMs: Math.round(performance.now() - started),
  ...(flag('detail') ? { entities: match.entities.map((e) => ({ id: e.id, spec: e.specId, team0: start.get(e.id).team, shots: perShots.get(e.id) || 0, kills: e.kills,
    died: firstDeath.has(e.id) ? Math.round(firstDeath.get(e.id)) : null, maxHp: start.get(e.id).maxHp })) } : {}),
};
world.release?.();
console.log(JSON.stringify(report));
