// The early Leopard 2 turrets' cheek front, built (release 262's 2A2 and 2A3, profiles/leopard2a3B4.ts; release 265's 2A4
// family, profiles/leopard2A4Turret.ts): the two cheek blocks in front of a turret's welded shell and the EMES 15 in its
// notch. One construction (the christian2 lane's, 63c90394f4, moved here unchanged); each turret passes its datums
// (leopard2CheekFrontDatums.ts) and keeps its own shell, brow, mantlet and fittings.
import { KIT, convexSlab } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import {
  cheekFaceZ, cheekFrontZ, sightBackZ, type Leopard2CheekFront, type Leopard2CheekSide,
} from '../leopard2CheekFrontDatums.ts';

/**
 * The two cheek blocks in front of the shell: their faces straight across from the gun slot to each side's outer end, swept
 * back outward, vertical to faceTopY and bevelled back to their flat tops, a short chamfer to the side walls; the right one
 * cut by the EMES 15's notch in its top inboard corner (its floor the sill, its walls the blocks either side, its back the
 * sight head's face, parallel to the cheek's face). Each piece is a convex hexahedron with one planar face forward, from 2 cm
 * inside the shell's front.
 */
export function addLeopard2CheekBlocks(P: TankBuilderPort, f: Leopard2CheekFront): void {
  const inner = f.slotHalfWidthM, root = f.rootZ - 0.02;
  const lo = f.floorY + 0.01, mid = f.faceTopY, top = f.cheekTopY;
  // a piece over |x| in [xa, xb] and y in [ya, yb], from the shell back to its front (or to a vertical front parallel
  // to the face, setback behind it)
  const piece = (sx: number, side: Leopard2CheekSide, xa: number, xb: number, ya: number, yb: number,
    setback: number | null = null): void => {
    const z = (x: number, y: number): number => setback === null ? cheekFrontZ(f, side, x, y) : cheekFaceZ(f, x) - setback;
    P.add('turret', convexSlab(
      [sx * xa, ya, root], [sx * xb, ya, root], [sx * xb, ya, z(xb, ya)], [sx * xa, ya, z(xa, ya)],
      [sx * xa, yb, root], [sx * xb, yb, root], [sx * xb, yb, z(xb, yb)], [sx * xa, yb, z(xa, yb)],
    ));
  };
  const xi = f.sight.innerX, xo = f.sight.outerX, sill = f.sight.sillY;
  for (const sx of [-1, 1]) {
    const notch = sx < 0, side = notch ? f.right : f.left, fw = side.faceHalfWidthM, hw = side.wallHalfWidthM;
    const bands: Array<readonly [number, number]> = notch ? [[lo, sill]] : [[lo, mid], [mid, top]];
    for (const [ya, yb] of bands) { piece(sx, side, inner, fw, ya, yb); piece(sx, side, fw, hw, ya, yb); }
    if (!notch) continue;
    // over the sill: the walls either side of the notch, the chamfer, and the block behind the sight head
    for (const [ya, yb] of [[sill, mid], [mid, top]] as const) {
      piece(sx, side, inner, xi, ya, yb);
      piece(sx, side, xo, fw, ya, yb);
      piece(sx, side, fw, hw, ya, yb);
    }
    piece(sx, side, xi, xo, sill, top, f.sight.depthM);
  }
}

/**
 * The EMES 15 in its notch: the sight head's dark face at the notch's back, parallel to the cheek's face, with its thermal
 * window outboard and its day and laser window inboard; the two armoured door leaves swung forward flat against the
 * notch's walls; the armoured housing on the roof behind, its front the notch's lintel on the same line, its sides sloped
 * 20 degrees, its bolted lip out over the notch.
 */
export function addLeopard2Emes15(P: TankBuilderPort, f: Leopard2CheekFront): void {
  const { box, cylY } = KIT;
  const s = f.sight, xi = s.innerX, xo = s.outerX, sill = s.sillY, xc = (xi + xo) / 2, x = -xc, w = xo - xi;
  const back = sightBackZ(f), foot = s.lintelY, top = s.topY, z0 = back - s.housingDepthM;
  const sweep = f.sweepDeg * Math.PI / 180, cs = Math.cos(sweep), sn = Math.sin(sweep);
  // the notch's back line at |x| off the bore (the face's line depthM behind it, carried on past the walls), and a
  // point d out of it along the face toward the bore (t) and forward off it (d)
  const backAt = (ax: number): number => f.frontZ - (ax - f.slotHalfWidthM) * Math.tan(sweep) - s.depthM;
  const onBack = (t: number, d: number): readonly [number, number] => [x + t * cs - d * sn, back + t * sn + d * cs];
  const half = w / 2 + 0.06, crown = half - (top - foot) * Math.tan(20 * Math.PI / 180);
  P.add('turret', convexSlab(
    [x + half, foot, z0], [x - half, foot, z0], [x - half, foot, backAt(xc + half)], [x + half, foot, backAt(xc - half)],
    [x + crown, top, z0], [x - crown, top, z0], [x - crown, top, backAt(xc + crown)], [x + crown, top, backAt(xc - crown)],
  ));
  // the sight head's face across the notch's back, its two windows
  const hy = (sill + foot) / 2;
  const [hx, hz] = onBack(0, 0.01);
  P.add('turretDark', box((w - 0.02) / cs, foot - sill - 0.01, 0.02), hx, hy, hz, 0, -sweep, 0);
  for (const t of [-0.10, 0.10]) {
    const [gx, gz] = onBack(t, 0.024);
    P.add('turretGlass', box(0.17, 0.20, 0.012), gx, hy + 0.01, gz, 0, -sweep, 0);
  }
  // the hood's bolted lip roofing the notch, 16 cm out over it from the housing, from the inner wall to 14 cm past the
  // outer one (a thin edge over the opening in the owner's photo)
  const lipIn = xi + 0.02, lipOut = xo + 0.14, [lx, lz] = onBack(xc - (lipIn + lipOut) / 2, 0.08);
  P.add('turretDetail', box((lipOut - lipIn) / cs, 0.035, 0.16), lx, foot + 0.0175, lz, 0, -sweep, 0);
  // the door leaves, open against the walls, their hinges at the back
  const doorH = foot - sill - 0.03;
  for (const [wx, sx] of [[xi, -1], [xo, 1]] as const) {
    const wb = backAt(wx);
    P.add('turretDetail', box(0.025, doorH, 0.20), -wx + sx * 0.0135, sill + 0.01 + doorH / 2, wb + 0.13);
    for (const dy of [-0.10, 0.10]) P.add('turretDark', cylY(0.012, 0.012, 0.05, 8), -wx + sx * 0.02, sill + 0.01 + doorH / 2 + dy, wb + 0.03);
  }
}
