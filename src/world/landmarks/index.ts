// src/world/landmarks/index.ts — the set-piece builders by kind (the landmarks lane, 2026-10-05). A map authors its set
// pieces in `props.landmarks` (types.ts LandmarkPlacement); plan.ts holds each kind's parameters and footprint,
// compose.ts places them in the props build. Every builder draws the piece in its own frame from its own streams.
import { baileyBridge, stoneArchBridge, trestleBridge, trussBridge, viaduct } from './bridges.ts';
import { church, grainElevator, granary, marketHall, stationHall, townHall } from './civic.ts';
import { kolkhozArch, torii, townGate, triumphalArch } from './gates.ts';
import { columnMonument, equestrianStatue, memorialWall, obelisk, statue } from './monuments.ts';
import { bandstand, fountain, parkGate, parkSquare } from './parks.ts';
import { belfry, campanile, fireLookout, waterTower, windmill } from './towers.ts';
import type { LandmarkBuilder, LandmarkKind } from './types.ts';

export const LANDMARK_BUILDERS: Readonly<Partial<Record<LandmarkKind, LandmarkBuilder>>> = Object.freeze({
  baileyBridge,
  bandstand,
  belfry,
  campanile,
  church,
  columnMonument,
  equestrianStatue,
  fireLookout,
  fountain,
  grainElevator,
  granary,
  kolkhozArch,
  marketHall,
  memorialWall,
  obelisk,
  parkGate,
  parkSquare,
  statue,
  stationHall,
  stoneArchBridge,
  torii,
  townGate,
  townHall,
  trestleBridge,
  triumphalArch,
  trussBridge,
  viaduct,
  waterTower,
  windmill,
});
