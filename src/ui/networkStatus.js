const STYLE_ID = 'cot-network-status-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.cot-network-status{position:fixed;left:50%;top:24px;z-index:91;transform:translate(-50%,-12px);
    min-width:220px;padding:10px 18px;border:1px solid rgba(238,166,67,.62);background:rgba(9,13,18,.94);
    box-shadow:0 12px 36px rgba(0,0,0,.52);color:#f2bd73;font:800 11px system-ui,sans-serif;
    letter-spacing:.12em;text-align:center;text-transform:uppercase;opacity:0;pointer-events:none;
    transition:opacity .18s ease,transform .18s ease}.cot-network-status.show{opacity:1;transform:translate(-50%,0)}
    .cot-network-status.failed{color:#ff887b;border-color:rgba(255,103,91,.7)}`;
  document.head.appendChild(style);
}

/** Small fail-visible reconnect banner for dedicated network battles. */
export function createNetworkStatus() {
  ensureStyle();
  const root = document.createElement('div');
  root.className = 'cot-network-status';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  document.body.appendChild(root);
  let hideTimer = null;

  function show(message, failed = false, hideAfterMs = 0) {
    if (hideTimer) clearTimeout(hideTimer);
    root.textContent = message;
    root.classList.toggle('failed', failed);
    root.classList.add('show');
    if (hideAfterMs) hideTimer = setTimeout(() => root.classList.remove('show'), hideAfterMs);
  }

  function set({ state, attempt = 0 } = {}) {
    if (state === 'reconnecting') show(`Connection interrupted · reconnecting ${attempt || 1}`);
    else if (state === 'reconnected') show('Connection restored', false, 1800);
    else if (state === 'failed') show('Connection lost · return to garage', true);
    else if (state === 'closed' || state === 'connected') root.classList.remove('show');
  }

  return {
    root,
    set,
    dispose() {
      if (hideTimer) clearTimeout(hideTimer);
      root.remove();
    },
  };
}
