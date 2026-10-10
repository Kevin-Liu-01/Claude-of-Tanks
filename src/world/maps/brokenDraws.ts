// src/world/maps/brokenDraws.ts — (b39, the scenery lane; the destructibles audit) the draw law a destructible's new
// broken state keeps. A destructible pool builds its intact and broken geometry from the map's shared props stream
// (props.ts `drng`), and every later pool's geometry and every later placement read that stream after it: a broken
// builder replaced by a better one must spend exactly the draws the old one spent, then draw from a stream of its own.
import type * as THREE from 'three';

type Rng = () => number;

/**
 * Spend the legacy broken builder's draws exactly (it is built and disposed), and return a stream of the new break's
 * own, seeded from the legacy's first two draws and `salt` (one per kind), so the new state draws what it likes.
 */
export function spentDraws(legacy: (rng: Rng) => THREE.BufferGeometry, rng: Rng, salt: number): Rng {
  let seed = salt | 0, k = 0;
  legacy(() => { const v = rng(); if (k++ < 2) seed = Math.imul(seed ^ Math.floor(v * 4294967296), 0x9e3779b1); return v; }).dispose();
  let a = seed | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
