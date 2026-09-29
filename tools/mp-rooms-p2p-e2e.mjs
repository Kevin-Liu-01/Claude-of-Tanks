#!/usr/bin/env node
/**
 * Multiplayer v2 peer-to-peer rooms end-to-end, headless, against the in-process
 * room service with the `p2p` match host (server/rooms/serve.ts, matchTransport
 * 'p2p', real sockets) — the room side of docs/MULTIPLAYER-V2.md §13, driven by
 * raw room sockets so it needs no browser and no WebRTC:
 *
 *   1. p1 creates, p2 and p3 join as commanders, s1 and s2 as spectators; p1
 *      declines hosting (`host_decline`); p1 starts.
 *   2. every seat's `match_start` names `rtc://<CODE>/1` and the same hostId
 *      (p2: the lowest joinedAt commander that has not declined); only the
 *      host's carries `hostSecret`; every seat token verifies with that secret
 *      (sha256(seatSecret + ':' + matchId)) and with nothing else; a
 *      `host_changed { reason: 'start' }` follows every match_start.
 *   3. the relay: p3 → host offer and host → p3 answer arrive with `from`;
 *      a wrong generation, a spectator-to-spectator signal and an oversize
 *      signal are refused with their codes.
 *   4. the host's `match_report` drives the room to `playing`.
 *   5. the host's socket drops: after the 8 s grace the room broadcasts
 *      `host_changed { generation: 2, hostId: p3, resumeTick, reason: 'timeout' }`,
 *      the secret only on p3's copy.
 *   6. the old host rejoins with its capability: a peer now (`rtc://<CODE>/2`,
 *      hostId p3, no secret); its report is refused (`host_only`).
 *   7. p3's reports drive the status and the verdict: `match_status ended`
 *      at every seat, the room back to `waiting` with the result.
 *
 *   node tools/mp-rooms-p2p-e2e.mjs            ~12 s wall (the 8 s grace is real time)
 *   node tools/mp-rooms-p2p-e2e.mjs --json
 *
 * Gates (exit 1 on any): every step above, and the migration within the grace
 * plus two seconds.
 */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { createRoomsServer } from '../server/rooms/serve.ts';
import { verifySeatToken } from '../server/match/seatToken.ts';
import { ROOM_HOST_DISCONNECT_GRACE_MS, ROOM_SIGNAL_MAX_BYTES } from '../src/mp/room/protocol.ts';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const token = (seed) => seed.repeat(64).slice(0, 64);

/** One raw room socket: envelopes out (binary UTF-8 JSON), decoded envelopes in, `next(predicate)` waits. */
class RawSeat {
  constructor(url, id) {
    this.id = id;
    this.messages = [];
    this.waiters = new Set();
    this.requestSeq = 0;
    this.socket = new WebSocket(url);
    this.open = new Promise((resolve, reject) => { this.socket.once('open', resolve); this.socket.once('error', reject); });
    this.closed = new Promise((resolve) => this.socket.once('close', resolve));
    this.socket.on('message', (raw) => {
      const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : String(raw);
      this.messages.push(JSON.parse(text));
      for (const waiter of [...this.waiters]) waiter();
    });
  }
  send(type, payload = {}, requestId) {
    this.socket.send(Buffer.from(JSON.stringify({ type, requestId, payload }), 'utf8'), { binary: true });
  }
  request(type, payload = {}) {
    const requestId = `${this.id}-${++this.requestSeq}`;
    const reply = this.next((message) => message.requestId === requestId);
    this.send(type, payload, requestId);
    return reply;
  }
  command(command) { return this.request('room_command', { command }); }
  next(predicate, timeoutMs = 5000) {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(`${this.id}: no ${predicate.toString().slice(0, 100)} within ${timeoutMs} ms; received ${this.messages.map((m) => m.type).join(',')}`));
      }, timeoutMs);
      const waiter = () => {
        const message = this.messages.find(predicate);
        if (!message) return;
        clearTimeout(timer);
        this.waiters.delete(waiter);
        resolve(message);
      };
      this.waiters.add(waiter);
    });
  }
  all(type) { return this.messages.filter((message) => message.type === type); }
  last(type) { return this.messages.filter((message) => message.type === type).at(-1) ?? null; }
  /** An abrupt drop (the tab died): no close frame. */
  drop() { this.socket.terminate(); }
  close() { try { this.socket.close(1000, 'done'); } catch { /* closed */ } }
}

