// Surface classification for a shell that ends its flight in the world.
// The world raycast only knows 'terrain' and 'prop'; open water is a terrain
// hit whose ground point lies under the map's shallow-water mask. Both the
// FX (white column, foam ring, spray) and the audio (splash instead of a dirt
// thud) key off the same answer, so it is computed once here.

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
