/**
 * The phone controller's page (/pad, docs/PHONE-CONTROLLER.md "Controls"): pair with a code, then drive. Held sideways
 * like a wheel: the tilt steers (deviceorientation, padInput.ts's wheel angle), the left thumb works the throttle lever
 * (a stick that also steers when there is no tilt), the right thumb drags to aim and fires; the top row switches
 * ammunition and uses consumables. Every control becomes an axes frame or a ctl message on the link; the desktop maps
 * them onto its input actions. The page asks for motion access, the wake lock and full screen from the Start tap (iOS
 * wants a gesture), and keeps its resume token in sessionStorage so a reload or a sleeping phone comes back.
 */
import { createPadLink } from './padLink.ts';
import type { PadLink, PadLinkState } from './padLink.ts';
import { DEFAULT_STEERING, leverValue, steerFromAngle, wheelAngleDeg } from './padInput.ts';
import {
  PAD_FLAG_TILT, PAD_HOLD_ACTIONS, encodePadAxes, formatPadCode, normalizePadCode,
} from './padProtocol.ts';
import type { PadAxes, PadHoldAction, PadStatus, PadTapAction } from './padProtocol.ts';
import { padServiceUrl } from './padEndpoint.ts';
import { t } from '../ui/i18n.ts';
import { icon } from '../ui/icons/icon.ts';
import { shellIconSVG } from '../ui/shellIcons.ts';
import { shellTypeCode } from '../ui/shellLabels.ts';
import { prefersReducedMotion } from '../ui/accessibilityPreferences.ts';

const SETTINGS_KEY = 'cot.pad.v1';
const RESUME_KEY = 'cot.pad.resume';
const NO_TILT_MS = 1500;
const HEARTBEAT_MS = 100;

interface PadSettings { tilt: boolean; lockDeg: number; aim: number }
const LOCKS = [25, 35, 45, 60];
const AIMS = [0.5, 1, 1.5, 2];

function loadSettings(): PadSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<PadSettings>;
    return { tilt: raw.tilt !== false, lockDeg: LOCKS.includes(Number(raw.lockDeg)) ? Number(raw.lockDeg) : DEFAULT_STEERING.maxAngleDeg,
      aim: AIMS.includes(Number(raw.aim)) ? Number(raw.aim) : 1 };
  } catch { return { tilt: true, lockDeg: DEFAULT_STEERING.maxAngleDeg, aim: 1 }; }
}
const settings = loadSettings();
const saveSettings = (): void => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ } };

const root = document.getElementById('pad') as HTMLElement;
document.title = t('pad.metaTitle');
document.documentElement.lang = document.documentElement.lang || 'en';

const html = (markup: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = markup.trim();
  return host.firstElementChild as HTMLElement;
};
const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const vibrate = (ms: number): void => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };

// ---- screens ---------------------------------------------------------------------------------------------------
const join = html(`<section class="pad-join">
  <h1 class="pad-title">${icon('phone', { size: 28 })}<span>${esc(t('pad.title'))}</span></h1>
  <form class="pad-form" novalidate>
    <label for="pad-code">${esc(t('pad.join.label'))}</label>
    <input class="pad-code" id="pad-code" name="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="7" inputmode="text">
    <button class="cot-c-btn cot-c-btn--primary cot-c-btn--56" type="submit"><span class="cot-c-btn__label">${esc(t('pad.join.connect'))}</span></button>
  </form>
  <p class="pad-hint">${esc(t('pad.join.hint'))}</p>
  <p class="pad-error" role="alert"></p>
</section>`);
const form = join.querySelector('form') as HTMLFormElement;
const codeInput = join.querySelector('input') as HTMLInputElement;
const submitLabel = join.querySelector('.cot-c-btn__label') as HTMLElement;
const hint = join.querySelector('.pad-hint') as HTMLElement;
const error = join.querySelector('.pad-error') as HTMLElement;

