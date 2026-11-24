/**
 * airCrash.ts — an aircraft's crash is an HE round (air-crash-he-276; the owner, 2026-11-23: "when a plane is shot down
 * and falls it should cause a big explosion with sounds and explosion hole. duh. same with drones if they hit the ground
 * or a building, its like HE").
 *
 * There is no second explosion path. A crash is one shell of its airframe's class (matchRuleset.ts AIR_CRASH_ROUNDS: HE,
 * its blast envelope the class's charge) in the normal shell pipeline of whichever driver steps it (the solo step,
 * game/state.ts; the network authority, sim/authoritativeMatch.ts): the HE burst on the hulls, the struck structure's
 * blast, the crater, the shell impact the presentation's explosion and sound are raised from.
 *   - a downed Air Support aircraft: sim/airSupportFire.ts launches its crash round once, on the fall's arc
 *     (sim/strikeRuns.ts crashFall), credited to the crew that brought it down;
 *   - a drone that meets the ground or a building: its round bursts there as the drone's crash (worldImpactSpec, called
 *     by both drivers where a round meets the world), never as its shaped charge; a hull it strikes still takes the
 *     shaped charge;
 *   - a drone shot down: its airframe falls from where it was struck as the drone's crash round (aerialCombat.ts
 *     strikeDrone) and bursts where it lands.
 *
 * Pure: no DOM, no three, no driver.
 */
import { AIR_CRASH_ROUNDS, airCrashClassOf, type AirStrikeKind } from './matchRuleset.ts';
import type { ShellSpec } from './shellSpec.ts';

/** Whether a round is a crash round (the kill source, the lag rewind and the aircraft hit test read it). */
export function isCrashRound(spec: { readonly reloadGroup?: unknown } | null | undefined): boolean {
  return spec?.reloadGroup === 'air-crash' || spec?.reloadGroup === 'drone-crash';
}

/** The crash round an Air Support aircraft of `kind` makes (null: artillery, which has no aircraft). */
export function crashRoundForStrike(kind: AirStrikeKind): ShellSpec | null {
  const cls = airCrashClassOf(kind);
  return cls ? AIR_CRASH_ROUNDS[cls] : null;
}

/**
 * The spec a round bursts with where it meets the world (the ground, a building, a prop): a drone's airframe meeting it is
 * its crash, every other round its own. Both drivers call it first where a round meets the world.
 */
export function worldImpactSpec<Spec extends { readonly tracer?: unknown }>(spec: Spec): Spec {
  return spec.tracer === 'DRONE' ? AIR_CRASH_ROUNDS.drone as unknown as Spec : spec;
}
