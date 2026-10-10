// src/vehicles/ghillieFleetSuits.ts — the field nets and garnish the owner ordered on 2026-10-09 (23:15): "add our new
// ghillie and netting on the cv90, cv9040c, merkava mk 4b, merkava mk 3c, and add a ton more netting and camo leaves
// all over" twenty-one more hulls (the netting lane; the Ukrainian concept hulls keep their own field configs in
// profiles/nationalUkraineProtection.ts).
//
// Every entry is fitted to its vehicle (the shared builder is ghillieSuit.ts; these are its registry rows, in each
// vehicle's own owner-local metres, measured on the assembled build): the roof and deck nets are laid over the armour
// (yFromArmour) and end at its edges (clipToArmour), opened round every lens, hatch lid and cupola (autoOpeningsM) and
// round each authored sight head, sensor, vent and roof box (holes); roof weapons are opened by the builder; the flank
// drapes hang from the roof net's edge over the walls and skirts, cut round smoke dischargers, lights and sights, their
// hems above the running gear. Nothing is laid over a gun's depression arc, the turret ring's sweep (decks under the
// turret carry a low band only), a hatch, an exhaust or the drawn track run.
import type { GhillieConfig } from './ghillieSuit.ts';

type Panels = NonNullable<GhillieConfig['hull']>;
type TopPanel = NonNullable<Panels['top']>[number];
type SidePanel = NonNullable<Panels['side']>[number];
type FacePanel = NonNullable<Panels['face']>[number];
type Point2 = readonly [number, number];

