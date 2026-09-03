import type { RuntimeValue } from '../runtimeTypes.ts';
// Shared accessible modal shell for Garage, Scene Studio, Gallery, and HUD UI.
// Content remains owned by callers; this module owns focus, dismissal, scroll
// locking, and the visual treatment so dialogs do not drift into bespoke
// popovers with unreadably small type.

import { FONT_STACK, FONT_COND, ensureFonts } from './fonts.ts';
import { uiIconSVG } from './uiIcons.ts';

export const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const MODAL_SIZES = new Set(['small', 'medium', 'large', 'wide']);
export type ModalSize = 'small' | 'medium' | 'large' | 'wide';

export interface ModalOpenOptions {
  trigger?: HTMLElement | null;
}

export interface ModalCloseOptions {
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

export interface ModalOptions {
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  size?: ModalSize | string;
  closeLabel?: string;
  className?: string;
  onOpen?: ((controller: ModalController) => void) | null;
  onClose?: ((controller: ModalController) => void) | null;
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

const CSS = `
.cot-modal-root{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;padding:clamp(12px,3vw,38px);
  font-family:${FONT_STACK};color:#e9eff4;opacity:0;pointer-events:none;
  transition:opacity var(--cot-motion-base) var(--cot-ease-out)}
.cot-modal-root[hidden]{display:none}.cot-modal-root.is-open{opacity:1;pointer-events:auto}
.cot-modal-backdrop{position:absolute;inset:0;background:rgba(1,4,7,.78);backdrop-filter:blur(9px) saturate(.72)}
.cot-modal{--cot-modal-max:680px;position:relative;display:flex;flex-direction:column;width:min(100%,var(--cot-modal-max));
  max-height:min(88vh,900px);overflow:hidden;border:1px solid rgba(165,183,198,.28);border-top-color:rgba(240,176,74,.76);
  background:linear-gradient(155deg,rgba(16,23,29,.99),rgba(5,8,11,.995));box-shadow:0 28px 90px rgba(0,0,0,.76);
  transform:translateY(12px) scale(.992);
  transition:transform var(--cot-motion-slow) var(--cot-ease-drawer)}
.cot-modal-root.is-open .cot-modal{transform:translateY(0) scale(1)}
.cot-modal[data-size='small']{--cot-modal-max:500px}.cot-modal[data-size='large']{--cot-modal-max:900px}
.cot-modal[data-size='wide']{--cot-modal-max:1120px}
.cot-modal::before{content:"";position:absolute;z-index:3;left:0;top:0;width:96px;height:2px;
  background:linear-gradient(90deg,#f0a030,rgba(240,160,48,0));pointer-events:none}
.cot-modal__header{position:relative;z-index:2;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:18px;
  padding:20px clamp(18px,3vw,30px) 17px;border-bottom:1px solid rgba(165,183,198,.17);background:rgba(8,12,16,.88)}
.cot-modal__eyebrow{display:flex;align-items:center;gap:8px;margin-bottom:6px;color:#e5a542;font:900 10px/1 ${FONT_COND};
  letter-spacing:.22em;text-transform:uppercase}.cot-modal__eyebrow::before{content:"";width:18px;height:2px;background:#e69a2d}
.cot-modal__title{margin:0;color:#f3f6f8;font:800 clamp(21px,3vw,30px)/1.08 ${FONT_STACK};letter-spacing:-.025em}
.cot-modal__subtitle{max-width:720px;margin:8px 0 0;color:#8fa0ad;font:650 13px/1.5 ${FONT_STACK}}
.cot-modal__close{width:40px;height:40px;display:grid;place-items:center;padding:0;border:1px solid rgba(165,183,198,.24);
  background:rgba(4,7,10,.64);color:#9cadb9;cursor:pointer;
  transition:color var(--cot-motion-fast) ease,border-color var(--cot-motion-fast) ease,
    background-color var(--cot-motion-fast) ease,transform var(--cot-motion-fast) var(--cot-ease-out)}
.cot-modal__close:hover,.cot-modal__close:focus-visible{color:#ffd27a;border-color:#f0a030;background:rgba(240,160,48,.1);outline:none}
.cot-modal__close:active{transform:scale(.96)}
.cot-modal__body{min-height:0;overflow:auto;overscroll-behavior:contain;padding:clamp(18px,3vw,30px);scrollbar-width:thin;
  scrollbar-color:rgba(230,154,45,.45) rgba(8,11,14,.6)}
.cot-modal__body::-webkit-scrollbar{width:7px}.cot-modal__body::-webkit-scrollbar-track{background:rgba(8,11,14,.6)}
.cot-modal__body::-webkit-scrollbar-thumb{background:rgba(230,154,45,.42)}
.cot-modal__footer{display:flex;align-items:center;justify-content:flex-end;gap:9px;padding:13px clamp(18px,3vw,30px);
  border-top:1px solid rgba(165,183,198,.17);background:rgba(7,11,14,.94)}
.cot-modal__footer:empty{display:none}
.cot-modal__button{min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 16px;
  border:1px solid rgba(165,183,198,.3);background:rgba(10,15,19,.86);color:#c5d0d8;cursor:pointer;
  font:900 10px/1 ${FONT_COND};letter-spacing:.13em;text-transform:uppercase;
  transition:color var(--cot-motion-fast) ease,border-color var(--cot-motion-fast) ease,
    background-color var(--cot-motion-fast) ease,transform var(--cot-motion-fast) var(--cot-ease-out)}
.cot-modal__button:hover,.cot-modal__button:focus-visible{border-color:#e69a2d;color:#ffd27a;background:rgba(230,154,45,.1);outline:none}
.cot-modal__button:active{transform:scale(.97)}.cot-modal__button--primary{border-color:#f0b04a;background:linear-gradient(#efaa45,#c8731d);color:#1c1003}
.cot-modal__button--primary:hover,.cot-modal__button--primary:focus-visible{background:linear-gradient(#ffc164,#df8525);color:#120a02}
body[data-cot-width='phone'] .cot-modal-root{padding:8px;place-items:end center}
body[data-cot-width='phone'] .cot-modal{width:100%;max-height:calc(100dvh - 16px)}
body[data-cot-width='phone'] .cot-modal__header{padding:16px 16px 13px}
body[data-cot-width='phone'] .cot-modal__body{padding:16px}
body[data-cot-width='phone'] .cot-modal__footer{padding:11px 16px;flex-wrap:wrap}
body[data-cot-width='phone'] .cot-modal__title{font-size:22px}
body[data-cot-width='phone'] .cot-modal__subtitle{font-size:12px}
body[data-cot-width='phone'] .cot-modal__close{width:38px;height:38px}
@media(hover:hover){.cot-modal__button:hover,.cot-modal__close:hover{transform:translateY(-1px)}}
@media(prefers-reduced-motion:reduce){.cot-modal-root,.cot-modal,.cot-modal__button,.cot-modal__close{transition:none!important}}
`;

function ensureCss() {
  ensureFonts();
  if (document.getElementById('cot-shared-modal-css')) return;
  const style = document.createElement('style');
  style.id = 'cot-shared-modal-css';
  style.textContent = CSS;
  document.head.appendChild(style);
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
  title = 'Details', eyebrow = 'Field manual', subtitle = '', size = 'medium',
  closeLabel = 'Close dialog', className = '', onOpen = null, onClose = null,
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
  const eyebrowEl = document.createElement('div');
  eyebrowEl.className = 'cot-modal__eyebrow';
  eyebrowEl.textContent = eyebrow;
  const titleEl = document.createElement('h2');
  titleEl.id = `${id}-title`;
  titleEl.className = 'cot-modal__title';
  titleEl.textContent = title;
  const subtitleEl = document.createElement('p');
  subtitleEl.id = `${id}-subtitle`;
  subtitleEl.className = 'cot-modal__subtitle';
  subtitleEl.textContent = subtitle;
  subtitleEl.hidden = !subtitle;
  headingWrap.append(eyebrowEl, titleEl, subtitleEl);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'cot-modal__close';
  closeButton.innerHTML = uiIconSVG('close', 22);
  closeButton.setAttribute('aria-label', closeLabel);
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
  const controller: ModalController = {
    root, panel, header, body, footer, closeButton,
    isOpen: () => activeModal === controller,
    setTitle(value: RuntimeValue) { titleEl.textContent = String(value || 'Details'); },
    setEyebrow(value: RuntimeValue) { eyebrowEl.textContent = String(value || 'Field manual'); },
    setSubtitle(value: RuntimeValue) {
      subtitleEl.textContent = String(value || '');
      subtitleEl.hidden = !value;
      if (value) panel.setAttribute('aria-describedby', subtitleEl.id);
      else panel.removeAttribute('aria-describedby');
    },
    open({ trigger: nextTrigger = null }: ModalOpenOptions = {}) {
      if (disposed) return;
      window.clearTimeout(closeTimer);
      if (activeModal && activeModal !== controller) activeModal.close({ restoreFocus: false, immediate: true });
      trigger = nextTrigger || (document.activeElement instanceof HTMLElement
        ? document.activeElement : null);
      body.scrollTop = 0;
      root.hidden = false;
      activeModal = controller;
      lockBody();
      requestAnimationFrame(() => {
        root.classList.add('is-open');
        const preferred = body.querySelector<HTMLElement>('[autofocus]') || closeButton;
        preferred.focus({ preventScroll: true });
      });
      onOpen?.(controller);
    },
    close({ restoreFocus = true, immediate = false }: ModalCloseOptions = {}) {
      if (disposed || (root.hidden && activeModal !== controller)) return;
      window.clearTimeout(closeTimer);
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
      if (immediate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) finish();
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
  backdrop.addEventListener('pointerdown', (event) => {
    if (event.target === backdrop) controller.close();
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      controller.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR)]
      .filter((node) => !node.hidden && node.getClientRects().length && node.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) {
      event.preventDefault();
      closeButton.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  return controller;
}
