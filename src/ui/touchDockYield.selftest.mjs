// The touch action dock yields to the live reticle (verifier 2026-10-15: the keep-out assumed the ring at the screen
// centre, but hud.ts draws it at the gun's own point, and the incoming-hit wedges and their figures circle the centre
// beyond it). The dock sits under the reticle canvas, so nothing the reticle draws is covered; each tile the ink
// reaches dims, with hysteresis. This checks the geometry against brute force, the hysteresis, the More panel, and
// that hud.ts and the stylesheets keep wiring it up. The rendered receipt (tools/battle-hud-layout.browser.mjs) puts
// the gun mark on every tile and stages hits from eight bearings, reading the canvas's own pixels under the tiles.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DOCK_YIELD_ATTRIBUTE, DOCK_YIELD_ENTER_PX, DOCK_YIELD_LEAVE_PX, createDockYield, pointInSector, sectorNearRect,
} from './touchDockYield.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const hud = read('./hud.ts');
const css = read('./battleHudLayout.css');
const layout = read('./battleHudLayout.ts');

// Sectors: radius band and angular span (canvas angles, y down), across the +/-pi seam.
assert.ok(pointInSector(0, -100, 0, 0, 80, 140, -Math.PI / 2, .5), 'straight up, inside the band');
assert.ok(!pointInSector(0, -60, 0, 0, 80, 140, -Math.PI / 2, .5), 'inside the inner radius');
assert.ok(!pointInSector(100, 0, 0, 0, 80, 140, -Math.PI / 2, .5), 'outside the span');
assert.ok(pointInSector(-100, 1, 0, 0, 80, 140, Math.PI, .2) && pointInSector(-100, -1, 0, 0, 80, 140, -Math.PI, .2), 'the seam at pi');

// sectorNearRect against brute force: dense polar samples of the sector, their distance to the rect.
let seed = 0x7e1d;
const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const rectDistance = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));
let agreed = 0;
for (let run = 0; run < 400; run++) {
  const cx = 200, cy = 200, r0 = 40 + random() * 60, r1 = r0 + 20 + random() * 70, a = random() * Math.PI * 2 - Math.PI, half = .1 + random() * 1.2;
  const rect = { x: random() * 360, y: random() * 360, w: 44 + random() * 10, h: 44 + random() * 10 };
  const margin = random() < .5 ? DOCK_YIELD_ENTER_PX : DOCK_YIELD_LEAVE_PX;
  let nearest = Infinity;
  for (let r = r0; r <= r1 + 1e-9; r += .5) {
    const steps = Math.max(8, Math.ceil(2 * half * r / .5));
    for (let i = 0; i <= steps; i++) {
      const t = a - half + (2 * half * i) / steps;
      nearest = Math.min(nearest, rectDistance(cx + Math.cos(t) * r, cy + Math.sin(t) * r, rect));
    }
  }
  const near = sectorNearRect(cx, cy, r0, r1, a, half, rect.x, rect.y, rect.w, rect.h, margin);
  if (nearest <= margin - .75) assert.ok(near, `run ${run}: ink ${nearest.toFixed(2)} px from the tile is near (margin ${margin})`);
  if (near) assert.ok(nearest <= margin + 3 + .75, `run ${run}: a near verdict means ink within the margin and the 3 px sampling (${nearest.toFixed(2)})`);
  agreed++;
}
assert.equal(agreed, 400);