const shellButtons = [0, 1, 2].map((slot) => `<button class="pad-tool pad-shell" type="button" data-slot="${slot}" aria-pressed="false"></button>`).join('');
const consumableGlyphs = ['repair', 'medkit', 'extinguisher'] as const;
const consumableButtons = consumableGlyphs.map((glyph, i) =>
  `<button class="pad-tool" type="button" data-tap="consumable${i + 1}" aria-label="${esc(t('pad.consumable', { n: i + 1 }))}">${icon(glyph, { size: 18 })}</button>`).join('');
const ctl = html(`<section class="pad-ctl" hidden>
  <header class="pad-top">
    <span class="pad-link" data-datum="phone-link" role="status" aria-live="polite"></span>
    <div class="pad-ammo" role="group">${shellButtons}</div>
    <div class="pad-cons" role="group">${consumableButtons}</div>
    <button class="pad-tool" type="button" data-pause aria-label="${esc(t('pad.pause'))}">${icon('pause', { size: 18 })}</button>
    <button class="pad-tool" type="button" data-menu aria-label="${esc(t('pad.menu'))}">${icon('settings', { size: 18 })}</button>
  </header>
  <div class="pad-left">
    <div class="pad-lever" role="slider" aria-label="${esc(t('pad.throttle'))}" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0"><div class="pad-knob"></div></div>
    <button class="pad-hold" type="button" data-hold="handbrake">${esc(t('pad.brake'))}</button>
  </div>
  <div class="pad-mid">
    <div class="pad-wheel" aria-hidden="true"><svg viewBox="-50 -50 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"><circle r="40"/><path d="M-40 0H-12M12 0H40M0 12V40"/><circle r="12" stroke-width="5"/></svg></div>
    <button class="pad-tool pad-centre" type="button" data-centre>${esc(t('pad.centre'))}</button>
    <div class="pad-reload" aria-hidden="true"><div class="pad-reload-fill"></div></div>
    <p class="pad-msg" role="status"></p>
  </div>
  <div class="pad-right">
    <div class="pad-aim" aria-label="${esc(t('pad.aimPad'))}"><span>${esc(t('pad.aimPad'))}</span></div>
    <button class="pad-hold pad-look" type="button" data-hold="freeLook">${esc(t('pad.look'))}</button>
    <div class="pad-zoom" hidden>
      <button class="pad-tool" type="button" data-tap="zoomOut" aria-label="${esc(t('pad.zoomOut'))}">${icon('zoomOut', { size: 18 })}</button>
      <button class="pad-tool" type="button" data-tap="zoomIn" aria-label="${esc(t('pad.zoomIn'))}">${icon('zoomIn', { size: 18 })}</button>
    </div>
    <button class="pad-tool pad-scope" type="button" data-tap="sniperToggle" aria-pressed="false">${icon('scope', { size: 18 })}<span>${esc(t('pad.scope'))}</span></button>
    <button class="pad-fire" type="button" data-hold="fire">${esc(t('pad.fire'))}</button>
  </div>
  <div class="pad-rotate">${esc(t('pad.rotate'))}</div>
  <dialog class="pad-opts">
    <div class="row"><span>${esc(t('pad.opt.tilt'))}</span><span class="seg" data-opt="tilt"></span></div>
    <div class="row"><span>${esc(t('pad.opt.lock'))}</span><span class="seg" data-opt="lockDeg"></span></div>
    <div class="row"><span>${esc(t('pad.opt.aim'))}</span><span class="seg" data-opt="aim"></span></div>
    <div class="end">
      <button class="cot-c-btn cot-c-btn--danger cot-c-btn--48" type="button" data-disconnect><span class="cot-c-btn__label">${esc(t('pad.opt.disconnect'))}</span></button>
      <button class="cot-c-btn cot-c-btn--secondary cot-c-btn--48" type="button" data-close><span class="cot-c-btn__label">${esc(t('pad.opt.close'))}</span></button>
    </div>
  </dialog>
</section>`);
const end = html(`<section class="pad-end" hidden>
  <h1 class="pad-title">${icon('phone', { size: 28 })}<span>${esc(t('pad.title'))}</span></h1>
  <p class="pad-end-msg" role="alert"></p>
  <button class="cot-c-btn cot-c-btn--primary cot-c-btn--56" type="button"><span class="cot-c-btn__label">${esc(t('pad.ended.again'))}</span></button>
</section>`);
root.append(join, ctl, end);

