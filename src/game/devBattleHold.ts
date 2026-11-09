/**
 * The dev battle hold, the step's side (src/dev/battleHold.ts is its switch, `__DEBUG.battleHold`). A held solo battle
 * stays alive and still for a check that needs it: every bot stands (no drive, brakes on, its lay held, no trigger, no
 * action or roof gun), the player takes no damage (a step's losses to its hit points, modules, crew, fire and ERA are
 * undone before the mode and the verdict read them, and it is never announced destroyed) and the battle reaches no
 * verdict until the hold is released. Only the page's own step (game/state.ts simStep) reads it, so a network battle is
 * never held; a watched battle (no player seat) neither. Off, nothing here runs or draws a random number: the step is the
 * step, byte for byte (devBattleHold.selftest.mjs).
 *
 * (round 8 Y1 s2-05) The hold has edges, read in the step (stepBattleHold; the switch is set between steps, and armed
 * before a battle exists by both tools): free -> held parks every bot's brain on the battle's clock (game/ai.ts park, as
 * Watch's taken seat does), held -> free resumes it (ai.ts resume), so the hull a bot lost and the time that passed while
 * it stood are no burst, no stale window and no queued news at the release. A battle begun armed parks at its first step.
 * A couch battle's phone seats stand like the bots (their inputs go neutral), and their damage is not undone: only the
 * player's is.
 *
 * (round 8 merge review r1) The mode's own bot decisions stand with the bots: the step hands its held to the mode
 * controller (state.ts stepMatchMode), so a held Air Support battle's bots call in no strike or recon pass
 * (sim/airSupport.ts step); a strike called before the hold still flies, as a round in flight still lands.
 */
import type { CombatState, ModuleStateName } from '../sim/damage.ts';

/** False in a public build (`npm run build`, VITE_PUBLIC_BUILD=1): the hold is not in what players load, ?debug=1 or not. */
export const DEV_BATTLE_HOLD = import.meta.env?.VITE_PUBLIC_BUILD !== '1';

interface HeldInput {
  throttle: number;
  steer: number;
  brake: boolean;
  aimLocked: boolean;
  fire: boolean;
  actionBits: number;
  auxiliaryBits?: number;
}

/** A bot's brain as the hold's edges see it (game/ai.ts AiController park and resume). */
interface HeldBrain {
  park?(timeS?: number): void;
  resume?(timeS?: number, firstShellId?: number): void;
}

interface HeldEntity {
  id: string;
  input: HeldInput;
  combat: CombatState;
  aiCtl?: HeldBrain | null;
}

interface HeldGame<Entity extends HeldEntity> {
  devBattleHold?: boolean;
  player: Entity | null;
  tanks: Entity[];
  /** The battle's clock and next shell id (the brains' park and resume read them). */
  timeS?: number;
  nextShellId?: number;
  /** The battle's ordinal (setupBattle counts it): a new battle starts free whatever the last one ended in. */
  battleCount?: number;
}

/** The page's bus, as the undo answers what the step announced. */
interface HeldBus {
  emit(event: string, payload: { id: string; module?: string; state?: ModuleStateName; source?: string; burning?: boolean }): void;
}

/** Whether this step is held: armed on a battle with a player seat, outside a public build. */
export function battleHeld<Entity extends HeldEntity>(game: HeldGame<Entity>): boolean {
  return DEV_BATTLE_HOLD && game.devBattleHold === true && game.player !== null;
}

/** The hold's state at the end of each game's last step: free or held, and the battle it was read in. */
const holdEdges = new WeakMap<object, { battle: number; held: boolean }>();

/**
 * The held step's one owner (round 8 Y1 s2-05), at the top of the step's controls (game/state.ts stepHullControls): this
 * step's held, its edge against the last step of the same battle (free -> held parks every bot's brain, held -> free
 * resumes each, before any of them is updated), then the held step's start (holdBattleStep). Returns this step's held.
 */
export function stepBattleHold<Entity extends HeldEntity>(game: HeldGame<Entity>): boolean {
  const held = battleHeld(game);
  const battle = game.battleCount ?? 0;
  let edge = holdEdges.get(game);
  if (!edge) { edge = { battle, held: false }; holdEdges.set(game, edge); }
  const was = edge.battle === battle && edge.held;
  edge.battle = battle;
  edge.held = held;
  if (held !== was) {
    for (const entity of game.tanks) {
      if (entity === game.player || !entity.aiCtl) continue;
      if (held) entity.aiCtl.park?.(game.timeS);
      else entity.aiCtl.resume?.(game.timeS, game.nextShellId);
    }
  }
  if (held) holdBattleStep(game);
  return held;
}

