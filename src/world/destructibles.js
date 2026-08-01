// src/world/destructibles.js — the SEAM between the fx layer and the world
// prop layer for destructible small props (world-dressing r1).
//
// Why this module exists: shells resolve in src/game/state.js (frozen) and
// their impact/flight data surfaces in src/fx/effects.js (bus listeners +
// per-frame shell loop). The destructible props themselves live in
// src/world/props.js. Neither layer may import the other's heavyweight module
// (fx -> props would pull the whole world builder into the fx layer), so both
// meet here: props.js registers per-world break handlers, effects.js registers
// the particle-burst provider and forwards shell flight/impact events.
//
// Worlds are CACHED per mapId and reused across battles (main.js worldCache),
// with only the active one visible — handlers register keyed by mapId
// (a rebuild of the same map replaces its entry) and are dispatched only when
// their world group is actually visible in the scene graph.

let fxProvider = null;

/**
 * effects.js registers the kind-aware particle burst here (once, at createFx).
 * @param {?function(string,number,number,number,number,number,number):void} fn
 *   (kind, x, y, z, dirX, dirZ, heightM)
 */
export function setBreakFxProvider(fn) { fxProvider = fn; }

/**
 * props.js calls this whenever a destructible breaks or topples — the FX cap
 * lives on the props side (it knows batch sizes); this just forwards.
 * @param {string} kind destructible kind ('barrel', 'fence', 'bale', ...)
 */
export function emitBreakFx(kind, x, y, z, dx, dz, h) {
  if (fxProvider) fxProvider(kind, x, y, z, dx, dz, h);
}

/** @type {Array<{key:string,isActive:function():boolean,sweep:Function,impact:Function}>} */
const worlds = [];

/**
 * props.js registers one entry per built world (keyed by mapId — rebuilding a
 * map replaces its stale entry instead of stacking).
 * @param {{key:string, isActive:function():boolean,
 *   sweep:function(number,number,number,number,number,number):void,
 *   impact:function(number,number,number,{r:number,he:boolean}):void}} entry
 */
export function registerWorldDestructibles(entry) {
  const i = worlds.findIndex((w) => w.key === entry.key);
  if (i >= 0) worlds[i] = entry; else worlds.push(entry);
}

/**
 * Shell flight segment (effects.js update loop, one per live shell per frame).
 * Light props crossed by the segment break cosmetically; the shell itself is
 * NEVER consumed (they carry no colliders — sapling behavior).
 */
export function notifyShellSweep(ax, ay, az, bx, by, bz) {
  for (const w of worlds) if (w.isActive()) w.sweep(ax, ay, az, bx, by, bz);
}

/**
 * Shell world-impact point (effects.js shell:expired listener). HE gets a
 * real blast radius, AP a token one.
 * @param {{r:number, he:boolean}} opts
 */
export function notifyShellImpact(x, y, z, opts) {
  for (const w of worlds) if (w.isActive()) w.impact(x, y, z, opts);
}
