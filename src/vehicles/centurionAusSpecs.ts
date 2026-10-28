// The Centurion Mk 5/1 (Australia) (release 262; the owner, 2026-10-28: "add the australian centurion mk.5/1", with a
// reference render and a 1st Armoured Regiment photograph): the Royal Australian Armoured Corps' Centurion as C Squadron
// took it to Vietnam in February 1968 - a Mk 5 with the extra glacis plate, the 20-pdr and a coaxial .50 ranging gun
// (three tracers laid the 20-pdr), the 1967 refit's infra-red night equipment, a 100-gallon armoured fuel tank on the rear
// plate, the side skirts left off in the jungle and mesh baskets round the turret (5rar.asn.au; HistoryNet, Australia's
// Centurion Mark 5; the War Thunder wiki, Centurion Mk.5/1). Built as the family's 'mk5_1_aus' mark
// (profiles/centurionFamily.ts; docs/references/tanks/centurion5_1_aus.md). It clones the Strv 81 (the Mk 5 with the
// 20-pdr Type B) and flies Australia's flag, drawn in the UK tree's special lane; the RAAC's plain olive drab.
import './classicFleetSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const spec = cloneFleetVariant(registries.tankSpecs, 'centurion5_1_aus', 'strv81', { name: 'Centurion Mk 5/1 (Australia)', nation: 'Australia', era: 'cold-war' });
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
stripSilhouetteDimensions(spec.dims);
// the family hull with the rear fuel tank 0.42 m off the rear plate, 3.28 m over the guards with the skirts off, the
// 20-pdr 2.1 m past the front guards, 3.01 m to the cupola; 51.8 t with its tank full
Object.assign(spec.dims, { hullLengthM: 7.56, overallLengthM: 9.83, widthM: 3.28, heightM: 3.01 });
Object.assign(spec, { weightTons: 51.8, topSpeedKmh: 35, reverseSpeedKmh: 12 });
spec.visual = {
  ...spec.visual,
  // the RAAC's khaki green of Vietnam, yellower than the European olive greens; the squadron's number on the basket
  scheme: 'solid', base: '#5a5c30', weather: '#696b3d', patches: [],
  marking: 'number', number: '1B', camoScale: 0.55,
};

registerFleetSpecs(registries, ['centurion5_1_aus'], { centurion5_1_aus: spec });
