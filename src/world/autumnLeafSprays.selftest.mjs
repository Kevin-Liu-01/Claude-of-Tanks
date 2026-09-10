import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import * as THREE from 'three';
import ts from 'typescript-compiler-api';
import { MAP_IDS, getMapConfig } from './maps/index.ts';

// Actual complete-module registry/geometry and Native Canvas, not a full world,
// GPU mip readback, collision/placement replay or performance/art acceptance.
const { values } = parseArgs({ options: { out: { type: 'string' } } });
const url = new URL('./vegetation.ts', import.meta.url), source = readFileSync(url, 'utf8');
const tree = ts.createSourceFile('vegetation.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function find(predicate, name) {
  const nodes = [];
  function visit(node) { if (predicate(node)) nodes.push(node); node.forEachChild(visit); }
  visit(tree); assert.equal(nodes.length, 1, `one actual ${name}`); return nodes[0];
}
const fn = name => find(n => ts.isFunctionDeclaration(n) && n.name?.text === name, name).getText(tree);
const variable = name => find(n => ts.isVariableDeclaration(n) && n.name.getText(tree) === name, name).initializer.getText(tree);
const start = source.indexOf('  const OAK_SHAPES:'), end = source.indexOf('  const foliageTex =', start);
assert.ok(start > 0 && end > start, 'actual species registry boundaries');
const rngSource = fn('mulberry32');
const observed = source.replace(rngSource, rngSource.replace('function mulberry32(', 'function leafRandomCore(')) + `
  const leafStreams = [];
  export function mulberry32(seed) {
    const next = leafRandomCore(seed), row = {seed, calls:0, next}; leafStreams.push(row);
    return () => {row.calls++; return next();};
  }
  export function takeLeafStreams() { return leafStreams.splice(0).map(({seed,calls,next}) => ({seed,calls,tail:[next(),next(),next()]})); }
  export function leafLibrary(input) {
    const seed = 2001, cfg = {vegetation:input}, veg = ${variable('veg')};
    ${source.slice(start, end)}
    function materials() {
      const foliageTex = {}, foliageMats = {}, foliageDepthMats = {}, foliageWindHook = () => {};
      const engineCtx = {setupShadowMaterial() {}};
      ${fn('createFoliageMaterials')}
      for (const step of createFoliageMaterials()) void step;
      return {foliageTex, foliageMats, foliageDepthMats};
    }
    return {SPECIES, palOf, speciesList, materials};
  }
  export {buildDetailedGarageTree};
`;
const observedUrl = url.href + '?leaf-sprays';
const hook = registerHooks({ load(href, context, next) {
  const result = next(href, context);
  if (href !== observedUrl) return result;
  assert.equal(String(result.source), source, 'source stable during import');
  return {...result, source: observed};
} });
let api;
try { api = await import(observedUrl); } finally { hook.deregister(); }
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const hash = array => createHash('sha256').update(bytes(array)).digest('hex');
const autumn = getMapConfig('autumn'), optIns = [];
for (const id of MAP_IDS) for (const [species, palette] of Object.entries(getMapConfig(id).vegetation.palettes ?? {})) {
  if (palette.birchLeaves !== undefined) { assert.equal(palette.birchLeaves, true); optIns.push(`${id}/${species}`); }
}
assert.deepEqual(optIns.sort(), ['autumn/aspen', 'autumn/birch'], 'exact map/species opt-in scope');
const originalInput = {...autumn.vegetation, palettes: Object.fromEntries(Object.entries(autumn.vegetation.palettes)
  .map(([species, palette]) => [species, {...palette, birchLeaves: false}]))};
