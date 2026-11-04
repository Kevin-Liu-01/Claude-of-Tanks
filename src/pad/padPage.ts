/**
 * The phone controller's page (/pad, docs/PHONE-CONTROLLER.md "Controls"): pair with a code, then drive. The controller
 * is a tank's control panel held sideways like a wheel: the tilt steers (deviceorientation, padInput.ts's wheel angle),
 * the left thumb works the throttle quadrant (a stick that also steers when there is no tilt), the right thumb drags in
 * the gunner's sight and presses the fire button; the top row is the ammunition selector and the guarded consumable
 * switches. Every control becomes an axes frame or a ctl message on the link; the desktop maps them onto its input
 * actions. The page asks for motion access, the wake lock and full screen from the Start tap (iOS wants a gesture), and
 * keeps its resume token in sessionStorage so a reload or a sleeping phone comes back.
 *
 * The phone is felt as well as seen (owner 2026-11-03: "it should buzz and vibrate"): every press ticks, and the battle's
 * cues (padCues.ts: the gun firing, hits given and taken, modules, fire, crashes, kills, death, the sight's lock) each
 * play their own buzz the moment the desktop sends them. A thumb on the fire button drags to aim, so one thumb aims and
 * shoots, and the sight's gain follows the finger's speed. The first pairing on a phone shows the controls' names over
 * the live panel for ten seconds, or until Skip.
 *
 * The panel is glued to the phone (owner 2026-10-30: "it must be horizontal and just stays that way"). iOS Safari has no
 * orientation lock, so the page locks itself: from the Start tap the controller is laid out once in the landscape the
 * phone is held in, and when the system turns the page (the phone tipped past its threshold, as a wheel turned hard
 * does) the frame turns back by the same angle and scales to fit, a transform only. The wheel angle reads the device's
 * own axes in that locked frame, so the system's rotation never reaches the steering.
 */
import { createPadLink } from './padLink.ts';
import type { PadLink, PadLinkState } from './padLink.ts';
import {
  DEFAULT_STEERING, aimGain, aimSpeed, frameDelta, frameInsets, frameTurn, leverValue, lockAngle, steerFromAngle, wheelAngleDeg,
} from './padInput.ts';
import { padBuzzPattern, padBuzzTicks } from './padCues.ts';
import type { PadBuzz } from './padCues.ts';
import {
  PAD_FLAG_TILT, PAD_HOLD_ACTIONS, encodePadAxes, encodePadTour, formatPadCode, normalizePadCode,
} from './padProtocol.ts';
import type { PadAxes, PadCue, PadHoldAction, PadStatus, PadTapAction, PadTourLayout, PadTourPart, PadTourStop } from './padProtocol.ts';
import { padServiceUrl } from './padEndpoint.ts';
import { t } from '../ui/i18n.ts';
import { icon } from '../ui/icons/icon.ts';
import type { IconId } from '../ui/icons/icon.ts';
import { prefersReducedMotion } from '../ui/accessibilityPreferences.ts';
import { datumAttr } from '../ui/dom.ts';
import { dialogSurface } from '../ui/components/surfaceStack.ts';

const SETTINGS_KEY = 'cot.pad.v1';
const RESUME_KEY = 'cot.pad.resume';
/** Set once this phone has seen the controls' guide (its first pairing). */
const TOUR_KEY = 'cot.pad.tour';
const TOUR_MS = 10_000;
const NO_TILT_MS = 1500;
const HEARTBEAT_MS = 100;
/** A thumb that lands on the fire button aims once it has moved this far (a press's wobble never nudges the gun). */
const FIRE_AIM_DEADZONE_PX = 10;
/** The gun's loaded buzz plays for a load this long or longer (an autocannon's round-to-round is not announced). */
const READY_MIN_S = 1.5;

interface PadSettings { tilt: boolean; lockDeg: number; aim: number; hand: 'right' | 'left'; buzz: boolean }
const LOCKS = [25, 35, 45, 60];
const AIMS = [0.5, 1, 1.5, 2];

function loadSettings(): PadSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<PadSettings>;
    return { tilt: raw.tilt !== false, lockDeg: LOCKS.includes(Number(raw.lockDeg)) ? Number(raw.lockDeg) : DEFAULT_STEERING.maxAngleDeg,
      aim: AIMS.includes(Number(raw.aim)) ? Number(raw.aim) : 1, hand: raw.hand === 'left' ? 'left' : 'right', buzz: raw.buzz !== false };
  } catch { return { tilt: true, lockDeg: DEFAULT_STEERING.maxAngleDeg, aim: 1, hand: 'right', buzz: true }; }
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
/** A motion token's length in ms (1 under reduced motion, as the tokens collapse). */
const tokenMs = (name: string): number => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

/** Tick marks around a dial (degrees clockwise from 12 o'clock), every `step`, the `major`th one longer. */
function ticks(from: number, to: number, step: number, major: number, r: number): string {
  let d = '';
  for (let i = 0, a = from; a <= to + 1e-6; i++, a += step) {
    const x = Math.sin(a * Math.PI / 180), y = -Math.cos(a * Math.PI / 180), inner = r - (i % major ? 4 : 8);
    d += `M${(x * inner).toFixed(1)} ${(y * inner).toFixed(1)}L${(x * r).toFixed(1)} ${(y * r).toFixed(1)}`;
  }
  return d;
}

// ---- screens ---------------------------------------------------------------------------------------------------
const join = html(`<section class="pad-join">
  <h1 class="pad-title">${icon('phone', { size: 28 })}<span>${esc(t('pad.title'))}</span></h1>
  <form class="pad-form" novalidate>
    <label for="pad-code">${esc(t('pad.join.label'))}</label>
    <input class="pad-code" id="pad-code" name="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="7" inputmode="text">
    <button class="pad-key pad-go" type="submit">${esc(t('pad.join.connect'))}</button>
  </form>
  <p class="pad-hint">${esc(t('pad.join.hint'))}</p>
  <p class="pad-error" role="alert"></p>
</section>`);
const form = join.querySelector('form') as HTMLFormElement;
const codeInput = join.querySelector('input') as HTMLInputElement;
const submitLabel = join.querySelector('.pad-go') as HTMLElement;
const hint = join.querySelector('.pad-hint') as HTMLElement;
const error = join.querySelector('.pad-error') as HTMLElement;

const shellKeys = [0, 1, 2].map((slot) => `<button class="pad-key pad-shell" type="button" data-slot="${slot}" aria-pressed="false" hidden></button>`).join('');
const consumableGlyphs = ['repair', 'medkit', 'extinguisher'] as const;
// a consumable is a guarded switch: the press lifts the red cover and throws the switch under it
const guards = consumableGlyphs.map((glyph, i) => `<button class="pad-guard" type="button" data-tap="consumable${i + 1}" aria-label="${esc(t('pad.consumable', { n: i + 1 }))}">`
  + `<i class="pad-bat" aria-hidden="true"></i><span class="pad-cover" aria-hidden="true">${icon(glyph, { size: 18 })}</span></button>`).join('');
