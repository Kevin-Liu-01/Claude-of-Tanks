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
import { KIT, buildProfile, WESTERN } from './kit.js';
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
  P.add('hull', box(2.35, 0.55, 7.18), 0, 0.67, -0.02);
  P.add('hull', frustum(1.66, 3.72, -3.70, 1.62, 3.70, -3.68, 0.95, 1.45));
  P.add('hull', box(3.20, 0.05, 5.00), 0, 1.425, -1.20);                       // deck plate
  P.add('hull', frustum(1.66, 3.795, 1.32, 1.48, 1.36, 1.26, 0.98, 1.45));     // long upper glacis
  P.add('hull', frustum(1.50, 3.24, 3.795, 1.66, 3.795, 3.795, 0.44, 0.98));   // raked lower bow
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
  P.add('hullDark', box(0.24, 0.32, 0.50), -1.62, 1.02, -2.95);
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.032, 0.27, 0.38), -1.755, 1.02, -3.08 + k * 0.13);
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
      P.add('hullDark', box(0.05, 0.44, 0.018), s * 1.77, 0.87, z - 0.45);
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
    fenders, headlight, liftEye, periscope, towCable, stowage, jerryCan, ammoCan, spareTrackStrip } = KIT;
  const { rng } = P;
  // hull: compact tub, vertical band, single-plane glacis. VERTEX ROUND
  // (2026-08-03 workorder): ref deck edge reads ±1.68 at 1.60 and the
  // engine run tops 1.618 (the old raised 1.74 run was a misread) — band
  // widened, run flattened, fenders split into a deck-edge plane plus
  // front flares (ref plan carries full width ONLY over the front blocks).
  P.add('hull', box(2.35, 0.95, 6.55), 0, 0.735, 0);                           // tub (ref belly reads 0.27)
  P.add('hull', frustum(1.70, 3.36, -3.40, 1.68, 3.34, -3.38, 1.02, 1.60));
  P.add('hull', box(3.34, 0.05, 4.55), 0, 1.575, -1.05);                       // fore/mid deck
  P.add('hull', box(2.95, 0.10, 2.15), 0, 1.575, -2.32);                       // engine run (top 1.625)
  P.add('hull', frustum(1.66, 3.50, 1.58, 1.66, 1.60, 1.58, 0.90, 1.60));      // glacis (ref bow tip to ~3.55)
  P.add('hull', frustum(1.66, 3.18, 3.28, 1.66, 3.50, 3.28, 0.48, 0.90));      // lower nose
  P.add('hullDetail', box(2.88, 0.05, 0.08), 0, 1.34, 2.28, -0.32, 0, 0);      // splash ridge
  // (bow tow hooks deleted — any nose furniture at 3.44+ unions with the
  // gun band and drags hullLengthM past grace; certified dims-sovereign
  // trade, ref nose-tip columns stay uncovered)
  fenders(P, 1.24, 1.70, 1.575, -3.42, 2.95, 0.03);                            // deck-edge plane (ref deck line ends ~3.0)
  fenders(P, 1.68, 1.79, 1.41, 1.28, 3.30, 0.03);                              // front flares over the blocks (ref top 1.43)
  // driver LEFT: flush hatch + 3 episcopes
  P.add('hull', cylY(0.27, 0.27, 0.035, 16), -0.60, 1.615, 0.85);
  P.add('hullDark', torus(0.275, 0.014, 16), -0.60, 1.62, 0.85);
  periscope(P, 'hullDetail', -0.82, 1.64, 1.10, -0.3);
  periscope(P, 'hullDetail', -0.60, 1.64, 1.15);
  periscope(P, 'hullDetail', -0.38, 1.64, 1.10, 0.3);
  // skirts: front-third armored blocks + rubber sheet, dark inset lip.
  // STATION LAW (merkava packets): courses are SEGMENTED ~0.45 m — an
  // unbroken axis-aligned box is edge-on invisible to the near/far-clipped
  // station-slice cameras (the gate read the bare track band on every
  // skirt slice: flat 4-6% width rows).
  // VERTEX ROUND: ref stations read w 3.599 ONLY over the front blocks
  // (i9-i13, world z >~1.15) and 3.39-3.40 for the whole rear two-thirds —
  // the rubber sheet sits INBOARD at ±1.70; the sheet band is also deeper
  // (0.53..1.51 vs the old 0.72..1.38).
  for (const s of [-1, 1]) {
    // WIDTH GUARD: front-block outer faces exactly ±1.80 (ref block band
    // hangs 0.86..1.43 — the old full-depth 0.48 bottoms read a phantom
    // curtain in the front rows)
    for (let k = 0; k < 5; k++) {
      P.add('hull', box(0.09, 0.56, 0.42), s * 1.755, 1.145, 1.32 + 0.43 * k);
    }
    for (let k = 0; k < 3; k++) P.add('hullDark', box(0.07, 0.50, 0.016), s * 1.76, 1.15, 2.85 - k * 0.72);
    for (let k = 0; k < 10; k++) {
      P.add('hull', box(0.035, 0.94, 0.41), s * 1.6825, 1.02, -3.10 + 0.421 * k);
    }
    for (let k = 0; k < 5; k++) P.add('hullDark', box(0.03, 0.84, 0.016), s * 1.684, 1.01, 0.72 - k * 0.86);
    P.add('hullDark', box(0.02, 0.06, 6.35), s * 1.688, 0.56, 0.05);
    // rear flaps deleted (the ref rear shows only the sprocket ramp there);
    // front flaps tucked high on the idler ramp band
    mudflap(P, s * 1.41, 0.70, 3.26, 0.50, 0.24);
  }
  // rear plate: grilles + taillights + REAR STOWAGE RACK overhang. r3: the
  // ref's DEEP body ends z -3.30 (12%-filter body rear -3.295) with only
  // the rack shelf band (1.29..1.57, x <= ~0.9) beyond, to -3.63 — plate
  // pulled to face -3.31, rack rails narrowed to +-0.90
  P.add('hull', box(3.00, 0.48, 0.10), 0, 1.30, -3.26);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.64, 0.34, 0.04), s * 0.85, 1.10, -3.295);
    for (let k = 0; k < 4; k++) P.add('hullDetail', box(0.62, 0.04, 0.05), s * 0.85, 0.97 + k * 0.095, -3.30);
    P.add('hullDark', box(0.14, 0.08, 0.05), s * 1.32, 1.36, -3.30);
  }
  // rack ladder held SUB-THRESHOLD: the 1.29 + 1.555 rail pair spanned a
  // 0.30 column band — right at the side 12% filter — and hullLengthM read
  // the rack as BODY (7.19, dims 71.9). Top rail down to 1.50.
  P.add('hullDetail', box(1.80, 0.035, 0.035), 0, 1.50, -3.40);                // rack rails
  P.add('hullDetail', box(1.80, 0.035, 0.035), 0, 1.29, -3.52);
  for (let k = 0; k < 6; k++) P.add('hullDetail', box(0.03, 0.18, 0.14), -0.75 + k * 0.3, 1.40, -3.46);
  stowage(P, 'hullCloth', rng, [[-0.5, 1.395, -3.45, 0.75, 0.17, 0.24], [0.5, 1.39, -3.45, 0.7, 0.16, 0.22]]);
  // engine deck: fan field + louvres + caps (flattened to the 1.62 run)
  P.add('hullDark', box(1.90, 0.018, 1.35), 0, 1.635, -2.30);
  for (let k = 0; k < 7; k++) P.add('hullDetail', box(1.80, 0.024, 0.055), 0, 1.645, -1.75 - k * 0.17);
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.09, 0.09, 0.026, 12), s * 1.30, 1.61, -0.55);
  headlight(P, -1.28, 0.97, 3.32, -0.3);
  headlight(P, 1.28, 0.97, 3.32, -0.3);
  towCable(P, [[-1.10, 1.30, 2.42], [0, 1.44, 1.92], [1.10, 1.30, 2.42]]);
  spareTrackStrip(P, 'hull', 1.26, 1.07, 2.30, 2, -1.1, 0);
  liftEye(P, 'hullDetail', -1.32, 1.63, -0.2);
  liftEye(P, 'hullDetail', 1.32, 1.63, -0.2);
  P.decal('hull', 'number', '6-33', 0.28, [1.80, 0.95, 2.5], Math.PI / 2);
  P.decal('hull', 'number', '6-33', 0.28, [-1.80, 0.95, 2.5], -Math.PI / 2);
  // 6 wheels, FRONT idler / REAR sprocket, 5 rollers. r3 VERTEX re-lay: the
  // ref FLAT contact patch is [-2.52, 1.97] (wheel centers [-2.16, 1.61])
  // with long climbing ramps to HIGH end wheels (front ramp to ~0.88 bottom
  // at 3.49, rear to ~0.83 at -3.25). The skirts now sit inboard at 1.70 so
  // the high end wraps no longer merge into body columns — bodyLen measures
  // [-3.31 plate .. +3.6 hooks/idler] = 6.9 inside the 1% dims grace.
  const wheelZs = [1.61, 0.856, 0.102, -0.652, -1.406, -2.16];
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.36, wheelW: 0.22, wheelY: 0.45, xc: 1.28,
    wheelZs,
    // idler far edge held INSIDE +-3.36 (round-3 law: the pad-wrapped end
    // merges with body columns past ~3.40 and hullLengthM read 7.19); the
    // ref's outer ramp columns stay uncovered — documented dims trade
    sprocket: { z: -3.06, y: 1.02, r: 0.24 }, idler: { z: 2.94, y: 0.96, r: 0.26 },
    rollers: [1.60, 0.75, -0.1, -0.95, -1.80].map((z) => ({ z, y: 0.88, r: 0.08 })),
    trackW: 0.66, topY: 0.90, botY: 0.055, paintedEnds: true, coveredTop: true, arms: true,
  });
  wheelRecessAt(P, wheelZs, 1.28, 0.45, 0.36, 0.22);

  // ---- turret: tall narrow autoloader block — vertical narrow front,
  // angled cheeks, parallel slabs, cheek armor boxes + side baskets.
  // VERTEX ROUND (2026-08-03 workorder): the ref roof is NOT flat — it
  // slopes 2.40 at the cheeks down to ~2.26 at the bustle end; the mantlet
  // reads as a DEEP turret-frame chin (band down to y 1.26 out to world z
  // ~1.57); the HL-70 head sits forward at world z 0.78..1.15; the print
  // carries its pano head at the LEFT-REAR (top ~2.50 post-warp), the
  // crosswind mast column at world -1.0 (top 2.54 post-warp) and NO raised
  // whips. Furniture tops target the POST-WARP print (normalize plan in
  // tools/vertex-normalize.mjs).
  P.turretG.position.set(0, 1.60, -0.10);
  const LH = 0.80;                                                             // front roof 2.40
  const RH = 0.66;                                                             // bustle-end roof 2.26
  const roofAt = (z) => (z >= -0.15 ? LH : Math.max(RH, LH + (z + 0.15) * 0.067));
  P.add('turret', frustum(1.30, -0.12, -1.95, 1.24, -0.15, -1.92, 0.0, RH - 0.02)); // rear/autoloader box
  P.add('turret', slab(                                                        // bustle tail: floor rises to the thin shelf
    [-1.26, 0.0, -1.92], [1.26, 0.0, -1.92], [1.24, 0.28, -2.24], [-1.24, 0.28, -2.24],
    [-1.26, RH - 0.02, -1.92], [1.26, RH - 0.02, -1.92], [1.24, RH - 0.02, -2.24], [-1.24, RH - 0.02, -2.24]));
  P.add('turret', slab(                                                        // sloped aft roof wedge
    [-1.28, RH - 0.03, -0.13], [1.28, RH - 0.03, -0.13], [1.26, RH - 0.03, -2.24], [-1.26, RH - 0.03, -2.24],
    [-1.24, LH, -0.15], [1.24, LH, -0.15], [1.24, RH, -2.21], [-1.24, RH, -2.21]));
  P.add('turret', slab(                                                        // right angled cheek
    [0.33, 0, 1.12], [1.30, 0, -0.10], [1.30, 0, -0.5], [0.33, 0, 0.68],
    [0.31, LH, 1.02], [1.24, LH, -0.16], [1.24, LH, -0.5], [0.31, LH, 0.58]));
  P.add('turret', slab(                                                        // left angled cheek
    [-1.30, 0, -0.10], [-0.33, 0, 1.12], [-0.33, 0, 0.68], [-1.30, 0, -0.5],
    [-1.24, LH, -0.16], [-0.31, LH, 1.02], [-0.31, LH, 0.58], [-1.24, LH, -0.5]));
  P.add('turret', box(0.64, LH, 0.55), 0, LH / 2, 0.85);                       // narrow front face
  // DEEP turret-frame mantlet chin + cheek fills (ref band 1.26..2.23 world
  // over z 0.72..1.57 — the old build hung all this mass on the gun node
  // and the turret rows read a void under the axis)
  P.add('turret', box(1.24, 0.54, 0.56), 0, -0.07, 1.10);                      // chin block
  P.add('turret', box(0.78, 0.44, 0.30), 0, -0.10, 1.50);                      // chin taper forward
  for (const s of [-1, 1]) P.add('turret', box(0.34, 0.42, 0.60), s * 0.45, 0.24, 1.06); // cheek fills beside sleeve
  // FORWARD CHEEK WEDGES: the ref turret plan reaches z ~2.2 world across
  // |x| <= 1.5 (side band 1.55..2.24 over z 1.6..2.3) — the cheek armor
  // sweeps far forward over the glacis as a dropping wedge pair
  P.add('turret', slab(
    [0.05, -0.05, 2.32], [1.50, -0.05, 1.42], [1.50, -0.05, 0.42], [0.05, -0.05, 0.98],
    [0.05, 0.62, 1.97], [1.24, 0.62, 1.30], [1.24, 0.62, 0.30], [0.05, 0.62, 0.75]));
  P.add('turret', slab(
    [-1.50, -0.05, 1.42], [-0.05, -0.05, 2.32], [-0.05, -0.05, 0.98], [-1.50, -0.05, 0.42],
    [-1.24, 0.62, 1.30], [-0.05, 0.62, 1.97], [-0.05, 0.62, 0.75], [-1.24, 0.62, 0.30]));
  // forward side ARMOR CHEEK BOXES + midships stowage baskets. r3: boxes
  // held to 1.585 outer (the 1.52-yawed corner poked the 1.65+ plan
  // columns), baskets inboard at 1.545, plus the ref's LOW outer applique
  // plates (band ~1.2..1.7 world at x -> 1.65, z 0.17..0.79)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.20, 0.58, 1.25), s * 1.485, 0.33, 0.18);
    P.add('turretDark', box(0.21, 0.10, 1.15), s * 1.49, 0.66, 0.16);
    P.add('turret', box(0.045, 0.45, 0.62), s * 1.63, -0.15, 0.48);            // low outer applique
    P.add('turretDetail', box(0.045, 0.045, 1.30), s * 1.545, 0.36, -1.15);    // basket rails
    P.add('turretDetail', box(0.045, 0.045, 1.30), s * 1.545, 0.02, -1.15);
    for (let k = 0; k < 5; k++) P.add('turretDetail', box(0.03, 0.34, 0.03), s * 1.545, 0.19, -0.62 - k * 0.26);
    stowage(P, 'turretCloth', rng, [[s * 1.44, 0.20, -1.15, 0.20, 0.28, 1.05]]);
  }
  // roof: HL-70 armored sight head FORWARD-right (ref band world z
  // 0.78..1.15, top 2.50 post-warp)
  sightBox(P, 'turret', 0.55, LH + 0.04, 1.05, 0.40, 0.16, 0.42);
  P.add('turret', box(0.46, 0.04, 0.48), 0.55, LH + 0.10, 1.05);
  P.add('turretDark', box(0.90, 0.014, 1.15), 0, roofAt(-1.48) + 0.008, -1.48, -0.0717, 0, 0); // autoloader panel field (rides the roof pitch)
  for (let k = 0; k < 4; k++) P.add('turretDetail', box(0.85, 0.018, 0.02), 0, roofAt(-1.08 - k * 0.30) + 0.012, -1.08 - k * 0.30);
  // commander (left) + gunner (right) hatches on the sloped roof
  P.add('turret', cylY(0.22, 0.22, 0.045, 14), -0.56, roofAt(-0.55) + 0.02, -0.55);
  P.add('turretDark', box(0.38, 0.012, 0.03), -0.56, roofAt(-0.55) + 0.07, -0.55);
  P.add('turret', cylY(0.20, 0.20, 0.04, 14), 0.58, roofAt(-0.90) + 0.02, -0.90);
  // 7.62 ANF1 pintle at the gunner ring (decoration law: roof MG mandatory;
  // tops held at the 2.54 post-warp mast line so no new top columns appear)
  P.add('turretDark', cylY(0.024, 0.028, 0.12, 8), 0.74, roofAt(-0.85) + 0.06, -0.85);
  P.add('turretDark', box(0.07, 0.09, 0.34), 0.74, roofAt(-0.85) + 0.125, -0.77);
  P.add('turretDark', cylZ(0.017, 0.40, 8), 0.74, roofAt(-0.85) + 0.135, -0.46, -0.04, 0, 0);
  P.add('turretDetail', box(0.05, 0.10, 0.12), 0.65, roofAt(-0.85) + 0.10, -0.81);
  periscope(P, 'turretDetail', -0.35, roofAt(-0.28) + 0.05, -0.28, 0.3);
  periscope(P, 'turretDetail', 0.42, roofAt(-0.58) + 0.05, -0.58);
  // HL-15 panoramic LEFT-REAR: thin pedestal + small head (fresh workorder:
  // ref head column at world -1.59..-1.70, top 2.50 post-warp)
  P.add('turretDetail', cylY(0.055, 0.06, 0.10, 10), -0.55, roofAt(-1.55) + 0.05, -1.55);
  P.add('turretDark', box(0.20, 0.12, 0.22), -0.55, 0.84, -1.55);
  P.add('turretGlass', box(0.13, 0.06, 0.018), -0.55, 0.85, -1.43);
  // crosswind mast + whip base: the print carries TWO spike columns at
  // x ±1.0, both at world z -0.93 (front view tops 3.06 both sides;
  // post-warp 2.54)
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.028, 0.46, 0.028), s * 1.05, 0.70, -0.83);
    P.add('turretDark', box(0.05, 0.05, 0.05), s * 1.05, 0.915, -0.83);
  }
  P.add('turretDetail', box(0.20, 0.10, 0.16), 0.05, 0.82, -1.75);             // antenna pot pair (top 2.47)
  P.add('turretDetail', cylY(0.03, 0.035, 0.12, 8), 0.05, roofAt(-1.75), -1.75);
  // whips STOWED along the bustle roof (the print carries no raised spikes)
  P.add('turretDetail', box(0.022, 0.022, 0.62), 0.95, roofAt(-1.85) + 0.03, -1.72);
  P.add('turretDetail', box(0.022, 0.022, 0.62), -0.95, roofAt(-1.85) + 0.03, -1.72);
  // GALIX splays on both rear corners
  galixBank(P, 1.24, 0.58, -1.62, 1, 5, 2);
  galixBank(P, -1.24, 0.58, -1.62, -1, 5, 2);
  // rear bustle rack: the ref tail overhang is a THIN TOP SHELF (band
  // 2.05..2.21 world at -2.3, mask ends -2.32) — not a deep cage
  basket(P, 1.18, -1.96, -2.22, 0.44, 0.60, 0.4);
  jerryCan(P, 'turretCloth', 1.00, 0.46, -2.08, -0.2);
  ammoCan(P, 'turretDark', -1.05, 0.44, -2.08, 0.25);
  P.add('turretDetail', box(0.10, 0.03, 0.16), -0.95, LH + 0.015, 0.30);       // flush lifting lugs
  P.add('turretDetail', box(0.10, 0.03, 0.16), 0.95, LH + 0.015, 0.30);
  P.decal('turret', 'number', '33', 0.30, [1.30, 0.35, -1.0], Math.PI / 2);
  P.decal('turret', 'number', '33', 0.30, [-1.30, 0.35, -1.0], -Math.PI / 2);
  // CN120-26 L/52 seated LOW (axis 1.93); the moving mantlet plate stays on
  // the gun, the deep housing above is turret-frame (chin blocks above)
  P.gunG.position.set(0, 0.33, 0.50);
  trunnionRoll(P, 0.21, 0.68);
  P.addGunExtra(box(0.92, 0.64, 0.85), 0, 0.05, 0.55);                         // moving mantlet plate (top 2.28)
  P.addGunExtra(box(0.56, 0.44, 0.40), 0, 0.02, 1.02);                         // collar block (world z 1.22..1.62)
  P.addGunExtra(cylZ(0.13, 0.30, 12, 0.15), 0, 0, 1.38);
  P.addGunExtraDark(cylZ(0.028, 0.10, 8), 0.34, 0.10, 0.44);                   // coax port
  P.add('turret', box(0.68, 0.14, 0.30), 0, 0.62, 0.98, -0.40, 0, 0);          // brow
  buildGun(P, { len: 5.88, r: 0.076, sleeve: true, evac: 0.52, evacR: 1.85, collar: true, baseR: 0.16 });
  P.topY = LH + 0.55;
}

