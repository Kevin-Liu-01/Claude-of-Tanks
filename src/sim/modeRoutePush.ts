/**
 * The mode route push, one for both drivers (268; docs/ARCHITECTURE.md "One core, two drivers"): in a mode with an
 * objective, each side's bots are re-routed on its cadence (sim/matchRuleset.ts rulesetRoutePush) to the target the mode
 * names for them, once it has moved that far. The solo battle (game/state.ts) and the authority keep each side's next due
 * time; a standard battle never pushes.
 */
import * as detMath from './detMath.ts';
import { rulesetRoutePush } from './matchRuleset.ts';
import type { MatchRuleset } from './matchRuleset.ts';

interface RouteHull {
  team: string;
  modeActive?: boolean;
  combat: { destroyed?: boolean };
  aiCtl?: { setWaypoints(points: [number, number][], options?: { loop?: boolean }): void } | null;
  _modeTargetX?: number;
  _modeTargetZ?: number;
}

/** Push each due side's bots (`due`: each side's next push time, advanced here) toward `botTarget`'s point. Whether the
 *  mode pushes at all is the ruleset's routePush; `_mode` stays for the two drivers' calls (improve-271 plan 012). */
export function pushModeRoutes<Hull extends RouteHull>(
  hulls: readonly Hull[],
  _mode: string,
  ruleset: Pick<MatchRuleset, 'bots' | 'mode' | 'routePush'>,
  timeS: number,
  due: { alpha: number; bravo: number },
  botTarget: (entity: Hull) => { x: number; z: number } | null | undefined,
): void {
  if (!ruleset.routePush) return;
  const alphaDue = timeS >= due.alpha, bravoDue = timeS >= due.bravo;
  if (!alphaDue && !bravoDue) return;
  if (alphaDue) due.alpha = timeS + rulesetRoutePush(ruleset, 'alpha').refreshS;
  if (bravoDue) due.bravo = timeS + rulesetRoutePush(ruleset, 'bravo').refreshS;
  for (const entity of hulls) {
    if (!entity.aiCtl || entity.modeActive === false || entity.combat.destroyed) continue;
    const bravo = entity.team === 'bravo' || entity.team === 'enemy';
    if (bravo ? !bravoDue : !alphaDue) continue;
    const target = botTarget(entity);
    if (!target) continue;
    const moved = detMath.hypot(
      target.x - (entity._modeTargetX ?? Infinity),
      target.z - (entity._modeTargetZ ?? Infinity),
    );
    if (moved < rulesetRoutePush(ruleset, entity.team).moveM) continue;
    entity._modeTargetX = target.x;
    entity._modeTargetZ = target.z;
    entity.aiCtl.setWaypoints([[target.x, target.z]], { loop: false });
  }
}
