// src/ui/moduleRegistry.js — ONE source of truth for internal-module and crew
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

/** Internal-module ids, in the damage panel's presentation order. */
export const MODULE_IDS = [
  'gun', 'turretRing', 'engine', 'fuelTank', 'ammoRack', 'radio', 'optics', 'trackL', 'trackR',
];

/** Full display names (cards, killcam labels, log rows). */
export const MODULE_LABEL = {
  trackL: 'Track L',
  trackR: 'Track R',
  engine: 'Engine',
  fuelTank: 'Fuel Tank',
  ammoRack: 'Ammo Rack',
  gun: 'Gun',
  radio: 'Radio',
  optics: 'Optics',
  turretRing: 'Turret Ring',
};

/** Crew display names. */
export const CREW_LABEL = {
  commander: 'Commander',
  gunner: 'Gunner',
  driver: 'Driver',
  loader: 'Loader',
};

/** Crew presentation order (damage panel chips, killcam rows). */
export const CREW_ORDER = ['commander', 'gunner', 'driver', 'loader'];

/**
 * Module state → color. The WoT ramp: damaged ORANGE, knocked-out RED;
 * 'ok' is the neutral panel ink.
 */
export const STATE_COLOR = { ok: '#eef4f9', yellow: '#f0952e', red: '#f05a5a' };

/**
 * Uppercase alert-style label ('AMMO RACK DAMAGED' toasts). Tracks collapse
 * to the sideless 'TRACK' — the player feels which side.
 * @param {string} module ModuleName
 * @returns {string}
 */
export function moduleAlertLabel(module) {
  if (module === 'trackL' || module === 'trackR') return 'TRACK';
  return (MODULE_LABEL[module] || module).toUpperCase();
}
