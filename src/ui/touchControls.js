// Blitz-style mobile battle controls. This is a presentation/input adapter:
// every gesture enters game/input.js as the same named action or aim/move
// vector used by keyboard, mouse, and gamepad controls.

import { FONT_STACK, FONT_COND } from './fonts.js';
import { uiIconSVG } from './uiIcons.js';
import {
  getDeviceTier, getMobilePresetChoice, getStoredChoice,
  MOBILE_PRESET_ORDER, PRESET_ORDER, PRESETS, resolvePresetName,
  setMobilePresetName, setPresetName,
} from '../engine/quality.js';

const CSS = `
.cot-touch{position:fixed;inset:0;z-index:39;display:none;pointer-events:none;
  font-family:${FONT_STACK};color:#eef4f9;-webkit-user-select:none;user-select:none;
  touch-action:none;overflow:hidden;--edge:max(14px,env(safe-area-inset-left));}
.cot-touch.on{display:block;}
.cot-touch *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
.cot-touch button{font:inherit;color:inherit;}
.cot-touch .aimpad{position:absolute;z-index:0;right:0;top:18%;bottom:0;width:62%;
  pointer-events:auto;touch-action:none;}
.cot-touch .aimhint{position:absolute;right:21%;bottom:31%;font-family:${FONT_COND};
  font-size:8px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;
  color:rgba(234,242,248,.3);text-shadow:0 1px 3px #000;}
.cot-touch .joy{position:absolute;z-index:2;left:var(--edge);
  bottom:max(16px,env(safe-area-inset-bottom));width:138px;height:138px;
  border-radius:50%;pointer-events:auto;touch-action:none;
  background:radial-gradient(circle,rgba(31,40,48,.35) 0 31%,rgba(9,14,18,.58) 33% 63%,rgba(190,205,218,.13) 64% 66%,rgba(5,8,11,.45) 67%);
  border:2px solid rgba(218,229,238,.26);box-shadow:inset 0 0 22px rgba(0,0,0,.55),0 4px 16px rgba(0,0,0,.35);}
.cot-touch .joy::before,.cot-touch .joy::after{content:"";position:absolute;left:50%;top:50%;
  background:rgba(219,231,240,.16);transform:translate(-50%,-50%);}
.cot-touch .joy::before{width:76%;height:1px}.cot-touch .joy::after{width:1px;height:76%}
.cot-touch .knob{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px;
  border-radius:50%;background:radial-gradient(circle at 35% 30%,#596874,#202a32 58%,#0a0e12 100%);
  border:2px solid rgba(224,234,242,.48);box-shadow:0 4px 10px rgba(0,0,0,.65),inset 0 1px 3px rgba(255,255,255,.16);}
.cot-touch .arrow{position:absolute;color:rgba(231,240,247,.72);font-size:16px;line-height:1;
  text-shadow:0 1px 3px #000}.cot-touch .arrow.u{left:61px;top:8px}.cot-touch .arrow.d{left:61px;bottom:8px}
.cot-touch .arrow.l{left:10px;top:58px}.cot-touch .arrow.r{right:10px;top:58px}
/* MOBILE-QA r2: all four arrows are the SAME ▲ glyph rotated — see markup */
.cot-touch .arrow.d{transform:rotate(180deg)}
.cot-touch .arrow.l{transform:rotate(-90deg)}
.cot-touch .arrow.r{transform:rotate(90deg)}
.cot-touch .round{position:absolute;z-index:3;display:flex;align-items:center;justify-content:center;
  border-radius:50%;pointer-events:auto;touch-action:none;border:2px solid rgba(220,231,239,.32);
  background:radial-gradient(circle at 35% 28%,rgba(90,103,113,.84),rgba(22,29,35,.93) 62%,rgba(6,9,12,.96));
  box-shadow:0 5px 16px rgba(0,0,0,.55),inset 0 1px 4px rgba(255,255,255,.16);}
.cot-touch .round:active,.cot-touch .round.down{transform:scale(.94);border-color:#f0ad45;
  box-shadow:0 0 18px rgba(240,150,40,.35),inset 0 2px 7px rgba(0,0,0,.65);}
.cot-touch .fire{right:max(20px,env(safe-area-inset-right));bottom:max(22px,env(safe-area-inset-bottom));
  width:96px;height:96px;color:#ffd27a;}
.cot-touch .fire svg{width:34px;height:54px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.8));}
.cot-touch .fire .lb,.cot-touch .scope .lb,.cot-touch .autoaim .lb{position:absolute;bottom:-17px;
  left:50%;transform:translateX(-50%);font-family:${FONT_COND};font-size:8px;font-weight:800;
  letter-spacing:.13em;text-transform:uppercase;white-space:nowrap;text-shadow:0 1px 3px #000;}
.cot-touch .fire.alt{left:166px;right:auto;bottom:156px;width:64px;height:64px;opacity:.86;}
.cot-touch .fire.alt svg{width:20px;height:34px}.cot-touch .fire.alt .lb{display:none}
.cot-touch .fire.aiming{border-color:#ffd27a;box-shadow:0 0 0 5px rgba(240,160,48,.13),
  0 0 22px rgba(240,150,40,.45),inset 0 2px 7px rgba(0,0,0,.65);}
.cot-touch .fire.autofire{border-color:#ffbd5c;box-shadow:0 0 0 5px rgba(255,179,74,.16),
  0 0 25px rgba(255,147,30,.58),inset 0 0 14px rgba(255,173,58,.16);}
.cot-touch .fire-cancel{position:fixed;z-index:5;width:56px;height:56px;margin:-28px;
  display:flex;align-items:center;justify-content:center;pointer-events:none;visibility:hidden;
  opacity:0;transform:scale(.78);border-radius:50%;border:1.5px solid rgba(255,112,98,.7);
  background:rgba(28,8,7,.68);color:#ff8f83;box-shadow:0 4px 13px rgba(0,0,0,.48);
  transition:opacity 90ms ease,transform 90ms ease,border-color 90ms ease;}
.cot-touch .fire-cancel b{font:400 28px/1 ${FONT_COND};}
.cot-touch.fire-armed .fire-cancel{visibility:visible;opacity:.82;transform:scale(1);}
.cot-touch.fire-armed .aimhint{opacity:0;}
.cot-touch.fire-cancel-hot .fire-cancel{opacity:1;color:#fff;border-color:#ff594c;background:rgba(111,14,8,.94);
  transform:scale(1.07);box-shadow:0 0 18px rgba(255,52,38,.46);}
.cot-touch .scope{right:134px;bottom:43px;width:62px;height:62px;color:#dce7ef;}
.cot-touch .scope svg{width:32px;height:24px;filter:drop-shadow(0 2px 3px #000);}
.cot-touch .autoaim{right:206px;bottom:43px;width:58px;height:58px;color:#dce7ef;}
.cot-touch .autoaim svg{width:28px;height:28px;filter:drop-shadow(0 2px 3px #000);}
.cot-touch .autoaim.on{color:#ffd27a;border-color:#f0ad45;
  background:radial-gradient(circle at 35% 28%,rgba(120,83,28,.92),rgba(42,27,10,.96) 64%,rgba(8,7,5,.98));
  box-shadow:0 0 18px rgba(240,150,40,.42),inset 0 1px 4px rgba(255,225,170,.2);}
.cot-touch .mobile-chrome{position:absolute;z-index:4;top:max(8px,env(safe-area-inset-top));
  right:max(10px,env(safe-area-inset-right));display:flex;gap:4px;pointer-events:auto;}
.cot-touch .quick{width:44px;height:44px;padding:3px 2px 2px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:1px;pointer-events:auto;touch-action:manipulation;
  border:1px solid rgba(184,201,214,.34);border-bottom:2px solid rgba(184,201,214,.38);
  background:linear-gradient(180deg,rgba(20,27,33,.94),rgba(7,11,15,.96));
  color:#dce7ef;box-shadow:0 3px 12px rgba(0,0,0,.45);}
.cot-touch .quick:active{border-color:#f0ad45;color:#ffd27a;background:rgba(48,32,12,.96);}
.cot-touch .quick svg{width:18px;height:18px;display:block;}
.cot-touch .quick .ql{font-family:${FONT_COND};font-size:6.5px;font-weight:800;line-height:1;
  letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;}
.cot-touch .quick.muted{color:#f08b75;border-color:rgba(240,102,83,.55);}
.cot-touch .speed{position:absolute;z-index:3;left:calc(var(--edge) + 150px);
  bottom:max(24px,env(safe-area-inset-bottom));min-width:76px;height:42px;padding:5px 9px 4px;
  display:flex;align-items:baseline;justify-content:flex-end;gap:5px;pointer-events:none;
  background:linear-gradient(90deg,rgba(7,11,15,.82),rgba(7,11,15,.55));
  border-left:2px solid #e69a2d;border-bottom:1px solid rgba(184,201,214,.24);
  box-shadow:0 3px 12px rgba(0,0,0,.35);font-family:${FONT_COND};}
.cot-touch .speed b{font-size:24px;line-height:1;font-weight:700;color:#eef4f9;
  font-variant-numeric:tabular-nums;letter-spacing:-.03em;}
.cot-touch .speed span{font-size:8px;font-weight:800;letter-spacing:.12em;color:#9fb0bf;}

/* Recompose the existing live HUD instead of duplicating ammo/state UI. */
body.cot-touch-layout{overscroll-behavior:none;}
body.cot-touch-layout #app canvas{touch-action:none;}
body.cot-touch-layout .cot-hints,body.cot-touch-layout .cot-ear,
body.cot-touch-layout .cot-dlog{display:none!important;}
body.cot-touch-layout button[aria-label="Leave battle and return to garage"]{display:none!important;}
body.cot-touch-layout .cot-top{top:max(4px,env(safe-area-inset-top));padding:5px 29px 7px;gap:10px;}
body.cot-touch-layout .cot-top .fg,body.cot-touch-layout .cot-top .fe{font-size:22px;}
body.cot-touch-layout .cot-top .tm{font-size:12px;}
body.cot-touch-layout .cot-killfeed{top:48px;left:50%;transform:translateX(-50%);max-width:48%;align-items:center;}
body.cot-touch-layout .cot-kf{font-size:9px;padding:3px 7px;background:rgba(7,10,14,.68);}
/* Ammo is directly above the equipment/consumable stack, leaving the top
   edge to the three global mobile controls. */
body.cot-touch-layout .cot-shells{left:auto;right:max(10px,env(safe-area-inset-right));
  top:auto;bottom:calc(max(22px,env(safe-area-inset-bottom)) + 280px);
  transform:none;gap:4px;z-index:3;align-items:flex-start;}
body.cot-touch-layout .cot-shell{width:48px;height:52px;}
body.cot-touch-layout .cot-shell canvas{transform:translate(-50%,-50%) scale(.76);}
body.cot-touch-layout .cot-shell .key,body.cot-touch-layout .cot-con .key{display:none;}
body.cot-touch-layout .cot-shell .ty{font-size:7px}
body.cot-touch-layout .cot-shell .cnt{font-size:11px;}
/* stronger ACTIVE-AMMO read at glance distance: brighter amber frame, inner
   keyline + glow (the desktop .sel border alone washes out at phone size) */
body.cot-touch-layout .cot-shell.sel{border-color:#ffbd5c;border-bottom-color:#ffbd5c;
  background:linear-gradient(180deg,rgba(58,42,17,.97),rgba(30,20,9,.97));
  box-shadow:inset 0 0 0 1px rgba(255,196,107,.5),0 0 16px rgba(240,160,48,.5);}
body.cot-touch-layout .cot-shell.sel .ty{font-size:8px;}
/* MOBILE-UX r1 (owner: "move equipment to right side in a vertical column"):
   the consumable tray re-parks on the RIGHT EDGE as a thumb-reachable
   column sitting above the FIRE cluster. 48 px targets; the selection/used/
   cooldown chrome is the same .cot-con skin the desktop tray wears. */
body.cot-touch-layout .cot-consep{display:none;}
body.cot-touch-layout .cot-cons{display:flex;flex-direction:column;gap:9px;position:fixed;
  left:auto;right:max(14px,env(safe-area-inset-right));
  bottom:calc(max(22px,env(safe-area-inset-bottom)) + 124px);z-index:3;}
body.cot-touch-layout .cot-con{width:48px;height:48px;}
body.cot-touch-layout .cot-con svg{transform:none;}
body.cot-touch-layout .cot-net{top:calc(max(8px,env(safe-area-inset-top)) + 48px);
  right:max(10px,env(safe-area-inset-right));padding:4px 7px 3px;z-index:4;
  background:rgba(7,11,15,.68);border-right:2px solid rgba(240,160,48,.72);
  color:#dce7ef;opacity:.88;font-size:9px;letter-spacing:.08em;}
/* The former Garage shortcut occupied the first 44 px of this corner. With
   battle exit living in Settings, let the minimap own the safe-area top row. */
body.cot-touch-layout .cot-minimap{left:max(8px,env(safe-area-inset-left));right:auto;
  top:max(8px,env(safe-area-inset-top));bottom:auto;
  width:116px!important;height:116px!important;opacity:.86;}
body.cot-touch-layout .cot-dp{left:max(232px,calc(env(safe-area-inset-left) + 224px));
  bottom:max(8px,env(safe-area-inset-bottom));
  transform:scale(.58);transform-origin:left bottom;}
body.cot-touch-layout .cot-alert{bottom:28%;font-size:12px;}
body.cot-touch-layout .cot-bounce{top:31%;font-size:12px;}

@media (max-width:680px){
  .cot-touch .joy{width:118px;height:118px}.cot-touch .arrow.u{left:51px}.cot-touch .arrow.d{left:51px}
  .cot-touch .arrow.l{top:48px}.cot-touch .arrow.r{top:48px}
  .cot-touch .fire{width:82px;height:82px}.cot-touch .scope{right:112px;width:54px;height:54px}
  .cot-touch .autoaim{right:172px;width:54px;height:54px}
  .cot-touch .fire.alt{left:137px;bottom:136px;width:56px;height:56px}
  .cot-touch .speed{left:calc(var(--edge) + 128px);min-width:70px;}
  body.cot-touch-layout .cot-cons{bottom:calc(max(22px,env(safe-area-inset-bottom)) + 110px);}
  body.cot-touch-layout .cot-minimap{width:92px!important;height:92px!important;}
  body.cot-touch-layout .cot-dp{display:none;}
}
@media (orientation:portrait) and (max-width:900px){
  .cot-touch .aimhint::after{content:" · LANDSCAPE RECOMMENDED";}
  .cot-touch .mobile-chrome{top:calc(max(8px,env(safe-area-inset-top)) + 48px);}
  body.cot-touch-layout .cot-net{top:calc(max(8px,env(safe-area-inset-top)) + 96px);}
  body.cot-touch-layout .cot-killfeed{top:calc(max(4px,env(safe-area-inset-top)) + 130px);}
}
@media (orientation:portrait) and (max-width:680px){
  /* Keep the three right-hand actions clear of the handbrake on narrow
     phones. Auto-aim becomes the upper point of the cluster; the secondary
     fire button steps up by the same amount on the left. */
  .cot-touch .autoaim{bottom:105px;}
  .cot-touch .fire.alt{bottom:160px;}
}
/* MOBILE-QA r1: shell chip label/count collision — at the 48px touch chip the
   selected slot's long class label (APFSDS, 35px) ran under the ammo count
   (11px overlap, both bottom-anchored). The keycap badge is hidden on touch,
   so its top-right corner is free: the count moves there. */
body.cot-touch-layout .cot-shell .cnt{top:2px;right:3px;bottom:auto;}
@media (max-height:480px){
  /* Short landscape phones cannot fit a 3-high equipment stack plus ammo.
     Keep the requested order but lay equipment out in one row. */
  body.cot-touch-layout .cot-cons{flex-direction:row;
    bottom:calc(max(22px,env(safe-area-inset-bottom)) + 110px);}
  body.cot-touch-layout .cot-shells{
    bottom:calc(max(22px,env(safe-area-inset-bottom)) + 168px);}
}
/* Touch-target floor for garage chrome the phone shares with desktop. */
body.cot-touch-layout .nv{padding:9px 14px;}
body.cot-touch-layout .cot-country-chip{padding:9px 12px;}
body.cot-touch-layout .cot-car-arrow{width:44px;}
`;

