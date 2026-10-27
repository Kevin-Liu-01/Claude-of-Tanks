// T-84BM Oplot-M (bm_oplot_m) and its Thai export twin, the T-84BM Oplot-T (bm_oplot_t): first-party procedural
// builds, release 262 (owner 2026-10-27: "make a new tier x t84bm oplot m and t84bm oplot t").
//
// Measured from a private comparison oracle (42manako's "Ukrainian T-84BM Oplot-M", CC-BY-NC-4.0, sha256
// 761c8698003c6729..., ~/cot-lanes/oplot-ref; nothing of it ships) and the owner's two reference images, against the
// published KMDB / Malyshev figures: hull 7.075 m, 9.72 m with the gun forward, 3.40 m over the tracks, six 670 mm
// road wheels and five return rollers a side on a 580 mm track, the turret roof at about 2.2 m. The print's hull is
// short against those figures, so its stations are read at one scale lengthwise (4.194: the published hull) and
// another for heights and widths (4.0: the published wheels, track and roof); docs/references/tanks/bm_oplot_m.md
// keeps the registration and the conflicts.
//
// Identity, from the sources: the KMDB all-welded turret with its armoured ammunition bustle; Duplet built-in ERA on
// the turret front and flanks, on the glacis and in the upper side skirts; the hinged rubber lower skirts; the 125 mm
// KBA-3 in a stepped thermal sleeve with its fume extractor; the commander's PNK-6 panoramic sight on its tower ahead
// of the cupola; the gunner's sight box; the remotely laid KT-12.7 over the commander's station; the Varta jammer
// heads at the turret's front corners; the 6TD-2 deck with its left-side exhaust; six rubber-tyred road wheels, five
// return rollers, rear drive. The Oplot-T adds, per the KMDB delivery notes and the Royal Thai Army tanks of
// 2014-2018, the air conditioner on the bustle and the auxiliary power unit on the left rear fender; it carries the
// longer rear stowage basket, a stern boarding ladder and its own skirt layout (Duplet on the three forward panels).
//
// Frames: hull metres with +Z forward and +X the tank's left. The turret frame sits on the ring at
// OPLOT_BM_FRAME.turret; the gun frame at OPLOT_BM_FRAME.gun inside it.

import * as THREE from 'three';
import { KIT, FITTINGS, MUDGUARDS, muzzleBore, orientedSlab } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { loftHull, tubeGun, ruSaddle, ruBoot } from './russia.ts';
import { eraCassette, glacisEraCassette } from './modernizationFittings.ts';
import { addFieldRoofWeapon } from './fieldRoofWeapon.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { mount as seat } from './fittingMount.ts';
import { fabricRollParts } from '../accessoryPrimitives.ts';
import { OPLOT_BM_FRAME, OPLOT_BM_ERA } from '../oplotBMLayout.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export type OplotBMVariant = 'm' | 't';

const { box, cylX, cylY, cylZ } = KIT;
const side = (s: number, x: number): number => s * x;

// ---------------------------------------------------------------------------------------------------------------
// Hull

const DECK_Y = 1.455;
const HULL_HALF_L = 3.5375;

