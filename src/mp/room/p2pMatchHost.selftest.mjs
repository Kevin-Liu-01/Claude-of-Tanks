// The peer-to-peer match host receipt (docs/MULTIPLAYER-V2.md §13.2): the election order (admin first unless it
// declined, else the lowest joinedAt connected commander that has not declined, a declined commander only as the
// last one, spectators and disconnected seats never), the rtc:// URL and its parser, generations across start /
// migrate / stop, status derived from the host's presence and its last report, and the unbound-host guard.
import assert from 'node:assert/strict';
import { createP2pMatchHost, electHost, hostCandidates, p2pHostHealth } from './p2pMatchHost.ts';
import { ROOM_MATCH_REPORT_STALE_AFTER_MS, p2pMatchUrl, parseP2pMatchUrl } from './protocol.ts';
import { applyRoomCommand, createRoom, joinRoom, markMatchPlaying, planStart, recordMatch } from './roomPolicy.ts';

const T0 = 1_700_000_000_000;

function roomWith(seats) {
  const room = createRoom({ roomCode: 'ROOM01', mode: 'private', creator: { id: seats[0].id, name: seats[0].id }, selection: { specId: 'm1a2' }, settings: { teamSize: 7 }, now: T0 });
  for (const seat of seats.slice(1)) joinRoom(room, { player: { id: seat.id, name: seat.id }, selection: { specId: 'm1a2' }, team: seat.team ?? null, now: T0 + room.players.length });
  for (const seat of seats) {
    const player = room.players.find((p) => p.id === seat.id);
    if (seat.connected === false) player.connected = false;
    if (seat.declined) player.hostDeclined = true;
  }
  return room;
}

// ---- the election order
{
  const room = roomWith([{ id: 'admin' }, { id: 'second' }, { id: 'third' }, { id: 'watcher', team: 'spectator' }]);
  assert.equal(electHost(room).id, 'admin', 'the admin hosts by default');
  assert.deepEqual(hostCandidates(room).map((p) => p.id), ['admin', 'second', 'third'], 'spectators are never candidates');
  assert.equal(electHost(room, 'admin').id, 'second', 'excluding the admin: the lowest joinedAt commander');
  room.players.find((p) => p.id === 'admin').hostDeclined = true;
  assert.equal(electHost(room).id, 'second', 'a declined admin yields to the lowest joinedAt commander');
  room.players.find((p) => p.id === 'second').connected = false;
  assert.equal(electHost(room).id, 'third', 'a disconnected seat never hosts');
  room.players.find((p) => p.id === 'third').hostDeclined = true;
  assert.equal(electHost(room).id, 'admin', 'everyone declined: the admin (declined) hosts rather than nobody');
  room.players.find((p) => p.id === 'admin').connected = false;
  assert.equal(electHost(room).id, 'third', 'the last connected commander hosts even though it declined');
  room.players.find((p) => p.id === 'third').connected = false;
  assert.equal(electHost(room), null, 'only a spectator left: no host');
  // the admin can be a spectator: it never hosts then
  const spectatorAdmin = roomWith([{ id: 'admin' }, { id: 'p2' }, { id: 'p3' }]);
  applyRoomCommand(spectatorAdmin, 'admin', { type: 'set_team', team: 'spectator' }, T0 + 5);
  assert.equal(electHost(spectatorAdmin).id, 'p2');
  // seniority, not seat order or name: the lowest joinedAt among the willing
  const seniority = roomWith([{ id: 'admin', declined: true }, { id: 'late' }, { id: 'early' }]);
  seniority.players.find((p) => p.id === 'late').joinedAt = 9;
  seniority.players.find((p) => p.id === 'early').joinedAt = 1;
  assert.equal(electHost(seniority).id, 'early');
}

// ---- the URL
{
  assert.equal(p2pMatchUrl('ROOM01', 3), 'rtc://ROOM01/3');
  assert.deepEqual(parseP2pMatchUrl('rtc://ROOM01/3'), { roomId: 'ROOM01', generation: 3 });
  assert.equal(parseP2pMatchUrl('/rooms/ROOM01/match'), null);
  assert.equal(parseP2pMatchUrl('rtc://ROOM01'), null);
  assert.equal(parseP2pMatchUrl('rtc://ROOM01/x'), null);
  assert.equal(parseP2pMatchUrl(42), null);
}

