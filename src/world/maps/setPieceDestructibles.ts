/**
 * setPieceDestructibles.ts — the authored vehicle set pieces as destructibles (2026-10-12, the coordinator's item 7; the
 * owner, 2026-10-11: "some vehicles like the construuction vehicles and other stuff are not breaking on impact or being
 * fired").
 *
 * Until now the set pieces (vehicleSetPieces.ts: the haul trucks and dozers of Copper Mesa, the BV206s and Sno-Cats of
 * Whiteout, the lunar rovers) were baked into the painted bucket with one solid record: a shell stopped on them with no
 * effect, a blast skipped them and a tank stopped dead against them. Now each intact piece is a destructible record of its
 * own (props.ts, through the dressing's setPieceDestructible hook), its broken build the piece's own wreck, burnt and
 * crushed by the destruction presentation as every map vehicle is. A wrecked piece stays scenery (it is a wreck already).
 *
 * The mass classes: the light rover is crushed under a hull and broken by any round, which flies on, as a car or van is;
 * the heavy plant and rolling stock stop a round (dense: real cover) and the round that stops on them breaks them
 * (collision.ts DENSE_SET_PIECE_KINDS; both authorities break the crushable a round stops on), and a hull breaks them
 * only by ramming them hard or pressing on.
 */
import type { DestructiblePropType } from './inhabitKit.ts';
import { buildSetPiece, SET_PIECE_SIZE, type SetPieceKind } from './vehicleSetPieces.ts';

/** The destructible kind a set piece registers as. */
export function setPieceDestructibleKind(kind: SetPieceKind): string { return `setpiece_${kind}`; }

/** Per kind: the share of its speed a hull keeps crushing it, the speed (m/s) below which a hull stops against it (it may
 *  still press through), and whether it stops a round (dense cover). */
export const SET_PIECE_MASS: Readonly<Record<SetPieceKind, { keep: number; crushMin: number; dense: boolean }>> = {
  lrv: { keep: 0.95, crushMin: 1.4, dense: false },
  stz3: { keep: 0.75, crushMin: 2.6, dense: true },
  bv206: { keep: 0.72, crushMin: 2.8, dense: true },
  snocat: { keep: 0.7, crushMin: 3.0, dense: true },
  an26: { keep: 0.7, crushMin: 3.0, dense: true },
  d8h: { keep: 0.5, crushMin: 4.0, dense: true },
  k2tram: { keep: 0.55, crushMin: 4.0, dense: true },
  haulpak: { keep: 0.45, crushMin: 4.5, dense: true },
};

const KINDS = Object.keys(SET_PIECE_SIZE) as SetPieceKind[];
const DENSE_KINDS: ReadonlySet<string> = new Set(KINDS.filter((kind) => SET_PIECE_MASS[kind].dense).map(setPieceDestructibleKind));

/** Whether a collision record's kind is a set piece that stops a round (collision.ts isDenseCrushableCover). */
export function isDenseSetPieceKind(kind: string | undefined): boolean { return !!kind && DENSE_KINDS.has(kind); }
/** Whether a collision record's kind is any set piece. */
export function isSetPieceKind(kind: string | undefined): boolean { return !!kind && kind.startsWith('setpiece_'); }

/** The set pieces' destructible types (props.ts LOCAL_TYPES): seated on the ground under their corners, as a parked
 *  vehicle is; their own builds (the painted vertex colours, props.ts draws them with the baked family's material). */
export function setPieceDestructibleTypes(): Record<string, DestructiblePropType> {
  const out: Record<string, DestructiblePropType> = {};
  for (const kind of KINDS) {
    const size = SET_PIECE_SIZE[kind], mass = SET_PIECE_MASS[kind];
    out[setPieceDestructibleKind(kind)] = {
      cls: 'break', mat: 'vehicle', contact: 'ob', collider: true,
      r: Math.hypot(size.hw, size.hl), h: size.h, hw: size.hw, hl: size.hl,
      keep: mass.keep, crushMin: mass.crushMin, groundPose: true, castShadow: true,
      build: () => buildSetPiece(kind),
      broken: () => buildSetPiece(kind, { wrecked: true }),
    };
  }
  return out;
}
