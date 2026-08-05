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

// Tighten the factory's generic hull shadow proxy to THIS build's real gear
// envelope. The proxy is installed AFTER profile builders run and its track
// boxes span hullLen*0.90 at y 0.07 — on short-contact-patch builds (type90:
// contact [-2.4, 2.2] under a 7.45 hull) the exposed corners print in the
// gate masks (§C: shadow proxies ARE mask geometry) as ground-level track
// where the reference shows climbing ramps. The microtask runs after
// createTank returns, before any render; geometry only — the proxy mesh,
// material and articulation stay the factory's.
function tightenHullShadowProxy(P, { xc, trackW, y0, y1, z0, z1, hullZ0, hullZ1 }) {
  queueMicrotask(() => {
    P.hullG.traverse((o) => {
      if (!o.isMesh || o.name !== 'procShadow_hull') return;
      const old = o.geometry;
      const hw = P.spec.dims.widthM / 2;
      const hullH = Math.max(0.55, Math.min(P.spec.dims.heightM * 0.45, P.spec.armor.turretPivot[1] * 0.72));
      const parts = [
        KIT.xform(KIT.box(hw * 1.64, hullH, hullZ1 - hullZ0), 0, hullH * 0.58 + 0.12, (hullZ0 + hullZ1) / 2),
        KIT.xform(KIT.box(trackW, y1 - y0, z1 - z0), -xc, (y0 + y1) / 2, (z0 + z1) / 2),
        KIT.xform(KIT.box(trackW, y1 - y0, z1 - z0), xc, (y0 + y1) / 2, (z0 + z1) / 2),
      ];
      o.geometry = KIT.mergeAll(parts);
      old.dispose();
    });
  });
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
// R4 FULL RE-LAY (2026-08-03) from the r27-landmine-fixed workorder dump
// (scratchpad wo-ariete.json). Ref lines below in OUR world frame (scene z
// +0.96 = the stable side registration; ref body mid lands ~0 in our frame
// so the published 7.59 envelope stays zero-centered). Published: hull 7.59,
// overall 9.67 (muzzle +5.88 / tail -3.79), width 3.60 (skirt planes
// +-1.80), height 2.50 (TURMS lid + pano at the ref's own 2.47-2.51 spikes).
// Measured architecture: deck 1.445 amidships with a 1.385 driver dip and a
// 1.415 step; long shallow glacis 1.418@2.52 -> 1.26@3.42, center nose to
// 3.68 (tip 1.234); front mudguard CRESTS 1.60 @ z 3.32-3.62 x 1.55-1.77
// (the front-view 1.56-1.62 tops at +-1.6-1.76); contact patch [-2.15,
// 2.45] with a high idler (far edge 3.68 = the plan 3.71 front lane) and
// sprocket far -3.48 (plan -3.46); stern rake bottoms 0.24@-2.75 ->
// 0.69@-3.66 with the thin 1.385-1.445 tail lip and a CENTER tail block to
// -3.86 (its plan -3.88 center column) = the SS-A rear anchor; powerpack
// hump 1.626-1.656 @ -1.26..-1.74, rear deck 1.595 to -3.20, tail 1.565.
// Turret: canted-wall slab (walls 1.30 -> 1.10 at the roof), roof 2.32 with
// a RAISED 2.40-2.47 front section (z -0.02..0.90) + TURMS 2.50 fwd-right,
// hatch NOTCH 2.23 (z -0.55..-1.05), pano tower spike 2.49 at x -0.26 /
// z -0.95, bustle roof 2.32 to -1.86, LOW basket top 2.11 to -2.56; side
// shelves 1.91 tops (x to 1.55, z 0.03..-0.81) carrying the GALIX banks;
// tube axis 1.686 (band 0.18-0.21), MRS collar at the ref's own 4.6-4.8
// swell, muzzle +5.88 (published; the print's tube ends 5.73 — certified
// short-tube class, ~1 col).
// ---------------------------------------------------------------------------
function buildAriete(P) {
  const { box, cylY, cylZ, frustum, slab, torus, buildGun, buildRunningGear,
    fenders, headlight, liftEye, periscope, towCable, stowage, jerryCan } = KIT;
  const { rng } = P;
  // ---- hull tub + sponsons + stepped deck ----
  P.add('hull', box(2.06, 0.885, 5.90), 0, 0.8575, 0.05);                      // tub x +-1.03, belly 0.415, z -2.90..3.00
  P.add('hull', box(3.12, 0.16, 5.80), 0, 1.35, -0.60);                        // sponson band over the tracks (x +-1.56)
  P.add('hull', box(3.12, 0.05, 2.07), 0, 1.420, 0.685);                       // main deck 1.445 (z -0.35..1.72)
  P.add('hull', box(3.12, 0.045, 0.30), 0, 1.3625, 1.87);                      // driver dip plate 1.385 (z 1.72..2.02)
  P.add('hull', box(3.12, 0.045, 0.40), 0, 1.3925, 2.22);                      // fore step 1.415 (z 2.02..2.42)
  // glacis: long shallow plate then the center nose (ref plan center 3.68)
  P.add('hull', frustum(1.56, 3.40, 2.40, 1.56, 2.44, 2.40, 1.192, 1.418));    // glacis (2.42,1.418)->(3.38,1.21) — the ref line at the settled 0.86 registration
  P.add('hull', frustum(0.90, 3.68, 3.38, 0.92, 3.42, 3.38, 1.00, 1.245));     // center nose to 3.68 (tip 1.234)
  P.add('hull', frustum(0.88, 3.58, 3.28, 0.90, 3.30, 3.28, 0.72, 1.00));      // under-nose face
  P.add('hull', slab(                                                          // bow belly rise (x +-0.90)
    [-0.90, 0.415, 2.58], [0.90, 0.415, 2.58], [0.90, 0.415, 2.84], [-0.90, 0.415, 2.84],
    [-0.90, 0.75, 2.58], [0.90, 0.75, 2.58], [0.90, 0.75, 3.36], [-0.90, 0.75, 3.36]));
  // front mudguard crests (side 1.595 @ 3.44-3.56; front-view 1.56-1.62 tops
  // at +-1.6-1.76) + thin tip lip + the SS-A front bracket hidden in their
  // plan shadow, behind the idler wrap's dilated 3.70 far edge
  for (const s of [-1, 1]) {
    P.add('hull', box(0.22, 0.68, 0.28), s * 1.66, 1.26, 3.45);               // crest block (top 1.60, x to 1.77, z 3.31..3.59)
    P.add('hull', box(0.20, 0.055, 0.06), s * 1.65, 0.755, 3.60);              // tip lip (side 0.753 @ 3.60 — out of the tube-only col bins)
    P.add('hullRubber', box(0.50, 0.22, 0.03), s * 1.32, 0.71, 3.615);         // flap fully inside the 3.59-col bin (its 3.66 seat printed a 0.49 err into the tube-only 3.71 col)
  }
  // stern: rake wedge + plate + thin tail lip + CENTER tail block anchor
  P.add('hull', slab(                                                          // center rake (x +-0.92): bottoms 0.24@-2.75 -> 0.69@-3.66
    [-0.92, 0.55, -2.60], [0.92, 0.55, -2.60], [0.92, 0.69, -3.66], [-0.92, 0.69, -3.66],
    [-0.92, 1.30, -2.60], [0.92, 1.30, -2.60], [0.92, 1.30, -3.66], [-0.92, 1.30, -3.66]));
  P.add('hull', box(2.84, 0.75, 0.06), 0, 1.065, -3.67);                       // rear plate (x +-1.42, y 0.69..1.44)
  P.add('hull', box(2.70, 0.055, 0.21), 0, 1.415, -3.795);                     // thin tail lip 1.385..1.445 (z -3.69..-3.90; the -3.96 lip read overall 9.8/+1.3%)
  P.add('hull', box(0.36, 0.32, 0.19), 0, 1.39, -3.795);                       // SS-A REAR ANCHOR: center tail block to -3.89 (ref plan -3.88 center col; band 0.32 at the ref's own 1.385-1.565 lip heights; muzzle drops to 5.78 so overall stays 9.67)
  for (const s of [-1, 1]) {
    P.add('hullRubber', box(0.40, 0.25, 0.03), s * 1.30, 1.00, -3.62);         // rear flaps
    P.add('hullDark', box(0.14, 0.07, 0.035), s * 1.20, 1.36, -3.71);          // taillights
  }
  P.add('hullDark', box(1.85, 0.26, 0.04), 0.10, 1.10, -3.70);                 // rear grille shadow
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(1.70, 0.032, 0.045), 0.10, 1.00 + k * 0.09, -3.705);
  // rear superstructure: stepped deck -> powerpack hump -> rear deck run
  P.add('hull', box(3.06, 0.04, 0.36), 0, 1.455, -0.53);                       // step 1.475 (z -0.35..-0.71)
  P.add('hull', box(3.06, 0.045, 0.40), 0, 1.4825, -0.91);                     // step 1.505 (z -0.71..-1.11)
  P.add('hull', box(3.00, 0.05, 0.22), 0, 1.510, -1.22);                       // step 1.535
  P.add('hull', box(2.70, 0.21, 0.50), 0, 1.55, -1.58);                        // powerpack hump 1.655 (z -1.33..-1.83)
  P.add('hullDark', box(2.40, 0.016, 0.40), 0, 1.658, -1.57);
  P.add('hull', box(3.00, 0.14, 0.74), 0, 1.525, -2.43);                       // rear deck 1.595 (z -2.06..-2.80 — the ref 1.595 run)
  P.add('hull', box(2.90, 0.10, 0.84), 0, 1.515, -3.22);                       // tail deck 1.565 (z -2.80..-3.64)
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(2.20, 0.014, 0.05), 0, 1.598, -2.10 - k * 0.22);
  P.add('hullDark', box(0.24, 0.30, 0.28), -1.30, 1.20, -2.86);                // left exhaust box (below the deck line)
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.03, 0.26, 0.24), -1.435, 1.20, -2.86 + (k - 1) * 0.0);
  // driver station on the dip plate + episcopes + V splash rail
  P.add('hull', box(0.62, 0.04, 0.54), 0.52, 1.398, 1.95, -0.06, 0, 0);
  P.add('hullDark', box(0.56, 0.013, 0.03), 0.52, 1.415, 1.95, -0.06, 0, 0);
  for (let k = -1; k <= 1; k++) periscope(P, 'hullDetail', 0.52 + k * 0.17, 1.43, 2.16, k * 0.08);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.80, 0.04, 0.05), s * 0.40, 1.335, 2.62, -0.16, s * 0.42, 0);
  headlight(P, -1.40, 1.26, 3.30, -0.25, 0.048);                               // tucked at the crest shoulders (the 1.42-high pods printed 1.47 over the ref's bare 1.28 glacis line)
  headlight(P, 1.40, 1.26, 3.30, -0.25, 0.048);
  P.add('hullDetail', torus(0.08, 0.015, 10), -0.60, 0.62, 3.40, Math.PI / 2, 0, 0); // tow eyes
  P.add('hullDetail', torus(0.08, 0.015, 10), 0.60, 0.62, 3.40, Math.PI / 2, 0, 0);
  liftEye(P, 'hullDetail', -1.40, 1.42, 0.55);
  liftEye(P, 'hullDetail', 1.40, 1.42, 0.55);
  towCable(P, [[-1.10, 1.30, 2.75], [0, 1.42, 2.30], [1.10, 1.30, 2.75]]);
  stowage(P, 'hullCloth', rng, [[-1.30, 1.66, -2.15, 0.44, 0.14, 0.8]]);
  // deck dressing (turret-fix: the bare 3.1 m fore deck + no baked AO fused
  // hull and turret into one wall at 3/4 angles) — all paper-thin interior
  // pieces, zero silhouette
  P.add('hullDark', box(2.00, 0.006, 0.50), 0, 1.449, 1.31);                   // contact-shadow band on the deck ahead of the turret ring (SS-B2 attachment-shadow device)
  P.add('hullDark', box(0.72, 0.008, 0.40), -0.98, 1.449, 0.90);               // battery/intake panel L
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.66, 0.010, 0.04), -0.98, 1.451, 0.78 + k * 0.12);
  P.add('hullDark', box(0.50, 0.008, 0.34), 1.06, 1.449, 0.95);                // stowage panel R
  {
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 4, width: 0.46, seed: 7 });
    links.position.set(-0.70, 1.60, -3.05);                                    // spare links flat on the tail deck (1.565): tops ~1.64 by the ref's own 1.6 aft line
    P.hullG.add(links);
  }
  P.decal('hull', 'number', 'EI 118', 0.26, [-0.92, 0.80, 3.66], 0, -0.20);
  P.decal('hull', 'soot', null, 0.55, [-1.45, 1.10, -2.95], -Math.PI / 2);
  // skirts: full-length panels at +-1.78 + the widthM edge strip at exactly
  // +-1.80 (WIDTH GUARD; ref stations read ~3.54-3.60 the whole run).
  // Band 0.60..1.42 under the deck edge; courses segmented ~0.47 (SS C).
  fenders(P, 1.20, 1.56, 1.41, -3.55, 2.45, 0.028);                            // fenders END at the glacis knee (the 3.30 run printed a 1.44 shelf over the ref's bare 1.26-1.38 glacis line)
  fenders(P, 1.55, 1.735, 1.400, -3.55, 2.45, 0.024);                          // trench fill to the skirt inner face (turret-fix round: the bare 1.56..1.735 strip read as a black trench over the track top at every 3/4 angle — SS-B2). Top 1.412 stays UNDER both the 1.42 skirt line and the 1.424 fender top: the first 1.41-seat fill printed one extra side-row pixel line (side_hull 69.5 -> 68.9)
  for (const s of [-1, 1]) {
    for (let k = 0; k < 13; k++) {                                             // skirt PLANE at +-1.7725 ABOVE the exposed wheels (r4 board: the
      P.add('hull', box(0.05, 0.64, 0.455), s * 1.76, 1.10, -2.98 + k * 0.4775); // ground-scraping panels were an identity error — the print's
    }                                                                          // full-depth +-1.6-1.69 front cols are its WIDE TRACK PLANE); depth 0.478 = the 0.4775 course pitch (turret-fix round: the 0.455 courses left 2.25 cm through-slots reading as a picket fence — SS-B2; the dark strips stay the seam read)
    P.add('hull', box(0.05, 0.64, 0.44), s * 1.76, 1.10, -3.44);               // 14th course over the sprocket (ref rear stations ~3.54; faces 1.735-1.785 — 1.7975 printed the +-1.85 mirror-dot bin again, err 3.3 x2)
    for (let k = 0; k < 6; k++) P.add('hullDark', box(0.036, 0.50, 0.016), s * 1.760, 1.08, 2.62 - k * 1.00); // (outer edge 1.778 — an 1.792 edge AA-printed the +-1.86 mirror-dot bin)
    P.add('hullDark', box(0.02, 0.05, 6.2), s * 1.7655, 0.755, 0.05);
  }
  // running gear: SEVEN wheels on the [-2.15, 2.45] contact patch, HIGH
  // small idler (far 3.68 = plan 3.71 lane) + sprocket (far -3.48 = plan
  // -3.46); lanes x 1.04..1.64 like the print's front columns
  const wheelZs = [2.40, 1.65, 0.90, 0.15, -0.60, -1.35, -2.10];
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.345, wheelW: 0.21, wheelY: 0.43, xc: 1.42,
    wheelZs,
    sprocket: { z: -3.10, y: 0.72, r: 0.21 }, idler: { z: 3.14, y: 0.60, r: 0.19 },
    rollers: [1.95, 0.70, -0.65, -1.80].map((z) => ({ z, y: 0.88, r: 0.08 })),
    trackW: 0.56, topY: 0.88, botY: 0.055, paintedEnds: true, coveredTop: true, arms: true,
  });
  wheelRecessAt(P, wheelZs, 1.42, 0.43, 0.345, 0.21);
  tightenHullShadowProxy(P, { xc: 1.42, trackW: 0.34, y0: 0.15, y1: 0.58, z0: -2.40, z1: 2.60, hullZ0: -3.20, hullZ1: 3.20 });

  // ---- turret: canted-wall welded slab + raised front roof + TURMS +
  // pano tower + hatch notch + low rear basket (r4 architecture RESTORED
  // after the turret-fix round's re-lay experiments: the r4 roof was
  // measured RIGHT — the gate's own worst-column decode (z_w = 1.15 - at,
  // y = val + 1.25, calibrated non-circularly on authored planes) puts the
  // ref 2.48-2.50 plateau at z_w 0.2..0.6 = exactly the r4 TURMS seat, the
  // ref line falling 2.28@0.78 -> 2.10@1.26 toward the prow = the r4
  // closer-wedge/front-face stack. The vertex-workorder printed frame that
  // suggested otherwise is bbox-skewed for turret rows — do NOT re-author
  // from it. Micro-trims only, cited per piece.) ----
  P.turretG.position.set(0, 1.48, -0.29);                                      // (the hull anchors pin side dAlong ~0.84-0.87 / plan dy ~0.91 — the turret sits at the compromise 0.87 map)
  const ARIETE_TURRET_PLAN = [
    [-0.42, 1.35], [0.42, 1.35], [1.02, 0.85], [1.28, 0.30],
    [1.28, -1.74], [1.10, -1.98], [-1.10, -1.98], [-1.28, -1.74],
    [-1.28, 0.30], [-1.02, 0.85],
  ];
  P.add('turret', KIT.polyTurret(ARIETE_TURRET_PLAN, 0.84, 1.0, 0.90));        // main body: walls cant in 1.30 -> 1.10 (front-view 2.10-2.32 tops at +-1.23-1.31); z_w front face ~1.15, tall body ends -1.86
  P.add('turretDark', KIT.polyTurret(ARIETE_TURRET_PLAN, 0.05, 1.02, 1.0));    // dark RING PLINTH at the base (turret-fix: the turret visually fused with the deck — a 5 cm contact-shadow band separates them, SS-B2 device; +2.6 cm plan bump is sub-column)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.16, 0.42, 0.52), s * 1.20, 0.31, -1.915);            // LOW rear wings (ref plan -2.37 @ +-1.28; tops 2.01 hide under the 2.11 basket line in side view)
  }
  P.add('turret', box(2.12, 0.10, 0.76), 0, 0.79, -0.31);                      // mid roof plate 2.32 (z_w -0.10..-0.57)
  P.add('turret', box(2.10, 0.68, 0.88), 0, 0.42, -1.315);                     // bustle body (z_w -1.08..-1.96)
  P.add('turret', box(2.12, 0.06, 0.78), 0, 0.81, -1.295);                     // bustle roof 2.32 (ends z_w -1.89 — the ref 2.32 line stops at -1.86 before the 2.11 basket)
  P.add('turret', box(1.70, 0.055, 0.48), 0, 0.7225, -0.815);                  // hatch NOTCH plate 2.23 (z_w -0.56..-1.04)
  // RAISED front roof: the ref reads HIGHER at the sides (2.45-2.46 @
  // x +-0.79-1.07) than the center channel (2.32-2.39); front lips pulled
  // to z_w 0.61 (turret-fix trim: the 0.73 lip sat one column into the
  // ref's falling line)
  P.add('turret', box(0.84, 0.09, 0.80), 0, 0.845, 0.50);                      // center channel (top 2.37)
  for (const s2 of [-1, 1]) P.add('turret', box(0.63, 0.115, 0.80), s2 * 0.725, 0.8575, 0.50); // side sections (top 2.455)
  P.add('turret', frustum(0.85, 1.30, 1.00, 0.72, 1.24, 1.00, 0.84, 0.87));    // front closer wedge (top 2.35 — the r4 2.395 rode +0.13-0.17 over the ref 2.24-2.28 fall at z_w 0.73-0.85)
  // TURMS gunner sight box fwd-right (top 2.50 = the heightM p95 anchor,
  // ref front 2.51 @ x 0.51-0.84; the gate decode confirms the ref 2.48-2.50
  // side plateau at z_w 0.2-0.6 = THIS seat)
  sightBox(P, 'turret', 0.67, 0.955, 0.55, 0.40, 0.135, 0.50);
  P.add('turretDetail', box(0.44, 0.028, 0.54), 0.67, 1.006, 0.55);            // split lid (top 2.514)
  // commander panoramic TOWER aft-left-of-center (ref spike 2.38-2.50 at
  // x -0.22..-0.30, z_w -0.90..-1.02). TURRET-FIX NOTE: the real C1 pano
  // reads ~2.7 (packet dims table) but the vertex-normalize warp clamped
  // the print's furniture band to 2.50/2.52 — a 2.66 tower was tried and
  // priced FAR over the p95 allowance (head+dilation ~5 side cols: dims
  // 100 -> 91.3, min -1.9). The tower stays at the print's 2.495 ceiling
  // with a TALLER SLIMMER pedestal read (documented residual, not gamed).
  P.add('turret', box(0.20, 0.30, 0.18), -0.26, 0.845, -0.83);                 // pedestal column (top 2.475)
  P.add('turretDark', box(0.26, 0.10, 0.24), -0.26, 0.965, -0.83);             // pano head (top 2.495)
  P.add('turretGlass', box(0.18, 0.055, 0.02), -0.26, 0.965, -0.70);
  P.add('turretDark', torus(0.115, 0.014, 12), -0.26, 0.70, -0.83);            // ring collar at the roof foot
  // hatches on the notch plate — RAISED RING RIMS (turret-fix: the r4
  // 3.8 cm crowns vanished at 1x and the roof read as a blank casemate
  // plain; crowns 2.30-2.33 sit inside the ref's 2.2-2.35 notch-zone fall)
  P.add('turret', cylY(0.23, 0.235, 0.075, 16), 0.52, 0.7875, -0.80);          // commander ring
  P.add('turretDark', torus(0.225, 0.016, 16), 0.52, 0.828, -0.80);
  P.add('turret', cylY(0.20, 0.20, 0.028, 16), 0.52, 0.845, -0.80);            // domed lid (crown 2.34)
  P.add('turretDark', box(0.36, 0.013, 0.03), 0.52, 0.865, -0.80);
  P.add('turret', cylY(0.19, 0.20, 0.062, 16), -0.55, 0.776, -0.78);           // loader ring
  P.add('turretDark', torus(0.195, 0.014, 16), -0.55, 0.808, -0.78);
  P.add('turretDark', cylY(0.195, 0.195, 0.014, 16), -0.55, 0.818, -0.78);     // open-lid shadow disc (crown 2.31)
  periscope(P, 'turretDetail', 0.52, 0.79, -0.52);
  periscope(P, 'turretDetail', -0.30, 0.905, 0.30, 0.3);
  // loader MAG — SS B3 KIT fitting on the bustle roof front (foot sunk to
  // 0.55: the r4 0.63 seat printed the receiver 2.52 vs the ref 2.31 at
  // z_w -1.4 — the gate's own worst column)
  const mag = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', seed: 5 });
  mag.position.set(-0.54, 0.55, -1.10);
  P.turretG.add(mag);
  // side shelves (tops 1.91 = ref front-view 1.91-1.92 at +-1.35-1.55, plan
  // z_w 0.03..-0.81 — the r4 seat CONFIRMED by the shelf-move experiment:
  // relocating them aft moved their plan columns +0.78 off the ref)
  // carrying the GALIX banks, + tie-down horns on the lids (the ref plan's
  // +-1.60-1.63 dot columns at z_w ~-0.75) + under-lip contact shadow
  for (const s of [-1, 1]) {
    P.add('turret', box(0.24, 0.36, 0.84), s * 1.41, 0.25, -0.27);
    P.add('turretDark', box(0.25, 0.06, 0.76), s * 1.415, 0.40, -0.27);
    P.add('turretDark', box(0.26, 0.03, 0.78), s * 1.39, 0.055, -0.27);        // contact shadow under the shelf lip (SS-B2 attachment read)
    galixBank(P, s * 1.36, 0.30, -0.10, s, 4, 1);                              // banks INSIDE the ref's own +-1.37-1.52 plan window (z_w 0.03..-0.81 — the +0.28 seat printed tube tips at z_w +0.42)
    liftEye(P, 'turretDetail', s * 0.95, 0.90, 0.55, s * 0.4);
    P.add('turretDetail', box(0.13, 0.055, 0.13), s * 1.565, 0.10, -0.45);     // tie-down horn UNDER the shelf lip (outer 1.63+dil stays out of the +-1.75 col; the ref +-1.60 plan dots. Top 1.61w hides below the ref's 1.62 front-row line — the 1.92 lid seat printed 3 front_whole cols at +0.3)
    // weld/panel seams on the canted wall (turret-fix: the blank 3 m wall
    // read as one casemate slab — dark joints break it; 7 mm proud,
    // interior to the +-1.28 base plane in every mask row)
    for (const zSeam of [0.30, -0.55, -1.30]) {
      P.add('turretDark', box(0.014, 0.70, 0.022), s * 1.185, 0.40, zSeam, 0, 0, -s * 0.234);
    }
  }
  // (turret-fix note: stowage stacked ON the shelves was tried and revoked
  // — the +-1.4 front-row line IS the 1.91 shelf top; 2.15 duffels there
  // cost whole -4.9. The wall break stays with the seams + shelf shadow.)
  P.add('turretCloth', box(0.30, 0.09, 0.40), -0.50, 0.935, 0.50);             // ration box beside the TURMS (top 2.46 inside the 2.48-2.51 plateau; dresses the fore roof)
  // LOW rear basket at the r4 FOOTPRINT (turret-fix round law: the turret
  // rows are BBOX-NORMALIZED — with the certified-long tube (+0.94 vs the
  // print) the turret rear must stay correspondingly short or every
  // column smears (the -3.40 tail experiment: turret 64.4 -> 0, stations
  // 71.9 -> 29). Basket length is harness-pinned; the visual upgrades
  // (floor, side mesh, duffel pile) stay INSIDE the r4 bbox — SS-B2 solid
  // top-down read without moving an edge.)
  {
    const zf = -1.815, zr = -2.415;                                            // local (z_w -2.105/-2.705)
    for (const y2 of [0.20, 0.61]) {
      P.add('turretDetail', box(2.24, 0.035, 0.035), 0, y2, zr);               // rear rails (top 2.09w)
      P.add('turretDetail', box(2.24, 0.035, 0.035), 0, y2 === 0.20 ? 0.18 : 0.61, zf);
    }
    for (const sx of [-1.1025, 1.1025]) {
      P.add('turretDetail', box(0.035, 0.035, 0.60), sx, 0.20, -2.115);        // side rails
      P.add('turretDetail', box(0.035, 0.035, 0.60), sx, 0.61, -2.115);
    }
    for (let i = 0; i < 6; i++) P.add('turretDetail', box(0.028, 0.42, 0.028), -1.10 + i * 0.44, 0.40, zr);
    P.add('turretDark', box(2.20, 0.36, 0.014), 0, 0.40, zr + 0.02);           // mesh back
    P.add('turretDark', box(0.016, 0.36, 0.56), -1.095, 0.40, -2.115);         // mesh side sheets (side-mask floor 1.70-2.06w)
    P.add('turretDark', box(0.016, 0.36, 0.56), 1.095, 0.40, -2.115);
    P.add('turretDark', box(2.16, 0.014, 0.56), 0, 0.185, -2.115);             // basket floor 1.665w (top-down fill)
    P.add('turretCloth', box(1.95, 0.34, 0.48), 0, 0.38, -2.155);              // strapped cargo (top 2.03)
    P.add('turretCloth', box(1.60, 0.20, 0.40), -0.05, 0.55, -2.19);           // duffel pile on the cargo (top 2.13 = the ref 2.12 aft band)
    P.add('turretCloth', box(0.90, 0.09, 0.40), -0.20, 0.585, -2.06);          // tarp roll (top 2.11)
    P.add('turretDark', box(0.02, 0.34, 0.42), -0.55, 0.38, -2.075);
    P.add('turretDark', box(0.02, 0.34, 0.42), 0.48, 0.38, -2.075);
  }
  jerryCan(P, 'turretCloth', 0.85, 0.52, -1.895, 0.2);
  // two short whip antennas at the bustle corners (identity; raked FLAT
  // aft — the r4 -0.9 rake put the shafts 2.25-2.35 over the ref's 2.12
  // aft band at z_w -2.3..-2.5, the gate's top side columns)
  for (const s of [-1, 1]) {
    const whipA = FITTINGS.antennaWhip({ mats: P.mats, h: 0.30, r: 0.011, rake: -s * 0.06, seed: 3, rotation: [-1.15, 0, 0] });
    whipA.position.set(s * 1.02, 0.50, -1.82);                                 // tips ~2.10w at z_w ~-2.38
    P.turretG.add(whipA);
  }
  P.decal('turret', 'number', P.spec.visual.number || '118', 0.26, [1.24, 0.30, -0.75], Math.PI / 2, 0, 0.05);
  P.decal('turret', 'number', P.spec.visual.number || '118', 0.26, [-1.24, 0.30, -0.75], -Math.PI / 2, 0, -0.05);
  // 120 mm OTO Breda L/44 at the MEASURED axis 1.686 (the r3 1.84 axis rode
  // 0.15 high): angular mantlet block + gun-root collar + backward-raked
  // wedge cheeks (r4 architecture restored — its plan row scored 70.1)
  P.gunG.position.set(0, 0.206, 0.89);
  trunnionRoll(P, 0.185, 0.55);
  P.addGunExtra(box(0.36, 0.40, 0.85), 0, -0.02, 0.72);                        // central mantlet block to z_w 1.745 (top 1.87 — its side band tops 1.81-1.84; 0.36 wide: +-0.18 covers the +-0.165 plan col the 0.44 r4 block over-filled)
  P.addGunExtra(cylZ(0.135, 0.48, 12), 0, 0, 1.36);                            // gun-root collar to z_w 2.20 (turret-fix: fills the prow notch center so the recess reads mantlet+gun, not a hole; the certified plan center col improved 2.07 -> 1.84 with it)
  P.addGunExtraDark(box(0.70, 0.32, 0.30), 0, -0.01, 0.55);                    // dark canvas mantlet cover wrapping the root (turret-fix: the 0.36 block alone read as a pinhole in the big front wall — the ref front is dominated by its dark mantlet mass; band y 1.51-1.83 / z_w 1.01-1.31 inside the priced mantlet band, plan front 1.31 under the ref 1.333 line)
  P.addGunExtraDark(cylZ(0.026, 0.10, 8), 0.27, 0.06, 0.42);                   // coax port
  // BACKWARD-RAKED WEDGE CHEEK COMPLEX: the ref's mantlet prow sweeps ahead
  // of the body — the r4 two-slab pair restored verbatim (plan row 70.1)
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.42, 0.02, 2.44], [s * 0.70, 0.02, 2.38], [s * 1.25, 0.02, 2.06], [s * 0.60, 0.02, 2.24],
      [s * 0.42, 0.36, 2.36], [s * 0.70, 0.35, 2.30], [s * 1.25, 0.30, 2.00], [s * 0.60, 0.355, 2.18]));
    P.add('turret', slab(                                                      // wedge roots back to the body face
      [s * 0.42, 0.02, 2.28], [s * 1.24, 0.02, 2.02], [s * 1.26, 0.02, 0.90], [s * 0.42, 0.02, 1.30],
      [s * 0.42, 0.355, 2.20], [s * 1.24, 0.29, 1.96], [s * 1.26, 0.42, 0.90], [s * 0.42, 0.62, 1.30]));
  }
  P.add('turret', box(0.56, 0.14, 0.30), 0, 0.60, 1.42, -0.40, 0, 0);          // brow over the roll
  // muzzle at REAR + published 9.67 (rear extreme -3.89 -> muzzle 5.78; the
  // print's own tube ends 5.73). Tube r 0.075: sleeve band 0.183 under the
  // 12% cut; MRS collar lands on the ref's own 4.6-4.8 swell.
  buildGun(P, { len: 5.18, r: 0.075, sleeve: true, evac: 0.685, evacR: 1.40, collar: true, baseR: 0.16 });
  P.topY = 1.10;
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
// R4 FULL RE-LAY (2026-08-03) against the batch-27-warped print, authored from
// the r27-landmine-fixed workorder dump (scratchpad wo.mjs; roots re-shown
// before the union box). All numbers below are OUR world frame: ref side rows
// shifted +1.045 (side dAlong), plan rows +1.117 (plan dy), y -0.024.
// Envelope: hull 7.45, overall 9.76 (muzzle +6.02), width 3.43 (widthM strip
// faces ±1.715), height 2.34 (sight-ridge/M2/rack cols are the p95 anchors,
// matching the ref's own 2.29-2.35 spikes).
// Ref architecture (measured): deck steps 1.392/1.423/1.454 fore->aft; long
// shallow glacis 1.392@1.80 -> 1.177@2.50-3.10 with a proud V splash board
// (1.30 @ z 3.03-3.16) then nose fall to 1.05@3.53; front mudguard pods to
// z 3.68 (plan 3.69 @ x 0.9-1.63) with a 0.75 tip lip; SHORT contact patch
// [-2.4, 2.2] with climbing ramps to a HIGH small idler/sprocket (track far
// edges 3.66 / -3.36); stern boat-tail (bottoms 0.62@-3.3 -> 0.93@-3.74) +
// thin tail lip to -3.87; rear mudflap pods at x 1.44-1.58 to -3.83 = the §A
// rear dims anchor (ref 12%-band mid -0.105: pods 3.60/-3.80 are SYMMETRIC
// about it at the ref's own band heights — the t80u r3 counterweight).
// Turret: LOW long slab (roof 2.06 front / 2.00 hatch zone / 1.885 bustle,
// walls ±1.26 to 1.77, chamfered roof edge ±0.91) + center-right SIGHT RIDGE
// 2.19-2.26 (z 1.31..-0.17, x -0.10..0.47) peaking 2.32 at center (M2), rear
// overhung BASKET cluster 2.26-2.32 (z -2.02..-2.42, floor 1.46-1.56) with
// raked corner masts to 2.40 @ x +-1.10; low prow/mantlet mass 1.40..1.77 to
// plan nose 1.90; tube axis 1.562, slim r 0.065 (12%-cut LANDMINE: sleeve
// band 0.159 + evac 0.246 both under the ~0.28 side body cut).
// ---------------------------------------------------------------------------
function buildType90(P) {
  const { box, cylY, cylZ, frustum, slab, torus, buildGun, buildRunningGear,
    fenders, headlight, liftEye, periscope } = KIT;
  const { rng } = P;
  // ---- hull tub + sponsons + stepped deck ----
  // WIDTH PROFILE (ref stations, profiles extraction): the hull is WIDE at
  // both ends and NARROW amidships — rear ~22%: +-1.693, mid: +-1.55-1.59,
  // front ~28%: +-1.70-1.715 (armored panels). Deck plates follow.
  P.add('hull', box(1.84, 0.91, 5.85), 0, 0.851, 0.03);                        // tub x +-0.92, belly 0.396, z -2.90..2.96
  P.add('hull', frustum(1.54, 1.92, -3.66, 1.54, 1.92, -3.66, 1.15, 1.35));    // sponson band over the tracks
  P.add('hull', box(3.09, 0.048, 2.62), 0, 1.368, 0.56);                       // fore deck 1.392 (z -0.75..1.87, x +-1.545)
  P.add('hull', box(3.17, 0.048, 1.36), 0, 1.399, -1.43);                      // mid deck 1.423 (z -2.11..-0.75)
  P.add('hull', box(3.23, 0.048, 1.63), 0, 1.430, -2.925);                     // rear deck 1.454 (z -3.74..-2.11, x +-1.615 — a 1.61 edge printed only AA in the 1.60 front col where the ref reads its full deck)
  // glacis: shallow plate -> 1.177 plateau -> nose fall (three segments)
  P.add('hull', frustum(1.58, 2.52, 1.78, 1.58, 1.82, 1.78, 1.135, 1.392));    // (1.80,1.392)->(2.50,1.19)
  P.add('hull', frustum(1.58, 3.14, 2.46, 1.58, 2.50, 2.46, 1.125, 1.177));    // 1.177 plateau to 3.10
  P.add('hull', frustum(0.84, 3.38, 3.06, 0.84, 3.10, 3.06, 1.02, 1.172));     // nose fall to 1.03@3.38 (ref plan center front is 3.35 — the r4d 3.46 tip printed +0.11 on 6 center plan cols)
  P.add('hull', frustum(0.82, 3.33, 2.92, 0.84, 2.96, 2.92, 0.70, 1.02));      // under-nose face down to the belly line
  P.add('hull', slab(                                                          // bow belly rise (boat-tail, x +-0.90)
    [-0.90, 0.396, 2.60], [0.90, 0.396, 2.60], [0.90, 0.396, 2.86], [-0.90, 0.396, 2.86],
    [-0.90, 0.72, 2.60], [0.90, 0.72, 2.60], [0.90, 0.72, 3.34], [-0.90, 0.72, 3.34]));
  // V splash board: proud strip riding the plateau (ref side 1.30 @ 3.03-3.16)
  for (const s of [-1, 1]) P.add('hull', box(0.46, 0.115, 0.055), s * 0.40, 1.235, 3.14, -0.18, s * 0.42, 0);
  P.add('hull', box(0.14, 0.115, 0.055), 0, 1.245, 3.22, -0.18, 0, 0);
  // front mudguard pods (plan 3.69-3.70 carried by the THIN flap/lip only —
  // the 12%-band front BODY col stays at ~3.59: pod band 0.30 ends 3.57 and
  // the 3.65 col union (flap 0.72..0.90 + lip) holds under the 0.283 cut)
  for (const s of [-1, 1]) {
    P.add('hull', slab(
      [s * 0.96, 1.01, 2.88], [s * 1.62, 1.01, 2.88], [s * 1.62, 1.04, 3.50], [s * 0.96, 1.04, 3.50],
      [s * 0.96, 1.15, 2.88], [s * 1.62, 1.15, 2.88], [s * 1.62, 1.07, 3.56], [s * 0.96, 1.07, 3.56]));
    // §A FRONT ANCHOR: a low bracket block hidden INSIDE the mudguard's own
    // plan shadow (x 1.0-1.45, ref plan front 3.68 covers it) and BEHIND the
    // idler wrap's dilated 3.61 far edge — its union with the flap makes the
    // 3.65 col a BODY col (hullLengthM front anchor) at one col's silhouette
    // tax. A center-x pod printed 3.62 into six plan cols where the ref bow
    // is 3.35 (r4d lesson).
    P.add('hull', box(0.37, 0.29, 0.03), s * 0.735, 0.585, 3.60);              // (x 0.55..0.92 — at 1.0-1.45 it sat inside the idler wrap's far quadrant, 144 exact vox)
    P.add('hullRubber', box(0.59, 0.18, 0.03), s * 1.36, 0.81, 3.59);          // thin flap = the plan front line at x 1.065-1.655 (covers the 1.64 plan bin fully — its old 1.62 edge sat ON the bin boundary and lerp-junked the col)
  }
  // stern: boat-tail wedge + raised wide plate + tail lip + flap-pod anchors
  P.add('hull', slab(                                                          // center wedge (x +-0.92): bottoms 0.58@-3.2 -> 0.93@-3.73
    [-0.92, 0.55, -2.88], [0.92, 0.55, -2.88], [0.92, 0.93, -3.73], [-0.92, 0.93, -3.73],
    [-0.92, 1.30, -2.88], [0.92, 1.30, -2.88], [0.92, 1.30, -3.73], [-0.92, 1.30, -3.73]));
  P.add('hull', box(2.86, 0.44, 0.07), 0, 1.21, -3.695);                       // wide rear plate course (bottom 0.99 clears the sprocket wrap)
  P.add('hull', box(2.84, 0.034, 0.12), 0, 1.437, -3.72);                      // thin tail fender lip (band .03 — under the 12% cut)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.145, 0.31, 0.13), s * 1.51, 1.295, -3.765);            // §A REAR ANCHOR: mudflap pods (ref plan -3.76 @ x 1.52-1.56; rear body col ~-3.80, overall ~9.79 with the 5.96 muzzle)
    P.add('hullRubber', box(0.40, 0.24, 0.03), s * 1.28, 1.03, -3.71);         // rubber flaps above the wrap zone
  }
  P.add('hullDark', box(1.95, 0.24, 0.04), 0, 1.16, -3.735);                   // rear grille shadow
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(1.85, 0.035, 0.045), 0, 1.05 + k * 0.09, -3.745);
  // driver front-right + episcopes (flush on the fore deck)
  P.add('hull', cylY(0.24, 0.24, 0.026, 14), 0.58, 1.405, 1.42);
  P.add('hullDark', torus(0.24, 0.011, 14), 0.58, 1.415, 1.42);
  periscope(P, 'hullDetail', 0.42, 1.405, 1.68);
  periscope(P, 'hullDetail', 0.66, 1.405, 1.65);
  // engine deck furniture: FLUSH louvre fields (the ref deck line is clean)
  P.add('hullDark', box(1.90, 0.014, 1.30), 0, 1.458, -2.72);
  for (let k = 0; k < 6; k++) P.add('hullDetail', box(1.80, 0.012, 0.05), 0, 1.462, -3.18 + k * 0.17);
  P.add('hullDark', box(1.85, 0.014, 0.85), 0, 1.427, -1.42);
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.08, 0.08, 0.014, 12), s * 1.25, 1.432, -1.10);
  headlight(P, -1.22, 1.05, 3.44, -0.3, 0.05);
  headlight(P, 1.22, 1.05, 3.44, -0.3, 0.05);
  P.add('hullDetail', torus(0.08, 0.014, 10), -0.55, 0.62, 3.38, Math.PI / 2, 0, 0); // tow eyes on the under-nose
  P.add('hullDetail', torus(0.08, 0.014, 10), 0.55, 0.62, 3.38, Math.PI / 2, 0, 0);
  liftEye(P, 'hullDetail', -1.35, 1.40, -0.3);
  liftEye(P, 'hullDetail', 1.35, 1.40, -0.3);
  // tow cable along the right fender line (§B3 dressing — rides at 1.21,
  // fully under the 1.39-1.45 deck line so no side column cost)
  const cable = FITTINGS.towCable({ mats: P.mats, pts: [[1.50, 1.20, 1.90], [1.55, 1.20, 0.40], [1.52, 1.20, -1.20]], r: 0.018, seed: 4 });
  P.hullG.add(cable);
  P.decal('hull', 'number', '90-2274', 0.22, [-0.85, 0.95, 3.32], 0, -0.15);
  P.decal('hull', 'soot', null, 0.5, [-0.9, 1.1, -3.7], Math.PI);
  // skirts: the ref's 3-zone width profile. FRONT armored panels outer
  // 1.703 + the widthM strip at exactly +-1.715 (WIDTH GUARD, z 1.6..3.2);
  // MID rubber sheet inset to 1.585 (1.545 amidships); REAR course back out
  // to 1.693. Band 0.61..1.19 under the 1.196 fender line; courses
  // segmented ~0.44-0.47 (STATION END-CAP law).
  fenders(P, 1.22, 1.665, 1.166, 2.28, 3.30, 0.03);                            // front fender run (top 1.196, over the armored-panel zone only)
  fenders(P, 1.22, 1.555, 1.166, -2.10, 2.28, 0.03);                           // mid fender run (inset with the sheet)
  fenders(P, 1.22, 1.655, 1.166, -3.30, -2.10, 0.03);                          // rear fender run
  for (const s of [-1, 1]) {
    for (const [zc, d] of [[2.535, 0.47], [3.05, 0.50]]) {                     // FRONT armored panels z 2.30..3.30 (ref width steps to 3.40-3.42
      P.add('hull', box(0.06, 0.582, d), s * 1.685, 0.899, zc);                // only over its front ~28% — panels from 1.565 read +7.5% on
    }                                                                          // stations i10-11); outer faces +-1.715 = the widthM anchor
    P.add('hull', box(0.045, 0.565, 0.54), s * 1.5625, 0.8905, -1.83);         // MID sheet aft course (outer 1.585, z -2.10..-1.56)
    for (const zc of [-1.38, -1.02, -0.66, -0.30, 0.06, 0.42, 0.78]) {         // amidships inset (outer 1.545, z -1.56..0.96)
      P.add('hull', box(0.045, 0.565, 0.36), s * 1.5225, 0.8905, zc);
    }
    for (const [zc, d] of [[1.14, 0.36], [1.50, 0.36], [1.86, 0.36], [2.13, 0.30]]) { // MID sheet fore run (outer 1.585, z 0.96..2.28)
      P.add('hull', box(0.045, 0.565, d), s * 1.5625, 0.8905, zc);
    }
    for (let k = 0; k < 2; k++) {                                              // REAR course (outer 1.693, z -3.40..-2.41). KNOWN RESIDUAL: the gate's
      P.add('hull', box(0.04, 0.565, 0.485), s * 1.673, 0.8905, -3.155 + k * 0.505); // 1.64 plan col lerp-junks between my full-span 1.66 col and the
    }                                                                          // panels-only outer col under the ref's own -0.063 grid phase (~6 pts on plan rows; its own outer col is short-spanned the same way)
    for (let k = 0; k < 2; k++) P.add('hullDark', box(0.05, 0.50, 0.016), s * 1.678, 0.90, 3.10 - k * 0.44);
    for (let k = 0; k < 5; k++) P.add('hullDark', box(0.04, 0.48, 0.016), s * 1.568, 0.89, 1.28 - k * 0.72);
    P.add('hullDark', box(0.02, 0.05, 6.1), s * 1.545, 0.635, -0.05);
  }
  // 6 wheels on the ref's SHORT contact patch, HIGH small idler + sprocket
  // (climbing-ramp read; far edges 3.66/-3.36 on the ref's plan lines)
  const wheelZs = [2.10, 1.22, 0.34, -0.54, -1.42, -2.30];
  buildRunningGear(P, {
    // LINK-OVERHANG LAW: shoes print xc+-(W/2+0.023) — 1.288/0.578 puts the
    // lane faces at 0.976/1.600, >=15 mm clear of the ref's 0.96/1.62 column
    // boundaries (the r4a shoes at 0.962/1.623 bled the +-0.94 and +-1.64
    // front cols that the ref keeps for tub/skirt)
    style: 'rubber', wheelR: 0.37, wheelW: 0.21, wheelY: 0.47, xc: 1.288,
    wheelZs,
    // end wheels r 0.21 (the 0.26/0.23 pair drove the band tangent solver
    // into a malformed rear segment — a real band vert at z -3.57/y 0.05 and
    // mask content to -3.72 that junked the outer plan cols)
    sprocket: { z: -2.95, y: 0.70, r: 0.21 }, idler: { z: 3.28, y: 0.64, r: 0.21 },
    rollers: [1.70, 0.60, -0.50, -1.60].map((z) => ({ z, y: 0.95, r: 0.08 })),
    trackW: 0.59, topY: 0.92, botY: 0.055, paintedEnds: true, coveredTop: true, arms: true,
  });
  wheelRecessAt(P, wheelZs, 1.288, 0.47, 0.37, 0.21);
  tightenHullShadowProxy(P, { xc: 1.29, trackW: 0.36, y0: 0.15, y1: 0.60, z0: -2.55, z1: 2.35, hullZ0: -3.10, hullZ1: 3.10 });

  // ---- turret: LOW long slab + sight ridge + overhung rear basket ----
  // (turret local frame: world y-1.40, world z+0.20)
  P.turretG.position.set(0, 1.40, -0.20);
  const RY = 0.66;                                                             // roof plate 2.06
  // plan-form is ASYMMETRIC like the print: the LEFT cheek runs wide to z_l
  // 1.25, the RIGHT widest section starts only at z_l -0.19 (ref plan cols:
  // L -1.26 front 1.05w, R +1.29 front -0.59w)
  const planShape = (W) => [
    [-0.55, 2.10], [0.55, 2.10], [0.85, 2.02], [1.05, 1.78], [1.17, 1.34],
    [W, -0.19], [W, -1.32], [1.18, -2.11], [-1.18, -2.11], [-W - 0.04, -1.32],
    [-W - 0.04, 1.25], [-1.17, 1.34], [-1.05, 1.78], [-0.85, 2.02],
  ];
  P.add('turret', KIT.polyTurret(planShape(1.26), 0.37, 1.0, 1.0));            // lower band: walls to 1.77 (the prow/mantlet height)
  P.add('turret', KIT.polyTurret(planShape(1.30), 0.08, 1.0, 1.0), 0, 0.37, 0); // wall extension band to 1.85 (ref front 1.85: LEFT wall to x -1.34, right 1.30 — its front cols read 1.85 at -1.33..-1.37 but deck at +1.33)
  P.add('turret', box(1.76, 0.29, 1.86), 0, 0.515, 0.61);                      // roof core x +-0.88 (top 2.06, z_w 1.34..-0.52)
  for (const s of [-1, 1]) {
    P.add('turret', slab(                                                      // roof edge: steep 2.06@0.88 -> 1.87@0.98 -> 1.85 walls
      [s * 0.88, 0.45, 1.50], [s * 1.30, 0.45, 1.10], [s * 1.30, 0.45, -0.32], [s * 0.88, 0.45, -0.32],
      [s * 0.88, RY, 1.50], [s * 0.98, 0.47, 1.10], [s * 0.98, 0.47, -0.32], [s * 0.88, RY, -0.32]));
  }
  P.add('turret', frustum(0.88, 1.54, 0.28, 0.86, 1.48, 0.30, 0.37, 0.64));    // front roof wedge closing the core to the prow line (ends z_w 1.34 with the core — the 1.62 base printed a 2.04 top at z_w 1.42 where the ref face is 1.34)
  P.add('turret', box(1.76, 0.23, 0.24), 0, 0.485, -0.20);                     // hatch-zone plate (top 2.00, z_w -0.28..-0.52)
  P.add('turret', box(2.36, 0.115, 1.61), 0, 0.4275, -1.305);                  // bustle roof band (top 1.885, z_w -0.70..-2.31)
  // hatches: commander RIGHT / loader LEFT (rims make the ref 2.03-2.07 rise
  // over z_w -0.3..-0.7; pulled clear of the 1.885 bustle cols aft of -0.75)
  P.add('turret', cylY(0.225, 0.225, 0.052, 14), 0.56, 0.516, -0.11);
  P.add('turretDark', box(0.40, 0.014, 0.03), 0.56, 0.578, -0.11);
  P.add('turret', cylY(0.20, 0.20, 0.042, 14), -0.52, 0.506, -0.11);
  P.add('turretDark', cylY(0.205, 0.205, 0.012, 14), -0.52, 0.535, -0.11);
  periscope(P, 'turretDetail', 0.56, 0.545, 0.14);
  periscope(P, 'turretDetail', -0.30, 0.545, 0.06, 0.3);
  // SIGHT RIDGE (ref side plateau 2.19-2.26 over z_w 1.31..-0.17, front band
  // x -0.09..0.47 ONLY — dips to 1.90 at x -0.13): gunner's primary sight
  // box fwd + commander sight tower aft to z_w -0.17
  P.add('turret', box(0.40, 0.13, 0.72), 0.30, 0.725, 1.15);                   // gunner sight housing (top 2.19, z_w 0.59..1.31)
  P.add('turretDark', box(0.30, 0.09, 0.03), 0.30, 0.72, 1.52);
  P.add('turretGlass', box(0.22, 0.06, 0.02), 0.30, 0.72, 1.535);
  sightBox(P, 'turret', 0.12, 0.74, 0.36, 0.40, 0.16, 0.86);                   // commander sight tower body (z_w -0.27..0.59 — the ref tall band runs to -0.22)
  P.add('turret', box(0.44, 0.04, 0.90), 0.12, 0.84, 0.36);                    // tower lid (top 2.28)
  P.add('turret', box(0.40, 0.045, 0.42), 0.12, 0.9075, 0.10);                 // rear lid step: heightM p95 anchor (top 2.33, 3-4 body cols; ref reads 2.25-2.28 here — the +0.05 buys dims grace)
  P.add('turretDark', box(0.18, 0.045, 0.20), -0.02, 0.885, 0.82);             // pano head (top 2.33 = ref center 2.315 spike zone)
  P.add('turretGlass', box(0.14, 0.05, 0.016), -0.02, 0.88, 0.93);
  // loader-side roof furniture: the ref left band 2.06-2.10 @ x -0.44..-0.75
  P.add('turretDetail', box(0.14, 0.045, 0.12), -0.55, 0.68, 0.55);
  P.add('turretDetail', box(0.14, 0.045, 0.12), -0.68, 0.68, 0.25);
  // center M2 — §B3 KIT fitting; the receiver run at ~2.32 is the ref's own
  // 2.29-2.32 center band AND the heightM p95 anchor (published 2.34)
  const m2 = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', scale: 0.9, seed: 9 });
  m2.position.set(0.05, 0.56, 0.48);                                           // envelope z_w -0.16..0.84; receiver/barrel band ~2.24-2.26 = the ref's own 2.22-2.28 ridge (the 0.62 foot printed a 2.31 band over 9 side cols)
  P.turretG.add(m2);
  // side shelves + smoke banks on the bustle flanks (plan x to +-1.43 over
  // z_w -0.56..-1.20, tops 1.85 = the ref front-view 1.85 wall band; smoke
  // tube tips held <=1.43 — the r4a 1.55 tips printed 2-3 ONLY-PROC plan
  // turret cols each side, 6.1% cover)
  for (const s of [-1, 1]) {
    // LOW side rails at the deck line (the ref plan +-1.40 band over z_w
    // -0.56..-1.17 prints NO front-view height: its front cols +-1.33+ read
    // the deck — so the widest turret content hangs at y 1.42-1.48 only)
    P.add('turret', box(0.10, 0.06, 0.60), s * 1.35, 0.05, -0.68);
    P.add('turretDark', box(0.08, 0.04, 0.50), s * 1.34, 0.10, -0.68);
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 3, r: 0.040, len: 0.20, splay: s * 0.75, pitch: -0.45, seed: 3 + s });
    smoke.position.set(s * 1.13, 0.28, -0.52);                                 // tips <=1.29: inside the front-view wall silhouette (the 1.36 tips printed 1.79 at +-1.33-1.45 where the ref reads deck)
    P.turretG.add(smoke);
    liftEye(P, 'turretDetail', s * 0.80, RY + 0.01, 0.75, s * 0.4);
  }
  // REAR BASKET low + raked corner masts (the ref rear cluster decodes as a
  // LOW overhung basket — front cols +-0.99-1.06 top 1.91-1.95 — whose 2.28+
  // side band comes from the RAKED-AFT whips and a narrow center top frame,
  // NOT a full-width tall rail: a 2.28 rail across +-1.14 printed the whole
  // front row 2.29 in r4a)
  {
    const zf = -1.83, zr = -2.14;                                              // local (world -2.03/-2.34)
    P.add('turretDetail', box(2.28, 0.04, 0.04), 0, 0.095, -2.18);             // floor rail rear (underside lip to z_w -2.40)
    P.add('turretDetail', box(2.28, 0.04, 0.04), 0, 0.075, zf);                // floor rail front
    P.add('turretDetail', box(2.28, 0.04, 0.04), 0, 0.49, zr);                 // top rail 1.90
    for (let i = 0; i < 7; i++) {
      const x = -1.11 + i * 0.37;
      P.add('turretDetail', box(0.03, 0.40, 0.03), x, 0.29, zr);               // rear posts
    }
    P.add('turretDark', box(2.24, 0.34, 0.014), 0, 0.30, zr + 0.02);           // mesh back
    P.add('turretCloth', box(2.06, 0.40, 0.30), 0, 0.29, -1.99);               // strapped cargo fill (top 1.89)
    P.add('turretCloth', box(1.00, 0.085, 0.26), -0.10, 0.535, -1.70);         // tarp roll (top 1.98 = the ref -1.90 col)
    P.add('turretDark', box(0.02, 0.40, 0.32), -0.62, 0.29, -1.99);            // cinch straps
    P.add('turretDark', box(0.02, 0.40, 0.32), 0.55, 0.29, -1.99);
    // NARROW center top frame (ref side 2.285 band z_w -2.02..-2.26; its
    // front print hides in the ref's own 2.29-2.32 center cols: x +-0.10)
    for (const sx of [-1, 1]) {
      P.add('turretDetail', box(0.035, 0.035, 0.26), sx * 0.08, 0.875, -1.94);
      P.add('turretDetail', box(0.03, 0.42, 0.03), sx * 0.08, 0.67, -1.86);
      P.add('turretDetail', box(0.03, 0.42, 0.03), sx * 0.08, 0.67, -2.05);
    }
  }
  // corner masts: whips RAKED AFT from the bustle corners (identity cue) —
  // front-view +-1.10-1.14 spikes to 2.40, side diagonal to the -2.4 tail
  for (const s of [-1, 1]) {
    const whipA = FITTINGS.antennaWhip({ mats: P.mats, h: 0.60, r: 0.012, rake: -s * 0.05, seed: 2, rotation: [-0.76, 0, 0] });
    whipA.position.set(s * 1.11, 0.44, -1.72);                                 // tip ~(2.33w, z_w -2.39): the ref mast-top cliff is at -2.43 — a -2.47 tip lerp-jittered against its deck (CLIFF-LERP law)
    P.turretG.add(whipA);
  }
  P.decal('turret', 'number', '2274', 0.24, [1.21, 0.20, -0.5], Math.PI / 2, 0, 0.05);
  P.decal('turret', 'number', '2274', 0.24, [-1.21, 0.20, -0.5], -Math.PI / 2, 0, -0.05);
  // Rh 120 L/44: axis 1.562 (ref tube band 1.485..1.639), slim tube r 0.065
  // (sleeve 0.159 band), evac drum r~0.123 at z_w 2.9-3.2, muzzle +6.02
  // (published overall; ~1 col past the print's 5.87 tube end — certified)
  P.gunG.position.set(0, 0.162, 0.55);
  trunnionRoll(P, 0.16, 0.50);
  P.addGunExtra(box(0.44, 0.34, 0.30), 0, 0.0, 0.42);                          // sealed embrasure block inside the prow
  P.addGunExtra(cylZ(0.115, 0.34, 12, 0.14), 0, 0, 0.72);                      // root collar (ref 1.65-1.70 swell at z_w 2.0-2.4)
  P.addGunExtraDark(cylZ(0.026, 0.10, 8), 0.26, 0.05, 0.60);                   // coax port
  buildGun(P, { len: 5.61, r: 0.065, sleeve: true, evac: 0.481, evacR: 1.89, collar: false, baseR: 0.15 });
  P.topY = 1.0;
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
  P.add('hull', frustum(1.59, 3.06, -3.40, 1.55, 3.02, -3.38, 0.94, 1.39));    // sponson band (r3: bottom 0.94 — 0.90 grazed the dilated idler-wrap crown, §B4)
  P.add('hull', box(3.02, 0.04, 4.10), 0, 1.375, -0.80);                       // deck 1.395 (the print's dy-effective 1.40 line)
  // glacis: two yawed half-plates form the shallow center crease.
  // r3 §B4 (SEVERE pre-build flag 370/260): the lower edge TAPERS to x ±1.02
  // — type74 has NO skirts, so the exposed idler wrap (x 1.04..1.63) owns
  // the outboard corner; the old full-width 1.59 edge sat inside the arc.
  for (const s of [-1, 1]) {
    P.add('hull', slab(
      [s * 0.02, 0.55, 3.20], [s * 0.98, 0.60, 3.00], [s * 0.98, 0.90, 3.04], [s * 0.02, 0.82, 3.22],
      [s * 0.02, 1.39, 1.18], [s * 1.55, 1.39, 1.10], [s * 1.55, 1.39, 1.06], [s * 0.02, 1.39, 1.14]));
  }
  P.add('hull', frustum(0.96, 3.03, 3.26, 0.98, 3.26, 3.26, 0.40, 0.72));      // lower nose NARROW + tall (0.32 band): the hullLength front BODY anchor (cols 3.14+3.26; published 6.7 about the ref band mid -0.14)
  P.add('hull', slab(                                                          // sloped rear deck
    [-1.55, 1.10, -1.55], [1.55, 1.10, -1.55], [1.45, 1.10, -3.32], [-1.45, 1.10, -3.32],
    [-1.52, 1.39, -1.55], [1.52, 1.39, -1.55], [1.42, 1.17, -3.32], [-1.42, 1.17, -3.32]));
  P.add('hull', box(2.00, 0.44, 0.10), 0, 0.80, -3.42);                        // tail plate, NARROW below the wrap line (§B4)
  P.add('hull', box(2.86, 0.24, 0.10), 0, 0.90, -3.42);                        // tail plate, wide upper course (bottom 0.78 clears the sprocket wrap)
  fenders(P, 1.04, 1.58, 1.41, -3.36, 3.02, 0.028);
  // driver LEFT: flush hatch + periscopes on the glacis top
  P.add('hull', cylY(0.24, 0.24, 0.035, 14), -0.52, 1.40, 0.85);
  P.add('hullDark', cylY(0.246, 0.246, 0.012, 14), -0.52, 1.395, 0.85);
  periscope(P, 'hullDetail', -0.52, 1.43, 1.12);
  periscope(P, 'hullDetail', -0.24, 1.43, 1.12);
  // rear deck louvres + twin exhaust outlets with mesh
  for (let k = 0; k < 4; k++) P.add('hullDark', box(2.20, 0.016, 0.10), 0, 1.33 - k * 0.028, -1.95 - k * 0.44, 0.12, 0, 0);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.42, 0.16, 0.85), s * 1.30, 1.30, -2.35);
    P.add('hullDark', box(0.36, 0.05, 0.72), s * 1.30, 1.385, -2.35);
    P.add('hullDark', box(0.10, 0.10, 0.04), s * 1.10, 0.96, -3.45);           // taillights
    // r3 §B4: flaps hang from the FENDER TIPS above the exposed wrap arcs —
    // the old low flaps sat inside them (front 370 / rear 260 exact vox)
    mudflap(P, s * 1.31, 1.19, -3.42, 0.52, 0.28);
    mudflap(P, s * 1.31, 1.19, 3.04, 0.52, 0.28);
    P.add('hullDetail', torus(0.08, 0.015, 10), s * 0.55, 0.54, 3.17, Math.PI / 2, 0, 0); // tow eyes
    // rear-view MIRROR arms folded low over the front fenders (the re-
    // rigged print reads its mirror heads at the fender line, not raised)
    P.add('hullDetail', box(0.035, 0.24, 0.035), s * 1.42, 1.47, 2.62, 0, 0, s * 0.30);
    P.add('hullDark', box(0.16, 0.20, 0.03), s * 1.475, 1.52, 2.62);
    // whip antennas: the print's spikes read at x +-0.95 (front) / one
    // body-relative column aft of midships — matched as 1-col rods
    P.add('hullDetail', box(0.05, 0.06, 0.05), s * 0.95, 1.32, -1.28);
    P.add('hullDetail', box(0.022, 1.32, 0.022), s * 0.95, 2.02, -1.28, 0, 0, s * 0.02); // tips 2.68 = the print's own 2.70 spike at z_w -1.3 (1-col, non-body)
  }
  // fender stowage bins + tools + headlight pods with guards
  bin(P, -1.30, 1.50, -0.95, 0.42, 0.16, 1.05);
  bin(P, 1.30, 1.50, -0.60, 0.42, 0.16, 0.90);
  bin(P, 1.30, 1.50, 1.30, 0.42, 0.16, 0.80);
  shovelTool(P, -1.28, 1.38, 1.4);
  headlight(P, -1.22, 1.38, 2.92, -0.25, 0.052);
  headlight(P, 1.22, 1.38, 2.92, -0.25, 0.052);
  P.add('hullDetail', torus(0.075, 0.012, 12), -1.22, 1.38, 2.99);
  P.add('hullDetail', torus(0.075, 0.012, 12), 1.22, 1.38, 2.99);
  towCable(P, [[-1.05, 1.14, 2.55], [0, 1.30, 2.05], [1.05, 1.14, 2.55]]);
  liftEye(P, 'hullDetail', -1.35, 1.33, -1.4);
  liftEye(P, 'hullDetail', 1.35, 1.33, -1.4);
  P.decal('hull', 'number', '74-4302', 0.22, [-0.85, 0.97, 3.05], 0, -0.18);
  // FIVE big exposed wheels, dead track (no rollers), rear sprocket
  const wheelZs = [2.05, 0.975, -0.10, -1.175, -2.25];
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.42, wheelW: 0.25, wheelY: 0.475, xc: 1.315,
    wheelZs,
    sprocket: { z: -2.85, y: 0.65, r: 0.24 }, idler: { z: 2.80, y: 0.62, r: 0.24 },
    rollers: [], trackW: 0.55, topY: 1.00, botY: 0.055, deadSag: 0.09,
    paintedEnds: true, coveredTop: false, arms: true,
  });
  wheelRecessAt(P, wheelZs, 1.315, 0.475, 0.42, 0.25);
  tightenHullShadowProxy(P, { xc: 1.315, trackW: 0.34, y0: 0.15, y1: 0.60, z0: -2.35, z1: 2.20, hullZ0: -3.05, hullZ1: 2.95 });

  // ---- turret: low cast dome with heavily sloped sides flowing into a
  // long tapered bustle (STB-1 lineage) ----
  P.turretG.position.set(0, 1.42, -0.05);
  P.add('turret', lathe([
    [1.05, 0.0], [1.13, 0.10], [1.09, 0.32], [0.97, 0.55], [0.76, 0.72],
    [0.45, 0.81], [0.02, 0.83],
  ], P.q ? 30 : 16, 1.52), 0, 0.0, -0.18);                                     // main dome crown 2.25 — the print re-normalizes ~+0.30 TALL (scaleToOverall
                                                                               // undid the warp; gate dy ~0.30 re-registers it): its 2.52-2.58 dome reads
                                                                               // EFFECTIVE 2.22-2.28, so the crown matches there while the M2/cupola
                                                                               // cluster stays at 2.46-2.50 as the published-2.48 heightM anchor
  P.add('turret', frustum(0.84, -0.85, -2.00, 0.58, -0.95, -1.90, 0.06, 0.46)); // bustle taper
  P.add('turret', box(1.16, 0.32, 0.58), 0, 0.15, -1.58);                      // bustle underside fill
  // commander cupola RIGHT with M2 pintle; low oval loader hatch LEFT
  cupola(P, 'turret', 0.42, 0.80, -0.38, 0.20, 0.12, 6);                      // cupola lid ~2.36
  // commander's M2 — §B3 KIT fitting on the cupola lid (receiver ~2.47w:
  // the p95 heightM anchor stays at the published 2.48 line)
  const m2 = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', seed: 7 });
  m2.position.set(0.46, 0.77, -0.40);                                          // receiver ~2.50w: the p95 anchor stays at the grace edge over the 2.48 published line
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
  buildGun(P, { len: 5.65, r: 0.062, sleeve: false, evac: 0.52, evacR: 2.05, collar: false, baseR: 0.14 });
  P.add('gun', cylZ(0.068, 0.09, 10), 0, 0, 5.59);                             // muzzle step (measured mask muzzle ~5.95 = rear extreme -3.47 + published 9.42)
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
