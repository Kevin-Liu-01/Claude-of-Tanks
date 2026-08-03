// Euro/Asia-moderns family procedural profiles (fidelity oracles:
// ariete-dustymojito, char_leclerc_andertan, t80u_javanilga, recovered
// type90, type74-nullops). Owned by the misc/Euro-Asia family agent.
//
// Wave-2 rebuild (docs/critique/shaded-parity-r1.md lessons applied in ONE
// pass): every tank is a bespoke build measured against the width-normalized
// mask probes of its local reference GLB + the packet dims in
// docs/references/tanks/<id>.md. Original primitive reconstructions only —
// no source mesh data, no vertex extraction (oracles are visual references).
//
// Baselines (2026-07-30): ariete 77.3 (T69 G40), leclerc 81.5 (T71 G65),
// t80u 78.3 (T55), type90 78.9 (T62), type74 unscoreable (spec delisted).
// The shared failure was the UPPER mask: canonical turrets far narrower /
// lower / shorter than their oracles, guns seated at the wrong height with
// wrong overhang. Hull envelopes stay at published dims (HANDOFF §4: real
// dimensions win); oracle-frame caps are documented per packet.
//
// WIDTH GUARD: the lab width-normalizes both models. Committed max widths —
// ariete/leclerc/t80u 3.60 (skirt planes ±1.80), type90 3.43 (±1.715),
// type74 3.18 (track outer faces ±1.59). NOTHING (bins, baskets, flaps,
// ERA, mirrors) may exceed those planes or the whole tank rescales and
// every mask shifts.
import { KIT, FITTINGS, buildProfile, WESTERN } from './kit.js';
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from '../specs.js';

// NOTE: KIT bindings are only dereferenced inside build-time functions —
// never at module scope — because of the tankFactory extension-module cycle.

