// src/vehicles/modern1.js — HD procedural builder #1: modern MBT roster wave.
// Vehicles: t72b3 (T-72B3), challenger2 (Challenger 2), merkava4 (Merkava IVm
// Windbreaker), leo2a6 (Leopard 2A6). Specs per docs/research/modern-roster.md
// §14 / §18 / §21 / §8; visual bar per Appendix B (trapezoidal track runs,
// silhouette identity, raised ERA, articulated turret+gun, weathering).
//
// Registration pattern: tankFactory.js imports MODERN1_BUILDERS and merges it
// into its BUILDERS table (clearly-marked extension hook there). Specs and
// model-source rows register HERE by mutating the exported tables from
// specs.js — specs.js itself is untouched (it is concurrently edited by the
// sourcing workflows). Builders draw on the shared geometry/greeble kit
// exported by tankFactory.js (KIT). NOTE: tankFactory <-> modern1 is a
// deliberate module cycle — this module must not READ tankFactory bindings at
// module scope (they are TDZ during our evaluation); builders destructure KIT
// at call time.

import * as THREE from 'three';
import { KIT } from './tankFactory.js';
// §I fittings census: the FITTINGS import is the spelling that survives
// synchronous top-level createTank rigs (kit.js attach-site note).
import { FITTINGS, muzzleBore } from './profiles/kit.js';
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';
// ch1-base tone port (uk round 2026-08-07): materials.js is cycle-free — the
// ambient-floor hook re-attach is the same import uk.js carries.
import { vehicleAmbientFloorHook } from './materials.js';

const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------
// Spec-table helpers (duplicated from specs.js — they are file-private there
// and specs.js is a contested file; these are pure functions, safe to mirror).
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
const fr = (name, mm, w, yB, zB, yT, zT, o) =>
  par(name, mm, [-w, yB, zB], [w, yB, zB], [-w, yT, zT], o);
const rr = (name, mm, w, yB, zB, yT, zT, o) =>
  par(name, mm, [w, yB, zB], [-w, yB, zB], [w, yT, zT], o);
const sR = (name, mm, xB, yB, xT, yT, zR, zF, o) =>
  par(name, mm, [xB, yB, zF], [xB, yB, zR], [xT, yT, zF], o);
const sL = (name, mm, xB, yB, xT, yT, zR, zF, o) =>
  par(name, mm, [-xB, yB, zR], [-xB, yB, zF], [-xT, yT, zR], o);
const rf = (name, mm, w, y, zR, zF, o) =>
  par(name, mm, [-w, y, zF], [w, y, zF], [-w, y, zR], o);
const chR = (name, mm, xIn, zIn, xOut, zOut, y0, y1, tb = 0, xi = 0, o) =>
  par(name, mm, [xIn, y0, zIn], [xOut, y0, zOut], [xIn - xi, y1, zIn - tb], o);
const chL = (name, mm, xIn, zIn, xOut, zOut, y0, y1, tb = 0, xi = 0, o) =>
  par(name, mm, [-xOut, y0, zOut], [-xIn, y0, zIn], [-xOut + xi, y1, zOut - tb], o);
const mbox = (module, min, max, turretLocal = false) => ({ module, min, max, turretLocal });
const cbox = (crew, min, max, turretLocal = false) => ({ crew, min, max, turretLocal });
const shell = (name, type, caliberMm, pen100Mm, pen1000Mm, dmg, velocityMps, extra) => ({
  name, type, caliberMm, pen100Mm, pen1000Mm, dmg, velocityMps,
  moduleDmg: caliberMm, tracer: type, ...(extra || {}),
});
const apfsdsPens = (quoted2km) => {
  const pen1000 = quoted2km / 0.90;
  return [Math.round(pen1000 / 0.91), Math.round(pen1000), quoted2km];
};
const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };

// ---------------------------------------------------------------------------
// Armor models (plate-by-plate, roster RHAe tables)
// ---------------------------------------------------------------------------

// T-72B3 — §14.2: turret ~480/500 + Kontakt-5, glacis ~450/500 + K-5,
// sides 80 mm + soft skirts with K-1 forward.
function armorT72B3() {
  const trkTop = 0.98, floor = 0.42, roofY = 1.38;
  const k5 = { keReduction: 0.20, ceFlatMm: 450 };
  const k1 = { keReduction: 0.05, ceFlatMm: 280 };
  return {
    boundingRadiusM: 4.95,
    turretPivot: [0, 1.38, 0.10],
    gunPivot: [0, 0.30, 0.55],
    gunBarrel: { lengthM: 6.0, radiusM: 0.10 },
    hullPlates: [
      // K-5 glacis array as two side-by-side strippable tiles (visual clusters
      // 'glacis_era_L'/'glacis_era_R' in buildT72B3 key off these names)
      par('glacis_era_L', 15, [-1.56, 0.92, 3.32], [-0.04, 0.92, 3.32], [-1.56, 1.36, 1.98],
        { kind: 'era', era: k5 }),
      par('glacis_era_R', 15, [0.04, 0.92, 3.32], [1.56, 0.92, 3.32], [0.04, 1.36, 1.98],
        { kind: 'era', era: k5 }),
      fr('upper_glacis', 480, 1.55, 0.82, 3.28, roofY, 1.90, { keMm: 450, ceMm: 500 }),
      fr('lower_front', 80, 1.55, floor, 2.98, 0.82, 3.28, { keMm: 100, ceMm: 100 }),
      sR('hull_side_upper_R', 70, 1.86, trkTop, 1.86, roofY, -3.3, 1.9, { keMm: 80, ceMm: 80 }),
      sL('hull_side_upper_L', 70, 1.86, trkTop, 1.86, roofY, -3.3, 1.9, { keMm: 80, ceMm: 80 }),
      sR('hull_side_lower_R', 70, 1.28, floor, 1.28, trkTop, -3.25, 2.95, { keMm: 80, ceMm: 80 }),
      sL('hull_side_lower_L', 70, 1.28, floor, 1.28, trkTop, -3.25, 2.95, { keMm: 80, ceMm: 80 }),
      sR('skirt_era_R', 12, 1.87, 0.45, 1.87, 1.02, 1.2, 3.2, { kind: 'era', era: k1 }),
      sL('skirt_era_L', 12, 1.87, 0.45, 1.87, 1.02, 1.2, 3.2, { kind: 'era', era: k1 }),
      sR('skirt_rubber_R', 8, 1.87, 0.45, 1.87, 1.02, -3.2, 1.2, { kind: 'spaced' }),
      sL('skirt_rubber_L', 8, 1.87, 0.45, 1.87, 1.02, -3.2, 1.2, { kind: 'spaced' }),
      sR('track_R', 20, 1.57, 0.12, 1.57, trkTop, -3.34, 3.34, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, 1.57, 0.12, 1.57, trkTop, -3.34, 3.34, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 45, 1.55, floor, -3.34, roofY, -3.34),
      rf('hull_roof', 40, 1.55, roofY, -3.3, 1.9),
    ],
    turretPlates: [
      chR('turret_era_R', 15, 0.24, 0.98, 1.02, 0.28, 0.05, 0.55, 0.10, 0, { kind: 'era', era: k5 }),
      chL('turret_era_L', 15, 0.24, 0.98, 1.02, 0.28, 0.05, 0.55, 0.10, 0, { kind: 'era', era: k5 }),
      chR('turret_cheek_R', 520, 0.20, 0.84, 1.00, 0.16, 0.0, 0.58, 0.10, 0, { keMm: 480, ceMm: 500 }),
      chL('turret_cheek_L', 520, 0.20, 0.84, 1.00, 0.16, 0.0, 0.58, 0.10, 0, { keMm: 480, ceMm: 500 }),
      par('mantlet', 300, [-0.20, 0.06, 0.90], [0.20, 0.06, 0.90], [-0.20, 0.44, 0.86],
        { keMm: 320, ceMm: 380, gunFollow: true }),
      sR('turret_side_R', 280, 1.04, 0.0, 0.86, 0.55, -0.9, 0.2, { keMm: 280, ceMm: 400 }),
      sL('turret_side_L', 280, 1.04, 0.0, 0.86, 0.55, -0.9, 0.2, { keMm: 280, ceMm: 400 }),
      rr('turret_rear', 45, 0.85, 0.0, -1.05, 0.5, -1.05),
      rf('turret_roof', 45, 0.95, 0.60, -1.0, 0.55),
    ],
    modules: [
      mbox('engine', [-1.0, 0.45, -3.2], [1.0, 1.38, -1.7]),
      mbox('fuelTank', [0.6, 0.45, -1.65], [1.22, 1.0, -0.3]),
      mbox('ammoRack', [-0.7, 0.42, -0.5], [0.7, 0.92, 0.7]),        // carousel autoloader
      mbox('turretRing', [-0.85, 1.25, -0.8], [0.85, 1.45, 0.9]),
      mbox('radio', [-0.6, 0.05, -1.1], [-0.1, 0.5, -0.7], true),
      mbox('optics', [-0.65, 0.55, 0.2], [-0.2, 0.9, 0.65], true),   // Sosna-U
      mbox('gun', [-0.18, 0.05, -0.45], [0.18, 0.5, 0.6], true),
      mbox('trackL', [-1.86, 0.0, -3.34], [-1.28, trkTop, 3.34]),
      mbox('trackR', [1.28, 0.0, -3.34], [1.86, trkTop, 3.34]),
    ],
    crew: [
      cbox('driver', [-0.32, 0.5, 1.85], [0.32, 1.1, 2.8]),
      cbox('gunner', [-0.75, 0.0, -0.2], [-0.2, 0.55, 0.5], true),
      cbox('commander', [0.2, 0.0, -0.45], [0.78, 0.58, 0.3], true),
    ],
  };
}

// Challenger 2 — §18.2 Dorchester L2: turret ~600/900, hull ~500/800,
// turret sides ~300/450, hull sides 100 + skirt.
function armorChallenger2() {
  const trkTop = 1.0, floor = 0.45, roofY = 1.55;
  return {
    boundingRadiusM: 5.95,
    // tank_models r7 (barge read): ring moved 0.5 forward — the CR2 turret
    // face sits ~2.4 m from the nose (was ~3.0); foredeck 36% -> ~29%.
    turretPivot: [0, 1.55, 0.35],
    gunPivot: [0, 0.35, 0.70],
    gunBarrel: { lengthM: 6.7, radiusM: 0.11 },
    hullPlates: [
      fr('upper_glacis', 500, 1.62, 0.95, 4.05, roofY, 1.40, { keMm: 500, ceMm: 800 }),
      fr('lower_front', 300, 1.70, floor, 3.70, 0.95, 4.10, { keMm: 300, ceMm: 400 }),
      sR('hull_side_upper_R', 60, 1.76, trkTop, 1.76, roofY, -4.1, 1.4, { keMm: 100, ceMm: 100 }),
      sL('hull_side_upper_L', 60, 1.76, trkTop, 1.76, roofY, -4.1, 1.4, { keMm: 100, ceMm: 100 }),
      sR('hull_side_lower_R', 60, 1.26, floor, 1.26, trkTop, -4.0, 3.7, { keMm: 100, ceMm: 100 }),
      sL('hull_side_lower_L', 60, 1.26, floor, 1.26, trkTop, -4.0, 3.7, { keMm: 100, ceMm: 100 }),
      sR('skirt_R', 60, 1.84, 0.5, 1.84, 1.12, -3.9, 3.9, { kind: 'spaced', keMm: 90, ceMm: 300 }),
      sL('skirt_L', 60, 1.84, 0.5, 1.84, 1.12, -3.9, 3.9, { kind: 'spaced', keMm: 90, ceMm: 300 }),
      sR('track_R', 25, 1.52, 0.14, 1.52, trkTop, -4.16, 4.16, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 25, 1.52, 0.14, 1.52, trkTop, -4.16, 4.16, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 45, 1.6, floor, -4.16, roofY, -4.16),
      rf('hull_roof', 45, 1.62, roofY, -4.1, 1.4),
    ],
    turretPlates: [
      chR('turret_cheek_R', 620, 0.16, 1.28, 1.26, 0.0, 0.0, 0.90, 0.55, 0, { keMm: 600, ceMm: 900 }),
      chL('turret_cheek_L', 620, 0.16, 1.28, 1.26, 0.0, 0.0, 0.90, 0.55, 0, { keMm: 600, ceMm: 900 }),
      par('mantlet_slot', 400, [-0.20, 0.10, 1.15], [0.20, 0.10, 1.15], [-0.20, 0.55, 1.08],
        { keMm: 450, ceMm: 550, gunFollow: true }),
      sR('turret_side_R', 300, 1.26, 0.0, 1.26, 0.90, -1.95, 0.0, { keMm: 300, ceMm: 450 }),
      sL('turret_side_L', 300, 1.26, 0.0, 1.26, 0.90, -1.95, 0.0, { keMm: 300, ceMm: 450 }),
      rr('turret_rear', 70, 1.2, 0.0, -2.0, 0.9, -2.0),
      rf('turret_roof', 50, 1.26, 0.92, -1.95, 1.0),
    ],
    modules: [
      mbox('engine', [-1.05, 0.5, -4.05], [1.05, 1.5, -2.1]),
      mbox('fuelTank', [-1.2, 0.5, -2.05], [-0.4, 1.3, -1.0]),
      mbox('ammoRack', [-0.9, 0.45, 0.6], [0.4, 1.2, 2.2]),           // charge bins, hull front
      mbox('turretRing', [-0.95, 1.37, -1.15], [0.95, 1.57, 0.85]),
      mbox('radio', [-0.6, 0.1, -1.5], [-0.1, 0.55, -1.0], true),
      mbox('optics', [0.3, 0.6, 0.3], [0.75, 0.95, 0.8], true),
      mbox('gun', [-0.18, 0.1, -0.5], [0.18, 0.6, 0.75], true),
      mbox('trackL', [-1.84, 0.0, -4.16], [-1.26, trkTop, 4.16]),
      mbox('trackR', [1.26, 0.0, -4.16], [1.84, trkTop, 4.16]),
    ],
    crew: [
      cbox('driver', [-0.35, 0.55, 2.3], [0.35, 1.2, 3.4]),
      cbox('gunner', [0.25, 0.0, 0.0], [0.85, 0.7, 0.7], true),
      cbox('commander', [0.25, 0.05, -0.85], [0.9, 0.8, -0.1], true),
      cbox('loader', [-0.9, 0.0, -0.45], [-0.25, 0.75, 0.5], true),
    ],
  };
}

