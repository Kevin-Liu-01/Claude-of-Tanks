/** Context loss is recoverable; only an explicit user action may reload a match. */
export interface ContextRecoveryOwner {
  onLost?(): void;
  onRestored?(): boolean | void | Promise<boolean | void>;
}
export type RecoveryNotice = 'waiting' | 'restoring' | 'delayed' | 'failed' | 'ready';

export function createContextRecovery({
  owner, beforeRestore, notice, recordLoss,
  schedule = (callback: () => void) => setTimeout(callback, 10_000),
  cancel = (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
}: {
  owner(): ContextRecoveryOwner | undefined;
  beforeRestore(): void;
  notice(state: RecoveryNotice): void;
  recordLoss(): void;
  schedule?(callback: () => void): ReturnType<typeof setTimeout>;
  cancel?(timer: ReturnType<typeof setTimeout>): void;
}) {
  let generation = 0;
  let pending = false;
  let restoring = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const deadline = (current: number) => {
    clear();
    timer = schedule(() => { if (pending && current === generation) notice('delayed'); });
  };
  return {
    lost(event: { preventDefault(): void }) {
      event.preventDefault();
      generation++;
      pending = true;
      restoring = false;
      try { recordLoss(); } catch { /* recovery is still possible without stored relief */ }
      try { owner()?.onLost?.(); } catch { /* the cover and explicit reload remain available */ }
      notice('waiting');
      deadline(generation);
    },
    restored() {
      if (!pending || restoring) return;
      restoring = true;
      const current = generation;
      notice('restoring');
      deadline(current);
      const fail = () => {
        if (current !== generation) return;
        clear();
        notice('failed');
      };
      try { beforeRestore(); } catch { fail(); return; }
      Promise.resolve().then(() => {
        if (current !== generation) return false;
        const restore = owner()?.onRestored;
        return restore ? restore() : false;
      }).then((handled) => {
        if (current !== generation) return;
        if (handled === false) { fail(); return; }
        clear();
        pending = false;
        notice('ready');
      }).catch(fail);
    },
    dispose() { generation++; pending = false; clear(); },
  };
}
