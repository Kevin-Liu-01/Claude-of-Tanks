/**
 * Weapon audio: one table keyed by bore class and ammunition construction (gun-reports-269, owner 2026-11-03: "better
 * cannonn sounds for all calibers, interior sounds for shell reloads for different claibers"). A row names the four
 * reports a shot of its weapon plays (the close report beside it, the crew's own from the hatch, the closed turret's
 * interior, the distant boom), the muzzle brake's character, how far the report carries, and what the loader does
 * next: the reload choreography follows the round's construction and the loader's make, timed to the authoritative
 * reload. Pure data and policy, no WebAudio.
 *
 * A weapon's key comes from its vehicle's own spec (weaponMounts): the gun's bore, and the construction its rounds
 * imply (guided, rocket, belt, a British BL gun's bagged charge, a gun-launcher's caseless round, the Soviet-pattern
 * 125 mm's two pieces, a combustible case, a separate cased charge, a unitary brass case). The census
 * (tools/audio/weapon-census.mjs → weaponCensus.generated.ts) lists every key the fleet fires: a key with no row fails
 * typecheck (FLEET_ROWS), and weaponCensus.selftest.mjs fails when the census no longer matches the fleet.
 */

import { MAIN_GUN_LOADER, READY_RACK_DOOR, type FleetWeaponKey } from './weaponCensus.generated.ts';

/** How a round is built: what the breech gives up after the shot, and how the next one goes in. */
export type AmmoBuild =
  /** machine guns and autocannons: linked rounds on a belt, cases thrown out of the gun */
  | 'belt'
  /** a one-piece round in a brass (or lacquered steel) case, thrown out after the shot and clanging on the floor */
  | 'unitary_brass'
  /** the case burns with the charge: only its metal stub base is left */
  | 'combustible'
  /** the Soviet-pattern 125 mm: projectile, then a semi-combustible charge with a steel stub, rammed one after the other */
  | 'two_piece'
  /** a British BL gun: projectile, then cloth-bagged charges, fired by a vent tube; no case at all */
  | 'separate_bag'
  /** a heavy gun or howitzer: projectile, then a brass-cased charge, the big case thrown out after the shot */
  | 'separate_case'
  /** a gun-launcher's fully combustible round: nothing left in the breech, the bore purged by the scavenger */
  | 'caseless'
  /** a guided round from a tube, canister, rail or the gun itself */
  | 'missile'
  /** an unguided heavy rocket from a launcher tube */
  | 'rocket';

type WeaponFamily = 'mg' | 'autocannon' | 'cannon' | 'launcher';
/** What sits on the muzzle: it decides where the blast goes, and so where a report is loudest. */
type MuzzleBrake = 'none' | 'flash_hider' | 'deflector' | 'double_baffle' | 'multi_baffle';
type Rifling = 'rifled' | 'smoothbore' | 'none';
/** The round's heft in the loader's hands: it picks the weight of every handling cue. */
type RoundWeight = 'light' | 'medium' | 'heavy' | 'superheavy';

/** Who or what puts the next round in: by make (vehicles/internalLayoutRegistry.ts names the autoloaders). */
export type LoaderMake =
  | 'manual'
  /** the T-72/T-90 lineage's AZ carousel under the floor: the stub goes out through a hatch in the turret rear */
  | 'carousel_az'
  /** the T-64/T-80 lineage's MZ conveyor basket: the stub is caught and put back in the empty tray */
  | 'basket_mz'
  /** the T-14's carousel under an unmanned turret, heard from the crew capsule through a bulkhead */
  | 'carousel_unmanned'
  /** a turret-bustle magazine and rammer (Leclerc, Type 90/10, K2, KF51, M1A3) */
  | 'bustle'
  /** the Strv 103's hull magazine feeding a gun fixed in the hull; the case goes out of the rear */
  | 'fixed_ram'
  /** an infantry fighting vehicle's gun autoloader (the BMP-3's 2A70) */
  | 'ifv_autoloader'
  | 'autocannon'
  /** a guided round's launcher, reloaded through a roof hatch */
  | 'launcher'
  /** the TOS-1A's tubes, filled by its reloading crane */
  | 'rocket_rack'
  /** the AC-130's crew loading the howitzer by hand in the cabin */
  | 'gunship'
  /** a missile armed on an aircraft's wing pylon */
  | 'pylon';

export type WeaponKey =
  | '7.62/belt' | '12.7/belt'
  | '20/belt' | '25/belt' | '30/belt' | '35/belt' | '40/belt' | '50/belt'
  | '76/unitary_brass' | '84/unitary_brass' | '90/unitary_brass' | '100/unitary_brass' | '100lp/unitary_brass' | '105/unitary_brass'
  | '120/combustible' | '120/separate_bag' | '125/two_piece' | '130/combustible'
  | '152/separate_case' | '152/caseless' | '165/separate_bag' | '170/separate_case'
  | '220/rocket' | 'guided/missile'
  | 'ac130-30/belt' | 'ac130-105/unitary_brass' | 'ac130-missile/missile';

export interface WeaponRow {
  readonly key: WeaponKey;
  readonly family: WeaponFamily;
  /** The fleet's ordnance this row stands for (the census lists it). */
  readonly ordnance: string;
  readonly boreMm: number;
  readonly build: AmmoBuild;
  readonly rifling: Rifling;
  readonly barrel: string;
  readonly brake: MuzzleBrake;
  readonly weight: RoundWeight;
  /** The close (exterior) report: what everyone near the gun hears. */
  readonly close: string;
  /** The crew's own report from the hatch beside it (null: the close report at our level). */
  readonly own: string | null;
  /** The closed turret's report, close-miked at the loader's station: our own shot in the sight. */
  readonly interior: string | null;
  /** The distant report, crossfaded in by range. */
  readonly far: string;
  /** Reference loudness of the report at 1 m (dB, engine-internal scale). */
  readonly loudDb: number;
  /** Close (exterior) report fades out between these ranges (m)… */
  readonly closeFadeM: readonly [number, number];
  /** …while the distant report fades in across these. */
  readonly farFadeM: readonly [number, number];
  /** Playback-rate pitch applied to the shared outdoor tail. */
  readonly tailRate: number;
  readonly tailGain: number;
  /** Mechanical action after the report: recoil latch / feed (s). */
  readonly actionDelayS: number;
  /** The loader when the vehicle's layout names no autoloader. */
  readonly loader: LoaderMake;
  /** What the breech gives up after the shot (null: nothing the crew hears). */
  readonly spent: string | null;
  /** The L9's charge rides in the projectile's perforated base: no separate bag to load. */
  readonly chargeInBase?: true;
}

const R = (row: WeaponRow): WeaponRow => Object.freeze(row);

/** The shared shape of a high-velocity tank gun's row (its reach and report), by bore. */
function cannon(key: WeaponKey, boreMm: number, build: AmmoBuild, prefix: string, rest: Omit<WeaponRow, 'key' | 'family' | 'boreMm' | 'build' | 'close' | 'own' | 'interior' | 'far' | 'loader'> & { loader?: LoaderMake }): WeaponRow {
  return R({
    key, family: 'cannon', boreMm, build, close: `${prefix}_close`, own: `${prefix}_own`, interior: `${prefix}_interior`,
    far: `${prefix}_far`, loader: rest.loader ?? 'manual', ...rest,
  });
}

