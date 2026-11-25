// settingsQualityLevels.selftest.mjs — every graphics level the Settings picker offers says what it changes and shows it
// (texture-diet-277; Kevin 2026-11-25: "add the previews for the quality levels for all levels"; Main: each level's
// description and preview match what it actually changes).
// 1. every level on both ladders has a published preview (public/media/settings-r2, tools/quality-previews.mjs) whose bytes
//    match the manifest, shot under that level, with the level's levers recorded as engine/quality.ts holds them;
// 2. each level's English note states the levers it changes, as quality.ts sets them: raster, edge smoothing, grass,
//    shadow reach, light effects, bloom, ground shading and the terrain texture tier;
// 3. Settings names a preview and a note for every level, on phones too, and no phone level shows a raw preset id.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MOBILE_PRESET_ORDER, PRESETS, PRESET_ORDER } from '../engine/quality.ts';

const root = new URL('../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root));
const levels = [...PRESET_ORDER, ...MOBILE_PRESET_ORDER];

// 1.
const manifest = JSON.parse(read('public/media/settings-r2/manifest.json'));
assert.deepEqual(manifest.items.map((i) => i.preset).sort(), [...levels].sort(), 'one preview per level, both ladders');
for (const item of manifest.items) {
  const bytes = read(`public/media/settings-r2/${item.file}`);
  assert.equal(item.file, `quality-${item.preset}.webp`, `${item.preset}: the file Settings asks for`);
  assert.equal(bytes.toString('latin1', 0, 4) + bytes.toString('latin1', 8, 12), 'RIFFWEBP', `${item.preset}: a WebP`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, `${item.preset}: the bytes the manifest records`);
  assert.ok(bytes.length < 200_000, `${item.preset}: a thumbnail (${bytes.length} B)`);
  const { label, ...levers } = PRESETS[item.preset];
  assert.equal(item.label, label, `${item.preset}: label`);
  assert.deepEqual(item.settings, JSON.parse(JSON.stringify(levers)),
    `${item.preset}: shot under the levers quality.ts holds now (re-shoot: node tools/quality-previews.mjs)`);
  assert.equal(item.device, MOBILE_PRESET_ORDER.includes(item.preset) ? 'preview-phone' : 'preview-desktop', `${item.preset}: its display`);
}
const shas = manifest.items.map((i) => i.sha256);
assert.equal(new Set(shas).size, shas.length, 'no two levels publish the same frame');

// 2.
const en = JSON.parse(read('src/ui/i18nCatalog.en-US.json'));
const noteKey = { ultralow: 'ultraLow', 'mobile-high': 'mobileHigh', 'mobile-low': 'mobileLow', 'mobile-ultralow': 'mobileUltraLow' };
for (const name of levels) {
  const p = PRESETS[name], phone = MOBILE_PRESET_ORDER.includes(name);
  const note = en[`settings.preset.note.${noteKey[name] ?? name}`];
  assert.ok(note, `${name}: a note`);
  assert.match(note, new RegExp(`shadows to ${p.shadowMaxFar} m`), `${name}: shadow reach ${p.shadowMaxFar} m`);
  if (p.maxPixelRatio === 1) assert.match(note, /^Native resolution/, `${name}: native raster`);
  else assert.match(note, new RegExp(`${p.maxPixelRatio < 1 ? '^' : 'Up to '}${p.maxPixelRatio}× resolution`), `${name}: raster ${p.maxPixelRatio}`);
  assert.equal(/(\d)× edge smoothing/.exec(note)?.[1] ?? '0', String(p.msaaSamples), `${name}: edge smoothing ${p.msaaSamples}`);
  assert.equal(/no bloom/.test(note), p.bloom === false, `${name}: bloom`);
  assert.equal(/simplest ground shading/.test(note), p.terrainLite === true, `${name}: the light terrain splat`);
  // the phones never draw the marched clouds; on desktop, flat clouds are Ultra Low's
  assert.equal(/flat clouds/.test(note), !phone && p.volumetricClouds === false, `${name}: clouds`);
  if (!phone) {
    assert.equal(/every light effect/.test(note), p.contactShadows === true, `${name}: the light effects`);
    assert.equal(/no light effects/.test(note), !p.contactShadows && !p.terrainLite, `${name}: no light effects said where off`);
    // every phone level fetches the 512 sets (the phones always composed at 512), so only a desktop note names the tier
    assert.equal(/half-size ground textures/.test(note), p.terrainTextureTier === '512', `${name}: the terrain tier`);
    const grass = { 1: 'all the grass', 0.5: 'half the grass', 0.25: 'a quarter of the grass' }[p.tallGrass];
    if (grass) assert.ok(note.includes(grass), `${name}: grass ${p.tallGrass}`);
  } else {
    assert.equal(p.terrainTextureTier, '512', `${name}: every phone level fetches the 512 sets`);
  }
}

// 3.
const settings = read('src/ui/settings.ts').toString();
assert.match(settings, /const qualityPreview = \(name: PresetName\): string => `\/media\/settings-r2\/quality-\$\{name\}\.webp`;/,
  'Settings reads every level\'s preview from settings-r2');
assert.doesNotMatch(settings, /mobile \? null : el\('figure', 'cot-set-preview'/, 'phones show the preview too');
for (const name of ['auto', ...levels]) {
  assert.match(settings, new RegExp(`'?${name}'?: 'settings\\.preset\\.note\\.`), `Settings has a note key for ${name}`);
}
for (const key of ['mobileLow', 'mobile', 'mobileHigh', 'mobileUltraLow']) {
  assert.doesNotMatch(en[`settings.preset.${key}`], /^mobile/, `the phone level ${key} reads as a name, not a preset id`);
}

console.log(`settingsQualityLevels.selftest: ${levels.length} levels each have a preview and a note that match quality.ts`);
