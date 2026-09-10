import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import ts from 'typescript-compiler-api';
import { createHeightField } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { disposeObject3DResources, visitOwnedObject3DGeometries } from '../engine/resourceLifetime.ts';

// Immutable cd62def6e owners, not Git-dependent tests or reimplementations.
const oldWriter = `function writeBushSpray(
  buffers: BushSprayBuffers, offset: number,
  cx: number, cy: number, cz: number, width: number,
  pitch: number, yaw: number, roll: number, shiftX: number, shiftY: number, shade: number,
): void {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), ca = Math.cos(yaw), sa = Math.sin(yaw);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const rx = ca * cr + sa * sp * sr, ry = cp * sr, rz = -sa * cr + ca * sp * sr;
  const ux = -ca * sr + sa * sp * cr, uy = cp * cr, uz = sa * sr + ca * sp * cr;
  for (let v = 0; v < 6; v++) {
    // Same full-atlas winding as PlaneGeometry's [0,2,1, 2,3,1].
    const right = v === 2 || v === 4 || v === 5;
    const top = v === 0 || v === 2 || v === 5;
    const x = ((right ? 0.5 : -0.5) + shiftX) * width;
    const y = ((top ? 0.4 : -0.4) + shiftY) * width;
    const i = offset + v, p = i * 3;
    buffers.position[p] = cx + rx * x + ux * y;
    buffers.position[p + 1] = cy + ry * x + uy * y;
    buffers.position[p + 2] = cz + rz * x + uz * y;
    // Use the actual packed vertex, not one card-center normal. The positive
    // upward floor retains lateral form without the old downward black pole.
    let nx = buffers.position[p], ny = (buffers.position[p + 1] - 0.55) * 0.65;
    let nz = buffers.position[p + 2];
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; nz /= length; ny = Math.max(0.28, ny / length + 0.55);
    const inverse = 1 / Math.hypot(nx, ny, nz);
    buffers.normal[p] = nx * inverse;
    buffers.normal[p + 1] = ny * inverse;
    buffers.normal[p + 2] = nz * inverse;
    const value = shade * (0.88 + 0.18 * clamp((buffers.position[p + 1] + 0.1) / 1.6, 0, 1));
    buffers.color[p] = _c.r * 1.7 * value;
    buffers.color[p + 1] = _c.g * 1.7 * value;
    buffers.color[p + 2] = _c.b * 1.7 * value;
    buffers.uv[i * 2] = right ? 1 : 0; buffers.uv[i * 2 + 1] = top ? 1 : 0;
    buffers.flex[i] = 0.22;
  }
}`;
const oldBush = `function buildBushCards(rng: RandomSource, pal: VegetationPalette = {}): THREE.BufferGeometry {
  const hue0 = pal.cardHue ?? 0.24, sat0 = pal.cardSat ?? 0.26;
  const buffers: BushSprayBuffers = {
    position: new Float32Array(192 * 3), normal: new Float32Array(192 * 3),
    uv: new Float32Array(192 * 2), color: new Float32Array(192 * 3), flex: new Float32Array(192),
  };
  for (let i = 0; i < 16; i++) {
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = Math.pow(0.3 + 0.7 * rng(), 0.8);
    const w = 0.72 + rng() * 0.55;
    const pitchRoll = rng(), yawRoll = rng(), rollRoll = rng();
    const shadeRoll = rng(), hueRoll = rng(), satRoll = rng(); // Exact old11-draw/node stream.
    _c.setHSL(hue0 + (hueRoll - 0.5) * 0.055, sat0 * 0.85 + satRoll * 0.04, 0.5, THREE.SRGBColorSpace);
    const yaw = yawRoll * Math.PI * 2, pitch = (pitchRoll - 0.5) * 0.80;
    const roll = (rollRoll - 0.5) * 1.20;
    const shade = (0.60 + 0.30 * rad) * (0.94 + shadeRoll * 0.12);
    const cy = 0.55 + dy * rad * 0.42 + (0.5 - pitchRoll) * 0.12;
    // Both planes contain this shared branch anchor strictly inside their
    // rectangles. Opposite in-plane offsets make distinct overlapping sprays
    // without depending on nearby parallel sheets to intersect. Random nodes
    // fill the interior as well as the outer skirt, not a tangent shell/rings.
    writeBushSpray(buffers, i * 12,
      dx * rad * 0.96, cy, dz * rad * 0.96,
      w * 0.74, pitch, yaw + 0, roll, 0.14, 0.05, shade * 1);
    writeBushSpray(buffers, i * 12 + 6,
      dx * rad * 0.96, cy, dz * rad * 0.96,
      w * 0.68, -pitch * 0.65, yaw + (1.05 + (rollRoll - 0.5) * 0.30),
      -roll * 0.75, -0.12, -0.08, shade * 0.96);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(buffers.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(buffers.normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(buffers.uv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(buffers.color, 3));
  geometry.setAttribute('aFlex', new THREE.BufferAttribute(buffers.flex, 1));
  return geometry;
}`;
const sha = value => createHash('sha256').update(value).digest('hex');
assert.equal(sha(oldBush + '\n'), 'c7946cd90060669538438516cd4fb99ea7c2bc310947d3ede131ff3fb47cee11');
assert.equal(sha(oldWriter + '\n'), '148ad435d8f02143590523d0524538e2fbea6a190496457d91876db94f65a432');
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
  let code = href.endsWith('before') ? replaceOnce(source, owner('buildBushCards'), oldBush) : source;
  if (href.endsWith('before')) code = replaceOnce(code, owner('writeBushSpray'), oldWriter);
  code = replaceOnce(code, 'function buildBushCards(', 'function originalBushCards(');
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
    export function mulberry32(seed) {
      const next = originalMulberry32(seed), row = { seed, count:0, next }; auditRng.push(row);
      return () => { row.count++; return next(); };
    }` };
} });
let before, current;
try { before = await import(url.href + '?growth-before'); current = await import(url.href + '?growth-current'); }
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
function geometry(g, bush) {
  return { attributes: Object.fromEntries(Object.entries(g.attributes).map(([key, a]) =>
    [key, attribute(a, bush && ['position', 'normal', 'color', 'uv'].includes(key))])), index: attribute(g.index),
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
  visitOwnedObject3DGeometries(world.group, g => { ref(ids, g); geometries.push(geometry(g, bushes.includes(g))); });
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
  const a = current.buildBushCards(current.mulberry32(2032));
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
    const a = produce(before, id), b = produce(current, id);
    assert.deepEqual(b.exact, a.exact, id + ': all placement/cover/tree/grass/non-bush buffers and owner-sharing exact');
    assert.deepEqual(b.rng, a.rng, id + ': every complete-producer RNG stream count/tail exact');
    receipts.push({ id, exactProducerParity: true, rngStreams: a.rng.length, before: a.placed, current: b.placed });
    console.log(JSON.stringify(receipts.at(-1)));
  }
  negativeControls();
  for (const row of receipts.flatMap(r => r.current)) assertEnvelope(row.prototype);
  console.log('shrubGrowthPlacement: complete Autumn/Verdant producers exact outside two bush shapes; RNG, cover, placement and envelope negatives pass. Ground-gap rows are vertex/envelope diagnostics, not alpha-contact, art, overdraw or frame-cost acceptance.');
} finally { restore(); }
