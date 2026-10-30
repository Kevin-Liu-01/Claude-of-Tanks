/**
 * chaseFraming.ts — where the arcade chase camera puts the player's tank (battle-camera-264; owner 2026-10-28: "center
 * tank in the battle hud more, make it less covered by the ui by default, but be able to change and alter this camera
 * angle as u like in settings").
 *
 * The chase used one pose for every window: a pivot 1 m over the turret roof, 13 m back at the -10 degree battle-start
 * look. Under the HUD's bottom band (the controls strip, the vehicle-actions row, the shell and consumable rack, a touch
 * layout's buttons) that put the hull's rear and its tracks behind the chrome at 1920x1080 and buried the tank on a phone.
 *
 * The framing is solved from the HUD's live bands (battleHudLayout.ts measures them, ui/battleSight.ts carries them):
 * the tank's box in the reference pose (yaw behind the hull, CHASE_PITCH_RAD) is projected through the chase camera and
 * three levers are chosen so the box sits between the sight's clear zone and the band's top edge:
 *  - the look-at point: the pivot's height over the turret roof (CHASE_BASE_PIVOT_M while it fits; lower lifts the tank
 *    towards the sight, higher drops it towards the band);
 *  - the distance: the default orbit step (CHASE_BASE_DISTANCE_M at the least), farther only as far as the room needs;
 *  - the screen offset: a lens shift (camera.setViewOffset) that raises the whole picture, the sight with it, where the
 *    room under a centred sight is too short for a readable tank (a short landscape phone). The aim ray is still the
 *    camera's axis, so the reticle (hud.ts projects the aim point) still marks where the shell goes; the HUD's sight
 *    bands follow the published rise (battleSight.ts).
 * Each candidate costs its distance over the base plus SHIFT_COST per screen fraction of rise: the cheapest that fits
 * wins, so a centred sight is kept wherever a modestly farther camera clears the band.
 *
 * The player's camera settings (input.ts, Settings › Gameplay › Camera) apply on top of the solved default: height adds
 * metres to the pivot, distance scales the orbit, the shoulder moves the camera sideways (the tank to a third, the sight
 * centred), framing adds to the lens shift, and the field of view is the chase's lens. Sniper, isometric, aerial, Watch,
 * the death and ending cameras never read this module.
 *
 * DOM-free and deterministic; cameraRig.ts solves on a band, setting or tank change, never per frame.
 * chaseFraming.selftest.mjs pins the defaults and the clearance per supported layout.
 */

export type ChaseShoulder = 'left' | 'centre' | 'right';

export interface ChaseCameraSettings {
  /** Metres added to the framed pivot height: the camera rides higher (the tank sits lower in the picture). */
  cameraHeight: number;
  /** Multiplier on the framed default orbit distance (the default zoom; the wheel's steps scale with it). */
  cameraDistance: number;
  /** The camera over the tank's left or right shoulder (the tank to the right or left of the sight), or centred. */
  cameraShoulder: ChaseShoulder;
  /** Screen-height fraction the picture (and the sight with it) rises by, over the framed lens shift. */
  cameraFraming: number;
  /** The chase lens's vertical field of view, degrees. */
  cameraFov: number;
}

export const CHASE_CAMERA_DEFAULTS: Readonly<ChaseCameraSettings> = Object.freeze({
  cameraHeight: 0,
  cameraDistance: 1,
  cameraShoulder: 'centre',
  cameraFraming: 0,
  cameraFov: 60,
});

export type ChaseNumericSetting = 'cameraHeight' | 'cameraDistance' | 'cameraFraming' | 'cameraFov';

/** Each numeric setting's range (the Settings sliders' ends; input.ts clamps stored values into them). */
export const CHASE_CAMERA_RANGES: Readonly<Record<ChaseNumericSetting, readonly [number, number]>> = Object.freeze({
  cameraHeight: [-1.5, 3] as const,
  cameraDistance: [0.7, 1.6] as const,
  cameraFraming: [-0.1, 0.2] as const,
  cameraFov: [50, 80] as const,
});

export const CHASE_SHOULDERS: readonly ChaseShoulder[] = ['left', 'centre', 'right'];

export function isChaseShoulder(value: unknown): value is ChaseShoulder {
  return typeof value === 'string' && (CHASE_SHOULDERS as readonly string[]).includes(value);
}

