import { isSequenceNewer } from './protocol.ts';

const validSlot = (slot: number | undefined): slot is number =>
  Number.isInteger(slot) && Number(slot) >= 0 && Number(slot) <= 2;
const validSequence = (sequence: number | null): sequence is number =>
  Number.isSafeInteger(sequence) && Number(sequence) >= 0 && Number(sequence) <= 0x7fffffff;

/**
 * Local selection ownership only: no ammunition, reload or weapon simulation.
 * A value matching authority is not a receipt (0→1→0 can still be in flight).
 * Keep one latest intent and its FIRST successfully submitted input sequence.
 */
export class LocalAmmoSelectionIntent {
  private observedSlot: number | null = null;
  private requestedSlot: number | null = null;
  private firstSubmittedSeq: number | null = null;
  private authorityTick = -1;

  get pending(): boolean { return this.requestedSlot !== null; }

  private observe(slot: number): void {
    if (this.observedSlot === null || slot === this.observedSlot) return;
    this.observedSlot = slot;
    this.requestedSlot = slot;
    this.firstSubmittedSeq = null;
  }

  /** Called only after the existing transport accepts this input frame. */
  recordSubmitted(slot: number | undefined, inputSeq: number, playing = true): void {
    if (!validSlot(slot) || !validSequence(inputSeq)) return;
    this.observe(slot);
    // Countdown acknowledges receipt but deliberately does not apply controls.
    // Its final tick also publishes playing before the first control step.
    if (playing && this.requestedSlot === slot && this.firstSubmittedSeq === null) {
      this.firstSubmittedSeq = inputSeq;
    }
  }

  reconcile(
    inputSlot: number,
    authoritySlot: number,
    ackInputSeq: number | null,
    tick: number,
    destroyed: boolean,
  ): number {
    if (!validSlot(authoritySlot) || !Number.isSafeInteger(tick) || tick < 0) return inputSlot;
    if (validSlot(inputSlot)) this.observe(inputSlot);
    if (tick <= this.authorityTick) return inputSlot;
    this.authorityTick = tick;
    if (destroyed || this.observedSlot === null) return this.seed(authoritySlot);
    if (this.requestedSlot === null) return this.seed(authoritySlot);
    const submitted = this.firstSubmittedSeq;
    if (submitted !== null && validSequence(ackInputSeq) &&
      (ackInputSeq === submitted || isSequenceNewer(ackInputSeq, submitted))) {
      // Even a denied switch or server-side reset wins once its input is covered.
      return this.seed(authoritySlot);
    }
    return this.requestedSlot;
  }

  private seed(slot: number): number {
    this.observedSlot = slot;
    this.requestedSlot = null;
    this.firstSubmittedSeq = null;
    return slot;
  }

  reset(): void {
    this.observedSlot = null;
    this.requestedSlot = null;
    this.firstSubmittedSeq = null;
    this.authorityTick = -1;
  }
}
