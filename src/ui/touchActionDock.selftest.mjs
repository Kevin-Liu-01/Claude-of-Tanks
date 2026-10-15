// Touch action dock (owner 2026-10-14: "find a better way to show the stuff u can do row on mobile").
// The dock's placement is computed here from the layout code itself for the three phone viewports the owner plays
// on, against the fixed touch controls measured from the production HUD fixture
// (tools/fixtures/battle-hud-layout.html, every touch control at its CSS position, no safe-area insets). Every tile
// must clear every control, stay on screen, keep a 44 px touch target and keep the row's order; the desktop strip
// must be untouched. tools/battle-hud-layout.browser.mjs re-measures the rendered page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  placeTouchActionDock, createCooldownSweep,
  TOUCH_ACTION_TILE_PX, TOUCH_ACTION_GAP_PX, TOUCH_ACTION_CLEARANCE_PX,
} from './touchActionDock.ts';

const css = readFileSync(new URL('./battleHudLayout.css', import.meta.url), 'utf8');
const layout = readFileSync(new URL('./battleHudLayout.ts', import.meta.url), 'utf8');

const intersects = (a, b, gap = 0) => a.x < b.x + b.w + gap && a.x + a.w > b.x - gap && a.y < b.y + b.h + gap && a.y + a.h > b.y - gap;

function checkPlacement(name, { width, height, obstacles, soft = {}, anchor }, count) {
  const dock = placeTouchActionDock({ width, height, count, obstacles: Object.values(obstacles), soft: Object.values(soft), anchor });
  assert.ok(dock, `${name}: ${count} controls must fit`);
  assert.equal(dock.tiles.length, count, `${name}: one tile per control`);
  assert.ok(dock.tile === TOUCH_ACTION_TILE_PX || dock.tile === 44, `${name}: 48 px tiles, 44 px only when crowded`);
  // 48 px tiles keep the full clearance from every control and from the open ammo drawer; the crowded fallback keeps
  // 44 px targets and at least 4 px from every fixed control.
  const clearance = dock.tile === TOUCH_ACTION_TILE_PX ? TOUCH_ACTION_CLEARANCE_PX : 4;
  const avoid = dock.tile === TOUCH_ACTION_TILE_PX ? { ...obstacles, ...soft } : obstacles;
  for (const [i, tile] of dock.tiles.entries()) {
    assert.ok(tile.w >= 44 && tile.h >= 44, `${name}: tile ${i} is a 44 px touch target`);
    assert.ok(tile.x >= 12 && tile.y >= 12 && tile.x + tile.w <= width - 12 && tile.y + tile.h <= height - 12,
      `${name}: tile ${i} stays 12 px inside the screen`);
    for (const [key, o] of Object.entries(avoid)) {
      assert.ok(!intersects(tile, o), `${name}: tile ${i} overlaps ${key}`);
      assert.ok(!intersects(tile, o, clearance - .01), `${name}: tile ${i} within ${clearance} px of ${key}`);
    }
    for (const other of dock.tiles.slice(i + 1)) assert.ok(!intersects(tile, other), `${name}: tiles overlap`);
    // Reading order: the next control is to the right on the same row, or starts the next row at the left edge.
    const next = dock.tiles[i + 1];
    if (next) {
      const sameRow = next.y === tile.y;
      assert.ok(sameRow ? next.x === tile.x + dock.tile + TOUCH_ACTION_GAP_PX
        : next.x === dock.x && next.y === tile.y + dock.tile + TOUCH_ACTION_GAP_PX, `${name}: tiles keep the row's order`);
    }
  }
  assert.equal(dock.tiles[0].x, dock.x, `${name}: the first control (jump, when the mode has one) is the leftmost tile`);
  assert.equal(dock.tiles[0].y, dock.y, `${name}: the first control is on the top row`);
  return dock;
}

