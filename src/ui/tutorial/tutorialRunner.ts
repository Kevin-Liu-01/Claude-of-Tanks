/**
 * tutorialRunner.ts — plays one chapter of the first-game tutorial (272). Copyright © 2026 Kevin B. Liu.
 *
 * It walks a chapter's steps (tutorialSteps.ts, filtered for the player's hands) through the one overlay
 * (tutorialOverlay.ts), and moves on by the step's record: Next, a press on the lit control, or the player doing the
 * thing in battle (driving N metres, firing, loading another shell), heard on the game's bus and read from the player's
 * position. Back steps back; Skip ends the whole tutorial at once (every chapter recorded skipped, by the caller).
 *
 * Every input works: a mouse or a finger presses the card's buttons; the Garage's keyboard takes Enter or → for Next,
 * ← for Back and Esc for Skip; a battle, whose keys drive the tank and whose pointer is locked to the sight, takes
 * Enter for Next and Backspace for Skip (keys no default binding uses) and never moves focus to the card; a gamepad
 * takes A / B / BACK in the Garage and the stick clicks (RS Next, LS Skip) in battle, where every other button is
 * bound. The card's buttons show those keys.
 *
 * The run belongs to its screen (272, the owner on the preview: the Deploy card outlived the Garage onto a battle's
 * loading screen). It asks the screen every SCREEN_POLL_MS, and at every phase change, whether it is live, covered (a
 * surface the step did not open: Settings, a picker, a modal; the card hides until it closes) or gone (a battle starts,
 * another screen takes over): gone closes the run where it stands and hands its place back (onClose), so the chapter
 * resumes there, and app/tutorialAccess.ts advances by rule when the place was Deploy. On the Garage the keyboard is
 * inert too: a key the card does not take (and Enter on a press step, which belongs to the lit control) never reaches
 * the Garage's hotkeys; Tab stays inside the card.
 */
import type { ActionId } from '../../game/input.ts';
import { t } from '../i18n.ts';
import type { TutorialChapter, TutorialOutcome } from './tutorialRecord.ts';
import { chapterSteps, type TutorialInput, type TutorialStep } from './tutorialSteps.ts';
import { createTutorialOverlay, type OverlayView, type TutorialOverlay } from './tutorialOverlay.ts';
import { createTutorialGuide, type GuidePort, type TutorialGuideLayer } from './tutorialGuide.ts';

/** Diagnostics (app/tutorialAccess.ts debugGuide): the guide alone, on whatever battle is showing. */
export { createTutorialGuide };

export interface TutorialPort {
  /** The game's bus (its `on`): shell:fired, ui:shellSelect, ui:shellSelectionChanged, ui:pause. */
  on(event: string, listener: (payload: unknown) => void): () => void;
  /** Who is playing: a keyboard and mouse, a touch layout, or a connected pad. */
  inputKind(): TutorialInput;
  /** The cap for an action's current binding (its pad button with a pad connected). */
  keyLabel(action: ActionId): string;
  /** A key's cap as the game writes it (input.ts labelForCode; passed in so the chunk never splits input.ts off the
   *  boot graph into a request of its own). */
  codeLabel(code: string): string;
  /** The player's tank on the ground plane, in battle; null elsewhere. */
  playerPosition(): { readonly x: number; readonly z: number } | null;
  /** The chapter's screen: live, covered by a surface the step did not open, or gone. */
  screen(chapter: TutorialChapter): TutorialScreen;
  /** 273: what the guide reads over a battle (tutorialGuide.ts); absent, no step draws guidance. */
  readonly guide?: GuidePort;
  /** 273: the player's view in battle (the rig's mode and zoom, free look held), or null elsewhere. */
  view?(): TutorialView | null;
  /** 273: the player's entity id in battle (hit and module steps tell the player's tank from an actor). */
  playerId?(): string | null;
  /** 273: whether the armour colours are on now (an armour step already met moves on at once). */
  armourOn?(): boolean;
}

/** The player's view, read for camera steps: the third-person camera or the gunner's sight. */
export interface TutorialView {
  readonly mode: 'third' | 'sight';
  readonly zoom: number;
  readonly freeLook: boolean;
}

