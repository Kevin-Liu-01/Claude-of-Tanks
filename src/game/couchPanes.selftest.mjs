// Couch mode's split screen, the pure part (docs/COUCH-MODE.md phase 2): the grid for each seat count and screen shape,
// equal panes tiling the screen with a gutter and never overlapping, the HUD's scale and layout size per pane, and the
// tiers that give up HUD parts from the end of the stated priority list.
import assert from 'node:assert/strict';
import {
  CORE_MIN_CELL, COUCH_HUD_CORE, COUCH_HUD_PRIORITY, PANE_GUTTER_PX, couchHudFitStep, couchPaneGrid, couchPaneLayout,
  couchSplitCapacity,
} from './couchPanes.ts';

// --- grids ---------------------------------------------------------------------------------------------------------
const grid = (n, w, h) => { const g = couchPaneGrid(n, w, h); return `${g.columns}x${g.rows}`; };
assert.equal(grid(1, 1920, 1080), '1x1');
assert.equal(grid(2, 1920, 1080), '2x1', 'two seats side by side on a television');
assert.equal(grid(2, 1280, 1024), '1x2', 'and stacked on a narrower screen');
assert.equal(grid(3, 1920, 1080), '2x2');
assert.equal(grid(4, 1920, 1080), '2x2');
for (const n of [5, 6]) assert.equal(grid(n, 1920, 1080), '3x2', `${n} seats: 3 x 2 on a wide screen`);
for (const n of [7, 8]) assert.equal(grid(n, 1920, 1080), '3x3', `${n} seats at 1080p: 3 x 3 (639 x 358 holds the core; a 4 x 2 eighth, 478 wide, does not)`);
for (const n of [7, 8]) assert.equal(grid(n, 2560, 1440), '4x2', `${n} seats at 1440p: 4 x 2 (638 x 719)`);
assert.equal(grid(6, 1280, 1024), '2x3', 'and 2 x 3 on a narrower one');
assert.equal(grid(8, 1440, 1080), '3x3', 'and 3 x 3 on a narrower one');
assert.equal(grid(2, 1024, 600), '1x2', 'side by side would be 511 wide: stacked, 1024 x 299, holds the core');
assert.equal(grid(0, 1920, 1080), '1x1');
assert.equal(grid(12, 1920, 1080), '3x3', 'never more than eight panes');

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

// --- the capacity: as many seats as the screen's panes hold the core at the solo size ------------------------------
assert.equal(couchSplitCapacity(1920, 1080), 8, '1080p: eight panes in 3 x 3 (639 x 358)');
assert.equal(couchSplitCapacity(2560, 1440), 8, '1440p: all eight (4 x 2, 638 x 719)');
assert.equal(couchSplitCapacity(1366, 768), 4, 'a 1366 x 768 laptop: four (2 x 2, 682 x 383; 3 x 2 is 454 wide, 2 x 3 254 tall)');
assert.equal(couchSplitCapacity(1280, 720), 4, '720p: four (2 x 2, 639 x 359)');
assert.equal(couchSplitCapacity(1024, 600), 2, 'a small window: two side by side would be 511 wide, stacked 1024 x 299');
for (const [w, h] of [[1920, 1080], [2560, 1440], [1366, 768], [1024, 600]]) {
  const pane = couchPaneLayout(couchSplitCapacity(w, h), w, h).panes[0];
  assert.ok(pane.width >= CORE_MIN_CELL.width && pane.height >= CORE_MIN_CELL.height, `the capacity's panes hold the core at ${w}x${h}`);
}

// --- the HUD's fit: the solo size, never squished; parts given up by the stated list -------------------------------------
assert.deepEqual(COUCH_HUD_PRIORITY.slice(-3), ['consumables', 'minimap', 'rosters'],
  'the owner\'s order: of the parts in a clash, the team lists go first, then the minimap, then the consumables row');
assert.deepEqual([...COUCH_HUD_CORE], ['sight', 'health', 'ammunition', 'speed'], 'the core: sight, hull points, ammunition and reload, speed');
assert.ok(COUCH_HUD_CORE.every((part, i) => COUCH_HUD_PRIORITY[i] === part), 'the core heads the list');
const box = (part, x0, y0, x1, y1, squeezed = false) => ({ part, x0, y0, x1, y1, squeezed });
{
  const roomy = [box('health', 10, 300, 180, 520), box('ammunition', 300, 470, 520, 530), box('speed', 190, 440, 280, 530),
    box('minimap', 740, 300, 950, 530), box('rosters', 0, 40, 190, 200)];
  assert.deepEqual(couchHudFitStep(roomy, 959, 539, new Set()), { fits: true, drop: null, coreFits: true, clashing: [] }, 'a pane that holds every part keeps them');
  // the minimap over the ammunition in a narrow pane: the least important part shown goes first (the rosters), then the map
  const narrow = [box('health', 10, 300, 180, 520), box('ammunition', 200, 470, 420, 530), box('speed', 190, 380, 280, 460),
    box('minimap', 300, 300, 470, 520), box('rosters', 0, 40, 190, 200), box('consumables', 280, 440, 470, 480)];
  const dropped = new Set();
  const order = [];
  for (let i = 0; i < 6; i++) {
    const step = couchHudFitStep(narrow.filter((b) => !dropped.has(b.part)), 478, 539, dropped);
    if (!step.drop) { assert.equal(step.fits, true); break; }
    dropped.add(step.drop);
    order.push(step.drop);
  }
  assert.deepEqual(order, ['minimap', 'consumables'], 'the least important part in a clash goes first, until it fits (the rosters clash with nothing and stay)');
  // two parts clash: the less important one goes, whatever else is shown
  assert.equal(couchHudFitStep([box('objective', 400, 0, 560, 40), box('rosters', 380, 20, 600, 60), box('consumables', 0, 0, 10, 10)], 959, 539, new Set()).drop,
    'rosters', 'the team lists before the objective');
  // a map the pane would draw under its solo size (a short pane's 32vh cap) does not fit as it is
  const squeezed = [box('health', 10, 300, 180, 520), box('minimap', 740, 300, 900, 460, true)];
  assert.equal(couchHudFitStep(squeezed, 959, 539, new Set()).drop, 'minimap', 'never a squished minimap');
  // the core alone not fitting is said, and nothing of it is given up
  const tight = [box('health', 10, 300, 200, 520), box('ammunition', 150, 470, 400, 530), box('speed', 190, 440, 280, 530)];
  const tightStep = couchHudFitStep(tight, 400, 539, new Set());
  assert.deepEqual([tightStep.fits, tightStep.drop, tightStep.coreFits], [false, null, false], 'the core is never given up');
  assert.deepEqual([...tightStep.clashing].sort(), ['ammunition', 'health', 'speed'], 'and the clash is named');
  assert.equal(couchHudFitStep([box('health', -40, 300, 170, 520)], 400, 539, new Set()).coreFits, false, 'a core part off the pane');
}

console.log('couchPanes: PASS — grids by seat count and screen shape, equal panes inside the screen with gutters, the HUD at its solo size, parts given up by the stated priority, the core kept');
