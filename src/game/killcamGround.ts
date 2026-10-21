/**
 * Killcam capture staging above the ground (engine-cs, 2026-10-15; the media UI round's killcam_firing frame put the
 * firing beat inside a Verdant hillside). The staged x-ray/firing recipe fires a synthetic flank shot from 440 m; its
 * muzzle sat a fixed 9 m above the target, so wherever the ground 440 m out is higher than that the muzzle, the seated
 * shooter's line and the firing camera behind it were in the hill. The muzzle now keeps a gun's height above its own
 * ground, the flank azimuth and range step through a fixed candidate list until the line to the target clears the
 * terrain, and the shooter sits on its ground behind the muzzle. Pure: a height sampler in, positions out (Node-run by
 * killcamGround.selftest.mjs over every map).
 */

interface KillcamGround {
  getHeightAt(x: number, z: number): number;
}

interface KillcamPoint {
  x: number;
  y: number;
  z: number;
}

/** The recipe's muzzle height above the target (the original staging's constant, kept where the ground allows). */
export const KILLCAM_MUZZLE_RISE_M = 9;
/** The least the muzzle stands above the ground under it: a tank's gun height. */
export const KILLCAM_MUZZLE_GROUND_M = 2.8;
/** The line from the muzzle to the aim point clears the terrain by this much... */
export const KILLCAM_LINE_CLEAR_M = 0.2;
/** ...except over its last metres, which are the target's own ground. */
const KILLCAM_LINE_END_M = 15;
/** The shooter's seat behind the muzzle along the horizontal shot direction (the original staging's 4.2 m). */
export const KILLCAM_SHOOTER_BACK_M = 4.2;
/** Line samples a candidate is tested at (every ~5 m over 440 m). */
const LINE_SAMPLES = 96;

/** Flank candidates, in order: [azimuth offset from the target's right flank, rad; range, m]. The first is the
 * original staging (0.35 rad, 440 m); the rest turn about the target and close in until a line clears. */
export const KILLCAM_STAGE_CANDIDATES: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [0.35, 440], [0.15, 440], [0.6, 440], [-0.1, 440], [0.85, 440],
  [0.35, 320], [0.15, 320], [0.6, 320], [-0.1, 320], [0.85, 320],
  [0.35, 220], [0.15, 220], [0.6, 220], [-0.1, 220], [0.85, 220],
  [0.35, 140], [0.15, 140], [0.6, 140], [-0.1, 140], [0.85, 140],
  [0.35, 80], [0.6, 80], [0.15, 80],
].map((row) => Object.freeze(row) as readonly [number, number]));

interface KillcamFlankStage {
  muzzle: KillcamPoint;
  /** Which candidate won (its index in KILLCAM_STAGE_CANDIDATES). */
  candidate: number;
  /** The line clears the terrain (false: no candidate cleared; the best one is returned). */
  clear: boolean;
  /** The least clearance of the line over the terrain, metres (the last KILLCAM_LINE_END_M excluded). */
  clearanceM: number;
}

/** The least height of the segment a -> b over the terrain, the last `endM` metres excluded. */
export function killcamLineClearance(ground: KillcamGround, a: KillcamPoint, b: KillcamPoint,
  endM = KILLCAM_LINE_END_M, samples = LINE_SAMPLES): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  const stop = len > 1e-6 ? Math.max(0, 1 - endM / len) : 0;
  let least = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * stop;
    const x = a.x + dx * t, z = a.z + dz * t;
    const clearance = a.y + dy * t - ground.getHeightAt(x, z);
    if (clearance < least) least = clearance;
  }
  return least;
}

/**
 * The staged flank muzzle for a target at `target` with hull yaw `yaw`, aimed at `aimY` metres above the target's
 * position. Deterministic: the same ground and target give the same muzzle.
 */
export function stageKillcamFlankShot(target: KillcamPoint, yaw: number, ground: KillcamGround,
  aimY = 1): KillcamFlankStage {
  const aim = { x: target.x, y: target.y + aimY, z: target.z };
  let best: KillcamFlankStage | null = null;
  for (let i = 0; i < KILLCAM_STAGE_CANDIDATES.length; i++) {
    const [offset, range] = KILLCAM_STAGE_CANDIDATES[i];
    const az = yaw + Math.PI / 2 + offset;
    const x = target.x + Math.sin(az) * range;
    const z = target.z + Math.cos(az) * range;
    const y = Math.max(target.y + KILLCAM_MUZZLE_RISE_M, ground.getHeightAt(x, z) + KILLCAM_MUZZLE_GROUND_M);
    const muzzle = { x, y, z };
    const clearanceM = killcamLineClearance(ground, muzzle, aim);
    const stage = { muzzle, candidate: i, clear: clearanceM >= KILLCAM_LINE_CLEAR_M, clearanceM };
    if (stage.clear) return stage;
    if (!best || clearanceM > best.clearanceM) best = stage;
  }
  return best!;
}

/**
 * The shooter's seat: `KILLCAM_SHOOTER_BACK_M` behind the muzzle along the shot's horizontal direction, on the ground
 * there plus the shooter's own ground offset (its hull origin above the terrain).
 */
export function stageKillcamShooter(muzzle: KillcamPoint, shotDir: KillcamPoint, ground: KillcamGround,
  groundOffsetM: number): KillcamPoint {
  const h = Math.hypot(shotDir.x, shotDir.z);
  const ux = h > 1e-6 ? shotDir.x / h : 0, uz = h > 1e-6 ? shotDir.z / h : 1;
  const x = muzzle.x - ux * KILLCAM_SHOOTER_BACK_M;
  const z = muzzle.z - uz * KILLCAM_SHOOTER_BACK_M;
  return { x, y: ground.getHeightAt(x, z) + Math.max(0, groundOffsetM), z };
}

/** The least height a camera at (x, z) may take: the highest ground within `radiusM` (centre and four points, so a
 * steep slope cannot cut the near plane) plus `clearM`. */
export function killcamCameraFloor(ground: KillcamGround, x: number, z: number, clearM = 0.9, radiusM = 1.2): number {
  let top = ground.getHeightAt(x, z);
  top = Math.max(top, ground.getHeightAt(x + radiusM, z), ground.getHeightAt(x - radiusM, z),
    ground.getHeightAt(x, z + radiusM), ground.getHeightAt(x, z - radiusM));
  return top + clearM;
}
