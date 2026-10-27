// Bot callsigns, one assignment for a battle's roster (moved out of hud.ts): every surface names a bot alike, the
// battle load's cards (game/rosterPresentation.ts) as the HUD's rosters, feed and plates. Copyright © 2026 Kevin B. Liu.
//
// A bot's callsign is hashed off its entity id and vehicle from this pool, a collision probing forward to the next free
// one. The assignment walks the battle's tank list in its own order (the HUD frame's tanks are the game's), so a name
// never depends on which surface asked first. A tank with a display name keeps it; the player is PLAYER_CALLSIGN.
import { tankSeedId } from '../vehicles/tankIdAliases.ts';

const BOT_CALLSIGNS = [
  'IronMaus', 'SteppeWolf_71', 'Kranvagn', 'DustDevil', 'Bogatyr',
  'HullDown_Hank', 'PzKpfwPete', 'Kettenkrad', 'RicochetRita', 'TokTokkie',
  'GeneralLee42', 'Zaseka', 'MudCrawler', 'BiaTheBear', 'SabotSally',
  'Feldwebel_K', 'OldNikolai', 'TinCanAlly', 'GrilleGuy', 'VodkaVanya',
  'CamoNet', 'LongStop', 'DerbyDozer', 'PakWagen',
] as const;

/**
 * The pool past the first 24, probed only once those are taken, so a field of 24 bots or fewer names them as before
 * (Main 2026-10-26: a 21 v 21 field's 41 bots, and a room's fills to 32 a side, ran the 24 out into repeated Bot_N names
 * on the load card and the HUD). 72 in all: a 32 v 32 room's 63 bots with room to spare.
 */
const MORE_BOT_CALLSIGNS = [
  'TurretTina', 'MantletMarco', 'SchurzenSam', 'GunneryGus', 'TrackPin_Tom', 'BoreSighter',
  'HEATwave', 'APFSDarla', 'Kugelblitz_K', 'SnorkelSven', 'CromwellCarl', 'WaffleTrack',
  'IdlerIvan', 'SprocketSue', 'BrewUpBert', 'Smokescreen_S', 'TatraTibor', 'PancerzPiotr',
  'SisuSeppo', 'StrvStina', 'MotiMerkava', 'KwonK2', 'HetzerHans', 'BersaglieriBea',
  'LeclercLou', 'RatelRudi', 'RaijinRyo', 'YanType59', 'OplotOlek', 'BorisBMP',
  'WieselWilli', 'PumaPaula', 'CarinaCV90', 'AldoAriete', 'TankerTam', 'MudGuardMo',
  'Crabwalk_C', 'HatchOpenHal', 'PintlePat', 'GlacisGreta', 'ReactiveRex', 'SpallSy',
  'RollbackRoy', 'DieselDora', 'MuzzleBrakeMax', 'Rangefinder_R', 'LaserLaszlo', 'CupolaKai',
] as const;

export const PLAYER_CALLSIGN = 'Claude';

/** FNV-1a over the string's UTF-16 units. */
export function hashCallsign(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A bot's callsign: hashed off its entity id and its vehicle (`specId`: the tank's spec id, null without a spec), the
 *  next free one where it meets one already `used`: the first 24, then the rest of the pool, then a numbered name, the
 *  first number free (a field past all 72). */
export function botCallsign(id: string, specId: string | null | undefined, used: ReadonlySet<string>): string {
  const seed = hashCallsign(String(id) + (specId ? tankSeedId(specId) : '')); // schema-1 spelling
  for (const pool of [BOT_CALLSIGNS, MORE_BOT_CALLSIGNS]) {
    const start = seed % pool.length;
    for (let n = 0; n < pool.length; n++) {
      const candidate = pool[(start + n) % pool.length];
      if (!used.has(candidate)) return candidate;
    }
  }
  const first = (hashCallsign(String(id)) % 90) + 10;
  for (let n = 0; n <= used.size; n++) if (!used.has(`Bot_${first + n}`)) return `Bot_${first + n}`;
  return `Bot_${first + used.size + 1}`;
}

export interface CallsignTank {
  readonly id: string;
  /** The tank's spec id as its spec names it (null: no spec). */
  readonly specId?: string | null;
  readonly displayName?: string | null;
  readonly isPlayer?: boolean;
}

/** The bots' callsigns over a battle's tanks, in the list's order (display names and the player take none). */
export function rosterCallsigns(tanks: readonly CallsignTank[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const tank of tanks) {
    if (!tank || tank.displayName || tank.isPlayer || out.has(tank.id)) continue;
    const callsign = botCallsign(tank.id, tank.specId, used);
    out.set(tank.id, callsign);
    used.add(callsign);
  }
  return out;
}
