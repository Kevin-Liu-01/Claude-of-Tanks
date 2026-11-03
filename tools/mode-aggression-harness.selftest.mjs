// The mode aggression harness (gameplay-modes-228) as a receipt: its compare gate reads targets the way the build plan
// states them, and short seeded runs through the real solo battle (Horde's first wave over a 24-deal sweep) pin the asks the owner made of the zombie modes
// (2026-10-17 / 2026-10-18): Endless Horde fields the wave law's enemies out of the humans' reach and sight, its fodder
// hulls (0.15 of their own) against the humans' doubled hulls, and zombies that rush in, never fall back, scoot, kite
// or ram; the Infected arrive near the survivors and close on them. The long A/B batches (8+ seeds a mode) live under
// cot-launch-state/streams/gameplay-modes-228/metrics; tools/mode-aggression-targets.json holds the gate.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import { hordeMaxAlive, hordeWaveTotal, matchRulesetFor } from '../src/sim/matchRuleset.ts';
import { createTankState, updateTank, SIM_DT } from '../src/sim/movement.ts';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';
import { getSpec } from '../src/vehicles/specs.ts';

const HARNESS = fileURLToPath(new URL('./mode-aggression-harness.mjs', import.meta.url));
const TARGETS = fileURLToPath(new URL('./mode-aggression-targets.json', import.meta.url));
// (268, item 10; Main, 2026-11-02, DECISIONS) the Horde sweep's 24 deals are pinned as dealt at 02cac3264a, where the paired
// ratchet's vector was recorded: a fleet addition re-deals nothing, so the paired differences compare the same battles
const PINNED_ROSTERS = fileURLToPath(new URL('./mode-aggression-rosters.json', import.meta.url));

// --------------------------------------------------------------------------------------------- the targets file ---
const spec = JSON.parse(readFileSync(TARGETS, 'utf8'));
const ids = new Set();
const OPS = new Set(['<=', '>=', '<', '>', '==', 'between', '<=base', 'deepEquals', 'equalsBase', 'check']);
for (const t of spec.targets) {
  assert.ok(!ids.has(t.id), `duplicate target ${t.id}`); ids.add(t.id);
  assert.ok(OPS.has(t.op), `${t.id}: unknown op ${t.op}`);
  if (t.op === 'between') assert.ok(Array.isArray(t.value) && t.value[0] <= t.value[1], `${t.id}: between [lo, hi]`);
  if (t.op === 'check') assert.ok(['hordeLaw', 'hordeHull', 'engagedStillRanking'].includes(t.check), `${t.id}: unknown check`);
  if (t.roster) assert.ok(t.mode && t.arrangement, `${t.id}: a census row names its mode and arrangement`);
}
for (const prefix of ['guard.', 'horde.', 'infected.', 'frontline.', 'ctf.', 'ball.', 'nations.']) {
  assert.ok([...ids].some((id) => id.startsWith(prefix)), `the gate covers ${prefix}`);
}

