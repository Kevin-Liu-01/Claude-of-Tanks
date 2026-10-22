import { GARAGE_HERO_HEADING_RAD, garageViewPoint } from '../game/garagePresentationPose.ts';
import type { GarageVariant } from '../game/garageVariants.ts';
import { kitYawToward } from './garageKitTable.ts';

/**
 * Where each Garage's one slideshow stands (garage r9). The pack builds the monitor's housing (garage 231: a CRT's
 * bezel, case and tube on its stand, a wall or column shelf bracket, or a trailer's mast) from this table, and the
 * dressing hangs its one slideshow screen on the same pose, so the two can never drift apart. Pure maths and a table:
 * no three.js, so the dressing can read it without loading the kit.
 *
 * Coordinates are the opening view's frame: `at` = [side, depth] metres, `yaw` relative to the yard grid (which runs
 * parallel to the hero); the monitor stands on the Garage datum (y = 0, the pads' level) plus `y`. Verdant's monitor stands
 * in its hall (GARAGE_VERDANT_SLIDESHOW below) and has no row here.
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
  // Redrock: a CRT on a rugged monitor trailer's mast, on its outriggers past the gantry, in the frame's right band clear
  // of the hero's halo, its screen turned to the yard
  recovery_yard: Object.freeze({ at: [19, 37] as const, yaw: 0, width: 2.8, mount: 'trailer' }),
  // Glacier: a CRT on its stand at the guard post on the portal's right, in the frame's right band (the bore and the
  // portal stand behind the hero, inside the halo no display may enter)
  rock_cavern: Object.freeze({ at: [14.0, 16.6] as const, yaw: Math.PI / 4 - 0.25, width: 2.0, mount: 'freestanding', y: 0.2 }),
  // Frosthollow: a CRT on a shelf bracket on the bunker's right pier beside the open blast door, in the frame's right band
  repair_bunker: Object.freeze({ at: [16.0, 25.73] as const, yaw: Math.PI / 4, width: 2.2, mount: 'wall', bottomY: 1.6, y: 2.72 }),
  // Monsoon: a CRT on a shelf bracket bolted to the canopy's front-right column under the eave, turned to the yard's
  // right
  rain_canopy: Object.freeze({ at: [12.42, 19.58] as const, yaw: Math.PI / 2, width: 2.0, mount: 'column', bottomY: 2.0, y: 1.35 }),
  // Ironworks: on a shelf bracket on the yard wall of the control kiosk right of the crane bay (garageIronworksKit.ts),
  // between the bay's columns from the opening view, facing down the yard; low enough that its case clears the kiosk
  // roof's eave (3.3 m: the slideshow clearance receipt)
  factory_line: Object.freeze({ at: [17.2, 24.8] as const, yaw: Math.PI / 4, width: 2.6, mount: 'wall', bottomY: 1.5 }),
  // Cinder: on a shelf bracket at the throat platform canopy's front column, a CRT departure monitor facing the yard
  // (garageCinderKit.ts); the platform's deck is 0.9 m up
  rail_roundhouse: Object.freeze({ at: [18.6, 21.35] as const, yaw: Math.PI / 4, width: 2.2, mount: 'column', bottomY: 1.4, y: 0.9 }),
  // Saltmere: a CRT harbour monitor on its stand on the dock's far pierhead past the crane's rails, facing up the quay
  // (garageSaltmereKit.ts); a quarter metre out from the oak behind it, so its tube clears the crown
  naval_drydock: Object.freeze({ at: [23.5, 37.0] as const, yaw: Math.PI / 4, width: 2.0, mount: 'freestanding', bottomY: 1.3, y: 0.12 }),
  // Sirocco: a CRT on a rugged monitor trailer under the shade sail, on the depot's level terrace (1.5 m under the
  // datum), in the frame's right band clear of the hero's halo, turned to the lens (garage r9, garageSiroccoKit.ts)
  shade_depot: Object.freeze({ at: [13.4, 17.8] as const, yaw: kitYawToward([13.4, 17.8]), width: 2.8, mount: 'trailer', y: -1.5 }),
  // Steinburg: a CRT on its stand on the yard's level floor by its right bank, in the frame's right band clear of
  // the hero's halo (the brief's gate passage stands behind the hero), turned to the lens (garage r9, garageSteinburgKit.ts)
  brick_arsenal: Object.freeze({ at: [12.6, 16.0] as const, yaw: kitYawToward([12.6, 16.0]), width: 2.2, mount: 'freestanding' }),
});

/**
 * Verdant's one slideshow (a CRT on its stand in the hall, free of the west wall, its glass turned +X toward the hero):
 * the screen root's centre in the dressing frame, its yaw, its 16:9 width and the glass's face plane in front of the
 * root. It mirrors the dressing's own literals (garageDressing.ts screenRoot and BATTLE_SCREEN_PANEL_W, which
 * garageDressingFleet.selftest pins); Verdant's kit builds the housing on it (garageVerdantKit.ts), and the display
 * placement and slideshow clearance receipts check the two agree, keep the atmosphere off the screen and every deck,
 * rail and column out of the monitor.
 */
