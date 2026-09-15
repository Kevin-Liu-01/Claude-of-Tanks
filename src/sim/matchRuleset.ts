// Match rulesets (owner 2026-09-14 evening: "make the mechanics actually apply and change what the
// player has available, or change physics or gravity or more"). A ruleset is the complete, pure
// description of how one game mode bends the simulation: gravity, speed, hit points, damage,
// reload, the ammunition and equipment a crew may carry, consumables, respawns, the clock and the
// solo roster split. It is derived deterministically from the mode (and a campaign operation's
// difficulty), so the browser sim, the network authority and the receipts all compute the same
// rules without a wire change. Everything that reads a rule reads it from here — the mode
// controller, setupBattle, movement (gravity, speed), ballistics (shell gravity), damage (hit
// points lost), ammunition and equipment at spawn, and the play-menu rule cards.
import type { GameModeId } from './matchModes.ts';

type RulesetAmmo = 'spec' | 'he_only' | 'unlimited';
type RulesetTimeout = 'draw' | 'defeat';

interface AssaultRules {
  /** Defenders fielded on the first sector; each further sector adds one. */
  readonly initialActive: number;
  /** Extra defenders per sector from the operation's difficulty. */
  readonly extraDefenders: number;
  /** Hit-point scale added per sector taken. */
  readonly hpPerLine: number;
  /** Hit-point scale added by the operation's difficulty (applies to every defender). */
  readonly difficultyHp: number;
  /** Seconds the last sector must be held. */
  readonly holdS: number;
}

export interface MatchRuleset {
  readonly mode: GameModeId;
  /** Multiplies 9.81 m/s² for hulls in the air, shells in flight and the ball. */
  readonly gravityScale: number;
  /** Multiplies top and reverse speed (the controller may raise it per wave / lower it for a flag carrier). */
  readonly speedMultiplier: number;
  /** Multiplies hull hit points at spawn and revive. */
  readonly hpScale: number;
  /** Multiplies every hit point lost to shells, blast and ramming. */
  readonly damageScale: number;
  /** Multiplies reload time. */
  readonly reloadScale: number;
  /** Which rounds a crew carries: the vehicle's own loadout, HE only, or the loadout with unlimited rounds. */
  readonly ammo: RulesetAmmo;
  /** Equipment slots honoured (0 disables equipment). */
  readonly equipmentSlots: 0 | 1 | 2 | 3;
  readonly consumables: boolean;
  /** Seconds to respawn, or null when a destroyed vehicle stays destroyed. */
  readonly respawnS: number | null;
  /** Clock in seconds, or null for no clock. */
  readonly timeLimitS: number | null;
  /** How an expired clock resolves when the score is level (or has no score). */
  readonly timeout: RulesetTimeout;
  /** Solo roster split: allied bots and enemy bots (null keeps the default 6 / 7). */
  readonly allies: number | null;
  readonly enemies: number | null;
  /** Frontline Assault wave rules (campaign difficulty folds in here). */
  readonly assault: AssaultRules | null;
}

export interface CampaignRulesetInput {
  /** 1-based ladder difficulty. */
  readonly difficulty: number;
  readonly timeLimitS?: number | null;
}

const STANDARD: MatchRuleset = Object.freeze({
  mode: 'standard', gravityScale: 1, speedMultiplier: 1, hpScale: 1, damageScale: 1, reloadScale: 1,
  ammo: 'spec', equipmentSlots: 3, consumables: true, respawnS: null, timeLimitS: 900, timeout: 'draw',
  allies: null, enemies: null, assault: null,
});

const BASE_RULESETS: Readonly<Record<GameModeId, MatchRuleset>> = Object.freeze({
  standard: STANDARD,
  // Flags: respawning objective play on the standard physics; the controller slows a carrier.
  capture_the_flag: Object.freeze({ ...STANDARD, mode: 'capture_the_flag', respawnS: 6 }),
  // Zones: respawning hold-the-ground play; the 750-point target resolves inside the clock.
  zone_control: Object.freeze({ ...STANDARD, mode: 'zone_control', respawnS: 6 }),
  // Turbo Ball: arcade physics — 0.6 g so hulls and shells fly, 1.85× speed, tough hulls, half
  // damage, quick reloads, HE only with unlimited rounds, no equipment or consumables, 3 s
  // respawns, a ten-minute clock.
  turbo_ball: Object.freeze({
    ...STANDARD, mode: 'turbo_ball', gravityScale: 0.6, speedMultiplier: 1.85, hpScale: 1.5,
    damageScale: 0.5, reloadScale: 0.7, ammo: 'unlimited', equipmentSlots: 0, consumables: false,
    respawnS: 3, timeLimitS: 600,
  }),
  // Horde: survival — the player with two allied bots on alpha (co-op humans join it), every
  // other bot cycling through the waves on the far side, tougher hull, no respawn, no clock;
  // clearing a wave repairs the survivors by HORDE_WAVE_REPAIR and drops a cache.
  endless_horde: Object.freeze({
    ...STANDARD, mode: 'endless_horde', hpScale: 1.25, respawnS: null, timeLimitS: null,
    allies: 2, enemies: 11,
  }),
  // Frontline Assault: the campaign sortie — three allies, no respawn, a twelve-minute clock that
  // costs the operation when it runs out; defenders escalate per sector and per difficulty.
  frontline_assault: Object.freeze({
    ...STANDARD, mode: 'frontline_assault', respawnS: null, timeLimitS: 720, timeout: 'defeat',
    allies: 3, enemies: null,
    assault: Object.freeze({ initialActive: 3, extraDefenders: 0, hpPerLine: 0.16, difficultyHp: 0, holdS: 20 }),
  }),
});

