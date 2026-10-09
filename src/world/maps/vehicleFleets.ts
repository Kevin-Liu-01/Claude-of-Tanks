// src/world/maps/vehicleFleets.ts — the map-vehicles lane's catalogue (2026-10-05): real vehicle types at their real
// dimensions, gathered into fleets, one per place and year, and each map's fleet from its `Reference:` line. The eight
// placement roles stay the battlefield's (props.ts places a sedan, a wagon, a van, a pickup, a jeep, a tilt truck, a
// box truck and a flatbed wherever the inhabit pass seats one, and the shards keep their records); the fleet says what
// that role is on this map: on Verdant (Kursk, 1943) the flatbed is a GAZ-AA polutorka and the sedan a GAZ-M1 Emka, in
// Sarajevo (1992-96) a FAP and a Zastava 101, at Glen Canyon (the 1960s) a Loadstar and a Falcon.
//
// Every dimension is the vehicle's own; a body longer or wider than its role's placement box is scaled down to fit it
// (civilianVehicleKit.ts), a tall canvas tilt or box rises over its collision record (the record keeps its height).

import type { VehicleModel } from './vehicleBodies.ts';
import * as M from './vehicleModels.ts';

export type CivilianRole = 'truck' | 'jeep' | 'sedan' | 'wagon' | 'pickup' | 'van' | 'truckbox' | 'truckflatbed';

/** One role's vehicle on a fleet: the model and the liveries its copies wear (sRGB hex, one per copy by place). */
export interface FleetEntry {
  readonly model: VehicleModel;
  readonly paints: readonly number[];
}

export interface Fleet {
  readonly id: string;
  /** Where and when (the reference the fleet dresses). */
  readonly label: string;
  /** 0 new .. 1 derelict: how much rust the bodies carry. */
  readonly age: number;
  readonly roles: Readonly<Record<CivilianRole, FleetEntry>>;
}

// ---------------------------------------------------------------------------------------------------- the fleets

const ARMY_GREEN = [0x4b5320, 0x55602f, 0x4a5232, 0x5b6340];
const US_OD = [0x4a4b2a, 0x505131, 0x55553a];
const WEHRMACHT = [0x5d6151, 0xa8915a, 0x6b6a52];
const BRITISH = [0x4e4a36, 0x5a5640, 0x6b5f42];
const PERIOD_CIVIL = [0x1c1c1c, 0x232628, 0x2f3a2c, 0x3b2f2a, 0x283548, 0x5a2a28];
const SIXTIES_EU = [0xe8e2d0, 0x9a3328, 0x2f5f8a, 0x7a8f5a, 0xc8b26e, 0x4a4a46, 0x8aa0a8];
const EIGHTIES = [0xe8e8e2, 0xa82b22, 0x1f3f6e, 0x9aa0a4, 0x3e5a3a, 0xc8b070, 0x2a2a2a];
const DESERT_CARS = [0xece8dc, 0xd8d2c0, 0x9a3a2a, 0x2e4f7a, 0xb8a888, 0x8a8a84];
const ASIA_CARS = [0xf0f0ec, 0xc8ccd0, 0x2a2c30, 0x7a1e22, 0x3a5a8a, 0xb8b4a6];
/** Today's European cars: white, silver and greys, black, a dark blue, a red. */
const PRESENT_EU = [0xf2f2ee, 0xb8bcc0, 0x6a6e72, 0x1e2024, 0x22344e, 0x9a2a26];

const fleet = (id: string, label: string, age: number, roles: Record<CivilianRole, [VehicleModel, readonly number[]]>): Fleet => ({
  id, label, age,
  roles: Object.fromEntries(Object.entries(roles).map(([k, [model, paints]]) => [k, { model, paints }])) as Record<CivilianRole, FleetEntry>,
});

