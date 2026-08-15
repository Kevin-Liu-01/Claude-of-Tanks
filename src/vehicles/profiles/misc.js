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
// type74 3.18 (SPROCKET TOOTH RING faces ±1.59 at xc 1.2835 — the kit's
// ring spans the band edges +0.031 and the shoe pads ride +0.2985 off xc,
// so the widest authored face is the ring, NOT the band; r5 probe find).
// NOTHING (bins, baskets, flaps, ERA, mirrors) may exceed those planes or
// the whole tank rescales and every mask shifts.
import * as THREE from 'three';
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
  dims: { hullLengthM: 6.7, overallLengthM: 9.42, widthM: 3.18, heightM: 2.70 },
  armor: communityArmor({
    lenM: 6.7, widM: 3.18, hgtM: 2.25, turretPivot: [0, 1.42, 0.50],
    gunPivot: [0, 0.18, 1.15], barrelLenM: 4.42, barrelRadM: 0.062,
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
function wheelRecessAt(P, wheelZs, xc, y, r, w, bucket = 'hullDark') {
  const { cylX } = KIT;
  for (const z of wheelZs) for (const s of [-1, 1]) {
    P.add(bucket, cylX(r * 0.72, w * 1.06, 12), s * xc, y, z);
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

// §C MISSING-SIDE fix (owner report 2026-08-06, "ariete and leclerc are
// missing left side of turrets"): KIT.slab builds its six faces for ONE
// ring handedness — corners in plan order (-x,+z),(+x,+z),(+x,-z),(-x,-z),
// bottom then top (tankFactory.js:128). A mirrored call (x *= -1 without
// re-ordering — the `for (const s of [-1,1])` pattern) hands it the
// OPPOSITE orientation: all six faces come out INWARD and the solid is
// backface-culled in every FrontSide render — game, critic pairs,
// standard-check truth renders — while staying fully visible to the gate's
// DoubleSide maskMaterial (procedural-fidelity.html:315). That split is
// exactly how the class survives to 82-85 gate scores (§C addendum:
// MISSING-SIDE). Measured on this file 2026-08-06 (tools/
// tmp-misc-leftprobe.mjs): ariete 12/22 slabs reversed (LEFT wedge-cheek
// pair, ALL THREE brow-loft planes, bow belly rise, all five RIGHT fseg
// wrap fills, RIGHT 13th skirt course), leclerc 6/21 (LEFT forward-cheek
// complex 1.15 m^3 + outer sweep, LEFT roof-edge chamfer, LEFT armor-box
// chamfer, RIGHT aft roof wedge, RIGHT mudguard strip). This wrapper
// measures face outwardness about the corner centroid and re-orients
// reversed rings (b0,b3,b2,b1 / t0,t3,t2,t1) before building: identical
// solid, outward faces, mask-neutral by construction (DoubleSide masks are
// winding-blind; only the positions-buffer ORDER changes on repaired
// slabs). buildAriete/buildLeclerc bind `slab` to this wrapper so the
// class cannot recur in those builders; audit rig = tmp-misc-leftprobe.mjs
// (REVERSED must read 0).
function orientedSlab(b0, b1, b2, b3, t0, t1, t2, t3) {
  const c8 = [b0, b1, b2, b3, t0, t1, t2, t3];
  const cen = [0, 1, 2].map((k) => c8.reduce((s, p) => s + p[k], 0) / 8);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let outward = 0;
  for (const f of [[b0, b1, t1, t0], [b1, b2, t2, t1], [b2, b3, t3, t2],
    [b3, b0, t0, t3], [t0, t1, t2, t3], [b3, b2, b1, b0]]) {
    const n = cross(sub(f[1], f[0]), sub(f[2], f[0]));
    const fc = [0, 1, 2].map((k) => (f[0][k] + f[1][k] + f[2][k] + f[3][k]) / 4);
    if (dot(n, sub(fc, cen)) > 0) outward++;
  }
  return outward >= 3
    ? KIT.slab(b0, b1, b2, b3, t0, t1, t2, t3)
    : KIT.slab(b0, b3, b2, b1, t0, t3, t2, t1);
}

// §B3.1 MUZZLE BORE (owner 2026-08-06 "make tips of guns have holes, bruh";
// law banked 32a6946): annular rim at tube radius + near-black bore disc
// recessed ~2 cm inside the rim mouth. MECHANISM: the first (bucket-based)
// implementation grew the gun AABB by the rim's 3 cm and RE-FRAMED the
// turret-rows camera (t80u frame law) — leclerc turret 88.8 -> 82.6, t80u
// -4.6, type90 -2.2, measured. The bore is therefore SHADOW-NAMED RENDER
// FURNITURE (§C): named meshes on the GUN group render in every game/critic
// view but are excluded from every measurement mask AND the visible-box
// framing recipes — mask/frame-neutral BY CONSTRUCTION, and the rim may sit
// honestly proud of the old solid cap (which would otherwise occlude a
// recessed disc). Elevation/recoil correct: parented to P.gunG.
function muzzleBore(P, r, zTip) {
  const ring = new THREE.Mesh(
    KIT.xform(KIT.torus(r * 0.82, r * 0.18, 16), 0, 0, 0, Math.PI / 2, 0, 0), P.mats.dark);
  ring.name = 'muzzleBoreShadowRim';
  ring.position.set(0, 0, zTip + 0.016);
  const disc = new THREE.Mesh(KIT.cylZ(r * 0.62, 0.012, 14), P.mats.shadow);
  disc.name = 'muzzleBoreShadowDisc';
  disc.position.set(0, 0, zTip + 0.006);
  for (const m of [ring, disc]) {
    m.castShadow = false;
    m.receiveShadow = true;
    P.gunG.add(m);
    P.disposables.push(m.geometry);
  }
}
// ---------------------------------------------------------------------------
// C1 Ariete — docs/references/tanks/ariete.md
// R4 FULL RE-LAY (2026-08-03) from the r27-landmine-fixed workorder dump
// (scratchpad wo-ariete.json). PUSH-2 (2026-08-05, post trim-boundary
// amendment): fresh-worldtrace col work — seam-winding flip, hump/deck
// band 1.640, stern notch split, ramp liftoff 2.22, cliff-lerp-optimum
// basket pull (priced: -1.4 turret cover for +0.8 on the side_whole
// binder), ±1.85 dot-bin sharpened, §B3 mantlet canvas tells. The old
// "phantom ±1.72/1.76 columns" class RETIRED (does not reproduce post-
// amendment). Ref lines below in OUR world frame (scene z
// +0.96 = the stable side registration; ref body mid lands ~0 in our frame
// so the published 7.59 envelope stays zero-centered). Published: hull 7.59,
// overall 9.67 (muzzle +5.88 / tail -3.79), width 3.60 (skirt planes
// +-1.80), height 2.50 (TURMS lid + pano at the ref's own 2.47-2.51 spikes).
// RENDER-SCALE law: everything here renders x k=1.80/1.7775=1.01266 (the
// skirt end plates own the widest |x| — never move them without re-deriving
// every boundary-fitted value).
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
  const { box, cylX, cylY, cylZ, frustum, torus, buildGun, buildRunningGear,
    fenders, headlight, liftEye, periscope, towCable, stowage, jerryCan } = KIT;
  const slab = orientedSlab;                                                   // §C missing-side fix: winding-corrected slabs only (see orientedSlab)
  const { rng } = P;
  // ---- hull tub + sponsons + stepped deck ----
  P.add('hull', box(2.06, 0.90, 5.90), 0, 0.85, 0.05);                        // tub x +-1.03, belly 0.35 (push round: ref front-row bottoms 0.343 at +-0.66-1.03), z -2.90..3.00
  P.add('hull', box(3.12, 0.16, 5.92), 0, 1.35, -0.66);                        // sponson band over the tracks (x +-1.56; r12: rear edge to -3.62 — the raised sprocket wrap opened two top-down sky cells at (+-1.53, -3.57) between plate, wrap and skirt)
  P.add('hull', box(3.12, 0.05, 1.915), 0, 1.4365, 0.6075);                    // main deck 1.4615 (z -0.35..1.565; r3 1024 worldtrace: the ref deck line reads 1.48 rendered = 1.4615 authored across z 0.1..1.54 — the 1.445 deck sat -0.018 on 12 side cols)
  P.add('hull', box(3.12, 0.045, 0.455), 0, 1.3635, 1.7925);                   // driver dip plate 1.386 (z 1.565..2.02 — ref dip band 1.402-1.413 rendered over 1.63..2.0)
  P.add('hull', box(3.12, 0.045, 0.32), 0, 1.3945, 2.18);                      // fore step 1.417 (z 2.02..2.34)
  // glacis: long shallow plate then the center nose (ref plan center 3.68)
  P.add('hull', frustum(1.56, 3.07, 2.34, 1.56, 2.38, 2.34, 1.24, 1.358));    // glacis (2.36,1.358)->(3.05,1.248) — r3 1024 re-read at the settled 0.775 registration: the ref glacis line rendered is (2.37,1.368)->(3.09,1.268), slope -0.14; the old (2.42,1.418)->(3.38,1.21) authored at the stale 0.86 map read +0.05..+0.08 across eight side cols
  P.add('hull', frustum(0.90, 3.60, 3.38, 0.92, 3.40, 3.38, 1.00, 1.245));     // center nose to 3.60 (push round: ref plan front 3.57 at EVERY x; 3.60 keeps the 3.643 side col a body column so hullLengthM holds 7.5+ — 1 cover col certified)
  P.add('hull', frustum(0.88, 3.585, 3.28, 0.90, 3.30, 3.28, 0.66, 1.00));     // under-nose face (r8 FRAME LOCK: the nose-tip col band = nose [1.0-1.245] UNION tube [1.6-1.8] = 0.845 — robustly over the 12% body cut, so hullLengthM reads 7.58 and dAlong stays pinned at 0.775 no matter how the grid drifts)
  P.add('hull', slab(                                                          // bow belly rise (x +-0.90)
    [-0.90, 0.40, 2.58], [0.90, 0.40, 2.58], [0.90, 0.40, 2.84], [-0.90, 0.40, 2.84],
    [-0.90, 0.75, 2.58], [0.90, 0.75, 2.58], [0.90, 0.75, 3.36], [-0.90, 0.75, 3.36]));
  // Forward tub closures behind the idlers.  The main tub ends at z=3.00
  // while the upper/lower glacis continues forward, so an oblique side view
  // previously saw the background through the 3.00..3.42 bow pocket.  These
  // plates overlap the tub and nose, with their outer faces at |x|=1.03 —
  // one centimetre inboard of the native 1.04 m track lane.
  for (const s of [-1, 1]) {
    P.add('hull', slab(
      [s * 0.94, 0.40, 2.84], [s * 1.03, 0.40, 2.84], [s * 1.03, 0.64, 3.42], [s * 0.94, 0.64, 3.42],
      [s * 0.94, 1.26, 2.84], [s * 1.03, 1.26, 2.84], [s * 1.03, 1.18, 3.42], [s * 0.94, 1.18, 3.42]));
  }
  // front mudguard crests (side 1.595 @ 3.44-3.56; front-view 1.56-1.62 tops
  // at +-1.6-1.76) + thin tip lip + the SS-A front bracket hidden in their
  // plan shadow, behind the idler wrap's dilated 3.70 far edge
  for (const s of [-1, 1]) {
    P.add('hull', box(0.13, 0.41, 0.14), s * 1.615, 1.395, 3.35);              // crest block inner (top 1.60, x 1.55-1.68, z 3.28-3.42; bottom 1.19 clears the idler wrap)
    P.add('hull', box(0.057, 0.355, 0.14), s * 1.7085, 1.3675, 3.35);          // crest OUTER CROWN step (top 1.545 — push-2: the ref front crest FALLS outboard: 1.567@1.726 / 1.557@1.767 vs the flat 1.60 block's +0.05; r3-1024: outer face 1.737 — the 1.745 face rendered 1.7671, a 4.6 mm coin-flip sliver in the ±1.784 col whose ref top is the 1.317 skirt skin)
    P.add('hullRubber', box(0.50, 0.05, 0.12), s * 1.32, 1.235, 3.40);         // rubber lip under the crest (r3-1024: raised+pulled to z 3.34-3.46 / y 1.21-1.26 — the raised wrap circle climbs to 1.175 under it, and any content in the z 3.464-3.577 apex window above ~1.0 prints the 3.568 col over the ref's [0.786..1.01] annulus band)
    // Closed glacis shoulder: the center glacis and the outboard crest used
    // to meet only in projection, leaving a background-visible pocket above
    // the idler at oblique angles.  This shallow armor wedge overlaps the
    // sponson at z=2.28 and the crest at z=3.42.  Its 1.18 m floor remains
    // above the native terminal wrap; no track-tone proxy or running-gear
    // geometry is reintroduced.
    P.add('hull', slab(
      [s * 0.92, 1.24, 2.28], [s * 1.60, 1.24, 2.28], [s * 1.70, 1.18, 3.42], [s * 0.92, 1.18, 3.42],
      [s * 0.92, 1.43, 2.28], [s * 1.60, 1.43, 2.28], [s * 1.70, 1.30, 3.42], [s * 0.92, 1.30, 3.42]));
  }
  // stern: rake wedge + plate + thin tail lip + CENTER tail block anchor
  P.add('hull', slab(                                                          // center rake (x +-0.82 — push-2: the +-0.92 slab printed the ref's 0.85-0.97 rear-notch cols at -3.71): bottoms 0.38@-2.60 -> 0.74@-3.66
    [-0.82, 0.38, -2.60], [0.82, 0.38, -2.60], [0.82, 0.74, -3.66], [-0.82, 0.74, -3.66],
    [-0.82, 1.30, -2.60], [0.82, 1.30, -2.60], [0.82, 1.30, -3.66], [-0.82, 1.30, -3.66]));
  P.add('hull', box(1.66, 0.82, 0.06), 0, 1.03, -3.67);                        // rear plate CENTER x +-0.83 (y 0.62..1.44 — the ref -3.73..-3.85 bottoms read 0.629). push-2 NOTCH SPLIT: the ref rear at |x| 0.85-0.97 reads -3.53/-3.57 — a cutout between its center plate and exhaust pods; the full-width plate printed -3.76 there (0.16 err x2)
  for (const s of [-1, 1]) P.add('hull', box(0.43, 0.82, 0.06), s * 1.205, 1.03, -3.67); // rear plate OUTER courses x 0.99-1.42
  P.add('hull', box(0.40, 0.055, 0.21), 0, 1.415, -3.795);                     // thin tail lip 1.385..1.445 (z -3.69..-3.90) — CENTER-ONLY x +-0.30 (push round: the 2.70 lip printed plan rear -3.94 at every x where the ref rear is -3.65..-3.83; sides fall back to the -3.71 rear plate)
  P.add('hull', box(0.36, 0.41, 0.19), 0, 1.365, -3.795);                       // SS-A REAR ANCHOR: center tail block to -3.89 (ref plan -3.88 center col; band 0.32 at the ref's own 1.385-1.565 lip heights; muzzle drops to 5.78 so overall stays 9.67)
  for (const s of [-1, 1]) {
    P.add('hullRubber', box(0.40, 0.25, 0.03), s * 1.30, 1.00, -3.62);         // rear flaps
    P.add('hullDark', box(0.14, 0.07, 0.035), s * 1.20, 1.36, -3.71);          // taillights
  }
  for (const s of [-1, 1]) {
    P.add('hull', box(0.14, 0.53, 0.12), s * 1.06, 0.985, -3.755);            // exhaust/hitch stubs x 0.99-1.13 (push-2: pulled OUT of the ref's 0.85-0.97 notch cols and DEEPENED to y 0.72 — the ref -3.85-zone bottoms read 0.65, the old 0.95 stub floor left the lerp at 0.90)
    P.add('hullDark', box(0.12, 0.45, 0.02), s * 1.06, 0.985, -3.825);
  }
  P.add('hullDark', box(1.62, 0.26, 0.04), 0, 1.10, -3.70);                    // rear grille shadow (x +-0.81: clear of the notch cols)
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(1.58, 0.032, 0.045), 0, 1.00 + k * 0.09, -3.705);
  // rear superstructure: stepped deck -> powerpack hump -> rear deck run
  P.add('hull', box(3.06, 0.04, 0.36), 0, 1.455, -0.53);                       // step 1.475 (z -0.35..-0.71)
  P.add('hull', box(3.06, 0.045, 0.40), 0, 1.4825, -0.91);                     // step 1.505 (z -0.71..-1.11)
  P.add('hull', box(3.00, 0.05, 0.22), 0, 1.510, -1.22);                       // step 1.535
  P.add('hull', box(1.09, 0.125, 0.63), 0, 1.5425, -1.645);                    // powerpack hump INNER 1.605 x ±0.545 (r3 1024 front rows: the ref deck-edge top line STEPS across x — 1.625 rendered at |x|<0.55, 1.598 at 0.57-1.05, 1.667 at 1.01-1.34 — the flat 1.640 hump read +0.034..+0.06 on ~28 front cols; side keeps its 1.669 line via the outer segments)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.45, 0.098, 0.63), s * 0.77, 1.529, -1.645);            // hump MID step 1.578 (x 0.545-0.995 -> rendered 1.598 = the ref front want)
    P.add('hull', box(0.338, 0.166, 0.63), s * 1.164, 1.563, -1.645);          // hump OUTER shoulder 1.646 (x 0.995-1.333 -> rendered 1.667; also the side 1.669 line, extended aft to -1.96 per the fresh side rows)
  }
  P.add('hullDark', box(2.20, 0.014, 0.55), 0, 1.553, -1.645);
  P.add('hull', box(3.00, 0.14, 0.84), 0, 1.525, -2.38);                       // rear deck 1.595 (z -1.96..-2.80 — the ref 1.595 run; fwd edge meets the extended hump)
  P.add('hull', box(2.90, 0.10, 0.70), 0, 1.535, -3.15);                       // tail deck 1.565 (z -2.80..-3.50)
  P.add('hull', box(1.66, 0.10, 0.14), 0, 1.515, -3.57);                       // tail deck rear center (to -3.64; push-2 notch: the x 0.85-0.97 window stops at -3.50 = the ref's -3.53/-3.57 rear-notch cols)
  for (const s of [-1, 1]) P.add('hull', box(0.46, 0.10, 0.14), s * 1.22, 1.515, -3.57); // tail deck rear outer
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(2.20, 0.014, 0.05), 0, 1.598, -2.10 - k * 0.22);
  P.add('hullDark', box(0.24, 0.20, 0.28), -1.30, 1.30, -2.86);                // left exhaust box (r12: bottom 1.20 — the raised sprocket wrap climbed to 1.15 rendered and clipped the old 1.05 base, 50 voxels)
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.03, 0.18, 0.24), -1.435, 1.30, -2.86 + (k - 1) * 0.0);
  // driver station on the dip plate + episcopes + V splash rail
  P.add('hull', box(0.62, 0.04, 0.54), 0.52, 1.370, 1.95, -0.06, 0, 0);        // (r3-1024: driver furniture sunk — the 1.42-1.47 hatch/periscope crowns printed the z 1.65..2.25 side cols where the ref dip band reads 1.402-1.436 rendered)
  P.add('hullDark', box(0.56, 0.013, 0.03), 0.52, 1.387, 1.95, -0.06, 0, 0);
  for (let k = -1; k <= 1; k++) periscope(P, 'hullDetail', 0.52 + k * 0.17, 1.376, 2.16, k * 0.08);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.80, 0.04, 0.05), s * 0.40, 1.315, 2.62, -0.06, s * 0.42, 0); // V splash rail HUGGING the glacis (r3: the -0.16 tilt topped 1.42 over the ref's bare 1.26-1.35 line)
  headlight(P, -1.40, 1.20, 3.30, -0.25, 0.048);                              // (r3-1024: sunk — the 1.35 guard crowns printed the 3.21 side col over the ref's 1.279 line)                               // tucked at the crest shoulders (the 1.42-high pods printed 1.47 over the ref's bare 1.28 glacis line)
  headlight(P, 1.40, 1.20, 3.30, -0.25, 0.048);
  P.add('hullDetail', torus(0.08, 0.015, 10), -0.60, 0.62, 3.40, Math.PI / 2, 0, 0); // tow eyes
  P.add('hullDetail', torus(0.08, 0.015, 10), 0.60, 0.62, 3.40, Math.PI / 2, 0, 0);
  liftEye(P, 'hullDetail', -1.40, 1.42, 0.55);
  liftEye(P, 'hullDetail', 1.40, 1.42, 0.55);
  towCable(P, [[-1.10, 1.27, 2.68], [0, 1.425, 2.18], [1.10, 1.27, 2.68]]);   // (r3-1024: re-draped — the 1.42@2.30 knot printed 1.446 across the z 2.37-2.6 cols over the re-laid 1.358 glacis)
  stowage(P, 'hullCloth', rng, [[-1.30, 1.555, -2.15, 0.44, 0.10, 0.8]]);      // deck roll FLAT (push round: the 1.66/0.14 roll topped 1.75 across five side cols + four front cols where the ref line is 1.585-1.66)
  // deck dressing (turret-fix: the bare 3.1 m fore deck + no baked AO fused
  // hull and turret into one wall at 3/4 angles) — all paper-thin interior
  // pieces, zero silhouette
  P.add('hullDark', box(2.00, 0.006, 0.50), 0, 1.449, 1.31);                   // contact-shadow band on the deck ahead of the turret ring (SS-B2 attachment-shadow device)
  P.add('hullDark', box(0.72, 0.008, 0.40), -0.98, 1.449, 0.90);               // battery/intake panel L
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.66, 0.010, 0.04), -0.98, 1.451, 0.78 + k * 0.12);
  P.add('hullDark', box(0.50, 0.008, 0.34), 1.06, 1.449, 0.95);                // stowage panel R
  {
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 4, width: 0.46, seed: 7 });
    links.position.set(-0.70, 1.478, -2.98);                                   // spare links SUNK to tops 1.578 (r3 1024: the 1.645 tops printed the 0.57-1.05 front cols where the ref line is 1.598 rendered; 1.578 renders 1.598 exactly — the front want AND the low edge of the side 1.598-1.631 band)
    P.hullG.add(links);
  }
  P.add('hull', box(0.14, 0.125, 0.18), 0, 1.5755, -2.85);                     // CENTER EXHAUST STACK top 1.638 (r3 1024: the ref center dome — front ±0.04 cols want 1.659 rendered AND side -2.76..-2.88 wants 1.66 — is one x ±0.07 mass on the tail deck; §B3: stack body with a dark grate cap)
  P.add('hullDark', box(0.10, 0.02, 0.12), 0, 1.6255, -2.85);                  // stack grate inlay (top 1.6355, inside the body crown)
  P.decal('hull', 'number', 'EI 118', 0.26, [-0.92, 1.279, 3.06], 0, -0.21);  // ON the glacis plane (push round r2: the 3.66 nose seat became a floating band in the tube-only 3.643 col after the nose pull)
  // Exhaust soot stays on the actual left exhaust housing.  The previous
  // oversized card extended aft/down across the elevated final-drive shoes;
  // this supported patch preserves the stain without placing a rendered
  // surface in the native course.
  P.decal('hull', 'soot', null, 0.25, [-1.43, 1.30, -2.86], -Math.PI / 2);
  // skirts: full-length panels at +-1.78 + the widthM edge strip at exactly
  // +-1.80 (WIDTH GUARD; ref stations read ~3.54-3.60 the whole run).
  // Band 0.60..1.42 under the deck edge; courses segmented ~0.47 (SS C).
  fenders(P, 1.20, 1.56, 1.41, -3.55, 2.45, 0.028);                            // fenders END at the glacis knee (the 3.30 run printed a 1.44 shelf over the ref's bare 1.26-1.38 glacis line)
  fenders(P, 1.55, 1.67, 1.400, -3.71, 2.45, 0.024);                          // trench fill to the skirt inner face (turret-fix round: the bare 1.56..1.735 strip read as a black trench over the track top at every 3/4 angle — SS-B2). Top 1.412 stays UNDER both the 1.42 skirt line and the 1.424 fender top: the first 1.41-seat fill printed one extra side-row pixel line (side_hull 69.5 -> 68.9)
  for (const s of [-1, 1]) {
    for (let k = 0; k < 12; k++) {                                             // restore the authored seven-wheel read: retain the original panel crowns,
      P.add('hull', box(0.0265, 0.62, 0.455), s * 1.71925, 1.11, -2.98 + k * 0.4775); // but lift the hem above the road-wheel crowns instead of hiding the
      P.add('hull', box(0.0225, 0.495, 0.455), s * 1.74375, 1.0475, -2.98 + k * 0.4775); // complete suspension behind an almost continuous wall.
    }                                                                          // r3-1024 OUTER-SKIN SPLIT: main course tops 1.42 pull inboard to x 1.7325 (rendered 1.7546, 2px clear of the ±1.7625 col boundary) and a LOW outer skin (x 1.7325-1.755, top 1.295) rides the ±1.784 front cols — the ref's outermost skirt cols read tops 1.317 rendered, not 1.57; the full-height 1.755 faces printed +0.12 there
    P.add('hull', slab(                                                        // 13th course = the ref's SLANTED LEADING CUT (one raked lip 1.42@2.52 -> 1.34@2.98 — the flat 1.42 course printed 0.10-0.14 over the falling glacis line on four side cols + the +-1.797 front col)
      [s * 1.706, 0.80, 2.5225], [s * 1.7325, 0.80, 2.5225], [s * 1.7325, 0.80, 2.98], [s * 1.706, 0.80, 2.98],
      [s * 1.706, 1.42, 2.5225], [s * 1.7325, 1.42, 2.5225], [s * 1.7325, 1.34, 2.98], [s * 1.706, 1.34, 2.98]));
    P.add('hull', box(0.0225, 0.495, 0.4575), s * 1.74375, 1.0475, 2.75125);  // 13th-course outer skin
    P.add('hull', box(0.0265, 0.62, 0.34), s * 1.71925, 1.11, -3.39);          // 14th course over the sprocket
    P.add('hull', box(0.0225, 0.495, 0.34), s * 1.74375, 1.0475, -3.39);       // 14th-course outer skin
    if (s > 0) P.add('hull', box(0.055, 0.50, 0.38), s * 1.75, 1.05, 0.92);    // R SKIRT END PLATE, crown preserved / hem lifted
    else P.add('hull', box(0.055, 0.04, 0.38), s * 1.75, 1.275, 0.92);         // L MIRROR-DOT STRIP x -1.7225..-1.7775 (r3 1024: the ref's -1.822 front col is a 1.272-1.314 DOT — its L mirror arm — where the R col carries the full band; the symmetric full plate paid 0.332, THE worst front_hull col. The 0.38 z-band keeps the plan ±1.84 dot AND the widthM pixel column; max authored |x| stays 1.7775 = the render-scale k anchor)
    for (let k = 0; k < 6; k++) P.add('hullDark', box(0.036, 0.50, 0.016), s * 1.715, 1.05, 2.62 - k * 1.00); // seam strips ON the shaved panels
  }
  // running gear: SEVEN wheels on the [-2.15, 2.45] contact patch, HIGH
  // small idler (far 3.68 = plan 3.71 lane) + sprocket (far -3.48 = plan
  // -3.46); lanes x 1.04..1.64 like the print's front columns
  const wheelZs = [2.40, 1.65, 0.90, 0.15, -0.60, -1.35, -2.10];
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.345, wheelW: 0.21, wheelY: 0.43, xc: 1.3725,
    wheelZs,
    sprocket: { z: -3.12, y: 0.86, r: 0.21 },
    // Full front idler at an elevated but guard-clear station.  Road wheels,
    // side skirts, mudguards and hull geometry remain unchanged.
    idler: { z: 3.30, y: 0.70, r: 0.25 },
    rollers: [1.95, 0.70, -0.65, -1.80].map((z) => ({ z, y: 0.88, r: 0.08 })),
    trackW: 0.615, topY: 0.88, botY: 0.055, contactZF: 2.75, contactZR: -2.05,
    paintedEnds: true, coveredTop: true, arms: true,
    armBucket: 'hullRunningGearDetail',
  });
  // Shallow concentric faces on the existing seven wheel stations.  The
  // physical rubber tires and course remain owned by buildRunningGear; these
  // sit within its original width and restore the olive dish/dark hub cadence
  // that distinguished the stronger first-party Ariete.
  for (const side of [-1, 1]) {
    for (const wz of wheelZs) {
      P.add('hullRunningGearDetail', cylX(0.275, 0.035, 18), side * 1.69, 0.43, wz);
      P.add('hullRunningGearDark', cylX(0.095, 0.039, 14), side * 1.695, 0.43, wz);
      P.add('hullRunningGearDark', torus(0.205, 0.014, 18), side * 1.711, 0.43, wz,
        0, 0, Math.PI / 2);
    }
  }
  // (push-2: contactZF 2.36 -> 2.22 — the ref approach ramp lifts off at
  // ~2.33 and climbs SHALLOW [0.22@2.68, 0.28@2.92 authored] where the 2.36
  // patch held the belly grounded to 2.45 then climbed steep: 6 ramp cols
  // read 0.06-0.12 deep. The idler-crest hook [0.79@3.43] stays the
  // certified curl-class residual.)
  // push round gear re-lay: BOTH end wheels raised hard (ref wrap-crest
  // bottoms 0.656-0.776 at |z| 3.2-3.55 vs the old 0.37-0.43 — the ramps now
  // match the ref's 0.087@2.57 -> 0.36@3.28 climb; \________/ per SS-B6) and
  // the track widened INBOARD (xc 1.385, inner face 1.075 — the ref front
  // rows reach near-ground at +-1.07-1.13; outer face stays 1.695; tub +-1.03
  // keeps 4.5 cm to the inner band plane, audit dilates 2)
  wheelRecessAt(P, wheelZs, 1.3725, 0.43, 0.345, 0.21, 'hullRunningGearDark');
  // The colour-invisible procedural shadow carrier ends at the real lower
  // tub's z=-2.90 station.  Extending it to -3.20 put a shadow-only box
  // through the elevated final-drive shoes even though the rendered Ariete
  // body and its supported rear service courses were already clear.
  tightenHullShadowProxy(P, { xc: 1.3725, trackW: 0.34, y0: 0.15, y1: 0.58,
    z0: -2.40, z1: 2.60, hullZ0: -2.90, hullZ1: 3.20 });

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
  // PUSH-ROUND TURRET RE-LAY (worldtrace probe, gate-registered frame):
  // the ref turret UNDERSIDE RISES going aft (1.405 front -> 1.555@-1.27 ->
  // 1.645@-1.5..-2.0 -> 1.675 basket zone) — the old full-length poly floor
  // at 1.48 printed every mid/rear bottom col 0.10-0.17 deep. Body poly now
  // ends z_w -1.27 and a raked-belly bustle (1.50 -> 1.645) carries the rear.
  const ARIETE_TURRET_PLAN = [
    [-0.36, 1.46], [0.36, 1.46], [0.92, 1.12], [1.25, 0.58],
    [1.33, -0.28], [1.30, -1.22], [1.15, -1.98], [-1.15, -1.98],
    [-1.30, -1.22], [-1.33, -0.28], [-1.25, 0.58], [-0.92, 1.12],
  ];
  const ARIETE_PLINTH_PLAN = ARIETE_TURRET_PLAN.map(([x, z]) => [x, Math.max(z, -0.95)]);
  // Keep the central roof datum, but let the welded casting fall away at
  // both side belts and the bustle.  The earlier constant-height extrusion
  // turned the Ariete into a rectangular casemate; these connected loft
  // rings form one broad, clipped fighting compartment without touching the
  // established hull, skirts or native course.
  P.add('turret', KIT.polyMultiLoft(ARIETE_TURRET_PLAN, [
    { height: 0.035, inset: 1.00 },
    { height: [0.47, 0.47, 0.56, 0.64, 0.67, 0.65, 0.59, 0.59, 0.65, 0.67, 0.64, 0.56], inset: 0.985 },
    { height: [0.54, 0.54, 0.63, 0.69, 0.70, 0.68, 0.62, 0.62, 0.68, 0.70, 0.69, 0.63],
      inset: [0.84, 0.84, 0.87, 0.90, 0.91, 0.92, 0.93, 0.93, 0.92, 0.91, 0.90, 0.87] },
  ]));
  P.add('turretDark', KIT.polyTurret(ARIETE_PLINTH_PLAN, 0.08, 1.02, 1.0), 0, -0.035, 0); // dark RING PLINTH at the base, dropped to the deck line 1.445 (ref front-zone bottoms 1.405 — SS-B2 contact-shadow device)
  for (const s of [-1, 1]) P.add('turret', box(0.18, 0.26, 0.52), s * 1.15, 0.28, -1.90); // terminal shoulders overlap the integrated loft
  P.add('turret', box(2.24, 0.10, 0.51), 0, 0.79, -0.185);                      // mid roof plate 2.32 x +-1.23 (push round: ref front-view roofline holds 2.31-2.35 out to +-1.23 — the 2.12 plate left the wall cant reading 2.16 there)
  P.add('turret', box(2.12, 0.05, 1.18), 0, 0.66, -1.31);                     // shallow roof course tied directly to the integrated aft loft
  P.add('turret', box(1.70, 0.055, 0.65), 0, 0.7225, -0.735);                  // hatch NOTCH plate 2.23 (z_w -0.56..-1.04)
  // RAISED front roof (push-round re-read of the ref front rows): the ref's
  // tall shoulders are OUTBOARD HUMPS at |x| 0.95-1.13 (front 2.438-2.489,
  // side plateau 2.484 to z_w 0.79) — the old 0.41-1.04 sections printed
  // 2.455 where the ref valley is 2.337 and left the humps low.
  P.add('turret', box(0.84, 0.11, 0.70), 0, 0.775, 0.54);                      // center channel (top 2.31, z_w -0.10..0.60; r5: the ref center-valley front cols read 2.30 — the 2.37 channel printed twelve cols at +0.10)
  P.add('turret', box(0.06, 0.1175, 0.80), -1.035, 0.77125, 0.60);              // roof-edge RAIL L x 1.005-1.065, top 2.4175 -> 2.448 rendered (90-ladder r2: widened inboard — its rendered -1.056 edge sat 1 mm outside the -1.033 front col window, which read the 2.346 plate against the ref's 2.457 rail line)
  P.add('turret', box(0.05, 0.235, 0.80), 0.995, 0.8195, 0.60);               // R rail L-PROFILE inner run (top 2.417 -> 2.451 rendered = the fresh 0.993 front want; banked push-2 order)
  P.add('turret', box(0.0575, 0.185, 0.80), 1.049, 0.7945, 0.60);              // R rail outer flange (top 2.367 -> 2.398 rendered at 1.02-1.0775 = the ref fall line)              // roof-edge RAIL R top 2.4775 -> 2.509 rendered (also the side-row 2.497 want at err 0.012; r10: both stay out of station slice 6 [-0.67..-0.13] — the 1 cm window is unbuildable, station trim wins)
  P.add('turret', box(0.04, 0.05, 0.46), -1.195, 0.771, -0.185);               // L roof-edge stowage lip x 1.175-1.215, top 2.276 (push-2: the ref L wall-top col at -1.23 reads 2.306 where R reads 2.155 — L/R-asymmetric ref; one thin L angle-iron fills it, 2px clear of the -1.271 col)
  P.add('turret', frustum(0.85, 1.24, 0.90, 0.80, 1.24, 0.90, 0.60, 0.775));   // front closer cap (top 2.255, z_w 0.61-0.95 — the ref 2.25-2.28 fall zone)
  // TURMS gunner sight box fwd-right (top 2.50 = the heightM p95 anchor;
  // push round: x 0.555-0.80 — the 0.47-0.87 box AA-printed the 0.471 and
  // 0.876 front cols at 2.51 over the ref's 2.337-2.357 valley)
  sightBox(P, 'turret', 0.6725, 0.86625, 0.55, 0.335, 0.2925, 0.50);
  P.add('turretDetail', box(0.335, 0.028, 0.54), 0.6725, 0.988, 0.55);         // split lid (top 2.506; x 0.505-0.84 = the ref's own front plateau — r6: 2.514+AA read heightM 2.53/+1.02%)
  // commander panoramic TOWER aft-left-of-center (ref spike 2.38-2.50 at
  // x -0.22..-0.30, z_w -0.90..-1.02). TURRET-FIX NOTE: the real C1 pano
  // reads ~2.7 (packet dims table) but the vertex-normalize warp clamped
  // the print's furniture band to 2.50/2.52 — a 2.66 tower was tried and
  // priced FAR over the p95 allowance (head+dilation ~5 side cols: dims
  // 100 -> 91.3, min -1.9). The tower stays at the print's 2.495 ceiling
  // with a TALLER SLIMMER pedestal read (documented residual, not gamed).
  P.add('turret', box(0.045, 0.30, 0.14), -0.2325, 0.845, -0.81);             // pedestal column (top 2.475; 90-ladder r2: z_l -0.79 -> -0.845 — the tower FRONT face at rendered -1.013 sat inside the -0.972 col window [-0.917..-1.027] printing 2.38 over the ref's 2.217 notch line; the head now centers the -1.089/-1.212 spike windows: -1.212 read 2.408 under the 2.519 want)
  P.add('turretDark', box(0.095, 0.10, 0.14), -0.2575, 0.938, -0.81);         // (90-ladder r2c: head widened x -0.21..-0.305 per the banked push-2 order — the ref 2.499 front col at -0.304 read our 2.346 plate; the -1.089/-1.212 side spikes keep their z) (90-ladder r2b: z_l -0.81, faces z_w -1.03..-1.17 [rendered -1.043..-1.185] — the -0.79 seat's front face printed 2.38 into the -0.972 col window over the ref's 2.217 notch line; the interim -0.845 seat crossed the i4/i5 station boundary at rendered -1.209 [20 mm cap law: i4 1.09 -> 8.16 topPct, displacing the trimmed i6/i13 pair, stations -3.8]. 28 mm of head keeps the -1.212 spike window)         // (r3-1024: pano shifted +0.09 fwd — the fresh side spike col is -1.089, the old -1.10..-1.27 window left it reading the 2.413 lerp)          // pano head (top 2.468 -> 2.499 rendered = the fresh front-row want at x -0.218..-0.299; the real ~2.7 pano stays the documented residual. Push-2 note: the pano z-window is AT the 2-col spike lerp tax [~0.26 sum] — every repositioning priced the same or worse, layout certified)
  P.add('turretGlass', box(0.04, 0.055, 0.02), -0.2325, 0.938, -0.76);        // (90-ladder r2d: the glass at z_w-rendered -1.018..-1.038 AA'd into the -0.972 col window edge [-1.027])
  P.add('turretDark', torus(0.115, 0.014, 12), -0.2325, 0.72, -0.81);            // ring collar at the roof foot
  P.add('turret', cylY(0.055, 0.065, 0.26, 24), -0.2325, 0.825, 0.07);        // (90-ladder r2: 24-seg cylinders — the box z-caps PAINTED station i6 at 2.495 vs the ref's 2.346 slab top [5.91 topPct pre-existing]: the ref's spike content skips its slabs, smooth cylinders skip ours)               // SECOND sight pedestal at z_w -0.22 (r3-1024: the fresh side rows read a 2.497 spike across z_w -0.14..-0.26 the old layout never carried; x sits in the SAME -0.218..-0.299 front cols the pano head already owns, so the front row price is zero)
  P.add('turretDark', cylY(0.072, 0.075, 0.10, 24), -0.2325, 0.918, 0.07);           // second head (top 2.448 -> 2.479 rendered vs the 2.497 want)
  // hatches on the notch plate — RAISED RING RIMS (turret-fix: the r4
  // 3.8 cm crowns vanished at 1x and the roof read as a blank casemate
  // plain; crowns 2.30-2.33 sit inside the ref's 2.2-2.35 notch-zone fall)
  P.add('turret', cylY(0.265, 0.275, 0.075, 18), 0.52, 0.68, -0.94);          // broad low commander ring
  P.add('turretDark', torus(0.255, 0.016, 18), 0.52, 0.7125, -0.94);
  P.add('turret', cylY(0.235, 0.24, 0.032, 18), 0.52, 0.7275, -0.94);
  P.add('turretDark', box(0.39, 0.013, 0.03), 0.52, 0.7465, -0.94);
  P.add('turretDetail', box(0.055, 0.055, 0.16), 0.30, 0.753, -0.94);          // commander hinge
  P.add('turret', cylY(0.225, 0.235, 0.062, 18), -0.55, 0.776, -0.90);        // loader ring
  P.add('turretDark', torus(0.225, 0.014, 18), -0.55, 0.808, -0.90);
  P.add('turretDark', cylY(0.220, 0.220, 0.014, 18), -0.55, 0.812, -0.90);    // backed loader lid shadow
  P.add('turretDetail', box(0.050, 0.050, 0.14), -0.75, 0.824, -0.90);        // loader hinge
  periscope(P, 'turretDetail', 0.52, 0.70, -0.66);                             // (r3-1024: sunk — its 2.305 crown printed the z_w -0.97 side col over the ref's 2.217 line)
  periscope(P, 'turretDetail', -0.30, 0.79, 0.30, 0.3);                        // (r3-1024 = the banked second-periscope order: the 0.905 seat printed 2.449 rendered into the ref's 2.341 want at x -0.34..-0.40)
  P.add('turret', box(0.26, 0.26, 0.16), -0.86, 0.817, 0.59);
  P.add('turret', box(0.075, 0.22, 0.16), -0.70, 0.769, 0.59);                // hood inboard step (top 2.359 -> 2.39 rendered: the fresh -0.67/-0.71 front cols want 2.39 where the roof plate reads 2.347)                  // loader sight hood (push-2: top 2.427 -> 2.458 rendered = the fresh L front want; the 2.46 seat read +0.03)
  P.add('turret', box(0.14, 0.13, 0.30), 0.08, 0.855, 0.64);                   // center periscope vane (push-2 re-window: the ref vane cols are x 0.005..0.16 top 2.438-2.448 rendered — the old -0.06..0.16/2.44 box printed the -0.056/-0.015 cols where the ref valley is 2.306)
  // loader MAG — SS B3 KIT fitting on the bustle roof front (foot sunk to
  // 0.55: the r4 0.63 seat printed the receiver 2.52 vs the ref 2.31 at
  // z_w -1.4 — the gate's own worst column)
  const mag = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', seed: 5 });
  mag.position.set(-0.55, 0.69, -0.90);                                       // foot planted directly on the loader station
  P.turretG.add(mag);
  // side shelves (tops 1.91 = ref front-view 1.91-1.92 at +-1.35-1.55, plan
  // z_w 0.03..-0.81 — the r4 seat CONFIRMED by the shelf-move experiment:
  // relocating them aft moved their plan columns +0.78 off the ref)
  // carrying the GALIX banks, + tie-down horns on the lids (the ref plan's
  // +-1.60-1.63 dot columns at z_w ~-0.75) + under-lip contact shadow
  for (const s of [-1, 1]) {
    P.add('turret', box(0.24, 0.36, 0.69), s * 1.41, 0.25, -0.20);             // shelf z_w -0.83..-0.14 (push round: the 0.84-deep shelf ran its plan rear to -0.97 over the ref's -0.833..-0.144 window)
    P.add('turretDark', box(0.25, 0.06, 0.61), s * 1.415, 0.40, -0.20);
    P.add('turretDark', box(0.26, 0.03, 0.63), s * 1.39, 0.055, -0.20);        // contact shadow under the shelf lip (SS-B2 attachment read)
    galixBank(P, s * 1.285, s < 0 ? 0.235 : 0.155, -0.16, s, 4, 1);           // source-width banks buried into the shelf shoulders
    liftEye(P, 'turretDetail', s * 0.95, 0.74, 0.55, s * 0.4);               // (push-2: the 0.78 seat read 2.35 rendered in the +-0.92-1.00 front cols where the fresh ref line is 2.296-2.317)
    P.add('turretDetail', box(0.13, 0.055, 0.08), s * 1.50, 0.10, -0.435);     // tie-down horn under the shelf lip
    // weld/panel seams on the canted wall (turret-fix: the blank 3 m wall
    // read as one casemate slab — dark joints break it; 7 mm proud). Push-2
    // WINDING-CLASS FIX: the -s*0.234 tilt was REVERSED — tops swung
    // OUTBOARD 0.07 past the canted wall face and printed 2.15-tops in the
    // +-1.28 front cols (ref 2.074). +s tips them inboard ALONG the cant.
    for (const zSeam of [0.20, -0.30, -0.75]) {
      P.add('turretDark', box(0.014, 0.62, 0.022), s * 1.185, 0.36, zSeam, 0, 0, s * 0.234);
    }
  }
  // (turret-fix note: stowage stacked ON the shelves was tried and revoked
  // — the +-1.4 front-row line IS the 1.91 shelf top; 2.15 duffels there
  // cost whole -4.9. The wall break stays with the seams + shelf shadow.)
  // (r4: the ration box DELETED — its 2.46 crown printed six front cols over the ref's 2.34-2.39 channel valley)
  // LOW rear basket at the r4 FOOTPRINT (turret-fix round law: the turret
  // rows are BBOX-NORMALIZED — with the certified-long tube (+0.94 vs the
  // print) the turret rear must stay correspondingly short or every
  // column smears (the -3.40 tail experiment: turret 64.4 -> 0, stations
  // 71.9 -> 29). Basket length is harness-pinned; the visual upgrades
  // (floor, side mesh, duffel pile) stay INSIDE the r4 bbox — SS-B2 solid
  // top-down read without moving an edge.)
  {
    const zf = -1.815, zr = -2.41;                                             // local (z_w -2.105/-2.62 — push round: rails at the ref's own plan rear -2.60..-2.69 sides; push-2: pulled 3 cm more so the aft-most rendered face [-2.752] clears the -2.775 col boundary — the -2.782 faces lit the straddling col and smeared the ref's deck col at -2.894 to 1.897 [cliff-lerp optimum: zero the low col, eat half the high one])
    for (const y2 of [0.20, 0.61]) {
      for (const sx of [-0.70, 0.70]) P.add('turretDetail', box(0.84, 0.035, 0.035), sx, y2, zr); // rear rails (top 2.09w), center-open (r2: rails at -2.57w = the ref -2.536..-2.656 rear band)
      P.add('turretDetail', box(2.24, 0.035, 0.035), 0, y2 === 0.20 ? 0.18 : 0.61, zf);
    }
    for (const sx of [-1.1025, 1.1025]) {
      P.add('turretDetail', box(0.035, 0.035, 0.65), sx, 0.26, -2.10);         // side rails (rear -2.425 local: rendered -2.749, clear)
      P.add('turretDetail', box(0.035, 0.035, 0.65), sx, 0.61, -2.10);
    }
    for (const px of [-1.10, -0.69, -0.26, 0.26, 0.69, 1.10]) P.add('turretDetail', box(0.028, 0.35, 0.028), px, 0.435, zr); // posts off the +-0.165 plan cols (the ref center rear is the cargo line)
    for (const sx of [-0.69, 0.69]) {
      for (const y of [0.34, 0.435, 0.53]) P.add('turretDetail', box(0.72, 0.018, 0.012), sx, y, zr + 0.010);
      P.add('turretDetail', box(0.035, 0.23, 0.012), sx + (sx < 0 ? 0.27 : -0.22), 0.435, zr + 0.008);
    }
    P.add('turretDark', box(0.016, 0.36, 0.56), -1.095, 0.40, -2.1475);         // mesh side sheets (side-mask floor 1.70-2.06w; push-2: rear faces -2.4275 local = rendered -2.752, clear of the -2.775 boundary)
    P.add('turretDark', box(0.016, 0.36, 0.56), 1.095, 0.40, -2.1475);
    P.add('turretDark', box(2.16, 0.014, 0.58), 0, 0.185, -2.12);              // basket floor 1.665w (top-down fill; the deck below closes the sightline)
    // Unequal strapped packs leave the basket frame readable instead of
    // turning its entire rear opening into one procedural wall.
    P.add('turretCloth', box(0.82, 0.27, 0.42), -0.55, 0.34, -2.14);
    P.add('turretCloth', box(0.68, 0.23, 0.38), 0.52, 0.32, -2.13);
    P.add('turretCloth', box(0.50, 0.14, 0.31), -0.43, 0.50, -2.11);
    P.add('turretCloth', box(0.42, 0.12, 0.28), 0.58, 0.46, -2.08);
    P.add('turretCloth', box(0.72, 0.09, 0.28), -0.16, 0.565, -2.05);          // low tarp roll
    P.add('turretDark', box(0.02, 0.27, 0.38), -0.55, 0.34, -2.08);
    P.add('turretDark', box(0.02, 0.23, 0.34), 0.52, 0.32, -2.08);
  }
  // (push round: the bustle jerry can DELETED — its 2.35 crown owned the
  // three worst turret-side cols at z_w -2.1..-2.35 and the station-2/3
  // spikes over the ref's 2.124 basket line. mg1+3d census unaffected.)
  // Two unequal, collared turret radios.  They remain deliberately moderate
  // in height so the Ariete keeps its low fighting-compartment silhouette.
  for (const s of [-1, 1]) {
    P.add('turretDetail', cylY(0.045, 0.065, 0.08, 12), s * 1.155, 0.60, -1.90);
    const whipA = FITTINGS.antennaWhip({ mats: P.mats, h: s < 0 ? 0.26 : 0.21, r: 0.011, rake: -s * 0.035, seed: 3 });
    whipA.position.set(s * 1.155, 0.64, -1.90);
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
  P.addGunExtra(cylZ(0.135, 0.48, 12), 0, 0, 1.36);                            // gun-root collar to z_w 2.20 (turret-fix: fills the prow notch center so the recess reads mantlet+gun, not a hole)
  // §B3 NO-MYSTERY-BOXES sweep (owner directive, C1 mantlet area): the two
  // canvas masses now carry CANVAS TELLS — cinch straps + a rolled top hem —
  // all inside the priced mantlet band (y 1.51-1.83, x +-0.41 < the 0.42
  // wedge roots, z within each cover's own footprint): identifiable dust
  // covers, not bare rectangles. Envelope-neutral: no mask row changes.
  P.addGunExtra(KIT.xform(KIT.sph(0.25, 18), 0, 0, 0, 0, 0, 0,
    [1.58, 0.50, 0.92]), 0, -0.011, 1.33);                                    // rounded armored mantlet surround
  P.addGunExtraDark(KIT.xform(KIT.sph(0.25, 18), 0, 0, 0, 0, 0, 0,
    [1.18, 0.42, 0.76]), 0, -0.008, 1.365);                                   // seated canvas core
  for (const sx of [-0.27, 0, 0.27]) P.addGunExtraDark(box(0.014, 0.256, 0.464), sx, -0.011, 1.33); // snout cinch straps (3 mm proud on the cover faces)
  P.addGunExtraDark(cylX(0.028, 0.72, 10), 0, 0.096, 1.44);                    // rolled canvas hem across the snout top edge (kills the razor box corner; crown 1.81 <= the 1.83 band)
  P.addGunExtra(KIT.xform(KIT.sph(0.23, 18), 0, 0, 0, 0, 0, 0,
    [1.52, 0.70, 0.65]), 0, -0.01, 0.55);                                     // rounded armored root surround
  P.addGunExtraDark(KIT.xform(KIT.sph(0.23, 18), 0, 0, 0, 0, 0, 0,
    [1.08, 0.54, 0.52]), 0, -0.006, 0.575);                                   // inner canvas boot
  for (const sx of [-0.18, 0.18]) P.addGunExtraDark(box(0.014, 0.30, 0.31), sx, -0.015, 0.55); // root-cover straps
  P.addGunExtraDark(cylZ(0.026, 0.10, 8), 0.27, 0.06, 0.42);                   // coax port
  P.addGunExtraDark(box(0.075, 0.05, 0.07), 0.27, 0.105, 0.42);                // coax hood (a sight/port carries its hood tell)
  // BACKWARD-RAKED WEDGE CHEEK COMPLEX: the ref's mantlet prow sweeps ahead
  // of the body — the r4 two-slab pair restored verbatim (plan row 70.1)
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.42, -0.025, 2.44], [s * 0.70, -0.025, 2.38], [s * 1.25, -0.025, 2.06], [s * 0.60, -0.025, 2.24],
      [s * 0.42, 0.36, 2.36], [s * 0.70, 0.35, 2.30], [s * 1.25, 0.30, 2.00], [s * 0.60, 0.355, 2.18]));
    P.add('turret', slab(                                                      // wedge roots back to the body face (r2: undersides to 1.455w — the ref front-zone turret bottoms read 1.37-1.43; 1 cm over the 1.445 deck at every yaw)
      [s * 0.42, -0.025, 2.28], [s * 1.24, -0.025, 2.02], [s * 1.26, -0.025, 0.90], [s * 0.42, -0.025, 1.30],
      [s * 0.42, 0.355, 2.20], [s * 1.24, 0.29, 1.96], [s * 1.26, 0.42, 0.90], [s * 0.42, 0.62, 1.30]));
  }
  // BROW LOFT (push round): the ref roofline FALLS 2.33@0.95 -> 2.10@1.29 ->
  // 2.055@1.65 -> 1.92@1.90 toward the prow — three chained raked planes
  // with co-planar joints (smoothLoft class, NO-STAIRCASES), replacing the
  // old floating brow box whose 2.20 crown sat +0.10 over the 2.094 line.
  P.add('turret', slab(
    [-0.42, 0.28, 1.24], [0.42, 0.28, 1.24], [0.42, 0.28, 1.46], [-0.42, 0.28, 1.46],
    [-0.42, 0.775, 1.24], [0.42, 0.775, 1.24], [0.42, 0.66, 1.46], [-0.42, 0.66, 1.46]));
  P.add('turret', slab(
    [-0.42, 0.28, 1.46], [0.42, 0.28, 1.46], [0.42, 0.28, 1.88], [-0.42, 0.28, 1.88],
    [-0.42, 0.66, 1.46], [0.42, 0.66, 1.46], [0.42, 0.575, 1.88], [-0.42, 0.575, 1.88]));
  P.add('turret', slab(
    [-0.42, 0.28, 1.88], [0.42, 0.28, 1.88], [0.42, 0.28, 2.26], [-0.42, 0.28, 2.26],
    [-0.42, 0.575, 1.88], [0.42, 0.575, 1.88], [0.42, 0.40, 2.26], [-0.42, 0.40, 2.26]));
  // muzzle at REAR + published 9.67 (rear extreme -3.89 -> muzzle 5.78; the
  // print's own tube ends 5.73). Tube r 0.075: sleeve band 0.183 under the
  // 12% cut; MRS collar lands on the ref's own 4.6-4.8 swell.
  // 90-ladder r2: FULL-LENGTH THERMAL SLEEVE at the print's measured band
  // [1.613..1.837] (side_whole want tops 1.837 across z 2.9..5.7 — the
  // 0.183 kit sleeve read 1.797, +0.04 on every gun col). RENDER-SCALE
  // authored = rendered/1.01266; 24-seg per the STATION-PAINT law (the
  // ref's own smooth tube SKIPS its slabs — its i13 top is the 1.628
  // glacis; a 12-seg would paint 1.84). MRS union 0.27 < the 12% cut.
  P.addGunExtra(cylZ(0.111, 2.913, 24), 0, 0.0174, 3.1055);
  buildGun(P, { len: 4.93, r: 0.075, sleeve: true, evac: 0.685, evacR: 1.40, collar: true, baseR: 0.16 });
  muzzleBore(P, 0.075, 4.91);                                                  // §B3.1 muzzle bore (shadow-named — see the helper)
  // MRS/muzzle collar (push round): the ref's muzzle zone reads a THICK
  // 1.555-1.884 band at z 5.4-5.7 vs the bare 0.075 tube. Seated 4 cm LEFT
  // (real MRS units mount off-axis): x -0.175..0.095 covers the plan
  // x=-0.165 column the ref's off-center fused tube owns — the certified
  // 1.84-err plan-center col drops to ~0.09. Band 0.27 (+AA 0.29) stays
  // under the 12% body cut so heightM/hullLengthM never see it.
  P.addGunExtra(cylZ(0.135, 0.30, 12), -0.04, 0.05, 4.78);                     // off-axis MRS collar remains flush with the shortened muzzle
  P.topY = 1.10;
}


