// src/ui/moduleRegistry.ts — ONE source of truth for internal-module and crew
// PRESENTATION (module_hitbox r1 consolidation). Display labels, state colors
// and roster order used to be re-declared per consumer (killcam.js,
// shotInfo.js, hud.js, damagePanel.js) and had already drifted
// ('Fuel' vs 'Fuel Tank'). Pure data — no DOM, no three.
//
// The SIM truth lives elsewhere and is deliberately not re-exported here:
//   - module HP / save-throw / fire tables + state machine: src/sim/damage.js
//   - module state broadcasts: the 'module:state' bus event
//     ({ id, module, state }) emitted by game/state.js — audio, HUD and
//     killcam all subscribe to that one channel.

import { MODULE_LABEL as CATALOG_MODULE_LABEL } from '../sim/moduleCatalog.ts';

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

export type CrewId = keyof typeof CREW_LABEL;

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

const LABEL_BY_MODULE: Readonly<Record<string, string>> = MODULE_LABEL;

/**
 * Uppercase alert-style label ('AMMO RACK DAMAGED' toasts). Tracks collapse
 * to the sideless 'TRACK' — the player feels which side.
 * @param {string} module ModuleName
 * @returns {string}
 */
export function moduleAlertLabel(module: string): string {
  if (module === 'trackL' || module === 'trackR') return 'TRACK';
  return (LABEL_BY_MODULE[module] || module).toUpperCase();
}