function buildHull(P: TankBuilderPort): void {
  // T-80UD-lineage hull: a flat deck from the stern step to the glacis break, the long 68 degree upper glacis to the
  // nose, the lower plate under it and the belly at the published 0.44 m ground line.
  loftHull(P, {
    deck: [[-HULL_HALF_L, 1.34], [-3.46, 1.41], [-3.30, DECK_Y], [2.30, DECK_Y], [2.42, 1.445], [3.42, 1.03],
      [HULL_HALF_L, 0.96]],
    belly: [[-HULL_HALF_L, 1.10], [-3.42, 0.80], [-3.20, 0.52], [-2.95, 0.44], [2.95, 0.44], [3.22, 0.47],
      [HULL_HALF_L, 0.90]],
    wUp: [[-HULL_HALF_L, 1.24], [HULL_HALF_L, 1.24]],
    wLo: [[-HULL_HALF_L, 1.06], [HULL_HALF_L, 1.06]],
    sponsonY: [[-HULL_HALF_L, 1.13], [HULL_HALF_L, 1.13]],
  });

  // Fenders: a welded shelf over each track from the stern to the bow, the skirt hung from its outer edge.
  for (const s of [-1, 1]) {
    MUDGUARDS.add(P, {
      label: `oplot-bm-fender-${s}`, bucket: 'hull', material: 'painted-steel',
      geometry: box(0.58, 0.035, 6.55), x: side(s, 1.505), y: 1.425, z: -0.17, support: false,
    });
    // bow fender: the shelf steps down beside the glacis to the nose plate
    P.add('hull', orientedSlab(
      [side(s, 1.215), 1.39, 3.15], [side(s, 1.795), 1.39, 3.15], [side(s, 1.795), 1.06, 3.52], [side(s, 1.215), 1.06, 3.52],
      [side(s, 1.215), 1.425, 3.15], [side(s, 1.795), 1.425, 3.15], [side(s, 1.795), 1.095, 3.52], [side(s, 1.215), 1.095, 3.52]));
    P.add('hullDark', box(0.03, 0.03, 6.50), side(s, 1.79), 1.405, -0.17);
  }

  // Engine deck: the 6TD-2's two radiator grilles and the transverse rear grille between the fenders.
  for (const z of [-2.05, -2.85]) {
    P.add('hullDark', box(1.86, 0.02, 0.62), 0, DECK_Y + 0.002, z);
    for (let i = 0; i < 9; i++) P.add('hullDetail', box(1.78, 0.022, 0.03), 0, DECK_Y + 0.013, z - 0.27 + i * 0.0675);
    P.add('hull', box(1.92, 0.04, 0.05), 0, DECK_Y + 0.02, z + 0.34);
  }
  P.add('hullDark', box(2.05, 0.02, 0.20), 0, 1.43, -3.40, 0.32, 0, 0);
  // Left-side exhaust of the opposed-piston 6TD-2: a louvred outlet box on the left rear fender.
  P.add('hull', box(0.42, 0.20, 0.66), 1.42, DECK_Y + 0.07, -2.42);
  for (let i = 0; i < 5; i++) P.add('hullDark', box(0.012, 0.03, 0.56), 1.636, DECK_Y + 0.01 + i * 0.03, -2.42, 0, 0, -0.35);
  P.add('hullDark', box(0.36, 0.012, 0.58), 1.42, DECK_Y + 0.172, -2.42);

  // Driver's station on the centreline at the glacis break: hatch and three periscopes.
  P.addHatch('hull', cylY(0.235, 0.235, 0.045, 18), 0, DECK_Y + 0.012, 1.98);
  P.add('hullDark', cylY(0.20, 0.20, 0.02, 18), 0, DECK_Y + 0.036, 1.98);
  for (const x of [-0.17, 0, 0.17]) KIT.periscope(P, 'hullDetail', x, 1.47, 2.28);

  // Lower front plate: the self-entrenching blade folded against it.
  P.add('hull', orientedSlab(
    [-1.04, 0.50, 3.27], [1.04, 0.50, 3.27], [1.04, 0.50, 3.33], [-1.04, 0.50, 3.33],
    [-1.04, 0.86, 3.48], [1.04, 0.86, 3.48], [1.04, 0.86, 3.54], [-1.04, 0.86, 3.54]));
  for (const x of [-0.70, 0, 0.70]) P.add('hullDark', box(0.06, 0.30, 0.05), x, 0.69, 3.47, -0.40, 0, 0);
  for (const s of [-1, 1]) {
    // towing eyes and shackles on the nose
    P.add('hullDark', KIT.torus(0.07, 0.02, 12), side(s, 0.88), 0.92, 3.52, Math.PI / 2, 0, 0);
    // headlamp cluster in its guard on the fender corner
    P.addEquipment('hullDetail', box(0.20, 0.13, 0.12), side(s, 1.47), 1.17, 3.36);
    P.addEquipment('hullGlass', markVehicleNightLens(cylZ(0.05, 0.012, 16), 'headlight'), side(s, 1.42), 1.18, 3.425);
    P.addEquipment('hullGlass', markVehicleNightLens(cylZ(0.035, 0.012, 14), 'headlight'), side(s, 1.53), 1.18, 3.425);
    P.addEquipment('hullDark', box(0.24, 0.018, 0.16), side(s, 1.47), 1.245, 3.37);
  }
  // Duplet on the glacis: two courses of four modules a side, seated on the plate by a downward ray each.
  for (const z of [2.70, 3.10]) for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    glacisEraCassette(P, OPLOT_BM_ERA.glacis, side(s, 0.16 + i * 0.27), z, [0.25, 0.09, 0.36]);
  }
  // Tow cables along the glacis edges outboard of the Duplet field, eyes on the nose shackles.
  for (const s of [-1, 1]) {
    KIT.towCable(P, [[side(s, 0.90), 1.00, 3.48], [side(s, 1.17), 1.20, 3.02], [side(s, 1.18), 1.46, 2.40],
      [side(s, 1.06), 1.475, 1.70]]);
  }

  // Stern: transom grille, recovery eyes and the unditching log on its brackets.
  P.add('hullDark', box(1.70, 0.24, 0.03), 0, 1.02, -3.553);
  for (let i = 0; i < 7; i++) P.add('hullDetail', box(0.20, 0.10, 0.02), -0.78 + i * 0.26, 1.02, -3.565);
  for (const s of [-1, 1]) {
    P.add('hullDark', KIT.torus(0.075, 0.02, 12), side(s, 0.84), 0.66, -3.55, Math.PI / 2, 0, 0);
    P.add('hull', box(0.10, 0.20, 0.16), side(s, 0.95), 1.32, -3.58);
  }
  P.addEquipment('hullDetail', cylX(0.10, 2.10, 14), 0, 1.36, -3.69);
  for (const s of [-1, 1]) P.addEquipment('hullDark', box(0.05, 0.24, 0.05), side(s, 0.70), 1.36, -3.69);
}

