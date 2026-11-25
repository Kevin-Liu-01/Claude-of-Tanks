/**
 * previewVehicles.ts — the vehicles that get a preview beside the tanks, by kind (endscreen-modes-275; the owner: "when we
 * select ac 130 game mode the tank previews should have a ac 130 presented like the tanks").
 *
 * Every tank is previewed from its spec id (specs.ts). An aircraft a mode puts the player in has no spec: it is a
 * first-party airframe (src/game/gunshipAirframe.ts) the battle swaps in for the garage tank. This table names those
 * aircraft once, so every preview surface asks one question, "which vehicle, of which kind", and the pipelines build
 * either kind from it: the icon and hero-card renders (tools/aircraft-assets-page.html, tools/hero-cards-page.html),
 * Deploy's vehicle card, the battle load's rows and the end screen. The renders keep the tanks' file names, so
 * iconUrl / maskIcon / the hero manifest read an aircraft id as they read a spec id. The Garage keeps the garage tank on
 * its pedestal whatever the mode (owner 2026-11-21: the AC-130 stands in for the tank's preview cards in Deploy, the end
 * cards and the battle reports, never in the Garage).
 *
 * Pure data, no three, no DOM: Node-runnable (previewVehicles.selftest.mjs ties MODE_AIRCRAFT to the rulesets).
 */

export type PreviewVehicleKind = 'tank' | 'aircraft';

export interface PreviewAircraft {
  /** The preview id the renders and the manifests use (never a tank spec id). */
  readonly id: string;
  readonly kind: 'aircraft';
  /** The airframe builder (src/game/<airframe>Airframe.ts; the drone's fx/droneModel.ts). */
  readonly airframe: 'gunship' | 'strikeJet' | 'fighterJet' | 'drone' | 'artillery';
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

/** The aircraft the battle's notices picture (notices-276, Kevin and Main 2026-11-23: ui/components/noticeArt.ts), rendered
 *  by the same studio, framing and files as the preview aircraft (tools/genAircraftAssets.mjs) but never previewed in a
 *  tank's place: no mode puts a player in one and no hero card is made (hero-cards-plan.mjs reads PREVIEW_AIRCRAFT). Air
 *  Support's A-10 (the recon pass and the strafing run) and F-16 (the bomb and the Maverick run), the drone, and the
 *  barrage's shell salvo (no aircraft flies it). */
const NOTICE_AIRCRAFT: Readonly<Record<string, PreviewAircraft>> = Object.freeze({
  a10: Object.freeze({
    id: 'a10', kind: 'aircraft', airframe: 'strikeJet', labelKey: 'airSupport.kind.strafe', label: 'A-10', nation: 'USA',
    lengthM: 16.3, spanM: 17.5, heightM: 4.5,
  }),
  f16: Object.freeze({
    id: 'f16', kind: 'aircraft', airframe: 'fighterJet', labelKey: 'airSupport.kind.bomb', label: 'F-16', nation: 'USA',
    lengthM: 15.0, spanM: 9.5, heightM: 4.9,
  }),
  drone: Object.freeze({
    id: 'drone', kind: 'aircraft', airframe: 'drone', labelKey: 'flight.drone', label: 'Drone', nation: 'USA',
    lengthM: 0.9, spanM: 0.9, heightM: 0.3,
  }),
  // (notices-polish-277; Kevin 2026-11-24: "make all warnings have mictures. i see artillery doesnt") the barrage flies no
  // aircraft: its picture is its rounds, a salvo of three 155 mm shells diving (game/artillerySalvoModel.ts), rendered by
  // the same studio and framing as the aircraft
  artillery: Object.freeze({
    id: 'artillery', kind: 'aircraft', airframe: 'artillery', labelKey: 'airSupport.kind.artillery', label: '155 mm salvo', nation: 'USA',
    lengthM: 1.6, spanM: 0.8, heightM: 1.0,
  }),
});

/** Every aircraft with renders: the preview aircraft and the notices' (the asset tool and its page render these). */
export const RENDERED_AIRCRAFT: Readonly<Record<string, PreviewAircraft>> = Object.freeze({ ...PREVIEW_AIRCRAFT, ...NOTICE_AIRCRAFT });
export const RENDERED_AIRCRAFT_IDS: readonly string[] = Object.freeze(Object.keys(RENDERED_AIRCRAFT));

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
