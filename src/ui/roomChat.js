import { MAX_ROOM_CHAT_LENGTH } from '../net/protocol.js';
import { FONT_COND, FONT_STACK } from './fonts.js';

const STYLE_ID = 'cot-room-chat-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cot-room-chat{position:fixed;z-index:46;left:max(18px,env(safe-area-inset-left));
  top:clamp(270px,50%,calc(100vh - 230px));bottom:auto;transform:translateY(-50%);
  width:min(380px,calc(50vw - 34px));min-width:280px;display:grid;gap:7px;pointer-events:none;
  color:#e5edf3;font-family:${FONT_STACK};text-shadow:0 1px 3px rgba(0,0,0,.95)}
.cot-room-chat[hidden]{display:none}.cot-room-chat *{box-sizing:border-box}
.cot-room-chat-log{max-height:146px;overflow:hidden;display:flex;flex-direction:column;
  justify-content:flex-end;gap:3px;padding:6px 8px;transition:opacity .45s ease}
.cot-room-chat.quiet:not(.open) .cot-room-chat-log{opacity:.18}
.cot-room-chat:hover .cot-room-chat-log,.cot-room-chat.open .cot-room-chat-log{opacity:1}
.cot-room-chat:not(.open) .cot-room-chat-message:nth-last-child(n+6){display:none}
.cot-room-chat-message{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:baseline;
  gap:7px;padding:3px 7px;border-left:2px solid rgba(159,178,192,.45);
  background:linear-gradient(90deg,rgba(5,9,13,.82),rgba(5,9,13,.14));
  font-size:11px;line-height:1.35;overflow-wrap:anywhere}
