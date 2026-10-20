// The battlePacing matches themselves (moved here from server/battlePacing.selftest.mjs on 2026-10-16, test-speed R9a,
// unchanged): deterministic default private-lobby rosters per battlefield. The human remains idle deliberately: this is
// the historical worst case where the bot fill used to converge, ram, and decide matches in roughly two minutes. It also
// verifies bots do not dog-pile an inactive player. Played by the eight shard receipts
// (server/battlePacingShard<n>.selftest.mjs) and by server/battlePacing.selftest.mjs for any share it has no records of.
import assert from 'node:assert/strict';
import { preparePacingRoster } from './pacingRoster.test-support.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { MAP_IDS } from '../src/world/maps/index.ts';
import { createDedicatedWorldCollision } from './dedicatedWorldCollision.ts';
import { pacingMapLine, pacingSeed } from './battlePacing.test-support.mjs';

/**
 * Plays `samples` matches on each of `maps`; returns their records (map order, then sample order) and one log line per
 * map. `onLine` prints each line as its map finishes.
 */
export async function playPacingMaps(maps, samples, onLine = () => {}) {
  const matches = [];
  const lines = [];
  for (const mapId of maps) {
    const mapMatches = [];
    for (let sample = 0; sample < samples; sample++) {
      // keyed to the map's index in MAP_IDS: a run over some maps plays the full run's matches on them (a seed keyed to
      // the filtered list played other matches)
      const matchSeed = pacingSeed(MAP_IDS, mapId, sample);
      const lobby = {
        phase: 'starting',
        matchSeed,
        mapId,
        teamSize: 2,
        players: [{ id: 'host', name: 'Host', specId: 'm1a1_abrams_hc', team: 'alpha' }],
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
    const line = pacingMapLine(mapId, mapMatches, samples);
    lines.push(line);
    onLine(line);
  }
  return { matches, lines };
}
