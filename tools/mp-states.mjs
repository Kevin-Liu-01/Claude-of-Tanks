// mp-states.mjs — the multiplayer state words the harnesses compare against, imported from the protocol modules
// (2026-11-02 audit S3). The harnesses used to spell 'lobby', 'playing', 'live', 'host' ... as string literals, so a
// renamed phase in src/mp turned a harness into a timeout instead of a failure. Each vocabulary here is the owner's
// runtime list, and reading a word it does not have throws by name. tools/mp-states.selftest.mjs pins every list to
// its TypeScript union and keeps the harnesses free of the literals.
import { SESSION_PHASES, SESSION_ROLES } from '../src/mp/session/matchSession.ts';
import { ROOM_MATCH_STATUSES, ROOM_PHASES } from '../src/mp/room/protocol.ts';
import { ROOM_CLIENT_PHASES } from '../src/mp/room/roomClient.ts';
import { CONNECTION_PHASES } from '../src/mp/match/recovery.ts';
import { MATCH_HOST_STATES } from '../src/mp/host/matchHost.ts';
import { TRANSPORT_STATES } from '../src/mp/transport/transport.ts';

/** `{ word: 'word' }` for each word of an owner's list; any other name throws (a typo, or a word the owner dropped). */
function vocabulary(name, words) {
  const table = Object.freeze(Object.fromEntries(words.map((word) => [word, word])));
  return new Proxy(table, {
    get(target, key) {
      if (typeof key !== 'string' || key in target || key === 'then' || key === 'toJSON') return Reflect.get(target, key);
      throw new Error(`mp-states: ${name} has no state ${key} (${words.join(', ')})`);
    },
  });
}

/** MatchSession.phase (src/mp/session/matchSession.ts SessionPhase). */
export const SESSION_PHASE = vocabulary('SessionPhase', SESSION_PHASES);
/** MatchSession.role and stats().p2p.role (SessionRole, without null). */
export const SESSION_ROLE = vocabulary('SessionRole', SESSION_ROLES);
/** The room snapshot's phase (src/mp/room/protocol.ts RoomPhase). */
export const ROOM_PHASE = vocabulary('RoomPhase', ROOM_PHASES);
/** A room match status row's status (RoomMatchStatus). */
export const ROOM_MATCH_STATUS = vocabulary('RoomMatchStatus', ROOM_MATCH_STATUSES);
/** RoomClient.phase (src/mp/room/roomClient.ts RoomClientPhase). */
export const ROOM_CLIENT_PHASE = vocabulary('RoomClientPhase', ROOM_CLIENT_PHASES);
/** The match client's connection phase, session.match.phase (src/mp/match/recovery.ts ConnectionPhase). */
export const MATCH_PHASE = vocabulary('ConnectionPhase', CONNECTION_PHASES);
/** The host runtime's state, session.matchHost.state and stats().p2p.hostState (src/mp/host/matchHost.ts). */
export const HOST_STATE = vocabulary('MatchHostState', MATCH_HOST_STATES);
/** One transport's lifecycle, transport.state and its change events (src/mp/transport/transport.ts TransportState). */
export const TRANSPORT_STATE = vocabulary('TransportState', TRANSPORT_STATES);
