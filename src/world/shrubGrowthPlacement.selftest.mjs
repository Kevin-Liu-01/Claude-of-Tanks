import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import ts from 'typescript-compiler-api';
import { createHeightField } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { disposeObject3DResources, visitOwnedObject3DGeometries } from '../engine/resourceLifetime.ts';

// 2026-10-01 (frozen pins retired): the receipt used to embed the cd62def6e bush card owners (sha256-pinned), swap them
// into a "before" producer and require the complete Autumn/Verdant vegetation build to match it outside the two bush
// shapes. That replayed history. The current producer is held to the live bush contracts: every populated bush
// instance links to its unchanged cover disc, the prototype stays a grounded three-dimensional envelope inside the
// cover radius, the fade/LOD streams are inert, and the envelope gate bites on flattened and raised negatives.
// p2 trees lane (2026-10-02): the desktop bushes grow from their species' sprays (buildGrownShrub); the audit takes
// either producer's two bush shapes, and the envelope gate holds the grown shape and the round-8 cards alike.
const sha = value => createHash('sha256').update(value).digest('hex');
const url = new URL('./vegetation.ts', import.meta.url), source = readFileSync(url, 'utf8');
const ast = ts.createSourceFile('vegetation.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function owner(name) {
  const nodes = ast.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.equal(nodes.length, 1, name + ': unique actual owner'); return nodes[0].getText(ast);
}
function replaceOnce(code, from, to) {
  assert.equal(code.split(from).length, 2, 'unique source seam'); return code.replace(from, to);
}
const hook = registerHooks({ load(href, context, next) {
  const result = next(href, context);
  if (!href.startsWith(url.href + '?growth-')) return result;
  assert.equal(result.source.toString(), source, 'load the complete actual producer');
  let code = replaceOnce(source, 'function buildBushCards(', 'function originalBushCards(');
  code = replaceOnce(code, 'function buildGrownShrub(', 'function originalGrownShrub(');
  code = replaceOnce(code, 'export function mulberry32(', 'function originalMulberry32(');
  return { ...result, source: code + `
    let auditBushes = [], auditRng = [];
    export function resetGrowthAudit() { auditBushes = []; auditRng = []; }
    export function takeGrowthAudit() {
      return { bushes: auditBushes, rng: auditRng.map(r => ({ seed:r.seed, count:r.count, tail:[r.next(),r.next()] })) };
    }
    export function buildBushCards(rng, palette) {
      const g = originalBushCards(rng, palette); auditBushes.push(g); return g;
    }
    export function buildGrownShrub(kind, rng, palette, species) {
      const g = originalGrownShrub(kind, rng, palette, species); if (kind === 'bush') auditBushes.push(g); return g;
    }
    export function mulberry32(seed) {
      const next = originalMulberry32(seed), row = { seed, count:0, next }; auditRng.push(row);
      return () => { row.count++; return next(); };
    }` };
} });
let current;
try { current = await import(url.href + '?growth-current'); }
finally { hook.deregister(); }

