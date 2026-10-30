import type { RuntimeValue } from '../runtimeTypes.ts';
// Shared accessible modal shell for Garage, Scene Studio, Gallery, and HUD UI.
// Content remains owned by callers; this module owns focus, dismissal, scroll
// locking, and the visual treatment so dialogs do not drift into bespoke
// popovers with unreadably small type.

import { ensureFonts } from './fonts.ts';
import { uiIconSVG } from './uiIcons.ts';
import { t } from './i18n.ts';
import { ensureStyle } from './styleLayers.ts';
import { closeSurface, openSurface, type TransientSurface } from './components/surfaceStack.ts';

/** Reduce motion: the player's choice on :root (data-motion reduce or full, src/ui/accessibilityPreferences.ts), or the
 *  OS while they follow it. Inline: the public pages load this modal and never carry the accessibility core. */
function reducedMotion(): boolean {
  const choice = document.documentElement?.dataset.motion;
  return choice === 'reduce' || (choice !== 'full' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

export const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const MODAL_SIZES = new Set(['small', 'medium', 'large', 'wide']);

/** The kit's toasts (components/notice.ts): one shown over a contained surface stays in its Tab ring. */
const TOAST_SELECTOR = '.cot-c-notice--toast';

/** Shared keyboard boundary for the modal shell and in-battle Settings. The ring is the panel's controls, then those of
 *  any toast shown outside it (an error's Retry raised over a modal); Tab moves natively inside each and wraps between them. */
export function containModalTab(event: KeyboardEvent, panel: HTMLElement, fallback: HTMLElement): void {
  if (event.key !== 'Tab') return;
  const reachable = (root: HTMLElement): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR)]
    .filter((node) => !node.hidden && node.getClientRects().length && node.getAttribute('aria-hidden') !== 'true');
  const toasts = [...document.querySelectorAll<HTMLElement>(TOAST_SELECTOR)].filter((toast) => !panel.contains(toast));
  const rings = [panel, ...toasts].map((root) => ({ root, focusable: reachable(root) }))
    .filter((ring, index) => index === 0 || ring.focusable.length);
  const active = document.activeElement;
  const at = rings.findIndex((ring) => ring.root.contains(active));
  const edge = (index: number, end: boolean): HTMLElement => {
    const { focusable } = rings[(index + rings.length) % rings.length];
    return (end ? focusable.at(-1) : focusable[0]) || fallback;
  };
  let next: HTMLElement | null = null;
  if (at < 0) next = edge(event.shiftKey ? -1 : 0, event.shiftKey);
  else if (event.shiftKey ? active === edge(at, false) : active === edge(at, true)) next = edge(at + (event.shiftKey ? -1 : 1), event.shiftKey);
  if (!next) return;
  event.preventDefault();
  next.focus({ preventScroll: true });
}
export type ModalSize = 'small' | 'medium' | 'large' | 'wide';

interface ModalOpenOptions {
  trigger?: HTMLElement | null;
}

interface ModalCloseOptions {
  restoreFocus?: boolean;
  immediate?: boolean;
}

export interface ModalController {
  root: HTMLDivElement;
  panel: HTMLElement;
  header: HTMLElement;
  body: HTMLDivElement;
  footer: HTMLElement;
  closeButton: HTMLButtonElement;
  isOpen(): boolean;
  setTitle(value: RuntimeValue): void;
  setEyebrow(value: RuntimeValue): void;
  setSubtitle(value: RuntimeValue): void;
  open(options?: ModalOpenOptions): void;
  close(options?: ModalCloseOptions): void;
  dispose(): void;
}

interface ModalOptions {
  title?: string;
  /** Retired (owner UI rules, 2026-10-22: no eyebrows): accepted for callers, never drawn. */
  eyebrow?: string;
  subtitle?: string;
  size?: ModalSize | string;
  closeLabel?: string;
  className?: string;
  onOpen?: ((controller: ModalController) => void) | null;
  onClose?: ((controller: ModalController) => void) | null;
  /** Whether the modal holds edits a close would drop: while it does, a press on the backdrop leaves it open (Esc and the
   *  close button still close it, on purpose). */
  unsaved?: (() => boolean) | null;
  /** Its transient-surface id (src/ui/transientSurfaceRegistry.ts); 'modal' for a modal no census names. */
  surface?: string;
}

let serial = 0;
let activeModal: ModalController | null = null;
let savedBodyOverflow: string | null = null;
let modalDismissGuardUntil = 0;

export function isAnyModalOpen() {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return !!activeModal || now < modalDismissGuardUntil;
}

export function normalizeModalSize(value: RuntimeValue): ModalSize {
  return typeof value === 'string' && MODAL_SIZES.has(value) ? value as ModalSize : 'medium';
}