interface ModulePin { hp: number; state: ModuleStateName; repairT: number }
/** The player's damage state at the start of a held step, reused step to step (no per-step allocation once warm). */
interface DamagePin {
  combat: CombatState | null;
  hp: number;
  destroyed: boolean;
  modules: Map<string, ModulePin>;
  crew: Map<string, boolean>;
  burning: boolean;
  tickTimer: number;
  ticksLeft: number;
  era: string[];
}
const pins = new WeakMap<object, DamagePin>();

/**
 * A held step's start, in place of the bots' controllers: every bot's input goes neutral and the player's damage state is
 * pinned. Runs after spotting and before movement, so nothing has struck yet this step.
 */
export function holdBattleStep<Entity extends HeldEntity>(game: HeldGame<Entity>): void {
  const player = game.player;
  for (const entity of game.tanks) {
    if (entity === player) continue;
    const input = entity.input;
    input.throttle = 0;
    input.steer = 0;
    input.brake = true;
    input.aimLocked = true;
    input.fire = false;
    input.actionBits = 0;
    input.auxiliaryBits = 0;
  }
  if (!player) return;
  let pin = pins.get(game);
  if (!pin) {
    pin = { combat: null, hp: 0, destroyed: false, modules: new Map(), crew: new Map(), burning: false, tickTimer: 0, ticksLeft: 0, era: [] };
    pins.set(game, pin);
  }
  const combat = player.combat;
  if (pin.combat !== combat) { pin.modules.clear(); pin.crew.clear(); }
  pin.combat = combat;
  pin.hp = combat.hp;
  pin.destroyed = combat.destroyed;
  for (const [name, module] of Object.entries(combat.modules)) {
    if (!module) continue;
    const kept = pin.modules.get(name);
    if (kept) { kept.hp = module.hp; kept.state = module.state; kept.repairT = module.repairT; }
    else pin.modules.set(name, { hp: module.hp, state: module.state, repairT: module.repairT });
  }
  for (const name in combat.crew) pin.crew.set(name, combat.crew[name]);
  pin.burning = combat.fire.burning;
  pin.tickTimer = combat.fire.tickTimer;
  pin.ticksLeft = combat.fire.ticksLeft;
  pin.era.length = 0;
  for (const key of combat.eraSpent) pin.era.push(key);
}

/**
 * A held step's losses undone, before the mode and the verdict: hit points, modules, crew, a fire the step lit and ERA the
 * step spent come back to the pin. Gains stand (a repair, a heal, a fire burning out), so a held hull only ever mends.
 * (round 8 Y1 s2-05) The undo answers what the step announced, so the presentation agrees with the hull: each module it
 * restores says its state again (module:state, source 'hold': never `repaired`, which plays a crew's repair line), and a
 * fire it puts out says so (tank:fire burning false: the alarm loop stops, the crew says the fire is out).
 */
export function undoHeldDamage<Entity extends HeldEntity>(game: HeldGame<Entity>, bus: HeldBus): void {
  const player = game.player, pin = pins.get(game);
  if (!player || !pin || pin.combat !== player.combat) return;
  const combat = player.combat;
  if (combat.hp < pin.hp) combat.hp = pin.hp;
  if (combat.destroyed && !pin.destroyed) combat.destroyed = false;
  for (const [name, kept] of pin.modules) {
    const module = combat.modules[name as keyof CombatState['modules']];
    if (!module || !(module.hp < kept.hp)) continue;
    module.hp = kept.hp;
    const announced = module.state !== kept.state;
    module.state = kept.state;
    module.repairT = kept.repairT;
    if (announced) bus.emit('module:state', { id: player.id, module: name, state: kept.state, source: 'hold' });
  }
  for (const [name, alive] of pin.crew) if (alive && !combat.crew[name]) combat.crew[name] = true;
  if (combat.fire.burning && !pin.burning) {
    combat.fire.burning = false;
    combat.fire.tickTimer = pin.tickTimer;
    combat.fire.ticksLeft = pin.ticksLeft;
    bus.emit('tank:fire', { id: player.id, burning: false });
  }
  if (combat.eraSpent.size > pin.era.length) {
    for (const key of [...combat.eraSpent]) if (!pin.era.includes(key)) combat.eraSpent.delete(key);
  }
}
