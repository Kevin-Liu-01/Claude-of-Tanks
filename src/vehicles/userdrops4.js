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
// §5.73-1 / §5.74: height is the mandatory-kit P95 envelope.  The new
// broad ghillie-covered CROWS band now measures 3.30 m on the authoritative
// 1024 mask; the earlier 3.24 row described the uncovered station.
tejas.dims = { ...tejas.dims, heightM: 3.30 };
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
// §5.73-1 / §5.82 P95 datum: the mandatory XM914/RWS is a broad roof-kit
// band, not an antenna outlier. Both independent local Mortavex kits measure
// its crest at 3.4694 m after the committed 3.66 m width registration; the
// twin 4.131 m whips remain p95-excluded spikes. The old inherited 2.44 m
// value described only the bare turret roof and caused batch-20 to crush the
// defining AbramsX superstructure into a box.
abramsx.dims = { ...abramsx.dims, heightM: 3.47 };
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
  // Matched from the registered 14-view evidence rather than the inherited
  // bright M1 palette: source median RGB is ~55/59/48 and its brown fields
  // are broad, subdued shapes.  The prior 60/68/56 base + bright weather
  // layer made an objectively aligned shell read 3-9 luminance points
  // larger/taller in every shaded comparison.
  scheme: 'nato', base: '#373b30', weather: '#4b5144',
  // The source atlas uses a few sweeping fields, not the default fleet's
  // many small islands. camoScale <=.5 is world-normalized; patchK is the
  // effective field-size control (measured against the 14-view crops).
  patches: ['#232720', '#5b4d40'], marking: 'star', number: 'X1',
  camoScale: 0.45, patchK: 1.55,
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

  // OWNER GARAGE REPAIR (2026-08-10): do not install the recovered Mortavex
  // GLB as the playable AbramsX.  Its flattened TurretKit/RWS siblings can be
  // made to follow the yaw pivot, but the asset itself contains the enormous
  // stilted receiver/deck and unsupported gaps visible in the owner's garage
  // screenshot.  Rotation parenting is not physical attachment.  The GLB
  // remains a measurement oracle on disk; the completed abrams.js procedural
  // reconstruction is now the private/local garage visual as well as the
  // deployable one, so both paths show the same seated turret and XM914 kit.

  // The locally supplied Tejas asset is the accurate, fully articulated
  // Abrams base the recovered roster was missing. Use it for the local M1A1
  // and TUSK variants as well; public builds retain their redistributable
  // CC-BY visuals because this override is inside the quarantine gate.
  // m1a1: DUAL-GATE GRADUATE (2026-08-02, freeze hash 88a4a978) — no
  // MODEL_SOURCE; the procedural build ships everywhere.
  // m1a2_tusk: §5.31b ERA-GROUP FLIP 2026-08-08 — the dev-only tejas alias
  // is retired so dev renders the same abrams.js tusk profile deploys now
  // show (variants.js carries the flip + the dannzjs candidateGlb). The
  // tejas GLB stays this id's measurement oracle via the three override
  // maps (chimera oracle class — §5.34 sepv2 precedent), NOT MODEL_SOURCE.
  // FLIP-RETIRED: MODEL_SOURCE.m1a2_tusk = {
  // FLIP-RETIRED:   source: 'glb',
  // FLIP-RETIRED:   glb: {
  // FLIP-RETIRED:     path: '/models/tanks/m1a2_tejas.glb',
  // FLIP-RETIRED:     turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
  // FLIP-RETIRED:     yawOffset: -Math.PI / 2, paintUntextured: true, heroTex: true,
  // FLIP-RETIRED:   },
  // FLIP-RETIRED: };
}

export const USERDROP4_TANK_IDS = ['m1a2_tejas', 'abramsx'];
// Dual-gate graduates leave the sourced-intent roster (CUSTOM chip).
export const USERDROP4_SOURCED_IDS = USERDROP4_TANK_IDS.filter((id) => id !== 'm1a2_tejas');