function autocannon(key: WeaponKey, boreMm: number, ordnance: string, brake: MuzzleBrake, reach: Pick<WeaponRow, 'loudDb' | 'closeFadeM' | 'farFadeM' | 'tailRate' | 'tailGain' | 'actionDelayS'>): WeaponRow {
  const id = `ac_${boreMm}`;
  return R({
    key, family: 'autocannon', ordnance, boreMm, build: 'belt', rifling: 'rifled', barrel: 'long', brake, weight: 'light',
    close: `${id}_close`, own: `${id}_own`, interior: `${id}_interior`, far: `${id}_far`, loader: 'autocannon', spent: null, ...reach,
  });
}

export const WEAPON_ROWS: { readonly [K in WeaponKey]: WeaponRow } = Object.freeze({
  '7.62/belt': R({
    key: '7.62/belt', family: 'mg', ordnance: 'PKT, M240, MG3, FN MAG, L37/L94, Ksp 58, UKM-2000 (roof, loader and remote stations)',
    boreMm: 7.62, build: 'belt', rifling: 'rifled', barrel: 'long', brake: 'flash_hider', weight: 'light',
    close: 'mg_rifle_close', own: 'mg_rifle_own', interior: 'mg_rifle_interior', far: 'mg_rifle_far',
    loudDb: 118, closeFadeM: [30, 140], farFadeM: [40, 160], tailRate: 1.45, tailGain: 0.12, actionDelayS: 0, loader: 'autocannon', spent: null,
  }),
  '12.7/belt': R({
    key: '12.7/belt', family: 'mg', ordnance: 'M2HB, NSVT, Kord, DShK, QJC-88, WKM-B, K6 (roof and remote stations); the Ares APC\'s L111A1',
    boreMm: 12.7, build: 'belt', rifling: 'rifled', barrel: 'long', brake: 'flash_hider', weight: 'light',
    close: 'mg_heavy_close', own: 'mg_heavy_own', interior: 'mg_heavy_interior', far: 'mg_heavy_far',
    loudDb: 124, closeFadeM: [40, 190], farFadeM: [50, 220], tailRate: 1.3, tailGain: 0.18, actionDelayS: 0, loader: 'autocannon', spent: null,
  }),
  '20/belt': autocannon('20/belt', 20, 'Rh 202 (Marder 1A3, AMX-10P, the MBT-70\'s station)', 'multi_baffle',
    { loudDb: 128, closeFadeM: [45, 210], farFadeM: [60, 260], tailRate: 1.22, tailGain: 0.3, actionDelayS: 0.03 }),
  '25/belt': autocannon('25/belt', 25, 'M242 Bushmaster chain gun (Bradley, Dardo, AMX-10P 25, Linebacker)', 'flash_hider',
    { loudDb: 130, closeFadeM: [50, 230], farFadeM: [65, 280], tailRate: 1.16, tailGain: 0.34, actionDelayS: 0.035 }),
  '30/belt': autocannon('30/belt', 30, '2A42, 2A72, Mk 30-2, L21A1 Rarden, the 30 mm remote cannons', 'multi_baffle',
    { loudDb: 132, closeFadeM: [55, 250], farFadeM: [70, 300], tailRate: 1.1, tailGain: 0.38, actionDelayS: 0.04 }),
  '35/belt': autocannon('35/belt', 35, 'Oerlikon KDE 35 (CV9035, Lynx KF41, Type 89, the ZTZ-100 prototype)', 'multi_baffle',
    { loudDb: 133.5, closeFadeM: [58, 260], farFadeM: [75, 310], tailRate: 1.07, tailGain: 0.41, actionDelayS: 0.045 }),
  '40/belt': autocannon('40/belt', 40, 'Bofors 40/70 (CV9040, Ajax, K21)', 'multi_baffle',
    { loudDb: 135, closeFadeM: [60, 270], farFadeM: [80, 320], tailRate: 1.04, tailGain: 0.44, actionDelayS: 0.05 }),
  '50/belt': autocannon('50/belt', 50, 'XM913, Rh 503 (CV90 Mk IV, Griffin, Marder 2)', 'multi_baffle',
    { loudDb: 137, closeFadeM: [65, 290], farFadeM: [85, 340], tailRate: 0.98, tailGain: 0.5, actionDelayS: 0.06 }),
  '76/unitary_brass': cannon('76/unitary_brass', 76, 'unitary_brass', 'gun_76', {
    ordnance: '76 mm M32 (the M41 Walker Bulldog family)', rifling: 'rifled', barrel: 'long (L/60)', brake: 'deflector', weight: 'light',
    loudDb: 139, closeFadeM: [135, 310], farFadeM: [85, 340], tailRate: 0.98, tailGain: 0.56, actionDelayS: 0.13, spent: 'case_eject_brass_light',
  }),
  '84/unitary_brass': cannon('84/unitary_brass', 84, 'unitary_brass', 'gun_84', {
    ordnance: 'OQF 20-pounder (Centurion 3, Strv 81)', rifling: 'rifled', barrel: 'long (L/66.7)', brake: 'none', weight: 'light',
    loudDb: 140, closeFadeM: [138, 320], farFadeM: [88, 350], tailRate: 0.97, tailGain: 0.6, actionDelayS: 0.135, spent: 'case_eject_brass_light',
  }),
  '90/unitary_brass': cannon('90/unitary_brass', 90, 'unitary_brass', 'gun_90', {
    ordnance: '90 mm M3A1 and M41 (M46 to M48A3), the Brazilian 90 mm (X1, X1A2, Tamoyo 1)', rifling: 'rifled', barrel: 'long (L/48–L/50)',
    brake: 'deflector', weight: 'light',
    loudDb: 141, closeFadeM: [140, 330], farFadeM: [90, 360], tailRate: 0.96, tailGain: 0.62, actionDelayS: 0.14, spent: 'case_eject_brass_light',
  }),
  '100/unitary_brass': cannon('100/unitary_brass', 100, 'unitary_brass', 'gun_100', {
    ordnance: '100 mm D-10T2S (T-55A) and the Type 59\'s 100 mm', rifling: 'rifled', barrel: 'long (L/53.5)', brake: 'none', weight: 'medium',
    loudDb: 142.5, closeFadeM: [143, 345], farFadeM: [92, 380], tailRate: 0.945, tailGain: 0.68, actionDelayS: 0.145, spent: 'case_eject_steel',
  }),
  '100lp/unitary_brass': cannon('100lp/unitary_brass', 100, 'unitary_brass', 'gun_100lp', {
    ordnance: '100 mm 2A70 low-pressure gun-launcher (BMP-3)', rifling: 'rifled', barrel: 'short, low pressure', brake: 'none', weight: 'medium',
    loudDb: 138, closeFadeM: [120, 300], farFadeM: [80, 330], tailRate: 1, tailGain: 0.55, actionDelayS: 0.14, spent: null, loader: 'ifv_autoloader',
  }),
  '105/unitary_brass': cannon('105/unitary_brass', 105, 'unitary_brass', 'gun_105', {
    ordnance: 'L7/M68 family, CN-105-F1, kan m/59 and the Strv 103\'s L/62, Type 74, the ZTZ-20/100 105 mm', rifling: 'rifled',
    barrel: 'long (L/51–L/62)', brake: 'none', weight: 'medium',
    loudDb: 144, closeFadeM: [145, 360], farFadeM: [95, 400], tailRate: 0.93, tailGain: 0.72, actionDelayS: 0.15, spent: 'case_eject_brass',
  }),
  '120/combustible': cannon('120/combustible', 120, 'combustible', 'gun_120', {
    ordnance: 'Rh-120 L/44 and L/55, M256, CN120-26, Type 90/10, K2 CN08, OTO 120/44, MG251/253, the Osório\'s 120 mm', rifling: 'smoothbore',
    barrel: 'long (L/44–L/55)', brake: 'none', weight: 'heavy',
    loudDb: 147, closeFadeM: [150, 390], farFadeM: [100, 440], tailRate: 0.9, tailGain: 0.82, actionDelayS: 0.16, spent: 'case_eject_stub',
  }),
  '120/separate_bag': cannon('120/separate_bag', 120, 'separate_bag', 'gun_120r', {
    ordnance: 'L11 and L30 rifled (Chieftain, Challenger 1 and 2)', rifling: 'rifled', barrel: 'long (L/55)', brake: 'none', weight: 'heavy',
    loudDb: 147, closeFadeM: [150, 390], farFadeM: [100, 440], tailRate: 0.89, tailGain: 0.84, actionDelayS: 0.16, spent: 'vent_tube_eject',
  }),
  // A6 (2026-10-13): the 125 mm's distant thunder joins from 20 m (it began at 100 m), so at 150 m the boom stands under
  // the crack (far 0.30 of its level, was 0.14) and a cannon there sits 11 dB over the battle bed again (the 10-03 level;
  // the mix-balance gate is 10); its close report also carries further (soundCues gun_125_close). 15 m, 400 m and our own
  // gun keep their levels (tools: ab-bed-cannon / ab-burst on the CPU, then the mix-balance probe).
  '125/two_piece': cannon('125/two_piece', 125, 'two_piece', 'gun_125', {
    ordnance: '2A46M family and 2A82 (T-64, T-72, T-80, T-84, T-90, T-14, PT-91, Type 96/99, VT4)', rifling: 'smoothbore',
    barrel: 'long (L/48–L/56)', brake: 'none', weight: 'heavy',
    loudDb: 148, closeFadeM: [150, 400], farFadeM: [20, 450], tailRate: 0.88, tailGain: 0.86, actionDelayS: 0.16, spent: 'case_eject_stub',
  }),
  '130/combustible': cannon('130/combustible', 130, 'combustible', 'gun_130', {
    ordnance: 'Rh-130 L/51 (KF51 Panther family), the EE-T4\'s 130 mm', rifling: 'smoothbore', barrel: 'long (L/51)', brake: 'none', weight: 'heavy',
    loudDb: 150, closeFadeM: [155, 420], farFadeM: [110, 480], tailRate: 0.85, tailGain: 0.92, actionDelayS: 0.18, spent: 'case_eject_stub',
  }),
  '152/separate_case': cannon('152/separate_case', 152, 'separate_case', 'gun_152h', {
    ordnance: '152 mm M-10T howitzer (KV-2), the Gun Game\'s 152 mm howitzer', rifling: 'rifled', barrel: 'short (L/24.6)', brake: 'none',
    weight: 'superheavy',
    loudDb: 149, closeFadeM: [150, 420], farFadeM: [100, 480], tailRate: 0.82, tailGain: 0.95, actionDelayS: 0.22, spent: 'case_eject_brass_heavy',
  }),
  '152/caseless': cannon('152/caseless', 152, 'caseless', 'gun_152gl', {
    ordnance: '152 mm M81, M162 and XM150 gun-launchers (M551, M60A2, MBT-70, T49)', rifling: 'rifled', barrel: 'short (L/17.5–L/30)',
    brake: 'none', weight: 'heavy',
    loudDb: 147, closeFadeM: [148, 400], farFadeM: [100, 460], tailRate: 0.84, tailGain: 0.9, actionDelayS: 0.2, spent: 'scavenger_blast',
  }),
  '165/separate_bag': cannon('165/separate_bag', 165, 'separate_bag', 'gun_165', {
    ordnance: '165 mm L9A1 demolition gun (Centurion AVRE)', rifling: 'rifled', barrel: 'short', brake: 'none', weight: 'superheavy',
    loudDb: 148, closeFadeM: [150, 410], farFadeM: [100, 470], tailRate: 0.8, tailGain: 0.95, actionDelayS: 0.22, spent: 'vent_tube_eject',
    chargeInBase: true,
  }),
  '170/separate_case': cannon('170/separate_case', 170, 'separate_case', 'gun_170', {
    ordnance: '17 cm gun (Jagdpanzer E-100)', rifling: 'rifled', barrel: 'long', brake: 'double_baffle', weight: 'superheavy',
    loudDb: 152, closeFadeM: [160, 450], farFadeM: [120, 520], tailRate: 0.8, tailGain: 1, actionDelayS: 0.2, spent: 'case_eject_brass_heavy',
  }),
  '220/rocket': R({
    key: '220/rocket', family: 'launcher', ordnance: '220 mm rockets (TOS-1A)', boreMm: 220, build: 'rocket', rifling: 'none', barrel: 'launcher tubes',
    brake: 'none', weight: 'superheavy', close: 'rocket_salvo', own: null, interior: null, far: 'gun_far_heavy',
    loudDb: 145, closeFadeM: [80, 360], farFadeM: [100, 460], tailRate: 0.9, tailGain: 0.85, actionDelayS: 0.05, loader: 'rocket_rack', spent: null,
  }),
  // A guided round's close report is its launch family's (LAUNCH_ASSET: tube, soft eject, rail or the gun itself).
  'guided/missile': R({
    key: 'guided/missile', family: 'launcher',
    ordnance: 'every guided round (TOW, Konkurs, Spike, MILAN, Jyu-MAT, Kornet, Ataka, Arkan, Shillelagh, HJ-10, MRM, Viper)',
    boreMm: 152, build: 'missile', rifling: 'none', barrel: 'tube, canister, rail or the gun', brake: 'none', weight: 'medium',
    close: 'launch_tube', own: 'missile_launch_own', interior: null, far: 'launch_far',
    loudDb: 132, closeFadeM: [50, 220], farFadeM: [60, 280], tailRate: 1.1, tailGain: 0.3, actionDelayS: 0.05, loader: 'launcher', spent: null,
  }),
  // The AC-130's guns: their crew hears them inside the cabin, the ground hears them from the sky (orbit ≈ 250 m). The
  // simulation's "152 mm Howitzer" is the aircraft's 105 mm M102, heard as one.
  'ac130-30/belt': R({
    key: 'ac130-30/belt', family: 'autocannon', ordnance: 'GAU-23/A 30 mm (AC-130)', boreMm: 30, build: 'belt', rifling: 'rifled', barrel: 'long',
    brake: 'multi_baffle', weight: 'light', close: 'ac_30_close', own: 'gunship_30mm_own', interior: null, far: 'gunship_30mm_far',
    loudDb: 134, closeFadeM: [40, 160], farFadeM: [60, 220], tailRate: 1.1, tailGain: 0.38, actionDelayS: 0.04, loader: 'autocannon', spent: null,
  }),
  'ac130-105/unitary_brass': R({
    key: 'ac130-105/unitary_brass', family: 'cannon', ordnance: '105 mm M102 howitzer (AC-130)', boreMm: 105, build: 'unitary_brass',
    rifling: 'rifled', barrel: 'short (L/32)', brake: 'none', weight: 'medium', close: 'gun_152h_close', own: 'gunship_howitzer_own', interior: null,
    far: 'gunship_howitzer_far', loudDb: 150, closeFadeM: [60, 200], farFadeM: [80, 240], tailRate: 0.85, tailGain: 0.9, actionDelayS: 0.2,
    loader: 'gunship', spent: 'gunship_casing_drop',
  }),
  'ac130-missile/missile': R({
    key: 'ac130-missile/missile', family: 'launcher', ordnance: 'guided missiles off the AC-130\'s wing pylons', boreMm: 180, build: 'missile',
    rifling: 'none', barrel: 'rail', brake: 'none', weight: 'medium', close: 'launch_rail', own: 'gunship_missile_own', interior: null,
    far: 'launch_far', loudDb: 136, closeFadeM: [50, 220], farFadeM: [60, 280], tailRate: 1.1, tailGain: 0.3, actionDelayS: 0.05,
    loader: 'pylon', spent: null,
  }),
});

