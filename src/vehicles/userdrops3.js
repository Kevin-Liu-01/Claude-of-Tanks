// src/vehicles/userdrops3.js — USER DROPS wave 4 (2026-07-28, batch
// `user-drops-recovered`, final sweep): three CC-BY winners. Provenance +
// license records in docs/licenses/user-drops-recovered/.
//
// REPLACEMENTS (model source swap only — gameplay stats stay in their spec
// modules):
//   merkava4 — "Merkava Mk4" by arlassar (CC-BY 4.0). Single fused artist
//              mesh, turret split authored OFFLINE (connected-component
//              classification): 'Turret' node (shell, gun+mantlet, bustle
//              basket + chain curtain, MGs, mortar) with authored ring-origin
//              t=[-1.49, 1.95, 0]; gun fused into the turret — pitch stays
//              virtual (kv2 rule). Stray antenna verts y-compressed offline
//              so the loader's 1.30x height clamp cannot shrink the tank.
//              Artist modeled wide (4.88 m vs the real 3.72 m) — the r7
//              footprint clamp (width*1.08) is the binding scale, by design.
//              Nose = raw +X -> yawOffset -90°. Israel finally gets a real
//              model (the procedural merkava4 was the last Windbreaker
//              stand-in).
//   t80u     — "Tank T-80U" by javanilga (CC-BY 4.0). Separate turret
//              (Object09_24) + gun (Object1101_22, turret SIBLING -> explicit
//              gunNode) nodes. The 10 roof accessories (searchlight, NSVT
//              stand, bustle screens) shipped as ROOT siblings — reparented
//              into the turret node offline (all outer transforms identical,
//              so the inner-node move is world-exact); the 3 m whip antenna
//              was dropped (height-clamp trap, merkava rule). Nose = raw +Z
//              -> no yawOffset. Roadwheels are separate static nodes (no
//              spin — same compromise as the print packs).
//
// NEW VEHICLE (class-template spec, communityArmor rule):
//   kf51     — "KF51 Panther - Woodland" by GRIP420 (model + textures by
//              David Falke, CC-BY 4.0). Germany tier-X MBT: lights the
//              pre-wired techtree ghost (spec 'kf51' from leo1a5, row 0).
//              Fully articulated authored nodes: KF51_Turret_Msh (yaw) >
//              Gun_Msh (pitch) > MG_Msh. Turret node origin sits at deck
//              level (y≈0) — autoPivot would reject it and fall back to the
//              bbox-center heuristic ~0.5 m off the authored ring (x=0.52),
//              so cfg.pivot pins the ring explicitly. Rear whip antennas
//              y-compressed offline; textures 2k -> 1k except the
//              alpha-carrying sheets + body diffuse (GPU texture budget).
//              Nose = raw +X -> yawOffset -90°.
//
// Registration contract identical to userdrops.js/userdrops2.js: pure data +
// side effect on the shared specs.js roster tables; imported by
// tankFactory.js AFTER the modern spec modules so the MODEL_SOURCE
// assignments override 'procedural'.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

// --- local mirrors of specs.js module-private helpers (schema-identical,
// same duplication rule as modern1.js / variants.js / userdrops2.js) ---------
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

