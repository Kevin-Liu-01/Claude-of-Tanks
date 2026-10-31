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
// Every suit here keeps the vehicle's drone dock clear wherever its seat record puts it (ghillieSuit.ts suitDockBoxes,
// read from missionDockSeats.generated.ts like the decor's keep-out): the net and garnish give way round the cradle and
// the parked airframe's launch column, so a regenerated seat never has to move off the suit.
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
function laid(panel: Omit<TopPanel, 'yAt'> & { y?: number; yAt?: TopPanel['yAt'] }): TopPanel {
  const { y = 0.5, yAt, ...rest } = panel;
  return { yAt: yAt ?? (() => y), yFromArmour: true, clipToArmour: true, autoOpeningsM: 0.07, rimScale: 0.5, ...rest };
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
/**
 * Group A (the owner: "add our new ghillie and netting on the cv90, cv9040c, merkava mk 4b, merkava mk 3c"): 2026-10-12
 * (cam-netting) at the Group B garnish density; the fix round's 0.95 left 4-6 cards a square metre of net against the
 * Group B hulls' 10-15, and the four read as bare plate with a few patches.
 */
const FULL = { density: 1.8, boughShare: 0.42 } as const;

/** Four drapes a side between z0 and z1 with short bare gaps (a heavily netted hull's skirts). */
function skirts(z0: number, z1: number, top: number, drop: number, out: number, seed: number,
  cutsFor?: (side: number) => SidePanel['cuts']): SidePanel[] {
  const gap = 0.2, span = (z1 - z0 - gap * 3) / 4;
  return [0, 1, 2, 3].flatMap((k) => flanks(z0 + k * (span + gap), z0 + k * (span + gap) + span, top,
    drop + (k % 2 ? -0.04 : 0.03), out, seed + 6 * k, {}, cutsFor));
}

/**
 * The M1A2 X hulls' open net (2026-10-22, lane 240; critic: "camo-net patches on the skirts show a dark rectangular
 * backing"). The issue field net is about 69 % olive cloth between its holes: hung over the sand ARAT skirts, each drape
 * read as a dark rectangle with the boughs on it. At 0.55 of the garnish density the cloth covers about a third of the
 * net, so the skirts' paint shows through the cord between the bunches and the boughs carry the cover.
 */
const M1A2_X_OPEN_NET = { netStripDensity: 0.55 } as const;

/** A box [z0, z1, yLo, yHi] a flank drape is cut away over. */
const cut = (z0: number, z1: number, lo: number, hi: number): readonly [number, number, number, number] => [z0, z1, lo, hi];

/** A deck height along z by stations (z, y), linear between them and held past the ends (the S-tanks' sloped hulls). */
function profile(stations: ReadonlyArray<readonly [number, number]>): (z: number) => number {
  return (z) => {
    if (z <= stations[0][0]) return stations[0][1];
    for (let i = 1; i < stations.length; i++) {
      const [z0, y0] = stations[i - 1], [z1, y1] = stations[i];
      if (z <= z1) return y0 + ((y1 - y0) * (z - z0)) / (z1 - z0);
    }
    return stations[stations.length - 1][1];
  };
}
/** The Strv 103B's and 103A's hull deck lines (the round-5 suits' measured profiles, ghillieSuit.ts). */
const STRV103B_DECK = profile([[-3.72, 1.57], [-2.75, 1.79], [0.75, 1.85], [1.60, 1.63], [2.61, 1.53], [3.22, 1.55]]);
const STRV103A_DECK = profile([[-3.20, 1.89], [-2.00, 1.93], [0.62, 1.90], [1.55, 1.75], [2.36, 1.62], [2.98, 1.52], [3.45, 1.54]]);

export const FLEET_GHILLIE_SUITS: Readonly<Record<string, GhillieConfig>> = Object.freeze({
  // ---- Group A: the new ghillie and netting --------------------------------------------------------------------
  // CV90 (CV9040 IFV): the turret roof and bustle under one net, opened round the commander's panorama and its ring,
  // the gunner's sight head, the cheek sensors, the whip bases and the RWS (the builder); flank drapes behind the smoke
  // banks; a rear drape over the bustle rack. The troop roof behind the turret's sweep netted round its two roof boxes,
  // the front shoulders beside the driver netted outboard of the gun's arc, the skirts hung in three drapes a side.
  cv90: {
    id: 'cv90', seed: 9040, style: 'leafy', ...FULL, leafScale: 0.92, foliageKind: 'spruce', ...WOODLAND,
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
        // 2026-10-12 (cam-netting): the whole front deck and glacis under one net (the fix round netted only the two
        // shoulders and left the bow bare): the driver's hatch and periscopes, the lights and the gun's arc are the
        // builder's (the cloth lies flat under the bore, no bough stands in its sweep)
        laid({ x0: -1.62, x1: 1.62, z0: 0.86, z1: 2.95, nx: 32, nz: 26, yAt: (_x, z) => 1.56 - Math.max(0, z - 1.75) * 0.47,
          garnishRiseM: 0.1, seed: 37 }),
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
  cv9040c: {
    id: 'cv9040c', seed: 9041, style: 'leafy', ...FULL, leafScale: 0.92, foliageKind: 'spruce', ...WOODLAND,
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
      top: [
        laid({ x0: -1.58, x1: 1.58, z0: -3.30, z1: -0.76, nx: 32, nz: 26, y: 1.94, garnishRiseM: 0.10, seed: 31 }),
        // 2026-10-12 (cam-netting): the front deck and glacis netted to the bow round the driver's and the engine
        // hatches (the builder opens them), the gun's arc flat under the bore
        laid({ x0: -1.58, x1: 1.58, z0: 0.52, z1: 3.25, nx: 32, nz: 34, yAt: (_x, z) => 1.76 - Math.max(0, z - 1.25) * 0.26,
          garnishRiseM: 0.1, seed: 37 }),
      ],
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
  // deck under the basket netted low, the skirts hung in three drapes a side; the front engine deck netted to the bow.
  merkava4b: {
    id: 'merkava4b', seed: 4041, style: 'leafy', ...FULL, leafScale: 0.92, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.08, hemFloorM: 0.85,
    // 245: under its measured curve (turretScaleGunPitch.ts) the hull net lay 9.9 mm under the barrel at yaw 138
    clothClearsGunStops: true,
    // 262: the family rebuild's curve (-7.7 ahead) brings the barrel within 2.4 mm of the bow deck's leaves at yaw 7:
    // the cards and the field clear the gun's whole envelope
    cardsClearGunStops: true,
    conservativeGunEnvelope: true,
    // 262: re-seated on the family rebuild's turret (its ring 0.70 m further aft, its roof 0.95-1.37 m over the ring) and
    // hull (its stern at -3.80): the roof net follows the measured roof, the drapes the walls, the basket's load its rails
    turret: {
      top: [
        laid({
          x0: -1.70, x1: 1.70, z0: -0.96, z1: 2.30, nx: 44, nz: 42,
          yAt: (_x, z) => (z <= -0.6 ? 1.07 : z <= 0.6 ? 1.07 + (z + 0.6) * 0.27 : z <= 1.3 ? 1.39 : Math.max(0.84, 1.39 - (z - 1.3) * 0.55)),
          holes: [rect(0.23, 0.67, 1.50, 1.94), rect(-1.08, -0.16, -0.03, 0.89), rect(0.30, 1.10, -0.70, 0.10),
            rect(0.39, 0.89, 0.30, 0.76), rect(0.47, 0.93, 0.81, 1.29), rect(-0.95, -0.55, -0.66, -0.24), rect(-0.25, 0.25, -0.70, -0.30)],
          garnishRiseM: 0.12, seed: 11,
        }),
        laid({ x0: -1.10, x1: 1.10, z0: -2.52, z1: -2.04, nx: 22, nz: 8, y: 0.66, garnishRiseM: 0.14, seed: 13 }),
      ],
      side: [
        ...flanks(-0.85, 1.12, 1.02, 0.40, 1.80, 17),
        ...flanks(-2.50, -1.10, 0.94, 0.32, 1.32, 19),
      ],
      face: [face({ z: -2.58, x0: -1.12, x1: 1.12, y0: 0.40, y1: 0.80, nx: 23, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.75, x1: 1.75, z0: -3.70, z1: -0.55, nx: 35, nz: 32, y: 1.76, garnishRiseM: 0.10, seed: 31 }),
        // 2026-10-12 (cam-netting): the front engine deck netted to the bow (the fix round left it bare): the driver's
        // hatch and periscopes open (the builder), the cloth flat under the gun, no bough in its sweep
        laid({ x0: -1.72, x1: 1.72, z0: 0.72, z1: 3.15, nx: 34, nz: 25, yAt: (_x, z) => 1.76 - Math.max(0, z - 1.0) * 0.17,
          garnishRiseM: 0.1, seed: 37 }),
      ],
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
    id: 'merkava3c', seed: 3031, style: 'leafy', ...FULL, leafScale: 0.92, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.03, hemFloorM: 0.85,
    // 245: under its measured curve (turretScaleGunPitch.ts) the hull net lay 10.8 mm under the barrel at yaw 176
    clothClearsGunStops: true,
    // 247: the front stop near -2 degrees on the cut mask brings the barrel over the bow deck's leaves
    cardsClearGunStops: true,
    // 262: at the family rebuild's full 8 degrees ahead the barrel comes within 23 mm of the bow deck's leaves at yaw -5
    // (merkavaFamilyGunClearance): the cards and the field clear the gun's whole envelope, as the Mk 4B's
    conservativeGunEnvelope: true,
    // 262: re-seated on the family rebuild's turret (its ring 0.17 m further forward, its roof 0.62-0.93 m over the ring)
    // and hull (its stern at -3.70): the roof net follows the measured roof, the drapes the walls, the basket its rails
    turret: {
      top: [
        laid({
          x0: -1.40, x1: 1.40, z0: -1.97, z1: 1.89, nx: 36, nz: 46,
          yAt: (_x, z) => (z <= 0.3 ? 0.95 : Math.max(0.64, 0.95 - (z - 0.3) * 0.2)),
          holes: [rect(0.71, 1.52, -0.97, -0.09), rect(-1.20, -0.41, -1.53, -0.71), rect(-0.20, 0.30, -0.32, 0.15),
            rect(-1.01, -0.55, 0.37, 0.85), rect(-1.30, -0.98, 0.53, 0.93)],
          garnishRiseM: 0.12, seed: 11,
        }),
        laid({ x0: -1.05, x1: 1.05, z0: -3.10, z1: -2.38, nx: 21, nz: 10, y: 0.57, garnishRiseM: 0.14, seed: 13 }),
      ],
      side: [
        ...flanks(-1.87, -0.15, 0.90, 0.40, 1.42, 17),
        ...flanks(-3.10, -2.38, 0.66, 0.30, 1.15, 19),
      ],
      face: [face({ z: -3.17, x0: -1.00, x1: 1.00, y0: 0.27, y1: 0.61, nx: 20, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.72, x1: 1.72, z0: -3.60, z1: -1.10, nx: 34, nz: 26, y: 1.68, garnishRiseM: 0.10, seed: 31 }),
        // 2026-10-12 (cam-netting): the front engine deck netted to the bow, as the Mk 4B's
        laid({ x0: -1.70, x1: 1.70, z0: 0.92, z1: 2.68, nx: 34, nz: 18, yAt: (_x, z) => 1.70 - Math.max(0, z - 1.2) * 0.2,
          garnishRiseM: 0.1, seed: 37 }),
      ],
      side: [
        ...flanks(-3.55, -2.26, 1.72, 0.56, 1.85, 41),
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
  ua_m1a2_abrams: {
    id: 'ua_m1a2_abrams', seed: 1103, style: 'leafy', ...DENSE, ...WOODLAND, ...M1A2_X_OPEN_NET,
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
    // 245: under its measured curve (turretScaleGunPitch.ts) the hull net lay 1.2 mm under the barrel at its -9 degree
    // stop at yaw 82
    clothClearsGunStops: true,
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
  // Challenger 3 TD (release 262; Main, 2026-10-27: "challenger 3 td should get a tonn of ghillie as well"): the field
  // suit of a demonstrator out on the plain, far heavier than the fleet's garnish and in beech boughs, so it reads apart
  // from the Ukrainian Challenger 2's oak at a glance (the two other Challenger 3s carry none). The turret roof netted
  // from the bustle's rear edge over both cheek brows, the gun slot left bare forward of its face, opened round the
  // gunner's sight box and its view, the cupola, the commander's sight pedestal, the loader's hatch and periscope, the
  // mast and both whips; drapes down both turret walls behind the cheeks and over the rear face. The hull: the rear deck
  // and the fuel drums netted behind the turret's sweep, a low band on the engine deck under it, the glacis to the bow
  // round the driver's hatch, his periscope and the lamps, and five drapes a side over the full-length skirts. Owner-local
  // metres of the installed build (profiles/challenger3Td.ts: oracle rows x1.10).
  challenger3_td: {
    id: 'challenger3_td', seed: 3262, style: 'leafy', density: 2.6, leafScale: 1.0, boughShare: 0.5,
    foliageKind: 'beech', ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.16, hemFloorM: 1.0,
    clothClearsGunStops: true, cardsClearGunStops: true,
    turret: {
      top: [laid({
        x0: -1.50, x1: 1.50, z0: -3.78, z1: 1.95, nx: 38, nz: 72, y: 0.95,
        outline: [[-1.50, -3.78], [1.50, -3.78], [1.50, 1.15], [1.12, 1.95], [0.56, 1.95], [0.56, 1.10], [-0.56, 1.10],
          [-0.56, 1.95], [-1.12, 1.95], [-1.50, 1.15]],
        holes: [rect(-1.06, -0.43, -0.13, 0.95), rect(-1.17, -0.01, -1.83, -0.66), rect(-0.66, 0.28, -2.96, -2.04),
          rect(0.43, 1.11, -1.51, -0.75), rect(0.65, 0.89, 0.01, 0.21), rect(0.44, 0.61, -3.09, -2.91),
          rect(1.04, 1.21, -3.06, -2.88), rect(-1.17, -1.00, -3.06, -2.88)],
        garnishRiseM: 0.18, seed: 11,
      })],
      side: flanks(-3.55, 0.95, 0.78, 0.56, 1.54, 17),
      face: [face({ z: -3.76, x0: -1.42, x1: 1.42, y0: 0.20, y1: 0.80, nx: 28, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.78, x1: 1.78, z0: -4.40, z1: -3.15, nx: 36, nz: 14, y: 2.08, garnishRiseM: 0.16, seed: 31 }),
        laid({ x0: -1.78, x1: 1.78, z0: -3.15, z1: -1.93, nx: 36, nz: 14, y: 2.06, garnishRiseM: 0.04, garnishDensity: 0.6,
          seed: 33 }),
        laid({ x0: -1.45, x1: 1.45, z0: -5.15, z1: -4.42, nx: 30, nz: 9, y: 2.04, garnishRiseM: 0.16, seed: 35 }),
        laid({ x0: -1.88, x1: 1.88, z0: 2.36, z1: 4.20, nx: 38, nz: 20,
          yAt: (_x, z) => 1.964 - Math.max(0, z - 2.36) * 0.25,
          holes: [rect(-0.40, 0.40, 1.85, 2.50), rect(-0.13, 0.13, 2.43, 2.63), ...pair(0.44, 0.79, 3.70, 4.02)],
          garnishRiseM: 0.10, seed: 37 }),
      ],
      side: [0, 1, 2, 3, 4].flatMap((k) => flanks(-4.00 + k * 1.69, -4.00 + k * 1.69 + 1.55, 1.70, k % 2 ? 0.58 : 0.62, 1.93,
        41 + 6 * k)),
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
  // Release 262, the Christian II (the owner, 2026-10-27: "dress it in a ton of netting and ghillie"): its own build
  // (profiles/christian2.ts) under far more than the fleet's DENSE garnish, in beech boughs (Denmark's woods, against the
  // Strv 121's spruce). The roof netted over the frontal modules and the bustle round the gunner's sight box, the
  // commander's panoramic head and cupola, the gunner's hatch, the gun slot, the wind mast and the whip pots; drapes down
  // both walls behind the smoke banks (over the turret number) and over the bustle bins; the engine deck, the deck under
  // the turret's sweep and the glacis netted; three long drapes a side over the skirts. Turret-local metres on the turret (pivot y 1.64, z 0.37), hull metres on the hull.
  christian2: {
    id: 'christian2', seed: 2621, style: 'leafy', density: 2.4, leafScale: 0.96, boughShare: 0.5, foliageKind: 'beech',
    ...WOODLAND,
    // 4 cm from the gun's stops: the clearance receipt also holds the recoiling parts 0.135 m back over the engine deck
    fieldClearanceM: 0.04, maxHalfWidth: 1.93, hemFloorM: 0.85, clothClearsGunStops: true, cardsClearGunStops: true,
    garnishBudget: { clumpCards: 0.7, lowShare: 0.45 },
    turret: {
      top: [laid({
        x0: -1.30, x1: 1.30, z0: -2.72, z1: 1.30, nx: 36, nz: 56, y: 0.84,
        // the gun slot (the sights, lids and posts open the net round their own shapes)
        holes: [rect(-0.50, 0.50, 0.80, 1.34)],
        garnishRiseM: 0.16, seed: 11,
      })],
      // the walls' shoulders stand at 0.76-0.77 under the roof's bevel: the drapes hang from over them, behind the smoke
      // banks and over the bustle bins
      // (no drape off the rear basket: from the side it stood over the basket's stowage as a dome)
      side: [...flanks(-1.52, 0.06, 0.80, 0.50, 1.34, 17), ...flanks(-2.66, -1.62, 0.80, 0.46, 1.22, 19)],
    },
    hull: {
      top: [
        laid({ x0: -1.66, x1: 1.66, z0: -3.78, z1: -0.30, nx: 34, nz: 36, y: 1.82, garnishRiseM: 0.14, seed: 31 }),
        // the glacis, a clear strip left ahead of the driver's periscopes
        laid({ x0: -1.66, x1: 1.66, z0: -0.30, z1: 3.40, nx: 34, nz: 38, y: 1.66, holes: [rect(-0.80, -0.30, 2.30, 2.66)],
          garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      // three long overlapping drapes a side from the sponson's wall, their tops 13 cm under the deck's edge (the gun's
      // low sweep over the sides at full depression stays clear of their garnish): over the heavy fore blocks, amidships
      // and aft over the panels, ending ahead of the sprocket
      side: [...flanks(1.36, 3.16, 1.50, 0.58, 1.86, 41), ...flanks(-1.40, 1.42, 1.50, 0.54, 1.78, 47),
        ...flanks(-2.80, -1.10, 1.50, 0.56, 1.78, 53)],
    },
  },
  // Release 262, the Strv 121 (the owner, 2026-10-27: "our strv 121 should also get a ton [of netting and ghillie] btw to
  // distinguishh it as swedish"): the Swedish Army's look, a Barracuda-style cut multispectral cover (ulcans strips)
  // worked through with spruce boughs, heavier than the fleet's DENSE suits. The turret netted from the wedge's tip over
  // the 122 roof armour and the bustle, round the hatches, the panorama and the loader's MG (the builder); drapes down the
  // walls over the side plates forward of the slats and over the bustle; a drape off the rear basket; the engine deck,
  // the deck edges under the turret's sweep and the glacis netted; four drapes a side over the cassettes. Its earlier
  // disabled round-5 entry (ghillieSuit.ts) is retired.
  strv121: {
    id: 'strv121', seed: 1220, style: 'ulcans', density: 2.2, leafScale: 0.92, boughShare: 0.45, foliageKind: 'spruce',
    light: 0x5f7148, dark: 0x2c3a28, netColor: 'rgba(36,50,30,0.82)', netTextureSeed: 1220,
    fieldClearanceM: 0.045, maxHalfWidth: 1.97, hemFloorM: 0.95, clothClearsGunStops: true,
    garnishBudget: { clumpCards: 0.7, lowShare: 0.45 },
    turret: {
      top: [laid({ x0: -1.60, x1: 1.60, z0: -3.15, z1: 2.90, nx: 40, nz: 76, y: 0.80, garnishRiseM: 0.16, seed: 11 })],
      side: [...flanks(-1.30, 0.55, 0.86, 0.50, 1.60, 17), ...flanks(-2.95, -1.95, 0.72, 0.44, 1.47, 19)],
      face: [face({ z: -3.24, x0: -1.25, x1: 1.25, y0: 0.26, y1: 0.66, nx: 25, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.72, x1: 1.72, z0: -3.70, z1: -0.60, nx: 34, nz: 31, y: 1.86, garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.72, x1: 1.72, z0: -0.60, z1: 3.85, nx: 34, nz: 45, y: 1.69, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      // four drapes a side over the 2A4 skirts (release 265), their gaps over the skirts' two open seams (the aft run's
      // rear end at z -2.82 and its step to the fore blocks at 1.40-1.42): a drape column over either seam was laid
      // through it onto the road wheels' tops, inside the track's sweep (28 voxels, the strict track clip)
      side: [...flanks(-3.40, -2.92, 1.46, 0.51, 1.90, 41), ...flanks(-2.76, -0.05, 1.46, 0.44, 1.90, 47),
        ...flanks(0.15, 1.33, 1.46, 0.51, 1.90, 53), ...flanks(1.49, 3.50, 1.46, 0.44, 1.90, 59)],
    },
  },
  // C2 Ariete: the roof netted round both hatches and their MGs, the commander's and gunner's sights, drapes down the
  // turret's rear walls behind the two discharger rows, a rear drape; the engine deck netted round its fan grille, the
  // glacis over its appliqué, four drapes a side over the skirts.
  c2_ariete: {
    id: 'c2_ariete', seed: 2042, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.42, hemFloorM: 0.78,
    // release 230: the front deck's net was lying 13 mm under the barrel at its -6 degree stops (yaw -13..23)
    clothClearsGunStops: true,
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
  c2_ariete_proto: {
    id: 'c2_ariete_proto', seed: 2043, style: 'leafy', ...DENSE, ...WOODLAND,
    // release 231: the hull net is cut round the whole gun's envelope (its mantlet plate's foot passed 11 mm over the
    // track-guard drape at the -7 side stops)
    fieldClearanceM: 0.03, maxHalfWidth: 2.19, hemFloorM: 0.8, conservativeGunEnvelope: true,
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
  // a side. Release 227: the turret net re-laid on the Yun's Type 96B wrap (the 96B roof, its housings' shelves, the
  // bustle module and rear band), open round the faceted station's swept base, the 96B commander's cupola and its
  // secondary-hatch lid; the flank drapes hang on the housings behind the flat tiles, the rear drape over the module.
  t80u_yun: {
    id: 't80u_yun', seed: 8031, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.37, hemFloorM: 0.93,
    turret: {
      top: [laid({ x0: -1.75, x1: 1.75, z0: -2.25, z1: 1.95, nx: 44, nz: 52, y: 0.70,
        holes: [rect(0.06, 0.74, -0.96, -0.28), rect(-1.012, -0.172, -0.315, 0.525), rect(0.18, 1.00, -0.36, 0.23)],
        garnishRiseM: 0.16, seed: 11 })],
      // the marking boards on the housings' bare rear walls (behind the flat tiles) stay clear
      side: flanks(-1.84, -1.28, 0.66, 0.34, 1.62, 17, {}, () => [cut(-1.55, -1.13, 0.30, 0.70)]),
      face: [face({ z: -2.24, x0: -1.20, x1: 1.20, y0: 0.24, y1: 0.58, nx: 24, ny: 6, seed: 23 })],
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
  type96b: {
    id: 'type96b', seed: 9602, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 1.94, hemFloorM: 1.07,
    // release 230 (the gun-hull lane): its hull net was lying 15.8 mm under the gun at its stop at yaw 29 (as the C2's)
    clothClearsGunStops: true,
    turret: {
      // open round the rounded secondary hatch on the right of the roof (its stepped lid is turret detail, not a hatch
      // bucket the builder opens; profiles/easternSourceContact "rounded secondary hatch must expose its measured lid")
      top: [laid({ x0: -1.75, x1: 1.75, z0: -1.95, z1: 1.91, nx: 44, nz: 48, y: 0.70, garnishRiseM: 0.16, seed: 11,
        holes: [rect(0.14, 0.74, -0.25, 0.13)] })],
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
  leclerc_sxxi: {
    id: 'leclerc_sxxi', seed: 5502, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.03, hemFloorM: 0.86,
    // 266 (owner: "clean up the leclercs"; both photo critics: "a hump of net over the turret rear with daylight through
    // it", "a stiff vertical panel"): the roof net ran on over the open bustle cage to z -2.63 and its drape hung off the
    // cage's tail; the net now ends at the bustle box's rear face (-2.35) and the cage stays bare, no drape. The skirt
    // drapes hang to the hem floor over the raised (0.70) skirt foot.
    turret: {
      top: [laid({ x0: -1.68, x1: 1.58, z0: -2.35, z1: 1.99, nx: 41, nz: 54, y: 0.72, garnishRiseM: 0.16, seed: 11 })],
      side: flanks(-0.90, 0.95, 0.76, 0.42, 1.65, 17),
    },
    hull: {
      top: [
        laid({ x0: -1.70, x1: 1.70, z0: -3.15, z1: -0.10, nx: 34, nz: 31, y: 1.70, garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.70, x1: 1.70, z0: -0.10, z1: 3.25, nx: 34, nz: 34, y: 1.62, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.30, 2.42, 1.40, 0.50, 1.83, 41),
    },
  },
  // T-80U Bars-M: the roof netted round its drum-fed station (the builder), sights and hatches, drapes behind each
  // side's smoke bank, a rear drape; the engine deck netted short of the turbine exhaust, the front deck, four drapes a
  // side.
  t80u_bars_m: {
    id: 't80u_bars_m', seed: 8032, style: 'leafy', ...DENSE, ...WOODLAND,
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
  t90am: {
    id: 't90am', seed: 9004, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.13, hemFloorM: 0.72,
    // 245: under its measured curve (turretScaleGunPitch.ts) the front deck's net lay 10.9 mm under the barrel at yaw 37
    clothClearsGunStops: true,
    turret: {
      top: [laid({ x0: -1.87, x1: 1.87, z0: -3.55, z1: 1.40, nx: 47, nz: 62, y: 0.94,
        holes: [rect(0.50, 1.10, 0.45, 1.25), rect(0.08, 0.62, 0.40, 0.90)], garnishRiseM: 0.16, seed: 11 })],
      side: flanks(-3.40, -0.30, 0.98, 0.46, 1.84, 17),
      face: [face({ z: -3.55, x0: -1.30, x1: 1.30, y0: 0.50, y1: 0.92, nx: 26, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        // 245: the engine deck's centre lane carries no garnish under the gun turned aft, whose curve dips to -0.5 degrees
        // at yaw 180 (its leaves stood 19.3 mm under the barrel there)
        laid({ x0: -1.80, x1: 1.80, z0: -3.85, z1: 0.14, nx: 36, nz: 40, y: 1.60, holes: [rect(-1.95, -1.40, -3.50, -2.20)], garnishRiseM: 0.14, seed: 31,
          foliageExclude: [rect(-0.40, 0.40, -3.95, -1.20)] }),
        laid({ x0: -1.80, x1: 1.80, z0: 0.14, z1: 3.70, nx: 36, nz: 36, y: 1.55, garnishRiseM: 0.08, garnishDensity: 0.8, seed: 37 }),
      ],
      side: skirts(-3.05, 3.35, 1.52, 0.48, 1.95, 41, (side) => (side < 0 ? [cut(-3.50, -2.20, 1.00, 1.90)] : [])),
    },
  },
  // Leopard 2A7V: the arrowhead roof netted round the PERI, the EMES head, the hatches and the remote station (the
  // builder), drapes down the walls ahead of and behind the rear smoke banks, a rear drape over the basket; the engine
  // deck netted short of the rear exhaust louvres, the front deck, four drapes a side.
  leo2a7v: {
    id: 'leo2a7v', seed: 2704, style: 'leafy', ...DENSE, ...WOODLAND,
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
      // the left drapes part over the national insignia and the hull number on the left hull side (2026-10-13, integ/222:
      // with the drapes closed the marking solver found no seat with all nine footprint rays clear, sourceXMarkings, and
      // fell back to a seat 0.68 m off the armour; the owner's rule is that markings stay readable, as on the Burlak)
      side: skirts(-3.50, 3.40, 1.62, 0.52, 1.95, 41, (side) => (side < 0 ? [cut(-2.70, -1.30, 1.00, 1.70)] : [])),
    },
  },
  // Leopard 2A5: the wedge roof netted round the PERI, the EMES head, the hatches and the roof gun, drapes down the walls
  // ahead of and behind the rear smoke banks, a rear drape; the engine deck netted short of the rear louvres, the front
  // deck, four drapes a side.
  leo2a5: {
    id: 'leo2a5', seed: 2505, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 1.94, hemFloorM: 0.97,
    // 245: under its measured curve (turretScaleGunPitch.ts) the hull net lay 17.5 mm under the gun at yaw 41
    clothClearsGunStops: true,
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
  // 264: the Leopard 2A6 UA (profiles/leopardA6Ua.ts; the owner, 2026-10-28: "lets add a ton of extra era and cages and
  // ghillie on the actual tank parts themselves"). Turret: the roof and the bustle netted on the armour under the cage
  // (they pass under its raised roof), round the PERI, the EMES head, the hatches, the loader's gun and the whips; the
  // net the 21st Mechanized Brigade's 2A6s throw over their cages (2025 photos) laid on the cage roof's mesh sheet (no
  // lid openings up there: the lids are 0.8 m under it); drapes down the bustle walls behind the smoke banks and over
  // the bustle's rear. The wedges and their Kontakt-1 stay bare. Hull: the front deck netted round the driver's hatch
  // and periscopes; four drapes a side down the rear hull walls above the skirt cassettes, cut round the trident and
  // the tactical number; the engine deck under the bustle's and the gun's sweep carries none.
  leo2a6_ua: {
    id: 'leo2a6_ua', seed: 2606, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.20, hemFloorM: 0.97,
    turret: {
      top: [
        laid({ x0: -1.52, x1: 1.42, z0: -3.78, z1: 0.10, nx: 37, nz: 49, y: 0.28,
          holes: [rect(-0.95, -0.81, -2.99, -2.85), rect(0.845, 0.985, -2.99, -2.85)], garnishRiseM: 0.14, seed: 11 }),
        { x0: -1.62, x1: 1.62, z0: -4.00, z1: 0.15, nx: 33, nz: 42, yAt: () => 1.07, yFromArmour: true, clipToArmour: true,
          // open round the whips and round the roof dock on its rail (leopardA6UaLayout.ts dock seat, turret-local)
          riseLimitM: 0.06, rimScale: 0.5,
          holes: [rect(-0.95, -0.81, -3.09, -2.94), rect(0.845, 0.985, -3.09, -2.94), rect(-1.30, -0.86, -2.45, -2.05)],
          garnishRiseM: 0.08, garnishDensity: 0.7, seed: 13 },
      ],
      side: flanks(-3.55, -2.95, 0.22, 0.38, 1.00, 17),
      face: [face({ z: -3.80, x0: -0.36, x1: 0.60, y0: -0.26, y1: 0.18, nx: 12, ny: 6, seed: 23 })],
    },
    hull: {
      top: [laid({ x0: -1.62, x1: 1.62, z0: 2.05, z1: 2.85, nx: 33, nz: 9, y: 1.58, garnishRiseM: 0.05, garnishDensity: 0.8, seed: 37 })],
      // the marking seats' stretch of the left wall (vehicleMarkings.ts: the 2A6's hull anchor) stays bare
      side: skirts(-3.60, 0.20, 1.80, 0.42, 1.72, 41, (side) => (side < 0 ? [cut(-3.05, -1.15, 1.25, 1.90)] : [])),
    },
  },
  // KF51-U: the roof netted round the commander's and gunner's sights, the hatches and the roof station (the builder),
  // drapes ahead of and behind the smoke banks, a rear drape; the engine deck netted short of the rear louvres, the
  // front deck, four drapes a side.
  kf51_u: {
    id: 'kf51_u', seed: 5101, style: 'leafy', ...DENSE, ...WOODLAND,
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
  spz_wotan: {
    id: 'spz_wotan', seed: 1501, style: 'leafy', ...DENSE, ...WOODLAND,
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
  // ---- Group C (the owner, 2026-10-10): "give the tusk, m1a3, griffin viper, leopard 2 revolution and t90A burlak
  // some! and for those tell them be unafraid of adding these on roofs of hulls or turrets". Full roofs and decks at
  // the Group B density, the glacis tops included at full garnish; the keep-outs are the working ones only (lids open,
  // lenses and sights see, the guns and the turret traverse, the exhausts).
  // M1A2 TUSK: the turret roof and bustle under one net round the CROWS (the builder), the sights and both hatches,
  // drapes down the flanks over the ARAT, a rear drape over the bustle rack; the UA Abrams' hull frame exactly (both
  // decks netted, the driver's hatch and the exhaust end bare), four drapes a side over the ARAT skirts.
  m1a2_abrams_tusk: {
    id: 'm1a2_abrams_tusk', seed: 1305, style: 'leafy', ...DENSE, ...WOODLAND, ...M1A2_X_OPEN_NET,
    fieldClearanceM: 0.03, maxHalfWidth: 2.22, hemFloorM: 0.7,
    // 245: the hull net lay 22 mm under the barrel at its -9.6 degree stop over the deck at yaw 124
    clothClearsGunStops: true,
    turret: {
      top: [laid({ x0: -1.82, x1: 1.70, z0: -3.15, z1: 1.62, nx: 44, nz: 60, y: 0.92, garnishRiseM: 0.16, seed: 11 })],
      side: flanks(-2.45, -0.10, 0.90, 0.46, 1.70, 17),
      face: [face({ z: -3.20, x0: -1.20, x1: 1.20, y0: 0.55, y1: 0.98, nx: 24, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.62, x1: 1.62, z0: -3.62, z1: 0.39, nx: 32, nz: 40, y: 1.72, garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.62, x1: 1.62, z0: 0.39, z1: 3.62, nx: 32, nz: 32, y: 1.50, holes: [rect(-0.38, 0.38, 2.25, 3.00)],
          garnishRiseM: 0.12, seed: 37 }),
      ],
      side: skirts(-3.30, 3.10, 1.54, 0.55, 2.05, 41),
    },
  },
  // M1E3 (the m1a3, rebuilt 2026-10-28; the owner: "it needs all the extra decorations ... we had on the m1a3 ... make
  // it feel really used and lived in"): the turret roof and bustle netted round the station, the sights, the APS heads
  // and the bustle cage (the builder), drapes down the flanks outside the field cage, a rear drape over the basket; the
  // engine deck to the stern rack, the front deck round the hatches and periscopes, four drapes a side over the slab
  // skirts and the flank cages.
  m1a3: {
    id: 'm1a3', seed: 1306, style: 'leafy', ...DENSE, ...WOODLAND,
    // m1e3-264 (nationalGunClearance.selftest): at 3 cm the cut left the front-deck leaves 1 mm under the bore
    // evacuator at the measured front-quarter stops (m1a1GunLimits.ts)
    fieldClearanceM: 0.06, maxHalfWidth: 2.36, hemFloorM: 0.8,
    clothClearsGunStops: true, cardsClearGunStops: true,
    turret: {
      top: [laid({ x0: -1.75, x1: 1.75, z0: -2.98, z1: 1.90, nx: 44, nz: 61, y: 0.88, garnishRiseM: 0.16, seed: 11 })],
      side: flanks(-2.90, -0.20, 0.86, 0.46, 1.82, 17),
      face: [face({ z: -3.30, x0: -1.45, x1: 1.45, y0: 0.40, y1: 0.80, nx: 29, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        // the bore evacuator's path kept bare: over the engine deck where the gun lies level astern (164-180), and over
        // the front shoulders at the front-quarter stops (18-41); the suit's swept-gun cut left cloth 21 mm under it
        laid({ x0: -1.92, x1: 1.92, z0: -3.80, z1: 0.15, nx: 38, nz: 40, y: 1.73, garnishRiseM: 0.14, seed: 31,
          holes: [rect(-1.05, 1.05, -3.25, -2.55)] }),
        laid({ x0: -1.92, x1: 1.92, z0: 0.15, z1: 3.85, nx: 38, nz: 37, y: 1.50, garnishRiseM: 0.12, seed: 37,
          holes: pair(0.80, 1.92, 2.50, 3.45) }),
      ],
      side: skirts(-3.70, 3.50, 1.44, 0.55, 2.06, 41),
    },
  },
  // Griffin Viper: the long flat hull roof netted bow to stern round the Viper station's sweep, the driver's hatch
  // and its periscopes; the small station's roof netted round its sights; three-quarter drapes a side down the hull.
  griffin_viper: {
    id: 'griffin_viper', seed: 5011, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 1.86, hemFloorM: 0.84,
    turret: {
      top: [laid({ x0: -0.72, x1: 0.72, z0: -0.74, z1: 0.86, nx: 18, nz: 20, y: 0.32, garnishRiseM: 0.10, seed: 11 })],
      side: flanks(-0.62, 0.52, 0.30, 0.22, 0.64, 17),
    },
    hull: {
      top: [
        laid({ x0: -1.66, x1: 1.66, z0: -3.04, z1: -0.20, nx: 33, nz: 36, y: 1.92, garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.66, x1: 1.66, z0: -0.20, z1: 3.44, nx: 33, nz: 46, y: 1.90, holes: [rect(0.28, 1.12, 0.98, 1.78)],
          garnishRiseM: 0.12, seed: 37 }),
      ],
      // the right flank is left bare over the towing cable (decorations.ts hullSideCable, 2.35 m long amidships: a load
      // under a drape takes another seat, and the cable has none; profiles/griffinViper.selftest "retain the useful
      // towing cable")
      side: skirts(-2.95, 3.25, 1.82, 0.55, 1.72, 41, (side) => (side > 0 ? [cut(-1.25, 1.25, 0.9, 1.95)] : [])),
    },
  },
  // Leopard 2 Revolution: the wedge roof netted round the sight head, the remote station and both hatches (the
  // builder), drapes down the walls between the front and rear smoke banks, a rear drape; the engine deck short of
  // the rear louvres, the front deck, four drapes a side.
  leo2_revolution: {
    id: 'leo2_revolution', seed: 2709, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.13, hemFloorM: 0.95,
    turret: {
      top: [laid({ x0: -1.64, x1: 1.64, z0: -3.22, z1: 1.98, nx: 41, nz: 65, y: 0.72, garnishRiseM: 0.16, seed: 11 })],
      side: flanks(-2.80, 1.20, 0.70, 0.42, 1.62, 17),
      face: [face({ z: -3.28, x0: -1.10, x1: 1.10, y0: 0.32, y1: 0.68, nx: 22, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.86, x1: 1.86, z0: -3.58, z1: 0.40, nx: 37, nz: 40, y: 1.66, garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.86, x1: 1.86, z0: 0.40, z1: 3.60, nx: 37, nz: 32, y: 1.50, garnishRiseM: 0.12, seed: 37 }),
      ],
      side: skirts(-3.50, 3.40, 1.50, 0.52, 1.98, 41),
    },
  },
  // T-90A Burlak: the turret roof netted round its cupolas, sights and the roof station (the builder), the long
  // Burlak bustle netted to its rails with drapes down its sides, the cheeks' drapes behind the smoke banks, a rear
  // drape; the engine deck (the left rear exhaust bare) and the front deck, four drapes a side.
  t90a_burlak: {
    id: 't90a_burlak', seed: 9005, style: 'leafy', ...DENSE, ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 2.13, hemFloorM: 0.72,
    turret: {
      // open round the commander's sight (its stack carries no glass bucket, so the lens slot is authored: the window
      // looks ahead over the roof from z -0.67)
      top: [laid({ x0: -1.98, x1: 1.98, z0: -3.25, z1: 2.00, nx: 50, nz: 66, y: 0.72, garnishRiseM: 0.16, seed: 11,
        holes: [rect(-0.82, -0.18, -1.12, -0.50), [[-0.70, -0.55], [-0.30, -0.55], [-0.12, 0.85], [-0.88, 0.85]]] })],
      // the left bustle drape parts over the national insignia (2026-10-12, cam-netting: with the denser garnish the
      // marking solver found no seat with all nine footprint rays clear, sourceXSecondWaveMarkings.selftest)
      side: [...flanks(-3.20, -1.45, 0.62, 0.40, 0.95, 17, {}, (side) => (side < 0 ? [cut(-2.95, -2.33, 0, 0.66)] : [])),
        ...flanks(-1.30, 0.40, 0.66, 0.38, 1.86, 19)],
      face: [face({ z: -3.30, x0: -0.82, x1: 0.82, y0: 0.24, y1: 0.60, nx: 16, ny: 6, seed: 23 })],
    },
    hull: {
      top: [
        laid({ x0: -1.76, x1: 1.76, z0: -3.70, z1: 0.10, nx: 35, nz: 38, y: 1.50, holes: [rect(-1.95, -1.40, -3.50, -2.20)],
          garnishRiseM: 0.14, seed: 31 }),
        laid({ x0: -1.76, x1: 1.76, z0: 0.10, z1: 3.62, nx: 35, nz: 35, y: 1.40, garnishRiseM: 0.12, seed: 37 }),
      ],
      side: skirts(-3.10, 3.40, 1.42, 0.46, 1.90, 41, (side) => (side < 0 ? [cut(-3.50, -2.20, 1.00, 1.90)] : [])),
    },
  },
  // ---- the S-tanks (the coordinator, 2026-10-11, wave 411a: the Strv 103's drone dock stood on bare armour between
  // two round-5 net panels and the band read as frosted glass) --------------------------------------------------------
  // Strv 103B: the field net closed over the whole deck and the gun housing, held clear of the drone dock (its seat's
  // cradle and launch column); a corridor only over the fixed gun's barrel where it lies along the deck (z 1.05 on), the
  // commander's cupola with its machine gun and the driver's hatch opened as the round-5 suit had them, the lens slots
  // by the builder; each flank one drape from the deck edge over the upper running gear.
  strv103b: {
    id: 'strv103b', seed: 1032, style: 'leafy', density: 1.25, leafScale: 0.92, foliageKind: 'spruce', ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 1.95, hemFloorM: 0.95,
    hull: {
      top: [laid({
        x0: -1.66, x1: 1.66, z0: -3.76, z1: 3.24, nx: 33, nz: 70, y: 1.75,
        outline: [[-1.42, -3.76], [1.42, -3.76], [1.66, -2.70], [1.64, 2.35], [0.92, 3.24], [-0.92, 3.24], [-1.64, 2.35], [-1.66, -2.70]],
        holes: [rect(-0.16, 0.16, 1.05, 3.36), rect(-0.22, 0.92, -0.88, 0.58), rect(-0.98, -0.30, -1.44, -0.72)],
        garnishRiseM: 0.14, seed: 87,
      })],
      side: [-1, 1].map((side) => ({ side, z0: -3.58, z1: 2.72, nz: 44, ny: 7,
        topAt: (z: number) => STRV103B_DECK(z) - 0.02,
        bottomAt: (z: number) => 0.98 + Math.sin(z * 2.5) * 0.04,
        outAt: (_z: number, t: number) => 1.87 + (1 - t) * 0.028, seed: 93 + side })),
    },
  },
  // Strv 103A: as the 103B; its barrel lies on the deck from z 1.5, its spare links on the right glacis shoulder keep
  // their opening (round 4), the cupola's opening reaches over the machine gun.
  strv103a: {
    id: 'strv103a', seed: 1031, style: 'leafy', density: 1.25, leafScale: 0.90, foliageKind: 'spruce', ...WOODLAND,
    fieldClearanceM: 0.03, maxHalfWidth: 1.95, hemFloorM: 0.98,
    hull: {
      top: [laid({
        x0: -1.66, x1: 1.66, z0: -3.30, z1: 3.46, nx: 33, nz: 68, y: 1.85,
        outline: [[-1.30, -3.30], [1.30, -3.30], [1.66, -2.65], [1.65, 2.40], [1.16, 3.46], [-1.16, 3.46], [-1.65, 2.40], [-1.66, -2.65]],
        holes: [rect(-0.16, 0.16, 1.50, 3.58), rect(0.03, 0.91, -1.30, 0.62), rect(-0.90, -0.28, -1.22, -0.46),
          rect(0.62, 1.34, 1.96, 2.64)],
        garnishRiseM: 0.14, seed: 71,
      })],
      side: [-1, 1].flatMap((side) => [[-3.12, -0.62, 0], [0.12, 2.40, 1]].map(([z0, z1, k]) => ({ side, z0, z1,
        nz: k ? 18 : 20, ny: 7,
        topAt: (z: number) => STRV103A_DECK(z) - 0.02,
        bottomAt: (z: number) => 1.02 + Math.sin(z * 2.7) * 0.04,
        outAt: (_z: number, t: number) => 1.84 + (1 - t) * 0.030, seed: 79 + side + k * 7 }))),
    },
  },
});
