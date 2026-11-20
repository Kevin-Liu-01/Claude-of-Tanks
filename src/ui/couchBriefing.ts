/**
 * Couch mode's briefing on the big screen (docs/COUCH-MODE.md "The briefing"; Kevin 2026-11-20: "have it be centered in
 * screen when i press start and go through a couple things then go!"). The lobby's Start opens it: one plate centred
 * over the whole screen, never inside a pane, in three steps (game/couchBriefing.ts): which seat is which pane (the
 * split screen's own plan, game/couchPanes.ts couchScreenPlan), the phone's five zones (the controller's layout,
 * src/pad/padLayout.ts), and the sides. Enter or Space moves it on, Escape goes back to the lobby; each phone's Ready lights
 * its seat's lamp here, and GO (or every seat ready) deploys. It loads with the couch lobby's chunk; it never opens over
 * a battle.
 */
import { createModal } from './modal.ts';
import type { ModalController } from './modal.ts';
import { t } from './i18n.ts';
import { ensureStyle } from './styleLayers.ts';
import { couchScreenPlan } from '../game/couchPanes.ts';
import { createCouchBriefing } from '../game/couchBriefing.ts';
import type { CouchBriefing } from '../game/couchBriefing.ts';
import type { CouchView } from '../game/couchSeats.ts';
import type { CouchSides } from '../sim/matchRuleset.ts';

const CSS = `
.cot-couch-brief{display:grid;gap:var(--s5);}
.cot-couch-brief-step{margin:0;font-size:var(--fs-13);color:var(--ink-3);font-family:var(--font-mono);}
.cot-couch-brief-title{margin:0;font-size:var(--fs-28);font-weight:var(--fw-semibold);color:var(--ink-1);}
.cot-couch-brief-note{margin:0;font-size:var(--fs-16);line-height:var(--lh-body);color:var(--ink-2);}
.cot-couch-brief-stage{display:grid;place-items:center;min-height:260px;}
.cot-couch-brief-screen{position:relative;width:min(560px,100%);border-radius:var(--r2);background:var(--surface-scene);outline:1px solid var(--line-3);}
.cot-couch-brief-pane{position:absolute;display:grid;place-items:center;box-sizing:border-box;border:2px solid var(--team-own);border-radius:var(--r1);
  font-size:var(--fs-18);font-weight:var(--fw-semibold);color:var(--ink-1);}
.cot-couch-brief-pane[data-side='bravo']{border-color:var(--team-enemy);}
.cot-couch-brief-phone{display:grid;grid-template-columns:1fr 1.4fr 0.9fr 1.5fr 1fr;gap:var(--s2);width:min(640px,100%);aspect-ratio:844/300;
  padding:var(--s3);box-sizing:border-box;border-radius:28px;background:var(--surface-scene);outline:1px solid var(--line-3);}
.cot-couch-brief-zone{display:grid;place-items:center;padding:var(--s2);border-radius:var(--r2);background:var(--surface-plate);
  outline:1px solid var(--line-2);font-size:var(--fs-14);font-weight:var(--fw-semibold);color:var(--ink-1);text-align:center;}
.cot-couch-brief-zone[data-zone='fire']{outline:2px solid var(--danger);}
.cot-couch-brief-sides{display:flex;gap:var(--s6);justify-content:center;}
.cot-couch-brief-side{display:grid;gap:var(--s2);justify-items:center;}
.cot-couch-brief-side h3{margin:0;font-size:var(--fs-16);color:var(--ink-2);}
.cot-couch-brief-seats{display:flex;flex-wrap:wrap;gap:var(--s2);justify-content:center;margin:0;padding:0;list-style:none;}
.cot-couch-brief-seat{display:grid;place-items:center;min-width:56px;height:48px;padding:0 var(--s2);border-radius:var(--r2);border:2px solid var(--team-own);
  font-family:var(--font-mono);font-size:var(--fs-16);font-weight:var(--fw-semibold);color:var(--ink-1);}
.cot-couch-brief-seat[data-side='bravo']{border-color:var(--team-enemy);}
.cot-couch-brief-roll{display:flex;align-items:center;gap:var(--s3);margin-right:auto;}
.cot-couch-brief-roll .cot-couch-brief-seat{min-width:44px;height:36px;border-color:var(--line-2);color:var(--ink-3);}
.cot-couch-brief-roll .cot-couch-brief-seat[data-ready='true']{border-color:var(--accent);background:var(--accent-wash);color:var(--ink-1);}
.cot-couch-brief-hint{font-size:var(--fs-13);color:var(--ink-3);}
`;