// Every key the fleet fires has a row: a census key this table lacks fails here at typecheck.
export const FLEET_ROWS: { readonly [K in FleetWeaponKey]: WeaponRow } = WEAPON_ROWS;

// -------------------------------------------------------------- the key ---

/** Per-weapon report ids (the fleet's `soundProfile`s): a rate and level trim, a twin barrel, or a weapon's own key. */
interface WeaponReportTrim {
  readonly rate: number;
  readonly gainDb: number;
  readonly twin?: boolean;
  readonly launcher?: boolean;
  /** A weapon with its own key rather than its bore's (the BMP-3's low-pressure 2A70, the AC-130's guns). */
  readonly key?: WeaponKey;
}

const REPORT_TRIMS: Readonly<Record<string, WeaponReportTrim>> = Object.freeze({
  'heavy-machine-gun': { rate: 1, gainDb: 0 },
  'm2-roof': { rate: 1, gainDb: -1 },
  rh202: { rate: 1.06, gainDb: -0.5 },
  'm242-bushmaster': { rate: 1, gainDb: 0 },
  '2a42': { rate: 1.03, gainDb: 0.5 },
  '2a72': { rate: 1.01, gainDb: 0 },
  'twin-2a42': { rate: 1.03, gainDb: 1, twin: true },
  'mk30-2': { rate: 0.97, gainDb: 0.5 },
  'rarden-l21a1': { rate: 0.94, gainDb: 0.5 },
  'kde-35': { rate: 1.05, gainDb: 0 },
  'bofors-40': { rate: 0.96, gainDb: 0.5 },
  'xm913-50': { rate: 1, gainDb: 0.5 },
  // BMP-3's 2A70 is a low-pressure 100 mm gun-launcher: its own softer, shorter report.
  'bmp3-100mm': { rate: 1, gainDb: 0, key: '100lp/unitary_brass' },
  'tow-launch': { rate: 0.96, gainDb: 0, launcher: true },
  'konkurs-launch': { rate: 0.92, gainDb: 0.5, launcher: true },
  'spike-launch': { rate: 1.06, gainDb: -0.5, launcher: true },
  'jyu-mat-launch': { rate: 1, gainDb: 0, launcher: true },
  'milan-launch': { rate: 0.9, gainDb: 0, launcher: true },
  'arkan-launch': { rate: 1.03, gainDb: 0, launcher: true },
  'ataka-launch': { rate: 0.97, gainDb: 0.5, launcher: true, twin: true },
  'shillelagh-launch': { rate: 0.88, gainDb: 0.5, launcher: true },
  'gunship-autocannon': { rate: 1, gainDb: 0, key: 'ac130-30/belt' },
  'gunship-howitzer': { rate: 1, gainDb: 0, key: 'ac130-105/unitary_brass' },
  'gunship-missile': { rate: 1, gainDb: 0, key: 'ac130-missile/missile' },
});

