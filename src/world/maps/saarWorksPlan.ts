// src/world/maps/saarWorksPlan.ts — the furnace line's plan data (the Ironworks re-landing, 2026-10-17): the recorded
// blast furnace block, the line's spacing and the two furnaces it adds (props.townPlanAdditions). Plain data with no
// geometry imports, so a map config (foundry.ts) can name the additions without drawing the kit's geometry into the
// host Worker's graph (src/mp/host/hostFleet.selftest.mjs); the kit itself (saarWorks.ts) reads the same block.
/** The recorded blast furnace block (TOWN_PLANS.foundry: factory, plan index 0): its centre, yaw and base stream. */
export const BLOCK = { x: -74, z: -29, rot: 0.436332313, rng: 1831567815 } as const;
/** The furnaces' spacing along the block's width (its base is 11.9 m wide: 3.1 m between the plots). */
export const SPACING = 15;
/** The block's local axes in the world: across the plot (its width, the line) and along it (the bunkers at +z). */
const UX: readonly [number, number] = [Math.cos(BLOCK.rot), -Math.sin(BLOCK.rot)];
const UZ: readonly [number, number] = [Math.sin(BLOCK.rot), Math.cos(BLOCK.rot)];
export const at = (u: number, v: number): [number, number] => [BLOCK.x + UX[0] * u + UZ[0] * v, BLOCK.z + UX[1] * u + UZ[1] * v];

/** The two furnaces the line adds, one each side of the block (props.townPlanAdditions). */
export const FURNACE_LINE_ADDITIONS = Object.freeze([-1, 1].map((side) => {
  const [x, z] = at(side * SPACING, 0);
  return Object.freeze({ structure: 'factory', planIndex: 0, wall: 'stone', rng: BLOCK.rng, x: +x.toFixed(4), z: +z.toFixed(4), rot: BLOCK.rot });
}));
