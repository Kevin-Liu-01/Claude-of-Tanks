/**
 * What the player sees (round 8 Y3, s1-02): one rule for every presentation that must show, light or name only the hulls
 * the player can see. A network battle's actor carries the authority's word (`networkVisible`: spotting filters a
 * client's snapshots before they are sent). A solo battle shows its own side, every hull when the watch or a couch
 * battle with seats on both sides reveals all (stateCore.ts watchRevealsAll), and an enemy while the player's side has
 * it spotted and the word reaches the player's seat (spotting.ts isSpotted with the seat as the receiver: the radio share,
 * the seat's own eyes). The team-wide spot and its `tank:spotted` event ignore the receiver: an enemy a far ally lit is
 * not one the player sees.
 *
 * Readers: the audio engine's frame index (src/audio/listenerPoseRuntime.ts hands the rule to audio.update, and the crew
 * names only what it shows), the night lighting and the auxiliary effects (src/main.ts). Pure and DOM-free.
 */
import { watchRevealsAll } from './stateCore.ts';

/** A hull as the rule reads it. */
export interface VisibilityHull {
  readonly id: string;
  readonly team?: string | null;
  /** A network battle's actor: whether the authority sent it this frame (absent in a solo battle). */
  readonly networkVisible?: boolean;
}

/** The seat whose eyes the rule uses: its team, and its own position for the radio share. */
export interface VisibilitySeat {
  readonly id: string;
  readonly team?: string | null;
  readonly state?: { readonly pos?: { readonly x: number; readonly z: number } | null } | null;
}

/** The battle as the rule reads it: the seat, the spotting state, and what decides that every hull shows. */
export type PlayerVisibilityGame = Parameters<typeof watchRevealsAll>[0] & {
  readonly player: VisibilitySeat | null;
  readonly spotting?: { isSpotted(id: string, team: string, receiver?: VisibilitySeat | null): boolean } | null;
};

/** Whether the player sees this hull now. */
export function isPlayerVisible(game: PlayerVisibilityGame, hull: VisibilityHull): boolean {
  if (hull.networkVisible !== undefined) return hull.networkVisible;
  const team = game.player?.team ?? 'player';
  return watchRevealsAll(game) || hull.team === team || game.spotting?.isSpotted(hull.id, team, game.player) === true;
}
