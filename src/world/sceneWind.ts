// src/world/sceneWind.ts — 2026-10-05 (the skies lane; the combat FX lane's coherence bug): one wind per battlefield.
//
// On Verdant the volumetric clouds drifted toward ~205° while the trees and the grass swayed toward ~37°: the cloud layer
// fell back to a drift derived from the sun's azimuth (+90°) where a map authored none, the vegetation to its ground
// profile's prevailing wind, and on 26 of the 33 maps the two nearly opposed (smoke follows the clouds, so a kill's column
// leaned against the trees' sway). Each map now has one surface wind (degrees from +X toward +Z, the direction it blows
// TOWARD — the convention of engine/cloudscapes.ts `windDirDeg` and `ocean.windDirDeg`), and the clouds' drift is that
// wind veered with height (real winds veer through the friction layer, a few tens of degrees; they never oppose).
//
// The surface direction per map, kept where it is authored: the ocean block's wind (the waves are the most visible wind on
// a coast), else the ground profile's grass wind (groundRedux.ts — the sward's gust field and today's tree sway run along
// it), else the clouds' authored drift un-veered, else the legacy drift (the sun's azimuth + 90°) un-veered. The speed: the
// ocean's authored speed, else 0.6 of the cloud regime's wind aloft, else 4 m/s. A table, not a resolver, so the clouds,
// the vegetation sway, the grass, the smoke and the ocean read it without importing a map config into their chunks;
// sceneWind.selftest re-derives every row from those sources and fails on any drift.
import type { MapId } from './maps/mapIds.ts';

/** The clouds' drift veers from the surface wind by this much (degrees, +X toward +Z: clockwise seen from above). */
export const SCENE_WIND_VEER_DEG = 25;

/** Each map's surface wind: the direction it blows toward (degrees from +X toward +Z) and its speed (m/s, near the ground). */
export const SCENE_WIND: Readonly<Record<MapId, { readonly dirDeg: number; readonly speed: number }>> = Object.freeze({
  verdant: { dirDeg: 37, speed: 3.6 }, // ground
  desert: { dirDeg: 180, speed: 3 }, // legacy
  winter: { dirDeg: 18, speed: 3.6 }, // ground
  urban: { dirDeg: 45, speed: 4.2 }, // ground
  coastal: { dirDeg: 190, speed: 5.2 }, // ocean
  autumn: { dirDeg: 100, speed: 2.6 }, // ocean
  steppe: { dirDeg: 22, speed: 5.4 }, // ground
  railyard: { dirDeg: 45, speed: 3 }, // ground
  frontier: { dirDeg: 53, speed: 5.4 }, // ground
  fjord: { dirDeg: 250, speed: 3.2 }, // ocean
  delta: { dirDeg: 110, speed: 2.4 }, // ocean
  badlands: { dirDeg: 181, speed: 3 }, // legacy
  monsoon: { dirDeg: 200, speed: 2.8 }, // ocean
  alpine: { dirDeg: 18, speed: 2.4 }, // ground
  caldera: { dirDeg: 37, speed: 3 }, // ground (batch 4: Aso's sward, the map-revival lane; was legacy 181)
  foundry: { dirDeg: 45, speed: 3 }, // ground
  ruinspires: { dirDeg: 45, speed: 3.6 }, // ground
  blackglass: { dirDeg: 80, speed: 2.2 }, // ocean (batch 4: Suzhou Creek's sea state; was ground 45 at 3)
  titan_gorge: { dirDeg: 191, speed: 3.6 }, // legacy (batch 4: Monument Valley's cloud regime aloft; was 3)
  skybridge: { dirDeg: 40, speed: 3.8 }, // ocean
  polders: { dirDeg: 300, speed: 3.6 }, // ocean
  copper_mesa: { dirDeg: 163, speed: 4.2 }, // legacy (batch 4: Queenstown's west-coast regime aloft; was 3)
  airfield: { dirDeg: 45, speed: 3.6 }, // ground
  oasis: { dirDeg: 120, speed: 2.8 }, // ocean
  whiteout: { dirDeg: 229, speed: 2.4 }, // legacy (batch 4: the ice sheet grows no sward, the trees lane; was ground 18)
  orchard: { dirDeg: 37, speed: 3.6 }, // ground
  longleaf: { dirDeg: 53, speed: 3.6 }, // ground
  mangrove: { dirDeg: 80, speed: 2.6 }, // ocean
  saltwind: { dirDeg: 8, speed: 5 }, // ocean
  reservoir: { dirDeg: 150, speed: 3 }, // ocean
  mars: { dirDeg: 187, speed: 4 }, // legacy
  moon: { dirDeg: 113, speed: 4 }, // legacy
  cliffbridge: { dirDeg: 37, speed: 3.6 }, // ground
});

export interface SceneWind {
  /** The surface wind: the direction it blows toward (degrees from +X toward +Z) and its unit vector in world xz. */
  surfaceDirDeg: number;
  dirX: number;
  dirZ: number;
  /** m/s near the ground. */
  speed: number;
  /** The clouds' drift: the surface wind veered with height (degrees). */
  cloudDirDeg: number;
}

/** A map's scene wind (an unknown id takes Verdant's). */
export function sceneWindFor(mapId: string | null | undefined): SceneWind {
  const row = (SCENE_WIND as Record<string, { dirDeg: number; speed: number }>)[mapId ?? ''] ?? SCENE_WIND.verdant;
  return windOf(row);
}

/** The scene wind a sky preset carries for a map config: none without a map id (a stub, a receipt's harness). */
export function sceneWindOf(config: { id?: string } | null | undefined): { sceneWind: SceneWind } | Record<string, never> {
  return config?.id ? { sceneWind: sceneWindFor(config.id) } : {};
}

function windOf(row: { dirDeg: number; speed: number }): SceneWind {
  const rad = row.dirDeg * Math.PI / 180;
  return { surfaceDirDeg: row.dirDeg, dirX: Math.cos(rad), dirZ: Math.sin(rad), speed: row.speed, cloudDirDeg: (row.dirDeg + SCENE_WIND_VEER_DEG) % 360 };
}