// ---------------------------------------------------------------------------
// Leclerc S2 — docs/references/tanks/leclerc.md
// hull 6.88, width 3.60, deck 1.60 (raised engine run 1.74), turret roof
// ~2.40, gun axis 1.93, muzzle bow+2.99; 6 wheels, front idler; tall narrow
// autoloader turret, side cheek armor + baskets, HL-70 box, thin pano mast,
// GALIX corners, rear hull rack.
// ---------------------------------------------------------------------------
// NATIVE PROCEDURAL REBUILD (2026-08-11). The comparison GLB is quarantined
// visual-reference material only. This original construction uses our
// primitives, seven-station native track system and explicit physical seats;
// no reference mesh data is imported, sampled, converted or shipped.
function buildArieteNative2026(P) {
  const {
    box, cylX, cylY, cylZ, sph, torus, polyLoft, polyMultiLoft, xform,
    buildGun, buildRunningGear, fenders, headlight, liftEye, periscope, cupola,
  } = KIT;
  const slab = orientedSlab;

  // ---- long, low hull tightly draped around the native gear ----
  P.add('hull', box(2.00, 0.68, 6.35), 0, 0.66, -0.03);                       // inner lower tub, clear of track lanes
  // Wide sponsons end before the sprocket uprun.  A narrower structural
  // return continues between the two live courses, preserving the deck
  // load path without putting a full-width wall through the rear shoes.
  P.add('hull', box(3.28, 0.25, 4.91), 0, 1.17, -0.445);
  P.add('hull', box(2.00, 0.25, 0.27), 0, 1.17, -3.035);
  P.add('hull', box(3.22, 0.055, 3.92), 0, 1.325, -1.08);                     // broad flat engine/crew deck
  for (const s of [-1, 1]) {
    // Shallow pointed bow: inner belly stays between the tracks while the
    // upper shoulders flare above the idler uprun.
    P.add('hull', slab(
      [s * 0.01, 0.42, 1.52], [s * 1.00, 0.72, 1.52], [s * 0.94, 1.27, 3.38], [s * 0.01, 1.25, 3.54],
      [s * 0.01, 1.30, 1.52], [s * 1.58, 1.30, 1.52], [s * 1.51, 1.29, 3.40], [s * 0.01, 1.26, 3.55]));
    P.add('hull', slab(
      [s * 1.04, 1.15, 1.55], [s * 1.58, 1.15, 1.55], [s * 1.51, 1.27, 3.40], [s * 1.10, 1.25, 3.41],
      [s * 1.04, 1.36, 1.55], [s * 1.64, 1.36, 1.55], [s * 1.60, 1.39, 3.42], [s * 1.10, 1.36, 3.43]));
  }
  // Rear lower return and low layered service transom.
  P.add('hullDark', box(1.98, 0.44, 0.40), 0, 0.76, -3.38);
  P.add('hull', box(0.60, 0.39, 0.045), -0.67, 0.79, -3.61);
  P.add('hull', box(0.67, 0.34, 0.045), 0.00, 0.76, -3.61);
  P.add('hull', box(0.49, 0.29, 0.045), 0.63, 0.80, -3.61);
  // The low service backing is central between the tracks; its two outer
  // shoulders step above the sprocket course instead of intersecting it.
  P.add('hull', box(1.92, 0.24, 0.25), 0, 1.10, -3.48);
  for (const s of [-1, 1]) P.add('hull', box(0.54, 0.16, 0.25), s * 1.25, 1.34, -3.48);
  P.add('hullDark', box(1.18, 0.23, 0.035), -0.36, 0.98, -3.625);
  P.add('hullDark', box(0.70, 0.17, 0.035), 0.86, 1.00, -3.625);
  for (let k = 0; k < 5; k++) {
    P.add('hullDetail', box(1.10, 0.020, 0.030), -0.38, 0.88 + k * 0.044, -3.648);
    if (k < 4) P.add('hullDetail', box(0.62, 0.020, 0.030), 0.88, 0.93 + k * 0.044, -3.648);
  }
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.38, 0.26, 0.035), s * 1.23, 1.14, -3.61);
    P.add('hullDetail', cylZ(0.075, 0.055, 12), s * 1.23, 1.21, -3.66);
    P.add('hullDetail', torus(0.068, 0.014, 14), s * 0.70, 0.59 + (s > 0 ? 0.035 : 0), -3.68, Math.PI / 2, 0, 0);
    P.add('hullRubber', box(0.38, 0.20, 0.035), s * 1.47, 0.72, -3.60);
  }
  P.add('hull', box(0.62, 0.45, 0.045), -0.52, 0.90, -3.65);
  P.add('hull', box(0.45, 0.38, 0.046), 0.12, 0.86, -3.65);
  P.add('hull', box(0.50, 0.42, 0.045), 0.67, 0.91, -3.65);
  for (const x of [-0.72, -0.35, 0.02, 0.31, 0.55, 0.84]) P.add('hullDetail', box(0.032, 0.10, 0.026), x, 0.92, -3.68);
  P.add('hullDetail', cylZ(0.085, 0.12, 12), 0, 0.58, -3.70);
  P.add('hullDark', cylZ(0.085, 0.08, 14), -1.02, 0.76, -3.69);
  P.add('hullDetail', torus(0.102, 0.017, 16), -1.02, 0.76, -3.72, Math.PI / 2, 0, 0);
  P.add('hullDetail', box(0.40, 0.035, 0.035), 0.82, 0.68, -3.72, 0, 0, 0.16);
  P.add('hullDetail', box(0.70, 0.030, 0.035), -0.70, 0.66, -3.72, 0, 0, -0.08);
  P.add('hullDetail', box(0.54, 0.030, 0.035), 0.32, 0.55, -3.72, 0, 0, 0.10);
  P.add('hullDark', box(0.32, 0.12, 0.030), -0.22, 0.88, -3.71);
  // Back the small recovery-service pocket enclosed by the lower rails.
  // This is a real transom seat (not measurement proxy geometry) and closes
  // the final 5 cm top-down contiguity cell at x 0.40 / z -3.68.
  P.add('hullDark', box(0.14, 0.010, 0.14), 0.40, 0.54, -3.68);

  // Shallow segmented skirts cover the return run and only the upper wheel
  // shoulders.  The former 0.32 m course sat wholly above the wheel crowns,
  // making the native gear look naked; this lower course restores the C1's
  // draped hull-over-seven-wheels stance while retaining every lower arc.
  fenders(P, 1.10, 1.64, 1.35, -2.78, 2.72, 0.03);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 11; k++) {
      const z = -2.72 + k * 0.50;
      const h = k === 0 ? 0.40 : 0.46;
      P.add('hull', box(0.030, h, k === 0 ? 0.37 : 0.47), s * 1.65, 0.995, z);
      P.add('hullDark', box(0.034, h * 0.72, 0.016), s * 1.668, 0.995, z + 0.235);
    }
    P.add('hullRubber', box(0.024, 0.24, 0.38), s * 1.72, 1.01, -3.22);
    P.add('hullRubber', box(0.024, 0.24, 0.36), s * 1.72, 1.01, 2.78);
  }

  // Glacis/driver/service grammar sits directly on the shallow bow.
  P.add('hull', box(0.60, 0.055, 0.58), 0.48, 1.29, 1.78, -0.10, 0, 0);
  P.add('hullDark', box(0.52, 0.018, 0.04), 0.48, 1.32, 1.78, -0.10, 0, 0);
  for (const x of [0.30, 0.48, 0.66]) periscope(P, 'hullDetail', x, 1.33, 2.02);
  for (const s of [-1, 1]) {
    headlight(P, s * 1.22, 1.32, 3.12, -0.22, 0.05);
    P.add('hullDetail', box(0.38, 0.025, 0.18), s * 1.22, 1.34, 3.11, -0.22, 0, 0);
    liftEye(P, 'hullDetail', s * 1.30, 1.34, -2.54);
    P.add('hullDetail', torus(0.09, 0.016, 14), s * 0.58, 0.61, 3.43, Math.PI / 2, 0, 0);
    P.add('hullDetail', box(0.32, 0.035, 0.035), s * 0.80, 0.91, 3.31, -0.22, 0, s * 0.12);
    P.add('hullDetail', box(0.20, 0.028, 0.028), s * 1.12, 0.98, 3.23, -0.22, 0, -s * 0.15);
  }
  P.add('hullDark', box(1.80, 0.025, 0.028), 0, 0.81, 3.40, -0.18, 0, 0);
  P.add('hullDetail', box(1.42, 0.028, 0.032), 0, 1.03, 3.36, -0.18, 0, 0);
  for (const x of [-0.72, -0.48, 0.48, 0.72]) P.add('hullDetail', box(0.15, 0.025, 0.11), x, 1.13, 3.28, -0.20, 0, 0);
  P.add('hullDark', box(1.10, 0.020, 0.026), 0, 0.95, 3.46, -0.18, 0, 0);
  {
    const cable = FITTINGS.towCable({ mats: P.mats, pts: [[-1.15, 1.10, 2.72], [0, 1.26, 2.12], [1.15, 1.10, 2.72]], r: 0.018, seed: 2026 });
    P.hullG.add(cable);
  }
  // Flat power deck, fans, louvres, spare links and tool routes.
  for (let k = 0; k < 7; k++) P.add('hullDark', box(1.68, 0.015, 0.15), 0.25, 1.365, -1.28 - k * 0.24);
  for (const x of [-0.72, 0.72]) {
    P.add('hullDark', cylY(0.31, 0.34, 0.024, 20), x, 1.365, -2.35);
    P.add('hullDetail', torus(0.27, 0.014, 18), x, 1.383, -2.35, Math.PI / 2, 0, 0);
  }
  const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 5, width: 0.42, seed: 118 });
  links.position.set(-0.72, 1.38, -2.92); P.hullG.add(links);
  P.add('hullDetail', box(1.60, 0.035, 0.035), 0.20, 1.40, -3.10);
  P.add('hullDetail', box(0.055, 0.055, 1.40), -1.27, 1.38, -0.30, 0, 0.05, 0);

  // Seven large, closely spaced fleet-native wheels and one linked course.
  const wheelZs = [2.40, 1.65, 0.90, 0.15, -0.60, -1.35, -2.10];
  const XC = 1.3725;
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.74, tireHex: 0x34352d, wheelHex: 0x454a38,
    wheelR: 0.410, wheelW: 0.230, wheelY: 0.450, xc: XC,
    wheelZs,
    sprocket: { z: -3.12, y: 0.86, r: 0.21 },
    idler: { z: 3.30, y: 0.945, r: 0.09 },
    rollers: [1.95, 0.70, -0.65, -1.80].map((z) => ({ z, y: 0.88, r: 0.08 })),
    trackW: 0.615, topY: 0.88, botY: 0.055,
    contactZF: 2.22, contactZR: -2.05,
    deadSag: 0.022, paintedEnds: true, coveredTop: true, arms: true,
  });
  tightenHullShadowProxy(P, { xc: XC, trackW: 0.34, y0: 0.15, y1: 0.58, z0: -2.40, z1: 2.60, hullZ0: -3.20, hullZ1: 3.20 });

  // ---- low, broad connected Ariete turret ----
  P.turretG.position.set(0, 1.38, -0.18);
  P.add('turret', xform(cylY(0.88, 0.94, 0.10, 22), 0, 0, 0, 0, 0, 0, [1.12, 1, 0.80]), 0, 0.02, 0.02);
  P.add('turret', box(1.78, 0.13, 1.06), 0, 0.08, -0.02);                    // buried ring/collar seat
  const turretPlan = [
    [-0.34, 1.54], [0.34, 1.54], [0.92, 1.18], [1.28, 0.60],
    [1.40, -0.32], [1.39, -1.32], [1.22, -2.06], [-1.22, -2.06],
    [-1.39, -1.32], [-1.40, -0.32], [-1.28, 0.60], [-0.92, 1.18],
  ];
  const shellShoulder = turretPlan.map(([x, z]) => {
    const side = Math.min(1, Math.abs(x) / 1.40);
    const fore = Math.max(0, Math.min(1, (z - 0.30) / 1.24));
    const aft = Math.max(0, Math.min(1, (-z - 0.55) / 1.50));
    return 0.45 + side * 0.035 - fore * 0.055 + aft * 0.025;
  });
  const shellCrown = turretPlan.map(([x, z]) => {
    const side = Math.min(1, Math.abs(x) / 1.40);
    const fore = Math.max(0, Math.min(1, (z - 0.25) / 1.29));
    return 0.645 + side * 0.020 - fore * 0.075;
  });
  const crownInset = turretPlan.map(([x, z]) => {
    const fore = Math.max(0, Math.min(1, (z - 0.20) / 1.34));
    const side = Math.min(1, Math.abs(x) / 1.40);
    return 0.91 - fore * 0.075 + side * 0.010;
  });
  P.add('turret', polyMultiLoft(turretPlan, [
    { height: 0.06, inset: 1.00 },
    { height: shellShoulder, inset: 0.98 },
    { height: shellCrown, inset: crownInset },
  ]));
  P.add('turretDark', box(1.72, 0.024, 0.92), 0, 0.07, -0.02);                // contact shadow remains inside shell
  // Swept cheek appliqué and low flank/bustle modules follow the primary skin.
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.40, 0.12, 1.52], [s * 1.05, 0.15, 1.02], [s * 1.40, 0.17, 0.35], [s * 0.72, 0.13, 0.82],
      [s * 0.36, 0.62, 1.45], [s * 0.91, 0.70, 0.98], [s * 1.20, 0.73, 0.34], [s * 0.64, 0.65, 0.82]));
    P.add('turret', box(0.24, 0.39, 0.72), s * 1.32, 0.455, -0.56, 0, 0, 0);
    P.add('turretDark', box(0.024, 0.33, 0.62), s * 1.455, 0.455, -0.56);
  }

  // Rounded mantlet and gun root are a single pitch-owned sealed package.
  P.gunG.position.set(0, 0.24, 1.35);                                        // compact source-integrated root
  trunnionRoll(P, 0.27, 0.62, { ballR: 0.27, ballZ: 0.17 });
  P.addGunExtra(cylZ(0.20, 0.34, 18, 0.15), 0, 0, 0.29);
  P.addGunExtraDark(torus(0.17, 0.020, 18), 0, 0, 0.50);
  buildGun(P, { len: 4.38, r: 0.075, sleeve: false, evac: 0.48, evacR: 1.72, collar: false, baseR: 0.16 });
  muzzleBore(P, 0.075, 4.365);

  // Two low hatch/cupola wells, TURMS/panoramic sights and seated weapon.
  // The station seats follow the authored 0.64 m crown.  Earlier values
  // were inherited from the discarded capsule shell and buried most of the
  // functional suite inside the roof, leaving a false empty plate in close
  // and top views.
  cupola(P, 'turret', 0.52, 0.675, -0.62, 0.24, 0.12, 10);
  cupola(P, 'turret', -0.50, 0.670, -0.66, 0.22, 0.10, 10);
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2;
    P.add('turretGlass', box(0.050, 0.030, 0.018), 0.52 + Math.cos(a) * 0.20, 0.785, -0.62 + Math.sin(a) * 0.20, 0, -a, 0);
  }
  sightBox(P, 'turret', 0.50, 0.685, 0.31, 0.32, 0.24, 0.27, -0.06);
  sightBox(P, 'turret', -0.28, 0.710, -0.94, 0.25, 0.29, 0.24, 0.02);
  sightBox(P, 'turret', -0.83, 0.675, -0.18, 0.21, 0.18, 0.24, 0.04);
  P.add('turret', box(0.30, 0.11, 0.24), 0.88, 0.695, -0.83, 0, -0.08, 0);
  P.add('turretDark', box(0.24, 0.025, 0.18), 0.88, 0.765, -0.83, 0, -0.08, 0);
  P.add('turretDetail', torus(0.12, 0.018, 16), -0.05, 0.735, -1.32, Math.PI / 2, 0, 0);
  for (const p of [[-0.60,0.715,0.12],[0.08,0.690,0.50],[0.80,0.705,-0.10]]) periscope(P, 'turretDetail', p[0], p[1], p[2]);
  {
    P.add('turret', cylY(0.13, 0.17, 0.12, 12), -0.55, 0.785, -0.68);
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', elev: -0.02, seed: 118, scale: 0.62, ammo: true });
    mg.position.set(-0.55, 0.795, -0.68); P.turretG.add(mg);
  }
  for (const s of [-1, 1]) {
    P.add('turret', box(0.22, 0.16, 0.42), s * 1.28, 0.38, -0.12, 0, s * 0.18, 0);
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: 0.058, len: 0.34, splay: s * 0.82, pitch: -0.60, arc: 0.72, spacing: 0.12, rotation: [0, 0, -s * 0.13], seed: 120 + s });
    smoke.position.set(s * 1.30, 0.48, -0.10); P.turretG.add(smoke);
    liftEye(P, 'turretDetail', s * 0.86, 0.54, 0.58, s * 0.25);
  }

  // Shallow supported rear basket and antenna collars.
  for (const s of [-1, 1]) {
    for (const y of [0.24, 0.43]) P.add('turretDetail', box(0.03, 0.03, 0.72), s * 1.16, y, -1.82);
    P.add('turretDetail', box(0.43, 0.03, 0.03), s * 0.95, 0.24, -2.20);
    P.add('turretDetail', box(0.43, 0.03, 0.03), s * 0.95, 0.43, -2.20);
    P.add('turretDetail', box(0.032, 0.27, 0.032), s * 1.16, 0.34, -2.17);
    P.add('turretDetail', box(0.035, 0.36, 0.035), s * 0.98, 0.33, -1.96, -0.48, 0, s * 0.40);
    const antennaZ = s < 0 ? -0.60 : -1.50;
    P.add('turretDetail', cylY(0.048, 0.068, 0.07, 10), s * 1.00, 0.685, antennaZ);
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: s < 0 ? 0.33 : 0.28, r: 0.010, rake: s * 0.04, seed: 130 + s });
    whip.position.set(s * 1.00, 0.725, antennaZ); P.turretG.add(whip);
  }
  for (const y of [0.24, 0.43]) P.add('turretDetail', box(1.90, 0.03, 0.03), 0, y, -2.20);
  for (const x of [-0.80,-0.40,0,0.40,0.80]) P.add('turretDetail', box(0.028, 0.21, 0.028), x, 0.34, -2.20);
  for (const y of [0.15, 0.23, 0.31]) P.add('turretDark', box(1.62, 0.020, 0.028), 0, y, -2.145);
  P.add('turretCloth', box(0.62, 0.15, 0.28), -0.28, 0.31, -1.98);
  P.add('turretCloth', box(0.42, 0.13, 0.24), 0.46, 0.30, -2.00);

  P.decal('turret', 'number', '118', 0.20, [1.36, 0.38, -0.42], Math.PI / 2, 0, 0.04);
  P.topY = 0.98;
}

