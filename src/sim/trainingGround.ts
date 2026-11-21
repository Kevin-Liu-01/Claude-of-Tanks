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
  /** Where on the loaner's hull it aims (m): along the hull from its centre, up from its origin, and across it to the side
   *  that faces the shooter (S12: the running gear). */
  readonly aim: { readonly alongM: number; readonly upM: number; readonly acrossM?: number };
  /** Its trigger only while it sees the player's hull or turret over the ground (sim/trainingSight.ts): S11's Sentry 3
   *  fires at a tank that peeks out, never through the wall it hides behind. */
  readonly whenSeen?: boolean;
  /** S13's Bulwark: its gun laid by a turret that turns only this fast (deg/s), and its trigger only while the player
   *  stands inside this arc either side of its hull's nose (deg) and the gun is on the player. */
  readonly traverseDegPerS?: number;
  readonly frontArcDeg?: number;
  /** S13: its trigger only once the player has stood inside that arc this long (s), counted afresh each time in: a tank
   *  that clips the arc's edge on its way round is not shot for it (the end walk of 2026-11-20: one round on the way
   *  from U to V took 800 hit points and a crewman, and the flank could not be finished with the gun frozen). */
  readonly arcDwellS?: number;
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
  /** Parked out of the battle (no body, no shots, unseen) until its scene first cues it, then on its mark for good: a
   *  later scene's hull need not be hidden from the earlier scenes' ground. */
  readonly entersOnCue?: boolean;
  /** A scene's goal (its scene ends with it destroyed): once down it stays down, a wreck, where the ruleset's respawn
   *  brings the targets back for another shot. */
  readonly staysDown?: boolean;
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

/** A bot of S14's skirmish: its tank and its mark (deg yaw). */
export interface TrainingBotRule {
  readonly specId: string;
  readonly x: number;
  readonly z: number;
  readonly yawDeg: number;
}

/**
 * S14, the real fight: bots with their own brains under the normal rules, parked (each on its mark) until the scene's
 * cue, the allies on the player's side. The tutorial counts the enemies destroyed.
 */
