import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import * as THREE from 'three';
import {
  acquireSharedTextureLease, applyCamoPatterns, applyCamoPatternsChunked,
  createTankMaterials, discardPrebakedSharedTextures, prebakeSharedTextures,
  resolveMultiplayerCamoPattern, setCamoBiome, setCamoOverride,
} from './materials.ts';
import { networkCamoId } from './camoPolicy.ts';

// Actual small CPU painters, Three textures/materials and production cache.
// This is ownership/pixel parity coverage, not a WebGL performance receipt.
const require = createRequire(import.meta.url);
const canvasEntry = process.env.COT_TEST_CANVAS_MODULE || require.resolve('@napi-rs/canvas');
assert.ok(isAbsolute(canvasEntry), 'optional canvas runtime override must be an absolute module path');
const canvasManifest = JSON.parse(readFileSync(join(dirname(canvasEntry), 'package.json'), 'utf8'));
assert.equal(canvasManifest.name, '@napi-rs/canvas');
assert.equal(canvasManifest.version, require('../../package.json').devDependencies['@napi-rs/canvas']);
const { createCanvas, Path2D } = require(canvasEntry);
const globals = ['document', 'Path2D'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
let canvases = 0;
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement(tag) { assert.equal(tag, 'canvas'); canvases++; return createCanvas(1, 1); },
} });
Object.defineProperty(globalThis, 'Path2D', { configurable: true, value: Path2D });
const originalDispose = THREE.Texture.prototype.dispose;
const disposals = [];
THREE.Texture.prototype.dispose = function () { disposals.push(this); return originalDispose.call(this); };
const visuals = new Set(), leases = new Set();
const spec = id => ({ id, era: 'ww2', visual: { base: '#4a553c', scheme: 'solid', plateLines: false } });
function visual(s, quality = 'low', selection = 'factory') {
  const value = createTankMaterials(s, { anisotropy: 4 }, 7, quality, selection);
  const dispose = value.dispose.bind(value);
  value.dispose = () => { if (visuals.delete(value)) dispose(); };
  visuals.add(value);
  return value;
}
async function lease(...args) {
  const value = await acquireSharedTextureLease(...args);
  leases.add(value);
  return value;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const maps = value => [value.hull.map, value.hull.normalMap, value.hull.roughnessMap];
const digest = value => maps(value).map(texture => {
  const c = texture.image;
  return [c.width, c.height, createHash('sha256')
    .update(c.getContext('2d').getImageData(0, 0, c.width, c.height).data).digest('hex')];
});
const disposed = texture => disposals.filter(value => value === texture).length;

try {
  const beforeInvalid = canvases;
  for (const selection of [null, undefined, 'auto', 'invalid', 'custom']) {
    await assert.rejects(acquireSharedTextureLease(spec('invalid'), 4, 'low', selection), /concrete/);
  }
  await assert.rejects(acquireSharedTextureLease(null, 4, 'low', 'factory'), /spec must be an object/);
  assert.equal(canvases, beforeInvalid, 'invalid leases allocate nothing');

  {
    const s = spec('lease-two-owners');
    await prebakeSharedTextures(s, 4, 'low', null, 'factory');
    const control = visual(s), pixels = digest(control);
    control.dispose();
    const gate = deferred(); let firstTicks = 0, secondTicks = 0, legacyTicks = 0;
    const first = lease(s, 4, 'low', 'factory', () => { if (++firstTicks === 1) return gate.promise; });
    const second = lease(s, 4, 'low', 'factory', () => { secondTicks++; });
    const legacy = prebakeSharedTextures(s, 4, 'low', () => { legacyTicks++; }, 'factory');
    assert.equal(firstTicks, 1);
    gate.resolve();
    const [a, b] = await Promise.all([first, second, legacy]);
    assert.ok(firstTicks > 1); assert.equal(secondTicks, 0); assert.equal(legacyTicks, 0);
    const v = visual(s), textures = maps(v);
    assert.deepEqual(digest(v), pixels, 'leased bake preserves exact original painter pixels');
    a.release(); a.release(); v.dispose();
    assert.ok(textures.every(texture => disposed(texture) === 0), 'second lease retains all shared textures');
    assert.equal(discardPrebakedSharedTextures(`${s.id}::factory`), false, 'sweep cannot evict a completed lease');
    const handedOff = visual(s);
    assert.deepEqual(maps(handedOff), textures, 'visual acquires exact retained entry');
    b.release(); b.release();
    assert.ok(textures.every(texture => disposed(texture) === 0), 'visual owns textures after leases release');
    handedOff.dispose();
    assert.ok(textures.every(texture => disposed(texture) === 1), 'last owner disposes shared textures once');
    const replacement = visual(s);
    a.release(); b.release();
    assert.ok(maps(replacement).every(texture => disposed(texture) === 0), 'old releases cannot affect successor entry');
    replacement.dispose();
  }

  {
    const s = spec('lease-coalesced-upgrade'), gate = deferred(); let higherTicks = 0;
    const low = lease(s, 4, 'low', 'factory', () => gate.promise);
    const high = lease(s, 4, 'ai', 'factory', () => { higherTicks++; });
    gate.resolve(); const lowOwner = await low;
    const v = visual(s), textures = maps(v);
    const highOwner = await high;
    assert.ok(higherTicks > 1, 'higher quality joining a bake performs the existing in-place promotion');
    assert.deepEqual(maps(v), textures); assert.equal(v.hull.map.image.width, 512);
    lowOwner.release(); highOwner.release(); v.dispose();
    assert.ok(textures.every(texture => disposed(texture) === 2));
  }

  {
    const s = spec('lease-one-rejected-owner'), error = new Error('one owner failed');
    const rejected = acquireSharedTextureLease(s, 4, 'low', 'factory', () => { throw error; });
    const survivor = lease(s, 4, 'low', 'factory');
    await assert.rejects(rejected, value => value === error);
    const held = await survivor, v = visual(s), textures = maps(v);
    v.dispose(); assert.ok(textures.every(texture => disposed(texture) === 0));
    held.release(); assert.ok(textures.every(texture => disposed(texture) === 1),
      'failed owner neither leaks its reservation nor evicts a coalesced successful owner');
  }

  {
    const s = spec('lease-live-promotion'), v = visual(s), textures = maps(v);
    const gate = deferred(); let ticks = 0;
    const pending = lease(s, 4, 'ai', 'factory', () => { if (++ticks === 1) return gate.promise; });
    v.dispose();
    assert.ok(textures.every(texture => disposed(texture) === 0), 'pending owner pins last visual during upgrade');
    assert.equal(discardPrebakedSharedTextures(`${s.id}::factory`), false, 'pending reservation blocks zero-ref eviction');
    gate.resolve(); const held = await pending;
    const upgraded = visual(s, 'ai');
    assert.deepEqual(maps(upgraded), textures, 'promotion preserves texture objects');
    assert.deepEqual(maps(upgraded).map(t => t.image.width), [512, 256, 256]);
    assert.ok(textures.every(texture => disposed(texture) === 1), 'promotion retains immutable-storage resize ritual');
    upgraded.dispose(); held.release();
    assert.ok(textures.every(texture => disposed(texture) === 2), 'last lease frees promoted textures');
  }

  {
    const s = spec('lease-sync-overlap'), gate = deferred(); let ticks = 0;
    const pending = lease(s, 4, 'low', 'factory', () => { if (++ticks === 1) return gate.promise; });
    const v = visual(s), textures = maps(v);
    v.dispose(); gate.resolve(); const held = await pending;
    const acquired = visual(s);
    assert.deepEqual(maps(acquired), textures, 'detached draft cannot overwrite sync acquisition during bake');
    acquired.dispose(); held.release();
    assert.ok(textures.every(texture => disposed(texture) === 1));
  }

  {
    const s = spec('lease-own-tick-failure'), v = visual(s), textures = maps(v);
    const error = new Error('owner tick failed'); let ticks = 0;
    await assert.rejects(acquireSharedTextureLease(s, 4, 'ai', 'factory', () => {
      ticks++; throw error;
    }), problem => problem === error);
    assert.ok(ticks > 1, 'tick rejection drains remaining painter stages');
    assert.deepEqual(maps(v).map(t => t.image.width), [512, 256, 256]);
    assert.ok(textures.every(texture => disposed(texture) === 1), 'failed owner still finalizes live promotion');
    let retryTicks = 0;
    const retry = await lease(s, 4, 'ai', 'factory', () => { retryTicks++; });
    assert.equal(retryTicks, 0, 'failed tick did not leave half-promoted quality');
    retry.release(); v.dispose();
    assert.ok(textures.every(texture => disposed(texture) === 2), 'rejected lease retained no reference');
  }

  {
    const s = spec('lease-failed-draft'), before = disposals.length;
    await assert.rejects(acquireSharedTextureLease(s, 4, 'low', 'factory', () => { throw null; }), x => x === null);
    assert.equal(disposals.length - before, 3, 'unclaimed completed draft is disposed after tick failure');
    let ticks = 0;
    const retry = await lease(s, 4, 'low', 'factory', () => { ticks++; });
    assert.ok(ticks > 1, 'failed acquisition leaves no unowned cache residue'); retry.release();
  }

  {
    const s = spec('lease-legacy-failure'), gate = deferred(), error = new Error('legacy tick failed');
    const legacy = prebakeSharedTextures(s, 4, 'low', () => gate.promise, 'factory');
    const joined = acquireSharedTextureLease(s, 4, 'low', 'factory');
    const failures = Promise.all([assert.rejects(legacy, x => x === error), assert.rejects(joined, x => x === error)]);
    gate.reject(error); await failures;
    let ticks = 0;
    const retry = await lease(s, 4, 'low', 'factory', () => { ticks++; });
    assert.ok(ticks > 1, 'joined legacy rejection releases pending ownership');
    const v = visual(s), textures = maps(v); v.dispose(); retry.release();
    assert.ok(textures.every(texture => disposed(texture) === 1));
  }

  {
    const s = spec('lease-independent-camo');
    const factory = await lease(s, 4, 'low', 'factory'), winter = await lease(s, 4, 'low', 'winter');
    const a = visual(s), b = visual(s, 'low', 'winter'), before = digest(a);
    assert.notEqual(a.hull.map, b.hull.map, 'explicit camos own distinct cache entries');
    setCamoOverride(s.id, 'desert'); setCamoBiome('winter');
    applyCamoPatterns(s.id); await applyCamoPatternsChunked({ onlySpecIds: [s.id] });
    assert.deepEqual(digest(a), before, 'fixed lease ignores mutable camo sweeps');
    const bTexture = b.hull.map;
    a.dispose(); factory.release(); assert.equal(disposed(bTexture), 0);
    b.dispose(); winter.release(); setCamoOverride(s.id, null);
  }

  for (const map of ['urban', 'railyard']) {
    let id = `${map}-0`;
    for (let i = 0; resolveMultiplayerCamoPattern(id, 'auto', map) !== 'urban'; i++) {
      assert.ok(i < 100); id = `${map}-${i + 1}`;
    }
    const s = spec(id);
    setCamoBiome(map);
    const before = visual(s, 'low', 'auto'), textures = maps(before), pixels = digest(before);
    const concrete = resolveMultiplayerCamoPattern(id, 'auto', map);
    assert.equal(concrete, 'urban'); assert.equal(networkCamoId(concrete), 'factory', 'wire allowlist is unchanged');
    setCamoBiome('winter');
    assert.equal(resolveMultiplayerCamoPattern(id, 'auto', map), concrete, 'explicit map ignores global biome');
    assert.equal(resolveMultiplayerCamoPattern(id, concrete), concrete, 'trusted concrete urban round-trips');
    const held = await lease(s, 4, 'low', concrete);
    before.dispose(); const after = visual(s, 'low', concrete);
    assert.deepEqual(maps(after), textures); assert.deepEqual(digest(after), pixels);
    after.dispose(); held.release();
    setCamoBiome('verdant');
    assert.equal(resolveMultiplayerCamoPattern(id, 'auto', 'invalid'), resolveMultiplayerCamoPattern(id, 'auto'));
    assert.equal(resolveMultiplayerCamoPattern(id, 'auto', '__proto__'), resolveMultiplayerCamoPattern(id, 'auto'));
  }
  console.log('sharedTextureLease.selftest: real painter parity, coalescing, promotion, ownership, failure cleanup and concrete map identity pass');
} finally {
  for (const value of visuals) value.dispose();
  for (const value of leases) value.release();
  setCamoBiome('verdant');
  THREE.Texture.prototype.dispose = originalDispose;
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}
