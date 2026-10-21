// Shared scene links (studioSceneShare.ts, ui/studioSceneLinkUi.ts): the scene rides in the URL fragment, capped,
// schema-checked and bounded on decode. Every tracked scene round-trips under the cap; a seeded fuzz of malformed links
// never throws, never pollutes a prototype and never lets markup or out-of-range numbers through.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import {
  SCENE_ACTOR_STATES, SCENE_EFFECT_PARAMS, SCENE_EFFECT_TYPES, SCENE_LINK_FORMAT, SCENE_LINK_LIMITS, SCENE_LINK_MAX_CHARS,
  SCENE_LINK_MAX_JSON_BYTES, SCENE_SHELL_TYPES, SCENE_IMPACT_KINDS, base64UrlToBytes, bytesToBase64Url, decodeSceneLink,
  encodeSceneLink, safeSceneText, sanitizeSharedScene, sceneLinkUrl, sceneLinkValue,
} from './studioSceneShare.ts';
import { normalizeFilm } from './studioFilmPlan.ts';
import { STUDIO_FX_PARAMS } from './studioFxSettings.ts';
import { isStudioTime, normalizeStudioLight } from './studioLight.ts';
import { pictureStateJson, resolvePicture } from './studioPicture.ts';
import { normalizeStoryboard } from './studioTimeline.ts';
import { staticImportClosure, importChain } from '../../tools/static-import-closure.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const prototypeNames = () => Object.getOwnPropertyNames(Object.prototype).sort().join(',');
const PROTOTYPE_BEFORE = prototypeNames();
const plainLink = (json) => `${SCENE_LINK_FORMAT}.j.${bytesToBase64Url(new TextEncoder().encode(typeof json === 'string' ? json : JSON.stringify(json)))}`;
const zLink = (bytes) => `${SCENE_LINK_FORMAT}.z.${bytesToBase64Url(new Uint8Array(bytes))}`;
/** Every known parameter at its longest valid value: the largest scene the schema lets through. */
const fullParams = (index) => Object.fromEntries(Object.entries(SCENE_EFFECT_PARAMS).map(([key, rule]) => {
  const long = (n) => `${key}${index}`.padEnd(n, 'w');
  switch (rule.kind) {
    case 'number': return [key, rule.digits ? rule.hi - 0.123 : rule.hi];
    case 'flag': return [key, true];
    case 'word': return [key, [...rule.allowed].sort((a, b) => b.length - a.length)[0]];
    case 'point': return [key, [rule.bound - 0.123, rule.bound - 0.456, 0.789 - rule.bound]];
    default: return [key, { name: long(48), type: 'APFSDS', caliberMm: 399.123, velocityMps: 2999.123, blastRadiusM: 99.123, pen100Mm: 2999.123 }];
  }
}));
const hugeScene = () => ({ map: 'verdant', effects: Array.from({ length: SCENE_LINK_LIMITS.effects }, (_, i) => ({ id: `fx${i}`.padEnd(48, 'x'), actor: `a${i}`.padEnd(48, 'y'), type: 'dust', params: fullParams(i) })) });

