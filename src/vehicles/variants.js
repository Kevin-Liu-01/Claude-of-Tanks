// src/vehicles/variants.js — CC-BY derivative vehicles ("variants" per
// docs/research/modern-roster.md Part 0 sourcing plan).
//
// Three variant GLBs ship from public/models/tanks/community/variants/,
// each preprocessed offline in Blender (scratchpad build_abrams.py /
// build_clay.py) from an on-disk CC-BY 4.0 base:
//
//   m1a1       — dannzjs "Abrams M1A2 SEPv3" with the SEP kit stripped and
//                the M1A1 kit baked in: NO RWS anywhere, NO CITV (the #1
//                A1-vs-A2 recognition cue), manual cupola ring + pintle M2
//                .50 on a skate rail, bustle-rack extension carved. All the
//                runtime SEPv3 fidelity fixes from modelLoader.js
//                (stovepipe/headlight-tower/fin carves, DU cheeks, roofline
//                caps, GPS doghouse, deck grilles, bore evacuator + MRS,
//                fender lights, whip trim) are baked into the file — the
//                runtime surgery only runs for spec.id === 'm1a2'.
//   m1a2_tusk  — same base with the TUSK kit added: two stacked ARAT-1 ERA
//                tile rows along both skirts + ARAT-2 wedges on the forward
//                half, loader's three-sided shield with smoked-glass top,
//                CITV pedestal, Tank Infantry Phone box, rear slat cage,
//                belly appliqué plate. CROWS retained (it IS an M1A2).
//   t90a       — alexxx_xarchenko "T-90" (obr. 1992-pattern clay): decimated
//                304k -> 148k tris, scale/ground normalized, turret + gun
//                split out of the by-material meshes into an authored
//                TurretPivot/GunPivot hierarchy, running gear + skirts split
//                to a 'tracks_running_gear' node (dark gear materials via
//                paintUntextured), whips compressed under the height clamp.
//                Kontakt-5 glacis/eyebrow wedges, Shtora emitters and the
//                commander's .50 are original asset geometry.
//
// Type 74 (roster #24, stb1_haphazard base) was BUILT but NOT shipped: the
// base "STB-1" (thingiverse thing:2626560, Haphazard0587) describes itself
// as the tank "from the game World of Tanks" — the same provenance pattern
// that failed the Maus recovery (thing:2329090, rejected as a WoT rip).
// No derivative rights until that conflict is resolved; see the evaluation
// note in docs/ATTRIBUTION.md.
//
// PURE data module + registration side effect: importing this file registers
// the variant specs into the shared roster tables (TANK_SPECS / MODEL_SOURCE
// / ALL_TANK_IDS from specs.js). Import once anywhere ahead of tank
// creation, e.g. `import './vehicles/variants.js'`.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

// --- local mirrors of specs.js module-private helpers (schema-identical) ---
const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };

const shell = (name, type, caliberMm, pen100Mm, pen1000Mm, dmg, velocityMps, extra) => ({
  name, type, caliberMm, pen100Mm, pen1000Mm, dmg, velocityMps,
  moduleDmg: caliberMm, tracer: type, ...(extra || {}),
});

// mirrors specs.js apfsdsPens (modern pens roster-quoted @2 km)
const apfsdsPens = (quoted2km) => {
  const pen1000 = quoted2km / 0.90;
  return [Math.round(pen1000 / 0.91), Math.round(pen1000), quoted2km];
};

/**
 * Deep-clone a base armor model and scale the KE/CE ratings of the fighting
 * plates ('main'/'spaced'/'cast'; external track plates and ERA tiles keep
 * their values). Geometry is reused verbatim — every variant shares its
 * base vehicle's hull/turret envelope, which is exactly why it is a variant.
 */
function derivedArmor(baseArmor, factor, overrides = {}) {
  const a = structuredClone(baseArmor);
  const scalePlate = (p) => {
    if (p.kind === 'external' || p.kind === 'era') return;
    const o = overrides[p.name];
    if (o) {
      if (o.keMm !== undefined) p.keMm = o.keMm;
      if (o.ceMm !== undefined) p.ceMm = o.ceMm;
      return;
    }
    p.keMm = Math.round(p.keMm * factor);
    p.ceMm = Math.round(p.ceMm * factor);
  };
  a.hullPlates.forEach(scalePlate);
  a.turretPlates.forEach(scalePlate);
  return a;
}

/** Flat additive bump for side/rear plates (stat-level stand-in for the
 * TUSK ERA/slat kit until per-tile era plates land). */
function bumpPlates(armor, nameRe, dKe, dCe) {
  for (const p of [...armor.hullPlates, ...armor.turretPlates]) {
    if (p.kind === 'external' || p.kind === 'era') continue;
    if (nameRe.test(p.name)) {
      p.keMm += dKe;
      p.ceMm += dCe;
    }
  }
}

