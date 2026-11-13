/**
 * tutorialSteps.ts — the first-game tutorial as data (272). Copyright © 2026 Kevin B. Liu.
 *
 * Every step is one record: its chapter, what it lights (a selector list; the first match that is on screen wins, so a
 * phone layout names its own control after the desktop's), its catalog title and body, an optional picture or loop,
 * what moves it on (the Next button, a press on the lit control, or the player doing the thing in battle), and an
 * optional input condition (a keyboard-and-mouse, touch or gamepad player sees the variant written for their hands).
 * tutorialRunner.ts plays a chapter's steps through tutorialOverlay.ts; no step has code of its own.
 *
 * Every claim in the battle steps and the tips is checked against the simulation (tutorialSteps.selftest.mjs names the
 * source of each): the ricochet angles and slope exponents (sim/damage.ts), spotting, bushes and the fire bloom
 * (sim/spotting.ts), the fixed reload (no crew skills), the radio's spot sharing, and Standard's elimination goal.
 */
import type { ActionId } from '../../game/input.ts';
import type { TutorialChapter } from './tutorialRecord.ts';
import { TRAINING_POINTS } from '../../sim/trainingGround.ts';

/** Who the step is written for: a keyboard-and-mouse player, a touch layout, a connected gamepad. Absent: everyone. */
export type TutorialInput = 'keyboard' | 'touch' | 'pad';

/** What moves a step on. */
export type TutorialAdvance =
  | { readonly on: 'next' }
  /** A press on the lit control itself (the Garage's Deploy). */
  | { readonly on: 'press' }
  /** The player's tank has driven this far from where the step began. */
  | { readonly on: 'drive'; readonly metres: number }
  /** The player fired. */
  | { readonly on: 'fire' }
  /** The player loaded a different shell. */
  | { readonly on: 'shell' }
  // ── 273: the training battle's kinds (each heard on the bus or read from the port; tutorialRunner.ts arm) ──────────
  /** The player's tank stands inside the step's guide marker (its ring's radius, or this one). */
  | { readonly on: 'reach'; readonly radiusM?: number }
  /** The player's view: the third-person camera (pulled back at least this far) or the gunner's sight (at least this zoom),
   *  or free look held; a step that names no mode takes either. */
  | { readonly on: 'camera'; readonly mode?: 'third' | 'sight'; readonly zoomAtLeast?: number; readonly orbitAtLeastM?: number;
      readonly freeLook?: boolean }
  /** The gun points at the step's guide marker (its bearing within the tolerance), held this long. */
  | { readonly on: 'turret'; readonly toleranceDeg: number; readonly holdS: number }
  /** The armour colours reach this state (the H key's ui:armorOverlayState, or the Settings row). */
  | { readonly on: 'armour'; readonly value: boolean }
  /** Hits of these kinds (sim/damage.ts HitEvent kind): by the player on an actor, or by an actor on the player. */
  | { readonly on: 'hit'; readonly kinds: readonly string[]; readonly by: 'player' | 'actor'; readonly actor?: string; readonly count?: number }
  /** The player used this consumable (sim/consumableRules.ts id). */
  | { readonly on: 'consumable'; readonly item: string }
  /** A module of the player's tank reaches this state (module:state). */
  | { readonly on: 'module'; readonly module: string; readonly state: 'ok' | 'yellow' | 'red' }
  /** The player's side spotted this actor. */
  | { readonly on: 'spot'; readonly actor: string }
  /** This actor is destroyed. */
  | { readonly on: 'destroy'; readonly actor: string };

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
  /** Seconds before the step counts as fallen behind and the guide escalates (the aim ghost shows). */
  readonly behindS?: number;
}