const $ = <T extends Element>(selector: string, host: ParentNode = ctl): T => host.querySelector(selector) as T;
const linkChip = $<HTMLElement>('.pad-link');
const lever = $<HTMLElement>('.pad-lever');
const knob = $<HTMLElement>('.pad-knob');
const wheel = $<HTMLElement>('.pad-wheel');
const message = $<HTMLElement>('.pad-msg');
const reloadFill = $<HTMLElement>('.pad-reload-fill');
const zoom = $<HTMLElement>('.pad-zoom');
const scope = $<HTMLButtonElement>('.pad-scope');
const aimPad = $<HTMLElement>('.pad-aim');
const options = $<HTMLDialogElement>('.pad-opts');

function show(screen: 'join' | 'controller' | 'ended'): void {
  root.dataset.screen = screen;
  join.hidden = screen !== 'join';
  ctl.hidden = screen !== 'controller';
  end.hidden = screen !== 'ended';
}

// ---- controls state ------------------------------------------------------------------------------------------
const axes: PadAxes = { flags: 0, seq: 0, t: 0, steer: 0, throttle: 0, aimX: 0, aimY: 0, held: 0 };
const frame = new Uint8Array(24);
let link: PadLink | null = null;
let tiltSeen = false;
let tiltAngle: number | null = null;
let tiltCentre = 0;
let stickX = 0;
let lastSentKey = '';
let sendQueued = false;
let lastSendAt = -Infinity;
let rttMs: number | null = null;
let status: PadStatus | null = null;
let reloadAnimation: Animation | null = null;
let reloadKey = '';
/** Diagnostics for the pad e2e and the owner's real-device check. */
interface PhoneDebug { sent: number; rttMs: number | null; applyMs: number; tilt: boolean; state: string }
const debug: PhoneDebug | null = import.meta.env.DEV || /[?&]padDebug\b/.test(location.search)
  ? ((globalThis as { __COT_PAD_PHONE?: PhoneDebug }).__COT_PAD_PHONE = { sent: 0, rttMs: null, applyMs: 0, tilt: false, state: 'join' }) : null;

const steering = (): number => {
  if (settings.tilt && tiltSeen) {
    if (tiltAngle === null) return 0;
    return steerFromAngle(tiltAngle, tiltCentre, { ...DEFAULT_STEERING, maxAngleDeg: settings.lockDeg });
  }
  return stickX;
};

/** Send the current frame now when it changed (the data channel is free; the relay counts only changed frames). */
function send(force = false): void {
  sendQueued = false;
  if (!link) return;
  axes.steer = steering();
  axes.flags = settings.tilt && tiltSeen ? PAD_FLAG_TILT : 0;
  const key = `${axes.steer.toFixed(3)}|${axes.throttle.toFixed(3)}|${axes.aimX}|${axes.aimY}|${axes.held}`;
  const changed = key !== lastSentKey;
  const now = performance.now();
  if (!changed && !force && now - lastSendAt < HEARTBEAT_MS) return;
  axes.seq = (axes.seq + 1) & 0xffff;
  axes.t = Math.round(performance.timeOrigin + now) >>> 0;
  link.sendAxes(encodePadAxes(axes, frame), changed);
  lastSentKey = key;
  lastSendAt = now;
  if (debug) debug.sent++;
}
/** Coalesce input events into one frame per animation frame (no style writes here). */
function queueSend(): void {
  if (sendQueued) return;
  sendQueued = true;
  requestAnimationFrame(() => send());
}
setInterval(() => send(), HEARTBEAT_MS);

function paintWheel(): void {
  const turn = Math.round(steering() * settings.lockDeg * 2) / 2;
  wheel.style.transform = `rotate(${turn}deg)`;
}

// ---- tilt ------------------------------------------------------------------------------------------------------
const screenAngle = (): number => screen.orientation?.angle ?? (Number((window as { orientation?: number }).orientation) || 0);
function onOrientation(event: DeviceOrientationEvent): void {
  if (event.beta === null || event.gamma === null) return;
  const first = !tiltSeen;
  tiltSeen = true;
  tiltAngle = wheelAngleDeg(event.beta, event.gamma, screenAngle());
  if (first && tiltAngle !== null) tiltCentre = tiltAngle;
  if (debug) debug.tilt = true;
  applyMode();
  paintWheel();
  queueSend();
}