/** British L-series ammunition (L15, L23, L26–L28 kinetic, L31 HESH, L34 smoke, L37 HESH): a BL gun's rounds. */
const BRITISH_BL = /\bL(1[45]|2[3-8]|3[1-7])(A\d)?\b|\bCHARM\b/;

/** A round as the mount resolver reads it (a fleet shell spec, or a shot event's own fields). */
export interface MountRound {
  readonly name?: unknown;
  readonly type?: unknown;
  readonly caliberMm?: unknown;
  readonly guided?: unknown;
  readonly soundProfile?: unknown;
  readonly reloadGroup?: unknown;
}

/** The plain gun fields the mount resolver reads; every fleet gun and mode ladder satisfies it. */
export interface MountGun {
  readonly caliberMm?: unknown;
  readonly soundProfile?: unknown;
  readonly autoloader?: unknown;
  readonly shells?: readonly MountRound[] | null;
}

const num = (value: unknown, fallback: number): number => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The bore class a calibre falls in: rifle and heavy machine guns by band, everything bigger by its own calibre. */
function boreLabel(mm: number): string {
  if (mm < 9) return '7.62';
  if (mm < 16) return '12.7';
  return String(Math.round(mm));
}

/**
 * The key of one mount of a gun: the rounds it fires (a guided round, a secondary group's rounds, or the gun's own) at
 * the bore it fires them through. Computed from the spec alone, so a weapon the table has no row for yields a key the
 * census writes and the typecheck rejects.
 */
export function weaponKeyFor(gun: MountGun | null | undefined, rounds: readonly MountRound[], boreMm: number): string {
  const profile = (round: MountRound): string => str(round.soundProfile) || str(gun?.soundProfile);
  for (const round of rounds) {
    const trim = REPORT_TRIMS[profile(round)];
    if (trim?.key) return trim.key;
  }
  if (rounds.some((round) => round.guided === true)) return 'guided/missile';
  const bore = boreLabel(boreMm);
  if (rounds.some((round) => profile(round).endsWith('-launch'))) return `${bore}/rocket`;
  if (boreMm < 61) return `${bore}/belt`;
  const names = rounds.map((round) => str(round.name)).join(' | ');
  if (boreMm >= 115 && BRITISH_BL.test(names)) return `${bore}/separate_bag`;
  // A gun that also fires a gun-launched missile is a gun-launcher: its rounds burn away whole.
  const gunLaunched = (gun?.shells ?? []).some((round) => round.guided === true && missileLaunchFor(str(round.name), profile(round)) === 'gun');
  if (boreMm >= 146 && gunLaunched) return `${bore}/caseless`;
  if (boreMm >= 122 && boreMm <= 127) return `${bore}/two_piece`;
  if (boreMm >= 115 && boreMm < 146) return `${bore}/combustible`;
  if (boreMm >= 146) return `${bore}/separate_case`;
  return `${bore}/unitary_brass`;
}

/** One mount of a vehicle's gun: the rounds it fires and its key. */
export interface WeaponMount {
  readonly key: string;
  readonly row: WeaponRow | null;
  /** Names of the rounds this mount fires (the shot event's `shellName` picks the mount). */
  readonly rounds: readonly string[];
  /** A guided round fired through the gun itself (Arkan, Shillelagh, MRM): loaded as the gun's rounds are. */
  readonly throughGun: boolean;
  /** The row whose loader puts the next round in: the mount's own, or for a gun-launched missile its gun's. */
  readonly loadRow: WeaponRow | null;
}

const rowOf = (key: string): WeaponRow | null => (WEAPON_ROWS as Readonly<Record<string, WeaponRow>>)[key] ?? null;

