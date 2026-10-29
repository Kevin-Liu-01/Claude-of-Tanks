// The early Leopard 2 turrets' cheek front in plan: release 262's 2A2 and 2A3 (leopard2a3B4Armor.ts) and release 265's 2A4
// family (leopard2A4FamilyArmor.ts) share it. The cheeks' vertical faces stand at frontZ across the gun slot and sweep back
// toward their outer ends; a short chamfer meets each side wall; the faces bevel back to the cheeks' flat tops; the EMES
// 15's notch is cut through the right cheek's top inboard corner, its back the sight head's face, parallel to the cheek's
// face. One set of lines for every turret on it (the builder: profiles/leopard2CheekFront.ts); each turret passes its own
// datums. Pure arithmetic: the specs read it without the builders.

/**
 * The faces' sweep in plan. The owner, 2026-10-29, looking at the turrets from above: "i think it nneeds to be a lot mroe
 * than 6 degrees". No source publishes the angle; a camera and sweep fitted to the owner's photo of the Austrian 2A4 "322"
 * (its two cheek rails, slopes +0.02 and -0.37; the turret side's rail, +0.52; the faces' widths, 150 and 80 px) gives
 * 30.8 degrees orthographic and 25.8 / 27.5 / 29.0 at the focal lengths its vertical edges allow (2000 / 3000 / 5000 px):
 * 24 to 31, 6 the worst fit (the christian2 lane, 63c90394f4).
 */
export const LEOPARD2_CHEEK_SWEEP_DEG = 27;

/** One side's cheek (|x| off the bore): its face's outer end and the side wall the chamfer meets. */
export interface Leopard2CheekSide {
  readonly faceHalfWidthM: number;
  readonly wallHalfWidthM: number;
}

/** The EMES 15's notch in the right cheek (|x| off the bore), and the sight head's armoured housing behind it. */
export interface Leopard2SightNotch {
  readonly innerX: number;
  readonly outerX: number;
  readonly sillY: number;
  readonly lintelY: number;
  readonly topY: number;
  /** The notch's depth to the sight head's face, parallel to the cheek's face (not less than the cheeks' bevel). */
  readonly depthM: number;
  /** How far the housing runs back from the notch's back. */
  readonly housingDepthM: number;
}

/** A turret's cheek front, turret metres from the ring. */
export interface Leopard2CheekFront {
  readonly frontZ: number;
  readonly slotHalfWidthM: number;
  readonly sweepDeg: number;
  readonly floorY: number;
  readonly faceTopY: number;
  readonly cheekTopY: number;
  readonly cheekBevelM: number;
  /** The welded shell's front: behind the outer ends' bevelled tops (cheekCornerZ less the bevel). */
  readonly rootZ: number;
  readonly cornerChamferM: number;
  /** The right cheek (-X, the EMES 15's) and the left (+X). */
  readonly right: Leopard2CheekSide;
  readonly left: Leopard2CheekSide;
  readonly sight: Leopard2SightNotch;
}

/** The vertical face's z at |x| off the bore: frontZ at the slot, swept back toward the outer ends. */
export function cheekFaceZ(f: Pick<Leopard2CheekFront, 'frontZ' | 'slotHalfWidthM' | 'sweepDeg'>, x: number): number {
  return f.frontZ - Math.max(0, Math.abs(x) - f.slotHalfWidthM) * Math.tan(f.sweepDeg * Math.PI / 180);
}

/** Where a side's chamfer meets its wall. */
export function cheekCornerZ(f: Leopard2CheekFront, side: Leopard2CheekSide): number {
  return cheekFaceZ(f, side.faceHalfWidthM) - f.cornerChamferM;
}

/** The front's z at |x| and height y on one side: the swept face (the chamfer outboard of its outer end), set back by the
 *  bevel over the faces' top. */
export function cheekFrontZ(f: Leopard2CheekFront, side: Leopard2CheekSide, x: number, y: number): number {
  const fw = side.faceHalfWidthM, hw = side.wallHalfWidthM, fo = cheekFaceZ(f, fw), corner = cheekCornerZ(f, side);
  const face = x <= fw ? cheekFaceZ(f, x) : fo + (corner - fo) * (x - fw) / (hw - fw);
  return face - Math.max(0, y - f.faceTopY) / (f.cheekTopY - f.faceTopY) * f.cheekBevelM;
}

/** The notch's back (the sight head's face) at the notch's centre: depthM behind the face, parallel to it. */
export function sightBackZ(f: Leopard2CheekFront): number {
  return cheekFaceZ(f, (f.sight.innerX + f.sight.outerX) / 2) - f.sight.depthM;
}
