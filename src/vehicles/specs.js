// src/vehicles/specs.js — pure gameplay stat + armor data for the 8-tank roster.
// PURE data module: no three import, no side effects. Runs under plain node.
// Sources: docs/research/tank-roster.md (+ locked overrides in docs/ARCHITECTURE.md §3.3.1).
// Units per ARCHITECTURE §1.2 — suffixed fields keep human units; consumers convert.

/** Locked roster ids in locked garage-carousel order (ARCHITECTURE §2.1). */
export const TANK_IDS = ['m4a3e8', 'tiger1', 't34_85', 'is2', 'panther_g', 'm1a2', 't90m', 'leo2a7'];

// ---------------------------------------------------------------------------
// Plate helpers (pure array math). Every quad is built as a PARALLELOGRAM
// (v2 = v1 + v3 - v0) which guarantees planarity. Winding is CCW seen from
// outside: outward normal = normalize(cross(v1-v0, v3-v0)).
// ---------------------------------------------------------------------------

function par(name, physicalMm, v0, v1, v3, o = {}) {
  const v2 = [v1[0] + v3[0] - v0[0], v1[1] + v3[1] - v0[1], v1[2] + v3[2] - v0[2]];
  return {
    name,
    verts: [v0, v1, v2, v3],
    physicalMm,
    keMm: o.keMm !== undefined ? o.keMm : physicalMm,
    ceMm: o.ceMm !== undefined ? o.ceMm : physicalMm,
    kind: o.kind || 'main',
    era: o.era || null,
    moduleLink: o.moduleLink || null,
    gunFollow: !!o.gunFollow,
  };
}

// Front-facing plate: spans x in [-w,w], bottom edge (yB,zB) -> top edge (yT,zT).
const fr = (name, mm, w, yB, zB, yT, zT, o) =>
  par(name, mm, [-w, yB, zB], [w, yB, zB], [-w, yT, zT], o);
// Rear-facing plate (outward -Z).
const rr = (name, mm, w, yB, zB, yT, zT, o) =>
  par(name, mm, [w, yB, zB], [-w, yB, zB], [w, yT, zT], o);
// Right side (+X outward): bottom edge (xB,yB) -> top edge (xT,yT), z in [zR,zF].
const sR = (name, mm, xB, yB, xT, yT, zR, zF, o) =>
  par(name, mm, [xB, yB, zF], [xB, yB, zR], [xT, yT, zF], o);
// Left side (-X outward).
const sL = (name, mm, xB, yB, xT, yT, zR, zF, o) =>
  par(name, mm, [-xB, yB, zR], [-xB, yB, zF], [-xT, yT, zR], o);
// Roof (outward +Y): x in [-w,w], z in [zR,zF] at height y.
const rf = (name, mm, w, y, zR, zF, o) =>
  par(name, mm, [-w, y, zF], [w, y, zF], [-w, y, zR], o);
// Right turret cheek, angled in plan: inner-front edge (xIn,zIn) -> outer edge (xOut,zOut),
// vertical span [y0,y1], optional top setback tb (slope-back) & inward shift xi.
const chR = (name, mm, xIn, zIn, xOut, zOut, y0, y1, tb = 0, xi = 0, o) =>
  par(name, mm, [xIn, y0, zIn], [xOut, y0, zOut], [xIn - xi, y1, zIn - tb], o);
const chL = (name, mm, xIn, zIn, xOut, zOut, y0, y1, tb = 0, xi = 0, o) =>
  par(name, mm, [-xOut, y0, zOut], [-xIn, y0, zIn], [-xOut + xi, y1, zOut - tb], o);

const mbox = (module, min, max, turretLocal = false) => ({ module, min, max, turretLocal });
const cbox = (crew, min, max, turretLocal = false) => ({ crew, min, max, turretLocal });

// Shell factory. Types: roster APHE/APCBC/APBC -> 'AP'; HVAP -> 'APCR'.
const shell = (name, type, caliberMm, pen100Mm, pen1000Mm, dmg, velocityMps) => ({
  name, type, caliberMm, pen100Mm, pen1000Mm, dmg, velocityMps,
  moduleDmg: caliberMm, tracer: type,
});

// Modern pens are roster-quoted @2 km (ARCHITECTURE §2.2):
//   pen1000Mm = quoted2km / (1 - lossPer100m*10); pen100Mm = pen1000Mm / (1 - lossPer100m*9).
// APFSDS lossPer100m = 0.01 -> pen1000 = q/0.90, pen100 = pen1000/0.91.
// HEAT / HE have zero falloff -> pen100 = pen1000 = quoted.
const apfsdsPens = (quoted2km) => {
  const pen1000 = quoted2km / 0.90;
  return [Math.round(pen1000 / 0.91), Math.round(pen1000)];
};

const BLOOM_WW2 = { move: 0.20, hullRot: 0.20, turret: 0.12, afterShot: 4 };
const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 3 };

