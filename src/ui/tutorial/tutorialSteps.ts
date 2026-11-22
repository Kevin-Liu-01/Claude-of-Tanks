/**
 * tutorialSteps.ts — the first-game tutorial as data (272). Copyright © 2026 Kevin B. Liu.
 *
 * Every step is one record: its chapter, what it lights (a selector list; the first match that is on screen wins, so a
 * phone layout names its own control after the desktop's), its catalog title and body, an optional picture or loop,
 * what moves it on (the Next button, a press on the lit control, or the player doing the thing in battle), and an
 * optional input condition (a keyboard-and-mouse, touch or gamepad player sees the variant written for their hands).
 * tutorialRunner.ts plays a chapter's steps through tutorialOverlay.ts; no step has code of its own.
 *
 * Every claim in the training steps is checked against the simulation (tutorialSteps.selftest.mjs names the source of
 * each): the ricochet angles and slope exponents (sim/damage.ts), spotting and bushes (sim/spotting.ts), the training
 * ground's scenes (sim/trainingGround.ts).
 */
import type { ActionId } from '../../game/input.ts';
import type { TutorialChapter } from './tutorialRecord.ts';
import type { IconId } from '../icons/spriteIndex.ts';
import { TRAINING_POINTS, TRAINING_RULES, TRAINING_SKIRMISH_CUE, trainingActor } from '../../sim/trainingGround.ts';

/** Who the step is written for: a keyboard-and-mouse player, a touch layout, a connected gamepad. Absent: everyone. */
export type TutorialInput = 'keyboard' | 'touch' | 'pad';

/** What moves a step on. */
type ModuleState = 'ok' | 'yellow' | 'red';

export type TutorialAdvance =
  | { readonly on: 'next' }
  /** A press on the lit control itself. `own`: the press is the tutorial's, and the control's own action never runs (274:
   *  the Garage chapter's Deploy launches the training battle, not the battle the Garage has picked). */
  | { readonly on: 'press'; readonly own?: boolean }
  /** The player's tank has driven this far from where the step began. */
  | { readonly on: 'drive'; readonly metres: number }
  /** The player fired. */
  | { readonly on: 'fire' }
  /** The player loaded a different shell (273: or this one, by its type: 'HEAT', 'HE'). */
  | { readonly on: 'shell'; readonly type?: string }
  // ── 273: the training battle's kinds (each heard on the bus or read from the port; tutorialRunner.ts arm) ──────────
  /** The player's tank stands inside the step's guide marker (its ring's radius, or this one). */
  | { readonly on: 'reach'; readonly radiusM?: number }
  /** The player's view: the third-person camera or the gunner's sight (at least this zoom); no mode takes either. */
  | { readonly on: 'camera'; readonly mode?: 'third' | 'sight'; readonly zoomAtLeast?: number }
  /** The player stands still inside the step's guide marker (a bush) this long. */
  | { readonly on: 'hidden'; readonly stillS: number }
  /** The gun points at the step's guide marker (its bearing within the tolerance), held this long. */
  | { readonly on: 'turret'; readonly toleranceDeg: number; readonly holdS: number }
  /** The armour colours turned off, then on again (the H key's ui:armorOverlayState, or the Settings row; colours that stood
   *  off need only the press that brings them back). */
  | { readonly on: 'armourCycle' }
  /** Hits of these kinds (sim/damage.ts HitEvent kind): by the player on an actor, or by an actor on the player. */
  | { readonly on: 'hit'; readonly kinds: readonly string[]; readonly by: 'player' | 'actor'; readonly actor?: string; readonly count?: number }
  /** The player used this consumable (sim/consumableRules.ts id). */
  | { readonly on: 'consumable'; readonly item: string }
  /** A module of the player's tank reaches one of these states (module:state): one module, or any of several. */
  | { readonly on: 'module'; readonly module: string | readonly string[]; readonly state: ModuleState | readonly ModuleState[] }
  /** The player popped smoke (auxiliary:smokeScreens: in a training battle only the player can). */
  | { readonly on: 'smoke' }
  /** The player's side spotted this actor. */
  | { readonly on: 'spot'; readonly actor: string }
  /** This actor is destroyed. */
  | { readonly on: 'destroy'; readonly actor: string }
  /** The player's hull stands turned from the line to this actor between the two angles (deg, 0 nose on), this long. */
  | { readonly on: 'angle'; readonly actor: string; readonly minDeg: number; readonly maxDeg: number; readonly holdS: number }
  /** The player's hull is hidden from this actor and its turret seen over the ground (sim/trainingSight.ts
   *  trainingExposure: hull down), this long. */
  | { readonly on: 'hullDown'; readonly actor: string; readonly holdS: number }
  /** Peek, shoot, hide (S11): the player fires while this actor sees it, then gets out of its sight, this many times. */
  | { readonly on: 'peek'; readonly actor: string; readonly cycles: number }
  /** Every one of these hulls destroyed, each counted once (S14: the skirmish's enemies). */
  | { readonly on: 'destroyAll'; readonly actors: readonly string[] };

