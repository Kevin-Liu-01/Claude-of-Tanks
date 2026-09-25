/** Bounded sample histogram (p50 / p95 / max) and monotonic counters for /metrics. */
export interface Histogram {
  push(value: number): void;
  readonly count: number;
  readonly total: number;
  quantile(q: number): number;
  max(): number;
  summary(): { count: number; p50: number; p95: number; max: number; mean: number };
  reset(): void;
}

export function createHistogram(capacity = 1024): Histogram {
  if (!Number.isInteger(capacity) || capacity < 2) throw new TypeError('histogram capacity must be at least 2');
  const samples = new Float64Array(capacity);
  const sorted = new Float64Array(capacity);
  let cursor = 0;
  let filled = 0;
  let total = 0;
  let sum = 0;
  let dirty = true;
  const sort = (): Float64Array => {
    if (dirty) {
      sorted.set(samples.subarray(0, filled));
      sorted.subarray(0, filled).sort();
      dirty = false;
    }
    return sorted;
  };
  return {
    push(value) {
      if (!Number.isFinite(value)) return;
      samples[cursor] = value;
      cursor = (cursor + 1) % capacity;
      if (filled < capacity) filled++;
      total++;
      sum += value;
      dirty = true;
    },
    get count() { return total; },
    get total() { return total; },
    quantile(q) {
      if (!filled) return 0;
      const view = sort();
      const index = Math.min(filled - 1, Math.max(0, Math.ceil(q * filled) - 1));
      return view[index]!;
    },
    max() {
      if (!filled) return 0;
      return sort()[filled - 1]!;
    },
    summary() {
      return {
        count: total,
        p50: this.quantile(0.5),
        p95: this.quantile(0.95),
        max: this.max(),
        mean: total ? sum / total : 0,
      };
    },
    reset() { cursor = 0; filled = 0; total = 0; sum = 0; dirty = true; },
  };
}
