/**
 * Where a room's match runs, seen from the Worker: in the host commander's
 * browser. Since the peer-to-peer re-scope (owner 2026-09-28, docs/MULTIPLAYER-V2.md
 * §13) the Room object elects the host, relays its signaling and migrates it
 * (`src/mp/room/p2pMatchHost.ts`); the dedicated-service backend of the first
 * design (a match container per room) left the tree with the cutover of
 * 2026-09-29 (§13.10). The Worker carries no game traffic.
 */
import type { MatchHost } from '../../../src/mp/room/roomActor.ts';
import { createP2pMatchHost } from '../../../src/mp/room/p2pMatchHost.ts';

/** The room's match host: the peer-to-peer one. */
export function createMatchHost(): MatchHost {
  return createP2pMatchHost();
}