// The yield: tiles dim when ink reaches them, clear when it leaves, with hysteresis, and only panel tiles that show.
const tile = (x, y, panel = false) => {
  const el = { attrs: new Set(), writes: 0, toggleAttribute(name, force) { this.writes++; if (force) this.attrs.add(name); else this.attrs.delete(name); return !!force; } };
  return { el, x, y, w: 48, h: 48, panel };
};
const dimmed = (t) => t.el.attrs.has(DOCK_YIELD_ATTRIBUTE);
{
  const y = createDockYield();
  assert.equal(y.active, false, 'no tiles: hud.ts reports no ink');
  const a = tile(100, 100), b = tile(160, 100), panel = tile(100, 40, true);
  y.setTiles([a, b, panel]);
  assert.equal(y.active, true);
  // The ring (r 30) centred 40 px left of tile a's left edge reaches 10 px short of it: not yet.
  y.begin(); y.disc(60, 124, 30); y.commit();
  assert.deepEqual([dimmed(a), dimmed(b)], [false, false], 'ink 10 px away dims nothing');
  // It drifts to 1 px off tile a: a dims (within ENTER_PX), b does not.
  y.begin(); y.disc(69, 124, 30); y.commit();
  assert.deepEqual([dimmed(a), dimmed(b)], [true, false], `ink within ${DOCK_YIELD_ENTER_PX} px dims that tile`);
  // Breathing back 6 px: a stays dimmed (the ink is within LEAVE_PX), so a ring at the edge cannot flicker it.
  y.begin(); y.disc(63, 124, 30); y.commit();
  assert.equal(dimmed(a), true, `a dimmed tile holds until the ink is ${DOCK_YIELD_LEAVE_PX} px away`);
  y.begin(); y.disc(58, 124, 30); y.commit();
  assert.equal(dimmed(a), false, 'and clears beyond it');
  // Writes only on change.
  const writes = a.el.writes;
  for (let i = 0; i < 5; i++) { y.begin(); y.disc(58, 124, 30); y.commit(); }
  assert.equal(a.el.writes, writes, 'an unchanged frame writes no attribute');
  // A wedge sector over tile b and a damage figure's box over tile a.
  y.begin(); y.sector(184, 300, 120, 190, -Math.PI / 2, .3); y.rect(120, 130, 30, 14); y.commit();
  assert.deepEqual([dimmed(a), dimmed(b)], [true, true], 'wedges and figures dim the tiles under them');
  // A panel tile yields only while the More panel is open.
  y.begin(); y.disc(124, 64, 20); y.commit();
  assert.equal(dimmed(panel), false, 'a closed panel\'s tile never dims');
  y.setOpen(true);
  y.begin(); y.disc(124, 64, 20); y.commit();
  assert.equal(dimmed(panel), true, 'an open panel\'s tile does');
  y.setOpen(false);
  y.begin(); y.disc(124, 64, 20); y.commit();
  assert.equal(dimmed(panel), false, 'and clears when the panel closes');
  // Opening the panel applies the last painted frame's ink at once (no repaint needed).
  y.begin(); y.disc(124, 64, 20); y.commit();
  y.setOpen(true);
  assert.equal(dimmed(panel), true, 'the panel opens dimmed where ink already is');
  y.setOpen(false);
  // A new placement clears the old tiles' state and applies the last frame's ink to the new tiles at once: a relayout
  // between painted frames (a hit notice while the canvas keeps its pixels) must not leave a tile under ink undimmed.
  y.begin(); y.disc(124, 124, 30); y.commit();
  assert.equal(dimmed(a), true);
  const a2 = tile(100, 100), far = tile(300, 300);
  y.setTiles([a2, far]);
  assert.equal(dimmed(a), false, 'replaced tiles are left undimmed');
  assert.deepEqual([dimmed(a2), dimmed(far)], [true, false], 'the new tile under the last frame\'s ink dims at once');
  y.setTiles([]);
  assert.equal(y.active, false);
}

