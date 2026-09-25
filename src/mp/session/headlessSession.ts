/**
 * Headless composition of the v2 session: a RoomClient and a MatchSession on a
 * WebSocket factory the caller supplies (`ws` in Node), a RecordingPresentation
 * per round and scripted controls, stepped by the caller's ticker. The receipts
 * and `tools/mp-rooms-e2e.mjs` drive N of these against a room host.
 */
import type { ControlSample } from '../match/inputStream.ts';
import { RecordingPresentation } from '../presentation/adapter.ts';
import type { SocketFactory } from '../transport/webSocketTransport.ts';
import { RoomClient } from '../room/roomClient.ts';
import type { RoomClientOptions, StorageLike } from '../room/roomClient.ts';
import { MatchSession } from './matchSession.ts';
import type { MatchSessionOptions, SessionRound } from './matchSession.ts';

export interface HeadlessSessionOptions {
  endpoint: string;
  player: { id: string; name: string };
  createSocket: SocketFactory;
  storage?: StorageLike | null;
  /** Controls for a seated round; omit for a neutral tank. */
  controls?: ((tick: number) => Readonly<ControlSample> | null) | null;
  clock?: () => number;
  clientBuild?: string;
  /** Frames the recorder keeps. */
  recordedFrames?: number;
  room?: Partial<Omit<RoomClientOptions, 'endpoint' | 'player' | 'storage' | 'clock' | 'clientBuild' | 'transport'>>;
  session?: Partial<Omit<MatchSessionOptions, 'room' | 'createPresentation' | 'createTransport' | 'clock' | 'clientBuild' | 'transport'>>;
}

export interface HeadlessSession {
  readonly room: RoomClient;
  readonly session: MatchSession;
  /** The recorder of the current (or last) round. */
  readonly presentation: RecordingPresentation | null;
  /** Rounds entered, oldest first, each with its recorder. */
  readonly rounds: Array<{ round: SessionRound; presentation: RecordingPresentation }>;
  /** One display frame on the caller's clock. */
  step(nowMs: number, elapsedS: number): void;
  dispose(): void;
}

/** A memory storage for capabilities (one per headless player; share it to model a reload). */
export function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); }, removeItem: (key) => { map.delete(key); } };
}

/** Drive in wide arcs, shoot every 4 s, occasionally press an action; each index a different phase. */
export function scriptedControls(index: number): (tick: number) => ControlSample {
  const phase = index * 97;
  return (tick) => {
    const t = tick + phase;
    return {
      throttle: t > 120 ? (t % 1400 < 1100 ? 1 : 0.2) : 0,
      steer: Math.sin(t / 240) * 0.6,
      brake: false,
      fire: t % 240 === 0 && t > 200,
      aimLocked: false,
      aimYaw: Math.sin(t / 400) * 1.2,
      aimPitch: 0,
      aimDistance: 300,
      shellSlot: 0,
      actionPresses: t % 900 === 0 && t > 300 ? 1 : 0,
    };
  };
}

export function createHeadlessSession({
  endpoint,
  player,
  createSocket,
  storage = memoryStorage(),
  controls = null,
  clock = () => (typeof performance === 'object' ? performance.now() : Date.now()),
  clientBuild = 'headless',
  recordedFrames = 256,
  room: roomOptions = {},
  session: sessionOptions = {},
}: HeadlessSessionOptions): HeadlessSession {
  const room = new RoomClient({ endpoint, player, storage, clock, clientBuild, transport: { createSocket }, ...roomOptions });
  const rounds: Array<{ round: SessionRound; presentation: RecordingPresentation }> = [];
  const session = new MatchSession({
    room,
    clock,
    clientBuild,
    transport: { createSocket },
    createPresentation: (round) => {
      const presentation = new RecordingPresentation(recordedFrames);
      rounds.push({ round, presentation });
      return {
        adapter: presentation,
        controls: round.spectator ? null : controls,
        prediction: null,
        dispose: () => presentation.dispose(),
      };
    },
    ...sessionOptions,
  });
  session.start();
  return {
    room,
    session,
    get presentation() { return rounds.at(-1)?.presentation ?? null; },
    rounds,
    step(nowMs, elapsedS) { session.update(nowMs, elapsedS); },
    dispose() { session.dispose(); room.dispose(); },
  };
}