// Canvas pigment only is synthetic. All painter calls/RNG, geometry, complete
// synchronous grass/tree/bush construction and placement are the real producer.
function canvasFixture() {
  const saved = new Map(['document', 'ImageData'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  class ImageData { constructor(data, width, height) {
    this.data = typeof data === 'number' ? new Uint8ClampedArray(data * width * 4) : data;
    this.width = typeof data === 'number' ? data : width;
    this.height = typeof data === 'number' ? width : height;
  } }
  globalThis.ImageData = ImageData;
  globalThis.document = { createElement(tag) {
    assert.equal(tag, 'canvas'); const canvas = { width: 0, height: 0 };
    const context = new Proxy({
      createImageData: (w, h) => new ImageData(new Uint8ClampedArray(w * h * 4), w, h),
      getImageData: (_x, _y, w, h) => new ImageData(new Uint8ClampedArray(w * h * 4).fill(128), w, h),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
    canvas.getContext = () => context; return canvas;
  } };
  return () => { for (const [k, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  } };
}
function attribute(a, omitContents = false) {
  if (!a) return null;
  return { type: a.array.constructor.name, bytes: a.array.byteLength, itemSize: a.itemSize, count: a.count,
    normalized: a.normalized, usage: a.usage, meshPerAttribute: a.meshPerAttribute ?? null,
    hash: omitContents ? 'changed-bush-shape' : sha(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength)) };
}
function geometry(g, bush, understorey = false) {
  // round 77: the understorey shrub's five streams all come from the swapped writer (its flex too)
  const omitted = understorey ? ['position', 'normal', 'color', 'uv', 'aFlex'] : ['position', 'normal', 'color', 'uv'];
  return { attributes: Object.fromEntries(Object.entries(g.attributes).map(([key, a]) =>
    [key, attribute(a, bush && omitted.includes(key))])), index: attribute(g.index),
  groups: g.groups, drawRange: g.drawRange, box: bush ? null : g.boundingBox, sphere: bush ? null : g.boundingSphere };
}
const ref = (map, object) => { if (!object) return null; if (!map.has(object)) map.set(object, map.size); return map.get(object); };
function material(m, textures) {
  const settings = ['type', 'side', 'alphaTest', 'transparent', 'opacity', 'depthWrite', 'depthTest',
    'roughness', 'metalness', 'vertexColors', 'toneMapped', 'alphaToCoverage', 'blending'];
  return { ...Object.fromEntries(settings.map(k => [k, m[k]])), color: m.color?.toArray(),
    key: m.customProgramCacheKey(), map: ref(textures, m.map), alphaMap: ref(textures, m.alphaMap) };
}
function snapshot(world, bushes) {
  const ids = new Map(), mats = new Map(), textures = new Map(), geometries = [], meshes = [];
  // Rebuild comparison: every geometry stream, the bush and understorey shapes included.
  visitOwnedObject3DGeometries(world.group, g => { ref(ids, g); geometries.push(geometry(g, false)); });
  world.group.traverse(m => {
    if (!m.isMesh) return;
    assert.ok(!Array.isArray(m.material), 'actual vegetation uses one material per mesh');
    meshes.push({ name: m.name, geometry: ids.get(m.geometry), material: ref(mats, m.material),
      depth: ref(mats, m.customDepthMaterial), count: m.count, visible: m.visible, cast: m.castShadow,
      receive: m.receiveShadow, matrixAuto: m.matrixAutoUpdate, matrix: m.matrix.toArray(),
      instances: attribute(m.instanceMatrix), colors: attribute(m.instanceColor) });
  });
  const materials = [...mats.keys()].map(m => material(m, textures));
  const maps = [...textures.keys()].map(t => ({ width: t.image.width, height: t.image.height, colorSpace: t.colorSpace,
    minFilter: t.minFilter, magFilter: t.magFilter, wrapS: t.wrapS, wrapT: t.wrapT, mipmaps: t.mipmaps.length,
    generateMipmaps: t.generateMipmaps, premultiplyAlpha: t.premultiplyAlpha, flipY: t.flipY }));
  return structuredClone({ geometries, meshes, materials, maps, treeObstacles: world.treeObstacles,
    concealers: world.concealers, clusters: world._clusters });
}
function envelope(g) {
  const p = g.attributes.position, box = new THREE.Box3().setFromBufferAttribute(p);
  return { minY: box.min.y, maxY: box.max.y, span: box.getSize(new THREE.Vector3()).toArray(),
    maxRadius: Math.max(...Array.from({ length: p.count }, (_, i) => Math.hypot(p.getX(i), p.getZ(i)))) };
}
function assertEnvelope(r) {
  assert.ok(r.minY >= -.25 && r.minY <= 0, 'ground envelope reaches the authored base without a buried skirt');
  assert.ok(r.span.every(v => v > .8) && r.span[1] < 2.3, 'three-dimensional envelope, not a pancake');
  assert.ok(r.maxRadius <= 2, 'geometry stays inside the unchanged concealment-disc radius');
}
function placedBushes(world, bushes, field) {
  const rows = [], matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  world.group.traverse(mesh => {
    const variant = bushes.indexOf(mesh.geometry); if (variant < 0) return;
    const p = mesh.geometry.attributes.position, gaps = [], flatGaps = [];
    const minY = envelope(mesh.geometry).minY;
    for (let slot = 0; slot < mesh.count; slot++) {
      mesh.getMatrixAt(slot, matrix); const e = matrix.elements;
      const disc = world.concealers.find(d => Math.abs(d.x - e[12]) < 5e-5 && Math.abs(d.z - e[14]) < 5e-5 && d.add === .35);
      assert.ok(disc && Math.abs(disc.r - 2 * Math.hypot(e[0], e[2])) < 2e-5, 'actual bush instance links to unchanged cover disc');
      let gap = Infinity;
      for (let i = 0; i < p.count; i++) {
        point.fromBufferAttribute(p, i).applyMatrix4(matrix);
        gap = Math.min(gap, point.y - field.getHeightAt(point.x, point.z));
      }
      gaps.push(gap); flatGaps.push(e[13] + minY * e[5] - field.getHeightAt(e[12], e[14]));
    }
    for (const key of ['aFadeI', 'aLodF']) assert.ok(mesh.geometry.attributes[key].array.every(v => v === 0));
    rows.push({ variant, count: mesh.count, prototype: envelope(mesh.geometry),
      flatReferenceGap: [Math.min(...flatGaps), Math.max(...flatGaps)],
      lowestVertexTerrainGap: [Math.min(...gaps), Math.max(...gaps)], allVerticesAboveBed: gaps.filter(v => v > 0).length });
  });
  assert.equal(rows.length, 2, 'both actual populated bush variants'); return rows;
}
function produce(module, id) {
  module.resetGrowthAudit();
  const cfg = getMapConfig(id), field = createHeightField(1337, cfg);
  const world = module.createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
  try {
    const audit = module.takeGrowthAudit(); assert.equal(audit.bushes.length, 2);
    return { exact: snapshot(world, audit.bushes), rng: audit.rng, placed: placedBushes(world, audit.bushes, field) };
  } finally { world.dispose(); disposeObject3DResources(world.group); module.resetGrowthAudit(); }
}
function negativeControls() {
  for (const make of [() => current.buildBushCards(current.mulberry32(2032)),
    () => current.buildGrownShrub('bush', current.mulberry32(2032), {}, 'oak')]) negativeControl(make());
}
function negativeControl(a) {
  try {
    assertEnvelope(envelope(a));
    const flat = a.clone(), raised = a.clone();
    try {
      flat.scale(1, .01, 1); assert.throws(() => assertEnvelope(envelope(flat)), /pancake/);
      raised.translate(0, .5, 0); assert.throws(() => assertEnvelope(envelope(raised)), /ground envelope/);
    } finally { flat.dispose(); raised.dispose(); }
  } finally { a.dispose(); current.resetGrowthAudit(); }
}
const restore = canvasFixture(), receipts = [];
try {
  for (const id of ['autumn', 'verdant']) {
    const b = produce(current, id), again = produce(current, id);
    assert.deepEqual(again.exact, b.exact, id + ': a rebuild reproduces every placement/cover/tree/grass buffer and owner-sharing');
    assert.deepEqual(again.rng, b.rng, id + ': a rebuild reproduces every complete-producer RNG stream count/tail');
    receipts.push({ id, rngStreams: b.rng.length, current: b.placed });
    console.log(JSON.stringify(receipts.at(-1)));
  }
  negativeControls();
  for (const row of receipts.flatMap(r => r.current)) assertEnvelope(row.prototype);
  console.log('shrubGrowthPlacement: complete Autumn/Verdant producers deterministic; cover links, placement and envelope negatives pass. Ground-gap rows are vertex/envelope diagnostics, not alpha-contact, art, overdraw or frame-cost acceptance.');
} finally { restore(); }
