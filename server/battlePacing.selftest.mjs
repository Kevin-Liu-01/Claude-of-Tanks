import assert from 'node:assert/strict';
import { buildPrivateMatchPlayers } from '../src/net/privateMatchHandoff.js';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.js';
import { createDedicatedWorldCollision } from './dedicatedWorldCollision.js';

const MAPS = ['verdant', 'desert', 'winter', 'urban', 'coastal', 'autumn', 'steppe', 'railyard'];
const durations = [];

// Four deterministic default private-lobby rosters per battlefield.  The
// human remains idle deliberately: this is the historical worst case where
// the bot fill used to converge, ram, and decide matches in roughly two
// minutes.  It also verifies bots do not dog-pile an inactive player.
for (let mapIndex = 0; mapIndex < MAPS.length; mapIndex++) {
  const mapId = MAPS[mapIndex];
  for (let sample = 0; sample < 4; sample++) {
    const matchSeed = 21000 + mapIndex * 1000 + sample;
    const lobby = {
      phase: 'starting',
      matchSeed,
      mapId,
      teamSize: 2,
      players: [{ id: 'host', name: 'Host', specId: 'm1a2', team: 'alpha' }],
    };
    const match = createAuthoritativeMatch({
      players: buildPrivateMatchPlayers(lobby),
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
    if (match.timeS >= 899) {
      assert.equal(match.resultReason, 'time_limit',
        `${mapId}/${sample}: cap result is identified as time_limit`);
    }
    durations.push(match.timeS);
  }
}

durations.sort((a, b) => a - b);
const medianS = durations[Math.floor(durations.length / 2)];
const p10S = durations[Math.floor(durations.length * 0.1)];
const subTwoMinute = durations.filter((duration) => duration < 120).length;
const timeouts = durations.filter((duration) => duration >= 899).length;

assert.ok(medianS >= 300 && medianS <= 480,
  `default bot match median must stay in the 5-8 minute band (got ${medianS.toFixed(1)} s)`);
assert.ok(p10S >= 180,
  `even the fast tail must retain a tactical opening (p10 ${p10S.toFixed(1)} s)`);
assert.equal(subTwoMinute, 0, 'default bot matches no longer collapse inside two minutes');
assert.ok(timeouts <= 4, `no more than 12.5% may reach the safety cap (got ${timeouts}/32)`);

console.log(`battlePacing.selftest: median=${medianS.toFixed(1)}s p10=${p10S.toFixed(1)}s ` +
  `sub120=${subTwoMinute} timeouts=${timeouts}/32`);