function mount(gun: MountGun | null | undefined, rounds: readonly MountRound[], boreMm: number, gunRounds: readonly MountRound[] = []): WeaponMount {
  const key = weaponKeyFor(gun, rounds, boreMm);
  const profile = (round: MountRound): string => str(round.soundProfile) || str(gun?.soundProfile);
  const throughGun = key === 'guided/missile' && rounds.every((round) => missileLaunchFor(str(round.name), profile(round)) === 'gun');
  // the gun a missile leaves through: its group's own rounds, else the gun's, else a plain round of the gun's bore
  const gunKey = throughGun ? weaponKeyFor(gun, gunRounds.length ? gunRounds : [{ caliberMm: boreMm, name: '' }], boreMm) : key;
  return Object.freeze({
    key, row: rowOf(key), rounds: Object.freeze(rounds.map((round) => str(round.name))), throughGun, loadRow: rowOf(gunKey),
  });
}

/**
 * Every mount of a gun: its guided rounds (by launch: through the gun, or off a launcher), each named secondary
 * group (the BMP-3's 2A70 beside its 30 mm), and the gun's own rounds at the gun's bore. The shell's calibre is
 * its damage class (a Centurion's 84 mm fires rounds the damage model sizes at 120 mm); the gun decides the report.
 */
export function weaponMounts(gun: MountGun | null | undefined): readonly WeaponMount[] {
  const shells = gun?.shells ?? [];
  const gunMm = num(gun?.caliberMm, 100);
  const out: WeaponMount[] = [];
  const profile = (round: MountRound): string => str(round.soundProfile) || str(gun?.soundProfile);
  const guided = shells.filter((round) => round.guided === true);
  const through = guided.filter((round) => missileLaunchFor(str(round.name), profile(round)) === 'gun');
  const off = guided.filter((round) => !through.includes(round));
  const groups = new Map<string, MountRound[]>();
  const main: MountRound[] = [];
  for (const round of shells) {
    if (round.guided === true) continue;
    const group = str(round.reloadGroup);
    if (group) { const list = groups.get(group) ?? []; list.push(round); groups.set(group, list); } else main.push(round);
  }
  // a gun-launched missile of a secondary group (the BMP-3's Arkan, its 2A70's) leaves through that group's gun
  for (const [group, rounds] of groupedBy(through)) {
    const gunRounds = group ? groups.get(group) ?? [] : main;
    out.push(mount(gun, rounds, gunRounds.length ? num(gunRounds[0].caliberMm, gunMm) : gunMm, gunRounds));
  }
  if (off.length) out.push(mount(gun, off, num(off[0].caliberMm, gunMm)));
  for (const rounds of groups.values()) out.push(mount(gun, rounds, num(rounds[0].caliberMm, gunMm)));
  if (main.length) out.push(mount(gun, main, gunMm));
  return Object.freeze(out);
}

function groupedBy(rounds: readonly MountRound[]): Map<string, MountRound[]> {
  const out = new Map<string, MountRound[]>();
  for (const round of rounds) { const group = str(round.reloadGroup); const list = out.get(group) ?? []; list.push(round); out.set(group, list); }
  return out;
}

/** The mount that fires a named round (the shot event's `shellName`), else the gun's own. */
export function mountForRound(mounts: readonly WeaponMount[], roundName: string | null | undefined): WeaponMount | null {
  if (!mounts.length) return null;
  const name = str(roundName);
  return (name && mounts.find((m) => m.rounds.includes(name))) || mounts[mounts.length - 1];
}

/** A roof or auxiliary station: its own belt-fed gun of its calibre. */
export function stationMount(caliberMm: number): WeaponMount {
  return mount(null, [{ caliberMm, name: '' }], num(caliberMm, 7.62));
}

/**
 * The bore ladder a shot known only by its calibre falls on (a Studio film's cue carries no gun, and
 * game/studioFilmAudio.ts copies this ladder): the nearest of the fleet's high-velocity bores, a 152 mm as the howitzer.
 */
export const CALIBRE_LADDER: readonly (readonly [below: number, key: WeaponKey])[] = Object.freeze([
  [9, '7.62/belt'], [16, '12.7/belt'], [22.5, '20/belt'], [27.5, '25/belt'], [32.5, '30/belt'], [37.5, '35/belt'], [45, '40/belt'],
  [61, '50/belt'], [80, '76/unitary_brass'], [87, '84/unitary_brass'], [95, '90/unitary_brass'], [102.5, '100/unitary_brass'],
  [112.5, '105/unitary_brass'], [122.5, '120/combustible'], [127.5, '125/two_piece'], [141, '130/combustible'], [158, '152/separate_case'],
  [167.5, '165/separate_bag'], [200, '170/separate_case'], [Infinity, '220/rocket'],
]);

/** The row a shot known only by its calibre is heard as (CALIBRE_LADDER). */
export function calibreRow(caliberMm: number): WeaponRow {
  const mm = Number.isFinite(caliberMm) ? caliberMm : 100;
  for (const [below, key] of CALIBRE_LADDER) if (mm < below) return WEAPON_ROWS[key];
  return WEAPON_ROWS['220/rocket'];
}

/** A shot whose shooter's gun is unknown (a studio or probe event): the shot's own fields decide. */
export function eventMount(caliberMm: number, soundProfile: string | null | undefined, roundName?: string | null, guided?: boolean): WeaponMount {
  const round: MountRound = { caliberMm, soundProfile: soundProfile ?? '', name: roundName ?? '', guided: guided === true };
  const launch = isLaunchProfile(soundProfile) && guided !== false && num(caliberMm, 100) < 200 ? { ...round, guided: true } : round;
  return mount({ caliberMm, shells: [launch] }, [launch], num(caliberMm, 100));
}

/** The loader that puts the next round into a mount, from the vehicle's layout (the census's projection of it). */
export function loaderFor(specId: string | null | undefined, m: WeaponMount | null): LoaderMake {
  const row = m?.loadRow;
  if (!row) return 'manual';
  if (row.family !== 'cannon' || row.loader !== 'manual') return row.loader;
  return (specId && MAIN_GUN_LOADER[specId]) || 'manual';
}

/** Whether the loader reaches a ready rack behind an armoured door (the layout's bustle and protected racks). */
export function readyRackDoor(specId: string | null | undefined): boolean {
  return !!specId && READY_RACK_DOOR[specId] === true;
}

// --------------------------------------------------------------- reports ---

interface ResolvedWeaponReport {
  readonly row: WeaponRow;
  readonly rate: number;
  readonly gainDb: number;
  readonly twin: boolean;
}

/** One report for one shot: the mount's row, then the weapon's own trims. Null for a key the table lacks (silent). */
export function resolveWeaponReport(m: WeaponMount, soundProfile: string | null | undefined): ResolvedWeaponReport | null {
  if (!m.row) return null;
  const trim = soundProfile ? REPORT_TRIMS[soundProfile] : undefined;
  return { row: m.row, rate: trim?.rate ?? 1, gainDb: trim?.gainDb ?? 0, twin: !!trim?.twin };
}

/**
 * The report classes as the field manual draws them (src/docs/chapters/audio.ts): one bar per bore, its loudest row
 * (a bore's two constructions sound at one level there), named by calibre and kind or by the manual's own class names.
 */
export const WEAPON_CLASSES: Readonly<Record<string, { readonly id: string; readonly loudDb: number }>> = (() => {
  const out: Record<string, { id: string; loudDb: number }> = {};
  for (const row of Object.values(WEAPON_ROWS)) {
    const id = row.key === 'guided/missile' ? 'atgm' : row.key === '220/rocket' ? 'rocket_heavy'
      : row.key === 'ac130-30/belt' ? 'gunship_30' : row.key === 'ac130-105/unitary_brass' ? 'gunship_howitzer'
        : row.key === 'ac130-missile/missile' ? 'gunship_missile' : row.family === 'mg' ? (row.boreMm < 9 ? 'mg_rifle' : 'mg_heavy')
          : `${row.family === 'autocannon' ? 'ac' : 'gun'}_${Math.round(row.boreMm)}`;
    if (!out[id] || out[id].loudDb < row.loudDb) out[id] = { id, loudDb: row.loudDb };
  }
  return Object.freeze(out);
})();

