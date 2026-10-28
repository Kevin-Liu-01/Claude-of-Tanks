/**
 * The solo sim Worker's core (soloSimProtocol.ts; RUST-ENGINE-DECISION §7 step 5, the rework of 2026-10-26): a free
 * sortie's authority on the world kernels, off the page's main thread. It builds the battlefield's collision world (the
 * Battle hover prepares it), loads the roster's anatomy, and steps the match actor with the player's seat and the bots
 * the page planned. The page's client says hello and is attached at once: there is no room, no seat token and nothing to
 * verify, since the page and this thread are one player's. No DOM: a Worker in the browser, in-process in the receipts.
 */
import { createMatchActor } from '../../server/match/matchActor.ts';
import type { ActorWorldCollision, MatchActor } from '../../server/match/matchActor.ts';
import type { ClientLink } from '../../server/match/link.ts';
import type { SeatClaims } from '../../server/match/seatClaims.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { hostRulesetFor } from '../mp/host/hostRuleset.ts';
import { loadCollisionWorld, loadWorldKernels } from '../mp/host/worldCollision.ts';
import { CLOSE_REASON, MAX_CLIENT_MESSAGE_BYTES, MESSAGE_TYPE } from '../mp/wire/constants.ts';
import type { CloseReasonId } from '../mp/wire/constants.ts';
import { decodeMessage } from '../mp/wire/codec.ts';
import { prepareAuthorityGround } from '../sim/authoritativeMatch.ts';
import { terrainVariantFor } from '../sim/matchRuleset.ts';
import { simKernelsFailureReason, type SimKernelsStatus } from '../world/simKernelsStatus.ts';
import type { PageToSoloSim, SoloSimBoot, SoloSimPort, SoloSimToPage, SoloSimWorld } from './soloSimProtocol.ts';

export interface SoloSimCoreOptions {
  /** The thread's end of the channel. */
  port: SoloSimPort<PageToSoloSim, SoloSimToPage>;
  /** The authority's battlefield (receipts pass 'terrain' or a fixture); by default the served manifest on the kernels. */
  buildWorld?: (world: SoloSimWorld) => Promise<ActorWorldCollision | 'terrain'>;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => () => void;
}

export interface SoloSimCore {
  readonly actor: MatchActor | null;
  dispose(): void;
}

/** The sortie's one connection: the page's client, over the channel. */
const PAGE_LINK_LABEL = 'page';

interface PageLink extends ClientLink {
  /** A frame from the page, once the seat is attached. */
  deliver(bytes: Uint8Array): void;
  /** The page replaced its connection: this one closes without a word to the page. */
  retire(): void;
}

/** Why a world was built without the kernels it named (the fallback stays, and the page reports it). */
const kernelsFailures = new WeakMap<object, string>();

async function defaultBuildWorld(world: SoloSimWorld): Promise<ActorWorldCollision | 'terrain'> {
  if (!world.manifestBase) return 'terrain';
  let failure: string | null = null;
  const kernels = world.simKernelsUrl
    ? await loadWorldKernels(world.simKernelsUrl).catch((error: unknown) => { failure = simKernelsFailureReason(error); return null; })
    : null;
  const built = await loadCollisionWorld(world.mapId, world.manifestBase, { variant: terrainVariantFor(world.mode), kernels });
  if (failure) kernelsFailures.set(built, failure);
  return built;
}

function kernelsStatusOf(world: ActorWorldCollision | 'terrain', config: SoloSimWorld): SimKernelsStatus {
  if (world !== 'terrain' && world.kernelSupportField) return { mode: 'wasm' };
  if (!config.simKernelsUrl) return { mode: 'ts', reason: 'off' };
  return { mode: 'ts', reason: world === 'terrain' ? 'terrain' : kernelsFailures.get(world) ?? 'unknown' };
}

const worldKey = (world: SoloSimWorld): string =>
  `${world.mapId}|${terrainVariantFor(world.mode) ?? ''}|${world.manifestBase ?? ''}|${world.simKernelsUrl ?? ''}`;

