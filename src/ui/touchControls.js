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
body.cot-touch-layout .cot-shells{left:auto;right:max(10px,env(safe-area-inset-right));
  top:max(8px,env(safe-area-inset-top));bottom:auto;transform:none;gap:3px;z-index:3;align-items:flex-start;}
body.cot-touch-layout .cot-shell{width:45px;height:48px;}
body.cot-touch-layout .cot-shell canvas{transform:translate(-50%,-50%) scale(.72);}
body.cot-touch-layout .cot-shell .key,body.cot-touch-layout .cot-con .key{display:none;}
body.cot-touch-layout .cot-shell .ty{font-size:6px}.cot-shell .cnt{font-size:11px;}
body.cot-touch-layout .cot-consep{height:40px;margin:2px 3px;align-self:auto;}
body.cot-touch-layout .cot-con{width:38px;height:43px;}
body.cot-touch-layout .cot-con svg{transform:scale(.78);}
body.cot-touch-layout .cot-minimap{left:max(8px,env(safe-area-inset-left));right:auto;top:54px;bottom:auto;
  width:116px!important;height:116px!important;opacity:.86;}
body.cot-touch-layout .cot-dp{left:238px;bottom:max(8px,env(safe-area-inset-bottom));
  transform:scale(.68);transform-origin:left bottom;}
body.cot-touch-layout .cot-alert{bottom:28%;font-size:12px;}
body.cot-touch-layout .cot-bounce{top:31%;font-size:12px;}

@media (max-width:680px){
  .cot-touch .joy{width:118px;height:118px}.cot-touch .arrow.u{left:51px}.cot-touch .arrow.d{left:51px}
  .cot-touch .arrow.l{top:48px}.cot-touch .arrow.r{top:48px}
  .cot-touch .fire{width:82px;height:82px}.cot-touch .scope{right:112px;width:54px;height:54px}
  .cot-touch .fire.alt{left:137px;bottom:136px;width:56px;height:56px}.cot-touch .brake{left:137px;width:48px;height:48px}
  body.cot-touch-layout .cot-minimap{width:92px!important;height:92px!important;}
  body.cot-touch-layout .cot-dp{display:none;}
}
@media (orientation:portrait) and (max-width:900px){
  .cot-touch .aimhint::after{content:" · LANDSCAPE RECOMMENDED";}
}
`;

const SHELL = `<svg viewBox="0 0 34 56" aria-hidden="true"><path d="M17 2 24 15v27H10V15Z" fill="currentColor"/><path d="M8 42h18v10H8z" fill="currentColor"/><path d="M11 25h12" stroke="#1a2025" stroke-width="2"/></svg>`;
const SCOPE = `<svg viewBox="0 0 42 28" aria-hidden="true"><path d="M7 8h8l3 5h6l3-5h8l4 13H25l-2-4h-4l-2 4H3Z" fill="currentColor"/><circle cx="11" cy="13" r="5" fill="#202a31"/><circle cx="31" cy="13" r="5" fill="#202a31"/></svg>`;

export function createTouchControls({ input, bus, isBattleActive, onLeaveBattle }) {
  if (!document.getElementById('cot-touch-style')) {
    const style = document.createElement('style');
    style.id = 'cot-touch-style'; style.textContent = CSS; document.head.appendChild(style);
  }
  const root = document.createElement('div');
  root.className = 'cot-touch';
  root.setAttribute('aria-label', 'Mobile battle controls');
  root.innerHTML = `<button class="back" type="button" aria-label="Return to garage">&#8592; Garage</button>` +
    `<div class="aimpad" aria-label="Swipe to aim"></div><div class="aimhint">Swipe to aim</div>` +
    `<div class="joy" aria-label="Movement joystick"><span class="arrow u">&#9650;</span><span class="arrow d">&#9660;</span>` +
    `<span class="arrow l">&#9664;</span><span class="arrow r">&#9654;</span><div class="knob"></div></div>` +
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

  function wantsTouchLayout() {
    return input.isTouchLayout();
  }
  function resetMove() {
    joyPointer = null; input.setVirtualMove(0, 0); knob.style.transform = 'translate(0px,0px)';
  }
  function syncLayout() {
    layout = wantsTouchLayout();
    document.body.classList.toggle('cot-touch-layout', layout);
    root.classList.toggle('on', layout && battle);
    if (!layout || !battle) resetMove();
  }

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

  aimPad.addEventListener('pointerdown', (e) => {
    e.preventDefault(); aimPointer = e.pointerId; aimX = e.clientX; aimY = e.clientY;
    try { aimPad.setPointerCapture(e.pointerId); } catch (_) { /* capture unavailable */ }
  });
  aimPad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== aimPointer) return;
    const dx = e.clientX - aimX, dy = e.clientY - aimY;
    aimX = e.clientX; aimY = e.clientY;
    input.addVirtualAim(dx * 1.18, dy * 1.18);
  });
  const endAim = (e) => { if (e.pointerId === aimPointer) aimPointer = null; };
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
