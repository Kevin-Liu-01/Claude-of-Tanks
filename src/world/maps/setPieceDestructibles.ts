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
import { buildRollingStock, RAIL_HEAD_M, ROLLING_STOCK_BODY, ROLLING_STOCK_LENGTH, type RollingStockKind } from './rollingStock.ts';

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
 *  vehicle is; their own builds (the painted vertex colours, props.ts draws them with the baked family's material);
 *  `mobile`: the phone tier's coarse builds. */
export function setPieceDestructibleTypes(mobile = false): Record<string, DestructiblePropType> {
  const out: Record<string, DestructiblePropType> = {};
  for (const kind of KINDS) {
    const size = SET_PIECE_SIZE[kind], mass = SET_PIECE_MASS[kind];
    out[setPieceDestructibleKind(kind)] = {
      cls: 'break', mat: 'vehicle', contact: 'ob', collider: true,
      r: Math.hypot(size.hw, size.hl), h: size.h, hw: size.hw, hl: size.hl,
      keep: mass.keep, crushMin: mass.crushMin, groundPose: true, castShadow: true,
      // (Lane C, #8 r2) the phone tier draws the coarse builds (about half the triangles; the same footprint and record)
      build: () => buildSetPiece(kind, { coarse: mobile }),
      broken: () => buildSetPiece(kind, { wrecked: true, coarse: mobile }),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- rolling stock
// (Lane C, #24, 2026-10-14; the owner: "trams and wagons" are the props left that never break) a spur's standing rolling
// stock (mapKits.ts addSpurRollingStock: Cinder Junction's Omm, G 10, tank wagons and V 60) as destructibles of the props
// instead of baked scenery with a static 'rolling-stock' record: heavy (a round stops on it and a gun round wrecks it,
// collision.ts DENSE_SET_PIECE_KINDS), crushed only by a hull rammed hard into it, its wreck its own (rollingStock.ts:
// derailed onto the ballast, burnt, broken by kind).

/** The destructible kind a rolling stock vehicle registers as. */
export function rollingStockDestructibleKind(kind: RollingStockKind): string { return `rolling_${kind}`; }

/** A spur vehicle's mass class: a loaded wagon or a locomotive, heavier than any works machine. */
export const ROLLING_STOCK_MASS = { keep: 0.4, crushMin: 5.0 } as const;

const STOCK_KINDS = Object.keys(ROLLING_STOCK_LENGTH) as RollingStockKind[];

/** The rolling stock's destructible types: the frame's origin on the ground under the rails (the build lifted by the rail
 *  head's height), the record the body's box between the buffers (as mapKits laid it), `mobile` the coarse builds. */
export function rollingStockDestructibleTypes(mobile = false): Record<string, DestructiblePropType> {
  const out: Record<string, DestructiblePropType> = {};
  const lifted = (g: ReturnType<typeof buildRollingStock>) => g.translate(0, RAIL_HEAD_M, 0);
  for (const kind of STOCK_KINDS) {
    const body = ROLLING_STOCK_BODY[kind], hw = body.w / 2, hl = ROLLING_STOCK_LENGTH[kind] / 2 - 0.62, h = body.h + RAIL_HEAD_M;
    out[rollingStockDestructibleKind(kind)] = {
      cls: 'break', mat: 'vehicle', contact: 'ob', collider: true,
      r: Math.hypot(hw, hl), h, hw, hl, keep: ROLLING_STOCK_MASS.keep, crushMin: ROLLING_STOCK_MASS.crushMin, castShadow: true,
      build: () => lifted(buildRollingStock(kind, { coarse: mobile })),
      broken: () => lifted(buildRollingStock(kind, { wrecked: true, coarse: mobile })),
    };
  }
  return out;
}
