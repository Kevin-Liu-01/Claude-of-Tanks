import type { MapSkyConfig } from '../world/maps/horizon.ts';
import type { CloudLayerPreset } from '../engine/cloudPresets.ts';

/**
 * garageWeather.ts — the Garage's fair weather over the yards whose battlefields are overcast (2026-10-15, the SKY lane;
 * the garage critic re-judge, CRITIC-REJUDGE-20261015: Cinder "no clouds (owner rule)", Ironworks "no cumulus",
 * Frosthollow "a white mound on a white sky. No cumulus"; the coordinator routed the Garage scenes' sky to this lane).
 *
 * Why the three yards drew no clouds: the Garage reads its sky from garageSkyPresets.ts without the battlefield's
 * cloudscape (that resolver loads behind the battle entry), so the deck derivation alone decides, and Frosthollow's,
 * Cinder Junction's and Ironworks' authored overcast (both baked decks near opaque under a turbid sky) derives a closed
 * stratus sheet with no cells: a plain pale gradient behind the hero. The same rule set the light model's overcast to
 * 0.8, which took the sun's direct light away (the critics' "light is flat").
 *
 * The battles keep their decks (the owner's 2026-10-13 ruling calls out only Fjord's broken stratocumulus). A Garage is a
 * presentation scene, and the owner's reference cloud is Verdant's fair-weather cumulus, so these yards take that regime,
 * tuned to the place (its cover and tint), and only the weather: the cirrus veil at Verdant's 0.6, the baked low deck at
 * the fair-weather altitude (the phones' sky), the cloud tint, the cloudscape (which the light model reads: a
 * shadow-casting cumulus regime is no overcast, so the sun lights the yard), and `cloudLayer`, the battle resolver's
 * resolution of that cloudscape on this sky written out field by field (the fields where it differs from the deck
 * derivation), so the volumetric layer draws the cumulus without loading the resolver's chunk. The scattering, fog, sun
 * (strength, colour, and the Garage's own elevation and azimuth trim in garageSkyPresets.ts) and grade stay the
 * battlefield's. garageWeather.selftest.mjs re-resolves every row with the battle resolver and pins it.
 */
type GarageWeather = Readonly<Partial<MapSkyConfig>>;

/** The fair-weather cumulus row, as the battle resolver resolves it on these skies (the cover varies per place). */
const cumulus = (coverage: number, shadowThreshold: number): Readonly<Partial<CloudLayerPreset>> => Object.freeze({
  regime: 'fair-weather-cumulus', coverage, thicknessM: 820, towers: 0.15, stratiform: 0.08, density: 0.12, shadowThreshold,
  typeRange: [0.3, 0.62] as [number, number], wispiness: 0.35, shearM: 123, streets: 0.35, cirrus: 0.12, cirrusAltM: 9500,
  ambientScale: 0.9, farBand: 0.25, farBandAltM: 1810, cluster: 0.6, baseFlat: 1, deckDetail: 0,
});

/** The decks a fair-weather sky draws: Verdant's cirrus veil, the baked low deck at its fair-weather altitude, the tint. */
const fairDecks = (tintHex: number) => ({
  cloudOpacity2: 0.6, cloudAltM: undefined, cloudHazeK: undefined, cloudUvM: undefined, cloudShadowAmp: undefined, cloudTintHex: tintHex,
});

export const GARAGE_WEATHER: Readonly<Record<string, GarageWeather>> = Object.freeze({
  // Frosthollow: a cold, clear morning over the snow, the cumulus cool-white
  winter: Object.freeze({
    ...fairDecks(0xf4f7fb),
    cloudscape: Object.freeze({ regime: 'fair-weather-cumulus', coverage: 0.40, tintHex: 0xf4f7fb }),
    cloudLayer: cumulus(0.40, 0.6),
  }),
  // Cinder Junction: the railyard's smoke takes the cumulus a shade warm-grey, a little more of it
  railyard: Object.freeze({
    ...fairDecks(0xece6dc),
    cloudscape: Object.freeze({ regime: 'fair-weather-cumulus', coverage: 0.44, tintHex: 0xece6dc }),
    cloudLayer: cumulus(0.44, 0.56),
  }),
  // Ironworks: the works' haze warms the cumulus
  foundry: Object.freeze({
    ...fairDecks(0xefe5d6),
    cloudscape: Object.freeze({ regime: 'fair-weather-cumulus', coverage: 0.42, tintHex: 0xefe5d6 }),
    cloudLayer: cumulus(0.42, 0.58),
  }),
});

const merged = new WeakMap<object, Readonly<MapSkyConfig>>();

/** The Garage's sky for a destination: its battlefield's (garageSkyPresets.ts) under the declared fair weather. */
export function withGarageWeather(mapId: string, sky: Readonly<MapSkyConfig>): Readonly<MapSkyConfig> {
  const weather = GARAGE_WEATHER[mapId];
  if (!weather) return sky;
  let out = merged.get(sky);
  if (!out) {
    out = Object.freeze({ ...sky, ...weather }) as Readonly<MapSkyConfig>;
    merged.set(sky, out);
  }
  return out;
}