// Merkava IVm — §21.2: turret wedge ~650/1000, hull front ~500/750 + engine
// block behind (front engine soaks pens), rear = weak spot (troop door).
function armorMerkava4() {
  const trkTop = 1.02, floor = 0.45, roofY = 1.62;
  return {
    boundingRadiusM: 5.2,
    turretPivot: [0, 1.62, -0.35],
    gunPivot: [0, 0.35, 0.55],
    gunBarrel: { lengthM: 5.3, radiusM: 0.10 },
    hullPlates: [
      fr('upper_glacis', 520, 1.66, 0.75, 3.72, 1.50, 2.15, { keMm: 500, ceMm: 750 }),
      fr('lower_front', 250, 1.60, floor, 3.42, 0.75, 3.72, { keMm: 250, ceMm: 350 }),
      sR('hull_side_upper_R', 60, 1.80, trkTop, 1.80, roofY, -3.7, 2.1, { keMm: 100, ceMm: 100 }),
      sL('hull_side_upper_L', 60, 1.80, trkTop, 1.80, roofY, -3.7, 2.1, { keMm: 100, ceMm: 100 }),
      sR('hull_side_lower_R', 60, 1.30, floor, 1.30, trkTop, -3.65, 3.4, { keMm: 100, ceMm: 100 }),
      sL('hull_side_lower_L', 60, 1.30, floor, 1.30, trkTop, -3.65, 3.4, { keMm: 100, ceMm: 100 }),
      sR('skirt_R', 40, 1.88, 0.5, 1.88, 1.10, -3.5, 3.5, { kind: 'spaced', keMm: 70, ceMm: 280 }),
      sL('skirt_L', 40, 1.88, 0.5, 1.88, 1.10, -3.5, 3.5, { kind: 'spaced', keMm: 70, ceMm: 280 }),
      sR('track_R', 25, 1.55, 0.14, 1.55, trkTop, -3.8, 3.8, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 25, 1.55, 0.14, 1.55, trkTop, -3.8, 3.8, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear_door', 60, 1.55, floor, -3.8, roofY, -3.8),        // clamshell troop door
      rf('hull_roof', 45, 1.66, roofY, -3.7, 2.1),
    ],
    turretPlates: [
      chR('turret_wedge_R', 680, 0.14, 1.30, 1.14, -0.30, 0.0, 0.78, 0.42, 0, { keMm: 650, ceMm: 1000 }),
      chL('turret_wedge_L', 680, 0.14, 1.30, 1.14, -0.30, 0.0, 0.78, 0.42, 0, { keMm: 650, ceMm: 1000 }),
      par('gun_notch', 350, [-0.16, 0.08, 1.20], [0.16, 0.08, 1.20], [-0.16, 0.50, 1.12],
        { keMm: 380, ceMm: 450, gunFollow: true }),
      sR('trophy_R', 30, 1.12, 0.05, 1.12, 0.55, -1.2, -0.1, { kind: 'spaced', keMm: 60, ceMm: 200 }),
      sL('trophy_L', 30, 1.12, 0.05, 1.12, 0.55, -1.2, -0.1, { kind: 'spaced', keMm: 60, ceMm: 200 }),
      sR('turret_side_R', 320, 1.00, 0.0, 0.85, 0.78, -1.35, 0.2, { keMm: 350, ceMm: 500 }),
      sL('turret_side_L', 320, 1.00, 0.0, 0.85, 0.78, -1.35, 0.2, { keMm: 350, ceMm: 500 }),
      rr('turret_rear', 60, 0.85, 0.0, -1.45, 0.7, -1.45),
      rf('turret_roof', 45, 1.0, 0.80, -1.4, 0.9),
    ],
    modules: [
      // FRONT engine, right — the signature survivability layout
      mbox('engine', [0.0, floor, 1.5], [1.35, 1.55, 3.4]),
      mbox('fuelTank', [-1.25, floor, -3.0], [-0.4, 1.2, -1.8]),
      mbox('ammoRack', [-0.9, floor, -3.4], [0.9, 1.3, -2.2]),        // rear compartment racks
      mbox('turretRing', [-0.9, 1.44, -1.3], [0.9, 1.64, 0.6]),
      mbox('radio', [0.3, 0.1, -1.2], [0.8, 0.55, -0.7], true),
      mbox('optics', [0.0, 0.6, -0.2], [0.5, 0.95, 0.3], true),
      mbox('gun', [-0.18, 0.1, -0.4], [0.18, 0.6, 0.7], true),
      mbox('trackL', [-1.88, 0.0, -3.8], [-1.3, trkTop, 3.8]),
      mbox('trackR', [1.3, 0.0, -3.8], [1.88, trkTop, 3.8]),
    ],
    crew: [
      cbox('driver', [-1.0, 0.55, 0.9], [-0.35, 1.25, 2.0]),          // left of engine
      cbox('gunner', [0.25, 0.0, -0.1], [0.8, 0.68, 0.55], true),
      cbox('commander', [0.25, 0.05, -0.95], [0.85, 0.75, -0.2], true),
      cbox('loader', [-0.85, 0.0, -0.6], [-0.25, 0.72, 0.3], true),
    ],
  };
}

// Challenger 3 — NEW VEHICLE (owner greenlight 2026-08-06). CR2 hull family
// (EPSOM modular appliqué) under the NEW Rheinmetall turret: big flat cheek
// plates, Trophy APS side modules, RWS. 120 mm L55A1 SMOOTHBORE — the key
// identity change from CR2's rifled L30. RHAe = CR2-class base + modular
// uplift estimates (no public CR3 armor data; game-design baseline).
function armorChallenger3() {
  const trkTop = 1.0, floor = 0.42, roofY = 1.55;
  return {
    boundingRadiusM: 5.95,
    // Turret seat per the NC-quarantined 42manako print (§B8 proportion
    // truth): ring well forward (print autoPivot z +1.31 on its 7.96 hull),
    // face ~2.45 from the ring, the huge squared bustle running to -2.13.
    turretPivot: [0, 1.55, 1.20],
    // print bore line 1.76 (low trunnion — the CR3 turret sits low over
    // the gun); visible run 5.58 -> muzzle +7.335 = 11.50 overall.
    gunPivot: [0, 0.21, 0.55],
    gunBarrel: { lengthM: 5.6, radiusM: 0.10 },
    hullPlates: [
      fr('upper_glacis', 500, 1.62, 0.95, 4.05, roofY, 1.40, { keMm: 500, ceMm: 800 }),
      fr('lower_front', 300, 1.70, floor, 3.70, 0.95, 4.10, { keMm: 300, ceMm: 400 }),
      sR('hull_side_upper_R', 60, 1.755, trkTop, 1.755, roofY, -4.1, 1.4, { keMm: 100, ceMm: 100 }),
      sL('hull_side_upper_L', 60, 1.755, trkTop, 1.755, roofY, -4.1, 1.4, { keMm: 100, ceMm: 100 }),
      sR('hull_side_lower_R', 60, 1.26, floor, 1.26, trkTop, -4.0, 3.7, { keMm: 100, ceMm: 100 }),
      sL('hull_side_lower_L', 60, 1.26, floor, 1.26, trkTop, -4.0, 3.7, { keMm: 100, ceMm: 100 }),
      sR('skirt_R', 60, 1.755, 0.5, 1.755, 1.12, -3.9, 3.6, { kind: 'spaced', keMm: 90, ceMm: 300 }),
      sL('skirt_L', 60, 1.755, 0.5, 1.755, 1.12, -3.9, 3.6, { kind: 'spaced', keMm: 90, ceMm: 300 }),
      sR('track_R', 25, 1.60, 0.14, 1.60, trkTop, -4.16, 4.16, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 25, 1.60, 0.14, 1.60, trkTop, -4.16, 4.16, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 45, 1.6, floor, -4.13, roofY, -4.13),
      rf('hull_roof', 45, 1.62, roofY, -4.1, 1.4),
    ],
    turretPlates: [
      // the new wedge: near-vertical big cheek plates over jutting lower
      // armor wedges; modular EPSOM appliqué values
      chR('turret_cheek_R', 650, 0.16, 1.30, 1.30, 0.10, 0.0, 0.85, 0.30, 0, { keMm: 650, ceMm: 950 }),
      chL('turret_cheek_L', 650, 0.16, 1.30, 1.30, 0.10, 0.0, 0.85, 0.30, 0, { keMm: 650, ceMm: 950 }),
      par('mantlet_slot', 400, [-0.20, 0.08, 1.30], [0.20, 0.08, 1.30], [-0.20, 0.50, 1.22],
        { keMm: 450, ceMm: 550, gunFollow: true }),
      // Trophy APS panels ride the sides (spaced modules)
      sR('trophy_R', 30, 1.72, 0.20, 1.72, 0.70, -2.6, -0.2, { kind: 'spaced', keMm: 60, ceMm: 200 }),
      sL('trophy_L', 30, 1.72, 0.20, 1.72, 0.70, -2.6, -0.2, { kind: 'spaced', keMm: 60, ceMm: 200 }),
      sR('turret_side_R', 300, 1.44, 0.0, 1.44, 0.85, -3.3, 0.0, { keMm: 300, ceMm: 450 }),
      sL('turret_side_L', 300, 1.44, 0.0, 1.44, 0.85, -3.3, 0.0, { keMm: 300, ceMm: 450 }),
      rr('turret_rear', 70, 1.2, 0.0, -3.33, 0.85, -3.33),
      rf('turret_roof', 50, 1.40, 0.86, -3.3, 1.0),
    ],
    modules: [
      mbox('engine', [-1.05, 0.5, -4.0], [1.05, 1.5, -2.1]),
      mbox('fuelTank', [-1.2, 0.5, -2.05], [-0.4, 1.3, -1.0]),
      mbox('ammoRack', [-0.9, 0.45, 0.6], [0.4, 1.2, 2.2]),           // charge bins, hull front
      mbox('turretRing', [-0.95, 1.37, 0.2], [0.95, 1.57, 2.2]),
      mbox('radio', [-0.6, 0.1, -2.6], [-0.1, 0.55, -2.1], true),
      mbox('optics', [0.3, 0.6, -0.3], [0.75, 0.95, 0.3], true),
      mbox('gun', [-0.18, 0.05, -0.6], [0.18, 0.55, 1.2], true),
      mbox('trackL', [-1.755, 0.0, -4.16], [-1.26, trkTop, 4.16]),
      mbox('trackR', [1.26, 0.0, -4.16], [1.755, trkTop, 4.16]),
    ],
    crew: [
      cbox('driver', [-0.35, 0.55, 2.3], [0.35, 1.2, 3.4]),
      cbox('gunner', [0.25, 0.0, -0.6], [0.85, 0.7, 0.1], true),
      cbox('commander', [0.25, 0.05, -1.45], [0.9, 0.8, -0.7], true),
      cbox('loader', [-0.9, 0.0, -1.05], [-0.25, 0.75, -0.1], true),
    ],
  };
}

// Leopard 2A6 — §8.2: geometry identical to the shipped 2A7 armor model with
// the roster's 2A6 RHAe values (turret ~700/1000, hull ~620/750).
function armorLeo2A6() {
  const trkTop = 1.08, floor = 0.5, roofY = 1.72;
  return {
    boundingRadiusM: 5.8,
    turretPivot: [0, 1.72, -0.35],
    gunPivot: [0, 0.32, 0.8],
    gunBarrel: { lengthM: 6.6, radiusM: 0.10 },
    hullPlates: [
      fr('upper_glacis', 45, 1.6, 1.0, 3.83, roofY, 1.00, { keMm: 120, ceMm: 150 }),
      fr('lower_front', 600, 1.6, floor, 3.45, 1.0, 3.83, { keMm: 620, ceMm: 750 }),
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
      chR('turret_wedge_R', 90, 0.04, 1.52, 1.30, 0.14, 0.08, 0.90, 0.52, 0,
        { kind: 'spaced', keMm: 220, ceMm: 750 }),
      chL('turret_wedge_L', 90, 0.04, 1.52, 1.30, 0.14, 0.08, 0.90, 0.52, 0,
        { kind: 'spaced', keMm: 220, ceMm: 750 }),
      chR('turret_cheek_R', 700, 0.18, 0.68, 1.22, 0.10, 0.0, 0.88, 0.06, 0, { keMm: 700, ceMm: 1000 }),
      chL('turret_cheek_L', 700, 0.18, 0.68, 1.22, 0.10, 0.0, 0.88, 0.06, 0, { keMm: 700, ceMm: 1000 }),
      par('turret_sight_recess', 250, [0.46, 0.76, 0.76], [1.02, 0.76, 0.55], [0.46, 1.02, 0.70],
        { keMm: 300, ceMm: 350 }),
      par('mantlet', 350, [-0.26, 0.08, 1.24], [0.26, 0.08, 1.24], [-0.26, 0.52, 1.21],
        { keMm: 420, ceMm: 500, gunFollow: true }),
      sR('turret_side_R', 320, 1.22, 0.0, 1.22, 0.88, -2.05, 0.14, { keMm: 350, ceMm: 500 }),
      sL('turret_side_L', 320, 1.22, 0.0, 1.22, 0.88, -2.05, 0.14, { keMm: 350, ceMm: 500 }),
      rr('turret_rear', 80, 1.20, 0.0, -2.08, 0.88, -2.08),
      rf('turret_roof', 45, 1.22, 0.90, -2.05, 0.58),
    ],
    modules: [
      mbox('engine', [-1.05, 0.5, -3.75], [1.05, 1.55, -1.9]),
      mbox('fuelTank', [0.5, 0.5, -1.85], [1.2, 1.3, -0.9]),
      mbox('ammoRack', [-1.15, 0.55, 1.6], [-0.35, 1.5, 3.0]),
      mbox('turretRing', [-0.95, 1.54, -1.25], [0.95, 1.74, 0.85]),
      mbox('radio', [-0.6, 0.1, -1.4], [-0.1, 0.55, -0.9], true),
      mbox('optics', [0.35, 0.7, 0.5], [0.75, 1.0, 0.95], true),
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
// Specs (stats per roster §14.3-4 / §18.3-4 / §21.3-4 / §8.3-4)
// ---------------------------------------------------------------------------
const MODERN1_SPECS = {
  t72b3: {
    id: 't72b3', name: 'T-72B3', nation: 'Russia', era: 'modern', class: 'mbt',
    hp: 1850,
    enginePowerHp: 840, weightTons: 46.5, topSpeedKmh: 60, reverseSpeedKmh: 4.8,
    hullTraverseDegS: 36,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 30, gunPitchDegS: 24, gunElevationDeg: 14, gunDepressionDeg: 6,
    gun: {
      caliberMm: 125, reloadS: 7.8, baseAccuracy: 0.38, aimTimeS: 2.4,
      bloom: BLOOM_MODERN,
      shells: [
        shell('3BM46 Svinets', 'APFSDS', 125, apfsdsPens(570)[0], apfsdsPens(570)[1], 510, 1700, { pen2000Mm: apfsdsPens(570)[2] }),
        shell('3BK29 HEAT', 'HEAT', 125, 630, 630, 470, 905),
        shell('3OF26 HE-Frag', 'HE', 125, 50, 50, 570, 850),
      ],
    },
    dims: { hullLengthM: 6.67, overallLengthM: 9.53, widthM: 3.59, heightM: 2.23 },
    armor: armorT72B3(),
    visual: {
      scheme: 'solid', base: '#42513a', weather: '#4e5c45', patches: [],
      marking: 'number', number: '312', trackWidthM: 0.58,
    },
  },

  challenger2: {
    id: 'challenger2', name: 'Challenger 2', nation: 'UK', era: 'modern', class: 'mbt',
    hp: 2450,
    enginePowerHp: 1200, weightTons: 62.5, topSpeedKmh: 59, reverseSpeedKmh: 20,
    hullTraverseDegS: 36,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 36, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 6.8, baseAccuracy: 0.26, aimTimeS: 1.7,
      // Hydrogas suspension: best on-move gun handling in the roster (§18.3)
      bloom: { move: 0.04, hullRot: 0.06, turret: 0.06, afterShot: 2.2 },
      shells: [
        shell('L27A1 CHARM-3', 'APFSDS', 120, apfsdsPens(600)[0], apfsdsPens(600)[1], 520, 1650, { pen2000Mm: apfsdsPens(600)[2] }),
        shell('L31A7 HESH', 'HE', 120, 150, 150, 620, 670),
        shell('L34 WP Smoke', 'HE', 120, 10, 10, 100, 650),
      ],
    },
    // heightM is the sensor-inclusive datum (m26 precedent): 2.49 is the
    // turret roof; the gate p95 rides the pano sight (published 3.04).
    dims: { hullLengthM: 8.33, overallLengthM: 11.50, widthM: 3.52, heightM: 3.04 },
    armor: armorChallenger2(),
    visual: {
      // British 2-tone: black stripe geometry over NATO green (§18.5)
      scheme: 'stripes', base: '#3f4a36', weather: '#48533e', patches: ['#1d1f1c'],
      marking: 'number', number: '22', trackWidthM: 0.65, camoScale: 0.45,
    },
  },

  challenger_3: {
    id: 'challenger_3', name: 'Challenger 3', nation: 'UK', era: 'modern', class: 'mbt',
    hp: 2500,
    // CV12-9A uprate path (1,500 hp program figure), 66 t combat
    enginePowerHp: 1500, weightTons: 66, topSpeedKmh: 60, reverseSpeedKmh: 20,
    hullTraverseDegS: 38,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 38, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      // 120 mm L55A1 SMOOTHBORE — the identity change from CR2's rifled
      // L30: German KE family replaces CHARM/HESH.
      caliberMm: 120, reloadS: 6.5, baseAccuracy: 0.25, aimTimeS: 1.7,
      bloom: { move: 0.04, hullRot: 0.06, turret: 0.06, afterShot: 2.2 },
      shells: [
        shell('DM73 APFSDS', 'APFSDS', 120, apfsdsPens(680)[0], apfsdsPens(680)[1], 530, 1750, { pen2000Mm: apfsdsPens(680)[2] }),
        shell('DM12A2 HEAT-MP', 'HEAT', 120, 600, 600, 480, 1400),
        shell('DM11 HE-ABM', 'HE', 120, 40, 40, 590, 1000),
      ],
    },
    // ANCHOR CAVEAT (packet): no official CR3 dims sheet — CR2 hull family
    // figures anchor the row (CR3 reuses the CR2 hull; L55A1 is L/55).
    // heightM is the sensor-inclusive datum (packet-filed 2.49 -> ~2.95:
    // RWS/pano/whips carry the p95 on both the print and the build).
    dims: { hullLengthM: 8.33, overallLengthM: 11.50, widthM: 3.52, heightM: 2.95 },
    armor: armorChallenger3(),
    visual: {
      // British 2-tone black-over-green, distinct number from the CR2 (§H.3
      // variant variety: Trophy modules + RWS + smoothbore are the tells)
      scheme: 'stripes', base: '#414c38', weather: '#4a5540', patches: ['#1e201d'],
      marking: 'number', number: '30', trackWidthM: 0.65, camoScale: 0.48,
    },
  },

  merkava4: {
    id: 'merkava4', name: 'Merkava IVm Windbreaker', nation: 'Israel', era: 'modern', class: 'mbt',
    hp: 2550,
    enginePowerHp: 1500, weightTons: 65, topSpeedKmh: 64, reverseSpeedKmh: 25,
    hullTraverseDegS: 38,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 38, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 7,
    gun: {
      caliberMm: 120, reloadS: 6.5, baseAccuracy: 0.31, aimTimeS: 1.9,
      bloom: BLOOM_MODERN,
      shells: [
        shell('M322 APFSDS', 'APFSDS', 120, apfsdsPens(650)[0], apfsdsPens(650)[1], 520, 1680, { pen2000Mm: apfsdsPens(650)[2] }),
        shell('M325 HEAT-MP', 'HEAT', 120, 600, 600, 480, 1400),
        shell('M339 HE-MP', 'HE', 120, 45, 45, 590, 950),
      ],
    },
    dims: { hullLengthM: 7.60, overallLengthM: 9.04, widthM: 3.72, heightM: 2.66 },
    armor: armorMerkava4(),
    visual: {
      // IDF Sinai grey single tone (§21.5)
      scheme: 'solid', base: '#6f7566', weather: '#7b8172', patches: [],
      marking: 'number', number: '11', trackWidthM: 0.64,
    },
  },

  leo2a6: {
    id: 'leo2a6', name: 'Leopard 2A6', nation: 'Germany', era: 'modern', class: 'mbt',
    hp: 2400,
    enginePowerHp: 1500, weightTons: 62.3, topSpeedKmh: 68, reverseSpeedKmh: 25,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 9,
    gun: {
      caliberMm: 120, reloadS: 6.0, baseAccuracy: 0.27, aimTimeS: 1.6,
      bloom: BLOOM_MODERN,
      shells: [
        shell('DM53 APFSDS', 'APFSDS', 120, apfsdsPens(700)[0], apfsdsPens(700)[1], 530, 1750, { pen2000Mm: apfsdsPens(700)[2] }),
        shell('DM12A2 HEAT-MP', 'HEAT', 120, 600, 600, 480, 1400),
        shell('DM11 HE-ABM', 'HE', 120, 40, 40, 590, 1000),
      ],
    },
    dims: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 3.75, heightM: 2.64 },
    armor: armorLeo2A6(),
    visual: {
      scheme: 'nato', base: '#49543c', weather: '#515e44',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'cross', number: '24', trackWidthM: 0.635, camoScale: 0.5,
    },
  },
};

// Register specs + model-source rows + garage roster ids (idempotent —
// vite HMR can re-evaluate this module).
// t72b3 REMOVED from the roster BY OWNER 2026-08-06 — DELIST-KEEP-SPEC
// (the leo2a7 pattern, specs.js:7 precedent): its TANK_SPECS row MUST stay
// registered as the make() DONOR for pt91m / t64bv1 / t72b_1987
// (userdrops5 throws at import without it); it just never enters
// ALL_TANK_IDS — no garage card, no ledger row.
const MODERN1_DELISTED = new Set(['t72b3']);
for (const [id, spec] of Object.entries(MODERN1_SPECS)) {
  TANK_SPECS[id] = TANK_SPECS[id] || spec;
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!MODERN1_DELISTED.has(id) && !ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}

// ===========================================================================
// Builders
// ===========================================================================

// ---------------------------------------------------------------------------
// T-72B3 — §14.5: low Soviet pancake, full-width K-5 chevron glacis array,
// squat cast dome (NOT the T-90M welded box) with K-5 eyebrow wedges,
// Sosna-U box left of gun, 6 big stamped wheels + 3 rollers, saddle fuel
// drums, unditching log, snorkel. No Shtora eyes.
// ---------------------------------------------------------------------------
function buildT72B3(P) {
  const { box, cylX, cylY, cylZ, sph, lathe, frustum, fenders, headlight, liftEye,
    periscope, smokeCluster, towCable, stowage, jerryCan, spareTrackStrip,
    buildGun, buildRunningGear, cupola, xform, torus } = KIT;
  const { rng } = P;
  // hull: flat pancake — lower box + shallow tapered deck band to the 1.38 roof
  P.add('hull', box(2.35, 0.55, 6.45), 0, 0.70, -0.05);
  P.add('hull', frustum(1.70, 2.92, -3.22, 1.44, 2.86, -3.18, 1.06, 1.38));     // tapered deck band
  fenders(P, 1.28, 1.86, 1.045, -3.28, 3.12, 0.035);
  P.add('hull', frustum(1.60, 3.24, 1.92, 1.64, 1.88, 1.92, 0.80, 1.38));       // 68 deg glacis
  P.add('hull', frustum(1.60, 2.94, 3.0, 1.60, 3.24, 3.0, 0.42, 0.80));         // lower front
  for (const s of [-1, 1]) {                                                    // fender-underside AO
    P.add('hullShadow', new THREE.BoxGeometry(0.55, 0.026, 6.2), s * 1.52, 1.035, -0.05);
  }
  // driver centered on the glacis (§14.5) + V-splash board
  P.add('hull', box(0.5, 0.05, 0.45), 0, 1.27, 2.16, -1.19, 0, 0);
  periscope(P, 'hullDetail', 0, 1.40, 1.78);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.8, 0.05, 0.08), s * 0.38, 1.06, 2.55, -1.19, s * 0.5, 0);
  // Kontakt-5 glacis: 4 chevron wedge courses proud of the plate (raised
  // geometry per Appendix B) with strippable brick tiles riding them.
  const glz = (y) => 1.88 + (1.38 - y) * 2.43 + 0.045;                          // glacis plane + proud
  for (const s of [-1, 1]) {
    for (const xw of [0.42, 1.24]) {
      P.add('hull', box(0.78, 0.13, 0.10), s * xw, 1.10, glz(1.10), -68 * D2R, s * 0.30, 0);
      P.add('hull', box(0.78, 0.13, 0.10), s * xw, 1.26, glz(1.26), -68 * D2R, -s * 0.30, 0);
    }
  }
  P.eraCluster('glacis_era_R', (put) => {
    for (const [xw, row] of [[0.42, 0], [1.24, 0], [0.42, 1], [1.24, 1]]) {
      const y = row ? 1.26 : 1.10;
      for (let c = -1; c <= 1; c++) {
        put(xw + c * 0.26, y, glz(y) + 0.02, -68 * D2R, (row ? -1 : 1) * 0.30, 0);
      }
    }
  });
  P.eraCluster('glacis_era_L', (put) => {
    for (const [xw, row] of [[0.42, 0], [1.24, 0], [0.42, 1], [1.24, 1]]) {
      const y = row ? 1.26 : 1.10;
      for (let c = -1; c <= 1; c++) {
        put(-xw + c * 0.26, y, glz(y) + 0.02, -68 * D2R, (row ? 1 : -1) * 0.30, 0);
      }
    }
  });
  // rubber-flap skirts, K-1 brick clusters on the forward third (§14.5)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.035, 0.40, 6.25), s * 1.85, 0.84, -0.08);
    P.add('hullRubber', box(0.028, 0.10, 6.2), s * 1.85, 0.60, -0.08);          // dust lip
    for (let k = 0; k < 4; k++) {
      P.add('hullDark', box(0.042, 0.32, 0.02), s * 1.85, 0.82, -1.4 - k * 0.5);
    }
  }
  P.eraCluster('skirt_era_R', (put) => {
    for (let c = 0; c < 4; c++) for (let row = 0; row < 2; row++)
      put(1.885, 0.72 + row * 0.20, 2.85 - c * 0.42, 0, Math.PI / 2, 0);
  });
  P.eraCluster('skirt_era_L', (put) => {
    for (let c = 0; c < 4; c++) for (let row = 0; row < 2; row++)
      put(-1.885, 0.72 + row * 0.20, 2.85 - c * 0.42, 0, -Math.PI / 2, 0);
  });
  // rear plate: unditching log + twin saddle fuel drums on rails (§14.5)
  P.add('hullWood', cylX(0.11, 2.05, 12), 0, 1.18, -3.24);
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.145, 0.145, 1.0, 12), s * 0.82, 0.92, -3.42, 0, 0, s * 0.10);
    P.add('hullDetail', cylY(0.152, 0.152, 0.05, 12), s * 0.82, 1.32, -3.46, 0, 0, s * 0.10); // cap ring
    P.add('hullDark', box(0.05, 0.38, 0.03), s * 0.82, 0.92, -3.54);            // straps
    P.add('hullDetail', box(0.06, 0.06, 0.5), s * 1.15, 1.30, -3.30);           // saddle rails
  }
  // engine deck: grille inset + transverse louvers
  P.add('hullDark', box(1.55, 0.02, 0.85), 0, 1.385, -2.05);
  if (P.q) for (let k = 0; k < 5; k++) P.add('hullDetail', box(1.45, 0.02, 0.05), 0, 1.39, -1.75 - k * 0.15);
  P.add('hull', box(0.85, 0.08, 0.65), -0.55, 1.42, -1.25);                     // intake hump
  headlight(P, 1.42, 1.10, 3.02, -0.2, 0.05);                                   // right-fender light
  liftEye(P, 'hullDetail', -1.18, 1.40, 1.5);
  liftEye(P, 'hullDetail', 1.18, 1.40, 1.5);
  towCable(P, [[-1.25, 1.02, 2.9], [-0.35, 0.96, 3.06], [0.55, 1.0, 2.96]]);    // glacis lip cable
  spareTrackStrip(P, 'hull', -1.28, 1.14, 2.4, 2, -1.15, 0);
  // turret: squat CAST DOME (half-egg lathe, plan-stretched), not a welded box
  P.add('turret', lathe([
    [1.06, 0.0], [1.05, 0.10], [1.00, 0.22], [0.90, 0.33], [0.76, 0.43],
    [0.58, 0.51], [0.34, 0.565], [0.0, 0.59],
  ], P.q ? 30 : 14, 1.18), 0, 0, -0.02);
  const T72H = 0.59;
  // K-5 eyebrow wedges over the frontal 60 deg (chunky raised courses)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.74, 0.30, 0.24), s * 0.44, 0.24, 0.66, -0.24, s * 0.55, 0);
    P.add('turret', box(0.58, 0.16, 0.20), s * 0.42, 0.47, 0.56, -0.42, s * 0.55, 0);
  }
  const t72Brow = (put, s) => {
    const dx = Math.cos(0.55), dz = -Math.sin(0.55);
    const nx = Math.sin(0.55), nz = Math.cos(0.55);
    for (let row = 0; row < 2; row++) for (let c = 0; c < 4; c++) {
      const t = -0.28 + c * 0.19;
      put(s * (0.44 + dx * t + nx * 0.15), 1.60 + row * 0.16,
        0.66 + dz * t + nz * 0.15, -0.24, s * 0.55, 0);
    }
  };
  P.eraCluster('turret_era_R', (put) => t72Brow(put, 1), true);
  P.eraCluster('turret_era_L', (put) => t72Brow(put, -1), true);
  // Sosna-U gunner sight: boxy housing standing on the roof LEFT of the gun,
  // rectangular barn-door cover — THE B3 giveaway (§14.5)
  P.add('turret', box(0.44, 0.30, 0.40), -0.40, T72H + 0.12, 0.30);
  P.add('turret', box(0.48, 0.09, 0.10), -0.40, T72H + 0.30, 0.47);             // brow lid
  P.add('turretDark', box(0.38, 0.22, 0.05), -0.40, T72H + 0.11, 0.515);        // door recess
  P.add('turret', box(0.17, 0.22, 0.03), -0.53, T72H + 0.11, 0.545, 0, 0.55, 0); // swung barn door
  P.add('turretGlass', box(0.15, 0.12, 0.02), -0.32, T72H + 0.11, 0.535);       // lens
  // commander cupola (right) with AA MG ring, gunner hatch left
  cupola(P, 'turret', 0.42, T72H - 0.06, -0.30, 0.22, 0.12, 5);
  P.add('turret', cylY(0.20, 0.20, 0.04, 14), -0.44, T72H - 0.03, -0.28);
  P.add('turretDetail', torus(0.25, 0.02, P.q ? 20 : 10), 0.42, T72H + 0.10, -0.30);
  // flat meteo mast at the roof rear (§14.5) + whip antenna
  P.add('turretDetail', box(0.025, 0.38, 0.025), -0.28, T72H + 0.24, -0.78);
  P.add('turretDetail', box(0.03, 0.5, 0.03), 0.62, T72H + 0.22, -0.72, 0, 0, 0.10);
  // snorkel tube stowed across the turret rear + grab rails
  P.add('turretDetail', cylX(0.065, 1.5, 10), 0, 0.30, -0.98);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.025, 0.025, 0.6), s * 0.85, 0.30, -0.45);
    stowage(P, 'turretCloth', rng, [[s * 0.72, 0.34, -0.72, 0.34, 0.22, 0.4]]);
  }
  // r3 kit de-share: no NATO tan jerry can on a Russian turret — a dark
  // stowed tarp bundle breaks the identical-kit read across the moderns.
  stowage(P, 'turretDark', rng, [[-0.05, 0.40, -0.95, 0.34, 0.16, 0.30]]);
  // 902B smoke bank on the left cheek (T-72B3 carries them clustered left)
  smokeCluster(P, -0.92, 0.32, 0.42, 6, -0.85, 0.6);
  // gun: 125 mm 2A46M-5 with sleeve + evacuator; embrasure block + collar
  P.addGunExtra(box(0.42, 0.42, 0.28), 0, 0.02, 0.52);
  P.addGunExtra(cylZ(0.13, 0.32, 12, 0.16), 0, 0, 0.76);
  buildGun(P, { len: 6.0, r: 0.068, sleeve: true, evac: 0.48, baseR: 0.15 });
  muzzleBore(P, { len: 6.0, r: 0.068 });                      // §B3.1 (shadow-named, 3fca39b)
  // 6 big stamped wheels (bigger/flatter than T-90 — §14.5), 3 rollers,
  // sprocket REAR
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.39, wheelW: 0.21, xc: 1.58,
    wheelZs: [2.48, 1.49, 0.50, -0.49, -1.48, -2.47],
    sprocket: { z: -3.0, y: 0.53, r: 0.27 }, idler: { z: 2.95, y: 0.51, r: 0.25 },
    rollers: [1.45, 0, -1.45].map((z) => ({ z, y: 0.92, r: 0.09 })),
    // r3: rubber-flap skirts cover the T-72B3 return run — no horn comb.
    trackW: 0.58, topY: 0.85, arms: true, paintedEnds: true, coveredTop: true,
  });
  P.decal('turret', 'number', '312', 0.30, [0.98, 0.24, -0.30], Math.PI / 2, 0, 0.18);
  P.decal('turret', 'number', '312', 0.30, [-0.98, 0.24, -0.30], -Math.PI / 2, 0, -0.18);
  P.decal('hull', 'soot', null, 0.7, [-1.6, 0.95, -1.8], -Math.PI / 2);         // left exhaust soot
  P.topY = 0.85;
}