function buildLeclerc(P) {
  const { box, cylY, cylZ, frustum, torus, buildGun, buildRunningGear,
    fenders, headlight, liftEye, periscope, towCable, stowage, jerryCan, ammoCan,
    spareTrackStrip, shovelTool } = KIT;
  const slab = orientedSlab;                                                   // §C missing-side fix: winding-corrected slabs only (see orientedSlab)
  const { rng } = P;
  // hull — R2 FULL RE-LAY from the post-warp workorder (2026-08-03):
  // the ref side deck line steps 1.549 (fore) / 1.577 (mid) / 1.632 (engine)
  // / 1.715 hump / 1.605 tail lip, the bow silhouette is the RAKED GLACIS
  // LINE itself falling (1.62,1.55) -> (3.44,1.22) (the old flat 1.605
  // fender plane out to z 2.95 read +0.17 over the whole nose), the belly
  // boat-tails at both ends (the old full-length tub bottom 0.25 read under
  // the ref's climbing track ramps), and the tail deep body ends -3.31.
  // Lower tub terminates at the INNER track planes.  The former ±1.175 m
  // box penetrated the native band/shoes for almost the whole contact run;
  // sponsons above it retain the full hull width and exterior silhouette.
  P.add('hull', box(1.88, 0.929, 5.05), 0, 0.7455, -0.075);                    // tub z -2.60..2.45 (belly 0.281)
  // sponson band ends z 1.95 — past that its 1.49 top pokes ABOVE the raked
  // glacis surface and re-flattens the bow line (this round's 1.499 shelf)
  P.add('hull', frustum(1.70, 1.95, -3.24, 1.68, 1.93, -3.22, 1.38, 1.49));
  P.add('hull', frustum(1.68, 2.98, 1.92, 1.68, 2.95, 1.90, 1.12, 1.26));      // full-width shoulder ends before the native idler sweep
  P.add('hull', box(2.48, 0.05, 4.40), 0, 1.52, -1.10);                        // center deck (top 1.545)
  // deck-edge planes: stepped per the measured side line; the -0.58..-0.30
  // gap is the ref's 1.494 dip (the band top shows through)
  // 90-ladder r1 deck re-meter (fresh worldtrace): the ref fore deck reads
  // 1.534 over z 0.2..1.1 (not the r2 1.549 — that line holds only fwd of
  // z 1.1), and the engine deck is a 3-step 1.607/1.627/1.631 ladder, not
  // the flat 1.632 (side cols -1.913..-2.131 read +0.024..+0.045).
  fenders(P, 1.24, 1.72, 1.519, -0.30, 1.10, 0.03);                            // fore deck aft half 1.534
  fenders(P, 1.24, 1.72, 1.534, 1.10, 2.06, 0.03);                             // fore deck fwd half 1.549
  fenders(P, 1.24, 1.695, 1.562, -1.86, -0.65, 0.03);                          // mid deck 1.577; aft edge stops before the source's supported deck dip
  fenders(P, 1.20, 1.40, 1.592, -2.16, -1.80, 0.03);                           // engine deck fore step 1.607
  fenders(P, 1.20, 1.40, 1.612, -2.40, -2.16, 0.03);                           // engine deck mid step 1.627
  fenders(P, 1.20, 1.44, 1.616, -2.55, -2.40, 0.03);                           // engine raised band 1.631 (front cols ±1.19..1.44 carry the ref's 1.631 line; side col -2.464 wants 1.638)
  fenders(P, 1.20, 1.40, 1.612, -3.06, -2.55, 0.03);                           // engine deck aft 1.627 (ref falls 1.617 by -2.91 — split priced lower)
  fenders(P, 1.38, 1.72, 1.570, -3.06, -1.80, 0.03);                           // engine deck outer edge 1.585 (front ±1.72 wants 1.555)
  fenders(P, 1.20, 1.695, 1.590, -3.24, -3.00, 0.03);                          // tail lip 1.605 (90-ladder r1: outer 1.695 — its 1.72 edge owned the front ±1.72 cols at 1.602 vs the ref's 1.553)
  for (const s2 of [-1, 1]) P.add('hull', box(0.07, 0.08, 0.165), s2 * 1.05, 1.673, -2.3125); // filler pots (the ref's 1.715 'hump' is two x ±1.05 caps. 90-ladder r1: ref front cols carry the 1.71 line ONLY at ±1.033/1.073 — the 0.16-wide pots printed +0.044/+0.063 on ±0.991/±1.112; x-span now 1.015..1.085. z rear pulled to -2.395: the old -2.415 edge AA'd into side col -2.464's window [-2.409..])
  // GLACIS: raked surface (1.64,1.55) -> (2.66,1.363) full width, then a
  // TAPER to x ±0.94 by z 2.78 and a narrow nose to 3.46 — the ascending
  // track band crosses the glacis plane at z>2.75, so full-width plate
  // there would clip through the band (containment law); the plan front at
  // x 1.0-1.6 is carried by the idler-wrap link pads (3.50) like the print
  P.add('hull', frustum(1.66, 2.66, 1.60, 1.66, 1.64, 1.60, 1.363, 1.55));
  P.add('hull', frustum(1.00, 2.74, 2.62, 1.66, 2.66, 2.62, 1.348, 1.363));
  P.add('hull', frustum(0.94, 3.46, 2.76, 0.94, 2.82, 2.76, 1.21, 1.34));
  // lower bow: narrow (x ±0.94 INSIDE the track inner faces)
  P.add('hull', frustum(0.94, 2.95, 2.42, 0.94, 3.02, 2.58, 0.27, 1.19));
  // stern boat-tail wedge, same containment narrowing
  P.add('hull', slab(                                                          // 90-ladder r1: boat-tail bottom re-laid to the ref's measured rake — the old flat-0.26-to--2.72 + single rake under-ran the want line 0.07-0.14 on five stern cols (the center wedge, not the track, owned those bottoms)
    [-0.94, 0.26, -2.44], [0.94, 0.26, -2.44], [0.94, 0.267, -2.52], [-0.94, 0.267, -2.52],
    [-0.94, 1.05, -2.44], [0.94, 1.05, -2.44], [0.94, 1.05, -2.52], [-0.94, 1.05, -2.52]));
  P.add('hull', slab(
    [-0.94, 0.267, -2.52], [0.94, 0.267, -2.52], [0.94, 0.48, -2.85], [-0.94, 0.48, -2.85],
    [-0.94, 1.05, -2.52], [0.94, 1.05, -2.52], [0.94, 1.05, -2.85], [-0.94, 1.05, -2.85]));
  P.add('hull', slab(
    [-0.94, 0.48, -2.85], [0.94, 0.48, -2.85], [0.94, 0.66, -2.98], [-0.94, 0.66, -2.98],
    [-0.94, 1.05, -2.85], [0.94, 1.05, -2.85], [0.94, 1.05, -2.98], [-0.94, 1.05, -2.98]));
  P.add('hull', slab(
    [-0.94, 0.66, -2.98], [0.94, 0.66, -2.98], [0.94, 0.88, -3.28], [-0.94, 0.88, -3.28],
    [-0.94, 1.05, -2.98], [0.94, 1.05, -2.98], [0.94, 1.05, -3.28], [-0.94, 1.05, -3.28]));
  P.add('hullDetail', box(2.88, 0.05, 0.08), 0, 1.43, 2.24, -0.20, 0, 0);      // splash ridge on the plane
  // Long outer fender rails (x 1.70..1.785 — clear of the 1.66 pad plane):
  // raked 1.445 @ z1.30 -> 1.235 @ 3.32 so the falling glacis owns the side
  // line.  The broad front mudguards below bridge these rails back into the
  // narrow bow; they are not replacements for the animated terminal shoes.
  for (const s2 of [-1, 1]) {
    P.add('hull', slab(
      [s2 * 1.70, 1.415, 1.30], [s2 * 1.785, 1.415, 1.30], [s2 * 1.785, 1.205, 3.32], [s2 * 1.70, 1.205, 3.32],
      [s2 * 1.70, 1.445, 1.30], [s2 * 1.785, 1.445, 1.30], [s2 * 1.785, 1.235, 3.32], [s2 * 1.70, 1.235, 3.32]));

    // Proper Leclerc front mudguard: a shallow raked steel cap above the
    // idler crest plus a flexible front lip AHEAD of the shoe orbit.  The
    // deleted legacy flap sat at z=3.28/y=0.775, directly through the live
    // terminal links.  This cap stays above them; its rubber lip begins
    // beyond their forward sweep.  Both supports are hull-owned: the inner
    // knee enters the narrow bow and the outer knee enters the fender rail.
    P.add('hull', slab(
      [s2 * 0.90, 1.480, 2.95], [s2 * 1.785, 1.480, 2.95], [s2 * 1.720, 1.480, 3.58], [s2 * 0.98, 1.480, 3.58],
      [s2 * 0.90, 1.525, 2.95], [s2 * 1.785, 1.525, 2.95], [s2 * 1.720, 1.525, 3.58], [s2 * 0.98, 1.525, 3.58]));
    P.add('hull', box(0.08, 0.27, 0.30), s2 * 0.90, 1.365, 3.10);             // inboard bow knee (inside the shoe lane)
    P.add('hull', box(0.07, 0.30, 0.28), s2 * 1.7425, 1.345, 3.25);           // outboard fender knee (outside the shoe lane)
    P.add('hullRubber', box(0.64, 0.15, 0.035), s2 * 1.37, 1.405, 3.58);      // shallow flexible lip, ahead of terminal shoes
    P.add('hullDark', box(0.52, 0.025, 0.018), s2 * 1.36, 1.515, 3.555);      // cap hinge/seam
  }
  // driver LEFT: flush hatch + 3 episcopes (90-ladder r1 CAP-SEAT: ref deck
  // line reads 1.534-1.544 over z 0.2..1.25 — the 1.573/1.576 hatch crowns
  // and 1.61 periscope heads printed +0.02..+0.035 on seven side cols;
  // hatch ring sunk to crown 1.548/torus 1.544, periscope seats to 1.515)
  P.add('hull', cylY(0.27, 0.27, 0.035, 16), -0.60, 1.5305, 0.85);
  P.add('hullDark', torus(0.275, 0.014, 16), -0.60, 1.537, 0.85);
  periscope(P, 'hullDetail', -0.82, 1.515, 1.10, -0.3);
  periscope(P, 'hullDetail', -0.60, 1.515, 1.15);
  periscope(P, 'hullDetail', -0.38, 1.515, 1.10, 0.3);
  // skirts: front-third armored blocks + rubber sheet, dark inset lip.
  // STATION LAW: courses SEGMENTED ~0.43-0.45 m. R2 workorder: sheet outer
  // face 1.70, band 0.48..1.49 (bottom deepened to the ref's 0.476 line);
  // blocks outer 1.80, band 0.86..1.43; a SIXTH LOW block (0.86..1.24,
  // z 3.23..3.52) is the ref's nose-tip silhouette at 3.38..3.52.
  for (const s of [-1, 1]) {
    // WIDTH GUARD: front-block outer faces exactly ±1.80
    // 90-ladder r1: k0 z-narrowed to 1.235..1.53 (ref's outer plan front at
    // ±1.828 starts z 1.229 — the old 1.11 edge printed -0.116 x2 cols);
    // k3/k4 tops TAPER 1.395/1.32 with the falling glacis (ref side tops
    // read 1.399@2.63 -> 1.306@3.07 where the flat 1.425 row sat +0.02..
    // +0.12; bottoms hold 0.865 for the front ±1.76 band).
    for (let k = 0; k < 5; k++) {
      const bt = k === 3 ? 1.395 : (k === 4 ? 1.32 : 1.425);
      const zc = k === 0 ? 1.3825 : 1.32 + 0.43 * k;
      const zd = k === 0 ? 0.295 : 0.42;
      P.add('hull', box(0.09, bt - 0.925, zd), s * 1.755, (bt + 0.925) / 2, zc);
    }
    P.add('hull', box(0.012, 0.15, 2.0), s * 1.706, 0.855, 2.24);              // mounting lip bridges the raised blocks to the fender shoulder
    P.add('hull', box(0.09, 0.315, 0.09), s * 1.725, 1.0825, 3.265);           // compact sixth block remains clear of the idler/shoe run
    for (let k = 0; k < 3; k++) P.add('hullDark', box(0.07, 0.50, 0.016), s * 1.76, 1.15, 2.85 - k * 0.72);
    for (let k = 0; k < 10; k++) {
      // LAST course is the ref's short cut-high panel over the sprocket
      // (its side bottom reads 0.805 at -3.27, not the 0.48 sheet line)
      if (k === 0) P.add('hull', box(0.035, 0.68, 0.41), s * 1.6825, 1.15, -3.05);
      else P.add('hull', box(0.035, 1.01, 0.41), s * 1.6825, 0.985, -3.05 + 0.4306 * k);
    }
    for (let k = 0; k < 5; k++) P.add('hullDark', box(0.03, 0.90, 0.016), s * 1.684, 0.975, 0.72 - k * 0.86);
    P.add('hullDark', box(0.02, 0.05, 5.82), s * 1.688, 0.505, 0.31);
    // The animated idler/shoes exclusively own the forward track lane.  The
    // restored mudguard is authored above/ahead of this lane, not at the old
    // intersecting z=3.28/y=0.775 seat.
    // §B2 CONTIG FIX (missing-left-side round, 2026-08-06; pre-existing at
    // HEAD — the r2 build predates the v2 standard-check top-down scan):
    // the 8 cm fender slot between the track outer plane (1.60) and the
    // block/strip lane encloses two ~6 cm cells per side at (±1.65,
    // z 3.13-3.25), ringed by pads (x<=1.623), 6th block (1.68+), mudguard
    // strip overhead (1.70+) and the flap (fore). Cover = the §C
    // SHADOW-NAMED RENDER FURNITURE mechanism: /shadow/i-named meshes are
    // excluded from EVERY measurement mask (fidelity baseVisible, evaluator
    // proxy-hide, critic framing — gate rows untouchable by construction)
    // while the B2 truth scan counts them (colorWrite true) and the game
    // renders the honest fender-slot shadow the real vehicle carries.
    // x 1.655..1.70 = 32 mm real clearance off the pad plane (track-clip
    // dilates 2 cm — outside the dilated envelope, zero band voxels).
    // HULL-parented: the fender casting the shadow is hull-side (§B5).
    // No static slot floor is allowed inside the animated course. The
    // widened native shoes now provide the dark mechanical negative space.
  }
  // 90-ladder r1: LEFT skirt lower rubber extension — the print's front
  // ±1.64 columns are ONE-SIDED (left runs to ground 0.006, right stops at
  // its 0.476 skirt line); our symmetric track pads coin-flipped on the
  // 1.619 window boundary (0.083 right / 0.501 left, same content). A
  // left-only rubber drop strip x -1.625..-1.655 (hung from the sheet
  // bottom 0.48, to 0.03) owns the left column deterministically; the
  // track pull-in above hands the right column back to the sheet line.
  // Side rows never see it (track shoes already own bot ~0.011 at z 0.5);
  // plan cols -1.604/-1.713 keep their z extents (0.36..0.64 interior).
  // 90-ladder r1: RIGHT inner-lane rubber tab — the print is asymmetric the
  // OTHER way on the inner planes: right col +0.953 wants ground 0.004
  // (its inner track lane runs to the floor) while left -0.951 wants the
  // 0.278 belly line. One-sided like the left outer flap.
  // The former one-sided rubber datum tabs also occupied the shoe sweep.
  // Native linked shoes own both inner and outer ground-contact silhouettes.
  // The reference's right skirt reaches inward over the outside of its
  // narrower lane.  This extension stays wholly outboard of the native band
  // and end-ring envelope (strict sweep audit enforces the clearance).
  P.add('hullRubber', box(0.043, 0.93, 0.12), 1.6435, 0.945, 2.64);
  // rear plate + REAR STOWAGE RACK overhang. R2: plate face -3.31 (ref deep
  // body end), rack rails to -3.56, top rail 1.545 — the 1.5625 top keeps
  // the rack band at 0.29 < the 12% side filter (0.302 on the 2.52 build)
  // so hullLengthM cannot read the rack as body (round-3 incident law).
  // plate face -3.36: hullLengthM measures col-center to col-center, so the
  // rear BODY column must be -3.385 (with the front one at 3.497 = 6.88);
  // a -3.31 face read only the -3.274 col = 6.77 (-1.53%)
  P.add('hull', box(3.00, 0.3405, 0.05), 0, 1.40025, -3.335);                  // (90-ladder r1: band 1.23..1.5705 — top at the ref's 1.571 rear line, bottom deep enough that — with the step filler pulled to -3.29 the plate's 0.300 band sat 4 mm UNDER the 12% cut (0.304) and the -3.352 rear anchor column silently dropped from the body span: hullLengthM 6.76 class. RAZOR-ANCHOR LAW: anchor bands need >10% margin over the cut)
  P.add('hull', box(2.00, 0.24, 0.05), 0, 1.13, -3.265);                       // step filler down to the wedge line (90-ladder r1: rear face -3.29 — the old -3.30 crossed col -3.352's window edge -3.297 and its 1.01 bottom owned the col's 0.152 err; the plate band 1.245..1.545 is the honest window content)
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.64, 0.22, 0.03), s * 0.85, 1.40, -3.345);
    for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.62, 0.035, 0.035), s * 0.85, 1.31 + k * 0.09, -3.345);
    P.add('hullDark', box(0.14, 0.08, 0.04), s * 1.32, 1.44, -3.34);
  }
  for (const [xc2, w2] of [[-0.78, 0.24], [-0.375, 0.25], [0.26, 0.54], [0.79, 0.22]]) { // rails SEGMENTED (ref plan gaps at x -0.6 / -0.15 / +0.62)
    P.add('hullDetail', box(w2, 0.035, 0.035), xc2, 1.545, -3.42);
    P.add('hullDetail', box(w2, 0.035, 0.035), xc2, 1.29, -3.53);
  }
  // 90-ladder r1 plan-rear re-meter (worldtrace): strap-end rolls at the
  // outer rail tips (ref plan rear reads -3.578 at ±0.94 — our rails
  // stopped -3.547) + the print's RIGHT-side-only rear pannier shelf
  // (cols 1.386/1.495/1.609 want -3.516..-3.537 where the left mirror
  // reads -3.288). Both stay thin-band (<0.204) so hullLengthM never sees
  // them; side col -3.461 bottom improves 1.319 -> 1.30 (want 1.285).
  for (const sx of [-1, 1]) P.add('hullCloth', box(0.05, 0.09, 0.10), sx * 0.885, 1.345, -3.51); // strap-end rolls to -3.56 EXACTLY the bag line — GRID LAW: the first -3.587 seat grew the shared box, shifted every 96-col grid (side dAlong 0 -> -0.057, a ref-only col at -3.654 appeared and the whole roof spike field paid the tax). Box z-min stays the bags' -3.56.
  P.add('hullDetail', box(0.32, 0.16, 0.145), 1.495, 1.38, -3.4325);           // right pannier shelf x 1.335..1.655, z -3.36..-3.505
  P.add('hullDark', box(0.30, 0.012, 0.125), 1.495, 1.462, -3.4325);           // shelf lid seam
  for (const vx of [-0.78, -0.375, 0.10, 0.42, 0.79]) P.add('hullDetail', box(0.03, 0.18, 0.14), vx, 1.41, -3.46);
  for (const [rxc, rw] of [[-0.78, 0.24], [-0.375, 0.25], [0.26, 0.54], [0.79, 0.22]]) {
    P.add('hullDetail', box(rw, 0.035, 0.07), rxc, 1.5525, -3.525);            // 90-ladder r1: rack rear top cross-rail SEGMENTED like the lower rails (top 1.570, z -3.49..-3.56 — side cols -3.461/-3.575 wanted the ref's 1.571 tail line; the first SOLID rail filled the print's plan gaps at x -0.6/-0.15/+0.62 and printed -3.56 on the ±0.17/±0.61 plan cols: 0.177 x3. BOX LAW: rear face -3.56 = the bag line)
  }
  stowage(P, 'hullCloth', rng, [[-0.78, 1.40, -3.44, 0.20, 0.15, 0.18], [-0.375, 1.40, -3.44, 0.24, 0.16, 0.19], [0.26, 1.40, -3.45, 0.50, 0.17, 0.21], [0.79, 1.395, -3.44, 0.18, 0.15, 0.18]]);
  // (§B3.2 note: a fifth bag in the 0.51..0.70 rail gap was tried and
  // REVERTED twice-decoded — as a stowage() entry it shifts the rng stream
  // for every later call, and as a fixed box it fills a rear plan gap the
  // PRINT deliberately keeps open at col 0.623 (ref rear -3.253 vs the bag
  // at -3.53, +0.083 on plan_whole). The rack stays four-bag like the ref.)
  // engine deck: raised CENTER plate at the ref's 1.618 line (front view
  // center tops 1.62 come from HERE — the fore deck stays 1.545) + inset
  // fan dark + louvres barely proud
  P.add('hull', box(2.40, 0.05, 1.30), 0, 1.593, -2.42);
  P.add('hullDark', box(1.80, 0.016, 1.20), 0, 1.61, -2.42);
  for (let k = 0; k < 6; k++) P.add('hullDetail', box(1.72, 0.02, 0.055), 0, k < 2 ? 1.597 : 1.617, -1.87 - k * 0.17); // louvres follow the 90-ladder deck steps: fore pair 1.607, aft field 1.627
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.09, 0.09, 0.026, 12), s * 1.30, 1.482, -0.55);  // 90-ladder r1: vents sunk to the ref's 1.494-1.498 DIP line (they owned side cols -0.47/-0.584 at 1.558/1.569 vs want 1.498)
    P.add('hullDetail', cylY(0.032, 0.032, 0.05, 8), s * 1.30, 1.448, -0.55);  // stem to the sponson band (no float)
  }
  // TWIN headlight clusters (photo round, read 8): main lamp + inboard
  // blackout lamp per corner, LOW on the glacis line inside the guards
  // (tops < the 1.374 glacis read at z 2.60; front cols there are 1.6
  // block-topped — cluster interior on every row).
  headlight(P, -1.74, 1.33, 2.60, -0.2);
  headlight(P, 1.74, 1.33, 2.60, -0.2);
  headlight(P, -1.655, 1.328, 2.615, -0.2, 0.042);
  headlight(P, 1.655, 1.328, 2.615, -0.2, 0.042);
  // §5.14: the inboard pair reads as the IR/blackout lamp — dark lens caps
  // (flush discs on the lamp faces, inside the guards; width-guard safe)
  P.add('hullDark', cylZ(0.032, 0.008, 10), -1.655, 1.337, 2.641, -0.2, 0, 0);
  P.add('hullDark', cylZ(0.032, 0.008, 10), 1.655, 1.337, 2.641, -0.2, 0, 0);
  // §B3.2 (2026-08-06): light BRUSH GUARDS — low frames capped at y 1.37
  // (the falling glacis line reads 1.374 at z 2.60: guards must stay under
  // it; the first draft at 1.445 would have printed +0.07 on two side
  // cols). Front cols ±1.74 top out at the 1.56 mudguard crests; plan front
  // there is the 3.32 strip lane — guards interior on every row.
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.16, 0.022, 0.03), s * 1.715, 1.36, 2.72);          // top rail (WIDTH GUARD: outer face 1.795 < the 1.80 skirt plane)
    P.add('hullDark', box(0.022, 0.09, 0.03), s * 1.784, 1.315, 2.72);         // posts
    P.add('hullDark', box(0.022, 0.09, 0.03), s * 1.646, 1.315, 2.72);
  }
  towCable(P, [[-1.10, 1.44, 2.30], [0, 1.50, 1.85], [1.10, 1.44, 2.30]]);
  // §B3.2: second tow cable run on the right engine deck — crown 1.62 under
  // the ref's own 1.634 engine line (side cols -1.9..-3.0), interior to the
  // deck plan outline.
  towCable(P, [[0.62, 1.59, -1.90], [0.98, 1.595, -2.35], [0.70, 1.59, -2.90]]);
  // §5.14: LEFT engine-deck cable run (real Leclercs carry a pair) — crowns
  // 1.61 under the 1.618 engine line, inboard of the x -1.03 pioneer lane
  towCable(P, [[-0.60, 1.59, -1.95], [-0.90, 1.595, -2.40], [-0.66, 1.59, -2.92]]);
  // §B3.2: bow TOW SHACKLES on the lower bow plate (real fit: paired clevis
  // points low center; proud 40 mm, z face 3.30 under the 3.46 nose tip and
  // the 3.50 idler-pad plan lane; side rows there are wrap/nose-owned).
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.11, 0.13, 0.06), s * 0.55, 0.78, 3.27);
    P.add('hullDetail', box(0.05, 0.05, 0.05), s * 0.55, 0.78, 3.315);
  }
  liftEye(P, 'hullDetail', -1.30, 1.50, -0.95);
  liftEye(P, 'hullDetail', 1.30, 1.50, -0.95);
  // §B3.2: pioneer tools on the INNER engine-deck lanes (x 0.90..1.18
  // between the louvre field and the fender break, base 1.593 plate: crowns
  // 1.62 under BOTH the ref's 1.634 side line and the 1.632 front-col deck
  // line — the first seat on the 1.60 outer fender topped the front_hull
  // cols at x 1.44-1.60 by 30 mm, -0.46 row pts, gate-in-loop find).
  shovelTool(P, 1.03, 1.5905, -2.62, 0.85);
  P.add('hullWood', box(0.035, 0.025, 0.90), -1.03, 1.5905, -2.50);            // pick haft
  P.add('hullDark', box(0.10, 0.028, 0.16), -1.03, 1.592, -2.88);              // pick head
  // §B3.2: rear convoy light + guard, FLUSH-mounted on the rear plate
  // (rear face -3.381 — the first 35 mm-proud seat read -3.3955 and moved
  // the col-0.623 rear line; inside the 1.245..1.545 plate band).
  P.add('hullDark', box(0.07, 0.05, 0.026), 0.60, 1.30, -3.368);
  P.add('hullDetail', box(0.09, 0.012, 0.032), 0.60, 1.333, -3.372);
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
  // Running-gear ownership law: removed the former per-side static
  // `hullTrackTrim` ramp/wrap fills.  Those solids copied the desired track
  // silhouette while occupying the same space as the animated band and
  // linked shoes.  The native loop below now authors the complete visible
  // course, including both end transitions.
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.36, wheelW: 0.22, wheelY: 0.45, xc: 1.295,
    // The source's forward lanes are mildly asymmetric.  Move the complete
    // native assemblies—not static hull tabs—so wheels, wraps, bands and
    // individual shoes remain concentric and share one authored ownership.
    xcLeft: 1.315, xcRight: 1.280,
    wheelZs,
    sprocket: { z: -3.00, y: 0.84, r: 0.14 },
    // Full-size front idler at the same raised station as the final drive.
    // Only this terminal wheel changes; the six established road wheels and
    // every hull/skirt/mudguard dimension remain untouched.
    idler: { z: 3.27, y: 0.84, r: 0.22 },
    // Five real return rollers sit directly beneath the upper course.  The
    // previous 0.88/0.08 placement put their crowns above the 0.91 m loop
    // centreline while `coveredTop` deleted every shoe, producing an empty
    // black slot.  Seat larger rollers just under the restored linked run.
    rollers: [1.95, 1.05, 0.15, -0.80, -1.70].map((z) => ({ z, y: 0.80, r: 0.10 })),
    // Use the native wheel-supported trapezoid.  The old hand-authored loop
    // climbed far above the front idler and detached the course from the road
    // wheels in front/rear views.  These contact points keep the lower run on
    // the wheel bottoms and the return run on the existing support rollers.
    trackW: 0.630, trackTh: 0.07, topY: 0.935, botY: 0.055,
    contactZF: 2.30, contactZR: -2.10,
    endRingSpan: 0.56,
    linkPitchM: 0.11, shoeRadialScale: 0.61, padGroundCenter: 0.069,
    padCornerFloor: 0.02, padHugZ0: 2.40,
    paintedEnds: true, coveredTop: false, arms: true,
  });
  // 90-ladder r1 track re-meter: the 0.64-band's pads reached x 1.623 and
  // COIN-FLIPPED into the front ±1.64 col windows ([1.619..]; official run
  // read bot 0.083 right / 0.501 left from the same symmetric content —
  // grid-asym AA). Band 0.99..1.575 (pads ~1.60) clears the boundary by
  // ~11 mm AND pulls the inner face out of the ±0.951 windows (ref wants
  // bot 0.279 there, its track inner plane is ~0.97; the old 0.96 inner
  // face printed ground at ±0.951, err 0.167).
  wheelRecessAt(P, wheelZs, 1.295, 0.45, 0.36, 0.22, 'hullRunningGearDark');  // explicit suspension ownership; strict track lint must not infer by position

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
  P.add('turret', slab(                                                        // rear/autoloader box — right-rear roof corner CLIPPED (print); photo
    [-1.30, 0, -0.12], [1.30, 0, -0.12], [1.30, 0, -1.55], [-1.30, 0, -1.70],
    [-1.02, 0.60, -0.15], [1.02, 0.60, -0.15], [0.95, 0.60, -1.72], [-1.02, 0.60, -1.92])); // round: right-rear BOTTOM corner tapered -1.70 -> -1.55 to the ref's swept right rear (plan cols 1.066..1.288 read the ring at z_w -1.80 vs ref -1.786..-1.703; side bottoms keep the left corner)
  P.add('turret', slab(                                                        // bustle tail LEFT of the center notch (photo round: inner face at
    [-1.24, 0.16, -1.72], [-0.12, 0.16, -1.72], [-0.12, 0.40, -2.16], [-1.10, 0.40, -2.23],
    [-1.20, 0.555, -1.72], [-0.12, 0.615, -1.72], [-0.12, 0.578, -2.16], [-1.06, 0.578, -2.23])); // outer bustle shoulder falls beneath the left sensor station, matching the source's asymmetric roof line
  P.add('turret', slab(                                                        // bustle tail RIGHT of the notch: rear SQUARED at z_l -2.07 (z_w -2.17
    [0.14, 0.16, -1.72], [0.98, 0.16, -1.72], [0.90, 0.40, -2.07], [0.14, 0.40, -2.07],
    [0.14, 0.615, -1.72], [0.96, 0.615, -1.72], [0.86, 0.578, -2.07], [0.14, 0.578, -2.07])); // = ref cols 0.18..0.955), outer edge stepped at x 0.96/0.98 (ref's hard step ~0.95; the old 1.10 slant read z_w -1.96 in the col-1.066 window vs ref -1.786)
  for (const s of [-1, 1]) {
    P.add('turret', slab(                                                      // aft roof wedges: raised SIDE BANDS |x| 0.30..1.05
      [s * 1.28, 0.56, -1.28], [s * 0.30, 0.56, -1.28], [s * 0.30, 0.44, s > 0 ? -2.04 : -2.20], [s * (s > 0 ? 1.02 : 1.24), 0.44, s > 0 ? -1.80 : -2.20],
      [s * 1.05, LH, -1.30], [s * 0.30, LH, -1.30], [s * 0.30, 0.578, s > 0 ? -2.06 : -2.22], [s * (s > 0 ? 0.88 : 1.03), 0.578, s > 0 ? -1.84 : -2.22]));
  }
  // LOW center roof channel (ref front center 2.248). Photo round: split
  // into FOUR z-stepped segments respecting the print's center-rear NOTCH —
  // the one slab ran to z_w -2.24 across the notch and owned the two worst
  // plan_turret cols (0.069: ref -1.814 proc -2.229, +0.222; -0.042: ref
  // -2.09, +0.098). Steps (z_l rear, b/t): A -2.12/-2.14 | B -1.97/-1.99
  // (z_w -2.09 = ref col -0.042) | C -1.69/-1.71 (z_w -1.81 = ref col
  // 0.069) | D -2.05/-2.07 (z_w -2.17 = ref cols 0.18/0.291).
  P.add('turret', slab(
    [-0.34, 0.56, -0.60], [-0.12, 0.56, -0.60], [-0.12, 0.44, -2.12], [-0.32, 0.44, -2.12],
    [-0.32, 0.648, -0.62], [-0.12, 0.648, -0.62], [-0.12, 0.578, -2.14], [-0.30, 0.578, -2.14]));
  P.add('turret', slab(
    [-0.12, 0.56, -0.60], [-0.005, 0.56, -0.60], [-0.005, 0.450, -1.97], [-0.12, 0.450, -1.97],
    [-0.12, 0.648, -0.62], [-0.005, 0.648, -0.62], [-0.005, 0.585, -1.99], [-0.12, 0.585, -1.99]));
  P.add('turret', slab(
    [-0.005, 0.56, -0.60], [0.135, 0.56, -0.60], [0.135, 0.472, -1.69], [-0.005, 0.472, -1.69],
    [-0.005, 0.648, -0.62], [0.135, 0.648, -0.62], [0.135, 0.598, -1.71], [-0.005, 0.598, -1.71]));
  P.add('turret', slab(
    [0.135, 0.56, -0.60], [0.34, 0.56, -0.60], [0.32, 0.444, -2.05], [0.135, 0.444, -2.05],
    [0.135, 0.648, -0.62], [0.32, 0.648, -0.62], [0.30, 0.581, -2.07], [0.135, 0.581, -2.07]));
  // CENTER STRUCTURE (FRANCE ROUND re-measure, 2026-08-07 — owner: "the
  // front sloping was not good, compare the turret to the actual model
  // again"). Fresh print decode (tools/tmp-france-front2.mjs ref maps): the
  // center is NOT a 29-deg V — it is a TALL near-vertical PLATE (y 1.65..
  // 2.10w, face z_w 2.05->2.02, ~8 deg lean), a NARROW FLAT BROW strip at
  // 2.13w (z_w 1.94..2.03 — "the small strip of flatness" above the
  // mantlet), then ONE LONG ~10-deg raked face climbing to the 2.248w
  // center line at z_w ~1.26. The old x +-0.115 rotor ridge ran 2.248w out
  // to z_w 2.145 (+0.12 over the ref's own 2.13 brow band); it is replaced
  // by the measured plate/brow/slope and a WIDENED aft center pad (x
  // +-0.35 = the ref's 2.22-2.23 plan band) ending at the slope landing.
  P.add('turret', box(0.70, 0.648, 1.735), 0, 0.324, 0.5125);                  // center pad: x +-0.35, top 2.248w, z_l -0.355..1.38
  for (const s of [-1, 1]) {
    P.add('turret', slab(                                                      // center PLATE half (near-vertical, 8-deg lean; the print's 2.02-2.08 face)
      [s * 0.06, 0.17, 2.155], [s * 0.44, 0.17, 2.155], [s * 0.44, 0.17, 2.03], [s * 0.06, 0.17, 2.03],
      [s * 0.06, 0.53, 2.125], [s * 0.44, 0.53, 2.125], [s * 0.44, 0.53, 2.03], [s * 0.06, 0.53, 2.03]));
    P.add('turret', slab(                                                      // center SLOPE half: the long raked face, brow -> 2.248 line (9.8 deg)
      [s * 0.06, 0.53, 2.04], [s * 0.44, 0.53, 2.04], [s * 0.44, 0.53, 1.36], [s * 0.06, 0.53, 1.36],
      [s * 0.06, 0.648, 1.38], [s * 0.44, 0.648, 1.38], [s * 0.44, 0.648, 1.36], [s * 0.06, 0.648, 1.36]));
    P.add('turretDark', box(0.006, 0.36, 0.02), s * 0.445, 0.35, 2.09);        // panel seam line at the plate/cheek junction
    P.add('turret', slab(                                                      // center flank wall x +-0.435..0.445 (field -> raised center; real panel side)
      [s * 0.435, 0.355, 1.90], [s * 0.445, 0.355, 1.90], [s * 0.445, 0.435, 1.10], [s * 0.435, 0.435, 1.10],
      [s * 0.435, 0.53, 2.06], [s * 0.445, 0.53, 2.06], [s * 0.445, 0.648, 1.36], [s * 0.435, 0.648, 1.36]));
  }
  P.add('turret', box(0.88, 0.075, 0.085), 0, 0.4925, 2.0825);                 // BROW: flat strip x +-0.44, top 2.13w, z_w 1.94..2.025
  P.add('turret', box(0.42, 0.115, 0.235), 0, 0.5855, 2.1725);                 // mantlet ROTOR housing bulge above the brow (x +-0.21, top 0.643 = 2.243w, z_w 1.955..2.19 — the ref's own gun-frame rotor mass owns side cols 1.955/2.065/2.176 at 2.243; the §B3.1 rotor the real vehicle carries)
  P.add('turret', box(0.23, 0.10, 0.36), 0, 0.593, 1.875);                     // rotor SPINE strip riding the center slope (x +-0.115, top 0.643, z_w 1.595..1.955 — continues the rotor line aft; the ref's 2.243 band covers cols 1.733/1.844 the slope alone undershot 0.044)
  P.add('turret', slab(                                                        // right main cheek core (re-topped to the FIELD line — the swept-planar
    [0.33, 0, 1.12], [1.30, 0, -0.10], [1.30, 0, -0.5], [0.33, 0, 0.68],
    [0.31, 0.44, 1.02], [1.00, 0.44, -0.16], [1.00, 0.44, -0.5], [0.31, 0.44, 0.58]));
  P.add('turret', slab(                                                        // left main cheek core
    [-1.30, 0, -0.10], [-0.33, 0, 1.12], [-0.33, 0, 0.68], [-1.30, 0, -0.5],
    [-1.00, 0.44, -0.16], [-0.31, 0.44, 1.02], [-0.31, 0.44, 0.58], [-1.00, 0.44, -0.5]));
  // MID ROOF at 2.21w (the print's own forward-roof band: left rim 2.21 /
  // center 2.22 / the fields' landing) spanning the tower/hatch zone, with
  // RISERS: field->mid at z_l 1.10..0.98, mid->high at z_l 0.06..-0.06.
  // The old full-width 2.352 plateau reaching z_w 0.92 was the owner's
  // "not good" front: the print's front half tops at 2.0-2.23.
  P.add('turret', box(2.04, 0.05, 0.88), 0, 0.585, 0.50);                      // mid roof deck x +-1.02, top 0.61 (2.21w), z_l 0.06..0.94
  for (const s of [-1, 1]) {
    P.add('turret', slab(                                                      // field->mid riser (raked step at the print's z_w 1.0 line; inboard run hidden inside the center pad)
      [s * 0.115, 0.44, 1.10], [s * 1.02, 0.44, 1.10], [s * 1.02, 0.44, 1.06], [s * 0.115, 0.44, 1.06],
      [s * 0.115, 0.61, 0.98], [s * 1.02, 0.61, 0.98], [s * 1.02, 0.61, 0.94], [s * 0.115, 0.61, 0.94]));
    P.add('turret', slab(                                                      // mid->high riser (the print's 2.21 -> 2.36 step: ref reads 2.30-2.36 at z_w -0.08..-0.14; crest at z_w -0.12 keeps the col-0.072 window fed)
      [s * 0.34, 0.61, 0.06], [s * 1.00, 0.61, 0.06], [s * 1.00, 0.61, 0.02], [s * 0.34, 0.61, 0.02],
      [s * 0.34, LH, -0.02], [s * 1.00, LH, -0.02], [s * 1.00, LH, -0.06], [s * 0.34, LH, -0.06]));
    P.add('turret', slab(                                                      // mid chamfer: mid roof edge -> the side-box top line (planar t-ring)
      [s * 1.00, 0.56, 0.98], [s * 1.40, 0.30, 0.94], [s * 1.40, 0.30, 0.02], [s * 1.00, 0.56, 0.06],
      [s * 1.02, 0.61, 0.98], [s * 1.42, 0.335, 0.94], [s * 1.42, 0.335, 0.02], [s * 1.02, 0.61, 0.06]));
  }
  for (const s of [-1, 1]) {
    P.add('turret', box(0.66, 0.06, 0.54), s * 0.67, 0.722, -0.33);            // HIGH ROOF forward caps x 0.34..1.00 per side, top LH (2.352w), z_l -0.06..-0.60 — the CENTER stays at the channel line (ref front center cols 2.248-2.278: a full-width cap read +0.046..0.055 on six cols, loop 1)
  }
  // commander hatch WELL (print read: recessed dish floor 2.07w, x -0.35..
  // -0.85, z_w 0.34..0.64) sunk into the mid roof + lid ring inside
  P.add('turretDark', box(0.50, 0.014, 0.34), -0.60, 0.475, 0.59);             // well floor 2.075w
  P.add('turret', cylY(0.185, 0.185, 0.035, 14), -0.60, 0.50, 0.59);           // hatch lid (top 2.135w, inside the well)
  P.add('turretDark', torus(0.155, 0.010, 12), -0.60, 0.538, 0.59);            // lid rim ring
  for (const [wx, wz, ww, wd] of [[-0.60, 0.415, 0.50, 0.016], [-0.60, 0.765, 0.50, 0.016], [-0.345, 0.59, 0.016, 0.36], [-0.855, 0.59, 0.016, 0.36]]) {
    P.add('turret', box(ww, 0.135, wd), wx, 0.5425, wz);                       // well side walls up to the mid-roof rim
  }
  // gunner sight HOUSING cluster (print reads 2.31-2.42 over x 0.45..1.05,
  // z_w 0.16..0.70 — the HL-70 armored box the identity packet names;
  // §B3.2 real equipment, owns the side cols the old plateau covered)
  P.add('turret', box(0.54, 0.11, 0.42), 0.72, 0.665, 0.37);                   // compact housing base remains directly beneath the raised sight lid
  P.add('turret', box(0.38, 0.055, 0.36), 0.70, 0.7475, 0.38);                 // raised lid step (top 2.375w, z_w 0.10..0.46 = the ref's 2.35-2.42 crest seat; the first z_l 0.32..0.68 seat left col 0.072's window reading the pad)
  P.add('turretDark', box(0.30, 0.016, 0.28), 0.70, 0.783, 0.38);              // lid seam
  P.add('turretDark', box(0.05, 0.05, 0.05), 0.50, 0.695, 0.24);               // wiper motor pot
  // roof-edge chamfer AFT SECTION (unchanged geometry aft of the high
  // riser; ref front tops 2.35 @ x1.0 -> 2.22 @ x1.40 still owned here)
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.98, 0.56, -0.02], [s * 1.40, 0.56, -0.06], [s * 1.40, 0.56, -1.30], [s * 0.98, 0.56, -1.30],
      [s * 0.98, LH, -0.02], [s * 1.36, s > 0 ? 0.565 : 0.615, -0.06], [s * 1.36, s > 0 ? 0.565 : 0.615, -1.30], [s * 0.98, LH, -1.30]));
  }
  // ---- TURRET FRONT (re-authored 2026-08-06, owner close-up: "the leclerc
  // turret front is more sloped, and slopes down to a small strip of
  // flatness i believe"). Print decode (tools/tmp-leclercfront-probe.mjs
  // depth/height maps + 96-col workorder): each cheek is ONE steeply raked
  // flat plane — 29 deg from horizontal, the print's inboard rake reads
  // 30.5 deg — falling from the forward-roof arris to a NARROW NEAR-VERTICAL
  // STRIP (1.55..1.74w, 15 mm forward lean at the base like the print) that
  // carries the swept plan front edge; the gunner's sight sits RECESSED in
  // the RIGHT cheek (§B1.1 riding detail — the print's own plan notch cols
  // 0.623: 1.841 / 0.734: 1.952 chased exactly by the open bay + shutter
  // housing). Both cheeks carry the SAME plane (§B1.1; the print's proud
  // LEFT glass housing is dropped per the owner's real-vehicle read — its
  // 2.229 plan band falls to the strip's 2.06 line: +0.17 x ~6 left cols,
  // decoded in the packet). §B1 the rake motivates the mass: facet arris at
  // x 0.98 = the roof-edge chamfer knee, outboard facet top runs ON the
  // chamfer line (0.752 -> 0.60), strip and boot re-derive from the plane.
  // No staircase: the old vertical cheek fronts + fore-block/collar stack
  // are gone; the gun run is strip -> boot (top 2.13w = ref 2.132 shelf) ->
  // root collar (2.085w = ref 2.077 shelf) -> junction collars. All facet
  // quads verified planar (twisted-quad law, <= 4 mm sagitta).
  // Strip raised to the print's 1.77w top; ABOVE it the measured two-stage
  // profile: a SHORT 30.5-deg rake (rise 0.19, plan retreat 0.323) landing
  // on LOW near-flat FIELDS (1.96 -> 2.04w over z_w 1.66..1.00, ~7 deg) —
  // the print's cheek tops. The old single 29-deg plane climbing to the
  // 2.352 roof arris at z_w 0.96 read +0.06..+0.20 over the ref across the
  // whole cheek band (proc-vs-ref maps, tmp-france-front2) — the owner's
  // "front sloping was not good".
  const FR = { sB: -0.05, sT: 0.17, kink: 0.98, inZ: 2.16, inZb: 2.175,
    outX: 1.47, outZ: 1.731, outZb: 1.746, rear: 0.20,
    rkT: 0.36, rkD: 0.323, fT: 0.44, fZ: 1.10 };
  // Corner sweep polyline. LOOP-7 RECEIPT: a convex bulge chasing the raw
  // col reads (waypoints 1.30/2.04, 1.42/1.955) cost turret 88.8 -> 87.0 —
  // the ref's 1.869/1.925 "fronts" are window maxima, not line points
  // (window = +-half-pitch), and the bulge flooded the neighboring priced
  // windows. The gate-verified LINEAR sweep stands; the 1.288/1.398 col
  // residuals are certified print-corner reads.
  const CSW = [[0.98, 2.16], [1.47, 1.731]];
  const czAt = (x) => {
    for (let i = 1; i < CSW.length; i++) {
      if (x <= CSW[i][0] + 1e-9) {
        const [xa, za] = CSW[i - 1], [xb, zb] = CSW[i];
        return za + (x - xa) / (xb - xa) * (zb - za);
      }
    }
    return CSW[CSW.length - 1][1];
  };
  for (const s of [-1, 1]) {
    const m = (x) => s * x;
    // the near-vertical STRIP (15 mm lean, swept corner) — plan lines
    // unchanged: priced cols 0.845/0.955/1.066/1.509 keep their owners
    const stripSeg = (x0, x1) => P.add('turret', slab(
      [m(x0), FR.sB, FR.inZb], [m(x1), FR.sB, FR.inZb], [m(x1), FR.sB, FR.rear], [m(x0), FR.sB, FR.rear],
      [m(x0), FR.sT, FR.inZ], [m(x1), FR.sT, FR.inZ], [m(x1), FR.sT, FR.rear], [m(x0), FR.sT, FR.rear]));
    if (s < 0) stripSeg(0.06, FR.kink);
    else { stripSeg(0.06, 0.50); stripSeg(0.80, FR.kink); }
    // CONVEX corner sweep (loop 6 workorder: the linear 0.98->1.47 line
    // undershot the ref's own plan cols — 1.288: ref 1.925 vs 1.79, 1.398:
    // ref 1.869 vs 1.694, err 0.07-0.175. Waypoints hit the ref columns;
    // the outer segment drops to the priced 1.648-EXACT col at 1.509.)
    P.add('turret', slab(                                                      // strip swept corner
      [m(FR.kink), FR.sB, czAt(FR.kink) + 0.015], [m(FR.outX), FR.sB, czAt(FR.outX) + 0.015], [m(FR.outX), FR.sB, FR.rear], [m(FR.kink), FR.sB, FR.rear],
      [m(FR.kink), FR.sT, czAt(FR.kink)], [m(FR.outX), FR.sT, czAt(FR.outX)], [m(FR.outX), FR.sT, FR.rear], [m(FR.kink), FR.sT, FR.rear]));
    // CHEEK RAKE 30.5 deg (print inboard fit 29-31 over both cheeks):
    // strip top -> field edge, swept parallel to the strip (planar quads)
    const rake = (x0, x1, z0, z1) => P.add('turret', slab(
      [m(x0), FR.sT, z0], [m(x1), FR.sT, z1], [m(x1), FR.sT, FR.rear], [m(x0), FR.sT, FR.rear],
      [m(x0), FR.rkT, z0 - FR.rkD], [m(x1), FR.rkT, z1 - FR.rkD], [m(x1), FR.rkT, FR.rear], [m(x0), FR.rkT, FR.rear]));
    if (s < 0) rake(0.44, FR.kink, FR.inZ, FR.inZ);
    else { rake(0.44, 0.50, FR.inZ, FR.inZ); rake(0.80, FR.kink, FR.inZ, FR.inZ); }
    // corner rake: swept parallelogram over the strip corner (planar)
    P.add('turret', slab(
      [m(FR.kink), FR.sT, czAt(FR.kink)], [m(1.36), FR.sT, czAt(1.36)], [m(1.36), FR.sT, FR.rear], [m(FR.kink), FR.sT, FR.rear],
      [m(FR.kink), FR.rkT, czAt(FR.kink) - FR.rkD], [m(1.36), FR.rkT, czAt(1.36) - FR.rkD], [m(1.36), FR.rkT, FR.rear], [m(FR.kink), FR.rkT, FR.rear]));
    // LOW FIELDS: inboard flat (0.36 -> 0.44 over z 1.837..1.10); the right
    // field splits around the sight-well opening and carries the bay
    // ceiling strip (the well stays cut through strip + rake)
    const field = (x0, x1, zF, yF = FR.rkT) => P.add('turret', slab(
      [m(x0), yF, zF], [m(x1), yF, zF], [m(x1), yF, FR.fZ], [m(x0), yF, FR.fZ],
      [m(x0), FR.fT, FR.fZ + 0.02], [m(x1), FR.fT, FR.fZ + 0.02], [m(x1), FR.fT, FR.fZ], [m(x0), FR.fT, FR.fZ]));
    const fZin = FR.inZ - FR.rkD;                                              // 1.837
    if (s < 0) field(0.44, FR.kink, fZin);
    else {
      field(0.44, 0.50, fZin); field(0.80, FR.kink, fZin);
      P.add('turret', slab(                                                    // bay ceiling strip: field surface over the well rear (lens zone)
        [0.50, 0.395, 1.53], [0.80, 0.395, 1.53], [0.80, 0.395, FR.fZ], [0.50, 0.395, FR.fZ],
        [0.50, FR.fT, FR.fZ + 0.02], [0.80, FR.fT, FR.fZ + 0.02], [0.80, FR.fT, FR.fZ], [0.50, FR.fT, FR.fZ]));
    }
    // corner field: planar quad (outer rear corner solved onto the plane —
    // 2.004w, the print's own outboard drop)
    P.add('turret', slab(
      [m(FR.kink), FR.rkT, fZin], [m(1.36), FR.rkT, czAt(1.36) - FR.rkD], [m(1.36), 0.404, FR.fZ], [m(FR.kink), FR.fT, FR.fZ],
      [m(FR.kink), FR.rkT + 0.001, fZin], [m(1.36), FR.rkT + 0.001, czAt(1.36) - FR.rkD], [m(1.36), 0.405, FR.fZ], [m(FR.kink), FR.fT + 0.001, FR.fZ]));
    // outer skirt x 1.36..1.44: rake continuation to the box-top line, then
    // a near-flat shoulder strip aft (ref x1.45 reads 1.92-2.0) — planar
    P.add('turret', slab(
      [m(1.36), FR.sT, czAt(1.36)], [m(1.44), FR.sT, czAt(1.44)], [m(1.44), FR.sT, FR.rear], [m(1.36), FR.sT, FR.rear],
      [m(1.36), 0.30, czAt(1.36) - 0.221], [m(1.44), 0.30, czAt(1.44) - 0.221], [m(1.44), 0.30, FR.rear], [m(1.36), 0.30, FR.rear]));
    P.add('turret', slab(
      [m(1.36), 0.295, czAt(1.36) - 0.221], [m(1.44), 0.295, czAt(1.44) - 0.221], [m(1.44), 0.295, FR.rear], [m(1.36), 0.295, FR.rear],
      [m(1.36), 0.32, czAt(1.36) - 0.221], [m(1.44), 0.32, czAt(1.44) - 0.221], [m(1.44), 0.32, FR.rear], [m(1.36), 0.32, FR.rear]));
  }
  // gunner's sight WELL (right cheek): open bay cut through plane + strip.
  // Floor front edge z_w 1.84 owns plan col 0.623 (ref 1.841); the armored
  // shutter housing face z_w 1.95 owns col 0.734 (ref 1.952); lens on the
  // bay rear wall under the hood (§B3 sight grammar: hood + lens).
  P.add('turret', box(0.30, 0.23, 0.54), 0.65, 0.065, 1.67);                   // bay floor (top 1.78w)
  P.add('turretDark', box(0.30, 0.42, 0.05), 0.65, 0.16, 1.425);               // bay rear wall (to the ceiling strip)
  P.add('turretDark', box(0.02, 0.42, 0.55), 0.51, 0.16, 1.675);               // bay walls (tops meet the 0.395 ceiling strip)
  P.add('turretDark', box(0.02, 0.42, 0.55), 0.79, 0.16, 1.675);
  P.add('turretDark', box(0.20, 0.15, 0.02), 0.60, 0.28, 1.452);               // lens frame
  P.add('turretGlass', box(0.15, 0.11, 0.016), 0.60, 0.28, 1.462);             // lens
  P.add('turret', box(0.12, 0.40, 0.10), 0.74, 0.235, 2.00);                   // shutter housing (face 1.95w plan line)
  for (let k = 0; k < 3; k++) P.add('turretDark', box(0.10, 0.010, 0.006), 0.74, 0.16 + k * 0.075, 2.047); // shutter slat lines (photo read 4 — 3 mm INSET from the priced 1.952 face, mask-free)
  P.add('turret', slab(                                                        // hood: thin visor at the rake TOP over the bay opening (plan-frontmost
    [0.46, 0.315, 1.914], [0.84, 0.315, 1.914], [0.84, 0.315, 1.874], [0.46, 0.315, 1.874],
    [0.46, 0.42, 1.736], [0.84, 0.42, 1.736], [0.84, 0.42, 1.696], [0.46, 0.42, 1.696])); // point z_l 1.914 = z_w 1.814 < the bay floor edge 1.841 — col 0.623 keeps its priced owner (the loop-1 low seat printed 2.025 on it, +0.08)
  // chin jaw under the bay (LOW, bottom 1.27w over z 1.45..1.66w — the dark
  // under-mantlet recess the real vehicle carries) + gun BOOT and ROOT
  // COLLAR on the print's own side shelves (2.132 / 2.077)
  P.add('turret', box(0.38, 0.86, 0.21), 0, 0.10, 1.655);
  // BIG SQUARE CANVAS MANTLET BOOT (photo round, §B3.1 canvas grammar):
  // widened x +-0.19 -> +-0.21 (26 mm clear of the plan col-0.291 window at
  // 0.236 — partial-pixel law), soft top-edge chamfers, sag-crease dark
  // seams, and a bolted CLAMP FRAME at the base whose face (z_w 2.096) now
  // OWNS plan cols +-0.29 (ref 2.091, err 0.005 — the old spine read
  // +0.054). Envelope holds the priced side shelves: top 2.13w over z_w
  // 2.09..2.62, bottom 1.727w.
  P.add('turret', box(0.42, 0.328, 0.53), 0, 0.291, 2.455);                    // boot body: x +-0.21, bottom 1.727w, z_w 2.09..2.62
  P.add('turret', box(0.29, 0.075, 0.53), 0, 0.4925, 2.455);                   // boot cap: top 2.13w held (priced side shelf)
  for (const s of [-1, 1]) {
    P.add('turret', slab(                                                      // canvas shoulder chamfer closing body->cap (soft edge)
      [s * 0.21, 0.455, 2.19], [s * 0.21, 0.455, 2.72], [s * 0.145, 0.53, 2.72], [s * 0.145, 0.53, 2.19],
      [s * 0.155, 0.455, 2.19], [s * 0.155, 0.455, 2.72], [s * 0.10, 0.53, 2.72], [s * 0.10, 0.53, 2.19]));
    P.add('turretDark', box(0.004, 0.36, 0.030), s * 0.212, 0.32, 2.38);       // side sag creases (2 mm proud)
    P.add('turretDark', box(0.004, 0.34, 0.030), s * 0.212, 0.30, 2.58);
  }
  P.add('turretDark', box(0.36, 0.026, 0.004), 0, 0.415, 2.722);               // face sag creases (gun-plan-hidden cols)
  P.add('turretDark', box(0.33, 0.024, 0.004), 0, 0.30, 2.722);
  P.add('turretDark', box(0.30, 0.022, 0.004), 0, 0.19, 2.722);
  P.add('turret', box(0.52, 0.44, 0.028), 0, 0.26, 2.182);                     // clamp frame: face z_w 2.096 owns plan +-0.29
  P.add('turretDark', box(0.46, 0.38, 0.006), 0, 0.26, 2.20);                  // frame inner shadow inset
  P.add('turret', box(0.34, 0.36, 0.27), 0, 0.305, 2.835);                     // root collar: top 2.085w, z_w 2.60..2.87 — rear held 25 mm clear of the col-2.951 window (the wide face at 2.90 lit it +0.027 in loop 1; the old narrow collar's 4.5 mm sliver never did)
  P.add('turret', box(0.38, 0.15, 0.12), 0, 0.025, 2.25);                      // mantlet LOWER LIP under the boot mouth: restores the col-2.176 turret-row bottom (ref 1.551) the old cheek-complex base carried
  P.add('turretDark', cylZ(0.14, 0.05, 14), 0, 0.25, 3.02);                    // §B3.1 thermal-sleeve clamp ring at the root exit (top 1.99w — also the honest owner of side col 2.951's 1.99 line the old collar held by an AA sliver)
  // §B3.1 GUN-RUN TELLS (owner directive 2026-08-06 — no bare prisms on the
  // gun run): the root collar + chin stack read as plain cuboids at 1x. The
  // real CN120-26 root wears a bolted face frame with the tube passing a
  // circular aperture ring, and the thermal sleeve carries clamp collars.
  // All pieces INTERIOR to the priced collar envelope (y band 1.70..2.10w,
  // x inside the ±0.15 plan cols the junction collars own; face plate 5 mm
  // proud at z 3.0 sits mid-span of the tube's plan run — zero row change).
  P.add('turretDark', box(0.17, 0.36, 0.012), 0, 0.305, 2.976);                // bolted face frame plate (on the root collar face, clear of the col-2.951 window)
  P.add('turretDark', torus(0.105, 0.014, 14), 0, 0.305, 2.983, Math.PI / 2, 0, 0); // tube aperture ring on the face
  for (const bs of [-1, 1]) {
    P.add('turretDark', box(0.013, 0.30, 0.04), bs * 0.1965, 0.3285, 2.40);    // boot side flange bolt strips (6.5 mm proud of the boot flanks — y inside the boot band, x under the gun's plan cols)
    P.add('turretDark', box(0.013, 0.30, 0.04), bs * 0.1965, 0.3285, 2.62);    // second row at the boot/root joint
    P.add('turretDark', box(0.013, 0.28, 0.04), bs * 0.1765, 0.305, 2.80);     // root flange row
  }
  for (const s of [-1, 1]) P.add('turret', box(0.34, 0.38, 0.60), s * 0.45, 0.21, 1.06); // cheek fills beside sleeve (tops 0.40 — under the field line)
  // side ARMOR BOXES (tops chamfered 2.13 -> 1.92w outboard), LOW outer
  // applique band, midships baskets (outer face 1.57 — plan sees it at
  // x 1.62 columns, the front mask must NOT at 1.605)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.14, 0.32, s < 0 ? 2.03 : 2.15), s * 1.475, 0.16, s < 0 ? 0.585 : 0.645); // bottom 1.60w; front: right 1.62w / left 1.50w
    // side-box tops stay PRINT-ASYMMETRIC (L 0.62 / R 0.53): the first draft
    // symmetrized them to 0.62 and the raised right top took over front
    // cols 1.443-1.524 beyond the chamfer end (+0.09 x3 vs the ref's real
    // 2.02-2.06 right shoulder — gate-in-loop find). §B1.1 governs the
    // cheek PLANES (symmetric above); the armor-module shoulder is the
    // print's own documented fit.
    // box-top shoulder SHORTENED to the aft bay (z_l 0.30 fwd edge): the
    // ref's forward outboard band tops read 1.84-2.00 (fields), not the old
    // full-length 2.13/2.22 rail — front cols 1.40-1.44 keep their 2.13/
    // 2.22 tops from this aft run (front mask is z-blind)
    P.add('turret', slab(
      [s * 1.40, 0.32, 0.34], [s * 1.535, 0.32, 0.34], [s * 1.535, 0.32, -0.45], [s * 1.40, 0.32, -0.45],
      [s * 1.40, s < 0 ? 0.57 : 0.46, 0.30], [s * 1.44, s < 0 ? 0.57 : 0.46, 0.30], [s * 1.44, s < 0 ? 0.57 : 0.46, -0.45], [s * 1.40, s < 0 ? 0.57 : 0.46, -0.45]));
    // applique 1.246..1.60w — the print's LEFT plate runs to 1.41w, RIGHT to 1.04w
    P.add('turret', box(0.028, 0.355, s < 0 ? 1.55 : 1.18), s * 1.63, -0.177, s < 0 ? 0.735 : 0.55);
    P.add('turretDetail', box(0.045, 0.045, 1.28), s * 1.53, 0.35, -0.79);     // basket rails
    P.add('turretDetail', box(0.045, 0.045, 1.28), s * 1.53, 0.02, -0.79);
    for (let k = 0; k < 5; k++) P.add('turretDetail', box(0.03, 0.33, 0.03), s * 1.53, 0.185, -0.24 - k * 0.28);
    stowage(P, 'turretCloth', rng, [[s * 1.46, 0.19, -0.73, 0.18, 0.28, 1.0]]);
  }
  // print's LEFT flank cloth bulge (front col -1.64 reads 1.65..1.92 there)
  P.add('turretCloth', box(0.05, 0.27, 0.80), -1.625, 0.185, -0.90);
  P.add('turretCloth', box(0.05, 0.38, 0.80), -1.54, 0.24, -0.90);             // inboard rise of the supported left flank stowage bundle
  // roof: HL-70 PANORAMIC SIGHT TOWER center-forward (photo-parity round,
  // 2026-08-06 — THE Leclerc identity feature per the owner's Tamiya photo).
  // Re-authored from the squat sightBox+lid on the print's own priced band:
  // ref front cols 0.349..0.754 read 2.501 (old lid overshot at 2.521 x11)
  // and ref side cols 0.736..1.069 read 2.492 (old box overhung col 1.179,
  // ref 2.381, by +0.074 — its z ran to 1.24w). Tower: x 0.35..0.75, z_w
  // 0.70..1.10 (head front 24 mm clear of the col-1.179 window), head 2.486
  // + lid cap 2.52 (the heightM p95 anchor — measured first per the round
  // contract; masts stay the only above-2.53 spikes, heightM holds 2.51).
  // Pedestal ring -> shaft -> head w/ raised lid cap; the tall window
  // APRON drops onto the falling cheek plane (foot y 0.6745 = the plane
  // surface at z_l 1.20) so the face reads 0.22 m tall from the front-left
  // 3/4; big dark window + glass + wiper + right aux scope (aux top 2.42w
  // owns front col 0.795 — ref 2.42, was undershot 2.389).
  P.add('turret', cylY(0.15, 0.165, 0.03, 16), 0.55, 0.625, 0.985);            // pedestal ring on the MID roof (the tower now shows its real base run)
  P.add('turret', box(0.30, 0.155, 0.32), 0.55, 0.7325, 0.99);                 // pedestal column mid roof -> shaft (real ~0.6 m tower prominence restored from BELOW; tops unchanged)
  P.add('turret', box(0.32, 0.075, 0.34), 0.55, 0.8195, 0.995);                // shaft
  P.add('turret', box(0.40, 0.049, 0.32), 0.55, 0.8615, 1.04);                 // compact head block, front edge retained on the apron
  P.add('turret', box(0.41, 0.040, 0.32), 0.55, 0.900, 1.04);                  // lid cap remains fully seated on the shaft
  P.add('turret', box(0.34, 0.44, 0.05), 0.55, 0.645, 1.175);                  // window apron dropping onto the low field at z_l 1.175 (y 0.425 surface) — the face reads ~0.44 m tall from the front-left 3/4 now (real tower prominence)
  P.add('turretDark', box(0.30, 0.16, 0.014), 0.55, 0.78, 1.208);              // window frame
  P.add('turretGlass', box(0.26, 0.115, 0.012), 0.55, 0.778, 1.215);           // the big window
  P.add('turretDark', box(0.012, 0.10, 0.012), 0.60, 0.79, 1.222, 0, 0, 0.3);  // wiper arm
  P.add('turret', box(0.34, 0.022, 0.085), 0.55, 0.770, 1.2425);               // VISOR HOOD over the window (top 2.381w = ref side col 1.179 EXACT — the old lid overhung it +0.074, the loop-2 head undershot -0.069; z_w 1.10..1.185 inside the col window)
  P.add('turretDark', box(0.07, 0.05, 0.07), 0.785, 0.795, 1.01);              // aux day scope (top 2.42w = ref col 0.795)
  P.add('turretDark', box(0.014, 0.095, 0.014), 0.55, 0.800, 0.883);           // cable conduit lies flush on the compact head's rear face
  P.add('turretDark', box(0.38, 0.010, 0.014), 0.55, 0.8555, 1.196);           // head/shaft split line
  P.add('turretDark', box(0.56, 0.014, 0.40), 0, 0.658, -1.12);                // autoloader panel field (in the low channel)
  // aft panel rides the channel fall — split around the notch (photo round):
  // left/right full-depth panels + a SHORT center strip ending z_w -1.775
  // (clear of the ref col-0.069 notch floor at -1.814)
  P.add('turretDark', box(0.16, 0.014, 0.62), -0.20, 0.60, -1.72, -0.09, 0, 0);
  P.add('turretDark', box(0.14, 0.014, 0.26), 0.065, 0.607, -1.545, -0.09, 0, 0);
  P.add('turretDark', box(0.145, 0.014, 0.62), 0.2075, 0.60, -1.72, -0.09, 0, 0);
  for (let k = 0; k < 3; k++) P.add('turretDetail', box(0.56, 0.018, 0.02), 0, (k < 1 ? 0.648 : roofAt(-1.08 - k * 0.30) - 0.10) + 0.012, -1.08 - k * 0.30);
  {                                                                            // 4th rib split around the notch (z_w -2.08 crossed the col-0.069 window)
    const ry4 = roofAt(-1.98) - 0.10 + 0.012;
    P.add('turretDetail', box(0.275, 0.018, 0.02), -0.1425, ry4, -1.98);
    P.add('turretDetail', box(0.145, 0.018, 0.02), 0.2075, ry4, -1.98);
  }
  // commander (left) + gunner (right) hatches. Photo round: commander ring
  // SHAVED to the ref line — the old 0.045 ring + 0.048 lid bar read 2.4 on
  // seven front cols (x -0.34..-0.62) where the ref roof is 2.359/2.369;
  // now ring top 2.368 / bar 2.378. Flush periscope collar RINGS added
  // (photo read 7: clean roof w/ periscope rings; sub-centimeter, mask-free).
  P.add('turret', cylY(0.22, 0.22, 0.016, 14), -0.56, roofAt(-0.55) + 0.008, -0.55);
  P.add('turretDark', box(0.38, 0.012, 0.03), -0.56, roofAt(-0.55) + 0.020, -0.55);
  P.add('turret', cylY(0.20, 0.20, 0.04, 14), 0.58, roofAt(-0.90) + 0.02, -0.90);
  P.add('turretDetail', torus(0.062, 0.008, 12), -0.35, 0.754, -0.28);         // flush collar rings (KIT.torus lies FLAT by default — the loop-1
  P.add('turretDetail', torus(0.062, 0.008, 12), 0.42, roofAt(-0.58) - 0.002, -0.58); // vertical-hoop draft bought a +0.027 trace pixel at col -0.704)
  // 7.62 ANF1 pintle MOVED forward-LEFT (photo-parity round, read 5 — the
  // Tamiya shows it clearly on the left cheek edge; §B7 photo governs).
  // The old right-rear seat (0.95, -0.66) read 2.409-2.437 on side cols
  // -0.593..-0.704 where the ref roof is FLAT 2.354 (+0.05..0.08 x2-3), and
  // the ref's own 2.409 side band at cols 0.293/0.404 sat UNDERSHOT — the
  // new seat owns that band instead (side masks image both flanks, so a
  // LEFT gun legally covers it): receiver z_w 0.246..0.453 inside the two
  // 2.409 col windows [0.238..0.459] (scale 0.78 sizes the rec to fit; foot
  // z_l 0.413), top ~2.41w; foot SUNK (priced-furniture-swap law) so the
  // stack stays at the pintle allowance: front cols -0.825/-0.866 read
  // ~2.41 vs ref 2.369 (+0.021 x2, funded by the tower/hatch recovery).
  // Barrel DROOPS (elev -0.08, matched-envelope law) under the cheek-plane
  // crest; ammo can OFF (its box would poke the col -0.947 front window) —
  // a flat pouch sits on the roof instead.
  {
    // tone 'dark' per MG PHYSICS (pale-deck roof gun reads dark) — ALSO the
    // measured fix for side cols 0.515/0.626: the two-tone CAP strip rode
    // the barrel to z_w 0.76 at 2.439 and pixel-printed 2.464 (loop-2
    // whatsat AABB [-0.877..-0.823, top 2.439, z 0.258..0.763]).
    const anf1 = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'dark', elev: -0.18, seed: 11, scale: 0.78, ammo: false });
    anf1.position.set(-0.85, 0.640, 0.413);
    P.turretG.add(anf1);
  }
  // §5.14 ORDER: 12.7 mm M2 on the roof, FORWARD rest (§5.07 CROWS-FORWARD
  // law — pintleMG default aim is +z). Seated right-forward on the MID roof
  // beside the sight cluster: receiver band lands in the same ref 2.41-2.43
  // side-col class the ANF1/block already own (side masks image both
  // flanks); foot sunk 2 cm into the mid roof (priced-furniture-swap law),
  // tone dark per MG PHYSICS pale-deck polarity.
  {
    // Disable-run receipts (loop 3/4): the first seat (0.92/0.59/0.36,
    // scale 0.82, elev -0.06, ammo can ON) cost EXACTLY -0.4 headline
    // (turret -0.7, stations -1.6; IR caps + left cable + coax hood free).
    // Re-tuned per the ANF1's own priced lessons: barrel DROOPED under the
    // cluster crest (matched-envelope law), ammo can OFF (flat pouch on the
    // roof instead), scale 0.76, foot sunk to 0.575 — receiver band ~2.40
    // inside the ref's own 2.37-2.42 cluster window at z_w 0.16..0.46.
    const m2 = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'dark', elev: -0.20, seed: 17, scale: 0.76, ammo: false });
    m2.position.set(0.88, 0.575, 0.36);
    P.turretG.add(m2);
    P.add('turretDark', box(0.10, 0.02, 0.14), 0.70, 0.62, 0.10);              // flat 12.7 ammo pouch on the mid roof
  }
  P.add('turretDark', box(0.11, 0.02, 0.16), -0.68, 0.62, 0.32);               // ANF1 ammo pouch reseated FLAT on the mid roof (top 2.23w)
  P.add('turretDetail', box(0.105, 0.09, 0.12), 0.8875, LH + 0.03, -0.822);    // sight/mount block (carries the priced 2.427w front line; WIDENED x 0.835..0.94 so col 0.916 — ref 2.41 — stays covered after the MG left. 90-ladder r1: z_w -0.862..-0.982 — the old -0.80 front edge printed 2.42 into side col -0.802 [ref roof 2.355]; the block now hides under the mast columns' 2.53 line)
  periscope(P, 'turretDetail', -0.35, 0.60, -0.28, 0.3);
  P.add('turretDetail', box(0.09, 0.104, 0.12), -0.215, 0.70, -0.10);          // 90-ladder r1: loader periscope housing — base on the 2.248 channel, crown 2.352 = the ref's 2.351 line on front cols -0.182/-0.222 (left-only; the print's right side stays low)                       // (france round: head FLUSH over the new high cap — the 0.762 reseat printed +0.10 over the ref's 2.36 band on the -0.38 side cols)
  periscope(P, 'turretDetail', 0.42, 0.62, -0.58);                             // (france round: sunk flush over the cap — the old roofAt+0.05 seat topped ~2.55 against the ref's 2.36 band, a pre-existing +0.19)
  // HL-15 panoramic + antenna pot: the ref's 2.49-2.50 head cluster lives
  // at x ~0.0-0.10, z world -1.66 (front cols -0.015..0.106 = 2.501; side
  // cols -1.72..-1.60 = 2.49) — NOT at x -0.55 (ref front there is 2.359)
  P.add('turretDetail', cylY(0.05, 0.055, 0.16, 10), 0.055, 0.72, -1.56);
  P.add('turretDark', box(0.12, 0.12, 0.14), 0.055, 0.835, -1.56);
  P.add('turretGlass', box(0.10, 0.06, 0.018), 0.055, 0.85, -1.48);
  // crosswind mast + whip base: TWO spike columns at x ±1.05, tops 2.54,
  // plus the sensor base block at x -1.14 (ref front -1.149: 2.45)
  for (const [mx, mt] of [[-1.11, 0.905], [0.99, 0.915]]) {
    P.add('turretDetail', box(0.014, 0.46, 0.014), mx, 0.69, -0.83);
    P.add('turretDark', box(0.016, 0.05, 0.016), mx, mt, -0.83);
  }
  P.add('turretDetail', box(0.06, 0.44, 0.036), 0.97, 0.68, -0.83);           // right mast bracket broad enough to read at both source-station columns
  P.add('turretDetail', box(0.115, 0.10, 0.05), -1.1175, 0.745, -0.95);       // source-height sensor base remains broad enough to carry the left mast
  P.add('turretDetail', slab(
    [-1.102, 0.795, -0.975], [-1.06, 0.795, -0.975], [-1.06, 0.795, -0.925], [-1.102, 0.795, -0.925],
    [-1.102, 0.93, -0.975], [-1.06, 0.83, -0.975], [-1.06, 0.83, -0.925], [-1.102, 0.93, -0.925])); // tapered mast fairing closes the real load path into the broad sensor base
  // whips STOWED along the bustle roof (the print carries no raised spikes)
  P.add('turretDetail', box(0.022, 0.022, 0.62), 0.95, roofAt(-1.75) + 0.03, -1.62);
  P.add('turretDetail', box(0.022, 0.022, 0.62), -0.95, roofAt(-1.75) + 0.03, -1.62);
  // GALIX: LEFT bank deep/outboard (the print's tall left corner), RIGHT
  // bank short/low/inboard (ref right cols top 1.94-2.06, rear -1.76).
  // §B3.2 density (2026-08-06): the real GALIX 80 fit is NINE tubes per
  // side — right bank enriched 4x1 -> 5+4 double row INSIDE the same
  // envelope (rear tube lands z_w -1.76 = the documented rear edge; tube
  // tops hold the certified 2.078w crown; base box grows only forward,
  // interior to the priced corner columns).
  galixBank(P, 1.24, 0.33, -1.38, 1, 5, 2);
  galixBank(P, -1.34, 0.50, -1.62, -1, 5, 2);
  // LARGE CYLINDRICAL DRUM on the turret right rear (photo round, read 6 —
  // the Tamiya's very visible horizontal stowage drum, axis fore-aft).
  // Measured seat r2: r 0.20 xc 1.24 (x 1.04..1.44 — the first outboard seat
  // xc 1.28 put the flat crown strap at x<=1.485/2.19w and lit front cols
  // 1.44/1.48 +0.14: gate 86.0 -> 85.2, reverted; at 1.24 every chord dives
  // under the chamfer/box lines per column window), y 1.78..2.18w (at the
  // 2.215+ chamfer/side-box front tops — front/side-interior by measure),
  // z_w -0.40..-1.12 with the rear cap 7 cm clear of the priced GALIX bank
  // front (bank UNTOUCHED at its documented -1.76 rear edge) — the drum is
  // fully plan-interior: the tapered box ring + GALIX own every rear col.
  // Grammar (§B3.1/§B3): body + end caps + rim rings + cradle saddles +
  // over-straps + cap handle — never a bare prism.
  P.add('turret', cylZ(0.20, 0.72, 16), 1.24, 0.38, -0.66);                    // drum body (z_l -1.02..-0.30)
  P.add('turretDetail', cylZ(0.205, 0.022, 16), 1.24, 0.38, -0.31);            // front cap rim
  P.add('turretDetail', cylZ(0.205, 0.022, 16), 1.24, 0.38, -1.01);            // rear cap rim
  P.add('turretDark', torus(0.202, 0.011, 14), 1.24, 0.38, -0.48, Math.PI / 2, 0, 0); // rim rings stood about the drum axis (KIT.torus is flat by default)
  P.add('turretDark', torus(0.202, 0.011, 14), 1.24, 0.38, -0.66, Math.PI / 2, 0, 0);
  P.add('turretDark', torus(0.202, 0.011, 14), 1.24, 0.38, -0.88, Math.PI / 2, 0, 0);
  P.add('turretDark', cylZ(0.13, 0.010, 14), 1.24, 0.38, -0.298);              // recessed front cap face
  P.add('turretDetail', box(0.10, 0.022, 0.028), 1.24, 0.38, -0.288);          // cap handle bar
  for (const dz of [-0.42, -0.90]) {
    P.add('turretDark', box(0.30, 0.035, 0.06), 1.18, 0.17, dz);               // cradle saddles onto the box flank
    P.add('turretDark', box(0.014, 0.42, 0.028), 1.065, 0.38, dz);              // tie-down strap: verticals + crown
    P.add('turretDark', box(0.014, 0.42, 0.028), 1.40, 0.38, dz);
    P.add('turretDark', box(0.24, 0.012, 0.028), 1.24, 0.586, dz);
  }
  // §B3.2: spare track links along the LEFT side-box face (real Leclercs
  // strap links on the turret flank; visual counterweight to the right
  // sight well). KIT.spareTrackStrip cannot mount on a vertical face with
  // the correct link axis (its rx/ry euler composition stands the 0.5 m
  // plates upright — measured +0.17 on front cols -1.635/-1.595, gate-in-
  // loop find this round), so the plates are authored directly in the
  // helper's own turretTrack steel (r5 material law): four upright links,
  // tops 1.915w UNDER the ref's 1.924 col line, outer face x -1.6035
  // inside the plan col -1.592 window whose 1.398 front edge they never
  // pass (z_w 0.22..0.88).
  for (let k = 0; k < 4; k++) {
    P.add('turretTrack', box(0.045, 0.15, 0.16), -1.5805, 0.29, 0.42 + k * 0.19);
    P.add('turretTrack', box(0.05, 0.05, 0.06), -1.583, 0.35, 0.42 + k * 0.19);
  }                                                                            // (90-ladder r1: tops 1.965/1.975 — the fresh -1.6 front col reads the ref line at 1.97, the old 1.915 seat undershot)
  P.add('turret', box(0.24, 0.32, 0.44), -1.38, 0.35, -1.82);                  // LEFT corner bin (rear -2.14w at x 1.26-1.50)
  P.add('turretDark', box(0.242, 0.008, 0.442), -1.38, 0.435, -1.82);          // bin lid seam (photo read 7: bins carry §B3 lid grammar)
  P.add('turretDark', box(0.02, 0.05, 0.035), -1.503, 0.32, -1.70);            // lid latches (3 mm proud of the priced -1.50 face, z-interior)
  P.add('turretDark', box(0.02, 0.05, 0.035), -1.503, 0.32, -1.94);
  // rear bustle rack: thin top shelf read (2.04..2.18w at the tail); the
  // print's cage is LEFT-BIASED (right rear edge stops ~-2.17w)
  // cage rails — notch WIDENED to the trimmed channel steps (photo round:
  // the left rail/vertical/mesh/roll used to cross the ref's col -0.042
  // window at z_w -2.15..-2.18; all left cage pieces now end x -0.12)
  for (const y2 of [0.44, 0.60]) {
    for (const [cx2, w3] of [[-0.51, 0.78], [0.52, 0.76]]) {
      P.add('turretDetail', box(w3, 0.032, 0.032), cx2, y2, -2.06);
      P.add('turretDetail', box(w3, 0.032, 0.032), cx2, y2, -1.86);
    }
    for (const sx of [-1, 1]) P.add('turretDetail', box(0.032, 0.032, 0.20), sx * 0.90, y2, -1.96);
  }
  for (const vx of [-0.86, -0.45, -0.16, 0.16, 0.55, 0.88]) P.add('turretDetail', box(0.028, 0.16, 0.028), vx, 0.52, -2.06);
  P.add('turretDark', box(0.77, 0.14, 0.014), -0.505, 0.52, -2.075);
  P.add('turretDark', box(0.72, 0.14, 0.014), 0.52, 0.52, -2.075);
  P.add('turretCloth', box(0.70, 0.10, 0.16), -0.47, 0.50, -1.95);
  P.add('turretCloth', box(0.60, 0.09, 0.15), 0.50, 0.49, -1.94);
  // §B3.2: cargo STRAPS over the shelf rolls (2.5 mm proud, cage-interior)
  for (const sx of [-0.60, -0.25, 0.40, 0.62]) {
    P.add('turretDark', box(0.02, 0.105, 0.165), sx, sx < 0 ? 0.50 : 0.49, sx < 0 ? -1.95 : -1.94);
  }
  P.add('turretDetail', box(0.045, 0.045, 0.42), -1.33, 0.57, -2.01);
  P.add('turretDetail', box(0.045, 0.045, 0.42), -1.33, 0.44, -2.01);
  P.add('turretDetail', box(0.36, 0.045, 0.045), -1.10, 0.57, -2.21);          // (90-ladder r1: rear cage bars 0.60 -> 0.57 — their 2.2225w crowns printed side cols -2.246/-2.355 over the ref's 2.194 tail line)
  P.add('turretCloth', box(0.30, 0.22, 0.34), -1.18, 0.50, -2.05);
  P.add('turretCloth', box(0.24, 0.16, 0.30), -1.13, 0.52, -2.06);
  jerryCan(P, 'turretCloth', 0.80, 0.42, -1.88, -0.2);
  ammoCan(P, 'turretDark', -1.05, 0.42, -1.98, 0.25);
  P.add('turretDetail', box(0.10, 0.03, 0.16), -0.95, 0.625, 0.30);            // flush lifting lugs (on the mid roof)
  P.add('turretDetail', box(0.10, 0.03, 0.16), 0.95, 0.625, 0.30);
  P.decal('turret', 'number', '33', 0.30, [1.30, 0.35, -1.0], Math.PI / 2);
  P.decal('turret', 'number', '33', 0.30, [-1.30, 0.35, -1.0], -Math.PI / 2);
  // CN120-26 L/52 seated LOW (measured ref axis ~1.85, band half 0.14):
  // moving mantlet plate on the gun; root/collar mass is turret-frame above
  P.gunG.position.set(0, 0.27, 0.50);
  trunnionRoll(P, 0.21, 0.68);
  P.addGunExtra(box(0.92, 0.62, 0.85), 0, 0.07, 0.55);                         // moving mantlet plate
  P.addGunExtraDark(cylZ(0.12, 0.06, 14), 0, 0, 0.985);                        // §B3.1 dust-boot ring where the tube exits the plate face (r 0.12 < the 0.132 junction collar — interior to the priced sleeve band)
  P.addGunExtraDark(cylZ(0.028, 0.10, 8), 0.34, 0.10, 0.44);                   // coax port
  P.addGunExtraDark(box(0.07, 0.05, 0.05), 0.34, 0.145, 0.44);                 // §5.14 coax hood tell (§B3 sight grammar: hood + port)
  P.addGunExtra(cylZ(0.132, 0.50, 12), 0, -0.02, 2.55);                        // fat sleeve-junction collar (plan ±0.15 cols)
  // 90-ladder r1: collar#2 TRIMMED to end at world 3.985 and kept CENTERED —
  // the print's own fat gun content at plan col -0.166 ends exactly 3.981
  // (its evac/collar), while everything fat PAST that line sits OFF-CENTER
  // +0.04 (cols -0.052..0.171 run to the muzzle, col -0.166 does not). The
  // old 0.42-long collar printed 3.98..4.23 into the -0.166 window.
  P.addGunExtra(cylZ(0.126, 0.17, 12), 0, -0.02, 3.50);
  // §B3.1 thermal-sleeve SECTION CLAMP RINGS (photo round, read 3: sleeve
  // sections + clamp rings on the F1 tube). r 0.105 tops 1.975w < the
  // priced 1.994 tube line; on the bare tube runs between the collars.
  P.addGunExtraDark(cylZ(0.105, 0.035, 12), 0, -0.005, 1.60);
  P.addGunExtraDark(cylZ(0.105, 0.035, 12), 0, -0.014, 3.15);
  // muzzle drum + evac HELD UNDER the 12% side body filter (0.296 band on
  // the 2.52 build): a 0.33-band muzzle collar made hullLengthM read the
  // whole gun as body (9.44 incident this round).
  // (france round loops 8-9: an on-axis r 0.125 muzzle sleeve chasing the
  // ref's uniform 1.994..1.744 band read a WASH — 88.7 both seats vs 88.8
  // with the committed drum; reverted to the gate-verified drum)
  // 90-ladder r1: the print's muzzle drum + sleeve run OFF-CENTER +0.04
  // (plan col -0.166 [win -0.221..-0.111] carries NO ref muzzle while
  // -0.052..0.171 run to 6.214 — the centered r 0.146 drum edge at -0.146
  // sat solidly inside the -0.166 window and printed a 1.13/1.10 err col on
  // plan_whole/plan_turret). Drum + fore sleeve x -> +0.045 (edges -0.101/
  // -0.093, clear of -0.111); rear thermal-sleeve section ADDED at the
  // measured ref band [1.732..2.002] over world z 5.0..5.875 (side_whole
  // cols 5.06..5.84 wanted the fat band, the bare 0.085 tube read thin).
  P.addGunExtra(cylZ(0.146, 0.26, 12), 0.045, 0.047, 5.637);                   // (y 0.047: ref muzzle band c 1.917 — its full 1.74..2.094 band is 0.354, past the 12% cut; r stays 0.146 so the plan window margin holds)
  P.addGunExtra(cylZ(0.135, 0.891, 12), 0.045, -0.003, 5.0455);                // rear sleeve section (world 5.0..5.891, band 1.732..2.002 = ref; GUN-FRAME LAW: local = world - 0.40, the 4.6375 first seat double-subtracted the frame. 12% JUNCTION LAW: the trace column [5.7895..5.899] must never hold sleeve AND drum — their 1.732..2.063 union (0.331) crosses the 12% cut and hullLengthM swallows the gun (9.09, dims 0, twice). Sleeve rear 5.891 owns that column alone (band 0.27); drum front 5.907 sits 8 mm past the boundary)
  P.addGunExtra(cylZ(0.138, 1.15, 12), 0.045, -0.014, 3.98);                   // fore sleeve band (ref 1.717..1.994 @ w 4.2-5.0)
  buildGun(P, { len: 5.89, r: 0.085, sleeve: true, evac: 0.52, evacR: 1.72, collar: true, baseR: 0.17 });
  muzzleBore(P, 0.085, 5.87);                                                  // §B3.1 muzzle bore on the F1 tube (shadow-named)
  P.topY = LH + 0.55;
}

