/**
 * Couch mode's lobby (docs/COUCH-MODE.md "The lobby"), opened by the Deploy screen's Couch button. One QR code and its
 * short code seat up to eight phones; each seat shows as its number, lit while its phone is here and dimmed while it is
 * away. Together or Teams picks how the seats take sides (a mode with no Bravo seat is always Together); Start deploys
 * the seats here in the Deploy screen's mode, map and vehicle. Closing the lobby keeps the phones seated for the next
 * battle; End lets them go. One lobby per page: its chunk loads with the couch runtime.
 */
import { createModal } from './modal.ts';
import type { ModalController } from './modal.ts';
import { t } from './i18n.ts';
import { ensureStyle } from './styleLayers.ts';
import { segmented, wireRoving } from './components/components.ts';
import { formatPadCode, PAD_LOBBY_SEATS } from '../pad/padProtocol.ts';
import { padPageUrl } from '../pad/padDesk.ts';
import { encodeQr, qrSvgPath } from '../pad/qr.ts';
import type { PadLobbyView } from '../pad/padLobby.ts';
import type { CouchRuntime } from '../app/couchRuntime.ts';
import type { CouchBattle } from '../game/couchSeats.ts';
import { COUCH_RULES } from '../sim/matchRuleset.ts';
import type { CouchSides } from '../sim/matchRuleset.ts';

const LOBBY_CSS = `
.cot-couch{display:grid;grid-template-columns:auto 1fr;gap:var(--s6);align-items:center;}
.cot-couch-qr{display:block;width:216px;height:216px;border-radius:var(--r2);}
.cot-couch-qr .bg{fill:var(--ink-1);}
.cot-couch-qr .mods{fill:var(--surface-page);}
.cot-couch-qr[data-state='off']{opacity:.25;}
.cot-couch-side{display:grid;gap:var(--s4);min-width:0;}
.cot-couch-code{font-family:var(--font-mono);font-size:var(--fs-36);font-weight:var(--fw-semibold);color:var(--ink-1);line-height:1;}
.cot-couch-address{font-size:var(--fs-13);color:var(--ink-3);overflow-wrap:anywhere;}
.cot-couch-seats{display:grid;grid-template-columns:repeat(4,48px);gap:var(--s2);margin:0;padding:0;list-style:none;}
.cot-couch-seat{display:grid;place-items:center;width:48px;height:48px;border-radius:var(--r2);border:1px dashed var(--line-2);
  font-family:var(--font-mono);font-size:var(--fs-18);font-weight:var(--fw-semibold);color:var(--ink-4);}
.cot-couch-seat[data-state='here']{border-style:solid;border-color:var(--accent);color:var(--ink-1);background:var(--accent-wash);}
.cot-couch-seat[data-state='away']{border-style:solid;color:var(--ink-3);}
.cot-couch-seat[data-side='bravo'][data-state='here']{border-color:var(--team-enemy);}
.cot-couch-note{margin:0;font-size:var(--fs-14);color:var(--ink-2);}
@media (max-width:640px){.cot-couch{grid-template-columns:1fr;justify-items:start;}}
`;

export interface CouchLobbyRequest {
  /** The Deploy screen's mode (its sides follow it). */
  gameMode: string;
  /** Deploy the seats (the Deploy screen's vehicle and map). */
  start(couch: CouchBattle): void;
}

let modal: ModalController | null = null;
let detach: (() => void) | null = null;

function button(parent: HTMLElement, variant: 'primary' | 'secondary' | 'quiet', label: string): HTMLButtonElement {
  const control = parent.appendChild(document.createElement('button'));
  control.type = 'button';
  control.className = `cot-c-btn cot-c-btn--${variant} cot-c-btn--36`;
  control.dataset.uiSound = 'press';
  control.innerHTML = '<span class="cot-c-btn__label"></span>';
  (control.firstElementChild as HTMLElement).textContent = label;
  return control;
}