// ---------------------------------------------------------------------------
// Type 74 spec registration. userdrops.js delisted the id together with its
// PERSONAL-USE GLB because the vehicle had "no procedural fallback"; this
// module IS that clean-license fallback, so the spec ships (the quarantined
// GLB stays lab-only via LOCAL_REFERENCE_OVERRIDES — never a MODEL_SOURCE).
// Helpers are local mirrors of specs.js module-private builders
// (schema-identical, same duplication rule as modern1.js / userdrops.js).
// ---------------------------------------------------------------------------
const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };
function par(name, physicalMm, v0, v1, v3, o = {}) {
  const v2 = [v1[0] + v3[0] - v0[0], v1[1] + v3[1] - v0[1], v1[2] + v3[2] - v0[2]];
  return {
    name, verts: [v0, v1, v2, v3], physicalMm,
    keMm: o.keMm !== undefined ? o.keMm : physicalMm,
    ceMm: o.ceMm !== undefined ? o.ceMm : physicalMm,
    kind: o.kind || 'main', era: o.era || null,
    moduleLink: o.moduleLink || null, gunFollow: !!o.gunFollow,
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
function communityArmor(o) {
  const hl = o.lenM / 2;
  const hw = o.widM / 2;
  const inW = hw * 0.62;
  const floor = o.hgtM * 0.16;
  const trkTop = o.hgtM * 0.38;
  const roofY = o.turretPivot[1];
  const tp = o.turretPivot;
  const tH = Math.max(0.5, o.hgtM - roofY - 0.1);
  const tw = hw * 0.55;
  const tl = hw * 0.62;
  return {
    boundingRadiusM: hl + o.barrelLenM * 0.55 + 0.4,
    turretPivot: [tp[0], tp[1], tp[2]],
    gunPivot: [o.gunPivot[0], o.gunPivot[1], o.gunPivot[2]],
    gunBarrel: { lengthM: o.barrelLenM, radiusM: o.barrelRadM },
    hullPlates: [
      fr('upper_glacis', o.frontMm, hw * 0.95, o.hgtM * 0.34, hl * 0.92, roofY, hl * 0.62),
      fr('lower_front', o.frontMm, hw * 0.95, floor, hl * 0.8, o.hgtM * 0.34, hl * 0.92),
      sR('hull_side_upper_R', o.sideMm, hw, trkTop, hw, roofY, -hl, hl * 0.6),
      sL('hull_side_upper_L', o.sideMm, hw, trkTop, hw, roofY, -hl, hl * 0.6),
      sR('hull_side_lower_R', o.sideMm, inW, floor, inW, trkTop, -hl * 0.95, hl * 0.9),
      sL('hull_side_lower_L', o.sideMm, inW, floor, inW, trkTop, -hl * 0.95, hl * 0.9),
      sR('track_R', 18, hw * 0.9, 0.15, hw * 0.9, trkTop, -hl, hl, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 18, hw * 0.9, 0.15, hw * 0.9, trkTop, -hl, hl, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', o.rearMm, hw * 0.95, floor, -hl * 0.92, roofY, -hl),
      rf('hull_roof', o.roofMm, hw * 0.95, roofY, -hl, hl * 0.62),
    ],
    turretPlates: [
      fr('turret_front', o.tFrontMm, tw * 0.8, 0.02, tl, tH, tl * 0.9),
      sR('turret_side_R', o.tSideMm, tw, 0.02, tw * 0.92, tH, -tl, tl * 0.85),
      sL('turret_side_L', o.tSideMm, tw, 0.02, tw * 0.92, tH, -tl, tl * 0.85),
      rr('turret_rear', o.tRearMm, tw * 0.85, 0.02, -tl, tH, -tl * 1.05),
      rf('turret_roof', o.roofMm, tw, tH + 0.02, -tl, tl * 0.85),
      par('mantlet', o.mantletMm,
        [-o.barrelRadM * 4, o.gunPivot[1] - 0.28, tl + 0.04],
        [o.barrelRadM * 4, o.gunPivot[1] - 0.28, tl + 0.04],
        [-o.barrelRadM * 4, o.gunPivot[1] + 0.28, tl],
        { kind: 'spaced', gunFollow: true }),
    ],
    modules: [
      mbox('engine', [-inW * 0.95, floor, -hl * 0.95], [inW * 0.95, roofY * 0.85, -hl * 0.5]),
      mbox('fuelTank', [-inW * 0.95, floor, -hl * 0.48], [inW * 0.95, roofY * 0.65, -hl * 0.28]),
      mbox('ammoRack', [-inW * 0.9, floor, -hl * 0.2], [inW * 0.9, roofY * 0.55, hl * 0.28]),
      mbox('turretRing', [-tw, roofY - 0.18, tp[2] - tw], [tw, roofY + 0.02, tp[2] + tw]),
      mbox('radio', [inW * 0.25, roofY * 0.55, hl * 0.5], [inW * 0.9, roofY * 0.9, hl * 0.8]),
      mbox('optics', [0.1, tH * 0.5, tl * 0.3], [tw * 0.55, tH * 0.85, tl * 0.8], true),
      mbox('gun', [-o.barrelRadM * 2.4, o.gunPivot[1] - 0.22, -tl * 0.4], [o.barrelRadM * 2.4, o.gunPivot[1] + 0.28, tl], true),
      mbox('trackL', [-hw, 0, -hl], [-inW, trkTop, hl]),
      mbox('trackR', [inW, 0, -hl], [hw, trkTop, hl]),
    ],
    crew: [
      cbox('driver', [-inW * 0.8, floor + 0.2, hl * 0.45], [-inW * 0.1, roofY * 0.9, hl * 0.85]),
      cbox('gunner', [-tw * 0.85, 0.05, -tl * 0.3], [-tw * 0.15, tH * 0.85, tl * 0.5], true),
      cbox('commander', [tw * 0.15, 0.05, -tl * 0.9], [tw * 0.85, tH * 0.9, -tl * 0.1], true),
      cbox('loader', [tw * 0.1, 0.05, -tl * 0.2], [tw * 0.8, tH * 0.8, tl * 0.5], true),
    ],
  };
}

// Same stats as the (never-registered) userdrops.js TYPE74_SPEC so the
// authored balance intent carries over unchanged.
const TYPE74_SPEC = {
  id: 'type74', name: 'Type 74', nation: 'Japan', era: 'modern', class: 'mbt',
  variantOf: 'type74',
  hp: 1750,
  enginePowerHp: 720, weightTons: 38, topSpeedKmh: 53, reverseSpeedKmh: 20,
  hullTraverseDegS: 38,
  terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.4 },
  pivotStyle: 'neutral',
  turretTraverseDegS: 36, gunPitchDegS: 30, gunElevationDeg: 15, gunDepressionDeg: 10,
  gun: {
    caliberMm: 105, reloadS: 5.8, baseAccuracy: 0.30, aimTimeS: 1.8,
    bloom: BLOOM_MODERN,
    shells: [
      shell('Type 93 APFSDS', 'APFSDS', 105, apfsdsPens(380)[0], apfsdsPens(380)[1], 390, 1455, { pen2000Mm: apfsdsPens(380)[2] }),
      shell('Type 91 HEAT-MP', 'HEAT', 105, 400, 400, 400, 1173),
      shell('M393 HEP', 'HE', 105, 45, 45, 470, 730),
    ],
  },
  dims: { hullLengthM: 6.7, overallLengthM: 9.42, widthM: 3.18, heightM: 2.48 },
  armor: communityArmor({
    lenM: 6.7, widM: 3.18, hgtM: 2.25, turretPivot: [0, 1.42, -0.05],
    gunPivot: [0, 0.32, 0.5], barrelLenM: 5.05, barrelRadM: 0.062,
    frontMm: 110, sideMm: 45, rearMm: 25, roofMm: 20,
    tFrontMm: 195, tSideMm: 80, tRearMm: 40, mantletMm: 195,
  }),
  visual: {
    scheme: 'stripes', base: '#44503a', weather: '#4e5a44',
    patches: ['#4d4133', '#37432f'],
    marking: 'number', number: '74', trackWidthM: 0.55, camoScale: 0.6,
  },
};
TANK_SPECS.type74 = TANK_SPECS.type74 || TYPE74_SPEC;
if (!ALL_TANK_IDS.includes('type74')) ALL_TANK_IDS.push('type74');
MODEL_SOURCE.type74 = MODEL_SOURCE.type74 || { source: 'procedural' };

// ---------------------------------------------------------------------------
// Family machinery
// ---------------------------------------------------------------------------

// Dark recess field behind every road wheel so hubs/rims read out of the
// wheel-bay shadow (soviet-heavy r2 lesson — merged, zero extra draws).
function wheelRecess(P, wheelZs, xc, r, w) {
  const { cylX } = KIT;
  for (const z of wheelZs) for (const s of [-1, 1]) {
    P.add('hullDark', cylX(r * 0.72, w * 1.06, 12), s * xc, 0, z, 0, 0, 0);
  }
}
// (positioned variant — recess at wheel height y)
function wheelRecessAt(P, wheelZs, xc, y, r, w) {
  const { cylX } = KIT;
  for (const z of wheelZs) for (const s of [-1, 1]) {
    P.add('hullDark', cylX(r * 0.72, w * 1.06, 12), s * xc, y, z);
  }
}

// Fender/hull stowage bin with tarp lid + dark latch straps.
function bin(P, x, y, z, w, h, d) {
  const { box } = KIT;
  P.add('hull', box(w, h, d), x, y, z);
  P.add('hullDark', box(w * 1.03, h * 0.72, 0.024), x, y + h * 0.06, z - d * 0.28);
  P.add('hullDark', box(w * 1.03, h * 0.72, 0.024), x, y + h * 0.06, z + d * 0.28);
}

// Armored optics housing: body + dark split doors/aperture + glass slit.
// frame: 'turret' | 'hull'. face: +z aperture.
function sightBox(P, frame, x, y, z, w, h, d, ry = 0) {
  const { box } = KIT;
  const dark = `${frame}Dark`, glass = `${frame}Glass`;
  P.add(frame, box(w, h, d), x, y, z, 0, ry, 0);
  P.add(dark, box(w * 0.66, h * 0.52, 0.03), x, y + h * 0.05, z + d / 2 + 0.005, 0, ry, 0);
  P.add(glass, box(w * 0.5, h * 0.3, 0.016), x, y + h * 0.05, z + d / 2 + 0.02, 0, ry, 0);
  P.add(dark, box(0.014, h * 0.8, d * 0.9), x, y, z - 0.01, 0, ry, 0); // door split line
}

// Pipe-frame stowage basket with mesh face + cloth cargo (turret frame).
function basket(P, halfW, z0, z1, yBot, yTop, load = 0.6) {
  const { box } = KIT;
  const d = Math.abs(z1 - z0), zm = (z0 + z1) / 2;
  for (const y of [yBot, yTop]) {
    P.add('turretDetail', box(halfW * 2, 0.032, 0.032), 0, y, z0);
    P.add('turretDetail', box(halfW * 2, 0.032, 0.032), 0, y, z1);
    for (const s of [-1, 1]) P.add('turretDetail', box(0.032, 0.032, d), s * halfW, y, zm);
  }
  for (let i = 0; i < 5; i++) {
    const x = -halfW + (i / 4) * halfW * 2;
    P.add('turretDetail', box(0.028, yTop - yBot, 0.028), x, (yBot + yTop) / 2, z1);
  }
  P.add('turretDark', box(halfW * 1.96, (yTop - yBot) * 0.9, 0.014), 0, (yBot + yTop) / 2, z1 + 0.018);
  if (load) P.add('turretCloth', box(halfW * 1.82, (yTop - yBot) * load, d * 0.88), 0, yBot + (yTop - yBot) * load * 0.55, zm);
}

// Whip antenna on a base block, raked (turret frame).
function whip(P, x, y, z, len, rzOut = 0, rxAft = 0) {
  const { box } = KIT;
  P.add('turretDetail', box(0.06, 0.07, 0.06), x, y + 0.03, z);
  P.add('turretDetail', box(0.022, len, 0.022), x + Math.sin(rzOut) * len * -0.5, y + Math.cos(Math.max(Math.abs(rzOut), Math.abs(rxAft))) * len * 0.5, z + Math.sin(rxAft) * len * 0.5, rxAft, 0, rzOut);
}

// GALIX-style discharger bank: n dark tubes splayed on a mount wedge.
function galixBank(P, x, y, z, side, n = 4, rows = 1) {
  const { box, cylZ } = KIT;
  P.add('turret', box(0.09, 0.26, 0.16 * n * 0.72), x - side * 0.02, y - 0.04, z, 0, side * 0.55, 0);
  for (let r = 0; r < rows; r++) for (let k = 0; k < n - (r ? 1 : 0); k++) {
    P.add('turretDark', cylZ(0.048, 0.24, 8), x + side * (k * 0.02 - r * 0.06), y + 0.05 - r * 0.15,
      z + 0.26 - k * 0.135, -0.42 + r * 0.08, side * (0.95 + k * 0.14), 0);
  }
}

// Rubber corner mud flap over a track run.
function mudflap(P, x, y, z, w = 0.56, h = 0.36) {
  const { box } = KIT;
  P.add('hullRubber', box(w, h, 0.035), x, y, z);
}

// (raisedEndWheels static-primitive workaround DELETED — the kit track fix
// at 146d25c runs the flat contact span over the road-wheel patch only and
// ramps the band tangentially to raised end wheels with a source-level
// ground clamp, so the REAL raised idler/sprocket now go straight into
// buildRunningGear. Verified per tank by gate re-runs.)

// Sealed trunnion mantlet: every part is a solid of revolution about the
// pitch axis through the gun pivot (shaded-parity family critical #4-5 —
// silhouette invariant under elevation, no void can open). Turret-side brow
// and cheek plates are added by each caller.
function trunnionRoll(P, rollR, rollW, o = {}) {
  const { cylX, sph } = KIT;
  P.addGunExtra(cylX(rollR, rollW, 16), 0, 0, 0);
  if (o.ballR) P.addGunExtra(sph(o.ballR, 12), 0, 0, o.ballZ ?? rollR * 0.9);
}

// ---------------------------------------------------------------------------
// C1 Ariete — docs/references/tanks/ariete.md
// hull 7.59, width 3.60 over skirts, deck 1.45, turret roof ~2.40 (oracle),
// gun axis 1.84, muzzle bow+1.93; 7 wheels, rear sprocket; welded turret
// with angular mantlet cheeks, TURMS boxes, rear basket, GALIX.
// ---------------------------------------------------------------------------
function buildAriete(P) {
  const { box, cylY, cylZ, frustum, slab, torus, buildGun, buildRunningGear,
    fenders, headlight, liftEye, periscope, towCable, stowage, spareTrackStrip, jerryCan } = KIT;
  const { rng } = P;
  const halfL = 3.795;
  // hull body: low tub + near-vertical sponson band + long shallow glacis
  P.add('hull', box(2.28, 0.55, 7.18), 0, 0.67, -0.02);                        // (r3 §B4: x +-1.14 — the 1.175 edges sat one dilation voxel inside the band planes through both wrap zones)
  P.add('hull', frustum(1.66, 3.72, -3.70, 1.62, 3.70, -3.68, 0.95, 1.45));
  P.add('hull', box(3.20, 0.05, 5.00), 0, 1.425, -1.20);                       // deck plate
  P.add('hull', frustum(1.66, 3.795, 1.32, 1.48, 1.36, 1.26, 0.98, 1.45));     // long upper glacis
  P.add('hull', frustum(1.02, 3.24, 3.795, 1.06, 3.795, 3.795, 0.44, 0.98));   // raked lower bow NARROW (r3 §B4: the 1.66 width crossed the idler wrap; the 0.98-1.45 glacis above stays full-width)
  P.add('hull', box(3.06, 0.46, 0.10), 0, 1.20, -3.745);                       // rear plate
  fenders(P, 1.22, 1.79, 1.10, -3.70, 3.70, 0.03);
  // driver station flush RIGHT + episcopes + V splash rail
  P.add('hull', box(0.66, 0.05, 0.70), 0.55, 1.30, 2.10, -0.10, 0, 0);
  P.add('hullDark', box(0.60, 0.014, 0.03), 0.55, 1.33, 2.10, -0.10, 0, 0);
  for (let k = -1; k <= 1; k++) periscope(P, 'hullDetail', 0.55 + k * 0.17, 1.35, 2.42, k * 0.08);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.85, 0.045, 0.055), s * 0.40, 1.24, 2.62, -0.22, s * 0.42, 0);
  // rear powerpack face: grille, taillights, LEFT exhaust outlet, mud flaps
  P.add('hullDark', box(1.80, 0.28, 0.035), 0.10, 1.16, -3.76);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.70, 0.032, 0.04), 0.10, 1.05 + k * 0.075, -3.775);
  P.add('hullDark', box(0.24, 0.32, 0.30), -1.62, 1.02, -2.84);                // (r3 §B4: shortened + forward, clear of the sprocket wrap near edge)
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.032, 0.27, 0.26), -1.755, 1.02, -2.97 + k * 0.13);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.14, 0.07, 0.035), s * 1.34, 1.32, -3.78);
    mudflap(P, s * 1.47, 0.44, -3.76);
    mudflap(P, s * 1.47, 0.50, 3.74);
  }
  // engine deck: dark bank + louvres + fuel caps
  P.add('hullDark', box(2.35, 0.018, 1.05), 0, 1.462, -2.45);
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(2.20, 0.026, 0.055), 0, 1.472, -2.85 + k * 0.20);
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.075, 0.075, 0.024, 12), s * 1.24, 1.465, -0.55);
  // headlight pods ON the glacis plate (they sat invisibly low on the nose
  // tip in the r3 board) + brush-guard hoops
  headlight(P, -1.18, 1.17, 2.94, -0.34);
  headlight(P, 1.18, 1.17, 2.94, -0.34);
  P.add('hullDetail', torus(0.078, 0.013, 10), -1.18, 1.19, 3.02, -0.34, 0, 0);
  P.add('hullDetail', torus(0.078, 0.013, 10), 1.18, 1.19, 3.02, -0.34, 0, 0);
  P.add('hullDetail', torus(0.085, 0.016, 10), -0.62, 0.62, 3.72, Math.PI / 2, 0, 0); // tow eyes
  P.add('hullDetail', torus(0.085, 0.016, 10), 0.62, 0.62, 3.72, Math.PI / 2, 0, 0);
  for (const s of [-1, 1]) P.add('hullDark', box(0.54, 0.03, 6.9), s * 1.50, 1.128, -0.02); // fender edge shadow rib (stays inside the ±1.80 width guard)
  liftEye(P, 'hullDetail', -1.30, 1.43, 0.55);
  liftEye(P, 'hullDetail', 1.30, 1.43, 0.55);
  towCable(P, [[-1.16, 1.28, 2.85], [0, 1.41, 2.30], [1.16, 1.28, 2.85]]);
  spareTrackStrip(P, 'hull', 1.26, 1.17, 2.35, 2, -1.1, 0);
  stowage(P, 'hullCloth', rng, [[-1.45, 1.22, -1.6, 0.5, 0.20, 1.3]]);
  P.decal('hull', 'number', 'EI 118', 0.26, [-0.92, 0.80, 3.70], 0, -0.20);
  P.decal('hull', 'soot', null, 0.55, [-1.78, 1.02, -2.95], -Math.PI / 2);
  // skirts: 7 panels, heavier slant-cut lead panel, dark inset bottom lip
  // (bottom edge raised r2 — the oracle exposes more wheel below the line)
  const skirtZ = [2.82, 1.88, 0.94, 0, -0.94, -1.88, -2.82];
  for (const s of [-1, 1]) {
    skirtZ.forEach((z, k) => {
      // WIDTH GUARD: outer faces exactly ±1.80 (bbox width IS the loader's
      // normalization input — anything wider rescales the whole tank)
      P.add('hull', box(k === 0 ? 0.085 : 0.045, k === 0 ? 0.54 : 0.48, 0.90), s * (1.80 - (k === 0 ? 0.0425 : 0.0225)), 0.87, z);
      P.add('hullDark', box(0.05, 0.44, 0.018), s * 1.77, 0.87, z + (k === 6 ? 0.45 : -0.45)); // (r3 §B4: the rear panel's edge strip flips to its FRONT edge, out of the sprocket wrap)
      P.add('hullDark', cylZ(0.019, 0.016, 8), s * 1.781, 1.06, z, 0, s * Math.PI / 2, 0);
    });
    P.add('hullDark', box(0.02, 0.06, 6.30), s * 1.775, 0.615, 0, 0, 0, 0);    // shadow lip, no sunlit top face
  }
  // running gear: SEVEN wheels, rear sprocket, rollers behind the skirts
  const wheelZs = skirtZ;
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.345, wheelW: 0.21, wheelY: 0.42, xc: 1.47,
    wheelZs,
    sprocket: { z: -3.28, y: 0.51, r: 0.30 }, idler: { z: 3.26, y: 0.50, r: 0.29 },
    rollers: [2.20, 0.72, -0.72, -2.20].map((z) => ({ z, y: 0.86, r: 0.08 })),
    trackW: 0.58, topY: 0.86, botY: 0.055, paintedEnds: true, coveredTop: true, arms: true,
  });
  wheelRecessAt(P, wheelZs, 1.47, 0.42, 0.345, 0.21);

  // ---- turret: long welded body, canted slab sides, narrow front between
  // swept cheeks, angular mantlet wedges, armored bustle + basket ----
  P.turretG.position.set(0, 1.48, -0.12);
  const TH = 0.90;                                                             // roof 2.38
  P.add('turret', cylY(1.04, 1.08, 0.09, 24), 0, 0.045, -0.10);                // ring collar
  P.add('turret', frustum(1.26, 0.52, -1.62, 1.10, 0.40, -1.56, 0.03, TH));    // main body
  P.add('turret', slab(                                                        // right cheek
    [0.30, 0.03, 1.00], [1.26, 0.03, 0.44], [1.26, 0.03, 0.16], [0.30, 0.03, 0.74],
    [0.28, TH, 0.62], [1.10, TH, 0.16], [1.10, TH, -0.06], [0.28, TH, 0.42]));
  P.add('turret', slab(                                                        // left cheek
    [-1.26, 0.03, 0.44], [-0.30, 0.03, 1.00], [-0.30, 0.03, 0.74], [-1.26, 0.03, 0.16],
    [-1.10, TH, 0.16], [-0.28, TH, 0.62], [-0.28, TH, 0.42], [-1.10, TH, -0.06]));
  P.add('turret', box(0.64, TH * 0.94, 0.14), 0, TH * 0.48, 0.98);             // narrow front face
  P.add('turret', box(2.34, 0.66, 0.62), 0, 0.37, -1.82);                      // armored bustle
  P.add('turretDark', box(2.10, 0.045, 0.50), 0, 0.72, -1.82);                 // bustle roof recess
  // ANGULAR MANTLET CHEEKS: backward-raked wedges flanking the gun aperture
  for (const s of [-1, 1]) {
    P.add('turret', box(0.40, 0.58, 0.34), s * 0.46, 0.34, 0.90, 0, s * -0.48, 0);
    P.add('turret', box(0.34, 0.20, 0.30), s * 0.42, 0.74, 0.84, -0.35, s * -0.48, 0);
  }
  // roof: TURMS gunner sight box (right-front, split doors) anchoring the
  // published 2.50 height, commander pano held at the same line
  sightBox(P, 'turret', 0.62, TH + 0.045, 0.40, 0.44, 0.15, 0.52);
  P.add('turretDetail', box(0.48, 0.03, 0.56), 0.62, TH + 0.105, 0.40);        // sight lid (top 2.50)
  P.add('turret', cylY(0.10, 0.11, 0.10, 12), 0.42, TH + 0.05, -0.32);         // pano pedestal
  P.add('turretDark', cylY(0.14, 0.14, 0.11, 12), 0.42, TH - 0.005, -0.32);    // pano head (top 2.43)
  P.add('turretGlass', box(0.14, 0.06, 0.018), 0.42, TH - 0.01, -0.18);
  P.add('turret', cylY(0.23, 0.23, 0.05, 14), 0.60, TH + 0.02, -0.95);         // commander ring
  P.add('turret', cylY(0.195, 0.195, 0.028, 14), 0.60, TH + 0.075, -0.95);     // lid
  P.add('turretDark', box(0.40, 0.014, 0.03), 0.60, TH + 0.095, -0.95);        // lid seam
  periscope(P, 'turretDetail', 0.60, TH + 0.05, -0.68);
  P.add('turret', cylY(0.20, 0.20, 0.04, 14), -0.54, TH + 0.02, -0.62);        // loader hatch
  P.add('turretDark', cylY(0.21, 0.21, 0.012, 14), -0.54, TH + 0.052, -0.62);
  // loader's MG42-class pintle — §B3 KIT fitting (foot sunk so the receiver
  // rides ~2.53w: 2 side columns inside the ≤4-col heightM budget with the
  // 2.50 TURMS-lid anchor)
  const mag = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', seed: 5 });
  mag.position.set(-0.54, 0.80, -0.62);
  P.turretG.add(mag);
  periscope(P, 'turretDetail', -0.30, TH + 0.05, 0.10, -0.2);
  // side equipment shelves: stowage bins + GALIX banks standing off the
  // walls (the oracle's mid-height side steps, front view)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.18, 0.36, 0.95), s * 1.30, 0.42, -0.30, 0, s * 0.04, 0);
    P.add('turretDark', box(0.19, 0.08, 0.85), s * 1.305, 0.60, -0.30, 0, s * 0.04, 0);
  }
  galixBank(P, 1.31, 0.72, 0.30, 1);
  galixBank(P, -1.31, 0.72, 0.30, -1);
  // bustle basket + cargo + antennas + rails
  basket(P, 1.12, -2.16, -2.52, 0.10, 0.58, 0.62);
  jerryCan(P, 'turretCloth', -0.85, 0.68, -1.95, 0.2);
  stowage(P, 'turretCloth', rng, [[0.55, 0.78, -1.95, 0.8, 0.24, 0.45]]);
  whip(P, 1.00, TH, -1.50, 0.66, 0.50, -0.08);                                 // leaned outward: single spike column
  whip(P, -1.00, TH, -1.50, 0.66, -0.50, -0.08);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.022, 0.022, 1.30), s * 1.19, 0.42, -0.75);     // side grab rails
    liftEye(P, 'turretDetail', s * 0.92, TH + 0.02, 0.30, s * 0.4);
    liftEye(P, 'turretDetail', s * 0.98, TH + 0.02, -1.30, s * -0.4);
  }
  P.decal('turret', 'number', P.spec.visual.number || '118', 0.27, [1.17, 0.40, -0.75], Math.PI / 2, 0, 0.05);
  P.decal('turret', 'number', P.spec.visual.number || '118', 0.27, [-1.17, 0.40, -0.75], -Math.PI / 2, 0, -0.05);
  // 120 mm OTO Breda L/44 at axis 1.84: sealed trunnion roll + stepped
  // collar, thermal sleeve pair with dark clamp rings, evacuator in the
  // sleeve gap, MRS collar at the muzzle.
  P.gunG.position.set(0, 0.36, 0.72);
  trunnionRoll(P, 0.20, 0.60, { ballR: 0.165, ballZ: 0.22 });
  P.addGunExtra(box(0.46, 0.50, 0.26), 0, 0.0, 0.14);                          // mantlet block
  P.addGunExtra(cylZ(0.135, 0.30, 12, 0.16), 0, 0, 0.38);                      // stepped root collar
  P.addGunExtraDark(cylZ(0.026, 0.10, 8), 0.27, 0.06, 0.30);                   // coax port
  P.add('turret', box(0.72, 0.16, 0.34), 0, 0.68, 0.94, -0.42, 0, 0);          // brow over the roll
  // len at the PUBLISHED overall station (dims sovereign; the oracle's
  // short-modelled tube is a certified wholeCurves cover cost — packet).
  buildGun(P, { len: 5.28, r: 0.098, sleeve: true, evac: 0.44, evacR: 1.80, collar: true, baseR: 0.17 });
  P.topY = TH + 0.42;
}

