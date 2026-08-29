import assert from 'node:assert/strict';
import { SHOT_VIEWS } from './shotContract.ts';
import { createShotViews } from './shotViews.ts';

const recipes = createShotViews({});
const names = Object.keys(recipes).sort();

assert.deepEqual(names, [...SHOT_VIEWS].sort(), 'every declared shot has exactly one recipe');
for (const name of SHOT_VIEWS) {
  assert.equal(typeof recipes[name], 'function', `${name} recipe is callable`);
}

console.log(`shot views self-test passed (${names.length} deterministic recipes)`);
