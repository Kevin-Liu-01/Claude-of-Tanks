import assert from 'node:assert/strict';
import { preparePacingRoster } from './pacingRoster.test-support.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { MAP_IDS } from '../src/world/maps/index.ts';
import { createDedicatedWorldCollision } from './dedicatedWorldCollision.ts';

const MAPS = process.env.COT_PACING_MAPS
  ? process.env.COT_PACING_MAPS.split(',').filter((id) => MAP_IDS.includes(id))
  : MAP_IDS;
const durations = [];
const resultReasons = [];
const matches = [];

// Four deterministic default private-lobby rosters per battlefield.  The
// human remains idle deliberately: this is the historical worst case where
// the bot fill used to converge, ram, and decide matches in roughly two
// minutes.  It also verifies bots do not dog-pile an inactive player.
for (let mapIndex = 0; mapIndex < MAPS.length; mapIndex++) {
  const mapId = MAPS[mapIndex];
  const mapDurations = [];
  for (let sample = 0; sample < 4; sample++) {
    const matchSeed = 21000 + mapIndex * 1000 + sample;
    const lobby = {
      phase: 'starting',
      matchSeed,
      mapId,
      teamSize: 2,
      players: [{ id: 'host', name: 'Host', specId: 'm1a2', team: 'alpha' }],
    };
    const players = await preparePacingRoster(lobby);
    const match = createAuthoritativeMatch({
      players,
      mapId,
      seed: matchSeed,
      countdownS: 0,
      worldCollision: createDedicatedWorldCollision(mapId),
    });
    match.onMatchReady();
    // Floating accumulation can cross the exact 900 s boundary one fixed
    // step after 54,000; allow that single simulation quantum.
    for (let tick = 0; tick < 15 * 60 * 60 + 2 && !match.result; tick++) {
      match.step({ dt: 1 / 60, inputs: new Map() });
    }
    assert.ok(match.result, `${mapId}/${sample}: match resolves by the 15 minute cap`);
    if (match.resultReason === 'time_limit') {
      assert.ok(match.timeS >= 899,
        `${mapId}/${sample}: time-limit result occurs at the configured cap`);
    }
    durations.push(match.timeS);
    resultReasons.push(match.resultReason);
    matches.push({ mapId, seed: matchSeed, timeS: match.timeS, roster: players.map((player) => player.specId) });
    mapDurations.push(match.timeS);
  }
  const mapTimeouts = resultReasons.slice(-mapDurations.length)
    .filter((reason) => reason === 'time_limit').length;
  console.log(`${mapId}: ${mapDurations.map((v) => v.toFixed(0)).join('/')}s ` +
    `timeouts=${mapTimeouts}/4`);
}

durations.sort((a, b) => a - b);
const medianS = durations[Math.floor(durations.length / 2)];
const p10S = durations[Math.floor(durations.length * 0.1)];
const subTwoMinute = durations.filter((duration) => duration < 120).length;
const timeouts = resultReasons.filter((reason) => reason === 'time_limit').length;

// Active route recovery removes idle deployment time, and no-contact bots search from 25 s (fc966a16d). The owner
// accepted the faster battles that gives (ruling 2026-10-03): a 3–8 minute median (209 s measured; searching after
// the old 120–165 s deployment windows gave 342 s). The fast tail still guards against bots converging and deciding
// matches in about two minutes. Each outcome is chaotic in its inputs, so the tail is a share, not a count: p10 at
// least 120 s, at most 5 % of the matches inside 120 s (5 of 132 measured, 98–119 s), none inside 90 s.
// PR #9 (2026-10-04): the ruling replaces the pending-ruling band and the two named floor exceptions the PR carried
// (Polders 41002, Mars 51000); neither seed ends inside 120 s on the merged tree. Each fast match is still printed by
// map, seed and seconds, so a seed that crosses into the tail is named in the log.
const MEDIAN_BAND_S = { min: 180, max: 480 };
assert.ok(medianS >= MEDIAN_BAND_S.min && medianS <= MEDIAN_BAND_S.max,
  `default bot match median must stay in the 3-8 minute band (got ${medianS.toFixed(1)} s)`);
assert.ok(p10S >= 120,
  `even the fast tail must retain a tactical opening (p10 ${p10S.toFixed(1)} s)`);
const maxSubTwoMinute = Math.round(durations.length * 0.05);
assert.ok(subTwoMinute <= maxSubTwoMinute,
  `at most ${maxSubTwoMinute} default bot matches may end inside two minutes (got ${subTwoMinute})`);
assert.ok(durations[0] >= 90, `no default bot match collapses inside 90 s (fastest ${durations[0].toFixed(1)} s)`);
for (const entry of matches.filter((match) => match.timeS < 120)) {
  console.log(`battlePacing.selftest: fast match ${entry.mapId} seed ${entry.seed} ${entry.timeS.toFixed(0)} s`);
}
const maxTimeouts = Math.floor(durations.length * 0.125);
assert.ok(timeouts <= maxTimeouts,
  `no more than 12.5% may reach the safety cap (got ${timeouts}/${durations.length})`);

console.log(`battlePacing.selftest: median=${medianS.toFixed(1)}s p10=${p10S.toFixed(1)}s ` +
  `sub120=${subTwoMinute} timeouts=${timeouts}/${durations.length}`);