// The controller is a tank's control panel in the hand. The ammunition keys light for the loaded shell and count its
// rounds; the throttle is a T-handle in its gate; the repeater shows the tank on the field, its hull turning as the
// phone turns (a tap re-centres the wheel) and the gun's bearing on its rim; the speedometer reads the hull's speed; the
// sight is the gunner's, and the ring around the fire button fills as the gun loads. Every glyph is the game's own;
// every control is named for assistive tech.
const ctl = html(`<section class="pad-ctl" hidden>
  <header class="pad-top">
    <span class="pad-link num" ${datumAttr('phone-link')} role="status" aria-live="polite"></span>
    <div class="pad-ammo" role="group">${shellKeys}</div>
    <div class="pad-cons" role="group">${guards}</div>
    <button class="pad-key pad-sq" type="button" data-pause aria-label="${esc(t('pad.pause'))}">${icon('pause', { size: 20 })}</button>
    <button class="pad-key pad-sq" type="button" data-menu aria-label="${esc(t('pad.menu'))}">${icon('settings', { size: 20 })}</button>
  </header>
  <div class="pad-drive">
    <div class="pad-lever" role="slider" aria-label="${esc(t('pad.throttle'))}" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0">
      <span class="pad-gate" aria-hidden="true"></span>
      <span class="pad-knob" aria-hidden="true"></span>
    </div>
    <button class="pad-key pad-brake" type="button" data-hold="handbrake" aria-label="${esc(t('pad.brake'))}">${icon('handbrake', { size: 24 })}</button>
  </div>
  <div class="pad-mid">
    <div class="pad-cell"><div class="pad-gauge pad-speedo" aria-hidden="true">
      <svg class="pad-face" viewBox="-50 -50 100 100" fill="none" stroke="currentColor" stroke-width="1.5"><path d="${ticks(-120, 120, 20, 3, 44)}"/></svg>
      <span class="pad-readout"><b class="pad-kmh num">0</b><span>${esc(t('pad.kmh'))}</span></span>
      <span class="pad-needle"></span>
    </div></div>
    <div class="pad-cell"><button class="pad-gauge pad-tank" type="button" data-centre aria-label="${esc(t('pad.centre'))}">
      <svg class="pad-face" viewBox="-50 -50 100 100" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="${ticks(0, 350, 10, 3, 44)}"/></svg>
      <span class="pad-hull" aria-hidden="true"><img class="pad-plan" alt="" decoding="async" draggable="false" hidden><span class="pad-plan-glyph">${icon('vehicle', { size: 72 })}</span></span>
      <span class="pad-bearing" aria-hidden="true"><svg viewBox="-50 -50 100 100"><path d="M0 -38 5 -48H-5Z"/></svg></span>
    </button></div>
    <p class="pad-msg" role="status"></p>
  </div>
  <div class="pad-right">
    <div class="pad-aim" aria-label="${esc(t('pad.aimPad'))}">
      <span class="pad-reticle" aria-hidden="true"><svg viewBox="-50 -50 100 100" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M-6 7 0 1 6 7M-46 0H-14M14 0H46M-38-4V4M-30-2.5V2.5M-22-2.5V2.5M22-2.5V2.5M30-2.5V2.5M38-4V4M0 14V42M-3 22H3M-3 30H3M-5 38H5"/></svg></span>
    </div>
    <button class="pad-key pad-look" type="button" data-hold="freeLook" aria-label="${esc(t('pad.look'))}">${icon('freeLook', { size: 22 })}</button>
    <div class="pad-zoom" role="group" hidden>
      <button class="pad-key" type="button" data-tap="zoomOut" aria-label="${esc(t('pad.zoomOut'))}">${icon('zoomOut', { size: 20 })}</button>
      <button class="pad-key" type="button" data-tap="zoomIn" aria-label="${esc(t('pad.zoomIn'))}">${icon('zoomIn', { size: 20 })}</button>
    </div>
    <button class="pad-key pad-scope" type="button" data-tap="sniperToggle" aria-pressed="false" aria-label="${esc(t('pad.scope'))}">${icon('scope', { size: 22 })}</button>
    <button class="pad-key pad-lock" type="button" data-tap="autoAim" aria-pressed="false" aria-label="${esc(t('pad.lock'))}" hidden>${icon('autoAim', { size: 22 })}</button>
    <div class="pad-trigger">
      <span class="pad-ring" aria-hidden="true"><span class="pad-ring-half"><i></i></span><span class="pad-ring-half"><i></i></span></span>
      <button class="pad-fire" type="button" data-hold="fire" aria-label="${esc(t('pad.fire'))}">${icon('fireGun', { size: 36 })}</button>
    </div>
  </div>
  <dialog class="pad-opts">
    <div class="row"><span>${esc(t('pad.opt.tilt'))}</span><button class="pad-key" type="button" data-tilt aria-pressed="true"></button></div>
    <div class="row"><span>${esc(t('pad.opt.hand'))}</span><button class="pad-key" type="button" data-hand></button></div>
    <div class="row"><span>${esc(t('pad.opt.buzz'))}</span><button class="pad-key" type="button" data-buzz aria-pressed="true"></button></div>
    <div class="row"><span>${esc(t('pad.opt.tour'))}</span><button class="pad-key" type="button" data-tour>${esc(t('pad.opt.show'))}</button></div>
    ${['lockDeg', 'aim'].map((name) => `<div class="row"><span id="pad-opt-${name}">${esc(t(name === 'aim' ? 'pad.opt.aim' : 'pad.opt.lock'))}</span>`
      + `<span class="pad-step" role="group" aria-labelledby="pad-opt-${name}">`
      + `<button class="pad-key" type="button" data-step="${name}" data-dir="-1" aria-label="${esc(t('pad.opt.lower'))}">${icon('chevronLeft', { size: 18 })}</button>`
      + `<b class="num" data-value="${name}" aria-live="polite"></b>`
      + `<button class="pad-key" type="button" data-step="${name}" data-dir="1" aria-label="${esc(t('pad.opt.raise'))}">${icon('chevronRight', { size: 18 })}</button>`
      + '</span></div>').join('')}
    <div class="end">
      <button class="pad-key pad-stop" type="button" data-disconnect>${esc(t('pad.opt.disconnect'))}</button>
      <button class="pad-key" type="button" data-close>${esc(t('pad.opt.close'))}</button>
    </div>
  </dialog>
  <div class="pad-tour" hidden><button class="pad-key pad-tour-skip" type="button">${esc(t('pad.tour.skip'))}<i class="pad-tour-clock" aria-hidden="true"></i></button></div>
</section>`);
const end = html(`<section class="pad-end" hidden>
  <h1 class="pad-title">${icon('phone', { size: 28 })}<span>${esc(t('pad.title'))}</span></h1>
  <p class="pad-end-msg" role="alert"></p>
  <button class="pad-key pad-go" type="button">${esc(t('pad.ended.again'))}</button>
</section>`);
// the safe areas (the island, the home bar) as the system lays them on the viewport, read once per layout
const probe = html('<div class="pad-probe" aria-hidden="true"></div>');
root.append(join, ctl, end, probe);

const $ = <T extends Element>(selector: string, host: ParentNode = ctl): T => host.querySelector(selector) as T;
const linkChip = $<HTMLElement>('.pad-link');
const lever = $<HTMLElement>('.pad-lever');
const knob = $<HTMLElement>('.pad-knob');
const hull = $<HTMLElement>('.pad-hull');
const plan = $<HTMLImageElement>('.pad-plan');
const planGlyph = $<HTMLElement>('.pad-plan-glyph');
const bearing = $<HTMLElement>('.pad-bearing');
const needle = $<HTMLElement>('.pad-needle');
const kmhReadout = $<HTMLElement>('.pad-kmh');
const reticle = $<HTMLElement>('.pad-reticle');
const message = $<HTMLElement>('.pad-msg');
const ringHalves = [...ctl.querySelectorAll<HTMLElement>('.pad-ring-half i')];
const zoom = $<HTMLElement>('.pad-zoom');
const scope = $<HTMLButtonElement>('.pad-scope');
const aimPad = $<HTMLElement>('.pad-aim');
const fireButton = $<HTMLButtonElement>('.pad-fire');
const lockKey = $<HTMLButtonElement>('.pad-lock');
const tour = $<HTMLElement>('.pad-tour');
const options = $<HTMLDialogElement>('.pad-opts');
ctl.dataset.hand = settings.hand;