/** Stowage bins and fuel tanks on the fenders, inboard of the skirt line. */
function buildFenderStowage(P: TankBuilderPort, variant: OplotBMVariant): void {
  const bins: readonly [number, number, number][] = [[-1.95, 0.70, 0.22], [-0.95, 0.80, 0.24], [0.05, 0.80, 0.24],
    [1.05, 0.70, 0.22]];
  for (const s of [-1, 1]) for (const [z, len, h] of bins) {
    if (variant === 't' && s > 0 && z < -1.5) continue; // the Oplot-T's APU stands there
    P.add('hull', box(0.46, h, len), side(s, 1.50), 1.442 + h / 2, z);
    P.add('hullDark', box(0.40, 0.014, len - 0.06), side(s, 1.50), 1.442 + h + 0.005, z);
    for (const dz of [-len * 0.32, len * 0.32]) P.add('hullDark', box(0.47, 0.02, 0.025), side(s, 1.50), 1.442 + h * 0.6, z + dz);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Running gear and skirts

const WHEEL_ZS = Object.freeze([2.52, 1.66, 0.73, -0.07, -1.03, -1.89]);
const ROLLER_ZS = Object.freeze([2.15, 1.24, 0.33, -0.53, -1.45]);

function buildRunningGear(P: TankBuilderPort): void {
  KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: 0.335, wheelW: 0.23, wheelY: 0.43, xc: 1.41, dishR: 0.84,
    wheelZs: [...WHEEL_ZS],
    sprocket: { z: -2.63, y: 0.77, r: 0.30 }, idler: { z: 3.29, y: 0.78, r: 0.26 },
    rollers: ROLLER_ZS.map((z) => ({ z, y: 0.965, r: 0.085 })),
    trackW: 0.58, topY: 1.07, botY: 0.06, paintedEnds: true, coveredTop: true, arms: false,
    contactZF: 2.55, contactZR: -1.92,
  });
}