// ---------------------------------------------------------------------------
// Challenger 2 — §18.5: long low horizontal roofline, shallow one-piece
// glacis + dozer-lip nose, big flat squared skirts, swept-back plan-arrow
// turret with mantlet-less slot, round cdr cupola RIGHT + pano sight,
// huge bustle bin/basket, fat sleeved L30 with MRS, 6 wheels + 4 rollers.
// ---------------------------------------------------------------------------
// BASE-21 helpers (challenger2 rebuild): call-time KIT access only (the
// module-cycle law — KIT initializes after this module evaluates).
// Mirror-safe slab (§C MISSING-SIDE law): s=-1 mirrors x AND swaps corner
// order so faces stay outward — never a bare x*s mirror.
const m1MirrX = ([x, y, z]) => [-x, y, z];
function mslab1(s, b0, b1, b2, b3, t0, t1, t2, t3) {
  const { slab } = KIT;
  return s > 0
    ? slab(b0, b1, b2, b3, t0, t1, t2, t3)
    : slab(m1MirrX(b1), m1MirrX(b0), m1MirrX(b3), m1MirrX(b2), m1MirrX(t1), m1MirrX(t0), m1MirrX(t3), m1MirrX(t2));
}
// Bow tow hook: bracket block + dark pin.
function towHook2(P, x, y, z) {
  const { box, cylX } = KIT;
  P.add('hullDetail', box(0.09, 0.12, 0.09), x, y, z);
  P.add('hullDark', cylX(0.02, 0.12, 6), x, y + 0.01, z + 0.03);
}

// ---------------------------------------------------------------------------
// CH1-BASE TONE KIT (uk round 2026-08-07 — owner order: "challenger 2 and 3
// ... using the base of the challenger 1"). The challenger1 r8/r9 family
// tone recipes (uk.js ukToneKit + ukGearAirBackers) re-expressed for the
// modern1 challenger builders: per-instance material work only — the gate
// renders self-lit masks, so nothing here moves a curve or a mask (§C).
// uk.js is single-owner + hash-guarded (challenger1 dbe33204), so the
// mechanism is PORTED, not imported; hex keys follow the tankFactory
// buildRunningGear clone defaults (pads 0x171614 / chain 0x27251f) plus the
// builders' own 0x565c50 tireHex clone (re-keyed to the dark ring tone —
// the ch1 r8 WHEEL-RING GRAMMAR: pale discs read against DARK-drawn tire
// rings, never the inverse).
// ---------------------------------------------------------------------------
function ch1BaseToneKit(P, o = {}) {
  const rehook = (m) => {
    m.onBeforeCompile = vehicleAmbientFloorHook;
    m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
    return m;
  };
  // Blue-glass calm (ch1 r8 O4c lineage): smoked dark-olive, b-r <= 0.
  P.mats.glass.color.setHex(o.glassHex ?? 0x3d443c);
  P.mats.glass.roughness = 0.48;
  P.mats.glass.metalness = 0.38;
  P.mats.glass.envMapIntensity = 0.3;
  if (o.cloth) {
    P.mats.canvasCloth.color.setHex(o.cloth);
    P.mats.canvasCloth.envMapIntensity = o.clothEnv ?? 0.10;
  }
  if (o.dark) P.mats.dark.color.setHex(o.dark);
  const wheelTone = rehook(P.mats.wheels.clone());
  wheelTone.color.setHex(o.wheelHex ?? 0x3e4531);
  wheelTone.envMapIntensity = o.wheelEnv ?? 0.13;
  const drumTone = rehook(P.mats.wheels.clone());
  drumTone.color.setHex(o.drumHex ?? 0x373d2c);
  drumTone.envMapIntensity = o.drumEnv ?? 0.14;
  P.disposables.push(wheelTone, drumTone);
  P.hullG.traverse((ob) => {
    if (!ob.isMesh && !ob.isInstancedMesh) return;
    const m = ob.material;
    if (!m || !m.color || !m.color.getHex) return;
    const hex = m.color.getHex();
    if (ob.isInstancedMesh && hex === 0x171614) {
      rehook(m).color.setHex(o.padHex ?? 0x272b20);            // shoe pads
      m.envMapIntensity = o.padEnv ?? 0.18;
    } else if (ob.isInstancedMesh && hex === 0x27251f) {
      rehook(m).color.setHex(o.chainHex ?? 0x2f3427);          // inner chain/horns
      m.envMapIntensity = o.chainEnv ?? 0.22;
    } else if (ob.isInstancedMesh && hex === 0x565c50) {
      rehook(m).color.setHex(o.ringHex ?? 0x2b2f1f);           // tire ring (dark-drawn, ch1 r8 grammar)
      m.envMapIntensity = o.ringEnv ?? 0.10;
      if (m.emissive) m.emissive.setHex(0x000000);
    } else if (m === P.mats.wheels) {
      ob.material = ob.isInstancedMesh ? wheelTone : drumTone; // discs / end-drum spinners
    }
  });
  const bm = o.bandMul ?? [0.92, 0.98, 0.82];
  for (const tm of [P.mats.trackL, P.mats.trackR]) {
    tm.color.setRGB(bm[0], bm[1], bm[2]);
    tm.envMapIntensity = o.bandEnv ?? 0.08;
  }
  P.mats.spareTrack.color.setHex(o.spareHex ?? 0x2c2f24);
  if (P.mats.rubber.emissive) P.mats.rubber.emissive.setHex(o.tireEmissive ?? 0x191d12);
}

// Render-only gear-air backers (ch1 O1a/r9 lineage): thin dark-olive catch
// plates inside the gear bays, NAMED /shadow/i so the gate mask pass, the
// evaluator masks and the critic framing all EXCLUDE them (§C shadow-proxy
// law). track-clip-audit does NOT skip them — callers thread the envelopes.
function ch1BaseGearBackers(P, plates, hex = 0x20261c) {
  const m = P.mats.shadow.clone();
  m.color.setHex(hex);
  m.roughness = 0.97;
  m.metalness = 0.0;
  m.envMapIntensity = 0.14;
  m.onBeforeCompile = vehicleAmbientFloorHook;
  m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
  P.disposables.push(m);
  for (const [w, h, d, x, y, z] of plates) {
    for (const side of [-1, 1]) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, m);
      mesh.name = 'gearAirShadowBacker';
      mesh.position.set(side * x, y, z);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      P.hullG.add(mesh);
      P.disposables.push(geo);
    }
  }
}

// ch1 r10b smoke-tube tips (the c5 r9 O8 recipe, verbatim transform math):
// per-tube proud tips + dark bores so 2x5 banks read circular mouths at 1x.
// Interior by construction at the callers' seats (caps sit inside each
// tube's own r 0.038 face circle; the priced turret rows on both ids are
// print-capped and the deltas are cm-scale on already-authored banks).
function smokeTubeTips(P, banks) {
  const { cylZ } = KIT;
  for (const [bx, by, bz, yaw, arc] of banks) {
    for (let k = 0; k < 5; k++) {
      const f = k - 2;
      const a = yaw + f * (arc / 5);
      const tx = bx + Math.cos(yaw) * f * 0.095, tz = bz - Math.sin(yaw) * f * 0.095;
      const dx = Math.sin(a), dy = Math.sin(0.5) * Math.cos(a), dz = Math.cos(0.5) * Math.cos(a);
      P.add('turretDark', cylZ(0.030, 0.006, 8), tx + 0.121 * dx, by + 0.121 * dy, tz + 0.121 * dz, -0.5, a, 0);
      P.add('turretDetail', cylZ(0.014, 0.032, 8), tx + 0.138 * dx, by + 0.138 * dy, tz + 0.138 * dz, -0.5, a, 0);
      P.add('turretDark', cylZ(0.011, 0.005, 8), tx + 0.156 * dx, by + 0.156 * dy, tz + 0.156 * dz, -0.5, a, 0);
    }
  }
}

