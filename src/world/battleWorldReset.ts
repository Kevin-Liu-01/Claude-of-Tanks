// (round 3 A7/M4) The battle edge's one reset of a cached, reused world: every battle start (the solo start, a network
// round's activation, a dev still) runs it in place of a bare resetDestructibles.
//
// The Studio takes two things from the world it plans on and gives them back at its exit (studioCrush.ts setPlan and
// restore, studio.ts syncCrushPlan and releaseCrushes): the felled trees' falls ('timeline', round 2 U28's declared
// driver) and the crush sweeps (off: it presses with every hull on its tracks). A Studio teardown that threw before its
// releaseCrushes gave neither back, and the world stayed cached that way: every later battle's felled trees opened their
// collision and never fell (the frame's advance was ignored), and a crush the presentation never pressed stood drawn
// intact. The per-frame latch of old recovered after one frame; a declared driver needs a declaration. A battle owns its
// world's falls and sweeps whatever the Studio did, so the battle edge declares both, then stands the battlefield intact.
//
// Not inside resetDestructibles: the Studio resets its battlefield through that while it holds the timeline (setPlan
// declares 'timeline' and then resets, a backward seek resets, studio.ts's scene start resets).

/** The world a battle starts on (map.ts WorldRuntime); a bare collision world has none of these. */
export interface BattleResetWorld {
  setFallDriver?(driver: 'frame' | 'timeline'): void;
  setCrushSweeps?(on: boolean): void;
  resetDestructibles?(): void;
}

/** The battle takes the world: its frame drives the falls, its crush sweeps run, and every crush of before stands up. */
export function resetWorldForBattle(world: BattleResetWorld | null | undefined): void {
  if (!world) return;
  world.setFallDriver?.('frame');
  world.setCrushSweeps?.(true);
  world.resetDestructibles?.();
}