/** The reference pose's look: the rig's battle-start pitch (endCinematic), the pose the framing is solved in. */
export const CHASE_PITCH_RAD = -10 * Math.PI / 180;
/** The chase's base default step and pivot (the pose before 264): the framing never comes closer, and keeps this pivot
 *  wherever the room allows. */
export const CHASE_BASE_DISTANCE_M = 13;
export const CHASE_BASE_PIVOT_M = 1.0;
/** The farthest the framed default step goes (the tank at two thirds of its base size). */
const MAX_DISTANCE_M = 19.5;
/** The nearest fitting distance's bisection steps (6.5 m / 2^10: under a centimetre). */
const DISTANCE_BISECTIONS = 10;
/** The most the framing raises the picture on its own, as a share of the height, and its price against distance: one
 *  per cent of rise costs what two and a half per cent of distance does, so a desktop window's sight rises a little and a
 *  phone's tank keeps a readable size. */
const MAX_SHIFT_FRACTION = 0.14;
const SHIFT_STEP_FRACTION = 0.005;
const SHIFT_COST = 2.5;
/** The pivot's search range over the turret roof, metres. */
const PIVOT_MIN_M = -1.5;
const PIVOT_MAX_M = 6;
/** The tank's lowest point never sits under this share of the height, chrome or none (the base pose put the tracks at
 *  0.86 to 0.93 of a desktop window: "center tank in the battle hud more"). */
const BOTTOM_MAX_FRACTION = 0.84;
/** Chrome whose top is above this share of the height is the head band's, never the floor. */
const FLOOR_FROM_FRACTION = 0.35;
/** How far the tank's box keeps beside a floor box for that box to count as over it, px. */
const FLOOR_SIDE_PAD_PX = 8;
/** The share of the half width the shoulder puts the tank's centre off the sight. */
const SHOULDER_SCREEN_FRACTION = 0.28;
/** The dispersion ring's ceiling over the shorter side (hud.ts RET_CEIL_FRAC): the risen sight keeps it under the head band. */
const RING_CEILING_FRACTION = 0.15;

/** A screen box, CSS px. */
interface ChaseRect { x0: number; y0: number; x1: number; y1: number }

/** The HUD's bands as battleHudLayout.ts measures them: the bottom chrome that does not move with the sight, the head
 *  band's bottom edge over the centre column, and the most the layout lets the sight rise (its own places that follow
 *  the sight, a portrait phone's systems row, hold up to it; absent: no limit of its own). */
export interface ChaseBands {
  width: number;
  height: number;
  touch: boolean;
  floor: readonly ChaseRect[];
  /** Bottom chrome that comes and goes (the first battles' controls strip): cleared at the steady framing's sight rise,
   *  the camera drawing back while it shows, so the sight and the HUD's places never move for it. */
  transient?: readonly ChaseRect[];
  ceiling: number;
  riseCap?: number;
}

/** The tank's box about the ground under its turret roof's centre: half width, roof height, and how far it reaches
 *  behind and ahead of the roof centre, metres. */
export interface ChaseTank { widthM: number; heightM: number; rearM: number; frontM: number }

/** A main battle tank's hull box (3.7 m wide, 2.45 m to the roof, 8.2 m long about a central turret). */
export const NOMINAL_CHASE_TANK: Readonly<ChaseTank> = Object.freeze({ widthM: 3.7, heightM: 2.45, rearM: 4.1, frontM: 4.1 });

export interface ChaseFraming {
  /** The pivot's height over the turret roof, metres. */
  pivotAboveM: number;
  /** The default orbit step's distance, metres. */
  distanceM: number;
  fovDeg: number;
  /** Sideways camera offset, metres (positive: the camera to the screen's right, the tank to its left). */
  shoulderM: number;
  /** Lens shift: the share of the screen height the picture rises by (camera.setViewOffset's offsetY). */
  shift: number;
  /** The arcade sight's rise over the screen centre, CSS px (shift x height; 0 without bands). */
  sightShiftPx: number;
  /** The reference pose's tank box on screen with this framing, CSS px (null without bands). */
  tank: ChaseRect | null;
  /** The top of the HUD's bottom band over that box, CSS px (the height without chrome there). */
  floorPx: number;
}

