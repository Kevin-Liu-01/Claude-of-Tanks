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

/** Endless Horde wave law (owner 2026-09-15: "the horde is not endless, there's only 3 tanks every time"). */
export interface HordeRules {
  /** Hostiles fielded on the first wave. */
  readonly waveSize: number;
  /** Hostiles added every wave. */
  readonly waveStep: number;
  /** One more hostile every this many waves (0 = never). */
  readonly surgeEvery: number;
}

/**
 * Team arrangement (owner 2026-09-15): the co-op modes let the player arrange both sides — allied
 * bots, the enemy pool (distinct hostile identities in the match), the first Horde wave and the
 * enemy nation. Sides (owner 2026-09-18: "a switch that's default set to 7v7 but then switching it
 * does 14v14 and you can also enter custom numbers of allies and enemies … 1 v 20"): every other mode
 * arranges its two sides the same way — allied bots and hostiles all on the field at once — under
 * one field limit. Absent fields keep the mode's defaults; every value is clamped by
 * TEAM_ARRANGEMENT_LIMITS.
 */
export interface TeamArrangement {
  readonly allies?: number | null;
  readonly enemies?: number | null;
  readonly waveSize?: number | null;
  /** Enemy nation id (game/teamArrangement.ts ENEMY_NATION_OPTIONS) or null for a mixed force. */
  readonly enemyNation?: string | null;
}

/**
 * Vehicles one solo field may hold, the player included (owner 2026-09-18: "go up to a number that you
 * test is the total limit to how many tanks can be in a game before performance is unacceptable" —
 * measured on the desktop tier 2026-09-18, docs/GAME-MODES.md "Sides").
 */
export const BATTLE_FIELD_LIMIT = 42;
/** The whole-game default split: the player with six allied bots against seven hostiles. */
export const STANDARD_SIDES = Object.freeze({ allies: 6, enemies: 7 });
/** The sides switch presets (the player counts on the allied side, so "14 v 14" is thirteen allied bots). */
export const SIDES_PRESETS = Object.freeze({
  '7v7': STANDARD_SIDES,
  '14v14': Object.freeze({ allies: 13, enemies: 14 }),
});
export type SidesPreset = keyof typeof SIDES_PRESETS | 'custom';
type IntRange = readonly [number, number];
const range = (low: number, high: number): IntRange => Object.freeze([low, high] as const);
const SYMMETRIC_ALLIES = range(0, BATTLE_FIELD_LIMIT - 2), SYMMETRIC_ENEMIES = range(1, BATTLE_FIELD_LIMIT - 1);
const COOP_ALLIES = range(0, 6);
export const TEAM_ARRANGEMENT_LIMITS: {
  readonly field: number;
  readonly allies: Readonly<Record<GameModeId, IntRange>>;
  readonly enemies: Readonly<Record<GameModeId, IntRange>>;
  readonly waveSize: IntRange;
} = Object.freeze({
  field: BATTLE_FIELD_LIMIT,
  allies: Object.freeze({
    standard: SYMMETRIC_ALLIES, capture_the_flag: SYMMETRIC_ALLIES, zone_control: SYMMETRIC_ALLIES, turbo_ball: SYMMETRIC_ALLIES,
    endless_horde: COOP_ALLIES, frontline_assault: COOP_ALLIES,
  }),
  enemies: Object.freeze({
    standard: SYMMETRIC_ENEMIES, capture_the_flag: SYMMETRIC_ENEMIES, zone_control: SYMMETRIC_ENEMIES, turbo_ball: SYMMETRIC_ENEMIES,
    endless_horde: range(6, 20), frontline_assault: range(4, 14),
  }),
  waveSize: range(2, 12),
});

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
  /** Modules, crew and fires take damage. False (owner 2026-09-15, Turbo Ball: "make modules not break since
   * there's no consumables") keeps every critical system intact — hull hit points are the only thing a hit costs. */
  readonly criticalDamage: boolean;
  /** Upward launch (m/s) the F key gives a grounded, upright hull, or null when the mode has no jump (owner
   * 2026-09-16, Turbo Ball: "make an f button that just adds an upward vector so you go flying"). */
  readonly jumpMps: number | null;
  /** Multiplies the hull's firing recoil into a real launch opposite the muzzle (owner: "aim behind you and launch
   * yourself and use it as a speed boost"); 1 keeps the ordinary hull kick. */
  readonly recoilLaunchScale: number;
  /** Multiplies the shove a shell impact gives the hull it hits (owner: "shells should have more physics effects
   * that knock you"); 1 is the whole-game baseline. */
  readonly shellKnockScale: number;
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
  /** Endless Horde wave law. */
  readonly horde: HordeRules | null;
  /** Enemy nation id the roster fills from first (co-op modes; null = mixed / the operation decides). */
  readonly enemyNation: string | null;
}

