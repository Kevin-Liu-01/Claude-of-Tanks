// The room's arrangement reaches the match (lane mp/ui-sync-check, 2026-09-30). Before this receipt the browser host
// (matchHostCore) and the LAN helper's in-process match booted `matchRulesetFor(mode)` alone: a Zone Control lobby
// promising "First to 100" (the rule card reads matchRulesetFor(mode, null, arrangement)) played to 750 on every tab
// (walk-b, 2026-09-30: target 750 on A/B/C against a room whose settings.arrangement.scoreTarget was 100).
import assert from 'node:assert/strict';
import { hostRulesetFor } from './hostRuleset.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';
import { CAMPAIGN_OPERATIONS } from '../../game/campaignOperations.ts';
import { createHostPortPair } from './hostProtocol.ts';
import { createMatchHostCore } from './matchHostCore.ts';
import { decodeBootConfig, encodeBootConfig } from './migrationState.ts';
import { createInProcessMatchHost } from '../../../server/rooms/localRoomService.ts';

// ---- the pure derivation: the lobby's promise and the actor's table are the same function
{
  const zone = hostRulesetFor('zone_control', { allies: null, enemies: null, waveSize: null, enemyNation: null, scoreTarget: 100 }, null);
  assert.equal(zone.mode, 'zone_control');
  assert.equal(zone.scoreTarget, 100, 'the room\'s score target bends the ruleset');
  assert.equal(zone.respawnS, 6, 'an unarranged rule keeps the mode\'s value');
  assert.deepEqual(hostRulesetFor('zone_control', null, null), matchRulesetFor('zone_control'), 'no arrangement: the mode\'s own table');
  assert.deepEqual(hostRulesetFor('zone_control', undefined, undefined), matchRulesetFor('zone_control'));
  assert.equal(hostRulesetFor('zone_control', { allies: null, enemies: null, waveSize: null, enemyNation: null, scoreTarget: 5 }, null).scoreTarget, 100, 'a target under the clamp is clamped, never trusted');
  const horde = hostRulesetFor('endless_horde', { allies: 2, enemies: 12, waveSize: 5, enemyNation: 'russia' }, null);
  assert.equal(horde.enemies, 12);
  assert.equal(horde.allies, 2);
  assert.equal(horde.horde?.waveSize, 5);
  assert.equal(horde.enemyNation, 'russia');
  const operation = CAMPAIGN_OPERATIONS[1];
  const frontline = hostRulesetFor('frontline_assault', null, operation.id);
  assert.equal(frontline.timeLimitS, operation.timeLimitS, 'a Frontline room plays the operation\'s clock');
  assert.equal(frontline.enemyNation, operation.enemy, 'and its formation');
  assert.equal(frontline.assault?.extraDefenders, Math.floor((operation.difficulty - 1) / 2), 'and its difficulty');
  assert.deepEqual(hostRulesetFor('frontline_assault', null, 'no-such-operation'), matchRulesetFor('frontline_assault'), 'an unknown operation: the free sortie');
  assert.deepEqual(hostRulesetFor('standard', { allies: null, enemies: null, waveSize: null, enemyNation: null, scoreTarget: 100 }, operation.id), matchRulesetFor('standard'), 'a campaign operation bends Frontline alone; a score target bends the scoring modes alone');
  assert.equal(hostRulesetFor('not-a-mode', null, null).mode, 'standard', 'an unknown mode normalizes to Standard');
}

const seats = [{ seat: 0, playerId: 'p1', name: 'One', team: 'alpha', specId: 'm1a2', equipment: [] }, { seat: 1, playerId: 'p2', name: 'Two', team: 'bravo', specId: 't90m', equipment: [] }];
const arrangement = { allies: null, enemies: null, waveSize: null, enemyNation: null, scoreTarget: 100, respawnS: 4 };

// ---- the browser host's core boots the arranged ruleset (the Worker's path) and seals it for the elected host
{
  const pair = createHostPortPair();
  const core = createMatchHostCore({ port: pair.worker, buildWorld: async () => 'terrain', reportIntervalMs: 60_000, keyframeIntervalMs: 60_000, configIntervalMs: 60_000 });
  const ready = new Promise((resolve, reject) => pair.main.onMessage((message) => { if (message.type === 'ready') resolve(message); if (message.type === 'boot_failed') reject(new Error(message.error)); }));
  const config = { roomId: 'ROOM01', matchId: 'm-1', generation: 1, mapId: 'verdant', mode: 'zone_control', seed: 7, seats, bots: [], countdownS: 1, battleLimitS: null, hostSecret: 'host-secret-0123456789abcdef', manifestBase: null, resume: null, arrangement, campaignOperationId: null };
  pair.main.post({ type: 'boot', config });
  await ready;
  assert.equal(core.actor?.ruleset.scoreTarget, 100, 'the actor plays the room\'s score target');
  assert.equal(core.actor?.ruleset.respawnS, 4, 'and its respawn');
  assert.equal(core.actor?.authority.modeController.serialize().target, 100, 'the mode controller scores to the room\'s target (what modeStateJson carries to every tab)');
  const sealed = decodeBootConfig(encodeBootConfig(config));
  assert.deepEqual(sealed.arrangement, arrangement, 'the sealed configuration carries the arrangement to the elected host');
  assert.equal(sealed.campaignOperationId, null);
  core.dispose();
  pair.main.close();
}
{
  // a pre-lane boot (no arrangement field, e.g. an older sealed configuration): the mode's own table, never a throw
  const pair = createHostPortPair();
  const core = createMatchHostCore({ port: pair.worker, buildWorld: async () => 'terrain', reportIntervalMs: 60_000, keyframeIntervalMs: 60_000, configIntervalMs: 60_000 });
  const ready = new Promise((resolve, reject) => pair.main.onMessage((message) => { if (message.type === 'ready') resolve(message); if (message.type === 'boot_failed') reject(new Error(message.error)); }));
  pair.main.post({ type: 'boot', config: { roomId: 'ROOM02', matchId: 'm-2', generation: 1, mapId: 'verdant', mode: 'zone_control', seed: 7, seats, bots: [], countdownS: 1, battleLimitS: null, hostSecret: 'host-secret-0123456789abcdef', manifestBase: null, resume: null } });
  await ready;
  assert.equal(core.actor?.ruleset.scoreTarget, undefined, 'the mode\'s own table names no target');
  assert.equal(core.actor?.authority.modeController.serialize().target, 750, 'so the controller scores to the mode\'s default');
  core.dispose();
  pair.main.close();
}

// ---- the LAN helper's in-process match (matchTransport 'service') takes the same table
{
  const created = [];
  const matchService = { actors: new Map(), removeActor() {}, createActor(options) { created.push(options); return { stopped: false, ended: false }; } };
  const host = createInProcessMatchHost({ matchService, world: 'terrain' });
  await host.start({ roomId: 'ROOM03', matchId: 'm-3', round: 1, mapId: 'verdant', mode: 'zone_control', seed: 1, seats: seats.map((seat) => ({ ...seat, camo: 'factory' })), bots: [], countdownS: 1, arrangement, campaignOperationId: null });
  assert.equal(created.length, 1);
  assert.equal(created[0].ruleset?.mode, 'zone_control');
  assert.equal(created[0].ruleset?.scoreTarget, 100, 'the in-process match plays the room\'s score target');
}

console.log('mp host ruleset: the room\'s arrangement and campaign operation reach the host actor (browser core, sealed config, in-process service) pass');
