// VH.14 (coordinator ruling 2026-10-14, under the owner's field-equipment standard "no duplicate or non-functional
// guns"): roof weapons match the real vehicle and every drawn gun works. The old build-standard rule (§B3: every vehicle
// shows at least one roof machine gun) put decorative guns on vehicles whose real counterparts carry none. A vehicle
// listed here, with the reason, draws no roof weapon at all; every other drawn gun is a working, calibre-true station
// in the auxiliary inventory. tools/source-equipment-policy.mjs reads this list for the standard check's census, and
// roofWeaponPolicy.selftest fails on any drawn gun that is not a working station.
export const NO_ROOF_WEAPON: Readonly<Record<string, string>> = Object.freeze({
  bmpt_t90: 'BMPT "Terminator" (Ob. 199): two 2A42 30 mm, four Ataka ATGM launchers and a coaxial PKTM; it carries no '
    + 'roof machine gun (the commander\'s and gunner\'s sights sit where an NSVT would).',
  bmpt_terminator2: 'BMPT-72 "Terminator 2": two 2A42 30 mm, four Ataka and a coaxial PKTM in the Epokha-type module; no '
    + 'roof machine gun.',
  bmpt_terminator: 'BMPT "Terminator" (Ob. 199 "Ramka", 2009-2013): two 2A42 30 mm, four open Ataka tubes and a coaxial '
    + 'PKTM in the module (the real vehicle\'s two bow AG-17D are left off the build); no roof machine gun.',
  bmp3: 'BMP-3: 100 mm 2A70, 30 mm 2A72, a coaxial PKT and two bow PKTs; no roof machine gun on the turret.',
  bmp3_rok: 'BMP-3 in Republic of Korea service: the standard BMP-3 armament (2A70, 2A72, coaxial and bow PKTs); no roof '
    + 'machine gun.',
  bwp1: 'BWP-1M "Puma" demonstrator with the unmanned Rafael RCWS-30 station (30 mm cannon, coaxial 7.62, one Spike-LR '
    + 'canister): its 7.62 is the coaxial gun; no roof machine gun.',
  bmp2: 'BMP-2: 30 mm 2A42, a coaxial 7.62 mm PKT and the 9M113 Konkurs launcher on the turret roof; no roof machine gun.',
  m2a2_bradley: 'M2A2 Bradley: 25 mm M242, a coaxial M240C and the twin TOW launcher; no pintle or roof machine gun.',
  m3a3_bradley: 'M3A3 Bradley CFV: 25 mm M242, a coaxial M240C and two twin TOW launchers (269, the owner\'s second on the '
    + 'right); no pintle or roof machine gun.',
  m3a2_bradley: 'M3A2 Bradley CFV: 25 mm M242, a coaxial M240C and the twin TOW launcher; no pintle or roof machine gun.',
  ua_m2a3_bradley: 'M2A3 Bradley in Ukrainian service: 25 mm M242, a coaxial M240C and the twin TOW launcher; no pintle or '
    + 'roof machine gun.',
  ua_cv9040c: 'CV9040C in Ukrainian service: the Swedish CV9040C\'s 40 mm Bofors and coaxial 7.62 mm machine gun; no roof '
    + 'machine gun (the CV9040C\'s photograph packet, docs/references/photos/ifvs-20260925.json: roofMachineGuns 0).',
  fv510: 'FV510 Warrior: 30 mm L21A1 RARDEN and a coaxial 7.62 mm L94A1 chain gun; no pintle or roof machine gun.',
  fv510_milan: 'FV510 Warrior with the MILAN post: 30 mm RARDEN, a coaxial L94A1 chain gun and the dismountable MILAN '
    + 'firing post; no pintle or roof machine gun.',
  ajax: 'Ajax (turreted Scout SV): 40 mm CT40 and a coaxial 7.62 mm L94A1 chain gun; the Protector remote station fits '
    + 'only on the turretless variants (or in place of the Orion sight), so the turreted Ajax carries no roof gun.',
  // 2026-10-16 (226 gate): VH.14 (76ef67d65) removed the Marder 1A3's turret-roof MG3 pintle as no roof weapon on the
  // real vehicle but did not list it; the 1A3 carries the external coaxial MG3 (drawn on the gun plant).
  marder1a3: 'Schützenpanzer Marder 1A3: 20 mm Rh 202 and the coaxial 7.62 mm MG3 on the external gun mount; the rear '
    + 'remote MG3 of the first Marders was deleted in the 1A1 programme, and the 1A3 carries no roof machine gun.',
  spz_puma: 'Schützenpanzer Puma: 30 mm MK30-2/ABM, a coaxial 5.56 mm MG4 and the MELLS (Spike-LR) launcher in an '
    + 'unmanned turret; no roof machine gun.',
  spz_wotan: 'Schützenpanzer Puma S1: 30 mm MK30-2/ABM, a coaxial 5.56 mm MG4 and the MELLS launcher; the S1 carries no '
    + 'roof weapon station (its commander sight is the PERI RTWL head).',
  hayate_ifv: 'Type 89 IFV: 35 mm KDE, a coaxial 7.62 mm Type 74 and two Type 79 Jyu-MAT launchers; no roof machine gun.',
  cv9035dk: 'CV9035 DK (the Danish Army\'s CV90): 35 mm Bushmaster III and a coaxial 7.62 mm machine gun in the two-man '
    + 'turret; no roof or pintle machine gun.',
  // 268: the twin-cannon air defence carries no roof machine gun: its crews rely on personal arms
  tunguska_m: '2K22M Tunguska-M: two 2A38M twin-barrel 30 mm and eight 9M311M; no machine gun.',
  pantsir_s1: 'Pantsir-S1: two 2A38M twin-barrel 30 mm and twelve 57E6 in two banks; no machine gun.',
  gepard_1a2: 'Flakpanzer Gepard 1A2: two 35 mm Oerlikon KDA and two quad smoke dischargers; no machine gun.',
  pgz95: 'PGZ-95: four 25 mm and four QW-2; no machine gun.',
  pgz09: 'PGZ-09: two 35 mm PG99 and the smoke dischargers; no machine gun.',
  // 269: the second air-defence round carries no roof machine gun either
  type87_aw: 'Type 87 SPAAG: two 35 mm Oerlikon KDA (Japan Steel Works) and the smoke dischargers; no machine gun.',
  marksman_t55: 'Marksman (ItPsv 90): two 35 mm Oerlikon KDA and eight 76 mm smoke dischargers; no machine gun.',
  itpsv_leopard2: 'ItPsv Leopard 2: the Marksman turret\'s two 35 mm Oerlikon KDA and its smoke dischargers; no machine gun.',
  lvkv9040: 'Lvkv 9040: one 40 mm Bofors L/70 and the smoke dischargers; no roof machine gun.',
  k30_biho: 'K30 Biho: two 30 mm KCB and the smoke dischargers; no roof machine gun.',
  pza_loara: 'PZA Loara: two 35 mm Oerlikon KDA and the smoke dischargers; no secondary armament.',
  // 269: the M163 VADS
  m163_vads: 'M163 VADS: the 20 mm M168 Vulcan in its open one-man mount; no roof machine gun.',
  tos1a_tagil: 'TOS-1A Solntsepyok: the 24-tube 220 mm launcher on a T-72 chassis; the crew relies on personal arms and '
    + 'the vehicle carries no machine gun.',
  kv2: 'KV-2: the 152 mm M-10 and three 7.62 mm DT machine guns in ball mounts (coaxial, turret rear and hull bow); no '
    + 'roof machine gun.',
  centurion3: 'Centurion Mk 3: the 20-pounder and a coaxial 7.92 mm Besa; the Mk 3 carried no roof machine gun (the '
    + 'commander\'s .30 Browning arrived with later marks).',
  t55a: 'T-55A (1963): the 100 mm D-10T2S and a coaxial 7.62 mm SGMT; the T-55 deleted the T-54\'s loader\'s DShK and '
    + 'the 12.7 mm gun returned only as a retrofit from 1970, so the 1963 T-55A carries no roof machine gun.',
  // release 262: the 2021 demonstrator in its trials fit (docs/references/tanks/challenger3_td.md); its field fit
  // challenger3_td_rws carries the working remote station
  challenger3_td: 'Challenger 3 TD (2021 Advanced Technology Demonstrator, trials fit): the 120 mm L55A1 and a coaxial '
    + '7.62 mm chain gun; the measured demonstrator carries no roof weapon station or pintle gun.',
});

