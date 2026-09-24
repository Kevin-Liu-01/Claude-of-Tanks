/**
 * Bridge decks for navigation — round 61 (2026-09-24, Amberford's bridge over the river).
 *
 * terrain.ts resolves a level deck plane for every marsh station authored `crossing: 'bridge'` and keeps the river
 * under it: the height field is the river bed and the water mask the water. A hull rides the deck on the kit's
 * collision record (sim/structureSupport.ts), so for navigation the deck is dry ground at the deck's height and the
 * water beside it is liquid. The route grid's 25 m cells rarely fall on a 12 m deck: a cell whose centre lies within
 * half a cell of the deck axis over the span or its approaches belongs to the crossing and is snapped onto the axis,
 * so the route the bots follow runs down the road, over the abutment and along the middle of the deck between the
 * parapets instead of cutting from a cell centre on the embankment shoulder through the water beside the deck. Pure
 * and allocation-free (the caller owns the out record); the same functions serve the solo sim, the authoritative match
 * and the dedicated server.
 */
export interface NavigationBridgeDeck {
  readonly x: number;
  readonly z: number;
  readonly ux: number;
  readonly uz: number;
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly deckY: number;
  readonly approachM: number;
}

export const BRIDGE_SNAP_NONE = 0;
/** The point lies over an approach: routed through the road axis at the terrain's own height there. */
export const BRIDGE_SNAP_APPROACH = 1;
/** The point lies over the span: routed through the deck axis at the deck's height, on stone, with no obstacle. */
export const BRIDGE_SNAP_DECK = 2;

export interface BridgeDeckSnap {
  x: number;
  z: number;
  y: number;
}

/** True when a bridge deck stands over (x, z): inside the span and between the parapets. */
export function bridgeDeckOver(decks: readonly NavigationBridgeDeck[], x: number, z: number): boolean {
  for (let i = 0; i < decks.length; i++) {
    const deck = decks[i];
    const dx = x - deck.x, dz = z - deck.z;
    if (Math.abs(dx * deck.ux + dz * deck.uz) <= deck.halfLength
      && Math.abs(dx * deck.uz - dz * deck.ux) <= deck.halfWidth) return true;
  }
  return false;
}

/**
 * Snap a navigation point onto the road axis of a bridge crossing when it lies within `reach` of that axis over the
 * span or an approach; `out` receives the axis point and, over the span, the deck's height. Returns BRIDGE_SNAP_NONE
 * (out untouched) when no crossing claims the point.
 */
export function snapToBridgeDeck(
  decks: readonly NavigationBridgeDeck[], x: number, z: number, reach: number, out: BridgeDeckSnap,
): number {
  for (let i = 0; i < decks.length; i++) {
    const deck = decks[i];
    const dx = x - deck.x, dz = z - deck.z;
    const along = dx * deck.ux + dz * deck.uz;
    if (Math.abs(along) > deck.halfLength + deck.approachM
      || Math.abs(dx * deck.uz - dz * deck.ux) > Math.max(reach, deck.halfWidth)) continue;
    out.x = deck.x + deck.ux * along;
    out.z = deck.z + deck.uz * along;
    if (Math.abs(along) > deck.halfLength) { out.y = NaN; return BRIDGE_SNAP_APPROACH; }
    out.y = deck.deckY;
    return BRIDGE_SNAP_DECK;
  }
  return BRIDGE_SNAP_NONE;
}