// ------------------------------------------------------------------------------------------ compare on fixtures ---
const scratch = mkdtempSync(join(tmpdir(), 'mode-aggression-'));
try {
  const report = (horde, roster) => ({ modes: { endless_horde: { bravo: { engagedStillShare: 0.02, flags: { pressing: 0.5 } }, ramStats: { botOnBotDeathsMean: horde.rams },
    horde: { roundsReachedMedian: horde.rounds, law: { clearedOnLaw: 4, cleared: 4, arrivalsPerWave: [6, 9, 13, 18],
      hullPerWave: [0.15, 0.153, 0.156, 0.159, 0.1, 0.165, 0.168, 0.171, 0.174, 0.1] } } },
    infected: { bravo: { engagedStillShare: 0.04 } }, standard: { alpha: { engagedStillShare: 0.2 }, bravo: { engagedStillShare: 0.21 } } },
    roster });
  const write = (dir, value) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'report.json'), JSON.stringify(value)); };
  write(join(scratch, 'base'), report({ rams: 2, rounds: 3 }, { standard: { mono: { sharedRuns: 5 } } }));
  write(join(scratch, 'after'), report({ rams: 2.1, rounds: 5 }, { standard: { mono: { sharedRuns: 0 } } }));
  const targets = (rows) => { const path = join(scratch, `t${Math.random().toString(36).slice(2)}.json`); writeFileSync(path, JSON.stringify({ targets: rows })); return path; };
  const compare = (rows) => spawnSync(process.execPath, [HARNESS, 'compare', `--base=${join(scratch, 'base')}`, `--dir=${join(scratch, 'after')}`, `--targets=${targets(rows)}`], { encoding: 'utf8' });
  const passing = compare([
    { id: 'rounds', mode: 'endless_horde', path: 'horde.roundsReachedMedian', op: '>=', value: 4 },
    { id: 'rams', mode: 'endless_horde', path: 'ramStats.botOnBotDeathsMean', op: '<=base', value: 1.1 },
    { id: 'kiting', mode: 'endless_horde', path: 'bravo.flags.kiting', op: '<=', value: 0, default: 0 },
    { id: 'law', op: 'check', check: 'hordeLaw' },
    { id: 'hull', op: 'check', check: 'hordeHull', band: [0.15, 0.177], swarmEvery: 5, late: 0.23 },
    { id: 'ranking', op: 'check', check: 'engagedStillRanking' },
    { id: 'census', mode: 'standard', arrangement: 'mono', roster: true, path: 'sharedRuns', op: '==', value: 0 },
    { id: 'missing-optional', mode: 'endless_horde', path: 'nope', op: '>=', value: 1, optional: true },
  ]);
  assert.equal(passing.status, 0, passing.stdout + passing.stderr);
  assert.match(passing.stdout, /PASS rams: 2 -> 2\.1/);
  assert.match(passing.stdout, /PASS census: 5 -> 0/);
  assert.match(passing.stdout, /compare: 8\/8 targets met/);  // an optional miss prints "skip" and never fails
  const missing = compare([{ id: 'over', mode: 'endless_horde', path: 'ramStats.botOnBotDeathsMean', op: '<=base', value: 1 },
    { id: 'hullTight', op: 'check', check: 'hordeHull', band: [0.15, 0.16], swarmEvery: 5, late: 0.23 }]);
  assert.equal(missing.status, 1, 'a missed target fails the gate');
  assert.match(missing.stdout, /MISS over: 2 -> 2\.1/);
  assert.match(missing.stdout, /MISS hullTight/);
  // equalsBase run for run (the classic guard): every after run equals the base's run of its seed, minus `ignore`
  const run1 = { mode: 'standard', seed: 1, endS: 300, wallMs: 5 };
  for (const [dir, row] of [['base', run1], ['after', { ...run1, wallMs: 9 }]]) {
    mkdirSync(join(scratch, dir, 'runs'), { recursive: true }); writeFileSync(join(scratch, dir, 'runs', 'standard.1.json'), JSON.stringify(row));
  }
  const same = compare([{ id: 'classic', mode: 'standard', op: 'equalsBase', perRun: true, ignore: ['wallMs'] }]);
  assert.equal(same.status, 0, same.stdout); assert.match(same.stdout, /PASS classic: "base runs" -> "1 identical, 0 differ, 0 without a base run"/);
  writeFileSync(join(scratch, 'after', 'runs', 'standard.1.json'), JSON.stringify({ ...run1, endS: 301 }));
  assert.equal(compare([{ id: 'classic', mode: 'standard', op: 'equalsBase', perRun: true, ignore: ['wallMs'] }]).status, 1, 'a run that moved fails it');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// ------------------------------------------------------------------------------------- two short seeded battles ---