/**
 * A step's guidance over the battle (tutorialGuide.ts draws it): a marker to drive to, the path toward it, an actor to
 * look at, the HUD controls to press, and the plate to aim at once the step falls behind. Labels are catalog keys.
 * World points are metres on the battlefield's ground plane.
 */
export interface TutorialGuideSpec {
  readonly marker?: { readonly x: number; readonly z: number; readonly radiusM: number; readonly label: string };
  readonly path?: boolean;
  readonly actor?: { readonly id: string; readonly label: string };
  /** HUD controls, as a step's target: the first that is on screen gets the chevron. */
  readonly hud?: readonly string[];
  /** A point in the actor's own frame (tutorialGuideMath.ts actorPoint): along its hull, up, and across it (+ its left). */
  readonly aimAt?: { readonly id: string; readonly along: number; readonly up: number; readonly across: number };
  /** S9: the angling arc round the player against a scripted shooter (its battle id), in its reticle's colours. */
  readonly angle?: { readonly id: string };
  /** S10: the player's hull and turret over its tank, each lit while this actor can see it (trainingExposure). */
  readonly exposure?: { readonly id: string };
  /** S11: this actor's reload, a ring over it that fills as its gun loads (full: it can fire). */
  readonly reload?: { readonly id: string };
}

export interface TutorialMedia {
  /** Served from public/: a still (.webp) or a short muted loop (.webm or .mp4). */
  readonly src: string;
  readonly kind: 'image' | 'video';
  /** The loop's first frame, shown until it plays (and instead of it under reduced motion). */
  readonly poster?: string;
}

export interface TutorialStep {
  readonly id: string;
  /** (274, Kevin: "the tutorial cards could have the corresponding icon in them") the shared icon of what the step teaches
   *  or shows (ui/icons/spriteIndex.ts), beside its title. */
  readonly icon: IconId;
  readonly chapter: TutorialChapter;
  /** CSS selectors, in order; the first that matches a visible element is lit. Empty: the card alone. */
  readonly target: readonly string[];
  readonly title: string;
  readonly body: string;
  /** Key caps the body names: placeholder → action (its current binding, or its pad button with a pad connected). */
  readonly keys?: Readonly<Record<string, ActionId>>;
  readonly media?: TutorialMedia;
  readonly advance: TutorialAdvance;
  readonly when?: TutorialInput | readonly TutorialInput[];
  /** Dim the rest of the screen (default true). Battle steps the player acts on keep the field clear. */
  readonly dim?: boolean;
  /** Where the card stands: the middle of the screen (default) or the upper band, clear of the sight. */
  readonly card?: 'middle' | 'upper';
  /** The guidance over the battle (273): marker, path, actor bracket, HUD chevron, aim ghost. */
  readonly guide?: TutorialGuideSpec;
  /** The step's advance counts only once the player has reached its guide marker, which is then the checkpoint: a drive
   *  to a ring and what the player does there on one card. */
  readonly arrive?: boolean;
  /** Seconds before the step counts as fallen behind and the guide escalates (the aim ghost shows). */
  readonly behindS?: number;
  /** A subject a step teaches that another surface would otherwise teach (274: the armour colours' one-time tip,
   *  game/armourOverlayDefault.ts): shown here, the other stands down. */
  readonly teaches?: 'armourColours';
  /** A training battle's scripted shooter (its scenes' name, sim/trainingGround.ts) that fires while the step shows (273). */
  readonly cue?: string;
  /** The body shown once the step's actor puts a round through the player (S9: the hull was square again). */
  readonly penBody?: string;
  /** The body's figures from the run that led here (the debrief: the training battle's time, shots, hits, kills). */
  readonly params?: 'trainingSummary';
  /** A checklist under the body (the debrief: the training battle's lessons, each ticked or not). */
  readonly checklist?: 'trainingLessons';
  /** The Next button's words (a catalog key) where the step's own fit better ("Show me around"). */
  readonly nextLabel?: string;
  /** The Skip button's words (a catalog key) where the step's own fit better (274: the offer's "Not now"). */
  readonly skipLabel?: string;
}