const SHELL = uiIconSVG('shell', 34);
const SCOPE = uiIconSVG('scope', 34);
const AUTO_AIM = uiIconSVG('autoAim', 30);
const SOUND = uiIconSVG('sound', 20);
const SOUND_OFF = uiIconSVG('soundOff', 20);
const GRAPHICS = uiIconSVG('graphics', 20);
const SETTINGS = uiIconSVG('settings', 20);

export function nextQuickGraphicsPreset(current, mobile = false) {
  const order = mobile ? MOBILE_PRESET_ORDER : PRESET_ORDER;
  const i = order.indexOf(current);
  return order[(i < 0 ? 0 : i + 1) % order.length];
}

// Hybrid mobile Dynamic Aim: landing on FIRE arms the shot, dragging steers
// the sight, a quick lift fires at the final position, and a sustained hold
// becomes continuous fire. Keep the recognizer DOM-free so release/hold and
// cancel/lost-capture behavior can be regression-tested under plain Node as
// well as through a real CDP touch stream.
export function createMobileFireGesture({
  onAim = () => {},
  onFire = () => {},
  onHoldStart = () => {},
  onHoldEnd = () => {},
  onCancel = () => {},
  isCancelPoint = () => false,
  deadzonePx = 8,
  aimScale = 1.18,
  holdDelayMs = 320,
  scheduleHold = (cb, ms) => setTimeout(cb, ms),
  cancelHold = (id) => clearTimeout(id),
} = {}) {
  let pointerId = null;
  let startX = 0, startY = 0, lastX = 0, lastY = 0;
  let dragging = false;
  let cancelHot = false;
  let holdTimer = null;
  let holdElapsed = false;
  let holdStarted = false;
  let autoFiring = false;
  const snapshot = () => ({
    active: pointerId !== null, pointerId, dragging, cancelHot, autoFiring,
  });
  const stopAutoFire = () => {
    if (!autoFiring) return;
    autoFiring = false;
    onHoldEnd();
  };
  const maybeStartAutoFire = () => {
    if (pointerId === null || !holdElapsed || cancelHot || autoFiring) return;
    autoFiring = true;
    holdStarted = true;
    onHoldStart();
  };
  const clear = () => {
    if (holdTimer !== null) cancelHold(holdTimer);
    holdTimer = null;
    pointerId = null; dragging = false; cancelHot = false;
    holdElapsed = false; holdStarted = false; autoFiring = false;
  };
  const move = (id, x, y) => {
    if (pointerId === null || id !== pointerId) return snapshot();
    const nx = Number(x) || 0, ny = Number(y) || 0;
    const dx = nx - lastX, dy = ny - lastY;
    lastX = nx; lastY = ny;
    cancelHot = !!isCancelPoint(nx, ny);
    if (cancelHot) {
      stopAutoFire();
      return snapshot(); // no aim jump or firing inside the cancel target
    }
    maybeStartAutoFire(); // resume if a held thumb leaves cancel again
    if (!dragging && Math.hypot(nx - startX, ny - startY) >= deadzonePx) dragging = true;
    if (dragging && (dx || dy)) onAim(dx * aimScale, dy * aimScale);
    return snapshot();
  };
  return {
    begin(id, x, y) {
      if (id === null || id === undefined || pointerId !== null) return false; // one fire thumb owns the shot
      pointerId = id;
      startX = lastX = Number(x) || 0;
      startY = lastY = Number(y) || 0;
      dragging = false; cancelHot = false;
      holdElapsed = false; holdStarted = false; autoFiring = false;
      holdTimer = scheduleHold(() => {
        holdTimer = null;
        if (pointerId !== id) return;
        holdElapsed = true;
        maybeStartAutoFire();
      }, Math.max(0, Number(holdDelayMs) || 0));
      return true;
    },
    move,
    end(id, x, y) {
      if (pointerId === null || id !== pointerId) return false;
      // A platform may deliver the final coordinate only on pointerup.
      move(id, x, y);
      const cancelled = cancelHot;
      const releaseShot = !cancelled && !holdStarted;
      stopAutoFire();
      clear();
      if (cancelled) onCancel(); else if (releaseShot) onFire();
      return !cancelled;
    },
    cancel(id = pointerId) {
      if (pointerId === null || id !== pointerId) return false;
      stopAutoFire(); clear(); onCancel(); return true;
    },
    getState: snapshot,
  };
}