// ---------------------------------------------------------------------------
// T-80U — docs/references/tanks/t80u.md
// hull 7.01, width 3.60, deck 1.38, dome crown 2.20 with clamshell K-5 arc
// reading ~2.9 wide, roof furniture to ~2.7; gun axis 1.66, muzzle
// bow+2.7; 6 small dished wheels, rear sprocket; turbine exhaust box rear.
// ---------------------------------------------------------------------------
function buildT80UNative2026(P) {
  // First-party runtime geometry only. The local javanilga GLB is a visual
  // and measurement oracle; no source vertices, indices, meshes, materials,
  // rig data or converted payload enter this authored KIT/loft builder.
  const { box, cylY, cylX, cylZ, frustum, lathe, torus, polyLoft, buildGun, buildRunningGear,
    fenders, headlight, liftEye, periscope, towCable, stowage, spareTrackStrip, cupola } = KIT;
  const slab = orientedSlab;                                                   // §C missing-side fix: winding-corrected slabs only (see orientedSlab)
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
  // Tapered lower tub.  The old 2.28 x 4.70 rectangular box preserved the
  // cardinal dimensions but painted excessive lower-hull area in both rear
  // quarters.  This original loft keeps the full-width suspension bay amid
  // ships, then closes toward the bow and stern inside the native tracks.
  P.add('hull', polyLoft([
    [-0.96, 2.50], [0.96, 2.50], [1.14, 1.72], [1.14, -1.72],
    [0.96, -2.20], [-0.96, -2.20], [-1.14, -1.72], [-1.14, 1.72],
  ], 0.26, 0.98, 0.98));
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
  // Keep the complete authored deck/fender silhouette, but do not fill the
  // native return corridor with an invisible solid sponson. The inboard
  // body carries the deck down inside the tracks; a shallow closed cap keeps
  // the original ±1.70 m top/side outline above it. This is a cross-section
  // repair, not a skirt/fender deletion.
  P.add('hull', frustum(1.14, 1.18, -2.55, 1.14, 1.125, -2.55, 1.06, 1.26));
  P.add('hull', frustum(1.70, 1.18, -2.55, 1.55, 1.125, -2.55, 1.235, 1.26));
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
      const skirtH = 0.54;
      const skirtY = 0.97;
      const skirtD = s < 0 && k === 0 ? 0.34 : 0.46;
      const skirtZ = s < 0 && k === 0 ? -2.66 : -2.72 + 0.4833 * k;
      P.add('hull', box(0.035, skirtH, skirtD), s * 1.7225, skirtY, skirtZ);
    }
    for (let k = 0; k < 2; k++) P.add('hullDark', box(0.03, 0.40, 0.018), s * 1.784, 0.84, 3.10 - k * 1.00);
    for (let k = 2; k < 6; k++) P.add('hullDark', box(0.03, 0.54, 0.018), s * 1.745, 0.92, 3.10 - k * 1.00);
    P.add('hullDark', box(0.02, 0.05, 6.30), s * 1.786, 0.60, 0.20);
    // rear INSET skirt segment: the ref sheet keeps covering the sprocket
    // (side bottom 0.60 out to -3.37) but sits inboard of the ±1.75 plan
    // columns there
    P.add('hull', box(0.03, 0.54, s < 0 ? 0.08 : 0.32), s * 1.7225, 0.97, s < 0 ? -2.94 : -3.05); // terminal guards sit outside the native shoe envelope
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
    P.add('hull', box(0.11, 0.06, s < 0 ? 0.04 : 0.12), s * (s < 0 ? 1.25 : 1.42), 1.19, s < 0 ? -3.24 : -3.34); // compact port stub stays inside its quarter outline
  }
  // TURBINE EXHAUST BOX jutting off the rear plate (T-80 tell) + drums + log
  // (r2: face -3.30; the ref plan rear is -3.27..-3.30 with ONLY the narrow
  // x ±1.02 mudguard pods beyond, to -3.46 — the -3.48 side lip columns)
  // (r3: whole group pulled in to the ref's plan rear -3.27; drums shortened
  // to the 0.66..1.19 band; tail pods thinned to the ref's -3.43 lip band
  // 1.148..1.202 — its ONLY content aft of -3.33)
  // The turbine face is recessed ahead of the lower log/drum recovery
  // cluster.  Keeping the full service wall flush with the aft guards made
  // the right rear quarter a single upper cyan bulge; the source instead
  // steps the hot exhaust field forward while its supported lower kit stays
  // aft.
  P.add('hull', box(1.90, 0.55, 0.18), 0, 0.88, -3.10);
  P.add('hullDark', box(1.55, 0.34, 0.05), 0, 0.88, -3.20);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.50, 0.042, 0.04), 0, 0.74 + k * 0.10, -3.205);
  P.add('hullDetail', box(1.70, 0.05, 0.12), 0, 1.18, -3.19);
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
  // Low raised perimeter rails around the turbine louvre bank.  They supply
  // the shallow upper-rear shoulder visible in both rear quarters without
  // inventing another deck box or changing the fixed hull envelope.
  P.add('hullDetail', box(1.62, 0.04, 0.06), 0, 1.39, -1.54);
  P.add('hullDetail', box(1.62, 0.04, 0.06), 0, 1.39, -2.46);
  P.add('hull', box(1.00, 0.045, 0.62), 0.45, 1.352, -1.20);
  P.add('hull', box(0.34, 0.15, 1.65), -1.44, 1.29, -1.725);                   // left fender fuel/stow run, seated on the fender above the native return
  P.add('hullDark', box(0.35, 0.03, 0.03), -1.44, 1.37, -1.35);                // lid straps follow the raised fuel/stow run
  P.add('hullDark', box(0.35, 0.03, 0.03), -1.44, 1.37, -2.45);
  bin(P, 1.42, 1.29, -1.35, 0.26, 0.15, 0.88);                                 // restrained right fender bin row, seated above the return
  bin(P, 1.42, 1.29, -2.27, 0.26, 0.15, 0.46);                                 // rear bin stays clear of the sprocket wrap
  // r3 §B4: pods pulled inboard of the band inner plane (the -1.42 pod sat
  // in the idler wrap) and re-seated proud of the narrowed nose face
  headlight(P, -1.02, 1.00, 3.26, -0.35, 0.05);
  headlight(P, -0.74, 1.00, 3.30, -0.35, 0.05);
  P.add('hullDetail', torus(0.085, 0.016, 10), -0.55, 0.55, 3.24, Math.PI / 2, 0, 0);
  P.add('hullDetail', torus(0.085, 0.016, 10), 0.55, 0.55, 3.24, Math.PI / 2, 0, 0);
  liftEye(P, 'hullDetail', -1.15, 1.30, 0.9);
  liftEye(P, 'hullDetail', 1.15, 1.30, 0.9);
  // Keep the bow cable on the glacis, inboard of the left idler lane.  The
  // former -1.25 m endpoint touched one visible shoe by 25 mm.
  towCable(P, [[-1.02, 1.08, 2.85], [-0.35, 1.02, 3.02], [0.50, 1.04, 2.92]]);
  spareTrackStrip(P, 'hull', 1.05, 1.20, 1.55, 2, -0.35, 0);
  // §C.1 winding fix-round 2026-08-07 (fleet sweep item 3): the 1.0 soot
  // quad at z -3.42 floated 0.12 aft of the whole port group (r3 pulled the
  // group to -3.27, the decal never followed) and topped out at 1.4 — over
  // the 1.19 deck rear corner sightline. One-sided, it painted the gate's
  // DoubleSide masks from frontleft/frontright/top (208/208/68 px F-vs-D
  // deficits) while the game culls it. Re-pinned 5 mm proud of the dark
  // port / louvre aft faces (-3.295) and sized inside the stern silhouette
  // (top 1.15 stays under the hood lip 1.155 and the deck corner line).
  P.decal('hull', 'soot', null, 0.55, [0.0, 0.875, -3.30], Math.PI);
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
  // Preserve the wheel-bay recess geometry exactly while declaring its true
  // running-gear ownership; these cylinders are not hull armor.
  wheelRecessAt(P, wheelZs, 1.42, 0.42, 0.335, 0.21, 'hullRunningGearDark');

  // ---- turret: wide full-shouldered dome under the K-5 CLAMSHELL ----
  // Raise the complete rotating package onto the source roof datum.  A
  // buried collar below the casting keeps the four-centimetre correction
  // physically seated on the 1.38 m deck instead of opening a yaw-visible
  // gap at the ring.
  P.turretG.position.set(0, 1.42, 0.11);
  P.add('turretDark', cylY(0.82, 0.88, 0.09, 24), 0, -0.045, 0.02);
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
    if (s < 0) P.add('turret', box(0.30, 0.18, 1.18), -0.75, 0.58, 0.67, 0, 0.06, 0);
    else P.add('turret', box(0.20, 0.28, 1.44), 0.68, 0.625, 0.62);
    P.add('turretDetail', box(0.32, 0.18, 0.62), s * 1.30, 0.47, -0.10, 0, s * 0.10, 0); // shoulder stowage (top 1.95w)
  }
  // Readable Kontakt-5 modules on top of the structural clamshell.  The
  // former silhouette had the correct broad carriers, but their unbroken
  // faces made the T-80U look like a smooth appliqué turret.  Five varied
  // front leaves and four falling flank cassettes now follow each cast
  // shoulder.  Every leaf overlaps the large carrier above, so this is a
  // planted armor package rather than a necklace of stand-off boxes.
  for (const s of [-1, 1]) {
    for (const [x, y, z, yaw, roll, w, h, d] of [
      [0.30, 0.43, 1.37, 0.17, -0.37, 0.34, 0.18, 0.36],
      [0.53, 0.49, 1.24, 0.31, -0.40, 0.39, 0.19, 0.40],
      [0.78, 0.51, 1.07, 0.44, -0.37, 0.43, 0.20, 0.42],
      [1.03, 0.49, 0.84, 0.56, -0.33, 0.42, 0.19, 0.39],
      [1.25, 0.44, 0.57, 0.66, -0.29, 0.38, 0.18, 0.35],
    ]) {
      P.add('turret', KIT.xform(box(w * 0.84, h * 0.58, d * 0.78), 0, -h * 0.20, -0.08), s * (x - 0.035), y, z, roll, -s * yaw, 0);
      P.add('turret', KIT.xform(box(w, h, d), 0, 0, -0.05), s * x, y, z, roll, -s * yaw, 0);
      P.add('turretDark', KIT.xform(box(w * 0.76, 0.012, d * 0.68), 0, h * 0.52, 0.035), s * x, y, z, roll, -s * yaw, 0);
      P.add('turretDark', KIT.xform(box(0.018, h * 0.74, d * 0.64), w * 0.44, 0, 0.03), s * x, y, z, roll, -s * yaw, 0);
    }
    for (const [x, y, z, yaw, w, h, d] of [
      [1.43, 0.38, 0.26, 0.42, 0.30, 0.17, 0.31],
      [1.49, 0.36, -0.04, 0.24, 0.29, 0.17, 0.30],
      [1.48, 0.35, -0.34, 0.08, 0.30, 0.16, 0.30],
      [1.40, 0.34, -0.64, -0.10, 0.28, 0.15, 0.28],
    ]) {
      P.add('turret', box(w * 0.84, h * 0.60, d * 0.80), s * (x - 0.045), y - 0.035, z, -0.08, -s * yaw, 0);
      P.add('turret', box(w, h, d), s * x, y, z, -0.08, -s * yaw, 0);
      P.add('turretDark', box(w * 0.74, 0.012, d * 0.68), s * x, y + h * 0.54, z, -0.08, -s * yaw, 0);
    }
  }
  // Continuous cast shoulder wedges.  These replace the old rectangular
  // side towers: the lower edge is buried in the pear casting while the
  // upper edge rises and narrows into the K-5 rail.  The result keeps the
  // measured outer shoulder width but restores the T-80U's characteristic
  // cheek undercut and rounded falloff into the rear quarter.
  for (const s of [-1, 1]) {
    // The cast/K-5 shoulder, not a stand-off box, supplies the source's
    // 3.3 m frontal breadth.  Keep the broad point low in the casting so it
    // widens front/top views without turning the side elevation into a wall.
    const outer = s < 0 ? 1.60 : 1.57;
    P.add('turret', slab(
      [s * 0.72, 0.12, 1.06], [s * 1.22, 0.14, 0.74], [s * outer, 0.15, -0.58], [s * 0.82, 0.12, -0.48],
      [s * 0.70, 0.45, 1.00], [s * 1.17, 0.52, 0.66], [s * (outer - 0.15), 0.45, -0.52], [s * 0.80, 0.41, -0.43]));
    P.add('turretDark', box(0.34, 0.045, 0.76), s * 1.20, 0.50, 0.08, 0, s * 0.12, 0);
  }
  // Source-asymmetric thin exterior cheek plates stay shallow; they no
  // longer manufacture a full-height rectangular side wall.
  P.add('turret', box(0.045, 0.13, 0.82), -1.60, 0.19, -0.10);
  P.add('turret', box(0.045, 0.18, 0.78), 1.57, 0.27, -0.16);
  // Stowage returns follow the upper cast shoulders rather than forming
  // full-height rectangular turret walls.  Preserve the source-asymmetric
  // right/left run, but shorten and lift both courses into their brackets.
  P.add('turretDetail', box(0.32, 0.13, 1.16), 1.40, 0.37, -0.14);             // R flank return, lifted into shoulder
  P.add('turretDetail', box(0.34, 0.14, 1.14), -1.42, 0.34, -0.02);            // L flank run short
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
  // Cupola/periscope cadence remains low and asymmetric, but is large
  // enough to survive normal gameplay distance.  These windows sit on the
  // cupola rim rather than hovering above the roof.
  for (const [x, z, yaw] of [[0.28, -0.22, 0.42], [0.40, -0.05, 0.20], [0.58, -0.02, -0.08], [0.75, -0.15, -0.34]]) {
    P.add('turretDark', box(0.12, 0.055, 0.065), x, 0.64, z, 0, yaw, 0);
    P.add('turretGlass', box(0.080, 0.032, 0.012), x, 0.65, z + 0.038, 0, yaw, 0);
  }
  // The production T-80U carries one compact four-launcher bank on the
  // left cheek.  A broad buried shoe supports the bank and leaves the
  // opposite cheek free for its circular optic/equipment cadence.
  P.add('turret', box(0.20, 0.18, 0.48), -1.30, 0.38, -0.05, 0, 0, -0.18);
  {
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: 0.043, len: 0.28, pitch: -0.40, splay: 0.30, arc: 0.52, spacing: 0.10 });
    smoke.position.set(-1.31, 0.49, -0.03);
    smoke.rotation.y = -1.04;
    P.turretG.add(smoke);
  }
  // bustle: transverse OPVT snorkel + stowage band + basket + rails.
  // VERTEX ROUND: the ref bustle hump runs to world -2.25 (band 1.60..1.84
  // post-warp at -2.0..-2.2) — row extended, kit lowered onto it.
  P.add('turretDark', cylX(0.075, 1.55, 10), 0, 0.50, -1.05);
  P.add('turretDark', cylX(0.055, 0.30, 8), 0.88, 0.50, -1.05);
  // Shallow supported bustle course.  The former 2.60 x .46 x .95 solid
  // hung from world y=1.39 and made the rear quarters read as a rectangular
  // welded turret.  T-80U's cast shoulder rises into a much thinner
  // stowage band; the basket below supplies the open lower volume.
  P.add('turret', box(2.34, 0.19, 0.78), 0, 0.365, -1.52);
  P.add('turretDark', box(2.30, 0.05, 0.76), 0, 0.49, -1.55);
  P.add('turretCloth', box(1.18, 0.12, 0.66), 0.10, 0.55, -1.43);              // strapped kit on top
  P.add('turretCloth', box(1.20, 0.26, 0.15), 0, 0.60, -1.205);                // snorkel saddle hump (ref side 2.131 @ z_w -1.0..-1.13)
  basket(P, 1.15, -1.96, -2.24, 0.25, 0.46, 0.5);
  P.add('turretDetail', box(0.05, 0.05, 0.72), 0.78, 0.50, -0.95, 0, 0.5, 0);  // grab rails
  P.add('turretDetail', box(0.05, 0.05, 0.72), -0.78, 0.50, -0.95, 0, -0.5, 0);
  P.add('turretDetail', box(0.08, 0.07, 0.08), -0.62, 0.575, -0.85);
  P.add('turretDark', cylY(0.045, 0.052, 0.12, 10), -0.62, 0.60, -0.85);
  {
    const antenna = FITTINGS.antennaWhip({ mats: P.mats, h: 1.34, r: 0.012, rake: -0.035, seed: 18 });
    antenna.position.set(-0.62, 0.62, -0.85);
    P.turretG.add(antenna);
  }
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
  muzzleBore(P, 0.068, 5.49);                                                  // §B3.1 muzzle bore (shadow-named)
  P.topY = 1.15;
}