function show(screen: 'join' | 'controller' | 'ended'): void {
  root.dataset.screen = screen;
  join.hidden = screen !== 'join';
  ctl.hidden = screen !== 'controller';
  end.hidden = screen !== 'ended';
  if (screen === 'join') unlockFrame();
}

// ---- the frame: landscape, glued to the phone ------------------------------------------------------------------------
/** `lock`: the screen angle (screen.orientation's, from the device's natural orientation) the controller is laid out
 *  for; `turn`: how far the frame is turned on the viewport now; `settled` once that landscape was the system's own. */
const frame = { lock: 0, turn: 0, scale: 1, w: 0, h: 0, angle: 0, seen: '', settled: false };
const screenAngle = (): number =>
  ((((screen.orientation?.angle ?? Number((window as { orientation?: number }).orientation)) || 0) % 360) + 360) % 360;
const isWide = (): boolean => innerWidth >= innerHeight;
const viewportKey = (): string => `${screenAngle()}|${innerWidth}|${innerHeight}`;

/** Lay the controller out for the landscape the phone is held in: the system's own when it is in landscape, else the
 *  quarter turn from portrait most phones are turned (the top to the left), until the system first shows a landscape. */
function lockFrame(): void {
  frame.settled = isWide();
  frame.lock = lockAngle(screenAngle(), frame.settled);
  root.dataset.lock = '';
  layoutFrame();
}

/** The one layout: the frame's size and its padding clear of the island and the home bar, both in the frame's own
 *  axes. */
