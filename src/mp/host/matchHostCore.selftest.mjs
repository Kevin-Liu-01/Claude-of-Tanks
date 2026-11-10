// The sealed boot configuration reaches a seat with its WELCOME (round 8 Y2, s4-04). An elected host boots from the old
// host's sealed configuration (mp:config) when it holds one, else from planFromRoster: the WELCOME's roster with the
// loadouts the room snapshot still names. The core broadcast the configuration within a housekeeping beat of each
// attach (250 ms, sealed afresh each time), so a seat whose host went in that beat held no configuration and booted from
// the room: a player who had left the room gave its hull an EMPTY loadout ([] equipment and items, the factory paint).
// Now the core seals its configuration once at boot and sends its chunks right after each WELCOME (then on the cadence),
// and planFromRoster gives a departed player's hull null loadouts, which the authority turns into the vehicle's defaults.
// [1] A seat welcomed after the boot, its host stopped as the WELCOME arrives: the seat's own MigrationStore holds a
// complete mp:config that opens, with the match's derived key, to the boot configuration. [2] A second seat welcomed
// later holds it too. [3] An elected host booted from planFromRoster (no resume extras, the countdown restart's path):
// the present player keeps the room's loadout and paint, the departed player's hull gets the vehicle's default loadout
// and items. Driven through the core's port exactly as the browser host is (hostStopRace.selftest's harness).
// [4] (fix-up r1, both review lenses) Seats welcomed together each take the configuration once: six seats whose HELLOs
// reach a running host together (a match start), then the same six held by a migrated host's resume hold and released
// in one loop. The WELCOME's delivery was a broadcast, so the k-th seat welcomed re-sent it to every seat welcomed before
// it: N(N+1)/2 copies, the first seat N of them ahead of its first snapshots; and the cadence's first beat (after the
// boot, after the hold) sent every seat a second. Copies are counted per seat from its WELCOME to 1.5 s after the last
// one (inside CONFIG_INTERVAL_MS, past several housekeeping beats).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHostPortPair, HOST_LOOPBACK_PEER, MIGRATION_EVENT_KIND } from './hostProtocol.ts';
import { createMatchHostCore } from './matchHostCore.ts';
import { planFromRoster, planHostBoot } from './hostPlan.ts';
import { decodeBootConfig, deriveMigrationKey, migrationFallback, openMigrationBlob } from './migrationState.ts';
import { MigrationStore } from '../match/migrationStore.ts';
import { createRoom, joinRoom } from '../room/roomPolicy.ts';
import { decodeMessage, encodeMessage } from '../wire/codec.ts';
import { CLOSE_REASON, MESSAGE_TYPE, PROTOCOL_VERSION } from '../wire/index.ts';
import { signSeatToken } from '../../../server/match/seatToken.ts';
import { DEFAULT_CONSUMABLE_LOADOUT } from '../../sim/consumableRules.ts';
import { camoSelectionBonus } from '../../sim/camoPaint.ts';
import { stockCamoPatternIdFor } from '../../vehicles/camoPolicy.ts';

const watchdog = setTimeout(() => { console.error('matchHostCore.selftest: stuck (a running actor keeps the process alive)'); process.exit(1); }, 60_000);
watchdog.unref();
const memoryGuard = setInterval(() => { if (process.memoryUsage().rss > 1.5e9) { console.error('matchHostCore.selftest: RSS past 1.5 GB'); process.exit(1); } }, 200);
memoryGuard.unref();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };

const room = createRoom({ roomCode: 'CFGWEL', mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc', equipment: ['optics'], consumables: ['repair_large', 'rations', 'extinguisher'] },
  settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
joinRoom(room, { player: { id: 'other', name: 'Other' }, selection: { specId: 't90am', equipment: ['optics'] }, team: null, now: 1001 });
room.players.find((player) => player.id === 'me').camo = 'auto';
const matchId = 'm1-cfgwel01';
const plan = planHostBoot(room, { matchId, round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', hostId: 'me' }, 'me');
const secret = createHash('sha256').update('config-with-welcome').digest('hex');
const helloFor = (playerId, seats = plan.seats) => {
  const seat = seats.find((entry) => entry.playerId === playerId);
  const token = signSeatToken(secret, { v: 1, roomId: 'CFGWEL', seat: seat.seat, playerId, name: seat.name, team: seat.team, specId: seat.specId, iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
  return encodeMessage({ type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 0, token, clientBuild: 'config-welcome' });
};
const bootConfig = (seats, resume = null) => ({ roomId: 'CFGWEL', matchId, generation: 1, mapId: 'verdant', mode: 'standard', seed: 7, seats, bots: [], countdownS: 1, hostSecret: secret, manifestBase: null, resume });

/** A booted core; each link's frames feed that seat's own MigrationStore (beginLink at its WELCOME, as matchClient
 * does). */
async function bootedHost(seats, resume = null) {
  const pair = createHostPortPair();
  const core = createMatchHostCore({ port: pair.worker, buildWorld: async () => 'terrain', reportIntervalMs: 500 });
  const posted = [];
  const seatsByPeer = new Map();
  pair.main.onMessage((message) => {
    posted.push(message.type);
    if (message.type !== 'link_send') return;
    const seat = seatsByPeer.get(message.peer);
    if (!seat) return;
    const decoded = decodeMessage(new Uint8Array(message.bytes));
    if (!decoded.ok) return;
    if (decoded.message.type === MESSAGE_TYPE.WELCOME) { seat.store.beginLink(); seat.welcomed = true; seat.welcomedAtMs = Date.now(); seat.onWelcome?.(); }
    if (decoded.message.type === MESSAGE_TYPE.EVENT) {
      for (const event of decoded.message.events) {
        seat.store.receive(event, Date.now());
        if (event.kind === MIGRATION_EVENT_KIND.CONFIG) { seat.configEvents++; seat.configParts = event.payload.parts; }
      }
    }
  });
  pair.main.post({ type: 'boot', config: bootConfig(seats, resume) });
  const started = Date.now();
  while (!posted.includes('ready') && Date.now() - started < 20_000) await sleep(20);
  const join = (peer, playerId, onWelcome = null) => {
    const seat = { store: new MigrationStore(), welcomed: false, welcomedAtMs: null, onWelcome, configEvents: 0, configParts: 0 };
    seatsByPeer.set(peer, seat);
    pair.main.post({ type: 'link_open', peer, label: playerId, playerId });
    pair.main.post({ type: 'link_frame', peer, bytes: helloFor(playerId, seats).slice().buffer });
    return seat;
  };
  return { pair, core, posted, join };
}
const until = async (test, ms = 5000) => { const started = Date.now(); while (!test() && Date.now() - started < ms) await sleep(10); return test(); };
async function openedConfig(store) {
  const retained = store.config;
  if (!retained) return null;
  const key = await deriveMigrationKey(secret);
  return decodeBootConfig(await openMigrationBlob(key, retained.blob));
}

console.log('[1] a seat whose host stops as its WELCOME arrives holds the sealed configuration');
{
  const host = await bootedHost(plan.seats);
  ok(host.posted.includes('ready'), 'the core booted (terrain)');
  await sleep(400); // past the boot's first housekeeping beat: the seat is welcomed into a running host
  const seat = host.join(HOST_LOOPBACK_PEER, 'me', () => host.pair.main.post({ type: 'stop', reason: CLOSE_REASON.ROOM_CLOSED, detail: 'host went in the welcome beat' }));
  ok(await until(() => seat.welcomed), 'the seat is welcomed');
  await until(() => host.core.stopped);
  await sleep(300);
  ok(host.core.stopped, 'the host stopped in the beat of the WELCOME');
  const config = await openedConfig(seat.store).catch(() => null);
  ok(seat.store.config !== null, `the seat holds a complete ${MIGRATION_EVENT_KIND.CONFIG} (${seat.store.stats().blobsCompleted} blobs completed)`);
  ok(!!config && config.matchId === matchId && JSON.stringify(config.seats) === JSON.stringify(plan.seats),
    'it opens with the match\'s key to the boot configuration (the seats as booted)');
  host.core.dispose();
  host.pair.main.close();
}

console.log('[2] every welcomed seat holds it, a later one too');
{
  const host = await bootedHost(plan.seats);
  await sleep(400);
  const first = host.join(HOST_LOOPBACK_PEER, 'me');
  await until(() => first.welcomed);
  await sleep(400);
  const second = host.join(1, 'other', () => host.pair.main.post({ type: 'stop', reason: CLOSE_REASON.ROOM_CLOSED, detail: 'host went in the welcome beat' }));
  ok(await until(() => second.welcomed), 'the second seat is welcomed');
  await until(() => host.core.stopped);
  await sleep(300);
  ok(first.store.config !== null && second.store.config !== null, `both seats hold the configuration (${first.store.config ? 'first' : '-'}, ${second.store.config ? 'second' : '-'})`);
  host.core.dispose();
  host.pair.main.close();
}

console.log('[3] an elected host booted from the roster: the room\'s loadout for a present player, defaults for a departed one');
{
  const roster = plan.seats.map((seat) => ({ seat: seat.seat, team: seat.team === 'bravo' ? 1 : 0, bot: false, playerId: seat.playerId, name: seat.name, specId: seat.specId }));
  const left = structuredClone(room);
  left.players = left.players.filter((player) => player.id !== 'other'); // 'other' left the room; its hull stays in the match
  const fallback = planFromRoster(roster, left);
  const departed = fallback.seats.find((seat) => seat.playerId === 'other');
  ok(departed.equipment === null && departed.consumables === null && departed.camo === null,
    `the departed seat's plan names no loadout (${JSON.stringify([departed.equipment, departed.consumables, departed.camo])}), so the authority's defaults apply`);
  const host = await bootedHost(fallback.seats);
  const sim = host.core.actor?.authority;
  ok(!!sim, 'the elected host booted from the fallback plan');
  if (sim) {
    const me = sim.entityById.get('me'), other = sim.entityById.get('other');
    // the reference: the same vehicle seated with no loadout named at all (the authority's default path)
    const reference = await bootedHost(plan.seats.map((seat) => (seat.playerId === 'other' ? { ...seat, equipment: undefined, consumables: undefined, camo: undefined } : seat)));
    const ref = reference.core.actor.authority.entityById.get('other');
    ok(JSON.stringify(me.loadout) === JSON.stringify(['optics'])
      && JSON.stringify(me.consumableItems) === JSON.stringify(['repair_large', 'rations', 'extinguisher']),
      `the present player keeps the room's loadout (${me.loadout.join(', ')}; ${me.consumableItems.join(', ')})`);
    ok(me.camoBonus === camoSelectionBonus('auto', stockCamoPatternIdFor(me.specId), 'verdant'), `and the room's paint (camo bonus ${me.camoBonus})`);
    ok(other.loadout.length > 0 && JSON.stringify(other.loadout) === JSON.stringify(ref.loadout),
      `the departed player's hull carries the vehicle's default loadout (${other.loadout.join(', ') || 'none'}; the default ${ref.loadout.join(', ')})`);
    ok(JSON.stringify(other.consumableItems) === JSON.stringify(ref.consumableItems) && other.consumableItems.length === DEFAULT_CONSUMABLE_LOADOUT.length,
      `and the default items (${other.consumableItems.join(', ') || 'none'})`);
    reference.core.dispose();
    reference.pair.main.close();
  }
  host.core.dispose();
  host.pair.main.close();
}

console.log('[4] seats welcomed together each take the configuration once (a match start; a resume hold\'s release)');
{
  const crowd = createRoom({ roomCode: 'CFGWEL', mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc', equipment: ['optics'] },
    settings: { teamSize: 3, mapId: 'verdant', botsFill: false }, now: 1000 });
  for (let i = 1; i < 6; i++) joinRoom(crowd, { player: { id: `p${i}`, name: `P${i}` }, selection: { specId: 't90am', equipment: ['optics'] }, team: null, now: 1000 + i });
  const crowdSeats = planHostBoot(crowd, { matchId, round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', hostId: 'me' }, 'me').seats
    .filter((seat) => seat.team !== 'spectator');
  const restart = migrationFallback({ latestFrame: null, latestFrameAtMs: null, nowMs: Date.now(), resumeTick: 0, countdownMs: 1000, kept: true });
  for (const [label, resume] of [['a match start', null],
    ['a resume hold\'s release', { ...restart.state, resumeTick: restart.resumeTick, holdForSeats: crowdSeats.map((seat) => seat.playerId) }]]) {
    // the HELLOs reach the host as it reports ready, inside its first housekeeping beat: the cadence counts from the seal,
    // so that beat sends no second copy to the seats it finds welcomed
    const host = await bootedHost(crowdSeats, resume);
    const joined = crowdSeats.map((seat, i) => host.join(i === 0 ? HOST_LOOPBACK_PEER : i, seat.playerId));
    ok(await until(() => joined.every((seat) => seat.welcomed), 10_000), `${label}: the ${joined.length} seats are welcomed`);
    await sleep(1500);
    const copies = joined.map((seat) => (seat.configParts ? seat.configEvents / seat.configParts : 0));
    console.log(`  ${label}: copies of the configuration per seat [${copies.join(', ')}] (${copies.reduce((a, b) => a + b, 0)} in all; `
      + `${joined[0].configParts} chunk(s) each), ${host.core.stopped ? 'stopped' : 'running'}`);
    ok(copies.every((n) => n === 1), `${label}: each seat takes the configuration once, at its WELCOME (${copies.join(', ')})`);
    ok(joined.every((seat) => seat.store.config !== null), `${label}: each seat holds it`);
    host.core.dispose();
    host.pair.main.close();
  }
}

assert.ok(process.memoryUsage().rss < 1.5e9, 'bounded');
if (failures) { console.error(`matchHostCore.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('matchHostCore.selftest: each seat holds the sealed configuration from its WELCOME on; a roster fallback keeps the room\'s loadout '
  + 'for a present player and gives a departed one\'s hull the defaults');
