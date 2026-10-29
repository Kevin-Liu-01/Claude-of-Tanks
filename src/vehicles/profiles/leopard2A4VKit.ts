// The kit of the Leopard 2A4 V (leo2a4_v), carried over from the build it replaces (inventory: the lane's
// inventory/leo2a4_v.md; legacy buildLeo2A5Steps) and re-seated on the release hull and the 2A4 turret
// (leopard2A4Family.ts). The old build was mirrored (its driver and commander at +X): everything tied to a side moves to
// the same side of the vehicle, so its x changes sign here.
//
// Hull: the Strv-pattern stern frame built out from the hull's own tubular stern rack into one basket the louvre band's
// width (a slatted floor under the rack's bay and two wings, the wings' rails on the rack's own, legs to the rear plate)
// carrying the canvas pile on the left, the duffel on the right and the bedroll across the rack's bay; the two folded tarps
// on the engine deck's access plates and the tow rope looped behind the fans; the hydraulic jack and the two round guarded
// tail lights on the lower rear plate; the four spare-link strips on the sponson tops; the glacis's anti-slip fields with
// their X-straps and the spare cable clamped behind the splash board; the clevises on the bow's tow eyes; the deck's
// anti-slip fields, cleats and filler caps; the rear number. Turret: the bustle rack with its three packs, the jerrycan
// pair and the tarp roll, the basket bin hung behind it; the roof ventilator, the stowed (empty) MG cradle and the
// crosswind mast; the crosses on the walls. The loader's MAG 58 is the turret's own (its loaderMG option).
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { mulberry32 } from '../factoryGeometry.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { laidCable, type Leopard2A4KitContext } from './leopard2A4Kit.ts';
import { HULL_SURFACES as HS, TURRET_SURFACES as TS, bustleRack, deckFrame, deckY } from './leopard2A4KitParts.ts';

/** The 2A4 turret's roof height at z (turret metres): flat over the fighting compartment, falling over the bustle. */
export function turretRoofAt(z: number): number {
  if (z >= -1.8062) return TS.roofY;
  if (z >= TS.bustleEndZ) return THREE.MathUtils.lerp(0.775, TS.roofY, (z - TS.bustleEndZ) / (-1.8062 - TS.bustleEndZ));
  return THREE.MathUtils.lerp(0.72, 0.775, (z - TS.rearZ) / (TS.bustleEndZ - TS.rearZ));
}

/** The crosswind sensor's mast and head (leopard2A4KitParts.ts's crosswindMast, stood on the roof's own height at z). */
function crosswindMast(P: TankBuilderPort, x: number, z: number, height = 0.16): void {
  const { box, cylY } = KIT;
  const y = turretRoofAt(z);
  P.addEquipment('turretDetail', cylY(0.018, 0.024, height, 8), x, y + height / 2, z);
  P.addEquipment('turretDark', box(0.14, 0.02, 0.02), x, y + height + 0.01, z);
  P.addEquipment('turretDark', box(0.02, 0.02, 0.14), x, y + height + 0.01, z);
}

/**
 * The stern frame's datums (hull metres). The hull's own rack (leopard2Hull.ts) stands back from the deck's lip with its
 * rails at y 1.72 and 1.82 on z -4.14 between uprights at x ±0.55; the frame's wings carry those rails out to corner
 * uprights at ±1.45 (the exhaust band's width), and one slatted floor runs under the rack's bay and both wings from a
 * ledger on the louvre band to the rails.
 */
export const LEO2A4V_STERN = Object.freeze({
  railZ: -4.14, lowY: 1.72, topY: 1.82, rackX: 0.565, cornerX: 1.45,
  floorFrontZ: -3.835, floorBackZ: -4.125, floorY: 1.730,
});

/**
 * A folded tarp laid on the deck, `rise` over it (w across, d along the hull): the folded stack, its upper fold set back,
 * the rolled fold edge.
 */