export function createSoloSimCore({
  port,
  buildWorld = defaultBuildWorld,
  now = () => (typeof performance === 'object' ? performance.now() : Date.now()),
  schedule,
}: SoloSimCoreOptions): SoloSimCore {
  let actor: MatchActor | null = null;
  let boot: SoloSimBoot | null = null;
  let prepared: { key: string; world: Promise<ActorWorldCollision | 'terrain'> } | null = null;
  let disposed = false;
  // the page's word on the countdown before the actor exists (its reveal can come while the world still loads)
  let countdownHeld: boolean | null = null;
  // the page's frames before its link is attached: queued, then delivered in order
  let pending: Uint8Array[] = [];
  let link: PageLink | null = null;
  let attached = false;

  const post = (message: SoloSimToPage, transfer?: Transferable[]): void => { if (!disposed) port.post(message, transfer); };

  function openLink(): PageLink {
    let closed = false;
    let messageListener: ((bytes: Uint8Array) => void) | null = null;
    let closeListener: (() => void) | null = null;
    const opened = {
      label: PAGE_LINK_LABEL,
      bufferedAmount: 0,
      get closed() { return closed; },
      send(bytes: Uint8Array) {
        if (closed) throw new Error('link closed');
        const copy = bytes.slice();
        post({ type: 'frame', bytes: copy.buffer }, [copy.buffer]);
      },
      close(reason: CloseReasonId, detail = '') {
        if (closed) return;
        closed = true;
        messageListener = null;
        const notify = closeListener;
        closeListener = null;
        if (link === opened) { link = null; attached = false; }
        post({ type: 'closed', reason, detail });
        notify?.();
      },
      onMessage(listener: (bytes: Uint8Array) => void) { messageListener = listener; },
      onClose(listener: () => void) { closeListener = listener; },
      deliver(bytes: Uint8Array) { if (!closed) messageListener?.(bytes); },
      retire() {
        if (closed) return;
        closed = true;
        messageListener = null;
        const notify = closeListener;
        closeListener = null;
        notify?.();
      },
    };
    return opened;
  }

  /** The page's hello attaches its seat at once: the claims are the sortie's own player's, nothing is signed. */
  function receive(bytes: Uint8Array): void {
    const live = actor;
    if (!live || !boot) { if (pending.length < 64) pending.push(bytes); return; }
    if (!link) link = openLink();
    if (attached) { link.deliver(bytes); return; }
    const decoded = decodeMessage(bytes, { maxBytes: MAX_CLIENT_MESSAGE_BYTES });
    if (!decoded.ok || decoded.message.type !== MESSAGE_TYPE.HELLO) {
      link.close(CLOSE_REASON.HELLO_REQUIRED, decoded.ok ? 'first frame must be hello' : decoded.error.code);
      return;
    }
    const player = boot.seats.find((seat) => seat.isPlayer)!;
    const issued = Date.now();
    const claims: SeatClaims = {
      v: 1, roomId: 'solo', seat: 0, playerId: player.playerId, name: player.name, team: player.team, specId: player.specId,
      iat: issued, exp: issued + 24 * 3600_000,
    };
    attached = live.attach(link, decoded.message, claims);
  }

  function prepare(world: SoloSimWorld, specIds: readonly string[]): void {
    if (prepared || boot || disposed) return;
    const started = now();
    const built = buildWorld(world).then((ready) => {
      if (ready !== 'terrain' && !disposed) prepareAuthorityGround(ready);
      return ready;
    });
    prepared = { key: worldKey(world), world: built };
    void Promise.all([built, ensureAuthorityFleet(specIds.filter((id) => typeof id === 'string' && id.length > 0))]).then(
      () => post({ type: 'prepared', ok: true, ms: Math.round(now() - started) }),
      (error: unknown) => post({ type: 'prepared', ok: false, ms: Math.round(now() - started), error: error instanceof Error ? error.message : String(error) }),
    );
  }

  async function start(next: SoloSimBoot): Promise<void> {
    if (boot) throw new Error('the solo sim boots once');
    boot = next;
    const bootStarted = now();
    const ready = prepared && prepared.key === worldKey(next) ? prepared.world : null;
    prepared = null;
    let worldMs = 0, fleetMs = 0;
    const worldTimed = (ready ? ready.catch(() => buildWorld(next)) : buildWorld(next)).then((world) => {
      worldMs = Math.round(now() - bootStarted);
      return world;
    });
    const fleetTimed = ensureAuthorityFleet(next.seats.map((seat) => seat.specId)).then((fleet) => {
      fleetMs = Math.round(now() - bootStarted);
      return fleet;
    });
    fleetTimed.catch(() => {});
    const [world] = await Promise.all([worldTimed, fleetTimed]);
    if (disposed) return;
    const actorStarted = now();
    const player = next.seats.find((seat) => seat.isPlayer);
    if (!player) throw new Error('a sortie seats its player');
    actor = createMatchActor({
      roomId: 'solo', mapId: next.mapId, mode: next.mode, seed: next.seed,
      seats: [{ seat: 0, playerId: player.playerId, name: player.name, team: player.team, specId: player.specId, equipment: player.equipment ?? [] }],
      bots: next.seats.filter((seat) => !seat.isPlayer).map((seat) => ({
        playerId: seat.playerId, name: seat.name, team: seat.team, specId: seat.specId, ...(seat.difficulty ? { difficulty: seat.difficulty } : {}),
      })),
      ruleset: hostRulesetFor(next.mode, next.arrangement ?? null, null),
      countdownS: next.countdownS,
      // the count stands until the page's reveal releases it (a held release before the actor existed is applied here)
      holdCountdown: countdownHeld ?? true,
      world, now, ...(schedule ? { schedule } : {}), autoStart: false,
    });
    actor.start();
    post({ type: 'ready', tick: actor.tick, kernels: kernelsStatusOf(world, next),
      timings: { worldMs, fleetMs, actorMs: Math.round(now() - actorStarted), bootMs: Math.round(now() - bootStarted), prepared: ready !== null } });
    for (const bytes of pending.splice(0)) receive(bytes);
  }

  const unsubscribe = port.onMessage((message) => {
    if (disposed) return;
    switch (message.type) {
      case 'prepare': prepare(message.world, message.specIds); return;
      case 'boot':
        void start(message.boot).catch((error: unknown) => {
          post({ type: 'boot_failed', error: error instanceof Error ? error.message : String(error) });
        });
        return;
      case 'frame': receive(new Uint8Array(message.bytes)); return;
      case 'reconnect':
        // a fresh connection: the old link retires quietly (the actor frees the seat) and the next frame is a new hello
        if (link) { const previous = link; link = null; attached = false; previous.retire(); }
        return;
      case 'pause': {
        if (!actor) return;
        if (message.paused) actor.pause();
        else actor.resume();
        post({ type: 'paused', paused: actor.paused, tick: actor.tick });
        return;
      }
      case 'countdown':
        countdownHeld = message.held;
        actor?.holdCountdown(message.held);
        return;
      case 'stop': actor?.stop(CLOSE_REASON.CLIENT_LEAVE, 'sortie ended'); return;
      default: return;
    }
  });

  return {
    get actor() { return actor; },
    dispose() {
      if (disposed) return;
      actor?.stop(CLOSE_REASON.CLIENT_LEAVE, 'sortie ended');
      disposed = true;
      unsubscribe();
      pending = [];
    },
  };
}