async function startTilt(): Promise<void> {
  const request = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
  if (typeof request === 'function') {
    try {
      if (await request() !== 'granted') { message.textContent = t('pad.tiltDenied'); settings.tilt = false; applyMode(); return; }
    } catch { message.textContent = t('pad.tiltDenied'); settings.tilt = false; applyMode(); return; }
  }
  window.addEventListener('deviceorientation', onOrientation);
  setTimeout(() => { if (!tiltSeen && settings.tilt) { message.textContent = t('pad.noTilt'); applyMode(); } }, NO_TILT_MS);
}

/** Tilt steers when it is on and the phone has a sensor; otherwise the lever is a stick that also steers. */
function applyMode(): void {
  const tilt = settings.tilt && tiltSeen;
  lever.classList.toggle('is-stick', !tilt);
  lever.setAttribute('aria-label', tilt ? t('pad.throttle') : t('pad.stick'));
  wheel.classList.toggle('is-off', !tilt);
  $<HTMLElement>('.pad-centre').hidden = !tilt;
}

// ---- the lever / stick --------------------------------------------------------------------------------------
let leverPointer: number | null = null;
let leverOrigin = { x: 0, y: 0 };
function leverMove(event: PointerEvent): void {
  if (event.pointerId !== leverPointer) return;
  const box = lever.getBoundingClientRect();
  const travelY = Math.max(24, box.height / 2 - 28);
  const travelX = Math.max(24, box.width / 2 - 28);
  const dy = Math.max(-travelY, Math.min(travelY, event.clientY - leverOrigin.y));
  const stick = lever.classList.contains('is-stick');
  const dx = stick ? Math.max(-travelX, Math.min(travelX, event.clientX - leverOrigin.x)) : 0;
  axes.throttle = leverValue(-dy, travelY);
  stickX = stick ? leverValue(dx, travelX) : 0;
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  lever.setAttribute('aria-valuenow', String(Math.round(axes.throttle * 100)));
  paintWheel();
  queueSend();
}
function leverEnd(event: PointerEvent): void {
  if (event.pointerId !== leverPointer) return;
  leverPointer = null;
  axes.throttle = 0; stickX = 0;
  knob.style.transform = 'translate(0px,0px)';
  lever.setAttribute('aria-valuenow', '0');
  paintWheel();
  send(true);
}
lever.addEventListener('pointerdown', (event) => {
  if (leverPointer !== null) return;
  event.preventDefault();
  leverPointer = event.pointerId;
  lever.setPointerCapture(event.pointerId);
  // the stick is where the thumb lands (no jump), the lever's centre is its rest
  const box = lever.getBoundingClientRect();
  leverOrigin = lever.classList.contains('is-stick') ? { x: event.clientX, y: event.clientY } : { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  leverMove(event);
});
lever.addEventListener('pointermove', leverMove);
lever.addEventListener('pointerup', leverEnd);
lever.addEventListener('pointercancel', leverEnd);
// keyboard and assistive tech: the slider's arrows step the throttle (a centred lever is neutral)
lever.tabIndex = 0;
lever.addEventListener('keydown', (event) => {
  const step = event.key === 'ArrowUp' ? 0.25 : event.key === 'ArrowDown' ? -0.25 : event.key === 'Home' ? -axes.throttle : 0;
  if (!step) return;
  event.preventDefault();
  axes.throttle = Math.max(-1, Math.min(1, axes.throttle + step));
  lever.setAttribute('aria-valuenow', String(Math.round(axes.throttle * 100)));
  send(true);
});

// ---- the aim pad -----------------------------------------------------------------------------------------------
let aimPointer: number | null = null;
let aimLast = { x: 0, y: 0 };
aimPad.addEventListener('pointerdown', (event) => {
  if (aimPointer !== null) return;
  event.preventDefault();
  aimPointer = event.pointerId;
  aimPad.setPointerCapture(event.pointerId);
  aimLast = { x: event.clientX, y: event.clientY };
});
aimPad.addEventListener('pointermove', (event) => {
  if (event.pointerId !== aimPointer) return;
  // totals, not deltas: a lost frame loses no aim (padProtocol's axes frame)
  axes.aimX += (event.clientX - aimLast.x) * settings.aim;
  axes.aimY += (event.clientY - aimLast.y) * settings.aim;
  aimLast = { x: event.clientX, y: event.clientY };
  queueSend();
});
const aimEnd = (event: PointerEvent): void => { if (event.pointerId === aimPointer) aimPointer = null; };
aimPad.addEventListener('pointerup', aimEnd);
aimPad.addEventListener('pointercancel', aimEnd);

// ---- holds and taps -----------------------------------------------------------------------------------------------
const holdBit = (action: PadHoldAction): number => 1 << PAD_HOLD_ACTIONS.indexOf(action);
function hold(action: PadHoldAction, down: boolean, button: HTMLElement): void {
  const bit = holdBit(action);
  if (down === !!(axes.held & bit)) return;
  axes.held = down ? axes.held | bit : axes.held & ~bit;
  button.classList.toggle('is-down', down);
  // the ctl event names the first axes frame carrying the new state; that frame goes now
  link?.sendCtl({ k: down ? 'down' : 'up', a: action, s: (axes.seq + 1) & 0xffff });
  send(true);
  if (down && action === 'fire') vibrate(12);
}
for (const button of ctl.querySelectorAll<HTMLElement>('[data-hold]')) {
  const action = button.dataset.hold as PadHoldAction;
  let pointer: number | null = null;
  button.addEventListener('pointerdown', (event) => {
    if (pointer !== null) return;
    event.preventDefault();
    pointer = event.pointerId;
    button.setPointerCapture(event.pointerId);
    hold(action, true, button);
  });
  const release = (event: PointerEvent): void => { if (event.pointerId !== pointer) return; pointer = null; hold(action, false, button); };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  // a keyboard or assistive-tech activation is one press and release (one shot, one brake tap)
  button.addEventListener('click', (event) => {
    if ((event as MouseEvent).detail !== 0) return;
    hold(action, true, button);
    setTimeout(() => hold(action, false, button), 120);
  });
}
for (const button of ctl.querySelectorAll<HTMLButtonElement>('[data-tap]')) {
  button.addEventListener('click', () => {
    link?.sendCtl({ k: 'tap', a: button.dataset.tap as PadTapAction });
    vibrate(8);
  });
}
for (const button of ctl.querySelectorAll<HTMLButtonElement>('.pad-shell')) {
  button.addEventListener('click', () => {
    link?.sendCtl({ k: 'tap', a: `shell${Number(button.dataset.slot) + 1}` as PadTapAction });
    vibrate(8);
  });
}
$<HTMLButtonElement>('[data-pause]').addEventListener('click', () => link?.sendCtl({ k: 'pause' }));
$<HTMLButtonElement>('[data-centre]').addEventListener('click', () => {
  if (tiltAngle !== null) tiltCentre = tiltAngle;
  paintWheel();
  send(true);
});

// ---- options ---------------------------------------------------------------------------------------------------
function paintOptions(): void {
  const seg = (name: keyof PadSettings, values: ReadonlyArray<boolean | number>, label: (value: boolean | number) => string): void => {
    const host = options.querySelector(`[data-opt="${name}"]`) as HTMLElement;
    host.innerHTML = values.map((value) => `<button class="pad-tool" type="button" aria-pressed="${settings[name] === value}" data-value="${String(value)}">${esc(label(value))}</button>`).join('');
    for (const button of host.querySelectorAll<HTMLButtonElement>('button')) {
      button.addEventListener('click', () => {
        const raw = button.dataset.value!;
        (settings as unknown as Record<string, boolean | number>)[name] = raw === 'true' ? true : raw === 'false' ? false : Number(raw);
        saveSettings();
        applyMode();
        paintOptions();
        send(true);
      });
    }
  };
  seg('tilt', [true, false], (value) => t(value ? 'pad.opt.on' : 'pad.opt.off'));
  seg('lockDeg', LOCKS, (value) => t('pad.opt.lockValue', { deg: Number(value) }));
  seg('aim', AIMS, (value) => t('pad.opt.aimValue', { n: Number(value) }));
}
$<HTMLButtonElement>('[data-menu]').addEventListener('click', () => { paintOptions(); options.showModal(); });
$<HTMLButtonElement>('[data-close]').addEventListener('click', () => options.close());
$<HTMLButtonElement>('[data-disconnect]').addEventListener('click', () => {
  options.close();
  forgetResume();
  link?.end();
});

// ---- status from the desktop -------------------------------------------------------------------------------------
function paintStatus(next: PadStatus): void {
  status = next;
  const buttons = ctl.querySelectorAll<HTMLButtonElement>('.pad-shell');
  buttons.forEach((button, slot) => {
    const shell = next.shells[slot];
    button.hidden = !shell;
    if (!shell) return;
    const code = shellTypeCode(shell.type);
    const count = shell.unlimited ? '∞' : String(shell.count);
    const markup = `${shellIconSVG(shell.type, 18)}<span>${esc(code)}</span><b>${esc(count)}</b>`;
    if (button.dataset.markup !== markup) { button.innerHTML = markup; button.dataset.markup = markup; }
    button.setAttribute('aria-pressed', String(slot === next.slot));
    button.setAttribute('aria-label', t('pad.shell', { n: slot + 1, type: code, count }));
    if (!shell.unlimited && shell.count <= 0) button.dataset.empty = ''; else delete button.dataset.empty;
  });
  zoom.hidden = !next.sniper;
  scope.setAttribute('aria-pressed', String(next.sniper));
  message.textContent = !next.battle ? t('pad.waitingBattle') : next.paused ? t('pad.paused') : !next.alive ? t('pad.destroyed')
    : settings.tilt && tiltSeen && tiltAngle === null ? t('pad.flat') : '';
  // the reload: one linear fill over the time left (WAAPI, transform only); reduced motion steps with each status
  const key = `${next.reloadS > 0 ? Math.round(next.reloadTotalS * 10) : 0}|${Math.round((next.reloadTotalS - next.reloadS) * 2)}`;
  if (key === reloadKey) return;
  reloadKey = key;
  reloadAnimation?.cancel();
  reloadAnimation = null;
  const done = next.reloadTotalS > 0 ? 1 - next.reloadS / next.reloadTotalS : 1;
  if (next.reloadS > 0 && !prefersReducedMotion()) {
    reloadAnimation = reloadFill.animate([{ transform: `scaleX(${done})` }, { transform: 'scaleX(1)' }],
      { duration: next.reloadS * 1000, easing: 'linear', fill: 'forwards' });
  } else {
    reloadFill.style.transform = `scaleX(${done})`;
  }
}

function paintLink(state: PadLinkState): void {
  let words = '';
  let tone = '';
  if (state.kind === 'live') {
    words = `${state.path === 'relay' ? t('pad.state.relay') : t('pad.state.live')}${rttMs !== null ? ` · ${t('pad.ms', { ms: Math.round(rttMs) })}` : ''}`;
    tone = state.path === 'relay' ? 'warn' : 'ok';
  } else if (state.kind === 'linking') { words = t('pad.state.linking'); tone = 'warn'; }
  else if (state.kind === 'away') { words = t('pad.state.away'); tone = 'warn'; }
  else words = t('pad.state.connecting');
  linkChip.textContent = words;
  if (tone) linkChip.dataset.tone = tone; else delete linkChip.dataset.tone;
}

// ---- pairing -------------------------------------------------------------------------------------------------------
let wakeLock: { release(): Promise<void> } | null = null;
async function keepAwake(): Promise<void> {
  try { wakeLock = await (navigator as { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen') ?? null; }
  catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && link && !wakeLock) void keepAwake(); });

function forgetResume(): void { try { sessionStorage.removeItem(RESUME_KEY); } catch { /* private mode */ } }
function storedResume(): { code: string; token: string } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(RESUME_KEY) || 'null') as { code?: unknown; token?: unknown } | null;
    return value && typeof value.code === 'string' && typeof value.token === 'string' ? { code: value.code, token: value.token } : null;
  } catch { return null; }
}

