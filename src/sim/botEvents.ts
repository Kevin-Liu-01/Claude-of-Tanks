/**
 * botEvents.ts — what a bot's controller hears from the fight between its own updates (game/ai.ts notifyShellResult,
 * notifyUnderFire, notifyEnemyFired, notifyFriendlyBlocked), delivered by both drivers (game/state.ts and
 * sim/authoritativeMatch.ts) through these functions, so the same hulls hear the same events in the same hull order and
 * through the same filters on both. Those callbacks draw from the bot's seeded stream (a hit reaction, an aim-error
 * resample) and can start a flank, so which hull hears what, and in which order, is simulation (2026-11-02 audit M6: the
 * two drivers each kept their own loop, and only the authority refused a bot's shot a teammate had driven into after the
 * controller's update). Where a killing shot's delivery falls against the mode's scoring of that kill still differs
 * (solo scores in announceDestroyed before deliverShellHit; the authority delivers in recordShellHit before
 * recordShotDestruction scores), and no brain sees it: the controller only queues each event, and applies the phase's
 * news in one declared order at the drivers' flush (game/ai.ts applyPendingBotNews, audit M7), after both have scored;
 * the arrival checks read only the shooter's own state and the brain's cached spec, which the scoring does not write
 * (round 2 U12, 2026-11-04). The controller's own handling of them is game/ai.ts's. Node-runnable, allocation-free.
 */
import { botFriendlyFireRisk } from '../game/ai.ts';
import type { DamageShellSpec } from './damage.ts';

/** The callbacks a hull's controller takes (both drivers' controllers are game/ai.ts createAI's). */
export interface BotEventController<Hull> {
  notifyShellResult?(hit: BotHitEvent): void;
  notifyUnderFire?(shooter: Hull, info: { selfHit: boolean; damaging: boolean; kind: string }): void;
  notifyEnemyFired?(shooter: Hull): void;
  notifyFriendlyBlocked?(risk: NonNullable<ReturnType<typeof botFriendlyFireRisk>>): void;
}

/** A hull as the events read it. */
export interface BotEventHull {
  readonly id: string;
  readonly team: string;
  readonly state: { readonly pos: { readonly x: number; readonly y: number; readonly z: number } } | null;
  readonly combat: { readonly destroyed: boolean } | null;
  readonly aerial?: { readonly kind?: string } | null;
  readonly aiCtl?: BotEventController<never> | null;
}

/** The hit as the shooter's controller reads it (the driver's hit event, its target named). */
export interface BotHitEvent {
  readonly targetId: string | null;
  readonly kind: string;
  readonly damage?: number;
  readonly shellName?: string;
  /** The round's id (the driver's hit event): a brain handed its hull back ignores rounds fired before (game/ai.ts resume). */
  readonly shellId?: number;
}

/** A gunfire bearing heard this far off (m) is a contact hint; a hit within this of the struck hull is the team's intel. */
export const ENEMY_FIRED_HEARD_M = 500;
export const UNDER_FIRE_SHARED_M = 200;

/** Squared distance, the order three's Vector3.distanceToSquared sums it in (both drivers' old filters read that). */
function distanceSquared(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function controllerOf<Hull extends BotEventHull>(hull: Hull): BotEventController<Hull> | null {
  return (hull.aiCtl as BotEventController<Hull> | null | undefined) ?? null;
}

/**
 * A shot was fired: every live hull a brain drives on the other side within ENEMY_FIRED_HEARD_M hears it, in the hulls'
 * order. The AC-130's guns are not heard (it is no hull on the field). Call after the spotting heard the shot.
 */
export function deliverShotFired<Hull extends BotEventHull>(hulls: readonly Hull[], shooter: Hull): void {
  if (shooter.aerial?.kind === 'gunship' || !shooter.state) return;
  const limit = ENEMY_FIRED_HEARD_M * ENEMY_FIRED_HEARD_M;
  for (const hull of hulls) {
    const controller = controllerOf(hull);
    if (hull.team === shooter.team || !controller || !hull.combat || hull.combat.destroyed || !hull.state) continue;
    if (distanceSquared(hull.state.pos, shooter.state.pos) <= limit) controller.notifyEnemyFired?.(shooter);
  }
}

/**
 * A round struck a hull (or the world): the shooter's controller hears the result first, then — a hull struck by the
 * other side, by no AC-130 — the struck hull and every live teammate a brain drives within UNDER_FIRE_SHARED_M of it hear
 * they are under fire, in the hulls' order. A friendly hit reaches no one's under-fire (game/ai.ts ignores a teammate).
 */
export function deliverShellHit<Hull extends BotEventHull>(
  hulls: readonly Hull[], shooter: Hull | null | undefined, target: Hull | null | undefined, hit: BotHitEvent,
): void {
  if (shooter) controllerOf(shooter)?.notifyShellResult?.(hit);
  if (!shooter?.state || !shooter.combat || !target?.state || !target.combat) return;
  if (shooter.team === target.team || shooter.aerial?.kind === 'gunship') return;
  const limit = UNDER_FIRE_SHARED_M * UNDER_FIRE_SHARED_M;
  const damaging = (hit.damage || 0) > 0;
  for (const hull of hulls) {
    const controller = controllerOf(hull);
    if (hull.team !== target.team || !controller || !hull.combat || hull.combat.destroyed || !hull.state) continue;
    if (hull !== target && distanceSquared(hull.state.pos, target.state.pos) > limit) continue;
    controller.notifyUnderFire?.(shooter, { selfHit: hull === target, damaging, kind: hit.kind });
  }
}

/**
 * The fire path's last word on a brain's shot (the controller's own gate ran at its update; a teammate may have driven
 * into the lane since): true when the shot may go. A refused shot tells the controller (its relocation timer). A hull a
 * player drives is never refused. `aimPoint` is the shot's intended impact; `candidates` the hulls to inspect.
 */
export function botShotClear<Hull extends BotEventHull>(
  shooter: Hull, aimPoint: { x: number; y: number; z: number }, shellSpec: DamageShellSpec, candidates: readonly Hull[],
): boolean {
  const controller = controllerOf(shooter);
  if (!controller) return true;
  type RiskArgs = Parameters<typeof botFriendlyFireRisk>;
  const risk = botFriendlyFireRisk(shooter as unknown as RiskArgs[0], aimPoint, shellSpec, candidates as unknown as RiskArgs[3]);
  if (!risk) return true;
  controller.notifyFriendlyBlocked?.(risk);
  return false;
}
