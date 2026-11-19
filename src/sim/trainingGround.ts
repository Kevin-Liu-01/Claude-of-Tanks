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

/**
 * A scripted shooter's fire (S9 on): while its scene cues it (the tutorial's step, game/state.ts cueTrainingActor), it
 * lays its gun on the player's upper front plate and fires `shellType` each time its gun is loaded, the first round
 * `firstS` after the cue (the telegraph). The simulation resolves every round: the gun's dispersion, the plate it meets,
 * the penetration roll and the damage are the battle's own (Kevin, 2026-11-18: real shots with the shot card, no rule
 * changed).
 */
export interface TrainingVolley {
  readonly shellType: string;
  readonly firstS: number;
  /** Where on the loaner's hull it aims (m): along the hull from its centre, and up from its origin. */
  readonly aim: { readonly alongM: number; readonly upM: number };
}

/** One hull the scenes use: a target that never fires, or a scripted shooter. */
export interface TrainingActorRule {
  /** The scenes' name for it ("target1"); its battle id is its tank's spec id (a solo roster keys hulls by spec). */
  readonly key: string;
  readonly specId: string;
  readonly x: number;
  readonly z: number;
  /** How it stands: facing the scene's firing point (a TRAINING_POINTS key), turned `presentDeg` from it (0 nose on, 90
   *  broadside; + turns its nose to its left), so its presentation holds wherever the probe moves the two. */
  readonly faces: keyof typeof TRAINING_POINTS;
  readonly presentDeg: number;
  /** A scripted shooter's fire; none for a target. */
  readonly volley?: TrainingVolley;
}

/**
 * An earthwork the scenes stamp onto the ground (S10's berm): a course stamp (sim/terrainDeformation.ts) across the line
 * from its centre toward an actor, its profile along that line (knots u, h: metres from the centre toward the actor, and
 * the height there), `halfWidthM` either side of it, blended into the ground over `skirtM`.
 */
export interface TrainingEarthwork {
  readonly x: number;
  readonly z: number;
  readonly toward: string;
  readonly profile: readonly number[];
  readonly halfWidthM: number;
  readonly skirtM: number;
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
  /** The earthworks the scenes stand behind, stamped at the battle's setup. */
  readonly earthworks: readonly TrainingEarthwork[];
  /** One light whatever the player's battle times (the scenes read in daylight). */
  readonly timeOfDay: 'day';
}

/** S10's berm and Sentry 2 (tools s10-search), named once: the berm's line, the ring behind it and the hull read them. */
const S10_BERM = Object.freeze({ x: -430, z: 20 });
const S10_SENTRY2 = Object.freeze({ x: -280, z: 50 });
/** Where the player stops behind the berm: this far back from its centre along its line (m), on the level past its back
 *  slope's foot (8 m), where the crest hides the loaner's hull and its turret clears it; climbing the slope, its nose
 *  rises over the crest and the hull shows (trainingThreat.selftest.mjs holds both). */
const S10_RING_BACK_M = 10;
const S10_LINE = (() => {
  const dx = S10_SENTRY2.x - S10_BERM.x, dz = S10_SENTRY2.z - S10_BERM.z, length = Math.hypot(dx, dz);
  return { x: dx / length, z: dz / length };
})();

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
  // the armour, fire and rounds scenes' targets (S5 to S8), chosen by the overlay's own bands for the loaner's rounds
  // (tutorial-journey evidence armour-bands-penverdict.txt: tools armour-map, the sim's aim query, penVerdict's bands, at
  // the placed ranges): a Leopard 2A4 at 30 degrees and 100 m shows the M1A1's APFSDS 58 % green and 47 % of its turret
  // front red, so one target gives a penetration and a bounce; HE paints it 89 % red. A BWP-1 at 60 degrees and 85 m
  // takes HE 79 % green: HE is for thin armour.
  // Marks from the whole-map probe of 2026-11-18 (evidence training-layout-full, tools s5-search, s5-route, s5-t2): the
  // ground hides Target 1 from every point of the meadow, and it stands 100 m from ring C on a clear line; trees hide
  // Target 2 from the meadow, ring C and bush D, and ring E sees it 85 m off.
  actors: Object.freeze([
    Object.freeze({ key: 'target1', specId: 'leo2a4', x: -350, z: -250, faces: 'ringC', presentDeg: 30 }),
    Object.freeze({ key: 'target2', specId: 'bwp1', x: -405, z: -75, faces: 'ringE', presentDeg: 60 }),
    // S9's Sentry (Kevin, 2026-11-18: option (a)): a T-72BU firing HEAT at the loaner's upper front plate. Its HEAT there
    // reads 1.01 (amber, a coin toss through the ±25 % penetration roll) with the hull square, and 0.82 (red, about one
    // round in seventeen) turned 35 degrees (evidence s9-angling-fit-penverdict.txt, penVerdict by import). 170 m north of
    // ring F on a line 2.5 m over the ground; the ground and the woods hide it from the meadow, ring C, bush D and ring E
    // (tools s9-search), so it is neither seen nor shot before its scene. It faces F nose on. It aims where the fit
    // measured: the upper front plate's centre, 2.94 m ahead of the hull's centre and 1 m up.
    Object.freeze({ key: 'sentry', specId: 't72bu_1989', x: -420, z: 120, faces: 'fireF', presentDeg: 0,
      volley: Object.freeze({ shellType: 'HEAT', firstS: 2.5, aim: Object.freeze({ alongM: 2.94, upM: 1.0 }) }) }),
    // S10's Sentry 2: a T-62MV whose APFSDS reads red on the loaner's turret front (0.78) and green on its upper hull
    // (1.34) at 160 m (evidence s10 fit), so the berm is what keeps the player's hull whole. 153 m east of the berm, the
    // line from it over the crest clear of the ground by 2.4 m elsewhere; the ground and woods hide it from every earlier
    // point, ring F among them (tools s10-search). It fires at the turret, the part a hull-down tank shows.
    Object.freeze({ key: 'sentry2', specId: 't62mv1', x: S10_SENTRY2.x, z: S10_SENTRY2.z, faces: 'ringG', presentDeg: 0,
      volley: Object.freeze({ shellType: 'APFSDS', firstS: 2.0, aim: Object.freeze({ alongM: 1.0, upM: 2.25 }) }) }),
  ]),
  // S10's berm: 1.9 m high across the line to Sentry 2, a gentle back slope (7 m) the player creeps up, a 2 m crest and a
  // steeper front; the M1A1's hull top stands about 1.6 m, its turret roof 2.4 m (tutorialGuideMath.ts EXPOSURE_POINTS)
  earthworks: Object.freeze([
    Object.freeze({ x: S10_BERM.x, z: S10_BERM.z, toward: 'sentry2', profile: Object.freeze([-8, 0, -1, 1.9, 1, 1.9, 4.5, 0]), halfWidthM: 7, skirtM: 2.5 }),
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
  /** S5 to S7: the firing point the spotting, armour and fire scenes play from, 107 m from ring B down the meadow's west
   *  bank (a 0.33 grade at most, no trunk or canopy on the line), 100 m from Target 1 with the line 1.5 m over the ground. */
  ringC: Object.freeze({ x: -360, z: -150, radiusM: 6 }),
  /** S5: the bush the player backs into (its canopy's centre; the ring inside its 5.3 m crown), 26 m from ring C, the trees
   *  between it and Target 1. */
  bushD: Object.freeze({ x: -380, z: -166, radiusM: 5 }),
  /** S8: the firing point for HE, 41 m west of ring C, the only one of the three that sees Target 2. */
  ringE: Object.freeze({ x: -400, z: -160, radiusM: 6 }),
  /** S9: where the player angles against the Sentry, 114 m north of ring E (122 m by the way through the bushes west of
   *  Target 2, no trunk on it): open for 8 m round, a grade under 0.07, the Sentry 170 m off. */
  fireF: Object.freeze({ x: -430, z: -50, radiusM: 6 }),
  /** S10: behind the berm (its centre 70 m north of ring F), the ring the player stops in, hull down to Sentry 2
   *  (tutorialGuideMath.ts trainingExposure). Set from the berm's line (S10_RING_BACK_M). */
  ringG: Object.freeze({ x: S10_BERM.x - S10_LINE.x * S10_RING_BACK_M, z: S10_BERM.z - S10_LINE.z * S10_RING_BACK_M, radiusM: 3 }),
});

