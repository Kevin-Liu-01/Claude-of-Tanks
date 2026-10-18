import { GARAGE_HERO_HEADING_RAD, garageViewPoint } from '../game/garagePresentationPose.ts';
import type { GarageVariant } from '../game/garageVariants.ts';

/**
 * Where each Garage's one slideshow stands (garage r9). The pack builds the panel's frame (a slim LED bezel on its
 * legs, a wall or column bracket, or a rugged LED trailer) from this table, and the dressing hangs its one slideshow
 * screen on the same pose, so the two can never drift apart. Pure maths and a table: no three.js, so the dressing can
 * read it without loading the kit.
 *
 * Coordinates are the opening view's frame: `at` = [side, depth] metres, `yaw` relative to the yard grid (which runs
 * parallel to the hero); the panel stands on the Garage datum (y = 0, the pads' level) plus `y`. Verdant's panel is the
 * dressing's own freestanding installation on the hall's west wall and has no row here.
 */

export type GarageSlideshowMount = 'freestanding' | 'wall' | 'column' | 'trailer';

export interface GarageSlideshowPlacement {
  readonly at: readonly [number, number];
  readonly yaw: number;
  /** Screen width (m); 16:9. */
  readonly width: number;
  readonly mount: GarageSlideshowMount;
  /** Height of the bezel's bottom edge over its base (m); a default per mount. */
  readonly bottomY?: number;
  /** The base's height over the Garage datum (m). */
  readonly y?: number;
}

export const GARAGE_SLIDESHOW_PLACEMENTS: Readonly<Partial<Record<GarageVariant['architecture'], GarageSlideshowPlacement>>> = Object.freeze({
  // Redrock: a rugged LED trailer on its outriggers past the gantry, in the frame's right band clear of the hero's halo,
  // its panel turned to the yard
  recovery_yard: Object.freeze({ at: [19, 37] as const, yaw: 0, width: 2.8, mount: 'trailer' }),
  // Ironworks: on the yard wall of the control kiosk right of the crane bay (garageIronworksKit.ts), between the bay's
  // columns from the opening view, facing down the yard
  factory_line: Object.freeze({ at: [17.2, 24.8] as const, yaw: Math.PI / 4, width: 2.2, mount: 'wall', bottomY: 1.9 }),
  // Cinder: hung from the throat platform's canopy at its front column, an LED departure board facing the yard
  // (garageCinderKit.ts); the platform's deck is 0.9 m up
  rail_roundhouse: Object.freeze({ at: [18.6, 21.35] as const, yaw: Math.PI / 4, width: 2.2, mount: 'column', bottomY: 1.4, y: 0.9 }),
  // Saltmere: an LED harbour board on the dock's far pierhead past the crane's rails, facing up the quay
  // (garageSaltmereKit.ts)
  naval_drydock: Object.freeze({ at: [23.5, 37.25] as const, yaw: Math.PI / 4, width: 2.0, mount: 'freestanding', bottomY: 1.3, y: 0.12 }),
});

/** The bezel's bottom edge over the panel's base for a mount. */
export function garageSlideshowBottomY(mount: GarageSlideshowMount, bottomY?: number): number {
  return bottomY ?? (mount === 'trailer' ? 2.1 : mount === 'freestanding' ? 1.4 : 2.2);
}

/** The slideshow frame's screen centre in the frame's own coordinates (its face plane 52 mm proud of the bezel's centre). */
export function garageSlideshowMountCenter(placement: GarageSlideshowPlacement): readonly [number, number, number] {
  const height = placement.width * 9 / 16;
  return [0, garageSlideshowBottomY(placement.mount, placement.bottomY) + (height + 0.16) / 2, 0.052];
}

/** The slideshow screen's pose in the Garage frame (world-local x, y, z and the yaw about +Y), or null. */
export function garageSlideshowPose(architecture: GarageVariant['architecture']): {
  readonly position: readonly [number, number, number];
  readonly yaw: number;
  readonly width: number;
  readonly height: number;
} | null {
  const placement = GARAGE_SLIDESHOW_PLACEMENTS[architecture];
  if (!placement) return null;
  const point = garageViewPoint(placement.at[0], placement.at[1]);
  const yaw = GARAGE_HERO_HEADING_RAD + placement.yaw;
  const [, cy, cz] = garageSlideshowMountCenter(placement);
  return {
    position: [point.x + Math.sin(yaw) * cz, (placement.y ?? 0) + cy, point.z + Math.cos(yaw) * cz],
    yaw,
    width: placement.width,
    height: placement.width * 9 / 16,
  };
}
