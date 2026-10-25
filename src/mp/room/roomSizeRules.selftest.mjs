// Room size as each mode's ruleset (mp-scale-251; src/sim/matchRuleset.ts roomSizeRulesFor; docs/MULTIPLAYER-V2.md
// §13.30): the table is sane for every battle mode and matches the room protocol's constants; the policy reads it (the
// default size, the co-op modes' seven commanders on Alpha, the versus sizes) with the old behaviour exactly; the room's
// bots fill each side to its team size; the LAN service's dev override lets a versus room set a larger team, bots filling
// it, never past the wire's 32 a side, and nothing in the rooms Worker sets it.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { roomSizeRulesFor } from '../../sim/matchRuleset.ts';
import { BATTLE_MODE_IDS } from '../../sim/matchModes.ts';
import { ROOM_DEV_MAX_TEAM_SIZE, ROOM_MAX_COOP_PLAYERS, ROOM_MAX_PLAYERS, ROOM_MAX_TEAM_SIZE, ROOM_MIN_TEAM_SIZE, readRoomSnapshot } from './protocol.ts';
import { applyRoomCommand, createRoom, isCoopGameMode, joinRoom, planStart } from './roomPolicy.ts';

const T0 = 1_000_000;
const reject = (fn, code) => assert.throws(fn, (error) => error.code === code, `refused as ${code}`);

// ---- the table: every battle mode, against the protocol's constants
for (const mode of BATTLE_MODE_IDS) {
  const rules = roomSizeRulesFor(mode);
  assert.ok(rules.minTeamSize >= ROOM_MIN_TEAM_SIZE && rules.minTeamSize <= rules.defaultTeamSize && rules.defaultTeamSize <= rules.maxTeamSize, `${mode}: sizes ordered`);
  assert.ok(rules.maxTeamSize <= ROOM_MAX_TEAM_SIZE, `${mode}: within the room's sizes`);
  assert.ok(rules.maxHumans === null || (rules.maxHumans >= 1 && rules.maxHumans <= ROOM_MAX_PLAYERS), `${mode}: commanders within the room's seats`);
  assert.equal(isCoopGameMode(mode), rules.sides === 'coop', `${mode}: the policy's co-op test is the table's`);
}
assert.equal(roomSizeRulesFor('standard').maxTeamSize, ROOM_MAX_TEAM_SIZE, 'the versus modes reach the room\'s largest team');
for (const mode of ['endless_horde', 'frontline_assault']) {
  assert.equal(roomSizeRulesFor(mode).sides, 'coop');
  assert.equal(roomSizeRulesFor(mode).maxHumans, ROOM_MAX_COOP_PLAYERS, `${mode}: the protocol's co-op commanders`);
}
assert.equal(roomSizeRulesFor('no_such_mode').sides, 'versus', 'an unknown mode reads as standard');

