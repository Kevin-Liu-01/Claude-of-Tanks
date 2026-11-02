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
import { hordeMaxAlive, hordeWaveTotal, matchRulesetFor } from '../src/sim/matchRuleset.ts';

const HARNESS = fileURLToPath(new URL('./mode-aggression-harness.mjs', import.meta.url));
const TARGETS = fileURLToPath(new URL('./mode-aggression-targets.json', import.meta.url));

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
  const child = spawn(process.execPath, ['--max-old-space-size=4096', HARNESS, 'run', `--mode=${mode}`, `--seed=${seed}`, `--capS=${capS}`, `--player=${player}`], { stdio: ['ignore', 'pipe', 'pipe'] });
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
// (268, item 10) Horde's first wave is judged over a sweep, not one pinned deal (seed 9 since item 7): the deals are chaotic,
// so the owner's asks are bars over 24 fixed deals, three a map on the eight rotation maps (seed s plays
// MAP_ROTATION[(s - 1) % 8]; seeds 1, 6 and 17 among them), six at a time beside the other modes' battles.
const HORDE_SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);
const pool = async (jobs, limit) => {
  const out = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); } }));
  return out;
};
const [hordeRuns, [infected, front, flags, pitch]] = await Promise.all([
  pool(HORDE_SEEDS.map((seed) => () => run('endless_horde', 45, seed, 'm60a2')), 6),
  Promise.all([run('infected', 60, 1, 'm60a2'), run('frontline_assault', 90, 4, 'm1a3'), run('capture_the_flag', 120, 5, 'kf51_evo'),
    run('turbo_ball', 120, 7, 'm1a3')]),
]);

// Endless Horde, wave 1, the fight seat with its four allies, 45 s a deal. Each deal keeps the wave's law: the law's
// enemies all arrived, at most the live cap at once, none within reach or in a human's sight; the HP split (owner
// 2026-10-17: "all the zombies actually have low hp"); zombies that never fall back, scoot, kite, settle or ram, and that
// hunt only what their side spots (the engagement distance and the hunt's honesty over the sweep: the one pinned deal's
// asks, per deal, were already missed on four of the 24 before item 10 — engagement 54-55 m, unspotted 0.022-0.024).
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
  for (const flag of ['fallingBack', 'scooting', 'kiting', 'settling']) assert.equal(zombies.flags[flag], 0, `${at}: zombies never ${flag}`);
  assert.equal(horde.ramStats.hunterRams, 0, `${at}: hunters never ram`);
  assert.ok(wave1.firstShotS >= 8 && wave1.firstShotS <= 25, `${at}: first contact 8-25 s after the wave starts (${wave1.firstShotS})`);
  return { seed: horde.seed, mapId: horde.mapId, kills: wave1.zombieDeaths, enemies: wave1.enemies, advance: zombies.move.advance,
    still: zombies.engagedStillShare ?? 0, firstShotS: wave1.firstShotS, engageDistM: zombies.engageDistM,
    huntSamples: horde.huntHonesty.samples, unspotted: horde.huntHonesty.unspottedShare * horde.huntHonesty.samples };
});
assert.equal(rules.hpScale, 2, 'humans keep the doubled hull (never below their own)');
assert.equal(maps.size, 8, `the sweep covers the eight rotation maps (${[...maps.keys()].join(', ')})`);
for (const [mapId, n] of maps) assert.equal(n, 3, `three deals on ${mapId}`);
// the owner's three asks of a deal (2026-10-18: "increase aggression in that game mode too"): the five-tank sortie has
// destroyed all but two of the wave inside 45 s, the zombies advance (>= 0.8 of their moving samples) and never stand
// still in a fight (<= 5 % of their engaged samples)
const asks = (d) => d.kills >= d.enemies - 2 && d.advance >= 0.8 && d.still <= 0.05;
const mean = (f) => deals.reduce((n, d) => n + f(d), 0) / deals.length;
const meeting = deals.filter(asks).length, meanKills = mean((d) => d.kills), meanAdvance = mean((d) => d.advance);
// Main's bars (2026-11-02). OUTCOME, chaotic deal by deal: at least 21 of the 24 meet the three asks, and the wave's mean
// kills are at least 5.0 of 6. CONDUCT, a defect on any deal: standing still at most 5 % and advance at least 0.6 on every
// deal, the mean advance at least 0.8.
const table = deals.map((d) => `  seed ${d.seed} ${d.mapId}: kills ${d.kills}/${d.enemies}, advance ${d.advance}, still ${d.still}, first shot ${d.firstShotS} s${asks(d) ? '' : ' (misses an ask)'}`).join('\n');
const misses = [];
if (meeting < 21) misses.push(`${meeting} of 24 deals meet the three asks (want >= 21)`);
if (meanKills < 5) misses.push(`mean wave-1 kills ${meanKills.toFixed(2)} (want >= 5.0)`);
for (const d of deals) {
  if (d.still > 0.05) misses.push(`seed ${d.seed} (${d.mapId}) stands still ${d.still} of its engaged samples (want <= 0.05)`);
  if (d.advance < 0.6) misses.push(`seed ${d.seed} (${d.mapId}) advances ${d.advance} (want >= 0.6)`);
}
if (meanAdvance < 0.8) misses.push(`mean advance ${meanAdvance.toFixed(3)} (want >= 0.8)`);
assert.deepEqual(misses, [], `Horde wave 1 over the 24-deal sweep:\n${table}`);
const engaged = deals.filter((d) => d.engageDistM != null), engageDistM = engaged.reduce((n, d) => n + d.engageDistM, 0) / engaged.length;
assert.ok(engageDistM <= 50, `zombies fight close (${engageDistM.toFixed(1)} m on the mean)`);
const huntSamples = deals.reduce((n, d) => n + d.huntSamples, 0), unspotted = deals.reduce((n, d) => n + d.unspotted, 0) / huntSamples;
assert.ok(unspotted <= 0.02, `hunts route on what the team spots, never a live unspotted position (${unspotted.toFixed(3)} of ${huntSamples} hunt samples)`);