const m1a2 = TANK_SPECS.m1a2;
const t90m = TANK_SPECS.t90m;

export const VARIANT_TANK_IDS = ['m1a1', 't90a', 'm1a2_tusk'];

export const VARIANT_SPECS = {
  // ---- M1A1 Abrams — roster §2 (priority 2) -------------------------------
  m1a1: {
    id: 'm1a1', name: 'M1A1 Abrams', nation: 'USA', era: 'modern', class: 'mbt',
    // variantOf: nation-roster derivative (NOT a community-pool vehicle) —
    // garage/tech-tree group these under their nation's MODERN ladder while
    // keeping the CC-BY credit line from `community` visible on cards.
    variantOf: 'm1a2',
    community: {
      author: 'dannzjs (base model; SEP kit removed, M1A1 kit added)',
      source: 'https://sketchfab.com/3d-models/abrams-m1a2-sepv3-eb6f5560198740269507e9948376414c',
      license: 'CC-BY 4.0',
    },
    hp: 2300,
    enginePowerHp: 1500, weightTons: 62.1, topSpeedKmh: 67, reverseSpeedKmh: 25,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 42, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 6.5, baseAccuracy: 0.32, aimTimeS: 1.9,
      bloom: BLOOM_MODERN,
      shells: [
        shell('M829A1 APFSDS', 'APFSDS', 120, apfsdsPens(620)[0], apfsdsPens(620)[1], 520, 1575, { pen2000Mm: apfsdsPens(620)[2] }),
        shell('M830 HEAT', 'HEAT', 120, 480, 480, 460, 1140),
        shell('M908 HE-OR', 'HE', 120, 55, 55, 580, 1400),
      ],
    },
    dims: { hullLengthM: 7.92, overallLengthM: 9.77, widthM: 3.66, heightM: 2.44 },
    // M1A1HA: same envelope as the SEPv3, pre-SEP composite ratings
    // (roster §2.2: turret ~600/1000, hull ~560/700 -> ~0.86 of SEPv3)
    armor: derivedArmor(m1a2.armor, 0.86),
    visual: {
      scheme: 'nato', base: '#49543c', weather: '#525f45',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'number', number: 'A-11', trackWidthM: 0.635,
      camoScale: 0.5,
    },
  },

  // ---- T-90A — roster §13 (priority 2) ------------------------------------
  t90a: {
    id: 't90a', name: 'T-90A', nation: 'Russia', era: 'modern', class: 'mbt',
    variantOf: 't90m', // see m1a1 note
    community: {
      author: 'alexxx_xarchenko (re-materialed, decimated, turret re-parented)',
      source: 'https://sketchfab.com/3d-models/t-90-9bb8af8876a6478aa92089eff058d4db',
      license: 'CC-BY 4.0',
    },
    hp: 1950,
    enginePowerHp: 1000, weightTons: 46.5, topSpeedKmh: 60, reverseSpeedKmh: 5,
    hullTraverseDegS: 40,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 36, gunPitchDegS: 28, gunElevationDeg: 14, gunDepressionDeg: 6,
    gun: {
      caliberMm: 125, reloadS: 7.5, baseAccuracy: 0.36, aimTimeS: 2.3,
      bloom: BLOOM_MODERN,
      shells: [
        shell('3BM42M Lekalo', 'APFSDS', 125, apfsdsPens(590)[0], apfsdsPens(590)[1], 510, 1700, { pen2000Mm: apfsdsPens(590)[2] }),
        shell('3BK29M HEAT', 'HEAT', 125, 650, 650, 470, 905),
        shell('3OF26 HE-Frag', 'HE', 125, 50, 50, 570, 850),
      ],
    },
    dims: { hullLengthM: 6.86, overallLengthM: 9.53, widthM: 3.78, heightM: 2.23 },
    // T-90M armor layout shared (identical 6.86 m hull); base composite
    // scaled to the A's cast-turret ratings. Kontakt-5 'era' plates ride
    // along from the t90m layout (roster: reuse the glacis two-tile pattern).
    armor: derivedArmor(t90m.armor, 0.94),
    visual: {
      // Russian dark forest green solid, matching the shipped t90m factory
      scheme: 'solid', base: '#3f5138', weather: '#4a5c42', patches: [],
      marking: 'number', number: '112', trackWidthM: 0.58,
    },
  },

  // ---- M1A2 Abrams TUSK — roster §3 (priority 3) --------------------------
  m1a2_tusk: {
    id: 'm1a2_tusk', name: 'M1A2 Abrams TUSK', nation: 'USA', era: 'modern', class: 'mbt',
    variantOf: 'm1a2', // see m1a1 note
    community: {
      author: 'dannzjs (base model; ARAT ERA, loader shield, TIP, slat cage added)',
      source: 'https://sketchfab.com/3d-models/abrams-m1a2-sepv3-eb6f5560198740269507e9948376414c',
      license: 'CC-BY 4.0',
    },
    hp: 2650,
    enginePowerHp: 1500, weightTons: 69.5, topSpeedKmh: 64, reverseSpeedKmh: 25,
    hullTraverseDegS: 42,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 38, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      // identical M256 loadout to m1a2 (roster §3.3)
      caliberMm: 120, reloadS: 6.0, baseAccuracy: 0.30, aimTimeS: 1.8,
      bloom: BLOOM_MODERN,
      shells: [
        shell('M829A4 APFSDS', 'APFSDS', 120, apfsdsPens(750)[0], apfsdsPens(750)[1], 540, 1670, { pen2000Mm: apfsdsPens(750)[2] }),
        shell('M830A1 MPAT', 'HEAT', 120, 600, 600, 480, 1400),
        shell('M1147 AMP', 'HE', 120, 60, 60, 600, 1000),
      ],
    },
    dims: { hullLengthM: 7.93, overallLengthM: 9.77, widthM: 3.66, heightM: 2.44 },
    armor: (() => {
      const a = derivedArmor(m1a2.armor, 1.0);
      // roster §3.2 stat-level kit: ARAT rows on the sides, slats at the rear
      bumpPlates(a, /hull_side|skirt/i, 50, 400);
      bumpPlates(a, /rear/i, 0, 250);
      return a;
    })(),
    visual: {
      // tank_models r2 (critic: ARAT tiles/muzzle painted a clashing tan over
      // the woodland hull): the GLB's baked-texture composite is keyed by
      // NATION pattern tile (USA woodland), while every untextured kit part
      // (ARAT rows, loader shield, muzzle furniture) wears THIS visual's
      // shared canvas — the roster §3.4 solid desert tan made the kit read
      // as beige toy parts glued on a green tank. The TUSK now ships the
      // m1a2 family woodland so hull and kit read as one paint job; the tan
      // urban-Iraq fit stays available via the 'desert' picker pattern.
      scheme: 'nato', base: '#49543c', weather: '#525f45',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'number', number: 'T-2', trackWidthM: 0.635,
      camoScale: 0.5,
    },
  },
};