// ---- start / status / migrate / stop against a room view; generations; health
{
  const host = createP2pMatchHost();
  assert.equal(host.transport, 'p2p');
  await assert.rejects(() => host.start({ roomId: 'ROOM01' }), /bind/, 'unbound: every call refuses');
  const room = roomWith([{ id: 'admin' }, { id: 'second' }, { id: 'third' }, { id: 'watcher', team: 'spectator' }]);
  let now = T0 + 100;
  const connected = new Set(['admin', 'second', 'third', 'watcher']);
  let report = null;
  host.bind({ room: () => room, isConnected: (id) => connected.has(id), lastReport: () => report, now: () => now });
  assert.equal(await host.status('ROOM01'), null, 'no match: no status');
  assert.equal(host.health(), 'none');
  await assert.rejects(() => host.start({ roomId: 'OTHER1' }), /no room/, 'a start for another room code');
  for (const id of ['admin', 'second', 'third']) applyRoomCommand(room, id, { type: 'set_ready', ready: true }, now);
  const plan = planStart(room, { seed: 7, now });
  const started = await host.start({ roomId: 'ROOM01', matchId: 'm1-0000007', round: plan.round, mapId: plan.mapId, mode: plan.gameMode, seed: plan.seed, seats: plan.seats, bots: plan.bots, countdownS: 5, arrangement: null, campaignOperationId: null });
  assert.equal(started.matchUrl, 'rtc://ROOM01/1');
  assert.deepEqual(room.host, { transport: 'p2p', hostId: 'admin', generation: 1, since: now }, 'start writes the election into the room');
  recordMatch(room, { id: 'm1-0000007', round: 1, mapId: plan.mapId, seed: 7, startedAt: now }, now);
  assert.equal(host.health(), 'alive', 'a fresh election is alive until the report budget runs out');
  assert.deepEqual(await host.status('ROOM01'), { roomId: 'ROOM01', matchId: 'm1-0000007', phase: 'loading', verdict: null, tick: 0 }, 'before the first report: loading');
  report = { generation: 1, phase: 'playing', tick: 600, verdict: null, at: now + 500 };
  now += 600;
  assert.deepEqual(await host.status('ROOM01'), { roomId: 'ROOM01', matchId: 'm1-0000007', phase: 'playing', verdict: null, tick: 600 });
  // silence past the budget: the host cannot say
  now = report.at + ROOM_MATCH_REPORT_STALE_AFTER_MS;
  assert.equal(host.health(), 'silent');
  assert.equal((await host.status('ROOM01')).phase, 'unknown');
  now = report.at + 1000;
  assert.equal(host.health(), 'alive');
  // the socket gone: absent, whatever the report says (the actor keeps the seat's `connected` flag in step with its socket)
  connected.delete('admin');
  room.players.find((p) => p.id === 'admin').connected = false;
  assert.equal(host.health(), 'absent');
  assert.equal((await host.status('ROOM01')).phase, 'unknown');
  assert.equal(p2pHostHealth({ room: () => room, isConnected: () => true, lastReport: () => report, now: () => now }, now), 'alive');
  // migration: generation 2, the next commander; a stale report (old generation) does not count for the new host
  markMatchPlaying(room, now);
  const migrated = host.migrate('admin');
  assert.deepEqual(migrated, { transport: 'p2p', hostId: 'second', generation: 2, since: now });
  assert.equal(room.host, migrated, 'migrate rewrites the room record');
  assert.equal(host.health(), 'alive', 'the new election starts a fresh report budget');
  assert.deepEqual(await host.status('ROOM01'), { roomId: 'ROOM01', matchId: 'm1-0000007', phase: 'loading', verdict: null, tick: 0 }, 'the old host\'s report is not the new host\'s');
  // a declined successor hosts only as the last commander
  room.players.find((p) => p.id === 'third').hostDeclined = true;
  connected.delete('second');
  room.players.find((p) => p.id === 'second').connected = false;
  assert.equal(host.migrate('second').hostId, 'third');
  assert.equal(room.host.generation, 3);
  // nobody left: null and the record untouched (the actor ends the match and calls stop)
  connected.delete('third');
  room.players.find((p) => p.id === 'third').connected = false;
  assert.equal(host.migrate('third'), null);
  assert.equal(room.host.hostId, 'third');
  assert.equal(room.host.generation, 3, 'a failed election is not an election');
  now += 10;
  await host.stop('ROOM01');
  assert.deepEqual(room.host, { transport: 'p2p', hostId: null, generation: 3, since: now }, 'stop clears the host and keeps the generation monotonic');
  room.host = { transport: 'p2p', hostId: 'third', generation: 3, since: now };
  const { clearElection } = host;
  clearElection();
  assert.deepEqual(room.host, { transport: 'p2p', hostId: null, generation: 3, since: now }, 'clearElection (synchronous, detachable) is what stop does');
  assert.equal(await host.status('ROOM01'), null);
  assert.equal(host.health(), 'none');
  // the next start elects at generation 4
  room.phase = 'waiting'; room.match = null; room.settings.locked = false;
  for (const p of room.players) { p.connected = true; p.ready = p.team !== 'spectator'; p.hostDeclined = false; }
  connected.add('admin'); connected.add('second'); connected.add('third');
  const plan2 = planStart(room, { seed: 8, now });
  assert.equal((await host.start({ roomId: 'ROOM01', matchId: 'm2-0000008', round: plan2.round, mapId: plan2.mapId, mode: plan2.gameMode, seed: plan2.seed, seats: plan2.seats, bots: plan2.bots, countdownS: 5, arrangement: null, campaignOperationId: null })).matchUrl, 'rtc://ROOM01/4');
  assert.equal(room.host.hostId, 'admin');
  // no connected commander at start: the start fails (match_host_unavailable at the actor)
  const empty = roomWith([{ id: 'admin', connected: false }, { id: 'watcher', team: 'spectator' }]);
  const lone = createP2pMatchHost();
  lone.bind({ room: () => empty, isConnected: () => false, lastReport: () => null, now: () => now });
  await assert.rejects(() => lone.start({ roomId: 'ROOM01' }), /no connected commander/);
  assert.equal(empty.host.generation, 0);
}

console.log('p2pMatchHost: PASS');