const ENDED_WORDS: Record<string, string> = {
  unknown: 'pad.ended.unknown', expired: 'pad.ended.unknown', ended: 'pad.ended.ended', desktop_left: 'pad.ended.desktopLeft',
  replaced: 'pad.ended.replaced', unreachable: 'pad.ended.unreachable', relay_spent: 'pad.ended.relaySpent',
};

function connect(route: { code: string } | { resume: { code: string; token: string } }): void {
  const serviceUrl = padServiceUrl();
  if (!serviceUrl) { error.textContent = t('pad.ended.unreachable'); return; }
  show('controller');
  applyMode();
  paintLink({ kind: 'connecting' });
  let pinged: ReturnType<typeof setInterval> | null = null;
  link = createPadLink({
    role: 'phone',
    serviceUrl,
    ...('code' in route ? { code: route.code } : { resume: route.resume }),
    onToken(code, token) { try { sessionStorage.setItem(RESUME_KEY, JSON.stringify({ code, token })); } catch { /* private mode */ } },
    onState(state) {
      if (debug) debug.state = state.kind;
      if (state.kind === 'ended') {
        clearInterval(pinged!);
        link = null;
        if (state.reason !== 'replaced') forgetResume();
        void wakeLock?.release().catch(() => {});
        wakeLock = null;
        $<HTMLElement>('.pad-end-msg', end).textContent = t(ENDED_WORDS[state.reason] ?? 'pad.ended.ended');
        show('ended');
        return;
      }
      if (state.kind === 'live') {
        send(true);
        clearInterval(pinged!);
        pinged = setInterval(() => link?.sendCtl({ k: 'ping', t: performance.now() }), state.path === 'relay' ? 5000 : 1000);
      }
      paintLink(state);
    },
    onCtl(message) {
      if (message.k === 'status') paintStatus(message.s);
      else if (message.k === 'pong') {
        rttMs = Math.max(0, performance.now() - message.t);
        if (debug) { debug.rttMs = rttMs; debug.applyMs = message.apply; }
        if (link) paintLink(link.state);
      } else if (message.k === 'ping') link?.sendCtl({ k: 'pong', t: message.t, d: performance.now(), apply: 0 });
    },
  });
}