// ---------------------------------------------------------------------------------------------------------------
// Measured viewports (touchActionDock.fixture.json): CSS px rects of the visible fixed touch controls, read from the
// production HUD fixture in Chromium touch emulation on 2026-10-14 (idle state: M1A3 kit, Mars ruleset, identical
// before and after this change), with the ammo selector at its open extent (three slots, 56 px each). measuredDock5
// is where the rendered page put the five-control dock: the layout code below must reproduce it exactly.
const VIEWPORTS = JSON.parse(readFileSync(new URL('./touchActionDock.fixture.json', import.meta.url), 'utf8'));
for (const viewport of VIEWPORTS) {
  const name = `${viewport.width}x${viewport.height}`;
  for (let count = 1; count <= 7; count++) {
    const dock = checkPlacement(name, viewport, count);
    if (count === 5 && viewport.measuredDock5) assert.deepEqual({ x: dock.x, y: dock.y, w: dock.w, h: dock.h }, viewport.measuredDock5, `${name}: matches the rendered dock`);
    if (count <= viewport.singleRowUpTo) assert.equal(dock.rows, 1, `${name}: ${count} controls stay one row`);
    assert.ok(dock.rows <= 3, `${name}: never more than three rows`);
    if (viewport.owner) {
      assert.equal(dock.tile, TOUCH_ACTION_TILE_PX, `${name}: full 48 px tiles`);
      // Thumb reach: below the top HUD band.
      assert.ok(dock.y >= viewport.height * .35, `${name}: ${count} controls stay in the thumbs' half (${dock.y})`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Property sweep: seeded obstacle sets (no Math.random). A placement, when there is one, obeys every invariant.
let seed = 0x5eed;
const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
let placed = 0;
for (let run = 0; run < 400; run++) {
  const width = 320 + Math.floor(random() * 700), height = 300 + Math.floor(random() * 600);
  const obstacles = {};
  for (let k = 0; k < 2 + Math.floor(random() * 10); k++) {
    obstacles[`o${k}`] = { x: Math.floor(random() * width), y: Math.floor(random() * height),
      w: 30 + Math.floor(random() * 120), h: 30 + Math.floor(random() * 120) };
  }
  const soft = run % 2 ? { s: { x: Math.floor(random() * width), y: Math.floor(random() * height), w: 112, h: 52 } } : {};
  const count = 1 + Math.floor(random() * 7);
  const dock = placeTouchActionDock({ width, height, count, obstacles: Object.values(obstacles), soft: Object.values(soft) });
  if (!dock) continue;
  placed++;
  checkPlacement(`random ${run}`, { width, height, obstacles, soft }, count);
}
assert.ok(placed > 300, `most random layouts admit a dock (${placed}/400)`);

// One row wins whenever it fits; the dock prefers the anchor; nothing fits returns null; no controls means no dock.
const open = placeTouchActionDock({ width: 800, height: 400, count: 7, obstacles: [] });
assert.equal(open.rows, 1);
assert.equal(open.w, 7 * TOUCH_ACTION_TILE_PX + 6 * TOUCH_ACTION_GAP_PX);
assert.equal(open.y + open.h, 400 - 12, 'with no anchor the dock rests on the bottom edge');
assert.ok(Math.abs(open.x + open.w / 2 - 400) <= 1, 'and is centred');
const anchored = placeTouchActionDock({ width: 800, height: 400, count: 2, obstacles: [], anchor: { x: 700, y: 100 } });
assert.ok(Math.abs(anchored.x + anchored.w / 2 - 700) <= 1 && Math.abs(anchored.y + anchored.h / 2 - 100) <= 1, 'the dock centres on its anchor when free');
const wall = { x: 0, y: 0, w: 800, h: 400 };
assert.equal(placeTouchActionDock({ width: 800, height: 400, count: 3, obstacles: [wall] }), null);
assert.equal(placeTouchActionDock({ width: 800, height: 400, count: 0, obstacles: [] }), null);
// A narrow lane wraps into rows rather than scrolling: 7 controls in a 200 px wide gap become 3 x 3.
const lane = placeTouchActionDock({ width: 400, height: 400, count: 7,
  obstacles: [{ x: 0, y: 0, w: 100, h: 400 }, { x: 300, y: 0, w: 100, h: 400 }] });
assert.equal(lane.columns, 3);
assert.equal(lane.rows, 3);
// Crowding relaxes in steps: a 44 px tile before giving up the open drawer, the drawer before returning nothing.
const gap44 = placeTouchActionDock({ width: 400, height: 200, count: 4, obstacles: [{ x: 0, y: 0, w: 400, h: 135 }] });
assert.equal(gap44.tile, 44, 'a strip too short for 48 px takes 44 px tiles');
const drawer = placeTouchActionDock({ width: 400, height: 200, count: 4, obstacles: [{ x: 0, y: 0, w: 400, h: 130 }],
  soft: [{ x: 0, y: 130, w: 400, h: 20 }] });
assert.ok(drawer && drawer.tile === 44 && drawer.y >= 134 && drawer.y < 150, 'the open drawer is given up last, fixed controls never');

// Cooldown sweep: the first remaining time is the whole cooldown; snapshot jitter never restarts it; ready resets it.
const sweep = createCooldownSweep();
assert.equal(sweep(0), 0);
assert.equal(sweep(20), 1);
assert.equal(sweep(10), .5);
assert.equal(sweep(10.2), 10.2 / 20, 'a corrected snapshot does not restart the sweep');
assert.equal(sweep(0), 0);
assert.equal(sweep(6), 1, 'a new cooldown latches its own length');
assert.equal(sweep(Number.NaN), 0);

// ---------------------------------------------------------------------------------------------------------------
// Styles: the dock is touch-only; the desktop strip keeps its 74 x 32 text cells and its own placement.
assert.match(css, /\.cot-vehicle-controls>button\{pointer-events:auto;position:static!important;transform:none!important;flex:0 0 74px;width:74px!important;height:32px!important;/,
  'the desktop strip is unchanged');
const touchRules = css.match(/body\.cot-touch-layout\[data-hud-dock\] \.cot-vehicle-controls[^{]*\{[^}]*\}/g) || [];
assert.ok(touchRules.length >= 12, 'the dock styles are scoped to a placed touch dock');
assert.ok(css.includes('body.cot-touch-layout .cot-vehicle-controls>button{height:44px!important;min-height:44px;grid-template-rows:1fr;padding-block:5px}'),
  'with no spot for a dock the touch strip keeps its former 44 px styles');
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\] \.cot-vehicle-controls\{display:grid;grid-template-columns:repeat\(var\(--hud-systems-columns,4\),var\(--hud-systems-tile,48px\)\);grid-auto-rows:var\(--hud-systems-tile,48px\);gap:6px;[^}]*overflow:visible\}/,
  'touch tiles wrap on the dock grid and never scroll');
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\] \.cot-vehicle-controls>button\{[^}]*width:var\(--hud-systems-tile,48px\)!important;height:var\(--hud-systems-tile,48px\)!important;min-width:var\(--hud-systems-tile,48px\)!important/);
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\] \.cot-vehicle-controls>button\.cot-special\{inset:auto!important\}/, 'older special-action offsets never shift a tile');
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\] \.cot-vehicle-controls \.system-status\{display:block;grid-area:auto;position:absolute;/, 'the charge badge sits in the tile corner, not the caption row');
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\] \.cot-vehicle-controls>button \.sk\{display:none\}/, 'no keycaps on touch');
assert.match(css, /conic-gradient\(rgba\(2,6,9,\.74\) calc\(var\(--cd,0\) \* 360deg\),transparent 0\)/, 'cooldowns sweep');
for (const rule of touchRules) {
  assert.doesNotMatch(rule, /(?:^|[;{])order:|grid-auto-flow:[^;}]*dense|row-reverse|column-reverse|direction:rtl/,
    'the dock never reorders the row: the first control in the row (jump-first is its own rule) stays first');
}
assert.equal(TOUCH_ACTION_GAP_PX, 6);
assert.match(css, new RegExp(`gap:${TOUCH_ACTION_GAP_PX}px;width:max-content`), 'the stylesheet gap matches the layout code');
// The layout owner places the dock only on touch and keeps the desktop path's arithmetic.
assert.match(layout, /const dock = touch && systems && systemsElement \? placeDock\(systemsElement, width, height\) : null;/);
assert.match(layout, /let systemsLeft = Math\.max\(12, Math\.min\(width - dockWidth - 12,\n\s+\(ammo \? ammo\.left \+ ammo\.width \/ 2 : width \/ 2\) - dockWidth \/ 2\)\);/);

console.log(`touchActionDock: ${VIEWPORTS.map(v => `${v.width}x${v.height}`).join(', ')} x 1-7 controls clear every touch control (48 px tiles; 44 px when crowded); ${placed} random layouts; cooldown sweep; desktop strip unchanged`);
