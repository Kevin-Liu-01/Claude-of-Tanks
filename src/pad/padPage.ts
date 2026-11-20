/**
 * The phone controller's page (/pad, docs/PHONE-CONTROLLER.md "Controls"): pair with a code, then play. The controller
 * is a tank's control panel held in two hands (owner 2026-11-20: "use joysticks buttons in specific areas, big buttons and
 * surface areas for all capabilities, special sections from left and right for the special abilities"): five zones, the
 * same in every mode (padLayout.ts). The left thumb has a floating stick and its hold key; the right thumb has the
 * gunner's sight to drag in, the fire button in its collar and the keys over it; the centre deck holds the rounds (or
 * Air Support's call-ins); a special column runs down each edge. The desktop's status says which mode the player is in
 * (tank, binoculars, drone, AC-130, Watch, destroyed) and which keys this player has, and the panel lays out that
 * mode's controls. Every control becomes an axes frame or a ctl message on the link; the desktop maps them onto its
 * input actions. The page asks for the wake lock and full screen from the Start tap (iOS wants a gesture), and keeps its
 * resume token in sessionStorage so a reload or a sleeping phone comes back.
 *
 * The phone is felt as well as seen (owner 2026-11-03: "it should buzz and vibrate"): every press ticks, and the battle's
 * cues (padCues.ts: the gun firing, hits given and taken, modules, fire, crashes, kills, death, the sight's lock) each
 * play their own buzz the moment the desktop sends them. A thumb on the fire button drags to aim, so one thumb aims and
 * shoots, and the sight's gain follows the finger's speed. The first pairing on a phone shows the zones' names over the
 * live panel for ten seconds, or until Skip.
 *
 * The panel is always laid out landscape. A page the system shows portrait (an iPhone with rotation lock on, held
 * sideways) turns the panel a quarter, the top to the left (Options' Flip turns it the other way): a transform only.
 */
import { createPadLink } from './padLink.ts';
import type { PadLink, PadLinkState, PadPhoneState } from './padLink.ts';
import { DRIVE_STICK, aimGain, aimSpeed, frameDelta, frameInsets, frameTurnFor, stickKnob, stickValue } from './padInput.ts';
import { PAD_LAYOUTS, padVisible } from './padLayout.ts';
import type { PadControl, PadModeLayout } from './padLayout.ts';
import { padBuzzPattern, padBuzzTicks } from './padBuzz.ts';
import { createPadReadyBuzz, padGunState } from './padReadyBuzz.ts';
import type { PadGunState } from './padReadyBuzz.ts';
import type { PadBuzz } from './padBuzz.ts';
import { PAD_HOLD_ACTIONS, PAD_TOUR_MS, encodePadAxes, encodePadTour, formatPadCode, normalizePadCode } from './padProtocol.ts';
import type {
  PadAxes, PadCue, PadHoldAction, PadMode, PadStatus, PadTapAction, PadTourEnd, PadTourLayout, PadTourPart, PadTourState, PadTourStop,
} from './padProtocol.ts';
import { padServiceUrl } from './padEndpoint.ts';
import { t } from '../ui/i18n.ts';
import { icon } from '../ui/icons/icon.ts';
import type { IconId } from '../ui/icons/icon.ts';
import { prefersReducedMotion } from '../ui/accessibilityPreferences.ts';
import { datumAttr } from '../ui/dom.ts';
import { dialogSurface } from '../ui/components/surfaceStack.ts';

const SETTINGS_KEY = 'cot.pad.v2';
const RESUME_KEY = 'cot.pad.resume';
/** Set once this phone has seen the controls' guide (its first pairing). */
const TOUR_KEY = 'cot.pad.tour.v2';
const TOUR_MS = PAD_TOUR_MS;
const HEARTBEAT_MS = 100;
/** A thumb that lands on the fire button aims once it has moved this far (a press's wobble never nudges the gun). */
const FIRE_AIM_DEADZONE_PX = 10;

interface PadSettings { aim: number; hand: 'right' | 'left'; buzz: boolean; flip: boolean }
const AIMS = [0.5, 1, 1.5, 2];

function loadSettings(): PadSettings {
  const fallback: PadSettings = { aim: 1, hand: 'right', buzz: true, flip: false };
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<PadSettings>;
    return { aim: AIMS.includes(Number(raw.aim)) ? Number(raw.aim) : 1, hand: raw.hand === 'left' ? 'left' : 'right',
      buzz: raw.buzz !== false, flip: raw.flip === true };
  } catch { return fallback; }
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

