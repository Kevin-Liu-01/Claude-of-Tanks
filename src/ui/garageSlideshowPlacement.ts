import { GARAGE_HERO_HEADING_RAD, garageViewPoint } from '../game/garagePresentationPose.ts';
import type { GarageVariant } from '../game/garageVariants.ts';
import { kitYawToward } from './garageKitTable.ts';

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

type GarageSlideshowMount = 'freestanding' | 'wall' | 'column' | 'trailer';

interface GarageSlideshowPlacement {
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
  // Glacier: an LED panel on its legs at the guard post on the portal's right, in the frame's right band (the bore and the
  // portal stand behind the hero, inside the halo no display may enter)
  rock_cavern: Object.freeze({ at: [14.0, 16.6] as const, yaw: Math.PI / 4 - 0.25, width: 2.0, mount: 'freestanding', y: 0.2 }),
  // Frosthollow: a wall panel on the bunker's right pier beside the open blast door, in the frame's right band
  repair_bunker: Object.freeze({ at: [16.0, 25.73] as const, yaw: Math.PI / 4, width: 2.2, mount: 'wall', bottomY: 1.6, y: 2.72 }),
  // Monsoon: a rugged panel bolted to the canopy's front-right column under the eave, turned to the yard's right
  rain_canopy: Object.freeze({ at: [12.42, 19.58] as const, yaw: Math.PI / 2, width: 2.0, mount: 'column', bottomY: 2.0, y: 1.35 }),
  // Ironworks: on the yard wall of the control kiosk right of the crane bay (garageIronworksKit.ts), between the bay's
  // columns from the opening view, facing down the yard
  factory_line: Object.freeze({ at: [17.2, 24.8] as const, yaw: Math.PI / 4, width: 2.6, mount: 'wall', bottomY: 1.7 }),
  // Cinder: hung from the throat platform's canopy at its front column, an LED departure board facing the yard
  // (garageCinderKit.ts); the platform's deck is 0.9 m up
  rail_roundhouse: Object.freeze({ at: [18.6, 21.35] as const, yaw: Math.PI / 4, width: 2.2, mount: 'column', bottomY: 1.4, y: 0.9 }),
  // Saltmere: an LED harbour board on the dock's far pierhead past the crane's rails, facing up the quay
  // (garageSaltmereKit.ts)
  naval_drydock: Object.freeze({ at: [23.5, 37.25] as const, yaw: Math.PI / 4, width: 2.0, mount: 'freestanding', bottomY: 1.3, y: 0.12 }),
  // Sirocco: a rugged LED trailer under the shade sail, on the depot's level terrace (1.5 m under the datum), in the
  // frame's right band clear of the hero's halo, turned to the lens (garage r9, garageSiroccoKit.ts)
  shade_depot: Object.freeze({ at: [13.4, 17.8] as const, yaw: kitYawToward([13.4, 17.8]), width: 2.8, mount: 'trailer', y: -1.5 }),
  // Steinburg: a freestanding LED panel on the yard's level floor by its right bank, in the frame's right band clear of
  // the hero's halo (the brief's gate passage stands behind the hero), turned to the lens (garage r9, garageSteinburgKit.ts)
  brick_arsenal: Object.freeze({ at: [12.6, 16.0] as const, yaw: kitYawToward([12.6, 16.0]), width: 2.2, mount: 'freestanding' }),
});

/**
 * Verdant's one slideshow panel (the dressing's freestanding installation on the hall's west wall, its lit face turned
 * +X toward the hero): the screen's centre in the dressing frame, its yaw and its 16:9 width. It mirrors the dressing's
 * own literals (garageDressing.ts screenRoot and BATTLE_SCREEN_PANEL_W, which garageDressingFleet.selftest pins); the
 * display placement receipt checks the two agree and keeps the atmosphere off the screen.
 */
export const GARAGE_VERDANT_SLIDESHOW = Object.freeze({
  position: Object.freeze([-18.35, 4.15, 2.4] as const),
  yaw: Math.PI / 2,
  width: 5.86,
});

/** The bezel's bottom edge over the panel's base for a mount. */
export function garageSlideshowBottomY(mount: GarageSlideshowMount, bottomY?: number): number {
  return bottomY ?? (mount === 'trailer' ? 2.1 : mount === 'freestanding' ? 1.4 : 2.2);
}

/** The slideshow frame's screen centre in the frame's own coordinates (its face plane 52 mm proud of the bezel's centre). */
function garageSlideshowMountCenter(placement: GarageSlideshowPlacement): readonly [number, number, number] {
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
