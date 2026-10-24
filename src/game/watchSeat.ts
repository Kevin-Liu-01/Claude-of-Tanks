/**
 * Watch mode's seats (watch-mode-243): who drives each hull of a watched battle (sim/matchRuleset.ts WATCH_RULES).
 *
 * A watched battle is set up as any solo battle — the human seat on its side, spawn, role and vehicle, so the loading
 * and reveal pipeline runs unchanged — with one difference: that seat's bot brain is built beside it (state.ts
 * spawnBattleEntities) and parked here. When the battle opens, openWatchSeats hands the seat to its brain and leaves the
 * session with no player: every hull is driven by its controller and the watcher only looks.
 *
 * Taking control is the player's own path, nothing new: the fixed step drives a hull from its controller exactly when
 * `aiCtl` is set (state.ts stepBotControllers), and the frame input writes `game.player.input` before each step
 * (playerFrameInput.ts). takeWatchSeat parks the hull's controller here and makes the hull the session's player, so
 * the watcher's input enters the step as any player's does and the controller never also writes it; leaveWatchSeat
 * gives the controller back, which resumes from the hull's live state (pose, hull, rounds, reload, modules). A seat's
 * `bot` flag never changes: the mode controller keeps reading the human seat as the human's (its one life in
 * Frontline, the Horde's survivors) and every other seat as a bot's, so taking control bends no mode rule.
 *
 * Node-runnable: no DOM, no clock, no randomness.
 */

interface WatchSeatInput {
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  actionBits?: number;
  aimLocked?: boolean;
}

/** The slice of a solo entity the seats read and write. */
export interface WatchSeatEntity<TController = unknown> {
  id: string;
  team: string;
  isPlayer: boolean;
  aiCtl: TController | null;
  input: WatchSeatInput;
  combat: { destroyed?: boolean } | null;
  modeActive?: boolean;
  aerial?: { kind?: string } | null;
}

/** A watched battle's seat ledger (on the session as `game.watch`). */
export interface WatchSession<TController = unknown> {
  /** The human seat (the reference side's verdict and the drone's opening frame read it). */
  readonly seatId: string;
  /** The seat the watcher drives, or null while watching. */
  takenId: string | null;
  /** True once the battle opened: the human seat's brain drives it. */
  opened: boolean;
  /** Parked controllers by hull id: the human seat's until the battle opens, a taken seat's while it is driven. */
  readonly parked: Map<string, TController>;
}

interface WatchSeatGame<TEntity extends WatchSeatEntity<TController>, TController> {
  player: TEntity | null;
  tanks: TEntity[];
  ruleset: { readonly watch?: { readonly takeControl: boolean } | null };
  watch?: WatchSession<TController> | null;
}

function zeroInput(input: WatchSeatInput): void {
  input.throttle = 0;
  input.steer = 0;
  input.brake = false;
  input.fire = false;
  input.actionBits = 0;
  input.aimLocked = false;
}

function seatById<TEntity extends WatchSeatEntity<TController>, TController>(
  game: WatchSeatGame<TEntity, TController>, id: string | null,
): TEntity | null {
  if (!id) return null;
  for (const entity of game.tanks) if (entity.id === id) return entity;
  return null;
}

/**
 * Setup (state.ts): the human seat's brain has just been built on `seat`; park it so the seat stays the player's
 * through loading and the reveal, and open the session's ledger.
 */
export function prepareWatchSeat<TEntity extends WatchSeatEntity<TController>, TController>(
  game: WatchSeatGame<TEntity, TController>, seat: TEntity,
): void {
  const parked = new Map<string, TController>();
  if (seat.aiCtl) parked.set(seat.id, seat.aiCtl);
  seat.aiCtl = null;
  game.watch = { seatId: seat.id, takenId: null, opened: false, parked };
}

/** The battle opens: the human seat's brain drives it and the session has no player. Idempotent. */
export function openWatchSeats<TEntity extends WatchSeatEntity<TController>, TController>(
  game: WatchSeatGame<TEntity, TController>,
): boolean {
  const watch = game.watch;
  if (!watch || watch.opened) return false;
  const seat = seatById(game, watch.seatId);
  const brain = watch.parked.get(watch.seatId);
  watch.parked.delete(watch.seatId);
  watch.opened = true;
  if (seat) {
    if (brain) seat.aiCtl = brain;
    seat.isPlayer = false;
    zeroInput(seat.input);
  }
  game.player = null;
  return true;
}

/** Why a hull cannot be taken (null: it can). */
export function watchSeatRefusal<TEntity extends WatchSeatEntity<TController>, TController>(
  game: WatchSeatGame<TEntity, TController>, entity: TEntity | null,
): 'no-watch' | 'not-open' | 'no-take-control' | 'already-driving' | 'no-hull' | 'destroyed' | 'inactive' | 'no-brain' | 'aircraft' | null {
  const watch = game.watch;
  if (!watch) return 'no-watch';
  if (!watch.opened) return 'not-open';
  if (!game.ruleset.watch?.takeControl) return 'no-take-control';
  if (watch.takenId) return 'already-driving';
  if (!entity) return 'no-hull';
  if (!entity.combat || entity.combat.destroyed) return 'destroyed';
  if (entity.modeActive === false) return 'inactive';
  if (!entity.aiCtl) return 'no-brain';
  if (entity.aerial?.kind === 'gunship') return 'aircraft';
  return null;
}

/**
 * Take control of `entity`: its controller parks, the hull becomes the session's player and the watcher's input drives
 * it from the next step. Nothing about the hull itself changes. Returns false (and changes nothing) when refused.
 */
export function takeWatchSeat<TEntity extends WatchSeatEntity<TController>, TController>(
  game: WatchSeatGame<TEntity, TController>, entity: TEntity | null,
): boolean {
  if (watchSeatRefusal(game, entity) !== null || !entity || !game.watch) return false;
  game.watch.parked.set(entity.id, entity.aiCtl as TController);
  entity.aiCtl = null;
  entity.isPlayer = true;
  zeroInput(entity.input);
  game.player = entity;
  game.watch.takenId = entity.id;
  return true;
}

/**
 * Leave the taken seat: its controller drives it again from the hull's live state (a wreck's controller waits for the
 * mode's revive, as any bot's does) and the session has no player. Returns the hull handed back, or null.
 */
export function leaveWatchSeat<TEntity extends WatchSeatEntity<TController>, TController>(
  game: WatchSeatGame<TEntity, TController>,
): TEntity | null {
  const watch = game.watch;
  if (!watch?.takenId) return null;
  const entity = seatById(game, watch.takenId);
  const brain = watch.parked.get(watch.takenId);
  watch.parked.delete(watch.takenId);
  watch.takenId = null;
  if (entity) {
    if (brain) entity.aiCtl = brain;
    entity.isPlayer = false;
    zeroInput(entity.input);
  }
  if (game.player === entity) game.player = null;
  return entity;
}

/** The verdict's reference seat in a watched battle (the human seat, whoever drives it); else the player. */
export function verdictSeat<TEntity extends WatchSeatEntity<TController>, TController>(
  game: WatchSeatGame<TEntity, TController>,
): TEntity | null {
  return game.watch ? seatById(game, game.watch.seatId) : game.player;
}
