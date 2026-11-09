/**
 * What the current solo entry asked for beyond its tank and map (2026-11-02 audit F2): the battlefield variant its
 * mode carves (Frontline Assault's trenches), the campaign operation it flies, whether it was a watched battle, and
 * (round 8 Y4 s3-04) whether it was a couch battle and how its seats took sides. Every solo entry records all four at
 * once, so nothing of an earlier entry survives into a later one (a Play-menu start after a watched Garage battle left
 * "watched" set, and Battle Again then watched instead of fighting; a couch battle's Battle Again replayed a keyboard
 * battle and dropped the phones), and a world build that names its own variant (a network room, null for a standard
 * room) is never given a solo leftover. Pure state: main owns the instance; the Garage phase clears it, keeping what
 * Battle Again replays (watched, couch).
 */
import type { CouchSides } from '../sim/matchRuleset.ts';
import type { CouchBattle } from './couchSeats.ts';

export type BattleTerrainVariant = 'assault-trenches' | null;

/** A couch entry as Battle Again replays it: its sides. The seats are read again at the replay (a phone may have left). */
export interface BattleEntryCouch {
  readonly sides: CouchSides;
}

export interface BattleEntryIntentRecord {
  readonly terrainVariant: BattleTerrainVariant;
  readonly campaignOperationId: string | null;
  readonly watched: boolean;
  readonly couch: BattleEntryCouch | null;
}

export interface BattleEntryIntent extends BattleEntryIntentRecord {
  /** A solo entry's whole intent, replacing every field of the last one. */
  begin(intent: BattleEntryIntentRecord): void;
  clear(): void;
  /**
   * The variant a world build takes: an explicit request wins, null included (a network room's standard battlefield);
   * only a battle-context build that names none takes the solo entry's.
   */
  resolveTerrainVariant(requested: BattleTerrainVariant | undefined, battleContext: boolean): BattleTerrainVariant;
}

const EMPTY: BattleEntryIntentRecord = Object.freeze({ terrainVariant: null, campaignOperationId: null, watched: false, couch: null });

export function createBattleEntryIntent(): BattleEntryIntent {
  let current: BattleEntryIntentRecord = EMPTY;
  return {
    get terrainVariant() { return current.terrainVariant; },
    get campaignOperationId() { return current.campaignOperationId; },
    get watched() { return current.watched; },
    get couch() { return current.couch; },
    begin({ terrainVariant, campaignOperationId, watched, couch }) {
      const sides = couch?.sides;
      current = Object.freeze({
        terrainVariant: terrainVariant === 'assault-trenches' ? terrainVariant : null,
        campaignOperationId: typeof campaignOperationId === 'string' && campaignOperationId ? campaignOperationId : null,
        watched: watched === true,
        couch: sides === 'together' || sides === 'teams' ? Object.freeze({ sides }) : null,
      });
    },
    clear() { current = EMPTY; },
    resolveTerrainVariant(requested, battleContext) {
      if (requested !== undefined) return requested === 'assault-trenches' ? requested : null;
      return battleContext ? current.terrainVariant : null;
    },
  };
}

/**
 * Battle Again's outcome (round 8 Y4 s3-04): a battle started (its cover is awaited), the couch lobby opened over the
 * Garage (no phone was here: the return settles in the Garage, no failure, no wait), or nothing could start.
 */
export type BattleAgainOutcome = 'started' | 'lobby' | 'unavailable';

/** The entry a replay asks the Garage's own press for. */
export interface BattleEntryReplay {
  readonly watch: boolean;
  readonly couch: CouchBattle | null;
}

export interface BattleEntryReplayPorts {
  /** The Garage's own press for the entry (src/ui/garage.ts replayEntry): false when it could not start. */
  replay(entry: BattleEntryReplay): boolean;
  /** The couch session's runtime (src/app/couchRuntime.ts), or null before its chunk loaded. */
  couch(): {
    seatsInPlay(): number[];
    startBattle(launch: (seats: readonly number[]) => boolean): boolean;
  } | null;
  /** The couch lobby over the Garage (src/ui/garage.ts openCouch): false when it could not open. */
  openCouchLobby(): boolean;
  /** A seat's name over its tank (the lobby's words, "Seat 2"). */
  seatName(seat: number): string;
}

/**
 * Battle Again replays the entry it follows, by its kind, through the Garage's own press (never a click on a button):
 * a watched battle is watched again, a couch battle starts again with the phones here now (its join window closed
 * first, couchRuntime.startBattle) or, with none here, opens the couch lobby; any other entry is the BATTLE press.
 */
export function replayBattleEntry(intent: Pick<BattleEntryIntentRecord, 'watched' | 'couch'>,
  ports: BattleEntryReplayPorts): BattleAgainOutcome {
  const couch = intent.couch;
  if (!couch) return ports.replay({ watch: intent.watched, couch: null }) ? 'started' : 'unavailable';
  const runtime = ports.couch();
  if (runtime && runtime.seatsInPlay().length) {
    const started = runtime.startBattle((seats) => ports.replay({ watch: false,
      couch: { seats, sides: couch.sides, names: seats.map((seat) => ports.seatName(seat)) } }));
    return started ? 'started' : 'unavailable';
  }
  return ports.openCouchLobby() ? 'lobby' : 'unavailable';
}
