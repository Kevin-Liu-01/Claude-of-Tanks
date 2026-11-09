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
  // Air Support (air-support-270): one bit a call-in, called at the sample's aim point. One-hot, not a field: the wire and
  // the input buffers carry action presses as a union of bits, so two presses never merge into a third kind. The u16 the
  // wire already carries had exactly these three bits spare, so its layout is unchanged.
  STRIKE_STRAFE: 1 << 13,
  STRIKE_BOMB: 1 << 14,
  STRIKE_GUNSHIP: 1 << 15,
} as const);

/**
 * The call-in each bit names (matchRuleset.ts AIR_STRIKE_KINDS). The battery and the recon pass ride the two supply-drop
 * bits: the AC-130 mode's escort is the only mode that drops supplies and Air Support the only one that calls strikes, so
 * no mode reads both meanings (airSupport.selftest pins it); the sixteen bits are all taken.
 */
export const AIR_STRIKE_BITS = Object.freeze({
  recon: PLAYER_ACTION_BITS.SUPPLY_HEAL, artillery: PLAYER_ACTION_BITS.SUPPLY_AMMO,
  strafe: PLAYER_ACTION_BITS.STRIKE_STRAFE, bomb: PLAYER_ACTION_BITS.STRIKE_BOMB, gunship: PLAYER_ACTION_BITS.STRIKE_GUNSHIP,
} as const);
