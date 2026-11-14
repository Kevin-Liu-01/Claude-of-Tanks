/**
 * trainingGround.ts — the training battle's ground: where the player starts, the hulls the scenes stand on their marks,
 * and the tank the player trains in (273). Copyright © 2026 Kevin B. Liu.
 *
 * The training battle is the first-game tutorial's own mode (`training`, sim/matchRuleset.ts): a solo battle on one
 * section of Verdant Fields, on a fixed seed, in a fixed loaner (Kevin, 2026-11-12: "a fixed loaner"), where the
 * tutorial's step data (ui/tutorial/tutorialSteps.ts) walks the player through fourteen scenes. Its hulls are the
 * Proving Ground's kind: seated on marks, no brain; a scene's script drives the ones that move or fire, and the
 * simulation resolves every shell they fire.
 *
 * This leaf holds the rules (the matchRuleset table imports and re-exports them) and turns them into the range layout
 * the solo battle already seats a Proving Ground from (sim/provingGround.ts ProvingRangeLayout): the player on the
 * origin, each actor on its own mark in roster order, the earthworks as course stamps. Pure: the rules and the ground's
 * heights decide it.
 *
 * Coordinates are Verdant Fields' metres. A yaw of 0 faces +z (north on the map) and turns toward +x; a hull's left is
 * +x at a yaw of 0.
 */
import type { CourseStamp } from './terrainDeformation.ts';
import type { ProvingLaneMark, ProvingMark, ProvingRangeLayout } from './provingGround.ts';

const DEG = Math.PI / 180;

/** One hull the scenes use: a target that never fires, or (later scenes) a scripted shooter. */
export interface TrainingActorRule {
  /** The scenes' name for it ("target1"); its battle id is its tank's spec id (a solo roster keys hulls by spec). */
  readonly key: string;
  readonly specId: string;
  readonly x: number;
  readonly z: number;
  /** The heading it stands at (deg; 0 faces +z). */
  readonly yawDeg: number;
}

export interface TrainingRules {
  readonly mapId: string;
  /** The loaner: every player trains in this tank. */
  readonly loanerSpecId: string;
  /** The battle's match seed: the same inputs give the same battle. */
  readonly seed: number;
  /** Where the player starts and faces (deg). */
  readonly start: { readonly x: number; readonly z: number; readonly yawDeg: number };
  /** The scenes' hulls, in roster order (each spec once, none the loaner). */
  readonly actors: readonly TrainingActorRule[];
  /** One light whatever the player's battle times (the scenes read in daylight). */
  readonly timeOfDay: 'day';
}

/**
 * The training battle (storyboard §2): the south-west of Verdant Fields. The drive, turret and vision scenes (S1 to S4)
 * play on the open meadow west of alpha's assembly woods (x -300..-210, z -160..-95): the probe of 2026-11-14
 * (tools/training-layout-probe.mjs) found no canopy, no obstacle and at most a 14 % grade on any leg, and the board in
 * sight from ring B. The first layout's rings stood in the wood behind the southern swell (a tank driving into trunks,
 * the camera in the leaves). The player starts on the meadow's east edge facing west; the targets wait beyond it.
 */
export const TRAINING_RULES: TrainingRules = Object.freeze({
  mapId: 'verdant',
  loanerSpecId: 'm1a1',
  seed: 27_301,
  start: Object.freeze({ x: -215, z: -135, yawDeg: 270 }),
  actors: Object.freeze([
    Object.freeze({ key: 'target1', specId: 'leo1a5', x: -150, z: -60, yawDeg: 210 }),
    Object.freeze({ key: 'target2', specId: 'merkava2b', x: -60, z: -40, yawDeg: 180 }),
  ]),
  timeOfDay: 'day',
});

/** The scenes' points, named once: the guide's markers and the steps that wait on them read these. */
export const TRAINING_POINTS = Object.freeze({
  /** S2: the first ring, 50 m ahead of the start (west), and the second, 35 m to the left of it (north). */
  driveA: Object.freeze({ x: -265, z: -135, radiusM: 6 }),
  driveB: Object.freeze({ x: -265, z: -100, radiusM: 6 }),
  /** S3: the board the gun points at, 61 m south-west of ring B across the meadow (in sight from it). */
  board: Object.freeze({ x: -300, z: -150, radiusM: 3 }),
});

/** An actor's rule by its scenes' name. */
export function trainingActor(rules: TrainingRules, key: string): TrainingActorRule | null {
  return rules.actors.find((actor) => actor.key === key) ?? null;
}

/** The training roster after the player: each actor's tank, in order. */
export function trainingRoster(rules: TrainingRules): readonly string[] {
  return rules.actors.map((actor) => actor.specId);
}

const mark = (x: number, z: number, yawDeg: number): ProvingMark => Object.freeze({ x, z, yaw: yawDeg * DEG });

/**
 * The training ground as a range layout: the start as its origin, each actor's mark as a lane (in roster order, so the
 * solo seating hands the n-th actor the n-th mark), no plates, and the earthworks the scenes stamp (none until the
 * hull-down and cover scenes).
 */
export function planTrainingRange(rules: TrainingRules): ProvingRangeLayout {
  const origin = mark(rules.start.x, rules.start.z, rules.start.yawDeg);
  const lanes: ProvingLaneMark[] = rules.actors.map((actor, index) => {
    const rangeM = Math.hypot(actor.x - origin.x, actor.z - origin.z);
    return Object.freeze({ ...mark(actor.x, actor.z, actor.yawDeg), index, rangeM, measuredM: rangeM, presentDeg: 0, lateralM: 0 });
  });
  const stamps: CourseStamp[] = [];
  return Object.freeze({
    origin,
    lanes: Object.freeze(lanes),
    plates: Object.freeze([]),
    course: Object.freeze({
      yaw: origin.yaw, widthM: 0, start: Object.freeze({ x: origin.x, z: origin.z }), end: Object.freeze({ x: origin.x, z: origin.z }),
      features: Object.freeze([]), stamps: Object.freeze(stamps),
    }),
  });
}