/** An in-engine loop the Studio filmed for the tutorial (tools/tutorial-media.mjs; public/media/tutorial-r1). */
const loop = (id: string): TutorialMedia => ({ src: `/media/tutorial-r1/${id}.webm`, kind: 'video', poster: `/media/tutorial-r1/${id}.webp` });
const NEXT = { on: 'next' } as const;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  // ── The Garage, on the first visit (Kevin, 2026-11-20: "shorter and fewer"): the tank and its nation on one card, the
  // rounds, Deploy; the kit and the camouflage are met where they are used. Deploy's press is the tutorial's: it launches
  // the training battle (274, Kevin: "Deploy launches the training battle"), which replaces 272's first-battle chapter ──
  { id: 'garage.tank', icon: 'garage', chapter: 'garage', target: ['.cot-carousel', '[data-tabbar="garage"]'],
    title: 'tutorial.garage.tank.title', body: 'tutorial.garage.tank.body', advance: NEXT },
  // (where the dossier keeps the shells on its Firepower tab, as at 1440x900, the tab is lit: the card never stands alone)
  { id: 'garage.ammo', icon: 'shell', chapter: 'garage', when: ['keyboard', 'pad'], target: ['.cot-ammo-tiles', '.cot-station[data-station="firepower"]'],
    title: 'tutorial.garage.ammo.title', body: 'tutorial.garage.ammo.body', advance: NEXT,
    keys: { shell1: 'shell1', shell2: 'shell2', shell3: 'shell3' } },
  // a phone's dossier opens on its headline strip: the shells are a swipe along it
  { id: 'garage.ammoTouch', icon: 'shell', chapter: 'garage', when: 'touch', target: ['.cot-ammo-tiles', '.cot-overview-section'],
    title: 'tutorial.garage.ammo.title', body: 'tutorial.garage.ammo.bodyTouch', advance: NEXT },
  { id: 'garage.deploy', icon: 'deploy', chapter: 'garage', target: ['.cot-battle', '[data-tabbar="deploy"]'],
    title: 'tutorial.garage.deploy.title', body: 'tutorial.garage.deploy.body', advance: { on: 'press', own: true } },

  // ── The offer (274): a returning player's Garage, once (ui/tutorial/tutorialRecord.ts): the tutorial, offered (Kevin:
  // "the guided training battle IS the tutorial. there is only ONE tutorial"); Start goes straight to its training battle,
  // Not now puts it away ────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'offer.training', icon: 'manual', chapter: 'offer', target: [], media: loop('angle'), title: 'tutorial.offer.title', body: 'tutorial.offer.body',
    nextLabel: 'tutorial.offer.start', skipLabel: 'tutorial.offer.later', advance: NEXT },
];

// ── The training battle (273): scenes S1 to S4 (storyboard §2.4) ────────────────────────────────────────────────────
// Every marker is a named point of the training ground (sim/trainingGround.ts TRAINING_POINTS), never a literal here.
const marker = (point: { readonly x: number; readonly z: number; readonly radiusM: number }, label: string) =>
  ({ x: point.x, z: point.z, radiusM: point.radiusM, label }) as const;
const PLAY = { dim: false, card: 'upper' } as const;
/** The scenes' targets by their battle ids (a solo roster keys hulls by spec: sim/trainingGround.ts). */
const TARGET1 = trainingActor(TRAINING_RULES, 'target1')!.specId;
const TARGET2 = trainingActor(TRAINING_RULES, 'target2')!.specId;
const SENTRY = trainingActor(TRAINING_RULES, 'sentry')!.specId;
const SENTRY2 = trainingActor(TRAINING_RULES, 'sentry2')!.specId;
const SENTRY3 = trainingActor(TRAINING_RULES, 'sentry3')!.specId;
const SENTRY4 = trainingActor(TRAINING_RULES, 'sentry4')!.specId;
const BULWARK = trainingActor(TRAINING_RULES, 'bulwark')!.specId;
/** S9's window: the hull turned between these from the line to the Sentry, where its HEAT on the loaner's front plate
 *  reads red (32 to 62 degrees at ring F, sim/trainingThreat.ts; tutorialSteps.selftest.mjs holds it). */
export const ANGLE_WINDOW = Object.freeze({ minDeg: 35, maxDeg: 55 });
/** The Sentry's rounds the plate holds, and the one it lets through. */
const HELD = ['ricochet', 'nonpen', 'spaced_absorb'] as const;
/** Where on Target 1 the aim ghost stands (tutorialGuideMath.ts actorPoint: along its hull, up, across): the hull side it
 *  shows ring C, green to the loaner's APFSDS from anywhere in the ring, and the turret front, red from there
 *  (trainingThreat.selftest.mjs holds both). The low hull front it named before read red from ring C (0.65 to 0.75: the
 *  end walk of 2026-11-20 put eleven rounds into it without one going through). */
const TARGET1_GREEN = { along: 0, up: 1.2, across: -1.2 } as const;
const TARGET1_RED = { along: 1.2, up: 2.3, across: 0.4 } as const;

