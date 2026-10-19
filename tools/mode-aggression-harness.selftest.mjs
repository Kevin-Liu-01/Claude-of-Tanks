// The mode aggression harness (gameplay-modes-228) as a receipt: its compare gate reads targets the way the build plan
// states them, and two short seeded runs through the real solo battle pin the asks the owner made of the zombie modes
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
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// ------------------------------------------------------------------------------------- two short seeded battles ---
const run = (mode, capS) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--max-old-space-size=4096', HARNESS, 'run', `--mode=${mode}`, '--seed=1', `--capS=${capS}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
  child.on('close', (code) => {
    if (code !== 0) { reject(new Error(`${mode} run exited ${code}: ${err}`)); return; }
    resolve(JSON.parse(out.trim().split('\n').pop()));
  });
});
const [horde, infected] = await Promise.all([run('endless_horde', 45), run('infected', 60)]);

// Endless Horde, seed 1 (Verdant), the fight seat with its four allies, 45 s: the first wave
const rules = matchRulesetFor('endless_horde');
const wave1 = horde.horde.waves[0];
assert.equal(wave1.enemies, hordeWaveTotal(rules.horde, 1, 1), 'wave 1 fields the law (6)');
assert.equal(wave1.arrivals, wave1.enemies, 'every enemy of the wave arrived');
assert.ok(wave1.zombieDeaths >= wave1.enemies - 2, `the five-tank sortie has destroyed most of wave 1 inside 45 s (${wave1.zombieDeaths}/${wave1.enemies})`);
assert.ok(wave1.peakAlive <= hordeMaxAlive(rules.horde, 1, 20), 'at most the live cap at once');
assert.equal(wave1.spawnNear, 0, 'no arrival inside spawnMinHumanM of a human');
assert.equal(wave1.spawnSeen, 0, "no arrival in a human's terrain line of sight");
assert.ok(wave1.firstShotS >= 8 && wave1.firstShotS <= 25, `first contact 8-25 s after the wave starts (${wave1.firstShotS})`);
// the HP split (owner 2026-10-17: "all the zombies actually have low hp"): fodder at 0.15 of their own hull, humans doubled
assert.ok(Math.abs(wave1.hostileHullOfOwn - rules.horde.hostileHpScale) < 0.002, `zombie hull ${wave1.hostileHullOfOwn} of its own`);
assert.equal(rules.hpScale, 2, 'humans keep the doubled hull (never below their own)');
assert.ok(wave1.humanMaxHp >= wave1.hostileMaxHp / wave1.hostileHullOfOwn * 1.5, 'the human hull is about twice a full hull');
// the rush (owner 2026-10-18: "increase aggression in that game mode too")
const zombies = horde.bravo;
assert.ok(zombies.move.advance >= 0.8, `zombies advance (${zombies.move.advance})`);
assert.ok(zombies.engagedStillShare <= 0.05, `zombies never stand still in a fight (${zombies.engagedStillShare})`);
assert.ok(zombies.engageDistM <= 50, `zombies fight close (${zombies.engageDistM} m)`);
for (const flag of ['fallingBack', 'scooting', 'kiting', 'settling']) assert.equal(zombies.flags[flag], 0, `zombies never ${flag}`);
assert.equal(horde.ramStats.hunterRams, 0, 'hunters never ram');
assert.ok(horde.huntHonesty.unspottedShare <= 0.02, 'hunts route on what the team spots, never a live unspotted position');

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

console.log(`mode-aggression-harness.selftest: ${spec.targets.length} targets parse; compare passes and fails as stated; Horde wave 1 `
  + `${wave1.enemies} on the law (first contact ${wave1.firstShotS} s, zombies ${zombies.engageDistM} m, advance ${zombies.move.advance}); `
  + `infected ${infected.infected.huntDistToSurvivorM} m from the survivors`);