function layoutFrame(): void {
  const turn = frameTurn(frame.lock, screenAngle());
  const across = turn % 180 !== 0;
  frame.w = across ? innerHeight : innerWidth;
  frame.h = across ? innerWidth : innerHeight;
  const style = getComputedStyle(probe);
  const [top, right, bottom, left] = frameInsets(turn, [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
    .map((v) => parseFloat(v) || 0)) as [number, number, number, number];
  root.style.setProperty('--pad-w', `${frame.w}px`);
  root.style.setProperty('--pad-h', `${frame.h}px`);
  root.style.setProperty('--pad-px', `${Math.max(16, right, left)}px`);
  root.style.setProperty('--pad-pt', `${Math.max(8, top)}px`);
  root.style.setProperty('--pad-pb', `${Math.max(12, bottom)}px`);
  turnFrame();
  if (!tour.hidden) placeTour();
}

/** After every system rotation: turn the frame back onto the phone and fit it, a transform and nothing else. The first
 *  landscape the system shows settles the layout, and a resize that is no rotation (the keyboard leaving, Safari's bars
 *  in landscape) lays it out again. */
function turnFrame(): void {
  if (root.dataset.lock === undefined) return;
  const angle = screenAngle();
  const wide = isWide();
  if (!frame.settled && wide) {
    frame.settled = true;
    frame.lock = angle;
    layoutFrame();
    return;
  }
  if (angle === frame.angle && frame.turn % 180 === 0 && wide && (innerWidth !== frame.w || innerHeight !== frame.h)) {
    layoutFrame();
    return;
  }
  frame.angle = angle;
  frame.seen = viewportKey();
  frame.turn = frameTurn(frame.lock, angle);
  const across = frame.turn % 180 !== 0;
  frame.scale = Math.min(1, (across ? innerHeight : innerWidth) / frame.w, (across ? innerWidth : innerHeight) / frame.h);
  root.style.setProperty('--pad-turn', `${frame.turn}deg`);
  root.style.setProperty('--pad-scale', String(Math.round(frame.scale * 1000) / 1000));
  if (debug) debug.frame = { lock: frame.lock, turn: frame.turn, scale: frame.scale, w: frame.w, h: frame.h };
}

function unlockFrame(): void {
  delete root.dataset.lock;
  for (const name of ['--pad-w', '--pad-h', '--pad-px', '--pad-pt', '--pad-pb', '--pad-turn', '--pad-scale']) root.style.removeProperty(name);
}
// iOS fires no event when it flips one landscape straight to the other, nor a resize when the keyboard leaves, so the
// heartbeat also looks
screen.orientation?.addEventListener('change', turnFrame);
window.addEventListener('orientationchange', turnFrame);
window.addEventListener('resize', turnFrame);

/** A finger's movement on the viewport in the frame's own axes (the frame is laid out unturned, then turned). */
const inFrame = (dx: number, dy: number): [number, number] => frameDelta(frame.turn, dx, dy);

// ---- controls state ------------------------------------------------------------------------------------------
const axes: PadAxes = { flags: 0, seq: 0, t: 0, steer: 0, throttle: 0, aimX: 0, aimY: 0, held: 0 };
const bytes = new Uint8Array(24);
let link: PadLink | null = null;
let tiltSeen = false;
let tiltAngle: number | null = null;
let tiltCentre = 0;
let stickX = 0;
let lastSentKey = '';
let lastSendAt = -Infinity;
let rttMs: number | null = null;
let ringAnimations: Animation[] = [];
let reloadKey = '';
/** Diagnostics for the pad e2e and the owner's real-device check. */
interface PhoneDebug {
  sent: number; held: number; throttle: number; released: number; rttMs: number | null; applyMs: number; tilt: boolean; state: string; frame: object | null;
  /** The buzzes played, by name, the guide's last state (shown, skipped, timed out) and how long it last stayed open. */
  buzz: Record<string, number>; tour: string; tourMs: number;
}
const debug: PhoneDebug | null = import.meta.env.DEV || /[?&]padDebug\b/.test(location.search)
  ? ((globalThis as { __COT_PAD_PHONE?: PhoneDebug }).__COT_PAD_PHONE = { sent: 0, held: 0, throttle: 0, released: 0, rttMs: null, applyMs: 0, tilt: false, state: 'join', frame: null, buzz: {}, tour: '', tourMs: 0 }) : null;

const steering = (): number => {
  if (settings.tilt && tiltSeen) {
    if (tiltAngle === null) return 0;
    return steerFromAngle(tiltAngle, tiltCentre, { ...DEFAULT_STEERING, maxAngleDeg: settings.lockDeg });
  }
  return stickX;
};

/** Send the current frame now when it changed: every sensor and touch event goes at once (the data channel is free; a
 *  wait for the next animation frame cost up to one phone frame of latency), the relay keeps its own rate cap. */
function send(force = false): void {
  if (!link) return;
  axes.steer = steering();
  axes.flags = settings.tilt && tiltSeen ? PAD_FLAG_TILT : 0;
  const key = `${axes.steer.toFixed(3)}|${axes.throttle.toFixed(3)}|${axes.aimX}|${axes.aimY}|${axes.held}`;
  const changed = key !== lastSentKey;
  const now = performance.now();
  if (!changed && !force && now - lastSendAt < HEARTBEAT_MS) return;
  axes.seq = (axes.seq + 1) & 0xffff;
  axes.t = Math.round(performance.timeOrigin + now) >>> 0;
  link.sendAxes(encodePadAxes(axes, bytes), changed);
  lastSentKey = key;
  lastSendAt = now;
  if (debug) { debug.sent++; debug.held = axes.held; debug.throttle = axes.throttle; }
}
setInterval(() => {
  if (root.dataset.lock !== undefined && viewportKey() !== frame.seen) turnFrame();
  send();
}, HEARTBEAT_MS);

/** The hull turns with the wheel: the repeater is the steering's readout (written on input events, transform only). */
function paintWheel(): void {
  const turn = Math.round(steering() * 30 * 2) / 2;
  hull.style.transform = `rotate(${turn}deg)`;
}

// ---- tilt ------------------------------------------------------------------------------------------------------
/** The wheel angle in the locked frame: β and γ are the device's own axes, so the system turning the page changes
 *  nothing. Level is the centre; a tap on the repeater makes the current angle the centre. */
function onOrientation(event: DeviceOrientationEvent): void {
  if (event.beta === null || event.gamma === null) return;
  tiltSeen = true;
  tiltAngle = wheelAngleDeg(event.beta, event.gamma, frame.lock);
  if (debug) debug.tilt = true;
  applyMode();
  paintWheel();
  send();
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
  hull.classList.toggle('is-stick', !tilt);
}

// ---- presses -------------------------------------------------------------------------------------------------------
// Every control acts on its own finger's press, never on a click: iOS sends no click for a touch while another finger
// is down, and the throttle thumb is always down. The finger is captured, so sliding it off keeps a hold and presses
// nothing else; a lost capture lets go. iOS's own gestures never get a finger: the controller cancels their default
// (double-tap zoom, the callout, selection, the page's rubber band), and touch-action is none on the whole page.
//
// Every press and every cue is felt (padCues.ts names each buzz): the Vibration API plays the pattern where there is one
// (Android); iOS Safari has none, but ticks once when a switch control toggles (iOS 18), so a hidden switch is toggled
// for each tick of the pattern. Whether iOS ticks outside a touch's own handler (a cue off the link) is unverified on
// hardware: the simulator has no haptics.
let tickHost: HTMLLabelElement | null = null;
function tickOnce(): void {
  try {
    if (!tickHost) {
      tickHost = document.createElement('label');
      tickHost.hidden = true;
      tickHost.innerHTML = '<input type="checkbox" switch tabindex="-1">';
      document.body.append(tickHost);
    }
    tickHost.click();
  } catch { /* unsupported */ }
}
const vibrates = typeof navigator.vibrate === 'function';
/** When the buzz playing now ends: a press never cuts one short (the Vibration API's next call ends the one before). */
let buzzingUntil = 0;
/** The last shot's kick (its gun's weight, from the battle's cue), and when the trigger last kicked for a shot of its
 *  own (the battle's cue for that one shot then adds none). */
let shotStrength = 0.6;
let shotFeltAt = -Infinity;
function buzz(kind: PadBuzz, strength?: number): void {
  if (!settings.buzz) return;
  const now = performance.now();
  if (kind === 'press' && now < buzzingUntil) return;
  const pattern = padBuzzPattern(kind, strength);
  buzzingUntil = now + pattern.reduce((total, ms) => total + ms, 0);
  if (debug) debug.buzz[kind] = (debug.buzz[kind] ?? 0) + 1;
  try {
    if (vibrates) { navigator.vibrate(pattern); return; }
    for (const at of padBuzzTicks(pattern)) { if (at) setTimeout(tickOnce, at); else tickOnce(); }
  } catch { /* unsupported */ }
}

/** Each control's way to let go of every finger on it (releaseControls). */
const letGo: Array<() => void> = [];
/** A press: the first finger down presses (and is felt: a tick, or the buzz `feel` names), and the control lets go when
 *  the last finger on it lifts. */
function press(control: HTMLElement, down: () => void, up?: () => void, feel: () => PadBuzz = () => 'press'): void {
  const pointers = new Set<number>();
  control.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    try { control.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    pointers.add(event.pointerId);
    if (pointers.size > 1) return;
    control.classList.add('is-down');
    const kind = feel();
    buzz(kind, kind === 'shot' ? shotStrength : undefined);
    down();
  });
  const lift = (): void => {
    control.classList.remove('is-down');
    up?.();
  };
  const release = (event: PointerEvent): void => {
    if (!pointers.delete(event.pointerId) || pointers.size) return;
    lift();
  };
  letGo.push(() => { if (!pointers.size) return; pointers.clear(); lift(); });
  control.addEventListener('pointerup', release);
  control.addEventListener('pointercancel', release);
  control.addEventListener('lostpointercapture', release);
  // a keyboard or assistive-tech activation (a click with no pointer behind it) is one press and release
  control.addEventListener('click', (event) => {
    if (event.detail !== 0) return;
    down();
    if (up) setTimeout(up, 120);
  });
}
ctl.addEventListener('touchstart', (event) => { if (!(event.target as Element).closest('dialog')) event.preventDefault(); }, { passive: false });
ctl.addEventListener('contextmenu', (event) => event.preventDefault());
// Nothing zooms the page (owner 2026-10-30: "when u click in sessions like it zooms in"): the viewport is fixed at scale
// 1 and touch-action is none everywhere, and iOS's pinch (gesture*), a double tap's second touch and dblclick are
// cancelled here too; the one input is 28 px, past the 16 px below which iOS zooms in on focus.
for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
  document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
}
let lastTouchEnd = -Infinity;
document.addEventListener('touchend', (event) => {
  const now = performance.now();
  if (now - lastTouchEnd < 350 && !(event.target as Element).closest('input, dialog')) event.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// ---- the throttle / stick ---------------------------------------------------------------------------------------
let leverPointer: number | null = null;
let leverOrigin = { x: 0, y: 0 };
function leverMove(event: PointerEvent): void {
  if (event.pointerId !== leverPointer) return;
  // the gate's own size and the finger's travel in the frame's axes, in the frame's pixels
  const travelY = Math.max(24, lever.offsetHeight / 2 - 26);
  const travelX = Math.max(24, lever.offsetWidth / 2 - 26);
  const [fx, fy] = inFrame(event.clientX - leverOrigin.x, event.clientY - leverOrigin.y);
  const dy = Math.max(-travelY, Math.min(travelY, fy / frame.scale));
  const stick = lever.classList.contains('is-stick');
  const dx = stick ? Math.max(-travelX, Math.min(travelX, fx / frame.scale)) : 0;
  axes.throttle = leverValue(-dy, travelY);
  stickX = stick ? leverValue(dx, travelX) : 0;
  knob.style.transform = `translate(${Math.round(dx)}px,${Math.round(dy)}px)`;
  lever.setAttribute('aria-valuenow', String(Math.round(axes.throttle * 100)));
  paintWheel();
  send();
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
  try { lever.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
  // the stick is where the thumb lands (no jump); the throttle's rest is the gate's centre
  const box = lever.getBoundingClientRect();
  leverOrigin = lever.classList.contains('is-stick') ? { x: event.clientX, y: event.clientY } : { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  leverMove(event);
});
lever.addEventListener('pointermove', leverMove);
lever.addEventListener('pointerup', leverEnd);
lever.addEventListener('pointercancel', leverEnd);
lever.addEventListener('lostpointercapture', leverEnd);
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

// ---- the sight -------------------------------------------------------------------------------------------------------
// One finger aims at a time: the sight's, or the trigger's. A thumb on the fire button drags to aim once it has moved
// past a press's wobble, so one thumb aims and shoots (held, the gun fires again the moment it loads); a finger that
// lands on the sight takes the aim from it. The gain follows the finger's speed (padInput.ts aimGain): a slow drag is
// precise, a flick swings the gun round.
let aimPointer: number | null = null;
let aimLast = { x: 0, y: 0, t: 0 };
let aimOrigin = { x: 0, y: 0 };
let aimSpeedNow = 0;
/** The finger must move this far (frame px) before it aims: 0 on the sight, a press's wobble on the trigger. */
let aimDeadzone = 0;
/** The aiming finger is the trigger's (a finger on the sight takes over from it). */
let aimByTrigger = false;
/** The scope is in: the gain stays lower, so a flick never throws the sight off a target. */
let scoped = false;
/** The reticle leans toward the drag (a third of it, at most 40 px) and settles back on release. */
const leanReticle = (dx: number, dy: number): void => {
  const reach = Math.hypot(dx, dy) / 3;
  const scale = reach > 40 ? 40 / reach : 1;
  reticle.style.transform = `translate(${Math.round((dx / 3) * scale)}px,${Math.round((dy / 3) * scale)}px)`;
};
function aimBegin(event: PointerEvent, deadzone: number, trigger: boolean): void {
  if (aimPointer !== null && !(aimByTrigger && !trigger)) return;
  aimPointer = event.pointerId;
  aimByTrigger = trigger;
  aimLast = { x: event.clientX, y: event.clientY, t: event.timeStamp };
  aimOrigin = { x: event.clientX, y: event.clientY };
  aimSpeedNow = 0;
  aimDeadzone = deadzone;
}
function aimMove(event: PointerEvent): void {
  if (event.pointerId !== aimPointer) return;
  const [lx, ly] = inFrame(event.clientX - aimOrigin.x, event.clientY - aimOrigin.y);
  if (aimDeadzone) {
    // still inside the press's wobble: nothing moves, and the aim starts from here, without a jump
    if (Math.hypot(lx, ly) / frame.scale < aimDeadzone) return;
    aimDeadzone = 0;
    aimLast = { x: event.clientX, y: event.clientY, t: event.timeStamp };
    return;
  }
  // totals, not deltas: a lost frame loses no aim (padProtocol's axes frame); the finger's own distance, in the frame's axes
  const [dx, dy] = inFrame(event.clientX - aimLast.x, event.clientY - aimLast.y);
  aimSpeedNow = aimSpeed(aimSpeedNow, Math.hypot(dx, dy), event.timeStamp - aimLast.t);
  const gain = settings.aim * aimGain(aimSpeedNow, scoped);
  axes.aimX += dx * gain;
  axes.aimY += dy * gain;
  aimLast = { x: event.clientX, y: event.clientY, t: event.timeStamp };
  leanReticle(lx, ly);
  send();
}
function aimEnd(event: PointerEvent): void {
  if (event.pointerId !== aimPointer) return;
  aimPointer = null;
  leanReticle(0, 0);
}
aimPad.addEventListener('pointerdown', (event) => {
  if (aimPointer !== null && !aimByTrigger) return;
  event.preventDefault();
  try { aimPad.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
  aimBegin(event, 0, false);
});
// the trigger's press (and its capture) is press()'s; the same finger's drag aims
fireButton.addEventListener('pointerdown', (event) => aimBegin(event, FIRE_AIM_DEADZONE_PX, true));
for (const host of [aimPad, fireButton]) {
  host.addEventListener('pointermove', aimMove);
  host.addEventListener('pointerup', aimEnd);
  host.addEventListener('pointercancel', aimEnd);
  host.addEventListener('lostpointercapture', aimEnd);
}

// ---- letting go -------------------------------------------------------------------------------------------------------
/** Every control lets go at once when the link drops or the page is hidden or loses focus (a call, the lock button, the
 *  app switcher): no trigger or throttle survives a drop, and the thumbs press again to drive. */
function releaseControls(): void {
  if (debug) debug.released++;
  for (const release of letGo) release();
  leverPointer = null;
  aimPointer = null;
  axes.throttle = 0;
  axes.held = 0;
  stickX = 0;
  knob.style.transform = 'translate(0px,0px)';
  lever.setAttribute('aria-valuenow', '0');
  leanReticle(0, 0);
  paintWheel();
  send(true);
}
window.addEventListener('blur', releaseControls);
window.addEventListener('pagehide', releaseControls);

// ---- holds and taps -----------------------------------------------------------------------------------------------
const holdBit = (action: PadHoldAction): number => 1 << PAD_HOLD_ACTIONS.indexOf(action);
function hold(action: PadHoldAction, down: boolean): void {
  const bit = holdBit(action);
  if (down === !!(axes.held & bit)) return;
  axes.held = down ? axes.held | bit : axes.held & ~bit;
  // the ctl event names the first axes frame carrying the new state; that frame goes now
  link?.sendCtl({ k: down ? 'down' : 'up', a: action, s: (axes.seq + 1) & 0xffff });
  send(true);
}
const tap = (action: PadTapAction): void => { link?.sendCtl({ k: 'tap', a: action }); };
/** The trigger's feel: the shot's kick at once when the gun is loaded (the battle's cue for that shot then adds none),
 *  a refusal while it loads, a plain tick outside a battle. */
const triggerFeel = (): PadBuzz => {
  if (ctl.dataset.state === 'ready') { shotFeltAt = performance.now(); return 'shot'; }
  return ctl.dataset.state === 'loading' ? 'unready' : 'press';
};
for (const button of ctl.querySelectorAll<HTMLElement>('[data-hold]')) {
  const action = button.dataset.hold as PadHoldAction;
  press(button, () => hold(action, true), () => hold(action, false), action === 'fire' ? triggerFeel : undefined);
}
for (const button of ctl.querySelectorAll<HTMLElement>('.pad-top [data-tap], .pad-right [data-tap]')) {
  press(button, () => tap(button.dataset.tap as PadTapAction));
}
for (const button of ctl.querySelectorAll<HTMLButtonElement>('.pad-shell')) {
  press(button, () => tap(`shell${Number(button.dataset.slot) + 1}` as PadTapAction));
}
press($<HTMLElement>('[data-pause]'), () => link?.sendCtl({ k: 'pause' }));
press($<HTMLElement>('[data-centre]'), () => {
  if (tiltAngle !== null) tiltCentre = tiltAngle;
  paintWheel();
  send(true);
});

// ---- options ----------------------------------------------------------------------------------------------------
// tilt on or off (a toggle), the steering lock and the aim speed (steppers over their few values), in a native modal on
// the surface stack; the modal sits in the top layer, outside the frame, so it turns with the frame's own variables
const tiltToggle = options.querySelector('[data-tilt]') as HTMLButtonElement;
const handToggle = options.querySelector('[data-hand]') as HTMLButtonElement;
const buzzToggle = options.querySelector('[data-buzz]') as HTMLButtonElement;
function paintOptions(): void {
  tiltToggle.setAttribute('aria-pressed', String(settings.tilt));
  tiltToggle.textContent = t(settings.tilt ? 'pad.opt.on' : 'pad.opt.off');
  buzzToggle.setAttribute('aria-pressed', String(settings.buzz));
  buzzToggle.textContent = t(settings.buzz ? 'pad.opt.on' : 'pad.opt.off');
  handToggle.textContent = t(settings.hand === 'left' ? 'pad.opt.left' : 'pad.opt.right');
  ctl.dataset.hand = settings.hand;
  (options.querySelector('[data-value="lockDeg"]') as HTMLElement).textContent = t('pad.opt.lockValue', { deg: settings.lockDeg });
  (options.querySelector('[data-value="aim"]') as HTMLElement).textContent = t('pad.opt.aimValue', { n: settings.aim });
}
function changed(): void {
  saveSettings();
  applyMode();
  paintOptions();
  send(true);
}
tiltToggle.addEventListener('click', () => { settings.tilt = !settings.tilt; changed(); });
handToggle.addEventListener('click', () => { settings.hand = settings.hand === 'left' ? 'right' : 'left'; changed(); });
buzzToggle.addEventListener('click', () => { settings.buzz = !settings.buzz; changed(); buzz('press'); });
(options.querySelector('[data-tour]') as HTMLButtonElement).addEventListener('click', () => { options.close(); showTour(); });
for (const button of options.querySelectorAll<HTMLButtonElement>('[data-step]')) {
  button.addEventListener('click', () => {
    const name = button.dataset.step as 'lockDeg' | 'aim';
    const values = name === 'aim' ? AIMS : LOCKS;
    const at = Math.max(0, Math.min(values.length - 1, values.indexOf(settings[name]) + Number(button.dataset.dir)));
    settings[name] = values[at]!;
    changed();
  });
}
dialogSurface(options, 'pad-options');
press($<HTMLElement>('[data-menu]'), () => { paintOptions(); options.showModal(); });
$<HTMLButtonElement>('[data-close]').addEventListener('click', () => options.close());
$<HTMLButtonElement>('[data-disconnect]').addEventListener('click', () => {
  options.close();
  forgetResume();
  link?.end();
});

// ---- the controls' guide ------------------------------------------------------------------------------------------
// The first pairing on a phone names its controls where they are (owner 2026-11-03: "a tutorial should show up on first
// phone pairing mode that u can skip and also disappears after like 10 seconds"): a ring on each control and its name
// beside it, over the live panel, which the thumbs work through; Skip or ten seconds ends it, and Options shows it
// again. The marks live in the frame, so they turn with it; their places are the controls' layout boxes in the frame.
// The game screen shows the same guide at the same time (owner 2026-11-03: "the tutorial should open on game screen and
// the phone"): the phone sends its picture (every control's box, the stops and where their names sit) with the guide,
// and Skip on either side, or the ten seconds, ends it on both.
/** A control the guide names: its ring (none for the sight, a surface the others sit on), its ghost stroke, and the
 *  sides its name may take in order (`over` is on the control itself, `inside` along its top edge). */
interface TourStop {
  id: PadTourStop; selector: string; words: string; ring?: 'round' | 'none'; move?: 'x' | 'y';
  sides: ReadonlyArray<'above' | 'below' | 'left' | 'right' | 'inside' | 'over'>;
}
let tourTimer: ReturnType<typeof setTimeout> | undefined;
let tourShownAt = 0;
let clockAnimation: Animation | null = null;
let ghostAnimations: Animation[] = [];
const toured = (): boolean => { try { return localStorage.getItem(TOUR_KEY) === '1'; } catch { return true; } };

/** A control's box in the frame's own (untransformed) layout. */
function frameBox(element: HTMLElement): { x: number; y: number; w: number; h: number } {
  let x = 0;
  let y = 0;
  for (let node: HTMLElement | null = element; node && node !== ctl; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  return { x, y, w: element.offsetWidth, h: element.offsetHeight };
}

function tourStops(): TourStop[] {
  const tilt = settings.tilt;
  return [
    ...(tilt ? [{ id: 'tilt', selector: '.pad-tank', words: t('pad.tour.tilt'), ring: 'round', sides: ['over'] } as const] : []),
    { id: tilt ? 'throttle' : 'stick', selector: '.pad-lever', words: t(tilt ? 'pad.tour.throttle' : 'pad.tour.stick'), move: 'y',
      sides: settings.hand === 'left' ? ['left', 'over'] : ['right', 'over'] },
    { id: 'aim', selector: '.pad-aim', words: t('pad.tour.aim'), ring: 'none', move: 'x', sides: ['inside'] },
    { id: 'fire', selector: '.pad-trigger', words: t('pad.tour.fire'), ring: 'round', sides: ['over'] },
    { id: 'scope', selector: '.pad-scope', words: t('pad.scope'), ring: 'round', sides: ['over', 'above'] },
    { id: 'lock', selector: '.pad-lock', words: t('pad.lock'), ring: 'round', sides: ['over', 'left'] },
  ];
}

/** Every control the game screen's picture of the phone draws, and its kind there. */
const TOUR_PARTS: ReadonlyArray<readonly [string, PadTourPart]> = [
  ['.pad-link', 'chip'], ['.pad-shell', 'key'], ['.pad-guard', 'key'], ['[data-pause]', 'key'], ['[data-menu]', 'key'],
  ['.pad-lever', 'lever'], ['.pad-brake', 'key'], ['.pad-speedo', 'dial'], ['.pad-tank', 'dial'], ['.pad-aim', 'sight'],
  ['.pad-look', 'key'], ['.pad-zoom', 'key'], ['.pad-scope', 'round'], ['.pad-lock', 'round'], ['.pad-trigger', 'fire'],
];
const shown = (element: HTMLElement): boolean => element.offsetWidth > 0 && !element.closest('[hidden]');
/** The guide's picture as the game screen draws it (placeTour writes it). */
let tourLayout: PadTourLayout | null = null;

/** Lay the marks on their controls and each name on the first side with room (inside the frame, clear of every other
 *  control in the guide and of the names already placed), and Skip over the instruments' message line. */
function placeTour(): void {
  for (const old of tour.querySelectorAll('.pad-tour-mark,.pad-tour-tip')) old.remove();
  const width = ctl.clientWidth;
  const height = ctl.clientHeight;
  const stops = tourStops().map((stop) => ({ stop, target: ctl.querySelector<HTMLElement>(stop.selector) }))
    .filter((entry): entry is { stop: TourStop; target: HTMLElement } => !!entry.target && shown(entry.target));
  const px = Math.round;
  const layout: PadTourLayout = { w: px(width), h: px(height), parts: [], stops: [] };
  tourLayout = layout;
  for (const [selector, kind] of TOUR_PARTS) {
    for (const part of ctl.querySelectorAll<HTMLElement>(selector)) {
      if (!shown(part)) continue;
      const box = frameBox(part);
      layout.parts.push([kind, px(box.x), px(box.y), px(box.w), px(box.h)]);
    }
  }
  const boxes = stops.map(({ target }) => frameBox(target));
  type Box = { x: number; y: number; w: number; h: number };
  const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  // a surface a control sits on (the sight under the fire button) is no obstacle to that control's name
  const encloses = (outer: Box, inner: Box): boolean =>
    outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.w >= inner.x + inner.w && outer.y + outer.h >= inner.y + inner.h;
  const skip = $<HTMLElement>('.pad-tour-skip', tour);
  const mid = frameBox($<HTMLElement>('.pad-mid'));
  const skipBox = { x: Math.round(mid.x + mid.w / 2 - skip.offsetWidth / 2), y: Math.round(mid.y + mid.h - skip.offsetHeight), w: skip.offsetWidth, h: skip.offsetHeight };
  skip.style.transform = `translate(${skipBox.x}px,${skipBox.y}px)`;
  const taken: Box[] = [skipBox];
  stops.forEach(({ stop }, i) => {
    const box = boxes[i]!;
    const mark = html(`<span class="pad-tour-mark" aria-hidden="true"${stop.ring ? ` data-ring="${stop.ring}"` : ''}>${stop.move ? `<i class="pad-tour-ghost" data-move="${stop.move}"></i>` : ''}</span>`);
    mark.style.cssText = `width:${box.w + 8}px;height:${box.h + 8}px;transform:translate(${box.x - 4}px,${box.y - 4}px)`;
    tour.append(mark);
    const tip = html(`<span class="pad-tour-tip" aria-hidden="true">${esc(stop.words)}</span>`);
    tour.append(tip);
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const at = (side: TourStop['sides'][number]): Box => {
      const cx = box.x + box.w / 2 - w / 2;
      const cy = box.y + box.h / 2 - h / 2;
      switch (side) {
        case 'above': return { x: cx, y: box.y - h - 10, w, h };
        case 'below': return { x: cx, y: box.y + box.h + 10, w, h };
        case 'left': return { x: box.x - w - 10, y: cy, w, h };
        case 'right': return { x: box.x + box.w + 10, y: cy, w, h };
        case 'over': return { x: cx, y: cy, w, h };
        default: return { x: cx, y: box.y + 12, w, h };
      }
    };
    const fits = (place: Box): boolean => place.x >= 0 && place.y >= 0 && place.x + w <= width && place.y + h <= height
      && boxes.every((other, j) => j === i || encloses(other, box) || !overlaps(place, other))
      && taken.every((other) => !overlaps(place, other));
    const place = stop.sides.map(at).find(fits) ?? at(stop.sides[0]!);
    const x = Math.max(0, Math.min(width - w, place.x));
    const y = Math.max(0, Math.min(height - h, place.y));
    taken.push({ x, y, w, h });
    tip.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
    layout.stops.push([stop.id, px(box.x), px(box.y), px(box.w), px(box.h), px(x + w / 2), px(y + h / 2),
      stop.ring === 'round' ? 1 : stop.ring === 'none' ? 2 : 0, stop.move === 'x' ? 1 : stop.move === 'y' ? 2 : 0]);
  });
  // a ghost thumb strokes the throttle and the sight (none under reduced motion)
  for (const animation of ghostAnimations.splice(0)) animation.cancel();
  if (prefersReducedMotion()) return;
  const stroke = tokenMs('--dur-stage') * 2;
  for (const ghost of tour.querySelectorAll<HTMLElement>('.pad-tour-ghost')) {
    const along = (at: number): string => ghost.dataset.move === 'y' ? `translateY(${-at}px)` : `translateX(${at}px)`;
    ghostAnimations.push(ghost.animate([{ transform: along(-36), opacity: 0 }, { transform: along(-30), opacity: 1, offset: 0.15 },
      { transform: along(36), opacity: 1, offset: 0.8 }, { transform: along(40), opacity: 0 }], { duration: stroke, easing: 'ease-in-out', iterations: Infinity }));
  }
}

function showTour(): void {
  try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* private mode: the guide shows each pairing */ }
  tour.hidden = false;
  // Skip takes the status line's place at the foot of the middle column while the guide shows
  ctl.dataset.tour = '';
  placeTour();
  // the ten seconds run out under Skip (a still bar under reduced motion)
  clockAnimation?.cancel();
  clockAnimation = prefersReducedMotion() ? null : $<HTMLElement>('.pad-tour-clock', tour)
    .animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: TOUR_MS, easing: 'linear', fill: 'forwards' });
  clearTimeout(tourTimer);
  tourTimer = setTimeout(() => endTour('timeout'), TOUR_MS);
  if (tourLayout) link?.sendCtl({ k: 'tour', on: true, l: encodePadTour(tourLayout) });
  tourShownAt = performance.now();
  if (debug) debug.tour = 'shown';
}
/** End the guide: skipped here, its time up, the pairing ended, or skipped on the game screen (`screen`). Skip and the
 *  time running out end it on the game screen too. */
function endTour(how: 'skipped' | 'timeout' | 'ended' | 'screen'): void {
  if (tour.hidden) return;
  if (how === 'skipped' || how === 'timeout') link?.sendCtl({ k: 'tour', on: false });
  clearTimeout(tourTimer);
  clockAnimation?.cancel();
  for (const animation of ghostAnimations.splice(0)) animation.cancel();
  tour.hidden = true;
  delete ctl.dataset.tour;
  if (debug) { debug.tour = how; debug.tourMs = Math.round(performance.now() - tourShownAt); }
}
press($<HTMLElement>('.pad-tour-skip', tour), () => endTour('skipped'));

// ---- status from the desktop -------------------------------------------------------------------------------------
/** The reload ring: two half rings turn into view, the right half over the first half of the load and the left over the
 *  second (transform only, one linear sweep over the time left); reduced motion steps with each status. */
function paintReload(done: number, leftS: number): void {
  for (const animation of ringAnimations) animation.cancel();
  ringAnimations = [];
  const [right, left] = ringHalves as [HTMLElement, HTMLElement];
  const turn = (share: number): string => `rotate(${Math.round(Math.max(0, Math.min(0.5, share)) * 3600) / 10}deg)`;
  right.style.transform = turn(done);
  left.style.transform = turn(done - 0.5);
  if (leftS <= 0 || prefersReducedMotion()) return;
  const timing = { duration: leftS * 1000, easing: 'linear', fill: 'forwards' } as const;
  if (done < 0.5) {
    const half = (0.5 - done) / (1 - done);
    ringAnimations.push(right.animate([{ transform: turn(done) }, { transform: turn(0.5), offset: half }, { transform: turn(0.5) }], timing));
    ringAnimations.push(left.animate([{ transform: turn(0) }, { transform: turn(0), offset: half }, { transform: turn(0.5) }], timing));
  } else {
    ringAnimations.push(left.animate([{ transform: turn(done - 0.5) }, { transform: turn(0.5) }], timing));
  }
}

/** The gun's loaded buzz: at the end of the load the status names (each status re-arms it with the time left), or at the
 *  first status that says loaded, whichever comes first; never with the trigger held (the shot's own kick follows). */
let readyTimer: ReturnType<typeof setTimeout> | undefined;
let loadingLong = false;
function gunLoaded(): void {
  if (!loadingLong) return;
  loadingLong = false;
  if (!(axes.held & holdBit('fire'))) buzz('ready');
}
function armReady(next: PadStatus): void {
  clearTimeout(readyTimer);
  const loading = next.battle && next.alive && next.reloadS > 0 && next.reloadTotalS >= READY_MIN_S;
  if (loading) {
    loadingLong = true;
    readyTimer = setTimeout(gunLoaded, next.reloadS * 1000);
  } else if (next.battle && next.alive && next.reloadS <= 0) gunLoaded();
  else loadingLong = false;
}

/** A battle's cue (padCues.ts): its buzz, once. The trigger already kicked for a shot it fired itself. */
function feelCue(cue: PadCue, strength?: number): void {
  if (cue === 'shot') {
    if (strength !== undefined) shotStrength = strength;
    const kicked = performance.now() - shotFeltAt < 600;
    shotFeltAt = -Infinity;
    if (kicked) return;
  }
  buzz(cue, strength);
}

function paintStatus(next: PadStatus): void {
  const buttons = ctl.querySelectorAll<HTMLButtonElement>('.pad-shell');
  buttons.forEach((button, slot) => {
    const shell = next.shells[slot];
    button.hidden = !shell;
    if (!shell) return;
    const code = shell.type;
    const count = shell.unlimited ? '∞' : String(shell.count);
    const markup = `<i class="pad-lamp" aria-hidden="true"></i>${icon(shell.icon as IconId, { size: 18 })}<span class="pad-type">${esc(code)}</span><b class="pad-count num">${esc(count)}</b>`;
    if (button.dataset.markup !== markup) {
      const rolled = button.dataset.count !== undefined && button.dataset.count !== count;
      button.innerHTML = markup;
      button.dataset.markup = markup;
      button.dataset.count = count;
      // a spent round rolls the counter's drum on by one
      if (rolled && !prefersReducedMotion()) {
        $<HTMLElement>('.pad-count', button).animate([{ transform: 'translateY(-55%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
          { duration: tokenMs('--dur-fast'), easing: 'ease-out' });
      }
    }
    button.setAttribute('aria-pressed', String(slot === next.slot));
    button.setAttribute('aria-label', t('pad.shell', { n: slot + 1, type: code, count }));
    if (!shell.unlimited && shell.count <= 0) button.dataset.empty = ''; else delete button.dataset.empty;
  });
  zoom.hidden = !next.sniper;
  scope.setAttribute('aria-pressed', String(next.sniper));
  scoped = next.sniper;
  // the sight's lock: a key only where there is one to have (a couch seat's sight is its own bearing)
  lockKey.hidden = next.lock === undefined;
  lockKey.setAttribute('aria-pressed', String(!!next.lock));
  // the tank in the hand is the one on the field: its plan view, and the gun's bearing on the rim (+ is to the left)
  if (next.spec && plan.dataset.spec !== next.spec) {
    plan.dataset.spec = next.spec;
    plan.hidden = true;
    planGlyph.hidden = false;
    plan.onload = () => { plan.hidden = false; planGlyph.hidden = true; };
    plan.onerror = () => { plan.hidden = true; planGlyph.hidden = false; };
    plan.src = `/icons/${next.spec}_top.webp`;
  }
  if (next.turret !== undefined) bearing.style.transform = `rotate(${Math.round(-next.turret * 573) / 10}deg)`;
  // the speedometer: 0 at the needle's stop, the top speed at its far end (a 240° sweep)
  const kmh = Math.abs(next.kmh ?? 0);
  const share = next.topKmh ? Math.min(1, kmh / next.topKmh) : 0;
  needle.style.transform = `rotate(${Math.round(-1200 + share * 2400) / 10}deg)`;
  if (kmhReadout.textContent !== String(kmh)) kmhReadout.textContent = String(kmh);
  ctl.dataset.state = !next.battle ? 'idle' : !next.alive ? 'down' : next.reloadS > 0 ? 'loading' : 'ready';
  armReady(next);
  message.textContent = !next.battle ? t('pad.waitingBattle') : next.paused ? t('pad.paused') : !next.alive ? t('pad.destroyed')
    : settings.tilt && tiltSeen && tiltAngle === null ? t('pad.flat') : '';
  const key = `${next.reloadS > 0 ? Math.round(next.reloadTotalS * 10) : 0}|${Math.round((next.reloadTotalS - next.reloadS) * 2)}`;
  if (key === reloadKey) return;
  reloadKey = key;
  paintReload(next.reloadTotalS > 0 && next.reloadS > 0 ? 1 - next.reloadS / next.reloadTotalS : 1, next.reloadS);
}

/** This phone's seat in a couch lobby (docs/COUCH-MODE.md), named before the link's state; 0 in a single pairing. */
let seatNumber = 0;

function paintLink(state: PadLinkState): void {
  let words = '';
  let tone = '';
  if (state.kind === 'live') {
    words = `${state.path === 'relay' ? t('pad.state.relay') : t('pad.state.live')}${rttMs !== null ? ` · ${t('pad.ms', { ms: Math.round(rttMs) })}` : ''}`;
    tone = state.path === 'relay' ? 'warn' : 'ok';
  } else if (state.kind === 'linking') { words = t('pad.state.linking'); tone = 'warn'; }
  else if (state.kind === 'away') { words = t('pad.state.away'); tone = 'warn'; }
  else words = t('pad.state.connecting');
  linkChip.textContent = seatNumber ? `${t('pad.seat', { n: seatNumber })} · ${words}` : words;
  if (tone) linkChip.dataset.tone = tone; else delete linkChip.dataset.tone;
}

// ---- pairing -------------------------------------------------------------------------------------------------------
let wakeLock: { release(): Promise<void> } | null = null;
async function keepAwake(): Promise<void> {
  try { wakeLock = await (navigator as { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen') ?? null; }
  catch { wakeLock = null; }
}
/** Why the last pairing ended: a phone that lost the network while hidden resumes by itself when it is shown again. */
let endedReason = '';
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { releaseControls(); return; }
  if (link && !wakeLock) void keepAwake();
  const resume = storedResume();
  if (!link && endedReason === 'unreachable' && resume) connect({ resume });
});

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
  full: 'pad.ended.full', removed: 'pad.ended.removed',
};

function connect(route: { code: string } | { resume: { code: string; token: string } }): void {
  const serviceUrl = padServiceUrl();
  if (!serviceUrl) { error.textContent = t('pad.ended.unreachable'); return; }
  lockFrame();
  show('controller');
  applyMode();
  paintLink({ kind: 'connecting' });
  let pinged: ReturnType<typeof setInterval> | null = null;
  link = createPadLink({
    role: 'phone',
    serviceUrl,
    ...('code' in route ? { code: route.code } : { resume: route.resume }),
    onToken(code, token) { try { sessionStorage.setItem(RESUME_KEY, JSON.stringify({ code, token })); } catch { /* private mode */ } },
    onSeat(seat) { seatNumber = seat; },
    onState(state) {
      if (debug) debug.state = state.kind;
      if (state.kind !== 'live') releaseControls();
      if (state.kind === 'ended') {
        clearInterval(pinged!);
        link = null;
        endedReason = state.reason;
        // the network's failure keeps the pairing to resume; every other ending forgets it
        if (state.reason !== 'replaced' && state.reason !== 'unreachable') forgetResume();
        void wakeLock?.release().catch(() => {});
        wakeLock = null;
        endTour('ended');
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
      if (message.k === 'cue') feelCue(message.c, message.m);
      else if (message.k === 'tour') { if (!message.on) endTour('screen'); }
      else if (message.k === 'status') { paintStatus(message.s); if (!toured()) showTour(); }
      else if (message.k === 'pong') {
        rttMs = Math.max(0, performance.now() - message.t);
        if (debug) { debug.rttMs = rttMs; debug.applyMs = message.apply; }
        if (link) paintLink(link.state);
      } else if (message.k === 'ping') link?.sendCtl({ k: 'pong', t: message.t, d: performance.now(), apply: 0 });
    },
  });
}

/** The Start tap: motion access, the wake lock and full screen want a gesture (iOS), then the link. Where full screen
 *  is offered (Android), the system's own orientation lock holds the landscape the phone is in. */
function start(route: { code: string } | { resume: { code: string; token: string } }): void {
  codeInput.blur();
  void startTilt();
  void keepAwake();
  try {
    if (matchMedia('(pointer: coarse)').matches) {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
        .then(() => orientation.lock?.(orientation.type.startsWith('landscape') ? orientation.type : 'landscape')).catch(() => {});
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
  hint.hidden = false;
  show('join');
  codeInput.focus();
});

// A code from the QR (the fragment) or a pairing to resume: one Start tap (a gesture) goes. A second QR scanned while
// the page is open changes only the fragment (no reload): it fills the field again, unless a pairing is running.
function prefill(): void {
  const fromLink = normalizePadCode(decodeURIComponent(location.hash.slice(1)));
  const resume = storedResume();
  if (!fromLink && !resume) return;
  codeInput.value = formatPadCode(fromLink ?? resume!.code);
  submitLabel.textContent = t('pad.join.start');
  hint.hidden = true;
  error.textContent = '';
}
window.addEventListener('hashchange', () => { if (!link) { prefill(); show('join'); } });
prefill();
show('join');
