// src/vehicles/userdrops2.js — USER DROPS wave 2 (2026-07-28, batch
// `user-drops-recovered`): seven winners from the user's recovered downloads
// (judged 3/4-angle renders; provenance + license records in
// docs/licenses/user-drops-recovered/).
//
// HISTORICAL COMPARISON CANDIDATES (runtime swaps permanently retired):
//   t90m    — "T-90M" by minehffd (CC-BY 4.0, license stamped in
//             asset.copyright + scene extras). Turret node 'Turret' parents
//             all 46 turret meshes (Kord RWS, ERA, baskets); gun node
//             'Main barrel' (GLTFLoader sanitizes to 'Main_barrel'). The gun
//             mantlet is a turret SIBLING mesh, so it stays put while the
//             barrel elevates (known minor). Nose = raw -X.
//   leo2a4  — "Leopard 2A4" by m_bergman (Thingiverse thing:4718232,
//             CC-BY-NC-SA — QUARANTINE). 1:100 wargame print master,
//             hull+turret STL pair with an authored ring-center 'Turret'
//             pivot empty baked in offline; gun fused into the turret mesh —
//             yaw articulates, pitch stays virtual (kv2 rule). Untextured
//             CAD shell -> paintUntextured camo path. Nose = glTF +Z.
//   bmp2    — "BMP-2 (skirts)" by m_bergman (same pack, QUARANTINE). Same
//             scheme: ring-center 'Turret' pivot, 30mm + AT-5 fused.
//
// NEW VEHICLES (class-template specs, m_bergman pack, all QUARANTINE):
//   bmp1    — BMP-1, USSR tier-VI IFV (73mm Grom + Malyutka rail fused).
//   m1128   — M1128 Stryker MGS (slat armor), USA tier-VIII TD; low-profile
//             105mm autoloader turret; 8x8 wheels modeled into the hull
//             (static — no wheel spin, same compromise as the print packs).
//   m1296   — M1296 Stryker Dragoon, USA tier-VII IFV; unmanned 30mm turret.
//
// QUARANTINE assets live under public/models/tanks/community/ and
// are listed in docs/ATTRIBUTION.md PERSONAL-USE/NC QUARANTINE — remove that
// directory + section before any public distribution or commercialization of
// this private project.
//
// This module contributes gameplay/spec rows only. External files remain
// isolated tooling references and never override procedural runtime geometry.

import { TANK_SPECS, ALL_TANK_IDS } from './specs.js';

// --- local mirrors of specs.js module-private helpers (schema-identical,
// same duplication rule as modern1.js / variants.js / userdrops.js) ---------
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

/** Class-template armor layout (mirror of userdrops.js communityArmor — the
 * community-vehicle rule: parametric plausible thicknesses, not a
 * plate-by-plate research replica). */
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

// wheeled 8x8 / light-track terrain feel: quick on hard surfaces, hurting in
// the soft stuff (no neutral steer, no pivot turn — pivotStyle omitted)
const WHEELED_TR = { hard: 0.65, medium: 0.95, soft: 1.9 };

// ---------------------------------------------------------------------------
// NEW VEHICLES — class-template specs (communityArmor rule)
// ---------------------------------------------------------------------------
export const USERDROP2_TANK_IDS = ['bmp1', 'm1128', 'm1296'];

const QUAR_BERGMAN = {
  author: 'm_bergman',
  source: 'https://www.thingiverse.com/thing:4718232',
  license: 'CC-BY-NC-SA — PERSONAL-USE QUARANTINE (docs/ATTRIBUTION.md)',
};

