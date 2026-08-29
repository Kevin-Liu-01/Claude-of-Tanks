// Abrams-family concept rows. The former M1A2 remains available as
// m1a2_legacy while AbramsX uses the first-party procedural family builder.
import { TANK_SPECS, ALL_TANK_IDS } from './specs.js';

type AbramsDonorSpec = typeof TANK_SPECS.m1a2_legacy;
type AbramsConceptSpec = Omit<AbramsDonorSpec, 'visual'> & {
  variantOf?: string;
  visual: AbramsDonorSpec['visual'] & { patchK?: number };
};

const tankSpecs = TANK_SPECS as typeof TANK_SPECS & Record<string, AbramsConceptSpec>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

// Keep both procedural gameplay rows available in every build.
for (const spec of [tankSpecs.m1a2_legacy, abramsx] satisfies AbramsConceptSpec[]) {
  tankSpecs[spec.id] = tankSpecs[spec.id] || spec;
  if (!ALL_TANK_IDS.includes(spec.id)) ALL_TANK_IDS.push(spec.id);
}
