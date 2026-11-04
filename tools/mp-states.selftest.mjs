// 2026-11-02 audit S3: the multiplayer harnesses spelled the protocol's state words as string literals ('lobby',
// 'playing', 'live', 'host' ...), so a renamed phase in src/mp turned a harness into a timeout instead of a failure.
// The protocol modules now export their vocabularies as runtime lists, tools/mp-states.mjs serves them to the harnesses
// (a word the owner does not have throws by name), and no harness compares an MP state field to a literal word.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOST_STATE, MATCH_PHASE, ROOM_CLIENT_PHASE, ROOM_MATCH_STATUS, ROOM_PHASE, SESSION_PHASE, SESSION_ROLE, TRANSPORT_STATE,
} from './mp-states.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const words = (vocabulary) => Object.keys(vocabulary);
const union = (file, name) => {
  const body = read(file).match(new RegExp(`(?:export )?type ${name} =([\\s\\S]*?);\\n`))?.[1];
  assert.ok(body, `${file} declares ${name}`);
  return [...body.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
};

// Each list is its owner's union: the ones still spelled as a union are pinned to it, the rest derive their type from
// the list itself.
assert.deepEqual(words(SESSION_PHASE), union('src/mp/session/matchSession.ts', 'SessionPhase'));
assert.deepEqual(words(SESSION_ROLE), union('src/mp/session/matchSession.ts', 'SessionRole'), 'SessionRole without null');
assert.deepEqual(words(MATCH_PHASE), union('src/mp/match/recovery.ts', 'ConnectionPhase'));
assert.deepEqual(words(HOST_STATE), union('src/mp/host/matchHost.ts', 'MatchHostState'));
for (const [file, list, type] of [
  ['src/mp/room/protocol.ts', 'ROOM_PHASES', 'RoomPhase'], ['src/mp/room/protocol.ts', 'ROOM_MATCH_STATUSES', 'RoomMatchStatus'],
  ['src/mp/room/roomClient.ts', 'ROOM_CLIENT_PHASES', 'RoomClientPhase'],
  ['src/mp/transport/transport.ts', 'TRANSPORT_STATES', 'TransportState'],
]) {
  assert.match(read(file), new RegExp(`export type ${type} = typeof ${list}\\[number\\];`), `${type} is its list's`);
}
assert.deepEqual(words(ROOM_PHASE), ['waiting', 'starting', 'playing']);
assert.deepEqual(words(ROOM_MATCH_STATUS), ['starting', 'playing', 'ended', 'lost']);
assert.deepEqual(words(ROOM_CLIENT_PHASE), ['idle', 'connecting', 'joined', 'reconnecting', 'closed']);
assert.deepEqual(words(TRANSPORT_STATE), ['idle', 'connecting', 'open', 'reconnecting', 'closed']);

// A word is itself; a word the owner does not have throws by name (a harness fails at the line, not at its timeout).
assert.equal(ROOM_PHASE.playing, 'playing');
assert.equal(SESSION_ROLE.host, 'host');
assert.throws(() => ROOM_PHASE.play, /RoomPhase has no state play \(waiting, starting, playing\)/);
assert.throws(() => MATCH_PHASE.ended, /ConnectionPhase has no state ended/);
assert.equal(`${HOST_STATE.live}`, 'live');
assert.equal(JSON.stringify({ phase: SESSION_PHASE.lobby }), '{"phase":"lobby"}');

// The harnesses: no MP state field compared to a literal word. The exceptions are other vocabularies, named here.
{
  const all = new Set([HOST_STATE, MATCH_PHASE, ROOM_CLIENT_PHASE, ROOM_MATCH_STATUS, ROOM_PHASE, SESSION_PHASE,
    SESSION_ROLE, TRANSPORT_STATE].flatMap(words));
  const literal = new RegExp(`\\.(?:phase|role|state|hostState|status|matchPhase)\\s*[!=]==\\s*'(?:${[...all].join('|')})'`, 'g');
  const exceptions = {
    // the headless peer harness reports its own match phases ('ended' among them): two vocabularies (findings 24 #8)
    'tools/mp-p2p-soak.mjs': ["entry.phase === 'closed'", "entry.phase === 'ended'", "entry.phase === 'failed'"],
    // the authority's own MatchPhase (src/sim/authoritativeMatch.ts), not a protocol state
    'tools/mp-soak.mjs': ["stats.phase === 'playing'"],
    'tools/mp-world-events-audit.mjs': ["authority.phase === 'playing'", "authority.phase === 'playing'"],
  };
  const harnesses = readdirSync(join(ROOT, 'tools')).filter((name) => /^mp-.*\.mjs$/.test(name) && name !== 'mp-states.selftest.mjs')
    .map((name) => `tools/${name}`).concat(['tools/marketing-shots/capture-multiplayer-dual-screen.mjs']);
  const found = {};
  for (const file of harnesses) {
    const hits = [...read(file).matchAll(new RegExp(`[A-Za-z0-9_$?.()]*${literal.source}`, 'g'))].map((match) => match[0]
      .replace(/^.*?([A-Za-z0-9_$]+\??\.(?:phase|role|state|hostState|status|matchPhase))/, '$1'));
    if (hits.length) found[file] = hits;
  }
  assert.deepEqual(found, exceptions, 'MP harness comparisons against literal state words');
  assert.match(read('tools/mp-room-lifecycle.mjs'), /import \{[^}]*ROOM_PHASE[^}]*\} from '\.\/mp-states\.mjs';/);
}

console.log('mp-states.selftest: the MP vocabularies come from their owners; the harnesses spell none of them');