.cot-room-chat-message.alpha{border-left-color:#6fbcff}.cot-room-chat-message.bravo{border-left-color:#ff8479}
.cot-room-chat-message.self{background:linear-gradient(90deg,rgba(50,35,14,.88),rgba(10,10,8,.16));
  border-left-color:#edaa43}.cot-room-chat-name{font:800 9px/1 ${FONT_COND};letter-spacing:.1em;
  color:#aebdca;text-transform:uppercase;white-space:nowrap}.cot-room-chat-message.alpha .cot-room-chat-name{color:#9bd2ff}
.cot-room-chat-message.bravo .cot-room-chat-name{color:#ffaaa3}.cot-room-chat-message.self .cot-room-chat-name{color:#ffd18a}
.cot-room-chat-text{min-width:0}.cot-room-chat-controls{display:flex;align-items:stretch;gap:7px;
  padding:8px;border:1px solid rgba(166,185,199,.25);border-left:3px solid #eaa340;
  background:linear-gradient(100deg,rgba(7,11,15,.95),rgba(12,17,22,.88));
  box-shadow:0 10px 30px rgba(0,0,0,.34);pointer-events:auto}
.cot-room-chat:not(.open) .cot-room-chat-controls{justify-self:start;padding:4px}
.cot-room-chat-toggle{flex:0 0 auto;min-width:70px;border:1px solid rgba(177,196,210,.26);
  background:rgba(17,24,30,.92);color:#c9d5de;font:800 9px ${FONT_COND};letter-spacing:.13em;
  text-transform:uppercase;cursor:pointer}.cot-room-chat-toggle b{color:#f1ae49;font-size:11px}
.cot-room-chat-toggle:hover,.cot-room-chat-toggle:focus-visible{border-color:#eaa340;color:#fff;outline:none}
.cot-room-chat-form{position:relative;min-width:0;flex:1;display:none;grid-template-columns:minmax(0,1fr) auto;gap:7px}
.cot-room-chat.open .cot-room-chat-form{display:grid}.cot-room-chat.open .cot-room-chat-toggle{display:none}
.cot-room-chat-input{min-width:0;height:34px;border:1px solid rgba(180,199,213,.3);outline:0;
  background:rgba(2,6,9,.9);color:#f1f5f8;padding:0 10px;font:12px ${FONT_STACK};caret-color:#ffbd5f}
.cot-room-chat-input:focus{border-color:#eaa340;box-shadow:inset 0 -1px #eaa340}
.cot-room-chat-send{height:34px;min-width:60px;border:1px solid #ba7727;background:#4b2e0e;
  color:#ffd291;font:800 9px ${FONT_COND};letter-spacing:.14em;text-transform:uppercase;cursor:pointer}
.cot-room-chat-send:disabled{opacity:.4;cursor:not-allowed}.cot-room-chat-count{position:absolute;right:79px;
  bottom:-13px;color:#8494a0;font:700 8px ${FONT_COND};letter-spacing:.08em}.cot-room-chat-count.over{color:#ff867d}
body.cot-touch-layout .cot-room-chat{left:max(9px,env(safe-area-inset-left));top:180px;bottom:auto;
  width:min(58vw,390px);min-width:0;z-index:48;transform:none}
body.cot-touch-layout .cot-room-chat-log{max-height:105px;padding-left:0}
body.cot-touch-layout .cot-room-chat-message{font-size:10px}
body.cot-touch-layout .cot-room-chat-controls{padding:6px}
body.cot-touch-layout .cot-room-chat-toggle{min-width:82px;height:38px;background:rgba(7,11,15,.9)}
@media(max-height:700px){.cot-room-chat{top:50%}.cot-room-chat-log{max-height:105px}}
@media(max-width:760px){.cot-room-chat{top:clamp(340px,calc(50% + 20px),calc(100vh - 80px));
    bottom:auto;width:min(360px,44vw);min-width:220px}
  .cot-room-chat-log{max-height:clamp(48px,calc(100vh - 440px),92px)}
  body.cot-touch-layout .cot-room-chat{top:180px}}
@media(prefers-reduced-motion:reduce){.cot-room-chat-log{transition:none}}
`;
  document.head.appendChild(style);
}

function isEditingTarget(target) {
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' || target.isContentEditable);
}

/** Battle chat for browser-hosted private/LAN rooms. */
export function createRoomChat({
  input,
  onSend = () => false,
  isAvailable = () => true,
  shouldRelock = () => false,
} = {}) {
  ensureStyle();
  const root = document.createElement('section');
  root.className = 'cot-room-chat quiet';
  root.hidden = true;
  root.dataset.testid = 'room-chat';
  root.setAttribute('aria-label', 'Room chat');

  const log = document.createElement('div');
  log.className = 'cot-room-chat-log';
  log.dataset.testid = 'room-chat-log';
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-relevant', 'additions');

  const controls = document.createElement('div');
  controls.className = 'cot-room-chat-controls';
  const toggle = document.createElement('button');
  toggle.className = 'cot-room-chat-toggle';
  toggle.type = 'button';
  toggle.dataset.testid = 'room-chat-toggle';
  toggle.innerHTML = '<b>↵</b>&nbsp; Room chat';
  toggle.setAttribute('aria-label', 'Open room chat');
  toggle.setAttribute('aria-keyshortcuts', 'Enter');

  const form = document.createElement('form');
  form.className = 'cot-room-chat-form';
  const field = document.createElement('input');
  field.className = 'cot-room-chat-input';
  field.dataset.testid = 'room-chat-input';
  field.type = 'text';
  field.autocomplete = 'off';
  field.spellcheck = true;
  field.enterKeyHint = 'send';
  field.placeholder = 'Message everyone in this room';
  field.setAttribute('aria-label', 'Room chat message');
  const send = document.createElement('button');
  send.className = 'cot-room-chat-send';
  send.dataset.testid = 'room-chat-send';
  send.type = 'submit';
  send.textContent = 'Send';
  const count = document.createElement('span');
  count.className = 'cot-room-chat-count';
  count.setAttribute('aria-hidden', 'true');
  form.append(field, send, count);
  controls.append(toggle, form);
  root.append(log, controls);
  document.body.appendChild(root);

  let active = false;
  let open = false;
  let playerId = '';
  let quietTimer = null;
  const seenIds = new Set();

  function characterCount() { return [...field.value].length; }

  function updateCount() {
    const length = characterCount();
    count.textContent = `${length}/${MAX_ROOM_CHAT_LENGTH}`;
    count.classList.toggle('over', length > MAX_ROOM_CHAT_LENGTH);
    send.disabled = length === 0 || length > MAX_ROOM_CHAT_LENGTH;
  }

  function close({ relock = true } = {}) {
    if (!open) return;
    open = false;
    root.classList.remove('open');
    field.blur();
    input?.setEnabled?.(true);
    updateCount();
    if (relock && shouldRelock()) input?.requestLock?.();
  }

  function showComposer() {
    if (!active || !isAvailable() || open) return false;
    open = true;
    root.classList.add('open');
    input?.setEnabled?.(false);
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    field.focus({ preventScroll: true });
    updateCount();
    return true;
  }

  function submit() {
    const length = characterCount();
    if (length < 1 || length > MAX_ROOM_CHAT_LENGTH) return false;
    const accepted = onSend(field.value);
    if (!accepted) return false;
    field.value = '';
    updateCount();
    close();
    return true;
  }

  function onKeyDown(event) {
    if (!active || !isAvailable() || event.isComposing) return;
    if (event.code === 'Enter') {
      if (!open && isEditingTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (open) submit();
      else showComposer();
    } else if (open && event.code === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }
  }

  function wakeLog() {
    root.classList.remove('quiet');
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(() => root.classList.add('quiet'), 9_000);
  }

  function append(message) {
    if (!message || seenIds.has(message.id)) return false;
    seenIds.add(message.id);
    const row = document.createElement('div');
    row.className = `cot-room-chat-message ${message.team || 'spectator'}` +
      (message.senderId === playerId ? ' self' : '');
    row.dataset.messageId = String(message.id || '');
    row.dataset.senderId = String(message.senderId || '');
    const name = document.createElement('span');
    name.className = 'cot-room-chat-name';
    name.textContent = message.senderName || 'Player';
    const text = document.createElement('span');
    text.className = 'cot-room-chat-text';
    text.textContent = message.text || '';
    row.append(name, text);
    log.appendChild(row);
    while (log.childElementCount > 48) {
      const first = log.firstElementChild;
      if (first?.dataset.messageId) seenIds.delete(first.dataset.messageId);
      first?.remove();
    }
    log.scrollTop = log.scrollHeight;
    wakeLog();
    return true;
  }

  toggle.addEventListener('click', showComposer);
  form.addEventListener('submit', (event) => { event.preventDefault(); submit(); });
  field.addEventListener('input', updateCount);
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'wheel']) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }
  window.addEventListener('keydown', onKeyDown, true);
  updateCount();

  return {
    root,
    append,
    open: showComposer,
    close,
    setPlayer(nextPlayerId) {
      playerId = String(nextPlayerId || '');
      for (const row of log.children) {
        row.classList.toggle('self', row.dataset.senderId === playerId);
      }
    },
    setActive(next) {
      active = !!next;
      root.hidden = !active;
      if (!active) close({ relock: false });
    },
    clear() {
      log.replaceChildren();
      seenIds.clear();
      field.value = '';
      updateCount();
    },
    get isOpen() { return open; },
    dispose() {
      if (quietTimer) clearTimeout(quietTimer);
      window.removeEventListener('keydown', onKeyDown, true);
      root.remove();
    },
  };
}