export function carriesNoRoofWeapon(id: string): boolean {
  return Object.hasOwn(NO_ROOF_WEAPON, id);
}

// Owner 2026-11-12: the standard check's decor census holds these vehicles to an exact count. Each is the owner-approved
// roof-weapon decision for the vehicle (2026-09-18 and later configuration rulings), counted the census's way (`mg`:
// every working weapon fitting, a gun-owned coaxial included), and it is checked against the build alone.
export const PINNED_ROOF_WEAPON_COUNT: Readonly<Record<string, number>> = Object.freeze({
  aft10: 0,
  ajax: 1,
  bmp3m_dragun125: 1,
  cv90105_tml: 0,
  cv90_mk4: 0,
  griffin50mm: 1,
  k21: 0,
  kf41_lynx: 0,
  kurganets25: 0,
  merkava4_barak: 1,
  puma_s1: 0,
  sabra_mk2: 1,
  type89: 0,
  type96b: 0,
  warrior_tes_h: 0,
});

/** The vehicle's pinned exact roof-weapon count, or null when the default rule applies. */
export function pinnedRoofWeaponCount(id: string): number | null {
  return Object.hasOwn(PINNED_ROOF_WEAPON_COUNT, id) ? PINNED_ROOF_WEAPON_COUNT[id] : null;
}
