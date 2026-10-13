// A host on another build is named, not silent (2026-10-12, MASTER item 5). Every frame's first byte is its
// WIRE_VERSION. Before this gate a client facing a host on another wire layout (an old tab still hosting a room when
// someone joins from the new page, the common peer-to-peer case at a deploy) could not decode a single frame: it was
// never welcomed and only counted decode errors, and the player saw nothing they could act on. Now, before the WELCOME,
// a frame of another wire version ends the join as PROTOCOL_VERSION with the words the player needs: refresh.
import assert from 'node:assert/strict';
import { createLoopbackPair } from '../transport/index.ts';
import { CLOSE_REASON, MESSAGE_TYPE, WIRE_VERSION } from '../wire/index.ts';
import { MatchClient } from './index.ts';
import { matchBuildMismatchMessage } from './matchClient.ts';

const NEUTRAL = () => ({ throttle: 0, steer: 0, brake: false, fire: false, aimLocked: false, aimYaw: 0, aimPitch: 0, aimDistance: 300, shellSlot: 0, actionPresses: 0 });

/** A host whose build writes `hostWire` as every frame's first byte: it answers the client's HELLO with a CLOSE. */
function joinHostOnWire(hostWire) {
  let nowMs = 10_000;
  const clock = () => nowMs;
  const pair = createLoopbackPair({ clock, clientToServer: { latencyMs: 20 }, serverToClient: { latencyMs: 20 } });
  let hellos = 0;
  pair.server.onFrame((frame) => {
    if (frame[0] === WIRE_VERSION && frame[1] === MESSAGE_TYPE.HELLO) {
      hellos++;
      // the other build's CLOSE (its layout is unreadable here; only its first byte matters)
      pair.server.send(new Uint8Array([hostWire, MESSAGE_TYPE.CLOSE, 1, 0, 0, 0, 0, 0]));
    }
  });
  pair.server.open();
  const client = new MatchClient({ transport: pair.client, token: 'tok-1', clock, controls: NEUTRAL, prediction: null });
  const phases = [];
  client.onPhase((phase, detail) => phases.push({ phase, detail }));
  client.connect();
  for (let t = 0; t < 3000 && !phases.some((p) => p.phase === 'closed'); t += 5) { nowMs += 5; pair.pump(nowMs); client.update?.(nowMs); }
  return { client, phases, hellos };
}

for (const [hostWire, words] of [[WIRE_VERSION - 1, /older version/], [WIRE_VERSION + 1, /newer version/]]) {
  const { client, phases, hellos } = joinHostOnWire(hostWire);
  assert.ok(hellos >= 1, 'the client said HELLO');
  const closed = phases.find((p) => p.phase === 'closed');
  assert.ok(closed, `host on wire ${hostWire}: the join ends instead of hanging unwelcomed`);
  assert.match(closed.detail, words, `host on wire ${hostWire}: the player is told what happened`);
  assert.match(closed.detail, /[Rr]efresh/, 'and what to do');
  assert.equal(client.lastCloseReason, CLOSE_REASON.PROTOCOL_VERSION, 'as the protocol-version close');
  assert.equal(closed.detail, matchBuildMismatchMessage(hostWire));
  client.dispose?.();
}
console.log(`matchBuildGate: a host on wire ${WIRE_VERSION - 1} or ${WIRE_VERSION + 1} ends the join as PROTOCOL_VERSION with "refresh" words; this build is wire ${WIRE_VERSION}`);
