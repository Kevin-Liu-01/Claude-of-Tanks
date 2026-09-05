import type { RuntimeValue } from '../runtimeTypes.ts';
// Accessible modal-backed context help shared by Garage and Scene Studio.
// Info triggers deliberately open on activation (never hover) so the same
// interaction works with mouse, keyboard, touch, and gamepad-emulated focus.

import { createModal } from './modal.ts';
import type { ModalController, ModalSize } from './modal.ts';
import { uiIconSVG } from './uiIcons.ts';
import { t } from './i18n.ts';

type LiveValue<T> = T | (() => T);
type InfoImageFit = 'cover' | 'contain';

interface InfoImageRecord {
  src?: RuntimeValue;
  alt?: RuntimeValue;
  fit?: RuntimeValue;
  caption?: RuntimeValue;
}

export type InfoImage = string | InfoImageRecord | null | undefined;
export type InfoImageSource = LiveValue<InfoImage>;

export interface ResolvedInfoImage {
  src: string;
  alt: string;
  fit: InfoImageFit;
  caption: string;
}

interface InfoImageDefaults {
  alt?: string;
  fit?: InfoImageFit;
  caption?: string;
}

interface InfoSection {
  icon?: string;
  title?: string;
  text?: string;
}

export interface InfoButtonOptions {
  label?: string;
  title?: string;
  text?: LiveValue<string>;
  json?: LiveValue<RuntimeValue> | null;
  className?: string;
  eyebrow?: LiveValue<string>;
  subtitle?: LiveValue<string>;
  size?: ModalSize;
  image?: InfoImageSource | null;
  images?: LiveValue<InfoImage | InfoImage[]> | null;
  imageAlt?: string;
  imageFit?: InfoImageFit;
  imageCaption?: string;
  sections?: LiveValue<InfoSection[] | null> | null;
}

export interface InfoButton extends HTMLButtonElement {
  disposeInfo(): void;
}

const CSS = `
.cot-info-trigger{position:relative;box-sizing:border-box;width:20px;height:20px;min-width:20px;min-height:20px;
  max-width:20px;max-height:20px;margin:0;padding:0;display:inline-grid;overflow:visible;line-height:1;place-items:center;
  flex:0 0 20px;border:1px solid rgba(154,174,189,.3);border-radius:50%;background:rgba(8,12,16,.76);
  color:#9aabb8;cursor:pointer;text-transform:none;letter-spacing:0;vertical-align:middle;
  transition:color .14s,border-color .14s,background .14s,transform .12s}
.cot-info-trigger::after{content:"";position:absolute;inset:-5px;border-radius:50%}.cot-info-trigger__icon{display:block;pointer-events:none}
.cot-info-trigger:hover,.cot-info-trigger:focus-visible,.cot-info-trigger[aria-expanded='true']{color:#ffd27a;border-color:#f0a030;
  background:rgba(240,160,48,.13);outline:none}.cot-info-trigger:active{transform:scale(.94)}
.cot-info-modal{display:grid;gap:22px}.cot-info-modal__lead{max-width:760px;margin:0;color:#bcc9d2;font-size:15px;line-height:1.68}
.cot-info-modal__media{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.cot-info-modal__media[data-count='1']{grid-template-columns:1fr}.cot-info-modal__media[data-count='3'] figure:first-child{grid-row:span 2}
.cot-info-modal__media figure{position:relative;min-height:220px;margin:0;overflow:hidden;border:1px solid rgba(154,174,189,.22);
  background:radial-gradient(circle at 50% 35%,rgba(75,94,108,.22),transparent 62%),#070b0e}
.cot-info-modal__media img{display:block;width:100%;height:100%;min-height:220px;max-height:390px;object-fit:cover;object-position:center;
  filter:saturate(.92) contrast(1.03)}.cot-info-modal__media figure[data-fit='contain'] img{object-fit:contain;padding:16px;
  background:linear-gradient(145deg,rgba(13,19,24,.97),rgba(4,7,9,.99))}
.cot-info-modal__media figure::after{content:"";position:absolute;inset:55% 0 0;pointer-events:none;
  background:linear-gradient(180deg,transparent,rgba(3,6,8,.9))}
.cot-info-modal__media figcaption{position:absolute;z-index:1;left:14px;right:14px;bottom:12px;color:#dce5eb;
  font-size:10px;font-weight:850;line-height:1.35;letter-spacing:.13em;text-transform:uppercase}
.cot-info-modal__sections{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px}
.cot-info-modal__section{display:grid;grid-template-columns:30px minmax(0,1fr);gap:10px;padding:14px;border:1px solid rgba(154,174,189,.18);
  background:rgba(8,12,16,.5)}.cot-info-modal__section-icon{color:#e6a03a}.cot-info-modal__section h3{margin:0 0 5px;color:#e4ebf0;
  font-size:12px;line-height:1.25;letter-spacing:.1em;text-transform:uppercase}.cot-info-modal__section p{margin:0;color:#91a2ae;font-size:12px;line-height:1.55}
.cot-info-modal__json{max-height:360px;margin:0;overflow:auto;padding:16px;border:1px solid rgba(154,174,189,.18);
  background:rgba(1,4,6,.64);color:#cbd7df;font:500 12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;tab-size:2;white-space:pre}
body[data-cot-width='phone'] .cot-info-modal{gap:15px}body[data-cot-width='phone'] .cot-info-modal__lead{font-size:14px}
body[data-cot-width='phone'] .cot-info-modal__media{grid-template-columns:1fr!important}
body[data-cot-width='phone'] .cot-info-modal__media figure{min-height:180px}
body[data-cot-width='phone'] .cot-info-modal__media img{min-height:180px;max-height:280px}
body[data-cot-width='phone'] .cot-info-modal__media[data-count='3'] figure:first-child{grid-row:auto}
@media(hover:hover){.cot-info-trigger:hover{transform:translateY(-1px)}}
@media(prefers-reduced-motion:reduce){.cot-info-trigger{transition:none}}
`;

