// Accessible, portal-mounted context help used by Garage, Scene Studio,
// Gallery, and game-rendered media.  The panel is fixed to the viewport so it
// cannot be clipped by the many scrolling/overflow-hidden workspaces.

import { uiIconSVG } from './uiIcons.js';

let serial = 0;
let active = null;
let hideTimer = 0;

const CSS = `
.cot-info-trigger{width:24px;height:24px;min-width:24px;min-height:24px;padding:0;display:inline-grid;
  place-items:center;flex:0 0 auto;border:1px solid rgba(154,174,189,.3);border-radius:50%;
  background:rgba(8,12,16,.76);color:#9aabb8;cursor:help;
  text-transform:none;letter-spacing:0;vertical-align:middle;transition:color .14s,border-color .14s,background .14s}
.cot-info-trigger__icon{display:block;pointer-events:none}
.cot-info-trigger:hover,.cot-info-trigger:focus-visible,.cot-info-trigger[aria-expanded='true']{
  color:#ffd27a;border-color:#f0a030;background:rgba(240,160,48,.13);outline:none}
.cot-info-popover{position:fixed;z-index:10020;width:min(360px,calc(100vw - 20px));max-height:min(520px,calc(100vh - 20px));
  overflow:auto;padding:0;color:#e6edf3;background:linear-gradient(155deg,rgba(17,23,29,.99),rgba(5,8,11,.995));
  border:1px solid rgba(240,176,74,.48);box-shadow:0 20px 64px rgba(0,0,0,.72);font-family:"ABC Monument Grotesk",Arial,sans-serif}
.cot-info-popover[hidden]{display:none}.cot-info-popover::before{content:"";position:absolute;left:0;top:0;width:48px;height:2px;background:#f0a030}
.cot-info-popover__head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:11px 12px 9px;
  border-bottom:1px solid rgba(154,174,189,.18);background:rgba(8,12,16,.97)}
.cot-info-popover__head strong{min-width:0;flex:1;color:#f1f5f8;font-size:10px;line-height:1.25;letter-spacing:.12em;text-transform:uppercase}
.cot-info-popover__copy{min-height:28px;padding:0 9px;border:1px solid rgba(240,176,74,.42);background:rgba(240,160,48,.08);
  color:#ffd27a;cursor:pointer;font:900 7px/1 "ABC Monument Grotesk",Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase}
.cot-info-popover__copy:hover,.cot-info-popover__copy:focus-visible{border-color:#f0a030;background:#f0a030;color:#171008;outline:none}
.cot-info-popover__media{position:relative;height:142px;margin:0;overflow:hidden;border-bottom:1px solid rgba(154,174,189,.18);
  background:radial-gradient(circle at 50% 32%,rgba(78,96,107,.2),transparent 58%),#070b0e}
.cot-info-popover__media[hidden]{display:none}.cot-info-popover__media img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;
  filter:saturate(.88) contrast(1.04);transition:opacity .16s ease}
.cot-info-popover__media[data-fit='contain'] img{object-fit:contain;padding:10px 13px;background:linear-gradient(145deg,rgba(12,18,23,.95),rgba(4,7,9,.98))}
.cot-info-popover__media::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(180deg,transparent 56%,rgba(3,6,8,.78))}
.cot-info-popover__media figcaption{position:absolute;z-index:1;left:11px;right:11px;bottom:8px;overflow:hidden;text-overflow:ellipsis;
  color:#d7e0e6;font-size:6.5px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;white-space:nowrap}
.cot-info-popover__media figcaption:empty{display:none}
.cot-info-popover__body{margin:0;padding:11px 12px 13px;color:#aebdc8;font-size:9.5px;line-height:1.55;white-space:normal}
pre.cot-info-popover__body{max-width:100%;overflow:auto;color:#cad6df;background:rgba(1,4,6,.58);font:500 8.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
  tab-size:2;white-space:pre;overscroll-behavior:contain}
@media(max-width:700px){.cot-info-popover{width:min(420px,calc(100vw - 16px));max-height:min(66vh,520px)}.cot-info-trigger{width:28px;height:28px;min-width:28px;min-height:28px}}
@media(prefers-reduced-motion:reduce){.cot-info-trigger{transition:none}}
`;

function ensureCss() {
  if (document.getElementById('cot-context-info-css')) return;
  const style = document.createElement('style');
  style.id = 'cot-context-info-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function clipboardWrite(value) {
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

function position(button, panel) {
  const rect = button.getBoundingClientRect();
  const margin = 10;
  panel.style.left = '0px';
  panel.style.top = '0px';
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  let left = Math.min(window.innerWidth - width - margin, Math.max(margin, rect.left + rect.width - width));
  let top = rect.bottom + 7;
  if (top + height > window.innerHeight - margin) top = Math.max(margin, rect.top - height - 7);
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

function closeActive({ focus = false } = {}) {
  clearTimeout(hideTimer);
  if (!active) return;
  const { button, panel } = active;
  panel.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  if (focus) button.focus();
  active = null;
}

function scheduleClose(instance) {
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (active !== instance) return;
    if (instance.button.matches(':hover,:focus-visible') || instance.panel.matches(':hover,:focus-within')) return;
    closeActive();
  }, 120);
}

