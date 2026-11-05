// Kevin B. Liu — the M1A1 side skirts, hull-side rim and front fenders, measured from the owner's model (release 268).
// One continuous armoured skirt per side (the owner's source carries no panel seams), its 47-degree leading edge and
// tapered top bevel ahead of the first wheel, the rear notch and strip over the drive sprocket, the hull-side rim above
// it, and the flat front fender that falls to a down-turned nose. Measurements: the release-268 evidence packet
// (abrams-bradley-268-evidence/m1fid/measure.md); the source never enters the repository. Hull frame, metres.
import * as THREE from 'three';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';

interface SkirtPort {
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

/** The measured datums (the source: outer face 1.854, inner 1.793, bottom 0.700, top 1.339). */
export const M1A1_SKIRT = Object.freeze({
  outerX: 1.853, innerX: 1.793, ledgeX: 1.736, ledgeT: 0.035,
  top: 1.339, bottom: 0.700,
  /**
   * main-face rear edge (bottom corner) and the strip that runs aft over the sprocket. (Release 268 builder E, the A/B
   * critics: "the sprocket notch rises higher than the model's": its strip's underside is the model's 1.088, not 1.22,
   * and the notch starts at the model's z -2.585, section x 1.83)
   */
  rearZ: -2.585, stripBottom: 1.088, stripEndZ: -3.67,
  /** leading edge: the bottom rises from frontZ at ~47 degrees to the tip */
  frontZ: 3.58, tipZ: 3.93, tipBottom: 1.071,
  /**
   * Release 268 builder E (blind A/B fix round: "the front idler shows under it in the side view ... the model has one
   * straight chamfer down to the track"): ahead of the first road wheel the front section comes down to 0.55 (our idler,
   * centre 0.85, r 0.34, is larger and lower than the model's; its shoes pass 4 cm under this edge) between dropZ0 and
   * dropZ1, and its leading edge is one straight 47-degree chamfer from chamferZ to the tip.
   */
  frontBottom: 0.55, dropZ0: 2.50, dropZ1: 2.60, chamferZ: 3.44,
  /** the outer top bevel starts here and falls 0.2 m per metre toward the bow */
  bevelZ: 2.80,
  /** where the fender takes the top over from the hull deck; noseZ: the foot of its down-turned lip */
  fenderZ: 2.45, fenderInnerX: 1.065, noseZ: 3.95,
});

const S = M1A1_SKIRT;
const lerpTable = (rows: readonly (readonly [number, number])[], z: number): number => {
  if (z <= rows[0][0]) return rows[0][1];
  for (let i = 0; i < rows.length - 1; i++) {
    const [z0, y0] = rows[i], [z1, y1] = rows[i + 1];
    if (z <= z1) return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
  }
  return rows[rows.length - 1][1];
};
// Skirt top line at the face and the fender nose: level, then the model's straight chamfer (its side view: 1.324 at z 3.62,
// 1.173 at 3.872) to the tip and the fender's front face (the A/B fix round: the measured curve read rounded).
const SKIRT_TOP: readonly (readonly [number, number])[] = [[3.50, 1.339], [3.62, 1.324], [3.872, 1.173], [3.93, 1.110]];
// Release 268 builder E (the critics in every round: "rounded humps / bulbous like a boat bow"): the fender's nose is the
// model's (its section at x 1.40): the top falls from 1.339 at z 3.508 on a short convex course to a crisp edge at
// (3.903, 1.111), and the down-turned lip drops from that edge to its foot at 0.93 by 3.95, its face at 75 degrees.
const NOSE_TOP: readonly (readonly [number, number])[] = [[3.50, 1.339], [3.563, 1.331], [3.626, 1.323], [3.677, 1.302],
  [3.736, 1.277], [3.780, 1.244], [3.831, 1.205], [3.864, 1.161], [3.903, 1.111], [3.920, 1.070], [3.935, 1.020],
  [3.950, 0.940]];
const NOSE_BOTTOM: readonly (readonly [number, number])[] = [[3.50, 1.300], [3.58, 1.240], [3.65, 1.190], [3.725, 1.185],
  [3.798, 1.172], [3.833, 1.127], [3.863, 1.088], [3.903, 1.075], [3.920, 1.030], [3.935, 0.960], [3.950, 0.930]];
/** The fender's underside over the track band: the model's plate, 39 mm under its 1.339 top, flat to the nose. */
const FENDER_BOTTOM_Y = 1.300;
// The rear notch: the main face's bottom arcs up behind the last wheel to the strip, and the strip's underside rises to
// its rear end (the model's section at x 1.83: -2.585 .. -2.92, and -3.649 .. -3.686).
const REAR_BOTTOM: readonly (readonly [number, number])[] = [[S.stripEndZ, 1.174], [-3.649, S.stripBottom],
  [-2.92, S.stripBottom], [-2.862, 1.075], [-2.800, 1.027], [-2.773, 0.975], [-2.748, 0.877], [-2.732, 0.813],
  [-2.705, 0.760], [-2.643, 0.713], [S.rearZ, S.bottom]];

const skirtTop = (z: number): number => (z <= 3.50 ? S.top : lerpTable(SKIRT_TOP, z));
const skirtBottom = (z: number): number => {
  if (z < S.rearZ) return lerpTable(REAR_BOTTOM, z);
  if (z <= S.dropZ0) return S.bottom;
  if (z <= S.dropZ1) return S.bottom + (S.frontBottom - S.bottom) * (z - S.dropZ0) / (S.dropZ1 - S.dropZ0);
  if (z <= S.chamferZ) return S.frontBottom;
  return S.frontBottom + (S.tipBottom - S.frontBottom) * (z - S.chamferZ) / (S.tipZ - S.chamferZ);
};
/** Where the outer top bevel meets the outer face (equal to the top behind bevelZ). */
const skirtBevel = (z: number): number => Math.min(z > S.bevelZ ? S.top - 0.2 * (z - S.bevelZ) : S.top, skirtTop(z) - 0.004);

/** Authored for the vehicle-left (+x) side; the right side reflects x and reverses the contour (it stays CCW). */
function sided(sections: readonly SolidSection[], side: number): SolidSection[] {
  if (side > 0) return sections.map((s) => ({ z: s.z, ring: s.ring }));
  return sections.map((s) => ({ z: s.z, ring: [...s.ring].reverse().map(([x, y]): SectionPoint => [-x, y]) }));
}

export interface M1A1SkirtOptions {
  /** hull deck height at z (the rim plate's top behind the turret front) */
  readonly deckAt: (z: number) => number;
}

/** Both skirts, rims and front fenders. Returns nothing; every solid is closed and sits outboard of the track band
 * (x <= 1.735) or over the idler's shoe envelope (r + 0.22) with the clearance release 268 kept. */
export function addM1A1SkirtsAndFenders(P: SkirtPort, { deckAt }: M1A1SkirtOptions): void {
  const xi = S.innerX, xo = S.outerX, xl = S.ledgeX, lt = S.ledgeT;
  // ---- main skirt + its top ledge to the hull wall, stern strip to the bow fender (7-point L section)
  const mainZs = [...REAR_BOTTOM.map(([z]) => z), -1.0, 1.0, S.fenderZ];
  const main: SolidSection[] = mainZs.map((z) => {
    const yb = skirtBottom(z), yt = skirtTop(z), yv = skirtBevel(z);
    return { z, ring: [[xi, yb], [xo, yb], [xo, yv], [xi, yt], [xl, yt], [xl, yt - lt], [xi, yt - lt]] };
  });
  // ---- front section: the bevel grows toward the bow and the leading edge climbs to the tip (4-point section)
  const frontZs = [S.fenderZ, S.dropZ0, S.dropZ1, S.bevelZ, 3.20, S.chamferZ, 3.50, 3.62, 3.725, 3.80, 3.872, S.tipZ];
  const front: SolidSection[] = frontZs.map((z) => {
    const yb = skirtBottom(z), yt = skirtTop(z), yv = Math.max(skirtBevel(z), yb + 0.012);
    return { z, ring: [[xi, yb], [xo, yb], [xo, yv], [xi, yt]] };
  });
  // ---- hull-side rim over the skirt: the source's hull side stands at the skirt's inner face (1.793) from the skirt
  // top to the deck behind the turret front; under the turret front it is a low band (the source's 1.354 ledge notch).
  // Over the sprocket bay (z < -2.55) its inner face keeps outboard of the band's pins (1.728).
  const rimZs = [S.stripEndZ, -3.64, -2.62, -2.58, -2.25, -1.77, -0.95, 0.0, 0.50, 0.60, S.fenderZ];
  const rim: SolidSection[] = rimZs.map((z) => {
    const yt = z <= 0.5 ? deckAt(z) : 1.415, x0 = z <= -2.60 ? xl : 1.722;
    return { z, ring: [[x0, S.top - lt], [xi + 0.002, S.top - lt], [xi + 0.002, yt], [x0, yt]] };
  });
  // ---- front fender over the track band: the model's flat plate, level at the skirt top to the nose, and its down-turned
  // nose and lip. (Release 268 builder E, the critics: "rounded humps / bulbous like a boat bow": it rose in a 1 m arch
  // to 1.42 over a nominal idler shoe envelope, r + 0.22 = 1.41, that the model does not have. The live shoes wrapping
  // our idler reach 1.264 at any phase, their corners included, so the flat 1.300 underside clears them by 3.6 cm.)
  const fenderTop = (z: number): number => (z <= 3.50 ? S.top : lerpTable(NOSE_TOP, z));
  const fenderBottom = (z: number): number => (z <= 3.50 ? FENDER_BOTTOM_Y : lerpTable(NOSE_BOTTOM, z));
  const fenderZs = [S.fenderZ, 2.60, S.bevelZ, 3.20, 3.50, ...NOSE_TOP.slice(1).map(([z]) => z),
    ...NOSE_BOTTOM.map(([z]) => z).filter((z) => z > 3.50 && !NOSE_TOP.some(([t]) => t === z))].sort((a, b) => a - b);
  const fx = S.fenderInnerX, fo = xi + 0.007;
  const fender: SolidSection[] = fenderZs.map((z) => {
    const yb = fenderBottom(z), yt = fenderTop(z);
    // the outer edge dips into the skirt's top bevel (7 mm inside the inner face)
    const st = skirtTop(Math.min(z, S.tipZ)), sv = skirtBevel(Math.min(z, S.tipZ));
    const yo = Math.max(yb + 0.008, Math.min(st - (st - sv) * (0.007 / (xo - xi)), yt) - 0.003);
    return { z, ring: [[fx, yb], [fo, yb], [fo, yo], [1.752, yt], [fx, yt]] };
  });
  for (const side of [-1, 1]) {
    P.add('hull', sectionSolid(sided(main, side)));
    P.add('hull', sectionSolid(sided(front, side)));
    P.add('hull', sectionSolid(sided(rim, side)));
    P.add('hull', sectionSolid(sided(fender, side)));
  }
}

/** The fender's underside at z over the track band (the inner glacis wall closes up to it). */
export function m1a1FenderBottomAt(z: number): number {
  return z > 3.50 ? lerpTable(NOSE_BOTTOM, z) : FENDER_BOTTOM_Y;
}

/** The fender's top at z over the track band (a cover laid on it follows it: ghillieSuit.ts, the FEP's and ua_m1a1's). */
export function m1a1FenderTopAt(z: number): number {
  return z > 3.50 ? lerpTable(NOSE_TOP, z) : S.top;
}