const still = (slot: string): TutorialMedia => ({ src: `/media/docs-r1/${slot}-640.webp`, kind: 'image' });
/** An in-engine loop the Studio filmed for the tutorial (tools/tutorial-media.mjs; public/media/tutorial-r1). */
const loop = (id: string): TutorialMedia => ({ src: `/media/tutorial-r1/${id}.webm`, kind: 'video', poster: `/media/tutorial-r1/${id}.webp` });
const NEXT = { on: 'next' } as const;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  // ── The Garage, on the first visit ────────────────────────────────────────────────────────────────────────────────
  { id: 'garage.welcome', chapter: 'garage', target: [], title: 'tutorial.garage.welcome.title', body: 'tutorial.garage.welcome.body',
    media: still('start-garage'), advance: NEXT },
  { id: 'garage.tank', chapter: 'garage', target: ['.cot-carousel', '[data-tabbar="garage"]'],
    title: 'tutorial.garage.tank.title', body: 'tutorial.garage.tank.body', advance: NEXT },
  { id: 'garage.nation', chapter: 'garage', target: ['.cot-country-chips'],
    title: 'tutorial.garage.nation.title', body: 'tutorial.garage.nation.body', advance: NEXT },
  { id: 'garage.ammo', chapter: 'garage', when: ['keyboard', 'pad'], target: ['.cot-ammo-tiles'],
    title: 'tutorial.garage.ammo.title', body: 'tutorial.garage.ammo.body', advance: NEXT,
    keys: { shell1: 'shell1', shell2: 'shell2', shell3: 'shell3' } },
  // a phone's dossier opens on its headline strip: the shells are a swipe along it
  { id: 'garage.ammoTouch', chapter: 'garage', when: 'touch', target: ['.cot-ammo-tiles', '.cot-overview-section'],
    title: 'tutorial.garage.ammo.title', body: 'tutorial.garage.ammo.bodyTouch', advance: NEXT },
  { id: 'garage.kit', chapter: 'garage', when: ['keyboard', 'pad'], target: ['.cot-lt-consumables'],
    title: 'tutorial.garage.kit.title', body: 'tutorial.garage.kit.body', advance: NEXT,
    keys: { kit1: 'consumable1', kit2: 'consumable2', kit3: 'consumable3' } },
  // a phone keeps the loadout behind its equipment button
  { id: 'garage.kitTouch', chapter: 'garage', when: 'touch', target: ['.cot-lt-consumables', '.cot-compact-equipment-trigger'],
    title: 'tutorial.garage.kit.title', body: 'tutorial.garage.kit.bodyTouch', advance: NEXT },
  { id: 'garage.camo', chapter: 'garage', target: ['.cot-lt-paint', '.cot-compact-equipment-trigger'],
    title: 'tutorial.garage.camo.title', body: 'tutorial.garage.camo.body', advance: NEXT },
  { id: 'garage.deploy', chapter: 'garage', target: ['.cot-battle', '[data-tabbar="deploy"]'],
    title: 'tutorial.garage.deploy.title', body: 'tutorial.garage.deploy.body', advance: { on: 'press' } },

  // ── The first battle ──────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'battle.drive', chapter: 'battle', when: 'keyboard', target: ['[data-drive-speed]'], dim: false, card: 'upper',
    title: 'tutorial.battle.drive.title', body: 'tutorial.battle.drive.body', advance: { on: 'drive', metres: 20 },
    keys: { forward: 'forward', left: 'left', back: 'back', right: 'right' } },
  { id: 'battle.driveTouch', chapter: 'battle', when: 'touch', target: ['.cot-touch .joy'], dim: false, card: 'upper',
    title: 'tutorial.battle.drive.title', body: 'tutorial.battle.drive.bodyTouch', advance: { on: 'drive', metres: 20 } },
  { id: 'battle.drivePad', chapter: 'battle', when: 'pad', target: ['[data-drive-speed]'], dim: false, card: 'upper',
    title: 'tutorial.battle.drive.title', body: 'tutorial.battle.drive.bodyPad', advance: { on: 'drive', metres: 20 } },
  { id: 'battle.fire', chapter: 'battle', when: 'keyboard', target: [], dim: false, card: 'upper',
    title: 'tutorial.battle.fire.title', body: 'tutorial.battle.fire.body', advance: { on: 'fire' },
    keys: { fire: 'fire', sight: 'sniperToggle' } },
  { id: 'battle.fireTouch', chapter: 'battle', when: 'touch', target: ['.cot-touch .round.fire'], dim: false, card: 'upper',
    title: 'tutorial.battle.fire.title', body: 'tutorial.battle.fire.bodyTouch', advance: { on: 'fire' } },
  { id: 'battle.firePad', chapter: 'battle', when: 'pad', target: [], dim: false, card: 'upper',
    title: 'tutorial.battle.fire.title', body: 'tutorial.battle.fire.bodyPad', advance: { on: 'fire' },
    keys: { fire: 'fire', sight: 'sniperToggle' } },
  { id: 'battle.reload', chapter: 'battle', target: ['.cot-ret-reload', '.cot-shells .cot-shell.sel'], dim: false, card: 'upper',
    title: 'tutorial.battle.reload.title', body: 'tutorial.battle.reload.body', advance: NEXT },
  { id: 'battle.ammo', chapter: 'battle', when: 'keyboard', target: ['.cot-shells'], dim: false, card: 'upper',
    title: 'tutorial.battle.ammo.title', body: 'tutorial.battle.ammo.body', advance: { on: 'shell' },
    keys: { shell2: 'shell2', shell3: 'shell3' } },
  { id: 'battle.ammoTouch', chapter: 'battle', when: 'touch', target: ['.cot-shells'], dim: false, card: 'upper',
    title: 'tutorial.battle.ammo.title', body: 'tutorial.battle.ammo.bodyTouch', advance: { on: 'shell' } },
  { id: 'battle.ammoPad', chapter: 'battle', when: 'pad', target: ['.cot-shells'], dim: false, card: 'upper',
    title: 'tutorial.battle.ammo.title', body: 'tutorial.battle.ammo.body', advance: { on: 'shell' },
    keys: { shell2: 'shell2', shell3: 'shell3' } },
  { id: 'battle.spotting', chapter: 'battle', target: [], media: still('combat-spotting'),
    title: 'tutorial.battle.spotting.title', body: 'tutorial.battle.spotting.body', advance: NEXT },
  { id: 'battle.minimap', chapter: 'battle', when: ['keyboard', 'pad'], target: ['.cot-minimap'],
    title: 'tutorial.battle.minimap.title', body: 'tutorial.battle.minimap.body', advance: NEXT, keys: { zoom: 'minimapZoom' } },
  { id: 'battle.minimapTouch', chapter: 'battle', when: 'touch', target: ['.cot-minimap'],
    title: 'tutorial.battle.minimap.title', body: 'tutorial.battle.minimap.bodyTouch', advance: NEXT },
  // (no picture: the end screen's VICTORY read as "you have already won" in the blind check, round 1)
  { id: 'battle.win', chapter: 'battle', target: ['.cot-top'],
    title: 'tutorial.battle.win.title', body: 'tutorial.battle.win.body', advance: NEXT },

  // ── Strategy, on the Garage after the first battle ────────────────────────────────────────────────────────────────
  { id: 'tips.angle', chapter: 'tips', target: [], media: loop('angle'),
    title: 'tutorial.tips.angle.title', body: 'tutorial.tips.angle.body', advance: NEXT },
  { id: 'tips.hullDown', chapter: 'tips', target: [], media: loop('hullDown'), title: 'tutorial.tips.hullDown.title', body: 'tutorial.tips.hullDown.body', advance: NEXT },
  { id: 'tips.open', chapter: 'tips', target: [], title: 'tutorial.tips.open.title', body: 'tutorial.tips.open.body', advance: NEXT },
  { id: 'tips.reload', chapter: 'tips', target: [], title: 'tutorial.tips.reload.title', body: 'tutorial.tips.reload.body', advance: NEXT },
  { id: 'tips.flank', chapter: 'tips', target: [], media: loop('flank'), title: 'tutorial.tips.flank.title', body: 'tutorial.tips.flank.body', advance: NEXT },
  { id: 'tips.round', chapter: 'tips', target: [], title: 'tutorial.tips.round.title', body: 'tutorial.tips.round.body', advance: NEXT },
  { id: 'tips.reveal', chapter: 'tips', target: [], title: 'tutorial.tips.reveal.title', body: 'tutorial.tips.reveal.body', advance: NEXT },
  { id: 'tips.team', chapter: 'tips', target: [], title: 'tutorial.tips.team.title', body: 'tutorial.tips.team.body', advance: NEXT },
  // the close: the blind check read the last card as "press Done" whatever it said (round 2), so the last card is the
  // close itself, and it says where Replay lives
  { id: 'tips.done', chapter: 'tips', target: [], title: 'tutorial.tips.done.title', body: 'tutorial.tips.done.body', advance: NEXT },
];