// The one modal (SPEC 6.2): a plate over a dimmed scene, on the Premiere tokens (brand-ui 247, the consistency pass): no
// glass, no top rule, no eyebrow; the close is a ghost icon button on the kit's tokens, and the footer's buttons are the
// kit's own (cot-c-btn, src/ui/components/components.css; this sheet sits in the surfaces layer, over the kit's).
const CSS = `
.cot-modal-root,.cot-modal{box-sizing:border-box;min-width:0}
.cot-modal-root{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;padding:clamp(12px,3vw,38px);
  font-family:var(--font-ui);color:var(--ink-1);opacity:0;pointer-events:none;
  transition:opacity var(--dur-base) var(--ease-enter)}
.cot-modal-root[hidden]{display:none}.cot-modal-root.is-open{opacity:1;pointer-events:auto}
.cot-modal-backdrop{position:absolute;inset:0;background:oklch(from var(--scrim) l c h / .8)}
.cot-modal{--cot-modal-max:680px;position:relative;display:flex;flex-direction:column;width:min(100%,var(--cot-modal-max));
  max-height:min(88vh,900px);overflow:hidden;border-radius:var(--plate-radius);background:var(--surface-plate);box-shadow:var(--e4);
  transform:translateY(12px);transition:transform var(--dur-screen) var(--ease-enter)}
.cot-modal-root.is-open .cot-modal{transform:none}
.cot-modal[data-size='small']{--cot-modal-max:500px}.cot-modal[data-size='large']{--cot-modal-max:900px}
.cot-modal[data-size='wide']{--cot-modal-max:1120px}
.cot-modal__header{position:relative;z-index:2;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:var(--s4);
  padding:var(--s5) clamp(18px,3vw,30px) var(--s4);border-bottom:1px solid var(--line-1)}
.cot-modal__title{margin:0;color:var(--ink-1);font:600 clamp(21px,3vw,28px)/1.08 var(--font-display);letter-spacing:var(--track-title)}
.cot-modal__subtitle{max-width:720px;margin:var(--s2) 0 0;color:var(--ink-3);font:400 max(14px,var(--fs-14))/1.5 var(--font-body)}
.cot-modal__close{width:40px;height:40px;display:grid;place-items:center;padding:0;border:0;border-radius:var(--control-radius);
  background:transparent;color:var(--ink-2);cursor:pointer;
  transition:color var(--dur-fast) var(--ease-enter),background-color var(--dur-fast) var(--ease-enter)}
.cot-modal__close:hover{color:var(--ink-1);background:var(--surface-hover)}
.cot-modal__close:focus-visible{outline:none;box-shadow:var(--focus-ring)}
.cot-modal__close:active{transform:translateY(var(--btn-press-drop))}
.cot-modal__body{min-height:0;overflow:auto;overscroll-behavior:contain;padding:clamp(18px,3vw,30px);scrollbar-width:thin;
  scrollbar-color:var(--line-3) transparent}
.cot-modal__body::-webkit-scrollbar{width:7px}.cot-modal__body::-webkit-scrollbar-track{background:transparent}
.cot-modal__body::-webkit-scrollbar-thumb{background:var(--line-3)}
.cot-modal__footer{display:flex;align-items:center;justify-content:flex-end;gap:var(--s2);padding:var(--s3) clamp(18px,3vw,30px);
  border-top:1px solid var(--line-1)}
.cot-modal__footer:empty{display:none}
body[data-cot-width='phone'] .cot-modal-root{padding:var(--s2);place-items:end center}
body[data-cot-width='phone'] .cot-modal{width:100%;max-height:calc(var(--cot-viewport-height,100dvh) - 16px)}
body[data-cot-width='phone'] .cot-modal__header{padding:var(--s4) var(--s4) var(--s3)}
body[data-cot-width='phone'] .cot-modal__body{padding:var(--s4)}
body[data-cot-width='phone'] .cot-modal__footer{padding:var(--s3) var(--s4);flex-wrap:wrap}
body[data-cot-width='phone'] .cot-modal__title{font-size:22px}
body[data-cot-width='phone'] .cot-modal__subtitle{font-size:max(13px,var(--fs-13))}
body[data-cot-input='coarse'] .cot-modal__close{min-width:44px;min-height:44px}
body[data-cot-input='coarse'] .cot-modal__footer .cot-c-btn{--h:var(--cot-control-floor)}
@media(prefers-reduced-motion:reduce){.cot-modal-root,.cot-modal,.cot-modal__close{transition:none!important}}
`;

function ensureCss() {
  ensureFonts();
  ensureStyle('cot-shared-modal-css', CSS, 'surfaces');
}

function lockBody() {
  if (savedBodyOverflow != null) return;
  savedBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
}

function unlockBody() {
  if (savedBodyOverflow == null) return;
  document.body.style.overflow = savedBodyOverflow;
  savedBodyOverflow = null;
}