function foldedTarp(P: TankBuilderPort, x: number, z: number, w: number, d: number, h: number, rise: number): void {
  const { box, cylX, xform } = KIT;
  const f = deckFrame(x, z), y = f.point.y + rise;
  const lay = (g: THREE.BufferGeometry): void => P.addEquipment('hullCloth', g, x, y, z, f.rotation.x, 0, 0);
  lay(xform(box(w, h * 0.55, d), 0, h * 0.275, 0));
  lay(xform(box(w * 0.94, h * 0.5, d * 0.78), 0, h * 0.75, -d * 0.09));
  lay(xform(cylX(h * 0.48, w * 0.97, 8), 0, h * 0.5, d * 0.5 - h * 0.1));
}

/** The stern frame and its load (inventory B1 #1-#5). */
function sternFrame(P: TankBuilderPort, rng: () => number): void {
  const { box } = KIT;
  const S = LEO2A4V_STERN, zc = (S.floorFrontZ + S.floorBackZ) / 2, depth = S.floorFrontZ - S.floorBackZ;
  // the floor: a dark sheet under the whole frame (the rack's bay included) on a ledger bolted across the louvre band's
  // face, eight slats along it
  P.addEquipment('hullDetail', box(2.94, 0.04, 0.03), 0, 1.68, -3.839);
  P.addEquipment('hullDark', box(2.90, 0.012, depth), 0, 1.706, zc);
  for (let k = 0; k < 8; k++) P.addEquipment('hullDetail', box(0.035, 0.018, depth), -1.365 + k * 0.39, 1.721, zc);
  for (const sx of [-1, 1]) {
    const xw = sx * (S.rackX + S.cornerX) / 2, ww = S.cornerX - S.rackX;
    // the wings: the rack's low and top rails carried out to a corner upright
    P.addEquipment('hullDetail', box(ww, 0.03, 0.03), xw, S.lowY, S.railZ);
    P.addEquipment('hullDetail', box(ww, 0.03, 0.03), xw, S.topY, S.railZ);
    P.addEquipment('hullDetail', box(0.03, 0.15, 0.03), sx * S.cornerX, 1.76, S.railZ);
    // the wing's side rails: one under the floor's edge from the ledger to the low rail, one at the band's top bar
    P.addEquipment('hullDetail', box(0.03, 0.03, S.floorFrontZ - S.railZ), sx * S.cornerX, 1.70,
      (S.railZ + S.floorFrontZ) / 2);
    P.addEquipment('hullDetail', box(0.03, 0.03, 0.31), sx * S.cornerX, 1.78, (S.railZ - 3.83) / 2);
    // the hook strap under the corner, the leg from the floor's back down to the lower rear plate under the band
    P.addEquipment('hullDark', box(0.04, 0.16, 0.012), sx * S.cornerX, 1.605, S.railZ + 0.021);
    P.addEquipment('hullDetail', box(0.035, 0.035, 0.518), sx * 0.92, 1.4834, -3.958, 0.990, 0, 0);
    P.addEquipment('hullDark', box(0.07, 0.07, 0.012), sx * 0.92, 1.25, HS.rearZ - 0.006);
  }
  // the hanging straps under the low rail (the old build's, mirrored)
  for (const x of [0.80, -0.75]) P.addEquipment('hullDark', box(0.05, 0.22, 0.012), x, 1.595, S.floorBackZ + 0.006);

  // the load: the canvas pile in the left wing, the duffel in the right, the bedroll across the rack's bay
  {
    const [x, w, h, d] = [1.005, 0.80, 0.24, 0.25], yaw = (rng() - 0.5) * 0.06, y = S.floorY + h / 2;
    P.addEquipment('hullCloth', box(w, h, d), x, y, zc, 0, yaw, 0);
    P.addEquipment('hullCloth', box(w * 1.03, 0.035, d * 1.04), x, S.floorY + h - 0.005, zc, 0, yaw, 0);
    for (const s of [-0.28, 0.28]) {
      const lx = s * w, dx = Math.cos(yaw) * lx, dz = -Math.sin(yaw) * lx;
      P.addEquipment('hullDark', box(0.028, h + 0.03, d * 1.08), x + dx, y + 0.008, zc + dz, 0, yaw, 0);
    }
  }
  KIT.stowage(P, 'hullCloth', rng, [[-1.005, S.floorY + 0.125, zc, 0.80, 0.25, 0.25]]);
  KIT.tarpRoll(P, 'hullCloth', 0, S.floorY + 0.115, zc, 0.94, 0.115, true, P.q ? 12 : 8);
}

