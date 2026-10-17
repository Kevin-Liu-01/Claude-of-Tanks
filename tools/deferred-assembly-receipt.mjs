// The deferred-assembly parity receipt (2026-10-16): a suit or field net (TankBuilderPort.afterAssemble) is built in
// its own slices after the core checkpoint, and the build must be exactly the one that built it inside the core
// (TankFactoryOptions.assemblyInCore). One receipt covers a whole visual: every object in traversal order (its name,
// type, child order, pose, render flags, geometry bytes, materials, instance data and userData, timing keys aside) and
// the visual's presentation and contact fields. Shared by tools/deferred-assembly-parity.mjs (the fleet's suited ids)
// and src/vehicles/tankFactoryDeferredAssembly.selftest.mjs (npm test). No child processes, no writes.
import { createHash } from 'node:crypto';

/** The callers that build suited tanks: battle HIGH and LOW (roster construction), the Garage hero and the ledger. */
export const DEFERRED_ASSEMBLY_BUILDS = Object.freeze({
  battleHigh: Object.freeze({ camoSeed: 4242, quality: 'high', geometryQuality: 'high', batchStatic: true,
    battleDetailLod: true, eraVisualBindingReceipt: false }),
  battleLow: Object.freeze({ camoSeed: 4242, quality: 'high', geometryQuality: 'low', batchStatic: true,
    eraVisualBindingReceipt: false }),
  garage: Object.freeze({ camoSeed: 4200, quality: 'ai', staticPreview: true, batchStatic: true,
    eraVisualBindingReceipt: false }),
  // the fleet geometry ledger's own builds (tools/fleet-geometry-digest.mjs ledgerBuildOptions)
  ledgerHigh: Object.freeze({ proceduralOnly: true, camoSeed: 4242, geometryReceipt: true, batchStatic: false, quality: 'high' }),
  ledgerLow: Object.freeze({ proceduralOnly: true, camoSeed: 4242, geometryReceipt: true, batchStatic: false, quality: 'low' }),
});

const digest = (value) => createHash('sha256').update(value).digest('hex').slice(0, 20);
const bytes = (array) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
const TIMING = /Timing$|Ms$|StartedAt$|FinishedAt$|^decorCheckpointCount$/;

function attribute(value) {
  const array = value.isInterleavedBufferAttribute ? value.data.array : value.array;
  return [array.constructor.name, value.itemSize, value.normalized, value.count, digest(bytes(array))];
}
function pathOf(object) {
  const names = [];
  for (let node = object; node; node = node.parent) {
    names.push(`${node.name || node.type}#${node.parent ? node.parent.children.indexOf(node) : 0}`);
  }
  return names.reverse().join('/');
}
function stable(value, seen = new WeakSet(), depth = 0) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'function') return '[fn]';
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value !== 'object') return value;
  if (value.isObject3D) return `[obj ${pathOf(value)}]`;
  if (value.isMaterial) return `[mat ${value.type}:${value.name}]`;
  if (value.isBufferGeometry) return `[geo ${digest(JSON.stringify(Object.entries(value.attributes).map(([k, a]) => [k, attribute(a)])))}]`;
  if (value.isTexture) return `[tex ${value.name}]`;
  if (ArrayBuffer.isView(value)) return `[${value.constructor.name} ${digest(bytes(value))}]`;
  if (value.isMatrix4 || value.isMatrix3) return value.elements.slice();
  if (value.isVector2 || value.isVector3 || value.isVector4 || value.isQuaternion || value.isColor) return value.toArray();
  if (value.isBox3) return [value.min.toArray(), value.max.toArray()];
  if (seen.has(value)) return '[cycle]';
  if (depth > 12) return '[deep]';
  seen.add(value);
  if (value instanceof Map) return [...value.entries()].map(([k, v]) => [stable(k, seen, depth + 1), stable(v, seen, depth + 1)]);
  if (value instanceof Set) return [...value].map((v) => stable(v, seen, depth + 1));
  if (Array.isArray(value)) return value.map((v) => stable(v, seen, depth + 1));
  const out = {};
  for (const key of Object.keys(value).sort()) if (!TIMING.test(key)) out[key] = stable(value[key], seen, depth + 1);
  return out;
}
function material(value) {
  return stable({ name: value.name, type: value.type, color: value.color, emissive: value.emissive,
    emissiveIntensity: value.emissiveIntensity, roughness: value.roughness, metalness: value.metalness,
    opacity: value.opacity, transparent: value.transparent, side: value.side, alphaTest: value.alphaTest,
    depthWrite: value.depthWrite, depthTest: value.depthTest, colorWrite: value.colorWrite, vertexColors: value.vertexColors,
    flatShading: value.flatShading, polygonOffset: value.polygonOffset, polygonOffsetFactor: value.polygonOffsetFactor,
    polygonOffsetUnits: value.polygonOffsetUnits, visible: value.visible, defines: value.defines,
    key: value.customProgramCacheKey?.(), hooked: typeof value.onBeforeCompile === 'function', userData: value.userData,
    maps: ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'emissiveMap', 'aoMap', 'bumpMap']
      .map((key) => { const t = value[key]; return t ? [key, t.name, t.colorSpace, t.repeat.toArray(), t.offset.toArray(),
        t.wrapS, t.wrapT, t.image?.width ?? null, t.image?.height ?? null] : null; }) });
}

