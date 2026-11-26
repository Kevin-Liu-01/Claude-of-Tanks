// Where a battle's photo mode may open (photo-mode-271). Copyright © 2026 Kevin B. Liu.
// Solo only (owner 10-26 and 10-29: a solo battle is never a multiplayer session; a room's battle runs on its
// authority, which no client may pause, so photo mode stays out of every room). A battle with a result, a kill-cam
// replay, a couch battle (its phones own the tanks), the Studio, a staged shot and the entry's loading cover keep it out
// too. A watched replay (docs/REPLAY.md §5) is a solo page's battle: photo mode is its fourth camera, framing the ridden
// tank over the paused replay (settings-unify-278). Pure facts in, a verdict out: main.ts gathers them, battlePhotoAvailability.selftest.mjs pins them.

export interface BattlePhotoFacts {
  readonly phase: string;
  /** A network match (a room) drives this battle. */
  readonly online: boolean;
  readonly couch: boolean;
  readonly hasResult: boolean;
  readonly killcam: boolean;
  /** The battle entry's opaque loading cover is up. */
  readonly covered: boolean;
  readonly studio: boolean;
  readonly shotMode: boolean;
  /** A tank to frame: the player's, or the one the camera follows. */
  readonly hasSubject: boolean;
}

export function battlePhotoAvailable(facts: BattlePhotoFacts): boolean {
  return facts.phase === 'battle' && !facts.online && !facts.couch && !facts.hasResult && !facts.killcam
    && !facts.covered && !facts.studio && !facts.shotMode && facts.hasSubject;
}