export const TRAINING_STEPS: readonly TutorialStep[] = [
  // (Kevin, 2026-11-20: "both of these actually": shorter cards and fewer of them.) A "do X" is one compact card with no
  // card before it, a drive to a ring and what the player does there are one card (`arrive`), and a card whose lesson the
  // ring, arrow or bracket already shows is gone: 45 cards became 22.
  // S2: drive to ring B (ring A on the way)
  { id: 'training.drive', icon: 'moveForward', chapter: 'training', when: 'keyboard', target: [], ...PLAY,
    title: 'tutorial.training.drive.title', body: 'tutorial.training.drive.body', advance: { on: 'reach' }, behindS: 50,
    keys: { forward: 'forward', left: 'left', right: 'right' },
    guide: { marker: marker(TRAINING_POINTS.driveB, 'tutorial.training.marker.b'), path: true } },
  { id: 'training.driveTouch', icon: 'moveForward', chapter: 'training', when: 'touch', target: [], ...PLAY,
    title: 'tutorial.training.drive.title', body: 'tutorial.training.drive.bodyTouch', advance: { on: 'reach' }, behindS: 50,
    guide: { marker: marker(TRAINING_POINTS.driveB, 'tutorial.training.marker.b'), path: true, hud: ['.cot-touch .joy'] } },
  { id: 'training.drivePad', icon: 'moveForward', chapter: 'training', when: 'pad', target: [], ...PLAY,
    title: 'tutorial.training.drive.title', body: 'tutorial.training.drive.bodyPad', advance: { on: 'reach' }, behindS: 50,
    guide: { marker: marker(TRAINING_POINTS.driveB, 'tutorial.training.marker.b'), path: true } },
  // S3: the turret turns apart from the hull
  { id: 'training.turret', icon: 'turretRing', chapter: 'training', when: 'keyboard', target: [], ...PLAY,
    title: 'tutorial.training.turret.title', body: 'tutorial.training.turret.body', advance: { on: 'turret', toleranceDeg: 8, holdS: 1 },
    keys: { left: 'left', right: 'right' }, guide: { marker: marker(TRAINING_POINTS.board, 'tutorial.training.marker.board') } },
  { id: 'training.turretTouch', icon: 'turretRing', chapter: 'training', when: 'touch', target: [], ...PLAY,
    title: 'tutorial.training.turret.title', body: 'tutorial.training.turret.bodyTouch', advance: { on: 'turret', toleranceDeg: 8, holdS: 1 },
    guide: { marker: marker(TRAINING_POINTS.board, 'tutorial.training.marker.board') } },
  { id: 'training.turretPad', icon: 'turretRing', chapter: 'training', when: 'pad', target: [], ...PLAY,
    title: 'tutorial.training.turret.title', body: 'tutorial.training.turret.bodyPad', advance: { on: 'turret', toleranceDeg: 8, holdS: 1 },
    guide: { marker: marker(TRAINING_POINTS.board, 'tutorial.training.marker.board') } },
  // S4: the gunner's sight and its zoom on one card (a pad has no zoom binding until the controller-parity slice: the sight)
  { id: 'training.zoom', icon: 'scope', chapter: 'training', when: 'keyboard', target: [], ...PLAY,
    title: 'tutorial.training.zoom.title', body: 'tutorial.training.zoom.body', advance: { on: 'camera', mode: 'sight', zoomAtLeast: 8 },
    keys: { sight: 'sniperToggle' } },
  { id: 'training.zoomTouch', icon: 'scope', chapter: 'training', when: 'touch', target: [], ...PLAY,
    title: 'tutorial.training.zoom.title', body: 'tutorial.training.zoom.bodyTouch', advance: { on: 'camera', mode: 'sight', zoomAtLeast: 8 },
    guide: { hud: ['.cot-touch .round.scope'] } },
  { id: 'training.zoomPad', icon: 'scope', chapter: 'training', when: 'pad', target: [], ...PLAY,
    title: 'tutorial.training.zoom.title', body: 'tutorial.training.zoom.bodyPad', advance: { on: 'camera', mode: 'sight' },
    keys: { sight: 'sniperToggle' } },

  // S5: spotting. Target 1 waits beyond the loaner's sight; ring C brings it inside
  { id: 'training.spot', icon: 'optics', chapter: 'training', target: [], ...PLAY, behindS: 60,
    title: 'tutorial.training.spot.title', body: 'tutorial.training.spot.body', advance: { on: 'spot', actor: TARGET1 },
    guide: { marker: marker(TRAINING_POINTS.ringC, 'tutorial.training.marker.c'), path: true } },
  // S6: the armour colours (on by default since 273), read through the sight from ring C (the spot can come before the
  // ring, and a tank that rolls on past it drops where the ground hides Target 1: the end walk of 2026-11-20); a keyboard
  // turns them off and on with its own key, a touch layout and a pad (no toggle of their own until the controller-parity
  // item) read the Settings row
  { id: 'training.armourSight', icon: 'scope', chapter: 'training', when: ['keyboard', 'pad'], target: [], ...PLAY, arrive: true,
    title: 'tutorial.training.armourSight.title', body: 'tutorial.training.armourSight.body', advance: { on: 'camera', mode: 'sight' },
    keys: { sight: 'sniperToggle' }, guide: { marker: marker(TRAINING_POINTS.ringC, 'tutorial.training.marker.c'), path: true,
      actor: { id: TARGET1, label: 'tutorial.training.actor.target1' } } },
  { id: 'training.armourSightTouch', icon: 'scope', chapter: 'training', when: 'touch', target: [], ...PLAY, arrive: true,
    title: 'tutorial.training.armourSight.title', body: 'tutorial.training.armourSight.bodyTouch', advance: { on: 'camera', mode: 'sight' },
    guide: { marker: marker(TRAINING_POINTS.ringC, 'tutorial.training.marker.c'), path: true,
      actor: { id: TARGET1, label: 'tutorial.training.actor.target1' }, hud: ['.cot-touch .round.scope'] } },
  { id: 'training.armour', icon: 'layerArmor', chapter: 'training', when: 'keyboard', target: [], ...PLAY, teaches: 'armourColours',
    title: 'tutorial.training.armour.title', body: 'tutorial.training.armour.body', advance: { on: 'armourCycle' },
    keys: { toggle: 'hitboxOverlay' }, guide: { actor: { id: TARGET1, label: 'tutorial.training.actor.target1' } } },
  { id: 'training.armourTouch', icon: 'layerArmor', chapter: 'training', when: ['touch', 'pad'], target: [], ...PLAY, teaches: 'armourColours',
    title: 'tutorial.training.armour.title', body: 'tutorial.training.armour.bodySettings', advance: NEXT,
    guide: { actor: { id: TARGET1, label: 'tutorial.training.actor.target1' } } },
  // S7: aim and fire: a penetration on green, then a bounce off red (the shot card names each; the reload ring shows itself)
  { id: 'training.firePen', icon: 'penetration', chapter: 'training', when: ['keyboard', 'pad'], target: [], ...PLAY, behindS: 45,
    title: 'tutorial.training.firePen.title', body: 'tutorial.training.firePen.body',
    advance: { on: 'hit', by: 'player', actor: TARGET1, kinds: ['pen', 'he_pen'] }, keys: { fire: 'fire' },
    guide: { actor: { id: TARGET1, label: 'tutorial.training.actor.target1' }, aimAt: { id: TARGET1, ...TARGET1_GREEN } } },
  { id: 'training.firePenTouch', icon: 'penetration', chapter: 'training', when: 'touch', target: [], ...PLAY, behindS: 45,
    title: 'tutorial.training.firePen.title', body: 'tutorial.training.firePen.bodyTouch',
    advance: { on: 'hit', by: 'player', actor: TARGET1, kinds: ['pen', 'he_pen'] },
    guide: { actor: { id: TARGET1, label: 'tutorial.training.actor.target1' }, aimAt: { id: TARGET1, ...TARGET1_GREEN }, hud: ['.cot-touch .round.fire'] } },
  { id: 'training.fireBounce', icon: 'ricochet', chapter: 'training', target: [], ...PLAY, behindS: 45,
    title: 'tutorial.training.fireBounce.title', body: 'tutorial.training.fireBounce.body',
    advance: { on: 'hit', by: 'player', actor: TARGET1, kinds: ['ricochet', 'nonpen'] },
    guide: { actor: { id: TARGET1, label: 'tutorial.training.actor.target1' }, aimAt: { id: TARGET1, ...TARGET1_RED } } },
  // the shots gave the player away (Target 1 sees it from ring C, so the lamp is lit): out of its sight into bush D, on the
  // way to ring E (the trees between)
  { id: 'training.bush', icon: 'statusConcealed', chapter: 'training', target: [], ...PLAY, behindS: 45,
    title: 'tutorial.training.bush.title', body: 'tutorial.training.bush.body', advance: { on: 'hidden', stillS: 3 },
    guide: { marker: marker(TRAINING_POINTS.bushD, 'tutorial.training.marker.d'), path: true, hud: ['.cot-sixth'] } },
  // S8: the right round: HE through the BWP-1's thin skin, seen only from ring E past the trees
  { id: 'training.fireHE', icon: 'shellHe', chapter: 'training', when: ['keyboard', 'pad'], target: [], ...PLAY, behindS: 60,
    title: 'tutorial.training.fireHE.title', body: 'tutorial.training.fireHE.body',
    advance: { on: 'hit', by: 'player', actor: TARGET2, kinds: ['he_pen', 'pen', 'he_splash'] }, keys: { he: 'shell3' },
    guide: { marker: marker(TRAINING_POINTS.ringE, 'tutorial.training.marker.e'), path: true, hud: ['.cot-shells'],
      actor: { id: TARGET2, label: 'tutorial.training.actor.target2' } } },
  { id: 'training.fireHETouch', icon: 'shellHe', chapter: 'training', when: 'touch', target: [], ...PLAY, behindS: 60,
    title: 'tutorial.training.fireHE.title', body: 'tutorial.training.fireHE.bodyTouch',
    advance: { on: 'hit', by: 'player', actor: TARGET2, kinds: ['he_pen', 'pen', 'he_splash'] },
    guide: { marker: marker(TRAINING_POINTS.ringE, 'tutorial.training.marker.e'), path: true, hud: ['.cot-shells'],
      actor: { id: TARGET2, label: 'tutorial.training.actor.target2' } } },
  // S9: angling under fire (Kevin, 2026-11-18, option (a)). The Sentry, a T-72BU, waits 170 m past ring F out of sight of
  // every earlier scene; the arc round the player shows its HEAT on the player's front plate at each heading, in its
  // reticle's colours: amber square on, red from 32 degrees. At ring F, turned and held, the player takes its real rounds.
  { id: 'training.angle', icon: 'shield', chapter: 'training', target: [], ...PLAY, behindS: 60, arrive: true,
    title: 'tutorial.training.angle.title', body: 'tutorial.training.angle.body',
    advance: { on: 'angle', actor: SENTRY, ...ANGLE_WINDOW, holdS: 2 },
    guide: { marker: marker(TRAINING_POINTS.fireF, 'tutorial.training.marker.f'), path: true,
      actor: { id: SENTRY, label: 'tutorial.training.actor.sentry' }, angle: { id: SENTRY } } },
  { id: 'training.volley', icon: 'blocked', chapter: 'training', target: [], ...PLAY, cue: 'sentry', penBody: 'tutorial.training.volley.square',
    title: 'tutorial.training.volley.title', body: 'tutorial.training.volley.body',
    advance: { on: 'hit', by: 'actor', actor: SENTRY, kinds: HELD, count: 2 },
    guide: { actor: { id: SENTRY, label: 'tutorial.training.actor.sentry' }, angle: { id: SENTRY } } },
  // S10: hull down. A 1.9 m berm stands across the line to Sentry 2, a T-62MV whose APFSDS goes through the loaner's hull
  // and not its turret; behind it the hull is hidden and the turret clears the top. The shape over the player's tank lights
  // what Sentry 2 sees; it fires at the turret, then the player loads APFSDS again and fires back.
  { id: 'training.hullDown', icon: 'altitude', chapter: 'training', target: [], ...PLAY, behindS: 60, arrive: true,
    title: 'tutorial.training.hullDown.title', body: 'tutorial.training.hullDown.body', advance: { on: 'hullDown', actor: SENTRY2, holdS: 2 },
    guide: { actor: { id: SENTRY2, label: 'tutorial.training.actor.sentry2' }, exposure: { id: SENTRY2 },
      marker: marker(TRAINING_POINTS.ringG, 'tutorial.training.marker.g'), path: true } },
  { id: 'training.hullDownFire', icon: 'blocked', chapter: 'training', target: [], ...PLAY, cue: 'sentry2', penBody: 'tutorial.training.hullDownFire.exposed',
    title: 'tutorial.training.hullDownFire.title', body: 'tutorial.training.hullDownFire.body',
    advance: { on: 'hit', by: 'actor', actor: SENTRY2, kinds: HELD, count: 2 },
    guide: { actor: { id: SENTRY2, label: 'tutorial.training.actor.sentry2' }, exposure: { id: SENTRY2 } } },
  { id: 'training.fireBack', icon: 'fireGun', chapter: 'training', when: ['keyboard', 'pad'], target: [], ...PLAY, cue: 'sentry2', behindS: 60,
    title: 'tutorial.training.fireBack.title', body: 'tutorial.training.fireBack.body', advance: { on: 'destroy', actor: SENTRY2 },
    keys: { ap: 'shell1', fire: 'fire' },
    guide: { actor: { id: SENTRY2, label: 'tutorial.training.actor.sentry2' }, exposure: { id: SENTRY2 }, hud: ['.cot-shells'] } },
  { id: 'training.fireBackTouch', icon: 'fireGun', chapter: 'training', when: 'touch', target: [], ...PLAY, cue: 'sentry2', behindS: 60,
    title: 'tutorial.training.fireBack.title', body: 'tutorial.training.fireBack.bodyTouch', advance: { on: 'destroy', actor: SENTRY2 },
    guide: { actor: { id: SENTRY2, label: 'tutorial.training.actor.sentry2' }, exposure: { id: SENTRY2 }, hud: ['.cot-shells', '.cot-touch .round.fire'] } },
  // S11: peek, shoot, hide. A 2.8 m wall is stamped in front of ring P; Sentry 3 (parked until now) waits past it and
  // fires only at what it sees, each time its gun is loaded (the ring over it). The player pulls out to ring Q, fires,
  // and backs into cover before that ring fills, until it is destroyed.
  { id: 'training.toP', icon: 'map', chapter: 'training', target: [], ...PLAY, behindS: 40,
    title: 'tutorial.training.toP.title', body: 'tutorial.training.toP.body', advance: { on: 'reach' },
    guide: { marker: marker(TRAINING_POINTS.ringP, 'tutorial.training.marker.p'), path: true } },
  { id: 'training.peekShoot', icon: 'reload', chapter: 'training', target: [], ...PLAY, cue: 'sentry3', penBody: 'tutorial.training.peekShoot.caught', behindS: 90,
    title: 'tutorial.training.peekShoot.title', body: 'tutorial.training.peekShoot.body', advance: { on: 'destroy', actor: SENTRY3 },
    guide: { marker: marker(TRAINING_POINTS.ringQ, 'tutorial.training.marker.q'), actor: { id: SENTRY3, label: 'tutorial.training.actor.sentry3' },
      reload: { id: SENTRY3 } } },
  // S12: the kit. Out at ring Q, Sentry 4 (parked until now) fires HE at the running gear until a track is hit; the repair
  // kit mends it (the card names the other two kits beside it), and smoke is popped once
  { id: 'training.repair', icon: 'repair', chapter: 'training', when: ['keyboard', 'pad'], target: [], ...PLAY, cue: 'sentry4', behindS: 60, arrive: true,
    title: 'tutorial.training.repair.title', body: 'tutorial.training.repair.body', advance: { on: 'consumable', item: 'repair' },
    keys: { repair: 'consumable1' }, guide: { marker: marker(TRAINING_POINTS.ringQ, 'tutorial.training.marker.q'), path: true,
      actor: { id: SENTRY4, label: 'tutorial.training.actor.sentry4' }, hud: ['.cot-cons'] } },
  { id: 'training.repairTouch', icon: 'repair', chapter: 'training', when: 'touch', target: [], ...PLAY, cue: 'sentry4', behindS: 60, arrive: true,
    title: 'tutorial.training.repair.title', body: 'tutorial.training.repair.bodyTouch', advance: { on: 'consumable', item: 'repair' },
    guide: { marker: marker(TRAINING_POINTS.ringQ, 'tutorial.training.marker.q'), path: true,
      actor: { id: SENTRY4, label: 'tutorial.training.actor.sentry4' }, hud: ['.cot-cons'] } },
  // (a pad has no smoke button until the controller-parity item binds one: its players meet smoke there)
  { id: 'training.smoke', icon: 'smoke', chapter: 'training', when: 'keyboard', target: [], ...PLAY,
    title: 'tutorial.training.smoke.title', body: 'tutorial.training.smoke.body', advance: { on: 'smoke' }, keys: { smoke: 'smoke' } },
  { id: 'training.smokeTouch', icon: 'smoke', chapter: 'training', when: 'touch', target: [], ...PLAY,
    title: 'tutorial.training.smoke.title', body: 'tutorial.training.smoke.bodyTouch', advance: { on: 'smoke' } },
  // S13: flank the heavy. Bulwark (parked until now) stands on the meadow; its front is red to the loaner's rounds, its turret
  // turns slowly and it fires only into the arc before its nose. Ring U shows its front from outside that arc; ring V is its
  // side, where a round goes through.
  { id: 'training.toU', icon: 'map', chapter: 'training', target: [], ...PLAY, cue: 'bulwark', behindS: 60,
    title: 'tutorial.training.toU.title', body: 'tutorial.training.toU.body', advance: { on: 'reach' },
    guide: { marker: marker(TRAINING_POINTS.ringU, 'tutorial.training.marker.u'), path: true, actor: { id: BULWARK, label: 'tutorial.training.actor.bulwark' } } },
  { id: 'training.flank', icon: 'roleFlanker', chapter: 'training', target: [], ...PLAY, cue: 'bulwark', behindS: 90, arrive: true,
    title: 'tutorial.training.flank.title', body: 'tutorial.training.flank.body', advance: { on: 'destroy', actor: BULWARK },
    guide: { marker: marker(TRAINING_POINTS.ringV, 'tutorial.training.marker.v'), path: true, actor: { id: BULWARK, label: 'tutorial.training.actor.bulwark' } } },
  // S14: the real fight. Two allied bots beside the player and three enemy bots 260 m east, normal brains and rules, come in
  // on the cue; the guidance falls away, and the chapter (and the battle) ends once every enemy bot is destroyed
  { id: 'training.fight', icon: 'team', chapter: 'training', target: [], ...PLAY, cue: TRAINING_SKIRMISH_CUE,
    title: 'tutorial.training.fight.title', body: 'tutorial.training.fight.body',
    advance: { on: 'destroyAll', actors: TRAINING_RULES.skirmish.enemies.map((bot) => bot.specId) } },
];

