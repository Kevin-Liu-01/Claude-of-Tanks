// src/world/destructibles.ts — the seam between the FX layer and the world
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

export type BreakFxProvider = (
  kind: string,
  x: number,
  y: number,
  z: number,
  directionX: number,
  directionZ: number,
  heightM: number,
) => void;

export interface DestroyedPropEvent {
  kind: string;
  pos: number[];
  cause: 'ram' | 'shell' | 'blast';
}

export interface ShellImpactOptions {
  r: number;
  he: boolean;
}

export interface WorldDestructibleEntry {
  key: string;
  isActive(): boolean;
  sweep(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void;
  impact(x: number, y: number, z: number, options: ShellImpactOptions): void;
}

type DestroyedEventSink = (event: DestroyedPropEvent) => void;

let fxProvider: BreakFxProvider | null = null;

/**
 * effects.js registers the kind-aware particle burst here (once, at createFx).
 * @param {?function(string,number,number,number,number,number,number):void} fn
 *   (kind, x, y, z, dirX, dirZ, heightM)
 */
export function setBreakFxProvider(fn: BreakFxProvider | null): void { fxProvider = fn; }

/**
 * props.js calls this whenever a destructible breaks or topples — the FX cap
 * lives on the props side (it knows batch sizes); this just forwards.
 * dx/dz carry MAGNITUDE (impact energy): 1 = shell-grade break, ramming hulls
 * scale it with their overrun speed so debris inherits the tank's velocity.
 * @param {string} kind destructible kind ('barrel', 'fence', 'bale', ...)
 */
export function emitBreakFx(
  kind: string,
  x: number,
  y: number,
  z: number,
  dx: number,
  dz: number,
  h: number,
): void {
  if (fxProvider) fxProvider(kind, x, y, z, dx, dz, h);
}

// DESTRUCTIBLES r1: bus seam for prop destruction — the AUDIO layer (and any
// other bus consumer) subscribes to 'prop:destroyed' without the world layer
// ever importing the bus. main.js wires the sink at boot; every breakRecord
// in props.js reports through here regardless of trigger path.
let eventSink: DestroyedEventSink | null = null;

/** main.js registers (ev) => bus.emit('prop:destroyed', ev). */
export function setDestroyedEventSink(fn: DestroyedEventSink | null): void { eventSink = fn; }

/**
 * @param {{kind:string, pos:number[], cause:('ram'|'shell'|'blast')}} ev
 */
export function emitDestroyed(event: DestroyedPropEvent): void {
  if (eventSink) eventSink(event);
}

const worlds: WorldDestructibleEntry[] = [];

/**
 * props.js registers one entry per built world (keyed by mapId — rebuilding a
 * map replaces its stale entry instead of stacking).
 * @param {{key:string, isActive:function():boolean,
 *   sweep:function(number,number,number,number,number,number):void,
 *   impact:function(number,number,number,{r:number,he:boolean}):void}} entry
 */
export function registerWorldDestructibles(entry: WorldDestructibleEntry): void {
  const i = worlds.findIndex((w) => w.key === entry.key);
  if (i >= 0) worlds[i] = entry; else worlds.push(entry);
}

/**
 * Shell flight segment (effects.js update loop, one per live shell per frame).
 * Light props crossed by the segment break cosmetically; the shell itself is
 * NEVER consumed (they carry no colliders — sapling behavior).
 */
export function notifyShellSweep(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): void {
  for (const w of worlds) if (w.isActive()) w.sweep(ax, ay, az, bx, by, bz);
}

/**
 * Shell world-impact point (effects.js shell:expired listener). HE gets a
 * real blast radius, AP a token one.
 * @param {{r:number, he:boolean}} opts
 */
export function notifyShellImpact(
  x: number,
  y: number,
  z: number,
  options: ShellImpactOptions,
): void {
  for (const w of worlds) if (w.isActive()) w.impact(x, y, z, options);
}
