/**
 * The water a player can see, as one raster for the tactical map (the Kestrel water plan's phase 2, 2026-10-15; the
 * owner on 2026-10-14: "fix the map and how it shows a bunch of water spots by spawn even though you can't actually see
 * any water"). Phase 1 split the lake and marsh discs into liquid and dry (minimapWaterPatches.ts), but a liquid disc was
 * still painted out to its whole shoreline contour: the waterline ran wider than the water (Saltmere Bay 35k m² of blue
 * over dry ground), causeways and mostly-dry discs read wet, and the canals that hold water outside every disc were
 * missing.
 *
 * The raster is the shallow-water sheet's water (shallowWater.ts, on a liquid map only) at a quarter of the sheet's cell
 * (2 m on a 1 km battlefield — finer than the plate's 2.3 m pixel, so the waterline stays as sharp as the 64-vertex
 * outlines were). The sheet's geometry is the WATER_SHEET_GRID_M grid's cells whose corners or centre carry a ramped
 * mask (heightField.getWaterMaskAt) above WATER_SHEET_MIN_COVERAGE, and its fragment shader discards every point below
 * VISIBLE_WATER_MIN. A raster cell is water when its sheet cell is admitted by that rule and the mask at its centre
 * reaches VISIBLE_WATER_MIN — the sheet's own grid, its own admission and its own discard, all three shared with the
 * sheet from here. The canals (terrain.canals) are in the mask, so they come with it.
 *
 * Not the flooded paddies (2026-10-15, the phase-2 bake): the land-use twin (landUseAt with landUse.ts floodIds) puts
 * water in six of Jade River Delta's fields, but the terrain material draws a field only where its own gates allow
 * (worn bank soil and village plots, wet ground, woods, slope — the ground mask's channels): the in-world capture shows
 * none of the six as water outside the river's sheet (two are grass on the bank, one a worn plot), so painting them
 * would put the fake water back. A paddy layer needs a CPU twin of those gates first (the ground lane's terrain.ts).
 *
 * Built lazily, once per world, by World.getVisibleWaterRaster — never by getMinimapFeatures, which the battle's audio
 * reads mid-fight (audioEngine.ts landmarks). The cost is bounded by sampling: the sheet grid's vertices and (where they
 * are dry) its cell centres, then 16 points in each admitted cell that is not water right through; a cell whose corners
 * and centre all hold a mask of SOLID_SHEET_MASK or more is water whole (a dry gap inside one would have to slip between
 * those five points, under 4 m wide; the parity receipt, visibleWater.selftest.mjs, checks every raster cell of every
 * liquid map against the sheet's real geometry). THREE-free and Node-runnable.
 */

/** The ramped water mask at which the sheet draws a fragment: shallowWater.ts discards below it. */
export const VISIBLE_WATER_MIN = 0.015;
/** The sheet's grid (m): its vertices sample the mask, its cells are drawn or skipped whole. */
export const WATER_SHEET_GRID_M = 8;
/** A sheet cell is built when a corner or its centre holds more mask than this. */
export const WATER_SHEET_MIN_COVERAGE = 0.002;
/** Raster cells a side per sheet cell (2 m on the 8 m grid). */
const SUBDIVISION = 4;
/** A sheet cell whose four corners and centre all reach this mask is water whole (no per-point samples). */
const SOLID_SHEET_MASK = 0.5;

/** A float for GLSL source (always with a decimal point). */
export function glslFloat(value: number): string {
  const text = String(value);
  return /[.e]/.test(text) ? text : `${text}.0`;
}

export interface VisibleWaterRaster {
  /** The battlefield square (m a side), centred on the origin. */
  readonly size: number;
  /** Cells a side (the sheet's cells × 4). */
  readonly cells: number;
  readonly cellM: number;
  /**
   * cells², row by row from the square's (−x, −z) corner (cell i, j centred at (−size/2 + (i + ½)·cellM,
   * −size/2 + (j + ½)·cellM)): 1 where the world shows water, 0 dry.
   */
  readonly water: Uint8Array;
  /** Mask reads the build took (bounded; the parity receipt pins the bound). */
  readonly samples: number;
}

interface VisibleWaterSource {
  readonly size: number;
  getWaterMaskAt(x: number, z: number): number;
}

/** Whether the world shows water at a point of the square (the raster's cell there). */
export function visibleWaterAt(raster: VisibleWaterRaster, x: number, z: number): boolean {
  const i = Math.floor((x + raster.size / 2) / raster.cellM), j = Math.floor((z + raster.size / 2) / raster.cellM);
  if (i < 0 || j < 0 || i >= raster.cells || j >= raster.cells) return false;
  return raster.water[j * raster.cells + i] !== 0;
}

/** The sheet's water over the square (a map with a liquid sheet: terrain.ts liquidWater). */
export function buildVisibleWaterRaster(field: VisibleWaterSource): VisibleWaterRaster {
  // the sheet's own grid (shallowWaterGeometrySteps): vertex (x, z) at x·step − half
  const segments = Math.ceil(field.size / WATER_SHEET_GRID_M);
  const count = segments + 1, step = field.size / segments, half = field.size / 2;
  const cells = segments * SUBDIVISION, cellM = step / SUBDIVISION;
  const water = new Uint8Array(cells * cells);
  let samples = 0;
  const maskAt = (x: number, z: number): number => { samples++; return field.getWaterMaskAt(x, z); };
  const corner = new Float32Array(count * count);
  for (let z = 0; z < count; z++) for (let x = 0; x < count; x++) corner[z * count + x] = maskAt(x * step - half, z * step - half);
  for (let cz = 0; cz < segments; cz++) {
    for (let cx = 0; cx < segments; cx++) {
      const key = cz * count + cx;
      const a = corner[key], b = corner[key + 1], c = corner[key + count], d = corner[key + count + 1];
      const centreX = (cx + 0.5) * step - half, centreZ = (cz + 0.5) * step - half;
      let centre = NaN;
      if (Math.max(a, b, c, d) <= WATER_SHEET_MIN_COVERAGE) {
        centre = maskAt(centreX, centreZ);
        if (centre <= WATER_SHEET_MIN_COVERAGE) continue; // the sheet skips this cell: nothing drawn in it
      }
      const row0 = cz * SUBDIVISION, col0 = cx * SUBDIVISION;
      if (Math.min(a, b, c, d) >= SOLID_SHEET_MASK) {
        if (Number.isNaN(centre)) centre = maskAt(centreX, centreZ);
        if (centre >= SOLID_SHEET_MASK) {
          for (let sz = 0; sz < SUBDIVISION; sz++) water.fill(1, (row0 + sz) * cells + col0, (row0 + sz) * cells + col0 + SUBDIVISION);
          continue;
        }
      }
      for (let sz = 0; sz < SUBDIVISION; sz++) {
        const z = -half + (row0 + sz + 0.5) * cellM;
        for (let sx = 0; sx < SUBDIVISION; sx++) {
          if (maskAt(-half + (col0 + sx + 0.5) * cellM, z) >= VISIBLE_WATER_MIN) water[(row0 + sz) * cells + col0 + sx] = 1;
        }
      }
    }
  }
  return { size: field.size, cells, cellM, water, samples };
}