// ---------------------------------------------------------------------------
// M4A3E8 Sherman "Easy Eight"
// ---------------------------------------------------------------------------
function armorM4() {
  const hw = 1.5, inW = 0.92, roofY = 1.93, trkTop = 1.10, floor = 0.43;
  return {
    boundingRadiusM: 4.1,
    turretPivot: [0, 1.93, 0.4],
    gunPivot: [0, 0.35, 0.55],
    gunBarrel: { lengthM: 3.96, radiusM: 0.07 },
    hullPlates: [
      fr('upper_glacis', 63.5, 1.45, 1.0, 3.10, roofY, 2.10),          // 47 deg
      fr('lower_front', 89, 1.45, floor, 2.75, 1.0, 3.10),             // cast transmission nose
      sR('hull_side_upper_R', 38, hw, trkTop, hw, roofY, -3.13, 3.0),
      sL('hull_side_upper_L', 38, hw, trkTop, hw, roofY, -3.13, 3.0),
      sR('hull_side_lower_R', 38, inW, floor, inW, trkTop, -3.0, 2.9),
      sL('hull_side_lower_L', 38, inW, floor, inW, trkTop, -3.0, 2.9),
      sR('track_R', 20, 1.35, 0.15, 1.35, trkTop, -3.1, 3.1, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, 1.35, 0.15, 1.35, trkTop, -3.1, 3.1, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 38, 1.45, 0.5, -2.88, roofY, -3.13),             // 10 deg
      rf('hull_roof', 25, 1.45, roofY, -3.13, 2.10),
    ],
    turretPlates: [
      fr('turret_front', 63.5, 0.5, 0.05, 0.72, 0.62, 0.66),
      chR('turret_cheek_R', 63.5, 0.5, 0.72, 0.85, 0.30, 0.05, 0.62),
      chL('turret_cheek_L', 63.5, 0.5, 0.72, 0.85, 0.30, 0.05, 0.62),
      sR('turret_side_R', 63.5, 0.85, 0.02, 0.80, 0.66, -0.95, 0.30),
      sL('turret_side_L', 63.5, 0.85, 0.02, 0.80, 0.66, -0.95, 0.30),
      rr('turret_rear', 63.5, 0.72, 0.05, -1.0, 0.62, -1.05),
      rf('turret_roof', 25, 0.85, 0.70, -1.0, 0.6),
      par('mantlet', 89, [-0.65, 0.08, 0.86], [0.65, 0.08, 0.86], [-0.65, 0.62, 0.82],
        { kind: 'spaced', gunFollow: true }),
    ],
    modules: [
      mbox('engine', [-0.85, 0.5, -3.0], [0.85, 1.7, -1.6]),
      mbox('fuelTank', [-0.9, 0.5, -1.55], [0.9, 1.2, -0.9]),
      mbox('ammoRack', [-0.9, 0.5, -0.6], [0.9, 1.0, 0.9]),
      mbox('turretRing', [-0.8, 1.75, -0.45], [0.8, 1.95, 1.25]),
      mbox('radio', [0.2, 1.1, 1.7], [0.8, 1.6, 2.4]),
      mbox('optics', [0.15, 0.62, 0.15], [0.5, 0.85, 0.55], true),
      mbox('gun', [-0.15, 0.15, -0.3], [0.15, 0.55, 0.55], true),
      mbox('trackL', [-1.5, 0.0, -3.1], [-0.92, trkTop, 3.1]),
      mbox('trackR', [0.92, 0.0, -3.1], [1.5, trkTop, 3.1]),
    ],
    crew: [
      cbox('driver', [-0.85, 0.7, 1.6], [-0.15, 1.6, 2.6]),
      cbox('gunner', [0.15, 0.05, 0.0], [0.68, 0.62, 0.55], true),
      cbox('commander', [0.15, 0.05, -0.65], [0.72, 0.68, -0.05], true),
      cbox('loader', [-0.68, 0.05, -0.35], [-0.12, 0.62, 0.4], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// Tiger I
// ---------------------------------------------------------------------------
function armorTiger() {
  const hw = 1.855, inW = 1.13, roofY = 1.96, trkTop = 1.15, floor = 0.47;
  return {
    boundingRadiusM: 4.55,
    turretPivot: [0, 1.96, 0.25],
    gunPivot: [0, 0.40, 0.55],
    gunBarrel: { lengthM: 4.5, radiusM: 0.085 },
    hullPlates: [
      fr('lower_front', 100, 1.5, floor, 2.92, 1.0, 3.16),             // 24 deg
      fr('driver_plate', 100, 1.5, 1.0, 3.16, roofY, 3.01),            // ~9 deg
      sR('hull_side_upper_R', 80, hw, 1.05, hw, roofY, -3.16, 3.01),
      sL('hull_side_upper_L', 80, hw, 1.05, hw, roofY, -3.16, 3.01),
      sR('hull_side_lower_R', 60, inW, floor, inW, trkTop, -3.05, 2.95),
      sL('hull_side_lower_L', 60, inW, floor, inW, trkTop, -3.05, 2.95),
      sR('track_R', 20, 1.49, 0.15, 1.49, trkTop, -3.16, 3.1, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, 1.49, 0.15, 1.49, trkTop, -3.16, 3.1, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 80, 1.5, 0.6, -2.97, roofY, -3.16),              // 8 deg
      rf('hull_roof', 30, 1.7, roofY, -3.16, 3.01),
    ],
    turretPlates: [
      fr('turret_front', 100, 1.15, 0.02, 0.64, 0.80, 0.64),           // vertical slab
      sR('turret_side_R', 80, 1.26, 0.02, 1.26, 0.80, -1.1, 0.62),
      sL('turret_side_L', 80, 1.26, 0.02, 1.26, 0.80, -1.1, 0.62),
      rr('turret_rear', 80, 1.2, 0.02, -1.72, 0.80, -1.78),
      rf('turret_roof', 30, 1.26, 0.84, -1.78, 0.62),
      par('mantlet', 120, [-1.05, 0.06, 0.9], [1.05, 0.06, 0.9], [-1.05, 0.74, 0.88],
        { kind: 'spaced', gunFollow: true }),
    ],
    modules: [
      mbox('engine', [-0.95, 0.5, -3.0], [0.95, 1.8, -1.5]),
      mbox('fuelTank', [-1.05, 0.5, -1.45], [1.05, 1.3, -0.8]),
      mbox('ammoRack', [-1.6, 0.6, -0.3], [1.6, 1.15, 1.4]),           // sponson racks
      mbox('turretRing', [-0.85, 1.78, -0.65], [0.85, 1.98, 1.15]),
      mbox('radio', [0.3, 1.2, 2.0], [1.0, 1.8, 2.9]),
      mbox('optics', [0.15, 0.66, 0.2], [0.5, 0.9, 0.6], true),
      mbox('gun', [-0.16, 0.18, -0.35], [0.16, 0.62, 0.6], true),
      mbox('trackL', [-1.855, 0.0, -3.16], [-1.13, trkTop, 3.16]),
      mbox('trackR', [1.13, 0.0, -3.16], [1.855, trkTop, 3.16]),
    ],
    crew: [
      cbox('driver', [-1.0, 0.7, 1.9], [-0.25, 1.7, 2.95]),
      cbox('gunner', [-0.72, 0.05, 0.0], [-0.15, 0.65, 0.6], true),
      cbox('commander', [-0.75, 0.05, -0.7], [-0.15, 0.72, -0.1], true),
      cbox('loader', [0.15, 0.05, -0.3], [0.72, 0.65, 0.45], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// T-34-85
// ---------------------------------------------------------------------------
function armorT34() {
  const trkTop = 1.05, floor = 0.4, roofY = 1.70;
  return {
    boundingRadiusM: 4.35,
    turretPivot: [0, 1.70, 0.55],
    gunPivot: [0, 0.35, 0.5],
    gunBarrel: { lengthM: 4.64, radiusM: 0.075 },
    hullPlates: [
      fr('upper_glacis', 45, 1.45, 0.7, 2.95, roofY, 1.30),            // 60 deg
      fr('lower_glacis', 45, 1.45, floor, 2.55, 0.7, 2.95),            // 53 deg
      sR('hull_side_upper_R', 45, 1.5, trkTop, 0.96, roofY, -2.9, 1.5),
      sL('hull_side_upper_L', 45, 1.5, trkTop, 0.96, roofY, -2.9, 1.5),
      sR('hull_side_lower_R', 45, 1.0, floor, 1.0, trkTop, -2.85, 2.55),
      sL('hull_side_lower_L', 45, 1.0, floor, 1.0, trkTop, -2.85, 2.55),
      sR('track_R', 15, 1.25, 0.15, 1.25, trkTop, -3.05, 3.05, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 15, 1.25, 0.15, 1.25, trkTop, -3.05, 3.05, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear_upper', 45, 1.35, 1.0, -2.30, roofY, -3.05),       // 47 deg
      rr('hull_rear_lower', 45, 1.35, floor, -2.15, 1.0, -2.30),
      rf('hull_roof', 20, 0.96, roofY, -2.9, 1.30),
    ],
    turretPlates: [
      fr('turret_front', 90, 0.32, 0.05, 0.85, 0.6, 0.78),
      chR('turret_cheek_R', 90, 0.32, 0.85, 0.85, 0.35, 0.05, 0.6, 0.07),
      chL('turret_cheek_L', 90, 0.32, 0.85, 0.85, 0.35, 0.05, 0.6, 0.07),
      sR('turret_side_R', 75, 0.93, 0.02, 0.76, 0.68, -0.7, 0.35),     // ~20 deg inward
      sL('turret_side_L', 75, 0.93, 0.02, 0.76, 0.68, -0.7, 0.35),
      rr('turret_rear', 60, 0.8, 0.05, -0.85, 0.6, -0.9),
      rf('turret_roof', 20, 0.8, 0.70, -0.85, 0.55),
      par('mantlet', 90, [-0.38, 0.12, 0.98], [0.38, 0.12, 0.98], [-0.38, 0.55, 0.95],
        { kind: 'spaced', gunFollow: true }),
    ],
    modules: [
      mbox('engine', [-0.85, 0.45, -2.8], [0.85, 1.5, -1.3]),
      mbox('fuelTank', [0.55, 0.7, 0.6], [1.15, 1.4, 1.9]),            // front sponson fuel
      mbox('ammoRack', [-0.85, 0.4, -0.6], [0.85, 0.8, 0.9]),          // floor stowage
      mbox('turretRing', [-0.8, 1.52, -0.25], [0.8, 1.72, 1.35]),
      mbox('radio', [-1.05, 0.9, 1.3], [-0.45, 1.4, 2.0]),
      mbox('optics', [0.1, 0.6, 0.25], [0.45, 0.85, 0.6], true),
      mbox('gun', [-0.14, 0.15, -0.3], [0.14, 0.55, 0.5], true),
      mbox('trackL', [-1.5, 0.0, -3.05], [-1.0, trkTop, 3.05]),
      mbox('trackR', [1.0, 0.0, -3.05], [1.5, trkTop, 3.05]),
    ],
    crew: [
      cbox('driver', [-0.85, 0.6, 1.5], [-0.15, 1.5, 2.5]),
      cbox('gunner', [-0.7, 0.05, -0.1], [-0.15, 0.6, 0.5], true),
      cbox('commander', [-0.7, 0.05, -0.7], [-0.12, 0.65, -0.15], true),
      cbox('loader', [0.15, 0.05, -0.4], [0.7, 0.6, 0.35], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// IS-2 (model 1944)
// ---------------------------------------------------------------------------
function armorIS2() {
  const trkTop = 1.10, floor = 0.45, roofY = 1.80;
  return {
    boundingRadiusM: 5.25,
    turretPivot: [0, 1.80, 0.1],
    gunPivot: [0, 0.35, 0.55],
    gunBarrel: { lengthM: 5.85, radiusM: 0.095 },
    hullPlates: [
      fr('upper_glacis', 100, 1.45, 0.95, 3.30, roofY, 1.83),          // 60 deg
      fr('lower_glacis', 100, 1.45, floor, 3.01, 0.95, 3.30),          // 30 deg
      sR('hull_side_upper_R', 90, 1.545, trkTop, 1.42, roofY, -2.85, 1.85),
      sL('hull_side_upper_L', 90, 1.545, trkTop, 1.42, roofY, -2.85, 1.85),
      sR('hull_side_lower_R', 90, 0.9, floor, 0.9, trkTop, -2.85, 3.0),
      sL('hull_side_lower_L', 90, 0.9, floor, 0.9, trkTop, -2.85, 3.0),
      sR('track_R', 20, 1.28, 0.15, 1.28, trkTop, -3.38, 3.38, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, 1.28, 0.15, 1.28, trkTop, -3.38, 3.38, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear_upper', 60, 1.4, 1.2, -2.86, roofY, -3.38),        // 41 deg
      rr('hull_rear_lower', 60, 1.4, floor, -2.86, 1.2, -2.86),
      rf('hull_roof', 30, 1.42, roofY, -2.85, 1.83),
    ],
    turretPlates: [
      fr('turret_front', 100, 0.35, 0.05, 0.80, 0.58, 0.72),
      chR('turret_cheek_R', 100, 0.35, 0.80, 0.85, 0.30, 0.05, 0.58, 0.08),
      chL('turret_cheek_L', 100, 0.35, 0.80, 0.85, 0.30, 0.05, 0.58, 0.08),
      sR('turret_side_R', 90, 0.9, 0.02, 0.74, 0.66, -0.75, 0.30),
      sL('turret_side_L', 90, 0.9, 0.02, 0.74, 0.66, -0.75, 0.30),
      rr('turret_rear', 90, 0.75, 0.05, -0.95, 0.58, -1.0),
      rf('turret_roof', 30, 0.8, 0.68, -0.95, 0.5),
      par('mantlet', 100, [-0.42, 0.1, 0.95], [0.42, 0.1, 0.95], [-0.42, 0.58, 0.92],
        { kind: 'spaced', gunFollow: true }),
    ],
    modules: [
      mbox('engine', [-0.85, 0.5, -3.1], [0.85, 1.7, -1.6]),
      mbox('fuelTank', [-0.9, 0.5, -1.55], [0.9, 1.25, -0.9]),
      mbox('ammoRack', [-0.85, 0.5, -0.7], [0.85, 1.0, 0.8]),          // two-piece rounds, hull
      mbox('turretRing', [-0.82, 1.62, -0.7], [0.82, 1.82, 0.9]),
      mbox('radio', [0.3, 1.1, 1.9], [0.95, 1.6, 2.7]),
      mbox('optics', [-0.45, 0.6, 0.2], [-0.1, 0.85, 0.55], true),
      mbox('gun', [-0.18, 0.15, -0.45], [0.18, 0.58, 0.55], true),
      mbox('trackL', [-1.545, 0.0, -3.38], [-0.9, trkTop, 3.38]),
      mbox('trackR', [0.9, 0.0, -3.38], [1.545, trkTop, 3.38]),
    ],
    crew: [
      cbox('driver', [-0.35, 0.65, 1.9], [0.35, 1.55, 2.9]),
      cbox('gunner', [-0.72, 0.05, -0.15], [-0.15, 0.6, 0.45], true),
      cbox('commander', [-0.75, 0.05, -0.75], [-0.15, 0.68, -0.2], true),
      cbox('loader', [0.15, 0.05, -0.45], [0.72, 0.62, 0.3], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// Panther Ausf. G
// ---------------------------------------------------------------------------
function armorPanther() {
  const trkTop = 1.15, floor = 0.52, roofY = 1.85;
  return {
    boundingRadiusM: 4.65,
    turretPivot: [0, 1.85, -0.25],
    gunPivot: [0, 0.35, 0.5],
    gunBarrel: { lengthM: 5.25, radiusM: 0.07 },
    hullPlates: [
      fr('upper_glacis', 80, 1.55, 0.8, 3.30, roofY, 1.80),            // 55 deg
      fr('lower_glacis', 50, 1.55, floor, 2.90, 0.8, 3.30),            // 55 deg
      sR('hull_side_upper_R', 50, 1.71, trkTop, 1.32, roofY, -3.1, 2.3),  // 29 deg
      sL('hull_side_upper_L', 50, 1.71, trkTop, 1.32, roofY, -3.1, 2.3),
      sR('hull_side_lower_R', 40, 1.05, floor, 1.05, trkTop, -3.0, 2.8),
      sL('hull_side_lower_L', 40, 1.05, floor, 1.05, trkTop, -3.0, 2.8),
      sR('skirt_R', 5, 1.72, 0.6, 1.72, 1.2, -2.6, 2.4, { kind: 'spaced' }),
      sL('skirt_L', 5, 1.72, 0.6, 1.72, 1.2, -2.6, 2.4, { kind: 'spaced' }),
      sR('track_R', 20, 1.38, 0.15, 1.38, trkTop, -3.43, 3.43, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, 1.38, 0.15, 1.38, trkTop, -3.43, 3.43, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 40, 1.5, 0.55, -2.68, roofY, -3.43),             // 30 deg
      rf('hull_roof', 25, 1.32, roofY, -3.1, 1.80),
    ],
    turretPlates: [
      fr('turret_front', 100, 0.45, 0.05, 0.72, 0.75, 0.57),           // 12 deg
      chR('turret_side_R', 45, 0.5, 0.70, 0.95, -0.90, 0.02, 0.75, 0, 0.35),  // wedge + 25 deg in
      chL('turret_side_L', 45, 0.5, 0.70, 0.95, -0.90, 0.02, 0.75, 0, 0.35),
      rr('turret_rear', 45, 0.85, 0.02, -0.92, 0.75, -1.0),
      rf('turret_roof', 25, 0.62, 0.76, -0.95, 0.55),
      par('mantlet', 100, [-0.48, 0.1, 0.85], [0.48, 0.1, 0.85], [-0.48, 0.6, 0.80],
        { kind: 'spaced', gunFollow: true }),
    ],
    modules: [
      mbox('engine', [-0.95, 0.55, -3.1], [0.95, 1.75, -1.7]),
      mbox('fuelTank', [-1.0, 0.55, -1.65], [1.0, 1.3, -1.0]),
      mbox('ammoRack', [-1.45, 0.7, -0.3], [1.45, 1.3, 1.6]),          // sponson racks
      mbox('turretRing', [-0.85, 1.67, -1.1], [0.85, 1.87, 0.6]),
      mbox('radio', [0.3, 1.1, 2.0], [1.0, 1.6, 2.8]),
      mbox('optics', [0.1, 0.65, 0.15], [0.45, 0.9, 0.55], true),
      mbox('gun', [-0.15, 0.15, -0.35], [0.15, 0.58, 0.55], true),
      mbox('trackL', [-1.71, 0.0, -3.43], [-1.05, trkTop, 3.43]),
      mbox('trackR', [1.05, 0.0, -3.43], [1.71, trkTop, 3.43]),
    ],
    crew: [
      cbox('driver', [-1.0, 0.7, 1.7], [-0.25, 1.7, 2.7]),
      cbox('gunner', [-0.68, 0.05, -0.05], [-0.12, 0.65, 0.55], true),
      cbox('commander', [-0.7, 0.05, -0.75], [-0.12, 0.72, -0.15], true),
      cbox('loader', [0.15, 0.05, -0.4], [0.7, 0.65, 0.4], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// M1A2 Abrams SEPv3 (composite: keMm/ceMm are RHAe estimates; physicalMm for geometry)
// ---------------------------------------------------------------------------
function armorM1A2() {
  const trkTop = 1.05, floor = 0.45, roofY = 1.47;
  return {
    boundingRadiusM: 5.2,
    turretPivot: [0, 1.47, -0.2],
    gunPivot: [0, 0.30, 0.75],
    gunBarrel: { lengthM: 5.28, radiusM: 0.11 },
    hullPlates: [
      fr('upper_glacis', 38, 1.6, 1.0, 3.90, roofY, 1.60, { keMm: 120, ceMm: 120 }),  // ~76 deg
      fr('lower_front', 650, 1.6, floor, 3.50, 1.0, 3.90, { keMm: 600, ceMm: 750 }),
      sR('hull_side_upper_R', 40, 1.83, trkTop, 1.83, roofY, -3.9, 1.6),
      sL('hull_side_upper_L', 40, 1.83, trkTop, 1.83, roofY, -3.9, 1.6),
      sR('hull_side_lower_R', 40, 1.19, floor, 1.19, trkTop, -3.8, 3.5),
      sL('hull_side_lower_L', 40, 1.19, floor, 1.19, trkTop, -3.8, 3.5),
      sR('skirt_front_R', 70, 1.86, 0.6, 1.86, 1.07, 0.9, 3.9, { kind: 'spaced', keMm: 150, ceMm: 450 }),
      sL('skirt_front_L', 70, 1.86, 0.6, 1.86, 1.07, 0.9, 3.9, { kind: 'spaced', keMm: 150, ceMm: 450 }),
      sR('skirt_rear_R', 10, 1.86, 0.6, 1.86, 1.07, -3.9, 0.9, { kind: 'spaced' }),
      sL('skirt_rear_L', 10, 1.86, 0.6, 1.86, 1.07, -3.9, 0.9, { kind: 'spaced' }),
      sR('track_R', 25, 1.51, 0.15, 1.51, trkTop, -3.96, 3.96, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 25, 1.51, 0.15, 1.51, trkTop, -3.96, 3.96, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 30, 1.6, floor, -3.96, roofY, -3.96),
      rf('hull_roof', 40, 1.6, roofY, -3.96, 1.60),
    ],
    turretPlates: [
      chR('turret_cheek_R', 800, 0.24, 1.12, 1.66, 0.26, 0.0, 0.85, 0.13, 0, { keMm: 850, ceMm: 1250 }),
      chL('turret_cheek_L', 800, 0.24, 1.12, 1.66, 0.26, 0.0, 0.85, 0.13, 0, { keMm: 850, ceMm: 1250 }),
      par('mantlet', 300, [-0.28, 0.05, 1.12], [0.28, 0.05, 1.12], [-0.28, 0.52, 1.09],
        { keMm: 350, ceMm: 450, gunFollow: true }),
      sR('turret_side_R', 350, 1.66, 0.0, 1.66, 0.85, -2.62, 0.12, { keMm: 380, ceMm: 500 }),
      sL('turret_side_L', 350, 1.66, 0.0, 1.66, 0.85, -2.62, 0.12, { keMm: 380, ceMm: 500 }),
      rr('turret_rear', 40, 1.62, 0.0, -2.62, 0.85, -2.62),            // ammo blow-off zone
      rf('turret_roof', 40, 1.62, 0.86, -2.62, 0.6),
      rr('bustle_rack', 10, 1.58, 0.15, -3.34, 0.75, -3.34, { kind: 'external' }),
    ],
    modules: [
      mbox('engine', [-1.0, 0.5, -3.85], [1.0, 1.5, -2.0]),
      mbox('fuelTank', [-1.15, 0.5, 2.4], [-0.45, 1.4, 3.6]),          // front-left fuel cell
      mbox('ammoRack', [-0.85, 0.0, -2.55], [0.85, 0.75, -0.9], true),// turret bustle
      mbox('turretRing', [-0.95, 1.37, -1.3], [0.95, 1.57, 0.9]),
      mbox('radio', [-0.6, 0.1, -0.85], [-0.1, 0.5, -0.35], true),
      mbox('optics', [0.35, 0.82, 0.35], [0.8, 1.1, 0.85], true),      // GPS doghouse
      mbox('gun', [-0.18, 0.05, -0.5], [0.18, 0.55, 0.75], true),
      mbox('trackL', [-1.83, 0.0, -3.96], [-1.19, trkTop, 3.96]),
      mbox('trackR', [1.19, 0.0, -3.96], [1.83, trkTop, 3.96]),
    ],
    crew: [
      cbox('driver', [-0.35, 0.55, 2.3], [0.35, 1.15, 3.4]),
      cbox('gunner', [0.25, 0.0, -0.1], [0.85, 0.7, 0.6], true),
      cbox('commander', [0.25, 0.05, -0.85], [0.9, 0.78, -0.2], true),
      cbox('loader', [-0.9, 0.0, -0.55], [-0.25, 0.75, 0.4], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// T-90M Proryv (Relikt ERA: consumable tiles, keReduction 0.25 / ceFlat 500)
// ---------------------------------------------------------------------------
function armorT90M() {
  const trkTop = 1.0, floor = 0.43, roofY = 1.45;
  const relikt = { keReduction: 0.25, ceFlatMm: 500 };
  const reliktSkirt = { keReduction: 0.15, ceFlatMm: 350 };
  return {
    boundingRadiusM: 5.1,
    turretPivot: [0, 1.45, 0.15],
    gunPivot: [0, 0.32, 0.55],
    gunBarrel: { lengthM: 6.0, radiusM: 0.105 },
    hullPlates: [
      fr('glacis_era_L', 15, 0.78, 0.95, 3.42, 1.42, 2.02, { kind: 'era', era: relikt }),
      fr('upper_glacis', 500, 1.55, 0.85, 3.35, roofY, 1.85, { keMm: 480, ceMm: 650 }), // 68 deg
      fr('lower_front', 80, 1.55, floor, 3.05, 0.85, 3.35, { keMm: 100, ceMm: 100 }),
      sR('hull_side_upper_R', 70, 1.89, trkTop, 1.89, roofY, -3.4, 1.9, { keMm: 80, ceMm: 80 }),
      sL('hull_side_upper_L', 70, 1.89, trkTop, 1.89, roofY, -3.4, 1.9, { keMm: 80, ceMm: 80 }),
      sR('hull_side_lower_R', 70, 1.31, floor, 1.31, trkTop, -3.3, 3.0, { keMm: 80, ceMm: 80 }),
      sL('hull_side_lower_L', 70, 1.31, floor, 1.31, trkTop, -3.3, 3.0, { keMm: 80, ceMm: 80 }),
      sR('skirt_era_R', 15, 1.90, 0.45, 1.90, 1.05, 0.2, 3.3, { kind: 'era', era: reliktSkirt }),
      sL('skirt_era_L', 15, 1.90, 0.45, 1.90, 1.05, 0.2, 3.3, { kind: 'era', era: reliktSkirt }),
      sR('skirt_rubber_R', 8, 1.90, 0.45, 1.90, 1.05, -3.3, 0.2, { kind: 'spaced' }),
      sL('skirt_rubber_L', 8, 1.90, 0.45, 1.90, 1.05, -3.3, 0.2, { kind: 'spaced' }),
      sR('track_R', 20, 1.60, 0.12, 1.60, trkTop, -3.43, 3.43, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, 1.60, 0.12, 1.60, trkTop, -3.43, 3.43, { kind: 'external', moduleLink: 'trackL' }),
      rr('slat_cage', 10, 1.5, 0.5, -3.6, 1.3, -3.6, { kind: 'spaced' }),
      rr('hull_rear', 45, 1.55, floor, -3.43, roofY, -3.43),
      rf('hull_roof', 40, 1.55, roofY, -3.4, 1.85),
    ],
    turretPlates: [
      chR('turret_era_R', 15, 0.24, 0.86, 0.94, 0.28, 0.05, 0.60, 0.08, 0, { kind: 'era', era: relikt }),
      chL('turret_era_L', 15, 0.24, 0.86, 0.94, 0.28, 0.05, 0.60, 0.08, 0, { kind: 'era', era: relikt }),
      chR('turret_cheek_R', 650, 0.20, 0.72, 0.90, 0.15, 0.0, 0.62, 0.08, 0, { keMm: 550, ceMm: 700 }),
      chL('turret_cheek_L', 650, 0.20, 0.72, 0.90, 0.15, 0.0, 0.62, 0.08, 0, { keMm: 550, ceMm: 700 }),
      par('mantlet', 300, [-0.2, 0.08, 0.80], [0.2, 0.08, 0.80], [-0.2, 0.45, 0.77],
        { keMm: 350, ceMm: 400, gunFollow: true }),
      sR('side_era_R', 15, 1.0, 0.1, 1.0, 0.5, -0.5, 0.15, { kind: 'era', era: reliktSkirt }),
      sL('side_era_L', 15, 1.0, 0.1, 1.0, 0.5, -0.5, 0.15, { kind: 'era', era: reliktSkirt }),
      sR('turret_side_R', 300, 0.95, 0.0, 0.95, 0.62, -0.7, 0.15, { keMm: 300, ceMm: 450 }),
      sL('turret_side_L', 300, 0.95, 0.0, 0.95, 0.62, -0.7, 0.15, { keMm: 300, ceMm: 450 }),
      rr('turret_bustle', 45, 0.75, 0.0, -1.3, 0.6, -1.3),
      rf('turret_roof', 45, 0.9, 0.66, -0.75, 0.5),
    ],
    modules: [
      mbox('engine', [-1.0, 0.45, -3.3], [1.0, 1.4, -1.7]),
      mbox('fuelTank', [0.6, 0.45, -1.65], [1.25, 1.05, -0.3]),
      mbox('ammoRack', [-0.7, 0.45, -0.5], [0.7, 0.95, 0.7]),          // carousel autoloader
      mbox('turretRing', [-0.85, 1.27, -0.75], [0.85, 1.47, 0.95]),
      mbox('radio', [-0.6, 0.05, -1.2], [-0.1, 0.5, -0.75], true),
      mbox('optics', [-0.6, 0.62, 0.25], [-0.15, 0.95, 0.7], true),    // Sosna-U
      mbox('gun', [-0.18, 0.05, -0.45], [0.18, 0.5, 0.6], true),
      mbox('trackL', [-1.89, 0.0, -3.43], [-1.31, trkTop, 3.43]),
      mbox('trackR', [1.31, 0.0, -3.43], [1.89, trkTop, 3.43]),
    ],
    crew: [
      cbox('driver', [-0.35, 0.5, 1.9], [0.35, 1.1, 2.9]),
      cbox('gunner', [-0.75, 0.0, -0.2], [-0.2, 0.6, 0.5], true),
      cbox('commander', [0.2, 0.0, -0.45], [0.78, 0.62, 0.3], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// Leopard 2A7
// ---------------------------------------------------------------------------
function armorLeo2A7() {
  const trkTop = 1.08, floor = 0.5, roofY = 1.72;
  return {
    boundingRadiusM: 5.8,
    turretPivot: [0, 1.72, -0.35],
    gunPivot: [0, 0.32, 0.8],
    gunBarrel: { lengthM: 6.6, radiusM: 0.10 },
    hullPlates: [
      fr('upper_glacis', 45, 1.6, 1.0, 3.83, roofY, 1.00, { keMm: 120, ceMm: 150 }),   // ~76 deg
      fr('lower_front', 600, 1.6, floor, 3.45, 1.0, 3.83, { keMm: 620, ceMm: 820 }),
      sR('hull_side_upper_R', 40, 1.875, trkTop, 1.875, roofY, -3.86, 1.0),
      sL('hull_side_upper_L', 40, 1.875, trkTop, 1.875, roofY, -3.86, 1.0),
      sR('hull_side_lower_R', 40, 1.24, floor, 1.24, trkTop, -3.8, 3.45),
      sL('hull_side_lower_L', 40, 1.24, floor, 1.24, trkTop, -3.8, 3.45),
      sR('skirt_heavy_R', 110, 1.88, 0.45, 1.88, 1.15, 1.3, 3.8, { kind: 'spaced', keMm: 160, ceMm: 450 }),
      sL('skirt_heavy_L', 110, 1.88, 0.45, 1.88, 1.15, 1.3, 3.8, { kind: 'spaced', keMm: 160, ceMm: 450 }),
      sR('skirt_rear_R', 10, 1.88, 0.45, 1.88, 1.15, -3.8, 1.3, { kind: 'spaced' }),
      sL('skirt_rear_L', 10, 1.88, 0.45, 1.88, 1.15, -3.8, 1.3, { kind: 'spaced' }),
      sR('track_R', 25, 1.55, 0.15, 1.55, trkTop, -3.86, 3.86, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 25, 1.55, 0.15, 1.55, trkTop, -3.86, 3.86, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 40, 1.6, floor, -3.86, roofY, -3.86),
      rf('hull_roof', 40, 1.6, roofY, -3.86, 1.00),
    ],
    turretPlates: [
      chR('turret_wedge_R', 90, 0.12, 1.35, 1.02, 0.40, 0.08, 0.75, 0.39, 0,
        { kind: 'spaced', keMm: 220, ceMm: 750 }),
      chL('turret_wedge_L', 90, 0.12, 1.35, 1.02, 0.40, 0.08, 0.75, 0.39, 0,
        { kind: 'spaced', keMm: 220, ceMm: 750 }),
      chR('turret_cheek_R', 650, 0.2, 0.85, 1.05, 0.30, 0.0, 0.8, 0.1, 0, { keMm: 620, ceMm: 750 }),
      chL('turret_cheek_L', 650, 0.2, 0.85, 1.05, 0.30, 0.0, 0.8, 0.1, 0, { keMm: 620, ceMm: 750 }),
      par('turret_sight_recess', 250, [0.4, 0.5, 0.92], [0.75, 0.5, 0.78], [0.4, 0.78, 0.86],
        { keMm: 300, ceMm: 350 }),                                     // EMES 15 weak spot
      par('mantlet', 350, [-0.26, 0.08, 1.12], [0.26, 0.08, 1.12], [-0.26, 0.52, 1.09],
        { keMm: 420, ceMm: 500, gunFollow: true }),
      sR('turret_side_R', 320, 1.08, 0.0, 1.08, 0.82, -1.5, 0.3, { keMm: 350, ceMm: 500 }),
      sL('turret_side_L', 320, 1.08, 0.0, 1.08, 0.82, -1.5, 0.3, { keMm: 350, ceMm: 500 }),
      rr('turret_rear', 80, 1.0, 0.0, -1.55, 0.82, -1.55),
      rf('turret_roof', 45, 1.08, 0.85, -1.55, 0.6),
    ],
    modules: [
      mbox('engine', [-1.05, 0.5, -3.75], [1.05, 1.55, -1.9]),
      mbox('fuelTank', [0.5, 0.5, -1.85], [1.2, 1.3, -0.9]),
      mbox('ammoRack', [-1.15, 0.55, 1.6], [-0.35, 1.5, 3.0]),         // hull rack, front-left
      mbox('turretRing', [-0.95, 1.54, -1.25], [0.95, 1.74, 0.85]),
      mbox('radio', [-0.6, 0.1, -1.4], [-0.1, 0.55, -0.9], true),
      mbox('optics', [0.35, 0.7, 0.5], [0.75, 1.0, 0.95], true),       // EMES 15
      mbox('gun', [-0.18, 0.05, -0.5], [0.18, 0.55, 0.8], true),
      mbox('trackL', [-1.875, 0.0, -3.86], [-1.24, trkTop, 3.86]),
      mbox('trackR', [1.24, 0.0, -3.86], [1.875, trkTop, 3.86]),
    ],
    crew: [
      cbox('driver', [0.25, 0.55, 2.2], [0.9, 1.25, 3.3]),
      cbox('gunner', [0.25, 0.0, 0.0], [0.85, 0.7, 0.7], true),
      cbox('commander', [0.25, 0.05, -0.8], [0.9, 0.78, -0.1], true),
      cbox('loader', [-0.9, 0.0, -0.45], [-0.25, 0.75, 0.5], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// The spec table (locked values from ARCHITECTURE §3.3.1 + roster tables)
// ---------------------------------------------------------------------------

export const TANK_SPECS = {
  m4a3e8: {
    id: 'm4a3e8', name: 'M4A3E8 Sherman', nation: 'USA', era: 'ww2', class: 'medium',
    hp: 720,
    enginePowerHp: 450, weightTons: 33.7, topSpeedKmh: 42, reverseSpeedKmh: 8,
    hullTraverseDegS: 36,
    terrainResistance: { hard: 1.0, medium: 1.2, soft: 2.2 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 24, gunPitchDegS: 19, gunElevationDeg: 25, gunDepressionDeg: 10,
    gun: {
      caliberMm: 76, reloadS: 4.6, baseAccuracy: 0.36, aimTimeS: 2.0,
      bloom: BLOOM_WW2,
      shells: [
        shell('M62 APCBC', 'AP', 76, 128, 96, 115, 792),
        shell('M93 HVAP', 'APCR', 76, 208, 150, 115, 1036),
        shell('M42A1 HE', 'HE', 76, 10, 10, 155, 800),
      ],
    },
    dims: { hullLengthM: 6.27, overallLengthM: 7.52, widthM: 3.0, heightM: 2.97 },
    armor: armorM4(),
    visual: {
      scheme: 'solid', base: '#4b5320', weather: '#6b6b47', patches: [],
      marking: 'star', number: '3070512', trackWidthM: 0.58,
    },
  },

  tiger1: {
    id: 'tiger1', name: 'Tiger I', nation: 'Germany', era: 'ww2', class: 'heavy',
    hp: 1000,
    enginePowerHp: 700, weightTons: 57, topSpeedKmh: 45.4, reverseSpeedKmh: 8,
    hullTraverseDegS: 22,
    terrainResistance: { hard: 1.1, medium: 1.3, soft: 2.3 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 14, gunPitchDegS: 11, gunElevationDeg: 17, gunDepressionDeg: 6.5,
    gun: {
      caliberMm: 88, reloadS: 6.5, baseAccuracy: 0.34, aimTimeS: 2.4,
      bloom: BLOOM_WW2,
      shells: [
        shell('PzGr. 39 APCBC', 'AP', 88, 120, 100, 220, 773),
        shell('PzGr. 40 APCR', 'APCR', 88, 171, 138, 190, 930),
        shell('Sprgr. 18 HE', 'HE', 88, 12, 12, 270, 770),
      ],
    },
    dims: { hullLengthM: 6.32, overallLengthM: 8.45, widthM: 3.71, heightM: 3.0 },
    armor: armorTiger(),
    visual: {
      scheme: 'stripes', base: '#9b8a55', weather: '#8a7a4e',
      patches: ['#5c6636', '#6f4530'],
      marking: 'cross', number: '212', zimmerit: true, trackWidthM: 0.725,
      camoScale: 0.6,
    },
  },

  t34_85: {
    id: 't34_85', name: 'T-34-85', nation: 'USSR', era: 'ww2', class: 'medium',
    hp: 750,
    enginePowerHp: 500, weightTons: 32, topSpeedKmh: 55, reverseSpeedKmh: 7,
    hullTraverseDegS: 40,
    terrainResistance: { hard: 0.9, medium: 1.1, soft: 2.0 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 26, gunPitchDegS: 21, gunElevationDeg: 22, gunDepressionDeg: 5,
    gun: {
      caliberMm: 85, reloadS: 7.0, baseAccuracy: 0.42, aimTimeS: 2.3,
      bloom: BLOOM_WW2,
      shells: [
        shell('BR-365K APHE', 'AP', 85, 119, 97, 180, 792),
        shell('BR-365P APCR', 'APCR', 85, 167, 110, 160, 1030),
        shell('O-365K HE', 'HE', 85, 11, 11, 240, 790),
      ],
    },
    dims: { hullLengthM: 6.10, overallLengthM: 8.10, widthM: 3.0, heightM: 2.72 },
    armor: armorT34(),
    visual: {
      scheme: 'solid', base: '#5a6b46', weather: '#6f7d55', patches: [],
      marking: 'number', number: '312', trackWidthM: 0.5,
    },
  },

  is2: {
    id: 'is2', name: 'IS-2', nation: 'USSR', era: 'ww2', class: 'heavy',
    hp: 1200,
    enginePowerHp: 520, weightTons: 46, topSpeedKmh: 37, reverseSpeedKmh: 5,
    hullTraverseDegS: 20,
    terrainResistance: { hard: 1.2, medium: 1.4, soft: 2.5 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 16, gunPitchDegS: 13, gunElevationDeg: 20, gunDepressionDeg: 3,
    gun: {
      caliberMm: 122, reloadS: 13.5, baseAccuracy: 0.46, aimTimeS: 3.2,
      bloom: BLOOM_WW2,
      shells: [
        shell('BR-471 APHE', 'AP', 122, 165, 143, 390, 795),
        shell('BR-471B APBC', 'AP', 122, 175, 152, 390, 800),
        shell('OF-471 HE', 'HE', 122, 15, 15, 450, 770),
      ],
    },
    dims: { hullLengthM: 6.77, overallLengthM: 9.90, widthM: 3.09, heightM: 2.73 },
    armor: armorIS2(),
    visual: {
      scheme: 'solid', base: '#52603f', weather: '#5e6c4a', patches: [],
      marking: 'number', number: '432', trackWidthM: 0.65,
    },
  },

  panther_g: {
    id: 'panther_g', name: 'Panther Ausf. G', nation: 'Germany', era: 'ww2', class: 'medium',
    hp: 900,
    enginePowerHp: 700, weightTons: 45.5, topSpeedKmh: 48, reverseSpeedKmh: 5,
    hullTraverseDegS: 30,
    terrainResistance: { hard: 1.0, medium: 1.2, soft: 2.2 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 18, gunPitchDegS: 14, gunElevationDeg: 18, gunDepressionDeg: 8,
    gun: {
      caliberMm: 75, reloadS: 5.5, baseAccuracy: 0.32, aimTimeS: 2.1,
      bloom: BLOOM_WW2,
      shells: [
        shell('PzGr. 39/42 APCBC', 'AP', 75, 138, 111, 135, 935),
        shell('PzGr. 40/42 APCR', 'APCR', 75, 194, 149, 135, 1120),
        shell('Sprgr. 42 HE', 'HE', 75, 9, 9, 175, 700),
      ],
    },
    dims: { hullLengthM: 6.87, overallLengthM: 8.66, widthM: 3.42, heightM: 2.99 },
    armor: armorPanther(),
    visual: {
      scheme: 'ambush', base: '#9b8a55', weather: '#8f7f50',
      patches: ['#6a713f', '#7a4a35'],
      marking: 'cross', number: '435', trackWidthM: 0.66,
    },
  },

  m1a2: {
    id: 'm1a2', name: 'M1A2 Abrams SEPv3', nation: 'USA', era: 'modern', class: 'mbt',
    hp: 2600,
    // Real SEPv3 reverses at ~40 km/h, but that reads arcade-y next to the
    // 5-8 km/h WW2 roster and sits far outside the WoT-feel envelope
    // (10-20 km/h reverse across all classes) — cap modern MBTs at 25.
    enginePowerHp: 1500, weightTons: 66.8, topSpeedKmh: 67, reverseSpeedKmh: 25,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 6.0, baseAccuracy: 0.30, aimTimeS: 1.8,
      bloom: BLOOM_MODERN,
      shells: [
        shell('M829A4 APFSDS', 'APFSDS', 120, apfsdsPens(750)[0], apfsdsPens(750)[1], 540, 1670),
        shell('M830A1 MPAT', 'HEAT', 120, 600, 600, 480, 1400),
        shell('M1147 AMP', 'HE', 120, 60, 60, 600, 1000),
      ],
    },
    dims: { hullLengthM: 7.93, overallLengthM: 9.77, widthM: 3.66, heightM: 2.44 },
    armor: armorM1A2(),
    visual: {
      scheme: 'nato', base: '#49543c', weather: '#525f45',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'number', number: 'B-24', trackWidthM: 0.635,
      camoScale: 0.5,
    },
  },

  t90m: {
    id: 't90m', name: 'T-90M Proryv', nation: 'Russia', era: 'modern', class: 'mbt',
    hp: 2000,
    enginePowerHp: 1130, weightTons: 48, topSpeedKmh: 63, reverseSpeedKmh: 5,
    hullTraverseDegS: 42,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 38, gunPitchDegS: 30, gunElevationDeg: 14, gunDepressionDeg: 6,
    gun: {
      caliberMm: 125, reloadS: 7.5, baseAccuracy: 0.35, aimTimeS: 2.2,
      bloom: BLOOM_MODERN,
      shells: [
        shell('3BM60 Svinets-2', 'APFSDS', 125, apfsdsPens(640)[0], apfsdsPens(640)[1], 520, 1750),
        shell('3BK31 HEAT', 'HEAT', 125, 675, 675, 470, 905),
        shell('3OF82 HE-Frag', 'HE', 125, 50, 50, 580, 850),
      ],
    },
    dims: { hullLengthM: 6.86, overallLengthM: 9.63, widthM: 3.78, heightM: 2.23 },
    armor: armorT90M(),
    visual: {
      scheme: 'digital', base: '#3f5138', weather: '#47593f',
      patches: ['#2b2b2b', '#8a7f5a'],
      marking: 'number', number: '527', trackWidthM: 0.58,
    },
  },

  leo2a7: {
    id: 'leo2a7', name: 'Leopard 2A7', nation: 'Germany', era: 'modern', class: 'mbt',
    hp: 2500,
    // 2A7 reverses at ~31 km/h IRL — capped at 25 with the M1A2 (see above).
    enginePowerHp: 1500, weightTons: 67.5, topSpeedKmh: 68, reverseSpeedKmh: 25,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 9,
    gun: {
      caliberMm: 120, reloadS: 6.0, baseAccuracy: 0.28, aimTimeS: 1.6,
      bloom: BLOOM_MODERN,
      shells: [
        shell('DM63 APFSDS', 'APFSDS', 120, apfsdsPens(730)[0], apfsdsPens(730)[1], 530, 1750),
        shell('DM12A2 HEAT-MP', 'HEAT', 120, 600, 600, 480, 1400),
        shell('DM11 HE', 'HE', 120, 40, 40, 590, 1000),
      ],
    },
    dims: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 3.75, heightM: 2.64 },
    armor: armorLeo2A7(),
    visual: {
      scheme: 'nato', base: '#49543c', weather: '#515e44',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'cross', number: '124', trackWidthM: 0.635,
      camoScale: 0.5,
    },
  },
};

// T-90M glacis ERA is split into two tiles so strips read locally.
{
  const t90 = TANK_SPECS.t90m.armor;
  const l = t90.hullPlates[0];
  // Re-place the single glacis ERA quad as two side-by-side tiles.
  const mk = (name, x0, x1) => par(name, 15,
    [x0, 0.95, 3.42], [x1, 0.95, 3.42], [x0, 1.42, 2.02],
    { kind: 'era', era: l.era });
  t90.hullPlates.splice(0, 1, mk('glacis_era_L', -1.5, -0.02), mk('glacis_era_R', 0.02, 1.5));
}

// ---------------------------------------------------------------------------
// Visual source of truth per tank: 'procedural' | 'glb'.
// 'glb' additionally needs { glb: { path, yawOffset?, turretNode?, gunNode? } }
// (see src/vehicles/modelLoader.js). Deep-hunt verdict 2026-07: ONE sourced
// model beat its procedural counterpart — the dannzjs M1A2 SEPv3 (CC-BY-4.0,
// docs/ATTRIBUTION.md). The other 7 stay procedural: every other candidate on
// the allowed sources was either not recognizable as the specific vehicle,
// had no articulable turret node, had no usable materials, or was a ripped
// game asset (forbidden).
// ---------------------------------------------------------------------------
export const MODEL_SOURCE = {
  m4a3e8: { source: 'procedural' },
  tiger1: { source: 'procedural' },
  t34_85: { source: 'procedural' },
  is2: { source: 'procedural' },
  panther_g: { source: 'procedural' },
  // Deep-hunt winner 2026-07: "Abrams M1A2 SEPv3" by dannzjs, CC-BY-4.0
  // (docs/ATTRIBUTION.md). Preprocessed offline (texture downscale + webp,
  // TurretPivot/GunPivot articulation grouping baked into the node tree).
  m1a2: {
    source: 'glb',
    glb: {
      path: '/models/tanks/m1a2_sepv3_dannzjs.glb',
      turretNode: 'TurretPivot',
      gunNode: 'GunPivot',
    },
  },
  t90m: { source: 'procedural' },
  leo2a7: { source: 'procedural' },
};

/**
 * Look up a tank spec by id.
 * @param {string} id one of TANK_IDS
 * @returns {object} TankSpec (ARCHITECTURE §2.2)
 * @throws {Error} on unknown id
 */
export function getSpec(id) {
  const s = TANK_SPECS[id];
  if (!s) throw new Error(`Unknown tank id: ${id}`);
  return s;
}