/** The upper skirt: a canted armoured band from the fender edge, Duplet modules on it, rubber below. */
function buildSkirts(P: TankBuilderPort, variant: OplotBMVariant): void {
  const z0 = -3.30, z1 = 3.18, n = 10, step = (z1 - z0) / n;
  for (const s of [-1, 1]) {
    // canted steel band: 1.79 at the fender, 1.88 at its lower edge
    for (let i = 0; i < n; i++) {
      const a = z0 + i * step + 0.006, b = z0 + (i + 1) * step - 0.006;
      P.add('hull', orientedSlab(
        [side(s, 1.845), 0.98, a], [side(s, 1.875), 0.98, a], [side(s, 1.875), 0.98, b], [side(s, 1.845), 0.98, b],
        [side(s, 1.775), 1.425, a], [side(s, 1.805), 1.425, a], [side(s, 1.805), 1.425, b], [side(s, 1.775), 1.425, b]));
    }
    // hinged rubber skirt: a trapezoid run of panels from the band down to 0.30, raked up at both ends
    const rubberZ = [-3.10, -2.38, -1.66, -0.94, -0.22, 0.50, 1.22, 1.94, 2.66, 3.10];
    const bottomAt = (z: number): number => (z < -2.30 ? 0.30 + (-2.30 - z) * 0.75 : z > 2.62 ? 0.30 + (z - 2.62) * 0.95 : 0.30);
    for (let i = 0; i < rubberZ.length - 1; i++) {
      const a = rubberZ[i] + 0.01, b = rubberZ[i + 1] - 0.01;
      P.hangMudguard(`oplot-bm-skirt-${s}-${i}`, 'hullRubber', orientedSlab(
        [side(s, 1.858), bottomAt(a), a], [side(s, 1.876), bottomAt(a), a], [side(s, 1.876), bottomAt(b), b], [side(s, 1.858), bottomAt(b), b],
        [side(s, 1.858), 0.995, a], [side(s, 1.876), 0.995, a], [side(s, 1.876), 0.995, b], [side(s, 1.858), 0.995, b]), 0, 0, 0);
    }
    // front flap curling over the idler
    P.hangMudguard(`oplot-bm-bow-flap-${s}`, 'hullRubber', box(0.018, 0.40, 0.40), side(s, 1.62), 0.92, 3.50, 0.40, 0, 0);

    // Duplet modules on the band. The Oplot-M carries them full length; the Oplot-T on its three forward panels.
    const sector = s > 0 ? OPLOT_BM_ERA.skirtL : OPLOT_BM_ERA.skirtR;
    const count = variant === 't' ? 3 : 8;
    for (let i = 0; i < count; i++) {
      const z = 2.70 - i * 0.74;
      const tall = i < 3;
      const h = tall ? 0.40 : 0.30;
      eraCassette(P, 'hull', sector, [side(s, 1.873), 1.215 - (0.40 - h) / 2, z], [0.06, h, 0.66], [0, 0, side(s, 0.19)]);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Turret

const ROOF_Y = 0.70;

function planPrism(plan: readonly (readonly [number, number])[], y0: number, y1: number, inset = 1): THREE.BufferGeometry {
  return KIT.xform(KIT.polyTurret(plan.map(([x, z]) => [x, z] as [number, number]), y1 - y0, 1, inset, true), 0, y0, 0);
}

function buildTurretShell(P: TankBuilderPort): void {
  P.turretG.position.set(...OPLOT_BM_FRAME.turret);
  // Welded body: flat roof, walls leaning in 6 degrees, the front narrowing behind the cheek blocks.
  const wall = (w: number, top: number): [number, number][] => [[-w, -0.01], [w, -0.01], [w, 0.36], [w - 0.07, top],
    [-w + 0.07, top], [-w, 0.36]];
  P.add('turret', sectionSolid([
    { z: -1.32, ring: wall(1.36, ROOF_Y) },
    { z: -0.70, ring: wall(1.52, ROOF_Y) },
    { z: 0.10, ring: wall(1.58, ROOF_Y) },
    { z: 0.80, ring: wall(1.58, ROOF_Y) },
    { z: 1.22, ring: wall(1.10, 0.64) },
  ]));
  // Ammunition bustle, its own armoured box behind the shell, blow-off roof panels.
  P.add('turret', sectionSolid([
    { z: -2.26, ring: [[-1.02, 0.08], [1.02, 0.08], [1.02, 0.60], [-1.02, 0.60]] },
    { z: -1.30, ring: [[-1.20, 0.04], [1.20, 0.04], [1.20, 0.66], [-1.20, 0.66]] },
  ]));
  for (const x of [-0.50, 0.50]) {
    P.add('turretDark', box(0.86, 0.012, 0.74), x, 0.666, -1.78);
    P.add('turretDetail', box(0.78, 0.012, 0.66), x, 0.674, -1.78);
  }
  // Turret ring collar and the basket below the roof line.
  P.add('turret', cylY(1.02, 1.06, 0.06, 32), 0, 0.0, 0);
  P.add('turretDark', cylY(0.92, 0.92, 0.60, 20), 0, -0.32, 0);

  // Cheek blocks: Duplet built-in ERA in welded boxes either side of the gun slot. The flat front face runs out to
  // |x| 1.10, then a 45 degree chamfer meets the flank at 1.64 (the oracle's arrowhead, world z 1.07 to 1.85).
  const chamferN: [number, number] = [0.815, 0.58];
  const chamferYaw = Math.atan2(chamferN[1], chamferN[0]);
  for (const s of [-1, 1]) {
    const plan: [number, number][] = [[0.37, 1.08], [1.58, 0.82], [1.64, 0.98], [1.10, 1.74], [0.37, 1.76]];
    P.add('turret', planPrism(s > 0 ? plan : plan.map(([x, z]) => [-x, z] as [number, number]).reverse(), 0.05, 0.62, 0.985));
    const sector = s > 0 ? OPLOT_BM_ERA.turretL : OPLOT_BM_ERA.turretR;
    for (const [y, h] of [[0.20, 0.25], [0.47, 0.25]] as const) {
      // front face: two lids a row, plates facing forward
      for (const [x, w] of [[0.56, 0.33], [0.91, 0.31]] as const) {
        eraCassette(P, 'turret', sector, [side(s, x), y, 1.785 - (x - 0.37) * 0.027], [w, 0.05, h], [Math.PI / 2, 0, 0]);
      }
      // chamfer: one long lid a row, its plate normal on the chamfer's
      eraCassette(P, 'turret', sector, [side(s, 1.39), y, 1.375], [0.05, h, 0.74], [0, side(s, -chamferYaw), 0]);
    }
    // top lid of the block with its bolted service plates
    P.add('turretDark', box(0.95, 0.012, 0.52), side(s, 0.92), 0.622, 1.30, 0, side(s, -0.12), 0);
    for (const dz of [1.22, 1.50]) P.add('turretDetail', box(0.30, 0.012, 0.18), side(s, 0.70), 0.632, dz);
  }
  // Flank ERA: two courses of Duplet modules along each side of the shell, the upper set in with the leaning wall.
  const wallAt = (z: number): number => (z > 0.10 ? 1.58 : z > -0.70 ? 1.52 + (z + 0.70) * 0.075 : 1.52);
  for (const s of [-1, 1]) {
    const sector = s > 0 ? OPLOT_BM_ERA.flankL : OPLOT_BM_ERA.flankR;
    for (const [y, h, lean] of [[0.20, 0.30, 0], [0.49, 0.24, 0.025]] as const) {
      for (const z of [0.58, 0.10, -0.38]) {
        eraCassette(P, 'turret', sector, [side(s, wallAt(z) - lean + 0.028), y, z], [0.06, h, 0.46], [0, 0, side(s, lean ? 0.20 : 0)]);
      }
    }
  }
}

function buildMantlet(P: TankBuilderPort): void {
  // fixed throat frame between the cheek blocks
  P.add('turret', box(0.74, 0.08, 0.52), 0, 0.58, 1.40);
  P.add('turret', box(0.74, 0.06, 0.52), 0, 0.06, 1.40);
  // the gun shield: a faceted cast block that pitches with the gun
  P.add('gunMount', sectionSolid([
    { z: -0.18, ring: [[-0.34, -0.21], [0.34, -0.21], [0.34, 0.22], [-0.34, 0.22]] },
    { z: 0.20, ring: [[-0.33, -0.20], [0.33, -0.20], [0.33, 0.21], [-0.33, 0.21]] },
    { z: 0.36, ring: [[-0.22, -0.15], [0.22, -0.15], [0.22, 0.16], [-0.22, 0.16]] },
  ]));
  P.add('gunMount', cylZ(0.17, 0.10, 24), 0, 0, 0.40);
}

function buildRoof(P: TankBuilderPort): void {
  // Commander (right) and gunner (left) hatches; the commander's ring carries its vision blocks.
  P.addCupola('turret', cylY(0.30, 0.32, 0.10, 24), -0.62, ROOF_Y + 0.045, -0.42);
  P.addHatch('turret', cylY(0.26, 0.26, 0.04, 20), -0.62, ROOF_Y + 0.115, -0.42);
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45;
    P.add('turretGlass', box(0.08, 0.04, 0.02), -0.62 + Math.sin(a) * 0.29, ROOF_Y + 0.075, -0.42 + Math.cos(a) * 0.29, 0, a, 0);
  }
  P.addHatch('turret', cylY(0.24, 0.25, 0.05, 20), 0.60, ROOF_Y + 0.025, -0.48);
  KIT.periscope(P, 'turretDetail', 0.60, ROOF_Y + 0.02, -0.16);

  // PNK-6 panoramic sight: plinth, tower and the twin-window head facing forward, ahead of the cupola.
  P.add('turret', box(0.46, 0.06, 0.46), -0.64, ROOF_Y + 0.03, 0.20);
  P.addModuleVisual('optics', 'turretDetail', orientedSlab(
    [-0.84, ROOF_Y + 0.06, 0.02], [-0.44, ROOF_Y + 0.06, 0.02], [-0.44, ROOF_Y + 0.06, 0.40], [-0.84, ROOF_Y + 0.06, 0.40],
    [-0.82, ROOF_Y + 0.56, 0.06], [-0.46, ROOF_Y + 0.56, 0.06], [-0.46, ROOF_Y + 0.56, 0.38], [-0.82, ROOF_Y + 0.56, 0.38]), 0, 0, 0);
  P.add('turretDetail', box(0.40, 0.20, 0.36), -0.64, ROOF_Y + 0.66, 0.22);
  P.add('turretDark', box(0.42, 0.025, 0.38), -0.64, ROOF_Y + 0.772, 0.22);
  for (const dx of [-0.085, 0.085]) {
    P.addModuleVisual('optics', 'turretGlass', box(0.12, 0.13, 0.012), -0.64 + dx, ROOF_Y + 0.66, 0.405);
  }
  P.add('turretDark', box(0.40, 0.03, 0.06), -0.64, ROOF_Y + 0.75, 0.42);

  // Gunner's sight box on the left front of the roof, window forward.
  P.add('turret', box(0.38, 0.22, 0.36), 0.56, ROOF_Y + 0.09, 0.78);
  P.add('turretDark', box(0.42, 0.03, 0.40), 0.56, ROOF_Y + 0.215, 0.78);
  P.addModuleVisual('optics', 'turretGlass', box(0.22, 0.10, 0.012), 0.56, ROOF_Y + 0.11, 0.966);
  P.add('turretDark', box(0.28, 0.025, 0.08), 0.56, ROOF_Y + 0.18, 0.99);
  // IR illuminator on its post beside it
  P.addEquipment('turretDetail', cylY(0.03, 0.03, 0.14, 10), 0.98, ROOF_Y + 0.07, 0.70);
  P.addEquipment('turretDetail', cylZ(0.10, 0.16, 18), 0.98, ROOF_Y + 0.20, 0.72);
  P.addEquipment('turretGlass', markVehicleNightLens(cylZ(0.085, 0.012, 18), 'headlight'), 0.98, ROOF_Y + 0.20, 0.805);

  // Varta: jammer heads on the front corners of the cheek blocks, laser-warning heads on the roof corners.
  for (const s of [-1, 1]) {
    P.addEquipment('turretDetail', box(0.24, 0.22, 0.20), side(s, 1.20), 0.75, 1.48, 0, side(s, -0.45), 0);
    P.addEquipment('turretDark', cylZ(0.085, 0.05, 18), side(s, 1.26), 0.75, 1.58, 0, side(s, -0.45), 0);
    P.addEquipment('turretGlass', markVehicleNightLens(cylZ(0.07, 0.01, 18), 'shtora'), side(s, 1.28), 0.75, 1.61, 0, side(s, -0.45), 0);
    P.addEquipment('turretDetail', cylY(0.05, 0.06, 0.07, 12), side(s, 1.18), ROOF_Y + 0.03, -1.10);
    P.addEquipment('turretDark', cylY(0.035, 0.035, 0.03, 12), side(s, 1.18), ROOF_Y + 0.08, -1.10);
  }
  // Aerosol launchers on the rear flanks, six tubes a side.
  for (const s of [-1, 1]) {
    seat(P, 'turret', FITTINGS.smokeBank({ mats: P.mats, count: 6, r: 0.040, len: 0.26, splay: s * 0.85, pitch: -0.45,
      arc: 0.50, spacing: 0.088, slot: 'detail', rotation: [0, s * 0.25, -s * 0.10], seed: 26200 + (s > 0 ? 1 : 0) }),
      side(s, 1.36), 0.42, -1.02);
  }
  // Lifting eyes, roof fittings and the two whip antennas at the bustle corners.
  for (const [ex, ez] of [[-1.05, 0.55], [1.05, 0.40], [0.0, -1.10]] as const) {
    P.add('turretFittingPaint', box(0.11, 0.022, 0.07), ex, ROOF_Y + 0.008, ez);
    P.add('turretFittingPaint', new THREE.TorusGeometry(0.042, 0.012, 8, 12, Math.PI), ex, ROOF_Y + 0.016, ez);
  }
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.07, 0.08, 0.07), side(s, 0.92), 0.64, -2.12);
    seat(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: 0.22, r: 0.012, rake: -s * 0.85, seed: 26210 + (s > 0 ? 1 : 0) }),
      side(s, 0.92), 0.68, -2.12);
  }
}

