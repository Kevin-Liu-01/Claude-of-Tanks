/**
 * Settings › Controls › Phone controller (docs/PHONE-CONTROLLER.md "Desktop side"): the pairing card the Connect phone
 * button loads, with the receiver behind it. One receiver per page, kept here so a Controls tab that re-renders (every
 * tab switch) shows the live pairing again. The card shows one datum, the link's state (`phone-link`,
 * src/ui/surfaceRegistry.ts); while a code waits it shows the QR, the code and its countdown. The QR is one SVG path
 * (src/pad/qr.ts), dark on light so every camera reads it.
 */
import { formatPadCode, padPageUrl } from './padProtocol.ts';
import { startPadReceiver } from './padReceiver.ts';
import type { PadReceiver, PadReceiverPorts, PadReceiverView } from './padReceiver.ts';
import { padServiceUrl } from './padEndpoint.ts';
import { encodeQr, qrSvgPath } from './qr.ts';
import { t } from '../ui/i18n.ts';
import { markDatum } from '../ui/dom.ts';
import { ensureStyle } from '../ui/styleLayers.ts';
import { uiIconSVG } from '../ui/uiIcons.ts';

const CARD_CSS = `
.cot-pad-card .cot-pad-row{display:flex;align-items:center;gap:var(--s3);}
.cot-pad-card .cot-pad-row .lb{flex:1 1 auto;min-width:0;}
.cot-pad-state{font-size:var(--fs-13);color:var(--ink-3);white-space:nowrap;}
.cot-pad-state[data-tone='ok']{color:var(--text-ok);}
.cot-pad-state[data-tone='warn']{color:var(--text-warn);}
.cot-pad-state[data-tone='danger']{color:var(--text-danger);}
.cot-pad-pair{display:grid;grid-template-columns:auto 1fr;gap:var(--s5);align-items:center;padding:var(--s4) var(--s3);}
.cot-pad-pair[hidden]{display:none;}
.cot-pad-qr{display:block;width:176px;height:176px;border-radius:var(--r1);}
.cot-pad-qr .bg{fill:var(--ink-1);}
.cot-pad-qr .mods{fill:var(--surface-page);}
.cot-pad-code{font-family:var(--font-mono);font-size:var(--fs-36);font-weight:var(--fw-semibold);color:var(--ink-1);line-height:1;}
.cot-pad-how{margin:var(--s3) 0 0;font-size:var(--fs-14);font-weight:var(--fw-semibold);color:var(--ink-1);}
.cot-pad-exp{margin:var(--s2) 0 var(--s3);font-size:var(--fs-12);color:var(--ink-3);}
@media (max-width:640px){.cot-pad-pair{grid-template-columns:1fr;justify-items:start;}}
`;

/** The kit's button as markup (components.css classes), as Settings writes its own: its builder would join the chunk the
 *  Gallery shares. */
function kitButton(parent: HTMLElement, variant: 'secondary' | 'quiet', className: string, glyph?: 'phone'): HTMLButtonElement {
  const control = parent.appendChild(document.createElement('button'));
  control.type = 'button';
  control.className = `cot-c-btn cot-c-btn--${variant} cot-c-btn--36 ${className}`;
  control.dataset.uiSound = 'press';
  control.innerHTML = `${glyph ? uiIconSVG(glyph, 18) : ''}<span class="cot-c-btn__label"></span>`;
  return control;
}

let receiver: PadReceiver | null = null;
let detach: (() => void) | null = null;
let countdown: ReturnType<typeof setInterval> | null = null;

