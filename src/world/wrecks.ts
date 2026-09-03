// src/world/wrecks.ts — DESTRUCTIBLES r1: REAL-ROSTER TANK WRECKS as static
// battlefield dressing.
//
// The old props.ts hulks were generic box sketches; the owner asked for the
// map wrecks to be "our actual tank models". This module builds a roster
// vehicle through the live factory (src/vehicles/tankFactory.ts), applies the
// settled destroyed pose via the factory's own wreck machinery
// (setDestroyed({pop, ageS: large}) — the exact precedent the killcam uses:
// wreckSeat capture, askew turret, drooped gun), then BAKES the posed
// hierarchy down to one static merged BufferGeometry with charred/rusted
// vertex colors and disposes the live visual. The factory's geometry-only
// material mode skips every temporary PBR/camouflage canvas because those
// pixels cannot survive this bake. A whole map's wrecks render as
// ONE mesh on the props layer's matte vertex-color material — a handful of
// draw calls total instead of a live tank's dozens, no articulation, no
// per-frame cost, no tank materials/textures retained.
//
// Contract notes:
//  - createTank is called with proceduralOnly: true — synchronous procedural
//    build (no async GLB swap, no GLB textures), and attachTankDecorations
//    HARD-SKIPS on that flag, so this path never interacts with the
//    decoration system or the geometry-gate metrology guards. tankFactory
//    itself is NOT modified — the bake is a pure consumer.
//  - Wrecks are DRESSING: props.ts gives them solid obstacles + colliders;
//    they are never in game.tanks, never spotted, never on the minimap.
//  - Failure-tolerant: profile builders are actively iterated by the
//    fidelity program — any per-id build failure returns null and the caller
//    just skips that wreck (a map with fewer wrecks beats a crashed build).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createTank } from '../vehicles/fleetFactory.ts';
import { VEHICLE_ERAS } from '../vehicles/taxonomy.ts';

interface WreckOptions {
  seed?: number;
  pop?: boolean;
}

interface WreckBake {
  geo: THREE.BufferGeometry;
  shadowGeo: THREE.BufferGeometry | null;
  hx: number;
  hz: number;
  h: number;
  tris: number;
}

type TankWreckVisual = ReturnType<typeof createTank>;

type DebrisFamily = 'char' | 'rust' | 'rubber';

interface WreckGeometrySet {
  geos: THREE.BufferGeometry[];
  proxyGeos: THREE.BufferGeometry[];
}