const rect = (x0: number, x1: number, z0: number, z1: number): Point2[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
/** A rectangle mirrored to both flanks (x0 < x1 on the right; the left copy is negated). */
const pair = (x0: number, x1: number, z0: number, z1: number): Point2[][] => [rect(x0, x1, z0, z1), rect(-x1, -x0, z0, z1)];

/**
 * The woodland issue tones the bough tints are pulled toward (the theatre's palette carries the strips), and one
 * painted net texture for the whole set (the Abrams UA's, ghillieSuit.ts ua_m1a1): a texture pair per hull would cost
 * a paint and its memory each, and every panel is offset in it anyway.
 */
const WOODLAND = { light: 0x6f7e4b, dark: 0x33462d, netColor: 'rgba(40,54,32,0.82)', netTextureSeed: 1101 } as const;

/**
 * A roof or deck net laid over its owner's armour, ending at the armour's edges and opened round its lids; its rolls at
 * those openings half the hanging nets' (between two openings close together the rolls meet, and the cloth there must
 * still lie on the plate).
 */
function laid(panel: Omit<TopPanel, 'yAt'> & { y?: number }): TopPanel {
  const { y = 0.5, ...rest } = panel;
  return { yAt: () => y, yFromArmour: true, clipToArmour: true, autoOpeningsM: 0.07, rimScale: 0.5, ...rest };
}

/**
 * A flank drape on both sides between z0 and z1, from `top` down `drop` (ragged and billowing by the builder), hanging
 * just outside `out` (the probe finds the wall; `out` is the line it is sought from and the fallback).
 */
function flanks(z0: number, z1: number, top: number, drop: number, out: number, seed: number,
  extra: Partial<Omit<SidePanel, 'side'>> = {}, cutsFor?: (side: number) => SidePanel['cuts']): SidePanel[] {
  return [-1, 1].map((side) => ({
    side, z0, z1,
    topAt: () => top,
    bottomAt: (z: number) => top - drop + 0.035 * Math.sin(z * 3.3 + side) + 0.02 * Math.sin(z * 7.9 + seed),
    outAt: (_z: number, t: number) => out + (1 - t) * 0.03,
    seed: seed + side,
    ...(cutsFor ? { cuts: cutsFor(side) } : {}),
    ...extra,
  }));
}

function face(panel: FacePanel): FacePanel { return panel; }

/** Group B (the owner: "a ton more netting and camo leaves all over"): denser garnish, more of it cut boughs. */
const DENSE = { density: 1.8, leafScale: 0.94, boughShare: 0.42 } as const;

/** Four drapes a side between z0 and z1 with short bare gaps (a heavily netted hull's skirts). */
function skirts(z0: number, z1: number, top: number, drop: number, out: number, seed: number,
  cutsFor?: (side: number) => SidePanel['cuts']): SidePanel[] {
  const gap = 0.2, span = (z1 - z0 - gap * 3) / 4;
  return [0, 1, 2, 3].flatMap((k) => flanks(z0 + k * (span + gap), z0 + k * (span + gap) + span, top,
    drop + (k % 2 ? -0.04 : 0.03), out, seed + 6 * k, {}, cutsFor));
}

/** A box [z0, z1, yLo, yHi] a flank drape is cut away over. */
const cut = (z0: number, z1: number, lo: number, hi: number): readonly [number, number, number, number] => [z0, z1, lo, hi];

export const FLEET_GHILLIE_SUITS: Readonly<Record<string, GhillieConfig>> = Object.freeze({
  // ---- Group A: the new ghillie and netting --------------------------------------------------------------------
  // CV90 (CV9040 IFV): the turret roof and bustle under one net, opened round the commander's panorama and its ring,
  // the gunner's sight head, the cheek sensors, the whip bases and the RWS (the builder); flank drapes behind the smoke
  // banks; a rear drape over the bustle rack. The troop roof behind the turret's sweep netted round its two roof boxes,
  // the front shoulders beside the driver netted outboard of the gun's arc, the skirts hung in three drapes a side.
  cv90: {
    id: 'cv90', seed: 9040, style: 'leafy', density: 0.95, leafScale: 0.92, foliageKind: 'spruce', ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 1.92, hemFloorM: 0.85,

    turret: {
      top: [laid({
        x0: -1.16, x1: 1.16, z0: -1.72, z1: 1.18, nx: 29, nz: 36, y: 0.62,
        outline: [[-1.16, -1.72], [1.16, -1.72], [1.16, 1.18], [0.42, 1.18], [0.42, 0.90], [-0.42, 0.90], [-0.42, 1.18], [-1.16, 1.18]],
        holes: [rect(-0.72, -0.12, -0.76, -0.16), rect(0.20, 0.68, 0.24, 0.74), ...pair(0.60, 0.94, 0.10, 0.42),
          ...pair(0.64, 0.86, -1.18, -0.98)],
        garnishRiseM: 0.12, seed: 11,
      })],
      side: flanks(-1.56, -0.26, 0.60, 0.40, 1.06, 17),
      face: [face({ z: -1.70, x0: -0.92, x1: 0.92, y0: 0.24, y1: 0.60, nx: 18, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.36, x1: 1.36, z0: -3.30, z1: -2.24, nx: 27, nz: 12, y: 1.62,
          holes: pair(0.56, 1.10, -2.90, -2.38), garnishRiseM: 0.14, seed: 31 }),
        ...[-1, 1].map((side) => laid({
          x0: side < 0 ? -1.62 : 0.98, x1: side < 0 ? -0.98 : 1.62, z0: 1.36, z1: 2.08, nx: 8, nz: 9, y: 1.66,
          garnishRiseM: 0.06, garnishDensity: 0.8, seed: 37 + side,
        })),
      ],
      side: [
        ...flanks(-3.10, -1.78, 1.55, 0.44, 1.74, 41),
        ...flanks(-1.46, 0.02, 1.55, 0.40, 1.74, 47),
        ...flanks(0.36, 1.62, 1.55, 0.46, 1.74, 53),
      ],
    },
  },
  // CV9040C: the turret roof netted round the commander's hatch, the cupola and its periscope ring, both sight boxes and
  // the whip bases; flank drapes over the turret's side bins, behind the front smoke banks; a rear drape. The troop roof
  // netted behind the turret round its four hatches (the builder opens them); the skirts hung in three drapes a side,
  // the right flank's exhaust outlet (z -0.5 to 0.6) left bare.
  cv90_x: {
    id: 'cv90_x', seed: 9041, style: 'leafy', density: 0.95, leafScale: 0.92, foliageKind: 'spruce', ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 1.9, hemFloorM: 0.65,
    turret: {
      top: [laid({
        x0: -1.24, x1: 1.24, z0: -1.44, z1: 1.20, nx: 31, nz: 33, y: 0.78,
        holes: [rect(-0.72, -0.18, 0.50, 1.02), rect(0.20, 0.72, 0.20, 0.72), ...pair(0.48, 0.74, -1.18, -0.92)],
        garnishRiseM: 0.12, seed: 11,
      })],
      side: flanks(-1.30, 0.06, 0.82, 0.38, 1.22, 17),
      face: [face({ z: -1.42, x0: -0.92, x1: 0.92, y0: 0.38, y1: 0.75, nx: 18, ny: 6, seed: 23 })],
    },
    hull: {
      top: [laid({ x0: -1.58, x1: 1.58, z0: -3.30, z1: -0.76, nx: 32, nz: 26, y: 1.94, garnishRiseM: 0.10, seed: 31 })],
      side: [
        ...flanks(-3.10, -1.34, 1.99, 0.62, 1.71, 41),
        ...flanks(-1.00, 0.80, 1.99, 0.60, 1.71, 47, {}, (side) => (side > 0 ? [cut(-0.62, 0.72, 1.32, 1.68)] : [])),
        ...flanks(1.18, 2.70, 1.84, 0.56, 1.71, 53),
      ],
    },
  },
  // Merkava Mk 4B: the roof behind the wedge mantlet and over the cheeks netted round the commander's cupola, the
  // loader's ring, the mortar and every sight head; the bustle basket's load under its own net; drapes down the flared
  // turret walls (behind the cheek smoke dischargers) and down the basket's sides, and over its rear. The hull's rear
  // deck under the basket netted low, the skirts hung in three drapes a side; the front engine deck and its grille bare.
  merkava4b: {
    id: 'merkava4b', seed: 4041, style: 'leafy', density: 0.95, leafScale: 0.92, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.08, hemFloorM: 0.85,
    turret: {
      top: [
        laid({
          x0: -1.94, x1: 1.92, z0: -1.66, z1: 2.15, nx: 48, nz: 48, y: 0.75,
          holes: [rect(0.23, 0.67, 0.80, 1.24), rect(-1.08, -0.16, -0.73, 0.19), rect(0.30, 1.10, -1.40, -0.60),
            rect(0.39, 0.89, -0.40, 0.06), rect(0.47, 0.93, 0.11, 0.59), rect(-0.95, -0.55, -1.36, -0.94), rect(-0.25, 0.25, -1.40, -1.00)],
          garnishRiseM: 0.12, seed: 11,
        }),
        laid({ x0: -1.36, x1: 1.36, z0: -3.40, z1: -1.62, nx: 28, nz: 22, y: 0.55, garnishRiseM: 0.14, seed: 13 }),
      ],
      side: [
        ...flanks(-1.55, 0.42, 0.84, 0.40, 1.92, 17),
        ...flanks(-3.30, -1.72, 0.62, 0.32, 1.34, 19),
      ],
      face: [face({ z: -3.42, x0: -1.24, x1: 1.24, y0: 0.24, y1: 0.58, nx: 25, ny: 6, seed: 23 })],
    },
    hull: {
      top: [laid({ x0: -1.75, x1: 1.75, z0: -4.10, z1: -0.55, nx: 35, nz: 36, y: 1.76, garnishRiseM: 0.10, seed: 31 })],
      side: [
        ...flanks(-3.25, -1.90, 1.82, 0.56, 1.88, 41),
        ...flanks(-1.52, 0.56, 1.82, 0.52, 1.88, 47),
        ...flanks(0.94, 2.42, 1.82, 0.56, 1.88, 53),
      ],
    },
  },
  // Merkava Mk 3C: the cluttered roof behind the mantlet under one net, opened round the three roof guns (the builder),
  // the commander's cupola, the loader's ring, the central mortar and every sight head; the bustle basket's load netted;
  // drapes down the turret walls behind the low and high smoke banks, down the basket's sides and over its rear. The
  // hull's rear deck under the basket netted low; drapes from the deck edge over the skirts, three a side.
  merkava3c: {
    id: 'merkava3c', seed: 3031, style: 'leafy', density: 0.95, leafScale: 0.92, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.03, hemFloorM: 0.85,
    turret: {
      top: [
        laid({
          x0: -1.51, x1: 1.51, z0: -1.80, z1: 2.06, nx: 38, nz: 48, y: 0.81,
          holes: [rect(0.71, 1.52, -0.80, 0.08), rect(-1.20, -0.41, -1.36, -0.54), rect(-0.20, 0.30, -0.15, 0.32),
            rect(-1.01, -0.55, 0.54, 1.02), rect(-1.30, -0.98, 0.70, 1.10)],
          garnishRiseM: 0.12, seed: 11,
        }),
        laid({ x0: -1.12, x1: 1.12, z0: -3.10, z1: -1.76, nx: 23, nz: 17, y: 0.62, garnishRiseM: 0.14, seed: 13 }),
      ],
      side: [
        ...flanks(-1.70, 0.02, 0.86, 0.40, 1.48, 17),
        ...flanks(-3.00, -1.84, 0.70, 0.30, 1.15, 19),
      ],
      face: [face({ z: -3.12, x0: -1.00, x1: 1.00, y0: 0.32, y1: 0.66, nx: 20, ny: 6, seed: 23 })],
    },
    hull: {
      top: [laid({ x0: -1.72, x1: 1.72, z0: -4.45, z1: -1.10, nx: 34, nz: 34, y: 1.68, garnishRiseM: 0.10, seed: 31 })],
      side: [
        ...flanks(-4.30, -2.26, 1.72, 0.56, 1.85, 41),
        ...flanks(-1.90, 0.16, 1.72, 0.52, 1.85, 47),
        ...flanks(0.52, 2.50, 1.72, 0.56, 1.85, 53),
      ],
    },
  },
  // ---- Group B: a ton more netting and camo leaves all over ---------------------------------------------------------
  // M1A2 Abrams UA: a net thrown over the drone cage's flat top, resting on its tubes and sagging between them (the bars
  // below stay visible, the owner's 2026-09-15 rule for cages), the bustle behind the cage netted, drapes down the turret
  // flanks over the ARAT tiles outboard of the cage, a rear drape; both decks netted (the driver's hatch, the gun's arc
  // and the exhaust end bare), four drapes a side over the skirts.
  ua_m1a1_x: {
    id: 'ua_m1a1_x', seed: 1103, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.22, hemFloorM: 0.7,
    turret: {
      top: [
        // inside the cage's side rails (x 1.23): the flank drapes, sought from 1.27 out, never find it and hang from the
        // turret's ARAT tiles instead of curtaining the cage's sides
        // open over the commander's cupola and the loader's hatch (the crew's way out through the cage roof)
        { x0: -1.18, x1: 1.18, z0: -2.42, z1: 0.80, nx: 30, nz: 40, yAt: () => 1.87, seed: 11, tents: [], garnishRiseM: 0.16, reliefScale: 0.8,
          holes: [rect(-1.10, 0.09, -1.34, -0.15), rect(0.01, 0.83, -1.14, -0.32)] },
        laid({ x0: -1.06, x1: 1.06, z0: -3.40, z1: -2.58, nx: 21, nz: 10, y: 1.04, garnishRiseM: 0.16, seed: 13 }),
      ],
      side: flanks(-2.30, -0.12, 0.98, 0.46, 1.72, 17),
      face: [face({ z: -3.42, x0: -0.98, x1: 0.98, y0: 0.60, y1: 1.02, nx: 20, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.62, x1: 1.62, z0: -3.62, z1: 0.39, nx: 32, nz: 40, y: 1.72, garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.62, x1: 1.62, z0: 0.39, z1: 3.62, nx: 32, nz: 32, y: 1.50, holes: [rect(-0.38, 0.38, 2.25, 3.00)],
          garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.30, 3.10, 1.54, 0.55, 2.05, 41),
    },
  },
  // Challenger 2 (Ukraine): the turret roof netted round both cupolas, the commander's sight and the roof boxes, drapes
  // over the side racks, a rear drape; the rear deck netted ahead of the fuel drums, the glacis round the driver's hatch
  // and lights, four drapes a side over the ERA and the bar frames.
  ua_challenger2: {
    id: 'ua_challenger2', seed: 2203, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.16, hemFloorM: 1.05,
    turret: {
      top: [laid({
        x0: -1.79, x1: 1.79, z0: -3.46, z1: 1.86, nx: 45, nz: 66, y: 0.49,
        holes: [rect(-1.15, -0.85, -0.22, 0.12), rect(0.85, 1.15, -0.22, 0.12), rect(-0.15, 0.15, -1.15, -0.85), rect(-0.15, 0.25, 0.25, 0.85)],
        garnishRiseM: 0.16, seed: 11,
      })],
      side: flanks(-3.30, 0.20, 0.56, 0.46, 1.80, 17),
      face: [face({ z: -3.46, x0: -1.40, x1: 1.40, y0: 0.08, y1: 0.47, nx: 28, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.80, x1: 1.80, z0: -2.60, z1: 1.00, nx: 36, nz: 36, y: 1.95, garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.80, x1: 1.80, z0: 1.00, z1: 3.80, nx: 36, nz: 28, y: 1.75,
          holes: [rect(-0.30, 0.30, 1.85, 2.45), ...pair(0.88, 1.30, 3.40, 3.66)], garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.70, 3.40, 1.68, 0.50, 1.98, 41),
    },
  },
  // Type 10B: the roof netted round the commander's and gunner's sights, both hatches, the roof vents and boxes, drapes
  // down the turret walls behind the side smoke banks and down the bustle basket, a rear drape; the rear deck netted
  // short of the stern (the left rear exhaust bare), the front deck, four drapes a side (the left one cut round the
  // exhaust).
  type10b: {
    id: 'type10b', seed: 1004, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 1.95, hemFloorM: 0.62,
    turret: {
      top: [laid({
        x0: -1.68, x1: 1.70, z0: -3.41, z1: 1.97, nx: 42, nz: 67, y: 0.76,
        holes: [rect(-0.80, -0.30, -0.35, 0.15), rect(-0.70, -0.20, 0.30, 0.85), rect(-1.20, -0.80, -0.90, -0.45), rect(0.70, 1.10, -2.30, -1.85),
          rect(-0.75, -0.05, -1.95, -1.40), rect(0.05, 0.75, -1.95, -1.40), rect(-0.95, -0.35, -1.00, -0.40), rect(0.25, 0.85, -1.00, -0.40)],
        garnishRiseM: 0.16, seed: 11,
      })],
      side: [...flanks(-2.50, -0.28, 0.80, 0.46, 1.67, 17), ...flanks(-3.30, -2.56, 0.66, 0.36, 1.45, 19)],
      face: [face({ z: -3.42, x0: -1.30, x1: 1.30, y0: 0.36, y1: 0.74, nx: 26, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.66, x1: 1.66, z0: -3.40, z1: 0.24, nx: 33, nz: 36, y: 1.95, holes: [rect(-1.80, -1.35, -3.55, -2.15)], garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.66, x1: 1.66, z0: 0.24, z1: 3.45, nx: 33, nz: 32, y: 1.80, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.10, 3.02, 1.60, 0.55, 1.76, 41, (side) => (side < 0 ? [cut(-3.55, -2.15, 1.30, 1.85)] : [])),
    },
  },
  // Type 90A: the roof netted round the sight head and its rail, the commander's and loader's hatches and the MG ring,
  // drapes behind the side smoke banks, a rear drape; the engine deck netted (its left rear exhaust bare) and the front
  // deck, four drapes a side over the short skirts.
  type90a: {
    id: 'type90a', seed: 9003, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 1.93, hemFloorM: 0.95,
    turret: {
      top: [laid({
        x0: -1.53, x1: 1.53, z0: -1.98, z1: 1.45, nx: 38, nz: 43, y: 0.68,
        holes: [rect(-0.13, 0.51, -0.03, 1.54), rect(-0.82, -0.38, -0.33, 0.11), rect(-0.44, -0.16, -0.07, 0.18), rect(0.43, 0.69, 0.05, 0.27),
          rect(-1.00, -0.30, 0.20, 0.85), rect(0.20, 0.90, -0.15, 0.50), rect(-1.00, -0.30, -1.10, -0.45), rect(0.15, 0.85, -1.10, -0.45)],
        garnishRiseM: 0.16, seed: 11,
      })],
      side: flanks(-1.83, -0.19, 0.72, 0.46, 1.50, 17),
      face: [face({ z: -1.98, x0: -1.18, x1: 1.18, y0: 0.28, y1: 0.66, nx: 24, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.62, x1: 1.62, z0: -3.50, z1: -0.20, nx: 32, nz: 33, y: 1.46, holes: [rect(-1.75, -1.30, -3.60, -2.40)], garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.62, x1: 1.62, z0: -0.20, z1: 3.25, nx: 32, nz: 34, y: 1.46, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.55, 3.20, 1.46, 0.42, 1.75, 41, (side) => (side < 0 ? [cut(-3.60, -2.40, 1.00, 1.60)] : [])),
    },
  },
  // C2 Ariete: the roof netted round both hatches and their MGs, the commander's and gunner's sights, drapes down the
  // turret's rear walls behind the two discharger rows, a rear drape; the engine deck netted round its fan grille, the
  // glacis over its appliqué, four drapes a side over the skirts.
  ariete_c2_x: {
    id: 'ariete_c2_x', seed: 2042, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.42, hemFloorM: 0.78,
    turret: {
      top: [laid({
        x0: -2.09, x1: 2.09, z0: -3.27, z1: 1.70, nx: 52, nz: 62, y: 0.95,
        holes: [rect(-0.95, -0.25, -0.95, -0.25), rect(0.20, 0.90, -0.75, -0.05), rect(0.88, 1.17, -0.97, -0.68), rect(0.69, 1.26, -0.16, 0.46),
          rect(-1.30, -0.36, 0.21, 0.82)],
        garnishRiseM: 0.16, seed: 11,
      })],
      side: flanks(-3.10, -1.32, 1.00, 0.46, 1.62, 17),
      face: [face({ z: -3.27, x0: -1.20, x1: 1.20, y0: 0.50, y1: 0.92, nx: 24, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.98, x1: 1.98, z0: -3.95, z1: 0.40, nx: 40, nz: 43, y: 1.80, holes: [rect(-0.75, 0.75, -3.65, -2.35)], garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.98, x1: 1.98, z0: 0.40, z1: 3.85, nx: 40, nz: 34, y: 1.75, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.95, 3.95, 1.64, 0.55, 2.24, 41),
    },
  },
  // C2 Ariete Prototype: the roof netted round the commander's sight, the gunner's sight and the roof periscopes, drapes
  // behind the side discharger banks, a rear drape; the engine deck netted short of the rear exhaust, the front deck
  // round the driver's periscope, four drapes a side.
  ariete_c2: {
    id: 'ariete_c2', seed: 2043, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.19, hemFloorM: 0.8,
    turret: {
      top: [laid({
        x0: -1.71, x1: 1.71, z0: -2.72, z1: 2.06, nx: 43, nz: 60, y: 0.97,
        holes: [rect(-1.06, -0.52, -0.32, 0.16), rect(0.19, 0.82, -0.12, 0.12), rect(-0.12, 0.34, 0.24, 0.64), rect(0.01, 0.29, -0.69, -0.45),
          rect(-0.38, -0.10, -0.34, -0.10), rect(-0.42, -0.24, -1.21, -1.03), rect(0.63, 1.04, 0.45, 0.61)],
        garnishRiseM: 0.16, seed: 11,
      })],
      side: flanks(-2.57, -0.82, 1.00, 0.46, 1.68, 17),
      face: [face({ z: -2.72, x0: -1.30, x1: 1.30, y0: 0.52, y1: 0.95, nx: 26, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.87, x1: 1.87, z0: -3.65, z1: -0.11, nx: 37, nz: 36, y: 1.95, garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.87, x1: 1.87, z0: -0.11, z1: 3.85, nx: 37, nz: 40, y: 1.90, holes: [rect(-0.43, 0.20, 0.84, 1.29)],
          garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.45, 3.40, 1.72, 0.55, 2.01, 41),
    },
  },
  // LRMV Lynx: the turret roof netted round the RWS (the builder) and the periscope row, drapes ahead of the side smoke
  // banks, a rear drape; the long hull roof netted fore and aft of the turret, four drapes a side down the tall skirts.
  lrmv_lynx: {
    id: 'lrmv_lynx', seed: 6201, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 1.84, hemFloorM: 0.84,
    turret: {
      top: [laid({ x0: -1.27, x1: 1.27, z0: -1.55, z1: 1.35, nx: 32, nz: 36, y: 0.70, garnishRiseM: 0.16, seed: 11 })],
      side: flanks(-0.58, 1.00, 0.74, 0.42, 1.24, 17),
      face: [face({ z: -1.56, x0: -0.98, x1: 0.98, y0: 0.30, y1: 0.68, nx: 20, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.50, x1: 1.50, z0: -3.30, z1: -0.14, nx: 30, nz: 32, y: 2.03, garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.50, x1: 1.50, z0: -0.14, z1: 3.00, nx: 30, nz: 31, y: 2.03, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.20, 3.20, 2.08, 0.56, 1.64, 41),
    },
  },
  // ZTZ-99A2: the roof netted round its sights, hatches and roof gun (the builder), drapes behind the side smoke banks,
  // a rear drape; the engine deck netted (the left rear exhaust bare) and the front deck, four drapes a side.
  ztz99a2: {
    id: 'ztz99a2', seed: 9902, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.09, hemFloorM: 0.72,
    turret: {
      top: [laid({ x0: -1.67, x1: 1.67, z0: -2.36, z1: 1.55, nx: 42, nz: 49, y: 0.81, holes: [rect(0.17, 0.43, -0.99, -0.77)], garnishRiseM: 0.16, seed: 11 })],
      side: flanks(-2.21, -0.03, 0.85, 0.46, 1.64, 17),
      face: [face({ z: -2.37, x0: -1.30, x1: 1.30, y0: 0.40, y1: 0.80, nx: 26, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.75, x1: 1.75, z0: -4.50, z1: 0.12, nx: 35, nz: 46, y: 1.80, holes: [rect(-1.95, -1.40, -4.60, -3.20)], garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.75, x1: 1.75, z0: 0.12, z1: 3.25, nx: 35, nz: 31, y: 1.75, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-4.40, 3.20, 1.66, 0.55, 1.91, 41, (side) => (side < 0 ? [cut(-4.60, -3.20, 1.00, 1.80)] : [])),
    },
  },
  // T-80U Yun: the roof netted round its faceted station (the builder), sights and hatches, drapes down the flanks behind
  // the roof smoke banks, a rear drape; the engine deck netted short of the turbine exhaust, the front deck, four drapes
  // a side.
  cn_t80u_modern: {
    id: 'cn_t80u_modern', seed: 8031, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.37, hemFloorM: 0.93,
    turret: {
      // open round the bustle sides' insignia and number (their seats lie on the plates sloping into the roof)
      top: [laid({ x0: -1.73, x1: 1.73, z0: -2.03, z1: 1.40, nx: 43, nz: 43, y: 0.74,
        holes: [...pair(0.90, 1.24, -0.92, -0.20), ...pair(0.36, 0.86, -1.42, -0.94)], garnishRiseM: 0.16, seed: 11 })],
      // the bustle sides' insignia and number stay clear (vehicleMarkings.ts concept stations: turret z -1.0 to -1.3)
      side: flanks(-1.90, -0.94, 0.78, 0.46, 1.70, 17, {}, () => [cut(-1.48, -0.90, 0.40, 0.95)]),
      face: [face({ z: -2.04, x0: -1.30, x1: 1.30, y0: 0.32, y1: 0.72, nx: 26, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        // the left fender bare beside the hull's tactical number (hull z -2.8)
        laid({ x0: -1.80, x1: 1.80, z0: -3.15, z1: 0.07, nx: 36, nz: 32, y: 1.55, holes: [rect(-1.95, -0.98, -3.06, -2.58)],
          garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.80, x1: 1.80, z0: 0.07, z1: 3.05, nx: 36, nz: 30, y: 1.50, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      // the hull's rear sides bare round the tactical number (hull z -2.8)
      side: skirts(-2.50, 3.10, 1.38, 0.40, 2.19, 41),
    },
  },
  // Type 96B: the roof netted round its sights, hatches and roof gun, drapes behind the low side smoke banks, a rear
  // drape; the engine deck netted (the left rear exhaust bare) and the front deck, four drapes a side.
  type96b_x: {
    id: 'type96b_x', seed: 9602, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 1.94, hemFloorM: 1.07,
    turret: {
      top: [laid({ x0: -1.75, x1: 1.75, z0: -1.95, z1: 1.91, nx: 44, nz: 48, y: 0.70, garnishRiseM: 0.16, seed: 11 })],
      side: flanks(-1.80, 0.39, 0.74, 0.46, 1.72, 17),
      face: [face({ z: -1.96, x0: -1.30, x1: 1.30, y0: 0.30, y1: 0.68, nx: 26, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.62, x1: 1.62, z0: -3.50, z1: -0.15, nx: 32, nz: 34, y: 1.62, holes: [rect(-1.80, -1.30, -3.60, -2.40)], garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.62, x1: 1.62, z0: -0.15, z1: 3.20, nx: 32, nz: 34, y: 1.42, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.55, 3.25, 1.56, 0.42, 1.74, 41, (side) => (side < 0 ? [cut(-3.60, -2.40, 1.05, 1.70)] : [])),
    },
  },
  // Leclerc SXXI: the roof netted round the commander's HL-70 and the gunner's sight (their lenses opened by the
  // builder), the hatches and the roof gun, drapes ahead of the rear GALIX launchers, a rear drape over the bustle; the
  // engine deck netted short of the rear exhaust, the front deck, four drapes a side.
  leclerc_xlr: {
    id: 'leclerc_xlr', seed: 5502, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.03, hemFloorM: 0.86,
    turret: {
      top: [laid({ x0: -1.68, x1: 1.58, z0: -2.63, z1: 1.99, nx: 41, nz: 58, y: 0.72, garnishRiseM: 0.16, seed: 11 })],
      side: flanks(-0.90, 0.95, 0.76, 0.42, 1.65, 17),
      face: [face({ z: -2.63, x0: -1.20, x1: 1.20, y0: 0.30, y1: 0.70, nx: 24, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.70, x1: 1.70, z0: -3.15, z1: -0.10, nx: 34, nz: 31, y: 1.70, garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.70, x1: 1.70, z0: -0.10, z1: 3.25, nx: 34, nz: 34, y: 1.62, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.30, 2.42, 1.40, 0.42, 1.83, 41),
    },
  },
  // T-80U Bars-M: the roof netted round its drum-fed station (the builder), sights and hatches, drapes behind each
  // side's smoke bank, a rear drape; the engine deck netted short of the turbine exhaust, the front deck, four drapes a
  // side.
  ru_t80u_modern: {
    id: 'ru_t80u_modern', seed: 8032, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.43, hemFloorM: 0.84,
    turret: {
      // open round the bustle sides' insignia and number (their seats lie on the plates sloping into the roof)
      top: [laid({ x0: -1.84, x1: 1.86, z0: -2.28, z1: 1.90, nx: 46, nz: 52, y: 0.72, holes: pair(0.36, 0.86, -1.44, -0.96),
        garnishRiseM: 0.16, seed: 11 })],
      // the bustle sides' insignia and number stay clear (vehicleMarkings.ts concept stations: turret z -1.0 to -1.3)
      side: [...flanks(-2.13, -0.56, 0.76, 0.46, 1.83, 17, {}, () => [cut(-1.50, -0.86, 0.40, 0.95)]).filter((p) => p.side < 0),
        ...flanks(-2.13, -0.04, 0.76, 0.46, 1.83, 17, {}, () => [cut(-1.50, -0.86, 0.40, 0.95)]).filter((p) => p.side > 0)],
      face: [face({ z: -2.29, x0: -1.30, x1: 1.30, y0: 0.30, y1: 0.70, nx: 26, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.80, x1: 1.80, z0: -2.95, z1: 0.07, nx: 36, nz: 30, y: 1.55, garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.80, x1: 1.80, z0: 0.07, z1: 3.15, nx: 36, nz: 31, y: 1.50, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.10, 3.20, 1.34, 0.40, 2.25, 41),
    },
  },
  // T-90AM: the roof netted round the commander's panorama and its guard, the gunner's sight, both hatches and the roof
  // boxes, drapes down the walls behind the smoke banks and down the bustle box, a rear drape; the engine deck netted
  // (the left fender's exhaust and the stern drums bare) and the front deck, four drapes a side (the left one cut round
  // the exhaust).
  t90m: {
    id: 't90m', seed: 9004, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.13, hemFloorM: 0.72,
    turret: {
      top: [laid({ x0: -1.87, x1: 1.87, z0: -3.55, z1: 1.40, nx: 47, nz: 62, y: 0.94,
        holes: [rect(0.50, 1.10, 0.45, 1.25), rect(0.08, 0.62, 0.40, 0.90)], garnishRiseM: 0.16, seed: 11 })],
      side: flanks(-3.40, -0.30, 0.98, 0.46, 1.84, 17),
      face: [face({ z: -3.55, x0: -1.30, x1: 1.30, y0: 0.50, y1: 0.92, nx: 26, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.80, x1: 1.80, z0: -3.85, z1: 0.14, nx: 36, nz: 40, y: 1.60, holes: [rect(-1.95, -1.40, -3.50, -2.20)], garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.80, x1: 1.80, z0: 0.14, z1: 3.70, nx: 36, nz: 36, y: 1.55, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.05, 3.35, 1.52, 0.48, 1.95, 41, (side) => (side < 0 ? [cut(-3.50, -2.20, 1.00, 1.90)] : [])),
    },
  },
  // Leopard 2A7V: the arrowhead roof netted round the PERI, the EMES head, the hatches and the remote station (the
  // builder), drapes down the walls ahead of and behind the rear smoke banks, a rear drape over the basket; the engine
  // deck netted short of the rear exhaust louvres, the front deck, four drapes a side.
  leo2a7v_x: {
    id: 'leo2a7v_x', seed: 2704, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.13, hemFloorM: 1.01,
    turret: {
      top: [laid({ x0: -1.63, x1: 1.63, z0: -3.35, z1: 2.35, nx: 41, nz: 71, y: 0.88, garnishRiseM: 0.16, seed: 11 })],
      side: [...flanks(-1.04, 1.50, 0.92, 0.46, 1.60, 17), ...flanks(-3.20, -2.10, 0.92, 0.42, 1.60, 19)],
      face: [face({ z: -3.36, x0: -1.30, x1: 1.30, y0: 0.45, y1: 0.86, nx: 26, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.80, x1: 1.80, z0: -3.60, z1: 0.52, nx: 36, nz: 41, y: 2.00, garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.80, x1: 1.80, z0: 0.52, z1: 3.50, nx: 36, nz: 30, y: 1.95, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.50, 3.40, 1.62, 0.52, 1.95, 41),
    },
  },
  // Leopard 2A5: the wedge roof netted round the PERI, the EMES head, the hatches and the roof gun, drapes down the walls
  // ahead of and behind the rear smoke banks, a rear drape; the engine deck netted short of the rear louvres, the front
  // deck, four drapes a side.
  leo2a5_x: {
    id: 'leo2a5_x', seed: 2505, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 1.94, hemFloorM: 0.97,
    turret: {
      top: [laid({ x0: -1.55, x1: 1.56, z0: -3.53, z1: 2.40, nx: 39, nz: 74, y: 0.86, garnishRiseM: 0.16, seed: 11 })],
      side: [...flanks(-0.81, 1.60, 0.90, 0.46, 1.53, 17), ...flanks(-3.38, -2.54, 0.90, 0.42, 1.53, 19)],
      face: [face({ z: -3.54, x0: -1.25, x1: 1.25, y0: 0.44, y1: 0.84, nx: 25, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.70, x1: 1.70, z0: -3.50, z1: 0.66, nx: 34, nz: 42, y: 2.00, garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.70, x1: 1.70, z0: 0.66, z1: 3.60, nx: 34, nz: 30, y: 1.70, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.40, 3.50, 1.68, 0.52, 1.76, 41),
    },
  },
  // KF51-U: the roof netted round the commander's and gunner's sights, the hatches and the roof station (the builder),
  // drapes ahead of and behind the smoke banks, a rear drape; the engine deck netted short of the rear louvres, the
  // front deck, four drapes a side.
  kf51b: {
    id: 'kf51b', seed: 5101, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.1, hemFloorM: 0.68,
    turret: {
      // the fore-roof over the moving gun housing stays open air (kf51bTurretCenter.selftest: x +-0.40, z 0.92-1.85)
      top: [laid({ x0: -1.58, x1: 1.56, z0: -3.09, z1: 1.73, nx: 39, nz: 60, y: 0.64, garnishRiseM: 0.16, seed: 11,
        holes: [rect(-0.48, 0.48, 0.86, 1.90)] })],
      // the front drapes cut round the cheek sensors (turret z 0.88, both flanks)
      side: [...flanks(-0.38, 1.45, 0.68, 0.44, 1.55, 17, {}, () => [cut(0.66, 1.10, 0.50, 0.90)]),
        ...flanks(-2.94, -1.13, 0.68, 0.44, 1.55, 19)],
      face: [face({ z: -3.10, x0: -1.25, x1: 1.25, y0: 0.24, y1: 0.62, nx: 25, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.75, x1: 1.75, z0: -3.50, z1: 0.65, nx: 35, nz: 42, y: 2.00, garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.75, x1: 1.75, z0: 0.65, z1: 3.50, nx: 35, nz: 29, y: 1.95, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.40, 3.12, 1.48, 0.52, 1.92, 41),
    },
  },
  // SPz Wotan: the offset turret's roof netted round its sights and the remote station (the builder), drapes behind the
  // side smoke banks, a rear drape; the troop roof and the front deck netted, four drapes a side (the right one cut
  // round the front exhaust).
  spz_puma_s1: {
    id: 'spz_puma_s1', seed: 1501, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.04, hemFloorM: 0.67,
    turret: {
      top: [laid({ x0: -1.23, x1: 1.22, z0: -1.57, z1: 1.22, nx: 31, nz: 35, y: 0.67, garnishRiseM: 0.16, seed: 11 })],
      side: flanks(-1.42, -0.21, 0.71, 0.42, 1.21, 17),
      face: [face({ z: -1.58, x0: -0.95, x1: 0.95, y0: 0.28, y1: 0.65, nx: 19, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.70, x1: 1.70, z0: -3.10, z1: -0.99, nx: 34, nz: 21, y: 1.90, garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.70, x1: 1.70, z0: -0.99, z1: 3.00, nx: 34, nz: 40, y: 1.85, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      // cut round the hull's side cameras (z 0.94 and -2.45 a side) and the right front exhaust
      side: skirts(-3.10, 3.05, 1.62, 0.55, 1.86, 41, (side) => [cut(0.74, 1.14, 1.42, 1.90), cut(-2.65, -2.25, 1.42, 1.90),
        ...(side > 0 ? [cut(0.80, 2.60, 1.00, 1.90)] : [])]),
    },
  },
});
