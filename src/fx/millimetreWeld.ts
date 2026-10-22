/**
 * millimetreWeld.ts — corners welded where they meet to the millimetre (perf-240, 2026-10-22; the owner: "make stuff like
 * building destruction and other computation heavy things a lot more performant").
 *
 * The destruction presentation splits drawn geometry into its connected pieces by welding corners at their position
 * rounded to the millimetre. The welds keyed each corner by a `${x},${y},${z}` string, one allocated and hashed a corner:
 * half of a roof's furniture pass at every section's fall once the roof is down, and most of a heap's plate split. Here
 * the key is the integer triple itself, in an open-addressed table (no allocation a corner). Two corners share a key
 * exactly when their strings were equal (Math.round's -0 and 0 print alike and compare equal); a coordinate off the int32
 * range or not finite keeps a string key, so the welds are the ones the strings made.
 */

const I32_MIN = -0x80000000, I32_MAX = 0x7fffffff;

export interface MillimetreWeld {
  /** An empty table for up to `corners` keys. */
  begin(corners: number): void;
  /**
   * The value stored first at (x, y, z) rounded to the millimetre, or -1 when there was none (`value` is stored for it).
   * Values are non-negative.
   */
  claim(x: number, y: number, z: number, value: number): number;
}

export function createMillimetreWeld(): MillimetreWeld {
  let keys = new Int32Array(0), values = new Int32Array(0), mask = 0;
  const strings = new Map<string, number>();
  return {
    begin(corners) {
      let cap = 16;
      while (cap < corners * 2) cap *= 2;
      if (values.length < cap) { values = new Int32Array(cap); keys = new Int32Array(cap * 3); }
      mask = cap - 1;
      values.fill(-1, 0, cap);
      strings.clear();
    },
    claim(x, y, z, value) {
      const ix = Math.round(x * 1000), iy = Math.round(y * 1000), iz = Math.round(z * 1000);
      if (!(ix >= I32_MIN && ix <= I32_MAX && iy >= I32_MIN && iy <= I32_MAX && iz >= I32_MIN && iz <= I32_MAX)) {
        const key = `${ix},${iy},${iz}`;
        const prev = strings.get(key);
        if (prev === undefined) { strings.set(key, value); return -1; }
        return prev;
      }
      let h = (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) & mask;
      for (;;) {
        const at = values[h]!;
        if (at < 0) { values[h] = value; keys[h * 3] = ix; keys[h * 3 + 1] = iy; keys[h * 3 + 2] = iz; return -1; }
        if (keys[h * 3] === ix && keys[h * 3 + 1] === iy && keys[h * 3 + 2] === iz) return at;
        h = (h + 1) & mask;
      }
    },
  };
}
