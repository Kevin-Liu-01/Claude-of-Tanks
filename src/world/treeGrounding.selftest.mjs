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
assert.doesNotMatch(vegetationSource, /canopyShadowProxy|buildCanopyShadowProxy|SHADOW_LOBES/,
  'tree crowns must not project opaque blob proxies onto roads or terrain');
assert.match(vegetationSource, /trunk\.receiveShadow = false;[\s\S]{0,900}foliage\.castShadow = false;/,
  'stable trunk casters remain while alpha foliage stays out of the shadow pass');

console.log('treeGrounding self-test passed');