export const GARAGE_VERDANT_SLIDESHOW = Object.freeze({
  position: Object.freeze([-18.35, 4.15, 2.4] as const),
  yaw: Math.PI / 2,
  width: 5.86,
  glassZ: 0.115,
});

/** The bottom edge of the picture's 80 mm margin over the panel's base for a mount (the CRT's chin hangs below it). */
export function garageSlideshowBottomY(mount: GarageSlideshowMount, bottomY?: number): number {
  return bottomY ?? (mount === 'trailer' ? 2.1 : mount === 'freestanding' ? 1.4 : 2.2);
}

/** How far the CRT's glass bows out at its centre, a fraction of its width (its edges sit on the face plane). */
export const GARAGE_SLIDESHOW_GLASS_BULGE = 0.015;

/**
 * The slideshow's CRT housing for a screen `width` wide (garage 231; the owner, 2026-10-21: "make it a crt screen like
 * the one we removed"): the bezel's border round the glass and its chin (the control strip under the picture), the
 * case behind the bezel and the tube's funnel and neck behind the case, and the glass's face plane in the frame. A
 * stand or a trailer's mast carries the full tube behind a face plane 52 mm proud of the frame's origin; a wall or
 * column monitor has the short tube and sits on a shelf bracket, its back 0.22 m off the mount, so its glass stands
 * proud of the wall by the housing's depth.
 */
export function garageSlideshowHousing(mount: GarageSlideshowMount, width: number): {
  readonly border: number; readonly chin: number; readonly caseDepth: number; readonly tubeDepth: number;
  readonly neckDepth: number; readonly depth: number; readonly faceZ: number;
} {
  const shelf = mount === 'wall' || mount === 'column';
  const caseDepth = width * (shelf ? 0.1 : 0.12), tubeDepth = width * (shelf ? 0.15 : 0.24), neckDepth = width * 0.03;
  // behind the face plane: the bezel's 20 mm, the case, the funnel and the neck
  const depth = 0.02 + caseDepth + tubeDepth + neckDepth;
  return { border: width * 0.06, chin: width * 0.13, caseDepth, tubeDepth, neckDepth, depth, faceZ: shelf ? depth - 0.22 : 0.052 };
}

/** The slideshow frame's screen centre in the frame's own coordinates (on its CRT's face plane). */
function garageSlideshowMountCenter(placement: GarageSlideshowPlacement): readonly [number, number, number] {
  const height = placement.width * 9 / 16;
  return [0, garageSlideshowBottomY(placement.mount, placement.bottomY) + (height + 0.16) / 2,
    garageSlideshowHousing(placement.mount, placement.width).faceZ];
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