function ensureCss() {
  if (document.getElementById('cot-context-info-css')) return;
  const style = document.createElement('style');
  style.id = 'cot-context-info-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function clipboardWrite(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
  return Promise.resolve();
}

/** Resolve static or live media options without coupling callers to the DOM. */
export function resolveInfoImage(
  image: InfoImageSource,
  { alt = '', fit = 'cover', caption = '' }: InfoImageDefaults = {},
): ResolvedInfoImage | null {
  let value: InfoImage;
  try {
    value = typeof image === 'function' ? image() : image;
  } catch {
    return null;
  }
  if (!value) return null;
  if (typeof value === 'string') return { src: value, alt, fit, caption };
  if (!value.src) return null;
  return {
    src: String(value.src),
    alt: String(value.alt ?? alt),
    fit: value.fit === 'contain' ? 'contain' : fit === 'contain' ? 'contain' : 'cover',
    caption: String(value.caption ?? caption),
  };
}

/** Resolve a live gallery and discard missing/invalid entries. */
export function resolveInfoImages(
  images: LiveValue<InfoImage | InfoImage[]>,
  fallback: InfoImageDefaults = {},
): ResolvedInfoImage[] {
  let values: InfoImage | InfoImage[];
  try {
    values = typeof images === 'function' ? images() : images;
  } catch {
    return [];
  }
  if (!Array.isArray(values)) values = values ? [values] : [];
  return values
    .map((value) => resolveInfoImage(value, fallback))
    .filter((value): value is ResolvedInfoImage => value !== null);
}

function resolveValue<T>(value: LiveValue<T>, fallback: T): T {
  try { return typeof value === 'function' ? (value as () => T)() : value; } catch { return fallback; }
}