/** The Start tap: motion access, the wake lock and full screen want a gesture (iOS), then the link. */
function start(route: { code: string } | { resume: { code: string; token: string } }): void {
  void startTilt();
  void keepAwake();
  try {
    if (matchMedia('(pointer: coarse)').matches) {
      void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
        .then(() => (screen.orientation as { lock?: (o: string) => Promise<void> }).lock?.('landscape')).catch(() => {});
    }
  } catch { /* not offered */ }
  history.replaceState(null, '', location.pathname + location.search);
  connect(route);
}

codeInput.addEventListener('input', () => {
  const raw = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const formatted = raw.length > 3 ? formatPadCode(raw.padEnd(6, ' ')).trimEnd() : raw;
  if (codeInput.value !== formatted) codeInput.value = formatted;
  error.textContent = '';
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const resume = storedResume();
  const typed = normalizePadCode(codeInput.value);
  if (resume && (!typed || typed === resume.code)) { start({ resume }); return; }
  if (!typed) { error.textContent = t('pad.join.badCode'); codeInput.focus(); return; }
  start({ code: typed });
});
end.querySelector('button')!.addEventListener('click', () => {
  codeInput.value = '';
  submitLabel.textContent = t('pad.join.connect');
  hint.textContent = t('pad.join.hint');
  show('join');
  codeInput.focus();
});

// A code from the QR (the fragment) or a pairing to resume: one Start tap (a gesture) goes.
const fromLink = normalizePadCode(decodeURIComponent(location.hash.slice(1)));
const resume = storedResume();
if (fromLink || resume) {
  codeInput.value = formatPadCode(fromLink ?? resume!.code);
  submitLabel.textContent = t('pad.join.start');
  hint.textContent = t('pad.join.startHint');
}
show('join');
