/**
 * fortifiedCover.ts — reinforced-concrete cover, the pillbox (destruction core lane, 2026-10-09; the coordinator's
 * ruling: "stop every shell, break only after accumulated heavy damage").
 *
 * A pillbox (world/collision.ts isFortifiedCoverKind) stops every round (dense cover) and every hull (no press, no
 * overrun). A blow is priced by the munition catalog's laws, in structure points (sim/munitionBlast.ts), as a building's
 * is: an explosive round's contact blast and its penetrator's strike, a ram's energy above reinforced concrete's
 * scuff (sim/structureDamage.ts ramStructurePoints). A round that carries no charge (kinetic rods, AP shot, small arms:
 * the catalog's non-explosive classes) only chips it, and an explosive blow under FORTIFIED_HIT_FLOOR_SP (autocannon
 * HE, an FPV warhead) leaves no mark either: whatever their number they never bring it down. The rest add up, and the
 * pillbox comes down when they reach FORTIFIED_HP_SP:
 *   125 mm HE (3.5 kg, 12.3 SP) — the third hit; 120 mm M1147 (10.9 SP) — the third; 105 mm HE (2.1 kg, 7.3 SP) — the
 *   fifth; 120 mm HEAT (7.8 SP) — the fourth; 152 mm howitzer HE (6.8 kg, 24 SP) — the second; 120 mm HESH (5.2 kg ×
 *   1.6, 29 SP) — the second; M829A4 APFSDS, 30 mm, 12.7 mm — never;
 *   a 60 t hull at 9 m/s (2.4 MJ, 33 SP) — one ram; a 40 t hull at 10 m/s (22 SP) — two; a 20 t hull at 12 m/s — never
 *   in one ram (it scuffs: 1.4 MJ, 8 SP).
 *
 * One ledger a match, in each simulation (game/state.ts game._fortified, sim/authoritativeMatch.ts): both call it at
 * the same moments with the same inputs, so both bring the same pillbox down on the same blow. A host migration's new
 * authority starts a fresh ledger: a pillbox standing at the hand-over stands undamaged.
 *
 * Pure: no three, no world. Units: structure points, tonnes, metres per second, seconds.
 */
import { MUNITION_PROFILES } from './destructionEvents.ts';
import {
  BLAST_POINTS_PER_KG, kineticStructurePoints, munitionChargeKg, munitionClassForShell, structureBlastPoints,
  type MunitionShellLike,
} from './munitionBlast.ts';
import { ramStructurePoints } from './structureDamage.ts';
import { isFortifiedCoverKind } from '../world/collision.ts';

/** An explosive blow under this many structure points leaves no mark on reinforced concrete (autocannon HE: 0.2-0.4;
 * 90 mm HE, 4.6, is the smallest tank HE round that counts). */
export const FORTIFIED_HIT_FLOOR_SP = 4;
/** The pillbox's structure points: two and a half contact bursts of the catalog's nominal tank HE round (3.5 kg). */
export const FORTIFIED_HP_SP = 2.5 * BLAST_POINTS_PER_KG * MUNITION_PROFILES.he.nominalChargeKg;
/** A hull's contacts with one pillbox less than this apart are one ram: it counts its peak closing speed once. */
const RAM_CONTACT_GAP_S = 0.5;

/** Is this collision record a standing pillbox (crushable, fortified)? */
export function isFortifiedCoverRecord(record: { crushable?: boolean; kind?: string } | null | undefined): boolean {
  return record?.crushable === true && isFortifiedCoverKind(record.kind);
}

/** The structure points a round that stopped on a pillbox deals it: an explosive round's contact blast and its
 * penetrator's strike, or 0 under the floor; a round with no charge, 0. */
export function fortifiedShellPoints(spec: MunitionShellLike): number {
  const munition = munitionClassForShell(spec);
  if (!MUNITION_PROFILES[munition].explosive) return 0;
  const points = kineticStructurePoints(spec, munition) + structureBlastPoints(munitionChargeKg(spec, munition), munition, 0);
  return points >= FORTIFIED_HIT_FLOOR_SP ? points : 0;
}

/** The structure points a ram deals a pillbox: its energy above reinforced concrete's scuff (1.1 MJ), at 40 kJ a point. */
export function fortifiedRamPoints(massTons: number, closingMps: number): number {
  return ramStructurePoints(massTons, closingMps, 'concrete');
}

interface LedgerEntry {
  points: number;
  /** The current contact's ram points already booked, and when the contact last pressed. */
  ramPoints: number;
  ramT: number;
}

/** A pillbox's records: the hull's contact record and the shells' collider are two records of one prop, booked as one
 * by their prop index. */
interface FortifiedRecord {
  readonly propIdx?: number;
}

export interface FortifiedCoverLedger {
  /** A round stopped on the record: true when this blow brings it down (the caller breaks the record). */
  shellHit(record: FortifiedRecord, spec: MunitionShellLike): boolean;
  /** A hull pressed on the record this step with this closing speed: true when the ram brings it down. */
  ram(record: FortifiedRecord, massTons: number, closingMps: number, timeS: number): boolean;
  /** The structure points the record's prop has taken. */
  pointsOf(record: FortifiedRecord): number;
}

export function createFortifiedCoverLedger(): FortifiedCoverLedger {
  const entries = new Map<number | FortifiedRecord, LedgerEntry>();
  const keyOf = (record: FortifiedRecord): number | FortifiedRecord => (typeof record.propIdx === 'number' ? record.propIdx : record);
  const entryOf = (record: FortifiedRecord): LedgerEntry => {
    const key = keyOf(record);
    let entry = entries.get(key);
    if (!entry) {
      entry = { points: 0, ramPoints: 0, ramT: -Infinity };
      entries.set(key, entry);
    }
    return entry;
  };
  const book = (entry: LedgerEntry, points: number): boolean => {
    if (!(points > 0) || entry.points >= FORTIFIED_HP_SP) return false;
    entry.points += points;
    return entry.points >= FORTIFIED_HP_SP;
  };
  return {
    shellHit(record, spec) {
      const points = fortifiedShellPoints(spec);
      return points > 0 && book(entryOf(record), points);
    },
    ram(record, massTons, closingMps, timeS) {
      const points = fortifiedRamPoints(massTons, closingMps);
      if (!(points > 0) && !entries.has(keyOf(record))) return false;
      const held = entryOf(record);
      if (timeS - held.ramT > RAM_CONTACT_GAP_S) held.ramPoints = 0;
      held.ramT = timeS;
      const added = points - held.ramPoints;
      if (!(added > 0)) return false;
      held.ramPoints = points;
      return book(held, added);
    },
    pointsOf(record) {
      return entries.get(keyOf(record))?.points ?? 0;
    },
  };
}
