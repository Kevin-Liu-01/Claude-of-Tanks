// The Centurion Mk 13 (release 262; the owner, 2026-10-27: "make one of em have a huge floodlight to right of gun ...
// can add a new centurion variants for the big floodlight"): the British Mk 10 with the L2 infra-red/white-light
// searchlight on the turret's left front and the .50 ranging gun (profiles/centurionFamily.ts, mark 'mk13';
// docs/references/tanks/centurion13.md). It clones the Mk 5/2 (the L7 and the family's turret) and shares its balanced
// combat package (fleetBalancePass). The Mk 7-and-later engine deck, 0.27 m longer, is not drawn: the family's hull
// frame is the Mk 3/5's, so the published 7.82 m hull is recorded in the packet and the spec carries the drawn 7.56 m.
import './classicFleetSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const spec = cloneFleetVariant(registries.tankSpecs, 'centurion13', 'centurion5_2', { name: 'Centurion Mk 13', nation: 'UK', era: 'cold-war' });
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
stripSilhouetteDimensions(spec.dims);
// 51.8 t; 3.39 m wide; 3.01 m to the cupola; the L7A2 2.06 m past the front guards
Object.assign(spec.dims, { hullLengthM: 7.56, overallLengthM: 9.62, widthM: 3.39, heightM: 3.01 });
Object.assign(spec, { weightTons: 51.8 });
spec.visual = { ...spec.visual, number: '13' };

registerFleetSpecs(registries, ['centurion13'], { centurion13: spec });