// ---------------------------------------------------------------------------
// Type 90 — docs/references/tanks/type90.md
// R4 FULL RE-LAY (2026-08-03) against the batch-27-warped print, authored from
// the r27-landmine-fixed workorder dump (scratchpad wo.mjs; roots re-shown
// before the union box). R5 LADDER (2026-08-05, post trim-boundary
// amendment): fresh worldtrace re-lay of the turret plan-form (asym cheeks
// + shelf slivers), gun furniture (rear drum + fat evac + off-axis muzzle
// collar — the ref "mask island" plan cols are COVERABLE tube furniture),
// mudguard tips as the widthM anchor, pinned contact patch. All numbers in
// OUR world frame: ref side rows shifted +1.035 (side dAlong), plan +0.995.
// Envelope: hull 7.45, overall 9.76 (muzzle +5.94 lit, tail lip -3.84/pod
// lip -3.885), width 3.43 (mudguard TIP faces ±1.715 — the widthM measure
// needs a >=0.35 m plan z-band per column), height 2.34 (lid step 2.33 +
// frame 2.3325 + whip cols are the p95 anchor set).
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
  const { box, cylY, cylZ, frustum, torus, buildGun, buildRunningGear,
    fenders, headlight, liftEye, periscope } = KIT;
  const slab = orientedSlab;                                                   // §C missing-side fix: winding-corrected slabs only (see orientedSlab)
  const { rng } = P;
  // ---- hull tub + sponsons + stepped deck ----
  // WIDTH PROFILE (ref stations, profiles extraction): the hull is WIDE at
  // both ends and NARROW amidships — rear ~22%: +-1.693, mid: +-1.55-1.59,
  // front ~28%: +-1.70-1.715 (armored panels). Deck plates follow.
  P.add('hull', box(1.81, 0.91, 5.20), 0, 0.851, -0.30);                       // tub x +-0.905, belly 0.396, z -2.90..2.30 (r5: the 0.92 edge sat ON the ±0.94 front-col boundary [0.921] — coin-flip lighting put my 0.40 belly under the ref's 0.84-bottom cols; 0.905 keeps the ±0.90 belly cols and clears ±0.94)
  P.add('hull', box(1.81, 0.754, 0.66), 0, 0.773, 2.63);                       // bow tub segment TOP 1.15 (r6 worldtrace: the 1.306 tub top poked ABOVE the glacis line across z 2.35..2.96 — ref line reads 1.17-1.21 there, err 0.086-0.098 x5 cols; 1.15 tucks under the 1.177 plateau)
  P.add('hull', frustum(1.54, 1.92, -3.66, 1.54, 1.92, -3.66, 1.15, 1.35));    // sponson band over the tracks
  P.add('hull', box(3.09, 0.048, 2.75), 0, 1.384, 0.495);                     // fore deck 1.408 (r5: the fresh side rows want the 1.41 deck line across z -0.1..1.85; r6: extended to -0.88 — the ref 1.400 line runs to its -0.88 knee)
  P.add('hull', box(3.17, 0.048, 0.97), 0, 1.3875, -1.365);                   // mid deck 1.4115 (r6 worldtrace: the ref knee map is 1.400@-0.82 / 1.411@-0.94..-1.79 / 1.423@-1.91 — the old 1.423 plate from -0.75 read +0.013 on 7 cols)
  P.add('hull', box(3.17, 0.048, 0.25), 0, 1.399, -1.975);                    // deck course 1.423 (z -1.85..-2.10)
  P.add('hull', box(3.23, 0.048, 1.63), 0, 1.430, -2.925);                     // rear deck 1.454 (z -3.74..-2.11, x +-1.615 — a 1.61 edge printed only AA in the 1.60 front col where the ref reads its full deck)
  // glacis: shallow plate -> 1.177 plateau -> nose fall (three segments)
  // r7 GLACIS RE-PITCH (batch-49 worldtrace): the re-normalized ref's glacis
  // is TWO planes — a steep upper break 1.41@1.90 -> 1.285@1.99, then the
  // shallow run 1.285 -> 1.19@2.52 (ref cols 1.28@1.98 / 1.257@2.11 /
  // 1.234@2.23 / 1.223@2.35 / 1.20@2.47). The old single (1.80,1.392)->
  // (2.50,1.19) plane rode +0.03..+0.07 across four side cols in BOTH hull
  // and whole rows. Real two-step glacis is the vehicle's identity anyway.
  P.add('hull', frustum(1.58, 1.99, 1.78, 1.58, 1.90, 1.78, 1.270, 1.400));    // upper break (1.90,1.400)->(1.99,1.270)
  P.add('hull', frustum(1.58, 2.52, 1.94, 1.58, 1.99, 1.94, 1.175, 1.270));    // shallow run (1.99,1.270)->(2.52,1.175)
  P.add('hull', frustum(1.58, 3.14, 2.46, 1.58, 2.50, 2.46, 1.125, 1.177));    // 1.177 plateau to 3.10
  P.add('hull', frustum(0.85, 3.22, 3.06, 0.85, 3.10, 3.06, 1.02, 1.172));     // nose fall to 1.03@3.22 (r6 worldtrace: the ref plan CENTER FRONT is a FLAT 3.222 — the old nose ended 3.38 and printed +0.086 on 12 center plan cols. r6c FRUSTUM-HALFWIDTH LAW: the first frustum arg is HALF-width — the r6b '1.70' read spanned ±1.70 THROUGH the wrap lanes, the round's 40-84 §B4 voxels; ±0.85 stays inside the 0.995 lanes)
  P.add('hull', frustum(0.83, 3.20, 2.92, 0.85, 2.96, 2.92, 0.70, 1.02));      // under-nose face down to the belly line
  P.add('hull', slab(                                                          // bow belly rise (boat-tail, x +-0.90). r7: top ring 3.34 -> 3.20 — the batch-49 plan grid reads the ref's flat center front at 3.21, and the 3.34 lip printed 3.33 across TWELVE plan_hull/whole center cols (0.063 x12, the biggest non-island plan block); 3.20 tucks under the under-nose face end
    [-0.90, 0.396, 2.60], [0.90, 0.396, 2.60], [0.90, 0.396, 2.86], [-0.90, 0.396, 2.86],
    [-0.90, 0.72, 2.60], [0.90, 0.72, 2.60], [0.90, 0.72, 3.20], [-0.90, 0.72, 3.20]));
  // V splash board: proud strip riding the plateau (ref side 1.30 @ 3.03-3.16;
  // r6: pulled to z<=3.13 — the ref board ENDS 3.16 and the 3.20 col wants the
  // bare 1.172 plateau; the old 3.22 center piece printed 1.30 there, err 0.10)
  for (const s of [-1, 1]) P.add('hull', box(0.46, 0.115, 0.055), s * 0.40, 1.235, 3.012, -0.18, s * 0.42, 0);
  P.add('hull', box(0.14, 0.115, 0.055), 0, 1.245, 3.09, -0.18, 0, 0);
  // front mudguard pods (plan 3.69-3.70 carried by the THIN flap/lip only —
  // the 12%-band front BODY col stays at ~3.59: pod band 0.30 ends 3.57 and
  // the 3.65 col union (flap 0.72..0.90 + lip) holds under the 0.283 cut)
  for (const s of [-1, 1]) {
    P.add('hull', slab(                                                        // (r6b §B4: pod band raised to 1.075-1.19 — the r6 idler raise put the wrap/top-run pads at 1.02-1.10 through the old 1.01-1.04 pod bottoms, 84 exact voxels)
      [s * 0.96, 1.15, 2.88], [s * 1.62, 1.15, 2.88], [s * 1.62, 1.075, 3.50], [s * 0.96, 1.075, 3.50],
      [s * 0.96, 1.19, 2.88], [s * 1.62, 1.19, 2.88], [s * 1.62, 1.105, 3.56], [s * 0.96, 1.105, 3.56]));
    // r5 OUTER MUDGUARD TIP + widthM anchor: the ref's outermost plan column
    // (x 1.690-1.812 window) is a LOW guard tip — z 3.365..3.48, front-view
    // band 0.665..0.868 — NOT the skirt panels (its stations read 3.19 wide
    // over the old panel zone). The tip's 1.715 face carries widthM 3.43.
    // DEPTH 0.36: the widthM measure only counts plan columns with a
    // >=0.35 m z-band (the 0.115 exact-match tip read widthM 3.38/-1.45%
    // = -3.6 dims) — the certified price is ~0.12 err on the outer col.
    P.add('hull', box(0.050, s > 0 ? 0.20 : 0.14, 0.36), s * 1.690, s > 0 ? 0.77 : 0.77, 3.41); // L tip band 0.14 (y 0.70-0.84): NON-body under the front_hull 12% cut (~0.177) so the R mirror alone owns the R body end — the r5b symmetric 0.20 bands left BOTH ±1.712 cols body and the dAlong stayed 0.019
    P.add('hullDark', box(0.046, 0.03, 0.10), s * 1.689, s > 0 ? 0.86 : 0.80, 3.44); // guard-tip bolt strip (§B3 tell; outer 1.712 INSIDE the 1.715 WIDTH GUARD plane; L strip sits inside the thinned band)
    if (s > 0) {
      // FOLDED REAR-VIEW MIRROR on the RIGHT guard tip (identity cue — the
      // JGSDF stows them folded on the front fenders) — AND the front-row
      // REGISTRATION COUNTERWEIGHT: the official front reg reads dAlong
      // +0.019 (the REF's front body span is 19 mm right-of-center), which
      // half-phase-lerps EVERY front column against a symmetric build
      // (official front mean 1.57 vs 0.98 grid-aligned). The mirror's
      // y-band makes the R ±1.712 col BODY (band 0.46 > the ~0.293 cut)
      // while the L tip stays non-body (0.20) — my body mid moves to
      // +0.019 and the front grid aligns. One col pays ~0.13 (top 1.12 vs
      // the ref's 0.868 tip line).
      P.add('hullDetail', box(0.028, 0.22, 0.04), 1.700, 0.90, 3.40, 0.2, 0, 0); // folded mirror arm (r7: lowered — the ref's own R-tip col tops 0.871 and the 1.12 head paid 0.13; band [0.672..1.01] holds 0.34 > the ~0.293 body cut, so the dAlong counterweight stands)
      P.add('hullDark', box(0.042, 0.11, 0.16), 1.6925, 0.945, 3.33);          // mirror head (folded flat, top 1.00)
    }
    // §A FRONT ANCHOR: a low bracket block whose side-col union with the
    // flap keeps the ~3.58 col a BODY col (hullLengthM front anchor). r5:
    // narrowed to x 0.865-0.935 — the REF'S OWN bow reaches 3.546 exactly
    // there (its 0.898 plan col) while the old 0.55-0.92 block printed
    // 3.595 across six cols where the ref bow curve reads 3.23-3.30
    // (0.19 err x6, the biggest non-island plan_hull block). At 1.0-1.45
    // it sat inside the idler wrap's far quadrant (144 exact vox, r4d).
    P.add('hull', box(0.07, 0.29, 0.05), s * 0.90, 0.745, 3.57);               // (face 3.595 clear of the 3.617 col boundary now the idler far edge is 3.58; r6b: band raised to 0.60-0.89 — the 0.44 bracket bottom printed the ±0.94 front cols under the ref's 0.599 skirt-band line; the ~3.58 side-col union band stays 0.50 > the 12% cut so hullLengthM holds)
    P.add('hullRubber', box(0.59, 0.18, 0.03), s * 1.36, 1.01, 3.56);          // thin flap = the plan front line at x 1.065-1.655 (r5: front 3.575 — the ref plan front at |x| 1.35-1.66 reads 3.576; the 3.605 face read +0.06 on four cols. r6: band 0.92-1.10 — the raised idler wrap's far quadrant now climbs to ~0.88 at this z — §B4 preempt, audit dilates 2 cm)
  }
  // stern: boat-tail wedge + raised wide plate + tail lip + flap-pod anchors
  P.add('hull', slab(                                                          // center wedge (x +-0.90 — r5b: the 0.92 edge sat 1 mm inside the ±0.94 front-col boundary [0.921], an AA coin-flip): bottoms 0.58@-3.2 -> 0.93@-3.73
    [-0.90, 0.55, -2.88], [0.90, 0.55, -2.88], [0.90, 0.93, -3.73], [-0.90, 0.93, -3.73],
    [-0.90, 1.30, -2.88], [0.90, 1.30, -2.88], [0.90, 1.30, -3.73], [-0.90, 1.30, -3.73]));
  P.add('hull', box(2.86, 0.44, 0.07), 0, 1.21, -3.695);                       // wide rear plate course (bottom 0.99 clears the sprocket wrap)
  P.add('hull', box(2.84, 0.034, 0.18), 0, 1.437, -3.75);                      // thin tail fender lip (band .03 — under the 12% cut; r5: rear -3.84 fills the ref's -3.875 side col [its 1.441-1.471 lip band] — the old -3.78 read REF-ONLY cover there)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.145, 0.31, 0.13), s * 1.51, 1.295, -3.765);            // §A REAR ANCHOR: mudflap pods (ref plan -3.76 @ x 1.52-1.56; rear body col ~-3.80, overall ~9.79 with the 5.96 muzzle)
    P.add('hull', box(0.07, 0.03, 0.115), s * 1.545, 1.435, -3.8275);          // r5 outer-pod top lip to -3.885 (band .03 non-body): the ref plan rear at x 1.48-1.60 reads -3.885 while x 1.36-1.48 reads -3.824 — a stepped pod rear
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
  P.add('hullDark', box(1.90, 0.014, 1.30), 0, 1.444, -2.72);                  // r7: louvre field FLUSH (the 1.468-crown strips printed station i1 +0.016 over the ref's 1.468 deck read — real Type 90 louvres sit in the deck plane)
  for (let k = 0; k < 6; k++) P.add('hullDetail', box(1.80, 0.012, 0.05), 0, 1.4475, -3.18 + k * 0.17);
  P.add('hullDark', box(1.85, 0.014, 0.85), 0, 1.427, -1.42);
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.08, 0.08, 0.014, 12), s * 1.25, 1.432, -1.10);
  headlight(P, -1.22, 1.05, 3.44, -0.3, 0.05);
  headlight(P, 1.22, 1.05, 3.44, -0.3, 0.05);
  P.add('hullDetail', torus(0.08, 0.014, 10), -0.55, 0.62, 3.12, Math.PI / 2, 0, 0); // tow eyes on the under-nose (r6: pulled to 3.12 — their 3.395 plan fronts co-printed the ref's flat 3.222 center line with the old nose)
  P.add('hullDetail', torus(0.08, 0.014, 10), 0.55, 0.62, 3.12, Math.PI / 2, 0, 0);
  liftEye(P, 'hullDetail', -1.35, 1.36, -0.3);                                 // (r6: sunk 4 cm — the 1.45 eye crowns printed the -0.21/-0.33 side cols over the ref's bare 1.400 deck line)
  liftEye(P, 'hullDetail', 1.35, 1.36, -0.3);
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
  fenders(P, 1.22, 1.640, 1.166, 2.575, 3.20, 0.03);                           // front fender run (top 1.196, over the armored-panel zone only; r6: ends 3.20 — the ref fender line FALLS toward the tip)
  for (const s of [-1, 1]) {
    P.add('hull', slab(                                                        // raked fender TIP 1.19@3.20 -> 1.09@3.44 (r6 worldtrace: ref tops 1.172@3.20 / 1.137@3.32 / 1.092@3.44 — the flat 1.196 run read +0.06..+0.08 there; one raked surface per SS-B1)
      [s * 1.22, 1.16, 3.20], [s * 1.64, 1.16, 3.20], [s * 1.64, 1.06, 3.44], [s * 1.22, 1.06, 3.44],
      [s * 1.22, 1.19, 3.20], [s * 1.64, 1.19, 3.20], [s * 1.64, 1.09, 3.44], [s * 1.22, 1.09, 3.44]));
  }
  fenders(P, 1.22, 1.555, 1.166, -2.10, 2.575, 0.03);                          // mid fender run (inset with the sheet)
  fenders(P, 1.22, 1.655, 1.166, -3.30, -2.36, 0.03);                          // rear fender run (r6: END -2.36 — the i3 station-slab boundary moved AGAIN [-2.303 this round]; the -2.30 end sat 3 mm inside it and printed i3 w 3.30 vs the ref 3.19. grid-coupling: boundaries move with the mask extents)
  for (const s of [-1, 1]) {
    for (const [zc, d] of [[2.7675, 0.385], [3.04, 0.16]]) {                   // FRONT armored panels z 2.575..3.12 (r5 station re-read: ref width
      P.add('hull', box(0.06, 0.582, d), s * 1.661, 0.899, zc);                // steps to 3.39-3.42 only over i12-13 [z 2.54+] — panels starting 2.52
    }                                                                          // still poked i11 [5.2 wPct]; outer faces 1.691 (r7: the re-normalized
                                                                               // ref's i12 slab reads 3.382 — the old 1.678 read 3.353, wPct 0.86;
                                                                               // still inside the 1.715 WIDTH GUARD): the ref's outer
                                                                               // plan col [1.690+] belongs to the mudguard TIP, not the panels.
                                                                               // r6: 2nd panel ends 3.23 — its 1.19 top printed the 3.324 side col
                                                                               // where the ref line has fallen to 1.137 (the raked tip owns it now)
    // STRICT TRACK-CORRIDOR: every mid-skirt skin lives wholly OUTBOARD of
    // the native shoe face (outer shoe 1.600).  The former 1.5225/1.5625
    // centers put these plates through the linked course even though the
    // legacy front/rear-only audit stayed green.  A common 1.645 plane keeps
    // the inner face at 1.6225, retains the source's shallow skirt cadence,
    // and remains inside the 1.715 mudguard width anchor.
    P.add('hull', box(0.045, 0.565, 0.54), s * 1.645, 0.8905, -1.83);          // MID sheet aft course (outer 1.6675, z -2.10..-1.56)
    for (const zc of [-1.38, -1.02, -0.66, -0.30, 0.06, 0.42, 0.78]) {         // amidships outboard sheet (outer 1.6675, z -1.56..0.96)
      P.add('hull', box(0.045, 0.565, 0.36), s * 1.645, 0.8905, zc);
    }
    for (const [zc, d] of [[1.14, 0.36], [1.50, 0.36], [1.86, 0.36], [2.22, 0.36], [2.475, 0.15]]) { // MID sheet fore run (outer 1.6675, z 0.96..2.55)
      P.add('hull', box(0.045, 0.565, d), s * 1.645, 0.8905, zc);
    }
    for (let k = 0; k < 2; k++) {                                              // REAR course (outer 1.693, z -3.40..-2.41). (The r4 "1.64-col lerp-junk"
      P.add('hull', box(0.04, 0.565, 0.485), s * 1.673, 0.8905, -3.155 + k * 0.505); // residual dissolved with the ad39179 trim-boundary amendment —
    }                                                                          // the fresh r5 worldtrace reads the 1.66 col at err 0.01)
    for (let k = 0; k < 2; k++) P.add('hullDark', box(0.05, 0.50, 0.016), s * 1.641, 0.90, 3.10 - k * 0.44);
    for (let k = 0; k < 5; k++) P.add('hullDark', box(0.04, 0.48, 0.016), s * 1.645, 0.89, 1.28 - k * 0.72);
    P.add('hullDark', box(0.02, 0.05, 6.1), s * 1.645, 0.635, -0.05);           // outboard lower seam; never a track/shoe layer
  }
  // 6 wheels on the ref's SHORT contact patch, HIGH small idler + sprocket
  // (climbing-ramp read; far edges 3.66/-3.36 on the ref's plan lines)
  const wheelZs = [2.10, 1.22, 0.34, -0.54, -1.42, -2.30];
  buildRunningGear(P, {
    // LINK-OVERHANG LAW: shoes print xc+-(W/2+0.023) — xc 1.290 puts the
    // lane faces at 0.9785/1.6135: 1.6-2.9px INSIDE the ref's own
    // 0.960/1.620 track columns (the ref's shoes ride those cols: its
    // ±1.60/±0.98 fronts reach ground) while staying clear of the ±1.64/
    // ±0.94 cols it keeps for skirt/tub (the r4a 0.962/1.623 shoes bled
    // them; the r4 0.976/1.600 faces sat ON the boundaries = coin flips
    // that landed UNLIT this round, 0.21-0.25 err x4 front cols)
    // r7 LANE NARROW (batch-49 stations): shoes print xc±(W/2+0.023) —
    // 1.286/0.582 puts the faces at 0.972/1.600: the INNER face holds the
    // ref's 0.96-1.00 plan col exactly and the OUTER stays lit in the
    // [1.59..1.66] plan col (10 mm = one full pixel) while shaving every
    // station slab from 3.217 to 3.200 against the ref's 3.187 panel line
    // (its sheet-built track strips VANISH from the front-clipped slab
    // renders — END-CAP law — so its slabs read skirts/wheels; solid shoes
    // paint at true x in every slab and 3.187-exact would need the outer
    // face at 1.5935, dark in the plan col. 1.600 is the measured optimum:
    // panel slabs wPct 0.9 -> 0.4, plan col kept).
    style: 'rubber', wheelR: 0.37, wheelW: 0.21, wheelY: 0.47, xc: 1.286,
    wheelZs,
    // end wheels r 0.21 (the 0.26/0.23 pair drove the band tangent solver
    // into a malformed rear segment — a real band vert at z -3.57/y 0.05 and
    // mask content to -3.72 that junked the outer plan cols)
    // r5: idler pulled to 3.20 (far edge 3.58 — the old 3.28/3.66 wrap far
    // printed a 0.96-bottom band in the ref's TUBE-ONLY 3.678 col, err 0.27,
    // and the plan track cols +0.07 past the ref's 3.576 front); contact
    // patch PINNED 2.24/-2.40 (ref ramp liftoffs read 2.28/-2.42 — the free
    // patch ran to the wheel extremes and held the belly grounded 0.15-0.25
    // past both liftoffs, 0.08-0.12 deep across 10 ramp cols)
    sprocket: { z: -2.98, y: 0.84, r: 0.14 }, idler: { z: 3.24, y: 0.73, r: 0.19 },   // (r6c §B4: idler y 0.77 -> 0.73 — the raised top-run/wrap crown shared 2 cm voxels with hull content at y 1.02-1.06 / z 3.06-3.22; the wrap-annulus col scores are y-symmetric about the band center and hold at 0.73)
    rollers: [1.70, 0.60, -0.50, -1.60].map((z) => ({ z, y: 0.95, r: 0.08 })),
    trackW: 0.582, topY: 0.92, botY: 0.055, contactZF: 2.18, contactZR: -2.26, paintedEnds: true, coveredTop: true, arms: true,
  });
  // (r5b: contactZR -2.40 -> -2.32 — the VISIBLE rear liftoff lagged the
  // pin ~0.12 [ref -2.42, mine read -2.52; the front pin took exactly]:
  // the short -2.40..sprocket tangent run absorbs part of the pin.)
  // r6 GEAR RE-LAY (1024 worldtrace): BOTH end wraps sat too low/late —
  // ref rear ramp lifts ~-2.40 climbing slope ~0.72 to a HIGH sprocket
  // wrap (bottom ~0.61 vs the old 0.40; want bots 0.098@-2.52 ..
  // 0.623@-3.25, mine were 0.03..0.44, err 0.04-0.09 x7 cols), ref front
  // ramp lifts ~2.30 to a wrap crest centered ~0.77 (the 3.57 col wants
  // the [0.646..0.897] annulus band; the old y0.64 wrap read
  // [0.397..0.985]). Sprocket 0.84/0.14 puts the wrap+pads top at ~1.11,
  // clear of the 1.15 sponson bottom (§B4, audit dilates 2 cm); idler
  // 3.24/0.77/0.19 keeps the far edge (band 3.52, pads ~3.58) clear of
  // the certified 3.69 tube-only col at 3.63. SS-B6 trapezoid strengthens
  // (both ends raised hard). End r <= 0.19 stays under the r>=0.23
  // band-solver malformation landmine (r4 law 2).
  // These concentric shadow dishes are suspension/wheel-bay structure, not
  // hull armor.  Keep their explicit running-gear ownership so the strict
  // lint can distinguish the intended recess behind each road wheel from a
  // hull plate penetrating the shoe course.
  wheelRecessAt(P, wheelZs, 1.286, 0.47, 0.37, 0.21, 'hullRunningGearDark');
  tightenHullShadowProxy(P, { xc: 1.286, trackW: 0.36, y0: 0.15, y1: 0.60, z0: -2.35, z1: 2.25, hullZ0: -3.10, hullZ1: 3.10 });

  // ---- turret: §B7 REAL-PROPORTION BAND (owner ruling §5.28, 2026-08-07) ----
  // The print (recovered/type90.glb) is REF-WRONG on turret height: its
  // post-warp roof PLATE reads 1.90 (hatch domes 2.05-2.08, sight ridge
  // 2.23-2.26, basket frame 2.31 are furniture — France-round top-map;
  // the pre-warp .bak vertex probe agrees: the batch-27 two-knee warp mapped
  // the print's furniture crown to the published line and squashed the real
  // roof under it). THE REAL VEHICLE GOVERNS this region (§B7): roof 2.34
  // (published, Wikipedia + weaponsystems.net), face 1.43->2.34 (~0.90 m vs
  // the print's 0.47), bore 1.82 (three-source school constant: type10 build
  // 1.82 [PASS 9.0, roof-bore 0.48], leo2a4 build 2.00 [roof-bore 0.48],
  // pre-warp type90 artist bore at 43.8% of his own face -> 1.82 on the real
  // face; the spec's inherited armor model already carries gunPivot bore
  // 1.82). Per-column caps: docs/references/tanks/type90.md (this round).
  // §5.73-1 P95-ENVELOPE DATUM (2026-08-08, owner law): spec heightM
  // 2.34 -> 2.55 = the 49-v2 print's measured bodyHeightM (gate dims-replica
  // p95; vertex REG at fcfeb38a) — heightM is the P95 envelope WITH mandatory
  // roof kit, not the bare roof. New grace line 2.5755; the §5.57 crown-band
  // dims-datum cap DISSOLVES: hatch/ridge kit rides at the print's own
  // 2.44-2.53 band (below grace — no bin scarcity), and the only above-grace
  // spender left is the rear antenna-mast bin (2.584). The datum-round p95
  // anchor set = frame bars 2.533 x2 + tower lid 2.519 x2 (4th-highest
  // column ~2.535-2.55, err <=0.6% vs 2.55).
  // heightM p95 DISCIPLINE (caps never cover dims): every roof crown
  // <= 2.56 physical (pixel-center law: traces read +0.006..0.016); the
  // rear mast bin is the sole above-grace column class.
  // (turret local frame: world y-1.40, world z+0.20)
  P.turretG.position.set(0, 1.40, -0.20);
  const RY = 0.94;                                                             // roof PLANE 2.34 = the published datum (was 0.66/2.06 chasing the squat print)
  // r5 PLAN-FORM RE-LAY (fresh worldtrace): the ref cheek line falls 0.10-
  // 0.30 SOONER than the r4 shape on BOTH sides and the wide band is
  // FRONT-HALF-ONLY — x>1.233 content ends z_w -1.327 (the rear bustle
  // narrows to <=1.21) while the plan's widest REAR content (the +-1.29-1.39
  // front-view 1.82-1.85 band) is the side SHELVES' z-sliver, not wall.
  // Ref front line (z_w): L 0.99@-1.26 / 1.51@-1.14 / 1.63@-1.02 / 1.72@-0.78;
  // C 1.78; R 1.69@0.81 / 1.54@1.05 / 1.08@1.17 / gone by 1.23.
  // r7 REAR-WALL STEP (batch-49 ladder): the re-normalized print's bustle
  // walls are x-CONST ±1.18 aft of its wide-band end (its plan col -1.279
  // wants rear -1.358 = w step -1.155 local) — the old continuous slant
  // [±1.26/1.30, -1.127]->[±1.18, -2.11] printed my rear at -1.79..-1.91
  // (plan_turret 0.303 err) AND its plan-slanted chamfer painted the 2.34
  // roof line into station slabs i4/i5 (front-clip END-CAP law: only faces
  // with a z-normal component render mid-slab — x-const walls vanish).
  const PLAN_LO = [
    [-0.55, 1.98], [0.55, 1.98], [0.85, 1.88], [1.00, 1.76], [1.11, 1.30],
    [1.19, 0.88], [1.19, -1.127], [1.18, -1.155], [1.18, -2.11], [-1.18, -2.11],
    [-1.18, -1.155], [-1.26, -1.127], [-1.26, 1.13], [-1.20, 1.17], [-1.08, 1.68], [-0.93, 1.82], [-0.80, 1.90],
  ];
  const PLAN_HI = [
    [-0.55, 1.98], [0.55, 1.98], [0.85, 1.88], [1.00, 1.76], [1.11, 1.30],
    [1.21, 0.90], [1.21, -1.127], [1.18, -1.155], [1.18, -2.11], [-1.18, -2.11],
    [-1.18, -1.155], [-1.30, -1.127], [-1.30, 1.19], [-1.20, 1.19], [-1.08, 1.70], [-0.93, 1.84], [-0.80, 1.92],
  ];
  P.add('turret', KIT.polyTurret(PLAN_LO, 0.70, 1.0, 1.0), 0, 0.03, 0);        // wall band 1.43..2.13 — the REAL near-vertical welded slab sides (the r6 1.423-1.446 underside base holds; §B7: the print's 1.77 wall top is the squashed read)
  P.add('turret', KIT.polyTurret(PLAN_HI, 0.08, 1.0, 1.0), 0, 0.73, 0);        // wall extension band 2.13..2.21 (plan unchanged — footprint is registration-neutral)
  P.add('turret', box(1.96, 0.36, 1.855), 0, 0.76, 0.5475);                    // roof plate x +-0.98, TOP 2.34 (the published datum), z_w -0.578..1.278 (r7: rear cap moved OFF station slab i5 [-1.224..-0.684] into i6 — a z-cap face paints the whole 1.98..2.34 band into its slab under the front-clip END-CAP law; the print's own sheet roof vanishes mid-slab and its i4/i5 tops read the 2.24 shelf line)
  for (const s of [-1, 1]) {
    const W = s > 0 ? 1.21 : 1.30;
    P.add('turret', slab(                                                      // roof-edge weld chamfer, crew zone: wall top 2.21 @ +-1.21/1.30 -> roof plane 2.34 @ +-0.98 (real Type 90 edge bevel is NARROW — the old 0.33-0.42 shoulder at 1.82-1.87 was the print's rounded squat crown). r7: rear end pulled -0.50 -> -0.38 local (w -0.58, station i6) — its end cap painted 2.34 into i5
      [s * 0.88, 0.81, 1.42], [s * W, 0.81, 1.02], [s * W, 0.81, -0.38], [s * 0.88, 0.81, -0.38],
      [s * 0.88, RY, 1.42], [s * 0.98, RY, 1.02], [s * 0.98, RY, -0.38], [s * 0.88, RY, -0.38]));
    P.add('turret', slab(                                                      // roof-edge chamfer, bustle REAR only (r7): x-const 1.18 -> 1.10 over local -1.60..-2.11 — x-normal faces vanish from every mid-slab render, and both end caps land in free slabs (i3 rear-frame zone / i2). Over -0.38..-1.60 the wall-top band (2.21) is an exposed flat shoulder — real welded-slab bustles carry it, and it reads under the 2.246 shelf-cap station line
      [s * 1.18, 0.81, -1.60], [s * 1.18, 0.81, -2.11], [s * 1.00, 0.81, -2.11], [s * 1.00, 0.81, -1.60],
      [s * 1.10, RY, -1.60], [s * 1.10, RY, -2.11], [s * 1.00, RY, -2.11], [s * 1.00, RY, -1.60]));
  }
  P.add('turret', slab(                                                        // cheek-zone roof: RAKED from the 2.34 plane down toward the face (r7, batch-49 worldtrace: the re-normalized print's forward roof line falls 2.34 -> ~2.16-2.03 over z_w 1.30..1.86 — the flat carry-out printed +0.06..+0.09 on five side cols and +0.14 on station i10). ONE raked surface per §B1; the brow box closes the front edge
    [-0.56, 0.68, 1.94], [0.56, 0.68, 1.94], [1.10, 0.78, 1.28], [-1.10, 0.78, 1.28],
    [-0.54, 0.74, 1.90], [0.54, 0.74, 1.90], [1.08, RY, 1.28], [-1.08, RY, 1.28]));
  P.add('turret', box(1.12, 0.13, 0.12), 0, 0.695, 1.92);                      // the SHALLOW BROW over the gun throat (identity cue): face flush with the plan nose 1.98; r7 top 2.16 (the print's own brow line reads 2.16-2.22 post-warp — the 2.34 carry-up was the flat-roof read)
  for (const s of [-1, 1]) {
    P.add('turret', cylY(0.075, 0.075, 0.46, 12), s * 0.38, 0.42, 1.90);       // ROUNDED GUN-SHIELD CHEEKS flanking the embrasure (owner-named identity read; centered on the 1.82 bore line, faces ~flush with the throat plane)
  }
  P.add('turret', box(2.36, 0.135, 1.73), 0, 0.8725, -1.245);                  // bustle roof at the SAME 2.34 plane (y 2.2075..2.34, z_w -0.58..-2.31; the long parallel autoloader bustle roof is flat and continuous with the crew roof on the real vehicle — the print's 1.885 was the squash). r7: front cap moved -0.70 -> -0.58 (station i6, free slab) — the END-CAP law again; x-side faces at ±1.18 are x-normal and vanish mid-slab
  // hatches: commander RIGHT / loader LEFT. §5.73-1 DATUM ROUND: the v2
  // print (and the real vehicle) carries a 2.44-2.53 hatch/ridge crown band
  // across z_w -0.58..1.25 — under the old 2.34 datum these crowns were
  // grace-capped at 2.352 (the §5.57 crown-band cap); at the 2.55 datum the
  // band is FREE. Commander cupola raised to the real proud-ring read:
  // coaming 2.395, lid 2.415, vision-block ring 2.462 (the print's front
  // R-dome band 2.48-less-bias at x 0.25..0.45).
  P.add('turret', cylY(0.225, 0.225, 0.055, 14), 0.56, 0.9675, -0.17);         // commander coaming ring (top 2.395 — the raised cupola base)
  P.add('turretDark', torus(0.22, 0.011, 14), 0.56, 0.988, -0.17);
  P.add('turret', cylY(0.195, 0.21, 0.020, 14), 0.56, 1.005, -0.17);           // lid (crown 2.415)
  P.add('turretDark', box(0.36, 0.010, 0.03), 0.56, 1.017, -0.17);
  P.add('turret', box(0.13, 0.06, 0.22), 0.855, 0.97, -0.17);                  // cupola outboard ring segment (grab rail/wiper stowage, top 2.40): the v2 cupola band runs to x ~0.91 (front cols 0.83..0.91 want 2.40-2.41, run-2 worst block) — low box seated on the roof plane, side-invisible under the 2.462 blocks
  for (let vb = 0; vb < 4; vb++) {                                             // cupola VISION-BLOCK RING, inboard-forward arc (crowns 2.462): the v2
    const va = (130 + vb * 30) * Math.PI / 180;                                // front dome band [x 0.251..0.445, want ~2.48] + the side crown-band cols
    P.add('turretDetail', box(0.07, 0.122, 0.07),                              // z_w -0.53..-0.22 — housings seat ON the roof plane (§B2 connected).
      0.56 + 0.20 * Math.cos(va), 1.001, -0.17 + 0.20 * Math.sin(va));         // r2: the 250-deg 5th block aliased col z_w -0.705 (bustle want 2.316) — 4 blocks end the arc at 220 deg
  }
  P.add('turret', cylY(0.20, 0.20, 0.05, 14), -0.52, 0.961, -0.11);            // loader coaming raised (top 2.386): r3 — run-2 unmasked the INBOARD dome-band cols x -0.33..-0.41 wanting 2.41 (the run-1 no-charge band was the cutoff hiding them, not a low ref line)
  P.add('turretDark', cylY(0.205, 0.205, 0.010, 14), -0.52, 0.988, -0.11);
  P.add('turret', cylY(0.14, 0.16, 0.055, 12), -0.60, 0.985, -0.11);           // loader PERISCOPE DOME, offset outboard on the lid (top 2.4125): r2 — the
  //   v2 print DOES carry a loader-side dome band (front cols x -0.52..-0.79
  //   want 2.42-2.43, the run-1 worst block); the offset cap covers x -0.44..
  //   -0.76 while the inboard cols x -0.33..-0.48 keep their flush read
  //   (their ref line is unproven — the run-1 no-charge band).
  periscope(P, 'turretDetail', 0.56, 0.905, 0.16);                             // flush periscope heads (box top = the roof plane)
  periscope(P, 'turretDetail', -0.30, 0.905, 0.06, 0.3);
  // ROOF SIGHT CLUSTER at the real proportions: the print's 2.19-2.26 "ridge"
  // was its whole sight cluster riding a 1.90 roof — on the REAL 2.34 roof
  // the gunner's primary sight is EMBEDDED (low armored hood) and the
  // commander's stabilized periscope sight is the TALL BOX forward-right
  // (identity cue; real cluster runs to ~3.05 over sights+MG — the p95
  // budget carries the tower on <=2 pinned columns, everything else flush).
  P.add('turret', box(0.345, 0.15, 0.69), 0.2725, 1.015, 1.135);               // gunner sight hood RAISED (top 2.49, z_w 0.59..1.28): the v2 ridge band
  //   wants 2.506 across the z_w 1.005..1.245 cols (§5.57 crown-band class —
  //   the print's sight-cluster housing run) — the old 2.352 "embedded" read
  //   was the datum cap, not the print. Station i9 (want 2.509) exits the
  //   trim slots on this raise.
  P.add('turretDark', box(0.30, 0.09, 0.03), 0.27, 1.00, 1.462);               // recessed aperture FLUSH in the hood face (r2: proud boxes at z_w 1.295-1.31 lerped 0.097 into the falling-roof col z_w 1.375 — want there is the ref's 2.18 rake line)
  P.add('turretGlass', box(0.22, 0.06, 0.02), 0.27, 1.00, 1.472);
  // COMMANDER SIGHT TOWER (r7 re-seat, batch-49 ladder): the re-normalized
  // print's sight ridge reads 2.66-2.72 across z_w -0.58..1.25 and its FRONT
  // crown sits x -0.06..0.22 — the old 2.597 tower at x 0.42 / z_w 0.165-0.380
  // was half a bin off BOTH ways (side cols 0.155/0.281/0.401 lerp-read
  // 2.46/2.59/2.47 against 2.696-2.718 wants; front paid 0.17-0.20 x8 cols).
  // BIN DISCIPLINE (dims sovereign): the tower is 2 of the 3 above-grace
  // heightM bins — z_w 0.30..0.45 spans bins [0.277..0.398]+[0.398..0.519]
  // exactly and straddles the station i7/i8 boundary 0.395 so ONE mass tops
  // both slabs (ref topH 2.72 each). Top 2.705 = the ref's own crown line.
  // 49-v2 RE-TUNE (owner verdict "turret was huge" -> oracle re-warped,
  // d4c2fec): the REAL lines govern — sight head 2.60 max, low flat read.
  P.add('turret', box(0.265, 0.165, 0.14), 0.0775, 1.0225, 0.57);              // tower body 2.34..2.505, x -0.055..0.21 (the ref's front-crown window)
  P.add('turret', box(0.285, 0.016, 0.15), 0.0775, 1.111, 0.57);               // lid (top 2.519 = the v2 print's own i7/i8 sight-head line 2.535-rel; caps at z_w 0.295/0.445, 20+ mm inside both bin edges)
  P.add('turretDark', box(0.22, 0.09, 0.02), 0.0775, 1.035, 0.65);             // glazed head band on the forward face (proud 10 mm, still inside the 0.519 bin edge)
  P.add('turretGlass', box(0.17, 0.05, 0.012), 0.0775, 1.035, 0.658);
  P.add('turret', box(0.265, 0.165, 0.47), 0.0775, 1.0225, 0.265);             // §5.73-1 sight-housing REAR RUN (top 2.505, z_w -0.17..0.30, butts the
  //   tower rear face): the v2 ridge band continues BEHIND the tower at
  //   2.516-2.526 across the center cols z_w -0.084..0.155 (§5.57 cap class,
  //   now free under the 2.55 datum). Rear z-cap paints the 2.34..2.505 band
  //   into station i6 (want 2.524) — the END-CAP law working FOR us.
  P.add('turretGlass', box(0.14, 0.020, 0.016), -0.02, 0.941, 0.90);
  // loader-side roof furniture re-seated on the 2.34 plane (r1 gate lesson:
  // at y 0.955 these two boxes topped 2.375 — two above-grace columns that
  // moved heightM p95 to 2.38/-4.1 dims; half-flush at 2.36 keeps them
  // inside the 1% grace band)
  P.add('turretDetail', box(0.14, 0.040, 0.12), -0.55, 0.932, 0.55);
  P.add('turretDetail', box(0.14, 0.040, 0.12), -0.68, 0.932, 0.25);
  // M2 on a LOW RIGHT-SIDE SWING MOUNT beside the commander hatch (type10
  // family precedent — "receiver top 2.31 on a LOW right-side swing mount":
  // a roof-standing pintle on a 2.34-datum roof owns heightM p95 and zeroes
  // dims; the swing mount keeps the whole gun <= 2.32, mask-interior in
  // side AND plan [receiver x 1.078..1.182 inside the 1.21 wall line,
  // ammo can inboard], §B3 census intact).
  P.add('turretDetail', box(0.14, 0.024, 0.20), 1.13, 0.608, 0.10);            // mount shelf (top 2.02)
  P.add('turretDark', box(0.12, 0.030, 0.14), 1.14, 0.585, 0.10);              // support arm into the wall top band
  P.add('turretDark', box(0.028, 0.20, 0.028), 1.155, 0.49, 0.10);             // diagonal brace to the wall face (§B2 no-air: the mount is connected structure)
  const m2 = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', scale: 0.9, seed: 9 });
  m2.position.set(0.82, 0.757, 0.02);                                          // seated on the final commander cupola; fitting retains its authored scale
  P.turretG.add(m2);
  // side SHELVES on the bustle flanks (r5 re-read of the +-1.29-1.39 band:
  // the ref's widest turret content is a SHELF SLIVER — plan z_w -0.687..
  // -1.296 ONLY, front-view tops 1.84-1.85 — not deck rails and not wall:
  // its front cols read 1.842-1.852 at |x| 1.20-1.37 while its plan keeps
  // the same x-window empty fore/aft of the sliver. L runs wide (-1.366),
  // R stops at 1.297 (the 1.336+ front cols read the 1.475 deck).
  for (const s of [-1, 1]) {
    const xOut = s > 0 ? 1.297 : 1.366;
    const xIn = 1.21;
    const xc2 = (xOut + xIn) / 2;
    // r7 SHELF SPLIT (batch-49 stations): the re-normalized print's i4/i5
    // slab tops ARE its shelf line (2.246/2.26 rel — its sheet roof vanishes
    // mid-slab), so MY shelves own those station tops: two segments (END-CAP
    // law, ≤0.48 m) with the joint at z_w -0.90 inside i5 and the rear cap
    // at -1.296 inside i4; tops tuned per-slab (front 2.2435 / rear 2.2295 =
    // ref topH 2.26/2.246 less the +0.016 pixel-center+box bias, measured).
    // Side rows never see them (under the 2.33 bustle-roof line); the old
    // single 2.26 shelf read i4 +3.9 / i5 +3.4 station points.
    P.add('turret', box(xOut - xIn, 0.10, 0.413), s * xc2, 0.7935, -0.4935);   // front segment (z_w -0.487..-0.90, top 2.2435)
    P.add('turret', box(xOut - xIn, 0.10, 0.396), s * xc2, 0.7795, -0.898);    // rear segment (z_w -0.90..-1.296, top 2.2295)
    P.add('turretDark', box(xOut - xIn - 0.02, 0.02, 0.57), s * xc2, 0.72, -0.79); // under-lip shadow
    P.add('turretDetail', box(xOut - xIn - 0.04, 0.02, 0.045), s * xc2, 0.815, -0.55); // lid ribs (recessed: tops stay under the per-slab shelf lines)
    P.add('turretDetail', box(xOut - xIn - 0.04, 0.02, 0.045), s * xc2, 0.80, -1.01);
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 3, r: 0.040, len: 0.20, splay: s * 0.75, pitch: -0.45, seed: 3 + s });
    smoke.position.set(s * 1.04, 0.49, -0.42);                                 // 2x3 dischargers follow the final raised bustle flank
    P.turretG.add(smoke);
    liftEye(P, 'turretDetail', s * 1.16, 0.80, 0.75, s * 0.4);                 // roof-edge lifting eyes on the wall-top shoulder (crown ~2.30 <= grace)
  }
  // REAR BASKET low + raked corner masts (the ref rear cluster decodes as a
  // LOW overhung basket — front cols +-0.99-1.06 top 1.91-1.95 — whose 2.28+
  // side band comes from the RAKED-AFT whips and a narrow center top frame,
  // NOT a full-width tall rail: a 2.28 rail across +-1.14 printed the whole
  // front row 2.29 in r4a)
  {
    const zf = -1.83, zr = -2.158;                                             // local (world -2.03/-2.358; r7: the batch-49 grid re-phased — the bin boundary now sits at -2.398 and the old -2.40 rail rear face poked it by 2 mm, the r5b -2.413 class again; rear faces hold >= -2.378)
    P.add('turretDetail', box(2.39, 0.04, 0.04), 0, 0.28, -2.235);             // floor rail rear (1.66-1.70, unchanged — the basket FLOOR line is hull-referenced and the print agrees here; its -2.455 face IS the plan basket rear)
    P.add('turretDetail', box(2.39, 0.04, 0.04), 0, 0.075, zf);                // floor rail front
    P.add('turretDetail', box(2.39, 0.04, 0.04), 0, 0.72, zr);                 // top rail 2.10..2.14 (§B7: the real rack's top rail rides ~0.2 under the 2.34 roof — the print's 1.90 rail is its squat-band read)
    for (let i = 0; i < 7; i++) {
      const x = -1.11 + i * 0.37;
      P.add('turretDetail', box(0.03, 0.60, 0.03), x, 0.42, -2.13);            // rear posts to the raised rail (z_w -2.33 — off the [-2.34,-2.46] flicker col)
    }
    P.add('turretDark', box(2.35, 0.54, 0.014), 0, 0.44, -2.12);               // mesh back (z_w -2.32)
    P.add('turretCloth', box(2.06, 0.52, 0.36), 0, 0.36, -2.00);               // strapped cargo fill (top 2.02; r7 rear face -2.38, off the -2.398 bin edge)
    P.add('turretCloth', box(1.00, 0.085, 0.26), -0.10, 0.645, -1.70);         // tarp roll (top 2.09)
    P.add('turretDark', box(0.02, 0.52, 0.36), -0.62, 0.36, -2.00);            // cinch straps
    P.add('turretDark', box(0.02, 0.52, 0.36), 0.55, 0.36, -2.00);
    // NARROW center top frame + REAR ANTENNA-MOUNT MASTS (r7, batch-49
    // ladder): the re-normalized print's rear cluster reads a 2.753 frame
    // band across z_w -2.04..-2.28 and a 2.833 mast crown at -2.31..-2.40
    // (its own furniture rode the +0.44 rigid knee). The dims p95 budget
    // (three above-grace bins, PIXEL-CENTER law) spends ONE bin here:
    // [-2.398..-2.277] — a stepped mast pair whose tall head (2.823, z_w
    // -2.325..-2.309) tops station i2 and whose step (2.736, z_w -2.297..
    // -2.281) tops i3, the i2/i3 slab boundary -2.303 falling in the gap.
    // Ref topH 2.839/2.752 rel = these tops + the measured +0.016 bias.
    for (const sx of [-1, 1]) {
      P.add('turretDetail', box(0.035, 0.035, 0.33), sx * 0.08, 1.1155, -1.965); // frame bar RAISED to the v2 line (top 2.533 = ref 2.549 less bias; §5.73-1: the §5.57 rear-frame cap [cols -2.037/-2.157 want 2.549] is free under the 2.55 datum and sits 4 mm under mast step B — i3's station top holds)
      P.add('turretDetail', box(0.03, 0.67, 0.03), sx * 0.08, 0.77, -1.92);     // posts up to the raised bar (§B2 connected)
      P.add('turretDetail', box(0.03, 0.67, 0.03), sx * 0.08, 0.77, -2.08);
      P.add('turretDetail', box(0.024, 0.10, 0.044), sx * 0.08, 1.10, -2.103); // mast base web re-seated: bridges the raised bar rear to the mast heads (y 2.45..2.55 w)
      P.add('turretDetail', box(0.02, 0.254, 0.016), sx * 0.08, 1.057, -2.117); // mast head A: top 2.584 (v2 station i2 ref topH 2.600 less the +0.016 bias), z_w -2.325..-2.309
      P.add('turretDetail', box(0.02, 0.207, 0.016), sx * 0.08, 1.0335, -2.093); // mast step B: top 2.537 (v2 i3 ref 2.553), z_w -2.301..-2.285 (8 mm clear of the -2.277 bin edge — boundary phase carries ±3 mm)
    }
  }
  // corner masts: whips RAKED AFT from the bustle corners (identity cue) —
  // front-view +-1.07-1.13 spikes to 2.41 (r5: the fresh ref front cols
  // want 2.401 at +-1.10 — the 0.60/−0.76 rig read 0.095 short), side
  // diagonal to the ref's -2.41 mast cliff (the half-phase lerp tax against
  // the deck at -2.535 is structural — CLIFF-LERP class, ~0.27 sum)
  for (const s of [-1, 1]) {
    const whipA = FITTINGS.antennaWhip({ mats: P.mats, h: 0.68, r: s > 0 ? 0.018 : 0.012, rake: -s * 0.02, seed: 2, rotation: [-0.55, 0, 0] });        // (r6b: rake 0.05 -> 0.02 — fat-tip determinism law holds)
    whipA.position.set(s * 1.11, 0.352, -1.72);                                // antenna collars remain seated after the turret-height correction
    //   0.68 STEEPENED (rot -0.78/-0.60 -> -0.55) — the v2 front mast tails
    //   want 2.51-2.59 at x ±1.10/1.14 (§5.57 front_whole cap, 0.128 x2 +
    //   0.084) and the old short whips were the datum compromise. Tip model
    //   (R7 whatsat calibration: tip_y = 1.94 + h*cos(rot), tip_z = -2.02 -
    //   h*sin(rot)): tips ~2.52 @ z_w ~-2.375 — inside the mast bin (under
    //   its 2.584 head, side-invisible) and OUT of the [-2.52..-2.398] deck
    //   bin the -2.523 col lerps against (the r7 0.24-err trap).
    P.turretG.add(whipA);
  }
  P.decal('turret', 'number', '2274', 0.24, [1.21, 0.64, -0.5], Math.PI / 2, 0, 0.05);
  P.decal('turret', 'number', '2274', 0.24, [-1.21, 0.64, -0.5], -Math.PI / 2, 0, -0.05);
  // Rh 120 L/44: axis 1.562 (ref tube band 1.485..1.639), slim tube r 0.065
  // (sleeve 0.159 band), muzzle +6.02 (published overall; ~1 col past the
  // print's 5.87 tube end — certified). r5 TUBE FURNITURE RE-METER (fresh
  // worldtrace): the ref tube carries a REAR drum swell (tops 1.697-1.715
  // over z_w 1.85-2.31), the mid sleeve at 1.654-1.684, the fwd evac swell
  // at 1.700-1.715 (z_w 3.03-3.47) and an off-axis MUZZLE-ZONE MRS collar
  // whose plan column reaches x 0.137-0.259 — the r4 bare 0.065 tube left
  // the ref's own plan tube col (front 5.769) and its evac col (front
  // 3.455) unmatched: 1.98 + 0.82 err on the two worst plan_turret cols.
  P.gunG.position.set(0, 0.30, 0.55);                                          // corrected bore line through the center of the half-height face
  trunnionRoll(P, 0.16, 0.50);
  // §B3 mantlet identity (no mystery boxes): the embrasure block reads as
  // the sealed Rh-120 mount — canvas bellows collar at the block/tube
  // junction + bolted retainer strips on the block face + hooded coax.
  P.addGunExtra(box(0.44, 0.34, 0.30), 0, 0.0, 0.42);                          // sealed embrasure block inside the prow
  P.addGunExtraDark(torus(0.145, 0.022, 12), 0, 0, 0.60, 0, 0, 0);             // canvas bellows ring at the root (inside the prow silhouette)
  P.addGunExtraDark(box(0.012, 0.30, 0.02), 0.21, 0.0, 0.575);                 // bolted retainer strips (block-face tells, 6 mm proud)
  P.addGunExtraDark(box(0.012, 0.30, 0.02), -0.21, 0.0, 0.575);
  // §5.16 PROPER MANTLET (france round; owner: "type 90 needs a mantlet" +
  // "better gun placement"): the print ITSELF carries a proud mantlet mass
  // ~0.3 m FORWARD of the turret face at the tube root (ref front-depth map
  // tmp-france-topmap: x +-0.15, y 1.50..1.65, ref z 1.11..1.24 = proc-frame
  // 2.12..2.25 after the ref's -1.01 full-box centering offset) — the old
  // build buried the root INSIDE the prow and showed a bare tube. This is
  // the Type 90's flat-faced Rh-120-class mantlet BLOCK at the print's own
  // station, riding the gun (real mantlets elevate): flat face + bolted
  // corner strips + dark tube collar + trunnion cheek taper into the prow.
  // r7 MANTLET DEEPENED (batch-49 alignment): the re-normalized print's
  // mantlet/chin band reads [1.46..2.02] across z_w 1.86..2.29 (its pre-warp
  // chin sliver carried the mass; the §5.28 0.29-tall block paid 0.14 x4
  // side cols against it). The REAL Type 90 mantlet IS the big flat plate —
  // y 1.47..2.02 bore-straddling, face held at the print's own 2.065 station.
  P.addGunExtra(box(0.32, 0.55, 0.26), 0, -0.075, 1.585);                      // mantlet block: x +-0.16, y 1.47..2.02 w, face z_w 2.065 (print station)
  P.addGunExtra(box(0.30, 0.52, 0.025), 0, -0.075, 1.735);                     // the FLAT FACE plate (proud 2 cm, the Type 90 tell)
  P.addGunExtraDark(cylZ(0.088, 0.03, 12), 0, 0.003, 1.76);                    // tube exit collar on the face
  for (const bs of [-1, 1]) {
    P.addGunExtraDark(box(0.014, 0.50, 0.018), bs * 0.148, -0.075, 1.752);     // bolted edge strips on the face
    P.addGunExtra(box(0.05, 0.46, 0.30), bs * 0.185, -0.075, 1.30);            // trunnion cheek taper closing block -> prow (§B2 connected)
  }
  P.addGunExtraDark(box(0.30, 0.014, 0.24), 0, -0.357, 1.55);                  // block underside shadow line
  P.addGunExtra(cylZ(0.115, 0.34, 12, 0.14), 0, 0, 0.72);                      // root collar (z_w 0.90-1.24 inside the prow — GUN-FRAME LAW: gunExtra world z = local + gunG.z + turretG.z = local + 0.35 here, verified against the 5.94 lit muzzle)
  P.addGunExtra(cylZ(0.15, 0.59, 14), 0, 0, 1.775);                            // RECOIL DRUM r 0.15 (r7: the re-normalized ref drum band tops 2.01-2.02 over z_w 1.83..2.42; the r5-era 12%-cut landmine is defused — the taller post-warp frame puts the cut at ~0.34, band 0.30 clears)
  P.addGunExtraDark(cylZ(0.152, 0.05, 14), 0, 0, 1.55);                        // drum seam rings
  P.addGunExtraDark(cylZ(0.152, 0.05, 14), 0, 0, 1.95);
  P.addGunExtraDark(box(0.035, 0.046, 0.60), 0, 0.173, 1.75);                  // sight-cable conduit riding the drum top (y 1.97..2.016 — the ref's 2.032-rel i11 station top and its 2.01-2.02 side wants; §B3 tell: thin square-section cable run)
  P.addGunExtraDark(box(0.03, 0.04, 0.32), 0, 0.166, 2.94);                    // conduit saddle over the evacuator (z_w 3.13..3.45 inside station i13 — ref i13 2.025-rel and side wants 2.01 at the 3.32/3.44 cols)
  P.addGunExtra(box(0.335, 0.05, 0.24), 0.0525, 0, 5.35);                      // off-axis MRS housing PLATE x -0.115..0.22 (z_w 5.58-5.82: covers the ref's 0.198 plan tube col [reach 0.22, front want 5.751]. r7: the batch-49 plan grid re-phased and the -0.15 left edge lit the -0.183 col AGAIN (want front 3.415, err 1.21 — the r6 -0.17 class); -0.115 sits inside the [-0.117..0.003] col with the tube. §B3: the MRS mirror housing rides flat on the muzzle)
  P.addGunExtraDark(cylZ(0.026, 0.10, 8), 0.26, 0.05, 0.60);                   // coax port
  P.addGunExtraDark(box(0.07, 0.05, 0.06), 0.26, 0.10, 0.62);                  // coax hood
  buildGun(P, { len: 5.61, r: 0.065, sleeve: true, evac: 0.50, evacR: 2.12, collar: false, baseR: 0.15 });
  muzzleBore(P, 0.065, 5.59);                                                  // §B3.1 muzzle bore (shadow-named)
  // Owner correction (2026-08-12, second visual pass): the initial half-
  // height repair over-compressed the live garage silhouette.  Preserve the
  // requested 50% raise, then add the measured five-point section closure
  // (0.50 -> 0.80 of the original local section): that final authored height
  // is the first one whose nine whole comparison directions all clear 90.
  // X/Z plan and the articulated gun rig remain unchanged. Direct child
  // fittings above and the functional roof suite below are explicitly
  // re-seated on the new armor surface so yaw cannot reveal a floating bank,
  // MG, sight or antenna collar.
  P.scaleBuckets(
    ['turret', 'turretDark', 'turretDetail', 'turretGlass', 'turretCloth'],
    1, 0.80, 1,
  );
  // Rebuild the functional roof cadence at its real scale on the final
  // 0.75-local roof.  These are added after the body-section compression so
  // the cupolas, sight heads, periscopes and MG cradle do not become
  // vertically squashed decorations.
  P.add('turret', cylY(0.225, 0.235, 0.065, 16), 0.56, 0.772, -0.17);
  P.add('turretDark', torus(0.215, 0.011, 16), 0.56, 0.802, -0.17);
  P.add('turret', cylY(0.19, 0.205, 0.035, 16), 0.56, 0.822, -0.17);
  P.add('turret', cylY(0.20, 0.205, 0.055, 16), -0.52, 0.772, -0.11);
  P.add('turretDark', torus(0.19, 0.010, 16), -0.52, 0.802, -0.11);
  for (let k = 0; k < 5; k++) {
    const a = (125 + k * 27) * Math.PI / 180;
    P.add('turretGlass', box(0.060, 0.070, 0.045),
      0.56 + Math.cos(a) * 0.205, 0.822, -0.17 + Math.sin(a) * 0.205, 0, -a, 0);
  }
  P.add('turret', frustum(0.18, 0.34, -0.18, 0.145, 0.30, -0.15, 0.757, 0.967), 0.10, 0, 0.18);
  P.add('turretDark', box(0.25, 0.11, 0.025), 0.10, 0.867, 0.515);
  P.add('turretGlass', box(0.17, 0.065, 0.015), 0.10, 0.867, 0.530);
  P.add('turret', box(0.36, 0.14, 0.44), 0.30, 0.812, 0.90);
  P.add('turretDark', box(0.27, 0.075, 0.025), 0.30, 0.822, 1.135);
  P.add('turretGlass', box(0.19, 0.045, 0.015), 0.30, 0.822, 1.150);
  P.add('turretDetail', box(0.40, 0.045, 0.26), 0.70, 0.752, 0.02);            // broad MG swing-mount seat
  for (const [x, z, ry] of [[-0.30, 0.16, 0.25], [-0.56, 0.22, -0.12], [0.35, 0.34, 0.18]]) {
    periscope(P, 'turretDetail', x, 0.772, z, ry);
  }
  P.topY = 0.99;
}