/** The px the tank's roof keeps under the sight's centre (the resting ring and its halo, and a breath). */
export function chaseSightClearPx(height: number): number {
  return Math.min(30, Math.max(20, Math.round(height * 0.028)));
}

/** The px the tank's lowest point keeps over the band's top edge: clear air under the tracks, not a hairline. */
export function chaseFloorMarginPx(height: number): number {
  return Math.min(40, Math.max(10, Math.round(height * 0.045)));
}

/** A stored or typed value for one numeric camera setting, clamped into its range (NaN: the default). */
export function clampChaseSetting(key: ChaseNumericSetting, value: unknown): number {
  const [lo, hi] = CHASE_CAMERA_RANGES[key];
  const n = Number(value);
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : CHASE_CAMERA_DEFAULTS[key]));
}

interface PoseScratch { tanV: number; aspect: number; w: number; h: number; shift: number; shoulderM: number }

const SIN_P = Math.sin(CHASE_PITCH_RAD);
const COS_P = Math.cos(CHASE_PITCH_RAD);

/**
 * The reference pose's tank box on screen (CSS px): the camera behind the hull at CHASE_PITCH_RAD, `distanceM` back from
 * the pivot `pivotAboveM` over the roof, `pose.shoulderM` to the side, the picture raised by `pose.shift`. Written into `out`.
 */
function projectTank(tank: ChaseTank, pivotAboveM: number, distanceM: number, pose: PoseScratch, out: ChaseRect): ChaseRect {
  // forward f = (0, sin p, cos p); up u = (0, cos p, -sin p); screen right r = (-1, 0, 0) (the view looks down +Z)
  const camX = -pose.shoulderM;
  const camY = tank.heightM + pivotAboveM - distanceM * SIN_P;
  const camZ = -distanceM * COS_P;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const half = tank.widthM / 2;
  for (let i = 0; i < 8; i++) {
    const dx = (i & 1 ? half : -half) - camX;
    const dy = (i & 2 ? tank.heightM : 0) - camY;
    const dz = (i & 4 ? tank.frontM : -tank.rearM) - camZ;
    const depth = dy * SIN_P + dz * COS_P;
    const up = dy * COS_P - dz * SIN_P;
    const ndcX = -dx / (depth * pose.tanV * pose.aspect);
    const ndcY = up / (depth * pose.tanV) + 2 * pose.shift;
    const sx = (ndcX + 1) / 2 * pose.w;
    const sy = (1 - ndcY) / 2 * pose.h;
    if (sx < x0) x0 = sx;
    if (sx > x1) x1 = sx;
    if (sy < y0) y0 = sy;
    if (sy > y1) y1 = sy;
  }
  out.x0 = x0; out.y0 = y0; out.x1 = x1; out.y1 = y1;
  return out;
}

/** The top of the bottom band over the span [x0, x1]: the highest floor box beside it (the transient ones with
 *  `transient`), else the window's bottom. */
export function chaseFloorAt(bands: ChaseBands, x0: number, x1: number, transient = true): number {
  let floor = bands.height;
  const from = bands.height * FLOOR_FROM_FRACTION;
  for (const boxes of transient && bands.transient ? [bands.floor, bands.transient] : [bands.floor]) {
    for (const box of boxes) {
      if (box.y0 < from || box.x0 >= x1 + FLOOR_SIDE_PAD_PX || box.x1 <= x0 - FLOOR_SIDE_PAD_PX) continue;
      if (box.y0 < floor) floor = box.y0;
    }
  }
  return floor;
}

/** The pivot height at which `edge` of the tank's box (its top 'y0' or bottom 'y1') lands on `targetPx`. Each corner
 *  sinks down the screen as the pivot rises, its height there a linear fraction of the pivot's, so a corner lands on the
 *  target at one pivot in closed form: the top edge lands there at the last corner to reach it, the bottom at the first. */
