// src/ui/moduleRegistry.ts — ONE source of truth for internal-module and crew
// PRESENTATION (module_hitbox r1 consolidation). Display labels, state colors
// and roster order used to be re-declared per consumer (killcam.ts,
// shotInfo.ts, hud.ts, damagePanel.ts) and had already drifted
// ('Fuel' vs 'Fuel Tank'). No DOM, no three; localized names read the catalog.
//
// The SIM truth lives elsewhere and is deliberately not re-exported here:
//   - module HP / save-throw / fire tables + state machine: src/sim/damage.ts
//   - module state broadcasts: the 'module:state' bus event
//     ({ id, module, state }) emitted by game/state.ts — audio, HUD and
//     killcam all subscribe to that one channel.

import { MODULE_LABEL as CATALOG_MODULE_LABEL } from '../sim/moduleCatalog.ts';
import { t } from './i18n.ts';

/** Full display names (cards, killcam labels, log rows). */
export const MODULE_LABEL = CATALOG_MODULE_LABEL;

/** Crew display names. */
export const CREW_LABEL = Object.freeze({
  commander: 'Commander',
  gunner: 'Gunner',
  driver: 'Driver',
  loader: 'Loader',
  radioOperator: 'Radio Operator',
  assistantDriver: 'Assistant Driver',
  assistantLoader: 'Assistant Loader',
  weaponOperatorLeft: 'Left Weapon Operator',
  weaponOperatorRight: 'Right Weapon Operator',
} as const);

type CrewId = keyof typeof CREW_LABEL;

/** Crew presentation order (damage panel chips, killcam rows). */
export const CREW_ORDER = Object.freeze([
  'commander', 'gunner', 'driver', 'loader',
  'radioOperator', 'assistantDriver', 'assistantLoader',
  'weaponOperatorLeft', 'weaponOperatorRight',
] as const satisfies readonly CrewId[]);

/**
 * Module state → color. The WoT ramp: damaged ORANGE, knocked-out RED;
 * 'ok' is the neutral panel ink.
 */
export const STATE_COLOR: Readonly<Record<string, string>> = Object.freeze({
  ok: '#eef4f9', yellow: '#f0952e', red: '#f05a5a',
});

/**
 * The player-facing name of a module or a crew station: the glossary-bound catalog keys `garage.module.<id>` and
 * `garage.crew.<id>` (src/ui/glossary.json, BUI-F8), so the HUD, shot cards, kill cam and Gallery say the same word in
 * every locale. The English tables above stay the code-side names (logs, the sim catalog); an id outside them prints
 * as itself.
 */
export const moduleName = (id: string): string => (Object.hasOwn(MODULE_LABEL, id) ? t(`garage.module.${id}`) : id);
export const crewName = (id: string): string => (Object.hasOwn(CREW_LABEL, id) ? t(`garage.crew.${id}`) : id);

/**
 * Alert-style label ('AMMO RACK DAMAGED' toasts; capitals for Latin scripts, a no-op for CJK). Tracks collapse to the
 * sideless track — the player feels which side.
 * @param {string} module ModuleName
 * @returns {string}
 */
export function moduleAlertLabel(module: string): string {
  return (module === 'trackL' || module === 'trackR' ? t('garage.module.track') : moduleName(module)).toUpperCase();
}
