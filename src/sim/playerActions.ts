/**
 * The player's action bits: the consumables and the actions a controls sample carries beside its aim and drive.
 * The simulation reads them (authoritativeMatch, the solo step, the bots); the multiplayer wire's `ACTION_BITS`
 * (src/mp/wire/constants.ts) is this table, so a bit means the same thing in a solo battle and on the wire.
 */
export const PLAYER_ACTION_BITS = Object.freeze({
  REPAIR: 1 << 0,
  FIRST_AID: 1 << 1,
  EXTINGUISHER: 1 << 2,
  RELOAD_MAGAZINE: 1 << 3,
  SPECIAL_ACTION: 1 << 4,
  SELF_RIGHT: 1 << 5,
  // the auxiliary systems (smoke, lights, roof gun; 2026-09-30 main): the same bits the wire carries
  SMOKE: 1 << 6,
  LIGHTS: 1 << 7,
  ROOF_GUN: 1 << 8,
  LIGHTS_OFF: 1 << 9,
  DRONE: 1 << 10,
  SUPPLY_AMMO: 1 << 11,
  SUPPLY_HEAL: 1 << 12,
} as const);
