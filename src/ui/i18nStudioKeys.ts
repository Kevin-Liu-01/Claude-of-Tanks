/**
 * i18nStudioKeys.ts — which catalog keys belong to the Scene Studio's own lazily loaded slice.
 *
 * The media Studio (film export, picture, light and cinematic-FX panels, its extra times of day) added 125 strings per
 * locale. They stay in the one translated catalog (gt.config.json names only `i18nCatalog.[locale].json`), but the
 * game's boot catalogs never carry them: the build serves the game's catalog modules without these keys and each
 * locale's Studio slice as its own module, which the Studio loads with its chunk (tools/viteI18nStudioCatalog.ts,
 * src/ui/studioStrings.ts). Every key matched here is shown only by Studio modules, and the older Studio strings the
 * game already shipped stay in the boot catalog (src/ui/i18nLazyCatalog.selftest.mjs).
 */
// whole families the media Studio introduced
const STUDIO_KEY_PREFIXES = Object.freeze([
  'studio.film.',
  'studioPanel.picture.',
  'studioPanel.light.',
  'studioPanel.fxParam.',
  // the Plan view (studioPlanView.ts, 2026-10-05)
  'studioPanel.plan.',
]);
// single keys it added beside older Studio families
const STUDIO_KEYS = new Set([
  // the cinematic effects beside the game's own effect buttons
  'studioPanel.fx.cinematicOn', 'studioPanel.fx.cinematicOff', 'studioPanel.fx.trackDustOn', 'studioPanel.fx.trackDustOff',
  'studioPanel.fx.smokeScreen', 'studioPanel.fx.flare', 'studioPanel.fx.embers', 'studioPanel.fx.fireField',
  'studioPanel.fx.shockwave', 'studioPanel.fx.debris', 'studioPanel.fx.explHuge',
  'studioPanel.section.picture', 'studioPanel.section.pictureSub', 'studioPanel.info.section.picture',
  'studioPanel.fxGroup.cinematic', 'studioPanel.fxParams.title',
  // the Studio's extra times of day (the battle picker offers day, sunset and night)
  'atmosphere.dawn', 'atmosphere.morning', 'atmosphere.golden', 'atmosphere.dusk',
]);

/** True for a key of the Studio's demand-loaded slice. */
export function isStudioCatalogKey(key: string): boolean {
  return STUDIO_KEYS.has(key) || STUDIO_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}