// ── The training battle (273): scenes S1 to S4 (storyboard §2.4) ────────────────────────────────────────────────────
// Every marker is a named point of the training ground (sim/trainingGround.ts TRAINING_POINTS), never a literal here.
const marker = (point: { readonly x: number; readonly z: number; readonly radiusM: number }, label: string) =>
  ({ x: point.x, z: point.z, radiusM: point.radiusM, label }) as const;
const PLAY = { dim: false, card: 'upper' } as const;

export const TRAINING_STEPS: readonly TutorialStep[] = [
  // S1: the rollout card: what this battle is
  { id: 'training.rollout', chapter: 'training', target: [], title: 'tutorial.training.rollout.title', body: 'tutorial.training.rollout.body',
    advance: NEXT },
  // S2: drive to ring A, then turn to ring B
  { id: 'training.driveA', chapter: 'training', when: 'keyboard', target: [], ...PLAY,
    title: 'tutorial.training.driveA.title', body: 'tutorial.training.driveA.body', advance: { on: 'reach' }, behindS: 40,
    keys: { forward: 'forward', left: 'left', right: 'right' },
    guide: { marker: marker(TRAINING_POINTS.driveA, 'tutorial.training.marker.a'), path: true } },
  { id: 'training.driveATouch', chapter: 'training', when: 'touch', target: [], ...PLAY,
    title: 'tutorial.training.driveA.title', body: 'tutorial.training.driveA.bodyTouch', advance: { on: 'reach' }, behindS: 40,
    guide: { marker: marker(TRAINING_POINTS.driveA, 'tutorial.training.marker.a'), path: true, hud: ['.cot-touch .joy'] } },
  { id: 'training.driveAPad', chapter: 'training', when: 'pad', target: [], ...PLAY,
    title: 'tutorial.training.driveA.title', body: 'tutorial.training.driveA.bodyPad', advance: { on: 'reach' }, behindS: 40,
    guide: { marker: marker(TRAINING_POINTS.driveA, 'tutorial.training.marker.a'), path: true } },
  { id: 'training.driveB', chapter: 'training', target: [], ...PLAY,
    title: 'tutorial.training.driveB.title', body: 'tutorial.training.driveB.body', advance: { on: 'reach' }, behindS: 40,
    guide: { marker: marker(TRAINING_POINTS.driveB, 'tutorial.training.marker.b'), path: true } },
  // S3: the turret turns apart from the hull
  { id: 'training.turret', chapter: 'training', when: 'keyboard', target: [], ...PLAY,
    title: 'tutorial.training.turret.title', body: 'tutorial.training.turret.body', advance: { on: 'turret', toleranceDeg: 8, holdS: 1 },
    keys: { left: 'left', right: 'right' }, guide: { marker: marker(TRAINING_POINTS.board, 'tutorial.training.marker.board') } },
  { id: 'training.turretTouch', chapter: 'training', when: 'touch', target: [], ...PLAY,
    title: 'tutorial.training.turret.title', body: 'tutorial.training.turret.bodyTouch', advance: { on: 'turret', toleranceDeg: 8, holdS: 1 },
    guide: { marker: marker(TRAINING_POINTS.board, 'tutorial.training.marker.board') } },
  { id: 'training.turretPad', chapter: 'training', when: 'pad', target: [], ...PLAY,
    title: 'tutorial.training.turret.title', body: 'tutorial.training.turret.bodyPad', advance: { on: 'turret', toleranceDeg: 8, holdS: 1 },
    guide: { marker: marker(TRAINING_POINTS.board, 'tutorial.training.marker.board') } },
  // S4: the views: pull the camera back, the gunner's sight, its zoom, free look
  { id: 'training.orbit', chapter: 'training', when: 'keyboard', target: [], ...PLAY,
    title: 'tutorial.training.orbit.title', body: 'tutorial.training.orbit.body', advance: { on: 'camera', mode: 'third', orbitAtLeastM: 18 } },
  { id: 'training.orbitTouch', chapter: 'training', when: 'touch', target: [], ...PLAY,
    title: 'tutorial.training.orbit.title', body: 'tutorial.training.orbit.bodyTouch', advance: { on: 'camera', mode: 'third', orbitAtLeastM: 18 } },
  { id: 'training.sight', chapter: 'training', when: 'keyboard', target: [], ...PLAY,
    title: 'tutorial.training.sight.title', body: 'tutorial.training.sight.body', advance: { on: 'camera', mode: 'sight' },
    keys: { sight: 'sniperToggle' } },
  { id: 'training.sightTouch', chapter: 'training', when: 'touch', target: [], ...PLAY,
    title: 'tutorial.training.sight.title', body: 'tutorial.training.sight.bodyTouch', advance: { on: 'camera', mode: 'sight' },
    guide: { hud: ['.cot-touch .round.scope'] } },
  { id: 'training.sightPad', chapter: 'training', when: 'pad', target: [], ...PLAY,
    title: 'tutorial.training.sight.title', body: 'tutorial.training.sight.body', advance: { on: 'camera', mode: 'sight' },
    keys: { sight: 'sniperToggle' } },
  { id: 'training.zoom', chapter: 'training', when: 'keyboard', target: [], ...PLAY,
    title: 'tutorial.training.zoom.title', body: 'tutorial.training.zoom.body', advance: { on: 'camera', mode: 'sight', zoomAtLeast: 8 } },
  { id: 'training.zoomTouch', chapter: 'training', when: 'touch', target: [], ...PLAY,
    title: 'tutorial.training.zoom.title', body: 'tutorial.training.zoom.bodyTouch', advance: { on: 'camera', mode: 'sight', zoomAtLeast: 8 } },
  // a touch layout has no free look (the hold is a key or a pad button)
  { id: 'training.freeLook', chapter: 'training', when: ['keyboard', 'pad'], target: [], ...PLAY,
    title: 'tutorial.training.freeLook.title', body: 'tutorial.training.freeLook.body', advance: { on: 'camera', freeLook: true },
    keys: { look: 'freeLook' } },
];

/** A chapter's steps for this player's hands, in order. */
export function chapterSteps(chapter: TutorialChapter, input: TutorialInput): TutorialStep[] {
  return (chapter === 'training' ? TRAINING_STEPS : TUTORIAL_STEPS).filter((step) => step.chapter === chapter && (!step.when || (typeof step.when === 'string' ? step.when === input : step.when.includes(input))));
}
