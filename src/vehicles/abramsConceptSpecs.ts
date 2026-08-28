// Recovered-drop wave 5: the former M1A2 is retained as m1a2_legacy while
// Tejas is now the canonical m1a2. Mortavex's AbramsX remains the concept
// demonstrator.
import { TANK_SPECS, ALL_TANK_IDS } from './specs.js';

type AbramsDonorSpec = typeof TANK_SPECS.m1a2_legacy;
type AbramsConceptSpec = Omit<AbramsDonorSpec, 'visual'> & {
  community?: Record<string, string>;
  publicVisualFallback?: string;
  variantOf?: string;
  visual: AbramsDonorSpec['visual'] & { patchK?: number };
};

const tankSpecs = TANK_SPECS as typeof TANK_SPECS & Record<string, AbramsConceptSpec>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
// External recovered models are reference-only. Dev and public playables use
// the same authored procedural path so local testing cannot silently swap in
// a third-party mesh.
const ALLOW_LOCAL_RECOVERED_MODELS = false;

const abramsx = clone(tankSpecs.m1a2) as AbramsConceptSpec;
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
if (!ALLOW_LOCAL_RECOVERED_MODELS) delete abramsx.community;
for (const spec of [tankSpecs.m1a2_legacy, abramsx] satisfies AbramsConceptSpec[]) {
  tankSpecs[spec.id] = tankSpecs[spec.id] || spec;
  if (!ALL_TANK_IDS.includes(spec.id)) ALL_TANK_IDS.push(spec.id);
}

if (ALLOW_LOCAL_RECOVERED_MODELS) {
  // m1a2 (formerly m1a2_tejas): DUAL-GATE GRADUATE (2026-08-02) — procedural ships
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
  // The retired local comparison print is no longer registered or retained.
}
