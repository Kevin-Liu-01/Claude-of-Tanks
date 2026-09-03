const STYLE_ID = 'cot-network-status-style';

export type NetworkConnectionState = 'reconnecting' | 'reconnected' | 'failed' | 'closed' | 'connected';

export interface NetworkStatusState {
  readonly state?: NetworkConnectionState;
  readonly attempt?: number;
}

interface NetworkTransportCounters {
  readonly stateCoalesced?: number;
  readonly inputCoalesced?: number;
}

interface NetworkTransportStats extends NetworkTransportCounters {
  readonly base?: NetworkTransportStats;
  readonly state?: NetworkTransportCounters;
}

export interface NetworkDiagnosticsStats {
  readonly rttMs?: number | null;
  readonly rttJitterMs?: number;
  readonly estimatedSnapshotLoss?: number;
  readonly transportBufferedBytes?: number;
  readonly inputAckLag?: number | null;
  readonly pendingInputEdges?: number;
  readonly missingSnapshotBaselines?: number;
  readonly buffer?: {
    readonly interpolationDelayMs?: number;
    readonly arrivalJitterMs?: number;
    readonly extrapolatedSamples?: number;
  };
  readonly prediction?: {
    readonly pendingInputs?: number;
    readonly lastPositionErrorM?: number;
    readonly correctionM?: number;
  };
  readonly transport?: NetworkTransportStats;
}

export interface NetworkStatusController {
  readonly root: HTMLDivElement;
  readonly diagnostics: HTMLDivElement;
  set(status?: NetworkStatusState): void;
  update(stats?: NetworkDiagnosticsStats | null): void;
  toggleDiagnostics(): void;
  readonly diagnosticsVisible: boolean;
  dispose(): void;
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.cot-network-status{position:fixed;left:50%;top:24px;z-index:91;transform:translate(-50%,-12px);
    min-width:220px;padding:10px 18px;border:1px solid rgba(238,166,67,.62);background:rgba(9,13,18,.94);
    box-shadow:0 12px 36px rgba(0,0,0,.52);color:#f2bd73;font:800 11px system-ui,sans-serif;
    letter-spacing:.12em;text-align:center;text-transform:uppercase;opacity:0;pointer-events:none;
    transition:opacity var(--cot-motion-base) var(--cot-ease-out),
      transform var(--cot-motion-base) var(--cot-ease-out)}.cot-network-status.show{opacity:1;transform:translate(-50%,0)}
    .cot-network-status.failed{color:#ff887b;border-color:rgba(255,103,91,.7)}
    .cot-network-diagnostics{position:fixed;left:8px;top:64px;z-index:89;display:none;
    padding:7px 9px;border-left:1px solid rgba(90,196,255,.55);background:rgba(5,10,16,.72);
    color:#cbeaff;font:10px/1.5 ui-monospace,Menlo,monospace;white-space:pre;
    font-variant-numeric:tabular-nums;pointer-events:none;text-shadow:0 1px 2px #000}
    .cot-network-diagnostics.show{display:block}`;
  document.head.appendChild(style);
}

function zero(value: number | undefined): number {
  return value || 0;
}

function formatNetworkHeading(stats: NetworkDiagnosticsStats): string {
  const rtt = stats.rttMs == null ? '—' : `${stats.rttMs.toFixed(0)} ms`;
  const jitter = zero(stats.rttJitterMs).toFixed(1);
  const loss = (zero(stats.estimatedSnapshotLoss) * 100).toFixed(1);
  return `NET  ${rtt}  ±${jitter} ms  gap ${loss}%`;
}

function formatBufferLine(buffer: NonNullable<NetworkDiagnosticsStats['buffer']>): string {
  return `BUF  ${zero(buffer.interpolationDelayMs).toFixed(0)} ms  ` +
    `jitter ${zero(buffer.arrivalJitterMs).toFixed(1)}  ` +
    `extra ${zero(buffer.extrapolatedSamples)}`;
}

function transportCounters(stats: NetworkDiagnosticsStats): NetworkTransportCounters {
  const transport = stats.transport || {};
  const baseTransport = transport.base || transport;
  return baseTransport.state || baseTransport;
}

function formatWireLine(stats: NetworkDiagnosticsStats): string {
  const transport = transportCounters(stats);
  return `WIRE ${zero(stats.transportBufferedBytes)} B  ` +
    `state-coal ${zero(transport.stateCoalesced)}  ` +
    `input-coal ${zero(transport.inputCoalesced)}`;
}

function formatSyncLine(stats: NetworkDiagnosticsStats): string {
  const inputLag = stats.inputAckLag == null ? '—' : stats.inputAckLag;
  return `SYNC input ${inputLag}f  ` +
    `edges ${zero(stats.pendingInputEdges)}  ` +
    `base-miss ${zero(stats.missingSnapshotBaselines)}`;
}

function formatPredictionLine(
  prediction: NonNullable<NetworkDiagnosticsStats['prediction']>,
): string {
  return `PRED ${zero(prediction.pendingInputs)} pending  ` +
    `err ${zero(prediction.lastPositionErrorM).toFixed(2)} m  ` +
    `corr ${zero(prediction.correctionM).toFixed(2)} m`;
}

function formatDiagnostics(stats: NetworkDiagnosticsStats): string {
  return [
    formatNetworkHeading(stats),
    formatBufferLine(stats.buffer || {}),
    formatWireLine(stats),
    formatSyncLine(stats),
    formatPredictionLine(stats.prediction || {}),
  ].join('\n');
}

/** Small fail-visible reconnect banner for dedicated network battles. */
export function createNetworkStatus(): NetworkStatusController {
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
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let lastDiagnosticsAt = -Infinity;
  let diagnosticsVisible = (() => {
    try {
      const query = new URLSearchParams(location.search);
      return query.get('netdiag') === '1' || localStorage.getItem('cot.netdiag.v1') === '1';
    } catch { return false; }
  })();
  diagnostics.classList.toggle('show', diagnosticsVisible);

  function toggleDiagnostics(): void {
    diagnosticsVisible = !diagnosticsVisible;
    diagnostics.classList.toggle('show', diagnosticsVisible);
    try { localStorage.setItem('cot.netdiag.v1', diagnosticsVisible ? '1' : '0'); } catch { /* fine */ }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'F3' || event.repeat) return;
    event.preventDefault();
    toggleDiagnostics();
  };
  window.addEventListener('keydown', onKeyDown);

  function show(message: string, failed = false, hideAfterMs = 0): void {
    if (hideTimer) clearTimeout(hideTimer);
    root.textContent = message;
    root.classList.toggle('failed', failed);
    root.classList.add('show');
    if (hideAfterMs) hideTimer = setTimeout(() => root.classList.remove('show'), hideAfterMs);
  }

  function set({ state, attempt = 0 }: NetworkStatusState = {}): void {
    if (state === 'reconnecting') show(`Connection interrupted · reconnecting ${attempt || 1}`);
    else if (state === 'reconnected') show('Connection restored', false, 1800);
    else if (state === 'failed') show('Connection lost · return to garage', true);
    else if (state === 'closed' || state === 'connected') root.classList.remove('show');
  }

  function update(stats?: NetworkDiagnosticsStats | null): void {
    if (!diagnosticsVisible || !stats) return;
    const now = performance.now();
    if (now - lastDiagnosticsAt < 250) return;
    lastDiagnosticsAt = now;
    diagnostics.textContent = formatDiagnostics(stats);
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