/** Class-template armor layout (mirror of userdrops.js/userdrops2.js
 * communityArmor — the community-vehicle rule: parametric plausible
 * thicknesses, not a plate-by-plate research replica). */
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
  const tl = o.turretless ? hl * 0.5 : hw * 0.62;
  return {
    boundingRadiusM: hl + o.barrelLenM * 0.55 + 0.4,
    turretless: o.turretless === true,
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

// ---------------------------------------------------------------------------
// NEW VEHICLE — KF51 Panther (class-template spec, communityArmor rule)
// ---------------------------------------------------------------------------
export const USERDROP3_TANK_IDS = ['kf51'];

const USERDROP3_SPECS = {
  // KF51 Panther: Rheinmetall's 130 mm Future Gun System demonstrator on a
  // Leopard 2 hull — the harder-hitting, slightly softer sibling of the 2A7
  // at the top of the German MBT ladder (autoloader: 120-class reload with
  // a 130's alpha; hull protection trades toward APS, so thinner plate).
  kf51: {
    id: 'kf51', name: 'KF51 Panther', nation: 'Germany', era: 'modern', class: 'mbt',
    variantOf: 'kf51',      // self-marker (m1a1 rule): stays on the nation tab
    community: {
      author: 'GRIP420 (model + textures by David Falke)',
      source: 'https://sketchfab.com/3d-models/kf51-panther-woodland-4764a740867c4ea697df8011e7d5bf63',
      license: 'CC-BY 4.0',
    },
    hp: 2500,
    enginePowerHp: 1475, weightTons: 59, topSpeedKmh: 70, reverseSpeedKmh: 30,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 42, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 9,
    gun: {
      // Rh-130 L/52 autoloader: 20-round carousel — fast for the caliber
      caliberMm: 130, reloadS: 5.8, baseAccuracy: 0.28, aimTimeS: 1.7,
      bloom: BLOOM_MODERN,
      shells: [
        shell('DM13 130mm APFSDS', 'APFSDS', 130, apfsdsPens(750)[0], apfsdsPens(750)[1], 610, 1750, { pen2000Mm: apfsdsPens(750)[2] }),
        shell('130mm HEAT-MP', 'HEAT', 130, 680, 680, 540, 1300),
        shell('130mm HE-ABM', 'HE', 130, 50, 50, 660, 1000),
      ],
    },
    // hullLengthM matches the raw asset's gun-excluded span (7.70) so the
    // loader normalizes at s=1.0; heightM covers the sensor head (raw 3.58
    // after the offline antenna compress — under the 1.30x clamp headroom)
    dims: { hullLengthM: 7.70, overallLengthM: 10.73, widthM: 3.60, heightM: 3.00 },
    armor: communityArmor({
      lenM: 7.70, widM: 3.60, hgtM: 2.90, turretPivot: [0, 1.86, 0.52],
      gunPivot: [0, 0.31, 0.83], barrelLenM: 6.63, barrelRadM: 0.07,
      frontMm: 650, sideMm: 90, rearMm: 45, roofMm: 45,
      tFrontMm: 750, tSideMm: 320, tRearMm: 70, mantletMm: 500,
    }),
    visual: {
      // Bundeswehr woodland (GLB ships baked woodland — this drives the camo
      // overlay composite + the procedural stand-in while the GLB streams)
      scheme: 'nato', base: '#49543c', weather: '#515e44',
      patches: ['#23261f', '#4a3a2c'],
      // visual r3 #8 — blotch growth ~1.6x. MEASURED DEAD END on camoScale:
      // materials.js world-normalizes patch geometry (wk = min(1, cs/0.5)),
      // so any camoScale ≤ 0.5 paints IDENTICAL world-size patches and
      // 0.55 actually SHRANK them 9% (probe: 0.55 read 19.5 px mean blob vs
      // the critic's 19.6 at 0.34 — that knob cannot grow blotches). The
      // real knob is patchK (radius x pk, counts /pk, default 1):
      // measured 1.55 -> flank mean 25.0 px/22 blobs (from 19.5/26);
      // 1.75 closes on the ref's 26-31 px sweeping bands.
      marking: 'cross', number: '51', trackWidthM: 0.65, camoScale: 0.34, patchK: 1.75,
    },
  },
};

// ---------------------------------------------------------------------------
// Registration (idempotent — vite HMR can re-evaluate this module)
// ---------------------------------------------------------------------------
for (const [id, spec] of Object.entries(USERDROP3_SPECS)) {
  TANK_SPECS[id] = TANK_SPECS[id] || spec;
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}

// Sourced-model credit lines on the two replaced specs (m1a1 rule: variantOf
// self-marker keeps them off the COMMUNITY tab; gameplay stats in
// modern1.js/modern2.js are untouched — only the model source changes).
if (TANK_SPECS.merkava4 && !TANK_SPECS.merkava4.community) {
  TANK_SPECS.merkava4.variantOf = 'merkava4';
  TANK_SPECS.merkava4.community = {
    author: 'arlassar',
    source: 'https://sketchfab.com/3d-models/merkava-mk4-5720c5369ea24c71af475aff769ffa8b',
    license: 'CC-BY 4.0',
  };
}
if (TANK_SPECS.t80u && !TANK_SPECS.t80u.community) {
  TANK_SPECS.t80u.variantOf = 't80u';
  TANK_SPECS.t80u.community = {
    author: 'javanilga',
    source: 'https://sketchfab.com/3d-models/tank-t-80u-ebf4b55eeabb421cbf2758a2ec948439',
    license: 'CC-BY 4.0',
  };
}

// MODEL_SOURCE overrides — unconditional assignment REPLACES the
// 'procedural' rows the spec modules registered at import time. Node names
// verified against each GLB's JSON chunk (scratchpad glbtree.mjs).
MODEL_SOURCE.merkava4 = {
  source: 'glb',
  // authored 'Turret' node (ring origin y=1.95); gun fused into the turret —
  // no gun node, pitch stays virtual. No gun node also means the scale runs
  // on the full box: overallLengthM (9.04) matches the raw span exactly and
  // the r7 width clamp is the binding constraint (artist modeled wide).
  glb: {
    path: '/models/tanks/merkava4_arlassar.glb',
    turretNode: '^Turret$', autoPivot: true,
    yawOffset: -Math.PI / 2,
  },
};
// FLIP-RETIRED: MODEL_SOURCE.t80u = {
// FLIP-RETIRED:   source: 'glb',
// FLIP-RETIRED:   // turret shell Object09_24 (accessories reparented in offline); gun
// FLIP-RETIRED:   // Object1101_22 is a turret SIBLING -> explicit gunNode resolves it
// FLIP-RETIRED:   // scene-wide. Nose = raw +Z -> no yawOffset.
// FLIP-RETIRED:   // tank_models r4 ("bleached washed-out mint, visibly paler than every
// FLIP-RETIRED:   // neighboring vehicle... factory camo applies no pattern"): the baked
// FLIP-RETIRED:   // albedo skipped every cohesion pass. stripBakedTextures routes the shell
// FLIP-RETIRED:   // onto the shared camo canvas (darker 4BO base now authored in modern2.js)
// FLIP-RETIRED:   // exactly like the kv2/is3/T-90A treatment, keeps the asset's normal maps,
// FLIP-RETIRED:   // and the refine pass re-creases the decimation-melted turret kit normals.
// FLIP-RETIRED:   glb: {
// FLIP-RETIRED:     path: '/models/tanks/t80u_javanilga.glb',
// FLIP-RETIRED:     turretNode: '^Object09_24$', gunNode: '^Object1101_22$', autoPivot: true,
// FLIP-RETIRED:     paintUntextured: true, stripBakedTextures: true,
// FLIP-RETIRED:   },
// FLIP-RETIRED: };
// kf51: DUAL-GATE GRADUATE (2026-08-03) — the procedural build is the
// model of record everywhere (geometry min 90.4 gatePassed, independent
// critic 9.0+ on all FOURTEEN views, round 8 — the program's first
// post-handoff visual PASS). The GRIP420 GLB remains on disk as the
// measurement oracle only (registration recorded in
// tools/procedural-fidelity.html LOCAL_REFERENCE_OVERRIDES); provenance
// in ATTRIBUTION.md. NO MODEL_SOURCE — freeze hash via tmp-hashgeo.
