// 2026-10-13 (the owner, on the site's map wall: "for clouds, the ones that have been good are the ones depicted in this
// verdant and bad is fjord. no more of the cloud type depicted in fjord pls"): the broken stratocumulus — a lumpy grey deck
// with breaks and heavy dark bases — is banned. This receipt keeps it out of every path that can put a cloud type in a sky:
// the regime vocabulary, every map's authored cloudscape, the battle's times of day (the diurnal law and a map's own sunset
// and night knobs), the battle weather variants (every seed's pick through the battle atmosphere runtime), Scene Studio's
// time plans, the Garage skies (the deck derivation) and the phones' baked decks. It pins the three maps that carried it
// (Nordhavn Fjord, Tidegate Polders, Copper Mesa) to Verdant's fair-weather cumulus — cumuliform at every time, Verdant's
// shape model, lit by the sun (no overcast) and casting the shade map's pattern by day — and what the rest of the world
// reads from their clouds (the far panorama's deck, the trees' wind).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLOUDSCAPE_REGIMES, CLOUDSCAPE_REGIME_NAMES, isCloudscapeRegime } from './cloudscapes.ts';
import { deriveCloudLayerPreset, loadCloudscapeLayers } from './cloudPresets.ts';
import { DEFAULT_SKY_PRESET } from './sky.ts';
import { MARS_SKY_PRESET } from './marsAtmosphere.ts';
import { BATTLE_WEATHER_BIOMES, battleTimePreset, createBattleAtmosphereRuntime } from './battleAtmosphereRuntime.ts';
import { BATTLE_TIMES } from './battleWeatherPolicy.ts';
import { resolveOvercast } from './lightModelCore.ts';
import { MAP_IDS } from '../world/maps/catalog.ts';
import { getMapConfig } from '../world/maps/index.ts';
import { sceneWindOf } from '../world/sceneWind.ts';
import { resolveTreeWind } from '../world/treeClimate.ts';
import { horizonPanoramaDeckM } from '../world/maps/horizon.ts';
import { GARAGE_SKY_PRESETS } from '../game/garageSkyPresets.ts';
import { withGarageWeather } from '../game/garageWeather.ts';
import { CLOUD_DECK_TUNE, cloudStackOf } from './cloudLayers.ts';
import { STUDIO_TIMES, planStudioLight } from '../game/studioLight.ts';

await loadCloudscapeLayers(); // a map's cloudscape resolves behind the battle entry, as in a battle

const BANNED = 'broken-stratocumulus';
/** The deck derivation's own broken sky (cloudPresets.ts deriveLegacy): the banned deck's nearest cousin, kept off the Garage. */
const LEGACY_BROKEN = 'broken';
const FORMER = Object.freeze(['fjord', 'polders', 'copper_mesa']);
const CUMULIFORM = Object.freeze(['fair-weather-cumulus', 'cloud-streets', 'sea-streets', 'towering-cumulus', 'cumulus-humilis']);
const here = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
/**
 * 2026-10-15 (the coordinator: the 10-13 ruling enforced on all 33 maps and every Garage sky, "a receipt that fails if any
 * map resolves to the banned deck type"): the banned look by what Clouds 2.0 draws, whatever the regime is called — a
 * stratocumulus deck (a flat lane carrying cells: the lumpy grey deck) whose drawn cover leaves breaks. A deck is
 * closed (an overcast's sheet, its relief under it) or the sky is cumuliform; a broken cell deck is the Fjord look (keyed
 * on the cells, not the flatness: an opening deck's lane flattens less, 0.45 at 0.7 cover, and is the banned look most).
 * A cumulus lane carries no cells (asserted below for the cumuliform regimes). A LOW deck (base under 2 km): Urban's
 * altocumulus at 2.8 km is a mid-level mackerel sky of small cells, not the low lumpy deck with heavy dark bases.
 */
const brokenDecks = (layer) => cloudStackOf(layer).lanes.filter((lane) => lane.cells >= 0.5 && lane.baseM < 2000)
  .map((lane) => lane.cover * (CLOUD_DECK_TUNE.CLOUD_DECK_COVER ?? 1)).filter((cover) => cover < 1);