export const FLEETS: Readonly<Record<string, Fleet>> = {
  soviet1943: fleet('soviet1943', 'Kursk salient, 1943', 0.35, {
    sedan: [M.GAZ_M1, [0x1d1e1c, 0x2b3128, 0x2a3036, 0x3a4030]], wagon: [M.GAZ_61, [0x3e4730, 0x2b3128, 0x4b5320]],
    pickup: [M.GAZ_M415, ARMY_GREEN], van: [M.WC_54, US_OD], jeep: [M.GAZ_67B, ARMY_GREEN],
    truck: [M.ZIS_5V, ARMY_GREEN], truckbox: [M.GAZ_AA_BOX, ARMY_GREEN], truckflatbed: [M.GAZ_AA, [...ARMY_GREEN, 0x6a6a58]],
  }),
  eastfront1945: fleet('eastfront1945', 'the Podhale, January 1945', 0.35, {
    sedan: [M.GAZ_M1, [0x1d1e1c, 0x2b3128, 0x3a4030]], wagon: [M.KUBEL, WEHRMACHT], pickup: [M.WC_51, US_OD], van: [M.WC_54, US_OD],
    jeep: [M.GAZ_67B, ARMY_GREEN], truck: [M.STUDEBAKER_US6, [0x4a4b2a, 0x4b5320]], truckbox: [M.GAZ_AA_BOX, ARMY_GREEN],
    truckflatbed: [M.OPEL_BLITZ, WEHRMACHT],
  }),
  western1944: fleet('western1944', 'the Western Front, 1944-45', 0.3, {
    sedan: [M.TRACTION, [0x1c1c1c, 0x232323, 0x3b2f2a, 0x2c3330]], wagon: [M.KUBEL, WEHRMACHT], pickup: [M.WC_51, US_OD],
    van: [M.WC_54, US_OD], jeep: [M.WILLYS_MB, US_OD], truck: [M.GMC_CCKW, US_OD], truckbox: [M.OPEL_BLITZ_BOX, WEHRMACHT],
    truckflatbed: [M.OPEL_BLITZ, WEHRMACHT],
  }),
  britishIndia1944: fleet('britishIndia1944', 'Kohima and the Naga hills, 1944', 0.35, {
    sedan: [M.HUMBER_SNIPE, BRITISH], wagon: [M.HUMBER_UTILITY, BRITISH], pickup: [M.AUSTIN_TILLY, BRITISH], van: [M.AUSTIN_K2, BRITISH],
    jeep: [M.WILLYS_MB, US_OD], truck: [M.BEDFORD_QL, BRITISH], truckbox: [M.BEDFORD_MW_BOX, BRITISH], truckflatbed: [M.CMP_C60L, BRITISH],
  }),
  norway1940: fleet('norway1940', 'Narvik and Bjerkvik, 1940', 0.25, {
    sedan: [M.FORD_V8_1938, PERIOD_CIVIL], wagon: [M.CHEVROLET_1936, PERIOD_CIVIL], pickup: [M.FORD_PICKUP_1940, [0x2a2a2a, 0x3a4a5a, 0x5a2a28]],
    van: [M.FORD_PANEL_1940, [0x2a3a4a, 0x5a2a28, 0x2a2a2a]], jeep: [M.KUBEL, WEHRMACHT], truck: [M.VOLVO_LV, [0x2a3a4a, 0x3a4030, 0x5a2a28]],
    truckbox: [M.FORD_V8_TRUCK_BOX, [0x2a3a4a, 0x4a3a2a]], truckflatbed: [M.CHEVROLET_DROPSIDE, [0x2a3a4a, 0x3a4030, 0x6a5a3a]],
  }),
  us1941: fleet('us1941', 'Longleaf, Louisiana, the 1941 maneuvers', 0.3, {
    sedan: [M.FORD_1940, PERIOD_CIVIL], wagon: [M.FORD_WOODY, [0x2a2a2a, 0x3a4a3a, 0x5a2a28]], pickup: [M.FORD_PICKUP_1940, [0x2a2a2a, 0x3a4a5a, 0x7a2a22]],
    van: [M.FORD_PANEL_1940, [0x2a3a4a, 0x7a2a22, 0x2a2a2a]], jeep: [M.BANTAM_BRC40, US_OD], truck: [M.CHEVROLET_G506, US_OD],
    truckbox: [M.FORD_V8_TRUCK_BOX, [0x2a3a4a, 0x7a2a22]], truckflatbed: [M.LOGGING_TRUCK_1940, [0x2a2a2a, 0x7a2a22, 0x3a4030]],
  }),
  shanghai1937: fleet('shanghai1937', 'Shanghai, 1937', 0.3, {
    sedan: [M.BUICK_1935, PERIOD_CIVIL], wagon: [M.CHEVROLET_1934, PERIOD_CIVIL], pickup: [M.FORD_PICKUP_1940, [0x2a2a2a, 0x3a4a5a, 0x5a2a28]],
    van: [M.AUSTIN_7_VAN, [0x2a3a4a, 0x5a2a28, 0x6a5a2a]], jeep: [M.KUROGANE_95, [0x5a5a3a, 0x6a6448]], truck: [M.ISUZU_TYPE94, [0x5a5a3a, 0x6a6448]],
    truckbox: [M.FORD_1934_BOX, [0x2a3a4a, 0x5a2a28]], truckflatbed: [M.DODGE_1936, [0x2a3a4a, 0x3a4030, 0x5a4a2a]],
  }),
  soviet1950s: fleet('soviet1950s', 'the Virgin Lands, the 1950s', 0.3, {
    sedan: [M.POBEDA, [0x2b3a2e, 0x6a7a8a, 0x3a3a3a, 0xb0a890, 0x5a2a28]], wagon: [M.MOSKVITCH_423, [0x6a7a8a, 0xb0a890, 0x3a5a4a]],
    pickup: [M.GAZ_M415, ARMY_GREEN], van: [M.UAZ_450, [0x5a6b3e, 0x8a9a8a]], jeep: [M.GAZ_69, [0x4b5320, 0x55602f]],
    truck: [M.ZIS_150, [0x3a5a4a, 0x4b5320, 0x6a7a8a]], truckbox: [M.GAZ_51_BOX, [0x3a5a4a, 0x4b5320]], truckflatbed: [M.GAZ_51, [0x3a5a4a, 0x4b5320, 0x6a7a8a]],
  }),
  germany1960s: fleet('germany1960s', 'the Ruhr coalfield, the 1960s', 0.3, {
    sedan: [M.VW_BEETLE, SIXTIES_EU], wagon: [M.OPEL_REKORD_CARAVAN, SIXTIES_EU], pickup: [M.VW_T1_PICKUP, [0x6a7a8a, 0xb0a890, 0x5a6a4a]],
    van: [M.VW_T1, [0x6a7a8a, 0x9a3328, 0x2f5f8a, 0x8aa070]], jeep: [M.DKW_MUNGA, [0x5a5f4a, 0x6a6a56]], truck: [M.MERCEDES_L3500, [0x3a4a5a, 0x6a2a22, 0x5a5f4a]],
    truckbox: [M.MERCEDES_L319_BOX, [0xe8e2d0, 0x2f5f8a, 0xc8a83a]], truckflatbed: [M.MAGIRUS_COAL, [0x3a4a5a, 0x5a2a22, 0x4a4a46]],
  }),
  germany1980s: fleet('germany1980s', 'Hesse and Franconia, the 1980s', 0.15, {
    sedan: [M.VW_GOLF1, EIGHTIES], wagon: [M.MERCEDES_W123T, [0xe8e8e2, 0x9aa0a4, 0x2a3a5a, 0xc8b070]], pickup: [M.VW_CADDY, EIGHTIES],
    van: [M.VW_T3, [0xe8e8e2, 0xd8c060, 0x2a5a8a, 0xa82b22]], jeep: [M.VW_ILTIS, [0x5a5f4a, 0x4a5040]], truck: [M.MERCEDES_LP813, [0xe8e8e2, 0xa82b22, 0x2a5a8a]],
    truckbox: [M.MERCEDES_LP813_BOX, [0xe8e8e2, 0xd8c060]], truckflatbed: [M.UNIMOG_406, [0xc8a83a, 0x3a5a3a, 0xa82b22]],
  }),
  france1960s: fleet('france1960s', 'the Breton coast, the 1960s', 0.3, {
    sedan: [M.RENAULT_4, SIXTIES_EU], wagon: [M.CITROEN_2CV, [0x8a9aa0, 0x7a2a22, 0xd8d0b8, 0x3a4a3a]], pickup: [M.PEUGEOT_404_PICKUP, SIXTIES_EU],
    van: [M.CITROEN_H, [0x9aa0a4, 0x6a7a8a, 0x2f4f6a]], jeep: [M.MEHARI, [0xd8a03a, 0x8aa070, 0xc84a2a]], truck: [M.BERLIET_GLR, [0x2f4f6a, 0x6a2a22, 0x9aa0a4]],
    truckbox: [M.SAVIEM_BOX, [0xe8e2d0, 0x2f4f6a]], truckflatbed: [M.SAVIEM_FLATBED, [0x2f4f6a, 0x6a2a22]],
  }),
  // 2026-10-08 (the coordinator): Saltmere Bay is the Breton coast today, not the 1960s
  france2020s: fleet('france2020s', 'the Breton coast (the Pays de Leon), the present day', 0.2, {
    sedan: [M.RENAULT_CLIO_4, PRESENT_EU], wagon: [M.PEUGEOT_308_SW, PRESENT_EU], pickup: [M.HILUX_DC, [0xf2f2ee, 0xb8bcc0, 0x22344e, 0x6a6e72]],
    van: [M.CITROEN_BERLINGO, [0xf2f2ee, 0xe8e8e4, 0xb8bcc0, 0x22344e]], jeep: [M.DACIA_DUSTER, [0xb8bcc0, 0x6a6e72, 0x2f4a3a, 0xf2f2ee, 0x9a3a2a]],
    truck: [M.RENAULT_TRUCKS_D, [0xf2f2ee, 0x2e5a8a, 0xb8bcc0]], truckbox: [M.RENAULT_MASTER_BOX, [0xf2f2ee, 0xe8e8e4]],
    truckflatbed: [M.IVECO_DAILY_DROPSIDE, [0xf2f2ee, 0x2e5a8a, 0xb8bcc0]],
  }),
  iberia1970s: fleet('iberia1970s', 'Ronda and the Serrania, the 1970s', 0.3, {
    sedan: [M.SEAT_600, SIXTIES_EU], wagon: [M.SEAT_124_FAMILIAR, SIXTIES_EU], pickup: [M.SANTANA_PICKUP, [0x6a7a5a, 0xd8d0b8, 0x2f4f6a]],
    van: [M.SAVA_J4, [0xd8d0b8, 0x2f4f6a, 0x7a2a22]], jeep: [M.SANTANA_88, [0x6a7a5a, 0xd8d0b8]], truck: [M.PEGASO_COMET, [0x2f4f6a, 0x7a2a22, 0xd8a03a]],
    truckbox: [M.EBRO_BOX, [0xe8e2d0, 0x2f4f6a]], truckflatbed: [M.BARREIROS_DROPSIDE, [0x2f4f6a, 0x7a2a22]],
  }),
  us1960s: fleet('us1960s', 'the American Southwest, the 1960s', 0.2, {
    sedan: [M.FORD_FALCON, [0x2e7f80, 0xe9e4d6, 0xa83226, 0xc8b78a, 0x3a5f8a, 0x7a9e7e]], wagon: [M.FORD_FALCON_WAGON, [0xe9e4d6, 0xc8b78a, 0x7a9e7e, 0x8a2e2a]],
    pickup: [M.FORD_F100, [0x2e7f80, 0xe9e4d6, 0x8a2e2a, 0x3a5f8a, 0xb08d4a]], van: [M.ECONOLINE, [0xe9e4d6, 0x3a5f8a, 0xc9a227]],
    jeep: [M.JEEP_CJ5, [0xc9a227, 0x5f6b44, 0xa83226, 0xe9e4d6]], truck: [M.FORD_F600_STAKE, [0xe9e4d6, 0xc9a227, 0x3a5f8a]],
    truckbox: [M.FORD_F600_BOX, [0xe9e4d6, 0xc9a227]], truckflatbed: [M.IH_LOADSTAR, [0xc9a227, 0xe9e4d6, 0x8a2e2a]],
  }),
  arctic1980s: fleet('arctic1980s', 'a DEW Line station, the 1980s', 0.2, {
    sedan: [M.CHEVROLET_CAPRICE, [0x8a2a22, 0x2a3a5a, 0xe8e8e2]], wagon: [M.CHEVROLET_SUBURBAN, [0xa82b22, 0xe8e8e2, 0x3a5a3a]],
    pickup: [M.FORD_F250, [0xa82b22, 0xe8e8e2, 0x2a3a5a, 0xd8a03a]], van: [M.CHEVY_G20, [0xe8e8e2, 0xd8a03a]], jeep: [M.JEEP_CJ7, [0xd8a03a, 0xa82b22]],
    truck: [M.US_CONVENTIONAL_TILT, [0xd8a03a, 0xe8e8e2, 0xa82b22]], truckbox: [M.US_CONVENTIONAL_BOX, [0xe8e8e2, 0xd8a03a]],
    truckflatbed: [M.US_CONVENTIONAL_FLATBED, [0xd8a03a, 0xa82b22]],
  }),
  yugoslav1990s: fleet('yugoslav1990s', 'Bosnia and Dalmatia, the 1980s-90s', 0.3, {
    sedan: [M.ZASTAVA_101, [0xd8d4c8, 0xb03a2e, 0xd9772b, 0x2c6e8f, 0xcdbf8c, 0x4a4a48]], wagon: [M.YUGO_45, [0xd8d4c8, 0xb03a2e, 0x2c6e8f, 0xd4c48c, 0x6a7a3a]],
    pickup: [M.HILUX_N50, [0xeeeeea, 0xb03a2e, 0x8a8f86]], van: [M.VW_T3, [0xd8d4c8, 0x2c6e8f, 0xc9a227, 0xeeeeea]],
    jeep: [M.LADA_NIVA, [0xeeeeea, 0x4a5a3a, 0xc9a227, 0xb03a2e]], truck: [M.TAM_110, [0x4a5a3a, 0x525d40]],
    truckbox: [M.TAM_80_BOX, [0xd8d4c8, 0x2c6e8f, 0x4a5a3a]], truckflatbed: [M.FAP_1314, [0xd9772b, 0x2c6e8f, 0x4a5a3a]],
  }),
  ukraine2022: fleet('ukraine2022', 'Kyiv oblast, 2022', 0.25, {
    sedan: [M.VAZ_2107, [0xe8e8e2, 0x9aa0a4, 0x2a2d30, 0x7a1e1e, 0x3d6b45, 0x6b7a8a]], wagon: [M.VAZ_2104, [0xe8e8e2, 0x9aa0a4, 0x6b7a8a, 0x7a5a3a]],
    pickup: [M.HILUX_DC, [0xe8e8e2, 0x2a2d30, 0x9aa0a4, 0x4b5a32]], van: [M.UAZ_452, [0x5a6b3e, 0xe8e8e2, 0x4a6a8a]],
    jeep: [M.LADA_NIVA, [0x3d6b45, 0xe8e8e2, 0x9aa0a4, 0x7a1e1e]], truck: [M.KAMAZ_4326, [0x4b5a32, 0xd9822b]],
    truckbox: [M.GAZ_3307_BOX, [0x2f5d8a, 0x4b5a32, 0xe8e8e2]], truckflatbed: [M.ZIL_130, [0x3a6fa0, 0x4b5a32, 0xd9822b]],
  }),
  maghreb: fleet('maghreb', 'the Dahar, southern Tunisia', 0.35, {
    sedan: [M.PEUGEOT_404, DESERT_CARS], wagon: [M.PEUGEOT_504_BREAK, DESERT_CARS], pickup: [M.PEUGEOT_404_PICKUP, DESERT_CARS],
    van: [M.HIACE_H50, [0xece8dc, 0xd8d2c0, 0x2e4f7a]], jeep: [M.LAND_ROVER_S3, [0xd8cfb8, 0x6a7a5a, 0x2e4f7a]], truck: [M.MERCEDES_L911, [0x2e4f7a, 0x9a3a2a, 0xd8d2c0]],
    truckbox: [M.MERCEDES_L911_BOX, [0xece8dc, 0x2e4f7a]], truckflatbed: [M.MERCEDES_L911_FLATBED, [0x2e4f7a, 0x9a3a2a, 0x6a7a5a]],
  }),
  egypt: fleet('egypt', 'Siwa oasis', 0.35, {
    sedan: [M.PEUGEOT_504, [0xece8dc, 0x2a2a2a, 0x9a3a2a, 0xd8c87a]], wagon: [M.PEUGEOT_504_BREAK, DESERT_CARS], pickup: [M.HILUX_N70, DESERT_CARS],
    van: [M.HIACE_H50, [0xece8dc, 0xd8d2c0]], jeep: [M.LAND_CRUISER_70, [0xece8dc, 0xd8cfb8]], truck: [M.MERCEDES_L911, [0x2e4f7a, 0x9a3a2a]],
    truckbox: [M.MERCEDES_L911_BOX, [0xece8dc, 0x2e4f7a]], truckflatbed: [M.WATER_TANKER, [0x2e4f7a, 0xece8dc]],
  }),
  levant1982: fleet('levant1982', 'the Chouf, 1982', 0.3, {
    sedan: [M.MERCEDES_W123, [0xe8e2d0, 0xd8c87a, 0x2a2a2a, 0x8a8a84, 0x3a4a6a]], wagon: [M.PEUGEOT_504_BREAK, DESERT_CARS],
    pickup: [M.HILUX_N50, [0xeeeeea, 0x9a3a2a, 0x6a7a5a]], van: [M.FORD_TRANSIT_MK2, [0xe8e8e2, 0x2e4f7a]], jeep: [M.LAND_ROVER_S3, [0x6a7a5a, 0xd8cfb8]],
    truck: [M.MERCEDES_LP1513, [0x2e4f7a, 0x9a3a2a, 0xe8e8e2]], truckbox: [M.MERCEDES_LP1513_BOX, [0xe8e8e2, 0x2e4f7a]],
    truckflatbed: [M.MERCEDES_L911_FLATBED, [0x2e4f7a, 0x9a3a2a]],
  }),
  jordan: fleet('jordan', 'Wadi Rum', 0.3, {
    sedan: [M.COROLLA_E110, ASIA_CARS], wagon: [M.LAND_CRUISER_80, [0xf0f0ec, 0xc8ccd0, 0x6a6a5a]], pickup: [M.HILUX_N70, [0xf0f0ec, 0xc8ccd0, 0x9a3a2a]],
    van: [M.HIACE_H50, [0xf0f0ec, 0xc8ccd0]], jeep: [M.LAND_CRUISER_70, [0xf0f0ec, 0xd8cfb8, 0x6a6a5a]], truck: [M.ISUZU_FTR, [0xf0f0ec, 0x2e4f7a]],
    truckbox: [M.ISUZU_ELF_BOX, [0xf0f0ec, 0xc8ccd0]], truckflatbed: [M.WATER_TANKER, [0xf0f0ec, 0x2e4f7a, 0x9a3a2a]],
  }),
  japan: fleet('japan', 'the Aso caldera', 0.15, {
    sedan: [M.COROLLA_E110, ASIA_CARS], wagon: [M.TOYOTA_PROBOX, [0xf0f0ec, 0xc8ccd0]], pickup: [M.SUZUKI_CARRY, [0xf0f0ec, 0xc8ccd0, 0x3a5a3a]],
    van: [M.SUZUKI_EVERY, [0xf0f0ec, 0xc8ccd0]], jeep: [M.SUZUKI_JIMNY, [0x3a5a3a, 0xf0f0ec, 0x8a6a3a]], truck: [M.FUSO_FIGHTER, [0xf0f0ec, 0x2e4f7a]],
    truckbox: [M.ISUZU_ELF_BOX, [0xf0f0ec, 0x2e6f9a]], truckflatbed: [M.HINO_RANGER, [0xf0f0ec, 0x2e6f9a, 0x6a8a4a]],
  }),
  bangladesh: fleet('bangladesh', 'the Jamuna chars', 0.4, {
    sedan: [M.COROLLA_E110, ASIA_CARS], wagon: [M.TOYOTA_PROBOX, [0xf0f0ec, 0xc8ccd0]], pickup: [M.BOLERO_PICKUP, [0xf0f0ec, 0x9a3a2a]],
    van: [M.HIACE_H100, [0xf0f0ec, 0xc8ccd0, 0x3a5a8a]], jeep: [M.MAHINDRA_MM540, [0x3a5a3a, 0xf0f0ec]], truck: [M.TATA_1613, [0xd8a03a, 0x2e6f9a, 0xc84a2a, 0x3a8a5a]],
    truckbox: [M.TATA_407_BOX, [0xf0f0ec, 0x2e6f9a]], truckflatbed: [M.TATA_1613_DROPSIDE, [0xd8a03a, 0x2e6f9a, 0xc84a2a]],
  }),
  vietnam: fleet('vietnam', 'Ca Mau', 0.35, {
    sedan: [M.TOYOTA_VIOS, ASIA_CARS], wagon: [M.TOYOTA_INNOVA, [0xf0f0ec, 0xc8ccd0]], pickup: [M.KIA_K190, [0x2e6f9a, 0xf0f0ec]],
    van: [M.FORD_TRANSIT_MK2, [0xf0f0ec, 0xc8ccd0]], jeep: [M.UAZ_469, [0x4b5a32, 0x5a6b3e]], truck: [M.HYUNDAI_MIGHTY, [0x2e6f9a, 0xf0f0ec]],
    truckbox: [M.ISUZU_ELF_BOX, [0xf0f0ec, 0x2e6f9a]], truckflatbed: [M.THACO_DROPSIDE, [0x2e6f9a, 0xf0f0ec, 0x3a8a5a]],
  }),
  australia1970s: fleet('australia1970s', 'Queenstown, Tasmania', 0.3, {
    sedan: [M.HOLDEN_HQ, SIXTIES_EU], wagon: [M.HOLDEN_HQ_WAGON, SIXTIES_EU], pickup: [M.HOLDEN_UTE, SIXTIES_EU], van: [M.FORD_TRANSIT_MK2, [0xe8e2d0, 0x2f5f8a]],
    jeep: [M.LAND_CRUISER_FJ40, [0x3a5a3a, 0xc8b26e, 0x2f5f8a]], truck: [M.INTERNATIONAL_ACCO, [0xc8a83a, 0x2f5f8a, 0xe8e2d0]],
    truckbox: [M.BEDFORD_TK_BOX, [0xe8e2d0, 0xc8a83a]], truckflatbed: [M.INTERNATIONAL_TIMBER, [0xc8a83a, 0x9a3328]],
  }),
};

