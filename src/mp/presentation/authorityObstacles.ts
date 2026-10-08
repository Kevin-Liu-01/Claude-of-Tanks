/**
 * Which record of this viewer's world is the authority's obstacle (ghost-crunch lane, 2026-10-02).
 *
 * The authority names an obstacle by its index in the map's collision manifest, captured from the desktop tier's
 * build of the base map (tools/headlessWorldCollision.mjs). A viewer's world shares those indices unless it was laid
 * out otherwise: the mobile tier counts fewer props and trees (verdant: 6,641 records against 6,977, 57 of them at the
 * manifest's index) and Frontline Assault's trench works add records ahead of the trees (verdant: +144, every tree
 * shifted). There record N is another prop, and until this lane every fall the authority sent felled it — a tree nobody
 * touched, with its crunch, while the prop that fell stood on (237 of 274 falls on the mobile tier).
 *
 * A fall finds the viewer's own record of the prop by the identity the event carries (box centre on the ground plane
 * and kind): the record at the index when it is that prop, else the one found around the centre, else none — never
 * another prop. The persistent destroyed list carries indices only: it is read by index where the world shares them,
 * through the authority's identities (`setIdentities`, the manifest) where it does not, or not at all. An event whose
 * record at its index is another prop proves the world does not share the indices, whatever its layout claimed.
 */
import type { PredictionObstacle, WorldCollisionLike } from './predictionWorld.ts';

type RuntimeValue = {} | null | undefined;

/** What names an authority obstacle in any world: its box centre on the ground plane and its kind. */
export interface ObstacleIdentity {
  x: number;
  z: number;
  kind: string | null;
}

interface AuthorityObstacles {
  /** Whether this world's obstacle list is the authority's index space (false for a world laid out otherwise). */
  readonly shared: boolean;
  /** Whether the persistent destroyed list can be read here: the indices are shared, or the authority's identities known. */
  readonly listReadable: boolean;
  /** This world's record of the prop a `world_prop_destroyed` names (its index, and the identity it carries), or null. */
  fallen(index: number, payload: Record<string, RuntimeValue>): PredictionObstacle | null;
  /** This world's record of a listed (destroyed) authority index, or null. */
  listed(index: number): PredictionObstacle | null;
  /** The authority's identities by index (its collision manifest). */
  setIdentities(identity: (index: number) => ObstacleIdentity | null): void;
}

/** Two records of one world never share a centre within this unless they are one prop (the manifest packs 0.1 mm). */
const IDENTITY_TOLERANCE_M = 0.01;

/** The identity a `world_prop_destroyed` carries (null from an older host, which sent the index alone). */
function eventIdentity(payload: Record<string, RuntimeValue>): ObstacleIdentity | null {
  const { x, z, kind } = payload;
  return typeof x === 'number' && typeof z === 'number' && Number.isFinite(x) && Number.isFinite(z)
    ? { x, z, kind: typeof kind === 'string' ? kind : null } : null;
}

function hasIdentity(obstacle: PredictionObstacle, identity: ObstacleIdentity): boolean {
  return Math.abs((obstacle.min[0] + obstacle.max[0]) * 0.5 - identity.x) <= IDENTITY_TOLERANCE_M
    && Math.abs((obstacle.min[2] + obstacle.max[2]) * 0.5 - identity.z) <= IDENTITY_TOLERANCE_M
    && (!identity.kind || !obstacle.kind || obstacle.kind === identity.kind);
}

/**
 * The authority's obstacles in `world`: shared indices unless an event proves otherwise. The authority plays the mode's
 * battlefield variant from that variant's own manifest (2026-10-08: Frontline's trench works included), so a world shares
 * its indices whatever its variant; and the mobile tier places what the desktop places, record for record (2026-10-08:
 * the placement split, the scenery lane's rock masses and the facades lane's row-house bands — the phone-tier check reads
 * 33 of 33 shards), so it shares them too. An event whose record at its index is another prop still turns this off and
 * finds its prop by identity: a layout that drifts again degrades to the identity path, never to a wrong fall.
 */
export function createAuthorityObstacles(world: WorldCollisionLike | null): AuthorityObstacles {
  let shared = !!world;
  let identities: ((index: number) => ObstacleIdentity | null) | null = null;
  const candidates: PredictionObstacle[] = [];

  /** This world's record with the identity, a standing one first (a hedgehog's crossed beams share one: any fells it). */
  function byIdentity(identity: ObstacleIdentity): PredictionObstacle | null {
    if (!world) return null;
    const { x, z } = identity;
    const found = typeof world.queryObstacles === 'function'
      ? world.queryObstacles(x - IDENTITY_TOLERANCE_M, z - IDENTITY_TOLERANCE_M, x + IDENTITY_TOLERANCE_M, z + IDENTITY_TOLERANCE_M, candidates)
      : (typeof world.getObstacles === 'function' ? world.getObstacles() : []);
    let fallen: PredictionObstacle | null = null;
    for (const candidate of found) {
      if (!hasIdentity(candidate, identity)) continue;
      if (!candidate.crushed) return candidate;
      fallen ??= candidate;
    }
    return fallen;
  }

  /** This world's record of the authority's obstacle `index`, which `identity` names when one is known. */
  function resolve(index: number, identity: ObstacleIdentity | null): PredictionObstacle | null {
    if (!world || typeof world.getObstacles !== 'function') return null;
    const atIndex = Number.isSafeInteger(index) && index >= 0 ? world.getObstacles()[index] ?? null : null;
    // an older host's event names the index alone: trusted only where this world shares the authority's indices
    if (!identity) return shared ? atIndex : null;
    if (atIndex && hasIdentity(atIndex, identity)) return atIndex;
    shared = false;
    return byIdentity(identity);
  }

  return {
    get shared() { return shared; },
    get listReadable() { return shared || identities !== null; },
    fallen: (index, payload) => resolve(index, eventIdentity(payload)),
    listed: (index) => resolve(index, identities?.(index) ?? null),
    setIdentities(identity) { identities = identity; },
  };
}