// hud.ts reports the reticle's live ink while tiles are published, and the layout publishes them.
for (const [pattern, what] of [
  [/const dockYield = createDockYield\(\);\n\s*installBattleHudLayout\(root, dockYield\);/, 'the HUD hands the layout owner its yield'],
  [/const yieldInk = dockYield\.active;\n\s*if \(yieldInk\) dockYield\.begin\(\);/, 'each painted frame begins the ink'],
  [/drawHitMark\(aimView, lastTimeS\);\n\s*if \(yieldInk\) dockYield\.commit\(\);/, 'and commits it after the last layer'],
  [/if \(dockYield\.active\) reportReticleInk\(view, draw\);/, 'the ring and gun mark wherever the gun points'],
  [/dockYield\.disc\(draw\.circleX, draw\.circleY, draw\.radius \+ 4\);/, 'the ring at the gun\'s point'],
  [/if \(!draw\.single && view\.gunX != null && view\.gunY != null\) dockYield\.disc\(view\.gunX, view\.gunY, 18\);/, 'the physical gun mark'],
  [/if \(!draw\.single\) return;[\s\S]{0,300}yieldFootprint = touchReticleFootprint\(w, h\);/, 'a single sight\'s whole footprint, moved with it'],
  [/dockYield\.sector\(frame\.centerX, frame\.centerY, frame\.radius - 3, frame\.radius \+ paint\.thickness \+ 1,\n\s*paint\.angle, paint\.halfAngle\);/, 'each incoming-hit wedge'],
  [/if \(dockYield\.active\) dockYield\.rect\(x - labelHalf - 3, y - fontPx \/ 2 - 3, labelHalf \* 2 \+ 6, fontPx \+ 6\);/, 'each damage figure'],
  [/dockYield\.rect\(critX - critHalf - 3, critY - critFontPx \/ 2 - 3, critHalf \* 2 \+ 6, critFontPx \+ 6\);/, 'each CRIT'],
  [/dockYield\.disc\(view\.cx, view\.cy, visual\.radius \+ visual\.length \+ 3\);/, 'the hit-confirm shards'],
]) assert.match(hud, pattern, what);
assert.match(layout, /dockYield\.setTiles\(tiles\);/, 'the layout owner publishes the tiles');
assert.match(layout, /dockYield\?\.setOpen\(open\);/, 'and the More panel\'s state');
// The stacking: lens shading under the dock, the dock under the reticle (also with the panel open), dimmed tiles.
assert.match(hud, /\.cot-ret\{position:absolute;z-index:var\(--hud-layer-sight\);/);
assert.match(hud, /\.cot-ret-lens\{position:absolute;z-index:calc\(var\(--hud-layer-sight\) - 1\);inset:0;width:100%;height:100%;display:block;pointer-events:none;\}/);
assert.ok(hud.indexOf("el('canvas', 'cot-ret-lens', root)") < hud.indexOf("el('div', 'cot-vehicle-controls', root)"), 'the lens comes before the row in the HUD (same layer: the row draws over it)');
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\] \.cot-vehicle-controls\{z-index:calc\(var\(--hud-layer-sight\) - 1\)\}/);
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\]\[data-hud-dock-open\] \.cot-ret\{z-index:calc\(var\(--hud-layer-score\) \+ 3\)\}/);
assert.match(css, /body\.cot-touch-layout\[data-hud-dock\] \.cot-vehicle-controls>button\[data-ret-yield\]\{filter:opacity\(\.38\)\}/);
assert.match(read('./battleUiVisibility.css'), /:not\(\.cot-ret,\.cot-ret-lens,/, 'the minimal HUD keeps the lens with the reticle');
// The lens is painted only when the scope's shading changes (not every frame) and hidden outside the scope.
assert.match(hud, /if \(lensW === w && lensH === h && lensZoom === scopeGradZoom && Math\.abs\(lensAlpha - alpha\) < 1e-3\) return;/);
assert.match(hud, /if \(mode === 'sniper' && !playerRef\?\.aerial\?\.active\) drawScope\(aimView\);\n\s*else clearScopeLens\(\);/);

console.log(`touchDockYield: sector-vs-tile verdicts agree with brute force on ${agreed} random cases; tiles dim within ${DOCK_YIELD_ENTER_PX} px of live ink and clear beyond ${DOCK_YIELD_LEAVE_PX} px, write only on change, panel tiles only while open; hud.ts reports the ring and gun mark at the gun's point, a single sight's footprint, wedges, figures and hit marks; the dock sits under the reticle and over the lens`);
