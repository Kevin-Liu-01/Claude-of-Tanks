// The Ukrainian CV9040C (release 265; the owner 2026-10-30: "also add a ukrainian cv9040c", with a photograph of a CV90
// of the 21st Mechanized Brigade in 2024): the CV9040C as Sweden gave it to Ukraine (from 2023), its 40 mm Bofors and
// combat tuning the Swedish one's, in Ukrainian service kit (profiles/cv9040CSourceX.ts with
// { ukrainian: true }): the white tactical triangle on its flanks, a camouflage net bundled over the turret and
// tarpaulin-covered stowage on the troop roof.
import './ifvReplicaSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs } from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const ua_cv9040c = cloneFleetVariant(registries.tankSpecs, 'ua_cv9040c', 'cv9040c',
  { name: 'CV9040C (Ukraine)', nation: 'Ukraine', era: 'modern', role: 'ifv' });
delete ua_cv9040c.label;
delete ua_cv9040c.roster;
delete ua_cv9040c.publicVisualFallback;
// (ua2, ua1 critics: the Swedish "9040" and roundel stayed on the Ukrainian coat) its number in the fleet's Ukrainian style,
// as the Leopard 2A6 UA's (the 21st Mechanized Brigade's vehicle in the owner's photograph)
ua_cv9040c.visual.marking = 'number';
ua_cv9040c.visual.number = 'UA 21';
// its vote in the balance medians is the CV90's, as the CV9040C's is (balanceAudit counts a peer's copy only against a
// root voter)
ua_cv9040c.balancePeerOf = 'cv90';

registerFleetSpecs(registries, ['ua_cv9040c'], { ua_cv9040c });
