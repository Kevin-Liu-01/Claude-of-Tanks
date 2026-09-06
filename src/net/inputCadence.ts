import type { RuntimeValue } from '../runtimeTypes.ts';
export interface NetworkInputSample {
  throttle?: number;
  steer?: number;
  brake?: boolean;
  fire?: boolean;
  aimLocked?: boolean;
  shellSlot?: number;
  actionBits?: number;
}

export interface NetworkInputCadenceOptions {
  sendHz?: number;
  analogEdgeThreshold?: number;
  maxAccumulatedS?: number;
}

const finite = (value: RuntimeValue): number => Number.isFinite(Number(value)) ? Number(value) : 0;

/**
 * Bound replaceable held-input uploads independently from display refresh.
 * Discrete controls and meaningful analog changes remain immediate.
 */
export class NetworkInputCadence {
  readonly intervalS: number;
  readonly analogEdgeThreshold: number;
  readonly maxAccumulatedS: number;
  #accumulatedS = 0;
  #cadenceElapsedS = 0;
  #lastSent: NetworkInputSample | null = null;

  constructor({
    sendHz = 60,
    analogEdgeThreshold = 0.08,
    maxAccumulatedS = 0.1,
  }: NetworkInputCadenceOptions = {}) {
    if (!Number.isFinite(sendHz) || sendHz <= 0 || sendHz > 240) {
      throw new RangeError('sendHz must be in (0, 240]');
    }
    if (!Number.isFinite(analogEdgeThreshold) || analogEdgeThreshold < 0 ||
        analogEdgeThreshold > 1) {
      throw new RangeError('analogEdgeThreshold must be in [0, 1]');
    }
    if (!Number.isFinite(maxAccumulatedS) || maxAccumulatedS <= 0) {
      throw new RangeError('maxAccumulatedS must be positive');
    }
    this.intervalS = 1 / sendHz;
    this.analogEdgeThreshold = analogEdgeThreshold;
    this.maxAccumulatedS = maxAccumulatedS;
  }

  advance(elapsedS: number): void {
    const dt = Math.max(0, finite(elapsedS));
    this.#accumulatedS = Math.min(
      this.maxAccumulatedS,
      this.#accumulatedS + dt,
    );
    this.#cadenceElapsedS = Math.min(this.maxAccumulatedS, this.#cadenceElapsedS + dt);
  }

  shouldSend(input: NetworkInputSample): boolean {
    const previous = this.#lastSent;
    if (!previous || this.#cadenceElapsedS + Number.EPSILON >= this.intervalS) return true;
    if (!!input.fire !== !!previous.fire || !!input.brake !== !!previous.brake ||
        !!input.aimLocked !== !!previous.aimLocked ||
        (finite(input.shellSlot) | 0) !== (finite(previous.shellSlot) | 0) ||
        (finite(input.actionBits) | 0) !== 0) {
      return true;
    }
    return Math.abs(finite(input.throttle) - finite(previous.throttle)) >=
        this.analogEdgeThreshold ||
      Math.abs(finite(input.steer) - finite(previous.steer)) >= this.analogEdgeThreshold;
  }

  /** Commit only after the transport accepts the input. */
  commit(input: NetworkInputSample): number {
    const elapsedS = this.#accumulatedS;
    this.#accumulatedS = 0;
    // Preserve fractional upload phase on non-divisor refresh rates. Keep it
    // separate from actual elapsed input time: carrying this remainder into
    // replay duration would simulate it twice. Early control edges start a new
    // interval, and long pauses drop missed slots rather than sending a burst.
    this.#cadenceElapsedS = this.#cadenceElapsedS + Number.EPSILON >= this.intervalS
      ? Math.max(0, this.#cadenceElapsedS - this.intervalS) % this.intervalS : 0;
    this.#lastSent = {
      throttle: finite(input.throttle),
      steer: finite(input.steer),
      brake: !!input.brake,
      fire: !!input.fire,
      aimLocked: !!input.aimLocked,
      shellSlot: finite(input.shellSlot) | 0,
      actionBits: finite(input.actionBits) | 0,
    };
    return elapsedS;
  }

  reset(): void {
    this.#accumulatedS = 0;
    this.#cadenceElapsedS = 0;
    this.#lastSent = null;
  }

  get pendingElapsedS(): number { return this.#accumulatedS; }
}