/** Each mode's name on the top strip. */
const MODE_NAMES: Readonly<Record<PadMode, string>> = {
  idle: 'pad.mode.idle', tank: 'pad.mode.tank', strike: 'pad.mode.strike', drone: 'pad.mode.drone', gunship: 'pad.mode.gunship',
  watch: 'pad.mode.watch', dead: 'pad.mode.dead',
};
// The panel. The zones stay put in every mode; their keys are padLayout.ts's for the mode (renderLayout). The stick's
// well and the sight are the panel's own glass; the fire button sits in its turned collar, the ring around it filling as
// the gun loads; the rounds are illuminated keys with a counter drum.
const ctl = html(`<section class="pad-ctl" hidden data-mode="idle">
  <header class="pad-top">
    <span class="pad-link num" ${datumAttr('phone-link')} role="status" aria-live="polite"></span>
    <span class="pad-mode"></span>
    <span class="pad-kmh num" aria-hidden="true"></span>
    <p class="pad-msg" role="status"></p>
    <button class="pad-key pad-sq" type="button" data-pause aria-label="${esc(t('pad.pause'))}">${icon('pause', { size: 22 })}</button>
    <button class="pad-key pad-sq" type="button" data-menu aria-label="${esc(t('pad.menu'))}">${icon('settings', { size: 22 })}</button>
  </header>
  <div class="pad-col pad-col-l" role="group"></div>
  <div class="pad-drive">
    <div class="pad-stick" role="application">
      <span class="pad-stick-name" aria-hidden="true"></span>
      <span class="pad-well" aria-hidden="true"><span class="pad-knob"></span></span>
    </div>
    <div class="pad-stick-keys" role="group"></div>
  </div>
  <div class="pad-deck" role="group"></div>
  <div class="pad-gun">
    <div class="pad-aim">
      <span class="pad-aim-name" aria-hidden="true"></span>
      <span class="pad-reticle" aria-hidden="true"><svg viewBox="-50 -50 100 100" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M-6 7 0 1 6 7M-46 0H-14M14 0H46M-38-4V4M-30-2.5V2.5M-22-2.5V2.5M22-2.5V2.5M30-2.5V2.5M38-4V4M0 14V42M-3 22H3M-3 30H3M-5 38H5"/></svg></span>
    </div>
    <div class="pad-fire-keys" role="group"></div>
    <div class="pad-trigger">
      <span class="pad-ring" aria-hidden="true"><span class="pad-ring-half"><i></i></span><span class="pad-ring-half"><i></i></span></span>
      <button class="pad-fire" type="button" aria-label="${esc(t('pad.fire'))}"></button>
    </div>
  </div>
  <div class="pad-col pad-col-r" role="group"></div>
  <dialog class="pad-opts">
    <div class="row"><span>${esc(t('pad.opt.hand'))}</span><button class="pad-key" type="button" data-hand></button></div>
    <div class="row"><span>${esc(t('pad.opt.buzz'))}</span><button class="pad-key" type="button" data-buzz aria-pressed="true"></button></div>
    <div class="row"><span>${esc(t('pad.opt.flip'))}</span><button class="pad-key" type="button" data-flip aria-pressed="false"></button></div>
    <div class="row"><span>${esc(t('pad.opt.tour'))}</span><button class="pad-key" type="button" data-tour>${esc(t('pad.opt.show'))}</button></div>
    <div class="row"><span id="pad-opt-aim">${esc(t('pad.opt.aim'))}</span><span class="pad-step" role="group" aria-labelledby="pad-opt-aim">`
      + `<button class="pad-key" type="button" data-step="aim" data-dir="-1" aria-label="${esc(t('pad.opt.lower'))}">${icon('chevronLeft', { size: 18 })}</button>`
      + `<b class="num" data-value="aim" aria-live="polite"></b>`
      + `<button class="pad-key" type="button" data-step="aim" data-dir="1" aria-label="${esc(t('pad.opt.raise'))}">${icon('chevronRight', { size: 18 })}</button>`
    + `</span></div>
    <div class="row pad-screen"><span>${esc(t('pad.opt.screen'))}</span><span class="pad-step">
      <button class="pad-key" type="button" data-screen="minimapZoom" aria-label="${esc(t('action.minimapZoom'))}">${icon('map', { size: 20 })}</button>
      <button class="pad-key" type="button" data-screen="shotLog" aria-label="${esc(t('action.shotLog'))}">${icon('penetration', { size: 20 })}</button>
      <button class="pad-key" type="button" data-screen="networkPanel" aria-label="${esc(t('action.networkPanel'))}">${icon('telemetry', { size: 20 })}</button>
    </span></div>
    <div class="end">
      <button class="pad-key pad-stop" type="button" data-disconnect>${esc(t('pad.opt.disconnect'))}</button>
      <button class="pad-key" type="button" data-close>${esc(t('pad.opt.close'))}</button>
    </div>
  </dialog>
  <div class="pad-brief" hidden role="group">
    <p class="pad-brief-step num" aria-live="polite"></p>
    <p class="pad-brief-note">${esc(t('pad.brief.note'))}</p>
    <div class="pad-brief-keys">
      <button class="pad-key pad-brief-ready" type="button" data-brief="ready" aria-pressed="false"><i class="pad-lamp" aria-hidden="true"></i>${icon('check', { size: 28 })}<span class="pad-word">${esc(t('pad.brief.ready'))}</span></button>
      <button class="pad-key pad-brief-skip" type="button" data-brief="skip">${icon('chevronRight', { size: 28 })}<span class="pad-word">${esc(t('pad.brief.skip'))}</span></button>
    </div>
  </div>
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
const modeName = $<HTMLElement>('.pad-mode');
const kmhReadout = $<HTMLElement>('.pad-kmh');
const message = $<HTMLElement>('.pad-msg');
const leftColumn = $<HTMLElement>('.pad-col-l');
const rightColumn = $<HTMLElement>('.pad-col-r');
const stickZone = $<HTMLElement>('.pad-stick');
const stickName = $<HTMLElement>('.pad-stick-name');
const well = $<HTMLElement>('.pad-well');
const knob = $<HTMLElement>('.pad-knob');
const stickKeys = $<HTMLElement>('.pad-stick-keys');
const deck = $<HTMLElement>('.pad-deck');
const aimPad = $<HTMLElement>('.pad-aim');
const aimName = $<HTMLElement>('.pad-aim-name');
const reticle = $<HTMLElement>('.pad-reticle');
const fireKeys = $<HTMLElement>('.pad-fire-keys');
const trigger = $<HTMLElement>('.pad-trigger');
const fireButton = $<HTMLButtonElement>('.pad-fire');
const ringHalves = [...ctl.querySelectorAll<HTMLElement>('.pad-ring-half i')];
const tour = $<HTMLElement>('.pad-tour');
const options = $<HTMLDialogElement>('.pad-opts');
const briefOverlay = $<HTMLElement>('.pad-brief');
const briefStep = $<HTMLElement>('.pad-brief-step');
const briefReady = $<HTMLButtonElement>('.pad-brief-ready');
ctl.dataset.hand = settings.hand;

function show(screen: 'join' | 'controller' | 'ended'): void {
  root.dataset.screen = screen;
  join.hidden = screen !== 'join';
  ctl.hidden = screen !== 'controller';
  end.hidden = screen !== 'ended';
  if (screen === 'join') unlockFrame();
}

// ---- the frame: landscape, turned a quarter on a portrait page --------------------------------------------------------
/** `turn`: how far the frame is turned on the viewport; `w`, `h`: its own size; `seen`: the viewport it was laid out for. */
const frame = { turn: 0, w: 0, h: 0, seen: '' };
const isWide = (): boolean => innerWidth >= innerHeight;
const viewportKey = (): string => `${innerWidth}|${innerHeight}|${settings.flip ? 1 : 0}`;

/** The one layout: landscape as the system shows it, or turned a quarter on a portrait page; its padding clear of the
 *  island and the home bar on the frame's own sides. */
function layoutFrame(): void {
  if (ctl.hidden) return;
  frame.turn = frameTurnFor(isWide(), settings.flip);
  frame.seen = viewportKey();
  const across = frame.turn % 180 !== 0;
  frame.w = across ? innerHeight : innerWidth;
  frame.h = across ? innerWidth : innerHeight;
  const style = getComputedStyle(probe);
  const [top, right, bottom, left] = frameInsets(frame.turn, [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
    .map((v) => parseFloat(v) || 0)) as [number, number, number, number];
  root.dataset.frame = '';
  root.style.setProperty('--pad-w', `${frame.w}px`);
  root.style.setProperty('--pad-h', `${frame.h}px`);
  root.style.setProperty('--pad-pl', `${Math.max(12, left)}px`);
  root.style.setProperty('--pad-pr', `${Math.max(12, right)}px`);
  root.style.setProperty('--pad-pt', `${Math.max(8, top)}px`);
  root.style.setProperty('--pad-pb', `${Math.max(10, bottom)}px`);
  root.style.setProperty('--pad-turn', `${frame.turn}deg`);
  if (debug) debug.frame = { turn: frame.turn, w: frame.w, h: frame.h };
  if (!tour.hidden) placeTour();
}

function unlockFrame(): void {
  delete root.dataset.frame;
  for (const name of ['--pad-w', '--pad-h', '--pad-pl', '--pad-pr', '--pad-pt', '--pad-pb', '--pad-turn']) root.style.removeProperty(name);
}
// a rotation, Safari's bars, the keyboard leaving: lay it out again (iOS fires no event for some, so the heartbeat
// looks too); a held stick or sight keeps its finger, its moves read in the new frame's axes
screen.orientation?.addEventListener('change', layoutFrame);
window.addEventListener('orientationchange', layoutFrame);
window.addEventListener('resize', layoutFrame);

/** A finger's movement on the viewport in the frame's own axes (the frame is laid out unturned, then turned). */
const inFrame = (dx: number, dy: number): [number, number] => frameDelta(frame.turn, dx, dy);

// ---- controls state ------------------------------------------------------------------------------------------
const axes: PadAxes = { flags: 0, seq: 0, t: 0, steer: 0, throttle: 0, aimX: 0, aimY: 0, held: 0 };
const bytes = new Uint8Array(24);
let link: PadLink | null = null;
let lastSentKey = '';
let lastSendAt = -Infinity;
let rttMs: number | null = null;
let ringAnimations: Animation[] = [];
let reloadKey = '';
/** Diagnostics for the pad e2e and the owner's real-device check. */
interface PhoneDebug {
  sent: number; held: number; throttle: number; steer: number; released: number; rttMs: number | null; applyMs: number; state: PadPhoneState;
  frame: object | null; mode: PadMode; keys: string[];
  /** The buzzes played, by name, the guide's last state (shown, skipped, timed out) and how long it last stayed open. */
  buzz: Record<string, number>; tour: PadTourState; tourMs: number;
  /** Lay the panel out for a status with no desktop (the evidence stills of every mode; a live link's next status wins). */
  preview?: (status: PadStatus) => void;
}
const debug: PhoneDebug | null = import.meta.env.DEV || /[?&]padDebug\b/.test(location.search)
  ? ((globalThis as { __COT_PAD_PHONE?: PhoneDebug }).__COT_PAD_PHONE = { sent: 0, held: 0, throttle: 0, steer: 0, released: 0, rttMs: null,
    applyMs: 0, state: 'join', frame: null, mode: 'idle', keys: [], buzz: {}, tour: 'hidden', tourMs: 0 }) : null;

/** Send the current frame now when it changed: every touch event goes at once (the data channel is free; a wait for the
 *  next animation frame cost up to one phone frame of latency), the relay keeps its own rate cap. */
function send(force = false): void {
  if (!link) return;
  const key = `${axes.steer.toFixed(3)}|${axes.throttle.toFixed(3)}|${axes.aimX}|${axes.aimY}|${axes.held}`;
  const changed = key !== lastSentKey;
  const now = performance.now();
  if (!changed && !force && now - lastSendAt < HEARTBEAT_MS) return;
  axes.seq = (axes.seq + 1) & 0xffff;
  axes.t = Math.round(performance.timeOrigin + now) >>> 0;
  link.sendAxes(encodePadAxes(axes, bytes), changed);
  lastSentKey = key;
  lastSendAt = now;
  if (debug) { debug.sent++; debug.held = axes.held; debug.throttle = axes.throttle; debug.steer = axes.steer; }
}
setInterval(() => {
  if (root.dataset.frame !== undefined && viewportKey() !== frame.seen) layoutFrame();
  send();
}, HEARTBEAT_MS);

// ---- presses -------------------------------------------------------------------------------------------------------
// Every control acts on its own finger's press, never on a click: iOS sends no click for a touch while another finger
// is down, and the stick's thumb is always down. The finger is captured, so sliding it off keeps a hold and presses
// nothing else; a lost capture lets go. iOS's own gestures never get a finger: the controller cancels their default
// (double-tap zoom, the callout, selection, the page's rubber band), and touch-action is none on the whole page.
//
// Every press and every cue is felt (padBuzz.ts names each buzz): the Vibration API plays the pattern where there is one
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

/** Each control's way to let go of every finger on it (releaseControls); a key a layout swap removes takes its own out. */
const letGo = new Set<() => void>();
/** A press: the first finger down presses (and is felt: a tick, or the buzz `feel` names), and the control lets go when
 *  the last finger on it lifts. */
function press(control: HTMLElement, down: () => void, up?: () => void, feel: () => PadBuzz = () => 'press'): () => void {
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
  const release_ = (): void => { if (!pointers.size) return; pointers.clear(); lift(); };
  letGo.add(release_);
  control.addEventListener('pointerup', release);
  control.addEventListener('pointercancel', release);
  control.addEventListener('lostpointercapture', release);
  // a keyboard or assistive-tech activation (a click with no pointer behind it) is one press and release
  control.addEventListener('click', (event) => {
    if (event.detail !== 0) return;
    down();
    if (up) setTimeout(up, 120);
  });
  // a key that leaves the layout lets go first, then forgets its hold
  return () => { release_(); letGo.delete(release_); };
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


// ---- the left stick -----------------------------------------------------------------------------------------------
// A floating stick: the well comes to where the thumb lands anywhere in the zone, so a thumb never hunts for it, and the
// knob follows the push to the ring. Its push is the drive (forward is up, steer is sideways), the drone's flight or
// Watch's camera, whatever the mode makes it; it springs back to the centre on the lift.
let stickPointer: number | null = null;
let stickOrigin = { x: 0, y: 0 };
function stickMove(event: PointerEvent): void {
  if (event.pointerId !== stickPointer) return;
  const [dx, dy] = inFrame(event.clientX - stickOrigin.x, event.clientY - stickOrigin.y);
  const [x, y] = stickValue(dx, dy, DRIVE_STICK);
  axes.steer = x;
  axes.throttle = y;
  const [kx, ky] = stickKnob(dx, dy, DRIVE_STICK.radiusPx);
  knob.style.transform = `translate(${Math.round(kx)}px,${Math.round(ky)}px)`;
  send();
}
function stickEnd(event: PointerEvent): void {
  if (event.pointerId !== stickPointer) return;
  stickPointer = null;
  centreStick();
  send(true);
}
function centreStick(): void {
  axes.steer = 0;
  axes.throttle = 0;
  knob.style.transform = 'translate(0px,0px)';
  well.style.transform = '';
  stickZone.classList.remove('is-down');
}
stickZone.addEventListener('pointerdown', (event) => {
  if (stickPointer !== null || ctl.dataset.stick === 'off') return;
  event.preventDefault();
  stickPointer = event.pointerId;
  try { stickZone.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
  // the well comes to the thumb: its centre is where the thumb landed, in the zone's own (frame) axes
  const box = stickZone.getBoundingClientRect();
  const [ox, oy] = inFrame(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2));
  well.style.transform = `translate(${Math.round(ox)}px,${Math.round(oy)}px)`;
  stickOrigin = { x: event.clientX, y: event.clientY };
  stickZone.classList.add('is-down');
  stickMove(event);
});
stickZone.addEventListener('pointermove', stickMove);
stickZone.addEventListener('pointerup', stickEnd);
stickZone.addEventListener('pointercancel', stickEnd);
stickZone.addEventListener('lostpointercapture', stickEnd);

// ---- the sight -------------------------------------------------------------------------------------------------------
// One finger aims at a time: the sight's, or the trigger's. A thumb on the fire button drags to aim once it has moved
// past a press's wobble, so one thumb aims and shoots (held, the gun fires again the moment it loads); a finger that
// lands on the sight takes the aim from it. The gain follows the finger's speed (padInput.ts aimGain): a slow drag is
// precise, a flick swings the gun round (in the drone and Watch, the camera).
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
function aimBegin(event: PointerEvent, deadzone: number, byTrigger: boolean): void {
  if (ctl.dataset.aim === 'off') return;
  if (aimPointer !== null && !(aimByTrigger && !byTrigger)) return;
  aimPointer = event.pointerId;
  aimByTrigger = byTrigger;
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
    if (Math.hypot(lx, ly) < aimDeadzone) return;
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
 *  app switcher): no trigger or stick survives a drop, and the thumbs press again to play. */
function releaseControls(): void {
  if (debug) debug.released++;
  for (const release of [...letGo]) release();
  stickPointer = null;
  aimPointer = null;
  axes.held = 0;
  centreStick();
  leanReticle(0, 0);
  send(true);
}
window.addEventListener('blur', releaseControls);
window.addEventListener('pagehide', releaseControls);

// ---- holds, taps and commands ---------------------------------------------------------------------------------------
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
  const gun = ctl.dataset.state as PadGunState | undefined;
  if (ctl.dataset.mode !== 'tank' && ctl.dataset.mode !== 'gunship') return 'press';
  if (gun === 'ready') { shotFeltAt = performance.now(); return 'shot'; }
  return gun === 'loading' ? 'unready' : 'press';
};
// FIRE is the trigger in every mode that has one (the binoculars' CALL too: the desktop's fire calls the strike)
press(fireButton, () => hold('fire', true), () => hold('fire', false), triggerFeel);
press($<HTMLElement>('[data-pause]'), () => link?.sendCtl({ k: 'pause' }));
// couch mode's briefing (the big screen's, between Start and GO): this seat's Ready, or Skip (ready, and the screen goes
// to the briefing's last step)
press(briefReady, () => link?.sendCtl({ k: 'ready' }));
press($<HTMLElement>('.pad-brief-skip'), () => link?.sendCtl({ k: 'ready', skip: true }));

/** A key of the layout: its glyph over its word, a lamp when it lights, and what it sends while a thumb is on it. */
function keyFor(control: PadControl, kind: 'col' | 'deck' | 'thumb'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `pad-key pad-${kind}-key`;
  button.dataset.id = control.id;
  if (control.lit) { button.dataset.lit = control.lit; button.setAttribute('aria-pressed', 'false'); }
  if ('hold' in control.send) button.dataset.holds = '';
  // the consumables are guarded switches: the red cover lifts while the thumb is on it
  if (/^consumable\d$/.test(control.id)) button.dataset.guard = '';
  button.setAttribute('aria-label', t(control.label));
  button.innerHTML = `${control.lit ? '<i class="pad-lamp" aria-hidden="true"></i>' : ''}${icon(control.glyph as IconId, { size: kind === 'thumb' ? 22 : 24 })}`
    + `<span class="pad-word">${esc(t(control.short ?? control.label))}</span>`;
  return button;
}

/** The layout drawn now: its mode and grants, the keys' let-go, and what is shown. */
let drawn = { key: '', mode: 'idle' as PadMode, layout: PAD_LAYOUTS.idle as PadModeLayout, mask: 0 };
const keyDisposers: Array<() => void> = [];
/** Lay the mode's controls into the zones (only those this player has): the columns, the stick's keys, the fire keys,
 *  the deck's call-ins. A hold whose key leaves lets go first; the stick and the sight keep their fingers when the new
 *  mode has them too (the binoculars come up while the tank drives on). */
function renderLayout(mode: PadMode, mask: number): void {
  const key = `${mode}|${mask}`;
  if (key === drawn.key) return;
  const layout = PAD_LAYOUTS[mode];
  for (const dispose of keyDisposers.splice(0)) dispose();
  drawn = { key, mode, layout, mask };
  ctl.dataset.mode = mode;
  modeName.textContent = t(MODE_NAMES[mode]);
  const fill = (host: HTMLElement, controls: readonly PadControl[], kind: 'col' | 'deck' | 'thumb'): void => {
    host.replaceChildren();
    for (const control of padVisible(controls, mask)) {
      const button = keyFor(control, kind);
      host.append(button);
      const send_ = control.send;
      if ('hold' in send_) keyDisposers.push(press(button, () => hold(send_.hold, true), () => hold(send_.hold, false)));
      else if ('tap' in send_) keyDisposers.push(press(button, () => tap(send_.tap)));
      else keyDisposers.push(press(button, () => link?.sendCtl(send_.n === undefined ? { k: 'cmd', c: send_.cmd } : { k: 'cmd', c: send_.cmd, n: send_.n })));
    }
    host.dataset.count = String(host.childElementCount);
  };
  fill(leftColumn, layout.left, 'col');
  fill(rightColumn, layout.right, 'col');
  fill(stickKeys, layout.stickKeys, 'thumb');
  fill(fireKeys, layout.fireKeys, 'thumb');
  if (layout.deck === 'shells') { deck.replaceChildren(...shellKeys); deck.dataset.count = '3'; }
  else fill(deck, layout.deck ?? [], 'deck');
  deck.dataset.kind = layout.deck === 'shells' ? 'shells' : 'keys';
  // the thumbs: a mode without a stick or a sight lets the finger on it go, and the zone stands down
  const { stick, aim, fire } = layout.thumbs;
  ctl.dataset.stick = stick ? 'on' : 'off';
  ctl.dataset.aim = aim ? 'on' : 'off';
  ctl.dataset.fire = fire ? 'on' : 'off';
  if (!stick && stickPointer !== null) { stickPointer = null; centreStick(); }
  if (!aim && aimPointer !== null) { aimPointer = null; leanReticle(0, 0); }
  // every hold the new layout does not show lets go (FIRE's, the brake's, Watch's climb)
  const shown = new Set<string>([...ctl.querySelectorAll<HTMLElement>('[data-holds]')].map((element) => element.dataset.id!));
  for (const action of PAD_HOLD_ACTIONS) {
    if (action === 'fire' ? !fire : !shown.has(action)) hold(action, false);
  }
  stickName.textContent = stick ? t(stick) : '';
  stickZone.setAttribute('aria-label', stick ? t(stick) : '');
  aimName.textContent = aim ? t(aim) : '';
  aimPad.setAttribute('aria-label', aim ? t(aim) : '');
  fireButton.innerHTML = fire ? icon(fire.glyph as IconId, { size: 36 }) : '';
  fireButton.setAttribute('aria-label', fire ? t(fire.label) : '');
  if (debug) { debug.mode = mode; debug.keys = [...ctl.querySelectorAll<HTMLElement>('[data-id]')].map((element) => element.dataset.id!); }
  if (!tour.hidden) placeTour();
}

// the rounds: three illuminated keys, the loaded shell's lamp lit, its rounds on a counter drum (the deck's in a tank
// and the AC-130's guns)
const shellKeys = [0, 1, 2].map((slot) => {
  const button = html(`<button class="pad-key pad-shell" type="button" data-slot="${slot}" aria-pressed="false" hidden></button>`) as HTMLButtonElement;
  press(button, () => tap(`shell${slot + 1}` as PadTapAction));
  return button;
});

// ---- options ----------------------------------------------------------------------------------------------------
// the fire hand (a mirror), vibration, the portrait turn and the aim speed, and the game screen's own keys (the minimap's
// zoom, the shot log, the network panel), in a native modal on the surface stack; the modal sits in the top layer,
// outside the frame, so it turns with the frame's own variables
const handToggle = options.querySelector('[data-hand]') as HTMLButtonElement;
const buzzToggle = options.querySelector('[data-buzz]') as HTMLButtonElement;
const flipToggle = options.querySelector('[data-flip]') as HTMLButtonElement;
function paintOptions(): void {
  buzzToggle.setAttribute('aria-pressed', String(settings.buzz));
  buzzToggle.textContent = t(settings.buzz ? 'pad.opt.on' : 'pad.opt.off');
  flipToggle.setAttribute('aria-pressed', String(settings.flip));
  flipToggle.textContent = t(settings.flip ? 'pad.opt.flipRight' : 'pad.opt.flipLeft');
  handToggle.textContent = t(settings.hand === 'left' ? 'pad.opt.left' : 'pad.opt.right');
  ctl.dataset.hand = settings.hand;
  (options.querySelector('[data-value="aim"]') as HTMLElement).textContent = t('pad.opt.aimValue', { n: settings.aim });
}
function changed(): void {
  saveSettings();
  paintOptions();
  layoutFrame();
  send(true);
}
handToggle.addEventListener('click', () => { settings.hand = settings.hand === 'left' ? 'right' : 'left'; changed(); });
buzzToggle.addEventListener('click', () => { settings.buzz = !settings.buzz; changed(); buzz('press'); });
flipToggle.addEventListener('click', () => { settings.flip = !settings.flip; changed(); });
(options.querySelector('[data-tour]') as HTMLButtonElement).addEventListener('click', () => { options.close(); showTour(); });
for (const button of options.querySelectorAll<HTMLButtonElement>('[data-step]')) {
  button.addEventListener('click', () => {
    const at = Math.max(0, Math.min(AIMS.length - 1, AIMS.indexOf(settings.aim) + Number(button.dataset.dir)));
    settings.aim = AIMS[at]!;
    changed();
  });
}
for (const button of options.querySelectorAll<HTMLButtonElement>('[data-screen]')) {
  button.addEventListener('click', () => { tap(button.dataset.screen as PadTapAction); buzz('press'); });
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
// The first pairing on a phone names its zones where they are (owner 2026-11-03: "a tutorial should show up on first
// phone pairing mode that u can skip and also disappears after like 10 seconds"): a ring on each zone and its name
// beside it, over the live panel, which the thumbs work through; Skip or ten seconds ends it, and Options shows it again.
// The marks live in the frame, so they turn with it; their places are the zones' layout boxes in the frame. The game
// screen shows the same guide at the same time (owner 2026-11-03: "the tutorial should open on game screen and the
// phone"): the phone sends its picture (every control's box, the stops and where their names sit) with the guide, and
// Skip on either side, or the ten seconds, ends it on both.
/** A zone the guide names: its ring (none for a surface the others sit on), its ghost stroke, and the sides its name may
 *  take in order (`over` is on the zone itself, `inside` along its top edge). */
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
  const left = settings.hand === 'left';
  const { thumbs } = drawn.layout;
  return [
    { id: 'stick', selector: '.pad-stick', words: t(thumbs.stick ?? 'pad.tour.stick'), ring: 'none', move: 'y', sides: ['inside'] },
    { id: 'aim', selector: '.pad-aim', words: t('pad.tour.aim'), ring: 'none', move: 'x', sides: ['inside'] },
    { id: 'fire', selector: '.pad-trigger', words: t('pad.tour.fire'), ring: 'round', sides: ['above', 'over'] },
    { id: 'deck', selector: '.pad-deck', words: t(drawn.mode === 'strike' ? 'pad.tour.callins' : 'pad.tour.deck'), sides: ['below', 'over'] },
    // a tank's columns are its repairs and its systems; another mode's are that mode's own keys
    { id: 'left', selector: '.pad-col-l', words: t(drawn.mode !== 'tank' ? 'pad.tour.modeKeys' : 'pad.tour.left'), sides: [left ? 'left' : 'right', 'over'] },
    { id: 'right', selector: '.pad-col-r', words: t(drawn.mode !== 'tank' ? 'pad.tour.modeKeys' : 'pad.tour.right'), sides: [left ? 'right' : 'left', 'over'] },
  ];
}

/** Every control the game screen's picture of the phone draws, and its kind there: the zones first, so a full panel's
 *  last keys are the ones a long picture drops (padProtocol.ts PAD_TOUR_MAX_PARTS). */
const TOUR_PARTS: ReadonlyArray<readonly [string, PadTourPart]> = [
  ['.pad-link', 'chip'], ['.pad-stick', 'stick'], ['.pad-aim', 'sight'], ['.pad-trigger', 'fire'], ['[data-pause]', 'key'],
  ['[data-menu]', 'key'], ['.pad-deck .pad-key', 'key'], ['.pad-stick-keys .pad-key', 'key'], ['.pad-fire-keys .pad-key', 'round'],
  ['.pad-col .pad-key', 'key'],
];
const shown = (element: HTMLElement): boolean => element.offsetWidth > 0 && !element.closest('[hidden]');
/** The guide's picture as the game screen draws it (placeTour writes it). */
let tourLayout: PadTourLayout | null = null;

/** Lay the marks on their zones and each name on the first side with room (inside the frame, clear of every other zone
 *  in the guide and of the names already placed), and Skip over the top strip's message. */
function placeTour(): void {
  for (const old of tour.querySelectorAll('.pad-tour-mark,.pad-tour-tip')) old.remove();
  const width = ctl.clientWidth;
  const height = ctl.clientHeight;
  const stops = tourStops().map((stop) => ({ stop, target: ctl.querySelector<HTMLElement>(stop.selector) }))
    .filter((entry): entry is { stop: TourStop; target: HTMLElement } => !!entry.target && shown(entry.target)
      && (entry.stop.id !== 'stick' || ctl.dataset.stick === 'on') && (entry.stop.id !== 'aim' || ctl.dataset.aim === 'on')
      && (entry.stop.id !== 'fire' || ctl.dataset.fire === 'on') && (!/^(?:left|right|deck)$/.test(entry.stop.id) || entry.target.childElementCount > 0));
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
  // a surface a control sits on (the sight around the fire button) is no obstacle to that control's name
  const encloses = (outer: Box, inner: Box): boolean =>
    outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.w >= inner.x + inner.w && outer.y + outer.h >= inner.y + inner.h;
  const skip = $<HTMLElement>('.pad-tour-skip', tour);
  const top = frameBox($<HTMLElement>('.pad-top'));
  const skipBox = { x: Math.round(top.x + top.w / 2 - skip.offsetWidth / 2), y: Math.round(top.y + top.h / 2 - skip.offsetHeight / 2), w: skip.offsetWidth, h: skip.offsetHeight };
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
  // a ghost thumb strokes the stick and the sight (none under reduced motion)
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
  // the game screen's copy closes by this time at the latest, whatever becomes of this phone (padReceiver.ts)
  if (tourLayout) link?.sendCtl({ k: 'tour', on: true, l: encodePadTour(tourLayout), ms: TOUR_MS });
  tourShownAt = performance.now();
  if (debug) debug.tour = 'shown';
}
/** End the guide: skipped here, its time up, the pairing ended, or skipped on the game screen (`screen`). Skip and the
 *  time running out end it on the game screen too. */
function endTour(how: PadTourEnd): void {
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

/** The gun's loaded buzz (padReadyBuzz.ts): never with the trigger held (the shot's own kick follows). */
const readyBuzz = createPadReadyBuzz({
  buzz: () => buzz('ready'),
  fireHeld: () => !!(axes.held & holdBit('fire')),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout> | undefined),
});

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
  // the loaded buzz hears every status first: no paint below and no early return can keep one from it
  readyBuzz.status(next);
  // the mode the desktop is in lays the panel out (padLayout.ts); a swap ticks the hands once
  const mode: PadMode = next.battle ? next.m ?? (next.alive ? 'tank' : 'dead') : 'idle';
  const before = drawn.key;
  renderLayout(mode, next.a ?? 0);
  if (before && drawn.key !== before && drawn.mode !== mode) buzz('press');
  shellKeys.forEach((button, slot) => {
    const shell = next.shells[slot];
    button.hidden = !shell;
    if (!shell) return;
    const code = shell.type;
    const count = shell.unlimited ? '∞' : String(shell.count);
    const markup = `<i class="pad-lamp" aria-hidden="true"></i>${icon(shell.icon as IconId, { size: 22 })}<span class="pad-type">${esc(code)}</span><b class="pad-count num">${esc(count)}</b>`;
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
  scoped = next.sniper;
  // the room's briefing stands over the panel while the big screen shows it (never in a battle: the desktop sends none)
  briefOverlay.hidden = !next.b || next.battle;
  if (next.b && !next.battle) {
    briefStep.textContent = t('pad.brief.step', { n: next.b.s + 1, total: next.b.n });
    briefReady.setAttribute('aria-pressed', String(next.b.r));
  }
  // the keys that light: the scope while it is in, the lock while it holds a target
  for (const key of ctl.querySelectorAll<HTMLElement>('[data-lit]')) {
    key.setAttribute('aria-pressed', String(key.dataset.lit === 'sniper' ? next.sniper : !!next.lock));
  }
  // the speed, on the top strip's counter while a hull drives
  const kmh = mode === 'tank' || mode === 'strike' ? String(Math.abs(next.kmh ?? 0)) : '';
  const words = kmh ? `${kmh} ${t('pad.kmh')}` : '';
  if (kmhReadout.textContent !== words) kmhReadout.textContent = words;
  ctl.dataset.state = padGunState(next);
  message.textContent = !next.battle ? t(drawn.layout.note ?? 'pad.waitingBattle') : next.paused ? t('pad.paused') : '';
  const key = `${next.reloadS > 0 ? Math.round(next.reloadTotalS * 10) : 0}|${Math.round((next.reloadTotalS - next.reloadS) * 2)}`;
  if (key === reloadKey) return;
  reloadKey = key;
  paintReload(next.reloadTotalS > 0 && next.reloadS > 0 ? 1 - next.reloadS / next.reloadTotalS : 1, next.reloadS);
}

if (debug) debug.preview = (status) => { show('controller'); layoutFrame(); paintStatus(status); };

function paintLink(state: PadLinkState): void {
  let words = '';
  let tone = '';
  if (state.kind === 'live') {
    words = `${state.path === 'relay' ? t('pad.state.relay') : t('pad.state.live')}${rttMs !== null ? ` · ${t('pad.ms', { ms: Math.round(rttMs) })}` : ''}`;
    tone = state.path === 'relay' ? 'warn' : 'ok';
  } else if (state.kind === 'linking') { words = t('pad.state.linking'); tone = 'warn'; }
  else if (state.kind === 'away') { words = t('pad.state.away'); tone = 'warn'; }
  else words = t('pad.state.connecting');
  // this phone's seat in a couch lobby (docs/COUCH-MODE.md), named before the link's state: the link's own, so a new
  // pairing never shows the last one's
  const seat = link?.seat ?? 0;
  linkChip.textContent = seat ? `${t('pad.seat', { n: seat })} · ${words}` : words;
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
  show('controller');
  layoutFrame();
  paintLink({ kind: 'connecting' });
  let pinged: ReturnType<typeof setInterval> | null = null;
  link = createPadLink({
    role: 'phone',
    serviceUrl,
    ...('code' in route ? { code: route.code } : { resume: route.resume }),
    onToken(code, token) { try { sessionStorage.setItem(RESUME_KEY, JSON.stringify({ code, token })); } catch { /* private mode */ } },
    onState(state) {
      if (debug) debug.state = state.kind;
      readyBuzz.link(state.kind);
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
      // a couch seat's phone (a lobby seat) leaves its guide to the room's briefing on the big screen
      else if (message.k === 'status') { paintStatus(message.s); if (!toured() && !link?.seat) showTour(); }
      else if (message.k === 'pong') {
        rttMs = Math.max(0, performance.now() - message.t);
        if (debug) { debug.rttMs = rttMs; debug.applyMs = message.apply; }
        if (link) paintLink(link.state);
      } else if (message.k === 'ping') link?.sendCtl({ k: 'pong', t: message.t, d: performance.now(), apply: 0 });
    },
  });
}

/** The Start tap: the wake lock and full screen want a gesture (iOS), then the link. Where full screen is offered
 *  (Android), the system's own orientation lock holds the landscape the phone is in. */
function start(route: { code: string } | { resume: { code: string; token: string } }): void {
  codeInput.blur();
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