function pivotFor(tank: ChaseTank, distanceM: number, pose: PoseScratch, edge: 'y0' | 'y1', targetPx: number): number {
  // the target's NDC height without the lens shift, over the lens: up = c * depth
  const c = (1 - 2 * targetPx / pose.h - 2 * pose.shift) * pose.tanV;
  const ratio = (SIN_P + c * COS_P) / (COS_P - c * SIN_P);
  const camZ = -distanceM * COS_P;
  let pivot = edge === 'y0' ? -Infinity : Infinity;
  for (let i = 0; i < 4; i++) {
    const y = i & 1 ? tank.heightM : 0;
    const dz = (i & 2 ? tank.frontM : -tank.rearM) - camZ;
    // up = dy cos p - dz sin p, depth = dy sin p + dz cos p; dy = y - (roof + pivot - distance sin p)
    const at = y - tank.heightM + distanceM * SIN_P - dz * ratio;
    pivot = edge === 'y0' ? Math.max(pivot, at) : Math.min(pivot, at);
  }
  return Math.min(PIVOT_MAX_M, Math.max(PIVOT_MIN_M, pivot));
}

/** The shoulder's sideways offset for a distance: the tank's centre a share of the half width off the sight. */
function shoulderOffset(shoulder: ChaseShoulder, distanceM: number, tanV: number, aspect: number): number {
  if (shoulder === 'centre') return 0;
  return (shoulder === 'right' ? 1 : -1) * SHOULDER_SCREEN_FRACTION * distanceM * tanV * aspect;
}

/** Settings read from storage or the input layer, every field defined and in range. */
export function normalizeChaseSettings(raw: Partial<ChaseCameraSettings> | null | undefined): ChaseCameraSettings {
  return {
    cameraHeight: clampChaseSetting('cameraHeight', raw?.cameraHeight ?? CHASE_CAMERA_DEFAULTS.cameraHeight),
    cameraDistance: clampChaseSetting('cameraDistance', raw?.cameraDistance ?? CHASE_CAMERA_DEFAULTS.cameraDistance),
    cameraShoulder: isChaseShoulder(raw?.cameraShoulder) ? raw.cameraShoulder : CHASE_CAMERA_DEFAULTS.cameraShoulder,
    cameraFraming: clampChaseSetting('cameraFraming', raw?.cameraFraming ?? CHASE_CAMERA_DEFAULTS.cameraFraming),
    cameraFov: clampChaseSetting('cameraFov', raw?.cameraFov ?? CHASE_CAMERA_DEFAULTS.cameraFov),
  };
}

/**
 * Solve the chase framing for a window `width` x `height` (CSS px), the HUD's `bands` (null: no HUD measured yet, the
 * base pose), the player's `settings` and the tank's box. See the module's note.
 */