/** Create a reusable modal controller. Callers populate `body` and `footer`. */
export function createModal({
  title = '', subtitle = '', size = 'medium',
  closeLabel = '', className = '', onOpen = null, onClose = null, unsaved = null, surface: surfaceId = 'modal',
}: ModalOptions = {}): ModalController {
  ensureCss();
  const id = `cot-modal-${++serial}`;
  const root = document.createElement('div');
  root.className = 'cot-modal-root';
  root.hidden = true;
  const backdrop = document.createElement('div');
  backdrop.className = 'cot-modal-backdrop';
  const panel = document.createElement('section');
  panel.className = `cot-modal${className ? ` ${className}` : ''}`;
  panel.dataset.size = normalizeModalSize(size);
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', `${id}-title`);
  if (subtitle) panel.setAttribute('aria-describedby', `${id}-subtitle`);

  const header = document.createElement('header');
  header.className = 'cot-modal__header';
  const headingWrap = document.createElement('div');
  const titleEl = document.createElement('h2');
  titleEl.id = `${id}-title`;
  titleEl.className = 'cot-modal__title';
  titleEl.textContent = title || t('modal.titleDefault');
  const subtitleEl = document.createElement('p');
  subtitleEl.id = `${id}-subtitle`;
  subtitleEl.className = 'cot-modal__subtitle';
  subtitleEl.textContent = subtitle;
  subtitleEl.hidden = !subtitle;
  headingWrap.append(titleEl, subtitleEl);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'cot-modal__close';
  closeButton.innerHTML = uiIconSVG('close', 22);
  closeButton.setAttribute('aria-label', closeLabel || t('modal.closeLabel'));
  const body = document.createElement('div');
  body.className = 'cot-modal__body';
  const footer = document.createElement('footer');
  footer.className = 'cot-modal__footer';
  header.append(headingWrap, closeButton);
  panel.append(header, body, footer);
  root.append(backdrop, panel);
  document.body.appendChild(root);

  let trigger: HTMLElement | null = null;
  let disposed = false;
  let closeTimer = 0;
  let openRevision = 0;
  // a transient surface (components/surfaceStack.ts), modal: its backdrop answers a press outside it, Escape is the stack's
  // (one press closes the top surface), and one opened from elsewhere replaces it as it fades
  const surface: TransientSurface = {
    id: surfaceId,
    element: () => panel,
    owns: (node) => !!trigger?.contains(node),
    close: (reason) => controller.close({ restoreFocus: reason === 'escape' }),
    modal: true,
  };
  const controller: ModalController = {
    root, panel, header, body, footer, closeButton,
    isOpen: () => activeModal === controller,
    setTitle(value: RuntimeValue) { titleEl.textContent = String(value || t('modal.titleDefault')); },
    // eyebrows are retired (owner UI rules, 2026-10-22); the setter stays for callers and draws nothing
    setEyebrow(_value: RuntimeValue) { /* no eyebrow */ },
    setSubtitle(value: RuntimeValue) {
      subtitleEl.textContent = String(value || '');
      subtitleEl.hidden = !value;
      if (value) panel.setAttribute('aria-describedby', subtitleEl.id);
      else panel.removeAttribute('aria-describedby');
    },
    open({ trigger: nextTrigger = null }: ModalOpenOptions = {}) {
      if (disposed) return;
      const revision = ++openRevision;
      window.clearTimeout(closeTimer);
      if (activeModal && activeModal !== controller) activeModal.close({ restoreFocus: false, immediate: true });
      trigger = nextTrigger || (document.activeElement instanceof HTMLElement
        ? document.activeElement : null);
      // Native dialogs make nodes outside their top layer inert. Keep contextual
      // help inside the trigger's open dialog so it remains visible and focusable.
      const host = trigger?.closest('dialog[open]') || document.body;
      if (root.parentElement !== host) host.appendChild(root);
      openSurface(surface, trigger);
      body.scrollTop = 0;
      root.hidden = false;
      activeModal = controller;
      lockBody();
      requestAnimationFrame(() => {
        if (disposed || revision !== openRevision || activeModal !== controller || root.hidden) return;
        root.classList.add('is-open');
        const preferred = body.querySelector<HTMLElement>('[autofocus]') || closeButton;
        preferred.focus({ preventScroll: true });
      });
      onOpen?.(controller);
    },
    close({ restoreFocus = true, immediate = false }: ModalCloseOptions = {}) {
      if (disposed || (root.hidden && activeModal !== controller)) return;
      openRevision++;
      window.clearTimeout(closeTimer);
      closeSurface(surface);
      root.classList.remove('is-open');
      const wasActive = activeModal === controller;
      if (wasActive) activeModal = null;
      if (wasActive) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        modalDismissGuardUntil = now + 180;
      }
      if (wasActive) unlockBody();
      const finish = () => {
        root.hidden = true;
        if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
        trigger = null;
      };
      if (immediate || reducedMotion()) finish();
      else closeTimer = window.setTimeout(finish, 210);
      onClose?.(controller);
    },
    dispose() {
      if (disposed) return;
      controller.close({ restoreFocus: false, immediate: true });
      disposed = true;
      root.remove();
    },
  };

  closeButton.addEventListener('click', () => controller.close());
  // a stray press beside the plate never drops unsaved edits
  backdrop.addEventListener('pointerdown', (event) => {
    if (event.target === backdrop && !unsaved?.()) controller.close();
  });
  panel.addEventListener('keydown', (event) => { containModalTab(event, panel, closeButton); });
  return controller;
}
