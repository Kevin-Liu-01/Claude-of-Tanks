// readyControl.ts — the room's one ready control and roster tag (owner 2026-11-19). Copyright © 2026 Kevin B. Liu.
//
// Three surfaces toggle a seat's readiness: the Play menu's lobby, the Garage's room strip and the end screen. Each
// used its own words, and two of them named the state the press would leave ("Ready" while unready and ready alike;
// "NOT READY" on the button that cancels). One view now says what the seat is and what a press does:
//   unready  → "Ready up"                       (a press readies)
//   ready    → ✓ "Ready" · "Waiting for 2 · Cancel" / "All ready · Cancel"   (pressed; a press cancels)
//   watching → "Watching"                        (a spectator has no readiness)
// The roster tag names every other seat's state the same way (ready, not ready, offline, watching).
// Styles: components.css `.cot-ready` and `.cot-ready-tag`; each surface keeps its own button frame.

import { t } from '../i18n.ts';
import { uiIconSVG } from '../uiIcons.ts';
import { esc } from './components.ts';

export type ReadyControlState = 'idle' | 'ready' | 'watching';

export interface ReadyControlInput {
  ready: boolean;
  spectator?: boolean;
  /** Commanders still unready besides this seat; absent when the surface does not know. */
  waitingOn?: number | null;
}

export interface ReadyControlView {
  state: ReadyControlState;
  label: string;
  /** The second line: what is pending and what a press does ('' when the label says it all). */
  hint: string;
  pressed: boolean;
  ariaLabel: string;
}

export function readyControlView({ ready, spectator = false, waitingOn = null }: ReadyControlInput): ReadyControlView {
  if (spectator) {
    const label = t('readyControl.watching');
    return { state: 'watching', label, hint: '', pressed: false, ariaLabel: label };
  }
  if (!ready) {
    return { state: 'idle', label: t('readyControl.readyUp'), hint: '', pressed: false, ariaLabel: t('readyControl.aria.readyUp') };
  }
  const pending = waitingOn == null ? '' : waitingOn > 0 ? t('readyControl.waitingFor', { count: waitingOn }) : t('readyControl.allReady');
  const cancel = t('readyControl.cancel');
  return {
    state: 'ready', label: t('readyControl.ready'), hint: pending ? `${pending} · ${cancel}` : cancel, pressed: true,
    ariaLabel: t('readyControl.aria.cancel'),
  };
}

/**
 * Draw the view into a surface's own button: a check before the label when ready, the hint under it, and the ARIA
 * state (aria-pressed, a label that names the press). `data-ready-state` lets each surface style the three states.
 */
export function renderReadyControl(button: HTMLButtonElement, input: ReadyControlInput, iconSize = 16): ReadyControlView {
  const view = readyControlView(input);
  // (ui-motion-275) the check lands with one emphasis beat as the seat turns ready (cot-m-beat, components/surfaceMotion.css),
  // never on a redraw of a seat already ready (a count of the others changing)
  const landed = button.dataset.readyState === 'idle' && view.state === 'ready';
  button.classList.add('cot-ready');
  button.dataset.readyState = view.state;
  button.innerHTML = `${view.state === 'ready' ? uiIconSVG('check', iconSize, 'currentColor', landed ? 'cot-ready__mark cot-m-beat' : 'cot-ready__mark') : ''}` +
    `<span class="cot-ready__copy"><span class="cot-ready__label cot-c-btn__label">${esc(view.label)}</span>` +
    `${view.hint ? `<small class="cot-ready__hint">${esc(view.hint)}</small>` : ''}</span>`;
  if (view.state === 'watching') button.removeAttribute('aria-pressed');
  else button.setAttribute('aria-pressed', String(view.pressed));
  button.setAttribute('aria-label', view.hint ? `${view.ariaLabel} ${view.hint}` : view.ariaLabel);
  return view;
}

/** Commanders (not spectators) other than `selfId` that are not ready. */
export function waitingOnOthers(players: readonly { id: string; team: string; ready: boolean }[], selfId: string | undefined): number {
  return players.filter((player) => player.id !== selfId && player.team !== 'spectator' && !player.ready).length;
}

export type ReadyTagState = 'ready' | 'waiting' | 'offline' | 'watching';

export function readyTagState(player: { ready: boolean; connected?: boolean; team: string }): ReadyTagState {
  if (player.connected === false) return 'offline';
  if (player.team === 'spectator') return 'watching';
  return player.ready ? 'ready' : 'waiting';
}

const TAG_ICON: Record<ReadyTagState, string> = { ready: 'check', waiting: 'clock', offline: 'close', watching: 'scope' };

/** A roster row's readiness: a glyph and a word, in every surface's roster (`.cot-ready-tag[data-ready-state]`). */
export function readyTagHTML(player: { ready: boolean; connected?: boolean; team: string }, iconSize = 13): string {
  const state = readyTagState(player);
  return `<span class="cot-ready-tag" data-ready-state="${state}">${uiIconSVG(TAG_ICON[state], iconSize)}` +
    `<span>${esc(t(`readyControl.tag.${state}`))}</span></span>`;
}