export interface CampaignRulesetInput {
  /** 1-based ladder difficulty. */
  readonly difficulty: number;
  readonly timeLimitS?: number | null;
  /** The operation's enemy nation id (campaignOperations.ts). */
  readonly enemy?: string | null;
}

const STANDARD: MatchRuleset = Object.freeze({
  mode: 'standard', gravityScale: 1, speedMultiplier: 1, hpScale: 1, damageScale: 1, reloadScale: 1,
  ammo: 'spec', equipmentSlots: 3, consumables: true, criticalDamage: true, jumpMps: null, recoilLaunchScale: 1, shellKnockScale: 0.3,
  respawnS: null, timeLimitS: 900, timeout: 'draw',
  allies: null, enemies: null, assault: null, horde: null, enemyNation: null,
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
    criticalDamage: false, jumpMps: 9, recoilLaunchScale: 12, shellKnockScale: 2.5, respawnS: 3, timeLimitS: 600,
  }),
  // Horde: survival — the player with two allied bots on alpha (co-op humans join it), a pool of
  // fourteen hostile identities on the far side drawn afresh every wave (five on the first wave,
  // one more each wave and a surge every third), tougher hull, no respawn, no clock; clearing a
  // wave repairs the survivors by HORDE_WAVE_REPAIR and drops a cache.
  endless_horde: Object.freeze({
    ...STANDARD, mode: 'endless_horde', hpScale: 1.25, respawnS: null, timeLimitS: null,
    allies: 2, enemies: 14,
    horde: Object.freeze({ waveSize: 5, waveStep: 1, surgeEvery: 3 }),
  }),
  // Frontline Assault: the campaign sortie — three allies, no respawn, a twelve-minute clock that
  // costs the operation when it runs out; defenders escalate per sector and per difficulty.
  frontline_assault: Object.freeze({
    ...STANDARD, mode: 'frontline_assault', respawnS: null, timeLimitS: 720, timeout: 'defeat',
    allies: 3, enemies: 10,
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

/** The wave modes: their enemy side is a pool drawn per wave (Horde) or per sector (Frontline). */
export function isWaveMode(mode: GameModeId): mode is 'endless_horde' | 'frontline_assault' {
  return mode === 'endless_horde' || mode === 'frontline_assault';
}

/** Every registered mode arranges its sides (owner 2026-09-18); an unknown id takes none. */
export function acceptsTeamArrangement(mode: GameModeId): boolean {
  return Object.prototype.hasOwnProperty.call(BASE_RULESETS, mode);
}

/** The two sides a symmetric mode fields at once (bots only — the player joins the allied side). */
export function rulesetSides(ruleset: Pick<MatchRuleset, 'allies' | 'enemies'>): { readonly allies: number; readonly enemies: number } {
  return { allies: ruleset.allies ?? STANDARD_SIDES.allies, enemies: ruleset.enemies ?? STANDARD_SIDES.enemies };
}

/** Which switch position an arrangement is: a preset when its sides match one, otherwise custom. */
export function sidesPresetOf(arrangement: Pick<TeamArrangement, 'allies' | 'enemies'> | null | undefined): SidesPreset {
  const sides = rulesetSides({ allies: arrangement?.allies ?? null, enemies: arrangement?.enemies ?? null });
  for (const [id, preset] of Object.entries(SIDES_PRESETS)) {
    if (preset.allies === sides.allies && preset.enemies === sides.enemies) return id as SidesPreset;
  }
  return 'custom';
}

const clampInt = (value: unknown, range: readonly [number, number]): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(range[0], Math.min(range[1], Math.round(n)));
};

/** Clamp an arrangement to the mode's limits; null for modes that take none or an empty input. */
export function normalizeTeamArrangement(mode: GameModeId, input: TeamArrangement | null | undefined): TeamArrangement | null {
  if (!input || !acceptsTeamArrangement(mode)) return null;
  let allies = input.allies == null ? null : clampInt(input.allies, TEAM_ARRANGEMENT_LIMITS.allies[mode]);
  const enemies = input.enemies == null ? null : clampInt(input.enemies, TEAM_ARRANGEMENT_LIMITS.enemies[mode]);
  const waveSize = mode === 'endless_horde' && input.waveSize != null
    ? clampInt(input.waveSize, TEAM_ARRANGEMENT_LIMITS.waveSize) : null;
  const enemyNation = typeof input.enemyNation === 'string' && /^[a-z_]{2,24}$/.test(input.enemyNation) ? input.enemyNation : null;
  // the field limit (player included) holds whatever the two sides ask for: the enemy count is kept — it is
  // the number the player typed for a "1 v 20" — and the allied bots yield
  if (!isWaveMode(mode) && (allies != null || enemies != null)) {
    const sides = rulesetSides({ allies, enemies });
    if (sides.allies + sides.enemies + 1 > BATTLE_FIELD_LIMIT) allies = Math.max(0, BATTLE_FIELD_LIMIT - 1 - sides.enemies);
  }
  if (allies == null && enemies == null && waveSize == null && enemyNation == null) return null;
  return Object.freeze({ allies, enemies, waveSize, enemyNation });
}

export function matchRulesetFor(
  mode: GameModeId,
  campaign: CampaignRulesetInput | null = null,
  arrangement: TeamArrangement | null = null,
): MatchRuleset {
  const base = BASE_RULESETS[mode] ?? STANDARD;
  let ruleset: MatchRuleset = base;
  if (campaign && mode === 'frontline_assault' && base.assault) {
    const difficulty = Math.max(1, Math.min(9, Math.floor(campaign.difficulty) || 1));
    ruleset = {
      ...base,
      timeLimitS: campaign.timeLimitS === undefined ? base.timeLimitS : campaign.timeLimitS,
      enemyNation: typeof campaign.enemy === 'string' ? campaign.enemy : base.enemyNation,
      assault: Object.freeze({
        ...base.assault,
        // one extra defender every two operations, and 6 % hull per operation past the first
        extraDefenders: Math.floor((difficulty - 1) / 2),
        difficultyHp: (difficulty - 1) * 0.06,
      }),
    };
  }
  const arranged = normalizeTeamArrangement(mode, arrangement);
  if (arranged) {
    ruleset = {
      ...ruleset,
      allies: arranged.allies ?? ruleset.allies,
      enemies: arranged.enemies ?? ruleset.enemies,
      // a campaign operation's formation is not overridden by the free-sortie nation setting
      enemyNation: campaign?.enemy ? ruleset.enemyNation : (arranged.enemyNation ?? ruleset.enemyNation),
      horde: ruleset.horde && arranged.waveSize != null
        ? Object.freeze({ ...ruleset.horde, waveSize: Math.min(arranged.waveSize, arranged.enemies ?? ruleset.enemies ?? arranged.waveSize) })
        : ruleset.horde,
    };
  }
  return ruleset === base ? base : Object.freeze(ruleset);
}

/** Hostiles the Horde fields on a wave (1-based), before the pool caps it. */
export function hordeWaveSize(rules: HordeRules, wave: number): number {
  const w = Math.max(1, Math.floor(wave));
  return rules.waveSize + (w - 1) * rules.waveStep + (rules.surgeEvery > 0 ? Math.floor((w - 1) / rules.surgeEvery) : 0);
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
  if (!ruleset.criticalDamage) line('noCriticalDamage');
  if (ruleset.jumpMps != null) line('jump', { value: String(ruleset.jumpMps) });
  if (ruleset.recoilLaunchScale !== 1) line('recoilLaunch', { value: `×${Math.round(ruleset.recoilLaunchScale * 10) / 10}` });
  if (ruleset.shellKnockScale !== 0.3) line('shellKnock', { value: `×${Math.round(ruleset.shellKnockScale * 10) / 10}` });
  if (ruleset.respawnS != null) line('respawn', { value: String(ruleset.respawnS) });
  else if (ruleset.mode !== 'standard') line('noRespawn');
  if (ruleset.timeLimitS == null) line('noClock');
  else if (ruleset.timeLimitS !== STANDARD.timeLimitS || ruleset.timeout !== 'draw') {
    line(ruleset.timeout === 'defeat' ? 'clockDefeat' : 'clock', { value: `${Math.round(ruleset.timeLimitS / 60)}` });
  }
  if (isWaveMode(ruleset.mode)) {
    if (ruleset.allies === 0) line('noAllies');
    else if (ruleset.allies != null) line('allies', { value: String(ruleset.allies) });
    if (ruleset.enemies != null) line('enemyPool', { value: String(ruleset.enemies) });
  } else if (ruleset.allies != null || ruleset.enemies != null) {
    // sides (owner 2026-09-18): "14 v 14", "1 v 20" — the player counts on the allied side
    const sides = rulesetSides(ruleset);
    if (sides.allies !== STANDARD_SIDES.allies || sides.enemies !== STANDARD_SIDES.enemies) {
      line('sides', { allies: String(sides.allies + 1), enemies: String(sides.enemies) });
    }
  }
  if (ruleset.enemyNation) line('enemyNation', { value: ruleset.enemyNation });
  if (ruleset.mode === 'capture_the_flag') line('carrierSpeed', { value: percent(FLAG_CARRIER_SPEED_SCALE) });
  if (ruleset.horde) line('hordeWaves', { value: String(ruleset.horde.waveSize), step: String(ruleset.horde.waveStep) });
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
  /** False keeps modules, crew and fires intact (damage.ts rollModuleDamage / rollCrewHit). */
  modeCriticalDamage?: boolean;
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
  combat.modeCriticalDamage = ruleset.criticalDamage;
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