function buildBustleStowage(P: TankBuilderPort, variant: OplotBMVariant): void {
  // Right flank: the long stowage bin from the shell to the bustle corner.
  P.add('turret', box(0.36, 0.40, 1.10), -1.30, 0.30, -1.62);
  P.add('turretDark', box(0.30, 0.012, 1.04), -1.30, 0.506, -1.62);
  for (const dz of [-0.40, 0.0, 0.40]) P.add('turretDark', box(0.37, 0.02, 0.025), -1.30, 0.40, -1.62 + dz);
  // Left rear: the open stowage rail basket.
  const bx0 = 0.10, bx1 = 1.32, bz0 = -2.62, bz1 = -1.40, by = 0.70;
  for (const [x, z] of [[bx0, bz0], [bx1, bz0], [bx1, bz1]] as const) P.addEquipment('turretDetail', box(0.03, 0.26, 0.03), x, by - 0.12, z);
  P.addEquipment('turretDetail', box(bx1 - bx0, 0.03, 0.03), (bx0 + bx1) / 2, by, bz0);
  P.addEquipment('turretDetail', box(0.03, 0.03, bz1 - bz0), bx1, by, (bz0 + bz1) / 2);
  P.addEquipment('turretDetail', box(bx1 - bx0, 0.025, bz1 - bz0), (bx0 + bx1) / 2, 0.47, (bz0 + bz1) / 2);
  if (variant === 'm') {
    if (P.q === false) P.add('turretCloth', cylX(0.11, 1.05, 12), 0.71, 0.60, -2.30);
    else {
      const roll = fabricRollParts(1.05, 0.11, [-0.36, 0.36], 18, 26220);
      P.add('turretCloth', roll.body, 0.71, 0.60, -2.30);
      for (const end of roll.ends) P.add('turretDark', end, 0.71, 0.60, -2.30);
    }
    P.addEquipment('turretCloth', box(0.42, 0.20, 0.40), 0.55, 0.585, -1.82);
  } else {
    // Oplot-T: the air conditioner on the bustle's rear face, louvred, with its condensate line
    P.add('turret', box(0.78, 0.40, 0.30), -0.42, 0.34, -2.41);
    for (let i = 0; i < 6; i++) P.add('turretDark', box(0.66, 0.022, 0.012), -0.42, 0.20 + i * 0.05, -2.563);
    P.add('turretDetail', cylZ(0.11, 0.025, 18), -0.42, 0.34, -2.565);
    P.add('turretDark', box(0.82, 0.02, 0.32), -0.42, 0.55, -2.41);
    P.addEquipment('turretCloth', box(0.48, 0.22, 0.44), 0.55, 0.595, -1.90);
    P.addEquipment('turretCloth', box(0.40, 0.18, 0.36), 0.95, 0.575, -2.30);
  }
}

