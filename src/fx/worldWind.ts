/**
 * (EF.12, MASTER 94: "three different winds") the presentation's one surface wind (m/s, world xz): the scene's published
 * surface wind (scene.userData.surfaceWind) when a map sets one, else the cloud layer's wind aloft brought down to the
 * ground (its direction, 0.4 of its speed within 1.2..4.5 m/s), else a fixed lean. The volume media drift on it and the
 * pooled smoke columns lean and drift along it (effects.ts, at their own share of its speed), so a wreck's column, a
 * burst's dust and the clouds over them all go the same way on a map.
 *
 * The smoke screens keep the simulation's own wind (sim/smokeScreen.ts SMOKE_WIND_X/Z): the screen's sight block is
 * authoritative and the same on every client, so its presentation follows the simulation, not the scene.
 */

/** The fixed lean (m/s) when nothing publishes a wind: main's columns leaned this way before the scene wind. */
const FALLBACK_X = 1.6, FALLBACK_Z = 0.55;

/** The surface wind (m/s), refreshed by refreshWorldWind; read it, never write it. */
export const worldWind = { x: FALLBACK_X, z: FALLBACK_Z };

/** Ground wind from the cloud layer's wind aloft (m/s). */
export function groundWindFromAloft(speedAloft: number): number {
  return Math.min(4.5, Math.max(1.2, speedAloft * 0.4));
}

interface WindSceneData {
  surfaceWind?: { x: number; z: number } | null;
  volumetricClouds?: { currentPreset?: { windDirRad?: number; windSpeed?: number } | null } | null;
}

/** Bring worldWind up to the scene's wind (allocation-free); the fallback with no scene or no wind published. */
export function refreshWorldWind(sceneData: WindSceneData | null | undefined): void {
  const surface = sceneData?.surfaceWind;
  const preset = sceneData?.volumetricClouds?.currentPreset;
  if (surface && Number.isFinite(surface.x) && Number.isFinite(surface.z)) {
    worldWind.x = surface.x; worldWind.z = surface.z;
  } else if (preset && Number.isFinite(preset.windDirRad) && Number.isFinite(preset.windSpeed)) {
    const speed = groundWindFromAloft(preset.windSpeed as number), a = preset.windDirRad as number;
    worldWind.x = Math.cos(a) * speed; worldWind.z = Math.sin(a) * speed;
  } else {
    worldWind.x = FALLBACK_X; worldWind.z = FALLBACK_Z;
  }
}