// ---- the vocabulary: the regime is gone from the union, the table and the guard
assert.ok(!isCloudscapeRegime(BANNED), 'broken-stratocumulus is no cloudscape regime');
assert.ok(!Object.hasOwn(CLOUDSCAPE_REGIMES, BANNED) && !CLOUDSCAPE_REGIME_NAMES.includes(BANNED), 'and has no row');
assert.doesNotMatch(here('./cloudscapes.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /broken-stratocumulus/,
  'cloudscapes.ts names it only in its history note');
for (const name of CUMULIFORM) assert.ok(isCloudscapeRegime(name), `${name} is a regime`);

// the sky a battle starts from (main.ts getAuthoredPreset: the sky block, the cloudscape and the scene wind ride together)
const authoredOf = (id) => {
  if (id === 'mars') return { ...MARS_SKY_PRESET };
  const cfg = getMapConfig(id);
  return { ...(cfg.sky ?? {}), ...(cfg.clouds ? { cloudscape: cfg.clouds } : {}), ...sceneWindOf(cfg) };
};
const layerOf = (preset) => deriveCloudLayerPreset({ ...DEFAULT_SKY_PRESET, ...preset });
const skyMaps = MAP_IDS.filter((id) => id !== 'moon'); // the Moon's airless sky draws no cloud (cloudOpacity 0)
assert.equal(getMapConfig('moon').sky.cloudOpacity, 0);

// ---- every map's authored cloudscape, and every battle time over it (the diurnal law and a map's own time knobs)
const dayLayer = {};
for (const id of skyMaps) {
  const cfg = getMapConfig(id);
  const scape = id === 'mars' ? MARS_SKY_PRESET.cloudscape : cfg.clouds;
  assert.ok(scape && isCloudscapeRegime(scape.regime), `${id} authors a known regime`);
  assert.notEqual(scape.regime, BANNED, `${id} does not author the banned deck`);
  for (const time of ['sunset', 'night']) {
    assert.ok(!scape[time] || !Object.hasOwn(scape[time], 'regime'), `${id}: a ${time} override cannot switch the regime`);
  }
  for (const time of BATTLE_TIMES) {
    const p = layerOf(battleTimePreset(authoredOf(id), time === 'day' ? null : time));
    assert.equal(p.regime, scape.regime, `${id} at ${time} keeps its authored ${scape.regime}`);
    assert.notEqual(p.regime, BANNED, `${id} at ${time}`);
    if (time === 'day') dayLayer[id] = p;
    assert.deepEqual(brokenDecks(p), [], `${id} at ${time}: no broken stratocumulus deck (a deck is closed or the sky is cumulus)`);
    // a cumulus regime cannot be knobbed into a deck (the banned look rebuilt from a cumulus row: cells, the deck's
    // transmitted lighting, its lumps and interior octave, a stratiform sheet)
    if (CUMULIFORM.includes(scape.regime)) {
      assert.deepEqual([p.cells, p.deckLight, p.lumps, p.interior], [0, 0, 0, 0], `${id} at ${time}: a cumulus sky carries no deck structure`);
      assert.ok(p.stratiform < 0.3, `${id} at ${time}: cumuliform (stratiform ${p.stratiform})`);
    }
  }
}

// ---- the battle weather variants: every seed's pick on every map, through the runtime that applies it
{
  let current = null;
  const applied = [];
  const runtime = createBattleAtmosphereRuntime({
    getAuthoredPreset: () => current,
    applyPreset: (preset) => applied.push(preset),
  });
  const seen = new Set();
  for (const id of MAP_IDS) {
    current = authoredOf(id);
    for (let seed = 1; seed <= 24; seed++) {
      runtime.prepare(seed * 7919, id);
      const preset = applied.at(-1);
      const weather = runtime.weather;
      assert.deepEqual(Object.keys(weather).filter((k) => /cloud|regime|scape/i.test(k)), ['cloudOpacityMultiplier'], 'a variant names no cloud type');
      assert.equal(weather.cloudOpacityMultiplier, 1, 'a variant never thickens the sky');
      seen.add(`${BATTLE_WEATHER_BIOMES[id]}:${weather.timeOfDay}`);
      if (id === 'moon') continue;
      const p = layerOf(preset);
      assert.notEqual(p.regime, BANNED, `${id} seed ${seed} (${weather.timeOfDay})`);
      assert.equal(p.regime, (preset.cloudscape ?? {}).regime ?? p.regime, `${id} seed ${seed}: the variant keeps the map's own regime`);
      assert.deepEqual(brokenDecks(p), [], `${id} seed ${seed} (${weather.timeOfDay}): no broken stratocumulus deck`);
    }
    runtime.reset();
  }
  runtime.dispose();
  for (const time of BATTLE_TIMES) assert.ok([...seen].some((k) => k.endsWith(`:${time}`)), `the seeds reach a ${time} battle`);
}

// ---- Scene Studio's time plans (every map, every Studio time; the plan's sky carries the map's cloudscape)
for (const id of skyMaps) {
  const authored = authoredOf(id);
  const identity = { offset: dayLayer[id].offset, windDirRad: dayLayer[id].windDirRad };
  for (const time of STUDIO_TIMES) {
    const plan = planStudioLight(id, authored, time, null, identity);
    assert.notEqual(plan.sky.cloudscape?.regime, BANNED, `Studio ${id} ${time}: the plan's cloudscape`);
    const p = layerOf(plan.sky);
    assert.notEqual(p.regime, BANNED, `Studio ${id} ${time}`);
    assert.ok(!plan.sky.cloudLayer || !Object.hasOwn(plan.sky.cloudLayer, 'regime'), `Studio ${id} ${time}: no raw regime override`);
    assert.deepEqual(brokenDecks(p), [], `Studio ${id} ${time}: no broken stratocumulus deck`);
  }
}

// ---- the Garage skies: the deck derivation alone (no cloudscape), never the banned deck nor the legacy broken sky
for (const [id, sky] of Object.entries(GARAGE_SKY_PRESETS)) {
  assert.equal(sky.cloudscape, undefined, `Garage ${id}: no cloudscape`);
  const p = layerOf(sky);
  assert.ok(p.regime !== BANNED && p.regime !== LEGACY_BROKEN, `Garage ${id} resolves to ${p.regime}`);
  // the sky the Garage draws (its fair weather over the overcast yards: garageWeather.ts): no broken deck either
  const drawn = layerOf(withGarageWeather(id, sky));
  assert.ok(drawn.regime !== BANNED && drawn.regime !== LEGACY_BROKEN, `Garage ${id} draws ${drawn.regime}`);
  assert.deepEqual(brokenDecks(drawn), [], `Garage ${id}: no broken stratocumulus deck`);
}
// the decks the world draws today: closed (Frosthollow, Cinder Junction, Ironworks, Whiteout), every other sky cumuliform
// or without a cell deck; and the vocabulary's cell-deck rows cannot be authored back into breaks by their own defaults
{
  const closedDecks = skyMaps.filter((id) => cloudStackOf(dayLayer[id]).lanes.some((lane) => lane.cells >= 0.5 && lane.baseM < 2000));
  assert.deepEqual(closedDecks.sort(), ['foundry', 'railyard', 'whiteout', 'winter'], 'the closed cell decks');
  assert.equal(CLOUD_DECK_TUNE.CLOUD_DECK_COVER, 1, 'the render tune never opens a deck into breaks');
  // the negative control: Frosthollow's old 0.86 deck, and a stratocumulus deck at 0.7, are what the check catches
  for (const coverage of [0.86, 0.7]) {
    const old = layerOf({ ...getMapConfig('winter').sky, cloudscape: { ...getMapConfig('winter').clouds, coverage } });
    assert.ok(brokenDecks(old).length > 0, `the check sees a broken cell deck at ${coverage}`);
  }
  for (const id of ['winter', 'foundry']) assert.equal(getMapConfig(id).clouds.coverage, 0.92, `${id}: closed (0.86 / 0.88 left the banned breaks)`);
  assert.equal(getMapConfig('blackglass').clouds.regime, 'fair-weather-cumulus', 'Suzhou Creek: its ash veil was a low broken cell deck');
  assert.ok(cloudStackOf(dayLayer.urban).lanes.every((lane) => lane.cells < 0.5 || lane.baseM >= 2000), 'Urban: its cells stand at mid level (altocumulus)');
}

// ---- the phones' baked decks (sky.ts over skyCloudBake.ts): one fair-weather cumulus bake for every map, so a map's deck
// differs only by its sky block's uniforms; the former maps' uniforms read as Verdant's cumulus deck, not a low broken one
{
  const sky = here('./sky.ts');
  assert.equal((sky.match(/bakeCumulusPixels\(/g) ?? []).length, 1, 'sky.ts calls the cumulus bake once');
  assert.match(sky, /\|\| bakeCumulusPixels\(width, width, CLOUD_BAKE_CONFIG\);/, 'the main-thread bake is the one config');
  assert.match(sky, /config: CLOUD_BAKE_CONFIG,/, 'the worker bakes the same config');
  assert.match(sky, /const CLOUD_ALT = 620; \/\/ classic 1049 cumulus deck altitude/, 'the classic cumulus deck');
  const CLOUD_ALT = 620;
  const luminance = (hex) => {
    const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * lin((hex >> 16) & 255) + 0.7152 * lin((hex >> 8) & 255) + 0.0722 * lin(hex & 255);
  };
  for (const id of [...FORMER, 'blackglass']) {
    const s = { ...DEFAULT_SKY_PRESET, ...getMapConfig(id).sky };
    const overcastBranch = s.cloudOpacity >= 0.95 && s.cloudOpacity2 >= 0.9 && s.turbidity >= 7; // sky.ts updateCloudDecks
    assert.ok(!overcastBranch, `${id}: the phone deck is not the 340 m broken-stratus branch`);
    assert.ok(s.cloudAltM == null || s.cloudAltM >= CLOUD_ALT, `${id}: no low deck under the classic cumulus deck (${s.cloudAltM})`);
    assert.ok(s.cloudOpacity <= 1.15 && s.cloudOpacity2 <= 0.6, `${id}: Verdant-scale cover and cirrus veil (${s.cloudOpacity} / ${s.cloudOpacity2})`);
    assert.ok(luminance(s.cloudTintHex) >= 0.8, `${id}: a white cumulus tint, not a grey deck (${s.cloudTintHex.toString(16)})`);
  }
}

// ---- the three former maps: Verdant's fair-weather cumulus at every time, Verdant's shape model, tuned to their place
{
  const verdant = dayLayer.verdant;
  assert.equal(verdant.regime, 'fair-weather-cumulus', 'Verdant is the reference');
  const shape = (p) => [p.typeRange, p.cluster, p.baseFlat, p.stratiform, p.fieldMix, p.density, p.wispiness, p.anvil];
  for (const id of FORMER) {
    const cfg = getMapConfig(id);
    assert.equal(cfg.clouds.regime, 'fair-weather-cumulus', `${id} authors Verdant's regime`);
    for (const time of BATTLE_TIMES) {
      const p = layerOf(battleTimePreset(authoredOf(id), time === 'day' ? null : time));
      assert.equal(p.regime, 'fair-weather-cumulus', `${id} at ${time}`);
      assert.deepEqual([p.rain, p.virga, p.scud], [0, 0, 0], `${id} at ${time}: no drizzle, virga or scud (the deck's weather went with it)`);
      assert.equal(p.shadow, time !== 'night', `${id} at ${time}: cumulus casts its shadows by day`);
      assert.equal(p.shadowPattern, time === 'night' ? 0 : 1, `${id} at ${time}: the cloud shade map's whole pattern by day`);
    }
    const day = dayLayer[id];
    assert.deepEqual(shape(day), shape(verdant), `${id}: Verdant's cumulus shape model`);
    // the place: cover near Verdant's (the dry upland nearer the humilis maps', the polders a little more), a cumulus base
    assert.ok(day.coverage >= 0.2 && day.coverage <= 0.45, `${id}: scattered cover (${day.coverage})`);
    assert.ok(day.baseM >= 1000 && day.baseM <= 1800, `${id}: a cumulus base (${day.baseM} m)`);
    // what the light reads: no overcast (the deck never was one: it cast shadows), the far summits among the clouds
    assert.equal(resolveOvercast({ ...cfg.sky, cloudscape: cfg.clouds }), 0, `${id}: the sun is not cut`);
    assert.equal(horizonPanoramaDeckM(cfg, 1100), 2600, `${id}: scattered clouds lift the panorama's deck`);
    // the wind aloft as the deck had it (7 m/s): the trees' sway and the scene wind keep their strength
    assert.equal(cfg.clouds.windSpeed, 7, `${id}: 7 m/s aloft`);
    assert.equal(resolveTreeWind(cfg).strength, 1, `${id}: the trees sway as before`);
  }
  const by = Object.fromEntries(FORMER.map((id) => [id, dayLayer[id]]));
  assert.ok(by.polders.coverage > verdant.coverage, 'the Dutch sky: a little more cumulus than Verdant');
  assert.ok(by.copper_mesa.coverage < verdant.coverage && by.copper_mesa.baseM > verdant.baseM, 'the dry upland: less cover, a higher base');
  assert.ok(by.fjord.baseM < verdant.baseM && getMapConfig('fjord').clouds.windDirDeg === getMapConfig('fjord').ocean.windDirDeg,
    'the fjord: a lower sea-air base, the clouds on the fjord\'s sea wind');
  for (const id of ['fjord', 'polders']) assert.ok(by[id].fogBank > 0 && getMapConfig(id).clouds.nightGlow > 0, `${id}: the sea fog bank and the town glow stay`);
}

console.log(`cloudsBan.selftest: broken-stratocumulus banned — ${skyMaps.length} maps x ${BATTLE_TIMES.length} times, ${MAP_IDS.length} maps x 24 weather seeds, `
  + `${STUDIO_TIMES.length} Studio times, ${Object.keys(GARAGE_SKY_PRESETS).length} Garage skies and the phone deck; fjord, polders and copper_mesa on Verdant's fair-weather cumulus PASS`);