function mulberry32(a: number): () => number {
  return function (): number {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// cheap deterministic 3D value hash for the char/rust paint (no noise dep —
// wrecks.ts must stay import-light to avoid world<->vehicles cycles)
function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

const _m = new THREE.Matrix4();
// Static battlefield wrecks are never inspection heroes. Match the proven
// low-geometry battle handoff used by live tanks beyond 66 m: retain the
// load-bearing road-wheel/tire silhouettes, but omit sub-wheel recesses,
// return rollers and end-wheel fasteners that disappear under the charred
// track band at gameplay scale.
const WRECK_FINE_GEAR = /^(?:gearRoadWheel.*(?:Inset|Ring|Rim|Bowl|Hub|Dish|Recess)|gearReturnRoller|gearEndWheelHardware)/;
// At the closest authored wreck framing (~16 m), a 45 cm object projects to
// only a few pixels and its charred material has almost no internal contrast.
// Keep silhouette-bearing fittings, but do not bake smaller inspection parts
// into a map-long static mesh. This threshold is deliberately below road
// wheels, hatches, stowage boxes, guns and ERA blocks.
const WRECK_MIN_PART_DIAGONAL_M = 0.45;

/** true when o and every ancestor up to (incl.) root renders */
function chainVisible(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) {
    if (n.visible === false) return false;
    if (n === root) return true;
  }
  return true; // detached-under-root should not happen; keep permissive
}

function appendInstancedGeometry(
  mesh: THREE.InstancedMesh,
  rootInv: THREE.Matrix4,
  geos: THREE.BufferGeometry[],
): void {
  const relative = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
  const instance = new THREE.Matrix4();
  const transform = new THREE.Matrix4();
  const count = Math.min(mesh.count, 400);
  for (let i = 0; i < count; i++) {
    mesh.getMatrixAt(i, instance);
    transform.multiplyMatrices(relative, instance);
    geos.push(mesh.geometry.clone().applyMatrix4(transform));
  }
}

function isSimplifiedTrackReplacement(mesh: THREE.Mesh): boolean {
  if (mesh.name === 'gearTrackPadsSimplified') return false;
  return mesh.name === 'gearTrackPads'
    && !!mesh.parent?.children.some((child) => child.name === 'gearTrackPadsSimplified');
}

function isDiscardedWreckPart(mesh: THREE.Mesh, root: THREE.Object3D): boolean {
  if (isSimplifiedTrackReplacement(mesh)) return true;
  if (mesh.name !== 'gearTrackPadsSimplified' && !chainVisible(mesh, root)) return true;
  return WRECK_FINE_GEAR.test(mesh.name || '');
}

function appendWreckMeshGeometry(
  mesh: THREE.Mesh,
  root: THREE.Object3D,
  rootInv: THREE.Matrix4,
  target: WreckGeometrySet,
  size: THREE.Vector3,
): void {
  if (!mesh.geometry?.attributes?.position || isDiscardedWreckPart(mesh, root)) return;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (material?.colorWrite === false) {
    target.proxyGeos.push(mesh.geometry.clone().applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld),
    ));
    return;
  }
  if (material?.transparent && 'map' in material && material.map) return;
  if (mesh instanceof THREE.InstancedMesh) {
    appendInstancedGeometry(mesh, rootInv, target.geos);
    return;
  }
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  mesh.geometry.boundingBox?.getSize(size);
  if (Math.hypot(size.x, size.y, size.z) < WRECK_MIN_PART_DIAGONAL_M) return;
  target.geos.push(mesh.geometry.clone().applyMatrix4(
    new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld),
  ));
}

function collectWreckGeometry(root: THREE.Object3D, rootInv: THREE.Matrix4): WreckGeometrySet {
  const target: WreckGeometrySet = { geos: [], proxyGeos: [] };
  const size = new THREE.Vector3();
  root.traverse((object: THREE.Object3D) => {
    if (object instanceof THREE.Mesh) {
      appendWreckMeshGeometry(object, root, rootInv, target, size);
    }
  });
  return target;
}

function normalizeGeometry(
  geometry: THREE.BufferGeometry,
  keepNormal: boolean,
): THREE.BufferGeometry {
  const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
  if (keepNormal && !normalized.attributes.normal) normalized.computeVertexNormals();
  for (const key of Object.keys(normalized.attributes)) {
    if (key !== 'position' && (!keepNormal || key !== 'normal')) normalized.deleteAttribute(key);
  }
  normalized.morphAttributes = {};
  normalized.clearGroups();
  return normalized;
}

function normalizeGeometrySet(
  geometries: THREE.BufferGeometry[],
  keepNormal: boolean,
): THREE.BufferGeometry[] {
  return geometries.map((geometry) => normalizeGeometry(geometry, keepNormal));
}

function mergeRequired(
  geometries: THREE.BufferGeometry[],
  failureMessage: string,
): THREE.BufferGeometry {
  const merged = mergeGeometries(geometries, false);
  if (!merged) throw new Error(failureMessage);
  return merged;
}

function wreckVertexColor(
  px: number,
  py: number,
  pz: number,
  up: number,
  rustPhase: number,
): readonly [number, number, number] {
  const panel = hash3(
    Math.round(px * 2.4) * 0.5,
    Math.round(py * 2.4) * 0.5,
    Math.round(pz * 2.4) * 0.5,
  );
  const grain = hash3(px * 9.1, py * 9.1, pz * 9.1);
  const rust = hash3(px * 1.7 + rustPhase, py * 1.9, pz * 1.7 - rustPhase);
  if (rust > 0.80 && up < 0.85) {
    const level = 0.085 + grain * 0.075;
    return [level * 1.75, level * 0.9, level * 0.55];
  }
  const level = 0.046 + panel * 0.022 + grain * 0.017 + up * up * 0.020;
  return [level * 1.05, level, level * 0.93];
}

