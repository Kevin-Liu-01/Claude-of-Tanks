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
});

export function carriesNoRoofWeapon(id: string): boolean {
  return Object.hasOwn(NO_ROOF_WEAPON, id);
}
