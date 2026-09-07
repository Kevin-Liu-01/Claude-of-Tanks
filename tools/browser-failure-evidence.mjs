const FAILURE_KINDS = ['protocol-timeout', 'protocol-error', 'target-closed', 'wait-timeout',
  'command-timeout', 'deadline', 'unknown'];

/** Classify locally; never retain provider messages, URLs, stacks or target IDs.
 * A timeout is not evidence of a crash. Only the page's error event records one.
 */
export function browserOperationFailure(error) {
  if (FAILURE_KINDS.includes(error?.operationFailure)) return error.operationFailure;
  if (error?.name === 'TargetCloseError') return 'target-closed';
  if (error?.name === 'TimeoutError') return 'wait-timeout';
  if (error?.name !== 'ProtocolError') return 'unknown';
  const message = typeof error.message === 'string' ? error.message : '';
  if (/Target closed|Session closed|Connection closed/i.test(message)) return 'target-closed';
  return /timed out|timeout/i.test(message) ? 'protocol-timeout' : 'protocol-error';
}

/** Node-side event evidence remains available when page.evaluate is impossible.
 * Freeze before intentional browser cleanup so owned teardown is not a crash.
 */
export function observeBrowserHealth(now = () => performance.now()) {
  const state = { clock: 'node-run-relative-ms', browserDisconnected: false,
    browserDisconnectedAtMs: null, peers: [] };
  const listeners = [];
  let stopped = null;
  const listen = (emitter, event, callback) => {
    emitter.on(event, callback);
    listeners.push(() => emitter.off(event, callback));
  };
  const read = () => stopped ?? structuredClone(state);
  return {
    watchBrowser(browser) {
      listen(browser, 'disconnected', () => {
        state.browserDisconnected = true;
        state.browserDisconnectedAtMs ??= now();
      });
    },
    watchPage(page, role) {
      const peer = { role: role === 'host' ? 'host' : 'guest', rendererCrashCount: 0,
        appExceptionCount: 0, closed: false, events: [], eventsDropped: 0 };
      state.peers.push(peer);
      const record = (kind) => {
        if (peer.events.length < 16) peer.events.push({ kind, atMs: now() });
        else peer.eventsDropped++;
      };
      listen(page, 'error', () => { peer.rendererCrashCount++; record('renderer-crash'); });
      listen(page, 'pageerror', () => { peer.appExceptionCount++; record('app-exception'); });
      listen(page, 'close', () => { peer.closed = true; record('page-closed'); });
    },
    read,
    stop() {
      if (!stopped) {
        stopped = read();
        for (const remove of listeners) remove();
      }
      return stopped;
    },
  };
}
