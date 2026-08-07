// Recovered-drop wave 5: the two explicitly pending Abrams candidates.
// Both are kept playable: Tejas V.'s detailed M1A2 is a roster variant while
// Mortavex's AbramsX is the concept demonstrator. The shipped dannzjs SEPv3
// remains the default flagship until the visual A/B gate says otherwise.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const ALLOW_LOCAL_RECOVERED_MODELS = typeof import.meta !== 'undefined' &&
  import.meta.env && !import.meta.env.VITE_PUBLIC_BUILD;

const tejas = clone(TANK_SPECS.m1a2);
tejas.id = 'm1a2_tejas';
tejas.name = 'M1A2 Abrams';  // owner 2026-08-06: '(Tejas)' dropped from the display name
tejas.variantOf = 'm1a2';
tejas.publicVisualFallback = 'm1a2';
tejas.community = {
  author: 'Tejas V.',
  source: 'https://sketchfab.com/3d-models/m1a2-abrams-c85846177bfc4018b6a8f3b40754655c',
  license: 'CC BY-NC-ND 4.0 — LOCAL-ONLY QUARANTINE',
};
tejas.visual.number = '23';

const abramsx = clone(TANK_SPECS.m1a2);
abramsx.id = 'abramsx';
abramsx.name = 'AbramsX';
abramsx.variantOf = 'm1a2';
abramsx.publicVisualFallback = 'm1a2';
abramsx.community = {
  author: 'Mortavex',
  source: 'https://sketchfab.com/Mortavex',
  license: 'Owner-supplied; redistribution not cleared — LOCAL-ONLY QUARANTINE',
};
abramsx.hp = 2750;
abramsx.weightTons = 49;
abramsx.enginePowerHp = 1500;
abramsx.topSpeedKmh = 72;
abramsx.reverseSpeedKmh = 35;
abramsx.hullTraverseDegS = 46;
abramsx.turretTraverseDegS = 48;
abramsx.gun.reloadS = 5.2;
abramsx.gun.aimTimeS = 1.5;
abramsx.gun.baseAccuracy = 0.25;
abramsx.gun.shells[0].name = 'XM1203 APFSDS';
abramsx.gun.shells[1].name = 'XM1203 AMP';
abramsx.visual = {
  ...abramsx.visual,
  scheme: 'nato', base: '#3c4438', weather: '#596052',
  patches: ['#1f2420', '#665746'], marking: 'star', number: 'X1', camoScale: 0.58,
};

// Keep the gameplay rows in every build. Public artifacts use the legal
// procedural M1A2 family fallback + its packaged icons; only private/local
// builds attach the recovered model credits and restricted GLB sources.
if (!ALLOW_LOCAL_RECOVERED_MODELS) {
  delete tejas.community;
  delete abramsx.community;
}
for (const spec of [tejas, abramsx]) {
  TANK_SPECS[spec.id] = TANK_SPECS[spec.id] || spec;
  if (!ALL_TANK_IDS.includes(spec.id)) ALL_TANK_IDS.push(spec.id);
}

if (ALLOW_LOCAL_RECOVERED_MODELS) {
  // m1a2_tejas: DUAL-GATE GRADUATE (2026-08-02) — procedural ships
  // everywhere (geo 90.5 gatePassed, critic 9.0 all nine views, r5).
  // Freeze hash b432d89d. The GLB stays as the trio's measurement oracle.

  MODEL_SOURCE.abramsx = {
    source: 'glb',
    glb: {
      path: '/models/tanks/community/abramsx-mortavex.glb',
      turretNode: '^Turret$', gunNode: '^[Ss]tvol$', autoPivot: true,
      paintUntextured: true,
      // COUPLED WHIP LANDING PARKED (2026-08-06 orchestrator attempt):
      // turretFollowers '^Dekali$' cratered the gate to 0 — the group
      // spans the full turret band and autoPivot re-derives the ring
      // from the enlarged footprint (registration shift class). The
      // follower set must be derived by the abrams lane with mode-2
      // tooling; AX_WHIPS_TURRET in abrams.js rides the same commit.
    },
  };

  // The locally supplied Tejas asset is the accurate, fully articulated
  // Abrams base the recovered roster was missing. Use it for the local M1A1
  // and TUSK variants as well; public builds retain their redistributable
  // CC-BY visuals because this override is inside the quarantine gate.
  // m1a1: DUAL-GATE GRADUATE (2026-08-02, freeze hash 88a4a978) — no
  // MODEL_SOURCE; the procedural build ships everywhere. m1a2_tusk keeps
  // the tejas alias (chimera oracle-defect triage class, not graduated).
  MODEL_SOURCE.m1a2_tusk = {
    source: 'glb',
    glb: {
      path: '/models/tanks/m1a2_tejas.glb',
      turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
      yawOffset: -Math.PI / 2, paintUntextured: true, heroTex: true,
    },
  };
}

export const USERDROP4_TANK_IDS = ['m1a2_tejas', 'abramsx'];
// Dual-gate graduates leave the sourced-intent roster (CUSTOM chip).
export const USERDROP4_SOURCED_IDS = USERDROP4_TANK_IDS.filter((id) => id !== 'm1a2_tejas');