/** Every decoded scene: plain prototypes, no prototype keys, finite numbers inside int32 (seeds), safe strings. */
function assertSafe(value, path = 'scene') {
  if (Array.isArray(value)) {
    assert.equal(Object.getPrototypeOf(value), Array.prototype, `${path} is a plain array`);
    value.forEach((entry, index) => assertSafe(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    assert.equal(Object.getPrototypeOf(value), Object.prototype, `${path} is a plain object`);
    for (const key of Reflect.ownKeys(value)) {
      assert.equal(typeof key, 'string', `${path} has only string keys`);
      assert.ok(!['__proto__', 'constructor', 'prototype'].includes(key), `${path}.${key} is never a prototype key`);
      assertSafe(value[key], `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'number') assert.ok(Number.isFinite(value) && Math.abs(value) <= 2 ** 31, `${path} is a bounded number`);
  else if (typeof value === 'string') assert.ok(safeSceneText(value, 64), `${path} is safe text`);
  else assert.ok(value === null || typeof value === 'boolean', `${path} is JSON`);
}

// 1. Every tracked scene (the site's takes and the filming scenes) round-trips through a link under the cap, and the
//    canonical scene is exactly what load()'s own normalizers accept, unchanged.
const sceneFiles = execFileSync('git', ['ls-files', '*.scene.json'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
assert.ok(sceneFiles.length >= 100, `the tracked scenes are found (${sceneFiles.length})`);
let largest = 0;
for (const file of sceneFiles) {
  const raw = JSON.parse(read(file));
  const sanitized = sanitizeSharedScene(raw);
  assert.ok(sanitized.ok, `${file}: ${sanitized.detail}`);
  const scene = sanitized.scene;
  assert.deepEqual(sanitizeSharedScene(scene), sanitized, `${file}: the sanitizer is idempotent`);
  const encoded = await encodeSceneLink(raw);
  assert.ok(encoded.ok, `${file}: encodes (${encoded.reason} ${encoded.chars})`);
  assert.ok(encoded.chars <= SCENE_LINK_MAX_CHARS);
  largest = Math.max(largest, encoded.chars);
  const decoded = await decodeSceneLink(encoded.value);
  assert.ok(decoded.ok, `${file}: decodes (${decoded.reason} ${decoded.detail})`);
  // object3d-assert-ok: a shared Studio scene record (JSON data from the scene link), not a three.js graph
  assert.deepEqual(decoded.scene, scene, `${file}: the link carries the canonical scene`);
  if (scene.storyboard) assert.deepEqual(normalizeStoryboard(scene.storyboard), scene.storyboard, `${file}: storyboard canonical`);
  if (scene.film) assert.deepEqual(normalizeFilm(scene.film), scene.film, `${file}: film canonical`);
  if (scene.light) assert.deepEqual(normalizeStudioLight(scene.light), scene.light, `${file}: light canonical`);
  if (scene.picture) assert.deepEqual(pictureStateJson(resolvePicture(scene.picture)), scene.picture, `${file}: picture canonical`);
  if (scene.timeOfDay) assert.ok(isStudioTime(scene.timeOfDay));
  assert.ok(!('meta' in scene) && !('crushes' in scene) && !('still' in scene), `${file}: fields load() never reads are dropped`);
  (raw.effects || []).forEach((effect, index) => {
    const authored = Object.keys(effect.params || {}).filter((key) => effect.params[key] !== null).sort();
    assert.deepEqual(Object.keys(scene.effects[index].params || {}).sort(), authored, `${file}: effects[${index}] keeps every authored parameter`);
  });
  assertSafe(scene);
}
// the plain-JSON codec (a browser without CompressionStream) round-trips too
{
  const { map, actors, effects, camera } = JSON.parse(read(sceneFiles[0]));
  const raw = { map, actors, effects, camera };
  const plain = await encodeSceneLink(raw, { compress: false });
  assert.ok(plain.ok && plain.value.startsWith(`${SCENE_LINK_FORMAT}.j.`), 'compress: false writes the j codec');
  // object3d-assert-ok: a shared Studio scene record (JSON data from the scene link), not a three.js graph
  assert.deepEqual((await decodeSceneLink(plain.value)).scene, sanitizeSharedScene(raw).scene);
}

// 2. Strict schema: unknown fields dropped, numbers clamped and rounded, wrong types and unknown enums refused.
{
  const result = sanitizeSharedScene({
    map: 'verdant', meta: { secret: 1 }, timeScale: 100, fxTime: 1e12, seed: 1.7,
    actors: [{ id: 't90am', name: 'hero', pos: [1e9, -1e9], gunDeg: 400, facingDeg: 1.23456789, extra: true, stateAgeS: -5 }],
    effects: [
      { type: 'flare', at: [1, 2], tMs: -40, params: { heightM: 1e12, color: 'white', BadKey: 1, hasOwnProperty: 1, label: 'x', burnS: null, shell: { type: 'HE', caliberMm: 152, junk: 1 } }, foo: 1 },
      { type: 'dust', params: { count: 1e9, intensity: -3, dirDeg: 90 } },
      { type: 'barrage', params: { count: 50, radiusM: 1, size: 'mixed' } },
      { type: 'strike', params: { dirDeg: 10, shell: { name: 'M107', type: 'HE', caliberMm: 1e9, blastRadiusM: 1e9, pen100Mm: -1 } } },
      { type: 'explosion', params: { munition: 'howitzer', chargeKg: 1e9, wall: true, hitH: 1e4 } },
    ],
    camera: { pos: [0, 5, 0], fov: 1, mode: 'orbit', bogus: 1 },
    picture: { preset: 'cinematic', futureSetting: 3, dof: { enabled: true, fStop: 99, futureSub: 1 } },
    light: { sunAzimuthDeg: 370 },
    fx: { quality: 'cinematic' },
    destruction: { sections: true },
  });
  assert.ok(result.ok, result.detail);
  const { scene } = result;
  assert.equal(scene.meta, undefined, 'an unknown top-level field is dropped');
  assert.equal(scene.timeScale, 4);
  assert.equal(scene.fxTime, 60000);
  assert.equal(scene.seed, 2);
  assert.deepEqual(scene.actors[0].pos, [2500, -2500], 'positions clamp to ±2.5 km (every map lies inside ±2 km)');
  assert.equal(scene.actors[0].gunDeg, 90);
  assert.equal(scene.actors[0].facingDeg, 1.235, 'angles round to 0.001°');
  assert.equal(scene.actors[0].stateAgeS, 0);
  assert.equal(scene.actors[0].extra, undefined);
  assert.equal(scene.effects[0].tMs, 0);
  assert.equal(scene.effects[0].foo, undefined);
  assert.deepEqual(scene.effects[0].params, { heightM: 220, color: 'white', shell: { type: 'HE', caliberMm: 152 } },
    'params keep the known keys (a null is omitted), drop the rest, and clamp a cinematic value into its handler range');
  assert.deepEqual(scene.effects[1].params, { count: 80, intensity: 0, dirDeg: 90 }, 'a dust burst is capped at 80 puffs');
  assert.deepEqual(scene.effects[2].params, { count: 12, radiusM: 2, size: 'mixed' }, 'barrage numbers clamp into STUDIO_FX_PARAMS');
  assert.deepEqual(scene.effects[3].params, { dirDeg: 10, shell: { name: 'M107', type: 'HE', caliberMm: 400, blastRadiusM: 100, pen100Mm: 0 } },
    'a strike round is bounded');
  assert.deepEqual(scene.effects[4].params, { munition: 'howitzer', chargeKg: 1000, wall: true, hitH: 100 }, 'a charge is bounded');
  assert.equal(scene.camera.fov, 10);
  assert.equal(scene.camera.bogus, undefined);
  assert.equal(scene.picture.futureSetting, undefined, 'a picture setting this build lacks is dropped');
  assert.equal(scene.picture.dof.fStop, 32, 'picture values clamp in picture\'s own schema');
  assert.equal(scene.picture.dof.futureSub, undefined);
  assert.deepEqual(scene.light, { sunAzimuthDeg: 10 });
  assert.deepEqual(scene.fx, { quality: 'cinematic' });
  assert.equal(scene.destruction, undefined, 'sections: true is the default and is not written');
}
const refused = (raw, pattern, label) => {
  const result = sanitizeSharedScene(raw);
  assert.equal(result.ok, false, `${label}: refused`);
  assert.match(result.detail, pattern, `${label}: names the field (${result.detail})`);
};
refused([], /scene: must be an object/, 'a list');
refused(null, /scene: must be an object/, 'null');
refused('scene', /scene: must be an object/, 'a string');
refused({ actors: {} }, /scene\.actors: must be a list/, 'actors object');
refused({ actors: [{ state: 'exploded' }] }, /actors\[0\]\.state/, 'unknown actor state');
refused({ actors: [{ id: 'T90 <b>' }] }, /actors\[0\]\.id/, 'tank id with markup');
refused({ actors: [{ id: '../../secret' }] }, /actors\[0\]\.id/, 'tank id path');
refused({ map: '../maps/x' }, /scene\.map/, 'map path');
refused({ map: 'verdant', timeOfDay: 'midnight' }, /scene\.timeOfDay/, 'unknown time');
refused({ productionFormat: 'cinemascope' }, /scene\.productionFormat/, 'unknown format');
refused({ actors: [{ name: '<script>alert(1)</script>' }] }, /actors\[0\]\.name/, 'script in a name');
refused({ actors: [{ name: '<img src=x onerror=alert(1)>' }] }, /actors\[0\]\.name/, 'img onerror in a name');
refused({ actors: [{ name: 'hero\u202eorez' }] }, /actors\[0\]\.name/, 'a bidi override');
refused({ actors: [{ name: 'line\nbreak' }] }, /actors\[0\]\.name/, 'a control character');
refused({ actors: [{ name: 'x'.repeat(49) }] }, /actors\[0\]\.name/, 'an overlong name');
refused({ storyboard: { shots: [{ label: 'a & b' }] } }, /shots\[0\]\.label/, 'an ampersand label');
refused({ storyboard: { shots: [{ transition: 'wipe' }] } }, /shots\[0\]\.transition/, 'unknown transition');
refused({ effects: [{ type: 'constructor' }] }, /effects\[0\]\.type/, 'effect type constructor');
refused({ effects: [{ type: '__proto__' }] }, /effects\[0\]\.type/, 'effect type __proto__');
refused({ effects: [{ type: 'toString' }] }, /effects\[0\]\.type/, 'effect type toString');
refused({ effects: [{ at: [1, 2] }] }, /effects\[0\]\.type: is required/, 'effect without a type');
refused({ effects: [{ type: 'impact', params: { kind: '"><svg onload=x>' } }] }, /params\.kind/, 'markup in a param');
refused({ effects: [{ type: 'strike', params: { shell: { name: { deeper: 1 } } } }] }, /params\.shell\.name/, 'nested params');
refused({ effects: [{ type: 'impact', params: { normal: [1, 2, 3, 4] } }] }, /params\.normal/, 'a long param vector');
refused({ effects: [{ type: 'detrack', params: { side: 1 } }] }, /params\.side/, 'a numeric track side');
refused({ effects: [{ type: 'explosion', params: { munition: 'constructor' } }] }, /params\.munition/, 'munition constructor');
refused({ effects: [{ type: 'explosion', params: { munition: '__proto__' } }] }, /params\.munition/, 'munition __proto__');
refused({ effects: [{ type: 'flare', params: { color: 'toString' } }] }, /params\.color/, 'flare colour toString');
// allow-listed ids: every map, vehicle, camo and handler word is one this build has
refused({ map: 'atlantis' }, /scene\.map: is not a battlefield of this build/, 'an unknown map');
refused({ map: 'constructor' }, /scene\.map: is not a battlefield/, 'map constructor');
refused({ actors: [{ id: 't1000' }] }, /actors\[0\]\.id: is not a vehicle of this build/, 'an unknown vehicle');
refused({ actors: [{ id: 'constructor' }] }, /actors\[0\]\.id: is not a vehicle/, 'vehicle constructor (an inherited spec key)');
refused({ actors: [{ specId: 'hasownproperty' }] }, /actors\[0\]\.specId: is not a vehicle/, 'an unknown specId');
refused({ tankIdSchema: 3, actors: [{ id: 'm1a2' }] }, /actors\[0\]\.id: is not a vehicle/, 'a schema-1 id stamped as current');
refused({ tankIdSchema: 'x', actors: [] }, /scene\.tankIdSchema: must be a finite number/, 'a schema string');
refused({ actors: [{ id: 't90am', camo: 'tiger_stripes_9000' }] }, /actors\[0\]\.camo: is not a camo of this build/, 'an unknown camo');
refused({ actors: [{ id: 't90am', camo: 'constructor' }] }, /actors\[0\]\.camo/, 'camo constructor');
refused({ effects: [{ type: 'impact', params: { kind: 'constructor' } }] }, /params\.kind: is not a known value/, 'impact kind constructor');
refused({ effects: [{ type: 'impact', params: { kind: 'nuke' } }] }, /params\.kind/, 'an unknown impact kind');
refused({ effects: [{ type: 'tracer', params: { shellType: 'PLASMA' } }] }, /params\.shellType/, 'an unknown shell type');
refused({ effects: [{ type: 'explosion', params: { size: 'gigantic' } }] }, /params\.size/, 'an unknown blast size');
refused({ effects: [{ type: 'tank_kill', params: { cause: 'toString' } }] }, /params\.cause/, 'cause toString');
refused({ effects: [{ type: 'strike', params: { shell: { type: 'NUKE' } } }] }, /params\.shell\.type/, 'an unknown strike round');
// a refusal names the field and never quotes the link (no attacker sentence on the error card)
for (const [raw, field] of [
  [{ map: 'verdant', picture: { letterbox: 'Session expired. Call +1 555 0100 now' } }, /^scene\.picture: is not a picture block this build reads$/],
  [{ map: 'verdant', picture: { preset: 'Session-expired.Call.now' } }, /^scene\.picture: is not a picture block this build reads$/],
  [{ map: 'verdant', film: { fps: 25 } }, /^scene\.film: is not a film block this build reads$/],
]) {
  const result = sanitizeSharedScene(raw);
  assert.equal(result.ok, false);
  assert.match(result.detail, field);
}
refused({ effects: [{ id: 'fx1', type: 'dust' }, { id: 'fx1', type: 'flare' }] }, /effects\[1\]\.id: repeats an earlier effect id/, 'a repeated effect id');
for (const [name, label] of [['hero\u200f', 'RLM'], ['he\u200bro', 'zero-width space'], ['\ufeffhero', 'BOM'], ['hero\u061c', 'Arabic letter mark'],
  ['hero\u2060', 'word joiner'], ['he\ud800ro', 'a lone surrogate'], ['he\u0301\u0301\u0301ro', 'a combining-mark flood']]) {
  refused({ actors: [{ id: 't90am', name }] }, /actors\[0\]\.name/, label);
}
for (const name of ['豹 2A6', 'Škoda', 'T-90M «Proryv»', 'Crème brûlée']) {
  assert.ok(sanitizeSharedScene({ actors: [{ id: 't90am', name }] }).ok, `${name} is plain text`);
}
{
  // an old scene names its vehicles in its own schema: accepted, spelling kept for load()'s own migration
  const legacy = sanitizeSharedScene({ tankIdSchema: 1, map: 'desert', actors: [{ id: 'm1a2', camo: 'inherit' }, { id: 't90m', camo: 'urban' }] });
  assert.ok(legacy.ok, legacy.detail);
  assert.deepEqual(legacy.scene.actors.map((a) => a.id), ['m1a2', 't90m'], 'schema-1 ids resolve through the renames and keep their spelling');
  assert.ok(sanitizeSharedScene({ actors: [{ id: 'fv510_milan_x' }] }).ok, 'an unstamped scene is schema 1');
  for (const kind of SCENE_IMPACT_KINDS) assert.ok(sanitizeSharedScene({ effects: [{ type: 'impact', params: { kind } }] }).ok, `impact kind ${kind}`);
}
refused({ effects: [{ type: 'fire', params: { tracer: 'no' } }] }, /params\.tracer/, 'a flag string');
refused({ effects: [{ type: 'dust', params: { count: '1e9' } }] }, /params\.count: must be a finite number/, 'a count string');
refused({ camera: { pos: [1, 2] } }, /camera\.pos/, 'a 2-number camera position');
refused({ camera: { fov: '45' } }, /camera\.fov: must be a finite number/, 'a numeric string');
refused({ film: { fps: 25 } }, /scene\.film/, 'an unsupported frame rate');
refused({ film: { filter: 'lanczos' } }, /scene\.film\.filter/, 'unknown film filter');
refused({ light: { sunAzimuthDeg: 'east' } }, /scene\.light\.sunAzimuthDeg/, 'a light angle string');
refused({ picture: { preset: 'nope' } }, /scene\.picture/, 'unknown picture preset');
refused({ picture: { dof: 5 } }, /scene\.picture/, 'a picture group as a number');
refused({ destruction: { sections: 'no' } }, /destruction\.sections/, 'destruction flag string');
refused({ actors: Array.from({ length: SCENE_LINK_LIMITS.actors + 1 }, () => ({})) }, /more than 32/, 'too many actors');
refused({ effects: Array.from({ length: SCENE_LINK_LIMITS.effects + 1 }, () => ({ type: 'dust' })) }, /more than 256/, 'too many effects');
refused({ storyboard: { shots: Array.from({ length: SCENE_LINK_LIMITS.shots + 1 }, () => ({})) } }, /more than 32/, 'too many shots');
refused({ storyboard: { actorTracks: [{ actor: 'hero', keys: Array.from({ length: SCENE_LINK_LIMITS.actorKeys + 1 }, () => ({})) }] } },
  /more than 64/, 'too many keys');
{
  const junk = sanitizeSharedScene({ effects: [{ type: 'fire', params: Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`k${i}`, i])) }] });
  assert.ok(junk.ok && Object.keys(junk.scene.effects[0].params).length === 0, 'unknown parameter keys are dropped, however many');
}

// 3. Prototype pollution: `__proto__`, `constructor` and `prototype` keys anywhere never reach a prototype or the scene.
{
  const hostile = '{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}},"map":"verdant",'
    + '"actors":[{"__proto__":{"polluted":3},"id":"t90am","constructor":{"prototype":{"polluted":4}}}],'
    + '"effects":[{"type":"fire","params":{"__proto__":{"polluted":5},"constructor":{"prototype":{"polluted":6}},"prototype":7,"slot":1}}],'
    + '"picture":{"__proto__":{"polluted":8},"preset":"noir","dof":{"__proto__":{"polluted":9},"enabled":true}},'
    + '"storyboard":{"__proto__":{"polluted":10},"shots":[{"__proto__":{"polluted":11},"tMs":0}]}}';
  const decoded = await decodeSceneLink(plainLink(hostile));
  assert.ok(decoded.ok, decoded.detail);
  assertSafe(decoded.scene);
  assert.equal({}.polluted, undefined, 'Object.prototype is untouched');
  assert.equal(decoded.scene.polluted, undefined);
  assert.deepEqual(decoded.scene.effects[0].params, { slot: 1 });
  assert.equal(prototypeNames(), PROTOTYPE_BEFORE);
}

// 4. Link framing: the format, codec, alphabet, caps and the inflate's byte bound.
const failsWith = async (value, reason, label) => {
  const result = await decodeSceneLink(value);
  assert.equal(result.ok, false, `${label}: refused`);
  assert.equal(result.reason, reason, `${label}: ${result.reason} (${result.detail})`);
};
await failsWith('', 'encoding', 'empty');
await failsWith(undefined, 'encoding', 'undefined');
await failsWith(42, 'encoding', 'a number');
await failsWith('x'.repeat(SCENE_LINK_MAX_CHARS + 1), 'too-large', 'past the character cap, before any parsing');
await failsWith(`2.z.${plainLink({}).slice(4)}`, 'version', 'a newer format');
await failsWith(`0.j.${plainLink({}).slice(4)}`, 'encoding', 'format 0');
await failsWith(`1.q.${plainLink({}).slice(4)}`, 'encoding', 'unknown codec');
await failsWith('1.j.eyJ+YSI6MX0=', 'encoding', 'standard base64 characters');
await failsWith('1.j.e', 'encoding', 'an impossible base64 length');
await failsWith('1.j.eyJ', 'encoding', 'non-zero trailing bits');
await failsWith('1.j.', 'encoding', 'no payload');
await failsWith(`1.j.${bytesToBase64Url(new Uint8Array([0xff, 0xfe, 0x7b]))}`, 'encoding', 'invalid UTF-8');
await failsWith(plainLink('{"map":'), 'encoding', 'broken JSON');
await failsWith(plainLink('[1,2]'), 'schema', 'a JSON list');
await failsWith(plainLink('"scene"'), 'schema', 'a JSON string');
await failsWith(plainLink('null'), 'schema', 'JSON null');
await failsWith(zLink([1, 2, 3, 4, 5]), 'encoding', 'corrupt deflate');
{
  const good = await encodeSceneLink(JSON.parse(read(sceneFiles[0])));
  await failsWith(good.value.slice(0, -48), 'encoding', 'a truncated link');
  // a decompression bomb: ~12 KB that inflates to 12 MB stops at the JSON cap, after at most one more chunk
  const bomb = deflateRawSync(Buffer.alloc(12_000_000, 0x20), { level: 9 });
  assert.ok(zLink(bomb).length <= SCENE_LINK_MAX_CHARS, 'the bomb fits the character cap');
  const started = performance.now();
  await failsWith(zLink(bomb), 'too-large', 'a decompression bomb');
  assert.ok(performance.now() - started < 2000, 'the bomb is abandoned early');
  // a valid scene whose JSON passes the inflate cap is too large as well
  const big = JSON.stringify({ map: 'verdant', pad: 'x'.repeat(SCENE_LINK_MAX_JSON_BYTES) });
  await failsWith(zLink(deflateRawSync(Buffer.from(big))), 'too-large', 'inflated JSON past the cap');
}
// encode refuses past either cap with the size it would need
{
  const huge = hugeScene();
  assert.ok(sanitizeSharedScene(huge).ok, 'the largest schema-valid scene is valid');
  const tooBig = await encodeSceneLink(huge);
  assert.equal(tooBig.ok, false);
  assert.equal(tooBig.reason, 'too-large', 'JSON past the cap');
  assert.equal(tooBig.detail, 'scene JSON', 'the JSON cap, before any compression');
  // random-looking text compresses poorly: a few thousand characters of it pass the link cap
  let state = 0x9e3779b9;
  const noise = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return 'abcdefghijklmnopqrstuvwxyz0123456789'[(state >>> 0) % 36];
  };
  const word = () => `w${Array.from({ length: 47 }, noise).join('')}`;
  const noisy = { map: 'verdant', effects: Array.from({ length: 256 }, () => ({ type: 'dust', id: word(), actor: word() })) };
  const overLink = await encodeSceneLink(noisy);
  assert.equal(overLink.ok, false);
  assert.equal(overLink.reason, 'too-large');
  assert.ok(overLink.chars > SCENE_LINK_MAX_CHARS, 'the refusal quotes the size it would need');
  const notAScene = await encodeSceneLink({ actors: 'x' });
  assert.equal(notAScene.reason, 'schema');
}
// base64url codec: every length round-trips; the alphabet is URL-safe
for (let length = 0; length < 70; length++) {
  const bytes = Uint8Array.from({ length }, (_, i) => (i * 97 + length * 31) & 255);
  const text = bytesToBase64Url(bytes);
  assert.match(text, /^[A-Za-z0-9_-]*$/);
  assert.equal(text, Buffer.from(bytes).toString('base64url'));
  assert.deepEqual(base64UrlToBytes(text), bytes);
}

// 5. Seeded fuzz: random and mutated links never throw; whatever decodes is safe and canonical.
{
  let seed = 0x5ce7e11;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const junk = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.+/=%#&?<>"\' \u0000\u202e\u4e2d';
  const randomText = (length) => Array.from({ length }, () => pick(junk)).join('');
  const take = JSON.parse(read(sceneFiles[0]));
  const baseLink = (await encodeSceneLink(take)).value;
  // the structural fuzz mutates a take trimmed to fit a plain-JSON link: every block, a few shots and keys
  const base = {
    ...take,
    storyboard: {
      ...take.storyboard,
      shots: take.storyboard.shots.slice(0, 3),
      actorTracks: take.storyboard.actorTracks.slice(0, 2).map((track) => ({ ...track, keys: track.keys.slice(0, 3) })),
    },
    picture: { preset: 'cinematic', dof: { enabled: true, focusActor: 'hero', fStop: 2.8 } },
    light: { sunAzimuthDeg: 210, sunElevationDeg: 9 },
    film: { fps: 24, speed: [{ tMs: 100, speed: 0.5, ease: 'smooth' }] },
  };
  assert.ok(plainLink(base).length <= SCENE_LINK_MAX_CHARS, 'the fuzz base fits a plain link');
  assert.ok((await decodeSceneLink(plainLink(base))).ok, 'the fuzz base decodes');
  const hostileValues = [
    1e308, -1e308, 1e-320, 0, -0, 2 ** 53, '1e3', '', '<script>x</script>', 'a\u202eb', 'x'.repeat(5000), true, null, [],
    [1e9, 'x', null], { __proto__: { polluted: 1 } }, JSON.parse('{"__proto__":{"polluted":1}}'), { constructor: { prototype: { polluted: 1 } } },
    'constructor', '__proto__', 'toString', 'hasOwnProperty', Array.from({ length: 300 }, () => 1),
  ];
  const mutate = (node, depth = 0) => {
    if (depth > 6 || node === null || typeof node !== 'object') return pick(hostileValues);
    const keys = Array.isArray(node) ? node.map((_, i) => i) : Object.keys(node);
    if (!keys.length || rand() < 0.15) return pick(hostileValues);
    const copy = Array.isArray(node) ? [...node] : { ...node };
    const key = pick(keys);
    copy[key] = mutate(copy[key], depth + 1);
    if (!Array.isArray(copy) && rand() < 0.2) copy[pick(['__proto__', 'constructor', 'prototype', 'extra', 'toString'])] = pick(hostileValues);
    return copy;
  };
  let decodedCount = 0;
  const check = async (value, label) => {
    let result;
    try {
      result = await decodeSceneLink(value);
    } catch (error) {
      assert.fail(`${label}: decode threw ${error}`);
    }
    assert.equal(typeof result.ok, 'boolean', `${label}: a result`);
    if (result.ok) {
      decodedCount++;
      assertSafe(result.scene);
      // object3d-assert-ok: a shared Studio scene record (JSON data from the scene link), not a three.js graph
      assert.deepEqual(sanitizeSharedScene(result.scene).scene, result.scene, `${label}: canonical`);
    } else {
      assert.ok(['too-large', 'encoding', 'version', 'unsupported', 'schema'].includes(result.reason), `${label}: ${result.reason}`);
      // the detail is this build's field path and a fixed phrase: no value from the link ever reaches the error card
      if (result.reason === 'schema') assert.match(result.detail, /^[A-Za-z][\w.[\]]*: [a-z][a-z0-9 ,]*$/, `${label}: ${result.detail}`);
    }
  };
  for (let i = 0; i < 600; i++) {
    await check(`${pick(['1.z.', '1.j.', '2.z.', '1.', '', 'z.'])}${randomText(Math.floor(rand() * 200))}`, `random ${i}`);
  }
  for (let i = 0; i < 600; i++) {
    const chars = baseLink.split('');
    const edits = 1 + Math.floor(rand() * 4);
    for (let e = 0; e < edits; e++) {
      const at = 4 + Math.floor(rand() * (chars.length - 4));
      const op = rand();
      if (op < 0.4) chars[at] = pick(junk);
      else if (op < 0.7) chars.splice(at, 1);
      else chars.splice(at, 0, pick(junk));
    }
    await check(chars.join(''), `mutated ${i}`);
  }
  for (let i = 0; i < 800; i++) await check(plainLink(mutate(base)), `structural ${i}`);
  assert.ok(decodedCount >= 200, `the structural fuzz reaches decoded scenes (${decodedCount})`);
  assert.equal({}.polluted, undefined);
  assert.equal(prototypeNames(), PROTOTYPE_BEFORE, 'the fuzz left Object.prototype untouched');
}

// 6. The fragment, never the query: reading `#scene=` and writing links.
assert.equal(sceneLinkValue('#scene=1.z.abc'), '1.z.abc');
assert.equal(sceneLinkValue('#foo=1&scene=1.j.x_y-z'), '1.j.x_y-z');
assert.equal(sceneLinkValue('scene=1.j.x'), '1.j.x');
for (const none of ['', '#', '#other=1', null, undefined, 7]) assert.equal(sceneLinkValue(none), null, `${String(none)} carries no link`);
{
  const oversized = `#scene=${'A'.repeat(SCENE_LINK_MAX_CHARS + 500)}`;
  const value = sceneLinkValue(oversized);
  assert.ok(value && value.length > SCENE_LINK_MAX_CHARS, 'an oversized hash is handed on whole');
  await failsWith(value, 'too-large', 'an oversized hash');
  assert.equal(sceneLinkValue(`#other=${'A'.repeat(SCENE_LINK_MAX_CHARS + 500)}`), null);
}
{
  const url = sceneLinkUrl('https://cot.example', '/studio', '1.z.abc');
  assert.equal(url, 'https://cot.example/studio#scene=1.z.abc');
  assert.equal(new URL(url).search, '', 'nothing rides in the query string');
  assert.equal(sceneLinkValue(new URL(url).hash), '1.z.abc');
}

// 7. The copy helper: the clipboard gets the link inside the click, the messages name sizes and fallbacks.
{
  const ui = await import('../ui/studioSceneLinkUi.ts');
  const env = { origin: 'https://cot.example', studioPath: '/studio' };
  let calledInClick = false;
  let written = '';
  const copied = ui.copySceneLink(JSON.parse(read(sceneFiles[0])), {
    ...env, copy: (link) => { calledInClick = true; return link.then((url) => { written = url; }); },
  });
  assert.ok(calledInClick, 'the clipboard write starts synchronously, inside the user gesture');
  const done = await copied;
  assert.ok(done.ok);
  assert.equal(written, done.url);
  assert.match(done.message, /^Scene link copied \(\d+(?:\.\d)? KB\)\.$/);
  assert.match(done.url, /^https:\/\/cot\.example\/studio#scene=1\.[zj]\./);
  assert.ok((await decodeSceneLink(sceneLinkValue(new URL(done.url).hash))).ok, 'the copied link opens');
  let bar = '';
  const manual = await ui.copySceneLink({ map: 'verdant' }, { ...env, copy: () => Promise.reject(new Error('denied')), showInAddressBar: (url) => { bar = url; } });
  assert.ok(manual.ok);
  assert.equal(bar, manual.url, 'a refused clipboard puts the link in the address bar');
  assert.match(manual.message, /address bar/);
  const failed = await ui.copySceneLink({ map: 'verdant' }, { ...env, copy: () => { throw new Error('sync'); } });
  assert.equal(failed.ok, false);
  assert.match(failed.message, /could not be copied/);
  const tooBig = await ui.copySceneLink(hugeScene(), env);
  assert.equal(tooBig.ok, false);
  assert.match(tooBig.message, /too large for a link \(\d+(?:\.\d)? KB; the limit is 16 KB\)\. Use Save JSON/);
  // each refusal names its cause and the next step (blind critic 2026-10-21); the link's size is quoted
  assert.match(ui.sceneLinkOpenFailure({ ok: false, reason: 'too-large', detail: 'link', chars: 21_800 }).message,
    /^This scene link is 21\.3 KB; the Studio opens links up to 16 KB\. Ask the sender to share the scene as a file with Save JSON\.$/);
  assert.match(ui.sceneLinkOpenFailure({ ok: false, reason: 'too-large', detail: 'scene JSON' }).message, /unpacks to more than the Studio opens/);
  assert.equal((await decodeSceneLink('A'.repeat(SCENE_LINK_MAX_CHARS + 7))).chars, SCENE_LINK_MAX_CHARS + 7, 'an oversized link reports its size');
  const damaged = ui.sceneLinkOpenFailure({ ok: false, reason: 'schema', detail: 'scene.map: is not a battlefield of this build' });
  assert.match(damaged.message, /^This scene is set on a battlefield this version of the game does not have\. Reload to update, then open the link again\.$/,
    'a missing battlefield reads as such, with the next step');
  assert.equal(damaged.detail, 'scene.map: is not a battlefield of this build', 'the schema path rides apart, as text');
  assert.match(ui.sceneLinkOpenFailure({ ok: false, reason: 'schema', detail: 'scene.actors[1].id: is not a vehicle of this build' }).message, /stages a tank this version/);
  assert.match(ui.sceneLinkOpenFailure({ ok: false, reason: 'schema', detail: 'scene.actors[0].camo: is not a camo of this build' }).message, /camouflage this version/);
  assert.match(ui.sceneLinkOpenFailure({ ok: false, reason: 'schema', detail: 'scene.actors[0].state: is not a known value' }).message,
    /^This scene link is damaged or is not a Studio scene\. Ask the sender to copy it again\.$/);
  assert.match(ui.sceneLinkOpenFailure({ ok: false, reason: 'version', detail: 'format 2' }).message, /newer version/);
  assert.match(ui.sceneLinkOpenFailure({ ok: false, reason: 'unsupported', detail: 'DecompressionStream' }).message, /cannot open compressed/);
  const notShareable = await ui.copySceneLink({ map: 'atlantis' }, env);
  assert.equal(notShareable.ok, false);
  assert.equal(notShareable.detail, 'scene.map: is not a battlefield of this build');
  // a refused link's detail never quotes the link: it is built from this build's field names only
  const quoted = await decodeSceneLink(plainLink({ map: 'verdant', actors: [{ id: 'evil-site-com-login-now', name: 'x' }] }));
  assert.equal(quoted.ok, false);
  assert.doesNotMatch(quoted.detail, /evil/, 'the refusal names the field, not the value');
  for (const glyph of Object.values(ui.SCENE_LINK_GLYPHS)) {
    assert.match(glyph, /^<svg viewBox="0 0 24 24" width="\d+" height="\d+" aria-hidden="true" focusable="false">/);
    assert.doesNotMatch(glyph, /<(?:script|foreignObject|image|use|a)\b|\bon[a-z]+=|href|url\(/i, 'link glyphs are inert shapes');
  }
}

// 8. Both locales carry every message with the same placeholders, in the Studio's demand-loaded slice.
{
  const en = JSON.parse(read('src/ui/i18nCatalog.en-US.json'));
  const zh = JSON.parse(read('src/ui/i18nCatalog.zh-CN.json'));
  const keys = Object.keys(en).filter((key) => key.startsWith('studio.sceneLink.'));
  assert.ok(keys.length >= 14, 'the scene link messages are in the catalog');
  const holes = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const key of keys) {
    assert.equal(typeof zh[key], 'string', `${key} has a zh-CN translation`);
    assert.equal(holes(zh[key]), holes(en[key]), `${key} keeps its placeholders in zh-CN`);
  }
  const used = new Set([read('src/ui/studioSceneLinkUi.ts'), read('src/ui/studioPanel.ts'), read('src/ui/studioProductionPanel.ts'), read('src/game/studio.ts')]
    .flatMap((text) => [...text.matchAll(/'(studio\.sceneLink\.\w+)'/g)].map((m) => m[1])));
  for (const key of used) assert.ok(keys.includes(key), `${key} is in the catalog`);
  for (const key of keys) assert.ok(used.has(key), `${key} is shown somewhere (no stale message)`);
  const { isStudioCatalogKey } = await import('../ui/i18nStudioKeys.ts');
  for (const key of keys) assert.ok(isStudioCatalogKey(key), `${key} loads with the Studio's chunk, not the game's boot catalog`);
}

// 9. Parity and wiring: the allowlists equal the Studio's own, and the Studio opens fragment links.
{
  const studio = read('src/game/studio.ts');
  const handlers = studio.match(/const effectHandlers[\s\S]*?Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(handlers, 'studio.ts declares effectHandlers');
  const handlerTypes = [...handlers[1].matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual([...SCENE_EFFECT_TYPES].sort(), handlerTypes, 'SCENE_EFFECT_TYPES equals the Studio\'s effect handlers');
  const states = studio.match(/export const ACTOR_STATES = \[([\s\S]*?)\];/);
  assert.deepEqual([...states[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]), [...SCENE_ACTOR_STATES], 'SCENE_ACTOR_STATES equals ACTOR_STATES');
  assert.match(studio, /Object\.hasOwn\(effectHandlers, e\.type\) \? effectHandlers\[e\.type\] : undefined/,
    'an effect type resolves only to an own handler');
  assert.doesNotMatch(studio, /params\.munition in MUNITION_PROFILES/, 'a munition resolves only to an own profile');
  assert.equal(studio.match(/Object\.hasOwn\(MUNITION_PROFILES, params\.munition\)/g)?.length, 2);
  assert.match(studio, /const count = Math\.max\(0, Math\.min\(80, Number\(params\.count \?\? 10\) \|\| 0\)\);/, 'the dust handler caps its count');
  // the link's parameter table is exactly what the handlers read, and holds every cinematic range
  const reads = [...new Set([...studio.matchAll(/\bparams\.([A-Za-z]+)\b/g)].map((m) => m[1]))].sort();
  assert.deepEqual(Object.keys(SCENE_EFFECT_PARAMS).sort(), reads, 'SCENE_EFFECT_PARAMS equals the params.<key> reads in studio.ts');
  for (const [type, defs] of Object.entries(STUDIO_FX_PARAMS)) {
    assert.ok(SCENE_EFFECT_TYPES.includes(type), `${type} is an effect type`);
    for (const def of defs) {
      const rule = SCENE_EFFECT_PARAMS[def.key];
      assert.ok(rule && rule.kind === 'number' && rule.lo <= def.min && def.max <= rule.hi, `${type}.${def.key} fits its link bound`);
    }
  }
  assert.match(studio, /function bootScene\(\): StudioBootScene \| null \{\n\s+const linkValue = sceneLinkValue\(window\.location\.hash\);\n\s+if \(linkValue != null\) \{\n\s+const decoded = decodeSceneLink\(linkValue\);/,
    'the boot reads the scene from the fragment first: a shared link wins over a path link');
  assert.match(studio, /open: \(fallbackMap\) => whenGameReady\(\)\.then\(\(\) => decoded\)\.then\(\(result\) => openSharedScene\(result, fallbackMap\)\)/,
    'a shared boot link opens once the game is ready');
  assert.match(studio, /^\s+bootScene,\n\s+api,\n\s+\};/m, 'the Studio runtime exposes bootScene');
  // the game's own direct /studio boot (autoEnter: false) is the path a fresh tab takes: it must open the link
  const main = read('src/main.ts');
  assert.match(main, /autoEnter: false/, 'main.ts owns the direct Studio boot');
  assert.match(main, /studioBoot\.scene = runtime\.bootScene\?\.\(\) \?\? null;\n\s+const sceneMap = studioBoot\.scene \? await studioBoot\.scene\.map : null;\n\s+return runtime\.enter\(\{\n\s+map: sceneMap \|\| STUDIO_BOOT_MAP,/,
    'the direct boot enters on the linked scene\'s battlefield');
  assert.match(main, /window\.__GAME_READY = true;\nstudioBoot\.scene\?\.open\(STUDIO_BOOT_MAP\)/, 'the direct boot opens the linked scene once ready');
  assert.match(studio, /if \(!active \|\| loading \|\| entering \|\| filmRenderer\.active \|\| recording\) \{\n\s+restoreAddress\(\);/,
    'a pasted link waits for an idle Studio and otherwise puts the address back');
  assert.match(studio, /const failure = sceneLinkOpenFailure\(result\);\n\s+panel\.notice\(failure\.message, 'error', failure\.detail\);/,
    'a refused link is explained on screen');
  // the shell and tracer types are the FX layer's own (fx/effects.ts TracerType)
  const tracerUnion = read('src/fx/effects.ts').match(/type TracerType = ([^;]+);/);
  assert.ok(tracerUnion, 'fx/effects.ts declares TracerType');
  assert.deepEqual([...tracerUnion[1].matchAll(/'([A-Z]+)'/g)].map((m) => m[1]).sort(), [...SCENE_SHELL_TYPES].sort(),
    'SCENE_SHELL_TYPES equals the FX layer\'s TracerType');
  const effectsSource = read('src/fx/effects.ts');
  for (const kind of SCENE_IMPACT_KINDS) assert.match(effectsSource, new RegExp(`'${kind}'`), `impact kind ${kind} is one the FX bus draws`);
  assert.match(studio, /window\.addEventListener\('hashchange'/, 'a link pasted into an open Studio opens');
  assert.match(studio, /!window\.confirm\(t\('studio\.sceneLink\.replace'\)\)/, 'replacing a staged scene asks first');
  for (const panel of ['src/ui/studioPanel.ts', 'src/ui/studioProductionPanel.ts']) {
    assert.match(read(panel), /copySceneLink\(S\.state\(\), browserSceneLinkEnv\(\)\)/, `${panel} offers Copy scene link`);
  }
  // nothing that reports a page sends its fragment: the entry beacons send the origin, and the game entry never mounts
  // the hosted analytics (presentation/analytics.selftest.mjs)
  const telemetry = read('src/entry/telemetry.ts');
  assert.doesNotMatch(telemetry, /location\.(href|hash)/, 'entry telemetry never reads the URL fragment');
  assert.doesNotMatch(read('index.html'), /src=["']\/src\/analytics\.ts["']/, 'the game entry mounts no analytics');
}

// 10. Nothing from a link reaches markup or script: every HTML sink in the Studio's own sources writes constant markup,
//     a translated string or an icon from the code's tables, and the notice and statuses write scene text as text.
{
  const files = execFileSync('git', ['ls-files', 'src/game/studio*.ts', 'src/ui/studio*.ts'], { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n').filter((file) => !file.endsWith('.selftest.mjs'));
  assert.ok(files.length >= 20, `the Studio's sources are found (${files.length})`);
  const constantMarkup = /^(?:''|SCENE_LINK_GLYPHS\.[a-z]+|tone === 'error' \? SCENE_LINK_GLYPHS\.broken : SCENE_LINK_GLYPHS\.done|uiIconSVG\([^)]*\)|`[^`]*`)$/;
  let sinks = 0;
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /\beval\(|new Function\(|document\.write|outerHTML\s*=|\.srcdoc\s*=|setTimeout\(\s*['"`]/, `${file}: no script sink`);
    for (const match of source.matchAll(/\.innerHTML\s*=\s*([\s\S]*?);\n|insertAdjacentHTML\(\s*'[a-z]+',\s*([\s\S]*?)\);\n/g)) {
      const rhs = (match[1] ?? match[2]).trim();
      sinks++;
      assert.match(rhs, constantMarkup, `${file}: markup is constant or translated: ${rhs.slice(0, 120)}`);
      // a template may interpolate only translations and icons, never scene or actor data
      for (const hole of rhs.matchAll(/\$\{([^}]*)\}/g)) {
        // a translation without parameters (a parameter could carry scene text) or an icon
        assert.match(hole[1].trim(), /^(?:t\('[\w.]+'\)|uiIconSVG\('[\w-]+'(?:, \d+)?\))$/, `${file}: only t('key') and icons are interpolated: ${hole[1]}`);
      }
    }
  }
  assert.ok(sinks >= 5, `the Studio's markup sinks are audited (${sinks})`);
  const panel = read('src/ui/studioPanel.ts');
  assert.match(panel, /noticeMessage\.textContent = text;\n\s+noticeDetail\.textContent = detail;/, 'the notice writes the message and detail as text');
  assert.match(read('src/ui/studioProductionPanel.ts'), /linkStatus\.textContent = /, 'the Director status writes text');
}

// 11. Boot budget: the codec, schema and messages load with the Studio's chunk, never on the game entry.
{
  const closure = staticImportClosure('src/main.ts', { root: ROOT });
  for (const file of ['src/game/studioSceneShare.ts', 'src/ui/studioSceneLinkUi.ts']) {
    assert.ok(!closure.has(file), `src/main.ts statically loads ${file}: ${importChain(closure, file)}`);
  }
}

console.log(`studioSceneShare.selftest: ${sceneFiles.length} tracked scenes round-trip (largest link ${largest} of ${SCENE_LINK_MAX_CHARS} chars); `
  + 'strict schema, prototype-safe decode, bomb-bounded inflate, 2000 fuzzed links, fragment-only URLs, both locales');