const libraries = [api.leafLibrary(originalInput), api.leafLibrary(autumn.vegetation)];
const textureKeys = ['colorSpace','anisotropy','wrapS','wrapT','minFilter','magFilter','format','type','generateMipmaps','premultiplyAlpha','flipY'];
function textureContract(texture, old) {
  assert.ok(texture.image instanceof ImageData, 'actual native straight-alpha ImageData');
  assert.deepEqual([texture.image.width, texture.image.height, texture.image.data.byteLength], [256,256,262144]);
  assert.strictEqual(texture.source.data, texture.image, 'one retained pixel source');
  assert.equal(texture.version, 1); assert.deepEqual(texture.mipmaps, []);
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace); assert.equal(texture.generateMipmaps, true);
  for (const key of textureKeys) assert.equal(texture[key], old[key], key);
}
function paint(make, seed, palette) {
  api.takeLeafStreams(); // Discard previous observations before creating this exact seeded stream.
  const next = api.mulberry32(seed);
  let calls = 0;
  const texture = make(() => { calls++; return next(); }, palette);
  return {texture, calls, tail:[next(),next(),next()]};
}
function identicalPaint(a, b) {
  textureContract(b.texture, a.texture);
  assert.deepEqual(b.texture.image.data, a.texture.image.data, 'exact opt-out RGBA');
  assert.deepEqual([b.calls,b.tail], [a.calls,a.tail], 'exact painter RNG calls/tail');
}
function geometryContract(a, b) {
  assert.deepEqual(Object.keys(b.attributes), Object.keys(a.attributes));
  for (const [name, attr] of Object.entries(a.attributes)) {
    const next = b.attributes[name];
    assert.deepEqual([next.count,next.itemSize,next.normalized,next.array.constructor,next.array.byteLength],
      [attr.count,attr.itemSize,attr.normalized,attr.array.constructor,attr.array.byteLength]);
    assert.ok(bytes(next.array).equals(bytes(attr.array)), `exact ${name}`);
  }
  assert.deepEqual(b.index?.array, a.index?.array); assert.deepEqual(b.groups,a.groups); assert.deepEqual(b.drawRange,a.drawRange);
  a.computeBoundingBox(); b.computeBoundingBox(); a.computeBoundingSphere(); b.computeBoundingSphere();
  assert.deepEqual(b.boundingBox,a.boundingBox); assert.deepEqual(b.boundingSphere,a.boundingSphere);
}
function compareGeometry(build) {
  api.takeLeafStreams(); const a = build(libraries[0]), before = api.takeLeafStreams();
  const b = build(libraries[1]), after = api.takeLeafStreams();
  try {
    assert.deepEqual(after,before,'geometry construction RNG unchanged');
    for (const name of Object.keys(a)) geometryContract(a[name],b[name]);
    const g = b.cards ?? b.canopy; g.attributes.position.array[0] += .25;
    assert.throws(() => geometryContract(a.cards ?? a.canopy,g), /exact position/, 'position mutation rejected');
  } finally { for (const g of [...Object.values(a),...Object.values(b)]) g.dispose(); }
}
function mipRows(pixels) {
  let alpha = Float64Array.from({length:pixels.data.length / 4}, (_,i) => pixels.data[i*4+3] / 255), size = 256;
  const rows = [];
  while (size >= 16) {
    rows.push({size, meanAlpha:alpha.reduce((a,b)=>a+b,0)/alpha.length,
      covered:alpha.filter(a=>a>=.38).length, holes:alpha.filter(a=>a<.38).length});
    const half = size / 2, small = new Float64Array(half*half);
    for (let y=0;y<half;y++) for (let x=0;x<half;x++) {
      const i=y*2*size+x*2; small[y*half+x]=(alpha[i]+alpha[i+1]+alpha[i+size]+alpha[i+size+1])/4;
    }
    alpha=small; size=half;
  }
  return rows;
}
function leafDifference(old, current) {
  assert.notEqual(hash(current.data),hash(old.data),'leaf form differs from bare twig');
  for (const row of mipRows(current)) {
    assert.ok(row.covered>0 && row.holes>0, 'nonempty permeable leaf raster through16px');
    // Deliberate fill envelope around the observed9.9–14.6% seeded rasters.
    // Cutoff coverage of box-averaged alpha is not a GPU/overdraw certificate.
    const fill = row.covered / (row.size * row.size);
    assert.ok(fill >= .06 && fill <= .18, `${row.size}px: leaf fill outside6%–18% envelope (${fill})`);
  }
}
function saveRasters(name, pixels) {
  if (!values.out) return;
  const full = createCanvas(256,256); full.getContext('2d').putImageData(pixels,0,0);
  for (const size of [256,64,16]) {
    const canvas=createCanvas(size,size); canvas.getContext('2d').drawImage(full,0,0,size,size);
    writeFileSync(join(values.out,`${name}-${size}.png`),canvas.toBuffer('image/png'));
  }
}
const priorDocument=globalThis.document, rows=[], failures=[];
globalThis.document={createElement(tag){assert.equal(tag,'canvas');return createCanvas(1,1);}};
if (values.out) mkdirSync(values.out,{recursive:true});
try {
  for (const id of MAP_IDS.filter(id=>id!=='autumn')) {
    const lib=api.leafLibrary(getMapConfig(id).vegetation);
    for (const species of ['birch','aspen']) {
      const palette=lib.palOf(species), seed=2001+lib.SPECIES[species].texSeed;
      const a=paint((r,p)=>api.makeTwigTexture(r,p.texTone||null),seed,palette);
      const b=paint((r,p)=>lib.SPECIES[species].tex(r,p),seed,palette);
      try { identicalPaint(a,b); } finally {a.texture.dispose();b.texture.dispose();}
    }
  }
  for (const species of ['birch','aspen']) for (const seed of [0,1,1337,2055,2065,7719]) {
    const palette=autumn.vegetation.palettes[species];
    const a=paint(api.makeBirchFoliageTexture,seed,{...palette,birchLeaves:false});
    const b=paint(api.makeBirchFoliageTexture,seed,palette);
    const repeat=paint((r,p)=>api.makeBirchLeafTexture(r,p.texTone||null),seed,palette);
    try {
      saveRasters(`${species}-${seed}-before`,a.texture.image); saveRasters(`${species}-${seed}-candidate`,b.texture.image);
      rows.push({species,seed,before:mipRows(a.texture.image),candidate:mipRows(b.texture.image),
        beforeSHA:hash(a.texture.image.data),candidateSHA:hash(b.texture.image.data),calls:[a.calls,b.calls],tail:[a.tail,b.tail]});
      textureContract(b.texture,a.texture); identicalPaint(b,repeat); leafDifference(a.texture.image,b.texture.image);
      assert.throws(()=>leafDifference(a.texture.image,a.texture.image),/differs/,'old twig routing rejected');
      const empty=new ImageData(new Uint8ClampedArray(262144),256,256);
      assert.throws(()=>leafDifference(a.texture.image,empty),/nonempty/,'empty leaf erasure rejected');
      const solid=new ImageData(new Uint8ClampedArray(262144).fill(255),256,256);
      assert.throws(()=>leafDifference(a.texture.image,solid),/permeable/,'solid card rejected');
      const dense=new ImageData(new Uint8ClampedArray(262144).fill(255),256,256);
      for(let y=0;y<256;y++)for(let x=0;x<32;x++)dense.data[(y*256+x)*4+3]=0;
      assert.ok(mipRows(dense).every(row=>row.covered>0&&row.holes>0), '87.5%-filled control passes the old nonempty/permeable guard');
      assert.throws(()=>leafDifference(a.texture.image,dense),/fill outside/, 'near-solid card with persistent holes rejected');
    } catch(error) {failures.push(new Error(`${species}/${seed}: ${error.message}`,{cause:error}));}
    finally {a.texture.dispose();b.texture.dispose();repeat.texture.dispose();}
  }
  for (const species of libraries[0].speciesList) {
    for (let k=0;k<3;k++) compareGeometry(lib=>lib.SPECIES[species].near(k,lib.palOf(species)));
    for (let k=0;k<2;k++) compareGeometry(lib=>lib.SPECIES[species].far(api.mulberry32(2001+lib.SPECIES[species].farSeed+k*101),lib.palOf(species),k));
  }
  for (const species of ['birch','aspen']) {
    const builds=libraries.map(lib=>api.buildDetailedGarageTree(species,2001,0,lib.palOf(species)));
    try {
      geometryContract(builds[0].trunk,builds[1].trunk); geometryContract(builds[0].foliage,builds[1].foliage);
      leafDifference(builds[0].foliageTexture.image,builds[1].foliageTexture.image);
    } finally {for (const b of builds) {b.trunk.dispose();b.foliage.dispose();b.foliageTexture.dispose();}}
  }
  const materials=libraries.map(lib=>lib.materials());
  try {
    for (const owner of materials) for (const bucket of Object.values(owner)) assert.equal(new Set(Object.values(bucket)).size,4,'four existing species owners');
    for (const species of libraries[0].speciesList) {
      const [a,b]=materials.map(m=>m.foliageTex[species]);
      if (['birch','aspen'].includes(species)) {textureContract(b,a);leafDifference(a.image,b.image);}
      else assert.deepEqual(b.image.data,a.image.data,'other species atlas exact');
      for (const bucket of ['foliageMats','foliageDepthMats']) {
        const [m,n]=materials.map(o=>o[bucket][species]);
        assert.strictEqual(m.map,a);assert.strictEqual(n.map,b);assert.equal(n.type,m.type);
        for (const key of ['alphaTest','alphaToCoverage','side','transparent','depthWrite','vertexColors','roughness','metalness','envMapIntensity','depthPacking']) assert.equal(n[key],m[key],key);
        assert.equal(n.alphaTest,.38);assert.equal(n.customProgramCacheKey(),m.customProgramCacheKey());
      }
    }
  } finally {for(const owner of materials)for(const bucket of Object.values(owner))for(const resource of Object.values(bucket))resource.dispose();}
} finally {
  if(priorDocument===undefined)delete globalThis.document;else globalThis.document=priorDocument;
  const receipt={rows,failures:failures.map(e=>e.message),scope:'29 map opt-outs;12 target Canvas pairs; actual near/far/Garage geometry and material registry. Box-averaged alpha/Canvas PNGs are not GPU mips; increased coverage is not zero-overdraw proof. No world placement replay or timing.'};
  if(values.out)writeFileSync(join(values.out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
}
if(failures.length)throw new AggregateError(failures,'Autumn leaf raster contract failed');