/** An actor's rule by its scenes' name. */
export function trainingActor(rules: TrainingRules, key: string): TrainingActorRule | null {
  return rules.actors.find((actor) => actor.key === key) ?? null;
}

/** The point a scripted shooter lays its gun on: the player's hull (its origin and heading) and the volley's aim. Pure;
 *  `out` is written and returned. */
export function trainingVolleyAim(hull: { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number },
  volley: TrainingVolley, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const along = volley.aim.alongM;
  out.x = hull.x + Math.sin(hull.yaw) * along;
  out.y = hull.y + volley.aim.upM;
  out.z = hull.z + Math.cos(hull.yaw) * along;
  return out;
}

/** Whether a cued shooter's trigger is held at `timeS`: from `firstS` after its cue on (its loaded gun fires; the reload
 *  spaces the rounds). */
export function trainingVolleyFires(volley: TrainingVolley, cuedAtS: number, timeS: number): boolean {
  return timeS - cuedAtS >= volley.firstS;
}

/** The training roster after the player: each actor's tank, in order. */
export function trainingRoster(rules: TrainingRules): readonly string[] {
  return rules.actors.map((actor) => actor.specId);
}

const mark = (x: number, z: number, yawDeg: number): ProvingMark => Object.freeze({ x, z, yaw: yawDeg * DEG });

/** An actor's heading: its nose toward its firing point, turned by its presentation angle (deg). */
export function trainingActorYawDeg(actor: TrainingActorRule): number {
  const point = TRAINING_POINTS[actor.faces];
  const bearing = Math.atan2(point.x - actor.x, point.z - actor.z) / DEG;
  return bearing + actor.presentDeg;
}

/**
 * The training ground as a range layout: the start as its origin, each actor's mark as a lane (in roster order, so the
 * solo seating hands the n-th actor the n-th mark), no plates, and the earthworks the scenes stamp (S10's berm, as a
 * course stamp the solo setup raises in the ground overlay, game/state.ts).
 */
export function planTrainingRange(rules: TrainingRules): ProvingRangeLayout {
  const origin = mark(rules.start.x, rules.start.z, rules.start.yawDeg);
  const lanes: ProvingLaneMark[] = rules.actors.map((actor, index) => {
    const rangeM = Math.hypot(actor.x - origin.x, actor.z - origin.z);
    return Object.freeze({ ...mark(actor.x, actor.z, trainingActorYawDeg(actor)), index, rangeM, measuredM: rangeM,
      presentDeg: actor.presentDeg, lateralM: 0 });
  });
  const stamps: CourseStamp[] = rules.earthworks.map((work) => {
    const toward = trainingActor(rules, work.toward)!;
    const yaw = Math.atan2(toward.x - work.x, toward.z - work.z);
    return Object.freeze({ kind: 'course' as const, cx: work.x, cz: work.z, yaw, c: Math.cos(yaw), s: Math.sin(yaw), hw: work.halfWidthM,
      skirtM: work.skirtM, profile: new Float64Array(work.profile) });
  });
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