/** Open the lobby over the Deploy screen (a fresh lobby, or the one the phones already sit in). */
export function openCouchLobby(runtime: CouchRuntime, request: CouchLobbyRequest): void {
  ensureStyle('cot-couch-lobby-style', LOBBY_CSS, 'surfaces');
  detach?.();
  modal ??= createModal({ title: t('couch.title'), size: 'medium', closeLabel: t('couch.close'), className: 'cot-couch-modal', surface: 'couch-lobby' });
  const { body, footer } = modal;
  body.textContent = '';
  footer.textContent = '';
  const lobby = runtime.open();
  if (!lobby) {
    const note = body.appendChild(document.createElement('p'));
    note.className = 'cot-couch-note';
    note.textContent = t('couch.unavailable');
    modal.open();
    return;
  }

  const layout = body.appendChild(document.createElement('div'));
  layout.className = 'cot-couch';
  const qr = layout.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
  qr.classList.add('cot-couch-qr');
  qr.setAttribute('role', 'img');
  qr.setAttribute('aria-label', t('couch.qrAria'));
  const side = layout.appendChild(document.createElement('div'));
  side.className = 'cot-couch-side';
  const code = side.appendChild(document.createElement('div'));
  code.className = 'cot-couch-code';
  code.setAttribute('aria-live', 'polite');
  const address = side.appendChild(document.createElement('div'));
  address.className = 'cot-couch-address';
  const seats = side.appendChild(document.createElement('ol'));
  seats.className = 'cot-couch-seats';
  seats.setAttribute('aria-label', t('couch.seats'));
  const seatCells: HTMLLIElement[] = [];
  for (let seat = 1; seat <= PAD_LOBBY_SEATS; seat++) {
    const cell = seats.appendChild(document.createElement('li'));
    cell.className = 'cot-couch-seat';
    cell.textContent = String(seat);
    seatCells.push(cell);
  }
  const togetherOnly = (COUCH_RULES.togetherOnly as readonly string[]).includes(request.gameMode);
  let sides: CouchSides = 'together';
  side.insertAdjacentHTML('beforeend', segmented({ label: t('couch.sides'), className: 'cot-couch-sides', value: sides,
    options: (['together', 'teams'] as const).map((value) => ({ value, label: t(`couch.sides.${value}`), disabled: togetherOnly && value === 'teams' })) }));
  wireRoving(side.lastElementChild as HTMLElement, (value) => { sides = value as CouchSides; paint(lobby.view); });

  const end = button(footer, 'quiet', t('couch.end'));
  const reopen = button(footer, 'secondary', t('couch.reopen'));
  const start = button(footer, 'primary', t('couch.start'));
  end.addEventListener('click', () => { runtime.close(); modal?.close(); });
  reopen.addEventListener('click', () => lobby.setOpen(true));
  // (round 8 Y4 s3-09) the runtime's start edge: the join window closes, then the seats here deploy
  start.addEventListener('click', () => {
    runtime.startBattle((inPlay) => {
      modal?.close();
      request.start({ seats: inPlay, sides, names: inPlay.map((n) => t('pad.seat', { n })) });
      return true;
    });
  });

  let shownCode = '';
  function paint(view: PadLobbyView): void {
    if (view.code && view.code !== shownCode) {
      shownCode = view.code;
      const url = padPageUrl(location.origin, view.code);
      // an address too long for a code leaves the QR blank; the short code and the address below still seat a phone
      const matrix = encodeQr(url);
      qr.style.display = matrix ? '' : 'none';
      if (matrix) {
        qr.setAttribute('viewBox', `-4 -4 ${matrix.size + 8} ${matrix.size + 8}`);
        qr.innerHTML = `<rect class="bg" x="-4" y="-4" width="${matrix.size + 8}" height="${matrix.size + 8}"/><path class="mods" d="${qrSvgPath(matrix)}"/>`;
      }
      code.textContent = formatPadCode(view.code);
      address.textContent = url.replace(/^https?:\/\//, '').replace(/#.*$/, '');
    }
    const open = view.state === 'open';
    qr.dataset.state = open ? 'on' : 'off';
    reopen.hidden = open || view.state === 'ended' || view.state === 'connecting';
    const inPlay = view.seats.filter((seat) => seat.presence === 'here').map((seat) => seat.seat);
    const sideOf = new Map(inPlay.map((seat, index) => [seat, (sides === 'teams' && !togetherOnly && index % 2 === 1) ? 'bravo' : 'alpha']));
    for (const cell of seatCells) {
      const seat = Number(cell.textContent);
      const entry = view.seats.find((candidate) => candidate.seat === seat);
      cell.dataset.state = entry ? entry.presence : 'free';
      cell.dataset.side = sideOf.get(seat) ?? 'alpha';
      cell.setAttribute('aria-label', t(entry ? (entry.presence === 'here' ? 'couch.seat.here' : 'couch.seat.away') : 'couch.seat.free', { n: seat }));
    }
    start.disabled = !inPlay.length || view.state === 'ended';
  }
  paint(lobby.view);
  detach = lobby.subscribe(paint);
  modal.open();
}