export interface TrainingSkirmish {
  readonly allies: readonly TrainingBotRule[];
  readonly enemies: readonly TrainingBotRule[];
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
  /** S14's skirmish. */
  readonly skirmish: TrainingSkirmish;
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
/** S11's cover spot and Sentry 3 (tools s11-search: the line from Sentry 3 to the spot and to the peek beside it clear of
 *  the ground by 1.9 m), and the wall stamped between them. */
const S11_COVER = Object.freeze({ x: -320, z: 38 });
const S11_SENTRY3 = Object.freeze({ x: -220, z: -40 });
/** The wall stands this far in front of the cover spot toward Sentry 3 (m); the peek spot this far to the spot's side. */
const S11_WALL_AHEAD_M = 6;
const S11_PEEK_SIDE_M = 10;
const S11_LINE = (() => {
  const dx = S11_SENTRY3.x - S11_COVER.x, dz = S11_SENTRY3.z - S11_COVER.z, length = Math.hypot(dx, dz);
  return { x: dx / length, z: dz / length };
})();
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
    Object.freeze({ key: 'sentry2', specId: 't62mv1', x: S10_SENTRY2.x, z: S10_SENTRY2.z, faces: 'ringG', presentDeg: 0, staysDown: true,
      volley: Object.freeze({ shellType: 'APFSDS', firstS: 2.0, aim: Object.freeze({ alongM: 1.0, upM: 2.25 }) }) }),
    // S11's Sentry 3: an AMX-30B2 whose APFSDS goes through the loaner's upper hull about three times in five (1.06), a hit
    // a fifth of its health, on a 6 s reload. Parked until S11 cues it, it fires on every load whether it sees the player
    // or not, its rounds into the wall while the player hides: the rhythm the card teaches (peek just after it fires, back
    // before its ring fills). It fired only at what it saw before, so its gun stood loaded at every peek and shot first:
    // the end walk of 2026-11-20 took 65 rounds through the hull in one scene. 127 m from the cover spot.
    Object.freeze({ key: 'sentry3', specId: 'amx30b2', x: S11_SENTRY3.x, z: S11_SENTRY3.z, faces: 'ringP', presentDeg: 0, entersOnCue: true, staysDown: true,
      volley: Object.freeze({ shellType: 'APFSDS', firstS: 1.0, aim: Object.freeze({ alongM: 2.94, upM: 1.0 }) }) }),
    // S12's Sentry 4: a T-55A parked until the kit scene, firing HE at the running gear on the side the player shows it, each
    // time its gun loads, until a track is hit (the step stands it down). 76 m from ring Q, the peek spot the player stops
    // in, on a line 2.4 m over the ground with no trunk or canopy on it (tools s5-t2). Moved 3 m along its rise from
    // -260,-10, where its hull asked 5.8 degrees of depression for the tracks at ring Q, past the T-55A's 5: every round
    // flew over (the end walk of 2026-11-20). Here the live ground puts the ask near 1.2 degrees, the line to the tracks
    // 0.57 m clear (evidence ring-q-heights.json).
    Object.freeze({ key: 'sentry4', specId: 't55a', x: -263, z: -12, faces: 'ringQ', presentDeg: 0, entersOnCue: true,
      volley: Object.freeze({ shellType: 'HE', firstS: 2.5, aim: Object.freeze({ alongM: 0, upM: 0.45, acrossM: 1.55 }) }) }),
    // S13's Bulwark: an Object 477 whose front reads 75 % red to the loaner's APFSDS at 120 m and its side 80 % green
    // (evidence s13 fit). Parked until its scene on the open meadow, facing west; its turret turns 8 degrees a second and
    // it fires only into a 30 degree arc either side of its nose, its gun on the player, after a 1.5 s telegraph and once
    // the player has stood 2 s inside the arc. Ring U stands 45 degrees off its nose (outside the arc), ring V at its side;
    // a tank that swings wide south of U on its way to V crosses into the arc (27 degrees 25 m on), where the dwell spares it.
    Object.freeze({ key: 'bulwark', specId: 'object477_molot', x: -270, z: -125, faces: 'ringU', presentDeg: -45, entersOnCue: true, staysDown: true,
      volley: Object.freeze({ shellType: 'APFSDS', firstS: 1.5, whenSeen: true, traverseDegPerS: 8, frontArcDeg: 30, arcDwellS: 2,
        aim: Object.freeze({ alongM: 2.94, upM: 1.0 }) }) }),
  ]),
  // S14's skirmish (storyboard: two allies against three enemies, normal AI and rules): the allies on the meadow beside
  // ring V, where S13 ends; the enemies 260 m east on open ground (the whole-map probe: no canopy or obstacle within 5 m,
  // a grade under 0.12). Each tank is its own (a solo roster keys hulls by spec): none an actor's or the loaner.
  skirmish: Object.freeze({
    allies: Object.freeze([
      Object.freeze({ specId: 'm60a3', x: -245, z: -100, yawDeg: 90 }),
      Object.freeze({ specId: 'leo1a5dk', x: -240, z: -115, yawDeg: 90 }),
    ]),
    enemies: Object.freeze([
      Object.freeze({ specId: 'm48a5_patton', x: 20, z: -90, yawDeg: 270 }),
      Object.freeze({ specId: 'chieftain5', x: 30, z: -110, yawDeg: 270 }),
      Object.freeze({ specId: 'centurion5_2', x: 10, z: -60, yawDeg: 270 }),
    ]),
  }),
  // S10's berm: 1.9 m high across the line to Sentry 2, a gentle back slope (7 m) the player creeps up, a 2 m crest and a
  // steeper front; the M1A1's hull top stands about 1.6 m, its turret roof 2.4 m (sim/trainingSight.ts EXPOSURE_POINTS)
  earthworks: Object.freeze([
    Object.freeze({ x: S10_BERM.x, z: S10_BERM.z, toward: 'sentry2', profile: Object.freeze([-8, 0, -1, 1.9, 1, 1.9, 4.5, 0]), halfWidthM: 7, skirtM: 2.5 }),
    // S11's wall: 2.8 m high (over the loaner's 2.44 m), 1 m thick at its top, 10 m long across the line to Sentry 3, 6 m in
    // front of the cover spot; its end 5 m to the side, so a tank at the peek spot 10 m over stands clear of it
    Object.freeze({ x: S11_COVER.x + S11_LINE.x * S11_WALL_AHEAD_M, z: S11_COVER.z + S11_LINE.z * S11_WALL_AHEAD_M, toward: 'sentry3',
      profile: Object.freeze([-1.6, 0, -0.5, 2.8, 0.5, 2.8, 1.6, 0]), halfWidthM: 5, skirtM: 0.6 }),
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
  /** S8: the firing point for HE, 41 m west of ring C, the only one of the three that sees Target 2. Moved 5 m north onto
   *  ground the gun can lay from (the end walk of 2026-11-20: at -400,-160 the hull stood 11.6 degrees nose up on a hump,
   *  past the loaner's 10 degrees of depression, and every round flew over). The live ground sampler's heights put every
   *  stop within 4 m of it at 2.5 degrees of depression at most toward Target 2, the line 1.9 m over the ground and no
   *  trunk on it (evidence ring-e-heights.json, tools/ring-e-heights.mjs). */
  ringE: Object.freeze({ x: -401, z: -155, radiusM: 4 }),
  /** S9: where the player angles against the Sentry, 114 m north of ring E (122 m by the way through the bushes west of
   *  Target 2, no trunk on it): open for 8 m round, a grade under 0.07, the Sentry 170 m off. */
  fireF: Object.freeze({ x: -430, z: -50, radiusM: 6 }),
  /** S10: behind the berm (its centre 70 m north of ring F), the ring the player stops in, hull down to Sentry 2
   *  (sim/trainingSight.ts trainingExposure). Set from the berm's line (S10_RING_BACK_M). */
  ringG: Object.freeze({ x: S10_BERM.x - S10_LINE.x * S10_RING_BACK_M, z: S10_BERM.z - S10_LINE.z * S10_RING_BACK_M, radiusM: 3 }),
  /** S11: the cover spot behind the wall, and the peek spot beside it, out past the wall's end in Sentry 3's sight. */
  ringP: Object.freeze({ x: S11_COVER.x, z: S11_COVER.z, radiusM: 3 }),
  /** S13: 70 m from Bulwark, 45 degrees off its nose (outside its firing arc), where the player sees its front; and its
   *  side, 45 m off, where the loaner's APFSDS goes through. Lines from both clear the ground by 1.4 m; the way from ring Q
   *  to U and on to V has no trunk on it (tools route). */
  ringU: Object.freeze({ x: -319.5, z: -75.5, radiusM: 5 }),
  ringV: Object.freeze({ x: -270, z: -80, radiusM: 5 }),
  // (the side the search cleared: its line to Sentry 3 1.9 m over the ground)
  ringQ: Object.freeze({ x: S11_COVER.x + S11_LINE.z * S11_PEEK_SIDE_M, z: S11_COVER.z - S11_LINE.x * S11_PEEK_SIDE_M, radiusM: 3 }),
});

