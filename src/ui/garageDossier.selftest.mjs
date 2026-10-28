import assert from 'node:assert/strict';
import { getLocale, setLocale } from './i18n.ts';
import {
  garageCrewRows, garageGalleryHref, garageGunArc, garageModuleRows, garageSpecialSystem, garageStatShare, garageTechnicalViews,
} from './garageDossier.ts';
import { NATIONAL_DONOR_TURRETS, NATIONAL_GUN_PITCH_BY_YAW } from '../vehicles/nationalDonorTurrets.ts';
import { shellIconSVG, shellIconTypes } from './shellIcons.ts';

// Lock the test to the en-US catalog so the assertions stay readable while
// translations continue to live in zh-CN alongside the canonical strings.
const originalLocale = getLocale();
setLocale('en-US');
try {

const anatomy = {
  armor: {
    modules: [{ module: 'gun' }, { module: 'trackL' }, { module: 'trackR' }, { module: 'gun' }],
    crew: [{ crew: 'driver' }, { crew: 'commander' }, { crew: 'driver' }],
  },
};
assert.deepEqual(garageModuleRows(anatomy).map((row) => row.label), ['Gun', 'Track L', 'Track R']);
assert.deepEqual(garageCrewRows(anatomy).map((row) => row.label), ['Driver', 'Commander']);
assert.equal(garageModuleRows(anatomy)[1].icon, 'track');

const guided = garageSpecialSystem({
  gun: { shells: [
    { name: 'M919', type: 'APFSDS', velocityMps: 1385 },
    { name: 'TOW-2A', type: 'HEAT', guided: true, velocityMps: 340 },
  ] },
});
assert.equal(guided.icon, 'missileRack');
assert.match(guided.detail, /click to launch/i);
assert.match(guided.detail, /cursor/i);
assert.equal(garageSpecialSystem({
  gun: { primaryGuided: true, shells: [
    { name: 'Shillelagh', type: 'HEAT', guided: true, velocityMps: 208 },
  ] },
}), null, 'missile-primary tanks do not advertise a redundant E selector');

const suspension = garageSpecialSystem({
  hydropneumaticAim: { noseDownDeg: 14, noseUpDeg: 20 },
  gun: { shells: [] },
});
assert.equal(suspension.icon, 'track');
assert.match(suspension.meta, /14° \/ \+20°/);

const magazine = garageSpecialSystem({
  gun: { shells: [], reloadS: 18.5, autoloader: { magazineSize: 3, intraClipS: 2.5 } },
}, 17.2);
assert.equal(magazine.icon, 'autoloader');
assert.match(magazine.meta, /3 rounds.*2\.5 s cycle.*17\.2 s (full )?reload/);

assert.equal(garageGalleryHref('m1a1'), '/gallery?id=m1a1');
assert.equal(garageGalleryHref('m1a1', 'modules'), '/gallery?id=m1a1&layer=modules');

const technicalViews = garageTechnicalViews();
assert.deepEqual(technicalViews.map((view) => view.id), ['armor', 'modules', 'crew']);
assert.deepEqual(technicalViews.map((view) => view.assetView),
  ['armor_side', 'modules_side', 'crew_side']);
assert.deepEqual(technicalViews.map((view) => view.galleryLayer), ['armor', 'modules', 'crew']);
assert(Object.isFrozen(technicalViews), 'garage schematic catalog is immutable');

const silhouettes = shellIconTypes().map((type) => shellIconSVG(type));
assert.equal(new Set(silhouettes).size, shellIconTypes().length, 'each ammunition class has distinct art');
for (const type of ['AP', 'APCR', 'APFSDS', 'HEAT', 'HE']) {
  assert.match(shellIconSVG(type), new RegExp(`data-shell-type="${type}"`));
}
// The Garage bar's rule: a stat's place between its tier-and-era group's least and most, a 0.14 stub to full, inverted
// where less is better; a group with no spread parks at 0.72 (Main 258 asked which rule fills the bars: this one, 257's)
const cells = (share) => Math.max(1, Math.round(share * 20));
assert.equal(garageStatShare([400, 800], 400), 0.14, 'the least is a stub');
assert.equal(garageStatShare([400, 800], 800), 1, 'the most is full');
assert.equal(cells(garageStatShare([400, 800], 600)), 11, 'the middle fills 11 of 20');
assert.equal(garageStatShare([5, 10], 5, true), 1, 'inverted: the fastest reload fills');
assert.equal(garageStatShare([5, 10], 10, true), 0.14, 'inverted: the slowest is a stub');
assert.equal(garageStatShare([400, 800], 900), 1, 'clamped above');
assert.equal(garageStatShare([700, 700], 700), 0.72, 'a group of one parks at 0.72');
assert.equal(garageStatShare(undefined, 700), 0.6, 'no range');
// 258: the gun arc names the rear stop where the gun cannot come down to level over the rear (the rear fuel drums)
assert.equal(garageGunArc({ gunDepressionDeg: 6, gunElevationDeg: 14 }), '\u22126\u00b0 / +14\u00b0');
const curveOf = (id) => NATIONAL_GUN_PITCH_BY_YAW[id] ?? NATIONAL_DONOR_TURRETS[id]?.gunPitchByYawDeg;
for (const [id, rear] of [['t72b3m_bulat_m', '5.3'], ['t72b3_bastion_m', '5.2'], ['t72b3_qilin', '10.5'], ['t72b3m_kunlun', '10.5'], ['t80u_yun', '11.3']]) {
  assert.equal(garageGunArc({ gunDepressionDeg: 6, gunElevationDeg: 14, gunPitchByYawDeg: curveOf(id) }), `\u22126\u00b0 / +14\u00b0 \u00b7 rear \u2265 +${rear}\u00b0`, id);
}
assert.equal(garageGunArc({ gunDepressionDeg: 6, gunElevationDeg: 14, gunPitchByYawDeg: [[0, -6], [150, -6], [180, -3]] }), '\u22126\u00b0 / +14\u00b0', 'a curve below level over the rear names no stop');
} finally {
  setLocale(originalLocale);
}

console.log('garageDossier.selftest: modules, crew, technical schematics, gallery links, and shell art passed');