function buildChallenger2(P) {
  const { box, cylX, cylY, cylZ, slab, frustum, fenders, headlight, liftEye,
    periscope, smokeCluster, towCable, stowage, jerryCan, tarpRoll,
    ammoCan, buildGun, buildRunningGear, cupola, torus } = KIT;
  const { rng } = P;
  // BASE-21 MODERNIZATION rebuild (owner directive 2026-08-06, modern-first
  // correction). PHOTO-CLASS, no oracle — FALSE-0: never gate this id.
  // Published envelope (dims sovereign): hull 8.33 (z ±4.165), width 3.52
  // over the skirt faces (±1.76 EXACT — §D width guard; the old build
  // authored ±1.895 and rescaled every probe), height 2.49 (GPS hood
  // crest), muzzle +7.335 = overall 11.50 over the −4.165 tail (the old
  // 6.7 tube ran 11.9). Packet: docs/references/tanks/challenger2.md.
  // SPEC NOTE (residual): armor gunBarrel.lengthM 6.7 vs the built 6.29
  // visible run — shadow-proxy true-up flagged for the orchestrator lane.

  // running gear (§B6 trapezoid: rear sprocket 0.55 / front idler 0.52 both
  // raised over the 0.46 wheel line; 6 Hydrogas stations + 4 covered
  // rollers). Track outer face 1.665 — 0.035 clear of the 1.70 skirt
  // inner plane (§B4 lane law). Shoe orbits (r + 0.175): sprocket far
  // −4.105 / top 1.055; idler far +4.085 / top 1.005.
  // uk round (2026-08-07, ch1-base port): SHOE-ENVELOPE IN-WINDOW fix — at
  // xc 1.34 / trackW 0.65 the shoe outer face sat at 1.75, 2 mm inside the
  // plan ±1.82 column window (1.748..1.892): the sprocket-wrap shoes painted
  // those columns to z -3.3 where the batch-48 ref's skirt content ends at
  // -2.43 (the row's worst columns, err ~1.03 ×2). Pulled to xc 1.325 /
  // trackW 0.58 → shoe outer 1.70 (48 mm clear of the plan window; still
  // paints the 1.688 front window whose ref carries ground at 0.03) —
  // track inner face 1.035 keeps 0.05 to the ±0.985 belly (§B4).
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.36, wheelW: 0.22, wheelY: 0.46, xc: 1.325,
    wheelZs: [2.95, 1.81, 0.67, -0.47, -1.61, -2.75],
    sprocket: { z: -3.60, y: 0.55, r: 0.33 }, idler: { z: 3.60, y: 0.52, r: 0.31 },
    rollers: [2.3, 1.0, -0.55, -1.95].map((z) => ({ z, y: 0.95, r: 0.085 })),
    // §B8.1 NATIVE-TONE wheel countability (acceptance residual: wheels
    // read DARK vs the print's pale Hydrogas rims) — tireHex mechanism.
    trackW: 0.58, topY: 0.95, paintedEnds: true, coveredTop: 1.02, tireHex: '#565c50',
  });

  // hull: long low horizontal roofline. Belly between the tracks (±0.985 —
  // 0.03 inboard of the 1.015 track inner face), band above the skirt line
  // ENDING at the ring roof (§B8 acceptance order 2026-08-06: "kill the
  // cliff + its horizontal band"), §B1 glacis rising past the ring plane
  // to the DRIVER CREST 1.78 (the verdict's numeric target) then a short
  // back-slope down to the 1.55 ring roof — the real CR2 bow hump.
  P.add('hull', box(1.97, 0.76, 8.10), 0, 0.68, -0.05);                        // belly
  P.add('hull', box(3.36, 0.41, 4.97), 0, 1.345, -1.585);                      // upper band ±1.68, y 1.14..1.55, z -4.07..0.90
  P.add('hull', box(3.32, 0.05, 4.95), 0, 1.545, -1.575);                      // roof plate to the ring zone
  P.add('hull', slab(                                                          // §B1 main glacis plane ±1.68 -> the 1.78 crest
    [-1.68, 0.96, 4.06], [1.68, 0.96, 4.06], [1.68, 0.90, 3.96], [-1.68, 0.90, 3.96],
    [-1.68, 1.78, 1.70], [1.68, 1.78, 1.70], [1.68, 1.72, 1.56], [-1.68, 1.72, 1.56]));
  P.add('hull', box(3.36, 0.06, 0.42), 0, 1.75, 1.49);                         // crest plateau 1.72..1.78, z 1.28..1.70
  P.add('hull', slab(                                                          // back-slope crest -> ring roof 1.55 (§C.1: ring y-order matches the
    [-1.68, 1.78, 1.30], [1.68, 1.78, 1.30], [1.68, 1.72, 1.30], [-1.68, 1.72, 1.30],   // glacis slab convention — the old order was the r2 standing
    [-1.68, 1.55, 0.90], [1.68, 1.55, 0.90], [1.68, 1.49, 0.90], [-1.68, 1.49, 0.90])); // 1-reversed-piece (winding-audit mesh#24, vol -0.081)
  P.add('hull', slab(                                                          // lower bow RAKED back (kill the cliff)
    [-0.985, 0.40, 3.72], [0.985, 0.40, 3.72], [0.985, 0.40, 3.44], [-0.985, 0.40, 3.44],
    [-0.985, 1.00, 4.105], [0.985, 1.00, 4.105], [0.985, 0.96, 3.98], [-0.985, 0.96, 3.98]));
  P.add('hull', box(1.94, 0.16, 0.30), 0, 0.34, 3.50);                         // toe beam under the rake
  for (const s of [-1, 1]) towHook2(P, s * 0.62, 0.56, 3.86);
  // rear plate: center lane below the band (sprocket lanes stay open), full
  // width above; grilles + louvres + convoy plate + mudflaps.
  // (REGISTRATION-ANCHOR law, measured this round: tucking the grille face
  // off -4.145 dropped the rear BODY column, moved hullLengthM 8.37->8.22
  // and re-phased dAlong 1.369->1.443 — stations 13.4->0. The rear plate
  // kit stays EXACTLY at the r2 stations; it is the length anchor.)
  P.add('hull', box(1.94, 0.62, 0.10), 0, 0.72, -4.10);
  P.add('hullDark', box(1.70, 0.42, 0.05), 0, 0.80, -4.145);
  if (P.q) for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.62, 0.045, 0.05), 0, 0.64 + k * 0.13, -4.16);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.15, 0.08, 0.05), s * 1.28, 1.42, -4.135);          // taillights
    P.add('hullRubber', box(0.62, 0.40, 0.026), s * 1.40, 0.90, -4.13);        // rear flaps (clear of the −4.105 orbit)
    P.add('hullDetail', box(0.07, 0.05, 0.16), s * 1.40, 1.125, -4.06);        // flap hangers
  }
  P.add('hullDetail', box(0.30, 0.18, 0.04), 0, 1.32, -4.155);                 // convoy plate
  // §B8 acceptance order 3 (2026-08-06): the full-length fender SHELF is
  // DELETED ("gunwale ledge ... exists nowhere on the vehicle") — the
  // skirt top now meets the hull band line directly; only the real front
  // mudguards over the idler stay.
  for (const s of [-1, 1]) {
    P.add('hull', mslab1(s,                                                    // mudguards 24mm inside the anchor face (plan-row truth)
      [1.02, 1.035, 3.55], [1.735, 1.035, 3.55], [1.735, 1.035, 3.52], [1.02, 1.035, 3.52],
      [1.02, 1.075, 4.15], [1.735, 1.075, 4.15], [1.735, 1.125, 3.57], [1.02, 1.125, 3.57]));
    P.add('hullRubber', box(0.60, 0.30, 0.026), s * 1.40, 0.86, 4.145);        // front flaps ahead of the +4.085 orbit
  }
  // big flat squared skirts at ±1.76 EXACT: raised stepped FRONT panel
  // (raked leading edge, exposes the idler + approach run) + 5 full panels.
  // §B8 acceptance order 1: skirt bottom UP to the 0.58 hub line with a
  // SCALLOPED lower edge (inter-wheel tabs) — 6 Hydrogas wheels ~60%
  // exposed like the print; the old 0.42 rubber fringe is gone.
  // FINISH r2 (plan-row truth): the print's FULL-WIDTH skirt faces span
  // z -1.23..3.13 only — the rear two bays RECESS to a 1.735 face (the
  // §D width anchor stays on the front bays + panel at 1.76 EXACT), the
  // stepped front panel ends at the print's 3.13 line, and the scallop
  // tabs tuck to 1.7525 max (AA-sliver law: no face kisses at the 1.76
  // column window).
  for (const s of [-1, 1]) {
    P.add('hull', mslab1(s,                                                    // stepped front panel w/ raked lead edge
      [1.70, 0.88, 2.98], [1.76, 0.88, 2.98], [1.76, 0.92, 2.56], [1.70, 0.92, 2.56],
      [1.70, 1.145, 3.12], [1.76, 1.145, 3.12], [1.76, 1.145, 2.56], [1.70, 1.145, 2.56]));
    for (let k = 0; k < 5; k++) {
      const z = 1.92 - k * 1.28;
      const rec = k >= 3 ? 0.025 : 0;                                          // rear bays recessed off the anchor face
      P.add('hull', box(0.06, 0.565, 1.24), s * (1.73 - rec), 0.8625, z);      // panel (face 1.76 EXACT on bays 1-3)
      P.add('hullDark', box(0.012, 0.05, 0.30), s * (1.7605 - rec), 1.02, z);  // recessed handle strip
      P.add('hullDark', box(0.065, 0.52, 0.018), s * (1.73 - rec), 0.885, z - 0.635); // panel seams
    }
    for (const zg of [2.38, 1.24, 0.10, -1.04, -2.18]) {                       // scallop tabs between the wheel stations
      P.add('hull', box(0.055, 0.10, 0.34), s * (1.725 - (zg < -1.3 ? 0.025 : 0)), 0.55, zg);
    }
    P.add('hullShadow', new THREE.BoxGeometry(0.30, 0.03, 7.4), s * 1.50, 1.10, -0.05);
  }
  // glacis furniture ON the new crest/plane: driver hatch + periscope ride
  // the 1.78 crest plateau, splash V-strips on the steeper rake.
  P.add('hull', cylY(0.29, 0.29, 0.04, P.q ? 20 : 12), 0, 1.795, 1.48);        // driver hatch on the crest
  P.add('hullDark', torus(0.29, 0.014, P.q ? 20 : 12), 0, 1.802, 1.48);
  periscope(P, 'hullDetail', 0, 1.81, 1.66);                                   // driver sight at the crest lip
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.98, 0.045, 0.07), s * 0.55, 1.48, 2.62, 0.334, s * 0.30, 0); // splash V-strip on the rake
  }
  {
    const lights = [];
    for (const s of [-1, 1]) {
      const lc = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.15, rake: -0.35, seed: 2 + s });
      lc.position.set(s * 1.32, 1.16, 3.95);
      P.hullG.add(lc);
      lights.push(lc);
    }
  }
  {
    const tc = FITTINGS.towCable({ mats: P.mats, r: 0.021, seed: 4,
      pts: [[-1.30, 1.24, 2.85], [-0.40, 1.42, 2.20], [0.55, 1.30, 2.66], [1.30, 1.14, 3.30]] });
    P.hullG.add(tc);
  }
  // deck furniture: louvred engine field, fuel caps, lift eyes, sponson
  // bins, strapped kit.
  P.add('hullDark', box(1.90, 0.02, 1.30), 0, 1.556, -2.60);
  if (P.q) for (let k = 0; k < 6; k++) P.add('hullDetail', box(1.80, 0.025, 0.06), 0, 1.566, -3.10 + k * 0.20);
  for (const zc of [-1.65, -0.75]) {
    P.add('hullDetail', cylY(0.11, 0.11, 0.03, 12), 1.15, 1.56, zc);           // access caps
    P.add('hullDark', torus(0.11, 0.012, 12), -1.15, 1.565, zc);
  }
  liftEye(P, 'hullDetail', -1.45, 1.58, -1.60);
  liftEye(P, 'hullDetail', 1.45, 1.58, -1.60);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.30, 0.20, 1.35), s * 1.50, 1.66, -2.95);               // sponson stowage bins
    P.add('hullDark', box(0.31, 0.02, 1.37), s * 1.50, 1.765, -2.95);          // bin lid seams
    P.add('hullDark', box(0.026, 0.16, 0.03), s * 1.50, 1.65, -2.30);          // latches
  }
  stowage(P, 'hullCloth', rng, [[-0.85, 1.64, -3.42, 0.5, 0.22, 0.9], [0.85, 1.63, -3.58, 0.4, 0.2, 0.8]]);

  // ---- turret: the Dorchester wedge (§B1 turret slope law — the front is
  // TWO strongly plan-swept AND elevation-raked cheek planes meeting the
  // central embrasure; §B1.1 both cheeks carry the same rake). Ratified
  // plan width 2.80 (CTW 1.40); roof 2.47 world, GPS hood crest 2.49 = the
  // published height line.
  const CTW = 1.40, CTH = 0.92;
  P.add('turret', frustum(CTW, 0.10, -2.15, CTW * 0.92, -0.02, -2.10, 0.0, CTH)); // main body
  // §B8 acceptance order 4 (2026-08-06): the cheek planes carry the
  // Dorchester rake ALL THE WAY to the roof line — top ring at 0.94 (the
  // 2.49 crest), no roof-box step above the face.
  // (cheek UNDERSIDES rise toward the apex clearing the new 1.78 driver
  // hump — the real CR2 turret front floats over the crest)
  P.add('turret', slab(                                                        // R swept cheek
    [0.16, 0.26, 1.28], [CTW, 0, 0.10], [CTW, 0, -0.35], [0.16, 0.14, 0.85],
    [0.16, 0.94, 0.71], [CTW * 0.90, 0.94, -0.32], [CTW * 0.90, 0.94, -0.64], [0.16, 0.94, 0.42]));
  P.add('turret', slab(                                                        // L swept cheek (corner-swapped mirror)
    [-CTW, 0, 0.10], [-0.16, 0.26, 1.28], [-0.16, 0.14, 0.85], [-CTW, 0, -0.35],
    [-CTW * 0.90, 0.94, -0.32], [-0.16, 0.94, 0.71], [-0.16, 0.94, 0.42], [-CTW * 0.90, 0.94, -0.64]));
  for (const s of [-1, 1]) {
    P.add('turret', box(0.10, CTH * 0.94, 0.10), s * 0.17, CTH / 2, 1.06, 0, s * 0.5, 0); // bevel strips at the slot
    P.add('turretDark', box(0.55, 0.03, 0.03), s * 0.7, 0.34, 0.62, 0, s * 0.72, 0);      // cheek module seam
  }
  // Dorchester side module slabs (boxy cheek-to-bustle side read)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.14, CTH * 0.72, 1.55), s * (CTW + 0.03), CTH * 0.42, -0.90, 0, s * 0.03, 0);
    P.add('turretDark', box(0.145, 0.03, 1.50), s * (CTW + 0.035), CTH * 0.42, -0.90, 0, s * 0.03, 0);
  }
  // gun slot: NARROW mantlet-less embrasure — block + dark walls + the
  // canvas boot collar the sleeve emerges from (§B3.1: a real recessed
  // collar, not a bare notch). L94A1 coax chain-gun port on the LEFT
  // cheek face beside the slot (the real CR2 coax station).
  P.add('turret', box(0.44, 0.62, 0.42), 0, 0.32, 0.92);                       // embrasure block
  P.add('turretDark', box(0.50, 0.50, 0.06), 0, 0.32, 1.12);                   // slot shadow wall
  P.add('turret', cylZ(0.055, 0.06, 10), -0.30, 0.46, 1.005, -0.05, -0.35, 0); // coax port collar on the raked cheek
  P.add('turretDark', cylZ(0.030, 0.10, 8), -0.30, 0.46, 1.03, -0.05, -0.35, 0); // L94A1 bore
  // commander's round cupola RIGHT with episcope ring + VS580 pano ahead
  cupola(P, 'turret', 0.58, CTH, -0.55, 0.26, 0.16, 8);
  // FINISH r2 (datum true-up c48bf50): heightM is now the SENSOR-INCLUSIVE
  // 3.04 published pano line — the VS580 mast rises so the head cap tops
  // 3.04 world across 3 side columns (p95 carrier; whips spike above per
  // the <=4-column budget, aligned with the print's own 3.86/4.0 spikes).
  P.add('turretDetail', cylY(0.075, 0.09, 0.26, 10), 0.52, CTH + 0.13, 0.05);  // pano pedestal column
  P.add('turretDark', cylY(0.115, 0.125, 0.22, 12), 0.52, CTH + 0.40, 0.05);   // VS580 head drum
  P.add('turretDark', box(0.20, 0.06, 0.36), 0.52, CTH + 0.54, 0.05);          // head cap (top 1.49 local = 3.04 published)
  P.add('turretGlass', box(0.15, 0.09, 0.02), 0.52, CTH + 0.41, 0.175);        // pano window
  // gunner's primary sight (GPS) armored housing SUNK INTO the raked face
  // (§B8 order 4: no boxes poking above the cheek plane): hood walls +
  // brow + RECESSED angled glass. Crest 0.94 local = the published 2.49.
  P.add('turret', box(0.52, 0.12, 0.44), 0.42, 0.86, 0.42);                    // housing body (top 0.92)
  P.add('turretDetail', box(0.56, 0.03, 0.48), 0.42, CTH + 0.005, 0.41);       // brow lid (top 0.94 local)
  P.add('turretDark', box(0.44, 0.135, 0.03), 0.42, CTH - 0.025, 0.645);       // aperture back panel
  P.add('turretGlass', box(0.30, 0.075, 0.014), 0.42, CTH - 0.035, 0.658, -0.20, 0, 0); // recessed angled glass
  // loader hatch LEFT + census GPMG on its rim pintle (§I fitting)
  P.add('turret', cylY(0.22, 0.22, 0.05, 14), -0.62, CTH + 0.02, -0.45);
  P.add('turretDark', box(0.32, 0.014, 0.03), -0.62, CTH + 0.052, -0.45);
  {
    // uk round: yaw 0.55 -> 0.12 (owner 2026-08-07 "machine guns point
    // forward, not to the left" — the CROWS-FORWARD spirit applied to the
    // manned pintle rest pose too).
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', seed: 22, elev: 0.14, rotation: [0, 0.12, 0] });
    mg.position.set(-0.66, CTH + 0.02, -0.28);
    P.turretG.add(mg);
  }
  // ch1-base MG-station cluster (ch1 r10b grammar): ammo cans + belt tray
  // beside the pintle so the station reads as a manned weapon post, not a
  // lone gun. Interior: tops <= CTH+0.20 = 2.74w under the 2.80 cupola line
  // in the same side band; x >= -0.90 inside the roof plan.
  P.add('turretDark', box(0.10, 0.12, 0.16), -0.86, CTH + 0.08, -0.12);
  P.add('turretDetail', box(0.09, 0.10, 0.14), -0.84, CTH + 0.07, -0.50);
  P.add('turretDark', box(0.07, 0.028, 0.10), -0.78, CTH + 0.155, -0.30);
  // loader-hatch ring dressing (ch1 r10b roof grammar): periscope blocks
  // around the ring + lid seam disc — flush-tangent on the lid/roof planes.
  for (const [px, pz] of [[-0.40, -0.28], [-0.86, -0.42], [-0.44, -0.62]]) {
    P.add('turretDark', box(0.07, 0.010, 0.05), px, CTH + 0.005, pz);
  }
  P.add('turretDetail', cylY(0.155, 0.155, 0.006), -0.62, CTH + 0.048, -0.45);
  // roof plateau seam strips (flush ON the 0.92 roof plane, ch1 deck-seam class)
  P.add('turretDark', box(0.016, 0.004, 0.92), -0.18, CTH + 0.002, -0.40);
  P.add('turretDark', box(0.70, 0.004, 0.014), 0.30, CTH + 0.002, -0.85);
  liftEye(P, 'turretDetail', -1.0, CTH + 0.03, 0.0);
  liftEye(P, 'turretDetail', 1.0, CTH + 0.03, -0.9);
  // twin whips on the bustle corners (uk round: the batch-48 ref's ONE
  // front antenna column reads x -0.886 top 2.94 — a1 re-seated onto it,
  // trimmed so the tip rides the ref line; a2 kept as the real CR2 second
  // whip (variant truth) but shortened under the 2.94-3.04 sensor band —
  // its ref column carries no antenna, honest ~0.5 residual on one col)
  {
    const a1 = FITTINGS.antennaWhip({ mats: P.mats, h: 0.44, rake: 0.05, seed: 5 });
    a1.position.set(-0.886, CTH + 0.02, -1.50);
    P.turretG.add(a1);
    const a2 = FITTINGS.antennaWhip({ mats: P.mats, h: 0.36, rake: -0.04, seed: 6 });
    a2.position.set(0.90, CTH + 0.02, -1.55);
    P.turretG.add(a2);
  }
  // HUGE rear bustle bin + full-width basket (CR2 identity)
  P.add('turret', box(2.60, 0.50, 0.55), 0, 0.30, -2.38);                      // welded bin
  P.add('turretDetail', box(2.62, 0.05, 0.57), 0, 0.57, -2.38);                // bin lid lip
  for (const f of [-0.9, 0, 0.9]) P.add('turretDark', box(0.03, 0.52, 0.57), f, 0.30, -2.38);
  const bkT = 0.56, bkB = 0.12, bkZ = -2.92;
  P.add('turretDetail', box(2.90, 0.05, 0.05), 0, bkT, bkZ);                   // basket rails
  P.add('turretDetail', box(2.90, 0.05, 0.05), 0, bkB, bkZ);
  for (let k = 0; k < 13; k++) P.add('turretDetail', box(0.035, bkT - bkB, 0.035), -1.40 + k * 0.233, (bkT + bkB) / 2, bkZ);
  P.add('turretDark', box(2.80, 0.02, 0.42), 0, bkB + 0.03, -2.70);            // mesh floor
  // ch1-base rail-over-mesh basketry (ch1 r10 O5a grammar): dark mesh
  // panels seated 2 mm into the bin rear face + pale rails reading over
  // them — the stack stops reading as clean crates. Interior: z >= -2.67
  // (the -2.92 basket rails own the tail), y tops 0.575 under the bin lid.
  P.add('turretDark', box(0.46, 0.25, 0.010), -0.45, 0.30, -2.662);
  P.add('turretDark', box(0.46, 0.25, 0.010), 0.45, 0.30, -2.662);
  for (const px of [-0.45, 0.45]) {
    for (const ry of [0.22, 0.40]) P.add('turretDetail', box(0.44, 0.020, 0.007), px, ry, -2.668);
    for (const rx of [-0.20, 0, 0.20]) P.add('turretDetail', box(0.020, 0.25, 0.007), px + rx, 0.30, -2.668);
  }
  stowage(P, 'turretCloth', rng, [
    [-0.75, 0.38, -2.70, 0.6, 0.4, 0.38], [0.15, 0.35, -2.72, 0.5, 0.34, 0.36],
  ]);
  tarpRoll(P, 'turretCloth', 0.7, 0.52, -2.68, 1.05, 0.13, true);              // camo net roll
  jerryCan(P, 'turretCloth', -1.15, 0.36, -2.70, 0.15);
  ammoCan(P, 'turretDark', 1.10, 0.32, -2.72, 0.25);
  // twin 5-tube smoke banks on the cheeks (+ ch1 r10b tube tips + bores —
  // the banks read circular mouths at 1x instead of solid crates)
  smokeCluster(P, 0.98, 0.42, 0.72, 5, 0.85, 0.7);
  smokeCluster(P, -0.98, 0.42, 0.72, 5, -0.85, 0.7);
  smokeTubeTips(P, [[0.98, 0.42, 0.72, 0.85, 0.7], [-0.98, 0.42, 0.72, -0.85, 0.7]]);
  // side stowage baskets along the turret walls
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.04, 0.26, 1.10), s * (CTW + 0.075), 0.40, -1.65);
    stowage(P, 'turretCloth', rng, [[s * (CTW + 0.02), 0.42, -1.6, 0.14, 0.24, 0.85]]);
  }
  // TOGS II armored barbette ABOVE the gun (pitches with it): boxy housing,
  // shutter brow, dark aperture + glass slit.
  P.addGunExtra(box(0.42, 0.32, 0.66), 0, 0.42, 0.42);
  P.addGunExtra(box(0.46, 0.08, 0.70), 0, 0.60, 0.42);                         // brow lid
  P.addGunExtraDark(box(0.30, 0.18, 0.05), 0, 0.42, 0.76);                     // aperture
  P.addGunExtra(cylZ(0.145, 0.30, P.q ? 20 : 12, 0.165), 0, 0, 0.62);          // boot collar at the slot
  P.addGunExtraDark(cylZ(0.150, 0.05, P.q ? 20 : 12), 0, 0, 0.50);             // boot seam ring
  // fat thermal-sleeved L30 with MRS at the muzzle + fume extractor:
  // muzzle +7.335 world = the published 11.50 overall.
  buildGun(P, { len: 6.29, r: 0.082, sleeve: true, evac: 0.58, collar: true, baseR: 0.15 });
  muzzleBore(P, { len: 6.29, r: 0.082 });                     // §B3.1 (shadow-named, 3fca39b)
  // ch1-base STERN KIT (ch1 r10 O5b grammar, CR2 fit): draped cable +
  // cleats across the upper rear face, outlet boxes at the plate corners.
  // Column-safe: everything rides z >= -4.145 (the rear plate kit is the
  // hullLengthM/dAlong anchor — REGISTRATION-ANCHOR law, never extended)
  // and y <= 1.42 inside the taillight/band rear silhouette.
  KIT.towCable(P, [[-0.78, 1.40, -4.09], [0, 1.26, -4.10], [0.78, 1.40, -4.09]]);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.09, 0.09, 0.05), s * 0.78, 1.40, -4.075);        // cable cleats
    P.add('hullDark', box(0.20, 0.16, 0.05), s * 0.55, 1.30, -4.09);           // outlet boxes on the band rear face
    P.add('hullDark', cylZ(0.036, 0.05, 10), s * 0.34, 1.28, -4.085);          // pipe stubs
  }
  // deck panel seams + filler caps (ch1 r10b deck grammar — flush)
  P.add('hullDark', box(1.60, 0.004, 0.016), 0, 1.572, 0.30);
  P.add('hullDark', box(1.60, 0.004, 0.016), 0, 1.572, -0.72);
  // ch1-base family tone kit + gear-air backers (the r8/r9 recipes): pale
  // Hydrogas discs vs dark tire rings, warm-olive pads/chain, muted band,
  // smoked glass, dark-olive fittings; render-only shadow plates give the
  // scalloped bays their inter-wheel shade (§C shadow-named exclusion).
  ch1BaseToneKit(P, { cloth: 0x262b1d, clothEnv: 0.05, dark: 0x282c22 });
  ch1BaseGearBackers(P, [
    [0.016, 0.35, 5.50, 0.998, 0.42, 0.075],                                   // inter-wheel shadow wall (x 0.99..1.006; band inner 1.035)
    [0.52, 0.42, 0.02, 1.17, 0.48, 2.38],                                      // per-bay catch plates at the scallop stations
    [0.52, 0.42, 0.02, 1.17, 0.48, 1.24],
    [0.52, 0.42, 0.02, 1.17, 0.48, 0.10],
    [0.52, 0.42, 0.02, 1.17, 0.48, -1.04],
    [0.52, 0.42, 0.02, 1.17, 0.48, -2.18],
  ]);
  // ZAP plate front + squadron number on turret sides
  P.decal('hull', 'number', 'KC91AA', 0.34, [0.85, 1.30, 3.20], 0, -1.36);
  P.decal('turret', 'number', P.spec.visual.number || '22', 0.36, [1.20, 0.42, -0.9], Math.PI / 2, 0, 0.06);
  P.decal('turret', 'number', P.spec.visual.number || '22', 0.36, [-1.20, 0.42, -0.9], -Math.PI / 2, 0, -0.06);
  P.decal('hull', 'soot', null, 0.8, [-1.0, 1.1, -4.17], Math.PI);
  P.topY = 1.05;
}

