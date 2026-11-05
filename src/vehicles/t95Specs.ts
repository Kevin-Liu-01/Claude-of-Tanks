// The T95 superheavy tank destroyer with a fictional 152 mm gun (release 270; owner 2026-11-05: "also use our generation
// procedure to make the t95 and its 152mm cannon"; DECISIONS "2026-11-05 American T95 with a 152 mm gun"). The 1945
// pilot in fighting trim, both outer track units fitted (profiles/t95.ts builds it). Published figures
// (docs/references/tanks/t95.md): 86.2 t combat weight, the Ford GAF V8 of 500 hp gross through the Torqmatic, 13 km/h,
// four crew, 305 mm of cast bow, the 292 mm ball mantlet, 133 mm lower front at 60 degrees, 64 mm upper sides at 57
// degrees over 51 mm lower sides and 102 mm outer skirts, 51 mm rear, 38 mm roof, 25 mm floor; the T40 ball mount's
// 10 degrees right and 11 left (one 10.5 degree arc here), +19.5/-5 degrees. The gun is fictional: the US Navy 6"/47
// Mark 16's 152.4 mm bore, 7.17 m tube and separate brass-cased rounds (NavWeaps; Wikipedia), its AP Mark 35 (59.0 kg,
// 762 m/s), Common Mark 27 (47.6 kg, 853 m/s) and HC Mark 39 (47.6 kg, 812 m/s). No penetration table is published for
// the naval rounds: the AP's figure is the De Marre scaling of the T5E1's T32 (17.7 kg, 866 m/s, 235 mm) and is marked
// as an estimate in the packet; damage and reload sit at the fleet's heavy tank destroyer footing for the balance
// session to measure (Main rules the tier from the duels).
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariantFrom, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { donorSpec } from './donorSpecs.ts';
import { communityArmor, shell } from './specHelpers.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const t95 = cloneFleetVariantFrom(donorSpec(registries.tankSpecs, 'jpz_e100'), 't95', 'jpz_e100',
  { name: 'T95 (152 mm)', nation: 'USA', era: 'ww2', role: 'td' });
for (const key of ['balancePeerOf', 'publicVisualFallback', 'label', 'roster', 'variantOf', 'gunPitchByYawDeg'] as const) delete t95[key];
stripSilhouetteDimensions(t95.dims);
Object.assign(t95, {
  hp: 1900, enginePowerHp: 500, weightTons: 86.2, topSpeedKmh: 13, reverseSpeedKmh: 5,
  hullTraverseDegS: 12,
  terrainResistance: { hard: 1.35, medium: 1.55, soft: 2.6 },
  pivotStyle: 'neutral',
  turretTraverseDegS: 10, gunPitchDegS: 8, gunElevationDeg: 19.5, gunDepressionDeg: 5, gunArcDeg: 10.5,
});
t95.gun = {
  ...t95.gun,
  caliberMm: 152, reloadS: 24, baseAccuracy: 0.38, aimTimeS: 3.0,
  shells: [
    shell('AP Mk 35 (6"/47)', 'AP', 152, 310, 290, 1100, 762),
    shell('Common Mk 27 (6"/47)', 'APHE', 152, 165, 150, 1250, 853),
    shell('HC Mk 39 (6"/47)', 'HE', 152, 75, 75, 1350, 812),
  ],
};
// the registered print's envelope at its one uniform scale: the published 4.37 m over the outer units (History of War)
// and the 7.62 m hull of the March 1945 table; 10.93 m over the fictional gun (its muzzle on the print's); 2.84 m over
// the commander's .50 cal (every source)
Object.assign(t95.dims, { hullLengthM: 7.62, overallLengthM: 10.93, widthM: 4.37, heightM: 2.84 });
t95.armor = communityArmor({
  lenM: 7.62, widM: 4.37, hgtM: 2.84, turretPivot: [0, 1.39, 0.42],
  gunPivot: [0, 0, 0], barrelLenM: 5.04, barrelRadM: 0.15,
  frontMm: 305, sideMm: 64, rearMm: 51, roofMm: 38,
  tFrontMm: 305, tSideMm: 64, tRearMm: 51, mantletMm: 292, turretless: true,
});
t95.armor.turretless = true;
t95.armor.turretPlates = [];
// the pilot's Army olive drab with the white star (the US Factory coat, the owner's 2026-10-22 rule for plain US coats)
t95.visual = { ...t95.visual, scheme: 'solid', base: '#4b4e32', weather: '#575a3e', patches: [], marking: 'star', number: '95',
  trackWidthM: 0.50, camoScale: 0.5 };

registerFleetSpecs(registries, ['t95'], { t95 });
