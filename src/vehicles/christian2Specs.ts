// The Christian II (release 262): a fictional Danish Army concept MBT, a fresh first-party build on a Leopard 2-pattern
// hull with a Type 90-inspired bustle-autoloader turret and heavy field netting (profiles/christian2.ts;
// docs/references/tanks/christian2.md, docs/references/concepts/christian2-20261027.json). Its spec takes the Leopard 2's
// running and fire-control template from leo2a2 (terrain, pivot style, bloom, the 120 mm rounds) and is otherwise its own:
// the combat envelope on its drawn hull and turret (christian2Armor.ts), its stats, its three-round bustle cycle, number
// and paint.
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { christian2Armor } from './christian2Armor.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const spec = cloneFleetVariant(registries.tankSpecs, 'christian2', 'leo2a2', { name: 'Christian II', nation: 'Denmark' });
delete spec.variantOf;
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
stripSilhouetteDimensions(spec.dims);
// the built vehicle: the hull 7.25 m between its plates, 7.855 m from the fenders' tips to the stern rack, 9.866 m over the
// gun, 3.672 m over the skirt blocks' bolts, roof 2.47 m
Object.assign(spec.dims, { hullLengthM: 7.855, overallLengthM: 9.866, widthM: 3.672, heightM: 2.47 });
// 2020s concept: a Leopard 2-class 1,500 hp pack on 58 t; three crew with a bustle autoloader
Object.assign(spec, {
  hp: 2500, enginePowerHp: 1500, weightTons: 58.0, topSpeedKmh: 68, reverseSpeedKmh: 30,
  hullTraverseDegS: 44, turretTraverseDegS: 42, gunPitchDegS: 34, gunElevationDeg: 20, gunDepressionDeg: 9,
});
spec.gun = {
  ...spec.gun,
  // the tier-fairness round robin at VIII (the 850 mm mantlet insert and this cycle: strength 0.499, 9 of 29 pairs in
  // band; lane evidence fairlever2.txt)
  reloadS: 17, baseAccuracy: 0.27, aimTimeS: 1.6,
  autoloader: { magazineSize: 3, intraClipS: 2.1, fullReloadS: 17 },
  // DM53-class APFSDS from the L/44, a newer multi-purpose round and HE
  shells: [
    { ...spec.gun.shells[0], name: 'DM53A1 APFSDS', pen100Mm: 855, pen1000Mm: 778, pen2000Mm: 700, dmg: 530, velocityMps: 1750 },
    { ...spec.gun.shells[1], name: 'DM11 HE-ABM', type: 'HE', pen100Mm: 40, pen1000Mm: 40, dmg: 590, velocityMps: 1000 },
    { ...spec.gun.shells[1], name: 'DM12A2 HEAT-MP', pen100Mm: 600, pen1000Mm: 600, dmg: 480, velocityMps: 1400 },
  ].sort((a, b) => ['APFSDS', 'HEAT', 'HE'].indexOf(a.type) - ['APFSDS', 'HEAT', 'HE'].indexOf(b.type)),
};
spec.armor = christian2Armor();
// the gun's depression by turret yaw over its own hull, measured with tools/gun-depression-sweep.mjs --no-suit at 26 mm
// (lane christian2-262): shallower over the headlight pods at the front corners and up to level over the engine deck;
// held at +0.6 from 163 degrees to dead astern (the bare hull allows 0.1 to -0.4 there; the engine deck's net keeps 25 mm
// only above +0.5)
spec.gunPitchByYawDeg = [[0, -9], [15, -9], [17, -7.5], [19, -7], [23, -6.6], [26, -6.6], [27, -6.9], [28, -7.6],
  [29, -8.8], [30, -9], [135, -9], [144, -5.3], [146, -3.6], [149, -2.6], [150, -1.4], [152, -0.3], [153, -0.1], [156, 0],
  [157, 0.6], [158, 0.9], [160, 0.9], [163, 0.6], [180, 0.6]];
// its own Danish tri-tone: olive ground with black-green, brown and a pale grey-green (one patch colour more than the
// NATO coats, so it stays its own catalog paint)
spec.visual = {
  ...spec.visual,
  scheme: 'nato', base: '#45503a', weather: '#58604a', patches: ['#24291f', '#6b5a40', '#7b8263'],
  marking: 'number', number: '21', camoScale: 0.46,
};

registerFleetSpecs(registries, ['christian2'], { christian2: spec });
