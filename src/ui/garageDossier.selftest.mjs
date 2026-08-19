import assert from 'node:assert/strict';
import {
  garageCrewRows, garageGalleryHref, garageModuleRows, garageSpecialSystem,
} from './garageDossier.js';
import { shellIconSVG, shellIconTypes } from './shellIcons.js';

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
  gun: { shells: [{ name: 'TOW-2A', type: 'HEAT', guided: true, velocityMps: 340 }] },
});
assert.equal(guided.icon, 'missileRack');
assert.match(guided.detail, /click to launch/i);
assert.match(guided.detail, /cursor/i);

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
assert.match(magazine.meta, /3 rounds.*2\.5 s cycle.*17\.2 s reload/);

assert.equal(garageGalleryHref('m1a1'), '/gallery?id=m1a1');
assert.equal(garageGalleryHref('m1a1', 'modules'), '/gallery?id=m1a1&layer=modules');

const silhouettes = shellIconTypes().map((type) => shellIconSVG(type));
assert.equal(new Set(silhouettes).size, shellIconTypes().length, 'each ammunition class has distinct art');
for (const type of ['AP', 'APCR', 'APFSDS', 'HEAT', 'HE']) {
  assert.match(shellIconSVG(type), new RegExp(`data-shell-type="${type}"`));
}

console.log('garageDossier.selftest: modules, crew, special systems, gallery links, and shell art passed');