// Infected, seed 1 (Verdant), 60 s: the infected rise round the survivors and close on them
const hunters = infected.bravo;
assert.ok(infected.infected.huntWithin150Share >= 0.8, `infected within 150 m of a survivor (${infected.infected.huntWithin150Share})`);
assert.ok(infected.infected.huntDistToSurvivorM <= 90, `infected close on the survivors (${infected.infected.huntDistToSurvivorM} m)`);
// settled: a second or more after a (re)spawn (round 2: the 90-150 m ring puts a revived infected in a fight at its first
// sample, still accelerating from rest; in this window 15 of the 26 still samples were a hull's first second)
assert.ok(hunters.engagedStillSettledShare <= 0.06, `the infected keep moving in a fight (${hunters.engagedStillSettledShare}; with the spawns ${hunters.engagedStillShare})`);
assert.ok(hunters.engagedStillShare <= 0.1, `the infected keep moving in a fight, their spawns counted (${hunters.engagedStillShare})`);
assert.ok(hunters.flags.fallingBack <= 0.02 && hunters.flags.scooting <= 0.05, 'the infected neither fall back nor scoot');
assert.equal(infected.ramStats.hunterRams, 0, 'the infected never ram');
assert.ok(infected.huntHonesty.unspottedShare <= 0.02, 'the infected hunt only what their side spots');

// Frontline Assault, seed 4 (Desert), 90 s: the first sector is fought for — its defenders stand on their line out of the
// attack's reach and sight at the start, and nobody on either side falls back far or scoots
const lineGuardM = matchRulesetFor('frontline_assault').assault.lineGuard.minAttackM;
assert.equal(front.frontline.placedNear, 0, `no defender is placed within the line guard's ${lineGuardM} m of an attacker`);
assert.equal(front.frontline.placedSeen, 0, "no defender is placed in an attacker's terrain sight");
assert.ok(front.frontline.sector1Kills > 0 || !(front.frontline.lines[0]?.atS < 45), `sector 1 is contested (kills ${front.frontline.sector1Kills}, taken at ${front.frontline.lines[0]?.atS ?? '—'} s)`);
for (const side of ['alpha', 'bravo']) assert.equal(front[side].flags.scooting ?? 0, 0, `Frontline ${side}: no shoot-and-scoot`);
// Capture the Flag, seed 5 (Winter), 120 s: the flags are run — a flag is lifted inside two minutes
assert.ok(flags.ctf.pickups >= 1, `a flag is taken inside 120 s (${flags.ctf.pickups}; first at ${flags.ctf.firstPickupS} s)`);
assert.ok((flags.alpha.flags.missionReleased ?? 0) <= 0.02 && (flags.bravo.flags.missionReleased ?? 0) <= 0.02, 'flag missions keep their hulls');
// Turbo Ball, seed 7 (Steppe), 120 s: the ball is pursued — touched, struck at and contested by both sides
assert.ok(pitch.ball.totalTouches >= 20, `the ball is played (${pitch.ball.totalTouches} touches in 120 s)`);
assert.ok(pitch.ball.touches.alpha > 0 && pitch.ball.touches.bravo > 0, 'both sides touch it');
assert.ok(pitch.ball.pursuit.strikerShare.alpha > 0.2 && pitch.ball.pursuit.strikerShare.bravo > 0.2, 'two strikers a side are on it');

console.log(`mode-aggression-harness.selftest: ${spec.targets.length} targets parse; compare passes and fails as stated; Horde wave 1 `
  + `over 24 deals: ${meeting}/24 meet the three asks, mean kills ${meanKills.toFixed(2)}, mean advance ${meanAdvance.toFixed(3)}, no deal over 5 % still; `
  + `infected ${infected.infected.huntDistToSurvivorM} m from the survivors; Frontline sector 1 kills ${front.frontline.sector1Kills}; `
  + `CTF first pickup ${flags.ctf.firstPickupS} s; Turbo Ball ${pitch.ball.totalTouches} touches`);