// ── After the training battle (273): the debrief on the Garage, then the five-stop tour and the close ───────────────
/**
 * The training battle's twelve lessons (storyboard §6.1), each proved by the step that ends it: the debrief's checklist
 * ticks a lesson whose proof the player got past (a hand's variant of the step counts: Touch, Pad).
 */
export const TRAINING_LESSONS: ReadonlyArray<{ readonly id: string; readonly label: string; readonly proof: string }> = Object.freeze([
  { id: 'drive', label: 'tutorial.lesson.drive', proof: 'training.drive' },
  { id: 'look', label: 'tutorial.lesson.look', proof: 'training.zoom' },
  { id: 'spot', label: 'tutorial.lesson.spot', proof: 'training.bush' },
  { id: 'armour', label: 'tutorial.lesson.armour', proof: 'training.armour' },
  { id: 'fire', label: 'tutorial.lesson.fire', proof: 'training.fireBounce' },
  { id: 'rounds', label: 'tutorial.lesson.rounds', proof: 'training.fireHE' },
  { id: 'angle', label: 'tutorial.lesson.angle', proof: 'training.volley' },
  { id: 'hullDown', label: 'tutorial.lesson.hullDown', proof: 'training.hullDownFire' },
  { id: 'peek', label: 'tutorial.lesson.peek', proof: 'training.peekShoot' },
  { id: 'kit', label: 'tutorial.lesson.kit', proof: 'training.repair' },
  { id: 'flank', label: 'tutorial.lesson.flank', proof: 'training.flank' },
  { id: 'fight', label: 'tutorial.lesson.fight', proof: 'training.fight' },
].map((lesson) => Object.freeze(lesson)));

