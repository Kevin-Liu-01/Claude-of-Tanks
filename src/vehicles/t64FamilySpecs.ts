// The true T-64s, new tanks in 262 (profiles/t64Foundation.ts, t64bm1m.ts, t64KontaktFamily.ts). Owner 2026-10-27: the
// T-64BM1M "should be designed from scratchh as well", then "i also liked our old t64s that are on main and deployed rn so
// make these new tanks were making fully nnew tnaks": the T-64BV1 and the T-64BV mod. 2017 keep their builds, and the
// true T-64s register beside them. Each clones its nearest sibling's balanced combat record; the T-64 frame (dims, ring,
// trunnion, reactive sectors) is applied with the fleet renewal (t64Armor.ts, fleetRenewalSpecs.ts).
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import type { FleetTankSpec } from './specContracts.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
export const T64_FAMILY_IDS = Object.freeze(['t64bv', 't64b1v_2022', 't64bm1m', 'pt64_tur'] as const);

function t64(id: string, donorId: string, name: string, nation: string, visual: Partial<FleetTankSpec['visual']>,
  stats: Partial<Pick<FleetTankSpec, 'hp' | 'enginePowerHp' | 'weightTons' | 'topSpeedKmh'>>): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donorId, { name, nation });
  Object.assign(spec, stats);
  spec.visual = { ...spec.visual, ...visual };
  stripSilhouetteDimensions(spec.dims);
  return spec;
}

const UA_DIGITAL = { scheme: 'digital', marking: 'number', camoScale: .50 } as const;
const T64_FAMILY_SPECS = {
  // the Soviet T-64BV (T-64B line, Kontakt-1), 1985: the T-64BV1's record (5TDF 700 hp class, 42.4 t)
  t64bv: t64('t64bv', 't64bv1', 'T-64BV', 'USSR/Russia', { number: '642' }, { hp: 1850, weightTons: 42.4, topSpeedKmh: 60 }),
  // the Ukrainian T-64B1V mod. 2022 (MilitaryLand: updated radio, navigation and communication; a gunner shield and slat
  // armour): the T-64BV mod. 2017's record, the slat screens' weight on top
  t64b1v_2022: t64('t64b1v_2022', 't64bv_donbas', 'T-64B1V mod. 2022', 'Ukraine',
    { ...UA_DIGITAL, number: 'UA 22', base: '#46503d', weather: '#5a604d', patches: ['#30382f', '#655f49', '#776c52'] },
    { hp: 2050, enginePowerHp: 850, weightTons: 44.0, topSpeedKmh: 60 }),
  // the T-64BM1M, Kharkiv's Nizh-protected T-64B1 (the T-64B1M of the 2014 Congo order and the National Guard's BM1M):
  // the 6TD-1 (1,000 hp: Army Recognition 2014, MilitaryLand) and 45 t (docs/references/tanks/t64bm1m.md)
  t64bm1m: t64('t64bm1m', 't64bv1', 'T-64BM1M', 'Ukraine',
    { ...UA_DIGITAL, number: '641', base: '#45503b', weather: '#5a604b', patches: ['#2e362c', '#5f5d46', '#746a50'] },
    { hp: 2150, enginePowerHp: 1000, weightTons: 45.0, topSpeedKmh: 65 }),
  // the PT-64 Tur (owner 2026-10-27: "lets create a polish t64 variannnt and add it too"): a first-party Polish what-if,
  // a T-64B1 through the PT-91 Twardy programme (profiles/pt64Tur.ts). The mod. 2017's record; the 5TDFM (850 hp, the
  // T-64BM Bulat's engine) and the ERAWA-2 weight (45.5 t); the Polish three-tone the Zubr wears
  pt64_tur: t64('pt64_tur', 't64bv_donbas', 'PT-64 Tur', 'Poland',
    { scheme: 'nato', base: '#4a563b', weather: '#4a5c42', patches: ['#29342d', '#827458'], marking: 'number', number: '264' },
    { hp: 2150, enginePowerHp: 850, weightTons: 45.5, topSpeedKmh: 60 }),
} satisfies Record<string, FleetTankSpec>;

// The T-64BM1M fires Ukraine's stock 125 mm rounds; as a T-64B1 it has no gun-launched missile (Oryx 2021).
Object.assign(T64_FAMILY_SPECS.t64bm1m.gun.shells[0], { name: '3BM42 Mango APFSDS' });
Object.assign(T64_FAMILY_SPECS.t64bm1m.gun.shells[1], { name: '3BK29 HEAT' });
Object.assign(T64_FAMILY_SPECS.t64bm1m.gun.shells[2], { name: '3OF26 HE-Frag' });
// The PT-64 Tur fires the PT-91's Polish 125 mm APFSDS-T (Mesko's Pronit).
Object.assign(T64_FAMILY_SPECS.pt64_tur.gun.shells[0], { name: 'Pronit APFSDS-T' });

registerFleetSpecs(registries, T64_FAMILY_IDS, T64_FAMILY_SPECS);
