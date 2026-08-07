// Blitz-style mobile battle controls. This is a presentation/input adapter:
// every gesture enters game/input.js as the same named action or aim/move
// vector used by keyboard, mouse, and gamepad controls.

import { FONT_STACK, FONT_COND } from './fonts.js';

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
.cot-touch .fire .lb,.cot-touch .scope .lb,.cot-touch .brake .lb{position:absolute;bottom:-17px;
  left:50%;transform:translateX(-50%);font-family:${FONT_COND};font-size:8px;font-weight:800;
  letter-spacing:.13em;text-transform:uppercase;white-space:nowrap;text-shadow:0 1px 3px #000;}
.cot-touch .fire.alt{left:166px;right:auto;bottom:156px;width:64px;height:64px;opacity:.86;}
.cot-touch .fire.alt svg{width:20px;height:34px}.cot-touch .fire.alt .lb{display:none}
.cot-touch .scope{right:134px;bottom:43px;width:62px;height:62px;color:#dce7ef;}
.cot-touch .scope svg{width:32px;height:24px;filter:drop-shadow(0 2px 3px #000);}
.cot-touch .brake{left:166px;bottom:45px;width:54px;height:54px;color:#dce7ef;}
.cot-touch .brake b{font-family:${FONT_COND};font-size:16px;letter-spacing:.02em;}
.cot-touch .back{position:absolute;z-index:4;top:max(8px,env(safe-area-inset-top));
  left:max(8px,env(safe-area-inset-left));height:38px;padding:0 12px;pointer-events:auto;
  touch-action:manipulation;border:1px solid rgba(210,224,235,.28);border-left:3px solid #e69a2d;
  background:rgba(7,11,15,.78);font-family:${FONT_COND};font-size:9px;font-weight:800;
  letter-spacing:.14em;text-transform:uppercase;box-shadow:0 3px 12px rgba(0,0,0,.4);}

/* Recompose the existing live HUD instead of duplicating ammo/state UI. */
body.cot-touch-layout{overscroll-behavior:none;}
body.cot-touch-layout #app canvas{touch-action:none;}
body.cot-touch-layout .cot-hints,body.cot-touch-layout .cot-ear,
body.cot-touch-layout .cot-dlog,body.cot-touch-layout .cot-net{display:none!important;}
body.cot-touch-layout button[aria-label="Leave battle and return to garage"]{display:none!important;}
body.cot-touch-layout .cot-top{top:max(4px,env(safe-area-inset-top));padding:5px 29px 7px;gap:10px;}
body.cot-touch-layout .cot-top .fg,body.cot-touch-layout .cot-top .fe{font-size:22px;}
body.cot-touch-layout .cot-top .tm{font-size:12px;}
body.cot-touch-layout .cot-killfeed{top:48px;left:50%;transform:translateX(-50%);max-width:48%;align-items:center;}
body.cot-touch-layout .cot-kf{font-size:9px;padding:3px 7px;background:rgba(7,10,14,.68);}
/* MOBILE-UX r1: the top-right tray is AMMO ONLY (>=44 px thumb targets) —
   the consumables move to a right-edge column, see .cot-cons below. */
body.cot-touch-layout .cot-shells{left:auto;right:max(10px,env(safe-area-inset-right));
  top:max(8px,env(safe-area-inset-top));bottom:auto;transform:none;gap:4px;z-index:3;align-items:flex-start;}
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
body.cot-touch-layout .cot-minimap{left:max(8px,env(safe-area-inset-left));right:auto;top:54px;bottom:auto;
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
  .cot-touch .fire.alt{left:137px;bottom:136px;width:56px;height:56px}.cot-touch .brake{left:137px;width:48px;height:48px}
  body.cot-touch-layout .cot-cons{bottom:calc(max(22px,env(safe-area-inset-bottom)) + 110px);}
  body.cot-touch-layout .cot-minimap{width:92px!important;height:92px!important;}
  body.cot-touch-layout .cot-dp{display:none;}
}
@media (orientation:portrait) and (max-width:900px){
  .cot-touch .aimhint::after{content:" · LANDSCAPE RECOMMENDED";}
  /* MOBILE-UX r1: in portrait the centered score plate and the right-aligned
     ammo tray share the same band — the tray buried the timer (owner shot).
     Drop the tray below the plate; the killfeed steps below the tray. */
  body.cot-touch-layout .cot-shells{top:calc(max(4px,env(safe-area-inset-top)) + 46px);}
  body.cot-touch-layout .cot-killfeed{top:calc(max(4px,env(safe-area-inset-top)) + 106px);}
}
/* MOBILE-QA r1: shell chip label/count collision — at the 48px touch chip the
   selected slot's long class label (APFSDS, 35px) ran under the ammo count
   (11px overlap, both bottom-anchored). The keycap badge is hidden on touch,
   so its top-right corner is free: the count moves there. */
body.cot-touch-layout .cot-shell .cnt{top:2px;right:3px;bottom:auto;}
/* MOBILE-QA r1: touch-target floor for chrome the phone shares with desktop.
   The garage nav row (25px), TECH TREE (27px), era chips (20px), carousel
   arrows (34px strip) and the battle back button (38px) all sat under the
   ~40px finger floor; several were genuinely hard to hit on an SE. Padding
   bumps only — same type, same layout language. */
body.cot-touch-layout .nv{padding:9px 14px;}
body.cot-touch-layout .cot-tech{padding:10px 16px;}
body.cot-touch-layout .cot-era-chip{padding:9px 12px;}
body.cot-touch-layout .cot-car-arrow{width:44px;}
body.cot-touch-layout .cot-touch .back{padding:12px 16px;min-height:44px;}
`;

const SHELL = `<svg viewBox="0 0 34 56" aria-hidden="true"><path d="M17 2 24 15v27H10V15Z" fill="currentColor"/><path d="M8 42h18v10H8z" fill="currentColor"/><path d="M11 25h12" stroke="#1a2025" stroke-width="2"/></svg>`;
const SCOPE = `<svg viewBox="0 0 42 28" aria-hidden="true"><path d="M7 8h8l3 5h6l3-5h8l4 13H25l-2-4h-4l-2 4H3Z" fill="currentColor"/><circle cx="11" cy="13" r="5" fill="#202a31"/><circle cx="31" cy="13" r="5" fill="#202a31"/></svg>`;

export function createTouchControls({ input, bus, isBattleActive, onLeaveBattle, isSniper = () => false }) {
  if (!document.getElementById('cot-touch-style')) {
    const style = document.createElement('style');
    style.id = 'cot-touch-style'; style.textContent = CSS; document.head.appendChild(style);
  }
  const root = document.createElement('div');
  root.className = 'cot-touch';
  root.setAttribute('aria-label', 'Mobile battle controls');
  root.innerHTML = `<button class="back" type="button" aria-label="Return to garage">&#8592; Garage</button>` +
    `<div class="aimpad" aria-label="Swipe to aim"></div><div class="aimhint">Swipe to aim</div>` +
    // MOBILE-QA r2 (owner): one triangle glyph (U+25B2, text presentation on
    // every platform) rotated per direction — U+25C0/U+25B6 carry DEFAULT
    // EMOJI PRESENTATION on iOS, so the left/right arrows rendered as blue
    // emoji buttons next to the clean text up/down triangles.
    `<div class="joy" aria-label="Movement joystick"><span class="arrow u">&#9650;</span><span class="arrow d">&#9650;</span>` +
    `<span class="arrow l">&#9650;</span><span class="arrow r">&#9650;</span><div class="knob"></div></div>` +
    `<button class="round fire alt" type="button" aria-label="Fire gun left">${SHELL}<span class="lb">Fire</span></button>` +
    `<button class="round brake" type="button" aria-label="Handbrake"><b>HB</b><span class="lb">Brake</span></button>` +
    `<button class="round scope" type="button" aria-label="Toggle sniper mode">${SCOPE}<span class="lb">Scope</span></button>` +
    `<button class="round fire" type="button" aria-label="Fire gun">${SHELL}<span class="lb">Fire</span></button>`;
  document.body.appendChild(root);

  const joy = root.querySelector('.joy');
  const knob = root.querySelector('.knob');
  const aimPad = root.querySelector('.aimpad');
  let battle = !!isBattleActive();
  let layout = false;
  let joyPointer = null;
  let aimPointer = null;
  let aimX = 0, aimY = 0;
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
    if (!layout || !battle) resetMove();
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

  function bindHold(button, action) {
    const up = (e) => { input.releaseVirtual(action); button.classList.remove('down'); if (e) e.stopPropagation(); };
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); button.classList.add('down'); input.pressVirtual(action);
      try { button.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    });
    button.addEventListener('pointerup', up); button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
  }
  for (const fire of root.querySelectorAll('.fire')) bindHold(fire, 'fire');
  bindHold(root.querySelector('.brake'), 'handbrake');
  root.querySelector('.scope').addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation(); input.tapVirtual('sniperToggle'); bus.emit('ui:click', {});
  });
  root.querySelector('.back').addEventListener('click', (e) => {
    e.stopPropagation(); bus.emit('ui:click', {}); onLeaveBattle();
  });

  bus.on('phase:change', ({ phase }) => { battle = phase === 'battle'; syncLayout(); });
  window.addEventListener('resize', syncLayout, { passive: true });
  window.addEventListener('orientationchange', syncLayout, { passive: true });
  syncLayout();

  return { root, get isLayout() { return layout; }, refresh: syncLayout };
}
