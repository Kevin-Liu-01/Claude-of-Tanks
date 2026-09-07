import type { RuntimeValue } from '../runtimeTypes.ts';

export interface ConfirmedShotEvent extends Record<string, RuntimeValue> {
  type: 'shell_fired';
  shooterId: string;
  shellId: number;
}

const MAX_PENDING_SHOTS = 128;
const MAX_RECENT_SHOTS = 256;

/** Separate only the viewer's accepted shots from delayed remote chronology. */
export class LocalConfirmedShotQueue {
  readonly playerId: string;
  private readonly pending: ConfirmedShotEvent[] = [];
  private readonly seen = new Set<number>();

  constructor(playerId: string) { this.playerId = playerId; }

  take(event: Record<string, RuntimeValue>): boolean {
    if (event.type !== 'shell_fired' || event.shooterId !== this.playerId ||
        !Number.isSafeInteger(event.shellId) || Number(event.shellId) < 0) return false;
    const shellId = Number(event.shellId);
    if (this.seen.has(shellId)) return true;
    if (this.pending.length >= MAX_PENDING_SHOTS) {
      throw new RangeError('confirmed local shot backlog exceeded its limit');
    }
    this.seen.add(shellId);
    if (this.seen.size > MAX_RECENT_SHOTS) this.seen.delete(this.seen.values().next().value!);
    this.pending.push(event as ConfirmedShotEvent);
    return true;
  }

  drain(target: Record<string, RuntimeValue>[]): void {
    target.length = 0;
    for (const event of this.pending) target.push(event);
    this.pending.length = 0;
  }

  clearPending(): void { this.pending.length = 0; }

  /** Shell IDs are match-local: a new round must also reset confirmation history. */
  reset(): void {
    this.clearPending();
    this.seen.clear();
  }
}
