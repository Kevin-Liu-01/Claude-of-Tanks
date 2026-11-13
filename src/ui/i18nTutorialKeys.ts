/**
 * i18nTutorialKeys.ts — which catalog keys belong to the first-game tutorial's own lazily loaded slice (272).
 *
 * The tutorial's step titles, bodies and card controls are shown only by its overlay (src/ui/tutorial/), which loads
 * when a chapter runs. The game's boot catalogs never carry them: the build serves the game's catalog modules without
 * these keys and each locale's tutorial slice as its own module, which the overlay's chunk loads beside itself
 * (tools/viteI18nStudioCatalog.ts, src/ui/tutorialStrings.ts). Settings' Replay row and the manual's link keep their
 * own keys (settings.tutorial.*, docs.start.replay) in the catalogs their pages load.
 */

/** True for a key of the tutorial's demand-loaded slice. */
export function isTutorialCatalogKey(key: string): boolean {
  return key.startsWith('tutorial.');
}