// ---------------------------------------------------------------------------
// Challenger 3 — NEW VEHICLE (owner greenlight 2026-08-06). §B8 PROPORTIONS
// FIRST: authored against the NC-quarantined 42manako print's measured
// tables (docs/references/vertex/challenger_3.json — width 3.519 = the
// anchor, turret face ~2.45w/tail -2.13w, bore line 1.76, ground run
// -2.1..+2.7 with high-tucked end wheels) at the PUBLISHED CR2-anchor
// envelope (dims sovereign: hull ±4.165, width ±1.755 EXACT skirts,
// muzzle +7.335 = 11.50). CR3 identity vs the CR2 resident: the NEW
// Rheinmetall turret (flat raked face over jutting lower cheek wedges,
// huge squared bustle), Trophy APS side modules, roof RWS, and the
// 120 mm L55A1 SMOOTHBORE (evacuator + thermal sleeve + MRS collar +
// §B3.1 muzzle bore) replacing the rifled L30.
// ---------------------------------------------------------------------------
function buildChallenger3(P) {
  const { box, cylY, cylZ, slab, frustum, headlight, liftEye,
    periscope, smokeCluster, stowage, jerryCan, tarpRoll,
    ammoCan, buildGun, buildRunningGear, torus } = KIT;
  const { rng } = P;

  // ---- running gear (§B6 trapezoid; print seats): 6 Hydrogas wheels on
  // the print's -2.0..+2.55 run, HIGH-TUCKED idler/sprocket (approach
  // ramp 3.0->3.8, departure -2.2..-3.2 — both read below the skirt cut).
  // Track outer 1.60 + skirt inner 1.725 (§B4 lane law with margin).
  // uk round (2026-08-07, ch1-base port): SHOE-ENVELOPE IN-WINDOW fix — the
  // old xc 1.29 / trackW 0.56 put the shoe outer face at 1.655 = EXACTLY the
  // plan ±1.72 column window edge (1.6555) and inside the front 1.624 window
  // (1.5945..1.6535): the shoes painted the ±1.72 plan columns to z -3.27
  // where the batch-47 ref ends at -0.892 (err 1.224 ×2, the worst plan
  // columns) and the 1.624 front bottoms to ground (ref 0.838, err 0.397).
  // Pulled to xc 1.245 / trackW 0.50 → shoe outer 1.58 (14 mm inside the
  // front boundary, 75 mm clear of the plan window; still paints the 1.565
  // front window whose ref DOES carry ground). Sprocket tucked -2.66 → -2.60
  // + r 0.31 → 0.28, y 0.98 (wrap far -3.065, pads ≤ -3.15 — out of the
  // -3.258 side window whose ref floor is 1.094; wrap bottom 0.52 vs the
  // ref's own 0.612 wrap line at the -3.13 column; orbit top 1.44 stays
  // 0.035 under the 1.475 sponson floor — §B4 wrap-lane law held).
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.36, wheelW: 0.22, wheelY: 0.46, xc: 1.245,
    wheelZs: [2.55, 1.64, 0.73, -0.18, -1.09, -2.00],
    sprocket: { z: -2.60, y: 0.98, r: 0.28 }, idler: { z: 3.35, y: 0.62, r: 0.28 },
    rollers: [1.95, 0.55, -0.85, -1.75].map((z) => ({ z, y: 1.10, r: 0.08 })),
    trackW: 0.50, topY: 1.26, contactZF: 2.75, contactZR: -2.10,
    // §B8.1 NATIVE-TONE wheel countability (acceptance-flagged "wheels
    // render DARK vs the print's pale Hydrogas rims") — merkava r12
    // tireHex mechanism, per-tank param, default byte-identical elsewhere.
    paintedEnds: true, coveredTop: 1.18, tireHex: '#565c50',
  });

  // ---- hull: belly + sponson strips at the print's front rows (0.42 /
  // 0.33), wrap-safe 3-piece band (sprocket orbit top 1.445 vs sponson
  // floor 1.475), stepped engine deck rising rearward like the print.
  // FINISH r2 (2026-08-06 punch list 3): stern floor raised to the print's
  // 0.97..1.19 rising underside line (side_hull worst cols -3.1..-4.05).
  // (uk round: belly rear end pulled -3.15 → -2.93 — its 0.42 floor painted
  // the -3.0/-3.13 side windows where the batch-47 ref bottoms read
  // 0.515/0.612, the ref's own rising wrap/boat-tail line; the stern-rise
  // slabs below now own that line. Sponson strips follow the 1.245 gear
  // lane: outer 0.96 = new track inner 0.995 - 0.035.)
  P.add('hull', box(1.72, 0.60, 6.33), 0, 0.72, 0.235);                        // belly ±0.86, y 0.42..1.02, ends z -2.93
  for (const s of [-1, 1]) {
    P.add('hull', box(0.12, 0.69, 6.30), s * 0.90, 0.675, 0.0);                // sponson under-strip (0.33 line; outer 0.96 = wrap lane 0.995 - 0.035)
  }
  // (plan-grid law, measured this round: plan columns pitch 0.13 — the
  // ±1.72 column window spans 1.655..1.785; the print keeps its band
  // walls INSIDE 1.63 there, only the skirts reach further out)
  P.add('hull', box(1.92, 0.53, 6.35), 0, 1.285, -0.875);                      // band spine ±0.96 (wrap lane 0.995 - 0.035), y 1.02..1.55
  for (const s of [-1, 1]) {
    P.add('hull', box(0.57, 0.075, 5.85), s * 1.345, 1.5125, -0.625);          // sponson floor 1.06..1.63, ends -3.55
    P.add('hull', box(0.04, 0.53, 5.85), s * 1.61, 1.285, -0.625);             // outer band wall 1.59..1.63, ends -3.55
    P.add('hull', mslab1(s,                                                    // tapered sponson floor closure -3.55 -> -3.92
      [1.06, 1.475, -3.55], [1.63, 1.475, -3.55], [1.26, 1.475, -3.92], [1.06, 1.475, -3.92],
      [1.06, 1.55, -3.55], [1.63, 1.55, -3.55], [1.26, 1.55, -3.92], [1.06, 1.55, -3.92]));
  }
  P.add('hull', box(3.36, 0.045, 3.35), 0, 1.5275, 0.625);                     // main deck 1.55, z -1.05..2.30
  P.add('hull', box(3.36, 0.05, 0.53), 0, 1.615, -1.515);                      // engine deck step 1.64
  P.add('hull', box(3.36, 0.05, 0.67), 0, 1.645, -2.115);                      // step 1.67
  P.add('hull', box(1.92, 0.045, 0.35), 0, 1.6775, -2.625);                    // exhaust hump 1.70 (print front deck line 1.66 at ±0.96)
  P.add('hull', box(3.36, 0.05, 0.50), 0, 1.665, -3.05);                       // rear deck 1.69
  P.add('hull', slab(                                                          // stern deck falling 1.64 -> 1.35, rear tapered to ±1.30 (print boat-tail;
    [-1.68, 1.64, -3.30], [1.68, 1.64, -3.30], [1.68, 1.59, -3.30], [-1.68, 1.59, -3.30],   // ends at the -3.94 center-plate line; §C.1 ring order = the glacis
    [-1.30, 1.35, -3.94], [1.30, 1.35, -3.94], [1.30, 1.30, -3.94], [-1.30, 1.30, -3.94])); // convention — the r1 latent reversed piece #1, winding-audit pinned
  // §B1 glacis — ONE plane ±1.62 from the nose lip to the 1.55 roof knee
  // (print top line 1.06@3.95 -> 1.55@2.30, shallow), 0.85 bow underside,
  // raked lower bow back to the belly (center lane, §B4 idler lanes open)
  P.add('hull', slab(                                                          // center lane (deep underside)
    [-0.95, 1.00, 4.11], [0.95, 1.00, 4.11], [0.95, 0.85, 4.02], [-0.95, 0.85, 4.02],
    [-0.95, 1.55, 2.32], [0.95, 1.55, 2.32], [0.95, 1.49, 2.20], [-0.95, 1.49, 2.20]));
  P.add('hull', mslab1(1,                                                      // right wing — THIN co-planar
    [0.95, 1.00, 4.11], [1.62, 1.00, 4.11], [1.62, 0.95, 4.09], [0.95, 0.95, 4.09],
    [0.95, 1.55, 2.32], [1.62, 1.55, 2.32], [1.62, 1.50, 2.30], [0.95, 1.50, 2.30]));
  P.add('hull', mslab1(-1,
    [0.95, 1.00, 4.11], [1.62, 1.00, 4.11], [1.62, 0.95, 4.09], [0.95, 0.95, 4.09],
    [0.95, 1.55, 2.32], [1.62, 1.55, 2.32], [1.62, 1.50, 2.30], [0.95, 1.50, 2.30]));
  P.add('hull', slab(                                                          // nose lip to the 0.85 underside line
    [-1.28, 0.85, 4.10], [1.28, 0.85, 4.10], [1.28, 0.85, 3.84], [-1.28, 0.85, 3.84],
    [-1.28, 1.02, 4.135], [1.28, 1.02, 4.135], [1.28, 1.10, 3.99], [-1.28, 1.10, 3.99]));
  P.add('hull', slab(                                                          // raked lower bow, center lane (§C.1: was the r1 latent reversed
    [-0.98, 0.42, 3.32], [0.98, 0.42, 3.32], [0.98, 0.42, 3.28], [-0.98, 0.42, 3.28],   // piece #2 — an inside-out frustum, vol -0.118; re-authored as a
    [-0.98, 0.85, 4.06], [0.98, 0.85, 4.06], [0.98, 0.85, 3.82], [-0.98, 0.85, 3.82])); // slab in the proven ring convention, identical shape
  P.add('hull', box(1.90, 0.14, 0.26), 0, 0.36, 3.42);                         // toe beam
  for (const s of [-1, 1]) {
    // uk round: corner flaps raised 0.63..0.95 -> 0.90..1.34 — the ref's
    // ±1.58 front bottoms read 1.17 (our 0.63 flap bottom was the row's
    // 0.33-err pair); the +4.1 BODY column keeps its 12% span via the
    // taller flap + nose lip (0.85..1.34 — dims body-band pin held).
    P.add('hull', box(0.38, 0.44, 0.03), s * 1.46, 1.12, 4.10);                // front corner flaps (dims body-band pin)
    P.add('hullDetail', box(0.09, 0.11, 0.09), s * 0.60, 0.56, 3.72);          // tow eyes
  }
  // glacis furniture: driver hatch + periscopes at the crest, splash strip
  P.add('hull', cylY(0.28, 0.28, 0.04, P.q ? 20 : 12), 0.30, 1.575, 1.78);     // driver hatch
  P.add('hullDark', torus(0.28, 0.014, P.q ? 20 : 12), 0.30, 1.582, 1.78);
  periscope(P, 'hullDetail', 0.30, 1.60, 2.12);
  periscope(P, 'hullDetail', 0.02, 1.59, 2.12, -0.15);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.92, 0.045, 0.07), s * 0.52, 1.33, 2.98, 0.30, s * 0.30, 0); // splash V
  }
  {
    const lights = [];
    for (const s of [-1, 1]) {
      const lc = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.15, rake: -0.32, seed: 6 + s });
      lc.position.set(s * 1.30, 1.13, 3.90);
      P.hullG.add(lc);
      lights.push(lc);
    }
  }
  {
    const tc = FITTINGS.towCable({ mats: P.mats, r: 0.021, seed: 9,
      pts: [[-1.25, 1.28, 2.60], [-0.35, 1.44, 2.05], [0.60, 1.33, 2.50], [1.20, 1.32, 2.90]] });
    P.hullG.add(tc);
  }
  // ---- stern: raked boat tail + upper plate with the CR3 print's rear
  // kit (external tank, exhaust boxes, convoy plate) inside ±4.165.
  // FINISH r2: the print's stern floor is HIGH (0.64@-3.14 rising to
  // 1.19@-4.04) — steep boat-tail rise ending -3.40, then a rising
  // underside wedge to the tail; upper plate raised (0.98..1.38, print
  // top 1.39) and NARROWED to ±1.28 with tapered stern walls (the print's
  // plan boat-tail: full-width content ends z -3.55 at |x| 1.34+).
  // uk round: the boat-tail floor re-authored ON the batch-47 ref's own
  // rising bottom line (side ref bottoms 0.515@-3.0 / 0.612@-3.13 /
  // 1.094@-3.258 / 1.191@-4.03 — the old 0.42-floor frustum painted the
  // -3.0..-3.26 windows 0.3-0.65 deep). Three ≤0.48 segments (§C station
  // end-caps), underside-quad-first ring order (the file's stern-wedge
  // convention).
  P.add('hull', slab(                                                          // rise 0.42@-2.93 -> 0.64@-3.16 (through the ref's 0.515/-3.0 read)
    [-0.95, 0.42, -2.93], [0.95, 0.42, -2.93], [0.95, 0.64, -3.16], [-0.95, 0.64, -3.16],
    [-0.95, 1.02, -2.93], [0.95, 1.02, -2.93], [0.95, 1.02, -3.16], [-0.95, 1.02, -3.16]));
  P.add('hull', slab(                                                          // steep knee 0.64@-3.16 -> 1.09@-3.27 (ref 1.094@-3.258)
    [-0.95, 0.64, -3.16], [0.95, 0.64, -3.16], [0.95, 1.09, -3.27], [-0.95, 1.09, -3.27],
    [-0.95, 1.02, -3.16], [0.95, 1.02, -3.16], [0.95, 1.20, -3.27], [-0.95, 1.20, -3.27]));
  P.add('hull', slab(                                                          // rising stern underside wedge 1.09@-3.27 -> 1.19@-4.05 (ref 1.191@-4.03)
    [-0.95, 1.09, -3.27], [0.95, 1.09, -3.27], [0.95, 1.19, -4.05], [-0.95, 1.19, -4.05],
    [-0.95, 1.255, -3.27], [0.95, 1.255, -3.27], [0.95, 1.31, -4.05], [-0.95, 1.31, -4.05]));
  // upper rear plate SPLIT (print plan: center-rear ends ~-3.9; the side
  // -4.17 anchor column rides the OUTER posts — hullLengthM/dAlong held):
  for (const s of [-1, 1]) {
    P.add('hull', box(0.53, 0.45, 0.10), s * 1.015, 1.175, -4.075);            // outer posts x 0.75..1.28, y 0.95..1.40, face -4.125 (anchor col)
  }
  P.add('hull', box(1.50, 0.40, 0.08), 0, 1.18, -3.92);                        // recessed center plate, face -3.96 (print center-rear line)
  P.add('hullDark', box(1.20, 0.24, 0.05), 0, 1.16, -3.945);                   // grille field on the center plate
  if (P.q) for (let k = 0; k < 3; k++) P.add('hullDetail', box(1.14, 0.045, 0.05), 0, 1.04 + k * 0.10, -3.955);
  for (const s of [-1, 1]) {
    P.add('hull', mslab1(s,                                                    // tapered stern wall 1.63@-3.55 -> 1.28@-3.92 (plan boat-tail)
      [1.55, 1.02, -3.55], [1.63, 1.02, -3.55], [1.32, 1.02, -3.92], [1.24, 1.02, -3.92],
      [1.55, 1.55, -3.55], [1.63, 1.55, -3.55], [1.32, 1.55, -3.92], [1.24, 1.55, -3.92]));
    P.add('hull', box(0.28, 0.16, 0.42), s * 1.38, 1.585, -3.58);              // low exhaust cowls flush with the deck line
    P.add('hullDark', box(0.24, 0.05, 0.36), s * 1.38, 1.665, -3.58);
    P.add('hullDark', box(0.15, 0.08, 0.05), s * 1.10, 1.28, -4.115);          // taillights on the narrowed plate
    P.add('hullRubber', box(0.36, 0.28, 0.026), s * 1.42, 1.26, -3.80);        // rear flaps hung at the taper walls (print carries no low flaps)
    // (uk round: a 1.25 lug re-seat was tried for the -4.03 window bottom
    // and REVERTED — the 0.845 lug underside is anchor-column MASS: the
    // -4.1 body column rides the 12% filter margin, and the whip-height
    // chase proved the coupling: a taller row rough eats the column and
    // hullLengthM walks 8.25 -> 8.11. REGISTRATION-ANCHOR law.)
    P.add('hullDetail', box(0.13, 0.11, 0.10), s * 0.85, 0.90, -4.09);         // tow lugs
    // rear light-guard bars (§B3.2 real CR3 kit + anchor-column armor: the
    // bars hold the -4.1 window's height span 0.70..1.40 so the body
    // column keeps headroom over the 12% filter whatever the row rough).
    P.add('hullDetail', box(0.05, 0.66, 0.04), s * 0.98, 1.03, -4.12);
  }
  P.add('hullDetail', box(0.30, 0.16, 0.04), 0, 1.02, -3.975);                 // convoy plate on the center plate
  liftEye(P, 'hullDetail', -1.45, 1.58, -1.60);
  liftEye(P, 'hullDetail', 1.45, 1.58, -1.60);
  headlight(P, -1.45, 1.11, 3.96, -0.25, 0.05);
  headlight(P, 1.45, 1.11, 3.96, -0.25, 0.05);
  // ---- skirts ±1.755 EXACT (§D width anchor): 6 flat bays, bottom at the
  // 0.62 hub line (wheels ~60% exposed — §B8), raised stepped front panel
  // exposing the idler, recessed dark handles, no fringe below.
  for (const s of [-1, 1]) {
    P.add('hull', mslab1(s,                                                    // stepped front panel — print plan: full-width faces end z 3.01;
      [1.695, 1.04, 3.05], [1.755, 1.04, 3.05], [1.755, 0.90, 2.42], [1.695, 0.90, 2.42],   // leading edge reads 1.04..1.32 (print front sliver 1.18..1.32)
      [1.695, 1.32, 3.10], [1.755, 1.32, 3.10], [1.755, 1.32, 2.42], [1.695, 1.32, 2.42]));
    // 3 bays ONLY — the print's skirts END at z ~-0.9 (plan row: ±1.76
    // content spans 3.16..-0.73 on the print) leaving the rear wheels +
    // sprocket run OPEN (§B8 exposure)
    // uk round (batch-47 re-read): hem 0.62 -> 0.73 — the ref's own front
    // bottoms at the ±1.62/1.67 windows read 0.75..0.84 (the old hem read
    // 0.13..0.22 deep); wheels now ~75% exposed (§B8.1 improves). Scallop
    // tabs pulled INBOARD to 1.6325..1.6875 (they AA-kissed the ±1.698
    // window boundary and painted the ±1.727/1.742 windows 0.53-deep where
    // the ref reads 1.176) and hung 0.70..0.79 per the ref's own tab line.
    for (let k = 0; k < 3; k++) {
      const z = 1.90 - k * 1.15;
      P.add('hull', box(0.06, 0.37, 1.11), s * 1.725, 1.135, z);               // bay panel (face 1.755, bottom 0.95 — the ref's own shallow high band)
      P.add('hullDark', box(0.012, 0.05, 0.28), s * 1.7555, 1.10, z);          // recessed handle
      P.add('hullDark', box(0.065, 0.32, 0.018), s * 1.725, 1.135, z - 0.57);  // bay seam
    }
    for (const zg of [2.10, 1.19, 0.28]) {                                     // scallop tabs between wheels (tops weld into the 0.95 bay hem, outer
      P.add('hull', box(0.06, 0.27, 0.30), s * 1.67, 0.835, zg);               // face 1.70 overlaps the 1.695 bay inner plane — §B2 attached)
    }
    P.add('hullShadow', new THREE.BoxGeometry(0.30, 0.03, 7.0), s * 1.45, 1.05, -0.15);
  }

  // ---- turret: the NEW Rheinmetall wedge (§B8 print form: face ~2.45w,
  // huge squared bustle to -2.13w, ±1.41 walls). Pivot [0,1.55,1.20];
  // locals = world - pivot.
  const C3W = 1.41, C3H = 0.85;                                                // wall half-width / roof local (2.40w)
  // core: main walls run the print's z_w 1.08..-1.89 span (local 0.88..
  // -3.09), tail piece ±1.23 to the -2.13w rear face, corner chamfer
  // strakes between; the shell sits 0.02 off the deck (print 1.57 bottoms)
  // FINISH r2: the print's tail zone TOPS at 0.70-0.74 local (side ref
  // 2.25-2.29w at z_w -1.72..-1.98) — the main C3H body ends -2.87 and the
  // tail STEPS DOWN to a 0.72 roof; chamfer strakes re-derived from the
  // print's plan chamfer line (x 1.23 @ -2.13w -> x 1.50 @ -1.86w).
  P.add('turret', frustum(C3W, 0.88, -2.87, 1.30, 0.86, -2.85, 0.02, C3H));    // main body — walls LEAN IN to the roof (print side read)
  P.add('turret', box(2.46, 0.60, 0.48), 0, 0.42, -3.09);                      // stepped bustle tail x ±1.23, y 0.12..0.72, z -2.85..-3.33
  P.add('turret', box(2.42, 0.04, 0.46), 0, 0.70, -3.09);                      // tail step roof (2.27w — print tail line)
  for (const s of [-1, 1]) {                                                   // rear-corner chamfer strakes (print chamfer line)
    P.add('turret', box(0.05, 0.60, 0.38), s * 1.365, 0.42, -3.19, 0, -s * 0.785, 0);
  }
  // FRONT: one big raked face plate (§B8 "flatter wedge, big flat cheek
  // plates"): from the 1.57w lower lip at z_w 2.45 up-back to the roof
  // front edge at z_w 2.02; §B1.1 both cheeks carry the same plane.
  P.add('turret', slab(
    [-1.05, 0.02, 1.25], [1.05, 0.02, 1.25], [1.05, 0.02, 0.95], [-1.05, 0.02, 0.95],
    [-1.05, C3H, 0.82], [1.05, C3H, 0.82], [1.05, C3H, 0.55], [-1.05, C3H, 0.55]));
  P.add('turret', slab(                                                        // right front-side transition plane
    [1.05, 0.02, 1.25], [1.41, 0.02, -0.12], [1.41, 0.02, -0.42], [1.05, 0.02, 0.95],
    [1.05, C3H, 0.82], [1.41, C3H, -0.30], [1.41, C3H, -0.55], [1.05, C3H, 0.55]));
  P.add('turret', slab(                                                        // left front-side transition
    [-1.41, 0.02, -0.12], [-1.05, 0.02, 1.25], [-1.05, 0.02, 0.95], [-1.41, 0.02, -0.42],
    [-1.41, C3H, -0.30], [-1.05, C3H, 0.82], [-1.05, C3H, 0.55], [-1.41, C3H, -0.55]));
  // jutting LOWER CHEEK ARMOR WEDGES to the 2.62w tips (print z-profile:
  // halfW 0.94 at 2.54-2.64w, y 1.57..1.95) — mirrored through mslab1
  // (§C missing-side law: never a bare x*s mirror)
  for (const s of [-1, 1]) {
    P.add('turret', mslab1(s,
      [0.20, 0.02, 1.30], [0.94, 0.02, 1.16], [0.94, 0.02, 0.90], [0.20, 0.02, 1.04],
      [0.24, 0.40, 1.42], [0.90, 0.40, 1.28], [0.90, 0.40, 1.06], [0.24, 0.40, 1.16]));
  }
  P.add('turret', box(2.78, 0.05, 3.75), 0, C3H - 0.025, -1.005);              // roof plate (ends at the -2.87 tail step)
  // embrasure: recessed collar + canvas boot (§B3.1 — no bare notch);
  // L94A1-class coax port on the LEFT of the slot (print 'weapon3')
  P.add('turret', box(0.46, 0.56, 0.36), 0, 0.30, 0.98);
  P.add('turretDark', box(0.52, 0.46, 0.06), 0, 0.30, 1.17);
  P.add('turret', cylZ(0.052, 0.06, 10), -0.32, 0.42, 1.13, -0.05, -0.30, 0);
  P.add('turretDark', cylZ(0.028, 0.10, 8), -0.32, 0.42, 1.16, -0.05, -0.30, 0);
  // TROPHY APS modules on both flanks (§H.4 the CR3 tell): slab boxes with
  // vent lines + angled radar faces front/rear (merkava grammar).
  // FINISH r2: modules re-derived from the print's plan/front rows — faces
  // out to x 1.66 hanging at the roof line (plan ref [0.95, -1.70]w at
  // |x| 1.6; front ref tops 2.44-2.46 at |x| 1.62-1.68).
  // uk round (batch-47 re-read, 2-pass): the ref's Trophy band is a
  // TILTED-PANEL read — side-armor shoulder at 2.42w holding to x 1.60,
  // then the leaned module face falling to 2.20w at 1.74 (front rows read
  // 2.45 at the ±1.61 windows, 2.205 at ±1.73; the old vertical 2.40-top
  // box read +0.18 outboard and -0.24 inboard). Real Trophy grammar: the
  // panel leans against the turret side on standoff brackets (§B2).
  for (const s of [-1, 1]) {
    P.add('turret', box(0.19, 0.06, 2.62), s * 1.505, 0.84, -1.575);           // roof shoulder course (top 2.42w to x 1.60)
    P.add('turret', box(0.02, 0.28, 2.62), s * 1.67, 0.75, -1.575, 0, 0, s * 0.53); // leaned Trophy face (1.59/0.88 -> 1.75/0.62; outer 1.749 < the 1.755 §D anchor)
    for (const bz of [-0.40, -1.55, -2.70]) {
      P.add('turret', box(0.26, 0.05, 0.07), s * 1.525, 0.70, bz);             // standoff mounting brackets (wall -> panel)
    }
    P.add('turretDark', box(0.022, 0.02, 2.35), s * 1.645, 0.79, -1.575, 0, 0, s * 0.53); // panel ribs
    P.add('turretDark', box(0.022, 0.02, 2.35), s * 1.695, 0.705, -1.575, 0, 0, s * 0.53);
    P.add('turretDark', box(0.03, 0.18, 0.18), s * 1.575, 0.70, -0.22, 0, s * 0.35, 0);   // fwd radar
    P.add('turretGlass', box(0.012, 0.14, 0.14), s * 1.60, 0.70, -0.21, 0, s * 0.35, 0);
    P.add('turretDark', box(0.03, 0.18, 0.18), s * 1.53, 0.70, -2.78, 0, -s * 0.35, 0);   // rear radar
  }
  // RWS (PROTECTOR-class, §H.4 UK grammar: M2 12.7 on the remote mount)
  // front-left roof. FINISH r2: seated ON the print's own RCWS body zone
  // (side ref 2.96-3.00 tops at z_w 0.55..1.15) — mount body + sensor
  // head carry that plateau; the M2 runs forward to ~z_w 1.9 at the
  // 2.85-2.97 line. The print's elevated 30 mm barrel columns at
  // z_w 2.15-2.66 stay the certified §H.4 residual (UK M2 grammar).
  P.add('turret', box(0.30, 0.18, 0.30), -0.30, C3H + 0.06, -0.35);            // pedestal
  P.add('turretDetail', box(0.34, 0.36, 0.55), -0.30, C3H + 0.27, -0.37);      // mount body (top 2.85w; z_w 0.555..1.105 = ref 2.96 plateau)
  P.add('turretDark', box(0.16, 0.18, 0.16), -0.48, C3H + 0.47, -0.37);        // sensor head (top 2.96w — the ref's own RCWS line)
  P.add('turretGlass', box(0.12, 0.08, 0.02), -0.48, C3H + 0.48, -0.28);
  // uk round: RWS ammunition/junction tier BEHIND the mount (§B3 named
  // equipment) — the batch-47 ref's own side tops at z_w 0.35..0.48 read
  // 2.575..2.607 (its boxy RCWS base runs rearward; ours ended z_w 0.555
  // and those columns fell to the 2.38 roof). Top 2.60w; front columns
  // unchanged (the 2.85 mount body owns x -0.13..-0.47 tops).
  P.add('turretDetail', box(0.30, 0.20, 0.32), -0.30, C3H + 0.10, -1.02);      // ammo/junction box (top 2.60w, z_w 0.34..0.66)
  P.add('turretDark', box(0.26, 0.03, 0.28), -0.30, C3H + 0.215, -1.02);       // lid seam
  {
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', seed: 31, elev: 0.05, ammo: true });
    mg.position.set(-0.24, C3H + 0.22, -0.28);
    P.turretG.add(mg);
  }
  // sights: gunner's EPSOM housing recessed into the face top RIGHT (§B1.1
  // detail rides ON the plane), commander pano rear-right
  P.add('turret', box(0.48, 0.14, 0.40), 0.48, C3H - 0.05, 0.62);              // gunner hood
  P.add('turretDetail', box(0.52, 0.03, 0.44), 0.48, C3H + 0.02, 0.60);        // brow
  P.add('turretDark', box(0.40, 0.12, 0.03), 0.48, C3H - 0.06, 0.83);          // aperture
  P.add('turretGlass', box(0.28, 0.07, 0.014), 0.48, C3H - 0.07, 0.845, -0.20, 0, 0);
  // uk round (ref front render + batch-47 rows): the ref's commander pano
  // is a TALL TOWER at the roof's right edge — front tops 2.88..2.95 across
  // x 0.80..1.15 (our old 0.55-seat drum read 0.4 short there), and the
  // side rows carry a 2.85-2.87 sensor band across z_w -0.6..-1.15 (the
  // tower + pot cluster). Pedestal moved out + raised; head cap tops
  // 2.93w; hood deepened over both -0.97/-1.09 side windows; GPS/met pots
  // extend the band forward.
  P.add('turretDetail', cylY(0.085, 0.10, 0.30, 10), 0.87, C3H + 0.15, -2.25); // pano pedestal tower
  P.add('turretDark', cylY(0.14, 0.15, 0.22, 12), 0.87, C3H + 0.41, -2.25);    // pano head drum
  P.add('turretDark', box(0.72, 0.06, 0.30), 0.76, C3H + 0.55, -2.25);         // armored hood x 0.40..1.12, z_w -0.90..-1.20 (the ref's 2.88-2.98 front band spans x 0.33..1.15)
  P.add('turretDetail', box(0.06, 0.50, 0.09), 0.46, C3H + 0.28, -2.25);       // hood support mast (roof -> hood underside; §B2 attached)
  P.add('turretGlass', box(0.16, 0.10, 0.02), 0.87, C3H + 0.42, -2.09);
  P.add('turretDetail', cylY(0.085, 0.095, 0.24, 10), 0.72, C3H + 0.26, -1.95); // GPS pot (top 2.85w, z_w -0.75)
  P.add('turretDark', cylY(0.055, 0.055, 0.10, 8), 0.72, C3H + 0.43, -1.95);
  P.add('turretDetail', cylY(0.07, 0.08, 0.20, 10), 0.42, C3H + 0.25, -1.95);  // met sensor pot (top 2.82w, z_w -0.75; clear of hatch rim + GPS pot)
  P.add('turretDark', cylY(0.05, 0.035, 0.06, 8), 0.42, C3H + 0.395, -1.95);
  // hatches + periscopes + whips
  P.add('turret', cylY(0.24, 0.24, 0.05, 14), 0.55, C3H + 0.02, -1.55);        // commander hatch
  P.add('turret', cylY(0.22, 0.22, 0.05, 14), -0.60, C3H + 0.02, -1.35);       // loader hatch
  P.add('turretDark', torus(0.22, 0.012, 14), -0.60, C3H + 0.045, -1.35);
  periscope(P, 'turretDetail', 0.55, C3H + 0.06, -1.22);
  periscope(P, 'turretDetail', -0.60, C3H + 0.06, -1.05, -0.3);
  // FINISH r2: whips clustered at the print's own antenna station (its
  // 5.19w spike col sits z_w -1.46; the old -1.75..-1.90 seats cost three
  // 0.42 side cols) — trimmed under the 2.95 sensor datum; x ±0.90 rides
  // the print's front-view antenna columns.
  {
    // a1/a2 are TALL real whips (print's front-view antenna columns read
    // 5.2w at x ±0.9 — the tall pair rides its spike columns; side p95
    // stays on the RWS plateau: only 2 columns above the 2.95 datum,
    // budget <=4, aligned with the ref's own 5.2 spike).
    // uk round (2-pass adjudication): the print's 5.2 antenna spike is a
    // SUB-PIXEL FLICKER — it lit x 0.97 in one trace run and vanished the
    // next (AA-TEETER family: single-run reads are NOT orders). A chase to
    // h 2.75 also lifted the side-row rough so the 12% body filter ate the
    // -4.1 hullLengthM anchor column (dims 99.8 -> 87, the whip-rough
    // coupling now banked). Whips stay at REAL height (the FINISH r2
    // certified fit), a3 co-windowed with a2 so no lone proc column.
    const a1 = FITTINGS.antennaWhip({ mats: P.mats, h: 1.75, rake: 0.0, seed: 7 });
    a1.position.set(-0.90, C3H + 0.02, -2.62);                                 // rake 0: the whip x-lean spread 3 front cols (kit rz-lean decode)
    P.turretG.add(a1);
    const a2 = FITTINGS.antennaWhip({ mats: P.mats, h: 1.60, rake: 0.0, seed: 8 });
    a2.position.set(0.92, C3H + 0.02, -2.67);
    P.turretG.add(a2);
    const a3 = FITTINGS.antennaWhip({ mats: P.mats, h: 1.45, rake: 0.0, seed: 9 });
    a3.position.set(0.925, C3H + 0.02, -2.63);                                 // same front window + same -1.46w side column as a2
    P.turretG.add(a3);
  }
  // smoke: 2x5 low banks on the flanks (print smoke a-j) + ch1 r10b tube
  // tips + bores (circular mouths at 1x)
  smokeCluster(P, 1.10, 0.30, 0.55, 5, 0.85, 0.7);
  smokeCluster(P, -1.10, 0.30, 0.55, 5, -0.85, 0.7);
  smokeTubeTips(P, [[1.10, 0.30, 0.55, 0.85, 0.7], [-1.10, 0.30, 0.55, -0.85, 0.7]]);
  // bustle rack on the stepped tail face (§B3.2; FINISH r2: compacted to
  // the print's -2.13w turret tail — the old -3.62 rails read as 3
  // only-proc cover columns on the turret side row)
  {
    const bkT = 0.64, bkB = 0.22, bkZ = -3.31;                                  // rails 20mm-set into the tail face (rear extreme -3.335 = 32mm
    P.add('turretDetail', box(2.40, 0.05, 0.05), 0, bkT, bkZ);                  // clear of the -2.23w column window — AA-sliver law, 2nd pass)
    P.add('turretDetail', box(2.40, 0.05, 0.05), 0, bkB, bkZ);
    for (let k = 0; k < 11; k++) P.add('turretDetail', box(0.035, bkT - bkB, 0.035), -1.15 + k * 0.23, (bkT + bkB) / 2, bkZ);
    P.add('turretDark', box(2.30, 0.30, 0.016), 0, (bkT + bkB) / 2, -3.315);    // mesh back panel
    // ch1-base rail-over-mesh read (r10 O5a): pale rail pair drawn over the
    // dark mesh panel (same envelope — the rails sit 2 mm proud of the mesh
    // inside the -3.335 certified extreme).
    for (const ry of [0.32, 0.50]) P.add('turretDetail', box(2.28, 0.018, 0.008), 0, ry, -3.319);
  }
  liftEye(P, 'turretDetail', -1.15, C3H + 0.03, 0.15);
  liftEye(P, 'turretDetail', 1.15, C3H + 0.03, -1.9);
  // ---- gun: 120 mm L55A1 SMOOTHBORE — evacuator at the Rh-120 station,
  // thermal sleeve, MRS collar, §B3.1 muzzle bore (shadow-named).
  // Muzzle +7.335 world = 11.50 overall (pivot world z 1.75).
  // FINISH r2 (§B3.1 MANTLETS-MANDATORY + owner order "distinctive
  // flat-faced mantlet"): a real flat-faced armored mantlet block at the
  // turret face (proud of the embrasure, pitches with the gun) + the
  // print's FAT root thermal sleeve (its plan gun columns run r~0.185 to
  // z_w 3.59) with clamp + step-down rings.
  P.addGunExtra(box(0.40, 0.30, 0.55), 0, 0.36, 0.45);                         // sight barbette over the gun
  P.addGunExtra(box(0.56, 0.44, 0.28), 0, 0.02, 0.62);                         // flat-faced mantlet block (face z_w 2.51)
  P.addGunExtraDark(box(0.58, 0.06, 0.26), 0, -0.21, 0.62);                    // mantlet chin shadow seam
  P.addGunExtra(cylZ(0.145, 0.30, P.q ? 20 : 12, 0.165), 0, 0, 0.86);          // boot collar ahead of the block
  P.addGunExtraDark(cylZ(0.150, 0.05, P.q ? 20 : 12), 0, 0, 0.78);             // boot seam
  P.addGunExtra(cylZ(0.185, 0.95, P.q ? 20 : 12), 0, 0, 1.32);                 // FAT root sleeve section (print z_w 2.60..3.55)
  P.addGunExtra(cylZ(0.192, 0.05, P.q ? 20 : 12), 0, 0, 1.10);                 // clamp ring
  P.addGunExtra(cylZ(0.130, 0.06, P.q ? 20 : 12), 0, 0, 1.82);                 // step-down ring
  buildGun(P, { len: 5.585, r: 0.082, sleeve: true, evac: 0.50, collar: true, baseR: 0.15 });
  muzzleBore(P, { len: 5.585, r: 0.082 });                                     // §B3.1 (shadow-named, 3fca39b)
  // ch1-base STERN KIT (r10 O5b grammar, CR3 fit): draped cable + cleats
  // across the recessed center plate. Interior: z >= -3.977 (the -4.125
  // anchor posts own the -4.17 column; the cable rides the -3.96 plate
  // face), y 1.18..1.32 inside the plate band.
  KIT.towCable(P, [[-0.58, 1.30, -3.95], [0, 1.21, -3.955], [0.58, 1.30, -3.95]]);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.08, 0.08, 0.045), s * 0.58, 1.315, -3.935);
  // ch1-base family tone kit + gear-air backers (r8/r9 recipes; family
  // resemblance with challenger1 + challenger2). Backer wall spans the
  // SKIRTED bays only (the rear run is honestly naked per the print).
  ch1BaseToneKit(P, { cloth: 0x262b1d, clothEnv: 0.05, dark: 0x282c22 });
  ch1BaseGearBackers(P, [
    [0.016, 0.32, 3.60, 0.970, 0.44, 0.85],                                    // inter-wheel shadow wall (x 0.962..0.978; band inner 0.995)
    [0.46, 0.42, 0.02, 1.23, 0.49, 2.095],                                     // catch plates at the skirted scallop stations
    [0.46, 0.42, 0.02, 1.23, 0.49, 1.185],
    [0.46, 0.42, 0.02, 1.23, 0.49, 0.275],
  ]);
  // decals: squadron number + ZAP plate
  P.decal('turret', 'number', P.spec.visual.number || '30', 0.34, [1.42, 0.40, -1.4], Math.PI / 2, 0, 0.06);
  P.decal('turret', 'number', P.spec.visual.number || '30', 0.34, [-1.42, 0.40, -1.4], -Math.PI / 2, 0, -0.06);
  P.decal('hull', 'number', 'KC93AB', 0.32, [0.80, 1.26, 3.32], 0, -1.27);
  // soot PINNED on the recessed center plate face (§C: decals are mask
  // geometry — never floated mid-air)
  P.decal('hull', 'soot', null, 0.42, [-0.45, 1.10, -3.962], Math.PI);
  P.topY = 1.05;
}