export type TutorialScreen = 'live' | 'covered' | 'gone';

export interface TutorialRun {
  readonly chapter: TutorialChapter;
  /** The step showing (receipts and the capture tool). */
  readonly stepId: string | null;
  readonly overlay: TutorialOverlay;
  /** End the run without recording anything (the screen it ran on is gone). */
  stop(): void;
  next(): void;
  back(): void;
  skip(): void;
}

export interface RunOptions {
  readonly chapter: TutorialChapter;
  readonly port: TutorialPort;
  /** The chapter ended: done (its last step passed) or skipped (Skip, which ends the whole tutorial). */
  onEnd(outcome: TutorialOutcome): void;
  /** The step to start on (a chapter its screen closed resumes where it stood). */
  readonly startAt?: number;
  /** The screen went away mid-chapter: the run closed at this step, nothing recorded. */
  onClose?(index: number, stepId: string): void;
}

const DRIVE_POLL_MS = 250;
/** How long free look must be held for a camera step that asks for it. */
const FREE_LOOK_HOLD_MS = 1000;
/** A step with no budget of its own falls behind after this long (the guide escalates once). */
const BEHIND_DEFAULT_S = 45;
const SCREEN_POLL_MS = 250;
const PAD_POLL_MS = 90;
/** Gamepad buttons (standard mapping) per screen: the Garage's menus take none; a battle binds all but the stick clicks. */
const PAD_KEYS = {
  menu: { next: 0, back: 1, skip: 8 },
  battle: { next: 11, back: -1, skip: 10 },
} as const;
const PAD_CAPS: Readonly<Record<number, string>> = { 0: 'A', 1: 'B', 8: 'BACK', 10: 'LS', 11: 'RS' };

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A body line with its {placeholders} as key caps (the line itself escaped). */
function bodyHtml(step: TutorialStep, port: TutorialPort): string {
  const keys = step.keys ?? {};
  const marks = Object.fromEntries(Object.keys(keys).map((name, i) => [name, `\u0000${i}\u0000`]));
  let html = esc(t(step.body, marks));
  Object.values(keys).forEach((action, i) => {
    const cap = port.keyLabel(action);
    html = html.split(`\u0000${i}\u0000`).join(`<kbd class="cot-c-kbd"${/[㐀-鿿]/.test(cap) ? ' data-cjk' : ''}>${esc(cap)}</kbd>`);
  });
  return html;
}