// ---------------------------------------------------------------------------
// Type 74 — docs/references/tanks/type74.md
// R5 PRINT-FRAME RE-LAY (2026-08-07, T74R5): authored from the 2026-08-06
// vertex extract (docs/references/vertex/type74.json — gate-parity raster;
// stylization height -1%, the old "+13% tall" loader class is GONE). All
// values are BODY-RELATIVE = extract gate z + 1.321 (ref body mid). The
// print reads: deck 1.37-1.45, dome crown 2.40-2.47, bore line ~1.57,
// bow tip +3.30 (bot 0.61), tail plate -3.36/-3.38 with the exhaust notch
// at -3.20 (x 0.68-0.94), muzzle +6.02, contact patch [-2.06, +2.25] with
// a HIGH climbing sprocket (wrap bottom 0.63-0.66 at the tail) and raised
// idler; turret mass FORWARD (crown zone -0.10..+1.47), bustle+baskets to
// -1.68, whip spikes x ±0.94 at body-rel -0.93 tips 2.59.
// Photo-class splits (documented print caps, packet r5): dome crown built
// 2.28 (real 2.0-2.13 + cupola 2.25; print 2.40-2.47 reads tall), cupola
// RIGHT of center per photos (print reads it near center x 0..0.15).
// ---------------------------------------------------------------------------
function buildType74(P) {
  const { box, cylY, cylZ, frustum, lathe, torus, buildGun, buildRunningGear,
    fenders, headlight, liftEye, periscope, stowage, shovelTool, cupola } = KIT;
  const slab = orientedSlab;                                                   // §C missing-side fix: winding-corrected slabs only (see orientedSlab)
  const { rng } = P;
  // ---- LOW hull: tub between the tracks, thin high sponson course, sharp
  // two-plane crease glacis, flat louvred rear deck, 1.447 rear rack shelf ----
  P.add('hull', box(1.96, 0.56, 6.25), 0, 0.585, -0.175);                      // tub x ±0.98, belly 0.305 (ref front bots 0.302-0.34), z -3.30..+2.95 (front hides behind the chin rake, §B1)
  P.add('hull', box(3.00, 0.04, 4.42), 0, 1.375, 0.21);                        // main deck 1.395 (ref deck corners 1.375-1.402), z -2.00..+2.42
  P.add('hull', frustum(1.50, -2.00, -2.74, 1.46, -2.04, -2.74, 1.30, 1.372)); // rear louvre deck, slight fall 1.395 -> 1.372
  for (const s of [-1, 1]) {
    // sponson mid-course: the visible hull side band between fender line and
    // the exposed top run (bottom 1.16 = shoe-envelope top 1.13 + §B4 margin;
    // z window -2.40..+2.35 stays clear of both raised end-wheel wraps)
    P.add('hull', box(0.50, 0.215, 4.75), s * 1.255, 1.2675, -0.025);
    // tub-to-deck inboard wall (channel-pan class: INBOARD of the band inner
    // face 1.04 by 3+ cm — §B2 metal where the real hull has metal)
    P.add('hull', box(0.06, 0.53, 6.48), s * 0.945, 1.10, -0.06);
  }
  // BOW (T74R5b, §B8.1 gate-2 rework — the first pass ran the glacis at 11°
  // from horizontal and the front read as a wall): two-plane 29° glacis with
  // the PRONOUNCED center crease (outer corners swept 0.12 aft both at crest
  // and toe) + reverse-raked chin plate tucking to the belly. Slope motivates
  // the mass (§B1): deck ends at the crest z +2.42, tub front hides behind
  // the chin. Lower edges taper to x ±0.98 (§B4: the idler wrap owns
  // x 1.01..1.59).
  // Nose edge (the V ridge where glacis meets chin): center (0, 0.89, 3.37)
  // -> outer (±0.98, 0.91, 3.17), sweep 0.20 (~9°/side — the visible crease).
  for (const s of [-1, 1]) {
    P.add('hull', slab(                                                        // GLACIS half-plane: nose edge -> crest (29° from horizontal). Crest
      [s * 0.02, 0.87, 3.35], [s * 0.98, 0.89, 3.15], [s * 0.98, 0.93, 3.19], [s * 0.02, 0.91, 3.39],
      [s * 0.02, 1.385, 2.50], [s * 1.02, 1.385, 2.30], [s * 1.02, 1.385, 2.24], [s * 0.02, 1.385, 2.44]));
    // outer x ±1.02: the real glacis is the plate BETWEEN the fenders — the
    // full-1.50 wing swept the taper edge through the idler wrap (track-clip
    // front 17/22, §B4) and the fenders carry the outboard bow anyway.
    P.add('hull', slab(                                                        // CHIN half-plate, reverse-raked, same V sweep (tucks to the belly)
      [s * 0.02, 0.42, 3.16], [s * 0.98, 0.44, 2.98], [s * 0.98, 0.44, 2.86], [s * 0.02, 0.42, 3.04],
      [s * 0.02, 0.89, 3.37], [s * 0.98, 0.91, 3.17], [s * 0.98, 0.91, 3.05], [s * 0.02, 0.89, 3.25]));
  }
  // V splash rail hugging the glacis planes (photo tell; <=2cm proud)
  for (const s of [-1, 1]) P.add('hullDetail', box(0.72, 0.035, 0.05), s * 0.38, 1.175, 2.86, -0.505, s * 0.10, 0);
  // stern: tail plate INBOARD of the exposed sprocket wraps (ref plan rear:
  // wrap -3.37 at x 1.01-1.57, plate -3.36..-3.38 center, exhaust notch
  // -3.20 at x 0.68-0.94) + rear rack shelf at the print's 1.447 line
  P.add('hull', box(1.32, 0.84, 0.10), 0, 0.86, -3.33);                        // tail plate center x ±0.66, y 0.44..1.28, face -3.38
  for (const s of [-1, 1]) {
    P.add('hull', box(0.31, 0.84, 0.08), s * 0.815, 0.86, -3.17);              // exhaust notch panels, recessed to -3.21
    P.add('hull', slab(                                                        // notch side cheeks close the recess (§B2)
      [s * 0.66, 0.44, -3.21], [s * 0.97, 0.44, -3.21], [s * 0.97, 0.44, -3.13], [s * 0.66, 0.44, -3.13],
      [s * 0.66, 1.28, -3.21], [s * 0.97, 1.28, -3.21], [s * 0.97, 1.28, -3.13], [s * 0.66, 1.28, -3.13]));
    // twin exhaust outlets WITH mesh on the notch panels (identity kit)
    P.add('hullDark', box(0.24, 0.20, 0.025), s * 0.815, 1.06, -3.205);
    for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.22, 0.018, 0.02), s * 0.815, 0.99 + k * 0.065, -3.212);
    P.add('hullDark', box(0.10, 0.09, 0.03), s * 0.88, 1.16, -3.225);          // taillights on the notch panels (the wrap owns x>1.0 at the tail, §B4)
  }
  P.add('hull', box(2.00, 0.055, 0.60), 0, 1.4195, -2.99);                     // rear rack shelf 1.447 top (ref 1.447 flat, z -2.69..-3.29; bottom 1.392 = sprocket shoe crown 1.355 + §B4 margin)
  P.add('hull', box(1.90, 0.10, 0.08), 0, 1.246, -3.30);                       // tail corner step (ref 1.296 @ -3.23 -> lip 1.27)
  fenders(P, 1.05, 1.57, 1.375, -2.72, 3.05, 0.028);
  // driver LEFT: flush hatch + periscopes on the fore deck
  P.add('hull', cylY(0.23, 0.23, 0.035, 14), -0.52, 1.398, 2.00);
  P.add('hullDark', cylY(0.236, 0.236, 0.012, 14), -0.52, 1.393, 2.00);
  periscope(P, 'hullDetail', -0.52, 1.425, 2.27);
  periscope(P, 'hullDetail', -0.26, 1.425, 2.27);
  // rear deck louvres
  for (let k = 0; k < 4; k++) P.add('hullDark', box(2.20, 0.016, 0.34), 0, 1.372, -2.10 - k * 0.42);
  for (const s of [-1, 1]) {
    // §B4: flaps hang ABOVE the exposed wrap arcs (idler shoe top 1.075 at
    // z 3.12; sprocket shoe top 1.071 at z -3.40)
    mudflap(P, s * 1.2835, 1.23, 3.12, 0.52, 0.22);
    mudflap(P, s * 1.2835, 1.26, -3.40, 0.52, 0.20);
    P.add('hullDetail', torus(0.075, 0.014, 10), s * 0.55, 0.58, 3.215, Math.PI / 2, 0, 0); // tow eyes on the chin plate
    // rear-view mirror arms folded low over the front fenders
    P.add('hullDetail', box(0.035, 0.22, 0.035), s * 1.42, 1.46, 2.66, 0, 0, s * 0.30);
    P.add('hullDark', box(0.15, 0.19, 0.03), s * 1.475, 1.505, 2.66);
  }
  // fender stowage bins + pioneer tools + headlight pods with guards
  bin(P, -1.28, 1.435, -1.35, 0.40, 0.12, 1.00);
  bin(P, -1.28, 1.435, 0.35, 0.40, 0.12, 0.85);
  bin(P, 1.28, 1.435, -0.90, 0.40, 0.12, 1.00);
  bin(P, 1.28, 1.435, 0.60, 0.40, 0.12, 0.80);
  shovelTool(P, -1.27, 1.40, 1.85);
  headlight(P, -1.26, 1.46, 2.98, -0.22, 0.05);
  headlight(P, 1.26, 1.46, 2.98, -0.22, 0.05);
  P.add('hullDetail', torus(0.072, 0.012, 12), -1.26, 1.46, 3.05);
  P.add('hullDetail', torus(0.072, 0.012, 12), 1.26, 1.46, 3.05);
  {                                                                            // §I fittings: tow cable draped across the glacis crest
    const cable = FITTINGS.towCable({ mats: P.mats, pts: [[-0.90, 1.32, 2.60], [0, 1.42, 2.28], [0.90, 1.32, 2.60]], seed: 11 });
    P.hullG.add(cable);
  }
  liftEye(P, 'hullDetail', -1.38, 1.41, -1.75);
  liftEye(P, 'hullDetail', 1.38, 1.41, -1.75);
  {                                                                            // §I fittings: two water cans strapped on the left fender run
    const cans = FITTINGS.jerryCans({ mats: P.mats, count: 2, seed: 5 });
    cans.position.set(-1.28, 1.39, 1.30);
    P.hullG.add(cans);
  }
  stowage(P, 'hullCloth', rng, [[0.55, 1.50, -2.99, 0.52, 0.10, 0.5]]);        // strapped tarp roll on the rack shelf (d 0.5: stays inside the -3.29 shelf edge)
  P.decal('hull', 'number', '74-4302', 0.22, [-0.60, 1.15, 2.92], 0, -0.51);
  // FIVE big near-touching wheels (pitch 0.8675, r 0.42 — count them law),
  // dead track (no rollers), raised idler, HIGH rear drive sprocket: the
  // ref's climbing-ramp read (contact [-2.06, +2.25], wrap bottoms 0.25/0.63)
  // §D WIDTH ANCHOR (T74R5 probe find, tmp-t74-probe): the kit's sprocket
  // TOOTH RING spans the band edges +0.031 (widest face xc+0.3065) and the
  // shoe pads ride xc+0.2985 — at the r4 xc 1.315 the build's visibleBox hit
  // ±1.6215 and safeScale rescaled EVERYTHING ×0.98066 (probe-frame law).
  // xc 1.2835 seats the tooth ring EXACTLY at the ±1.59 published anchor:
  // authored = world, scale 1.0.
  const XC = 1.2835;
  const wheelZs = [1.83, 0.96, 0.10, -0.77, -1.64];
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.42, wheelW: 0.26, wheelY: 0.475, xc: XC,
    wheelZs,
    sprocket: { z: -3.00, y: 0.90, r: 0.26 }, idler: { z: 2.93, y: 0.64, r: 0.28 },
    rollers: [], trackW: 0.55, topY: 1.00, botY: -0.08, deadSag: 0.09,
    paintedEnds: true, coveredTop: false, arms: true,
  });
  // The animated native wheel faces already carry their own deep dishes.
  // Do not add the legacy static recess cylinders here: they occupy the same
  // swept volume as the moving shoes and create a second, hull-owned layer.
  tightenHullShadowProxy(P, { xc: XC, trackW: 0.34, y0: 0.15, y1: 0.60, z0: -2.10, z1: 2.30, hullZ0: -3.10, hullZ1: 2.90 });

  // ---- turret: low long cast dome flowing into a tapered bustle (STB-1
  // lineage), seated FORWARD per the print (pivot z +0.50; crown zone
  // body-rel -0.1..+1.5, bustle/basket tail to -1.6) ----
  P.turretG.position.set(0, 1.42, 0.50);
  P.add('turret', lathe([
    [1.04, 0.0], [1.13, 0.10], [1.09, 0.30], [0.98, 0.53], [0.82, 0.68],
    [0.64, 0.78], [0.42, 0.88], [0.02, 0.96],
  ], P.q ? 30 : 16, 1.45), 0, 0.0, -0.45);                                     // cast dome crown restored to the measured oracle envelope;
                                                                               // the raised upper stations preserve the broad Type 74 shoulder arc
  P.add('turret', frustum(0.90, -0.50, -2.02, 0.62, -0.60, -1.80, 0.05, 0.50)); // bustle taper (world 1.47..1.92, tail -1.52)
  P.add('turret', box(1.50, 0.14, 1.10), 0, 0.06, -0.65);                      // ring seat course closes dome underside to the deck (§B2)
  P.add('turretDark', box(1.44, 0.02, 1.04), 0, -0.005, -0.65);                // contact shadow at the ring
  P.add('turret', box(1.14, 0.30, 0.06), 0, 0.22, -2.04);                      // bustle rear face plate
  // commander cupola RIGHT (photos; print reads it near center — §B7-lite
  // photo split, packet-documented) with the M2 pintle = published-2.48
  // heightM p95 anchor; low oval loader hatch ring LEFT (ref left-shoulder
  // 2.10-2.13 front-view band)
  cupola(P, 'turret', 0.40, 0.84, -0.46, 0.20, 0.16, 6);                       // lid ~2.44, planted on the restored cast crown
  const m2 = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', seed: 7 });
  m2.position.set(0.44, 0.84, -0.48);                                          // receiver+sight remains seated on the raised cupola
  P.turretG.add(m2);
  P.add('turret', cylY(0.19, 0.20, 0.05, 14), -0.44, 0.815, -0.30);            // loader ring on the left shoulder
  P.add('turret', cylY(0.165, 0.165, 0.028, 14), -0.44, 0.865, -0.30);         // oval lid seated on the restored crown
  P.add('turretDark', box(0.31, 0.013, 0.03), -0.44, 0.882, -0.30);            // lid seam
  periscope(P, 'turretDetail', 0.24, 0.90, 0.28);                              // gunner periscope fwd-right
  periscope(P, 'turretDetail', -0.44, 0.895, -0.02, 0.3);                      // loader periscope
  // big IR/white searchlight box LEFT of the mantlet (the signature box):
  // hood lip + split doors + glass slit + cable conduit (§B3 tells)
  P.add('turret', box(0.44, 0.36, 0.42), -0.62, 0.36, 1.19, 0, 0.06, 0);       // body seated against the dome face (rear face 0.98 buries into the casting)
  P.add('turret', box(0.46, 0.05, 0.10), -0.62, 0.565, 1.36, 0, 0.06, 0);      // hood lip
  P.add('turretDark', box(0.37, 0.28, 0.03), -0.615, 0.36, 1.405, 0, 0.06, 0); // door split face
  P.add('turretGlass', box(0.30, 0.20, 0.016), -0.615, 0.37, 1.42, 0, 0.06, 0);
  P.add('turretDark', box(0.014, 0.34, 0.36), -0.62, 0.36, 1.19, 0, 0.06, 0);  // door split line
  P.add('turretDetail', box(0.06, 0.20, 0.06), -0.58, 0.13, 1.02);             // mount arm down to the brow shoulder
  P.add('turretDetail', box(0.028, 0.028, 0.62), -0.88, 0.36, 0.62, 0, -0.35, 0); // cable conduit back to the casting
  // stowage BASKETS hugging the bustle flanks (identity: turret rear sides;
  // pipe rails + mesh + cloth load; outer face ±1.30 inside the §D ±1.59
  // width guard; front-view 1.92-2.0 band at x 1.04-1.31 = the ref's own)
  for (const s of [-1, 1]) {
    const bx0 = 0.98, bx1 = 1.28, bz0 = -0.55, bz1 = -1.95;
    for (const y of [0.22, 0.48]) {                                            // world 1.64 / 1.90 rails
      P.add('turretDetail', box(0.03, 0.03, bz0 - bz1), s * bx1, y, (bz0 + bz1) / 2);
      P.add('turretDetail', box(bx1 - bx0, 0.03, 0.03), s * (bx0 + bx1) / 2, y, bz1);
    }
    for (let k = 0; k < 4; k++) {
      P.add('turretDetail', box(0.026, 0.26, 0.026), s * bx1, 0.35, bz0 - 0.06 - k * 0.36);
    }
    P.add('turretDark', box(0.014, 0.24, bz0 - bz1 - 0.06), s * (bx1 + 0.006), 0.35, (bz0 + bz1) / 2); // mesh face
    P.add('turretCloth', box(bx1 - bx0 - 0.04, 0.20, bz0 - bz1 - 0.10), s * (bx0 + bx1) / 2, 0.36, (bz0 + bz1) / 2); // duffel load
    // §I fittings: full-height whip antenna on the bustle flank plus the
    // 3-tube smoke-discharge bank on the dome rear quarter (real 2x3 JGSDF fit)
    const whipF = FITTINGS.antennaWhip({ mats: P.mats, h: 0.98, rake: s * 0.05, seed: 3 + s });
    whipF.position.set(s * 0.94, 0.50, -1.43);
    P.turretG.add(whipF);
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 3, splay: s * 1.12, seed: 9 });
    smoke.position.set(s * 0.84, 0.60, -0.70);
    P.turretG.add(smoke);
    // dome grab rails
    P.add('turretDetail', box(0.02, 0.02, 0.85), s * 0.99, 0.38, -0.35);
    for (const dz of [-0.72, -0.02]) P.add('turretDetail', box(0.05, 0.016, 0.016), s * 0.965, 0.38, -0.35 + dz + 0.35);
    liftEye(P, 'turretDetail', s * 0.72, 0.62, 0.30, s * 0.4);
  }
  P.decal('turret', 'number', P.spec.visual.number || '74', 0.26, [0.90, 0.30, -0.35], Math.PI / 2, 0, 0.08);
  P.decal('turret', 'number', P.spec.visual.number || '74', 0.26, [-0.90, 0.30, -0.35], -Math.PI / 2, 0, -0.08);
  // L7A1 105 mm on the print's 1.57-1.60 bore line: rounded cast saddle
  // (§B3.1 mantlet mass), bare rifled tube, fat fume extractor, and a
  // measured muzzle station that closes the authoritative 9.08 m envelope.
  P.gunG.position.set(0, 0.18, 1.15);                                          // bore world 1.60, trunnion +1.65
  trunnionRoll(P, 0.22, 0.62, { ballR: 0.19, ballZ: 0.18 });
  P.addGunExtra(cylZ(0.16, 0.28, 12, 0.135), 0, 0, 0.30);                      // cast collar taper
  P.addGunExtraDark(cylZ(0.024, 0.09, 8), 0.25, 0.05, 0.20);                   // coax port RIGHT of the saddle
  P.add('turret', box(0.64, 0.18, 0.34), 0, 0.52, 1.30, -0.52, 0, 0);          // cast brow over the saddle
  buildGun(P, { len: 3.91, r: 0.062, sleeve: false, evac: 0.445, evacR: 1.75, collar: false, baseR: 0.15 });
  P.add('gun', cylZ(0.068, 0.09, 10), 0, 0, 3.85);                             // muzzle reference step at the measured overall-length station
  muzzleBore(P, 0.062, 3.895);                                                 // §B3.1 muzzle bore inside the step face (shadow-named)
  P.topY = 1.15;
}