/** The rear plate's own kit: the jack, the two round guarded tail lights, the number (inventory #18, #25, #36). */
function rearPlateKit(P: TankBuilderPort): void {
  const { box, cylX, cylZ, torus, xform } = KIT;
  const z = HS.rearZ;
  // the hydraulic jack clamped low on the plate under the cables' crossing
  P.add('hullDark', cylX(0.045, 0.30, P.q ? 14 : 10), 0, 0.92, z - 0.052);
  P.add('hullDark', cylX(0.058, 0.035, P.q ? 14 : 10), 0.17, 0.92, z - 0.052);
  for (const dx of [-0.10, 0.10]) P.add('hullDetail', box(0.03, 0.11, 0.06), dx, 0.92, z - 0.03);
  // the guarded round tail lights inboard of the tow hooks: a dark backing disc, three rings, the lens, a foot on the hook
  for (const sx of [-1, 1]) {
    const x = sx * 0.84, y = 1.08, seg = P.q ? 20 : 14;
    P.add('hullDark', cylZ(0.13, 0.008, seg), x, y, z - 0.004);
    for (const [r, t] of [[0.118, 0.008], [0.080, 0.007], [0.045, 0.006]] as const) {
      P.add('hullDetail', xform(torus(r, t, seg), 0, 0, 0, Math.PI / 2, 0, 0), x, y, z - 0.011);
    }
    P.add('hullGlass', cylZ(0.03, 0.01, 12), x, y, z - 0.012);
    P.add('hullDark', box(0.05, 0.03, 0.02), x, 0.962, z - 0.012);
  }
  P.decal('hull', 'number', 'Y-508', 0.18, [0.55, 1.255, z - 0.006], Math.PI);
}