// Each battle pins the seat's tank to the one its seed drew from the 236-vehicle fleet (265: the Leopard 1A2A1 joining
// the pool re-dealt seed 1's seat from the M60A2 to the M48A5 Patton, and the sortie read 3/6); the seed still deals the
// roster, the map and every draw after the seat, so a fleet addition no longer moves these receipts.
const run = (mode, capS, seed, player) => new Promise((resolve, reject) => {
  const pin = mode === 'endless_horde' ? [`--pinRoster=${PINNED_ROSTERS}`] : [];
  const child = spawn(process.execPath, ['--max-old-space-size=4096', HARNESS, 'run', `--mode=${mode}`, `--seed=${seed}`, `--capS=${capS}`, `--player=${player}`, ...pin], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
  child.on('close', (code) => {
    if (code !== 0) { reject(new Error(`${mode} run exited ${code}: ${err}`)); return; }
    resolve(JSON.parse(out.trim().split('\n').pop()));
  });
});
// round 3: one short battle of each objective mode too (the owner's 10-18 asks: Frontline's aggression, the flag and ball
// chased hard), all at once
// (268, item 7) the battle's seed is handed in (rosterState soloMatchSeed), not steered through the battle counter.
// (268, item 10; Main, 2026-11-02: fix the class) A pinned deal in a chaotic sim fails by chaos, so every mode is judged
// over a seed sweep, never one deal: 24 Horde deals (three a map), 8 of each other mode (one a map; seed s plays
// MAP_ROTATION[(s - 1) % 8]), each mode's seat pinned as before. Outcome-class asks (kills, distances, pickups, touches,
// timings) are held on the mean or a count bar; conduct asks (standing still, falling back, rams, honesty, placement, the
// mission keeping its hull) on every deal, but for the deals KNOWN_CONDUCT lists by seed with a named, unfixed defect.
const SEEDS = (n) => Array.from({ length: n }, (_, i) => i + 1);
const SWEEPS = [
  { mode: 'endless_horde', capS: 45, player: 'm60a2', seeds: SEEDS(24) },
  { mode: 'infected', capS: 60, player: 'm60a2', seeds: SEEDS(8) },
  { mode: 'frontline_assault', capS: 90, player: 'm1a3', seeds: SEEDS(8) },
  { mode: 'capture_the_flag', capS: 120, player: 'kf51_evo', seeds: SEEDS(8) },
  { mode: 'turbo_ball', capS: 120, player: 'm1a3', seeds: SEEDS(8) },
];
const RECEIPT_JOBS = 8;
const pool = async (jobs, limit) => {
  const out = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); } }));
  return out;
};
// the longest battles first, so the tail of the sweep is short
const battles = SWEEPS.flatMap((sweep) => sweep.seeds.map((seed) => ({ ...sweep, seed }))).sort((a, b) => b.capS - a.capS || a.seed - b.seed);

// (268, item 10; Main, 2026-11-02) Standing still is a stand: the harness counts a slow sample only inside a stand longer
// than T_REV, the slowest Horde hull's full-throttle reversal from -2 m/s through zero (ticks under the sample's
// MOVE_EPS_MPS) plus one sample period. The reversal is re-derived here from movement.ts on each ground class: the pinned
// ticks are the Chieftain Mk 3's on medium ground, and T_REV covers its soft-ground reversal too. Two planted stands are
// the positive controls (a standard battle, seed 1 from 30 s: the engaged bravo bot farthest from the alpha side held at
// zero throttle, then driven off; a Horde zombie, 0.15 of its hull, dies braking before its stand begins): 3 s and
// 1.5 x T_REV each count every slow sample they hold. The negative controls are deals of the sweep:
// seed 19's Puma reversals and seed 18's one-sample jolt read clean in the still asks.
const harnessSource = readFileSync(HARNESS, 'utf8');
const pinned = /const STAND_MIN_TICKS = (\d+) \+ SAMPLE_TICKS;/.exec(harnessSource);
assert.ok(pinned, 'the harness pins T_REV as reversal ticks + SAMPLE_TICKS');
assert.match(harnessSource, /const SAMPLE_TICKS = 30;/);
assert.match(harnessSource, /const MOVE_EPS_MPS = 0\.75;/);
await ensureAuthorityFleet();
const reversalTicks = (id, ground) => {
  const spec = getSpec(id), field = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => ground };
  const state = createTankState(spec, new Vector3(0, 0, 0), 0);
  state.speed = -2;
  const hull = { id, specId: id, spec, team: 'bravo', state, combat: { hp: spec.hp, maxHp: spec.hp, destroyed: false, modules: {}, crew: {} },
    input: { throttle: 1, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 } };
  let slow = 0;
  for (let i = 0; i < 20 / SIM_DT; i++) {
    updateTank(hull, field, SIM_DT, null);
    if (state.speed >= 0.75) return slow;
    if (Math.abs(state.speed) < 0.75) slow++;
  }
  return Infinity;
};
const reversal = Object.fromEntries(['hard', 'medium', 'soft'].map((ground) => [ground, reversalTicks('chieftain3', ground)]));
const T_REV_TICKS = Number(pinned[1]) + 30, T_REV_S = T_REV_TICKS * SIM_DT;
assert.equal(reversal.medium, Number(pinned[1]), `the pin is the Chieftain Mk 3's reversal on medium ground (${reversal.medium} ticks)`);
assert.ok(reversal.soft < T_REV_TICKS && reversal.hard < T_REV_TICKS, `T_REV (${T_REV_TICKS} ticks) covers it on every ground (${JSON.stringify(reversal)})`);
const plantRun = (standS) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--max-old-space-size=4096', HARNESS, 'run', '--mode=standard', '--seed=1', '--capS=120', '--player=m60a2',
    `--plantStand=${standS}`, '--plantFromS=30'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  child.on('close', (code) => {
    if (code !== 0) { reject(new Error(`the planted ${standS} s stand exited ${code}: ${err.slice(-2000)}`)); return; }
    resolve({ standS, line: err.split('\n').findLast((line) => line.startsWith('PLANT ') && line.includes(' stood ')) ?? '' });
  });
});

