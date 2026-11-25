/**
 * The wreck bake facts (wreck-bake-after-reveal-278; the owner: multiplayer should "just work", and a friend's slow
 * device sat on the loader). A cold Winter entry at 4 Mbps / 100 ms / 4x CPU spent 27.3 s of its 38.5 s props build
 * waiting on 13 wreck worker bakes: the hulks' seats, collision and the props placed after them all read the bake, so
 * decorative geometry decided when the battle could be shown.
 *
 * What placement and collision read of a bake is recorded per bake here: its solids and shell solids, its ground contact,
 * its footprints and its triangle budget (everything in WreckBake but the two geometries). The drawn footprint a placed
 * hulk leaves for the parked vehicles' seat passes (props.ts drawnPlanRecord) reads the posed geometry's every vertex, so
 * it is recorded per placement, keyed by the exact seat (wreckPlacementKey). tools/wreck-bake-plan.mjs records both
 * from the same Node bake and the same wire the browser takes, beside the plan, and its --check holds them to the tree.
 *
 * A browser build with a wreck worker places its hulks from these facts and draws a stand-in for each (its movement
 * solids, charred: what a tank meets), then bakes the hulks on the worker after the reveal and swaps the drawn mesh
 * (deferredWrecks.ts). Placement, collision and every later prop are the same whether the bake has landed or not; a bake
 * or placement the facts do not hold is baked where it is asked, as before, so a stale table costs time, never a
 * different world.
 */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CollisionRecord } from './collision.ts';
import type { WreckBake } from './wrecks.ts';
import type { WreckState } from './wreckStates.ts';
import { WRECK_BAKE_FACT_LOADERS } from './maps/wreckBakeFacts/index.ts';

/** A bake without its geometry: what placement, collision and the records read. */
export type WreckBakeFacts = Omit<WreckBake, 'geo' | 'shadowGeo'>;

/** One map's facts: by bake (wreckBakeKey) and by placed hulk (wreckPlacementKey; null: a hulk with no drawn record). */
export interface WreckFactsTable {
  bakes: Readonly<Record<string, WreckBakeFacts>>;
  drawn: Readonly<Record<string, CollisionRecord | null>>;
}

/** The bake's key: the donor, seed and damage state (wreckBakePrefetch.ts wreckBakeKey; the remnant paint is the map's). */
export function wreckFactsBakeKey(specId: string, seed: number, state: WreckState): string {
  return `${specId}|${seed}|${state}`;
}

/** A number as its exact text: shortest round trip, and the sign of a zero kept. */
const exact = (n: number): string => (Object.is(n, -0) ? '-0' : String(n));

/** A placed hulk's key: its bake and the exact seat it took (position, yaw and the ground normal it leans to). */
export function wreckPlacementKey(bakeKey: string, x: number, y: number, z: number, yaw: number,
  normalX: number, normalY: number, normalZ: number): string {
  return [bakeKey, x, y, z, yaw, normalX, normalY, normalZ].map((v) => (typeof v === 'number' ? exact(v) : v)).join('|');
}

/** The facts of a bake (no geometry), as the props build reads them. */
export function wreckFactsOf(bake: WreckBake): WreckBakeFacts {
  const { geo: _geo, shadowGeo: _shadow, ...facts } = bake;
  return facts;
}

/**
 * JSON with every number exact (-0 kept; JSON.parse reads "-0" back as -0); throws on a value JSON cannot hold, so a
 * table never rounds what the build compares.
 */
export function exactJson(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`wreck facts: ${value} is not a finite number`);
    return exact(value);
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(exactJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value as object).filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${exactJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  throw new Error(`wreck facts: a ${typeof value} cannot be recorded`);
}

/** One map's facts, or null where none are recorded or the chunk did not load (the build then bakes as before). */
export async function loadWreckBakeFacts(mapId: string): Promise<WreckFactsTable | null> {
  const load = WRECK_BAKE_FACT_LOADERS[mapId];
  if (!load) return null;
  try {
    return (await load()).WRECK_BAKE_FACTS;
  } catch (error) {
    console.warn(`[wrecks] ${mapId}'s wreck facts did not load; its wrecks bake before the battle`, error);
    return null;
  }
}

/** The stand-in's paint: the char of a burnt hull (wrecks.ts paint's value band, 0.055-0.105), linear. */
const STAND_IN_RGB: readonly [number, number, number] = [0.062, 0.056, 0.05];

/**
 * A hulk's stand-in until its bake lands: its movement solids (wreckCollision.ts collectWreckSolids: the posed hull's
 * columns and its turret, in the bake's frame) as convex pieces in the wreck merge's streams (position, normal, color),
 * charred. It is what a tank meets there, drawn; it costs a few hundred triangles and no donor build.
 */
export function wreckStandInGeometry(solids: readonly number[][]): THREE.BufferGeometry | null {
  const pieces: THREE.BufferGeometry[] = [];
  for (const solid of solids) {
    if (solid.length < 12) continue;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i + 2 < solid.length; i += 3) points.push(new THREE.Vector3(solid[i], solid[i + 1], solid[i + 2]));
    try {
      const hull = new ConvexGeometry(points);
      if (hull.attributes.position.count >= 3) pieces.push(hull);
      else hull.dispose();
    } catch { /* a flat or degenerate solid draws nothing */ }
  }
  if (!pieces.length) return null;
  let count = 0;
  for (const piece of pieces) count += piece.attributes.position.count;
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), color = new Float32Array(count * 3);
  let at = 0;
  for (const piece of pieces) {
    position.set(piece.attributes.position.array as Float32Array, at * 3);
    normal.set(piece.attributes.normal.array as Float32Array, at * 3);
    at += piece.attributes.position.count;
    piece.dispose();
  }
  for (let i = 0; i < count; i++) color.set(STAND_IN_RGB, i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.userData.wreckStandIn = true;
  return geo;
}