/** Resolve static or live media options without coupling callers to the DOM. */
export function resolveInfoImage(image, { alt = '', fit = 'cover', caption = '' } = {}) {
  let value = image;
  try {
    if (typeof value === 'function') value = value();
  } catch (_) {
    return null;
  }
  if (!value) return null;
  if (typeof value === 'string') return { src: value, alt, fit, caption };
  if (typeof value !== 'object' || !value.src) return null;
  return {
    src: String(value.src),
    alt: String(value.alt ?? alt),
    fit: value.fit ? (value.fit === 'contain' ? 'contain' : 'cover') : fit,
    caption: String(value.caption ?? caption),
  };
}

/**
 * Create an icon button with a portal-mounted help panel.
 * `json` and `image` may be values or functions returning current values.
 */
export function createInfoButton({
  label, title, text = '', json = null, className = '',
  image = null, imageAlt = '', imageFit = 'cover', imageCaption = '',
} = {}) {
  ensureCss();
  const id = `cot-info-${++serial}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `cot-info-trigger${className ? ` ${className}` : ''}`;
  button.innerHTML = uiIconSVG('info', 13, 'currentColor', 'cot-info-trigger__icon');
  button.setAttribute('aria-label', label || `About ${title || 'this section'}`);
  button.setAttribute('aria-controls', id);
  button.setAttribute('aria-expanded', 'false');

  const panel = document.createElement('aside');
  panel.id = id;
  panel.className = 'cot-info-popover';
  panel.hidden = true;
  panel.setAttribute('role', json ? 'dialog' : 'tooltip');
  panel.setAttribute('aria-label', title || label || 'More information');
  const head = document.createElement('div');
  head.className = 'cot-info-popover__head';
  const heading = document.createElement('strong');
  heading.textContent = title || 'More information';
  head.appendChild(heading);
  const body = document.createElement(json ? 'pre' : 'p');
  body.className = 'cot-info-popover__body';
  const media = document.createElement('figure');
  media.className = 'cot-info-popover__media';
  media.hidden = true;
  const mediaImage = document.createElement('img');
  mediaImage.decoding = 'async';
  mediaImage.loading = 'lazy';
  const mediaCaption = document.createElement('figcaption');
  media.append(mediaImage, mediaCaption);
  panel.append(head, media, body);
  document.body.appendChild(panel);

  const instance = { button, panel };
  const content = () => {
    const value = typeof json === 'function' ? json() : json;
    return json ? JSON.stringify(value ?? {}, null, 2) : String(typeof text === 'function' ? text() : text);
  };
  const renderMedia = () => {
    const resolved = resolveInfoImage(image, {
      alt: imageAlt,
      fit: imageFit,
      caption: imageCaption,
    });
    if (!resolved) {
      media.hidden = true;
      mediaImage.removeAttribute('src');
      return;
    }
    media.dataset.fit = resolved.fit;
    mediaImage.alt = resolved.alt;
    mediaCaption.textContent = resolved.caption;
    media.hidden = false;
    if (mediaImage.getAttribute('src') !== resolved.src) mediaImage.src = resolved.src;
  };
  mediaImage.addEventListener('error', () => { media.hidden = true; });
  if (json) {
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'cot-info-popover__copy';
    copy.textContent = 'Copy JSON';
    copy.addEventListener('click', () => {
      clipboardWrite(content()).then(() => {
        copy.textContent = 'Copied';
        window.setTimeout(() => { copy.textContent = 'Copy JSON'; }, 1200);
      }).catch(() => { copy.textContent = 'Copy failed'; });
    });
    head.appendChild(copy);
  }

  const open = () => {
    clearTimeout(hideTimer);
    if (active && active !== instance) closeActive();
    body.textContent = content();
    renderMedia();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    active = instance;
    position(button, panel);
  };
  // A mouse click is often preceded by mouseenter. Keep the panel open in
  // that case instead of interpreting the click as an immediate close.
  const activate = () => { if (active !== instance) open(); };
  button.addEventListener('mouseenter', open);
  button.addEventListener('focus', open);
  button.addEventListener('mouseleave', () => scheduleClose(instance));
  button.addEventListener('blur', () => scheduleClose(instance));
  button.addEventListener('click', (event) => { event.stopPropagation(); activate(); });
  panel.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  panel.addEventListener('mouseleave', () => scheduleClose(instance));
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closeActive({ focus: true }); }
  });
  const reposition = () => { if (active === instance) position(button, panel); };
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);
  button.disposeInfo = () => {
    if (active === instance) closeActive();
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
    panel.remove();
  };
  return button;
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && active) closeActive({ focus: true });
  });
  document.addEventListener('pointerdown', (event) => {
    if (active && !active.button.contains(event.target) && !active.panel.contains(event.target)) closeActive();
  });
}