// ---------------------------------------------------------------------------
// Leclerc S2 — docs/references/tanks/leclerc.md
// hull 6.88, width 3.60, deck 1.60 (raised engine run 1.74), turret roof
// ~2.40, gun axis 1.93, muzzle bow+2.99; 6 wheels, front idler; tall narrow
// autoloader turret, side cheek armor + baskets, HL-70 box, thin pano mast,
// GALIX corners, rear hull rack.
// ---------------------------------------------------------------------------
function buildLeclerc(P) {
  const { box, cylY, cylZ, frustum, slab, torus, buildGun, buildRunningGear,
    fenders, headlight, liftEye, periscope, towCable, stowage, jerryCan, ammoCan } = KIT;
  const { rng } = P;
  // hull — R2 FULL RE-LAY from the post-warp workorder (2026-08-03):
  // the ref side deck line steps 1.549 (fore) / 1.577 (mid) / 1.632 (engine)
  // / 1.715 hump / 1.605 tail lip, the bow silhouette is the RAKED GLACIS
  // LINE itself falling (1.62,1.55) -> (3.44,1.22) (the old flat 1.605
  // fender plane out to z 2.95 read +0.17 over the whole nose), the belly
  // boat-tails at both ends (the old full-length tub bottom 0.25 read under
  // the ref's climbing track ramps), and the tail deep body ends -3.31.
  P.add('hull', box(2.35, 0.95, 5.05), 0, 0.735, -0.075);                      // tub z -2.60..2.45 (belly 0.26)
  // sponson band ends z 1.95 — past that its 1.49 top pokes ABOVE the raked
  // glacis surface and re-flattens the bow line (this round's 1.499 shelf)
  P.add('hull', frustum(1.70, 1.95, -3.24, 1.68, 1.93, -3.22, 1.02, 1.49));
  P.add('hull', frustum(1.68, 3.10, 1.92, 1.68, 2.95, 1.90, 1.02, 1.26));      // low bow side wall under the glacis
  P.add('hull', box(2.48, 0.05, 4.40), 0, 1.52, -1.10);                        // center deck (top 1.545)
  // deck-edge planes: stepped per the measured side line; the -0.58..-0.30
  // gap is the ref's 1.494 dip (the band top shows through)
  fenders(P, 1.24, 1.72, 1.534, -0.30, 2.06, 0.03);                            // fore deck 1.549
  fenders(P, 1.24, 1.72, 1.562, -1.86, -0.58, 0.03);                           // mid deck 1.577
  fenders(P, 1.20, 1.40, 1.617, -3.06, -1.80, 0.03);                           // engine deck 1.632 (ref front: 1.63 only to x 1.39)
  fenders(P, 1.38, 1.72, 1.585, -3.06, -1.80, 0.03);                           // engine deck outer edge 1.60
  fenders(P, 1.20, 1.72, 1.590, -3.24, -3.00, 0.03);                           // tail lip 1.605
  for (const s2 of [-1, 1]) P.add('hull', box(0.16, 0.08, 0.18), s2 * 1.05, 1.673, -2.325); // filler pots (the ref's 1.715 'hump' is two x ±1.05 caps)
  // GLACIS: raked surface (1.64,1.55) -> (2.66,1.363) full width, then a
  // TAPER to x ±0.94 by z 2.78 and a narrow nose to 3.46 — the ascending
  // track band crosses the glacis plane at z>2.75, so full-width plate
  // there would clip through the band (containment law); the plan front at
  // x 1.0-1.6 is carried by the idler-wrap link pads (3.50) like the print
  P.add('hull', frustum(1.66, 2.66, 1.60, 1.66, 1.64, 1.60, 1.363, 1.55));
  P.add('hull', frustum(1.00, 2.74, 2.62, 1.66, 2.66, 2.62, 1.348, 1.363));
  P.add('hull', frustum(0.94, 3.46, 2.76, 0.94, 2.82, 2.76, 1.21, 1.34));
  // lower bow: narrow (x ±0.94 INSIDE the track inner faces)
  P.add('hull', frustum(0.94, 2.95, 2.42, 0.94, 3.46, 2.58, 0.27, 1.19));
  // stern boat-tail wedge, same containment narrowing
  P.add('hull', slab(
    [-0.94, 0.26, -2.50], [0.94, 0.26, -2.50], [0.94, 0.26, -2.72], [-0.94, 0.26, -2.72],
    [-0.94, 1.05, -2.50], [0.94, 1.05, -2.50], [0.94, 1.05, -3.28], [-0.94, 1.05, -3.28]));
  P.add('hullDetail', box(2.88, 0.05, 0.08), 0, 1.43, 2.24, -0.20, 0, 0);      // splash ridge on the plane
  // OUTER mudguard strips only (x 1.70..1.785 — clear of the 1.66 pad
  // plane): raked 1.445 @ z1.30 -> 1.235 @ 3.32 so the falling glacis owns
  // the side line; they carry the plan's outer-column 3.32 front edge
  for (const s2 of [-1, 1]) {
    P.add('hull', slab(
      [s2 * 1.70, 1.415, 1.30], [s2 * 1.785, 1.415, 1.30], [s2 * 1.785, 1.205, 3.32], [s2 * 1.70, 1.205, 3.32],
      [s2 * 1.70, 1.445, 1.30], [s2 * 1.785, 1.445, 1.30], [s2 * 1.785, 1.235, 3.32], [s2 * 1.70, 1.235, 3.32]));
  }
  // driver LEFT: flush hatch + 3 episcopes
  P.add('hull', cylY(0.27, 0.27, 0.035, 16), -0.60, 1.556, 0.85);
  P.add('hullDark', torus(0.275, 0.014, 16), -0.60, 1.562, 0.85);
  periscope(P, 'hullDetail', -0.82, 1.58, 1.10, -0.3);
  periscope(P, 'hullDetail', -0.60, 1.58, 1.15);
  periscope(P, 'hullDetail', -0.38, 1.58, 1.10, 0.3);
  // skirts: front-third armored blocks + rubber sheet, dark inset lip.
  // STATION LAW: courses SEGMENTED ~0.43-0.45 m. R2 workorder: sheet outer
  // face 1.70, band 0.48..1.49 (bottom deepened to the ref's 0.476 line);
  // blocks outer 1.80, band 0.86..1.43; a SIXTH LOW block (0.86..1.24,
  // z 3.23..3.52) is the ref's nose-tip silhouette at 3.38..3.52.
  for (const s of [-1, 1]) {
    // WIDTH GUARD: front-block outer faces exactly ±1.80
    for (let k = 0; k < 5; k++) {
      P.add('hull', box(0.09, 0.56, 0.42), s * 1.755, 1.145, 1.32 + 0.43 * k);
    }
    P.add('hull', box(0.09, 0.38, 0.31), s * 1.725, 1.05, 3.375);              // 6th low block: inner face 1.68 CLEAR of the link pads (containment), still the 3.497 side body column
    for (let k = 0; k < 3; k++) P.add('hullDark', box(0.07, 0.50, 0.016), s * 1.76, 1.15, 2.85 - k * 0.72);
    for (let k = 0; k < 10; k++) {
      // LAST course is the ref's short cut-high panel over the sprocket
      // (its side bottom reads 0.805 at -3.27, not the 0.48 sheet line)
      if (k === 0) P.add('hull', box(0.035, 0.68, 0.41), s * 1.6825, 1.15, -3.05);
      else P.add('hull', box(0.035, 1.01, 0.41), s * 1.6825, 0.985, -3.05 + 0.4306 * k);
    }
    for (let k = 0; k < 5; k++) P.add('hullDark', box(0.03, 0.90, 0.016), s * 1.684, 0.975, 0.72 - k * 0.86);
    P.add('hullDark', box(0.02, 0.05, 5.82), s * 1.688, 0.505, 0.31);
    // front flap tucked fully below the idler wrap arc (containment)
    mudflap(P, s * 1.41, 0.60, 3.28, 0.50, 0.20);
  }
  // rear plate + REAR STOWAGE RACK overhang. R2: plate face -3.31 (ref deep
  // body end), rack rails to -3.56, top rail 1.545 — the 1.5625 top keeps
  // the rack band at 0.29 < the 12% side filter (0.302 on the 2.52 build)
  // so hullLengthM cannot read the rack as body (round-3 incident law).
  // plate face -3.36: hullLengthM measures col-center to col-center, so the
  // rear BODY column must be -3.385 (with the front one at 3.497 = 6.88);
  // a -3.31 face read only the -3.274 col = 6.77 (-1.53%)
  P.add('hull', box(3.00, 0.30, 0.05), 0, 1.395, -3.335);
  P.add('hull', box(2.00, 0.24, 0.05), 0, 1.13, -3.275);                       // step filler down to the wedge line
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.64, 0.22, 0.03), s * 0.85, 1.40, -3.345);
    for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.62, 0.035, 0.035), s * 0.85, 1.31 + k * 0.09, -3.345);
    P.add('hullDark', box(0.14, 0.08, 0.04), s * 1.32, 1.44, -3.34);
  }
  for (const [xc2, w2] of [[-0.78, 0.24], [-0.375, 0.25], [0.26, 0.54], [0.79, 0.22]]) { // rails SEGMENTED (ref plan gaps at x -0.6 / -0.15 / +0.62)
    P.add('hullDetail', box(w2, 0.035, 0.035), xc2, 1.545, -3.42);
    P.add('hullDetail', box(w2, 0.035, 0.035), xc2, 1.29, -3.53);
  }
  for (const vx of [-0.78, -0.375, 0.10, 0.42, 0.79]) P.add('hullDetail', box(0.03, 0.18, 0.14), vx, 1.41, -3.46);
  stowage(P, 'hullCloth', rng, [[-0.78, 1.40, -3.44, 0.20, 0.15, 0.18], [-0.375, 1.40, -3.44, 0.24, 0.16, 0.19], [0.26, 1.40, -3.45, 0.50, 0.17, 0.21], [0.79, 1.395, -3.44, 0.18, 0.15, 0.18]]);
  // engine deck: raised CENTER plate at the ref's 1.618 line (front view
  // center tops 1.62 come from HERE — the fore deck stays 1.545) + inset
  // fan dark + louvres barely proud
  P.add('hull', box(2.40, 0.05, 1.30), 0, 1.593, -2.42);
  P.add('hullDark', box(1.80, 0.016, 1.20), 0, 1.61, -2.42);
  for (let k = 0; k < 6; k++) P.add('hullDetail', box(1.72, 0.02, 0.055), 0, 1.618, -1.87 - k * 0.17);
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.09, 0.09, 0.026, 12), s * 1.30, 1.555, -0.55);
  headlight(P, -1.74, 1.33, 2.60, -0.2);
  headlight(P, 1.74, 1.33, 2.60, -0.2);
  towCable(P, [[-1.10, 1.44, 2.30], [0, 1.50, 1.85], [1.10, 1.44, 2.30]]);
  liftEye(P, 'hullDetail', -1.30, 1.50, -0.95);
  liftEye(P, 'hullDetail', 1.30, 1.50, -0.95);
  P.decal('hull', 'number', '6-33', 0.28, [1.80, 0.95, 2.5], Math.PI / 2);
  P.decal('hull', 'number', '6-33', 0.28, [-1.80, 0.95, 2.5], -Math.PI / 2);
  // 6 wheels, FRONT idler / REAR sprocket, 5 rollers. R2 workorder: HIGH
  // short idler matching the ref (wrap top 1.41 = the z 3.15..3.26 bump,
  // far edge 3.52 covers the ref's 3.43..3.54 body columns), sprocket
  // pulled to -2.90 so its wrap (far -3.23) stays inside the -3.32 column
  // edge — front body 3.54 + rear -3.32 = hullLengthM 6.86 (in grace).
  // Track narrowed to the ref planes: inner 1.00 / outer 1.60.
  // ref contact patch is [-2.10, 2.30] (bottoms 0.03..0.06 there) — the r1
  // wheelbase sat 0.35 too far AFT; end-wheel far edges INCLUDE the link
  // pads (+0.08 beyond the band: the 6.99 hullLengthM incident was the
  // sprocket pads landing at -3.34 in the -3.385 column)
  const wheelZs = [2.12, 1.312, 0.504, -0.304, -1.112, -1.92];
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.36, wheelW: 0.22, wheelY: 0.45, xc: 1.28,
    wheelZs,
    sprocket: { z: -2.86, y: 1.00, r: 0.27 }, idler: { z: 3.16, y: 1.04, r: 0.19 },
    rollers: [1.95, 1.05, 0.15, -0.80, -1.70].map((z) => ({ z, y: 0.88, r: 0.08 })),
    trackW: 0.64, trackTh: 0.06, topY: 0.90, botY: 0.055, paintedEnds: true, coveredTop: true, arms: true,
  });
  wheelRecessAt(P, wheelZs, 1.28, 0.45, 0.36, 0.22);

  // ---- turret: tall narrow autoloader block. R2 FULL RE-LAY (post-warp
  // workorder): roof plateau 2.352 world flat back to z -1.42 THEN falls to
  // 2.18 at the -2.35 tail (the r1 2.40->2.26 early slope was wrong); the
  // roof edge CHAMFERS from x 1.00 down to 2.22 at x 1.40 (ref front tops
  // 2.23-2.24 over x 1.19..1.43 — the old square 2.40 edge owned those
  // columns); cheek armor runs far forward (front edge ~2.05w out to
  // x 1.40) over a LOW outer applique band (1.245..1.60w, z -0.14..1.41w);
  // a fixed collar wraps the tube root out to world 2.90 (ref side band
  // 2.10..1.70 there); MG lowered to the 2.43 line by the mast columns.
  P.turretG.position.set(0, 1.60, -0.10);
  const LH = 0.752;                                                            // roof plateau 2.352
  const roofAt = (z) => (z >= -1.32 ? LH : Math.max(0.575, LH + (z + 1.32) * 0.201));
  P.add('turret', slab(                                                        // rear/autoloader box — right-rear roof corner CLIPPED (print)
    [-1.30, 0, -0.12], [1.30, 0, -0.12], [1.30, 0, -1.70], [-1.30, 0, -1.70],
    [-1.02, 0.60, -0.15], [1.02, 0.60, -0.15], [0.95, 0.60, -1.72], [-1.02, 0.60, -1.92]));
  P.add('turret', slab(                                                        // bustle tail LEFT of the center notch
    [-1.24, 0.16, -1.72], [-0.02, 0.16, -1.72], [-0.02, 0.40, -2.16], [-1.10, 0.40, -2.23],
    [-1.20, 0.615, -1.72], [-0.02, 0.615, -1.72], [-0.02, 0.578, -2.16], [-1.06, 0.578, -2.23]));
  P.add('turret', slab(                                                        // bustle tail RIGHT of the notch (tip -2.17w only to x0.90)
    [0.14, 0.16, -1.72], [1.10, 0.16, -1.72], [0.90, 0.40, -2.07], [0.14, 0.40, -2.16],
    [0.14, 0.615, -1.72], [1.06, 0.615, -1.72], [0.86, 0.578, -2.07], [0.14, 0.578, -2.16]));
  for (const s of [-1, 1]) {
    P.add('turret', slab(                                                      // aft roof wedges: raised SIDE BANDS |x| 0.30..1.05
      [s * 1.28, 0.56, -1.28], [s * 0.30, 0.56, -1.28], [s * 0.30, 0.44, s > 0 ? -2.04 : -2.20], [s * (s > 0 ? 1.02 : 1.24), 0.44, s > 0 ? -1.80 : -2.20],
      [s * 1.05, LH, -1.30], [s * 0.30, LH, -1.30], [s * 0.30, 0.578, s > 0 ? -2.06 : -2.22], [s * (s > 0 ? 0.88 : 1.03), 0.578, s > 0 ? -1.84 : -2.22]));
  }
  P.add('turret', slab(                                                        // LOW center roof channel (ref front center 2.248)
    [-0.34, 0.56, -0.60], [0.34, 0.56, -0.60], [0.32, 0.44, -2.12], [-0.32, 0.44, -2.12],
    [-0.32, 0.648, -0.62], [0.32, 0.648, -0.62], [0.30, 0.578, -2.14], [-0.30, 0.578, -2.14]));
  P.add('turret', box(0.64, 0.648, 0.75), 0, 0.324, 0.02);                     // center strip forward section (top 2.248)
  P.add('turret', slab(                                                        // right main cheek
    [0.33, 0, 1.12], [1.30, 0, -0.10], [1.30, 0, -0.5], [0.33, 0, 0.68],
    [0.31, LH, 1.02], [1.00, LH, -0.16], [1.00, LH, -0.5], [0.31, LH, 0.58]));
  P.add('turret', slab(                                                        // left main cheek
    [-1.30, 0, -0.10], [-0.33, 0, 1.12], [-0.33, 0, 0.68], [-1.30, 0, -0.5],
    [-1.00, LH, -0.16], [-0.31, LH, 1.02], [-0.31, LH, 0.58], [-1.00, LH, -0.5]));
  // roof-edge chamfer (ref front tops: 2.35 @ x1.0 -> 2.22 @ x1.40)
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.98, 0.56, 0.58], [s * 1.40, 0.56, 0.50], [s * 1.40, 0.56, -1.30], [s * 0.98, 0.56, -1.30],
      [s * 0.98, LH, 0.58], [s * 1.36, 0.615, 0.50], [s * 1.36, 0.615, -1.30], [s * 0.98, LH, -1.30]));
  }
  P.add('turret', box(0.64, 0.648, 0.55), 0, 0.324, 0.85);                     // narrow front face (top at the 2.248 channel line)
  // FORWARD CHEEK COMPLEX: plateau top 2.24w to z ~2.1w, swept front edge
  // LEFT cheek: near-flat forward face at ~2.20w (print's left front)
  P.add('turret', slab(
    [-0.06, -0.05, 2.30], [-1.06, -0.05, 2.22], [-1.06, -0.05, 0.55], [-0.06, -0.05, 0.55],
    [-0.06, 0.64, 2.24], [-1.04, 0.64, 2.16], [-1.04, 0.64, 0.55], [-0.06, 0.64, 0.55]));
  P.add('turret', slab(
    [-1.06, -0.05, 2.22], [-1.44, -0.05, 1.68], [-1.44, -0.05, 0.55], [-1.06, -0.05, 0.55],
    [-1.04, 0.64, 2.16], [-1.36, 0.53, 1.62], [-1.36, 0.53, 0.55], [-1.04, 0.64, 0.55]));
  // RIGHT cheek: shorter front with the gunner-sight WELL notch at x 0.55-0.70
  P.add('turret', slab(
    [0.06, -0.05, 2.24], [0.54, -0.05, 2.19], [0.54, -0.05, 0.55], [0.06, -0.05, 0.55],
    [0.06, 0.64, 2.18], [0.54, 0.64, 2.13], [0.54, 0.64, 0.55], [0.06, 0.64, 0.55]));
  P.add('turret', slab(
    [0.54, -0.05, 1.94], [0.70, -0.05, 1.92], [0.70, -0.05, 0.55], [0.54, -0.05, 0.55],
    [0.54, 0.64, 1.88], [0.70, 0.64, 1.86], [0.70, 0.64, 0.55], [0.54, 0.64, 0.55]));
  P.add('turret', slab(
    [0.70, -0.05, 2.10], [1.06, -0.05, 2.04], [1.06, -0.05, 0.55], [0.70, -0.05, 0.55],
    [0.70, 0.64, 2.04], [1.04, 0.64, 1.98], [1.04, 0.64, 0.55], [0.70, 0.64, 0.55]));
  P.add('turret', slab(
    [1.06, -0.05, 2.04], [1.44, -0.05, 1.68], [1.44, -0.05, 0.55], [1.06, -0.05, 0.55],
    [1.04, 0.64, 1.98], [1.36, 0.53, 1.62], [1.36, 0.53, 0.55], [1.04, 0.64, 0.55]));
  // chin: LOW jaw (bottom 1.27w) only over z 1.45..1.66w, then the fore
  // block at 1.58w (ref side bottoms: 1.25-1.28 @ 1.50-1.61, 1.554 @ 1.72+)
  P.add('turret', box(0.38, 0.86, 0.21), 0, 0.10, 1.655);
  P.add('turret', box(0.38, 0.41, 0.60), 0, 0.325, 2.06);
  P.add('turret', box(0.19, 0.40, 0.65), 0, 0.30, 2.675);                      // fixed tube-root collar (1.70..2.10w to z 2.90w)
  for (const s of [-1, 1]) P.add('turret', box(0.34, 0.42, 0.60), s * 0.45, 0.24, 1.06); // cheek fills beside sleeve
  // side ARMOR BOXES (tops chamfered 2.13 -> 1.92w outboard), LOW outer
  // applique band, midships baskets (outer face 1.57 — plan sees it at
  // x 1.62 columns, the front mask must NOT at 1.605)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.14, 0.32, s < 0 ? 2.03 : 2.15), s * 1.475, 0.16, s < 0 ? 0.585 : 0.645); // bottom 1.60w; front: right 1.62w / left 1.50w
    P.add('turret', slab(
      [s * 1.40, 0.32, 1.70], [s * 1.535, 0.32, 1.70], [s * 1.535, 0.32, -0.45], [s * 1.40, 0.32, -0.45],
      [s * 1.40, s < 0 ? 0.62 : 0.53, 1.66], [s * 1.44, s < 0 ? 0.62 : 0.53, 1.66], [s * 1.44, s < 0 ? 0.62 : 0.53, -0.45], [s * 1.40, s < 0 ? 0.62 : 0.53, -0.45]));
    // applique 1.246..1.60w — the print's LEFT plate runs to 1.41w, RIGHT to 1.04w
    P.add('turret', box(0.028, 0.355, s < 0 ? 1.55 : 1.18), s * 1.63, -0.177, s < 0 ? 0.735 : 0.55);
    P.add('turretDetail', box(0.045, 0.045, 1.28), s * 1.53, 0.35, -0.79);     // basket rails
    P.add('turretDetail', box(0.045, 0.045, 1.28), s * 1.53, 0.02, -0.79);
    for (let k = 0; k < 5; k++) P.add('turretDetail', box(0.03, 0.33, 0.03), s * 1.53, 0.185, -0.24 - k * 0.28);
    stowage(P, 'turretCloth', rng, [[s * 1.46, 0.19, -0.73, 0.18, 0.28, 1.0]]);
  }
  // print's LEFT flank cloth bulge (front col -1.64 reads 1.65..1.92 there)
  P.add('turretCloth', box(0.05, 0.27, 0.80), -1.625, 0.185, -0.90);
  // roof: HL-70 armored sight head FORWARD-right. Top 2.52w — the sight's
  // 3-4 columns are the heightM p95 anchor (with the masts and pano pot);
  // the roof plateau alone (2.352) reads 2.47 p95 = dims -12 (this round)
  sightBox(P, 'turret', 0.55, LH + 0.08, 1.03, 0.40, 0.16, 0.42);
  P.add('turret', box(0.42, 0.04, 0.42), 0.55, LH + 0.148, 1.04);
  P.add('turretDark', box(0.56, 0.014, 0.40), 0, 0.658, -1.12);                // autoloader panel field (in the low channel)
  P.add('turretDark', box(0.56, 0.014, 0.62), 0, 0.60, -1.72, -0.09, 0, 0);    // aft panel rides the channel fall
  for (let k = 0; k < 4; k++) P.add('turretDetail', box(0.56, 0.018, 0.02), 0, (k < 1 ? 0.648 : roofAt(-1.08 - k * 0.30) - 0.10) + 0.012, -1.08 - k * 0.30);
  // commander (left) + gunner (right) hatches
  P.add('turret', cylY(0.22, 0.22, 0.045, 14), -0.56, roofAt(-0.55) + 0.02, -0.55);
  P.add('turretDark', box(0.38, 0.012, 0.03), -0.56, roofAt(-0.55) + 0.048, -0.55);
  P.add('turret', cylY(0.20, 0.20, 0.04, 14), 0.58, roofAt(-0.90) + 0.02, -0.90);
  // 7.62 ANF1 pintle LOW by the mast column (decoration law; receiver top
  // 2.43w — the r1 gunner-ring perch read 2.49-2.52 over the 2.35 roof)
  P.add('turretDark', cylY(0.024, 0.028, 0.08, 8), 0.95, LH + 0.04, -0.75);
  P.add('turretDark', box(0.07, 0.08, 0.30), 0.95, 0.752, -0.70);
  P.add('turretDark', cylZ(0.017, 0.34, 8), 0.95, 0.762, -0.38, -0.10, 0, 0);
  P.add('turretDetail', box(0.05, 0.09, 0.12), 0.86, LH + 0.03, -0.76);
  periscope(P, 'turretDetail', -0.35, 0.66, -0.28, 0.3);
  periscope(P, 'turretDetail', 0.42, roofAt(-0.58) + 0.05, -0.58);
  // HL-15 panoramic + antenna pot: the ref's 2.49-2.50 head cluster lives
  // at x ~0.0-0.10, z world -1.66 (front cols -0.015..0.106 = 2.501; side
  // cols -1.72..-1.60 = 2.49) — NOT at x -0.55 (ref front there is 2.359)
  P.add('turretDetail', cylY(0.05, 0.055, 0.16, 10), 0.055, 0.72, -1.56);
  P.add('turretDark', box(0.12, 0.12, 0.14), 0.055, 0.835, -1.56);
  P.add('turretGlass', box(0.10, 0.06, 0.018), 0.055, 0.85, -1.48);
  // crosswind mast + whip base: TWO spike columns at x ±1.05, tops 2.54,
  // plus the sensor base block at x -1.14 (ref front -1.149: 2.45)
  for (const [mx, mt] of [[-1.11, 0.905], [0.99, 0.915]]) {
    P.add('turretDetail', box(0.028, 0.46, 0.028), mx, 0.69, -0.83);
    P.add('turretDark', box(0.036, 0.05, 0.036), mx, mt, -0.83);
  }
  P.add('turretDetail', box(0.07, 0.10, 0.10), -1.14, 0.80, -0.95);            // sensor base (top 2.45)
  // whips STOWED along the bustle roof (the print carries no raised spikes)
  P.add('turretDetail', box(0.022, 0.022, 0.62), 0.95, roofAt(-1.75) + 0.03, -1.62);
  P.add('turretDetail', box(0.022, 0.022, 0.62), -0.95, roofAt(-1.75) + 0.03, -1.62);
  // GALIX: LEFT bank deep/outboard (the print's tall left corner), RIGHT
  // bank short/low/inboard (ref right cols top 1.94-2.06, rear -1.76)
  galixBank(P, 1.24, 0.38, -1.38, 1, 4, 1);
  galixBank(P, -1.34, 0.50, -1.62, -1, 5, 2);
  P.add('turret', box(0.24, 0.32, 0.44), -1.38, 0.35, -1.82);                  // LEFT corner bin (rear -2.14w at x 1.26-1.50)
  // rear bustle rack: thin top shelf read (2.04..2.18w at the tail); the
  // print's cage is LEFT-BIASED (right rear edge stops ~-2.17w)
  for (const y2 of [0.44, 0.60]) {                                             // cage rails (notched at x 0.0..0.14 like the print's rear face)
    for (const [cx2, w3] of [[-0.46, 0.88], [0.52, 0.76]]) {
      P.add('turretDetail', box(w3, 0.032, 0.032), cx2, y2, -2.06);
      P.add('turretDetail', box(w3, 0.032, 0.032), cx2, y2, -1.86);
    }
    for (const sx of [-1, 1]) P.add('turretDetail', box(0.032, 0.032, 0.20), sx * 0.90, y2, -1.96);
  }
  for (const vx of [-0.86, -0.45, -0.04, 0.16, 0.55, 0.88]) P.add('turretDetail', box(0.028, 0.16, 0.028), vx, 0.52, -2.06);
  P.add('turretDark', box(0.86, 0.14, 0.014), -0.46, 0.52, -2.075);
  P.add('turretDark', box(0.72, 0.14, 0.014), 0.52, 0.52, -2.075);
  P.add('turretCloth', box(0.80, 0.10, 0.16), -0.42, 0.50, -1.95);
  P.add('turretCloth', box(0.60, 0.09, 0.15), 0.50, 0.49, -1.94);
  P.add('turretDetail', box(0.045, 0.045, 0.42), -1.33, 0.60, -2.01);
  P.add('turretDetail', box(0.045, 0.045, 0.42), -1.33, 0.44, -2.01);
  P.add('turretDetail', box(0.36, 0.045, 0.045), -1.10, 0.60, -2.21);
  P.add('turretCloth', box(0.30, 0.22, 0.34), -1.18, 0.50, -2.05);
  P.add('turretCloth', box(0.24, 0.16, 0.30), -1.13, 0.52, -2.06);
  jerryCan(P, 'turretCloth', 0.80, 0.42, -1.88, -0.2);
  ammoCan(P, 'turretDark', -1.05, 0.42, -1.98, 0.25);
  P.add('turretDetail', box(0.10, 0.03, 0.16), -0.95, LH + 0.015, 0.30);       // flush lifting lugs
  P.add('turretDetail', box(0.10, 0.03, 0.16), 0.95, LH + 0.015, 0.30);
  P.decal('turret', 'number', '33', 0.30, [1.30, 0.35, -1.0], Math.PI / 2);
  P.decal('turret', 'number', '33', 0.30, [-1.30, 0.35, -1.0], -Math.PI / 2);
  // CN120-26 L/52 seated LOW (measured ref axis ~1.85, band half 0.14):
  // moving mantlet plate on the gun; root/collar mass is turret-frame above
  P.gunG.position.set(0, 0.27, 0.50);
  trunnionRoll(P, 0.21, 0.68);
  P.addGunExtra(box(0.92, 0.62, 0.85), 0, 0.07, 0.55);                         // moving mantlet plate
  P.addGunExtraDark(cylZ(0.028, 0.10, 8), 0.34, 0.10, 0.44);                   // coax port
  P.addGunExtra(cylZ(0.132, 0.50, 12), 0, -0.02, 2.55);                        // fat sleeve-junction collar (plan ±0.15 cols)
  P.addGunExtra(cylZ(0.126, 0.42, 12), 0, -0.02, 3.62);
  // muzzle drum + evac HELD UNDER the 12% side body filter (0.296 band on
  // the 2.52 build): a 0.33-band muzzle collar made hullLengthM read the
  // whole gun as body (9.44 incident this round)
  P.addGunExtra(cylZ(0.146, 0.26, 12), 0, 0.062, 5.62);
  P.addGunExtra(cylZ(0.138, 1.15, 12), 0, -0.014, 3.98);                       // fore sleeve band (ref 1.717..1.994 @ w 4.2-5.0)
  buildGun(P, { len: 5.90, r: 0.085, sleeve: true, evac: 0.52, evacR: 1.72, collar: true, baseR: 0.17 });
  P.topY = LH + 0.55;
}