const USERDROP2_SPECS = {
  // BMP-1: the ur-IFV — one tier below the BMP-2, trading the 30mm burst for
  // the low-pressure 73mm Grom thump and the slow manual Malyutka rail.
  bmp1: {
    id: 'bmp1', name: 'BMP-1', nation: 'USSR', era: 'modern', class: 'ifv',
    variantOf: 'bmp1',      // self-marker (m1a1 rule): stays on the nation tab
    community: QUAR_BERGMAN,
    hp: 850,
    enginePowerHp: 300, weightTons: 13.2, topSpeedKmh: 65, reverseSpeedKmh: 7,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.75, medium: 0.9, soft: 1.6 },
    pivotStyle: 'pivot',
    // one-man turret: slow ring, generous elevation, signature -4 depression
    turretTraverseDegS: 30, gunPitchDegS: 30, gunElevationDeg: 30, gunDepressionDeg: 4,
    gun: {
      // 2A28 Grom: autoloaded HEAT lobber — short reload, poor accuracy
      caliberMm: 73, reloadS: 6.0, baseAccuracy: 0.45, aimTimeS: 2.2,
      bloom: BLOOM_MODERN,
      shells: [
        shell('PG-15V HEAT', 'HEAT', 73, 300, 300, 310, 665),
        shell('9M14M Malyutka', 'HEAT', 125, 410, 410, 400, 115, { reloadS: 22 }),
        shell('OG-15V HE', 'HE', 73, 8, 8, 330, 290),
      ],
    },
    // heightM includes the Malyutka rail/periscopes (raw bbox y 2.91 — the
    // 1.30x loader headroom must not shrink the vehicle, type74 rule)
    dims: { hullLengthM: 6.74, overallLengthM: 6.74, widthM: 2.94, heightM: 2.25 },
    armor: communityArmor({
      lenM: 6.74, widM: 2.94, hgtM: 1.92, turretPivot: [0, 1.35, 0.32],
      gunPivot: [0, 0.20, 0.45], barrelLenM: 1.6, barrelRadM: 0.045,
      frontMm: 30, sideMm: 18, rearMm: 16, roofMm: 7,
      tFrontMm: 33, tSideMm: 20, tRearMm: 16, mantletMm: 33,
    }),
    visual: {
      scheme: 'solid', base: '#4a5138', weather: '#565e43', patches: [],
      marking: 'number', number: '321', trackWidthM: 0.30,
    },
  },

  // M1128 Stryker MGS: a 105mm sniper on a paper-thin 8x8 — glass-cannon TD.
  m1128: {
    id: 'm1128', name: 'M1128 Stryker MGS', nation: 'USA', era: 'modern', class: 'td',
    variantOf: 'm1128',
    community: QUAR_BERGMAN,
    hp: 1150,
    enginePowerHp: 350, weightTons: 18.77, topSpeedKmh: 88, reverseSpeedKmh: 12,
    hullTraverseDegS: 28,
    terrainResistance: WHEELED_TR,
    // low-profile autoloader turret: full 360 but deliberate
    turretTraverseDegS: 22, gunPitchDegS: 24, gunElevationDeg: 18, gunDepressionDeg: 8,
    gun: {
      caliberMm: 105, reloadS: 6.8, baseAccuracy: 0.30, aimTimeS: 1.8,
      bloom: BLOOM_MODERN,
      shells: [
        shell('M900 APFSDS', 'APFSDS', 105, apfsdsPens(440)[0], apfsdsPens(440)[1], 390, 1505, { pen2000Mm: apfsdsPens(440)[2] }),
        shell('M456A2 HEAT-T', 'HEAT', 105, 400, 400, 400, 1173),
        shell('M393A3 HEP', 'HE', 105, 45, 45, 470, 730),
      ],
    },
    // dims describe the MODELED configuration (loader clamp inputs): the slat
    // cage adds ~0.5 m a side (raw w/l ratio 4.47/8.70) and the turret antenna
    // mast tops the bbox — real bare-hull width is 2.72 m. Measured so the
    // hull normalizes to ~6.95 m (scratchpad bbox probe, all three clamps
    // balance at s=0.90).
    dims: { hullLengthM: 6.95, overallLengthM: 7.82, widthM: 3.72, heightM: 2.97 },
    armor: communityArmor({
      lenM: 6.95, widM: 2.72, hgtM: 2.30, turretPivot: [0, 2.00, -0.20],
      gunPivot: [0, 0.18, 0.55], barrelLenM: 5.40, barrelRadM: 0.055,
      frontMm: 30, sideMm: 20, rearMm: 15, roofMm: 10,
      tFrontMm: 40, tSideMm: 25, tRearMm: 20, mantletMm: 45,
    }),
    visual: {
      scheme: 'solid', base: '#4c5442', weather: '#575f4c', patches: [],
      marking: 'number', number: '11', trackWidthM: 0.35,
    },
  },

  // M1296 Stryker Dragoon: 30mm unmanned turret on the same 8x8 hull family.
  m1296: {
    id: 'm1296', name: 'M1296 Stryker Dragoon', nation: 'USA', era: 'modern', class: 'ifv',
    variantOf: 'm1296',
    community: QUAR_BERGMAN,
    hp: 1000,
    enginePowerHp: 450, weightTons: 20.0, topSpeedKmh: 90, reverseSpeedKmh: 12,
    hullTraverseDegS: 32,
    terrainResistance: WHEELED_TR,
    turretTraverseDegS: 40, gunPitchDegS: 40, gunElevationDeg: 30, gunDepressionDeg: 8,
    gun: {
      // XM813 Bushmaster per-shell reloads are LIVE (sim/damage.js
      // startReload): 0.35 s bursts, belt counts sized to match.
      caliberMm: 30, reloadS: 0.35, baseAccuracy: 0.30, aimTimeS: 1.4,
      bloom: BLOOM_MODERN,
      shells: [
        shell('MK258 APFSDS-T', 'APFSDS', 30, 85, 75, 50, 1430, { pen2000Mm: 65, reloadS: 0.35, count: 150 }),
        shell('MK310 HEI-T', 'HE', 30, 8, 8, 55, 1080, { reloadS: 0.35, count: 150 }),
      ],
    },
    // widthM includes the hull ceramic-tile appliqué the print models carry
    // (raw w 3.12 at s=0.96); heightM to the unmanned turret's sight head
    dims: { hullLengthM: 6.95, overallLengthM: 7.50, widthM: 2.85, heightM: 2.77 },
    armor: communityArmor({
      lenM: 6.95, widM: 2.72, hgtM: 2.30, turretPivot: [0, 2.10, -0.30],
      gunPivot: [0, 0.22, 0.40], barrelLenM: 2.40, barrelRadM: 0.035,
      frontMm: 30, sideMm: 25, rearMm: 15, roofMm: 10,
      tFrontMm: 35, tSideMm: 25, tRearMm: 20, mantletMm: 35,
    }),
    visual: {
      scheme: 'solid', base: '#4c5442', weather: '#575f4c', patches: [],
      marking: 'number', number: '27', trackWidthM: 0.35,
    },
  },
};

