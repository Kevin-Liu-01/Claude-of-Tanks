// Couch mode's split screen, the pure part (docs/COUCH-MODE.md phase 2): the grid for each seat count and screen shape,
// equal panes tiling the screen with a gutter and never overlapping, the HUD's scale and layout size per pane, and the
// tiers that give up HUD parts from the end of the stated priority list.
import assert from 'node:assert/strict';
import {
  COUCH_HUD_PRIORITY, HUD_MIN_SCALE, MIN_PANE_LAYOUT, PANE_GUTTER_PX,
  couchHudHidden, couchHudScale, couchHudTier, couchPaneGrid, couchPaneLayout,
} from './couchPanes.ts';

// --- grids ---------------------------------------------------------------------------------------------------------
const grid = (n, w, h) => { const g = couchPaneGrid(n, w, h); return `${g.columns}x${g.rows}`; };
assert.equal(grid(1, 1920, 1080), '1x1');
assert.equal(grid(2, 1920, 1080), '2x1', 'two seats side by side on a television');
assert.equal(grid(2, 1280, 1024), '1x2', 'and stacked on a narrower screen');
assert.equal(grid(3, 1920, 1080), '2x2');
assert.equal(grid(4, 1920, 1080), '2x2');
for (const n of [5, 6, 7, 8]) assert.equal(grid(n, 1920, 1080), '4x2', `${n} seats: 4 x 2 on a wide screen`);
assert.equal(grid(8, 1440, 1080), '3x3', 'and 3 x 3 on a narrower one');
assert.equal(grid(0, 1920, 1080), '1x1');
assert.equal(grid(12, 1920, 1080), '4x2', 'never more than eight panes');

// --- rectangles ----------------------------------------------------------------------------------------------------
for (const [w, h] of [[1920, 1080], [1366, 768], [3840, 2160], [1280, 1024]]) {
  for (let n = 1; n <= 8; n++) {
    const layout = couchPaneLayout(n, w, h);
    assert.equal(layout.panes.length, n, `${n} panes at ${w}x${h}`);
    assert.equal(layout.panes.length + layout.spares.length, layout.columns * layout.rows);
    const cells = [...layout.panes, ...layout.spares];
    for (const cell of cells) {
      assert.equal(cell.width, cells[0].width, 'every pane the same size (one post chain size)');
      assert.equal(cell.height, cells[0].height);
      assert.ok(cell.x >= 0 && cell.y >= 0 && cell.x + cell.width <= w && cell.y + cell.height <= h, 'inside the screen');
    }
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i], b = cells[j];
      const apart = a.x + a.width + PANE_GUTTER_PX <= b.x || b.x + b.width + PANE_GUTTER_PX <= a.x
        || a.y + a.height + PANE_GUTTER_PX <= b.y || b.y + b.height + PANE_GUTTER_PX <= a.y;
      assert.ok(apart, `cells ${i} and ${j} keep the gutter between them at ${w}x${h}`);
    }
    const used = cells.reduce((sum, c) => sum + c.width * c.height, 0);
    assert.ok(used / (w * h) > 0.985, `the grid covers the screen but its gutters (${n} at ${w}x${h})`);
  }
}
assert.deepEqual(couchPaneLayout(2, 1920, 1080).panes, [{ x: 0, y: 0, width: 959, height: 1080 }, { x: 961, y: 0, width: 959, height: 1080 }]);
assert.deepEqual(couchPaneLayout(4, 1920, 1080).panes.map((p) => [p.x, p.y]), [[0, 0], [961, 0], [0, 541], [961, 541]],
  'seat order: left to right, then top to bottom');
assert.equal(couchPaneLayout(3, 1920, 1080).spares.length, 1, 'three seats leave one spare quarter');

// --- the HUD's scale ------------------------------------------------------------------------------------------------
assert.deepEqual(couchHudScale({ width: 1920, height: 1080 }), { scale: 1, layoutWidth: 1920, layoutHeight: 1080 }, 'one pane: the solo HUD');
const quarter = couchHudScale({ width: 959, height: 539 });
assert.equal(quarter.scale, HUD_MIN_SCALE, 'a quarter draws its HUD at 0.75, not 0.5: it shrinks slower than the pane');
assert.deepEqual([quarter.layoutWidth, quarter.layoutHeight], [1279, 719], 'laid out as a 1280 x 720 screen');
assert.equal(couchHudScale({ width: 959, height: 1080 }).scale, 1, 'a full-height half keeps the solo size');
assert.ok(couchHudScale({ width: 3000, height: 3000 }).scale <= 1, 'never larger than the solo HUD');

// --- tiers by the stated priority -------------------------------------------------------------------------------------
assert.deepEqual(couchHudHidden('full'), []);
assert.deepEqual(couchHudHidden('compact'), ['rosters', 'furniture']);
assert.deepEqual(couchHudHidden('small'), ['consumables', 'messages', 'rosters', 'furniture']);
assert.deepEqual(couchHudHidden('least'), COUCH_HUD_PRIORITY.slice(4));
for (const tier of ['full', 'compact', 'small', 'least']) {
  assert.ok(!couchHudHidden(tier).includes('sight'), 'the sight is never given up');
  const hidden = couchHudHidden(tier);
  assert.deepEqual(hidden, COUCH_HUD_PRIORITY.slice(COUCH_HUD_PRIORITY.length - hidden.length), 'a tier gives up the tail of the list');
}
const tierAt = (n, w, h) => couchHudTier(couchHudScale(couchPaneLayout(n, w, h).panes[0]));
assert.equal(tierAt(1, 1920, 1080), 'full');
assert.equal(tierAt(2, 1920, 1080), 'compact', 'a side-by-side half (959 wide) gives up the rosters and the furniture');
assert.equal(tierAt(4, 1920, 1080), 'full', 'a 1080p quarter lays out at 1280 x 720: the whole HUD');
assert.equal(tierAt(8, 1920, 1080), 'small', 'a 4 x 2 eighth (640 x 719 laid out) keeps sight to minimap');
assert.equal(couchHudTier({ layoutWidth: MIN_PANE_LAYOUT.width - 1, layoutHeight: 720 }), 'least', 'under the minimum pane');

console.log('couchPanes: PASS — grids by seat count and screen shape, equal panes inside the screen with gutters, the HUD scale, tiers from the stated priority');
