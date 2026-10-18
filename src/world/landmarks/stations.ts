// src/world/landmarks/stations.ts — the polar station's works (the map-content lane, 2026-10-09; owner: "some maps like
// whiteout crossing and mesa mines look unfinished and so empty"): the pieces a Distant Early Warning Line main station
// of the 1980s stood on the tundra — the search radar's radome on its tower building, the tropospheric-scatter
// "billboard" antennas that carried the line's traffic station to station (AN/FRC-45: a curved reflector some 18 m wide
// on a steel back frame, its feed horn on a short tower before it), the guyed lattice masts in their aviation bands, the
// module train (the station's living and working modules joined end to end on short steel stilts, the arctic entries
// at its doors), and the POL tank farm inside its concrete bund.
//
// Sizes from the type: the DEW Line's AN/FPS-19 radome stood on the module train's end over a two-storey tower building,
// a sphere some 12 m across; the billboards stood 9-18 m high, two to four to a station, facing the next station along
// the line; the masts 30-45 m; a main station's train ran 20-25 modules, each about 8.5 × 9.7 m; the tank farm's tanks
// 8-12 m across.
//
// Each piece is drawn in its own frame (x across, y up, z out of its front, ground at y = 0) into the regional part sink:
// it merges into the props' material buckets (no draw call of its own). The thin members (guys, lattice, rails, battens)
// are dressing; the bodies, the legs and the footings are structure.
import { PartSink } from '../maps/regional/geometry.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';
// (props census #12: the module train, the Jamesway and the airstrip are the looks lane's, in polarStations.ts)
export { airstrip, jamesway, moduleTrain, stripShack } from './polarStations.ts';
// (the looks lane's r2 sweep, 2026-10-16: the radome tower, the billboards and the guyed mast are the looks lane's, in dewLine.ts)
export { guyedMast, radomeTower, sagDepth, troposcatter } from './dewLine.ts';

const num = (ctx: LandmarkBuildContext, key: string, min: number): number => Math.max(min, Number(ctx.params[key]));

// --------------------------------------------------------------------------------------------- caches and drift fences

/**
 * A fuel cache: the station's drums stood in rows on the snow (the props' own drum pool: a hull scatters them), with a
 * stack of pallets at one end. All dressing: the piece itself builds nothing.
 */
export const drumCache: LandmarkBuilder = (ctx) => {
  const rows = Math.round(num(ctx, 'rows', 1)), cols = Math.round(num(ctx, 'columns', 1)), pitch = 0.74;
  const destructibles: Array<{ kind: string; x: number; z: number; yawDeg: number }> = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    if (ctx.rng() < 0.08) continue; // a gap where a drum has been taken
    destructibles.push({ kind: 'drum', x: (j - (cols - 1) / 2) * pitch + (ctx.rng() - 0.5) * 0.06, z: (i - (rows - 1) / 2) * pitch + (ctx.rng() - 0.5) * 0.06,
      yawDeg: ctx.rng() * 360 });
  }
  const ex = ((cols - 1) / 2) * pitch + 1.4;
  for (let k = 0; k < 3; k++) destructibles.push({ kind: 'pallet', x: ex, z: (k - 1) * 1.3, yawDeg: (ctx.rng() - 0.5) * 20 });
  return { parts: new PartSink().finish(), destructibles };
};

/**
 * A drift fence: a line of plank fence modules across the wind (the props' own fence pool: a hull breaks through it),
 * its length along x, broken here and there where the drifts have flattened a module.
 */
export const snowFence: LandmarkBuilder = (ctx) => {
  const L = num(ctx, 'length', 5), module = 2.5, n = Math.max(1, Math.floor(L / module));
  const destructibles: Array<{ kind: string; x: number; z: number; yawDeg: number }> = [];
  for (let k = 0; k < n; k++) {
    if (ctx.rng() < 0.1) continue;
    destructibles.push({ kind: 'fenceplank', x: -((n - 1) * module) / 2 + k * module, z: 0, yawDeg: 90 });
  }
  return { parts: new PartSink().finish(), destructibles };
};