// ---------------------------------------------------------------------------
// Registration (idempotent — vite HMR can re-evaluate this module)
// ---------------------------------------------------------------------------
// content_breadth r2: the bergman quarantine swaps for the three NEW specs
// render as placeholder boxes in-game — do not ship them as playables until
// the GLB substitution actually lands (then flip this flag, re-add the
// roster spec wiring, and run `node tools/genIcons.mjs --tanks
// bmp1,m1128,m1296`).
// content_breadth r5: even when flipped, PUBLIC builds (build:public sets
// VITE_PUBLIC_BUILD=1) never register quarantine-path sources — the specs
// stay delisted / procedural, so tools/strip-nc-assets.mjs succeeds instead
// of failing loudly.
const SHIP_USERDROP2_NEW = false
  && !(typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_PUBLIC_BUILD);

if (SHIP_USERDROP2_NEW) {
  for (const [id, spec] of Object.entries(USERDROP2_SPECS)) {
    TANK_SPECS[id] = TANK_SPECS[id] || spec;
    if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
  }
}

// Remaining sourced-model credit line (m1a1 rule: variantOf
// self-marker keeps them off the COMMUNITY tab; gameplay stats in
// specs.js/modern2/modern3 are untouched — only the model source changes).
if (TANK_SPECS.t90m && !TANK_SPECS.t90m.community) {
  TANK_SPECS.t90m.variantOf = 't90m';
  TANK_SPECS.t90m.community = {
    author: 'minehffd',
    source: 'https://sketchfab.com/3d-models/t-90m-2e31a3cf16b04f0180b9387df5198c9a',
    license: 'CC-BY 4.0',
  };
}
// tank_models r3 QUARANTINE DELIST (same rule as the SHIP_USERDROP2_NEW gate
// below + userdrops.js ariete/type74): the CC-BY-NC-SA bergman swaps for
// leo2a4/bmp2 fall back to their procedural modern2/modern3 builds — no
// personal-use asset ships as a playable and no 'QUARANTINE' license line
// reaches the player-facing panel.
if (SHIP_USERDROP2_NEW) {
  if (TANK_SPECS.leo2a4 && !TANK_SPECS.leo2a4.community) {
    TANK_SPECS.leo2a4.variantOf = 'leo2a4';
    TANK_SPECS.leo2a4.community = QUAR_BERGMAN;
  }
  if (TANK_SPECS.bmp2 && !TANK_SPECS.bmp2.community) {
    TANK_SPECS.bmp2.variantOf = 'bmp2';
    TANK_SPECS.bmp2.community = QUAR_BERGMAN;
  }
}

// Historical runtime overrides remain below only as commented migration
// notes. No executable MODEL_SOURCE assignment exists in this module.
// FLIP-RETIRED: MODEL_SOURCE.t90m = {
// FLIP-RETIRED:   source: 'glb',
// FLIP-RETIRED:   // 'Turret' yaw shell parents all turret meshes; 'Main barrel' pitch node.
// FLIP-RETIRED:   // Raw asset is ~16.2 units long with the barrel forward and no clean
// FLIP-RETIRED:   // hull-only box (thermal sleeve meshes sit outside the gun node) ->
// FLIP-RETIRED:   // scaleToOverall. Nose = raw -X -> yawOffset +90°.
// FLIP-RETIRED:   glb: {
// FLIP-RETIRED:     path: '/models/tanks/t90m_minehffd.glb',
// FLIP-RETIRED:     turretNode: '^Turret$', gunNode: '^Main_barrel$', autoPivot: true,
// FLIP-RETIRED:     scaleToOverall: true,
// FLIP-RETIRED:     yawOffset: Math.PI / 2,
// FLIP-RETIRED:     // PERF (performance_budget r3): tank_closeup_t90m contract hero —
// FLIP-RETIRED:     // keeps 2048 color maps at import (see specs.js m1a2 heroTex note).
// FLIP-RETIRED:     heroTex: true,
// FLIP-RETIRED:   },
// FLIP-RETIRED: };
// Runtime source swaps are permanently retired for this wave. The recovered
// files remain isolated comparison/measurement candidates, but leo2a4, bmp2,
// bmp1, m1128 and m1296 can only resolve through repository-authored builders.
// This is intentionally stronger than a disabled shipping flag: no future
// environment change can silently replace their native geometry.
