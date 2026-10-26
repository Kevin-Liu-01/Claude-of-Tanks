//! `mulberry32`, bit-identical to `src/game/stateCore.ts` (docs/ARCHITECTURE.md
//! §1.4): the canonical seeded generator behind every battle, spawn, camo and
//! dispersion roll.

use crate::jsmath::{imul, to_int32};

/// The canonical deterministic PRNG. Each call yields a double in `[0, 1)`
/// with 32 bits of entropy, exactly as `mulberry32(seed)()` does in the
/// TypeScript runtime.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Mulberry32 {
    state: i32,
}

impl Mulberry32 {
    /// `mulberry32(seed)` for a seed already in `int32` range.
    pub const fn new(seed: i32) -> Mulberry32 {
        Mulberry32 { state: seed }
    }

    /// `mulberry32(seed)` for any JavaScript number: applies `seed | 0`.
    pub fn from_js_number(seed: f64) -> Mulberry32 {
        Mulberry32::new(to_int32(seed))
    }

    /// The generator's `int32` state (for snapshots and receipts).
    pub const fn state(&self) -> i32 {
        self.state
    }

    /// The next double in `[0, 1)`.
    pub fn next_f64(&mut self) -> f64 {
        // state = state + 0x6D2B79F5 | 0
        self.state = self.state.wrapping_add(0x6D2B_79F5u32 as i32);
        let s = self.state as u32;
        // let value = Math.imul(state ^ state >>> 15, 1 | state);
        let mut value = imul((s ^ (s >> 15)) as i32, (1 | s) as i32);
        // value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
        let v = value as u32;
        value = value.wrapping_add(imul((v ^ (v >> 7)) as i32, (61 | v) as i32)) ^ value;
        // return ((value ^ value >>> 14) >>> 0) / 4294967296;
        let v = value as u32;
        (v ^ (v >> 14)) as f64 / 4_294_967_296.0
    }
}

/// The `() => number` signature every TypeScript module takes as `rng`.
pub trait Rng {
    /// The next double in `[0, 1)`.
    fn next_f64(&mut self) -> f64;
}

impl Rng for Mulberry32 {
    fn next_f64(&mut self) -> f64 {
        Mulberry32::next_f64(self)
    }
}

impl<F: FnMut() -> f64> Rng for F {
    fn next_f64(&mut self) -> f64 {
        self()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_zero_first_draws_are_the_known_mulberry32_values() {
        // mulberry32(0)() in V8 → 0.26642920868471265, then 0.0003297457005828619.
        let mut r = Mulberry32::new(0);
        assert_eq!(r.next_f64(), 0.266_429_208_684_712_65);
        assert_eq!(r.next_f64(), 0.000_329_745_700_582_861_9);
    }

    #[test]
    fn js_number_seeds_wrap_to_int32() {
        assert_eq!(Mulberry32::from_js_number(4_294_967_297.0), Mulberry32::new(1));
        assert_eq!(Mulberry32::from_js_number(-1.5), Mulberry32::new(-1));
    }
}