// ---------------------------------------------------------------------------
// T-80U — docs/references/tanks/t80u.md
// hull 7.01, width 3.60, deck 1.38, dome crown 2.20 with clamshell K-5 arc
// reading ~2.9 wide, roof furniture to ~2.7; gun axis 1.66, muzzle
// bow+2.7; 6 small dished wheels, rear sprocket; turbine exhaust box rear.
// ---------------------------------------------------------------------------
function buildT80U(P) {
  const { box, cylY, cylX, cylZ, frustum, slab, lathe, torus, buildGun, buildRunningGear,
    fenders, headlight, liftEye, periscope, towCable, stowage, spareTrackStrip, cupola } = KIT;
  const { rng } = P;
  const D2R = Math.PI / 180;
  // pancake hull. VERTEX ROUND (2026-08-03 workorder): the ref deck plateau
  // ends ~z 2.45 and the glacis crest line runs (2.67, 1.22) -> (3.43, 0.76)
  // — the old deck band carried the 1.38 plateau out to 2.94 and read +0.17
  // tall across the whole nose; rear deep content ends by z -3.31 with only
  // a thin fender lip beyond (to -3.53).
  // R2 HULL RE-LAY (post-warp workorder): deck plateau 1.353 (was 1.387,
  // +3cm everywhere); glacis is TWO-PHASE — gentle (1.20,1.353)->(3.06,
  // 1.14) then the steep nose to (3.50,0.71); the tub boat-tails at both
  // ends (its 0.16 belly ran under the ref's climbing ramps); the outer
  // 1.68-1.79 fender strip is DELETED (ref front shows nothing above 1.06
  // outboard of x 1.70); plan front flares carried by low mudguard pods.
  P.add('hull', box(2.28, 0.72, 4.70), 0, 0.62, 0.15);                         // tub z -2.20..2.50 (r3: belly 0.26 — ref front bottoms read 0.263)
  P.add('hull', slab(                                                          // stern boat-tail (x ±1.14 inside the tracks)
    [-1.14, 0.26, -2.10], [1.14, 0.26, -2.10], [1.14, 0.26, -2.30], [-1.14, 0.26, -2.30],
    [-1.14, 0.62, -2.10], [1.14, 0.62, -2.10], [1.14, 0.62, -3.12], [-1.14, 0.62, -3.12]));
  P.add('hull', slab(                                                          // bow belly rise
    [-1.14, 0.26, 2.46], [1.14, 0.26, 2.46], [1.14, 0.26, 2.66], [-1.14, 0.26, 2.66],
    [-1.14, 0.66, 2.46], [1.14, 0.66, 2.46], [1.14, 0.66, 3.32], [-1.14, 0.66, 3.32]));
  // r3 CONTAINMENT RE-LAY (§B4, audited rear 223/front 102 -> target 0): the
  // sprocket/idler wrap arcs are cylinders (y 0.90/z -2.98) and (y 0.82/
  // z 2.98), outer r 0.32 (end r 0.24 + band 0.08), spanning x 1.18..1.66 —
  // wide hull solids stay clear; center columns (x <= 1.14) carry the same
  // side outline THROUGH the wrap zones instead.
  // deck band, wide part — SPLIT at y 1.26 (§B4): below the wrap-top line
  // the rear face is VERTICAL at -2.55 (the r3d sprocket wrap near-quadrant
  // curves to -2.66 @ y1.14); only the y>1.26 course reaches aft to -2.95.
  // The x<=1.14 rear extension still draws the full side outline to -3.28.
  P.add('hull', frustum(1.70, 1.18, -2.55, 1.55, 1.125, -2.55, 1.06, 1.26));
  P.add('hull', frustum(1.55, 1.125, -2.90, 1.48, 1.10, -2.95, 1.26, 1.353));
  P.add('hull', slab(                                                          // deck rear extension INSIDE the tracks — top SLOPES 1.353 -> 1.19 (ref tail deck line: 1.284 @ -3.0, 1.202 @ -3.21, 1.175 @ -3.32)
    [-1.14, 1.06, -2.55], [1.14, 1.06, -2.55], [1.14, 1.06, -3.28], [-1.14, 1.06, -3.28],
    [-1.14, 1.353, -2.55], [1.14, 1.353, -2.55], [1.14, 1.19, -3.28], [-1.14, 1.19, -3.28]));
  // fender plane ENDS z 2.42 (r3 workorder: the ref carries NO 1.29 lip over
  // the glacis — its side tops 2.5..3.45 are the bare crest line 1.20->0.74)
  fenders(P, 1.30, 1.70, 1.29, -3.20, 2.42, 0.032);
  P.add('hull', frustum(1.14, 3.06, 1.16, 1.14, 1.22, 1.16, 1.138, 1.353));    // upper glacis center strip: full crest line (3.06,1.14)->(1.22,1.353)
  P.add('hull', frustum(1.66, 2.70, 1.16, 1.66, 1.22, 1.16, 1.18, 1.353));     // upper glacis wide plate, bottom 1.18 above the wrap top (same plane, trimmed)
  P.add('hull', frustum(1.10, 3.34, 2.96, 1.14, 3.06, 2.86, 0.89, 1.14));      // steep nose NARROW; tip ends z 3.34 (ref plan bow 3.344; below 0.89 the tub face undercuts)
  // (r5: bow mudguard tips deleted — the ref's 1.4-1.7 band at z~3.5 is
  // GUN-node sleeve content, its hull row is NONE above the ramp there)
  // K-5 glacis wedge raft: 3 courses FLUSH on the plate (r3 workorder: ref
  // cols 2.36..3.02 read plate+0.02 — the proud raft owned ~6 side cols).
  // Row 2 narrows to x ±1.12: outboard of that at z ~2.9 is the idler wrap.
  const plateY = (z) => 1.353 - (z - 1.20) * 0.1145;
  for (let row = 0; row < 3; row++) for (let c = 0; c < (row === 2 ? 4 : 5); c++) {
    const z = 2.40 + row * 0.26;
    const x = row === 2 ? -0.84 + c * 0.56 : -1.12 + c * 0.56;
    P.add(c % 2 ? 'hullDetail' : 'hull', box(0.56, 0.05, 0.24), x, plateY(z) + 0.005, z, -6.5 * D2R, 0, 0);
  }
  // driver strip + V splash board (LOW on the gentle glacis — the r1
  // near-vertical strip and 1.49 lift eyes were the front-view 1.49 shelf)
  P.add('hull', box(0.50, 0.04, 0.30), 0, 1.245, 2.02, -0.30, 0, 0);
  periscope(P, 'hullDetail', -0.14, 1.27, 1.70);
  periscope(P, 'hullDetail', 0.14, 1.27, 1.70);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.70, 0.04, 0.06), s * 0.34, 1.16, 2.42, -0.28, s * 0.5, 0);
  // skirts: rubber sheet + armored front panels. Workorder (world frame):
  // outer band 0.62..1.24 tucked under the 1.26-1.29 fender lip; plan run
  // z -2.95..3.36
  for (const s of [-1, 1]) {
    // WIDTH GUARD: outer faces exactly ±1.80. STATION LAW: courses are
    // SEGMENTED ~0.46-0.49 m — an unbroken box is edge-on invisible to the
    // clipped station cameras (this exact sheet cost the even station rows
    // ~5-6% width until r6)
    for (let k = 0; k < 4; k++) {
      // k=3 SHORTENED to end 3.25 (r3b: a 3.35 panel end painted a 0.49-band
      // false BODY column at 3.363 — the ref front body col is ~3.25 — and
      // skewed the whole side registration dAlong to -0.108)
      P.add('hull', box(0.07, 0.50, k === 3 ? 0.40 : 0.47), s * 1.765, 0.815, k === 3 ? 3.05 : 1.645 + 0.49 * k);
    }
    // rear sheet INBOARD at 1.74 (r3 workorder: ref front cols ±1.78 top out
    // at the 1.06 armored panels — its rear sheet does not reach that plane)
    for (let k = 0; k < 9; k++) {
      P.add('hull', box(0.035, 0.62, 0.46), s * 1.7225, 0.93, -2.72 + 0.4833 * k);
    }
    for (let k = 0; k < 2; k++) P.add('hullDark', box(0.03, 0.40, 0.018), s * 1.784, 0.84, 3.10 - k * 1.00);
    for (let k = 2; k < 6; k++) P.add('hullDark', box(0.03, 0.54, 0.018), s * 1.745, 0.92, 3.10 - k * 1.00);
    P.add('hullDark', box(0.02, 0.05, 6.30), s * 1.786, 0.60, 0.20);
    // rear INSET skirt segment: the ref sheet keeps covering the sprocket
    // (side bottom 0.60 out to -3.37) but sits inboard of the ±1.75 plan
    // columns there
    P.add('hull', box(0.03, 0.62, 0.42), s * 1.70, 0.90, -3.10);               // (r3b: inboard — its 1.75 face printed the ±1.78 plan cols to -3.31 vs the ref's -2.94)
    // rear stanchion bracket (r3 dims anchor v2): the legal rear BODY column
    // at -3.43 (0.31 band > the 12% filter), hidden INSIDE the ref's own
    // plan shadow at x ~1.0 (its -3.46 pod columns) — the r3a outboard
    // course at x 1.72/z -3.5 printed an ONLY-PROC side column at -3.542
    // §A REGISTRATION COUNTERWEIGHT (r3 final): the dims anchors are a
    // SYMMETRIC PAIR about the ref's own 12%-band mid (-0.015; its body
    // cols read ~3.25/-3.28): rear stanchion at -3.475 + front pod anchor
    // at 3.42 = hullLength ~7.0 AND a matched registration mid. The r3a-c
    // asymmetric single anchors skewed dAlong to -0.11 and taxed every
    // side column.
    P.add('hull', box(0.07, 0.305, 0.06), s * 1.035, 1.0725, -3.42);           // (r3f: -3.39..-3.45, fully inside the -3.438 column's bin — a -3.49 edge painted the -3.512 col where the ref carries only the 1.17 lip)
    P.add('hull', box(0.56, 0.31, 0.12), s * 1.40, 0.705, 3.40);
    // rear fender stubs = the ref's -3.46 plan columns at x 1.40-1.51 AND its
    // -3.43/-3.49 side lip band 1.169..1.223 (one mass explains both rows)
    P.add('hull', box(0.11, 0.06, 0.16), s * 1.465, 1.19, -3.40);              // (r3e: narrowed to the ref's -3.46 plan column at x 1.41-1.52 — the 1.36 edge bled into the ±1.35 cols where ref ends -3.27)
  }
  // TURBINE EXHAUST BOX jutting off the rear plate (T-80 tell) + drums + log
  // (r2: face -3.30; the ref plan rear is -3.27..-3.30 with ONLY the narrow
  // x ±1.02 mudguard pods beyond, to -3.46 — the -3.48 side lip columns)
  // (r3: whole group pulled in to the ref's plan rear -3.27; drums shortened
  // to the 0.66..1.19 band; tail pods thinned to the ref's -3.43 lip band
  // 1.148..1.202 — its ONLY content aft of -3.33)
  P.add('hull', box(1.90, 0.55, 0.26), 0, 0.88, -3.145);
  P.add('hullDark', box(1.55, 0.34, 0.05), 0, 0.88, -3.27);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.50, 0.042, 0.04), 0, 0.74 + k * 0.10, -3.275);
  P.add('hullDetail', box(1.70, 0.05, 0.12), 0, 1.18, -3.245);
  for (const s of [-1, 1]) P.add('hull', box(0.09, 0.08, 0.18), s * 1.035, 1.17, -3.37); // tail mudguard pods = the ref's -3.43 side lip (1.13..1.21) + its plan -3.46 columns at x 0.99..1.08 ONLY (r3b: the 0.92..1.14 spread bled into the ±0.94/±1.13 plan cols)
  for (const s of [-1, 1]) {
    // r3 §B4: drums pulled inboard (x 0.98, lean 0.045) — the old ±1.05/0.10
    // lean put their upper halves across the band inner plane (72 rear vox)
    P.add('hullDetail', cylY(0.14, 0.14, 0.50, 12), s * 0.98, 0.93, -3.14, 0, 0, s * 0.045);
    P.add('hullDark', cylY(0.145, 0.145, 0.03, 12), s * 0.98, 1.19, -3.15, 0, 0, s * 0.045);
    P.add('hullDark', box(0.05, 0.34, 0.03), s * 0.98, 0.96, -3.26);
  }
  P.add('hullWood', cylX(0.105, 2.05, 10), 0, 0.71, -3.17);                    // log LOW on the plate
  for (const s of [-0.55, 0.55]) P.add('hullDark', cylX(0.112, 0.04, 10), s * 1.6, 0.71, -3.17);
  // engine deck: turbine intake field + louvres + hump
  P.add('hullDark', box(1.70, 0.02, 1.10), 0, 1.358, -2.00);
  for (let k = 0; k < 6; k++) P.add('hullDetail', box(1.60, 0.018, 0.05), 0, 1.364, -1.60 - k * 0.16);
  P.add('hull', box(1.00, 0.045, 0.62), 0.45, 1.352, -1.20);
  P.add('hull', box(0.34, 0.15, 1.65), -1.44, 1.14, -1.725);                   // left fender fuel/stow run (r3d: rear -2.55 — its -2.80 face sat inside the sprocket wrap's upper shell)
  P.add('hullDark', box(0.35, 0.03, 0.03), -1.44, 1.22, -1.35);
  P.add('hullDark', box(0.35, 0.03, 0.03), -1.44, 1.22, -2.45);
  bin(P, 1.44, 1.17, -1.35, 0.32, 0.18, 0.95);                                 // right fender bin row
  bin(P, 1.44, 1.17, -2.31, 0.32, 0.18, 0.56);                                 // (r3d: rear face -2.59, clear of the forward-moved sprocket wrap §B4)
  // r3 §B4: pods pulled inboard of the band inner plane (the -1.42 pod sat
  // in the idler wrap) and re-seated proud of the narrowed nose face
  headlight(P, -1.02, 1.00, 3.26, -0.35, 0.05);
  headlight(P, -0.74, 1.00, 3.30, -0.35, 0.05);
  P.add('hullDetail', torus(0.085, 0.016, 10), -0.55, 0.55, 3.24, Math.PI / 2, 0, 0);
  P.add('hullDetail', torus(0.085, 0.016, 10), 0.55, 0.55, 3.24, Math.PI / 2, 0, 0);
  liftEye(P, 'hullDetail', -1.15, 1.30, 0.9);
  liftEye(P, 'hullDetail', 1.15, 1.30, 0.9);
  towCable(P, [[-1.25, 0.96, 2.85], [-0.35, 0.90, 3.02], [0.50, 0.94, 2.92]]);
  spareTrackStrip(P, 'hull', 1.05, 1.20, 1.55, 2, -0.35, 0);
  P.decal('hull', 'soot', null, 1.0, [0.0, 0.9, -3.42], Math.PI);
  // 6 small dished wheels + 5 skirt-hidden rollers, rear sprocket. VERTEX
  // ROUND: the ref's flat contact patch is SHORT (-2.0..2.24) with long
  // climbing ramps to a HIGH short idler (bottom ~0.58 at z~3.06) and a
  // high sprocket (bottom ~0.62 by z -2.98); track outer face ~1.70.
  // (r3b idler/wheel experiment REVERTED: 3.02/0.83 put the wrap top 1.16
  // within one dilation voxel of the 1.18 glacis plane — 6 exact vox — and
  // the ramp change cost more side columns than it bought)
  const wheelZs = [2.24, 1.392, 0.544, -0.304, -1.152, -2.0];
  buildRunningGear(P, {
    style: 'dished', wheelR: 0.335, wheelW: 0.21, wheelY: 0.42, xc: 1.42, dishR: 0.80,
    wheelZs,
    sprocket: { z: -2.89, y: 0.90, r: 0.21 }, idler: { z: 2.98, y: 0.84, r: 0.21 },       // (r3d/e: forward sprocket + SMALLER end wheels — the 0.24 wraps read bottoms 0.44 vs the ref's 0.60-0.66, and the far edges now land on its -3.27 plan line)
    rollers: [1.80, 0.90, 0, -0.90, -1.80].map((z) => ({ z, y: 0.90, r: 0.08 })),
    trackW: 0.48, topY: 0.87, botY: 0.055, paintedEnds: true, coveredTop: true, arms: true,
  });
  wheelRecessAt(P, wheelZs, 1.42, 0.42, 0.335, 0.21);

  // ---- turret: wide full-shouldered dome under the K-5 CLAMSHELL ----
  P.turretG.position.set(0, 1.38, 0.15);
  const TH = 0.67;                                                             // crown 2.05 (ref front-view center: 2.06)
  P.add('turret', lathe([
    [1.00, 0.0], [1.15, 0.05], [1.16, 0.16], [1.12, 0.36], [1.00, 0.52],
    [0.78, 0.60], [0.46, 0.645], [0.04, 0.67],
  ], P.q ? 30 : 16, 1.26), 0, 0, 0.02);
  // K-5 clamshell — r3 FULL RE-LAY from the fresh workorder: the wedges sweep
  // OUTWARD-FORWARD (plan edge (x0.40, 1.53w) -> prong (x0.91, 1.84w) — the
  // r2 inward sweep put the tips at center-x where the ref V notch is
  // RECESSED to 1.43-1.60w); tops split LOW inboard (1.975w @ x0.17-0.59) /
  // RAIL outboard (2.145w @ x0.58-0.92 — the ref's 2.159 side plateau);
  // shoulders are ASYMMETRIC (ref front tops: L 1.61 / R 1.904 @ x~1.65).
  // r3-FINAL turret = the r3a layout, byte-restored. LAW BANKED: two
  // controlled experiments (r3b scored 61, r3c 62.9 vs this layout's 72.6)
  // proved the workorder's plan_turret ref reads MISLEAD on this print —
  // its turret-node plan registration (dy -0.05) disagrees with the gate's
  // own row scoring. Do NOT re-cut the clamshell from plan_turret columns.
  // Forward clamshell under HONEST registration (r3f: the r3e hull fixes
  // moved viewReg.side dAlong -0.054 -> 0, and the gate's turretRows score
  // with THAT registration — the ref turret tops read 1.62-1.80w forward of
  // z_w ~0.95, so the prong tops drop to 1.80w and the 2.145w rails stop at
  // z_w 0.95; the tall 2.15-2.18 plateau exists only AFT of there):
  // r3g cliff form: the ref side plateau (2.18w) runs to z_w 1.51 then
  // CLIFFS to 1.62 — rails extend to z_w 1.49 and the prongs beyond the
  // cliff drop to 1.69w.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.60, 0.20, 0.50), s * 0.785, 0.21, 1.32, 0, -s * 0.55, 0);    // K-5 wedge prong (top 1.69w)
    P.add('turretDark', box(0.50, 0.035, 0.44), s * 0.76, 0.325, 1.24, 0, -s * 0.55, 0); // gap seam
    P.add('turret', box(0.42, 0.24, 0.75), s * 0.38, 0.475, 0.90);                     // clam top, inboard LOW course (1.975w)
    // outboard RAIL (2.145w) to the z_w 1.49 cliff: LEFT full width; RIGHT
    // narrowed to x 0.58-0.78 (ref front cols 0.79-0.92 top out at 1.964;
    // stations slice the rails at z 0.95-1.15 — full deletion cost 6 pts)
    if (s < 0) P.add('turret', box(0.34, 0.28, 1.44), -0.75, 0.625, 0.62);
    else P.add('turret', box(0.20, 0.28, 1.44), 0.68, 0.625, 0.62);
    P.add('turretDetail', box(0.32, 0.18, 0.62), s * 1.30, 0.47, -0.10, 0, s * 0.10, 0); // shoulder stowage (top 1.95w)
  }
  // (r3d L tower DELETED in r3f — it was tuned to the skewed registration)
  P.add('turret', box(0.44, 0.44, 1.45), 1.34, 0.30, 0.30, 0, 0.14, 0);        // R shoulder box (front 1.20w)
  P.add('turretDark', box(0.44, 0.05, 0.85), 1.35, 0.53, 0.15, 0, 0.14, 0);
  P.add('turret', box(0.48, 0.44, 1.45), -1.28, 0.30, 0.30, 0, -0.14, 0);      // L shoulder box (r3e: widened to x -1.62 — ref front -1.595 col tops 1.883; ours read the 1.31 fender there)
  P.add('turretDark', box(0.44, 0.05, 0.85), -1.29, 0.53, 0.15, 0, -0.14, 0);
  // L outer plate: top 1.46w (ref -1.676 col tops 1.418) but bottom HELD at
  // 1.36w — LAW (r3b/c/e triple-crash root cause): the turret-node AABB
  // bottom is the gun roll at 1.34w; any turret mass below it re-frames the
  // gate's turretRows camera and skews every column (72->61/63/64).
  P.add('turret', box(0.045, 0.16, 1.09), -1.645, 0.06, -0.09);                // (r3g: top 1.52w — the gate front col -1.64 reads ref 1.61, the workorder said 1.42; split)
  P.add('turret', box(0.045, 0.54, 0.99), 1.645, 0.25, -0.165);                // R outer plate TALL (ref 1.904 top; plan z_w 0.48..-0.51)
  P.add('turretDetail', box(0.40, 0.26, 2.24), 1.36, 0.28, -0.33);             // R flank run LONG (ref plan rear -1.30w @ x1.38)
  P.add('turretDetail', box(0.40, 0.26, 1.48), -1.36, 0.28, 0.05);             // L flank run SHORT (ref rear -0.54w)
  P.add('turret', box(0.50, 0.22, 0.40), 0, 0.47, 1.16, -0.35, 0, 0);          // V apex over the gun (front 1.54w, top 2.02w — ref center notch 1.43-1.60w)
  // commander cupola RIGHT + Utyos NSVT on the AA ring; gunner hatch left
  // (receiver/barrel are the 1-2 spike columns; ring held at the 2.20 line)
  cupola(P, 'turret', 0.52, 0.40, -0.35, 0.22, 0.10, 5);
  P.add('turretDetail', torus(0.30, 0.02, 14), 0.52, 0.63, -0.35);
  // NSVT "Utyos" — §B3 KIT fitting (replaces the r2 hand-authored gun; the
  // receiver top lands 2.18w, inside the ref's 2.15-2.16 Utyos band + grace)
  const utyos = FITTINGS.pintleMG({ mats: P.mats, cls: 'nsvt', tone: 'two-tone', seed: 3 });
  utyos.position.set(0.52, 0.42, -0.32);                                       // foot sunk 0.045 into the lid: receiver ~2.13w (ref side band 2.097 at z -0.13..-0.24; ≤0.4pt MG allowance)
  P.turretG.add(utyos);
  P.add('turret', cylY(0.21, 0.21, 0.04, 14), -0.48, 0.64, -0.30);             // gunner hatch
  P.add('turretDark', cylY(0.215, 0.215, 0.012, 14), -0.48, 0.675, -0.30);
  // 1G46 sight doghouse left of gun + Luna IR right — held at the 2.20 roof
  sightBox(P, 'turret', -0.52, 0.72, 0.26, 0.40, 0.20, 0.40);                  // (r3g: span -0.32..-0.72 — the -0.26 edge still painted the front -0.22 col where ref tops 1.96)
  P.add('turret', box(0.44, 0.045, 0.44), -0.52, 0.822, 0.26);                 // doghouse lid (top 2.225 = heightM p95 anchor with the wings)
  P.add('turretDetail', box(0.26, 0.24, 0.24), 0.55, 0.40, 0.96);
  P.add('turretGlass', box(0.18, 0.16, 0.02), 0.55, 0.40, 1.09);
  // 902 smoke tubes clustered LEFT side, raised to the post-warp cluster
  // line (~2.20 world at the -1.05..-1.45 columns)
  // (r3g RAKE: ref front band 2.18 at x -0.95..-1.11 falling to 1.90 by
  // -1.50 — the flat 2.05 bank was low inboard AND high at the tips)
  for (let k = 0; k < 5; k++) P.add('turretDark', cylZ(0.042, 0.28, 8), -1.02 - k * 0.09, 0.76 - k * 0.05 + (k % 2) * 0.02, 0.48 - k * 0.11, -0.48, -(0.85 + k * 0.12), 0);
  for (let k = 0; k < 4; k++) P.add('turretDark', cylZ(0.042, 0.28, 8), -1.10 - k * 0.09, 0.59 - k * 0.04, 0.24 - k * 0.11, -0.38, -(1.0 + k * 0.14), 0);
  // bustle: transverse OPVT snorkel + stowage band + basket + rails.
  // VERTEX ROUND: the ref bustle hump runs to world -2.25 (band 1.60..1.84
  // post-warp at -2.0..-2.2) — row extended, kit lowered onto it.
  P.add('turretDark', cylX(0.075, 1.55, 10), 0, 0.50, -1.05);
  P.add('turretDark', cylX(0.055, 0.30, 8), 0.88, 0.50, -1.05);
  P.add('turret', box(2.60, 0.46, 0.95), 0, 0.24, -1.60);                      // stowage box row (ends w -1.92: ref bottom lifts past -1.85)
  P.add('turretDark', box(2.45, 0.05, 0.86), 0, 0.49, -1.58);
  P.add('turretCloth', box(1.30, 0.15, 0.80), 0.10, 0.54, -1.45);              // strapped kit on top
  P.add('turretCloth', box(1.20, 0.26, 0.15), 0, 0.60, -1.205);                // snorkel saddle hump (ref side 2.131 @ z_w -1.0..-1.13)
  basket(P, 1.15, -1.96, -2.24, 0.25, 0.46, 0.5);
  P.add('turretDetail', box(0.05, 0.05, 0.72), 0.78, 0.50, -0.95, 0, 0.5, 0);  // grab rails
  P.add('turretDetail', box(0.05, 0.05, 0.72), -0.78, 0.50, -0.95, 0, -0.5, 0);
  P.add('turretDetail', box(0.06, 0.07, 0.06), -0.62, 0.575, -0.85);           // whip base pot ONLY (r3: the r2 stub rod printed 2.31w over the ref's 2.05 line at 3 cols)
  P.decal('turret', 'number', '518', 0.28, [1.05, 0.28, -0.15], Math.PI / 2, 0, 0.1);
  P.decal('turret', 'number', '518', 0.28, [-1.05, 0.28, -0.15], -Math.PI / 2, 0, -0.1);
  // 2A46M-1 at axis 1.66: sealed embrasure roll, sleeve pair, fat evacuator
  // in the sleeve gap, no muzzle brake/MRS.
  P.gunG.position.set(0, 0.13, 0.55);                                          // axis 1.51 (r3 workorder: ref tube band 1.421..1.585 — the r2 1.63 axis rode 0.12 high)
  trunnionRoll(P, 0.17, 0.55, { ballR: 0.145, ballZ: 0.20 });
  P.addGunExtra(box(0.42, 0.42, 0.28), 0, 0.01, 0.28);                         // embrasure block
  P.addGunExtra(cylZ(0.125, 0.30, 12, 0.15), 0, 0, 0.50);                      // root collar
  P.add('turret', box(0.60, 0.14, 0.30), 0, 0.44, 0.98, -0.45, 0, 0);          // brow between the clams (r3: follows the lowered axis)
  // muzzle at REAR+9.65 (dims sovereign — the print's tube is 1.5% short,
  // certified; the normalize plan stretches its barrel zone to match).
  // Right-offset sleeve clamp = the print's asymmetric evac-zone bulge
  // (plan col +0.18 to z 4.09).
  P.addGunExtraDark(cylZ(0.05, 0.50, 8), 0.16, 0.02, 3.15);
  // (r3e fat root-sleeve segment REMOVED — the gun renders into the turret
  // row and the 0.115 band at z 2.6-3.2 moved that row's registration)
  buildGun(P, { len: 5.51, r: 0.068, sleeve: true, evac: 0.47, evacR: 1.45, collar: false, baseR: 0.15 });
  P.topY = 1.15;
}