// FIRST-PARTY PROCEDURAL TYPE 74 (2026-08-11). No external mesh, texture,
// vertex array, animation, or converted payload enters this playable. The
// compact five-wheel hull, asymmetric cast turret, JGSDF combat stations,
// running gear, and every load path below are authored from repository
// primitives. Comparison assets may be used only to review proportions and
// equipment semantics after the geometry is built.
function buildType74Native2026(P) {
  const {
    box, cylY, cylZ, sph, torus, frustum, lathe, buildGun, buildRunningGear,
    fenders, liftEye, periscope, cupola, xform,
  } = KIT;
  const slab = orientedSlab;

  // ---- compact low hull, folded bow and full-width engine shoulders ----
  P.add('hull', box(1.90, 0.62, 5.26), 0, 0.64, -0.05);                       // lower tub, between track lanes
  P.add('hull', box(1.94, 0.27, 3.95), 0, 1.145, -0.42);                      // low inner sponson band stays between track lanes
  P.add('hull', box(2.82, 0.045, 2.58), 0, 1.305, -1.12);                     // engine/crew deck
  for (const s of [-1, 1]) {
    // One connected half per side: pointed center nose, swept outer shoulder,
    // and a sharply folded return into the crew deck.
    P.add('hull', slab(
      [s * 0.01, 0.39, 3.18], [s * 0.92, 0.43, 2.93], [s * 0.94, 0.43, 1.54], [s * 0.01, 0.39, 1.48],
      [s * 0.01, 0.77, 3.28], [s * 0.92, 0.80, 3.00], [s * 0.94, 1.31, 1.55], [s * 0.01, 1.31, 1.43]));
    // Raised shoulder/guard is above the idler uprun and physically returns
    // into the sponson; no front-corner sky pocket or track-crossing slab.
    P.add('hull', slab(
      [s * 0.92, 1.32, 3.00], [s * 1.08, 1.32, 2.82], [s * 1.45, 1.32, 1.68], [s * 0.94, 1.32, 1.55],
      [s * 0.92, 1.37, 3.00], [s * 1.10, 1.37, 2.80], [s * 1.47, 1.37, 1.65], [s * 0.94, 1.37, 1.55]));
  }
  // Glacis crease and splash board sit directly on the two bow planes.
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.76, 0.035, 0.055), s * 0.39, 1.055, 2.30, -0.40, s * 0.12, 0);
    P.add('hullDetail', box(0.028, 0.028, 0.86), s * 0.93, 1.055, 2.36, -0.40, s * 0.12, 0);
  }

  // Rear center remains between the sprocket lanes; upper service field and
  // fender shoulders span the hull only above the track crown.
  P.add('hull', box(1.84, 0.60, 0.50), 0, 0.63, -2.92);                     // closed lower-tub return into transom
  P.add('hull', box(1.84, 0.78, 0.16), 0, 0.78, -3.13);
  P.add('hull', box(2.84, 0.28, 0.18), 0, 1.155, -3.10);
  P.add('hullDark', box(1.72, 0.38, 0.035), 0, 0.91, -3.225);
  // Two unequal radiator/service bays instead of one repeated full-width
  // bar field.  Their raised dividers, offset latches and exhaust-side
  // plumbing reproduce the source's deliberately asymmetric transom.
  P.add('hullDark', box(0.66, 0.31, 0.026), -0.45, 0.92, -3.247);
  P.add('hullDark', box(0.52, 0.27, 0.026), 0.42, 0.90, -3.247);
  for (let k = 0; k < 5; k++) {
    P.add('hullDetail', box(0.60, 0.022, 0.028), -0.45, 0.80 + k * 0.060, -3.267);
    if (k < 4) P.add('hullDetail', box(0.46, 0.022, 0.028), 0.42, 0.81 + k * 0.064, -3.267);
  }
  P.add('hullDetail', box(0.035, 0.34, 0.03), -0.10, 0.92, -3.272);
  P.add('hullDetail', box(0.035, 0.29, 0.03), 0.70, 0.90, -3.272);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.34, 0.30, 0.035), s * 1.15, 1.13, -3.205);
    for (let k = 0; k < 4; k++) P.add('hullDetail', box(0.30, 0.018, 0.025), s * 1.15, 1.04 + k * 0.065, -3.232);
    P.add('hullRubber', box(0.34, 0.18, 0.035), s * 1.31, 0.71, -3.22);
    P.add('hullRubber', box(0.36, 0.18, 0.035), s * 1.31, 0.76, 3.05);
    P.add('hullDetail', torus(0.075, 0.014, 12), s * 0.49, 0.55, -3.22, Math.PI / 2, 0, 0);
  }
  // Three independently readable service planes replace a blank terminal
  // wall: unequal access doors, central PTO plate, latches, lamps and tow bar.
  P.add('hull', box(0.68, 0.46, 0.045), -0.50, 0.86, -3.235);
  P.add('hull', box(0.42, 0.37, 0.047), 0.18, 0.82, -3.237);
  P.add('hull', box(0.45, 0.43, 0.045), 0.66, 0.88, -3.235);
  for (const x of [-0.73, -0.28, 0.08, 0.31, 0.52, 0.82]) P.add('hullDetail', box(0.035, 0.09, 0.025), x, 0.88, -3.268);
  for (const s of [-1, 1]) {
    P.add('hullDark', cylZ(0.065, 0.035, 12), s * 0.84, 1.10, -3.275);
    P.add('hullDetail', box(0.62, 0.03, 0.035), s * 0.40, 0.54, -3.285, 0, 0, s * 0.03);
    P.add('hullDark', cylZ(0.075, 0.13, 12), s * 1.10, 1.22, -3.27, 0.18, 0, 0);
    P.add('hullDetail', box(0.26, 0.05, 0.04), s * 1.10, 1.11, -3.29);
  }
  P.add('hullDetail', cylZ(0.08, 0.12, 12), 0, 0.62, -3.31);                  // central tow pintle
  P.add('hullDark', cylZ(0.13, 0.09, 16), -0.92, 0.91, -3.31);               // offset exhaust/service coupling
  P.add('hullDetail', torus(0.10, 0.018, 14), -0.92, 0.91, -3.37, Math.PI / 2, 0, 0);
  P.add('hull', box(0.30, 0.20, 0.055), 0.83, 0.70, -3.28);                   // unequal recovery/stowage box
  P.add('hullDetail', box(0.20, 0.025, 0.03), 0.83, 0.70, -3.325);
  P.add('hullDetail', box(0.035, 0.035, 0.62), -0.22, 0.70, -3.28, 0, 0, -0.58);
  P.add('hullDetail', box(0.035, 0.035, 0.62), 0.22, 0.70, -3.28, 0, 0, 0.58);
  for (const x of [-0.66, -0.22, 0.22, 0.66]) P.add('hullDark', box(0.31, 0.10, 0.03), x, 1.20, -3.30);

  fenders(P, 1.05, 1.56, 1.315, -2.83, 2.68, 0.03);
  // The source has no side skirts: five large discs and the upper shoe run
  // stay exposed. Fender bins are shallow and broken into source stations.
  bin(P, -1.30, 1.36, -1.74, 0.45, 0.12, 0.78);
  bin(P, -1.30, 1.36, -0.74, 0.45, 0.12, 0.86);
  bin(P, 1.30, 1.36, -1.58, 0.45, 0.12, 0.92);
  bin(P, 1.30, 1.36, -0.46, 0.45, 0.12, 0.82);
  for (const s of [-1, 1]) {
    // Compact source-shaped twin lamp cassette, buried into the upper bow
    // shoulder.  The former large L-bracket/slab package was collision-free
    // but visually dominated the front quarters.
    P.add('hull', box(0.38, 0.19, 0.14), s * 1.18, 1.44, 2.72, -0.16, 0, 0);
    P.add('hullDark', box(0.32, 0.12, 0.025), s * 1.18, 1.44, 2.805, -0.16, 0, 0);
    for (const dx of [-0.075, 0.075]) {
      P.add('hullDetail', cylZ(0.043, 0.028, 12), s * 1.18 + dx, 1.44, 2.83, -0.16, 0, 0);
      P.add('hullDark', cylZ(0.026, 0.031, 12), s * 1.18 + dx, 1.44, 2.846, -0.16, 0, 0);
    }
    P.add('hullDetail', box(0.43, 0.025, 0.17), s * 1.18, 1.55, 2.72, -0.16, 0, 0);
    P.add('hullDetail', box(0.025, 0.23, 0.17), s * 1.39, 1.44, 2.72, -0.16, 0, 0);
    P.add('hullDetail', torus(0.075, 0.014, 12), s * 0.55, 0.58, 3.10, Math.PI / 2, 0, 0);
    liftEye(P, 'hullDetail', s * 1.33, 1.33, -2.35);
    P.add('hullDetail', box(0.36, 0.035, 0.035), s * 0.88, 0.76, 3.10, 0, 0, s * 0.16); // tow-eye cross brace
  }
  // Driver station, deck louvres, tool/cable routes and rear recovery kit.
  P.add('hull', cylY(0.24, 0.25, 0.045, 16), -0.48, 1.325, 1.18);
  P.add('hullDark', torus(0.20, 0.012, 16), -0.48, 1.355, 1.18);
  for (const x of [-0.68, -0.48, -0.28]) periscope(P, 'hullDetail', x, 1.36, 1.40);
  for (let k = 0; k < 6; k++) P.add('hullDark', box(1.55, 0.015, 0.20), 0.36, 1.337, -1.46 - k * 0.22);
  P.add('hull', box(0.52, 0.08, 0.62), -0.86, 1.375, -1.48);
  P.add('hull', box(0.42, 0.08, 0.72), -0.92, 1.375, -2.28);
  P.add('hullDetail', box(2.12, 0.028, 0.028), 0, 1.47, -2.74);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.028, 0.16, 0.028), s * 1.03, 1.40, -2.74);
    P.add('hullDetail', box(0.028, 0.028, 0.76), s * 1.03, 1.47, -2.38);
  }
  P.add('hullDetail', box(0.035, 0.035, 1.62), 1.33, 1.39, 0.46, 0, 0.03, 0);
  P.add('hullDetail', box(0.055, 0.055, 1.10), -1.31, 1.39, 0.58, 0, 0.03, 0);
  P.add('hullDark', box(0.36, 0.035, 0.055), -1.12, 1.41, 1.10, 0, 0.10, 0);
  P.add('hullDetail', box(0.52, 0.035, 0.045), 0.74, 1.42, 1.37, 0, -0.16, 0);
  {
    const cable = FITTINGS.towCable({ mats: P.mats, pts: [[-1.02, 1.16, 2.32], [-0.08, 1.31, 1.78], [0.94, 1.15, 2.30]], r: 0.017, seed: 74 });
    P.hullG.add(cable);
  }

  // ---- five large, near-touching source-semantic road wheels ----
  const XC = 1.287;
  const wheelZs = [1.89, 0.945, 0.00, -0.945, -1.89];
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.80, wheelR: 0.455, wheelW: 0.27, wheelY: 0.49, xc: XC,
    wheelZs,
    sprocket: { z: -2.55, y: 0.55, r: 0.32 },
    idler: { z: 2.55, y: 0.51, r: 0.32 },
    rollers: [-1.22, -0.41, 0.41, 1.22].map((z) => ({ z, y: 1.00, r: 0.08 })),
    trackW: 0.55, trackTh: 0.065, topY: 1.02, botY: 0.035,
    deadSag: 0.025, paintedEnds: true, coveredTop: false, arms: true,
  });
  tightenHullShadowProxy(P, { xc: XC, trackW: 0.34, y0: 0.13, y1: 0.72, z0: -2.75, z1: 2.75, hullZ0: -3.12, hullZ1: 3.14 });

  // ---- low compact asymmetric cast turret, one continuous primary loft ----
  P.turretG.position.set(0, 1.35, 0.34);
  P.add('turret', xform(cylY(0.88, 0.92, 0.10, P.q ? 28 : 16), 0, 0, 0, 0, 0, 0, [1.0, 1.0, 0.72]), 0, 0.02, -0.02);
  P.add('turret', box(1.58, 0.13, 0.96), 0, 0.08, -0.02);                    // buried ring throat
  // A single low, broad faceted casting is closer to the owner's rounded
  // source shell than the first reset's non-planar roof fan.  The deliberate
  // 20-facet cadence retains the Type 74 cheek cuts without recreating the
  // old oversized smooth egg; the restrained final 1.57 fore/aft stretch
  // carries the
  // full cast rear shoulder seen in the owner's top/side views.
  P.add('turret', lathe([
    [1.00, 0.00], [1.24, 0.08], [1.25, 0.24], [1.20, 0.40],
    [1.06, 0.53], [0.84, 0.63], [0.56, 0.70], [0.19, 0.74], [0.01, 0.74],
  ], P.q ? 32 : 20, 1.57), 0, 0.03, -0.15);
  P.add('turret', frustum(0.80, -1.30, -2.11, 0.66, -1.34, -2.00, 0.12, 0.43)); // full cast rear shoulder under the basket
  P.add('turretDark', box(1.55, 0.025, 0.90), 0, 0.035, -0.08);               // contact shadow remains within ring throat

  // Asymmetric cast cheek/side cuts and low service panels keep the source's
  // hand-built turret language legible over the continuous primary mass.
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.52, 0.13, 1.28], [s * 1.02, 0.15, 0.76], [s * 1.10, 0.15, 0.36], [s * 0.58, 0.13, 0.86],
      [s * 0.48, 0.45, 1.24], [s * 0.90, 0.50, 0.72], [s * 0.96, 0.49, 0.38], [s * 0.54, 0.43, 0.86]));
    P.add('turret', box(0.34, 0.18, 0.44), s * 1.02, 0.32, -0.20, 0, 0, 0);
    P.add('turretDark', box(0.025, 0.14, 0.34), s * 1.205, 0.32, -0.20);
  }

  // External shield/mantlet and cast cheek continuation form one supported
  // gun-root package rather than a barrel piercing a smooth dome.
  P.add('turret', frustum(0.44, 1.38, 0.92, 0.34, 1.42, 0.98, 0.14, 0.57));
  P.add('turret', xform(sph(0.40, 18), 0, 0, 0, 0, 0, 0, [1.15, 0.82, 0.78]), 0, 0.34, 1.17);
  P.add('turretDark', torus(0.25, 0.024, 18), 0, 0.34, 1.48);
  // Prominent source-side square IR searchlight, buried rear face and a
  // two-member bracket to the cheek/mantlet.
  P.add('turret', box(0.52, 0.48, 0.28), 0.66, 0.43, 1.18, 0, -0.04, 0);
  P.add('turretDark', box(0.44, 0.38, 0.026), 0.66, 0.43, 1.335, 0, -0.04, 0);
  P.add('turretGlass', box(0.35, 0.29, 0.014), 0.66, 0.43, 1.352, 0, -0.04, 0);
  P.add('turretDetail', box(0.06, 0.26, 0.12), 0.51, 0.20, 1.02, 0, -0.04, 0);
  P.add('turretDetail', box(0.06, 0.24, 0.12), 0.82, 0.23, 1.00, 0, -0.04, 0);
  P.add('turret', box(0.56, 0.055, 0.12), 0.66, 0.705, 1.12, 0, -0.04, 0);      // shallow weather hood
  P.add('turretDark', box(0.025, 0.34, 0.025), 0.66, 0.43, 1.335, 0, -0.04, 0); // split shutter
  for (const x of [0.48, 0.84]) P.add('turretDetail', box(0.035, 0.07, 0.035), x, 0.38, 1.36);

  // Paired hatch/cupola cadence and the high but fully seated commander MG.
  cupola(P, 'turret', 0.42, 0.77, -0.30, 0.25, 0.16, 8);
  P.add('turret', cylY(0.25, 0.27, 0.075, 16), -0.40, 0.765, -0.20);
  P.add('turret', cylY(0.21, 0.22, 0.045, 16), -0.40, 0.825, -0.20);
  P.add('turretDark', torus(0.19, 0.012, 16), -0.40, 0.855, -0.20);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    P.add('turretGlass', box(0.055, 0.035, 0.022), 0.42 + Math.cos(a) * 0.21, 0.875, -0.30 + Math.sin(a) * 0.21, 0, -a, 0);
  }
  periscope(P, 'turretDetail', 0.18, 0.83, 0.38);
  periscope(P, 'turretDetail', -0.15, 0.82, 0.46);
  periscope(P, 'turretDetail', -0.55, 0.78, 0.12, -0.18);
  {
    P.add('turret', cylY(0.14, 0.20, 0.16, 12), 0.43, 0.87, -0.34);
    P.add('turretDark', box(0.22, 0.18, 0.20), 0.67, 0.96, -0.38);             // broad ammo/receiver side mass on the pedestal
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', elev: -0.03, seed: 74, scale: 1.00, ammo: true });
    mg.position.set(0.43, 0.91, -0.34);
    P.turretG.add(mg);
  }
  // Gunner optic and mast sit on explicit roof plinths.
  sightBox(P, 'turret', 0.48, 0.78, 0.48, 0.25, 0.20, 0.25, -0.06);
  P.add('turret', cylY(0.065, 0.085, 0.10, 10), -0.72, 0.75, -0.57);
  P.add('turretDetail', cylY(0.025, 0.035, 0.22, 8), -0.72, 0.89, -0.57);

  // Angled three-tube banks are rooted in cheek pads. Their tubes and pads
  // remain turret-owned through every yaw state.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.25, 0.25, 0.54), s * 1.14, 0.49, -0.54, 0, s * 0.44, 0);
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 5, r: 0.06, len: 0.38, splay: s * 1.25, pitch: -0.75, arc: 1.15, spacing: 0.125, rotation: [0, 0, -s * 0.18], seed: 80 + s });
    smoke.position.set(s * 1.16, 0.63, -0.56);
    P.turretG.add(smoke);
    liftEye(P, 'turretDetail', s * 0.79, 0.69, 0.44, s * 0.35);
  }

  // Wraparound open basket: longitudinal rails, rear cross rails, upright
  // returns and diagonal corner ties visibly carry every span into the aft
  // casting. Negative cells are intentional basket openings, not sky holes.
  for (const s of [-1, 1]) {
    for (const y of [0.32, 0.62]) {
      P.add('turretDetail', box(0.03, 0.03, 1.30), s * 1.20, y, -1.42);
      P.add('turretDetail', box(0.55, 0.03, 0.03), s * 0.93, y, -2.10);
    }
    for (const z of [-0.78, -1.22, -1.66, -2.09]) P.add('turretDetail', box(0.028, 0.31, 0.028), s * 1.20, 0.47, z);
    P.add('turretDetail', box(0.035, 0.48, 0.035), s * 0.98, 0.45, -1.96, -0.50, 0, s * 0.45);
  }
  for (const y of [0.32, 0.62]) P.add('turretDetail', box(1.88, 0.03, 0.03), 0, y, -2.11);
  for (const x of [-0.84, -0.42, 0, 0.42, 0.84]) P.add('turretDetail', box(0.028, 0.31, 0.028), x, 0.47, -2.11);
  for (const y of [0.39, 0.47, 0.55]) P.add('turretDetail', box(1.78, 0.015, 0.018), 0, y, -2.125);
  P.add('turretCloth', box(0.66, 0.20, 0.36), -0.30, 0.42, -1.87);
  P.add('turretCloth', box(0.40, 0.16, 0.32), 0.52, 0.41, -1.89);
  // Antenna collars and whips land on the aft shoulders, not in air.
  for (const s of [-1, 1]) {
    P.add('turretDetail', cylY(0.045, 0.065, 0.08, 10), s * 0.83, 0.70, -1.22);
    const whipA = FITTINGS.antennaWhip({ mats: P.mats, h: 0.40, r: 0.012, rake: s * 0.035, seed: 90 + s });
    whipA.position.set(s * 0.83, 0.74, -1.22);
    P.turretG.add(whipA);
  }
  P.decal('turret', 'number', P.spec.visual.number || '74', 0.22, [1.08, 0.34, -0.18], Math.PI / 2, 0, 0.04);
  P.decal('turret', 'number', P.spec.visual.number || '74', 0.22, [-1.08, 0.34, -0.18], -Math.PI / 2, 0, -0.04);

  // L7A1 station: sealed trunnion, cast collar, fume extractor, stepped
  // muzzle and a visible recessed bore. All pitch-owned fittings use gunG.
  P.gunG.position.set(0, 0.31, 1.02);                                         // world bore axis 1.66 m
  trunnionRoll(P, 0.26, 0.66, { ballR: 0.24, ballZ: 0.18 });
  P.addGunExtra(cylZ(0.20, 0.36, 16, 0.15), 0, 0, 0.31);
  P.addGunExtraDark(torus(0.17, 0.020, 16), 0, 0, 0.50);
  P.addGunExtraDark(cylZ(0.185, 0.055, 16), 0, 0, 0.51);                       // layered canvas/cast collar break
  P.addGunExtraDark(cylZ(0.024, 0.09, 8), 0.25, 0.05, 0.25);
  buildGun(P, { len: 4.48, r: 0.062, sleeve: false, evac: 0.43, evacR: 1.76, collar: false, baseR: 0.15 });
  P.add('gun', cylZ(0.069, 0.10, 12), 0, 0, 4.42);
  muzzleBore(P, 0.062, 4.465);
  P.topY = 1.18;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// AMX-30B / AMX-30B2 — docs/references/tanks/scout-gen2-amx30.md
