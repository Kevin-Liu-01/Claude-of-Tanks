/** CLI-only lifecycle. Library/test servers continue to own their own close(). */
type ShutdownProcess = Pick<NodeJS.Process, 'on' | 'off' | 'exit'>;

interface ShutdownOptions {
  timeoutMs?: number;
  target?: ShutdownProcess;
  reportError?: (message: string) => void;
}

export function installProcessShutdown(
  close: () => Promise<void>,
  { timeoutMs = 10_000, target = process, reportError = console.error }: ShutdownOptions = {},
): () => void {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('shutdown timeout must be positive');
  }
  let closing = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const dispose = (): void => {
    target.off('SIGINT', shutdown);
    target.off('SIGTERM', shutdown);
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const shutdown = (): void => {
    if (closing) return;
    closing = true;
    timer = setTimeout(() => {
      reportError('Multiplayer shutdown timed out; unfinished sessions will not resume.');
      dispose();
      target.exit(1);
    }, timeoutMs);
    void Promise.resolve().then(close).then(() => {
      dispose();
      target.exit(0);
    }, () => {
      // Provider errors can include credentials. Log no arbitrary error object.
      reportError('Multiplayer shutdown failed; unfinished sessions will not resume.');
      dispose();
      target.exit(1);
    });
  };
  target.on('SIGINT', shutdown);
  target.on('SIGTERM', shutdown);
  return dispose;
}