// The Horde outcome ratchet is paired (Main, 2026-11-02, DECISIONS): the 24 per-deal wave-1 kills of the run that set it
// (02cac3264a, mean 4.958), seed by seed. A head is judged by its per-deal change against that vector: the mean change
// and the standard error of the 24 differences (the pairing removes the seed-to-seed spread; the SD of the head's own
// deals would make the band meaninglessly wide). It fails below -2 SE; the vector rises only when a head beats it by more
// than +2 SE (the receipt prints the vector to store) and never falls without a ruling. At 24 deals the sweep cannot
// resolve less than about 2 SE: a 1 SE band false-fails about one neutral head in six, and a band that moves down with
// each landing lets small drops pile up. The controls: the stored run itself passes at 0, a planted vector 3 SE down
// fails, one 3 SE up rises.
const OUTCOME_RATCHET = Object.freeze({ setBy: '02cac3264a', kills: Object.freeze([3, 4, 6, 4, 4, 4, 6, 6, 6, 6, 6, 3, 4, 6, 5, 6, 3, 5, 6, 6, 4, 4, 6, 6]) });
const OUTCOME_BAND_SE = 2;
/** A head's per-deal wave-1 kills against the stored vector: the mean change, its standard error, and the verdict. */
function pairedOutcome(headKills) {
  const base = OUTCOME_RATCHET.kills, n = base.length;
  assert.equal(headKills.length, n, `the paired ratchet reads ${n} deals, seed by seed`);
  const diffs = headKills.map((k, i) => k - base[i]);
  const change = diffs.reduce((sum, d) => sum + d, 0) / n;
  const se = Math.sqrt(diffs.reduce((sum, d) => sum + (d - change) ** 2, 0) / (n - 1) / n);
  const verdict = change < -OUTCOME_BAND_SE * se ? 'fail' : change > OUTCOME_BAND_SE * se ? 'rise' : 'pass';
  return { change, se, sigmas: se > 0 ? change / se : 0, verdict };
}
{
  const stored = pairedOutcome([...OUTCOME_RATCHET.kills]);
  assert.ok(stored.verdict === 'pass' && stored.change === 0, 'the stored run passes its own ratchet at 0');
  // planted: a spread of +-1 kill round a shift of 3 SE (the spread's SE is sqrt(24/23)/sqrt(24))
  const se = Math.sqrt(24 / 23) / Math.sqrt(24);
  const planted = (sigmas) => pairedOutcome(OUTCOME_RATCHET.kills.map((k, i) => k + sigmas * se + (i % 2 ? 1 : -1)));
  const down = planted(-3), up = planted(3);
  assert.ok(down.verdict === 'fail' && Math.abs(down.sigmas + 3) < 1e-9, `a head 3 SE down fails (${down.sigmas.toFixed(2)} SE)`);
  assert.ok(up.verdict === 'rise' && Math.abs(up.sigmas - 3) < 1e-9, `a head 3 SE up raises the vector (${up.sigmas.toFixed(2)} SE)`);
}