// ---------------------------------------------------------------------------
// T-80U — docs/references/tanks/t80u.md
// hull 7.01, width 3.60, deck 1.38, dome crown 2.20 with clamshell K-5 arc
// reading ~2.9 wide, roof furniture to ~2.7; gun axis 1.66, muzzle
// bow+2.7; 6 small dished wheels, rear sprocket; turbine exhaust box rear.
// ---------------------------------------------------------------------------
function buildT80U(P) {
  const { box, cylY, cylX, cylZ, frustum, lathe, torus, buildGun, buildRunningGear,
    fenders, headlight, liftEye, periscope, towCable, stowage, spareTrackStrip, cupola } = KIT;
  const { rng } = P;
  const D2R = Math.PI / 180;
  // pancake hull. VERTEX ROUND (2026-08-03 workorder): the ref deck plateau
  // ends ~z 2.45 and the glacis crest line runs (2.67, 1.22) -> (3.43, 0.76)
  // — the old deck band carried the 1.38 plateau out to 2.94 and read +0.17
  // tall across the whole nose; rear deep content ends by z -3.31 with only
  // a thin fender lip beyond (to -3.53).
  P.add('hull', box(2.40, 0.82, 6.60), 0, 0.565, -0.08);                       // tub (ref belly reads ~0.16)
  P.add('hull', frustum(1.70, 3.00, -3.34, 1.48, 2.42, -2.95, 1.06, 1.38));    // tapered deck band (ref deck ends ~-2.95)
  fenders(P, 1.30, 1.70, 1.26, -3.44, 3.24, 0.032);                            // fender plane (ref lip 1.29, ends ~3.28)
  fenders(P, 1.68, 1.79, 1.26, -2.95, 3.24, 0.032);                            // outer strip over the skirt run
  P.add('hull', frustum(1.62, 3.48, 1.95, 1.66, 2.42, 1.95, 0.70, 1.36));      // glacis to the measured crest line
  P.add('hull', frustum(1.62, 3.14, 3.20, 1.62, 3.48, 3.20, 0.42, 0.70));      // blunt lower nose
  // (r5: bow mudguard tips deleted — the ref's 1.4-1.7 band at z~3.5 is
  // GUN-node sleeve content, its hull row is NONE above the ramp there)
  // K-5 glacis wedge raft: 3 courses re-laid on the measured plate slope
  // (r3: thinner — the ref wedge faces ride only ~0.08 proud of the plate)
  for (let row = 0; row < 3; row++) for (let c = 0; c < 5; c++) {
    const y = 0.82 + row * 0.145;
    const z = 3.26 - row * 0.255;
    P.add(c % 2 ? 'hullDetail' : 'hull', box(0.56, 0.11, 0.17), -1.12 + c * 0.56, y, z, -59 * D2R, 0, 0);
  }
  // driver strip + V splash board (seated on the re-laid plate)
  P.add('hull', box(0.50, 0.05, 0.42), 0, 1.30, 2.10, -1.02, 0, 0);
  periscope(P, 'hullDetail', -0.14, 1.375, 1.78);
  periscope(P, 'hullDetail', 0.14, 1.375, 1.78);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.80, 0.05, 0.08), s * 0.37, 1.20, 2.50, -1.02, s * 0.5, 0);
  // skirts: rubber sheet + armored front panels. Workorder (world frame):
  // outer band 0.62..1.24 tucked under the 1.26-1.29 fender lip; plan run
  // z -2.95..3.36
  for (const s of [-1, 1]) {
    // WIDTH GUARD: outer faces exactly ±1.80. STATION LAW: courses are
    // SEGMENTED ~0.46-0.49 m — an unbroken box is edge-on invisible to the
    // clipped station cameras (this exact sheet cost the even station rows
    // ~5-6% width until r6)
    for (let k = 0; k < 4; k++) {
      P.add('hull', box(0.07, 0.66, 0.47), s * 1.765, 0.90, 1.645 + 0.49 * k);
    }
    for (let k = 0; k < 9; k++) {
      P.add('hull', box(0.035, 0.62, 0.46), s * 1.7825, 0.93, -2.72 + 0.4833 * k);
    }
    for (let k = 0; k < 6; k++) P.add('hullDark', box(0.03, 0.54, 0.018), s * 1.784, 0.92, 3.10 - k * 1.00);
    P.add('hullDark', box(0.02, 0.05, 6.30), s * 1.786, 0.60, 0.20);
    // rear INSET skirt segment: the ref sheet keeps covering the sprocket
    // (side bottom 0.60 out to -3.37) but sits inboard of the ±1.75 plan
    // columns there
    P.add('hull', box(0.03, 0.62, 0.42), s * 1.72, 0.90, -3.16);
    mudflap(P, s * 1.40, 0.62, 3.30, 0.50, 0.26);
    mudflap(P, s * 1.38, 0.62, -3.30, 0.50, 0.24);
  }
  // TURBINE EXHAUST BOX jutting off the rear plate (T-80 tell) + drums + log
  // (r3: whole tail group ends by z -3.38 — the ref's deep rear content
  // stops at -3.31 with ONLY the thin fender lip beyond, to -3.53)
  P.add('hull', box(1.90, 0.55, 0.26), 0, 0.88, -3.23);
  P.add('hullDark', box(1.55, 0.34, 0.05), 0, 0.88, -3.365);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.50, 0.042, 0.05), 0, 0.74 + k * 0.10, -3.375);
  P.add('hullDetail', box(1.70, 0.05, 0.12), 0, 1.18, -3.31);
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.14, 0.14, 0.62, 12), s * 1.05, 0.99, -3.20, 0, 0, s * 0.10);
    P.add('hullDark', cylY(0.145, 0.145, 0.03, 12), s * 1.05, 1.27, -3.22, 0, 0, s * 0.10);
    P.add('hullDark', box(0.05, 0.38, 0.03), s * 1.05, 1.00, -3.28);
  }
  P.add('hullWood', cylX(0.105, 2.05, 10), 0, 0.62, -3.26);                    // log LOW on the plate
  for (const s of [-0.55, 0.55]) P.add('hullDark', cylX(0.112, 0.04, 10), s * 1.6, 0.62, -3.26);
  // engine deck: turbine intake field + louvres + hump
  P.add('hullDark', box(1.70, 0.02, 1.10), 0, 1.392, -2.00);
  for (let k = 0; k < 6; k++) P.add('hullDetail', box(1.60, 0.02, 0.05), 0, 1.40, -1.60 - k * 0.16);
  P.add('hull', box(1.00, 0.07, 0.62), 0.45, 1.42, -1.20);
  P.add('hull', box(0.34, 0.15, 2.05), -1.44, 1.14, -1.9);                     // left fender fuel/stow run
  P.add('hullDark', box(0.35, 0.03, 0.03), -1.44, 1.22, -1.35);
  P.add('hullDark', box(0.35, 0.03, 0.03), -1.44, 1.22, -2.45);
  bin(P, 1.44, 1.17, -1.35, 0.32, 0.18, 0.95);                                 // right fender bin row
  bin(P, 1.44, 1.17, -2.45, 0.32, 0.18, 0.85);
  headlight(P, -1.42, 0.98, 3.06, -0.35, 0.05);
  headlight(P, -1.12, 0.98, 3.10, -0.35, 0.05);
  P.add('hullDetail', torus(0.085, 0.016, 10), -0.55, 0.55, 3.24, Math.PI / 2, 0, 0);
  P.add('hullDetail', torus(0.085, 0.016, 10), 0.55, 0.55, 3.24, Math.PI / 2, 0, 0);
  liftEye(P, 'hullDetail', -1.15, 1.40, 1.5);
  liftEye(P, 'hullDetail', 1.15, 1.40, 1.5);
  towCable(P, [[-1.25, 0.96, 2.85], [-0.35, 0.90, 3.02], [0.50, 0.94, 2.92]]);
  spareTrackStrip(P, 'hull', 1.28, 1.19, 1.30, 2, -1.02, 0);
  P.decal('hull', 'soot', null, 1.0, [0.0, 0.9, -3.42], Math.PI);
  // 6 small dished wheels + 5 skirt-hidden rollers, rear sprocket. VERTEX
  // ROUND: the ref's flat contact patch is SHORT (-2.0..2.24) with long
  // climbing ramps to a HIGH short idler (bottom ~0.58 at z~3.06) and a
  // high sprocket (bottom ~0.62 by z -2.98); track outer face ~1.70.
  const wheelZs = [2.24, 1.392, 0.544, -0.304, -1.152, -2.0];
  buildRunningGear(P, {
    style: 'dished', wheelR: 0.335, wheelW: 0.21, wheelY: 0.42, xc: 1.42, dishR: 0.80,
    wheelZs,
    sprocket: { z: -3.02, y: 0.90, r: 0.24 }, idler: { z: 3.06, y: 0.84, r: 0.26 },
    rollers: [1.80, 0.90, 0, -0.90, -1.80].map((z) => ({ z, y: 0.90, r: 0.08 })),
    trackW: 0.48, topY: 0.87, botY: 0.055, paintedEnds: true, coveredTop: true, arms: true,
  });
  wheelRecessAt(P, wheelZs, 1.42, 0.42, 0.335, 0.21);

  // ---- turret: wide full-shouldered dome under the K-5 CLAMSHELL ----
  P.turretG.position.set(0, 1.38, 0.15);
  const TH = 0.82;                                                             // crown 2.20
  P.add('turret', lathe([
    [1.00, 0.0], [1.15, 0.05], [1.16, 0.16], [1.12, 0.38], [1.02, 0.56],
    [0.80, 0.68], [0.48, 0.77], [0.04, 0.82],
  ], P.q ? 30 : 16, 1.26), 0, 0, 0.02);
  // K-5 clamshell: two stacked wedge courses per cheek meeting in a V over
  // the gun. VERTEX ROUND: the ref V-nose reaches world z ~1.85 (turret
  // node band 1.43..2.18 there post-warp) and the clamshell wings + side
  // shoulder boxes carry plan content out to |x| ~1.70 — the old build
  // stopped the nose at ~1.4 and the shoulders at 1.44.
  for (const s of [-1, 1]) {
    P.add('turret', box(1.44, 0.30, 0.40), s * 0.66, 0.20, 1.06, -0.16, s * 0.58, 0);  // lower clam
    P.add('turretDark', box(1.20, 0.035, 0.36), s * 0.63, 0.375, 1.00, -0.20, s * 0.58, 0); // gap seam
    P.add('turret', box(1.18, 0.22, 0.34), s * 0.58, 0.545, 0.96, -0.26, s * 0.52, 0); // upper clam
    P.add('turretDetail', box(0.06, 0.30, 0.34), s * 1.26, 0.22, 0.44, -0.16, s * 0.58, 0); // end plate
    P.add('turret', box(0.44, 0.48, 1.30), s * 1.34, 0.32, 0.25, 0, s * 0.14, 0);      // side shoulder box
    P.add('turretDark', box(0.44, 0.05, 0.94), s * 1.35, 0.58, 0.07, 0, s * 0.14, 0);
    P.add('turret', box(0.045, 0.28, 1.30), s * 1.63, 0.06, 0.0);                      // LOW outer plate (ref band ~1.3..1.58 to x 1.65)
    P.add('turretDetail', box(0.32, 0.20, 0.62), s * 1.30, 0.60, -0.10, 0, s * 0.10, 0); // shoulder stowage
    P.add('turretDetail', box(0.40, 0.28, 1.60), s * 1.36, 0.30, -0.10, 0, 0, 0);      // flank stowage run aft
  }
  P.add('turret', box(0.44, 0.30, 0.48), 0, 0.60, 1.44, -0.32, 0, 0);          // V apex over the gun (tip ~1.86 world)
  // commander cupola RIGHT + Utyos NSVT on the AA ring; gunner hatch left
  // (receiver/barrel are the 1-2 spike columns; ring held at the 2.20 line)
  cupola(P, 'turret', 0.52, 0.48, -0.35, 0.22, 0.10, 5);
  P.add('turretDetail', torus(0.30, 0.02, 14), 0.52, 0.71, -0.35);
  P.add('turretDark', box(0.09, 0.11, 0.20), 0.60, 0.755, -0.20);              // receiver (top 2.19)
  P.add('turretDark', cylZ(0.024, 0.60, 8), 0.60, 0.775, 0.24, -0.03, 0, 0);   // barrel (under the 2.20 line)
  P.add('turretDark', cylZ(0.037, 0.12, 8), 0.60, 0.785, 0.55, -0.03, 0, 0);   // muzzle booster
  P.add('turretDetail', box(0.10, 0.12, 0.18), 0.47, 0.74, -0.24);             // ammo box (top 2.18)
  P.add('turretDark', box(0.03, 0.08, 0.10), 0.60, 0.78, -0.30);               // grips (top 2.20 = published p95 line)
  P.add('turret', cylY(0.21, 0.21, 0.04, 14), -0.48, 0.72, -0.30);             // gunner hatch
  P.add('turretDark', cylY(0.215, 0.215, 0.012, 14), -0.48, 0.755, -0.30);
  // 1G46 sight doghouse left of gun + Luna IR right — held at the 2.20 roof
  sightBox(P, 'turret', -0.40, 0.70, 0.26, 0.40, 0.20, 0.40);
  P.add('turret', box(0.44, 0.04, 0.44), -0.40, 0.795, 0.26);                  // doghouse lid (top 2.195)
  P.add('turretDetail', box(0.26, 0.26, 0.24), 0.55, 0.42, 0.96);
  P.add('turretGlass', box(0.18, 0.18, 0.02), 0.55, 0.42, 1.09);
  // 902 smoke tubes clustered LEFT side, raised to the post-warp cluster
  // line (~2.20 world at the -1.05..-1.45 columns)
  for (let k = 0; k < 5; k++) P.add('turretDark', cylZ(0.042, 0.28, 8), -1.02 - k * 0.09, 0.74 + (k % 2) * 0.03, 0.48 - k * 0.11, -0.48, -(0.85 + k * 0.12), 0);
  for (let k = 0; k < 4; k++) P.add('turretDark', cylZ(0.042, 0.28, 8), -1.10 - k * 0.09, 0.56, 0.24 - k * 0.11, -0.38, -(1.0 + k * 0.14), 0);
  // bustle: transverse OPVT snorkel + stowage band + basket + rails.
  // VERTEX ROUND: the ref bustle hump runs to world -2.25 (band 1.60..1.84
  // post-warp at -2.0..-2.2) — row extended, kit lowered onto it.
  P.add('turretDark', cylX(0.075, 1.55, 10), 0, 0.55, -1.08);
  P.add('turretDark', cylX(0.055, 0.30, 8), 0.88, 0.55, -1.08);
  P.add('turret', box(2.60, 0.50, 1.16), 0, 0.26, -1.70);                      // stowage box row wrapping the rear
  P.add('turretDark', box(2.45, 0.05, 1.06), 0, 0.53, -1.68);
  P.add('turretCloth', box(1.30, 0.16, 0.95), 0.10, 0.59, -1.50);              // strapped kit on top
  basket(P, 1.15, -2.00, -2.28, 0.04, 0.42, 0.55);
  P.add('turretDetail', box(0.05, 0.05, 0.72), 0.78, 0.50, -0.95, 0, 0.5, 0);  // grab rails
  P.add('turretDetail', box(0.05, 0.05, 0.72), -0.78, 0.50, -0.95, 0, -0.5, 0);
  whip(P, -0.62, 0.70, -0.85, 0.24, -0.10, -0.30);                             // stub (print shows no spike column)
  P.decal('turret', 'number', '518', 0.28, [1.05, 0.28, -0.15], Math.PI / 2, 0, 0.1);
  P.decal('turret', 'number', '518', 0.28, [-1.05, 0.28, -0.15], -Math.PI / 2, 0, -0.1);
  // 2A46M-1 at axis 1.66: sealed embrasure roll, sleeve pair, fat evacuator
  // in the sleeve gap, no muzzle brake/MRS.
  P.gunG.position.set(0, 0.25, 0.55);
  trunnionRoll(P, 0.17, 0.55, { ballR: 0.145, ballZ: 0.20 });
  P.addGunExtra(box(0.42, 0.42, 0.28), 0, 0.01, 0.28);                         // embrasure block
  P.addGunExtra(cylZ(0.125, 0.30, 12, 0.15), 0, 0, 0.50);                      // root collar
  P.add('turret', box(0.60, 0.14, 0.30), 0, 0.52, 0.98, -0.45, 0, 0);          // brow between the clams
  // muzzle at REAR+9.65 (dims sovereign — the print's tube is 1.5% short,
  // certified; the normalize plan stretches its barrel zone to match).
  // Right-offset sleeve clamp = the print's asymmetric evac-zone bulge
  // (plan col +0.18 to z 4.09).
  P.addGunExtraDark(cylZ(0.05, 0.50, 8), 0.16, 0.02, 3.15);
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
  P.add('hull', frustum(1.60, 3.30, 3.70, 1.62, 3.70, 3.70, 0.42, 0.86));      // lower nose
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
    mudflap(P, s * 1.43, 0.52, 3.66, 0.52, 0.32);
    mudflap(P, s * 1.40, 0.48, -3.64, 0.52, 0.30);
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
  // center M2 folded to the roofline
  P.add('turretDark', box(0.10, 0.05, 0.16), 0.0, TH + 0.01, -0.55);
  P.add('turretDark', box(0.095, 0.08, 0.46), 0.0, TH, -0.46);
  P.add('turretDark', cylZ(0.025, 0.58, 8), 0.0, TH + 0.005, -0.05, -0.02, 0, 0);
  P.add('turretDark', cylZ(0.037, 0.10, 8), 0.0, TH + 0.01, 0.26, -0.02, 0, 0);
  P.add('turretDetail', box(0.10, 0.10, 0.17), -0.10, TH - 0.02, -0.52);
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
  P.add('hull', frustum(1.59, 3.10, -3.32, 1.55, 3.06, -3.30, 0.90, 1.32));    // sponson band
  P.add('hull', box(3.02, 0.04, 4.10), 0, 1.305, -0.80);                       // deck
  // glacis: two yawed half-plates form the shallow center crease
  for (const s of [-1, 1]) {
    P.add('hull', slab(
      [s * 0.02, 0.55, 3.34], [s * 1.59, 0.62, 3.02], [s * 1.59, 0.92, 3.06], [s * 0.02, 0.82, 3.36],
      [s * 0.02, 1.32, 1.18], [s * 1.55, 1.32, 1.10], [s * 1.55, 1.32, 1.06], [s * 0.02, 1.32, 1.14]));
  }
  P.add('hull', frustum(1.40, 3.12, 3.35, 1.55, 3.35, 3.35, 0.40, 0.64));      // lower nose
  P.add('hull', slab(                                                          // sloped rear deck
    [-1.55, 1.05, -1.55], [1.55, 1.05, -1.55], [1.45, 1.05, -3.30], [-1.45, 1.05, -3.30],
    [-1.52, 1.32, -1.55], [1.52, 1.32, -1.55], [1.42, 1.10, -3.30], [-1.42, 1.10, -3.30]));
  P.add('hull', box(2.86, 0.44, 0.10), 0, 0.80, -3.33);                        // tail plate
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
    mudflap(P, s * 1.31, 0.44, -3.34, 0.52, 0.30);
    mudflap(P, s * 1.31, 0.52, 3.20, 0.52, 0.34);
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
  P.add('turretDark', cylY(0.026, 0.032, 0.14, 8), 0.58, 0.87, -0.50);
  P.add('turretDark', box(0.10, 0.06, 0.15), 0.58, 0.955, -0.50);
  P.add('turretDark', box(0.10, 0.11, 0.48), 0.58, 1.05, -0.38, 0, 0.12, 0);   // receiver top 2.525-authored (p95 anchor)
  P.add('turretDark', cylZ(0.026, 0.60, 8), 0.62, 1.05, 0.04, -0.03, 0.12, 0);
  P.add('turretDark', cylZ(0.038, 0.11, 8), 0.66, 1.065, 0.34, -0.03, 0.12, 0);
  P.add('turretDetail', box(0.10, 0.12, 0.16), 0.46, 0.95, -0.52);             // ammo can (fused)
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