// ---------------------------------------------------------------------------
// Merkava IVm — §21.5: V-roof hull, front-right engine hump, rear troop door,
// arrowhead turret with ball-and-chain curtain + Trophy slabs, external
// coil-spring bogies, sprocket FRONT, Sinai grey.
// ---------------------------------------------------------------------------
function buildMerkava4(P) {
  const { box, cylX, cylY, cylZ, sph, slab, frustum, fenders, headlight, liftEye,
    periscope, smokeCluster, towCable, stowage, tarpRoll, buildGun,
    buildRunningGear, torus } = KIT;
  const { rng } = P;
  // hull: lower box + side walls, topped by the WIDE SHALLOW V roof — two
  // planes meeting at the centerline ridge (§21.5 "unlike anything NATO")
  P.add('hull', box(2.5, 0.55, 7.3), 0, 0.72, -0.05);
  P.add('hull', frustum(1.80, 2.35, -3.55, 1.80, 2.30, -3.55, 1.0, 1.50));      // upper side walls
  P.add('hull', slab(                                                            // RIGHT V-roof plane
    [0, 1.50, 2.35], [1.80, 1.30, 2.10], [1.80, 1.30, -3.55], [0, 1.50, -3.55],
    [0, 1.66, 2.35], [1.80, 1.46, 2.10], [1.80, 1.46, -3.55], [0, 1.66, -3.55]));
  P.add('hull', slab(                                                            // LEFT V-roof plane
    [-1.80, 1.30, 2.10], [0, 1.50, 2.35], [0, 1.50, -3.55], [-1.80, 1.30, -3.55],
    [-1.80, 1.46, 2.10], [0, 1.66, 2.35], [0, 1.66, -3.55], [-1.80, 1.46, -3.55]));
  // very long sloped glacis sweeping down off the V (§21.5)
  P.add('hull', frustum(1.66, 3.72, 2.2, 1.70, 2.15, 2.2, 0.75, 1.52));
  P.add('hull', frustum(1.60, 3.42, 3.72, 1.60, 3.72, 3.72, 0.42, 0.75));       // blunt lower nose
  fenders(P, 1.30, 1.88, 1.10, -3.65, 3.55, 0.035);
  for (const s of [-1, 1]) {
    P.add('hullShadow', new THREE.BoxGeometry(0.5, 0.026, 6.9), s * 1.55, 1.085, -0.05);
  }
  // engine hump FRONT-RIGHT with grilles on the right fender (§21.5)
  P.add('hull', box(1.05, 0.20, 1.6), 0.82, 1.56, 2.15, -0.10, 0, -0.06);
  P.add('hullDark', box(0.72, 0.02, 1.15), 0.86, 1.645, 2.05);                  // hump grille inset
  if (P.q) for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.66, 0.025, 0.06), 0.86, 1.65, 2.45 - k * 0.2);
  P.add('hullDark', box(0.55, 0.06, 0.9), 1.55, 1.13, 2.5);                     // right-fender exhaust grille
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(0.5, 0.05, 0.06), 1.55, 1.16, 2.75 - k * 0.18);
  P.add('hull', box(0.5, 0.13, 1.15), 1.42, 1.55, 0.9);                         // raised air-intake ridge
  P.decal('hull', 'soot', null, 0.6, [1.6, 1.05, 2.2], Math.PI / 2);            // exhaust staining
  // rear: vertical back plate with the CLAMSHELL troop door outline (§21.5)
  P.add('hull', box(3.0, 0.95, 0.1), 0, 0.95, -3.72);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.55, 0.82, 0.05), s * 0.31, 0.92, -3.78);                // door halves proud
    P.add('hullDetail', box(0.06, 0.10, 0.08), s * 0.58, 1.22, -3.79);          // hinge blocks
  }
  P.add('hullDark', box(0.035, 0.82, 0.06), 0, 0.92, -3.795);                   // split seam
  P.add('hullDark', box(1.1, 0.035, 0.06), 0, 0.53, -3.795);                    // sill seam
  P.add('hullDark', box(0.15, 0.08, 0.05), -1.25, 1.35, -3.78);                 // taillight
  // driver hatch front-LEFT on the roof plane + periscopes
  P.add('hull', box(0.55, 0.05, 0.6), -0.72, 1.54, 1.45, 0, 0, 0.12);
  periscope(P, 'hullDetail', -0.72, 1.60, 1.05);
  periscope(P, 'hullDetail', -0.45, 1.58, 1.05);
  headlight(P, -1.5, 1.14, 3.42, -0.25, 0.05);
  headlight(P, 1.5, 1.14, 3.42, -0.25, 0.05);
  towCable(P, [[-1.2, 1.0, 3.3], [0, 1.1, 3.55], [1.2, 1.0, 3.3]]);
  liftEye(P, 'hullDetail', -1.3, 1.52, -2.6);
  liftEye(P, 'hullDetail', 1.3, 1.52, -2.6);
  // skirts of overlapping angled slats + chunky mud flaps (§21.5)
  // tank_models r2 (critic major: "real Merkava wears side skirts covering
  // the gear" — they were ABSENT): the slat panels sat at x ±1.84 while the
  // running gear's track outer edge runs to ±1.90 (xc 1.58 + 0.64/2), so the
  // whole skirt run was buried INSIDE the track band and never rendered.
  // Pushed outboard of the gear, deepened, with a dark rubber lower fringe.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const z = 2.95 - k * 1.02;
      P.add('hull', box(0.05, 0.56, 1.06), s * (1.955 + (k % 2) * 0.03), 0.86, z, 0, s * 0.05, -s * 0.06);
      P.add('hullRubber', box(0.04, 0.14, 1.0), s * (1.955 + (k % 2) * 0.03), 0.54, z, 0, s * 0.05, -s * 0.06);
    }
    P.add('hullRubber', box(0.55, 0.4, 0.035), s * 1.5, 0.55, 3.62, -0.15, 0, 0);
    P.add('hullRubber', box(0.55, 0.36, 0.035), s * 1.5, 0.52, -3.66, 0.15, 0, 0);
    // external coil-spring BOGIE pairs (Horstmann-style — §21.5 unique):
    // bracket + two visible vertical coil drums per station pair
    for (const zc of [2.15, -0.05, -2.0]) {
      P.add('hullDetail', box(0.20, 0.30, 1.35), s * 1.30, 0.62, zc);           // bogie bracket
      P.add('hullDark', cylY(0.085, 0.085, 0.34, 10), s * 1.38, 0.72, zc - 0.32);
      P.add('hullDark', cylY(0.085, 0.085, 0.34, 10), s * 1.38, 0.72, zc + 0.32);
      P.add('hullDetail', cylY(0.10, 0.10, 0.05, 10), s * 1.38, 0.93, zc - 0.32); // spring caps
      P.add('hullDetail', cylY(0.10, 0.10, 0.05, 10), s * 1.38, 0.93, zc + 0.32);
    }
  }
  // turret: the ARROWHEAD — small frontal cross-section widening rearward in
  // flat diamond facets, long tail bustle (§21.5)
  // tank_models r1 (critic: "undersized generic turret"): plan-form audit vs
  // §21.5 — the arrowhead scales to ~2.57 m wide x 3.1 m long (real Merkava
  // IVm turret dominates the hull), walls taller; roof kit repositioned with
  // it below.
  P.add('turret', KIT.polyTurret([
    [0.19, 1.56], [0.78, 0.85], [1.285, -0.18], [1.07, -1.12], [0.57, -1.56],
    [-0.57, -1.56], [-1.07, -1.12], [-1.285, -0.18], [-0.78, 0.85], [-0.19, 1.56],
  ], 0.86, 1.04, 0.74), 0, 0, 0);
  const MKH = 0.86;
  // NO exposed mantlet: gun pokes from a narrow V-notch (§21.5)
  P.add('turret', box(0.44, 0.50, 0.38), 0, 0.24, 1.24);                        // notch closer plate
  P.add('turretDark', box(0.50, 0.38, 0.05), 0, 0.24, 1.44);                    // notch shadow
  // Trophy APS: flat angled slab boxes each side with vent lines + radar
  // squares at the corners (§21.5)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.16, 0.50, 1.25), s * 1.26, 0.32, -0.72, 0, -s * 0.12, 0);
    for (let k = 0; k < 3; k++) {
      P.add('turretDark', box(0.17, 0.03, 1.0), s * 1.27, 0.18 + k * 0.15, -0.72, 0, -s * 0.12, 0);
    }
    P.add('turretDark', box(0.03, 0.20, 0.20), s * 1.16, 0.36, 0.36, 0, s * 0.35, 0);   // fwd radar face
    P.add('turretGlass', box(0.012, 0.16, 0.16), s * 1.185, 0.36, 0.37, 0, s * 0.35, 0);
    P.add('turretDark', box(0.03, 0.20, 0.20), s * 1.13, 0.36, -1.52, 0, -s * 0.35, 0); // rear radar face
  }
  // signature ball-and-chain curtain along the bustle underside (§21.5)
  P.add('turret', box(1.60, 0.34, 0.75), 0, 0.18, -1.80);                       // tail bustle box
  // signature ball-and-chain curtain (§21.5) — r1: enlarged + densified so it
  // actually reads as the Merkava's fringe at garage distance
  P.add('turretDetail', box(1.72, 0.05, 0.05), 0, 0.02, -2.18);                 // chain rail
  for (let k = 0; k < 17; k++) {
    const x = -0.80 + k * 0.10;
    P.add('turretDark', cylY(0.010, 0.010, 0.20, 6), x, -0.09, -2.20);
    P.add('turretDark', sph(0.042, 8), x, -0.22, -2.20);
  }
  // roof set: Rafael pano sight center-roof, gunner sight brow right-front,
  // 12.7 mm over the gun, 60 mm mortar hatch left (§21.5)
  P.add('turretDetail', cylY(0.07, 0.085, 0.18, 10), 0.24, MKH + 0.09, -0.55);  // pano pedestal
  P.add('turretDark', box(0.24, 0.24, 0.24), 0.24, MKH + 0.30, -0.55);          // pano head
  P.add('turretGlass', box(0.15, 0.11, 0.02), 0.24, MKH + 0.31, -0.42);
  P.add('turret', box(0.36, 0.22, 0.34), 0.46, MKH + 0.06, 0.42);               // gunner sight box
  P.add('turretDark', box(0.28, 0.14, 0.04), 0.46, MKH + 0.08, 0.60);
  P.add('turretGlass', box(0.22, 0.09, 0.02), 0.46, MKH + 0.08, 0.625);
  P.add('turretDark', box(0.09, 0.11, 0.44), 0.10, MKH + 0.16, 0.62);           // .50cal receiver
  P.add('turretDark', cylZ(0.022, 0.55, 8), 0.10, MKH + 0.16, 1.10);            // .50cal barrel
  P.add('turretDetail', box(0.10, 0.13, 0.18), -0.08, MKH + 0.13, 0.55);        // ammo box
  P.add('turret', cylY(0.14, 0.14, 0.05, 12), -0.52, MKH - 0.04, 0.10);         // 60 mm mortar hatch
  P.add('turretDark', torus(0.14, 0.012, 12), -0.52, MKH - 0.02, 0.10);
  // hatches: commander right / loader left
  P.add('turret', cylY(0.23, 0.23, 0.045, 14), 0.48, MKH - 0.06, -0.62);
  P.add('turret', cylY(0.21, 0.21, 0.045, 14), -0.50, MKH - 0.05, -0.55);
  P.add('turretDetail', box(0.03, 0.55, 0.03), -0.85, MKH + 0.18, -1.1, 0, 0, 0.12); // antenna L
  P.add('turretDetail', box(0.03, 0.5, 0.03), 0.85, MKH + 0.16, -1.15, 0, 0, -0.1);  // antenna R
  // stowage baskets across the full turret rear (§21.5) + IDF clutter
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.04, 0.04, 0.9), s * 1.16, 0.46, -1.55);
    P.add('turretDetail', box(0.04, 0.04, 0.9), s * 1.16, 0.12, -1.55);
    for (let k = 0; k < 4; k++) P.add('turretDetail', box(0.03, 0.34, 0.03), s * 1.16, 0.29, -1.2 - k * 0.25);
    stowage(P, 'turretCloth', rng, [[s * 1.05, 0.35, -1.55, 0.2, 0.3, 0.8]]);
  }
  stowage(P, 'turretCloth', rng, [[0, 0.44, -1.85, 1.25, 0.26, 0.5]]);
  tarpRoll(P, 'turretCloth', -0.35, 0.56, -1.70, 0.9, 0.09, true);
  smokeCluster(P, 0.88, 0.32, 1.02, 4, 0.95, 0.6);                              // CL-3030 launchers
  smokeCluster(P, -0.88, 0.32, 1.02, 4, -0.95, 0.6);
  // MG253 L/44: sleeve + evacuator NEAR THE MANTLET (§21.1 — evac at 28%)
  buildGun(P, { len: 5.3, r: 0.080, sleeve: true, evac: 0.28, baseR: 0.14 });
  // 6 large wheels, 5 return rollers, sprocket FRONT (front engine — §21.5)
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.37, wheelW: 0.22, xc: 1.58,
    wheelZs: [2.62, 1.60, 0.68, -0.36, -1.44, -2.52],
    sprocket: { z: 3.32, y: 0.52, r: 0.31 }, idler: { z: -3.28, y: 0.48, r: 0.28 },
    rollers: [2.2, 1.1, 0.05, -1.1, -2.2].map((z) => ({ z, y: 0.88, r: 0.08 })),
    trackW: 0.64, topY: 0.92, paintedEnds: true, coveredTop: 1.0,
  });
  for (const s of [-1, 1]) {                                                    // sponson gap covers (r1 zipper)
    P.add('hullShadow', new THREE.BoxGeometry(0.34, 0.03, 6.8), s * 1.68, 1.07, -0.05);
  }
  // white unit stencils on the slat skirts (§21.5 paint paragraph)
  P.decal('hull', 'number', '11', 0.34, [1.90, 0.84, 1.2], Math.PI / 2);
  P.decal('hull', 'number', '11', 0.34, [-1.90, 0.84, 1.2], -Math.PI / 2);
  P.decal('turret', 'number', '4', 0.30, [0.92, 0.35, -0.7], Math.PI / 2, 0, 0.12);
  P.topY = 0.95;
}

