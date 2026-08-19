// Canonical internal-module vocabulary shared by combat, UI and tooling.
// Keep this pure data: authoritative simulation imports it under Node and the
// browser-side technical-card renderer imports the same labels/order.

export const MODULE_DEFS = Object.freeze({
  gun: Object.freeze({ label: 'Gun', hp: 150, saveChance: 0.33 }),
  turretRing: Object.freeze({ label: 'Turret Ring', hp: 120, saveChance: 0.45 }),
  gunMount: Object.freeze({ label: 'Gun Mount', hp: 120, saveChance: 0.45 }),
  autoloader: Object.freeze({ label: 'Autoloader', hp: 125, saveChance: 0.36 }),
  feedSystem: Object.freeze({ label: 'Weapon Feed', hp: 110, saveChance: 0.38 }),
  missileRack: Object.freeze({ label: 'Missile Rack', hp: 120, saveChance: 0.30 }),
  engine: Object.freeze({ label: 'Engine', hp: 160, saveChance: 0.45 }),
  transmission: Object.freeze({ label: 'Transmission', hp: 140, saveChance: 0.45 }),
  fuelTank: Object.freeze({ label: 'Fuel Tank', hp: 120, saveChance: 0.45 }),
  ammoRack: Object.freeze({ label: 'Ammo Rack', hp: 150, saveChance: 0.27 }),
  radio: Object.freeze({ label: 'Radio', hp: 90, saveChance: 0.45 }),
  optics: Object.freeze({ label: 'Optics', hp: 80, saveChance: 0.45 }),
  trackL: Object.freeze({ label: 'Track L', hp: 100, saveChance: 1.0 }),
  trackR: Object.freeze({ label: 'Track R', hp: 100, saveChance: 1.0 }),
});

export const MODULE_IDS = Object.freeze(Object.keys(MODULE_DEFS));

export const CORE_MODULE_IDS = Object.freeze([
  'gun', 'engine', 'transmission', 'fuelTank', 'ammoRack',
  'radio', 'optics', 'trackL', 'trackR',
]);

export const MODULE_LABEL = Object.freeze(Object.fromEntries(
  MODULE_IDS.map((id) => [id, MODULE_DEFS[id].label]),
));
