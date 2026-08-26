import assert from 'node:assert/strict';
import { createBattleVisualPool } from './battleVisualPool.js';

function makeVisual(specId) {
  const parent = {
    removed: [],
    remove(root) { this.removed.push(root); root.parent = null; },
  };
  const root = { parent };
  return {
    specId,
    root,
    resets: 0,
    prepared: 0,
    disposed: 0,
    visible: true,
    resetForGaragePresentation() { this.resets++; },
    prepareForSimulation() { this.prepared++; },
    setVisible(value) { this.visible = value; },
    dispose() { this.disposed++; root.parent = null; },
  };
}

const pool = createBattleVisualPool({ capacity: 2 });
const t90 = makeVisual('t90a');
assert.equal(pool.release(t90), true, 'desktop pool accepts a clean bot visual');
assert.equal(t90.resets, 1, 'pooled visuals are reset before storage');
assert.equal(t90.visible, false, 'pooled visuals are hidden');
assert.equal(t90.root.parent, null, 'pooled visuals are detached from the scene');
assert.deepEqual(pool.stats(), { size: 1, capacity: 2, ids: ['t90a'] });

assert.equal(pool.take('t90a'), t90, 'the next matching battle reuses the visual');
assert.equal(t90.prepared, 1, 'reused visuals return to simulation mode');
assert.equal(pool.stats().size, 0, 'taking a visual transfers pool ownership');

const a = makeVisual('a');
const b = makeVisual('b');
const c = makeVisual('c');
pool.release(a);
pool.release(b);
pool.release(c);
assert.equal(a.disposed, 1, 'capacity eviction disposes the oldest GPU owner');
assert.deepEqual(pool.stats().ids, ['b', 'c'], 'the bounded pool retains newest visuals');
pool.clear();
assert.equal(b.disposed, 1, 'clear disposes retained visuals');
assert.equal(c.disposed, 1, 'clear disposes every retained visual');

const mobilePool = createBattleVisualPool({ capacity: 0 });
const mobileVisual = makeVisual('mobile');
assert.equal(mobilePool.release(mobileVisual), false, 'mobile retains no bot visuals');
assert.equal(mobileVisual.disposed, 1, 'mobile release disposes immediately');

console.log('battleVisualPool.selftest: detached visual reuse has bounded ownership');
