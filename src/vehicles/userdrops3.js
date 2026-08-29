// src/vehicles/userdrops3.js — USER DROPS wave 4 (2026-07-28, batch
// `user-drops-recovered`, final sweep): three CC-BY winners. Provenance +
// license records in docs/licenses/user-drops-recovered/.
//
// REPLACEMENTS (model source swap only — gameplay stats stay in their spec
// modules):
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
//              David Falke, CC-BY 4.0). Germany tier-X MBT in the modern
//              garage roster.
//              Fully articulated authored nodes: KF51_Turret_Msh (yaw) >
//              Gun_Msh (pitch) > MG_Msh. Turret node origin sits at deck
//              level (y≈0) — autoPivot would reject it and fall back to the
//              bbox-center heuristic ~0.5 m off the authored ring (x=0.52),
//              so cfg.pivot pins the ring explicitly. Rear whip antennas
//              y-compressed offline; textures 2k -> 1k except the
//              alpha-carrying sheets + body diffuse (GPU texture budget).
//              Nose = raw +X -> yawOffset -90°.
//
// Registration is pure data plus a side effect on the shared specs.js roster
// tables. The fleet facades import this pack after the modern spec modules so
// its authored rows observe a complete donor registry.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';
import {
  shell,
  apfsdsPenetration as apfsdsPens,
  communityArmor,
} from './specHelpers.ts';

const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };


// ---------------------------------------------------------------------------
// NEW VEHICLE — KF51 Panther (class-template spec, communityArmor rule)
// ---------------------------------------------------------------------------
const USERDROP3_SPECS = {
  // KF51 Panther: Rheinmetall's 130 mm Future Gun System demonstrator on a
  // Leopard 2 hull — the harder-hitting, slightly softer sibling of the 2A7
  // at the top of the German MBT ladder (autoloader: 120-class reload with
  // a 130's alpha; hull protection trades toward APS, so thinner plate).
  kf51: {
    id: 'kf51', name: 'KF51 Panther', nation: 'Germany', era: 'modern', role: 'mbt',
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
      marking: 'cross', number: '51', trackWidthM: 0.65, camoScale: 0.34, patchK: 1.75,
    },
  },
};

// The owner-source rebuild is intentionally additive. Keep the graduate KF51
// stable for saves and existing scenes while exposing the rebuilt woodland
// vehicle as KF51B with its measured palette and geometry.
USERDROP3_SPECS.kf51b = {
  ...USERDROP3_SPECS.kf51,
  id: 'kf51b', name: 'KF51B Panther', variantOf: 'kf51b',
  // §5.299 fleet-integration truth-up (kf51b row ONLY — kf51's shared armor
  // object is untouched, this is a fresh communityArmor instance): the
  // b-variant builder seats its ring at 1.72/0.20 and the gun axis at 1.94
  // with the measured 5.30 m Rh-130 tube (source muzzle world 6.88). The
  // inherited kf51 row carried the GLB-era 6.63 m barrel + 1.86/0.52
  // pivots — a §C shadow proxy 1.33 m too long and an aim rig offset from
  // the visual trunnion. Track decal width follows the built 0.587 course.
  armor: communityArmor({
    lenM: 7.70, widM: 3.60, hgtM: 2.90, turretPivot: [0, 1.72, 0.20],
    gunPivot: [0, 0.22, 1.58], barrelLenM: 5.30, barrelRadM: 0.064,
    frontMm: 650, sideMm: 90, rearMm: 45, roofMm: 45,
    tFrontMm: 750, tSideMm: 320, tRearMm: 70, mantletMm: 500,
  }),
  visual: {
    ...USERDROP3_SPECS.kf51.visual,
    base: '#56573e', weather: '#51533f', patches: ['#303c30', '#473729'],
    number: '52', patchK: 1.28, trackWidthM: 0.587,
  },
};

// ---------------------------------------------------------------------------
// Registration (idempotent — vite HMR can re-evaluate this module)
// ---------------------------------------------------------------------------
for (const [id, spec] of Object.entries(USERDROP3_SPECS)) {
  TANK_SPECS[id] = TANK_SPECS[id] || spec;
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}

// Sourced-model credit lines on replaced specs (m1a1 rule: variantOf
// self-marker keeps them off the COMMUNITY tab; gameplay stats in
// modern1.js/modern2.js are untouched — only the model source changes).
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