/** Each map's fleet, from its Reference: line (the integrator's list of 2026-10-05). */
const MAP_FLEETS: Readonly<Record<string, string>> = {
  verdant: 'soviet1943', winter: 'eastfront1945',
  alpine: 'western1944', foundry: 'western1944', reservoir: 'western1944', polders: 'western1944', autumn: 'western1944',
  monsoon: 'britishIndia1944', fjord: 'norway1940', longleaf: 'us1941', blackglass: 'shanghai1937',
  steppe: 'soviet1950s', railyard: 'germany1960s', frontier: 'germany1980s', urban: 'germany1980s',
  coastal: 'france2020s', cliffbridge: 'iberia1970s', skybridge: 'us1960s', titan_gorge: 'us1960s', whiteout: 'arctic1980s',
  ruinspires: 'yugoslav1990s', saltwind: 'yugoslav1990s', airfield: 'ukraine2022',
  desert: 'maghreb', oasis: 'egypt', orchard: 'levant1982', badlands: 'jordan',
  caldera: 'japan', delta: 'bangladesh', mangrove: 'vietnam', copper_mesa: 'australia1970s',
};

export const DEFAULT_FLEET = 'ukraine2022';

export function fleetForMap(mapId: string): Fleet {
  return FLEETS[MAP_FLEETS[mapId] ?? DEFAULT_FLEET];
}