export function solveChaseFraming(width: number, height: number, bands: ChaseBands | null,
  settings: Partial<ChaseCameraSettings> | null = null, tank: ChaseTank = NOMINAL_CHASE_TANK): ChaseFraming {
  const s = normalizeChaseSettings(settings);
  const w = Math.max(1, width), h = Math.max(1, height);
  const tanV = Math.tan(s.cameraFov * Math.PI / 360);
  const aspect = w / h;
  const pose: PoseScratch = { tanV, aspect, w, h, shift: 0, shoulderM: 0 };
  const box: ChaseRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  let pivot = CHASE_BASE_PIVOT_M, distance = CHASE_BASE_DISTANCE_M, shift = 0;
  let floorPx = h;
  // (bands measured for another window size are stale: the base pose until the HUD measures this one)
  const live = bands && Math.abs(bands.width - w) < 1.5 && Math.abs(bands.height - h) < 1.5 ? bands : null;
  if (live) {
    const clear = chaseSightClearPx(h), margin = chaseFloorMarginPx(h);
    // the risen sight keeps its widest ring under the head band
    const ring = RING_CEILING_FRACTION * Math.min(w, h);
    const shiftRoom = Math.max(0, h / 2 - ring - 4 - live.ceiling);
    const maxShift = Math.min(MAX_SHIFT_FRACTION * h, shiftRoom, Math.max(0, live.riseCap ?? Infinity));
    const lowest = h * BOTTOM_MAX_FRACTION;
    /** The cheapest (rise, distance) from `rises` and `fromM` that fits the tank between the sight's clear zone and the
     *  floor (the transient chrome with `transient`); where none fits, the one that falls least short, the hull and
     *  tracks clear and the roof as near the sight as that leaves it. A farther camera only shrinks the tank towards the
     *  sight, so each rise's nearest fitting distance is found by bisection. */
    const fit = (rises: readonly number[], fromM: number, transient: boolean) => {
      let best: { cost: number; pivot: number; distance: number; rise: number; floor: number } | null = null;
      let fallback: { short: number; pivot: number; distance: number; rise: number; floor: number } | null = null;
      const at = { top: 0, bottom: 0, floor: 0 };
      const fits = (rise: number, d: number): boolean => {
        pose.shift = rise / h;
        pose.shoulderM = shoulderOffset(s.cameraShoulder, d, tanV, aspect);
        at.top = pivotFor(tank, d, pose, 'y0', h / 2 - rise + clear);
        projectTank(tank, at.top, d, pose, box);
        at.floor = chaseFloorAt(live, box.x0, box.x1, transient);
        at.bottom = pivotFor(tank, d, pose, 'y1', Math.min(at.floor - margin, lowest));
        return at.top <= at.bottom;
      };
      for (const rise of rises) {
        const riseCost = SHIFT_COST * rise / h;
        if (best && riseCost + fromM / CHASE_BASE_DISTANCE_M - 1 >= best.cost) break;
        let d = fromM;
        if (!fits(rise, d)) {
          if (!fits(rise, MAX_DISTANCE_M)) {
            const short = at.top - at.bottom;
            if (!fallback || short < fallback.short) fallback = { short, pivot: at.bottom, distance: MAX_DISTANCE_M, rise, floor: at.floor };
            continue;
          }
          let lo = fromM, hi = MAX_DISTANCE_M;
          for (let k = 0; k < DISTANCE_BISECTIONS; k++) {
            const mid = (lo + hi) / 2;
            if (fits(rise, mid)) hi = mid;
            else lo = mid;
          }
          d = hi;
          fits(rise, d);
        }
        const cost = d / CHASE_BASE_DISTANCE_M - 1 + riseCost;
        if (!best || cost < best.cost) {
          best = { cost, pivot: Math.min(Math.max(CHASE_BASE_PIVOT_M, at.top), at.bottom), distance: d, rise, floor: at.floor };
        }
      }
      return best ?? fallback;
    };
    const rises: number[] = [];
    for (let rise = 0; rise <= maxShift + 1e-6; rise += SHIFT_STEP_FRACTION * h) rises.push(rise);
    let pick = fit(rises, CHASE_BASE_DISTANCE_M, false);
    // the transient chrome while it shows: the steady rise kept, the camera draws back over it
    if (pick && live.transient?.length) pick = fit([pick.rise], pick.distance, true) ?? pick;
    if (pick) { pivot = pick.pivot; distance = pick.distance; shift = pick.rise / h; floorPx = pick.floor; }
  }
  // the player's settings over the solved default
  pivot += s.cameraHeight;
  distance *= s.cameraDistance;
  shift += s.cameraFraming;
  pose.shift = shift;
  pose.shoulderM = shoulderOffset(s.cameraShoulder, distance, tanV, aspect);
  const tankBox = live ? { ...projectTank(tank, pivot, distance, pose, box) } : null;
  return {
    pivotAboveM: pivot,
    distanceM: distance,
    fovDeg: s.cameraFov,
    shoulderM: pose.shoulderM,
    shift,
    sightShiftPx: live ? shift * h : 0,
    tank: tankBox,
    floorPx: live && tankBox ? chaseFloorAt(live, tankBox.x0, tankBox.x1) : floorPx,
  };
}

/** The tank's box for the framing from its spec dims and its turret roof's place along the hull (metres ahead of the
 *  hull's centre). Missing dims fall back to the nominal tank's. */
export function chaseTankFromDims(dims: { heightM?: number; widthM?: number; hullLengthM?: number } | null | undefined,
  roofAheadM = 0): ChaseTank {
  const half = (dims?.hullLengthM ?? NOMINAL_CHASE_TANK.rearM + NOMINAL_CHASE_TANK.frontM) / 2;
  return {
    widthM: dims?.widthM ?? NOMINAL_CHASE_TANK.widthM,
    heightM: dims?.heightM ?? NOMINAL_CHASE_TANK.heightM,
    rearM: Math.max(0.5, half + roofAheadM),
    frontM: Math.max(0.5, half - roofAheadM),
  };
}