// the pin fails closed: a deal whose pinned vehicle the fleet no longer has ends the run by that name (Main's control)
{
  const pins = JSON.parse(readFileSync(PINNED_ROSTERS, 'utf8'));
  assert.equal(Object.keys(pins.deals).length, 24, 'every deal of the Horde sweep is pinned');
  const dir = mkdtempSync(join(tmpdir(), 'mode-aggression-pin-'));
  try {
    const gone = 'no_such_tank_268';
    const deal = pins.deals['1'];
    const file = join(dir, 'rosters.json');
    writeFileSync(file, JSON.stringify({ ...pins, deals: { 1: { ...deal, tanks: [...deal.tanks.slice(0, -1), gone] } } }));
    const missing = spawnSync(process.execPath, ['--max-old-space-size=4096', HARNESS, 'run', '--mode=endless_horde', '--seed=1', '--capS=1',
      '--player=m60a2', `--pinRoster=${file}`], { encoding: 'utf8' });
    assert.notEqual(missing.status, 0, 'a pinned vehicle the fleet does not have fails the run');
    assert.match(missing.stderr, new RegExp(`seed 1 pins ${gone}, which the fleet does not have`), 'by its name');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const sweepStarted = Date.now();
const PLANTS = [3, 1.5 * T_REV_S];
const finished = await pool([...battles.map((b) => () => run(b.mode, b.capS, b.seed, b.player)), ...PLANTS.map((standS) => () => plantRun(standS))], RECEIPT_JOBS);
const results = finished.slice(0, battles.length);
// a control that fails is reported with the sweep's misses, never before the sweep is judged
const controlMisses = [];
const plants = finished.slice(battles.length).map(({ standS, line }) => {
  const m = /stood ([\d.]+) s .*, (under way|destroyed): slow engaged samples (\d+), counted (\d+)/.exec(line);
  if (!m) { controlMisses.push(`the planted ${standS} s stand did not run: ${line || 'no PLANT line'}`); return `${standS} s none`; }
  const [, stoodS, end, slow, counted] = m;
  if (end !== 'under way') controlMisses.push(`the planted hull did not drive off its ${standS} s stand: ${line}`);
  if (!(Number(stoodS) >= standS)) controlMisses.push(`the planted stand fell short of its ${standS} s: ${line}`);
  if (!(Number(slow) > 0 && Number(counted) === Number(slow))) controlMisses.push(`a planted ${standS} s stand counts in full: ${line}`);
  return `${Number(standS.toFixed(3))} s ${counted}/${slow}`;
});

const runsOf = (mode) => results.filter((r) => r.mode === mode).sort((a, b) => a.seed - b.seed);
const [hordeRuns, infectedRuns, frontRuns, flagRuns, ballRuns] = SWEEPS.map((sweep) => runsOf(sweep.mode));
for (const sweep of SWEEPS) assert.equal(runsOf(sweep.mode).length, sweep.seeds.length, `${sweep.mode}: every deal of the sweep ran`);
const mean = (list, f) => list.reduce((n, r) => n + (f(r) ?? 0), 0) / list.length;

// Deals that fail a conduct ask through a named, unfixed defect (Main, 2026-11-02), by mode and seed, the asks and the
// cause. The list only shrinks: a listed deal that passes its asks fails the receipt until it is struck off here (and in
// cot-launch-state TESTS-OWED). Its other asks hold as on every deal.
// 2026-11-02: horde.6 and horde.24 struck off (the director's arrival leads on its side's knowledge, 84cb8f86a8; both pass)
const KNOWN_CONDUCT = new Map();
const conductMisses = [], known = [];
const judge = (mode, run, asks) => {
  const key = `${mode}.${run.seed}`, listed = KNOWN_CONDUCT.get(key);
  const failing = Object.entries(asks).filter(([, pass]) => !pass).map(([ask]) => ask);
  for (const ask of failing) {
    if (listed?.asks.includes(ask)) known.push(`${key} ${ask}`);
    else conductMisses.push(`${key} (${run.mapId}): ${ask}`);
  }
  if (listed && listed.asks.every((ask) => asks[ask] !== false)) conductMisses.push(`${key}: passes its listed asks (${listed.asks.join(', ')}): strike it off KNOWN_CONDUCT`);
};

// Endless Horde, wave 1, the fight seat with its four allies, 45 s a deal. Each deal keeps the wave's law: the law's
// enemies all arrived, at most the live cap at once, none within reach or in a human's sight; the HP split (owner
// 2026-10-17: "all the zombies actually have low hp"). Conduct on every deal: zombies stand still at most 5 % and advance
// at least 0.6 of their moving samples, never fall back, scoot, kite, settle or ram, and hunt only what their side spots.
const rules = matchRulesetFor('endless_horde');
const maps = new Map();
const deals = hordeRuns.map((horde) => {
  const wave1 = horde.horde.waves[0], zombies = horde.bravo, at = `seed ${horde.seed} (${horde.mapId})`;
  maps.set(horde.mapId, (maps.get(horde.mapId) ?? 0) + 1);
  assert.equal(wave1.enemies, hordeWaveTotal(rules.horde, 1, 1), `${at}: wave 1 fields the law (6)`);
  assert.equal(wave1.arrivals, wave1.enemies, `${at}: every enemy of the wave arrived`);
  assert.ok(wave1.peakAlive <= hordeMaxAlive(rules.horde, 1, 20), `${at}: at most the live cap at once`);
  assert.equal(wave1.spawnNear, 0, `${at}: no arrival inside spawnMinHumanM of a human`);
  assert.equal(wave1.spawnSeen, 0, `${at}: no arrival in a human's terrain line of sight`);
  assert.ok(Math.abs(wave1.hostileHullOfOwn - rules.horde.hostileHpScale) < 0.002, `${at}: zombie hull ${wave1.hostileHullOfOwn} of its own`);
  assert.ok(wave1.humanMaxHp >= wave1.hostileMaxHp / wave1.hostileHullOfOwn * 1.5, `${at}: the human hull is about twice a full hull`);
  judge('endless_horde', horde, {
    still: (zombies.engagedStillShare ?? 0) <= 0.05, advance: zombies.move.advance >= 0.6,
    flags: ['fallingBack', 'scooting', 'kiting', 'settling'].every((flag) => zombies.flags[flag] === 0),
    rams: horde.ramStats.hunterRams === 0, honesty: horde.huntHonesty.unspottedShare <= 0.02,
  });
  return { seed: horde.seed, mapId: horde.mapId, kills: wave1.zombieDeaths, enemies: wave1.enemies, advance: zombies.move.advance,
    still: zombies.engagedStillShare ?? 0, firstShotS: wave1.firstShotS, engageDistM: zombies.engageDistM };
});
assert.equal(rules.hpScale, 2, 'humans keep the doubled hull (never below their own)');
assert.equal(maps.size, 8, `the sweep covers the eight rotation maps (${[...maps.keys()].join(', ')})`);
for (const [mapId, n] of maps) assert.equal(n, 3, `three deals on ${mapId}`);
// the owner's three asks of a deal (2026-10-18: "increase aggression in that game mode too"): the five-tank sortie has
// destroyed all but two of the wave inside 45 s, the zombies advance (>= 0.8 of their moving samples) and never stand
// still in a fight (<= 5 % of their engaged samples)
const asks = (d) => d.kills >= d.enemies - 2 && d.advance >= 0.8 && d.still <= 0.05;
const meeting = deals.filter(asks).length, meanKills = mean(deals, (d) => d.kills), meanAdvance = mean(deals, (d) => d.advance);
// Main's bars (2026-11-02). OUTCOME, chaotic deal by deal: the owner's bar is 21 of the 24 meeting the three asks and the
// wave's mean kills at least 5.0 of 6. It is held as a KNOWN ratchet (the shortfall is the human sortie's fire, not the
// zombies' conduct), paired since 2026-11-02 (OUTCOME_RATCHET above; before it, one mean: 4.79, reset to 4.67 by ruling,
// then 4.71 and 4.96); every run prints the owner's bar and the gap, so a pass never reads as the bar met. The deal count
// is printed beside the owner's 21/24 and does not gate. The mean advance is held at 0.8, the engagement distance at 50 m
// on the mean, and first contact 8-25 s after the wave starts on 21 of the 24.
const OWNER_OUTCOME = { deals: 21, meanKills: 5.0 };
const table = deals.map((d) => `  seed ${d.seed} ${d.mapId}: kills ${d.kills}/${d.enemies}, advance ${d.advance}, still ${d.still}, first shot ${d.firstShotS} s${asks(d) ? '' : ' (misses an ask)'}`).join('\n');
const killsAt = Math.round(meanKills * 100) / 100;
assert.deepEqual(deals.map((d) => d.seed), SEEDS(24), 'the deals in seed order, as the paired vector');
const paired = pairedOutcome(deals.map((d) => d.kills));
const shortDeals = Math.max(0, OWNER_OUTCOME.deals - meeting), shortKills = Math.max(0, Math.round((OWNER_OUTCOME.meanKills - killsAt) * 100) / 100);
const outcome = `OUTCOME mean ${killsAt.toFixed(2)}, paired change ${paired.change >= 0 ? '+' : ''}${paired.change.toFixed(3)} kills = `
  + `${paired.sigmas >= 0 ? '+' : ''}${paired.sigmas.toFixed(1)} SE against ${OUTCOME_RATCHET.setBy} (SE ${paired.se.toFixed(3)}; fails below -${OUTCOME_BAND_SE} SE) `
  + `(deals ${meeting}/24, owner ${OWNER_OUTCOME.deals}/24 · ${OWNER_OUTCOME.meanKills.toFixed(1)}: `
  + (shortDeals || shortKills ? `short ${shortDeals} deal${shortDeals === 1 ? '' : 's'}, ${shortKills.toFixed(2)} kills)` : 'met)');
console.log(outcome);
if (paired.verdict === 'rise') console.log(`  the paired ratchet can rise to this run: kills [${deals.map((d) => d.kills).join(', ')}]`);
const misses = [];
if (paired.verdict === 'fail') misses.push(`wave-1 kills fell ${paired.sigmas.toFixed(1)} SE against the paired ratchet (${outcome})`);
if (meanAdvance < 0.8) misses.push(`Horde mean advance ${meanAdvance.toFixed(3)} (want >= 0.8)`);
const engaged = deals.filter((d) => d.engageDistM != null), engageDistM = mean(engaged, (d) => d.engageDistM);
if (engageDistM > 50) misses.push(`zombies fight close: ${engageDistM.toFixed(1)} m on the mean (want <= 50)`);
const contact = deals.filter((d) => d.firstShotS >= 8 && d.firstShotS <= 25).length;
if (contact < 21) misses.push(`first contact 8-25 s after the wave starts on ${contact} of 24 (want >= 21)`);

// Infected, 60 s a deal: the infected rise round the survivors and close on them. On the mean: within 150 m of a survivor at
// least 0.8 of their samples, 90 m off them at most. On every deal: standing still at most 6 % of their engaged samples a
// second after a (re)spawn and 10 % counting the spawns (round 2: the 90-150 m ring puts a revived infected in a fight at
// its first sample, still accelerating from rest), never falling back or scooting, no rams, no hunt on an unspotted survivor.
for (const run of infectedRuns) {
  const hunters = run.bravo;
  judge('infected', run, {
    settledStill: hunters.engagedStillSettledShare <= 0.06, still: hunters.engagedStillShare <= 0.1,
    flags: hunters.flags.fallingBack <= 0.02 && hunters.flags.scooting <= 0.05, rams: run.ramStats.hunterRams === 0,
    honesty: run.huntHonesty.unspottedShare <= 0.02,
  });
}
const within150 = mean(infectedRuns, (r) => r.infected.huntWithin150Share), survivorM = mean(infectedRuns, (r) => r.infected.huntDistToSurvivorM);
if (within150 < 0.8) misses.push(`infected within 150 m of a survivor ${within150.toFixed(3)} on the mean (want >= 0.8)`);
if (survivorM > 90) misses.push(`infected ${survivorM.toFixed(1)} m from the survivors on the mean (want <= 90)`);

// Frontline Assault, 90 s a deal: the first sector is fought for. On every deal: no defender placed within the line
// guard's reach of an attacker or in an attacker's terrain sight, but for the guard's designed fallback (item 9: no slot
// clear, the clearest taken), which the harness proves from the guard's own log (every candidate it tried re-measured,
// none clear, the defender on the best: placedClearest; a fallback it cannot prove counts as clearestUnproven, a miss);
// nobody on either side scoots. Contested (sector 1 kills, or the first line still held at 45 s) on at least 7 of the 8.
const lineGuardM = matchRulesetFor('frontline_assault').assault.lineGuard.minAttackM;
for (const run of frontRuns) {
  judge('frontline_assault', run, {
    placedNear: run.frontline.placedNear === 0, placedSeen: run.frontline.placedSeen === 0, clearestProven: run.frontline.clearestUnproven === 0,
    scoot: (run.alpha.flags.scooting ?? 0) === 0 && (run.bravo.flags.scooting ?? 0) === 0,
  });
}
const contested = frontRuns.filter((r) => r.frontline.sector1Kills > 0 || !(r.frontline.lines[0]?.atS < 45)).length;
const clearest = frontRuns.reduce((n, r) => n + r.frontline.placedClearest, 0);
if (contested < 7) misses.push(`Frontline sector 1 contested on ${contested} of 8 (want >= 7; line guard ${lineGuardM} m)`);

// Capture the Flag, 120 s a deal: the flags are run. A flag is lifted inside two minutes on at least 7 of the 8; on every
// deal the flag missions keep their hulls (released at most 2 % of either side's samples).
for (const run of flagRuns) {
  judge('capture_the_flag', run, {
    missionReleased: (run.alpha.flags.missionReleased ?? 0) <= 0.02 && (run.bravo.flags.missionReleased ?? 0) <= 0.02,
  });
}
const lifted = flagRuns.filter((r) => r.ctf.pickups >= 1).length;
if (lifted < 7) misses.push(`a flag is taken inside 120 s on ${lifted} of 8 (want >= 7)`);

// Turbo Ball, 120 s a deal: the ball is pursued. At least 20 touches on the mean; both sides touching it, and two strikers a
// side on it (striker share above 0.2 each side), on at least 7 of the 8.
const touches = mean(ballRuns, (r) => r.ball.totalTouches);
const bothTouch = ballRuns.filter((r) => r.ball.touches.alpha > 0 && r.ball.touches.bravo > 0).length;
const strikers = ballRuns.filter((r) => r.ball.pursuit.strikerShare.alpha > 0.2 && r.ball.pursuit.strikerShare.bravo > 0.2).length;
if (touches < 20) misses.push(`the ball is played: ${touches.toFixed(1)} touches in 120 s on the mean (want >= 20)`);
if (bothTouch < 7) misses.push(`both sides touch the ball on ${bothTouch} of 8 (want >= 7)`);
if (strikers < 7) misses.push(`two strikers a side on the ball on ${strikers} of 8 (want >= 7)`);

misses.push(...conductMisses, ...controlMisses);
assert.deepEqual(misses, [], `the mode sweeps:\n${table}`);
console.log(`mode-aggression-harness.selftest: ${spec.targets.length} targets parse; compare passes and fails as stated; `
  + `${results.length} battles in ${Math.round((Date.now() - sweepStarted) / 1000)} s (${RECEIPT_JOBS} at a time); a stand outlasts T_REV `
  + `${T_REV_TICKS} ticks (the Chieftain Mk 3's reversal ${JSON.stringify(reversal)} + one sample), planted stands counted ${plants.join(', ')}. Horde wave 1 over 24 deals: `
  + `${outcome}, mean advance ${meanAdvance.toFixed(3)}; infected ${survivorM.toFixed(0)} m from the survivors; Frontline contested `
  + `${contested}/8 (${clearest} proven clearest placement${clearest === 1 ? '' : 's'}); a flag lifted on ${lifted}/8; Turbo Ball ${touches.toFixed(0)} touches; conduct on every deal, known by seed: `
  + `${known.join(', ') || 'none'}`);