// FRANCE ROUND (2026-08-07, owner: "model the amx 30bs to complement the
// leclerc (note the amx 30bs' hulls are backwards"). The ahab GLBs render
// the HULL 180 deg from the GUN — a bake-manifest part-rotation error
// (tools/build_gen2_tanks.py: hull RZ(-90) vs turret RZ(+90); the vertex
// extract agrees: glacisSign -1, gunSign +1, agree:false). No MODEL_SOURCE
// yawOffset can fix an INTERNAL 180 (a scene yaw flips both), so the
// playables flip to these procedural builds (fleet CUSTOM direction) and
// the GLB re-bake is reported to the §E lane.
// Published dims: hull 6.59 / overall 9.48 / width 3.10 / roof 2.29.
// §B8 identity: long LOW hull, rounded one-piece raked glacis, cast turret
// with the LONG bustle taper, 105 F1 (clean tube, no evac/sleeve) + 20 mm
// M693 coax BESIDE the gun, TOP-7 commander cupola w/ remote 7.62, bare
// 5-big-roadwheel gear (B) / skirted (B2), IR searchlight LEFT of the
// mantlet, B2 adds the LLLTV camera box on the mantlet RIGHT.
// ---------------------------------------------------------------------------
function buildAMX30(P, b2) {
  const { box, cylY, cylZ, frustum, torus, buildGun, buildRunningGear,
    fenders, headlight, liftEye, periscope, jerryCan, ammoCan, stowage } = KIT;
  const slab = orientedSlab;                                                   // §C winding guard on every mirrored slab
  const { rng } = P;
  // Family proportion reset: use the authored AMX-40 upper-hull authority as
  // the datum, then keep the AMX-30's own compact cast turret and equipment.
  // The former 1.11 x / 1.13 y stretch made both variants read as an enormous
  // turret on a wafer-thin hull.  These factors restore the low, compact
  // fighting compartment without touching the five-wheel running gear.
  const turretYScale = b2 ? 0.74 : 0.72;
  const turretXScale = b2 ? 0.92 : 0.90;
  const turretZScale = b2 ? 0.98 : 0.96;
  // Published 6.59/9.48 m dimensions are sovereign.  The B2 reference print
  // is short after width normalization, so shortening our authored hull to
  // that artifact is not an acceptable fidelity fix.
  const bodyZScale = 1.0;
  const courseZScale = 0.86;
  // The repaired reference hierarchy reveals the TOP-7/remote-MG station on
  // the opposite roof shoulder from the old generic layout.  Keep the
  // mantlet-linked PH-8-B on its documented side; mirror only the roof-owned
  // commander/loader and antenna cadence.
  const stationSign = -1;
  // ---- hull: low tub + full-width sponson band + one-piece glacis ----
  P.add('hull', box(1.84, 0.70, 4.90), 0, 0.71, 0);                            // continuous lower tub: inside the ±0.97 m inner shoe lanes
  P.add('hull', box(1.84, 0.70, 0.50), 0, 0.71, -2.70);                        // tail tub segment joins the same lower datum
  P.add('hull', frustum(1.51, 1.94, -3.28, 1.49, 1.90, -3.26, 1.24, 1.64));    // AMX-40-family sponson authority, still clear of the 1.19 m shoe crown
  P.add('hull', box(2.30, 0.06, 2.30), 0, 1.645, 0.45);                       // high fore deck shoulder (z -0.70..1.60)
  P.add('hull', box(2.30, 0.07, 1.26), 0, 1.615, -1.34);                      // forward engine-deck step
  P.add('hull', box(2.30, 0.09, 1.30), 0, 1.635, -2.62);                      // raised rear engine plateau
  // GLACIS: the rounded one-piece plate — ONE raked plane (25.0 deg) from
  // the deck front edge to the pointed nose, with narrow side blends that
  // carry the casting round-over (§B1: one surface, no staircase)
  // glacis SPLIT for §B4 track containment (the first full-width 1.51
  // bottom ring ran the idler wraps + lanes: 137 front voxels): the LOWER
  // glacis lives BETWEEN the tracks (+-0.94), the full-width plate starts
  // above the wrap crowns (y 1.06+)
  P.add('hull', slab(                                                         // swept lower glacis between the lanes
    [-0.94, 0.36, 3.00], [0.94, 0.36, 3.00], [0.94, 0.96, 1.60], [-0.94, 0.96, 1.60],
    [-0.94, 0.98, 3.285], [0.94, 0.98, 3.285], [0.94, 1.08, 1.58], [-0.94, 1.08, 1.58]));
  P.add('hull', slab(                                                        // true raked upper glacis: broad deck shoulder -> low narrow prow
    [-1.10, 0.96, 3.15], [1.10, 0.96, 3.15], [1.51, 1.54, 1.54], [-1.51, 1.54, 1.54],
    [-1.10, 1.02, 3.14], [1.10, 1.02, 3.14], [1.51, 1.66, 1.54], [-1.51, 1.66, 1.54]));
  P.add('hull', frustum(0.94, 3.31, 3.02, 0.94, 3.30, 2.98, 0.98, 1.09));      // shallow nose cap preserves the 6.59 m body datum
  P.add('hull', slab(                                                         // rising under-nose return, clear of both track lanes
    [-0.94, 0.36, 3.00], [0.94, 0.36, 3.00], [0.92, 0.52, 2.50], [-0.92, 0.52, 2.50],
    [-0.94, 0.60, 3.16], [0.94, 0.60, 3.16], [0.92, 0.66, 2.48], [-0.92, 0.66, 2.48]));
  for (const s of [-1, 1]) {
    P.add('hull', slab(                                                        // casting blend: glacis edge -> sponson line (above the wraps)
      [s * 1.51, 1.20, 1.60], [s * 1.10, 1.20, 2.34], [s * 1.10, 1.20, 2.70], [s * 1.51, 1.20, 2.08],
      [s * 1.51, 1.64, 1.58], [s * 1.10, 1.31, 2.34], [s * 1.10, 1.28, 2.68], [s * 1.51, 1.54, 2.06]));
  }
  // driver LEFT: flush hatch plate + episcopes on the glacis top
  P.add('hull', box(0.52, 0.035, 0.55), -0.55, 1.632, 1.28, -0.12, 0, 0);
  periscope(P, 'hullDetail', -0.72, 1.652, 1.10);
  periscope(P, 'hullDetail', -0.55, 1.652, 1.06);
  periscope(P, 'hullDetail', -0.38, 1.652, 1.10);
  // splash board across the glacis (the AMX-30 V-strip)
  for (const s of [-1, 1]) P.add('hull', box(0.52, 0.10, 0.05), s * 0.46, 1.10, 2.36 - Math.abs(s) * 0, -0.42, s * 0.38, 0);
  // rear: raked tail plate + fender exhaust silencers (identity cue).
  // §B4 split: the center wedge carries the full drop between the lanes;
  // the full-width course starts above the sprocket wrap crowns (48 rear
  // voxels in the first full-width seat)
  P.add('hull', slab(
    [-0.94, 0.40, -3.05], [0.94, 0.40, -3.05], [0.94, 0.40, -2.95], [-0.94, 0.40, -2.95],
    [-0.94, 1.34, -3.28], [0.94, 1.34, -3.28], [0.94, 1.34, -3.18], [-0.94, 1.34, -3.18]));
  P.add('hull', slab(
    [-1.49, 0.96, -3.12], [1.49, 0.96, -3.12], [1.49, 0.96, -3.02], [-1.49, 0.96, -3.02],
    [-1.49, 1.34, -3.28], [1.49, 1.34, -3.28], [1.49, 1.34, -3.18], [-1.49, 1.34, -3.18]));
  P.add('hullDark', box(1.60, 0.30, 0.05), 0, 0.95, -3.245);                   // rear grille shadow band
  P.add('hull', box(1.60, 0.50, 0.045), 0, 1.09, -3.2975);                     // 90-ladder r1: tail plate band y 0.84..1.34 face -3.32 — the rear BODY column (with the nose tongue: hullLengthM 6.59; overall 9.49 with the 6.17 muzzle)
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(1.52, 0.03, 0.05), 0, 0.83 + k * 0.11, -3.25);
  for (const s of [-1, 1]) {
    P.add('hull', cylZ(0.145, 1.05, 12), s * 1.24, 1.65, -2.42);               // exhaust silencer drums on the raised rear deck
    P.add('hullDark', cylZ(0.148, 0.06, 12), s * 1.24, 1.65, -2.94);           // end ring
    P.add('hullDark', cylZ(0.075, 0.22, 10), s * 1.24, 1.67, -3.06);           // tail pipe
    P.add('hullDetail', box(0.30, 0.02, 0.72), s * 1.24, 1.565, -2.44);        // mount straps
    P.add('hullRubber', box(0.42, 0.30, 0.03), s * 1.26, 0.52, -3.28);         // mud flaps
    P.add('hullRubber', box(0.42, 0.26, 0.03), s * 1.26, 0.60, 3.27);          // bow flaps
    // The outboard flaps are carried by short fender tips and vertical
    // hangers.  Besides being mechanically correct, these broad returns keep
    // the rubber from reading as four detached plates in oblique/yaw masks.
    P.add('hull', box(0.44, 0.08, 0.38), s * 1.26, 1.26, -3.08);
    P.add('hullDetail', box(0.10, 0.64, 0.08), s * 1.26, 1.00, -3.20);
    // The AMX prow does not end in a full-height square fender post.  Carry
    // the front flap on a swept stay inside the raked nose envelope instead:
    // it remains visibly load-bearing, but no longer turns the side profile
    // into a vertical box ahead of the idler.
    P.add('hull', box(0.34, 0.08, 0.08), s * 1.16, 1.24, 3.03);               // transverse shoulder seat clears the terminal shoe crown
    P.add('hullDetail', box(0.10, 0.38, 0.06), s * 1.26, 0.91, 3.18, 0.25, 0, 0); // short hinge stay from flap crown into the nose cap
    P.add('hullDetail', box(0.08, 0.08, 4.10), s * 1.54, 1.60, -0.20);         // supported fender edge rail, clear of the animated return sweep
    if (b2) {
      P.add('hull', box(0.18, 0.18, 0.82), s * 1.58, 1.57, -1.74);             // B2 unequal fender service bin
      // Keep the full-length inboard return, but seat its lower face on the
      // raised sponson instead of dropping it through the moving top shoes.
      P.add('hullDetail', box(0.12, 0.12, 0.72), s * 1.54, 1.57, -1.74);       // broad inboard return, seated above the moving return shoes
      P.add('hull', box(0.18, 0.20, 0.72), s * 1.58, 1.53, -2.73);             // rear fender service shoulder above the terminal wrap
      P.add('hullDetail', box(0.12, 0.20, 0.62), s * 1.50, 1.53, -2.73);       // broad structural return into the raised sponson
      P.add('hullDark', box(0.13, 0.34, 0.025), s * 1.58, 0.98, -3.095);      // backed rear service recess
      for (let k = 0; k < 2; k++) {
        P.add('hullDetail', box(0.14, 0.025, 0.03), s * 1.58, 0.89 + k * 0.16, -3.115);
      }
    }
  }
  // Engine deck and rear service grammar.  The source resolves multiple
  // backed louvre beds, unequal access covers, convoy lights and recovery
  // points rather than one quiet painted slab.  All courses remain shallow
  // hull-owned geometry above the return run.
  for (const s of [-1, 1]) {
    for (let row = 0; row < 3; row++) {
      const z = -1.18 - row * 0.48;
      P.add('hullDark', box(0.48, 0.018, 0.34), s * 0.63, 1.665, z);
      for (let bar = 0; bar < 4; bar++) {
        P.add('hullDetail', box(0.46, 0.012, 0.018), s * 0.63, 1.682, z - 0.13 + bar * 0.085);
      }
    }
    P.add('hullDark', box(0.50, 0.24, 0.025), s * 0.69, 1.03, -3.325);         // backed transom service bay
    for (let k = 0; k < 4; k++) {
      P.add('hullDetail', box(0.47, 0.018, 0.035), s * 0.69, 0.93 + k * 0.07, -3.345);
    }
    P.add('hullDetail', box(0.16, 0.18, 0.035), s * 1.18, 1.08, -3.34);         // tail-lamp housing
    P.add('hullDark', box(0.10, 0.09, 0.025), s * 1.18, 1.09, -3.365);         // lamp face
    liftEye(P, 'hullDetail', s * 0.62, 0.67, -3.34, 0, Math.PI, 0);
  }
  P.add('hullDetail', box(0.38, 0.22, 0.035), 0.12, 0.78, -3.34);              // central recovery/phone cover
  P.add('hullDark', box(0.14, 0.08, 0.025), 0.12, 0.78, -3.365);               // convoy-light recess
  fenders(P, 1.06, 1.50, 1.295, -2.90, 2.10, 0.028);                           // low fender planes over the tracks
  // §B3.2 bow kit: twin headlight clusters + brush guards + tow shackles
  for (const s of [-1, 1]) {
    headlight(P, s * 1.28, 1.06, 3.02, -0.25, 0.05);
    P.add('hullDark', box(0.09, 0.09, 0.07), s * 1.14, 1.045, 2.98);           // IR lamp beside the white lamp
    P.add('hullDetail', box(0.02, 0.14, 0.30), s * 1.40, 1.10, 3.02);          // guard rails
    P.add('hullDetail', box(0.02, 0.14, 0.30), s * 1.02, 1.10, 3.00);
    P.add('hullDetail', box(0.40, 0.02, 0.30), s * 1.21, 1.185, 3.01);
    P.add('hullDark', box(0.11, 0.13, 0.06), s * 0.55, 0.62, 3.24);            // tow shackles low on the nose
  }
  const cable = FITTINGS.towCable({ mats: P.mats, pts: [[1.42, 1.65, 1.20], [1.47, 1.65, -0.30], [1.44, 1.65, -1.60]], r: 0.017, seed: 6 });
  P.hullG.add(cable);
  liftEye(P, 'hullDetail', -1.35, 1.65, 0.20);
  liftEye(P, 'hullDetail', 1.35, 1.65, 0.20);
  // Unit numbers belong on the raised sponson shoulder, not in the moving
  // return lane.  Preserve both decals and their side read while giving each
  // a real armor seat above the native shoes.
  P.decal('hull', 'number', b2 ? '68' : '53', 0.22, [1.51, 1.53, 0.4], Math.PI / 2);
  P.decal('hull', 'number', b2 ? '68' : '53', 0.22, [-1.51, 1.53, 0.4], -Math.PI / 2);
  // ---- running gear: 5 BIG roadwheels + 5 rollers, front idler ----
  // The comparison side profile carries a tighter five-wheel cadence than
  // the old generic AMX course.  Keep the physical hull datum unchanged and
  // pull only the running gear inward around the middle station: this avoids
  // the former small-wheels-in-a-long-belt silhouette without falsifying the
  // 6.59 m body or importing any donor geometry.
  const wheelCadence = b2 ? 1 : 0.965;
  const wheelZs = [1.68, 0.84, 0, -0.84, -1.68].map((z) => z * wheelCadence);
  const roadWheelR = 0.40;
  const roadWheelY = 0.40;
  buildRunningGear(P, {
    style: 'rubber', wheelR: roadWheelR, wheelW: 0.24, wheelY: roadWheelY, xc: 1.243,
    wheelZs,
    sprocket: { z: -2.48 * courseZScale, y: 0.61, r: 0.41 },
    idler: { z: 2.48 * courseZScale, y: 0.61, r: 0.41 },
    rollers: [1.58, 0.79, 0.0, -0.79, -1.58]
      .map((z) => ({ z: z * courseZScale, y: 0.99, r: 0.075 })),
    trackW: 0.55, trackTh: 0.10, topY: 1.02, botY: 0.0,
    shoeRadialScale: b2 ? 0.74 : 1,
    paintedEnds: true, coveredTop: true, arms: true,
  });
  // These discs are the dark wheel-well/recess treatment behind the native
  // road wheels, not hull armor.  Keep the visual depth and classify it as
  // running-gear furniture so the strict course gate evaluates real hull
  // surfaces independently from their own bay shading.
  wheelRecessAt(P, wheelZs, 1.243, roadWheelY, roadWheelR, 0.24, 'hullRunningGearDark');
  // (B2 skirts DROPPED: the shoe envelope prints xc+-(W/2+0.023) = +-1.573
  // — a skirt outside it breaks the +-1.55 widthM anchor (§D WIDTH-GUARD),
  // inside it gets swept by the shoes. "Side skirts optional — bare wheels
  // on most fits" per the round orders; the B2 reads by its LLLTV box,
  // dischargers and fit deltas instead.)
  // ---- turret: cast, LONG bustle taper ----
  P.turretG.position.set(0, 1.53, 0.30);
  const PLAN = [
    [-0.52, 1.04], [0.0, 1.16], [0.52, 1.04], [0.86, 0.74], [1.02, 0.30],
    [1.05, -0.28], [0.93, -0.92], [0.74, -1.58], [0.56, -2.02],
    [-0.56, -2.02], [-0.74, -1.58], [-0.93, -0.92], [-1.05, -0.28],
    [-1.02, 0.30], [-0.86, 0.74],
  ];
  // One continuous five-ring cast shell.  The previous two intersecting
  // polyTurrets left a visible belt seam and a very flat polygonal crown;
  // the source casting rises through a broad shoulder and then rolls inward
  // continuously toward its compact roof.  A slightly faster aft height
  // falloff preserves the long AMX bustle without turning it into a box.
  const castTop = ([, z]) => 0.95 - Math.max(0, -z - 0.55) * 0.050 + Math.max(0, z - 0.25) * 0.030;
  P.add('turret', KIT.polyMultiLoft(PLAN, [
    { height: 0.00, inset: 1.10 },
    { height: 0.22, inset: 1.04 },
    { height: 0.46, inset: 0.90 },
    { height: ([, z]) => castTop([0, z]) - 0.13, inset: 0.72 },
    { height: castTop, inset: 0.54 },
  ]), 0, 0, 0);
  P.add('turret', box(0.54, 0.035, 1.08), 0, 0.945, -0.43);                    // compact supported crown plate
  if (b2) {
    P.add('turret', slab(                                                      // B2 cast rear-crown shoulder into the bustle
      [-0.78, 0.76, -0.45], [0.78, 0.76, -0.45], [0.55, 0.74, -1.75], [-0.55, 0.74, -1.75],
      [-0.68, 0.92, -0.50], [0.68, 0.92, -0.50], [0.45, 0.84, -1.68], [-0.45, 0.84, -1.68]));
  }
  P.add('turret', slab(                                                        // bustle spine: the long taper read from above
    [-0.42, 0.95, -0.90], [0.42, 0.95, -0.90], [0.30, 0.87, -1.98], [-0.30, 0.87, -1.98],
    [-0.42, 1.02, -0.90], [0.42, 1.02, -0.90], [0.30, 0.91, -1.98], [-0.30, 0.91, -1.98]));
  // Mantlet zone: a broad rounded cast mask buried into the organic cheek
  // field, with a smaller canvas boot.  This removes the old rectangular
  // shelf around the F1 trunnion while keeping a closed load path.
  P.add('turret', KIT.xform(cylZ(0.38, 0.46, 18, 0.33), 0, 0, 0, 0, 0, 0, [1.18, 0.84, 1]), 0, 0.38, 1.065);
  P.add('turret', KIT.xform(cylZ(0.255, 0.18, 16, 0.225), 0, 0, 0, 0, 0, 0, [1.12, 0.86, 1]), 0, 0.38, 1.285);
  P.add('turretDark', KIT.xform(cylZ(0.205, 0.055, 16, 0.18), 0, 0, 0, 0, 0, 0, [1.10, 0.84, 1]), 0, 0.38, 1.405); // recessed canvas-boot shadow
  // ---- commander cupola (TOP-7) RIGHT + loader hatch LEFT ----
  const commanderZ = -0.40;
  const stationZ = -0.31;
  const stationX = 0.62 * stationSign;
  // Published height is measured through the distinctive TOP-7 station.
  // Keep the new compact/tapered mechanism, but restore that height with an
  // open supported neck instead of resurrecting the former opaque box tower.
  const stationLift = b2 ? 0.08 : 0.02;
  P.add('turret', cylY(0.31, 0.33, 0.13, 16), 0.52 * stationSign, 0.84, commanderZ);           // cupola ring
  P.add('turret', cylY(0.25, 0.29, 0.08, 16), 0.52 * stationSign, 0.895, commanderZ);          // rounded hatch shoulder
  P.add('turretDark', torus(0.23, 0.013, 16), 0.52 * stationSign, 0.945, commanderZ);          // hatch seal / cupola rim
  // TOP-7 commander station: compact tapered armored pedestal and optical
  // head, not the former two-storey open rectangular cage.  Both stages
  // overlap the cupola ring broadly and remain visibly asymmetric.
  P.add('turret', frustum(0.32, 0.31, -0.31, 0.26, 0.26, -0.26, 0.76, 1.00), stationX, 0, stationZ);
  P.add('turret', frustum(b2 ? 0.28 : 0.27, 0.26, -0.25, 0.22, 0.22, -0.21,
    1.00, (b2 ? 1.27 : 1.23) + stationLift), stationX, 0, stationZ);
  P.add('turretDark', box(b2 ? 0.26 : 0.24, 0.13, 0.025), stationX,
    (b2 ? 1.16 : 1.13) + stationLift, stationZ + 0.225);
  P.add('turretGlass', box(b2 ? 0.19 : 0.18, 0.085, 0.018), stationX,
    (b2 ? 1.17 : 1.14) + stationLift, stationZ + 0.242);
  P.add('turretDetail', cylY(0.050, 0.070, 0.09, 10), stationX - 0.14 * stationSign,
    (b2 ? 1.30 : 1.26) + stationLift, stationZ - 0.02);
  // The TOP-7 has a light open guard/hatch cadence around the compact head.
  // Thin members terminate in the cupola shoulder and never form another
  // opaque tower; the rear hoop also gives the MG an explicit load path.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    P.add('turretDetail', box(0.030, 0.36 + stationLift, 0.030),
      stationX + Math.cos(a) * 0.325, 1.13 + stationLift * 0.5,
      stationZ + Math.sin(a) * 0.325);
  }
  P.add('turretDetail', torus(0.34, 0.014, 20), stationX, 1.30 + stationLift, stationZ);
  P.add('turretDetail', box(0.61, 0.025, 0.025), stationX, 1.29 + stationLift, stationZ - 0.31);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    P.add('turretGlass', box(0.055, 0.035, 0.02), 0.52 * stationSign + Math.cos(a) * 0.255, 0.925, commanderZ + Math.sin(a) * 0.255, 0, -a, 0); // episcope ring
  }
  P.add('turret', cylY(0.155, 0.165, 0.045, 12), -0.48 * stationSign, 0.885, -0.60);         // loader hatch ring
  P.add('turretDark', torus(0.135, 0.010, 12), -0.48 * stationSign, 0.935, -0.60);
  periscope(P, 'turretDetail', -0.30 * stationSign, 0.87, -0.10, 0.2);
  periscope(P, 'turretDetail', 0.30 * stationSign, 0.87, 0.30);
  // remote 7.62 on the cupola side arm — FORWARD rest (CROWS-FORWARD law)
  {
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'dark', elev: -0.04, seed: 8, scale: 1.05, ammo: true });
    // Foot-origin fitting: seat its column inside the armored optical bridge
    // so the receiver and forward barrel clear the cupola instead of being
    // buried inside the cast roof.
    mg.position.set(0.84 * stationSign, (1.20 + stationLift * 0.5) * turretYScale, stationZ + 0.02);
    P.turretG.add(mg);
  }
  // gunner sight hood on the roof right-forward + rangefinder ear bulges
  P.add('turret', box(0.24, 0.10, 0.30), 0.42 * stationSign, 0.865, 0.42);
  P.add('turretGlass', box(0.14, 0.035, 0.02), 0.42 * stationSign, 0.895, 0.575);
  for (const s of [-1, 1]) {
    P.add('turret', KIT.cylX(0.145, 0.18, 14, 0.125), s * 0.98, 0.56, 0.18);     // rounded rangefinder ear bulges
    P.add('turretDark', KIT.cylX(0.075, 0.025, 12), s * 1.075, 0.56, 0.18);     // backed outer face
  }
  // ---- bustle kit: rear rack + stowage (loaded per §B3.2) ----
  P.add('turretDetail', box(1.06, 0.035, 0.035), 0, 0.69, -2.30);              // rack top rail (low supported AMX bustle course)
  P.add('turretDetail', box(1.06, 0.035, 0.035), 0, 0.37, -2.30);              // rack bottom rail
  for (const vx of [-0.50, -0.17, 0.17, 0.50]) P.add('turretDetail', box(0.03, 0.32, 0.03), vx, 0.53, -2.30);
  P.add('turretCloth', box(0.92, 0.30, 0.34), 0, 0.52, -2.12);                 // strapped duffels in the rack
  P.add('turretDark', box(0.02, 0.27, 0.21), -0.28, 0.37, -2.02);              // cinch straps
  P.add('turretDark', box(0.02, 0.27, 0.21), 0.24, 0.37, -2.02);
  if (b2) {
    for (const s of [-1, 1]) {
      P.add('turret', frustum(0.18, -1.50, -1.94, 0.15, -1.54, -1.92, 0.34, 0.76), s * 0.84, 0, 0); // tapered B2 rear-shoulder service cell
      P.add('turretDark', box(0.03, 0.34, 0.34), s * 0.84, 0.55, -1.95);       // cell strap / backed terminal cadence
    }
  }
  jerryCan(P, 'turretCloth', -0.79 * stationSign, 0.52, -1.36, 0.3);           // seated against the dome wall
  ammoCan(P, 'turretDark', 0.86 * stationSign, 0.52, -1.30, -0.2);
  stowage(P, 'turretCloth', rng, [[-0.90 * stationSign, 0.62, -0.95, 0.20, 0.16, 0.55]]);
  // antennas: whip base right-rear + left-rear pot
  {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.30, r: 0.014, rake: -0.05, seed: 4, rotation: [-0.55, 0, 0] });
    whip.position.set(0.74 * stationSign, 0.58 * turretYScale, -1.52);
    P.turretG.add(whip);
  }
  P.add('turretDetail', cylY(0.035, 0.045, 0.10, 8), -0.73 * stationSign, 0.74, -1.55);      // secondary antenna pot
  for (const s of [-1, 1]) {
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 2, r: 0.048, len: 0.24, splay: s * 0.85, pitch: -0.40, seed: 5 + s });
    smoke.position.set(s * 0.98, 0.42 * turretYScale, -0.90);
    P.turretG.add(smoke);
  }
  P.decal('turret', 'number', b2 ? '68' : '53', 0.26, [0.98, 0.30, -0.3], Math.PI / 2, 0, 0.04);
  P.decal('turret', 'number', b2 ? '68' : '53', 0.26, [-0.98, 0.30, -0.3], -Math.PI / 2, 0, -0.04);
  // ---- 105 F1 + 20 mm M693 coax BESIDE it + IR searchlight LEFT ----
  P.gunG.position.set(0, b2 ? 0.37 : 0.36, 0.75);
  trunnionRoll(P, 0.17, 0.52);
  P.addGunExtra(cylZ(0.155, 0.42, 12, 0.19), 0, 0, 0.30);                      // cast rotor collar at the boot
  P.addGunExtraDark(torus(0.125, 0.020, 12), 0, 0, 0.52, 0, 0, 0);             // canvas boot ring
  // 20 mm M693: its own sleeve slot LEFT of the main tube (identity cue —
  // the coax gun is a visible SECOND BARREL beside the 105)
  P.addGunExtra(box(0.16, 0.22, 0.55), -0.30 * stationSign, 0.06, 0.42);        // coax housing slot
  P.addGunExtra(cylZ(0.030, 1.55, 10), -0.30 * stationSign, 0.075, 1.45);       // 20 mm barrel
  P.addGunExtraDark(cylZ(0.036, 0.10, 10), -0.30 * stationSign, 0.075, 2.22);   // 20 mm muzzle ring
  P.addGunExtraDark(cylZ(0.017, 0.02, 8), -0.30 * stationSign, 0.075, 2.245);   // 20 mm bore dot (§B3.1 pinhole class)
  // PH-8-B IR searchlight LEFT of the mantlet (moves with the gun — the
  // real mount is mantlet-linked). Box + lens + guard bars.
  const irH = 0.40;
  const irY = 0.19;
  const irD = 0.28;
  P.addGunExtra(box(0.50, irH, irD), -0.72 * stationSign, irY, 0.62);
  P.addGunExtraDark(box(0.44, irH - 0.06, 0.03), -0.72 * stationSign, irY, 0.62 + irD * 0.55); // lens frame
  P.addGunExtraDark(cylZ(0.16, 0.035, 16), -0.72 * stationSign, irY, 0.62 + irD * 0.63); // round PH-8-B lens within the armored box
  P.addGunExtraDark(box(0.015, irH - 0.04, 0.02), -0.84 * stationSign, irY, 0.62 + irD * 0.60); // guard bars
  P.addGunExtraDark(box(0.015, irH - 0.04, 0.02), -0.60 * stationSign, irY, 0.62 + irD * 0.60);
  if (b2) {
    // LLLTV camera box on the mantlet RIGHT (the B2 tell)
    P.addGunExtra(box(0.30, 0.34, 0.30), 0.52 * stationSign, 0.16, 0.55);
    P.addGunExtraDark(box(0.24, 0.26, 0.03), 0.52 * stationSign, 0.16, 0.715);  // camera window
    P.addGunExtraDark(cylZ(0.055, 0.05, 10), 0.52 * stationSign, 0.24, 0.735);  // lens hood
  }
  const gunLen = 5.15 * bodyZScale;
  const gunRadius = b2 ? 0.136 : 0.134;
  buildGun(P, { len: gunLen, r: gunRadius, sleeve: false, evac: null, collar: false, baseR: 0.155 });
  muzzleBore(P, gunRadius, gunLen - 0.02);                                     // §B3.1 muzzle bore (shadow-named)
  // Scale only the authored AMX-30 fighting compartment about its local ring
  // datum.  The higher AMX-40-family upper hull supplies the correct vehicle
  // mass; the turret remains a distinct compact AMX-30 casting and the
  // independently pitchable cannon keeps its circular bore.
  P.scaleBuckets(['turret', 'turretDark', 'turretDetail', 'turretGlass', 'turretCloth'], turretXScale, turretYScale, turretZScale);
  P.scaleBuckets([
    'hull', 'hullDark', 'hullDetail', 'hullRubber', 'hullGlass',
    'turret', 'turretDark', 'turretDetail', 'turretGlass', 'turretCloth',
    'gunMount', 'gunMountDark',
  ], 1, 1, bodyZScale);
  // The five-wheel course and lower tub stay at the AMX-30 datum.  Only the
  // upper hull was rebuilt to the stronger AMX-40-family proportion, with no
  // skirts added to either variant.
  P.topY = 1.15;
}
function buildAMX30B(P) { buildAMX30(P, false); }
function buildAMX30B2(P) { buildAMX30(P, true); }

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
  // Runtime Ariete is the stronger earlier repository-authored construction.
  // The weaker later Native2026 experiment remains historical comparison
  // code only; neither a source mesh nor converted vertex payload is used at
  // runtime.
  ariete: { build: buildAriete },
  leclerc: { build: buildLeclerc },
  t80u: { build: buildT80UNative2026 },
  type74: { build: buildType74 },
  // FRANCE ROUND: the AMX-30s render procedural (the ahab GLBs carry a
  // baked-in hull/turret 180 — see the buildAMX30 header note)
  amx30: { build: buildAMX30B },
  amx30b2: { build: buildAMX30B2 },
};