// Visual source of truth: preprocessed variant GLBs. All three carry authored
// TurretPivot/GunPivot nodes; paintUntextured routes the baked-in kit parts
// (untextured CARC-green Principled materials) onto the live camo canvas and
// keeps near-black hardware dark, exactly like the community CAD assets.
export const VARIANT_MODEL_SOURCE = {
  // m1a1: DUAL-GATE GRADUATE (2026-08-02, freeze e500174c after the r5
  // cable re-freeze) — NO variant backfill. The graduation retired the
  // primary registration and this backfill silently re-sourced the slot,
  // keeping the graduate OFF the CUSTOM tab and showing a dannzjs-lineage
  // GLB (the print family owner-identified as a mislabeled Leopard 2A5)
  // instead of the graduated procedural build. Caught 2026-08-04 by the
  // owner's custom-list check. The variant GLB stays on disk unregistered.
  // t90a: FLEET FLIP 2026-08-04 (owner: every MBT renders procedural +
  // CUSTOM) — variant registration retired; the xarchenko GLB stays a
  // measurement oracle via the three override maps.
  // m1a2_tusk: §5.31b ERA-GROUP FLIP 2026-08-08 (owner: "im not seeing our
  // custom models on our deployed versions"). This row was the PUBLIC-build
  // render of record: dev builds overwrote it with the quarantined tejas
  // alias (userdrops4, now also retired), so deploys silently kept showing
  // the dannzjs-lineage variant GLB — the exact m1a1 backfill class above.
  // The abrams.js tusk profile (buildTejasFamily + real-scale ARAT/slat/TIP
  // kit) renders everywhere now; the variant print retires to candidateGlb
  // (kv2/t30 pattern) for the Sources catalog + A/B audit.

  m1a2_tusk: {
    source: 'procedural',
    candidateGlb: {
      path: '/models/tanks/community/variants/m1a2_tusk_dannzjs_variant.glb',
      turretNode: 'TurretPivot',
      gunNode: 'GunPivot',
      paintUntextured: true,
    },
  },
};

// ---------------------------------------------------------------------------
// Registration side effect: fold the variants into the shared roster tables.
// Guarded so a double import (or a concurrent registrar) can't duplicate ids.
// ---------------------------------------------------------------------------
for (const id of VARIANT_TANK_IDS) {
  if (!TANK_SPECS[id]) TANK_SPECS[id] = VARIANT_SPECS[id];
  if (!MODEL_SOURCE[id]) MODEL_SOURCE[id] = VARIANT_MODEL_SOURCE[id];
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}