/** Every row's close report (the warm and the countdown receipts read the combat banks from here). */
export const WEAPON_CLOSE: Readonly<Record<WeaponKey, string>> = Object.freeze(Object.fromEntries(
  Object.values(WEAPON_ROWS).map((row) => [row.key, row.close]),
) as Record<WeaponKey, string>);

/**
 * How a report changes around a muzzle brake (dB), by the angle between the bore and the listener (0 = in front of
 * the muzzle, π = behind the gun): with nothing on the muzzle the blast is strongest ahead of it; a brake throws its
 * gases sideways and back, so the crew and anyone beside the gun hear it harsher.
 */
const BRAKE_DB: Readonly<Record<MuzzleBrake, readonly [ahead: number, side: number, behind: number]>> = Object.freeze({
  none: [1.5, 0, -1.5],
  flash_hider: [1, 0, -1],
  deflector: [0.5, 1.5, 0.5],
  double_baffle: [0, 2.5, 1],
  multi_baffle: [0.5, 1.5, 0],
});

/** The brake's gain for a listener at `angle` (radians from the bore's line of fire). */
export function brakeGainDb(brake: MuzzleBrake, angle: number): number {
  const [ahead, side, behind] = BRAKE_DB[brake];
  const a = Math.max(0, Math.min(Math.PI, Number.isFinite(angle) ? angle : Math.PI / 2));
  const t = a / (Math.PI / 2);
  return t <= 1 ? ahead + (side - ahead) * t : side + (behind - side) * (t - 1);
}

// ------------------------------------------------------- missile launches ---

/**
 * How a guided round leaves its launcher (the fx lane's EF.04 launch types, fx/missileLooks.ts on
 * `item/fx-missile-traces`): a tube's launch charge and backblast (TOW, Konkurs, MILAN, Jyu-MAT, Kornet, Ataka), a soft
 * eject whose motor lights clear of the tube (Spike, Javelin, LMAT, Stinger), a rail (Hellfire, HJ-10, the old MCLOS
 * rounds, the Viper micro-missile), or a gun barrel (Arkan, Shillelagh, the MRM). Until 2026-10-13 every one of them
 * played the one `atgm_launch` bank.
 */
type MissileLaunchKind = 'tube' | 'soft' | 'rail' | 'gun';

/** The round's own name -> its launch (first match; the names the fx lane reads, by family). */
const LAUNCH_BY_NAME: readonly (readonly [RegExp, MissileLaunchKind])[] = Object.freeze([
  [/\bTOW\b|BGM-71/i, 'tube'],
  [/9M-695|HJ-P9/i, 'tube'],
  [/Konkurs|9M113|Fagot|9M111|Metis|9M115|9M131|HJ-8|Red Arrow 8/i, 'tube'],
  [/MILAN|\bHOT\b|Euromissile/i, 'tube'],
  [/Malyutka|9M14|Sagger|SS-11|ENTAC|KAM-3|Type 64/i, 'rail'],
  [/Jyu-MAT Kai|Type 01|LMAT|Javelin|FGM-148|Spike|MELLS|NLAW|\bMMP\b|Akeron|HJ-12|Red Arrow 12/i, 'soft'],
  [/Jyu-MAT|Type 79|KAM-9/i, 'tube'],
  [/Kornet|9M133|Stugna|Skif|Barrier|Bulat|Corsar/i, 'tube'],
  [/Arkan|9M117|Bastion|Refleks|9M119|Svir|Kobra|9M112|Sheksna|Invar|LAHAT|Falarick|Konus/i, 'gun'],
  [/Ataka|9M120|Shturm|9M114|Khrizantema|9M123/i, 'tube'],
  [/Shillelagh|MGM-51/i, 'gun'],
  [/Hellfire|AGM-114|HJ-10|Brimstone|JAGM|Hermes|AKD-10/i, 'rail'],
  [/Stinger|FIM-92|Igla|Strela|Mistral|Starstreak/i, 'soft'],
  [/MRM|XM1210|Hypersonic/i, 'gun'],
  [/Viper micro|micro-missile/i, 'rail'],
]);

/** The launch sound profile -> its launch, for a round whose name says nothing. */
const LAUNCH_BY_SOUND: Readonly<Record<string, MissileLaunchKind>> = Object.freeze({
  'tow-launch': 'tube', 'konkurs-launch': 'tube', 'milan-launch': 'tube', 'jyu-mat-launch': 'tube',
  'spike-launch': 'soft', 'arkan-launch': 'gun', 'ataka-launch': 'tube', 'shillelagh-launch': 'gun',
});

/** Each launch's recording (close; the row's distant bank carries it far). */
export const LAUNCH_ASSET: Readonly<Record<MissileLaunchKind, string>> = Object.freeze({
  tube: 'launch_tube', soft: 'launch_soft', rail: 'launch_rail', gun: 'launch_gun',
});

/** How a guided round leaves its launcher: by its name, then its launch sound, else a tube (the commonest kind). */
export function missileLaunchFor(name: string | null | undefined, sound: string | null | undefined): MissileLaunchKind {
  const n = typeof name === 'string' ? name : '';
  if (n) for (const [re, kind] of LAUNCH_BY_NAME) if (re.test(n)) return kind;
  const s = typeof sound === 'string' ? LAUNCH_BY_SOUND[sound] : undefined;
  return s ?? 'tube';
}

/** Whether a sound profile names a launcher (every guided round's is a '*-launch' profile). */
export function isLaunchProfile(soundProfile: string | null | undefined): boolean {
  return typeof soundProfile === 'string' && !!REPORT_TRIMS[soundProfile]?.launcher;
}

/**
 * Every recording a shot of this mount can play outside our own hull: the close report (a guided round's by how it
 * launches), the distant report, our own and the closed turret's where the row has them. The coverage receipt
 * (weaponCoverage.selftest.mjs) holds every station of every playable vehicle to these.
 */
export function weaponReportAssets(m: WeaponMount, soundProfile: string | null | undefined, roundName?: string | null): {
  key: string; close: string; far: string; own: string | null; interior: string | null;
} | null {
  const row = m.row;
  if (!row) return null;
  const close = row.key === 'guided/missile' ? LAUNCH_ASSET[missileLaunchFor(roundName, soundProfile)] : row.close;
  return { key: row.key, close, far: row.far, own: row.own, interior: row.interior };
}

// ---------------------------------------------------------------- reloads ---

export type ReloadCueType =
  | 'breechOpen' | 'caseEject' | 'stubEject' | 'stubPort' | 'stubCatch' | 'ventEject' | 'ventLoad' | 'scavenge'
  | 'ammoDoorOpen' | 'shellGrab' | 'ammoDoorClose' | 'ram' | 'bagCharge' | 'caseCharge' | 'breechClose'
  | 'carouselTurn' | 'basketTurn' | 'cassetteLift' | 'chainRam' | 'chargeChainRam'
  | 'bustleIndex' | 'bustleRam' | 'magazineDrop' | 'caseOutside' | 'ifvLoad'
  | 'missileRound' | 'hatchOpen' | 'canisterLift' | 'tubeLoad' | 'launcherRaise' | 'latch'
  | 'rocketLoad' | 'gunshipLoad';