/** The glacis's anti-slip fields and X-straps, the spare cable, the clevises on the bow's tow eyes (#15, #27-#29). */
function glacisKit(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  const field = (x: number, z: number, w: number, d: number): void => {
    const f = deckFrame(x, z);
    P.add('hullRubber', box(w, 0.006, d), x, f.point.y + 0.003, z, f.rotation.x, 0, 0);
  };
  // behind the splash board: the loader's side and outboard of the driver's hatch; ahead of it on the nose: one a side
  // (each with an X-strap) and the centre
  field(0.49, 2.23, 0.58, 0.34);
  field(-1.12, 2.19, 0.34, 0.42);
  field(0, 3.24, 0.40, 0.32);
  for (const sx of [-1, 1]) {
    const cx = sx * 0.61, cz = 3.225, hw = 0.31, hd = 0.18;
    field(cx, cz, hw * 2, hd * 2);
    // the X: two straps from corner to corner, each laid as two segments meeting at the field's centre
    const len = Math.hypot(hw, hd) - 0.03, yaw = Math.atan2(hd, hw);
    for (const [ux, uz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const x = cx + ux * hw / 2, z = cz + uz * hd / 2, f = deckFrame(x, z);
      P.add('hullDetail', box(len, 0.006, 0.032), x, f.point.y + 0.009, z, f.rotation.x, ux * uz > 0 ? -yaw : yaw, 0);
    }
  }
  // the spare cable laid behind the splash board's left arm, clamped twice
  laidCable(P, [[0.14, 2.80], [0.42, 2.63], [0.72, 2.45]], 0.020, [[0.28, 2.715], [0.58, 2.535]]);
  // a clevis on each bow tow eye: its pin down through the eye, the ears over and under it, the bow forward
  for (const sx of [-1, 1]) {
    const x = sx * 0.70, y = 0.98, z = 3.495;
    P.add('hullDark', cylY(0.014, 0.014, 0.10, 8), x, y, z);
    for (const dy of [-0.032, 0.032]) P.add('hullDetail', box(0.07, 0.016, 0.08), x, y + dy, z + 0.022);
    const bow = new THREE.TorusGeometry(0.032, 0.012, 6, P.q ? 12 : 8, Math.PI);
    P.add('hullDetail', KIT.xform(bow, 0, 0, 0, 0, -Math.PI / 2, -Math.PI / 2), x, y, z + 0.06);
  }
}

/** The decks: folded tarps, the tow rope behind the fans, anti-slip fields, cleats, filler caps (#7, #17, #30-#32). */
function deckKit(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  // two folded tarps: one along the access plate between the fans, one on the access plate ahead of them
  // under the bustle (each plate 12 mm proud of the deck)
  foldedTarp(P, 0, -3.06, 0.24, 0.50, 0.030, 0.012);
  foldedTarp(P, 0.62, -2.04, 0.42, 0.22, 0.026, 0.012);
  // the tow rope looped round the fans' rear, its ends tucked forward between the fans and the radiator louvres
  const r = 0.024, at = (x: number, z: number): [number, number, number] => [x, deckY(z) + r * 0.9, z];
  KIT.towCable(P, [at(-1.10, -2.90), at(-1.10, -3.40), at(-0.70, -3.64), at(0, -3.68), at(0.70, -3.64), at(1.10, -3.40),
    at(1.10, -2.90)], r);
  // the fighting compartment's anti-slip fields outboard of the ring, two flat cleats behind them
  for (const [x, z0, z1] of [[-1.32, 0.30, 1.16], [1.32, -0.20, 0.96]] as const) {
    P.add('hullRubber', box(0.52, 0.006, z1 - z0), x, deckY((z0 + z1) / 2) + 0.003, (z0 + z1) / 2);
  }
  for (const [x, z] of [[-1.42, 0.20], [1.42, -0.32]] as const) {
    P.add('hullDetail', box(0.12, 0.014, 0.05), x, deckY(z) + 0.007, z);
    for (const dx of [-0.04, 0.04]) P.add('hullDark', cylY(0.009, 0.009, 0.006, 6), x + dx, deckY(z) + 0.017, z);
  }
  // the four filler caps on the decks either side behind the ring, each with its lever
  for (const sx of [-1, 1]) {
    for (const z of [-0.55, -1.10]) {
      P.add('hullDetail', cylY(0.09, 0.09, 0.016, P.q ? 16 : 10), sx * 1.24, deckY(z) + 0.008, z);
      P.add('hullDark', box(0.11, 0.012, 0.022), sx * 1.24, deckY(z) + 0.022, z);
    }
  }
}

/** The four spare-link strips (#14; the old build's four links and three, 10 cm wide): [z, links, seed] a side. */
export const LEO2A4V_SPARE_LINKS = Object.freeze([[-1.08, 4, 11], [-2.05, 3, 5]] as const);

/**
 * The four strips on the sponsons' outer walls under the turret's flanks, their backs on the wall above the skirts'
 * hanging rail, clear of the gun's lowest pass over the deck's edge (the 2A4M hangs them on its ERA tie rail instead).
 */
function sponsonLinks(P: TankBuilderPort): void {
  for (const sx of [-1, 1]) {
    for (const [z, links, seed] of LEO2A4V_SPARE_LINKS) {
      // a registered fitting (the spare-track census's route), its back on the wall
      const strip = FITTINGS.spareTrackLinks({ mats: P.mats, links, width: 0.10, pitch: 0.165, seed });
      strip.position.set(sx * (HS.sponsonX + 0.038), 1.51, z);
      strip.rotation.set(0, 0, -sx * Math.PI / 2);
      P.hullG.add(strip);
    }
  }
}

/** The bustle rack and its load, the basket bin behind it (#8-#13). */
function bustleKit(P: TankBuilderPort, rng: () => number): void {
  const { box } = KIT;
  const rack = bustleRack(P, { halfW: 1.10, depth: 0.46, low: 0.26, top: 0.72, rails: 2, bars: 10 });
  // the rack's front corners braced to the bustle's chamfered corners
  for (const sx of [-1, 1]) {
    const x1 = sx * (sx < 0 ? 0.949 : 0.99), x0 = sx * 1.10, z0 = TS.rearZ + 0.005, z1 = -2.46;
    const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0);
    for (const y of [0.32, 0.66]) {
      P.addEquipment('turretDetail', box(0.026, 0.026, len), (x0 + x1) / 2, y, (z0 + z1) / 2, 0, ry, 0);
    }
  }
  // the load (the old build's order, mirrored): the jerrycan pair at the left end, the packs, the tarp roll on top
  const zc = (TS.rearZ + rack.backZ) / 2, fy = rack.floorY;
  KIT.jerryCan(P, 'turretCloth', 0.86, fy + 0.24, zc, 0);
  KIT.stowage(P, 'turretCloth', rng, [
    [0.35, fy + 0.19, zc, 0.60, 0.38, 0.40],
    [-0.30, fy + 0.17, zc - 0.01, 0.56, 0.34, 0.38],
    [-0.83, fy + 0.16, zc, 0.42, 0.32, 0.36],
  ]);
  KIT.tarpRoll(P, 'turretCloth', -0.55, fy + 0.42, zc + 0.02, 0.90, 0.08, true, P.q ? 12 : 8);
  // the basket bin hung on the rack's back rails, its lid and the two straps over the top rail
  const bz = rack.backZ - 0.085;
  P.addEquipment('turretDetail', box(0.54, 0.20, 0.14), 0.16, 0.50, bz);
  P.addEquipment('turretDark', box(0.56, 0.015, 0.15), 0.16, 0.6075, bz);
  for (const x of [-0.04, 0.36]) P.addEquipment('turretDark', box(0.03, 0.14, 0.03), x, 0.665, rack.backZ - 0.012);
}