/** Create an icon button that opens a rich shared modal dossier. */
export function createInfoButton({
  label, title, text = '', json = null, className = '', eyebrow = 'Field manual',
  subtitle = '', size = 'large', image = null, images = null,
  imageAlt = '', imageFit = 'cover', imageCaption = '', sections = null,
}: InfoButtonOptions = {}): InfoButton {
  ensureCss();
  const button = document.createElement('button') as InfoButton;
  button.type = 'button';
  button.className = `cot-info-trigger${className ? ` ${className}` : ''}`;
  button.innerHTML = uiIconSVG('info', 13, 'currentColor', 'cot-info-trigger__icon');
  button.setAttribute('aria-label', label || `About ${title || 'this section'}`);
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');

  let modal: ModalController | null = null;
  let copyButton: HTMLButtonElement | null = null;
  const content = () => JSON.stringify(json == null ? {} : resolveValue(json, {}), null, 2) ?? '{}';
  const ensureModal = (): ModalController => {
    if (modal) return modal;
    modal = createModal({
      title: title || 'More information',
      eyebrow: resolveValue(eyebrow, 'Field manual'),
      subtitle: resolveValue(subtitle, ''),
      size,
      className: 'cot-info-dialog',
      onOpen: () => button.setAttribute('aria-expanded', 'true'),
      onClose: () => button.setAttribute('aria-expanded', 'false'),
    });
    if (json) {
      copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.className = 'cot-modal__button';
      copyButton.innerHTML = `${uiIconSVG('copy', 16)}<span>${t('contextInfo.copyJson')}</span>`;
      copyButton.addEventListener('click', () => {
        clipboardWrite(content()).then(() => {
          const labelElement = copyButton?.querySelector('span');
          if (labelElement) labelElement.textContent = t('contextInfo.copied');
          window.setTimeout(() => {
            const connectedLabel = copyButton?.isConnected ? copyButton.querySelector('span') : null;
            if (connectedLabel) connectedLabel.textContent = t('contextInfo.copyJson');
          }, 1200);
        }).catch(() => {
          const labelElement = copyButton?.querySelector('span');
          if (labelElement) labelElement.textContent = t('contextInfo.copyFailed');
        });
      });
      modal.footer.appendChild(copyButton);
    }
    return modal;
  };

  const render = () => {
    const dialog = ensureModal();
    dialog.setTitle(title || 'More information');
    dialog.setEyebrow(resolveValue(eyebrow, 'Field manual'));
    dialog.setSubtitle(resolveValue(subtitle, ''));
    dialog.body.textContent = '';
    const root = document.createElement('article');
    root.className = 'cot-info-modal';
    const mediaSource = images || image;
    const mediaValues = mediaSource
      ? resolveInfoImages(mediaSource, { alt: imageAlt, fit: imageFit, caption: imageCaption })
      : [];
    if (mediaValues.length) {
      const media = document.createElement('div');
      media.className = 'cot-info-modal__media';
      media.dataset.count = String(Math.min(3, mediaValues.length));
      for (const item of mediaValues.slice(0, 4)) {
        const figure = document.createElement('figure');
        figure.dataset.fit = item.fit;
        const img = document.createElement('img');
        img.src = item.src;
        img.alt = item.alt;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.addEventListener('error', () => {
          figure.remove();
          media.dataset.count = String(media.children.length);
          if (!media.children.length) media.remove();
        });
        const caption = document.createElement('figcaption');
        caption.textContent = item.caption;
        figure.append(img, caption);
        media.appendChild(figure);
      }
      root.appendChild(media);
    }
    const textValue = String(resolveValue(text, '') || '');
    if (textValue) {
      const lead = document.createElement('p');
      lead.className = 'cot-info-modal__lead';
      lead.textContent = textValue;
      root.appendChild(lead);
    }
    const sectionValues = sections == null ? [] : resolveValue(sections, []) || [];
    if (sectionValues.length) {
      const sectionGrid = document.createElement('div');
      sectionGrid.className = 'cot-info-modal__sections';
      for (const entry of sectionValues) {
        if (!entry) continue;
        const card = document.createElement('section');
        card.className = 'cot-info-modal__section';
        const icon = document.createElement('span');
        icon.className = 'cot-info-modal__section-icon';
        icon.innerHTML = uiIconSVG(entry.icon || 'info', 24);
        const copy = document.createElement('div');
        const heading = document.createElement('h3');
        heading.textContent = entry.title || 'Details';
        const paragraph = document.createElement('p');
        paragraph.textContent = entry.text || '';
        copy.append(heading, paragraph);
        card.append(icon, copy);
        sectionGrid.appendChild(card);
      }
      root.appendChild(sectionGrid);
    }
    if (json) {
      const pre = document.createElement('pre');
      pre.className = 'cot-info-modal__json';
      pre.textContent = content();
      root.appendChild(pre);
    }
    dialog.body.appendChild(root);
  };

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    render();
    ensureModal().open({ trigger: button });
  });
  button.disposeInfo = () => {
    modal?.dispose();
    modal = null;
    copyButton = null;
  };
  return button;
}