export interface ReloadCue {
  /** Fraction of the authoritative reload at which the cue plays. */
  readonly at: number;
  readonly type: ReloadCueType;
  readonly asset: string;
  readonly gainDb: number;
  readonly rate: number;
}

export interface ReloadCuePlan {
  readonly profile: 'rapid' | 'shell' | 'magazine' | 'intraClip';
  readonly loader: LoaderMake | null;
  readonly ready: boolean;
  readonly cues: readonly ReloadCue[];
}

const RAPID: ReloadCuePlan = Object.freeze({ profile: 'rapid', loader: null, ready: false, cues: Object.freeze([]) });

/** The handling cues by the round's heft: what a 90 mm round and a 50 kg 152 mm projectile sound like in the hands. */
const HANDLED: Readonly<Record<RoundWeight, { grab: string; ram: string; open: string; close: string }>> = Object.freeze({
  light: { grab: 'shell_grab_light', ram: 'shell_ram_light', open: 'breech_open', close: 'breech_close' },
  medium: { grab: 'shell_grab_medium', ram: 'shell_ram_light', open: 'breech_open', close: 'breech_close' },
  heavy: { grab: 'shell_grab', ram: 'shell_ram', open: 'breech_open', close: 'breech_close' },
  superheavy: { grab: 'shell_grab_superheavy', ram: 'shell_ram_staff', open: 'breech_open_heavy', close: 'breech_close_heavy' },
});

/** Each cue's recording for a row (the handling cues by weight, the spent case by construction). */
function cueAsset(type: ReloadCueType, row: WeaponRow): string {
  const hands = HANDLED[row.weight];
  switch (type) {
    case 'breechOpen': return hands.open;
    case 'breechClose': return hands.close;
    case 'shellGrab': return hands.grab;
    case 'ram': return hands.ram;
    case 'caseEject': return row.spent ?? 'case_eject_brass';
    case 'stubEject': return 'case_eject_stub';
    case 'stubPort': return 'stub_port_eject';
    case 'stubCatch': return 'stub_catch';
    case 'ventEject': return 'vent_tube_eject';
    case 'ventLoad': return 'vent_tube_load';
    case 'scavenge': return 'scavenger_blast';
    case 'ammoDoorOpen': return 'ammo_door_open';
    case 'ammoDoorClose': return 'ammo_door_close';
    case 'bagCharge': return 'bag_charge_load';
    case 'caseCharge': return 'charge_case_load';
    case 'carouselTurn': return 'autoloader_carousel';
    case 'basketTurn': return 'basket_turn';
    case 'cassetteLift': return 'autoloader_lift';
    case 'chainRam': case 'chargeChainRam': return 'autoloader_chain_ram';
    case 'bustleIndex': return 'bustle_index';
    case 'bustleRam': return 'bustle_ram';
    case 'magazineDrop': return 'magazine_drop';
    case 'caseOutside': return 'case_eject_outside';
    case 'ifvLoad': return 'ifv_autoloader';
    case 'missileRound': return 'missile_round_load';
    case 'hatchOpen': return 'hatch';
    case 'canisterLift': return 'missile_canister_lift';
    case 'tubeLoad': return 'missile_tube_load';
    case 'launcherRaise': return 'launcher_raise';
    case 'latch': return 'latch_ready';
    case 'rocketLoad': return 'rocket_crane_load';
    case 'gunshipLoad': return 'gunship_round_load';
  }
}

/** Where a cue falls: `from` seconds after the cycle starts, `by` seconds before it ends (no later than the fraction
 *  `max` of a long cycle), or a fraction of it. */
type At = { readonly from: number } | { readonly by: number; readonly max?: number } | number;
type Step = readonly [ReloadCueType, At, number?];

/** How long the loader's hands take with each weight of round (the seconds in a choreography stretch by it). */
const HEFT: Readonly<Record<RoundWeight, number>> = Object.freeze({ light: 0.8, medium: 1, heavy: 1.1, superheavy: 1.45 });

/** The cues of the post-shot cycle that come before the new round, by what the breech gives up. */
function spentSteps(row: WeaponRow, loader: LoaderMake): Step[] {
  // the AC-130's breech throws its case onto the deck on counter-recoil, with the shot
  if (loader === 'gunship') return [];
  switch (row.build) {
    case 'two_piece':
      return loader === 'carousel_az' || loader === 'carousel_unmanned' ? [['stubPort', { from: 0.05 }]]
        : loader === 'basket_mz' ? [['stubCatch', { from: 0.12 }]] : [['stubEject', { from: 0.3 }]];
    case 'combustible': return loader === 'basket_mz' ? [['stubCatch', { from: 0.12 }]] : [['stubEject', { from: loader === 'manual' ? 0.35 : 0.05 }]];
    case 'unitary_brass': return loader === 'fixed_ram' ? [['caseOutside', { from: 0.12 }]] : row.spent ? [['caseEject', { from: loader === 'manual' ? 0.4 : 0.05 }]] : [];
    case 'separate_case': return [['caseEject', { from: 0.6 }]];
    case 'separate_bag': return [['ventEject', { from: 0.25 }]];
    case 'caseless': return [['scavenge', { from: 0.06 }]];
    case 'belt': case 'missile': case 'rocket': return [];
  }
}

/** The new round going in, by the loader's make (a manual loader's work by the round's construction). */
function loadSteps(row: WeaponRow, loader: LoaderMake, missileRound: boolean, rackDoor: boolean): Step[] {
  const grab: ReloadCueType = missileRound ? 'missileRound' : 'shellGrab';
  switch (loader) {
    case 'manual': {
      const steps: Step[] = [['breechOpen', 0.015]];
      if (row.build === 'separate_bag' || row.build === 'separate_case' || row.build === 'caseless') steps[0] = ['breechOpen', row.build === 'caseless' ? 0.1 : 0.02];
      if (rackDoor && !missileRound) steps.push(['ammoDoorOpen', 0.24], [grab, 0.38], ['ammoDoorClose', 0.5]);
      else steps.push([grab, 0.34]);
      // a separate-loading round's projectile goes in well before the end: its charge follows it
      const separate = row.build === 'separate_bag' || row.build === 'separate_case' || row.build === 'two_piece';
      if (!missileRound) steps.push(['ram', separate ? { by: 1.8, max: 0.6 } : { by: 0.85 }]);
      if (row.build === 'separate_bag' && !row.chargeInBase) steps.push(['bagCharge', { by: 0.9, max: 0.8 }]);
      if (row.build === 'separate_case' || row.build === 'two_piece') steps.push(['caseCharge', { by: 0.9, max: 0.8 }]);
      steps.push(['breechClose', { by: separate ? 0.32 : 0.22 }]);
      if (row.build === 'separate_bag') steps.push(['ventLoad', { by: 0.12 }]);
      return steps;
    }
    case 'carousel_az': case 'carousel_unmanned': {
      const steps: Step[] = [['carouselTurn', { from: 0.5 }], ['cassetteLift', { by: 2.2 }], ['chainRam', { by: 1.3 }]];
      if (row.build === 'two_piece') steps.push(['chargeChainRam', { by: 0.75 }, -3]);
      steps.push(['breechClose', { by: 0.22 }]);
      return steps;
    }
    case 'basket_mz': {
      const steps: Step[] = [['basketTurn', { from: 0.45 }], ['cassetteLift', { by: 2.2 }], ['chainRam', { by: 1.3 }]];
      if (row.build === 'two_piece') steps.push(['chargeChainRam', { by: 0.75 }, -3]);
      steps.push(['breechClose', { by: 0.22 }]);
      return steps;
    }
    case 'bustle': return [['bustleIndex', { from: 0.6 }], [missileRound ? 'missileRound' : 'bustleRam', { by: 0.9 }], ['breechClose', { by: 0.22 }]];
    case 'fixed_ram': return [['magazineDrop', 0.4], ['bustleRam', { by: 0.8 }], ['breechClose', { by: 0.22 }]];
    // The 2A70's autoloader feeds its rounds; a 9M117 missile is loaded by hand.
    case 'ifv_autoloader': return missileRound ? [['breechOpen', 0.02], ['missileRound', 0.4], ['breechClose', { by: 0.22 }]]
      : [['ifvLoad', { from: 0.4 }], ['breechClose', { by: 0.22 }]];
    // The roof launcher is reloaded through the hatch: the hatch, the canister out of stowage, into the tube, latched.
    case 'launcher': return [['hatchOpen', { from: 0.1 }], ['canisterLift', 0.3], ['tubeLoad', 0.55], ['launcherRaise', { by: 0.6 }], ['latch', { by: 0.15 }]];
    // The AC-130's howitzer, loaded by hand in the cabin: the breech drops open (its spent case already thrown onto the
    // deck after the shot), a round is hefted and rammed home, and the breech closes on it.
    case 'gunship': return [['breechOpen', 0.03], ['gunshipLoad', { from: 1 }], ['breechClose', { by: 0.25 }]];
    case 'rocket_rack': return [['rocketLoad', 0.15], ['rocketLoad', 0.4], ['rocketLoad', 0.65], ['latch', { by: 0.4 }]];
    // an AC-130 missile arms on its pylon: the fire-control relay, nothing more inside the cabin
    case 'pylon': return [['latch', { by: 0.2 }, -4]];
    case 'autocannon': return [];
  }
}

