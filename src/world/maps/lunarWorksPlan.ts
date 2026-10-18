// src/world/maps/lunarWorksPlan.ts — the Moon's structure variants as plain data (the Earthrise 228 rebuild, 2026-10-18).
// No geometry imports and outside maps/regional/, so a map config (moon.ts) can name the variants without drawing the
// lunar kit into the host Worker's graph (src/mp/host/hostFleet.selftest.mjs bars every regional kit; the Ironworks
// precedent, saarWorksPlan.ts); the kit itself (regional/lunarWorks.ts) builds the pieces the names resolve to and
// re-exports this table for its receipts.
/** The Moon's structure variants, kind by kind (props structureVariants). */
export const LUNAR_STRUCTURE_VARIANTS = Object.freeze({
  sandbagwall: 'lunarbagwall', sandbagbig: 'lunarbagwallbig', sandbagsmall: 'lunarbagwallsmall', barbedwire: 'lunartether',
  barrier: 'lunarblockrow', cone: 'lunarbeacon', trashcan: 'lunarcanister', fenceplank: 'lunarbagfence',
} as const);