function buildRemoteWeapon(P: TankBuilderPort): void {
  // KT-12.7 laid from the PNK-6 (the commander's sight controls the remote AA gun, KMDB): over the commander's ring.
  addFieldRoofWeapon(P, [-1.00, ROOF_Y, -0.70], 12.7, 'KT-12.7 remote anti-aircraft gun', 0.0, 0.92);
}

// ---------------------------------------------------------------------------------------------------------------
// Gun

function buildGun(P: TankBuilderPort): void {
  P.gunG.position.set(...OPLOT_BM_FRAME.gun);
  ruSaddle(P, { rollR: 0.18, rollW: 0.36, tubeR: 0.10, rootR: 0.20, rootL: 0.50 });
  ruBoot(P, { pts: [
    [0.36, 0.30, 0.30, 0.0],
    [0.52, 0.26, 0.26, 0.0],
    [0.66, 0.24, 0.24, 0.0],
  ] });
  // KBA-3: four thermal-sleeve sections with clamp bands, the fume extractor at mid-length, the muzzle
  // reference collar.
  tubeGun(P, [
    [0.66, 1.62, 0.112],
    [1.62, 2.30, 0.110],
    [2.30, 2.86, 0.142, 0.138],
    [2.86, 3.80, 0.104],
    [3.80, 4.56, 0.099],
    [4.56, OPLOT_BM_FRAME.barrelM, 0.088],
  ], {
    rings: [[1.10, 0.115], [1.62, 0.116], [2.30, 0.146], [2.86, 0.142], [3.30, 0.107], [3.80, 0.107], [4.56, 0.102]],
    muzzle: OPLOT_BM_FRAME.barrelM,
  });
  P.add('gunDark', cylZ(0.094, 0.05, 18), 0, 0, OPLOT_BM_FRAME.barrelM - 0.03);
  muzzleBore(P, { r: OPLOT_BM_FRAME.boreR });
  // coaxial KT-7.62 port right of the gun in the shield
  P.add('gunMount', cylZ(0.035, 0.08, 12), -0.25, -0.06, 0.39);
  P.add('gunDark', cylZ(0.016, 0.04, 8), -0.25, -0.06, 0.45);
}