function paintWreckGeometry(merged: THREE.BufferGeometry, rustPhase: number): void {
  const position = merged.attributes.position;
  const normal = merged.attributes.normal;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const color = wreckVertexColor(
      position.getX(i),
      position.getY(i),
      position.getZ(i),
      Math.max(0, normal.getY(i)),
      rustPhase,
    );
    colors[i * 3] = color[0];
    colors[i * 3 + 1] = color[1];
    colors[i * 3 + 2] = color[2];
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function mergeShadowGeometry(proxyGeos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!proxyGeos.length) return null;
  const normalized = normalizeGeometrySet(proxyGeos, false);
  const merged = mergeGeometries(normalized, false);
  for (const geometry of normalized) geometry.dispose();
  return merged;
}

function wreckBakeResult(
  merged: THREE.BufferGeometry,
  shadowGeo: THREE.BufferGeometry | null,
): WreckBake {
  merged.computeBoundingBox();
  const bounds = merged.boundingBox;
  if (!bounds) throw new Error('wreck bounds unavailable');
  merged.translate(0, -bounds.min.y, 0);
  shadowGeo?.translate(0, -bounds.min.y, 0);
  return {
    geo: merged,
    shadowGeo,
    hx: (bounds.max.x - bounds.min.x) / 2,
    hz: (bounds.max.z - bounds.min.z) / 2,
    h: bounds.max.y - bounds.min.y,
    tris: (merged.attributes.position.count / 3) | 0,
  };
}

/**
 * Build one roster tank as a settled, burnt wreck and bake it to a single
 * static geometry (position/normal/color, base at y=0, XZ centered on the
 * hull origin, facing local +z like the live tank).
 *
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {string} specId roster vehicle id ('tiger1', 'm1a2', ...)
 * @param {{seed?: number, pop?: boolean}} [opts] pop=true = ammo-rack wreck
 *   (turret tossed beside the ring), else unseated-askew turret
 * @returns {?{geo: THREE.BufferGeometry, hx: number, hz: number, h: number,
 *   tris: number}} null on any build failure
 */
