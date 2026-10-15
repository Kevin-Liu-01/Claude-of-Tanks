/**
 * groundKeyLights.ts — the FX point lights the near hulls shadow on the ground (contact r2, the engine-cs lane,
 * 2026-10-14; the coordinator: "near hulls block unshadowed FX point lights on the ground beneath them, cheaply ... no
 * shadow maps"; media wave f1, s170: a Studio illumination flare lights the sand under a Centurion as brightly as the open
 * ground, so the hull hovers).
 *
 * The FX lights never cast (a cube shadow map each would cost six scene draws): the muzzle flash and the blast
 * (fx/effects.ts), and the light the Studio's cinematic FX borrow for a flare or a fire (game/sniperFillRuntime.ts). Their
 * owners register them here once; the aerial pass's ground block (vehicleGroundOcclusion.ts) picks the strongest at the
 * near hulls each frame and removes, from a ground pixel beside a hull, the share of its light that the hull's solid
 * stands between it and the lamp. Dependency-free so the FX chunk can register without the post chain.
 */
import type { PointLight } from 'three';

const lights = new Set<PointLight>();

/** An FX point light the near hulls shadow on the ground (idempotent). */
export function registerGroundKeyLight(light: PointLight): void {
  lights.add(light);
}

/** A disposed owner's light leaves the registry. */
export function unregisterGroundKeyLight(light: PointLight): void {
  lights.delete(light);
}

/** The registered lights (the aerial pass filters them by intensity, scene and range each frame). */
export function groundKeyLights(): ReadonlySet<PointLight> {
  return lights;
}