// ---------------------------------------------------------------------------
// Type 90 — docs/references/tanks/type90.md
// GATE-V9 BESPOKE REBUILD (published dims sovereign; the oracle is certified
// width-under-normalized ~20 % tall/long — curve components capped, packet).
// Envelope: hull 7.45 (−3.70..+3.75), overall 9.76 (muzzle +6.02), width
// 3.43 (skirt faces ±1.715 exactly), height 2.34 (turret roof plateau
// anchor; stowed whip is the single spike column). Replaces the parametric
// kit path whose base build carried a pre-existing articulation floater.
// ---------------------------------------------------------------------------
function buildType90(P) {
  const { box, cylY, cylZ, frustum, slab, torus, buildGun, buildRunningGear,
    fenders, headlight, liftEye, periscope, towCable, stowage } = KIT;
  const { rng } = P;
  // hull: low tub + shallow two-level deck + broad fender shoulders
  P.add('hull', box(2.20, 0.62, 6.60), 0, 0.72, -0.05);
  P.add('hull', frustum(1.58, 3.55, -3.62, 1.52, 3.52, -3.60, 0.92, 1.43));    // sponson band
  P.add('hull', box(3.05, 0.05, 4.30), 0, 1.405, -1.30);                       // main deck
  P.add('hull', box(2.90, 0.05, 1.60), 0, 1.43, 0.75);                         // fore deck step
  P.add('hull', frustum(1.62, 3.60, 1.55, 1.55, 1.58, 1.52, 0.86, 1.42));      // shallow glacis
  P.add('hull', frustum(1.08, 3.30, 3.70, 1.10, 3.70, 3.70, 0.42, 0.86));      // lower nose NARROW below the glacis line (r3 §B4: the 1.60 width sat inside the idler wrap; same columns, dims-safe)
  P.add('hull', box(2.90, 0.42, 0.10), 0, 1.08, -3.66);                        // rear plate
  P.add('hullDark', box(2.10, 0.26, 0.04), 0, 1.10, -3.70);
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(2.0, 0.04, 0.05), 0, 0.99 + k * 0.08, -3.715);
  fenders(P, 1.20, 1.71, 1.12, -3.60, 3.55, 0.028);
  // driver front-right + episcopes
  P.add('hull', cylY(0.25, 0.25, 0.03, 14), 0.58, 1.455, 1.55);
  P.add('hullDark', torus(0.25, 0.012, 14), 0.58, 1.468, 1.55);
  periscope(P, 'hullDetail', 0.40, 1.46, 1.90);
  periscope(P, 'hullDetail', 0.62, 1.46, 1.93);
  // engine deck: louvre field + caps
  P.add('hullDark', box(1.95, 0.018, 1.15), 0, 1.415, -2.45);
  for (let k = 0; k < 6; k++) P.add('hullDetail', box(1.85, 0.022, 0.055), 0, 1.425, -2.90 + k * 0.18);
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.08, 0.08, 0.022, 12), s * 1.30, 1.44, -0.85);
  headlight(P, -1.25, 1.06, 3.62, -0.3);
  headlight(P, 1.25, 1.06, 3.62, -0.3);
  towCable(P, [[-1.10, 1.16, 2.6], [0, 1.30, 2.05], [1.10, 1.16, 2.6]]);
  liftEye(P, 'hullDetail', -1.35, 1.44, -0.3);
  liftEye(P, 'hullDetail', 1.35, 1.44, -0.3);
  // fender bins + mud flaps
  bin(P, -1.42, 1.52, 2.45, 0.34, 0.16, 0.85);
  bin(P, 1.42, 1.52, -1.95, 0.34, 0.16, 0.85);
  for (const s of [-1, 1]) {
    // r3 §B4: flaps hang from the fender line ABOVE the wrap arcs (the
    // low pair sat inside them — 410 of the 499 audited vox)
    mudflap(P, s * 1.43, 0.94, 3.66, 0.52, 0.30);
    mudflap(P, s * 1.40, 1.02, -3.64, 0.52, 0.30);
  }
  P.decal('hull', 'number', '90-2274', 0.22, [-0.85, 1.06, 3.66], 0, -0.15);
  // skirts: WIDTH GUARD — outer faces exactly ±1.715 (3.43)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.05, 0.40, 6.30), s * 1.69, 0.84, 0.0);
    for (let k = 0; k < 6; k++) P.add('hullDark', box(0.056, 0.34, 0.016), s * 1.687, 0.83, 2.6 - k * 1.05);
    P.add('hullDark', box(0.02, 0.06, 6.2), s * 1.68, 0.615, 0.0);
  }
  // 6 wheels, rear sprocket
  const wheelZs = [2.71, 1.63, 0.55, -0.55, -1.63, -2.71];
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.37, wheelW: 0.22, wheelY: 0.45, xc: 1.42,
    wheelZs,
    sprocket: { z: -3.30, y: 0.53, r: 0.31 }, idler: { z: 3.26, y: 0.50, r: 0.29 },
    rollers: [2.15, 1.05, 0, -1.05, -2.15].map((z) => ({ z, y: 0.90, r: 0.08 })),
    trackW: 0.56, topY: 0.88, botY: 0.055, paintedEnds: true, coveredTop: true, arms: true,
  });
  wheelRecessAt(P, wheelZs, 1.42, 0.45, 0.37, 0.22);

  // ---- turret: ten-sided welded shell, narrow throat, parallel bustle ----
  P.turretG.position.set(0, 1.42, -0.18);
  const TH = 0.90;                                                             // roof 2.32
  P.add('turret', KIT.polyTurret([
    [-0.24, 1.13], [0.24, 1.13], [0.97, 0.70], [1.33, 0.18],
    [1.28, -1.56], [0.96, -2.16], [-0.96, -2.16], [-1.28, -1.56],
    [-1.33, 0.18], [-0.97, 0.70],
  ], TH, 1.02, 0.91));
  // lower cheek wedges to the arrow nose
  for (const side of [-1, 1]) {
    P.add('turret', slab(
      [side * 0.21, 0.03, 1.13], [side * 1.33, 0.03, 0.23], [side * 1.33, 0.03, -0.22], [side * 0.21, 0.03, 0.71],
      [side * 0.21, TH * 0.74, 0.70], [side * 1.20, TH * 0.60, 0.06], [side * 1.21, TH * 0.68, -0.34], [side * 0.21, TH * 0.86, 0.43]));
    P.add('turretDetail', box(0.21, 0.28, 1.34), side * 1.21, 0.34, -1.32);    // bustle stowage run
    P.add('turretDetail', box(0.05, 0.05, 1.65), side * 1.30, 0.27, -1.20);    // side rail (fused to the run)
  }
  // autoloader bustle + roof panels + rear rack (solid, floater-safe)
  P.add('turret', box(2.02, TH * 0.72, 1.36), 0, TH * 0.41, -1.51);
  for (let i = 0; i < 3; i++) P.add('turretDark', box(0.56, 0.03, 0.60), (i - 1) * 0.64, TH + 0.018, -1.34);
  P.add('turretDetail', box(2.28, 0.045, 0.045), 0, TH * 0.58, -2.40);
  P.add('turretDetail', box(2.28, 0.045, 0.045), 0, 0.16, -2.40);
  for (let i = 0; i < 9; i++) P.add('turretDetail', box(0.026, TH * 0.42, 0.026), -1.01 + i * 0.2525, TH * 0.37, -2.40);
  P.add('turretDark', box(2.0, 0.016, 0.5), 0, 0.20, -2.14);
  stowage(P, 'turretCloth', rng, [[-0.5, 0.36, -2.05, 0.8, 0.3, 0.4], [0.55, 0.34, -2.08, 0.7, 0.28, 0.38]]);
  // mantlet throat + gunner primary sight (right), kept at the roofline
  P.add('turretDark', box(0.46, TH * 0.48, 0.14), 0, TH * 0.45, 0.86);
  P.add('turretDetail', box(0.34, 0.30, 0.28), 0.53, TH * 0.70, 0.26);
  P.add('turretGlass', box(0.22, 0.12, 0.025), 0.53, TH * 0.73, 0.41);
  sightBox(P, 'turret', 0.52, TH - 0.08, 0.42, 0.36, 0.14, 0.22);              // commander sight (top 2.31)
  // hatches
  P.add('turret', cylY(0.24, 0.24, 0.04, 14), -0.50, TH + 0.005, -0.24);
  P.add('turret', cylY(0.21, 0.21, 0.036, 14), 0.50, TH + 0.005, -0.55);
  periscope(P, 'turretDetail', -0.28, TH + 0.045, 0.05);
  // center M2 — §B3 KIT fitting (receiver ~2.42w; the stowed-whip spike
  // stays the heightM p95 anchor, so dims hold at the baseline 98.7)
  const m2 = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', scale: 0.85, seed: 9 });
  m2.position.set(0, 0.61, -0.50);                                             // receiver rides AT the published 2.34 roofline — its 8-col run at 2.42 pushed heightM p95 to 2.39
  P.turretG.add(m2);
  // stowed whip: the single spike column
  P.add('turretDetail', box(0.06, 0.12, 0.06), 0.80, TH + 0.04, -1.56);
  P.add('turretDetail', box(0.022, 0.36, 0.022), 0.80, TH + 0.26, -1.56);
  for (const s of [-1, 1]) {
    KIT.smokeCluster(P, s * 1.14, TH * 0.52, 0.0, 3, s * 1.12, 0.55);
    liftEye(P, 'turretDetail', s * 0.95, TH + 0.015, 0.4, s * 0.4);
  }
  P.decal('turret', 'number', '2274', 0.26, [1.10, 0.35, -0.8], Math.PI / 2, 0, 0.05);
  P.decal('turret', 'number', '2274', 0.26, [-1.10, 0.35, -0.8], -Math.PI / 2, 0, -0.05);
  // Rh 120 L/44: axis 1.82, muzzle +6.02 (overall 9.76 from tail −3.74)
  P.gunG.position.set(0, 0.40, 0.0);
  trunnionRoll(P, 0.19, 0.56);
  P.addGunExtra(box(0.50, 0.38, 0.24), 0, 0.01, 0.70);                         // mantlet block
  P.addGunExtra(cylZ(0.125, 0.28, 12, 0.15), 0, 0, 0.92);                      // root collar
  P.addGunExtraDark(cylZ(0.026, 0.10, 8), 0.25, 0.06, 0.80);                   // coax port
  buildGun(P, { len: 6.32, r: 0.079, sleeve: true, evac: 0.49, evacR: 1.9, collar: true, baseR: 0.16 });
  P.topY = 1.2;
}

