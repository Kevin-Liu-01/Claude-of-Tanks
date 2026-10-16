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
  bmp3: 'BMP-3: 100 mm 2A70, 30 mm 2A72, a coaxial PKT and two bow PKTs; no roof machine gun on the turret.',
  bmp3_rok: 'BMP-3 in Republic of Korea service: the standard BMP-3 armament (2A70, 2A72, coaxial and bow PKTs); no roof '
    + 'machine gun.',
  bwp1: 'BWP-1 upgraded with the ZSSW-30 unmanned turret (30 mm Mk 44S, Spike-LR, coaxial UKM-2000): its 7.62 is the '
    + 'coaxial gun; no roof machine gun.',
  bmp2: 'BMP-2: 30 mm 2A42, a coaxial 7.62 mm PKT and the 9M113 Konkurs launcher on the turret roof; no roof machine gun.',
  m2a2_bradley: 'M2A2 Bradley: 25 mm M242, a coaxial M240C and the twin TOW launcher; no pintle or roof machine gun.',
  m3a3_bradley: 'M3A3 Bradley CFV: 25 mm M242, a coaxial M240C and the twin TOW launcher; no pintle or roof machine gun.',
  ua_m2a3_bradley: 'M2A3 Bradley in Ukrainian service: 25 mm M242, a coaxial M240C and the twin TOW launcher; no pintle or '
    + 'roof machine gun.',
  fv510: 'FV510 Warrior: 30 mm L21A1 RARDEN and a coaxial 7.62 mm L94A1 chain gun; no pintle or roof machine gun.',
  fv510_milan: 'FV510 Warrior with the MILAN post: 30 mm RARDEN, a coaxial L94A1 chain gun and the dismountable MILAN '
    + 'firing post; no pintle or roof machine gun.',
  ajax: 'Ajax (turreted Scout SV): 40 mm CT40 and a coaxial 7.62 mm L94A1 chain gun; the Protector remote station fits '
    + 'only on the turretless variants (or in place of the Orion sight), so the turreted Ajax carries no roof gun.',
  spz_puma: 'Schützenpanzer Puma: 30 mm MK30-2/ABM, a coaxial 5.56 mm MG4 and the MELLS (Spike-LR) launcher in an '
    + 'unmanned turret; no roof machine gun.',
  spz_wotan: 'Schützenpanzer Puma S1: 30 mm MK30-2/ABM, a coaxial 5.56 mm MG4 and the MELLS launcher; the S1 carries no '
    + 'roof weapon station (its commander sight is the PERI RTWL head).',
  hayate_ifv: 'Type 89 IFV: 35 mm KDE, a coaxial 7.62 mm Type 74 and two Type 79 Jyu-MAT launchers; no roof machine gun.',
  tos1a_tagil: 'TOS-1A Solntsepyok: the 24-tube 220 mm launcher on a T-72 chassis; the crew relies on personal arms and '
    + 'the vehicle carries no machine gun.',
  kv2: 'KV-2: the 152 mm M-10 and three 7.62 mm DT machine guns in ball mounts (coaxial, turret rear and hull bow); no '
    + 'roof machine gun.',
  centurion3: 'Centurion Mk 3: the 20-pounder and a coaxial 7.92 mm Besa; the Mk 3 carried no roof machine gun (the '
    + 'commander\'s .30 Browning arrived with later marks).',
});

export function carriesNoRoofWeapon(id: string): boolean {
  return Object.hasOwn(NO_ROOF_WEAPON, id);
}