/** A tour stop: its nav control lit on every layout (the desktop bar, the phone's menu, the tab bar). */
const STOP = (id: string, icon: IconId, target: readonly string[]): TutorialStep =>
  ({ id: `tour.${id}`, icon, chapter: 'tour', target, title: `tutorial.tour.${id}.title`, body: `tutorial.tour.${id}.body`, advance: NEXT });

export const AFTER_TRAINING_STEPS: readonly TutorialStep[] = [
  { id: 'debrief.summary', icon: 'check', chapter: 'debrief', target: [], title: 'tutorial.debrief.title', body: 'tutorial.debrief.body',
    params: 'trainingSummary', checklist: 'trainingLessons', nextLabel: 'tutorial.debrief.next', advance: NEXT },
  STOP('gallery', 'gallery', ['[data-nav="gallery"]', '[data-mobile-nav="gallery"]', '[data-tabbar="gallery"]']),
  STOP('techTree', 'techTree', ['[data-nav="techTree"]', '[data-mobile-nav="techTree"]', '[data-tabbar="more"]']),
  STOP('studio', 'studio', ['[data-nav="studio"]', '[data-mobile-nav="studio"]', '[data-tabbar="more"]']),
  STOP('record', 'record', ['.cot-record-trigger', '[data-tabbar="record"]']),
  STOP('docs', 'manual', ['[data-nav="docs"]', '[data-mobile-nav="docs"]', '[data-tabbar="more"]']),
  { id: 'tour.complete', icon: 'deploy', chapter: 'tour', target: ['.cot-battle', '[data-tabbar="deploy"]'], title: 'tutorial.tour.complete.title',
    body: 'tutorial.tour.complete.body', advance: NEXT },
];

/** A chapter's steps for this player's hands, in order. */
export function chapterSteps(chapter: TutorialChapter, input: TutorialInput): TutorialStep[] {
  const list = chapter === 'training' ? TRAINING_STEPS : chapter === 'debrief' || chapter === 'tour' ? AFTER_TRAINING_STEPS : TUTORIAL_STEPS;
  return list.filter((step) => step.chapter === chapter && (!step.when || (typeof step.when === 'string' ? step.when === input : step.when.includes(input))));
}
