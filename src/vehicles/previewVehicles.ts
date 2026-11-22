/**
 * previewVehicles.ts — the vehicles that get a preview beside the tanks, by kind (endscreen-modes-275; the owner: "when we
 * select ac 130 game mode the tank previews should have a ac 130 presented like the tanks").
 *
 * Every tank is previewed from its spec id (specs.ts). An aircraft a mode puts the player in has no spec: it is a
 * first-party airframe (src/game/gunshipAirframe.ts) the battle swaps in for the garage tank. This table names those
 * aircraft once, so every preview surface asks one question, "which vehicle, of which kind", and the pipelines build
 * either kind from it: the icon and hero-card renders (tools/icons-page.html, tools/hero-cards-page.html), the Garage
 * pedestal, Deploy's vehicle card, the battle load's rows and the end screen. The renders keep the tanks' file names, so
 * iconUrl / maskIcon / the hero manifest read an aircraft id as they read a spec id.
 *
 * Pure data, no three, no DOM: Node-runnable (previewVehicles.selftest.mjs ties MODE_AIRCRAFT to the rulesets).
 */

export type PreviewVehicleKind = 'tank' | 'aircraft';

export interface PreviewAircraft {
  /** The preview id the renders and the manifests use (never a tank spec id). */
  readonly id: string;
  readonly kind: 'aircraft';
  /** The airframe builder (src/game/<airframe>Airframe.ts). */
  readonly airframe: 'gunship';
  /** Its display name's catalog key, and the English name the offline tools print. */
  readonly labelKey: string;
  readonly label: string;
  /** The nation it flies under: its flag beside it, as a tank's spec nation gives. */
  readonly nation: string;
  /** Overall length and span (m): the render cameras frame it from these, as from a tank's dims. */
  readonly lengthM: number;
  readonly spanM: number;
  readonly heightM: number;
}

export const PREVIEW_AIRCRAFT: Readonly<Record<string, PreviewAircraft>> = Object.freeze({
  // the AC-130 gunship (the ac130 mode's vehicle; Air Support's orbit call-in flies the same airframe)
  ac130: Object.freeze({
    id: 'ac130', kind: 'aircraft', airframe: 'gunship', labelKey: 'flight.gunship', label: 'AC-130', nation: 'USA',
    lengthM: 29.8, spanM: 40.4, heightM: 11.7,
  }),
});

export const PREVIEW_AIRCRAFT_IDS: readonly string[] = Object.freeze(Object.keys(PREVIEW_AIRCRAFT));

/** The aircraft renders' manifest under public/icons (tools/genAircraftAssets.mjs), and the views an aircraft ships: the
 *  tanks' portrait, side and top with their silhouettes (no armour, module, crew or marking diagram). */
export const AIRCRAFT_ASSETS_FILE = 'aircraft-assets.json';
export const AIRCRAFT_VIEWS = Object.freeze(['angle', 'top', 'side', 'topSilhouette', 'sideSilhouette'] as const);

/** The aircraft each mode puts the player in (a mode whose ruleset flies the player's seat: matchRuleset `aerial`). */
export const MODE_AIRCRAFT: Readonly<Record<string, string>> = Object.freeze({ ac130: 'ac130' });

/** The preview's kind for an id: an aircraft from the table, else a tank spec id. */
export function previewVehicleKind(id: string | null | undefined): PreviewVehicleKind {
  return id && Object.hasOwn(PREVIEW_AIRCRAFT, id) ? 'aircraft' : 'tank';
}

/** The aircraft a preview id names, or null for a tank. */
export function previewAircraft(id: string | null | undefined): PreviewAircraft | null {
  return id && Object.hasOwn(PREVIEW_AIRCRAFT, id) ? PREVIEW_AIRCRAFT[id] : null;
}

/** What a mode previews for the player: the mode's aircraft, else the garage tank. */
export function modePreviewVehicle(mode: string | null | undefined, specId: string): { readonly kind: PreviewVehicleKind; readonly id: string } {
  const aircraft = mode && Object.hasOwn(MODE_AIRCRAFT, mode) ? MODE_AIRCRAFT[mode] : null;
  return aircraft ? { kind: 'aircraft', id: aircraft } : { kind: 'tank', id: specId };
}
