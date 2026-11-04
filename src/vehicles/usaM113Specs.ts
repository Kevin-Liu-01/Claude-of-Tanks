// The US Army's M113A3 (release 269; the owner, 2026-11-03: "make a USA m113 variant, that plays similar to the ares
// apc"): the A1's aluminium hull with the RISE powerpack (the 6V53T of 275 hp), the spall liner and the two armoured fuel
// tanks either side of the ramp, 12.3 t, 66 km/h; the commander's M2 .50 behind a gun shield on his cupola, its one
// traversing station (docs/references/tanks/m113a3.md; profiles/m113.ts, the 'a3' mark). It plays as the Ares APC: cloned
// from it, the same 12.7 mm belts under their US names and the same fire control, at its own weight and speed.
import './aresApcXSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { driverFrontLeft, m113Armor, m113Mobility } from './m113Combat.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const m113a3 = cloneFleetVariant(registries.tankSpecs, 'm113a3', 'ares_apc', { name: 'M113A3', nation: 'USA', era: 'modern', role: 'ifv' });
// (its own gun stops are measured on its build: tools/gun-depression-sweep.mjs)
for (const key of ['balancePeerOf', 'publicVisualFallback', 'label', 'roster', 'variantOf', 'gunPitchByYawDeg'] as const) delete m113a3[key];
stripSilhouetteDimensions(m113a3.dims);
// as built: the 4.86 m hull, 5.38 m over the fuel tanks astern, 2.69 m over the tracks, 2.62 m to the shield's top
Object.assign(m113a3.dims, { hullLengthM: 4.86, overallLengthM: 5.38, widthM: 2.69, heightM: 2.62 });
Object.assign(m113a3, { hp: 1500, ...m113Mobility(12.3, 275, 66) });
// (the turret's hit envelope the cupola with its shield and wings, the room the station's crew, belts and feed take)
m113a3.armor = driverFrontLeft(m113Armor('a3', { tw: 0.50, tFrontZ: 0.45, tRearZ: -0.50, tH: 0.46 }, 1.14, 0.022));
// the Ares's three belts as the US Army's .50: the M962 SLAP-T, the M20 API-T and the M33 ball
const US_50 = ['M962 SLAP-T', 'M20 API-T', 'M33 Ball'];
m113a3.gun = { ...m113a3.gun, shells: m113a3.gun.shells.map((shell, i) => ({ ...shell, name: US_50[i] ?? shell.name })) };
// the US Army's CARC woodland three-tone of the 1980s to 2000s (forest green under field drab and black); its stock coat is
// the MERDC four-colour woodland it wore first (camoPolicy.ts: the three-tone sits a shade from the Leclerc's)
m113a3.visual = { ...m113a3.visual, scheme: 'nato', base: '#3a4229', weather: '#454d33', patches: ['#5f4a33', '#1f201b'],
  marking: 'number', number: 'C24', camoScale: 0.5, patchK: 1.3 };

registerFleetSpecs(registries, ['m113a3'], { m113a3 });
