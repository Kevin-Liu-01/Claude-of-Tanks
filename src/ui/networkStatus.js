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
    .cot-network-status.failed{color:#ff887b;border-color:rgba(255,103,91,.7)}
    .cot-network-diagnostics{position:fixed;left:8px;top:64px;z-index:89;display:none;
    padding:7px 9px;border-left:1px solid rgba(90,196,255,.55);background:rgba(5,10,16,.72);
    color:#cbeaff;font:10px/1.5 ui-monospace,Menlo,monospace;white-space:pre;
    font-variant-numeric:tabular-nums;pointer-events:none;text-shadow:0 1px 2px #000}
    .cot-network-diagnostics.show{display:block}`;
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
  const diagnostics = document.createElement('div');
  diagnostics.className = 'cot-network-diagnostics';
  diagnostics.setAttribute('aria-label', 'Network diagnostics');
  document.body.appendChild(diagnostics);
  let hideTimer = null;
  let lastDiagnosticsAt = -Infinity;
  let diagnosticsVisible = (() => {
    try {
      const query = new URLSearchParams(location.search);
      return query.get('netdiag') === '1' || localStorage.getItem('cot.netdiag.v1') === '1';
    } catch (_) { return false; }
  })();
  diagnostics.classList.toggle('show', diagnosticsVisible);

  function toggleDiagnostics() {
    diagnosticsVisible = !diagnosticsVisible;
    diagnostics.classList.toggle('show', diagnosticsVisible);
    try { localStorage.setItem('cot.netdiag.v1', diagnosticsVisible ? '1' : '0'); } catch (_) { /* fine */ }
  }

  const onKeyDown = (event) => {
    if (event.code !== 'F3' || event.repeat) return;
    event.preventDefault();
    toggleDiagnostics();
  };
  window.addEventListener('keydown', onKeyDown);

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

  function update(stats) {
    if (!diagnosticsVisible || !stats) return;
    const now = performance.now();
    if (now - lastDiagnosticsAt < 250) return;
    lastDiagnosticsAt = now;
    const buffer = stats.buffer || {};
    const prediction = stats.prediction || {};
    const rtt = stats.rttMs == null ? '—' : `${stats.rttMs.toFixed(0)} ms`;
    const jitter = Number(stats.rttJitterMs || 0).toFixed(1);
    const loss = ((stats.estimatedSnapshotLoss || 0) * 100).toFixed(1);
    const transport = stats.transport || {};
    const baseTransport = transport.base || transport;
    const stateTransport = baseTransport.state || baseTransport;
    diagnostics.textContent =
      `NET  ${rtt}  ±${jitter} ms  gap ${loss}%\n` +
      `BUF  ${Number(buffer.interpolationDelayMs || 0).toFixed(0)} ms  ` +
      `jitter ${Number(buffer.arrivalJitterMs || 0).toFixed(1)}  ` +
      `extra ${buffer.extrapolatedSamples || 0}\n` +
      `WIRE ${stats.transportBufferedBytes || 0} B  ` +
      `state-coal ${stateTransport.stateCoalesced || 0}  ` +
      `input-coal ${stateTransport.inputCoalesced || 0}\n` +
      `SYNC input ${stats.inputAckLag == null ? '—' : stats.inputAckLag}f  ` +
      `edges ${stats.pendingInputEdges || 0}  base-miss ${stats.missingSnapshotBaselines || 0}\n` +
      `PRED ${prediction.pendingInputs || 0} pending  ` +
      `err ${Number(prediction.lastPositionErrorM || 0).toFixed(2)} m  ` +
      `corr ${Number(prediction.correctionM || 0).toFixed(2)} m`;
  }

  return {
    root,
    diagnostics,
    set,
    update,
    toggleDiagnostics,
    get diagnosticsVisible() { return diagnosticsVisible; },
    dispose() {
      if (hideTimer) clearTimeout(hideTimer);
      window.removeEventListener('keydown', onKeyDown);
      diagnostics.remove();
      root.remove();
    },
  };
}
