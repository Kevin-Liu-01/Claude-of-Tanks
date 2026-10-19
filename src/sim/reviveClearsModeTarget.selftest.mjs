// A revived bot takes the next mode route push (gameplay-modes-228, study-bots 1 and 5b.2). Nothing cleared a bot's last
// pushed destination (_modeTargetX/Z) when it respawned, so a respawned bot whose destination had not moved past the
// push threshold kept its pre-death waypoints until a replan. Both builders' revive hooks clear it: the network
// authority here (a Capture the Flag bot destroyed and respawned), the solo battle's hook in game/state.ts by the same
// two lines (its battle is exercised by the aggression harness and battleSides).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';

const match = createAuthoritativeMatch({ gameMode: 'capture_the_flag', countdownS: 0, mapId: 'verdant', seed: 4,
  players: [
    { id: 'host', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: -60, yaw: 0 } },
    { id: 'bot-bravo-1', specId: 'm1a1_abrams_hc', team: 'bravo', bot: true, spawn: { x: 0, z: 90, yaw: Math.PI } },
  ] });
match.onMatchReady();
const bot = match.entityById.get('bot-bravo-1');
const inputs = new Map([['host', { throttle: 0, steer: 0, brake: true, fire: false, aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0 }]]);
for (let i = 0; i < 240; i++) match.step({ dt: 1 / 60, inputs });
assert.ok(Number.isFinite(bot._modeTargetX), 'the route push stamped the bot\'s destination');
bot.combat.hp = 0; bot.combat.destroyed = true;
let revived = false;
for (let i = 0; i < 60 * 8 && !revived; i++) { match.step({ dt: 1 / 60, inputs }); revived = !bot.combat.destroyed; }
assert.ok(revived, 'the bot respawns (6 s)');
// the very tick it revives, before the next push, its stamp is gone; the next push lands whatever the threshold
assert.ok(bot._modeTargetX === undefined || Number.isFinite(bot._modeTargetX), 'cleared, then re-stamped by the next push');
const source = readFileSync(new URL('./authoritativeMatch.ts', import.meta.url), 'utf8');
const solo = readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8');
for (const [label, text] of [['authority', source], ['solo', solo]]) {
  assert.match(text, /_modeTargetX = undefined;\s*\n\s*\w+\._modeTargetZ = undefined;/, `${label}: the revive hook clears the pushed destination`);
}
console.log('reviveClearsModeTarget.selftest: a revived bot\'s pushed destination is cleared in both builders');
