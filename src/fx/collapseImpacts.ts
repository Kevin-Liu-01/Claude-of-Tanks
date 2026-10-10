/**
 * collapseImpacts.ts — where a collapsing building's pieces strike (destruction core lane, 2026-10-10): the
 * presentation's debris bodies (fx/collapseBodies.ts) report each hard landing here, and the audio engine plays the
 * recorded sound of that material there. A dependency-free channel, so the audio chunk imports nothing of the fx.
 */

/** What a piece is made of, as its sound is chosen (a wall's core, a roof's covering, a floor's structure). */
type CollapseImpactMaterial = string;

type CollapseImpactListener = (x: number, y: number, z: number, speedMps: number, massKg: number,
  material: CollapseImpactMaterial) => void;

const listeners: CollapseImpactListener[] = [];

/** Listen for the pieces' landings; returns the detach. */
export function onCollapseImpact(listener: CollapseImpactListener): () => void {
  listeners.push(listener);
  return () => {
    const i = listeners.indexOf(listener);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/** A piece struck at (x, y, z) at `speedMps`, weighing `massKg`. */
export function emitCollapseImpact(x: number, y: number, z: number, speedMps: number, massKg: number, material: CollapseImpactMaterial): void {
  for (let i = 0; i < listeners.length; i++) listeners[i](x, y, z, speedMps, massKg, material);
}

/**
 * The recorded layers for a landing (ids from the catalog, gains in dB): a heavy masonry slab thuds and crunches, a
 * light one crunches; timber knocks and splinters; sheet metal clangs; a roof's covering clatters as rubble. Null below
 * the audible floor. Pure: the audio engine plays what this returns.
 */
export function collapseImpactLayers(speedMps: number, massKg: number, material: CollapseImpactMaterial):
  Array<{ id: string; gainDb: number; delayS: number }> | null {
  const energyKj = 0.5 * massKg * speedMps * speedMps / 1000;
  if (!(speedMps >= 2.2) || !(energyKj >= 1.5)) return null;
  // 1.5 kJ is a 300 kg panel tipping from a metre; 60 kJ a roof slab from the eaves
  const level = Math.max(0, Math.min(1, Math.log10(energyKj / 1.5) / Math.log10(40)));
  const gain = -14 + 13 * level;
  switch (material) {
    case 'timber': case 'plank': case 'infill':
      return level > 0.55
        ? [{ id: 'ground_wood', gainDb: gain, delayS: 0 }, { id: 'crate_break', gainDb: gain - 4, delayS: 0.04 }]
        : [{ id: 'ground_wood', gainDb: gain - 2, delayS: 0 }];
    case 'metal':
      return [{ id: level > 0.5 ? 'debris_metal' : 'ground_metal', gainDb: gain, delayS: 0 }];
    case 'thatch': case 'earth': case 'canvas':
      return [{ id: 'debris_dirt', gainDb: gain - 3, delayS: 0 }];
    case 'tile': case 'slate':
      return [{ id: 'rubble_crunch', gainDb: gain - 1, delayS: 0 }, { id: 'wall_brick', gainDb: gain - 8, delayS: 0.03 }];
    default:
      // masonry: brick, stone, rubble, concrete, adobe, plaster
      return level > 0.6
        ? [{ id: 'hit_wall', gainDb: gain, delayS: 0 }, { id: 'rubble_crunch', gainDb: gain - 3, delayS: 0.05 }]
        : [{ id: 'rubble_crunch', gainDb: gain - 1, delayS: 0 }];
  }
}