/** Render the card into `host` (the Controls tab's card body); `connect` starts pairing at once (the button's press). */
export function renderPadCard(host: HTMLElement, ports: PadReceiverPorts, connect = false): void {
  ensureStyle('cot-pad-card-style', CARD_CSS, 'surfaces');
  detach?.();
  clearInterval(countdown!);
  host.textContent = '';
  host.classList.add('cot-pad-card');

  const row = host.appendChild(document.createElement('div'));
  row.className = 'cot-set-row cot-pad-row';
  const label = row.appendChild(document.createElement('span'));
  label.className = 'lb';
  label.innerHTML = `<span class="cot-setting-icon tone-cyan" aria-hidden="true">${uiIconSVG('phone', 16)}</span>`;
  label.appendChild(document.createElement('span')).className = 'cot-setting-label-text';
  label.lastElementChild!.textContent = t('settings.phone.label');
  const state = markDatum(row.appendChild(document.createElement('span')), 'phone-link');
  state.className = 'cot-pad-state num';
  state.setAttribute('role', 'status');
  state.setAttribute('aria-live', 'polite');
  const action = kitButton(row, 'secondary', 'cot-pad-action', 'phone');

  const pair = host.appendChild(document.createElement('div'));
  pair.className = 'cot-pad-pair';
  pair.hidden = true;
  const qr = pair.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
  qr.classList.add('cot-pad-qr');
  qr.setAttribute('role', 'img');
  qr.setAttribute('aria-label', t('settings.phone.qrAria'));
  const text = pair.appendChild(document.createElement('div'));
  const code = text.appendChild(document.createElement('div'));
  code.className = 'cot-pad-code';
  const how = text.appendChild(document.createElement('p'));
  how.className = 'cot-pad-how';
  const expires = text.appendChild(document.createElement('p'));
  expires.className = 'cot-pad-exp num';
  const fresh = kitButton(text, 'quiet', 'cot-pad-new');
  (fresh.lastElementChild as HTMLElement).textContent = t('settings.phone.newCode');

  let shownCode = '';
  let expiresAt = 0;
  const tickCountdown = (): void => {
    const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    expires.textContent = t('settings.phone.expires', { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` });
  };

  const paint = (current: PadReceiverView | null): void => {
    const kind = current?.state.kind ?? 'idle';
    const rtt = current?.rttMs != null ? ` · ${t('settings.phone.ms', { ms: Math.round(current.rttMs) })}` : '';
    let words = '';
    let tone = '';
    switch (current?.state.kind) {
      case undefined: break;
      case 'connecting': words = t('settings.phone.state.connecting'); break;
      case 'waiting': words = t('settings.phone.state.waiting'); break;
      case 'linking': words = t('settings.phone.state.linking'); tone = 'warn'; break;
      case 'live':
        words = (current.state.path === 'relay' ? t('settings.phone.state.relay') : t('settings.phone.state.live')) + rtt;
        tone = current.state.path === 'relay' ? 'warn' : 'ok';
        break;
      case 'away': words = t('settings.phone.state.away'); tone = 'warn'; break;
      case 'ended': {
        const reason = current.state.reason;
        words = reason === 'expired' ? t('settings.phone.state.expired')
          : reason === 'unreachable' ? t('settings.phone.state.unreachable')
            : reason === 'relay_spent' ? t('settings.phone.state.relaySpent') : t('settings.phone.state.ended');
        tone = reason === 'ended' ? '' : 'danger';
        break;
      }
    }
    state.textContent = words;
    state.hidden = !words;
    if (tone) state.dataset.tone = tone; else delete state.dataset.tone;
    const pairing = kind === 'connecting' || kind === 'waiting' || kind === 'linking';
    const linked = kind === 'live' || kind === 'away';
    (action.querySelector('.cot-c-btn__label') as HTMLElement).textContent =
      linked ? t('settings.phone.disconnect') : pairing ? t('settings.phone.cancel') : t('settings.phone.connect');
    action.dataset.padAction = linked || pairing ? 'stop' : 'start';

    pair.hidden = current?.state.kind !== 'waiting';
    clearInterval(countdown!);
    if (current?.state.kind === 'waiting') {
      expiresAt = current.state.expiresAt;
      if (shownCode !== current.state.code) {
        shownCode = current.state.code;
        const url = padPageUrl(location.origin, shownCode);
        const matrix = encodeQr(url);
        if (matrix) {
          qr.setAttribute('viewBox', `-4 -4 ${matrix.size + 8} ${matrix.size + 8}`);
          qr.innerHTML = `<rect class="bg" x="-4" y="-4" width="${matrix.size + 8}" height="${matrix.size + 8}"/><path class="mods" d="${qrSvgPath(matrix)}"/>`;
          qr.dataset.url = url;
        }
        code.textContent = formatPadCode(shownCode);
        code.setAttribute('aria-label', t('settings.phone.codeAria', { code: shownCode.split('').join(' ') }));
        how.textContent = `${location.host}/pad`;
      }
      tickCountdown();
      countdown = setInterval(tickCountdown, 1000);
    } else {
      shownCode = '';
    }
  };

  const start = (): void => {
    const url = padServiceUrl();
    if (!url) {
      receiver = null;
      paint(null);
      state.hidden = false;
      state.textContent = t('settings.phone.state.unavailable');
      state.dataset.tone = 'danger';
      return;
    }
    receiver = startPadReceiver(url, ports);
    attach();
  };
  const attach = (): void => {
    detach?.();
    const live = receiver;
    if (!live) { detach = null; paint(null); return; }
    const off = live.subscribe(paint);
    detach = () => { off(); };
    paint(live.view);
  };

  action.addEventListener('click', () => {
    if (action.dataset.padAction === 'stop') { receiver?.disconnect(); return; }
    start();
  });
  fresh.addEventListener('click', () => { receiver?.disconnect(); start(); });

  if (connect && (!receiver || receiver.view.state.kind === 'ended')) start();
  else attach();
}
