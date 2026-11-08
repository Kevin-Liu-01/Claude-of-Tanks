/**
 * The dev battle hold, the step's side (src/dev/battleHold.ts is its switch, `__DEBUG.battleHold`). A held solo battle
 * stays alive and still for a check that needs it: every bot stands (no drive, brakes on, its lay held, no trigger, no
 * action or roof gun), the player takes no damage (a step's losses to its hit points, modules, crew, fire and ERA are
 * undone before the mode and the verdict read them, and it is never announced destroyed) and the battle reaches no
 * verdict until the hold is released. Only the page's own step (game/state.ts simStep) reads it, so a network battle is
 * never held; a watched battle (no player seat) neither. Off, nothing here runs or draws a random number: the step is the
 * step, byte for byte (devBattleHold.selftest.mjs).
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

interface HeldEntity {
  input: HeldInput;
  combat: CombatState;
}

interface HeldGame<Entity extends HeldEntity> {
  devBattleHold?: boolean;
  player: Entity | null;
  tanks: Entity[];
}

/** Whether this step is held: armed on a battle with a player seat, outside a public build. */
export function battleHeld<Entity extends HeldEntity>(game: HeldGame<Entity>): boolean {
  return DEV_BATTLE_HOLD && game.devBattleHold === true && game.player !== null;
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
 */
export function undoHeldDamage<Entity extends HeldEntity>(game: HeldGame<Entity>): void {
  const player = game.player, pin = pins.get(game);
  if (!player || !pin || pin.combat !== player.combat) return;
  const combat = player.combat;
  if (combat.hp < pin.hp) combat.hp = pin.hp;
  if (combat.destroyed && !pin.destroyed) combat.destroyed = false;
  for (const [name, kept] of pin.modules) {
    const module = combat.modules[name as keyof CombatState['modules']];
    if (!module || !(module.hp < kept.hp)) continue;
    module.hp = kept.hp;
    module.state = kept.state;
    module.repairT = kept.repairT;
  }
  for (const [name, alive] of pin.crew) if (alive && !combat.crew[name]) combat.crew[name] = true;
  if (combat.fire.burning && !pin.burning) {
    combat.fire.burning = false;
    combat.fire.tickTimer = pin.tickTimer;
    combat.fire.ticksLeft = pin.ticksLeft;
  }
  if (combat.eraSpent.size > pin.era.length) {
    for (const key of [...combat.eraSpent]) if (!pin.era.includes(key)) combat.eraSpent.delete(key);
  }
}
