/**
 * A recording's battle set up again (replay-system, docs/REPLAY.md "Setup is captured"): the one place that turns a
 * header back into the battle its recorder saw. The headless replayer (replayRunner.ts) and the page's viewer
 * (app/replayViewerRuntime.ts) both call it, so the two seat the same roster: the recorded roster itself (seated as
 * recorded, never drawn again: replay-fixes-277; with its TEAM NATIONS record as recorded: replay-notes-278), the roster seed, the battle count, the previous battles' bots (Sets on
 * the page, arrays in the file), the debug roster flags and every localStorage value setup read (served by a stand-in for
 * the length of the setup call only) go round the caller's own setupBattle. The caller adds what only it knows (its
 * world, deferred visuals). Node-runnable.
 */
import type { RuntimeValue } from '../../runtimeTypes.ts';
import type { ReplayHeader, ReplayTeamNations } from '../../sim/replayFormat.ts';
import { terrainVariantFor, type TerrainVariant } from '../../sim/matchRuleset.ts';

/** The options a recorded setup passes to state.ts setupBattle (the caller adds its own beside them). */
export interface RecordedSetupOptions {
  random: boolean;
  gameMode?: string;
  campaignOperationId?: string;
  deferOpeningRoutes: boolean;
  seed?: number;
  /** The recorded roster, seated as recorded (state.ts setupBattle, rosterState.seatRecordedRoster), never drawn again. */
  recordedRoster: readonly { id: string; specId: string; team: string }[];
  /** The recorded TEAM NATIONS record, seated with the roster (the planner that made it never runs in a replay). */
  recordedTeamNations: ReplayTeamNations | null;
}

/** What the page needs to enter the recording's battle before setup runs: its map, the player's tank and the mode. */
export interface RecordedBattle {
  mapId: string;
  playerSpecId: string;
  gameMode: string;
  campaignOperationId: string | null;
  randomRoster: boolean;
}

type SetupRecord = Record<string, RuntimeValue> & { options?: Record<string, RuntimeValue> };

export function recordedBattle(header: ReplayHeader): RecordedBattle {
  const setup = header.setup as SetupRecord;
  const options = setup.options ?? {};
  return {
    mapId: String(setup.mapId ?? ''),
    playerSpecId: String(setup.playerSpecId ?? ''),
    gameMode: typeof options.gameMode === 'string' && options.gameMode ? options.gameMode : 'standard',
    campaignOperationId: typeof options.campaignOperationId === 'string' ? options.campaignOperationId : null,
    randomRoster: options.random === true,
  };
}

/**
 * The battlefield variant the recording's battle stepped on (replay-receipts-279): its mode's, by the rule the live battle's
 * world is built with (main.ts: terrainVariantFor(mode) to world/map.ts, whose config is world/worldBuildConfig.ts). Every
 * world a replay builds from a map id (the indexer Worker, tools/replay-world.mjs) builds it with this, or a Frontline
 * Assault replay steps on a field without its trenches and drifts at its first checksum (live 276-278).
 */
export function recordedTerrainVariant(header: ReplayHeader): TerrainVariant | null {
  return terrainVariantFor(recordedBattle(header).gameMode);
}

/** A localStorage that answers what the recording read, installed on globalThis until the returned release runs. */
export function installRecordedStorage(header: ReplayHeader): () => void {
  return installStorage(((header.setup as SetupRecord).storage ?? {}) as Record<string, string | null>);
}

function installStorage(values: Record<string, string | null>): () => void {
  const root = globalThis as Record<string, unknown>;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = new Map(Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const stand = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    key: (index: number) => [...store.keys()][index] ?? null,
    clear: () => store.clear(),
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: stand, configurable: true, writable: true });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete root.localStorage;
  };
}

/** The game fields setup reads beyond its options. */
interface SetupGame {
  rosterSeed?: number;
  battleCount?: number;
  previousBotSpecIds?: RuntimeValue;
  recentBotSpecIds?: RuntimeValue;
}

/**
 * `setup` run as the recording's own setup: the game's roster fields set, the recorded storage and debug flags served
 * for the call, and the recorded options handed to it. The caller's setupBattle adds its world and its own options.
 * `storage: 'caller'` leaves the storage stand-in to the caller (the headless replayer keeps it for the whole run,
 * since stepping reads storage too; installRecordedStorage); by default it serves the setup call only.
 */
export function runRecordedSetup<TResult>(game: SetupGame, header: ReplayHeader, setup: (playerSpecId: string, options: RecordedSetupOptions) => TResult,
  { storage = 'call' }: { storage?: 'call' | 'caller' } = {}): TResult {
  const record = header.setup as SetupRecord;
  game.rosterSeed = Number(record.rosterSeed) >>> 0;
  game.battleCount = Number(record.battleCount);
  // the bot memory is two Sets on the page (rosterState.ts), arrays in the recording
  const specSet = (value: RuntimeValue | undefined) => (Array.isArray(value) ? new Set(value.map(String)) : null);
  game.previousBotSpecIds = specSet(record.previousBotSpecIds) as RuntimeValue;
  game.recentBotSpecIds = specSet(record.recentBotSpecIds) as RuntimeValue;
  const options = record.options ?? {};
  const recorded: RecordedSetupOptions = {
    random: options.random === true,
    ...(typeof options.gameMode === 'string' && options.gameMode ? { gameMode: options.gameMode } : {}),
    ...(typeof options.campaignOperationId === 'string' ? { campaignOperationId: options.campaignOperationId } : {}),
    deferOpeningRoutes: options.deferOpeningRoutes === true,
    ...(typeof record.seed === 'number' ? { seed: record.seed } : {}),
    recordedRoster: header.roster.map((entry) => ({ id: entry.id, specId: entry.specId, team: entry.team })),
    recordedTeamNations: header.teamNations ?? null,
  };
  const releaseStorage = storage === 'call' ? installRecordedStorage(header) : null;
  const root = globalThis as { __DEBUG?: unknown };
  const previousDebug = root.__DEBUG;
  if (record.debugFlags) root.__DEBUG = { flags: record.debugFlags };
  try {
    return setup(String(record.playerSpecId ?? ''), recorded);
  } finally {
    if (record.debugFlags) root.__DEBUG = previousDebug;
    releaseStorage?.();
  }
}

/** The battle seated a different roster from the recording's (ids, specs and sides, in order): why, or null. */
export function rosterMismatch(tanks: readonly { id: string; specId: string; team: string }[], header: ReplayHeader): string | null {
  const seated = tanks.map((hull) => `${hull.id}:${hull.specId}:${hull.team}`).join(',');
  const recorded = header.roster.map((entry) => `${entry.id}:${entry.specId}:${entry.team}`).join(',');
  return seated === recorded ? null : `replay: the battle seated ${seated}, the recording ${recorded}`;
}