/** Score targets the modes play to (kept here so rule cards and controller agree). */
export const RULESET_SCORE_TARGETS: Readonly<Record<string, number>> = Object.freeze({
  capture_the_flag: 3, zone_control: 750, turbo_ball: 5,
});
/** A flag carrier drives at this share of the mode speed (Capture the Flag). */
export const FLAG_CARRIER_SPEED_SCALE = 0.85;
/** Share of maximum hull repaired on every surviving attacker when a Horde wave is cleared. */
export const HORDE_WAVE_REPAIR = 0.3;

export function matchRulesetFor(mode: GameModeId, campaign: CampaignRulesetInput | null = null): MatchRuleset {
  const base = BASE_RULESETS[mode] ?? STANDARD;
  if (!campaign || mode !== 'frontline_assault' || !base.assault) return base;
  const difficulty = Math.max(1, Math.min(9, Math.floor(campaign.difficulty) || 1));
  return Object.freeze({
    ...base,
    timeLimitS: campaign.timeLimitS === undefined ? base.timeLimitS : campaign.timeLimitS,
    assault: Object.freeze({
      ...base.assault,
      // one extra defender every two operations, and 6 % hull per operation past the first
      extraDefenders: Math.floor((difficulty - 1) / 2),
      difficultyHp: (difficulty - 1) * 0.06,
    }),
  });
}

/** Whole-number percent for copy ("+50 %", "-40 %"). */
function percent(scale: number): string {
  const delta = Math.round((scale - 1) * 100);
  return `${delta > 0 ? '+' : ''}${delta} %`;
}

interface RulesetLine {
  /** i18n key under `rules.line.*`. */
  readonly key: string;
  readonly values: Readonly<Record<string, string>>;
}

/**
 * The rule lines a mode card shows — only the rules that differ from Standard, in a fixed order,
 * so every card lists exactly what the code does.
 */
export function rulesetLines(ruleset: MatchRuleset): RulesetLine[] {
  const lines: RulesetLine[] = [];
  const line = (key: string, values: Record<string, string> = {}): void => { lines.push({ key, values }); };
  if (ruleset.gravityScale !== 1) line('gravity', { value: `${Math.round(ruleset.gravityScale * 100) / 100} g` });
  if (ruleset.speedMultiplier !== 1) line('speed', { value: percent(ruleset.speedMultiplier) });
  if (ruleset.hpScale !== 1) line('hp', { value: percent(ruleset.hpScale) });
  if (ruleset.damageScale !== 1) line('damage', { value: percent(ruleset.damageScale) });
  if (ruleset.reloadScale !== 1) line('reload', { value: percent(1 / ruleset.reloadScale) });
  if (ruleset.ammo === 'he_only') line('ammoHeOnly');
  if (ruleset.ammo === 'unlimited') line('ammoUnlimited');
  if (ruleset.equipmentSlots === 0) line('noEquipment');
  else if (ruleset.equipmentSlots < 3) line('equipmentSlots', { value: String(ruleset.equipmentSlots) });
  if (!ruleset.consumables) line('noConsumables');
  if (ruleset.respawnS != null) line('respawn', { value: String(ruleset.respawnS) });
  else if (ruleset.mode !== 'standard') line('noRespawn');
  if (ruleset.timeLimitS == null) line('noClock');
  else if (ruleset.timeLimitS !== STANDARD.timeLimitS || ruleset.timeout !== 'draw') {
    line(ruleset.timeout === 'defeat' ? 'clockDefeat' : 'clock', { value: `${Math.round(ruleset.timeLimitS / 60)}` });
  }
  if (ruleset.allies === 0) line('noAllies');
  else if (ruleset.allies != null) line('allies', { value: String(ruleset.allies) });
  if (ruleset.mode === 'capture_the_flag') line('carrierSpeed', { value: percent(FLAG_CARRIER_SPEED_SCALE) });
  if (ruleset.mode === 'endless_horde') line('waveRepair', { value: `${Math.round(HORDE_WAVE_REPAIR * 100)} %` });
  if (ruleset.assault) {
    line('assaultWaves', {
      value: String(ruleset.assault.initialActive + ruleset.assault.extraDefenders),
      hp: percent(1 + ruleset.assault.difficultyHp),
    });
  }
  return lines;
}

