import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const propsUrl = new URL('./props.ts', import.meta.url);
const source = readFileSync(propsUrl, 'utf8');
const foldStart = source.indexOf('  // Delta uses two resident procedural plaster families.');
const foldEnd = source.indexOf('  // --- merge buckets into one mesh per material ---', foldStart);
assert.ok(foldStart > source.indexOf('  dressMapExtras({') && foldEnd > foldStart,
  'the production palette fold runs after all geometry/UV/collision authoring');
const foldSource = source.slice(foldStart, foldEnd);
const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);

function installFixtureCanvas() {
  globalThis.ImageData = class { constructor(data) { this.data = data; } };
  globalThis.Image = class {
    width = 8; height = 8;
    set src(_value) { queueMicrotask(() => this.onload?.()); }
  };
  globalThis.document = {
    createElement() {
      const canvas = { width: 0, height: 0 };
      const context = new Proxy({
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
      }, { get: (target, key) => target[key] ?? (() => {}) });
      canvas.getContext = () => context;
      return canvas;
    },
  };
}

function recordGeometry(mesh) {
  return {
    name: mesh.name, material: mesh.material.customProgramCacheKey(), visible: mesh.visible,
    count: mesh.count, vertexColors: mesh.material.vertexColors,
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key, attr]) =>
      [key, { itemSize: attr.itemSize, normalized: attr.normalized, hash: hash(bytes(attr.array)) }])),
    index: mesh.geometry.index && hash(bytes(mesh.geometry.index.array)),
    matrix: mesh.matrix.elements,
    instances: mesh.instanceMatrix && hash(bytes(mesh.instanceMatrix.array)),
    colors: mesh.instanceColor && hash(bytes(mesh.instanceColor.array)),
  };
}

function recordProps(props) {
  const meshes = [], materials = new Set(), textures = new Set();
  props.group.traverse(object => {
    if (!object.isMesh) return;
    meshes.push(object);
    if (!object.visible) return;
    materials.add(object.material);
    for (const value of Object.values(object.material)) if (value?.isTexture) textures.add(value);
  });
  const facadeKeys = ['world-props-plaster2-v6', 'world-props-plaster3-v6'];
  const facades = facadeKeys.flatMap(key => meshes.filter(mesh => mesh.material.customProgramCacheKey() === key));
  assert.ok(facades.length && facades.every(mesh => mesh.geometry.index === null));
  const facadeAttributes = Object.fromEntries(Object.keys(facades[0].geometry.attributes).map(key =>
    [key, hash(Buffer.concat(facades.map(mesh => bytes(mesh.geometry.attributes[key].array))))]));
  const physicalKeys = ['obstacles', 'colliders', 'crushables', 'destructibles', 'looseRecords',
    'tankWreckSpots', 'utilityNetwork', 'utilityPolePlacements', 'decorationGroundingReceipts', 'features'];
  return {
    materials: materials.size, textures: textures.size,
    facadeKeys: facades.map(mesh => mesh.material.customProgramCacheKey()),
    facadeAttributes, facadeVertexColors: facades.map(mesh => mesh.material.vertexColors),
    otherMeshes: meshes.filter(mesh => !facades.includes(mesh)).map(recordGeometry),
    physical: Object.fromEntries(physicalKeys.map(key => [key, hash(JSON.stringify(props[key]))])),
    rng: globalThis.__paletteRng.map(row => ({ seed: row.seed, count: row.count, last: row.last,
      next: [row.next(), row.next(), row.next()] })),
  };
}

async function runFixture(control) {
  // Same real builder twice in fresh Node processes. Only the three-line
  // palette fold is omitted in the control; the atlas canvas is a test stub,
  // not a claim about native rasterization or final authored lighting.
  globalThis.__paletteRng = [];
  registerHooks({ load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url !== propsUrl.href) return result;
    let text = result.source.toString();
    if (control) text = text.replace(foldSource, '');
    text = text.replace('export function mulberry32(a: number): Rng', 'function recordedMulberry32(a: number): Rng');
    text += `\nexport function mulberry32(seed: number): Rng {
      const next = recordedMulberry32(seed), row = { seed, count: 0, last: null, next };
      globalThis.__paletteRng.push(row);
      return () => { row.count++; return row.last = next(); };
    }\n`;
    return { ...result, source: text };
  } });
  const { createProps, preloadPropModels } = await import('./props.ts');
  const { createHeightField } = await import('./terrain.ts');
  const { getMapConfig } = await import('./maps/index.ts');
  const { ensureTankBuilder } = await import('../vehicles/fleetFactory.ts');
  const { wreckPool } = await import('./wrecks.ts');
  globalThis.fetch = async url => new Response(readFileSync(url));
  await preloadPropModels();
  await Promise.all(wreckPool('modern').map(id => ensureTankBuilder(id)));
  installFixtureCanvas();
  const config = getMapConfig('delta');
  const props = createProps(createHeightField(1337, config), {
    anisotropy: 4, setupShadowMaterial() {},
  }, 2002, config);
  await props.sourcedTexturesReady;
  process.stdout.write(JSON.stringify(recordProps(props)));
}

if (process.argv[2] === '--fixture') {
  await runFixture(process.argv[3] === 'control');
} else {
  const { MAP_IDS } = await import('./maps/index.ts');
  const fold = new Function('mapId', 'buckets', stripTypeScriptTypes(foldSource));
  for (const mapId of MAP_IDS) {
    const pieces = [{ id: 0 }, { id: 1 }, { id: 2 }];
    const buckets = { plaster: [pieces[0]], plaster2: [pieces[1]], plaster3: [pieces[2]] };
    const arrays = Object.values(buckets);
    fold(mapId, buckets);
    assert.deepEqual(Object.values(buckets), mapId === 'delta'
      ? [[pieces[0]], [pieces[1], pieces[2]], []] : [[pieces[0]], [pieces[1]], [pieces[2]]]);
    Object.values(buckets).forEach((array, index) => assert.equal(array, arrays[index],
      `${mapId}: palette fold does not replace geometry or bucket identities`));
  }
  const build = control => {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--fixture', control],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(child.status, 0, child.stderr || String(child.error));
    return JSON.parse(child.stdout);
  };
  const control = build('control'), folded = build('folded');
  assert.deepEqual(control.facadeKeys, ['world-props-plaster2-v6', 'world-props-plaster3-v6']);
  assert.deepEqual(folded.facadeKeys, ['world-props-plaster2-v6'], 'Delta uses its two original plaster families');
  assert.deepEqual(control.facadeVertexColors, [false, false]);
  assert.deepEqual(folded.facadeVertexColors, [false], 'no new color attribute or shader variant');
  assert.deepEqual(folded.facadeAttributes, control.facadeAttributes,
    'every folded position/normal/UV/UV1 byte is preserved in original order');
  assert.deepEqual(folded.otherMeshes, control.otherMeshes, 'all other geometry and instance records remain exact');
  assert.deepEqual(folded.physical, control.physical, 'all collision, destruction, grounding and feature records are exact');
  assert.ok(control.rng.length > 5 && control.rng.some(row => row.count > 1000));
  assert.deepEqual(folded.rng, control.rng, 'every production RNG stream and subsequent draws are unchanged');
  assert.equal(control.materials, 21); assert.equal(folded.materials, 20);
  assert.equal(control.textures, 35); assert.equal(folded.textures, 32);
  console.log('deltaPlasterPalette.selftest: actual production arrays/physics/RNG preserved; Delta reuses two plaster families; other29 maps unchanged');
}
