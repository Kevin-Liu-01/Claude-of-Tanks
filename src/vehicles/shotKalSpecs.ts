// The Sho't Kal (release 262; the owner, 2026-10-27: "add a new israeli centurion once u make the new centurions with
// proper equipment geometries and etc, add a new one called the sho't"): the IDF Centurion of 1973 (Sho't Kal Alef,
// before Blazer armour), re-engined with the Continental AVDS-1790-2A diesel and Allison CD-850-6 transmission, the 105 mm
// L7 and IDF stowage (profiles/centurionFamily.ts, mark 'shot_kal'; docs/references/tanks/shot_kal.md). It clones the
// Centurion Mk 5/2 (same hull armour, turret and gun) and shares its balanced combat package (fleetBalancePass); the
// diesel's 750 hp and the IDF's Sinai grey are its own.
import './classicFleetSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const spec = cloneFleetVariant(registries.tankSpecs, 'shot_kal', 'centurion5_2', { name: "Sho't Kal", nation: 'Israel', era: 'cold-war' });
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
stripSilhouetteDimensions(spec.dims);
// 51.8 t, 3.39 m over the side plates, 3.01 m to the cupola; the L7 reaches 2.0 m past the front guards
Object.assign(spec.dims, { hullLengthM: 7.56, overallLengthM: 9.62, widthM: 3.39, heightM: 3.01 });
Object.assign(spec, { weightTons: 51.8, topSpeedKmh: 43, reverseSpeedKmh: 16 });
spec.visual = {
  ...spec.visual,
  // IDF "Sinai grey": the grey-sand of 1973, plain, with the white chevron on the side plates
  scheme: 'solid', base: '#8c8670', weather: '#9a9480', patches: [],
  marking: 'number', number: '3', camoScale: 0.55,
};

registerFleetSpecs(registries, ['shot_kal'], { shot_kal: spec });