// ---------------------------------------------------------------------------
// Leopard 2A6 — §8.5: the shipped 2A7 family base MINUS the A7 kit (no roof
// RWS, no bustle climate/APU clutter) — wedge cheeks + the long L/55 stay.
// PERI R17 on the LEFT roof, crosswind mast rear RIGHT. Bundeswehr cross +
// 2-digit tactical number.
// ---------------------------------------------------------------------------
function buildLeo2A6(P) {
  const { box, cylX, cylY, cylZ, slab, frustum, fenders, headlight, liftEye,
    periscope, smokeCluster, towCable, stowage, jerryCan, tarpRoll, ammoCan,
    spareTrackStrip, buildGun, buildRunningGear, torus } = KIT;
  const { rng } = P;
  // ---- hull: 2A7 family base (mirrors the shipped buildLeo2A7 hull) ----
  P.add('hull', box(2.48, 0.58, 7.5), 0, 0.79, 0);
  P.add('hull', box(3.40, 0.42, 4.66), 0, 1.51, -1.38);
  fenders(P, 1.25, 1.88, 1.29, -3.72, 3.6, 0.035);
  P.add('hull', frustum(1.72, 3.83, 1.0, 1.72, 1.00, 1.0, 1.0, 1.72));          // sharp glacis
  P.add('hull', frustum(1.72, 3.45, 3.55, 1.72, 3.83, 3.55, 0.5, 1.0));
  P.add('hull', box(3.1, 0.52, 0.12), 0, 1.46, -3.70);                          // rear plate
  // rear deck: twin cooling fans + radiator louver + exhaust louvres
  for (const s of [-1, 1]) {
    P.add('hullDark', cylY(0.40, 0.40, 0.025, P.q ? 28 : 14), s * 0.80, 1.725, -2.55);
    P.add('hullDetail', torus(0.40, 0.035, P.q ? 26 : 14), s * 0.80, 1.735, -2.55);
    P.add('hullDetail', torus(0.24, 0.02, P.q ? 22 : 12), s * 0.80, 1.732, -2.55); // inner ring
    P.add('hullDetail', cylY(0.07, 0.08, 0.05, 10), s * 0.80, 1.74, -2.55);        // hub cap
    P.add('hullDetail', box(0.76, 0.02, 0.05), s * 0.80, 1.74, -2.55);
    P.add('hullDetail', box(0.05, 0.02, 0.76), s * 0.80, 1.74, -2.55);
    for (let k = 0; k < 5; k++) {
      P.add('hullDetail', box(0.66 - Math.abs(k - 2) * 0.14, 0.018, 0.05),
        s * 0.80, 1.737, -2.75 + k * 0.10);
    }
    P.add('hullDark', box(0.7, 0.4, 0.04), s * 0.95, 1.15, -3.78);
    for (let k = 0; k < 4; k++) {
      P.add('hullDetail', box(0.7, 0.05, 0.05), s * 0.95, 1.0 + k * 0.11, -3.795);
    }
    for (const zc of [-2.0, -1.15, -0.35]) {
      P.add('hullDetail', cylY(0.10, 0.10, 0.028, 12), s * 1.44, 1.728, zc);
      P.add('hullDark', torus(0.10, 0.012, 12), s * 1.44, 1.733, zc);
    }
    for (const off of [-0.08, 0.08]) {
      P.add('hullDetail', box(0.05, 0.24, 0.14), s * 1.12 + off, 0.98, -3.82);
    }
    P.add('hullDetail', cylX(0.034, 0.26, 8), s * 1.12, 1.0, -3.87);
    P.add('hullDark', box(0.16, 0.09, 0.05), s * 1.38, 1.32, -3.775);           // taillights
    P.add('hullRubber', box(0.56, 0.34, 0.03), s * 1.5, 0.52, -3.86, 0.12, 0, 0);
  }
  P.add('hullDark', box(2.9, 0.022, 0.56), 0, 1.717, -3.32);
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(2.74, 0.032, 0.07), 0, 1.732, -3.52 + k * 0.10);
  for (const s of [-1, 1]) {
    P.add('hullShadow', new THREE.BoxGeometry(0.5, 0.026, 7.0), s * 1.5, 1.27, 0);
  }
  // skirts: heavy sculpted front third + recessed rubber aft (family base)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.10, 0.62, 3.25), s * 1.85, 0.99, 2.18);
    P.add('hull', box(0.10, 0.14, 3.2), s * 1.85, 0.64, 2.18, 0, 0, -s * 0.28);
    if (P.q) for (let k = 0; k < 4; k++) {
      P.add('hullDark', box(0.104, 0.56, 0.016), s * 1.85, 0.99, 3.6 - k * 0.8);
    }
    P.add('hull', box(0.035, 0.55, 3.42), s * 1.865, 0.94, -1.28);
    P.add('hullRubber', box(0.028, 0.12, 3.4), s * 1.865, 0.63, -1.28);
    for (let k = 0; k < 4; k++) {
      P.add('hullDark', box(0.042, 0.5, 0.02), s * 1.865, 0.94, -0.3 - k * 0.7);
    }
  }
  towCable(P, [[-1.3, 1.6, -3.4], [0, 1.7, -3.7], [1.3, 1.6, -3.4]]);
  headlight(P, -1.3, 0.92, 3.68, -0.35);
  headlight(P, 1.3, 0.92, 3.68, -0.35);
  liftEye(P, 'hullDetail', -1.4, 1.75, -0.5);
  liftEye(P, 'hullDetail', 1.4, 1.75, -0.5);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(1.05, 0.045, 0.07), s * 0.47, 1.46, 2.15, -0.25, s * 0.42, 0);
    P.add('hullDetail', cylY(0.085, 0.085, 0.03, 12), s * 1.28, 1.735, 0.2);    // filler caps
  }
  P.add('hullDark', box(0.02, 0.012, 2.7), -1.7, 1.53, 2.35, -0.25, 0, 0);      // weld seams
  P.add('hullDark', box(0.02, 0.012, 2.7), 1.7, 1.53, 2.35, -0.25, 0, 0);
  P.add('hull', cylY(0.30, 0.30, 0.035, P.q ? 22 : 12), 0.62, 1.74, 0.72);      // driver hatch
  P.add('hullDark', torus(0.30, 0.015, P.q ? 22 : 12), 0.62, 1.745, 0.72);
  periscope(P, 'hullDetail', 0.40, 1.76, 1.05);
  periscope(P, 'hullDetail', 0.62, 1.76, 1.08);
  periscope(P, 'hullDetail', 0.84, 1.76, 1.05, 0.3);
  towCable(P, [[-1.15, 1.42, 2.5], [0, 1.56, 1.7], [1.15, 1.42, 2.5]]);
  // ---- turret: 2A7 wedge family — flat-roofed box + two-tier spaced wedges
  const LTW = 1.22, LTH = 0.88;
  P.add('turret', frustum(LTW, 0.62, -2.05, LTW * 0.94, 0.55, -2.02, 0.0, LTH));
  P.add('turret', slab(                                                          // R wedge, apex tier
    [0.04, 0.08, 1.52], [1.30, 0.08, 0.14], [1.30, 0.08, -0.02], [0.04, 0.08, 1.36],
    [0.04, 0.22, 1.43], [1.30, 0.22, 0.05], [1.30, 0.22, -0.11], [0.04, 0.22, 1.27]));
  P.add('turret', slab(                                                          // R wedge, upper tier
    [0.34, 0.22, 1.10], [1.30, 0.22, 0.05], [1.30, 0.22, -0.11], [0.34, 0.22, 0.94],
    [0.34, 0.90, 0.67], [1.30, 0.90, -0.38], [1.30, 0.90, -0.54], [0.34, 0.90, 0.51]));
  P.add('turret', slab(                                                          // L wedge, apex tier
    [-1.30, 0.08, 0.14], [-0.04, 0.08, 1.52], [-0.04, 0.08, 1.36], [-1.30, 0.08, -0.02],
    [-1.30, 0.22, 0.05], [-0.04, 0.22, 1.43], [-0.04, 0.22, 1.27], [-1.30, 0.22, -0.11]));
  P.add('turret', slab(                                                          // L wedge, upper tier
    [-1.30, 0.22, 0.05], [-0.34, 0.22, 1.10], [-0.34, 0.22, 0.94], [-1.30, 0.22, -0.11],
    [-1.30, 0.90, -0.38], [-0.34, 0.90, 0.67], [-0.34, 0.90, 0.51], [-1.30, 0.90, -0.54]));
  for (const s of [-1, 1]) {                                                    // wedge furniture
    P.add('turretDark', box(0.78, 0.035, 0.035), s * 0.80, 0.40, 0.50, -0.5, s * 0.83, 0);
    P.add('turret', box(0.09, 0.05, 0.12), s * 0.62, 0.80, 0.50, -0.5, s * 0.83, 0);
    P.add('turret', box(0.09, 0.05, 0.12), s * 1.08, 0.80, 0.02, -0.5, s * 0.83, 0);
  }
  P.add('turretDark', slab(                                                      // spaced-gap AO R
    [0.30, 0.38, 0.87], [1.24, 0.38, -0.16], [1.24, 0.38, -0.24], [0.30, 0.38, 0.79],
    [0.30, 0.86, 0.55], [1.24, 0.86, -0.48], [1.24, 0.86, -0.56], [0.30, 0.86, 0.47]));
  P.add('turretDark', slab(                                                      // spaced-gap AO L
    [-1.24, 0.38, -0.16], [-0.30, 0.38, 0.87], [-0.30, 0.38, 0.79], [-1.24, 0.38, -0.24],
    [-1.24, 0.86, -0.48], [-0.30, 0.86, 0.55], [-0.30, 0.86, 0.47], [-1.24, 0.86, -0.56]));
  P.add('turret', box(0.72, 0.56, 0.06), 0, 0.36, 0.60);                        // mantlet slot back wall
  // EMES 15 recessed into the right wedge roof edge (family weak spot)
  P.add('turretDark', box(0.62, 0.20, 0.52), 0.74, 0.84, 0.52);
  P.add('turret', box(0.50, 0.24, 0.40), 0.74, 0.88, 0.50);
  P.add('turretDetail', box(0.54, 0.05, 0.44), 0.74, 1.025, 0.48);
  P.add('turretDark', box(0.38, 0.16, 0.04), 0.74, 0.88, 0.715);
  P.add('turretGlass', box(0.30, 0.10, 0.02), 0.74, 0.88, 0.74);
  // PERI R17 panoramic periscope on the LEFT roof (§8.5 — A7 carries it right)
  P.add('turretDetail', cylY(0.055, 0.065, 0.30, 12), -0.42, LTH + 0.15, -1.05);
  P.add('turretDetail', cylY(0.08, 0.08, 0.07, 12), -0.42, LTH + 0.33, -1.05);
  P.add('turretDark', box(0.18, 0.20, 0.20), -0.42, LTH + 0.46, -1.05);
  P.add('turretGlass', box(0.12, 0.11, 0.02), -0.42, LTH + 0.48, -0.945);
  // hatches: commander right (ahead), loader left
  P.add('turret', cylY(0.24, 0.24, 0.045, 14), 0.62, LTH + 0.02, -0.72);
  P.add('turret', cylY(0.22, 0.22, 0.045, 14), -0.68, LTH + 0.02, -0.55);
  periscope(P, 'turretDetail', 0.62, LTH + 0.06, -0.38);
  liftEye(P, 'turretDetail', -1.08, LTH + 0.03, 0.05);
  liftEye(P, 'turretDetail', 1.08, LTH + 0.03, -0.6);
  // NO FLW 200 RWS, NO climate/APU boxes — the clean A6 roof (§8.5).
  // simple rear stowage rail + baskets instead of the A7 full-width rack
  const lrkT = 0.66, lrkB = 0.14, lrkZ = -2.55;
  P.add('turretDetail', box(2 * LTW - 0.2, 0.05, 0.05), 0, lrkT, lrkZ);
  P.add('turretDetail', box(2 * LTW - 0.2, 0.05, 0.05), 0, lrkB, lrkZ);
  for (let k = 0; k < 11; k++) {
    P.add('turretDetail', box(0.035, lrkT - lrkB, 0.035), -LTW + 0.13 + k * 0.22, (lrkT + lrkB) / 2, lrkZ);
  }
  P.add('turretDark', box(2 * LTW - 0.3, 0.02, 0.4), 0, lrkB + 0.03, -2.35);
  stowage(P, 'turretCloth', rng, [
    [-0.7, 0.38, -2.32, 0.7, 0.4, 0.38], [0.35, 0.34, -2.34, 0.6, 0.34, 0.36],
  ]);
  jerryCan(P, 'turretCloth', -1.15, 0.36, -2.35, 0.15);
  tarpRoll(P, 'turretCloth', 0.85, 0.52, -2.32, 0.9, 0.10, true);
  ammoCan(P, 'turretDark', 1.15, 0.32, -2.36, 0.22);
  spareTrackStrip(P, 'turret', -0.35, 0.56, -2.35, 2, 0, 0);
  for (const s of [-1, 1]) {                                                    // side mesh baskets
    P.add('turretDetail', box(0.05, 0.05, 1.35), s * (LTW + 0.12), 0.62, -1.32);
    P.add('turretDetail', box(0.05, 0.05, 1.35), s * (LTW + 0.12), 0.20, -1.32);
    for (let k = 0; k < 6; k++) {
      P.add('turretDetail', box(0.03, 0.42, 0.03), s * (LTW + 0.12), 0.41, -0.72 - k * 0.24);
    }
    stowage(P, 'turretCloth', rng, [[s * (LTW + 0.05), 0.40, -1.3, 0.16, 0.3, 1.05]]);
  }
  // 2x8 smoke dischargers in curved rows on the rear sides (family kit)
  // r1: banks lifted clear of the basket stowage on a visible mount plate
  // (mirror of the buildLeo2A7 fix — "missing 2x8 smoke rows" critique)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.06, 0.30, 0.72), s * (LTW + 0.05), 0.62, -1.42, 0, s * 0.28, 0);
    smokeCluster(P, s * (LTW + 0.10), 0.74, -1.24, 4, s * 1.05, 0.9);
    smokeCluster(P, s * (LTW + 0.12), 0.56, -1.44, 4, s * 1.2, 0.9);
  }
  // crosswind mast rear RIGHT (§8.5 — mirrored from the A7), antenna left
  P.add('turretDetail', box(0.03, 0.45, 0.03), 1.02, LTH + 0.3, -1.9);
  P.add('turretDetail', box(0.03, 0.55, 0.03), -1.02, LTH + 0.32, -1.95, 0, 0, -0.1);
  // flat plate mantlet in the arrow notch + the LONG Rh-120 L/55
  P.addGunExtra(box(0.56, 0.46, 0.30), 0, 0.02, 0.52);
  P.addGunExtra(box(0.84, 0.34, 0.16), 0, 0, 0.32);
  P.addGunExtra(cylZ(0.13, 0.3, 12, 0.155), 0, 0, 0.72);
  buildGun(P, { len: 6.6, r: 0.079, sleeve: true, evac: 0.62, collar: true, baseR: 0.16 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.35, wheelW: 0.22, xc: 1.55,
    wheelZs: [2.95, 2.0, 1.25, 0.28, -0.69, -1.66, -2.63],
    sprocket: { z: -3.5, y: 0.46, r: 0.34 }, idler: { z: 3.45, y: 0.44, r: 0.32 },
    trackW: 0.635, topY: 0.92, paintedEnds: true, coveredTop: true,
  });
  // Bundeswehr iron cross on the turret sides + 2-digit tactical number
  P.decal('turret', 'crossgrey', null, 0.38, [1.23, 0.44, -0.22], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.38, [-1.23, 0.44, -0.22], -Math.PI / 2);
  P.decal('turret', 'number', '24', 0.32, [1.23, 0.40, -1.05], Math.PI / 2);
  P.decal('turret', 'number', '24', 0.32, [-1.23, 0.40, -1.05], -Math.PI / 2);
  // r1: Y-plate moved off the engine deck onto the vertical hull rear plate
  P.decal('hull', 'number', 'Y-224', 0.30, [0.62, 1.44, -3.775], Math.PI, 0);
  P.decal('hull', 'number', 'Y-224', 0.26, [-1.05, 0.72, 3.79], 0, -0.35);
  P.topY = 1.08;
}

/** Builder table merged into tankFactory.BUILDERS by the extension hook. */
export const MODERN1_BUILDERS = {
  t72b3: buildT72B3,
  challenger2: buildChallenger2,
  challenger_3: buildChallenger3,
  merkava4: buildMerkava4,
  leo2a6: buildLeo2A6,
};
