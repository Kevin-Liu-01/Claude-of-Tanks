// Surface classification for a shell that ends its flight in the world.
// The world raycast only knows 'terrain' and 'prop'; open water is a terrain
// hit whose ground point lies under the map's shallow-water mask. Both the
// FX (white column, foam ring, spray) and the audio (splash instead of a dirt
// thud) key off the same answer, so it is computed once here.
//
// (impact-materials-269) And how the round met it: its incidence off the surface's normal in whole degrees, the hit
// event's impactAngleDeg convention (0 straight in, 90 grazing), so the audio plays a ground graze as a skip rather than
// a plunge. Presentation only: read from the shell's velocity after the step, it changes nothing the sim decides.

import { acos } from './detMath.ts';

interface ShellSurfaceWorld {
  heightField?: { getWaterMaskAt?(x: number, z: number): number } | null;
}

interface ShellSurfaceHit {
  kind?: string | null;
  point: { x: number; z: number };
  record?: { kind?: string | null } | null;
}

/** Water counts once the mask reads more than half: the shore feather stays dirt. */
const SHELL_WATER_MASK_MIN = 0.5;

export function shellHitsWater(world: ShellSurfaceWorld | null | undefined, hit: ShellSurfaceHit): boolean {
  if (hit.kind !== 'terrain') return false;
  const mask = world?.heightField?.getWaterMaskAt?.(hit.point.x, hit.point.z);
  return typeof mask === 'number' && Number.isFinite(mask) && mask > SHELL_WATER_MASK_MIN;
}

/** 'water' for an open-water terrain hit, else the record kind, else the hit kind. */
export function classifyShellSurface(world: ShellSurfaceWorld | null | undefined, hit: ShellSurfaceHit): string {
  if (shellHitsWater(world, hit)) return 'water';
  return hit.record?.kind || hit.kind || 'terrain';
}

interface Vec3Like { x: number; y: number; z: number }

/**
 * The round's incidence off the struck surface's normal, whole degrees (0 straight in, 90 grazing); undefined when the
 * velocity or the normal is degenerate, so the field is absent from the event and its wire payload.
 */
export function shellIncidenceDeg(vel: Vec3Like, normal: Vec3Like | null | undefined): number | undefined {
  if (!normal) return undefined;
  const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
  const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
  if (!(speed > 1e-6) || !(length > 1e-6)) return undefined;
  const cos = Math.min(1, Math.abs(vel.x * normal.x + vel.y * normal.y + vel.z * normal.z) / (speed * length));
  return Math.round(acos(cos) * (180 / Math.PI));
}