/** An actor's rule by its scenes' name. */
export function trainingActor(rules: TrainingRules, key: string): TrainingActorRule | null {
  return rules.actors.find((actor) => actor.key === key) ?? null;
}

/** The point a scripted shooter lays its gun on: the player's hull (its origin and heading) and the volley's aim. Pure;
 *  `out` is written and returned. */
export function trainingVolleyAim(hull: { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number },
  volley: TrainingVolley, out: { x: number; y: number; z: number },
  shooter: { readonly x: number; readonly z: number } | null = null): { x: number; y: number; z: number } {
  const along = volley.aim.alongM;
  // across: toward the shooter's side of the hull (its left is +x at a yaw of 0)
  const lx = Math.cos(hull.yaw), lz = -Math.sin(hull.yaw);
  const side = shooter && (shooter.x - hull.x) * lx + (shooter.z - hull.z) * lz < 0 ? -1 : 1;
  const across = (volley.aim.acrossM ?? 0) * side;
  out.x = hull.x + Math.sin(hull.yaw) * along + lx * across;
  out.y = hull.y + volley.aim.upM;
  out.z = hull.z + Math.cos(hull.yaw) * along + lz * across;
  return out;
}

/** A turret that turns at most `degPerS` toward `targetYaw` (rad) over `dt` (s), from `yaw`: its new yaw. Pure. */
export function trainingTraverse(yaw: number, targetYaw: number, dt: number, degPerS: number): number {
  const diff = Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw));
  const step = (degPerS * Math.PI / 180) * dt;
  return yaw + Math.max(-step, Math.min(step, diff));
}