/** Ammunition capacity for one round under a ruleset (Infinity marks unlimited to the HUD). */
export function rulesetAmmoCapacity(ruleset: MatchRuleset, shellType: string, authored: number): number {
  if (ruleset.ammo === 'he_only') return shellType === 'HE' ? Math.max(authored, 1) : 0;
  return authored;
}

/** Reload multiplier a spawn folds into the equipment multipliers. */
export function rulesetReloadMultiplier(ruleset: MatchRuleset): number {
  return Math.max(0.1, ruleset.reloadScale);
}

/** Structural view of the combat state a ruleset stamps (damage.ts CombatState and the authority's share it). */
interface RulesetCombatState {
  hp: number;
  maxHp: number;
  ammo: number[];
  ammoCapacity: number[];
  equipMults?: Partial<Record<string, number>>;
  /** Multiplies every hit point lost (damage.ts hull sites and ramming). */
  modeDamageTakenScale?: number;
}

interface RulesetShellSpec { readonly type?: string }

/**
 * Stamp a freshly created combat state with the ruleset: hull hit points (times the wave / health scale
 * the mode controller hands to a revive), the damage-taken scale, the reload multiplier folded into the
 * equipment multipliers, and the ammunition channels. Call it after applyEquipmentToCombat so the
 * reload fold survives; spawn and revive both go through it, in the browser sim and the authority.
 */
export function applyRulesetToCombat(
  combat: RulesetCombatState,
  shells: readonly RulesetShellSpec[] | null | undefined,
  ruleset: MatchRuleset,
  healthScale = 1,
): void {
  const wave = Number.isFinite(healthScale) && healthScale > 0 ? healthScale : 1;
  const scale = ruleset.hpScale * wave;
  if (scale !== 1) {
    combat.maxHp = Math.max(1, Math.round(combat.maxHp * scale));
    combat.hp = combat.maxHp;
  }
  combat.modeDamageTakenScale = ruleset.damageScale;
  if (ruleset.reloadScale !== 1) {
    const mults = combat.equipMults || (combat.equipMults = {});
    const current = mults.reload;
    mults.reload = (Number.isFinite(current) ? current! : 1) * rulesetReloadMultiplier(ruleset);
  }
  if (ruleset.ammo === 'he_only' && Array.isArray(shells) && combat.ammoCapacity.length) {
    const capacities = combat.ammoCapacity.map((authored, slot) =>
      rulesetAmmoCapacity(ruleset, String(shells[slot]?.type || ''), authored));
    // a vehicle without any HE round keeps its own loadout rather than sortieing empty
    if (capacities.some((capacity) => capacity > 0)) {
      for (let slot = 0; slot < capacities.length; slot++) {
        combat.ammoCapacity[slot] = capacities[slot];
        combat.ammo[slot] = capacities[slot];
      }
    }
  }
}

/** The equipment ids a ruleset honours out of a loadout (0 slots disables equipment). */
export function rulesetLoadout(ruleset: MatchRuleset, ids: readonly string[] | null | undefined): string[] {
  const list = Array.isArray(ids) ? ids.slice() : [];
  return ruleset.equipmentSlots >= 3 ? list : list.slice(0, ruleset.equipmentSlots);
}

/** After a shot under unlimited ammunition, refill the fired channel (the HUD keeps the loadout shape). */
export function refillUnlimitedAmmunition(
  ruleset: MatchRuleset,
  combat: Pick<RulesetCombatState, 'ammo' | 'ammoCapacity'>,
  slot: number,
): void {
  if (ruleset.ammo !== 'unlimited') return;
  if (Number.isInteger(slot) && slot >= 0 && slot < combat.ammoCapacity.length) {
    combat.ammo[slot] = combat.ammoCapacity[slot];
  }
}

/** Solo roster caps: allied bots the player gets under a ruleset (null keeps the default split). */
export function rulesetAllyCap(ruleset: MatchRuleset, defaultCap: number): number {
  return ruleset.allies == null ? defaultCap : Math.max(0, Math.floor(ruleset.allies));
}