// ---------------------------------------------------------------------------------------------------- the soil

export interface VehicleClimate {
  /** Soil splashed up the lower body (sRGB hex) and how much. */
  readonly dirt: number;
  readonly dirtAmount: number;
  /** Dust on the top faces (sRGB hex) and how much (dry maps). */
  readonly dust: number;
  readonly dustAmount: number;
  /** A snowbound map: the sleds leave runner grooves and carry snow on their decks and loads (cartBodies.ts). */
  readonly snow?: boolean;
}

const TEMPERATE: VehicleClimate = { dirt: 0x4a3c2c, dirtAmount: 0.5, dust: 0x8a7c66, dustAmount: 0 };
const ARID: VehicleClimate = { dirt: 0x8c7454, dirtAmount: 0.45, dust: 0xb09872, dustAmount: 0.35 };
const RED_ROCK: VehicleClimate = { dirt: 0x8a4e30, dirtAmount: 0.5, dust: 0xb07a52, dustAmount: 0.35 };
const SNOW: VehicleClimate = { dirt: 0x5a5650, dirtAmount: 0.45, dust: 0x9a968c, dustAmount: 0, snow: true };
const TROPICAL: VehicleClimate = { dirt: 0x6a4a30, dirtAmount: 0.6, dust: 0x8a7458, dustAmount: 0.05 };
const ASH: VehicleClimate = { dirt: 0x2e2c2a, dirtAmount: 0.55, dust: 0x4e4a46, dustAmount: 0.25 };
const BLACK_EARTH: VehicleClimate = { dirt: 0x2e2620, dirtAmount: 0.6, dust: 0x6a5e50, dustAmount: 0.05 };

const MAP_CLIMATES: Readonly<Record<string, VehicleClimate>> = {
  verdant: BLACK_EARTH, steppe: { ...ARID, dirt: 0x7a6a4e, dustAmount: 0.25 }, desert: ARID, oasis: ARID, badlands: RED_ROCK,
  titan_gorge: RED_ROCK, skybridge: RED_ROCK, copper_mesa: { ...RED_ROCK, dirt: 0x6e5a48 }, frontier: TEMPERATE,
  winter: SNOW, whiteout: SNOW, alpine: SNOW, delta: TROPICAL, mangrove: TROPICAL, monsoon: TROPICAL,
  caldera: ASH, orchard: { ...ARID, dustAmount: 0.2 },
};

export function climateForMap(mapId: string): VehicleClimate {
  return MAP_CLIMATES[mapId] ?? TEMPERATE;
}