// ---------------------------------------------------------------------------
// Type 74 — docs/references/tanks/type74.md
// hull 6.7, width 3.18, LOW deck 1.25, cast dome roof ~2.04, cupola 2.25;
// gun axis ~1.72, muzzle bow+2.71; 5 BIG wheels, NO return rollers, no
// skirts, rear sprocket, dead-track sag; searchlight left of mantlet.
// ---------------------------------------------------------------------------
function buildType74(P) {
  const { box, cylY, cylX, cylZ, frustum, slab, lathe, torus, buildGun, buildRunningGear,
    fenders, headlight, liftEye, periscope, towCable, stowage, shovelTool, cupola } = KIT;
  const { rng } = P;
  const halfL = 3.35;
  // LOW hull: tub between the tracks + sponson overhang, sharp glacis with
  // a center crease, sloped rear deck (deck raised r2 to the oracle band)
  P.add('hull', box(1.95, 0.54, 6.45), 0, 0.60, -0.05);
  P.add('hull', frustum(1.59, 3.10, -3.32, 1.55, 3.06, -3.30, 0.94, 1.32));    // sponson band (r3: bottom 0.94 — 0.90 grazed the dilated idler-wrap crown, §B4)
  P.add('hull', box(3.02, 0.04, 4.10), 0, 1.305, -0.80);                       // deck
  // glacis: two yawed half-plates form the shallow center crease.
  // r3 §B4 (SEVERE pre-build flag 370/260): the lower edge TAPERS to x ±1.02
  // — type74 has NO skirts, so the exposed idler wrap (x 1.04..1.63) owns
  // the outboard corner; the old full-width 1.59 edge sat inside the arc.
  for (const s of [-1, 1]) {
    P.add('hull', slab(
      [s * 0.02, 0.55, 3.34], [s * 0.98, 0.60, 3.14], [s * 0.98, 0.90, 3.18], [s * 0.02, 0.82, 3.36],
      [s * 0.02, 1.32, 1.18], [s * 1.55, 1.32, 1.10], [s * 1.55, 1.32, 1.06], [s * 0.02, 1.32, 1.14]));
  }
  P.add('hull', frustum(0.96, 3.12, 3.35, 0.98, 3.35, 3.35, 0.40, 0.72));      // lower nose NARROW (x <= 0.98, §B4) + tall enough (0.32 band) to be the hullLength front BODY anchor at 3.35
  P.add('hull', slab(                                                          // sloped rear deck
    [-1.55, 1.05, -1.55], [1.55, 1.05, -1.55], [1.45, 1.05, -3.30], [-1.45, 1.05, -3.30],
    [-1.52, 1.32, -1.55], [1.52, 1.32, -1.55], [1.42, 1.10, -3.30], [-1.42, 1.10, -3.30]));
  P.add('hull', box(2.00, 0.44, 0.10), 0, 0.80, -3.33);                        // tail plate, NARROW below the wrap line (§B4)
  P.add('hull', box(2.86, 0.24, 0.10), 0, 0.90, -3.33);                        // tail plate, wide upper course (bottom 0.78 clears the sprocket wrap)
  fenders(P, 1.04, 1.58, 1.35, -3.30, 3.15, 0.028);
  // driver LEFT: flush hatch + periscopes on the glacis top
  P.add('hull', cylY(0.24, 0.24, 0.035, 14), -0.52, 1.33, 0.85);
  P.add('hullDark', cylY(0.246, 0.246, 0.012, 14), -0.52, 1.325, 0.85);
  periscope(P, 'hullDetail', -0.52, 1.36, 1.12);
  periscope(P, 'hullDetail', -0.24, 1.36, 1.12);
  // rear deck louvres + twin exhaust outlets with mesh
  for (let k = 0; k < 4; k++) P.add('hullDark', box(2.20, 0.016, 0.10), 0, 1.26 - k * 0.028, -1.95 - k * 0.44, 0.12, 0, 0);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.42, 0.16, 0.85), s * 1.28, 1.23, -2.35);
    P.add('hullDark', box(0.36, 0.05, 0.72), s * 1.28, 1.315, -2.35);
    P.add('hullDark', box(0.10, 0.10, 0.04), s * 1.10, 0.96, -3.36);           // taillights
    // r3 §B4: flaps hang from the FENDER TIPS above the exposed wrap arcs —
    // the old low flaps sat inside them (front 370 / rear 260 exact vox)
    mudflap(P, s * 1.31, 1.19, -3.33, 0.52, 0.28);
    mudflap(P, s * 1.31, 1.19, 3.17, 0.52, 0.28);
    P.add('hullDetail', torus(0.08, 0.015, 10), s * 0.55, 0.54, 3.31, Math.PI / 2, 0, 0); // tow eyes
    // rear-view MIRROR arms folded low over the front fenders (the re-
    // rigged print reads its mirror heads at the fender line, not raised)
    P.add('hullDetail', box(0.035, 0.24, 0.035), s * 1.42, 1.47, 2.62, 0, 0, s * 0.30);
    P.add('hullDark', box(0.16, 0.20, 0.03), s * 1.475, 1.52, 2.62);
    // whip antennas: the print's spikes read at x +-0.95 (front) / one
    // body-relative column aft of midships — matched as 1-col rods
    P.add('hullDetail', box(0.05, 0.06, 0.05), s * 0.95, 1.32, -1.05);
    P.add('hullDetail', box(0.022, 1.52, 0.022), s * 0.95, 2.12, -1.05, 0, 0, s * 0.02);
  }
  // fender stowage bins + tools + headlight pods with guards
  bin(P, -1.30, 1.43, -0.95, 0.42, 0.16, 1.05);
  bin(P, 1.30, 1.43, -0.60, 0.42, 0.16, 0.90);
  bin(P, 1.30, 1.43, 1.30, 0.42, 0.16, 0.80);
  shovelTool(P, -1.28, 1.38, 1.4);
  headlight(P, -1.22, 1.41, 3.05, -0.25, 0.052);
  headlight(P, 1.22, 1.41, 3.05, -0.25, 0.052);
  P.add('hullDetail', torus(0.075, 0.012, 12), -1.22, 1.41, 3.12);
  P.add('hullDetail', torus(0.075, 0.012, 12), 1.22, 1.41, 3.12);
  towCable(P, [[-1.05, 1.14, 2.55], [0, 1.30, 2.05], [1.05, 1.14, 2.55]]);
  liftEye(P, 'hullDetail', -1.35, 1.33, -1.4);
  liftEye(P, 'hullDetail', 1.35, 1.33, -1.4);
  P.decal('hull', 'number', '74-4302', 0.22, [-0.85, 0.97, 3.19], 0, -0.18);
  // FIVE big exposed wheels, dead track (no rollers), rear sprocket
  const wheelZs = [2.30, 1.15, 0, -1.15, -2.30];
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.42, wheelW: 0.25, wheelY: 0.475, xc: 1.315,
    wheelZs,
    sprocket: { z: -2.96, y: 0.50, r: 0.29 }, idler: { z: 2.92, y: 0.48, r: 0.28 },
    rollers: [], trackW: 0.55, topY: 1.00, botY: 0.055, deadSag: 0.09,
    paintedEnds: true, coveredTop: false, arms: true,
  });
  wheelRecessAt(P, wheelZs, 1.315, 0.475, 0.42, 0.25);

  // ---- turret: low cast dome with heavily sloped sides flowing into a
  // long tapered bustle (STB-1 lineage) ----
  P.turretG.position.set(0, 1.42, -0.05);
  P.add('turret', lathe([
    [1.05, 0.0], [1.12, 0.10], [1.07, 0.28], [0.94, 0.46], [0.70, 0.60],
    [0.38, 0.68], [0.02, 0.71],
  ], P.q ? 30 : 16, 1.50), 0, 0.0, -0.18);                                     // main dome (crown 2.13)
  P.add('turret', frustum(0.84, -0.85, -2.00, 0.58, -0.95, -1.90, 0.06, 0.46)); // bustle taper
  P.add('turret', box(1.16, 0.32, 0.58), 0, 0.15, -1.58);                      // bustle underside fill
  // commander cupola RIGHT with M2 pintle; low oval loader hatch LEFT
  cupola(P, 'turret', 0.42, 0.66, -0.38, 0.20, 0.13, 6);
  // commander's M2 — §B3 KIT fitting on the cupola lid (receiver ~2.47w:
  // the p95 heightM anchor stays at the published 2.48 line)
  const m2 = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', seed: 7 });
  m2.position.set(0.46, 0.76, -0.40);                                          // foot raised: receiver ~2.50w, p95 anchor at the published 2.48
  P.turretG.add(m2);
  P.add('turret', cylY(0.185, 0.20, 0.05, 14), -0.42, 0.60, -0.30);            // loader ring
  P.add('turret', cylY(0.16, 0.16, 0.026, 14), -0.42, 0.655, -0.30);           // lid
  P.add('turretDark', box(0.30, 0.013, 0.03), -0.42, 0.672, -0.30);            // lid seam
  periscope(P, 'turretDetail', 0.20, 0.70, 0.30);                              // gunner periscope
  periscope(P, 'turretDetail', -0.42, 0.685, -0.02, 0.3);
  // big searchlight box LEFT of the mantlet + yoke
  P.add('turret', box(0.44, 0.36, 0.40), -0.62, 0.38, 0.96, 0, 0.08, 0);
  P.add('turretDark', box(0.36, 0.28, 0.03), -0.62, 0.38, 1.175, 0, 0.08, 0);
  P.add('turretGlass', box(0.30, 0.22, 0.016), -0.62, 0.38, 1.19, 0, 0.08, 0);
  P.add('turretDetail', box(0.035, 0.12, 0.035), -0.62, 0.15, 0.92);
  // dome grab rails + lifting eyes
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.02, 0.02, 0.90), s * 1.06, 0.24, -0.45);
    for (const dz of [-0.80, -0.10]) P.add('turretDetail', box(0.05, 0.016, 0.016), s * 1.03, 0.24, -0.45 + dz + 0.35);
    liftEye(P, 'turretDetail', s * 0.76, 0.55, 0.25, s * 0.4);
  }
  P.decal('turret', 'number', P.spec.visual.number || '74', 0.26, [0.94, 0.26, -0.35], Math.PI / 2, 0, 0.08);
  P.decal('turret', 'number', P.spec.visual.number || '74', 0.26, [-0.94, 0.26, -0.35], -Math.PI / 2, 0, -0.08);
  // L7A1 105 mm: rounded cast saddle, bare rifled tube with a fat mid-tube
  // fume extractor, no sleeve, small muzzle step.
  P.gunG.position.set(0, 0.32, 0.55);
  trunnionRoll(P, 0.185, 0.56, { ballR: 0.16, ballZ: 0.20 });
  P.addGunExtra(cylZ(0.155, 0.26, 12, 0.13), 0, 0, 0.30);                      // cast collar taper
  P.addGunExtraDark(cylZ(0.024, 0.09, 8), 0.24, 0.05, 0.22);                   // coax port
  P.add('turret', box(0.56, 0.15, 0.30), 0, 0.62, 0.96, -0.50, 0, 0);          // cast brow
  buildGun(P, { len: 5.72, r: 0.062, sleeve: false, evac: 0.52, evacR: 2.05, collar: false, baseR: 0.14 });
  P.add('gun', cylZ(0.068, 0.09, 10), 0, 0, 5.66);                             // muzzle step
  P.topY = 1.15;
}

// ---------------------------------------------------------------------------
// Profiles. ariete/leclerc/t80u/type74 override their canonical builders
// (family-map entries win per id); type90 keeps the parametric kit path with
// a bespoke surface pass on top; recon_tank is unchanged.
// ---------------------------------------------------------------------------
export const MISC_PROFILES = {
  recon_tank: {
    // spec dims are sovereign: hull 6.2, overall 7.2, height 2.5, width 3.0
    hull: 'ifv', width: 3.0, hullLength: 6.2, roofY: 1.62, trackTop: 0.66, trackW: 0.40, wheels: 5, skirts: true,
    turret: 'ifv', turretWidth: 1.60, turretDepth: 1.70, turretHeight: 0.93, turretFront: 0.68, turretRear: -0.85, gunLength: 4.44, gunRadius: 0.035, sleeve: false, evac: null, pano: false, mg: false, smoke: false, antennas: false,
  },
  type90: { build: buildType90 },
  ariete: { build: buildAriete },
  leclerc: { build: buildLeclerc },
  t80u: { build: buildT80U },
  type74: { build: buildType74 },
};
