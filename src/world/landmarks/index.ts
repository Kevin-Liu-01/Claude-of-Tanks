// src/world/landmarks/index.ts — the set-piece builders by kind (the landmarks lane, 2026-10-05). A map authors its set
// pieces in `props.landmarks` (types.ts LandmarkPlacement); plan.ts holds each kind's parameters and footprint,
// compose.ts places them in the props build. Every builder draws the piece in its own frame from its own streams.
import { baileyBridge, liftBridge, stoneArchBridge, trestleBridge, trussBridge, viaduct } from './bridges.ts';
import { colonialBungalow, tennisCourt } from './colonial.ts';
import { bengalTemple } from './temples.ts';
import { church, grainElevator, granary, marketHall, stationHall, townHall } from './civic.ts';
import { kolkhozArch, torii, townGate, triumphalArch } from './gates.ts';
import { columnMonument, equestrianStatue, memorialWall, obelisk, statue } from './monuments.ts';
import { lighthouse, mole, quay, slipway } from './harbour.ts';
import { houseRow, khan, lavoir } from './village.ts';
import { bandstand, churchyard, fountain, garden, parkGate, parkSquare, path, piazza } from './parks.ts';
import { aircraftWreck } from './wrecks.ts';
import { belfry, campanile, fireLookout, valveTower, waterTower, windmill } from './towers.ts';
import type { LandmarkBuilder, LandmarkKind } from './types.ts';

export const LANDMARK_BUILDERS: Readonly<Partial<Record<LandmarkKind, LandmarkBuilder>>> = Object.freeze({
  aircraftWreck,
  baileyBridge,
  bandstand,
  belfry,
  bengalTemple,
  campanile,
  church,
  churchyard,
  colonialBungalow,
  columnMonument,
  equestrianStatue,
  fireLookout,
  fountain,
  garden,
  grainElevator,
  granary,
  houseRow,
  khan,
  kolkhozArch,
  lavoir,
  liftBridge,
  lighthouse,
  marketHall,
  memorialWall,
  mole,
  obelisk,
  parkGate,
  parkSquare,
  path,
  piazza,
  quay,
  statue,
  slipway,
  stationHall,
  stoneArchBridge,
  tennisCourt,
  torii,
  townGate,
  townHall,
  trestleBridge,
  triumphalArch,
  trussBridge,
  viaduct,
  waterTower,
  valveTower,
  windmill,
});