/** The roof's ventilator, the stowed MG cradle (empty since VH.14), the crosswind mast (#19, #22, #23). */
function roofKit(P: TankBuilderPort): void {
  const { box } = KIT;
  const roof = TS.roofY;
  // the ventilator box behind the loader's hatch: its body, the dark grille field and three slats on top
  P.addEquipment('turretDetail', box(0.46, 0.11, 0.17), 0.40, roof + 0.055, -1.30);
  P.addEquipment('turretDark', box(0.42, 0.006, 0.14), 0.40, roof + 0.113, -1.30);
  for (let k = 0; k < 3; k++) {
    P.addEquipment('turretDetail', box(0.42, 0.008, 0.026), 0.40, roof + 0.118, -1.352 + k * 0.052);
  }
  // the stowed MG cradle on the commander's side: a base plate, two open forks, the latch between them
  const cx = -0.35, cz = -1.45;
  P.addEquipment('turretDark', box(0.40, 0.02, 0.12), cx, roof + 0.01, cz);
  for (const dx of [-0.15, 0.15]) {
    for (const dz of [-0.025, 0.025]) {
      P.addEquipment('turretDark', box(0.014, 0.07, 0.016), cx + dx, roof + 0.055, cz + dz);
    }
    P.addEquipment('turretDetail', KIT.cylZ(0.008, 0.07, 6), cx + dx, roof + 0.075, cz);
  }
  P.addEquipment('turretDetail', box(0.05, 0.03, 0.09), cx, roof + 0.035, cz);
  crosswindMast(P, -0.85, -2.12);
}

/** The Leopard 2A4 V's kit, after the hull and the turret. */
export function addLeo2A4VKit(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  const rng = mulberry32(ctx.seed + 7);
  sternFrame(P, rng);
  rearPlateKit(P);
  glacisKit(P);
  deckKit(P);
  if (ctx.id !== 'leo2a4m') sponsonLinks(P);
  bustleKit(P, mulberry32(ctx.seed + 11));
  roofKit(P);
  // the crosses on the walls, under the grab rails and ahead of the smoke rows (the Kontakt-1 courses cover them on leo2a4_v)
  if (ctx.id !== 'leo2a4_v') for (const sx of [-1, 1]) {
    const x = (sx < 0 ? TS.wallRight : TS.wallLeft) + 0.002;
    P.decal('turret', 'crossgrey', null, 0.30, [sx * x, 0.265, 0.15], sx * Math.PI / 2);
  }
}