/** One visual's receipt: per-object row digests in traversal order, the top-level fields and their joint digest. */
export function deferredAssemblyReceipt(visual) {
  const rows = [];
  visual.root.updateMatrixWorld(true);
  visual.root.traverse((object) => {
    const row = { type: object.type, visible: object.visible,
      children: object.children.map((child) => `${child.name}:${child.type}`),
      matrix: object.matrix.elements.slice(), matrixWorld: object.matrixWorld.elements.slice(),
      layers: object.layers.mask, renderOrder: object.renderOrder, castShadow: object.castShadow,
      receiveShadow: object.receiveShadow, frustumCulled: object.frustumCulled, userData: stable(object.userData) };
    if (object.geometry) row.geometry = { attributes: Object.entries(object.geometry.attributes).map(([key, value]) => [key, attribute(value)]),
      index: object.geometry.index && attribute(object.geometry.index), groups: object.geometry.groups,
      drawRange: object.geometry.drawRange, userData: stable(object.geometry.userData) };
    if (object.material) row.material = (Array.isArray(object.material) ? object.material : [object.material]).map(material);
    if (object.instanceMatrix) row.instanceMatrix = attribute(object.instanceMatrix);
    if (object.instanceColor) row.instanceColor = attribute(object.instanceColor);
    if (object.isInstancedMesh) row.count = object.count;
    if (object.isLOD) row.lod = object.levels.map((level) => [level.distance, level.hysteresis, pathOf(level.object)]);
    rows.push([pathOf(object), digest(JSON.stringify(row))]);
  });
  const top = stable({ dims: visual.dims, boundingRadiusM: visual.boundingRadiusM, presentationAnchor: visual.presentationAnchor,
    assetPresentationAnchor: visual.assetPresentationAnchor, presentationFloorYM: visual.presentationFloorYM,
    presentationTrackFloorYM: visual.presentationTrackFloorYM, contactGeom: visual.contactGeom ?? null });
  return { rows, top, digest: digest(JSON.stringify([rows, top])) };
}

/** The objects whose rows differ between two receipts (path lists), for a failure message. */
export function deferredAssemblyDifference(a, b) {
  const rowsA = new Map(a.rows), rowsB = new Map(b.rows);
  return {
    changed: [...rowsA].filter(([path, hash]) => rowsB.has(path) && rowsB.get(path) !== hash).map(([path]) => path),
    onlyA: [...rowsA.keys()].filter((path) => !rowsB.has(path)),
    onlyB: [...rowsB.keys()].filter((path) => !rowsA.has(path)),
    top: JSON.stringify(a.top) === JSON.stringify(b.top),
  };
}

/** Drain a stepped build, timing each slice (ms): the visual and its slice lengths. */
export function drainTimedSteps(steps, now = () => performance.now()) {
  const slices = [];
  for (;;) {
    const startedAt = now();
    const result = steps.next();
    slices.push(now() - startedAt);
    if (result.done) return { visual: result.value, slices };
  }
}