export function createTouchControls({
  input, bus, isBattleActive, isSniper = () => false,
  onOpenSettings = () => {}, onToggleSound = () => false,
}) {
  if (!document.getElementById('cot-touch-style')) {
    const style = document.createElement('style');
    style.id = 'cot-touch-style'; style.textContent = CSS; document.head.appendChild(style);
  }
  const root = document.createElement('div');
  root.className = 'cot-touch';
  root.setAttribute('aria-label', 'Mobile battle controls');
  root.innerHTML = `<div class="mobile-chrome" aria-label="Battle options">` +
    `<button class="quick sound" type="button" aria-label="Mute sound">${SOUND}<span class="ql">Sound</span></button>` +
    `<button class="quick graphics" type="button" aria-label="Change graphics quality">${GRAPHICS}<span class="ql">GFX</span></button>` +
    `<button class="quick settings" type="button" aria-label="Open settings">${SETTINGS}<span class="ql">Settings</span></button></div>` +
    `<div class="speed" aria-label="Vehicle speed"><b>0</b><span>KM/H</span></div>` +
    `<div class="aimpad" aria-label="Swipe to aim"></div><div class="aimhint">Swipe to aim</div>` +
    // MOBILE-QA r2 (owner): one triangle glyph (U+25B2, text presentation on
    // every platform) rotated per direction — U+25C0/U+25B6 carry DEFAULT
    // EMOJI PRESENTATION on iOS, so the left/right arrows rendered as blue
    // emoji buttons next to the clean text up/down triangles.
    `<div class="joy" aria-label="Movement joystick"><span class="arrow u">&#9650;</span><span class="arrow d">&#9650;</span>` +
    `<span class="arrow l">&#9650;</span><span class="arrow r">&#9650;</span><div class="knob"></div></div>` +
    `<button class="round fire alt" type="button" aria-label="Fire gun left">${SHELL}<span class="lb">Fire</span></button>` +
    `<button class="round autoaim" type="button" aria-label="Toggle auto-aim" aria-pressed="false">${AUTO_AIM}<span class="lb">Auto Aim</span></button>` +
    `<button class="round scope" type="button" aria-label="Toggle sniper mode">${SCOPE}<span class="lb">Scope</span></button>` +
    `<button class="round fire" type="button" aria-label="Fire gun">${SHELL}<span class="lb">Fire</span></button>` +
    `<div class="fire-cancel" aria-hidden="true"><b>&times;</b></div>`;
  document.body.appendChild(root);

  const joy = root.querySelector('.joy');
  const knob = root.querySelector('.knob');
  const aimPad = root.querySelector('.aimpad');
  let battle = !!isBattleActive();
  let layout = false;
  let joyPointer = null;
  let aimPointer = null;
  let aimX = 0, aimY = 0;
  let cancelFireGesture = () => {};
  // MOBILE-UX r1 PINCH = SCOPE: live touches on the aim surface. Two or more
  // fingers switch the pad from swipe-aim to a zoom gesture (aimPointer is
  // parked, so the joystick and one-finger aim are never disturbed).
  const aimPts = new Map(); // pointerId -> {x,y}
  let pinchRef = -1;        // reference finger spread (px); -1 = not pinching
  const PINCH_STEP_PX = 44; // one zoom step per this much spread/close

  function wantsTouchLayout() {
    return input.isTouchLayout();
  }
  function resetMove() {
    joyPointer = null; input.setVirtualMove(0, 0); knob.style.transform = 'translate(0px,0px)';
    aimPointer = null; aimPts.clear(); pinchRef = -1;
  }
  function syncLayout() {
    layout = wantsTouchLayout();
    document.body.classList.toggle('cot-touch-layout', layout);
    root.classList.toggle('on', layout && battle);
    if (!layout || !battle) { resetMove(); cancelFireGesture(); }
  }

  // -------------------------------------------------------------------------
  // BROWSER PINCH-ZOOM KILL (owner: "sometimes i can zoom into the screen
  // doing pinch to zoom — don't allow this"). Defense in depth around the
  // index.html viewport meta (maximum-scale=1 covers spec-compliant mobile
  // browsers): iOS Safari ignores user-scalable, but its pinch runs through
  // the non-standard gesture* events — cancelling those kills page zoom
  // without touching one-finger scrolling anywhere. The touchmove and
  // ctrl+wheel (desktop trackpad pinch) guards are scoped to gameplay
  // surfaces so menus/garage DOM keeps every native scroll it has.
  function onGameplaySurface(t) {
    if (battle && layout) return true; // live touch battle: the frame is HUD
    if (!t || !t.closest) return false;
    return !!(t.closest('#app') || t.closest('.cot-touch') || t.closest('.cot-hud'));
  }
  const killGesture = (e) => e.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, killGesture, { passive: false });
  }
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length >= 2 && onGameplaySurface(e.target)) e.preventDefault();
  }, { passive: false });
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey && onGameplaySurface(e.target)) e.preventDefault();
  }, { passive: false });

  function updateJoy(e) {
    const r = joy.getBoundingClientRect();
    const max = r.width * 0.34;
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    knob.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
    input.setVirtualMove(dx / max, -dy / max);
  }
  joy.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation(); joyPointer = e.pointerId;
    try { joy.setPointerCapture(e.pointerId); } catch (_) { /* capture unavailable */ }
    updateJoy(e);
  });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyPointer) updateJoy(e); });
  const endJoy = (e) => { if (e.pointerId === joyPointer) resetMove(); };
  joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
  joy.addEventListener('lostpointercapture', endJoy);

  // PINCH = SCOPE (MOBILE-UX r1, owner: pinch "should be activating scope").
  // The gesture drives the SAME rebindable action lanes the desktop wheel
  // and SCOPE button use (input.js virtual taps -> main.js wheelStep ->
  // cameraRig.stepZoom) — no forked zoom logic:
  //   spread from arcade  -> sniperToggle (enter scope, the SCOPE button lane)
  //   spread in scope     -> zoomIn  (wheel-notch zoom step)
  //   pinch in scope      -> zoomOut (stepZoom exits scope below the lowest
  //                          step — cameraRig's own wheel-out behavior)
  //   pinch in arcade     -> nothing (never yanks the orbit mid-fight)
  function pinchDist() {
    const it = aimPts.values();
    const a = it.next().value;
    const b = it.next().value;
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  }
  // scopePending: the rig enters sniper on its NEXT update, so a fast spread
  // that lands 2+ ratchet steps inside one pointermove must not tap
  // sniperToggle twice (it would toggle back out) — the entry is latched for
  // the rest of the gesture and follow-up steps become zoom steps. Both the
  // toggle and the wheel notches are consumed in the same rig.update (shift
  // edge first, wheel after), so enter+zoom in one frame lands correctly.
  let scopePending = false;
  function stepScope(dir) {
    const scoped = isSniper() || scopePending;
    if (dir > 0) {
      if (scoped) input.tapVirtual('zoomIn');
      else { input.tapVirtual('sniperToggle'); scopePending = true; }
    } else {
      if (!scoped) return; // arcade pinch-in: never yank the orbit out
      input.tapVirtual('zoomOut'); // stepZoom exits scope below the lowest step
    }
    bus.emit('ui:click', {});
  }
  aimPad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    aimPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { aimPad.setPointerCapture(e.pointerId); } catch (_) { /* capture unavailable */ }
    if (aimPts.size >= 2) {
      aimPointer = null;      // second finger: the pad is now a zoom gesture
      pinchRef = pinchDist();
      scopePending = false;   // fresh gesture reads the live rig mode
    } else {
      aimPointer = e.pointerId; aimX = e.clientX; aimY = e.clientY;
    }
  });
  aimPad.addEventListener('pointermove', (e) => {
    const p = aimPts.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (pinchRef >= 0 && aimPts.size >= 2) {
      // ratchet: each PINCH_STEP_PX of spread/close = one zoom step, so a
      // long pinch walks the zoom ladder exactly like wheel notches
      const d = pinchDist();
      while (d - pinchRef >= PINCH_STEP_PX) { stepScope(1); pinchRef += PINCH_STEP_PX; }
      while (pinchRef - d >= PINCH_STEP_PX) { stepScope(-1); pinchRef -= PINCH_STEP_PX; }
      return;
    }
    if (e.pointerId !== aimPointer) return;
    const dx = e.clientX - aimX, dy = e.clientY - aimY;
    aimX = e.clientX; aimY = e.clientY;
    input.addVirtualAim(dx * 1.18, dy * 1.18);
  });
  const endAim = (e) => {
    aimPts.delete(e.pointerId);
    if (aimPts.size < 2) pinchRef = -1;
    if (e.pointerId === aimPointer) aimPointer = null;
    // one finger survives the pinch: hand swipe-aim back to it seamlessly
    if (aimPointer === null && aimPts.size === 1) {
      const [id, p] = aimPts.entries().next().value;
      aimPointer = id; aimX = p.x; aimY = p.y;
    }
  };
  aimPad.addEventListener('pointerup', endAim); aimPad.addEventListener('pointercancel', endAim);
  aimPad.addEventListener('lostpointercapture', endAim);

  // DYNAMIC AIM (all tanks, both fire buttons): unlike handbrake, FIRE is
  // never pressed immediately on pointerdown. A quick tap/drag fires once on
  // release; a 320 ms hold becomes the input layer's real held-fire state, so
  // an IFV streams and an MBT fires again whenever reload completes. Release,
  // pointercancel, lost capture and phase exit all drop the held state. The
  // 8 px deadzone prevents the thumb's landing wobble from jerking the gun.
  const fireCancel = root.querySelector('.fire-cancel');
  let activeFireButton = null;
  const isFireCancelPoint = (x, y) => {
    const r = fireCancel.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  const fireGesture = createMobileFireGesture({
    onAim: (dx, dy) => input.addVirtualAim(dx, dy),
    onFire: () => input.tapVirtual('fire'),
    onHoldStart: () => { input.pressVirtual('fire'); renderFireGesture(); },
    onHoldEnd: () => input.releaseVirtual('fire'),
    isCancelPoint: isFireCancelPoint,
  });
  function renderFireGesture() {
    const st = fireGesture.getState();
    root.classList.toggle('fire-armed', st.active);
    root.classList.toggle('fire-cancel-hot', st.cancelHot);
    if (!activeFireButton) return;
    activeFireButton.classList.toggle('down', st.active);
    activeFireButton.classList.toggle('aiming', st.dragging);
    activeFireButton.classList.toggle('autofire', st.autoFiring);
    const label = activeFireButton.querySelector('.lb');
    if (label) label.textContent = st.cancelHot ? 'Release cancels' :
      (st.autoFiring ? 'Auto fire' : (st.active ? 'Release fires' : 'Fire'));
    activeFireButton.setAttribute('aria-label', st.active
      ? (st.cancelHot ? 'Release to cancel shot' : (st.autoFiring
        ? 'Auto fire active; drag to aim; release to stop'
        : 'Drag to aim; release to fire; hold for auto fire'))
      : (activeFireButton.classList.contains('alt') ? 'Fire gun left' : 'Fire gun'));
  }
  function parkFireCancel(button) {
    const r = button.getBoundingClientRect();
    const side = r.left + r.width / 2 > innerWidth / 2 ? -1 : 1;
    const x = r.left + r.width / 2 + side * Math.max(112, r.width * 1.25);
    const y = r.top + r.height / 2 - Math.max(66, r.height * 0.82);
    fireCancel.style.left = `${Math.max(32, Math.min(innerWidth - 32, x)).toFixed(1)}px`;
    fireCancel.style.top = `${Math.max(32, Math.min(innerHeight - 32, y)).toFixed(1)}px`;
  }
  function finishFire(e, shouldFire) {
    if (!activeFireButton || e.pointerId !== fireGesture.getState().pointerId) return;
    e.preventDefault(); e.stopPropagation();
    if (shouldFire) fireGesture.end(e.pointerId, e.clientX, e.clientY);
    else fireGesture.cancel(e.pointerId);
    renderFireGesture();
    activeFireButton = null;
  }
  for (const fire of root.querySelectorAll('.fire')) {
    fire.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!fireGesture.begin(e.pointerId, e.clientX, e.clientY)) return;
      activeFireButton = fire; parkFireCancel(fire); renderFireGesture();
      try { fire.setPointerCapture(e.pointerId); } catch (_) { /* capture unavailable */ }
    });
    fire.addEventListener('pointermove', (e) => {
      if (e.pointerId !== fireGesture.getState().pointerId) return;
      e.preventDefault(); e.stopPropagation();
      fireGesture.move(e.pointerId, e.clientX, e.clientY); renderFireGesture();
    });
    fire.addEventListener('pointerup', (e) => finishFire(e, true));
    fire.addEventListener('pointercancel', (e) => finishFire(e, false));
    fire.addEventListener('lostpointercapture', (e) => finishFire(e, false));
  }
  cancelFireGesture = () => {
    if (!fireGesture.getState().active) return;
    fireGesture.cancel(); renderFireGesture(); activeFireButton = null;
  };
  window.addEventListener('blur', cancelFireGesture);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelFireGesture();
  });
  root.querySelector('.scope').addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation(); input.tapVirtual('sniperToggle'); bus.emit('ui:click', {});
  });
  const autoAim = root.querySelector('.autoaim');
  autoAim.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    bus.emit('ui:autoAimToggle', {});
    bus.emit('ui:click', {});
  });
  bus.on('ui:autoAimState', ({ on }) => {
    autoAim.classList.toggle('on', !!on);
    autoAim.setAttribute('aria-pressed', on ? 'true' : 'false');
    const label = autoAim.querySelector('.lb');
    if (label) label.textContent = on ? 'Locked' : 'Auto Aim';
  });
  const soundButton = root.querySelector('.quick.sound');
  soundButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const muted = !!onToggleSound();
    soundButton.classList.toggle('muted', muted);
    soundButton.innerHTML = `${muted ? SOUND_OFF : SOUND}<span class="ql">${muted ? 'Muted' : 'Sound'}</span>`;
    soundButton.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    soundButton.setAttribute('aria-pressed', muted ? 'true' : 'false');
  });
  const graphicsButton = root.querySelector('.quick.graphics');
  function graphicsChoice() {
    if (getDeviceTier() === 'mobile') return getMobilePresetChoice();
    const stored = getStoredChoice();
    return stored === 'auto' ? resolvePresetName(stored) : stored;
  }
  function renderGraphicsButton() {
    const name = graphicsChoice();
    const label = PRESETS[name]?.label || name;
    const short = label === 'Performance' ? 'Perf' : label === 'Balanced' ? 'Bal' :
      label === 'Quality' ? 'Qual' : label;
    graphicsButton.querySelector('.ql').textContent = `GFX ${short}`;
    graphicsButton.setAttribute('aria-label', `Graphics quality: ${label}. Tap to change level`);
    graphicsButton.title = `Graphics: ${label}`;
  }
  graphicsButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const mobile = getDeviceTier() === 'mobile';
    const next = nextQuickGraphicsPreset(graphicsChoice(), mobile);
    if (mobile) setMobilePresetName(next); else setPresetName(next);
    renderGraphicsButton();
    bus.emit('ui:click', {});
  });
  renderGraphicsButton();
  root.querySelector('.quick.settings').addEventListener('click', (e) => {
    e.stopPropagation(); bus.emit('ui:click', {}); onOpenSettings();
  });

  bus.on('phase:change', ({ phase }) => { battle = phase === 'battle'; syncLayout(); });
  window.addEventListener('resize', syncLayout, { passive: true });
  window.addEventListener('orientationchange', syncLayout, { passive: true });
  syncLayout();

  const speedValue = root.querySelector('.speed b');
  return {
    root,
    get isLayout() { return layout; },
    refresh: syncLayout,
    update(speedMps = 0) {
      const kmh = Math.max(0, Math.min(999, Math.round(Math.abs(Number(speedMps) || 0) * 3.6)));
      const text = String(kmh);
      if (speedValue.textContent !== text) speedValue.textContent = text;
    },
  };
}
