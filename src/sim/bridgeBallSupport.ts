/** Shared ball support: crossing above a bridge catches its deck; movement
 * under the same span keeps the gorge floor. No scratch allocation per tick. */
interface BridgeFloorTerrain {
  getHeightAt(x: number, z: number): number;
  bridgeDecks?: readonly { x: number; z: number; ux: number; uz: number; halfLength: number; halfWidth: number; deckY: number }[];
}
export function bridgeBallFloor(field: BridgeFloorTerrain, x: number, z: number, previousBottomY: number): number {
  let floor = field.getHeightAt(x, z);
  for (const deck of field.bridgeDecks ?? []) {
    if (deck.deckY <= floor || previousBottomY < deck.deckY - .15) continue;
    const dx = x - deck.x, dz = z - deck.z;
    if (Math.abs(dx * deck.ux + dz * deck.uz) <= deck.halfLength &&
        Math.abs(-dx * deck.uz + dz * deck.ux) <= deck.halfWidth) floor = deck.deckY;
  }
  return floor;
}
