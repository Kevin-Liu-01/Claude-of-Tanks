import type { PlayMode } from './playMode.ts';

interface RoomFailureMenu {
  showRoomFailure(reason: string, mode?: PlayMode): void;
}

interface RoomFailureOptions {
  hasMatch(): boolean;
  getMode(): PlayMode;
  shouldReturnToGarage(): boolean;
  clearInput(): void;
  closeRoom(reason: string): void;
  returnToGarage(): Promise<void>;
  getMenu(): Promise<RoomFailureMenu> | null;
}

/** One terminal transaction, never a fabricated match result or a host migration. */
export function createNetworkRoomFailureRuntime(ports: RoomFailureOptions) {
  let pending: Promise<void> | null = null;

  const fail = (reason: string): Promise<void> => {
    if (pending) return pending;
    if (!ports.hasMatch()) return Promise.resolve();
    const mode = ports.getMode();
    const needsGarage = ports.shouldReturnToGarage();
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const operation = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    // Teardown callbacks can re-enter synchronously. Publish the lease first.
    pending = operation;
    try {
      ports.clearInput();
      ports.closeRoom(reason);
      void (async () => {
        if (needsGarage) await ports.returnToGarage();
        const menu = await ports.getMenu();
        // A newly joined room must never inherit a previous room's failure UI.
        if (!ports.hasMatch()) menu?.showRoomFailure(reason, mode);
      })().then(resolve, reject);
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Room cleanup failed', { cause: error }));
    }
    const tracked = operation.finally(() => {
      if (pending === tracked) pending = null;
    });
    pending = tracked;
    return tracked;
  };

  return { fail, get pending() { return pending !== null; } };
}