export async function runP2pRoomsE2E({ mapId = 'verdant', log = () => {} } = {}) {
  const SECRET = 'mp-rooms-p2p-e2e-seat-secret-0123456789abcdef';
  const hostSecretOf = (matchId) => createHash('sha256').update(`${SECRET}:${matchId}`).digest('hex');
  const server = await createRoomsServer({ seatSecret: SECRET, world: 'terrain', matchTransport: 'p2p', maxActors: 1 });
  const failures = [];
  const check = (condition, label) => { if (!condition) failures.push(label); return !!condition; };
  const report = { endpoint: 'in-process (p2p)', seats: 5, mapId, host: [], relay: {}, migration: null, verdict: null, wallMs: 0 };
  const startedAt = performance.now();
  const seats = [];
  const seat = async (id) => {
    const entry = new RawSeat(`${server.url}/rooms/${code}`, id);
    seats.push(entry);
    await entry.open;
    return entry;
  };
  let code = 'P2PE2E';
  try {
    // ---- 1. seats, the admin's decline, the start
    const p1 = await seat('p1');
    const created = await p1.request('room_create', { roomCode: code, mode: 'lan', player: { id: 'p1', name: 'One' }, resumeToken: token('1'), nextResumeToken: token('2'), selection: { specId: 'm1a2' }, settings: { teamSize: 2, mapId, botsFill: false } });
    if (!check(created.type === 'room_created', `room_create: ${JSON.stringify(created.payload)}`)) throw new Error('no room');
    code = created.payload.room.roomCode;
    const join = async (id, team = null, resume = token('a'), next = token('b')) => {
      const entry = await seat(id);
      const joined = await entry.request('room_join', { roomCode: code, player: { id, name: id }, resumeToken: resume, nextResumeToken: next, selection: { specId: 't90m' }, ...(team ? { team } : {}) });
      check(joined.type === 'room_joined', `${id} joins: ${JSON.stringify(joined.payload)}`);
      return entry;
    };
    const p2 = await join('p2', null, token('c'), token('d'));
    const p3 = await join('p3');
    const s1 = await join('s1', 'spectator');
    const s2 = await join('s2', 'spectator');
    check((await p1.command({ type: 'host_decline', declined: true })).type === 'room_ack', 'p1 declines hosting');
    for (const entry of [p1, p2, p3]) check((await entry.command({ type: 'set_ready', ready: true })).type === 'room_ack', `${entry.id} ready`);
    const startAck = await p1.command({ type: 'start' });
    if (!check(startAck.type === 'room_ack', `start: ${JSON.stringify(startAck.payload)}`)) throw new Error('no start');
    const matchId = startAck.payload.matchId;
    const hostSecret = hostSecretOf(matchId);
    log(`room ${code}: match ${matchId} started by p1 (declined hosting)`);

    // ---- 2. match_start: the rtc:// URL, one hostId, the secret only for the host, tokens under the secret
    const starts = new Map();
    for (const entry of [p1, p2, p3, s1, s2]) starts.set(entry.id, (await entry.next((m) => m.type === 'match_start')).payload);
    const hostId = starts.get('p2').hostId;
    check(hostId === 'p2', `the host is p2 (the lowest joinedAt commander that has not declined), got ${hostId}`);
    for (const [id, payload] of starts) {
      check(payload.matchUrl === `rtc://${code}/1`, `${id} matchUrl ${payload.matchUrl}`);
      check(payload.hostId === hostId, `${id} hostId ${payload.hostId}`);
      check(payload.hostSecret === (id === hostId ? hostSecret : undefined), `${id} hostSecret ${id === hostId ? 'present and derived' : 'absent'}`);
      const verified = verifySeatToken(hostSecret, payload.seatToken, Date.now());
      check(verified.ok && verified.claims.playerId === id, `${id} token verifies with the per-match secret`);
      check(verifySeatToken(SECRET, payload.seatToken, Date.now()).ok === false, `${id} token does not verify with the room secret`);
      const changed = (await [p1, p2, p3, s1, s2].find((e) => e.id === id).next((m) => m.type === 'host_changed')).payload;
      check(changed.hostId === hostId && changed.generation === 1 && changed.reason === 'start' && changed.resumeTick === 0, `${id} host_changed(start) ${JSON.stringify(changed)}`);
      check((changed.hostSecret === hostSecret) === (id === hostId), `${id} host_changed(start) secret only for the host`);
    }
    report.host.push({ generation: 1, hostId, reason: 'start' });
    log(`match_start at 5 seats: rtc://${code}/1, host ${hostId}, secret only on the host's copy, tokens under the derived secret`);

    // ---- 3. the relay
    const offer = { to: hostId, generation: 1, kind: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' };
    p3.send('room_signal', offer);
    const relayedOffer = (await p2.next((m) => m.type === 'room_signal')).payload;
    check(relayedOffer.from === 'p3' && relayedOffer.sdp === offer.sdp && relayedOffer.kind === 'offer' && relayedOffer.to === hostId, `offer relayed with from: ${JSON.stringify(relayedOffer).slice(0, 80)}`);
    p2.send('room_signal', { to: 'p3', generation: 1, kind: 'answer', sdp: 'v=0 answer' });
    const relayedAnswer = (await p3.next((m) => m.type === 'room_signal')).payload;
    check(relayedAnswer.from === hostId && relayedAnswer.kind === 'answer', `answer relayed with from: ${JSON.stringify(relayedAnswer)}`);
    p3.send('room_signal', { to: hostId, generation: 1, kind: 'candidate', candidate: { candidate: 'candidate:1 1 udp 2113937151 192.0.2.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 } });
    const relayedCandidate = (await p2.next((m) => m.type === 'room_signal' && m.payload.kind === 'candidate')).payload;
    check(relayedCandidate.candidate?.candidate?.startsWith('candidate:1'), 'candidate relayed');
    const wrongGeneration = await p3.request('room_signal', { ...offer, generation: 2 });
    const spectators = await s1.request('room_signal', { to: 's2', generation: 1, kind: 'offer', sdp: 'x' });
    const oversize = await p3.request('room_signal', { ...offer, sdp: 'v'.repeat(ROOM_SIGNAL_MAX_BYTES) });
    const notHost = await p3.request('room_signal', { to: 'p1', generation: 1, kind: 'offer', sdp: 'x' });
    report.relay = { offer: relayedOffer.from, answer: relayedAnswer.from, wrongGeneration: wrongGeneration.payload.code, spectators: spectators.payload.code, oversize: oversize.payload.code, notHost: notHost.payload.code };
    check(wrongGeneration.payload.code === 'signal_generation', `wrong generation → signal_generation (${wrongGeneration.payload.code})`);
    check(spectators.payload.code === 'signal_target', `spectator to spectator → signal_target (${spectators.payload.code})`);
    check(oversize.payload.code === 'signal_size', `oversize → signal_size (${oversize.payload.code})`);
    check(notHost.payload.code === 'signal_target', `neither seat the host → signal_target (${notHost.payload.code})`);
    check(p2.all('room_signal').length === 2 && p3.all('room_signal').length === 1 && s2.all('room_signal').length === 0, 'refused signals reach nobody');
    log(`relay: offer from ${relayedOffer.from}, answer from ${relayedAnswer.from}; refused ${wrongGeneration.payload.code} / ${spectators.payload.code} / ${oversize.payload.code} / ${notHost.payload.code}`);

    // ---- 4. the host's reports
    check((await p1.command({ type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 1 })).payload.code === 'host_only', 'a peer\'s report → host_only');
    check((await p2.command({ type: 'match_report', matchId, generation: 1, phase: 'loading', tick: 0 })).type === 'room_ack', 'the host reports loading');
    check((await p2.command({ type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 500 })).type === 'room_ack', 'the host reports playing');
    const playing = (await s1.next((m) => m.type === 'room_state' && m.payload.room.phase === 'playing')).payload.room;
    check(playing.match?.status === 'playing' && playing.host.hostId === hostId && playing.host.generation === 1, 'the room follows the report to playing');

    // ---- 5. the host's socket drops: migration after the grace
    const droppedAt = performance.now();
    p2.drop();
    const changed = (await p3.next((m) => m.type === 'host_changed' && m.payload.generation === 2, ROOM_HOST_DISCONNECT_GRACE_MS + 4000)).payload;
    const migrationMs = Math.round(performance.now() - droppedAt);
    report.migration = { ms: migrationMs, ...changed, hostSecret: changed.hostSecret ? 'present' : 'absent' };
    check(changed.hostId === 'p3' && changed.reason === 'timeout' && changed.resumeTick === 500, `host_changed after the drop: ${JSON.stringify({ ...changed, hostSecret: undefined })}`);
    check(changed.hostSecret === hostSecret, 'the new host receives the secret');
    check(migrationMs >= ROOM_HOST_DISCONNECT_GRACE_MS - 50 && migrationMs <= ROOM_HOST_DISCONNECT_GRACE_MS + 2000, `migration ${migrationMs} ms against the ${ROOM_HOST_DISCONNECT_GRACE_MS} ms grace`);
    for (const entry of [p1, s1, s2]) {
      const copy = (await entry.next((m) => m.type === 'host_changed' && m.payload.generation === 2)).payload;
      check(copy.hostId === 'p3' && copy.hostSecret === undefined, `${entry.id} host_changed without the secret`);
    }
    const migrated = (await s1.next((m) => m.type === 'room_state' && m.payload.room.host.generation === 2)).payload.room;
    check(migrated.host.hostId === 'p3' && migrated.phase === 'playing' && migrated.match?.id === matchId, 'the room record moved with the match running on');
    report.host.push({ generation: 2, hostId: 'p3', reason: 'timeout', resumeTick: changed.resumeTick });
    log(`host p2 dropped: host_changed to p3 (generation 2, resume tick ${changed.resumeTick}) after ${migrationMs} ms`);

    // ---- 6. the old host rejoins as a peer
    const p2b = await seat('p2b');
    const rejoined = await p2b.request('room_join', { roomCode: code, player: { id: 'p2', name: 'Two' }, resumeToken: token('d'), nextResumeToken: token('e') });
    check(rejoined.type === 'room_joined' && rejoined.payload.playerId === 'p2', `p2 resumes: ${JSON.stringify(rejoined.payload).slice(0, 80)}`);
    const again = (await p2b.next((m) => m.type === 'match_start')).payload;
    check(again.matchUrl === `rtc://${code}/2` && again.hostId === 'p3' && again.hostSecret === undefined, `p2 back as a peer: ${again.matchUrl} host ${again.hostId} secret ${again.hostSecret ? 'present' : 'absent'}`);
    check(again.seatToken === starts.get('p2').seatToken, 'p2 keeps its seat token');
    check((await p2b.command({ type: 'match_report', matchId, generation: 2, phase: 'playing', tick: 600 })).payload.code === 'host_only', 'the old host\'s report → host_only');
    p2b.send('room_signal', { to: 'p3', generation: 2, kind: 'offer', sdp: 'v=0 rejoin' });
    check((await p3.next((m) => m.type === 'room_signal' && m.payload.from === 'p2' && m.payload.kind === 'offer')).payload.sdp === 'v=0 rejoin', 'the old host signals the new one');
    log('p2 rejoined as a peer of p3');

    // ---- 7. the successor's reports and verdict
    check((await p3.command({ type: 'match_report', matchId, generation: 2, phase: 'playing', tick: 700 })).type === 'room_ack', 'p3 reports playing');
    check((await p3.command({ type: 'match_report', matchId, generation: 2, phase: 'ended', tick: 1200, verdict: { result: 'alpha', reason: 'elimination' } })).type === 'room_ack', 'p3 reports the verdict');
    for (const entry of [p1, p2b, p3, s1, s2]) {
      const status = (await entry.next((m) => m.type === 'match_status')).payload;
      check(status.status === 'ended' && status.verdict?.result === 'alpha' && status.verdict?.reason === 'elimination', `${entry.id} match_status ${JSON.stringify(status)}`);
    }
    const finished = (await s1.next((m) => m.type === 'room_state' && m.payload.room.phase === 'waiting' && m.payload.room.lastResult)).payload.room;
    report.verdict = finished.lastResult;
    check(finished.lastResult?.result === 'alpha' && finished.lastResult?.round === 1, `lastResult ${JSON.stringify(finished.lastResult)}`);
    check(finished.host.hostId === null && finished.host.generation === 2, `the election cleared: ${JSON.stringify(finished.host)}`);
    log(`verdict ${JSON.stringify(finished.lastResult)}; room waiting, election cleared at generation 2`);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    report.wallMs = Math.round(performance.now() - startedAt);
    for (const entry of seats) entry.close();
    await Promise.race([server.close(), sleep(15_000).then(() => { failures.push('server close exceeded 15 s'); })]);
  }
  report.failures = failures;
  report.pass = failures.length === 0;
  return report;
}

export function formatP2pReport(report) {
  const lines = [`mp rooms p2p e2e: ${report.seats} seats against ${report.endpoint}, map=${report.mapId} (${report.wallMs} ms wall)`];
  for (const host of report.host) lines.push(`  host generation ${host.generation}: ${host.hostId} (${host.reason}${host.resumeTick !== undefined ? `, resume tick ${host.resumeTick}` : ''})`);
  if (report.relay.offer) lines.push(`  relay: offer from ${report.relay.offer}, answer from ${report.relay.answer}; refused: ${report.relay.wrongGeneration}, ${report.relay.spectators}, ${report.relay.oversize}, ${report.relay.notHost}`);
  if (report.migration) lines.push(`  migration: ${report.migration.ms} ms after the drop, secret ${report.migration.hostSecret} on the new host`);
  if (report.verdict) lines.push(`  verdict: ${JSON.stringify(report.verdict)}`);
  for (const failure of report.failures) lines.push(`  FAIL: ${failure}`);
  lines.push(report.pass ? 'mp rooms p2p e2e: PASS' : 'mp rooms p2p e2e: FAIL');
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const json = process.argv.includes('--json');
  const report = await runP2pRoomsE2E({ log: json ? () => {} : (line) => process.stderr.write(`[rooms-p2p-e2e] ${line}\n`) });
  console.log(json ? JSON.stringify(report, null, 2) : formatP2pReport(report));
  process.exitCode = report.pass ? 0 : 1;
}