/** The refill of a turret-bustle magazine (`magazine`): each round handed in and pushed into its cell, then the first rammed. */
function magazineSteps(row: WeaponRow, loader: LoaderMake, rounds: number): Step[] {
  if (loader === 'rocket_rack') return loadSteps(row, loader, false, false);
  const n = Math.max(1, Math.min(6, Math.round(rounds) || 3));
  const steps: Step[] = [['bustleIndex', 0.03]];
  for (let i = 0; i < n; i++) {
    const at = 0.1 + (0.62 * i) / n;
    steps.push(['shellGrab', at], ['bustleRam', at + 0.3 / n, -2]);
  }
  steps.push(['bustleIndex', { by: 0.9 }], ['bustleRam', { by: 0.55 }], ['breechClose', { by: 0.2 }]);
  return steps;
}

/** Lay a choreography on the cycle: anchors to fractions (seconds stretched by the round's heft), in order, none crowded. */
function layOut(steps: readonly Step[], total: number, row: WeaponRow): ReloadCue[] {
  const heft = HEFT[row.weight];
  // the last cue lands at least 80 ms before the gun is ready (the ready latch follows it)
  const end = Math.min(0.985, 1 - 0.08 / total);
  const placed = steps.map(([type, at, gainDb = 0]) => {
    let f: number;
    if (typeof at === 'number') f = at;
    else if ('from' in at) f = Math.min(0.45, (at.from * heft) / total);
    else f = Math.min(at.max ?? 1, Math.max(0.5, 1 - (at.by * heft) / total));
    return { type, f: Math.max(0, Math.min(end, f)), gainDb };
  }).sort((a, b) => a.f - b.f);
  // no two cues crowd each other, and none runs past the cycle: forward, then back from the end
  const gap = Math.min(0.03, 0.9 / Math.max(1, placed.length), Math.max(0.008, 0.15 / total));
  for (let i = 1; i < placed.length; i++) placed[i].f = Math.max(placed[i].f, placed[i - 1].f + gap);
  for (let i = placed.length - 1; i >= 0; i--) placed[i].f = Math.min(placed[i].f, i === placed.length - 1 ? end : placed[i + 1].f - gap);
  const cues: ReloadCue[] = [];
  for (const p of placed) {
    const at = Math.max(0, p.f);
    const asset = cueAsset(p.type, row);
    // the doors are machinery the crew hears but does not lean on (a little under the rounds); a bigger bore sits lower
    const door = p.type === 'ammoDoorOpen' || p.type === 'ammoDoorClose';
    cues.push(Object.freeze({ at, type: p.type, asset, gainDb: p.gainDb + (door ? -3 : 0), rate: door ? 1 : rateFor(row) }));
  }
  return cues;
}

/** Within a weight class the bigger bore sits a little lower. */
function rateFor(row: WeaponRow): number {
  const mass = Math.max(0.6, Math.min(1.4, row.boreMm / 110));
  return Math.max(0.88, Math.min(1.15, 1.06 - (mass - 1) * 0.2));
}

/**
 * The mechanical choreography of one authoritative reload cycle, as fractions of its duration: what the breech gives
 * up (by the round's construction), then the next round going in (by the loader's make), each cue anchored to the
 * cycle's start or end in seconds stretched by the round's heft, so a breech always closes just before "Loaded!"
 * however long the cycle. An autocannon's or machine gun's per-shot cycle is its own action (played with the shot).
 */
export function resolveReloadCuePlan(
  totalS: number,
  kind: string,
  m: WeaponMount | null,
  loader: LoaderMake,
  { rackDoor = false, magazineRounds = 0 }: { rackDoor?: boolean; magazineRounds?: number } = {},
): ReloadCuePlan {
  const total = Math.max(0.05, Number(totalS) || 0.05);
  const row = m?.row;
  if (!row || total < 0.55 || loader === 'autocannon') return RAPID;
  const missileRound = row.build === 'missile' && !!m?.throughGun;
  // A gun-launched missile goes in through the gun's own loader, handled as that gun's rounds are.
  const gunRow = missileRound ? m?.loadRow ?? row : row;
  let steps: Step[];
  let profile: ReloadCuePlan['profile'] = 'shell';
  if (kind === 'magazine') {
    profile = 'magazine';
    steps = magazineSteps(gunRow, loader, magazineRounds);
  } else if (kind === 'intraClip') {
    profile = 'intraClip';
    // between rounds of a magazine: the stub out, the next round indexed and rammed; a launcher's next tube is loaded
    if (loader === 'launcher' || loader === 'rocket_rack' || loader === 'pylon') return RAPID;
    steps = [...spentSteps(gunRow, loader), ['bustleIndex', 0.1], ['bustleRam', { by: 0.35 }], ['breechClose', { by: 0.12 }]];
  } else {
    steps = [...(missileRound ? [] : spentSteps(gunRow, loader)), ...loadSteps(gunRow, loader, missileRound, rackDoor)];
  }
  return Object.freeze({ profile, loader, ready: true, cues: Object.freeze(layOut(steps, total, gunRow)) });
}

/** Every recording a reload of this mount can play (the hull's warm decodes them with our own banks). */
export function reloadAssets(m: WeaponMount | null, loader: LoaderMake): string[] {
  const out = new Set<string>();
  for (const kind of ['shell', 'magazine', 'intraClip']) {
    for (const rackDoor of [false, true]) {
      for (const cue of resolveReloadCuePlan(30, kind, m, loader, { rackDoor, magazineRounds: 4 }).cues) out.add(cue.asset);
    }
  }
  out.add('latch_ready');
  return [...out];
}