export function runTutorialChapter({ chapter, port, onEnd, startAt = 0, onClose }: RunOptions): TutorialRun {
  const input = port.inputKind();
  const steps = chapterSteps(chapter, input);
  const battle = chapter === 'battle';
  // the Garage's Deploy names Enter in the player's language; the card's caps match it
  const codeCap = (code: string): string => (code === 'Enter' ? t('garage.key.enter') : port.codeLabel(code));
  let index = Math.max(0, Math.min(startAt, Math.max(0, chapterSteps(chapter, input).length - 1)));
  let ended = false;
  let hiddenByPause = false;
  let covered = false;
  /** Keys whose press the Garage guard swallowed: their release goes too. */
  const swallowed = new Set<string>();
  let stepOff: Array<() => void> = [];
  const runOff: Array<() => void> = [];

  const overlay = createTutorialOverlay({ next: () => api.next(), back: () => api.back(), skip: () => api.skip() });
  overlay.root.dataset.chapter = chapter;
  // the guide comes with the first step that asks for it, and goes with the run (273)
  let guide: TutorialGuideLayer | null = null;
  const guideFor = (step: TutorialStep): TutorialGuideLayer | null => {
    if (!step.guide || !port.guide) return guide;
    guide ??= createTutorialGuide(port.guide);
    return guide;
  };

  const resolver = (step: TutorialStep): (() => Element | null) | null => {
    if (!step.target.length) return null;
    return () => {
      for (const selector of step.target) {
        for (const element of document.querySelectorAll(selector)) {
          const rect = element.getBoundingClientRect();
          if (rect.width >= 2 && rect.height >= 2) return element;
        }
      }
      return null;
    };
  };

  function clearStep(): void {
    for (const off of stepOff.splice(0)) off();
  }

  function end(outcome: TutorialOutcome | null): void {
    if (ended) return;
    ended = true;
    clearStep();
    for (const off of runOff.splice(0)) off();
    overlay.destroy();
    guide?.destroy();
    guide = null;
    if (outcome) onEnd(outcome);
  }

  function arm(step: TutorialStep): void {
    const advance = step.advance;
    const go = (): void => { if (!ended && steps[index] === step) api.next(); };
    /** A condition read every DRIVE_POLL_MS (the port's state has no event of its own). */
    const poll = (met: () => boolean): void => {
      const timer = window.setInterval(() => { if (!hiddenByPause && !covered && met()) go(); }, DRIVE_POLL_MS);
      stepOff.push(() => window.clearInterval(timer));
    };
    // a step with guidance falls behind once: its guide escalates (the aim ghost), never twice
    if (step.guide && advance.on !== 'next') {
      const timer = window.setTimeout(() => guide?.setEscalated(true), (step.behindS ?? BEHIND_DEFAULT_S) * 1000);
      stepOff.push(() => window.clearTimeout(timer));
    }
    if (advance.on === 'press') {
      const onPress = (event: Event): void => {
        const lit = resolver(step)?.();
        if (lit && event.target instanceof Node && lit.contains(event.target)) go();
      };
      document.addEventListener('click', onPress, true);
      stepOff.push(() => document.removeEventListener('click', onPress, true));
    } else if (advance.on === 'fire') {
      stepOff.push(port.on('shell:fired', (payload) => { if ((payload as { isPlayer?: boolean } | null)?.isPlayer) go(); }));
    } else if (advance.on === 'shell') {
      // the player's ask (a shell key, a rack press) or the load it led to: an ATGM slot answers with its own event
      stepOff.push(port.on('ui:shellSelect', go), port.on('ui:shellSelectionChanged', go));
    } else if (advance.on === 'reach') {
      const marker = step.guide?.marker;
      if (marker) {
        const radius = advance.radiusM ?? marker.radiusM;
        poll(() => { const at = port.playerPosition(); return !!at && Math.hypot(at.x - marker.x, at.z - marker.z) <= radius; });
      }
    } else if (advance.on === 'camera') {
      let heldSince = 0;
      poll(() => {
        const view = port.view?.();
        if (!view) return false;
        const modeOk = view.mode === advance.mode && view.zoom >= (advance.zoomAtLeast ?? -Infinity);
        if (!advance.freeLook) return modeOk;
        if (!view.freeLook) { heldSince = 0; return false; }
        heldSince ||= performance.now();
        return performance.now() - heldSince >= FREE_LOOK_HOLD_MS;
      });
    } else if (advance.on === 'armour') {
      if (port.armourOn?.() === advance.value) { queueMicrotask(go); return; }
      stepOff.push(port.on('ui:armorOverlayState', (payload) => { if (!!(payload as { on?: boolean } | null)?.on === advance.value) go(); }));
      poll(() => port.armourOn?.() === advance.value);
    } else if (advance.on === 'hit') {
      let count = 0;
      stepOff.push(port.on('shell:hit', (payload) => {
        const hit = payload as { kind?: string; attackerId?: string; targetId?: string } | null;
        const me = port.playerId?.() ?? null;
        if (!hit?.kind || !me || !advance.kinds.includes(hit.kind)) return;
        const mine = advance.by === 'player' ? hit.attackerId === me && (!advance.actor || hit.targetId === advance.actor)
          : hit.targetId === me && (!advance.actor || hit.attackerId === advance.actor);
        if (mine && ++count >= (advance.count ?? 1)) go();
      }));
    } else if (advance.on === 'consumable') {
      stepOff.push(port.on('ui:consumableUsed', (payload) => {
        const used = payload as { ok?: boolean; item?: string } | null;
        if (used?.ok && used.item === advance.item) go();
      }));
    } else if (advance.on === 'module') {
      stepOff.push(port.on('module:state', (payload) => {
        const change = payload as { id?: string; module?: string; state?: string } | null;
        if (change?.id === port.playerId?.() && change?.module === advance.module && change?.state === advance.state) go();
      }));
    } else if (advance.on === 'spot') {
      stepOff.push(port.on('tank:spotted', (payload) => { if ((payload as { id?: string } | null)?.id === advance.actor) go(); }));
    } else if (advance.on === 'destroy') {
      stepOff.push(port.on('tank:destroyed', (payload) => { if ((payload as { id?: string } | null)?.id === advance.actor) go(); }));
    } else if (advance.on === 'drive') {
      let from = port.playerPosition();
      const timer = window.setInterval(() => {
        const at = port.playerPosition();
        if (!at) return;
        if (!from) { from = at; return; }
        if (Math.hypot(at.x - from.x, at.z - from.z) >= advance.metres) go();
      }, DRIVE_POLL_MS);
      stepOff.push(() => window.clearInterval(timer));
    }
  }

  function render(): void {
    clearStep();
    const step = steps[index]!;
    overlay.root.dataset.step = step.id;
    const last = index === steps.length - 1;
    const acting = step.advance.on !== 'next';
    const pad = input === 'pad';
    const keys = battle ? PAD_KEYS.battle : PAD_KEYS.menu;
    const cap = (keyboard: string, padButton: number): string => (pad ? PAD_CAPS[padButton] ?? '' : input === 'touch' ? '' : keyboard);
    const view: OverlayView = {
      label: t('tutorial.label'),
      chapter: t(`tutorial.chapter.${chapter}`),
      progress: t('tutorial.progress', { n: String(index + 1), total: String(steps.length) }),
      fraction: (index + 1) / steps.length,
      title: t(step.title),
      bodyHtml: bodyHtml(step, port),
      media: step.media ? { ...step.media, alt: t(step.title) } : null,
      target: resolver(step),
      dim: step.dim ?? true,
      place: step.card ?? 'middle',
      nextLabel: t(last ? 'tutorial.done' : 'tutorial.next'),
      backLabel: t('tutorial.back'),
      skipLabel: t('tutorial.skip'),
      canBack: index > 0,
      canNext: step.advance.on !== 'press',
      actionHint: acting ? t('tutorial.doIt') : null,
      caps: battle
        ? { next: cap(codeCap('Enter'), keys.next), back: '', skip: cap(codeCap('Backspace'), keys.skip) }
        : step.advance.on === 'press'
        ? { next: '', back: cap(codeCap('ArrowLeft'), PAD_KEYS.menu.back), skip: cap(codeCap('Escape'), keys.skip) }
        : { next: cap(codeCap('Enter'), keys.next), back: cap(codeCap('ArrowLeft'), PAD_KEYS.menu.back), skip: cap(codeCap('Escape'), keys.skip) },
      focus: !battle && input !== 'touch',
    };
    overlay.show(view);
    const layer = guideFor(step);
    layer?.show(step.guide ?? null, {
      marker: step.guide?.marker ? t(step.guide.marker.label) : '',
      actor: step.guide?.actor ? t(step.guide.actor.label) : '',
      distance: (metres) => t('tutorial.guide.distance', { m: String(metres) }),
    });
    arm(step);
  }

  // keys: the Garage's arrows and Esc, a battle's Enter and Backspace (see the module comment)
  const onKey = (event: KeyboardEvent): void => {
    if (ended || covered || hiddenByPause) return; // a surface over the screen owns the keyboard while it is up
    if (event.altKey || event.ctrlKey || event.metaKey) return; // the browser's own shortcuts
    if (!battle && event.code === 'Tab') { trapTab(event); return; }
    if (event.repeat) { if (!battle) swallow(event); return; }
    let handled = true;
    if (event.code === 'Enter' || event.code === 'NumpadEnter') {
      // a step that waits for a press on its control lets Enter reach it (the Garage's Deploy answers to Enter)
      if (steps[index]?.advance.on === 'press') handled = false;
      else if (battle || !(event.target instanceof HTMLButtonElement) || !overlay.root.contains(event.target)) api.next();
      else handled = false; // a focused card button presses itself
    } else if (battle && event.code === 'Backspace') api.skip();
    else if (!battle && event.code === 'ArrowRight') api.next();
    else if (!battle && event.code === 'ArrowLeft') api.back();
    else if (!battle && event.code === 'Escape') api.skip();
    else handled = false;
    if (handled) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    // the Garage is inert under the card: only a focused card button's own keys, and Enter on a press step (the lit
    // control's), go on; every other key (the Garage's hotkeys among them) stops here
    if (battle) return;
    const onCardButton = event.target instanceof HTMLButtonElement && overlay.root.contains(event.target);
    const pressStepEnter = steps[index]?.advance.on === 'press' && (event.code === 'Enter' || event.code === 'NumpadEnter');
    if (pressStepEnter || (onCardButton && (event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter'))) return;
    swallow(event);
  };
  function swallow(event: KeyboardEvent): void {
    swallowed.add(event.code);
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    if (!swallowed.delete(event.code)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  /** Tab walks the card's own buttons, never out to the Garage under the dim. */
  function trapTab(event: KeyboardEvent): void {
    const buttons = [...overlay.root.querySelectorAll<HTMLButtonElement>('.cot-tut-card button')]
      .filter((button) => !button.hidden && getComputedStyle(button).display !== 'none');
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!buttons.length) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = at < 0 ? 0 : (at + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length;
    buttons[next]!.focus({ preventScroll: true });
  }
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  runOff.push(() => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKeyUp, true); });

  // a gamepad's edges, read here (the game's own poll fires its actions only in battle)
  const padKeys = battle ? PAD_KEYS.battle : PAD_KEYS.menu;
  let padHeld = 0;
  const padTimer = window.setInterval(() => {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = [...pads].find((entry) => entry?.connected) ?? null;
    let held = 0;
    pad?.buttons.forEach((b, i) => { if (b.pressed) held |= 1 << i; });
    const pressed = held & ~padHeld;
    padHeld = held;
    if (!pressed || hiddenByPause || covered) return;
    if (pressed & (1 << padKeys.next)) api.next();
    else if (padKeys.back >= 0 && pressed & (1 << padKeys.back)) api.back();
    else if (pressed & (1 << padKeys.skip)) api.skip();
  }, PAD_POLL_MS);
  runOff.push(() => window.clearInterval(padTimer));

  // a paused battle (the pause menu) hides the card; it comes back with the battle
  runOff.push(port.on('ui:pause', (payload) => {
    hiddenByPause = !!(payload as { on?: boolean } | null)?.on;
    overlay.setHidden(hiddenByPause || covered);
    guide?.setHidden(hiddenByPause || covered);
  }));

  // the screen the chapter belongs to (see the module comment): covered hides the card, gone closes the run where it stands
  const checkScreen = (): void => {
    if (ended) return;
    const screen = port.screen(chapter);
    if (screen === 'gone') {
      const at = index, stepId = steps[index]?.id ?? '';
      end(null);
      onClose?.(at, stepId);
      return;
    }
    const nowCovered = screen === 'covered';
    if (nowCovered === covered) return;
    covered = nowCovered;
    overlay.setHidden(hiddenByPause || covered);
    guide?.setHidden(hiddenByPause || covered);
  };
  const screenTimer = window.setInterval(checkScreen, SCREEN_POLL_MS);
  runOff.push(() => window.clearInterval(screenTimer));
  runOff.push(port.on('phase:change', () => checkScreen()));

  const api: TutorialRun = {
    chapter,
    get stepId() { return ended ? null : steps[index]?.id ?? null; },
    overlay,
    stop: () => end(null),
    next(): void {
      if (ended) return;
      if (index >= steps.length - 1) { end('done'); return; }
      index += 1;
      render();
    },
    back(): void {
      if (ended || index === 0) return;
      index -= 1;
      render();
    },
    skip: () => end('skipped'),
  };

  if (!steps.length) { end('done'); return api; }
  render();
  checkScreen();
  return api;
}