// ---- the policy reads it: the old behaviour exactly
{
  const room = createRoom({ roomCode: 'SIZE01', mode: 'private', creator: { id: 'admin', name: 'Admin' }, selection: { specId: 'm1a1_abrams_hc' }, now: T0 });
  assert.equal(room.settings.teamSize, roomSizeRulesFor('standard').defaultTeamSize, 'a new room takes its mode\'s default');
  reject(() => applyRoomCommand(room, 'admin', { type: 'set_team_size', teamSize: ROOM_MAX_TEAM_SIZE + 1 }, T0 + 1), 'invalid_team_size');
  applyRoomCommand(room, 'admin', { type: 'set_team_size', teamSize: 3 }, T0 + 2);
  joinRoom(room, { player: { id: 'g1', name: 'Guest' }, selection: { specId: 't90am' }, now: T0 + 3 });
  applyRoomCommand(room, 'admin', { type: 'set_ready', ready: true }, T0 + 4);
  applyRoomCommand(room, 'g1', { type: 'set_ready', ready: true }, T0 + 5);
  applyRoomCommand(room, 'admin', { type: 'start' }, T0 + 6);
  const plan = planStart(room, { seed: 11, now: T0 + 7 });
  assert.equal(plan.bots.length, 3 * 2 - 2, 'the room\'s bots fill each side to its team size');
}
{
  const room = createRoom({ roomCode: 'SIZE02', mode: 'private', creator: { id: 'admin', name: 'Admin' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { gameMode: 'endless_horde', teamSize: 12 }, now: T0 });
  assert.equal(room.settings.teamSize, ROOM_MAX_COOP_PLAYERS, 'a co-op room clamps its size to its commanders');
  applyRoomCommand(room, 'admin', { type: 'set_team_size', teamSize: 10 }, T0 + 1);
  assert.equal(room.settings.teamSize, ROOM_MAX_COOP_PLAYERS, 'a co-op room takes any legal size and clamps it, as before');
  for (let index = 1; index < ROOM_MAX_COOP_PLAYERS; index++) joinRoom(room, { player: { id: `c${index}`, name: `C${index}` }, now: T0 + 2 + index });
  assert.ok(room.players.every((player) => player.team === 'alpha'), 'every commander on Alpha');
  reject(() => joinRoom(room, { player: { id: 'late', name: 'Late' }, now: T0 + 50 }), 'coop_capacity');
  // the dev override never reaches the co-op modes
  applyRoomCommand(room, 'admin', { type: 'set_team_size', teamSize: 10 }, T0 + 60, { maxTeamSize: 24 });
  assert.equal(room.settings.teamSize, ROOM_MAX_COOP_PLAYERS);
}

// ---- the dev override (the LAN service's COT_ROOM_DEV_MAX_TEAM_SIZE): larger versus teams, bots filling them
{
  const room = createRoom({ roomCode: 'SIZE03', mode: 'lan', creator: { id: 'admin', name: 'Admin' }, selection: { specId: 'm1a1_abrams_hc' }, now: T0 });
  reject(() => applyRoomCommand(room, 'admin', { type: 'set_team_size', teamSize: 20 }, T0 + 1), 'invalid_team_size');
  const guards = { maxTeamSize: 24 };
  applyRoomCommand(room, 'admin', { type: 'set_team_size', teamSize: 20 }, T0 + 2, guards);
  assert.equal(room.settings.teamSize, 20, 'the override lets a versus room set a larger team');
  reject(() => applyRoomCommand(room, 'admin', { type: 'set_team_size', teamSize: 25 }, T0 + 3, guards), 'invalid_team_size');
  reject(() => applyRoomCommand(room, 'admin', { type: 'set_team_size', teamSize: ROOM_DEV_MAX_TEAM_SIZE + 1 }, T0 + 4, { maxTeamSize: 99 }), 'invalid_team_size');
  applyRoomCommand(room, 'admin', { type: 'set_team_size', teamSize: ROOM_DEV_MAX_TEAM_SIZE }, T0 + 5, { maxTeamSize: 99 });
  assert.equal(room.settings.teamSize, ROOM_DEV_MAX_TEAM_SIZE, 'never past the wire\'s 32 a side');
  assert.equal(readRoomSnapshot(JSON.parse(JSON.stringify(room))).settings.teamSize, ROOM_DEV_MAX_TEAM_SIZE, 'a test room\'s state reads on a client');
  assert.throws(() => readRoomSnapshot({ ...JSON.parse(JSON.stringify(room)), settings: { ...room.settings, teamSize: ROOM_DEV_MAX_TEAM_SIZE + 1 } }), 'past the dev size a room state is malformed');
  joinRoom(room, { player: { id: 'g1', name: 'Guest' }, selection: { specId: 't90am' }, now: T0 + 6 });
  applyRoomCommand(room, 'admin', { type: 'set_ready', ready: true }, T0 + 7);
  applyRoomCommand(room, 'g1', { type: 'set_ready', ready: true }, T0 + 8);
  applyRoomCommand(room, 'admin', { type: 'start' }, T0 + 9);
  const plan = planStart(room, { seed: 5, now: T0 + 10 });
  assert.equal(plan.bots.length + 2, ROOM_DEV_MAX_TEAM_SIZE * 2, 'bots fill the test room to 64 hulls');
  // a versus mode change keeps the override's size; without it a size past the mode's is clamped back
  const other = createRoom({ roomCode: 'SIZE04', mode: 'lan', creator: { id: 'admin', name: 'Admin' }, now: T0 });
  applyRoomCommand(other, 'admin', { type: 'set_team_size', teamSize: 20 }, T0 + 1, guards);
  applyRoomCommand(other, 'admin', { type: 'set_game_mode', gameMode: 'standard' }, T0 + 2);
  assert.equal(other.settings.teamSize, ROOM_MAX_TEAM_SIZE, 'a room without the override keeps its mode\'s largest');
}

// ---- the rooms Worker never sets the guard
{
  const root = new URL('../../../cloudflare/rooms/src/', import.meta.url);
  for (const file of readdirSync(root).filter((name) => name.endsWith('.ts'))) {
    assert.ok(!/maxTeamSize|COT_ROOM_DEV_MAX_TEAM_SIZE/.test(readFileSync(new URL(file, root), 'utf8')), `the rooms Worker's ${file} sets no dev team size`);
  }
}
console.log(`roomSizeRules.selftest: ${BATTLE_MODE_IDS.length} modes' room rules match the protocol; the policy reads them as before; bots fill to the team size; `
  + `the dev override reaches ${ROOM_DEV_MAX_TEAM_SIZE} a side in a versus LAN room (64 hulls), never a co-op room or the Worker PASS`);