/** Thai export fittings on the hull: APU on the left rear fender, boarding ladder on the stern. */
function buildThaiHullFittings(P: TankBuilderPort): void {
  P.add('hull', box(0.46, 0.34, 0.70), 1.50, 1.442 + 0.17, -2.00);
  for (let i = 0; i < 5; i++) P.add('hullDark', box(0.012, 0.20, 0.08), 1.735, 1.61, -2.24 + i * 0.12);
  P.add('hullDark', cylY(0.035, 0.035, 0.16, 10), 1.62, 1.86, -2.25);
  P.add('hullDark', box(0.48, 0.02, 0.72), 1.50, 1.79, -2.00);
  // stern ladder: two stiles and four rungs on the right of the log
  for (const x of [-1.08, -0.84]) P.addEquipment('hullDetail', box(0.03, 0.62, 0.03), x, 1.02, -3.585);
  for (let i = 0; i < 4; i++) P.addEquipment('hullDetail', box(0.27, 0.025, 0.03), -0.96, 0.78 + i * 0.15, -3.59);
}

export function buildOplotBM(P: TankBuilderPort, variant: OplotBMVariant): void {
  buildHull(P);
  buildFenderStowage(P, variant);
  buildRunningGear(P);
  buildSkirts(P, variant);
  if (variant === 't') buildThaiHullFittings(P);
  buildTurretShell(P);
  buildMantlet(P);
  buildRoof(P);
  buildBustleStowage(P, variant);
  buildRemoteWeapon(P);
  buildGun(P);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [1.53, 0.30, -0.95], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [-1.53, 0.30, -0.95], -Math.PI / 2);
  P.topY = DECK_Y;
}