export interface CouchBriefingRequest {
  /** The seats in play, in seat order (each a pane, in order, on the split screen). */
  seats: readonly number[];
  sides: CouchSides;
  view: CouchView;
  trigger?: HTMLElement | null;
  /** GO: deploy the seats. False when the start was refused (the lobby comes back). */
  onGo(): boolean;
  /** Back to the lobby (Escape, Back on the first step, a refused start). */
  onBack(): void;
}

export interface CouchBriefingHandle {
  readonly briefing: CouchBriefing;
  /** A phone's Ready or Skip (padReceiver's `ready`, by its seat). */
  ready(seat: number, skip: boolean): void;
  close(): void;
}

let current: CouchBriefingHandle | null = null;

/** The seat's side as the lobby seats them: Teams puts every second seat in play on Bravo. */
const sideOf = (sides: CouchSides, index: number): 'alpha' | 'bravo' => (sides === 'teams' && index % 2 === 1 ? 'bravo' : 'alpha');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const node = parent.appendChild(document.createElement(tag));
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function openCouchBriefing(request: CouchBriefingRequest): CouchBriefingHandle {
  ensureStyle('cot-couch-briefing-style', CSS, 'surfaces');
  current?.close();
  const briefing = createCouchBriefing(request.seats);
  let closing = false;
  // one plate per briefing (its listeners are this briefing's): Escape or the close goes back to the lobby, a GO or the
  // runtime's own close does not
  const controller: ModalController = createModal({ title: t('couch.brief.title'), size: 'large', closeLabel: t('couch.brief.back'),
    className: 'cot-couch-brief-modal', surface: 'couch-briefing', onClose: () => {
      if (current === handle) current = null;
      setTimeout(() => controller.dispose(), 260);
      if (closing) return;
      closing = true;
      request.onBack();
    } });
  const { body, footer } = controller;
  body.textContent = '';
  footer.textContent = '';
  const root = el('div', 'cot-couch-brief', body);
  const stepLine = el('p', 'cot-couch-brief-step', root);
  stepLine.setAttribute('aria-live', 'polite');
  const title = el('h2', 'cot-couch-brief-title', root);
  const note = el('p', 'cot-couch-brief-note', root);
  const stage = el('div', 'cot-couch-brief-stage', root);
  // the roll call: a lamp per seat, lit once its phone is ready
  const roll = el('div', 'cot-couch-brief-roll', footer);
  const lamps = el('ol', 'cot-couch-brief-seats', roll);
  lamps.setAttribute('aria-label', t('couch.seats'));
  const seatLamps = request.seats.map((seat) => {
    const lamp = el('li', 'cot-couch-brief-seat', lamps, String(seat));
    lamp.dataset.ready = 'false';
    return lamp;
  });
  el('span', 'cot-couch-brief-hint', roll, t('couch.brief.hint'));
  const button = (variant: 'primary' | 'secondary', label: string): HTMLButtonElement => {
    const control = el('button', `cot-c-btn cot-c-btn--${variant} cot-c-btn--36`, footer);
    control.type = 'button';
    control.dataset.uiSound = 'press';
    el('span', 'cot-c-btn__label', control, label);
    return control;
  };
  const back = button('secondary', t('couch.brief.back'));
  const next = button('primary', t('couch.brief.next'));

  const seatChip = (parent: HTMLElement, seat: number, index: number): void => {
    const chip = el('li', 'cot-couch-brief-seat', parent, t('pad.seat', { n: seat }));
    chip.dataset.side = sideOf(request.sides, index);
  };
  function drawSeats(): void {
    const plan = couchScreenPlan(request.view, Math.max(1, request.seats.length), innerWidth, innerHeight);
    title.textContent = t('couch.brief.seats.title');
    note.textContent = t(plan.view === 'split' ? 'couch.brief.seats.split' : 'couch.brief.seats.shared');
    if (plan.view === 'split' && plan.layout) {
      // the big screen in miniature, each pane where the split screen puts it, named by its seat
      const screen = el('div', 'cot-couch-brief-screen', stage);
      screen.style.aspectRatio = `${innerWidth} / ${innerHeight}`;
      plan.layout.panes.forEach((pane, index) => {
        const box = el('div', 'cot-couch-brief-pane', screen, t('pad.seat', { n: request.seats[index] ?? index + 1 }));
        box.dataset.side = sideOf(request.sides, index);
        box.style.left = `${(pane.x / innerWidth) * 100}%`;
        box.style.top = `${(pane.y / innerHeight) * 100}%`;
        box.style.width = `${(pane.width / innerWidth) * 100}%`;
        box.style.height = `${(pane.height / innerHeight) * 100}%`;
      });
    } else {
      const list = el('ol', 'cot-couch-brief-seats', stage);
      request.seats.forEach((seat, index) => seatChip(list, seat, index));
    }
  }
  function drawPhone(): void {
    title.textContent = t('couch.brief.phone.title');
    note.textContent = t('couch.brief.phone.note');
    // the phone held sideways: the controller's five zones (src/pad/padLayout.ts), named as its guide names them
    const phone = el('div', 'cot-couch-brief-phone', stage);
    for (const [zone, words] of [['left', 'pad.tour.left'], ['stick', 'pad.tour.stick'], ['deck', 'pad.tour.deck'], ['fire', 'pad.tour.fire'],
      ['right', 'pad.tour.right']] as const) {
      el('div', 'cot-couch-brief-zone', phone, t(words)).dataset.zone = zone;
    }
  }
  function drawSides(): void {
    title.textContent = t('couch.brief.sides.title');
    note.textContent = t(request.sides === 'teams' ? 'couch.brief.sides.teams' : 'couch.brief.sides.together');
    const columns = el('div', 'cot-couch-brief-sides', stage);
    const groups = request.sides === 'teams' ? (['alpha', 'bravo'] as const) : (['alpha'] as const);
    for (const side of groups) {
      const column = el('div', 'cot-couch-brief-side', columns);
      el('h3', '', column, t(side === 'alpha' ? 'couch.brief.alpha' : 'couch.brief.bravo'));
      const list = el('ol', 'cot-couch-brief-seats', column);
      request.seats.forEach((seat, index) => { if (sideOf(request.sides, index) === side) seatChip(list, seat, index); });
    }
  }
  function paint(): void {
    stage.textContent = '';
    stepLine.textContent = t('couch.brief.step', { n: briefing.step + 1, total: briefing.steps });
    if (briefing.stepId === 'seats') drawSeats();
    else if (briefing.stepId === 'phone') drawPhone();
    else drawSides();
    (next.firstElementChild as HTMLElement).textContent = t(briefing.step === briefing.steps - 1 ? 'couch.brief.go' : 'couch.brief.next');
    back.hidden = briefing.step === 0;
    seatLamps.forEach((lamp, index) => {
      const ready = briefing.isReady(request.seats[index]!);
      lamp.dataset.ready = String(ready);
      lamp.setAttribute('aria-label', t(ready ? 'couch.brief.seatReady' : 'couch.brief.seatWaiting', { n: request.seats[index]! }));
    });
  }
  function deploy(): void {
    closing = true;
    controller.close();
    current = null;
    if (!request.onGo()) request.onBack();
  }
  const act = (outcome: string): void => { if (outcome === 'go') deploy(); else paint(); };
  next.addEventListener('click', () => act(briefing.next()));
  back.addEventListener('click', () => { if (briefing.back()) paint(); });
  // Enter and Space move it on from anywhere on the plate; on a focused button the button's own press does it
  controller.root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if ((event.target as HTMLElement | null)?.closest('button')) return;
    event.preventDefault();
    act(briefing.next());
  });

  const handle: CouchBriefingHandle = {
    briefing,
    ready(seat, skip) {
      if (current !== handle) return;
      act(briefing.ready(seat, skip));
    },
    close() {
      if (current !== handle) return;
      closing = true;
      current = null;
      controller.close();
    },
  };
  current = handle;
  paint();
  controller.open({ trigger: request.trigger ?? null });
  next.focus();
  return handle;
}