export function bakeTankWreck(
  engineCtx: object,
  specId: string,
  opts: WreckOptions = {},
): WreckBake | null {
  const seed = (opts.seed ?? 1) | 0;
  const rng = mulberry32(seed ^ 0x5eed);
  let visual: TankWreckVisual | null = null;
  try {
    visual = createTank(specId, engineCtx, {
      camoSeed: 4000 + (seed % 997),
      quality: 'low',
      // Battlefield hulks are read by their hull/turret/track silhouette, not
      // inspection-scale fasteners. Use the same authored low-geometry branch
      // as distant live combatants before baking the pose. This preserves the
      // exact vehicle proportions and wreck choreography while avoiding a
      // permanent hero-mesh tax on every frame of the match.
      geometryQuality: 'low',
      // The hierarchy is immediately reduced to position/normal/color and
      // rendered with the props layer's one baked material. Building normal,
      // roughness, camouflage, track, decal, and burnt maps here was pure
      // discarded work (nine modern wrecks dominated Ruinspires props time).
      materialMode: 'geometry-only',
      proceduralOnly: true,    // synchronous, no GLB, decor hard-skips
    });
    // settled wreck pose through the factory's own machinery: ageS far past
    // every timeline => turret settled (popped beside the ring or unseated
    // askew), gun drooped, burn timeline fully aged.
    visual.setDestroyed({ pop: !!opts.pop, ageS: 1000 });
    const root = visual.root;
    root.updateMatrixWorld(true);
    const rootInv = _m.copy(root.matrixWorld).invert().clone();
    const { geos, proxyGeos } = collectWreckGeometry(root, rootInv);
    if (!geos.length) throw new Error('no bakeable geometry');
    const normalized = normalizeGeometrySet(geos, true);
    const merged = mergeRequired(normalized, 'merge failed');

    // ---- charred/rusted wreck paint (vertex colors, matte 'baked' mat) ----
    // Language matches the props charPaint hulks: scorched brown-black body,
    // clustered rust bloom, ash-lightened upward faces, subtle panel drift.
    // stay inside the PROVEN charPaint value band (props.ts r7 hulks:
    // v 0.055-0.105) — the first cut carried an up-facing "ash" bonus to
    // ~0.16 albedo which tonemapped to TAN under a 3.5+ sun (steppe/verdant
    // frame review); charred steel must stay near-black even sunlit.
    const rustPhase = rng() * 40;
    paintWreckGeometry(merged, rustPhase);
    const shadowGeo = mergeShadowGeometry(proxyGeos);
    const result = wreckBakeResult(merged, shadowGeo);
    for (const geometry of normalized) geometry.dispose();
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[wrecks] bake failed for ${specId}:`, message);
    return null;
  } finally {
    if (visual) {
      try { visual.dispose(); } catch (_) { /* never break a world build */ }
    }
  }
}

/**
 * Era-appropriate wreck id pools (base-roster procedural ids only — always
 * registered, always buildable without a GLB fetch).
 * @param {string} era canonical vehicle era
 * @returns {string[]}
 */
export function wreckPool(era: string): string[] {
  if (era === VEHICLE_ERAS.INTERWAR || era === VEHICLE_ERAS.WORLD_WAR_II) {
    return ['tiger1', 'panther_g', 't34_85', 'm4a3e8', 'is2', 'kv2'];
  }
  if (era === VEHICLE_ERAS.COLD_WAR) {
    return ['m60a1', 'm48', 't80u', 'type74', 'leo1a5', 'chieftain5',
      'type59', 'strv103', 'm1a1', 'bmp2'];
  }
  return ['m1a2', 't90m', 'leo2a7', 't90a', 'challenger2', 'leclerc',
    'merkava3d', 'k2', 'type99a', 'type10', 'kf51', 'ariete', 'pt91m', 'strv122'];
}

function debrisBaseColor(
  family: DebrisFamily,
  rust: boolean,
): readonly [number, number, number] {
  if (rust) return [0.16, 0.072, 0.034];
  if (family === 'rubber') return [0.028, 0.026, 0.024];
  return [0.064, 0.057, 0.051];
}

function appendColoredDebris(
  geometry: THREE.BufferGeometry,
  family: DebrisFamily,
  rng: () => number,
  parts: THREE.BufferGeometry[],
): void {
  const normalized = normalizeGeometry(geometry, true);
  const colors = new Float32Array(normalized.attributes.position.count * 3);
  for (let i = 0; i < normalized.attributes.position.count; i++) {
    const grain = 0.78 + rng() * 0.38;
    const rust = family === 'rust' || (family === 'char' && rng() < 0.12);
    const base = debrisBaseColor(family, rust);
    colors[i * 3] = base[0] * grain;
    colors[i * 3 + 1] = base[1] * grain;
    colors[i * 3 + 2] = base[2] * grain;
  }
  normalized.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  parts.push(normalized);
}

function appendTornTrackRun(
  side: number,
  modern: boolean,
  rng: () => number,
  parts: THREE.BufferGeometry[],
): void {
  const count = (modern ? 10 : 8) + ((rng() * 5) | 0);
  const startX = side * (modern ? 2.05 : 1.65);
  const startZ = (rng() - 0.5) * 2.2;
  const direction = (side > 0 ? 0.45 : Math.PI + 0.45) + (rng() - 0.5) * 1.2;
  for (let i = 0; i < count; i++) {
    if (i > 2 && rng() < 0.16) continue;
    const distance = i * (modern ? 0.48 : 0.42);
    const x = startX + Math.sin(direction) * distance + Math.sin(i * 0.8) * 0.16;
    const z = startZ + Math.cos(direction) * distance + Math.cos(i * 0.63) * 0.14;
    const pad = new THREE.BoxGeometry(modern ? 0.50 : 0.43, 0.09, modern ? 0.31 : 0.27);
    pad.rotateY(direction + (rng() - 0.5) * 0.36);
    pad.rotateX((rng() - 0.5) * 0.22);
    pad.rotateZ((rng() - 0.5) * 0.18);
    pad.translate(x, 0.07 + rng() * 0.05, z);
    appendColoredDebris(pad, i % 5 === 0 ? 'rust' : 'char', rng, parts);
  }
}

function appendDetachedWheel(
  modern: boolean,
  rng: () => number,
  parts: THREE.BufferGeometry[],
): void {
  const radius = (modern ? 0.34 : 0.29) + rng() * 0.12;
  const wheel = new THREE.CylinderGeometry(radius, radius, 0.18 + rng() * 0.10, 10, 1);
  const upright = rng() < 0.45;
  wheel.rotateZ(upright ? Math.PI / 2 + (rng() - 0.5) * 0.35 : (rng() - 0.5) * 0.22);
  wheel.rotateY(rng() * Math.PI);
  const angle = rng() * Math.PI * 2;
  const distance = 2.7 + rng() * 3.2;
  const x = Math.sin(angle) * distance;
  const z = Math.cos(angle) * distance;
  wheel.translate(x, upright ? radius : 0.12, z);
  appendColoredDebris(wheel, 'rubber', rng, parts);

  const hub = new THREE.CylinderGeometry(radius * 0.36, radius * 0.36, 0.205, 9, 1);
  hub.rotateZ(upright ? Math.PI / 2 + (rng() - 0.5) * 0.35 : 0);
  hub.rotateY(rng() * Math.PI);
  hub.translate(x, upright ? radius : 0.13, z);
  appendColoredDebris(hub, 'rust', rng, parts);
}

function appendArmorPanel(rng: () => number, parts: THREE.BufferGeometry[]): void {
  const width = 0.45 + rng() * 0.75;
  const depth = 0.28 + rng() * 0.58;
  const panel = new THREE.BoxGeometry(width, 0.045 + rng() * 0.045, depth);
  panel.rotateX((rng() - 0.5) * 0.45);
  panel.rotateY(rng() * Math.PI);
  panel.rotateZ((rng() - 0.5) * 0.32);
  const angle = rng() * Math.PI * 2;
  const distance = 2.0 + rng() * 4.0;
  panel.translate(
    Math.sin(angle) * distance,
    0.08 + rng() * 0.12,
    Math.cos(angle) * distance,
  );
  appendColoredDebris(panel, rng() < 0.35 ? 'rust' : 'char', rng, parts);
}

/**
 * Build lightweight local-space battlefield debris for a baked tank wreck:
 * torn track-pad runs, detached road wheels, armor panels and tow-cable scrap.
 * All pieces merge into the wreck mesh (zero extra draw calls / idle work).
 * The exact vehicle silhouette and any popped turret still come from
 * bakeTankWreck; these are the missing secondary destruction cues around it.
 *
 * @param {number} seed
 * @param {{modern?:boolean}} [opts]
 * @returns {{geo:THREE.BufferGeometry,tris:number}}
 */
export function bakeWreckDebris(
  seed: number,
  opts: { modern?: boolean } = {},
): { geo: THREE.BufferGeometry; tris: number } {
  const rng = mulberry32((seed ^ 0x71ac5eed) >>> 0);
  const modern = opts.modern !== false;
  const parts: THREE.BufferGeometry[] = [];

  // Two visibly torn track runs: irregular pads snake away from opposite hull
  // corners, with gaps and flipped shoes instead of intact ribbon geometry.
  for (const side of [-1, 1]) {
    appendTornTrackRun(side, modern, rng, parts);
  }

  // Detached road wheels: a mix of flat, leaning and nearly upright discs.
  const wheelCount = (modern ? 4 : 3) + ((rng() * 3) | 0);
  for (let i = 0; i < wheelCount; i++) {
    appendDetachedWheel(modern, rng, parts);
  }

  // Armor skirts, grilles and stowage panels thrown beyond the burn scar.
  const panelCount = 4 + ((rng() * 4) | 0);
  for (let i = 0; i < panelCount; i++) {
    appendArmorPanel(rng, parts);
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('wreck debris merge failed');
  const tris = (merged.attributes.position.count / 3) | 0;
  for (const g of parts) g.dispose();
  return { geo: merged, tris };
}
