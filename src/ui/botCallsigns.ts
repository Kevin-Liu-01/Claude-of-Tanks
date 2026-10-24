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

export const PLAYER_CALLSIGN = 'Claude';

/** FNV-1a over the string's UTF-16 units. */
export function hashCallsign(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A bot's callsign: hashed off its entity id and its vehicle (`specId`: the tank's spec id, null without a spec), the
 *  next free one where it meets one already `used`, a numbered fallback when the pool is spent. */
export function botCallsign(id: string, specId: string | null | undefined, used: ReadonlySet<string>): string {
  const start = hashCallsign(String(id) + (specId ? tankSeedId(specId) : '')) % BOT_CALLSIGNS.length; // schema-1 spelling
  for (let n = 0; n < BOT_CALLSIGNS.length; n++) {
    const candidate = BOT_CALLSIGNS[(start + n) % BOT_CALLSIGNS.length];
    if (!used.has(candidate)) return candidate;
  }
  return `Bot_${(hashCallsign(String(id)) % 90) + 10}`;
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
