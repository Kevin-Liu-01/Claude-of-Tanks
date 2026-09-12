import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  TREE_ROOT_DECAL_MAX_RADIUS_M,
  treeRootDecalAreaM2,
  treeRootDecalRadius,
} from './treeGrounding.ts';

assert.equal(treeRootDecalRadius(1.3), 1.3,
  'ordinary trunks keep their authored root radius');
assert.equal(treeRootDecalRadius(8), TREE_ROOT_DECAL_MAX_RADIUS_M,
  'a canopy-sized input cannot recreate the overlapping fake-shadow layer');
assert.equal(treeRootDecalRadius(-1), 0,
  'invalid radii do not create inverted decals');
assert.ok(treeRootDecalAreaM2(20) <= Math.PI * TREE_ROOT_DECAL_MAX_RADIUS_M ** 2,
  'one tree contact decal has a bounded projected fill area');

const vegetationSource = await readFile(new URL('./vegetation.ts', import.meta.url), 'utf8');
// Shadow redesign 2026-09-12: crown shadows are back, but only through the
// engine's shadow-only render layer. The proxy hull is marked shadow-only
// (never a forward draw), casts and does not receive; alpha foliage still
// stays out of the shadow pass and trunks still refuse crawling self-shadow.
assert.match(vegetationSource, /function makeCanopyShadowProxy\([\s\S]{0,600}markShadowOnly\(proxy\);[\s\S]{0,120}proxy\.castShadow = true;[\s\S]{0,80}proxy\.receiveShadow = false;/,
  'crown shadow proxies are shadow-only casters');
assert.match(vegetationSource, /canopyShadowProxyMat = new THREE\.MeshBasicMaterial\(\{ colorWrite: false, depthWrite: false \}\)/,
  'the proxy material can never write a forward color');
assert.doesNotMatch(vegetationSource, /SHADOW_LOBES|buildCanopyShadowProxy/,
  'the forward-pass colorWrite-off proxy experiment stays retired');
assert.match(vegetationSource, /trunk\.receiveShadow = false;[\s\S]{0,900}foliage\.castShadow = false;/,
  'stable trunk casters remain while alpha foliage stays out of the shadow pass');

console.log('treeGrounding self-test passed');
