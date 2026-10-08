import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { preparePacingRoster } from './pacingRoster.test-support.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { MAP_IDS } from '../src/world/maps/index.ts';
import { createDedicatedWorldCollision } from './dedicatedWorldCollision.ts';
import { PACING_SAMPLES, pacingSeed, pacingStats, pacingVerdicts } from './battlePacing.test-support.mjs';

// Modes (docs/DEVELOPMENT.md, "The pacing tail"):
// - core (npm test): the 132 matches, four per map, judged by the gate below; one match may end inside 90 s.
// - tail (COT_PACING_TAIL=1, `npm run test:pacing:tail`): the 264 matches, the 132 plus samples 4-7 on every map,
//   judged by the same gate with the owner's floor as a rate: at most 0.5 % of them inside 90 s.
// - COT_PACING_MAPS=a,b plays those maps' matches of the full run (the seeds are keyed to each map's index in MAP_IDS)
//   and reports them without the distribution gate, which a subset of the maps cannot answer.
//   COT_PACING_REPORT=<file> writes the match records: tools/pacing-tail.mjs merges a run played in shards, judges it
//   by the same gate and, given the PR head's records on the same matches, compares the share inside 90 s.
const TAIL = process.env.COT_PACING_TAIL === '1';
const SAMPLES = TAIL ? PACING_SAMPLES.tail : PACING_SAMPLES.core;
const MAPS = process.env.COT_PACING_MAPS
  ? process.env.COT_PACING_MAPS.split(',').filter((id) => MAP_IDS.includes(id))
  : MAP_IDS;
const PARTIAL = MAPS.length < MAP_IDS.length;
const matches = [];

// Deterministic default private-lobby rosters per battlefield. The human remains idle deliberately: this is the
// historical worst case where the bot fill used to converge, ram, and decide matches in roughly two minutes. It also
// verifies bots do not dog-pile an inactive player.
for (const mapId of MAPS) {
  const mapMatches = [];
  for (let sample = 0; sample < SAMPLES; sample++) {
    // keyed to the map's index in MAP_IDS: a run over some maps plays the full run's matches on them (a seed keyed to
    // the filtered list played other matches)
    const matchSeed = pacingSeed(MAP_IDS, mapId, sample);
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
    const record = { mapId, seed: matchSeed, sample, timeS: match.timeS, result: match.resultReason,
      roster: players.map((player) => player.specId) };
    matches.push(record);
    mapMatches.push(record);
  }
  const mapTimeouts = mapMatches.filter((match) => match.result === 'time_limit').length;
  console.log(`${mapId}: ${mapMatches.map((match) => match.timeS.toFixed(0)).join('/')}s ` +
    `timeouts=${mapTimeouts}/${SAMPLES}`);
}

if (process.env.COT_PACING_REPORT) {
  writeFileSync(process.env.COT_PACING_REPORT, JSON.stringify({
    mode: TAIL ? 'tail' : 'core', samples: SAMPLES, maps: MAPS, matches,
  }, null, 1));
}

// The gate (battlePacing.test-support.mjs). History: active route recovery removes idle deployment time, and
// no-contact bots search from 25 s (fc966a16d). The owner accepted the faster battles that gives (ruling 2026-10-03):
// a 3–8 minute median (209 s measured; searching after the old 120–165 s deployment windows gave 342 s). The fast
// tail still guards against bots converging and deciding matches in about two minutes. Each outcome is chaotic in its
// inputs, so the tail is a share, not a count: p10 at least 120 s, at most 5 % of the matches inside 120 s (5 of 132
// measured, 98–119 s), none inside 90 s. PR #9 (2026-10-04): the ruling replaced the pending-ruling band and the two
// named floor exceptions the PR carried (Polders 41002, Mars 51000).
// The owner's ruling of 2026-10-05, "floor as a tail rate", replaces "none inside 90 s": the fastest single match is a
// lottery (the physics lane's set moved 91 of the 132 times by more than 10 %, and the inside-90 match moved from seed
// to seed with every change), so the floor is a rate judged on the tail mode's 264 matches: at most 0.5 % inside 90 s,
// and no more than the PR head's share on the same matches (the documented procedure; a receipt cannot run the head).
// The core run's 132 matches allow one. Each fast match is still printed by map, seed and seconds, so a seed that
// crosses into the tail is named in the log.
const stats = pacingStats(matches);
for (const entry of stats.fast) {
  console.log(`battlePacing.selftest: fast match ${entry.mapId} seed ${entry.seed} ${entry.timeS.toFixed(0)} s`);
}
const summary = `median=${stats.medianS.toFixed(1)}s p10=${stats.p10S.toFixed(1)}s sub120=${stats.sub120} ` +
  `sub90=${stats.sub90} timeouts=${stats.timeouts}/${stats.matches}`;
if (PARTIAL) {
  console.log(`battlePacing.selftest: ${MAPS.length} of ${MAP_IDS.length} maps, ${summary}; a subset of the maps has `
    + 'no distribution gate (tools/pacing-tail.mjs judges a run merged from shards)');
} else {
  for (const verdict of pacingVerdicts(stats)) assert.ok(verdict.ok, `battlePacing (${TAIL ? 'tail' : 'core'}): ${verdict.label}`);
  console.log(`battlePacing.selftest: ${TAIL ? 'tail' : 'core'} ${summary}`);
}