/** Whether a shooter with a front arc may fire: the player inside the arc either side of its hull's nose, and its gun
 *  within 1.5 degrees of the player. Yaws in rad. */
export function trainingArcAllows(volley: TrainingVolley, hullYaw: number, gunYaw: number, bearing: number): boolean {
  if (volley.frontArcDeg == null) return true;
  const off = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) * 180 / Math.PI;
  return off(bearing, hullYaw) <= volley.frontArcDeg && off(bearing, gunYaw) <= 1.5;
}

/** Whether a cued shooter's trigger is held at `timeS`: from `firstS` after its cue on (its loaded gun fires; the reload
 *  spaces the rounds), and, for one that fires only at what it sees, while `seen`. */
export function trainingVolleyFires(volley: TrainingVolley, cuedAtS: number, timeS: number, seen = true): boolean {
  return timeS - cuedAtS >= volley.firstS && (!volley.whenSeen || seen);
}

/** Whether a shooter with an arc dwell may fire: the player inside its arc since `enteredS` (null: not inside), long
 *  enough (S13). A shooter without one fires as soon as the arc allows. */
export function trainingArcDwellMet(volley: TrainingVolley, enteredS: number | null, timeS: number): boolean {
  return enteredS !== null && timeS - enteredS >= (volley.arcDwellS ?? 0);
}

/** The training roster after the player: each actor's tank, then the skirmish's allies and enemies, in order. */
export function trainingRoster(rules: TrainingRules): readonly string[] {
  return [...rules.actors.map((actor) => actor.specId), ...rules.skirmish.allies.map((bot) => bot.specId),
    ...rules.skirmish.enemies.map((bot) => bot.specId)];
}

/** The cue that brings S14's skirmish in (a step's `cue`, game/state.ts cueTrainingActor). */
export const TRAINING_SKIRMISH_CUE = 'skirmish';

/**
 * Whether a training hull comes back after it is destroyed: the player, the targets and the shooters a later scene may
 * still need do; a scene's goal (`staysDown`) and S14's skirmish (its enemies are the fight's count) stay down.
 */
export function trainingRespawns(rules: TrainingRules, specId: string): boolean {
  if (trainingSkirmishSide(rules, specId)) return false;
  return !rules.actors.find((actor) => actor.specId === specId)?.staysDown;
}

/** Which side of S14's skirmish a tank fights on, or null for the scenes' hulls and the player. */
export function trainingSkirmishSide(rules: TrainingRules, specId: string): 'ally' | 'enemy' | null {
  return rules.skirmish.allies.some((bot) => bot.specId === specId) ? 'ally'
    : rules.skirmish.enemies.some((bot) => bot.specId === specId) ? 'enemy' : null;
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
  const lane = (x: number, z: number, yawDeg: number, presentDeg: number, index: number): ProvingLaneMark => {
    const rangeM = Math.hypot(x - origin.x, z - origin.z);
    return Object.freeze({ ...mark(x, z, yawDeg), index, rangeM, measuredM: rangeM, presentDeg, lateralM: 0 });
  };
  // in roster order (trainingRoster): the actors, then the skirmish's allies and enemies
  const bots = [...rules.skirmish.allies, ...rules.skirmish.enemies];
  const lanes: ProvingLaneMark[] = [
    ...rules.actors.map((actor, index) => lane(actor.x, actor.z, trainingActorYawDeg(actor), actor.presentDeg, index)),
    ...bots.map((bot, index) => lane(bot.x, bot.z, bot.yawDeg, 0, rules.actors.length + index)),
  ];
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
