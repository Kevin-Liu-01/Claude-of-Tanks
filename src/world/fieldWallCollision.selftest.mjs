// The dry-stone field walls' crushable spans (physics stream PH.15, 2026-10-15; fieldWallCollision.ts). On walls laid by
// the field works over a flat field and a sloped one (the fieldWalls.selftest fixture):
//   - the spans run at most FIELD_WALL_SPAN_M along their line, their parts at most FIELD_WALL_PART_M;
//   - every standing slot's middle, at half its height, lies inside a span's shell record; a breach carries none;
//   - the records stand from the sunk foot to the crown and no higher than a metre over the ground;
//   - a shell flown at the wall across its line stops on a record within the wall's width of the line;
//   - each tier stands the records of the walls it draws (a phone its own lines and slots), build after build;
// and the press: a span's crush presses its vertices in a batch's cell and a stone form into a strip a fifth of their
// height over the ground and touches no vertex out of its reach; a vertex two crushed spans reach stands again only once
// neither is crushed; a rematch stands every vertex exactly as it was, normals too; the crush runs through the span's
// clutter (crushableClutter.ts) with its records ghosted for the shells.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { buildFieldWallFine, buildFieldWorks, planWallSlots } from './fieldWorks.ts';
import { FIELD_WALL_PART_M, FIELD_WALL_SPAN_M, FieldWallCrush, fieldWallSpans } from './fieldWallCollision.ts';
import { pointInsideCollisionRecord, rayCollisionRecord } from './collision.ts';
import { CrushableClutter } from './crushableClutter.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const drain = (it) => { let s = it.next(); while (!s.done) s = it.next(); return s.value; };
const fieldOf = (lines, slope) => ({
  getHeightAt: (x, z) => 2 + slope * x + 0.3 * Math.sin(z * 0.05), getNormalAt: () => ({ y: slope ? 0.97 : 1 }), getWaterMaskAt: () => 0,
  _villageMask: () => 0, _roadDist: () => 99,
  _landUseAt: (x, z, out) => {
    let e = 99;
    for (const [x0, z0, x1, z1] of lines) {
      const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2));
      e = Math.min(e, Math.hypot(x - x0 - dx * t, z - z0 - dz * t));
    }
    out.active = e < 6 ? 1 : 0; out.edgeM = e; out.boundary = 3; out.track = 0; out.hedge = 0;
    return out;
  },
});
const lay = (ground, mobile) => drain(buildFieldWorks(ground, new SimplexNoise({ random: mulberry32(9299) }),
  { walls: true, banks: false, spawns: [{ x: 0, z: -400 }], mobile, merged: false }));
const inside = (record, x, y, z) => {
  if (y < record.min[1] || y > record.max[1]) return false;
  const sh = record.shape2;
  const parts = sh?.kind === 'compound' ? sh.parts : [sh];
  return parts.some((part) => pointInsideCollisionRecord(record, part, x, z) && (part.y0 === undefined || (y >= part.y0 && y <= part.y1)));
};
const pack = (spans) => JSON.stringify(spans.map((s) => [s.obstacle, s.collider]));

let slotsChecked = 0, breaches = 0, shells = 0;
for (const [name, lines, slope] of [['flat', [[-200, 0, 200, 0]], 0], ['sloped', [[-150, -40, 120, 60], [-100, 80, 90, -70]], 0.08]]) {
  const ground = fieldOf(lines, slope);
  const heightAt = (x, z) => ground.getHeightAt(x, z);
  for (const mobile of [false, true]) {
  const tier = mobile ? `${name} (phone)` : name;
  const desk = lay(ground, mobile);
  assert.ok(desk.walls && desk.walls.lines.length, `${tier}: the walls report their lines`);
  const spans = fieldWallSpans(desk.walls.lines, desk.walls.noise, heightAt, mobile);
  assert.equal(pack(fieldWallSpans(lay(ground, mobile).walls.lines, desk.walls.noise, heightAt, mobile)), pack(spans), `${tier}: the same records build after build`);
  assert.ok(spans.length > 10, `${name}: the walls stand spans (${spans.length})`);
  for (const span of spans) {
    assert.ok(span.halfAlong * 2 <= FIELD_WALL_SPAN_M + 0.05, `${name}: a span runs at most ${FIELD_WALL_SPAN_M} m (${(span.halfAlong * 2).toFixed(2)})`);
    assert.equal(span.obstacle.kind, 'field-wall');
    assert.equal(span.collider.kind, 'field-wall');
    const parts = span.collider.shape2.kind === 'compound' ? span.collider.shape2.parts : [span.collider.shape2];
    for (const part of parts) {
      const p = part.points, run = Math.max(Math.hypot(p[2] - p[0], p[3] - p[1]), Math.hypot(p[4] - p[2], p[5] - p[3]));
      assert.ok(run <= FIELD_WALL_PART_M + 0.05, `${name}: a part runs at most ${FIELD_WALL_PART_M} m (${run.toFixed(2)})`);
    }
    assert.ok(span.collider.max[1] <= Math.max(...[0, 2, 4, 6].map((c) => heightAt(parts[0].points[c], parts[0].points[c + 1]))) + 1.6,
      `${name}: no record stands far over its ground`);
  }
  // each line's slots against the records
  const noise = desk.walls.noise;
  for (const pts of desk.walls.lines) {
    const n = pts.length / 2, S = [0];
    for (let k = 1; k < n; k++) S.push(S[k - 1] + Math.hypot(pts[k * 2] - pts[k * 2 - 2], pts[k * 2 + 1] - pts[k * 2 - 1]));
    const L = S[n - 1];
    if (L < 1) continue;
    const at = (s) => { let k = 0; while (k < n - 2 && S[k + 1] < s) k++; const t = Math.min(1, Math.max(0, (s - S[k]) / Math.max(1e-6, S[k + 1] - S[k])));
      return [pts[k * 2] + (pts[k * 2 + 2] - pts[k * 2]) * t, pts[k * 2 + 1] + (pts[k * 2 + 3] - pts[k * 2 + 1]) * t]; };
    // (the line's own spans for the shells: a crossing line's wall would stop a shell first; the spans are per line)
    const own = fieldWallSpans([pts], noise, heightAt, mobile);
    assert.equal(pack(own), pack(spans.filter((span) => own.some((o) => o.cx === span.cx && o.cz === span.cz))), `${name}: a line's spans are its own`);
    for (const slot of planWallSlots(pts, L, noise, mobile).slots) {
      const [x, z] = at((slot.s0 + slot.s1) / 2), g = heightAt(x, z);
      const h = Math.min(slot.h0, slot.h1);
      const held = spans.some((span) => inside(span.collider, x, g + h * 0.5, z));
      if (slot.kind === 2) {
        assert.ok(!spans.some((span) => inside(span.collider, x, g + 0.3, z) && span.collider.shape2), `${name}: a breach (${x.toFixed(1)}, ${z.toFixed(1)}) carries no record`);
        breaches++;
      } else {
        assert.ok(held, `${name}: the standing slot at (${x.toFixed(1)}, ${z.toFixed(1)}) lies inside a record at half its height`);
        assert.ok(spans.some((span) => inside(span.obstacle, x, g + h * 0.5, z)), `${name}: and inside a movement record (the crush meets it)`);
        slotsChecked++;
        // a shell across the wall at half its height stops on it, within the wall's width of the line
        if (slotsChecked % 7 === 0) {
          const s = slot.s0 + (slot.s1 - slot.s0) * 0.5, [ax, az] = at(Math.max(0, s - 0.3)), [bx, bz] = at(Math.min(L, s + 0.3));
          let ux = bx - ax, uz = bz - az; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
          const origin = { x: x + uz * 6, y: g + h * 0.5, z: z - ux * 6 }, dir = { x: -uz, y: 0, z: ux };
          const normal = { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } };
          let best = Infinity;
          for (const span of own) { const d = rayCollisionRecord(origin, dir, span.collider, 12, normal); if (d >= 0) best = Math.min(best, d); }
          assert.ok(best < Infinity && Math.abs(best - 6) <= 0.45, `${name}: a shell across the wall stops on it at the wall (${best.toFixed(2)} m of 6)`);
          shells++;
        }
      }
    }
  }

  if (mobile) continue;
  // the press, on the desktop's mid forms in a batch and on a stone form
  const cells = desk.wallCells.filter((c) => c.near);
  const vertices = cells.reduce((s, c) => s + c.near.getAttribute('position').count, 0);
  const indices = cells.reduce((s, c) => s + c.near.index.count, 0);
  const batch = new THREE.BatchedMesh(cells.length, vertices, indices, new THREE.MeshBasicMaterial());
  const ids = cells.map((c) => batch.addInstance(batch.addGeometry(c.near)));
  const crush = new FieldWallCrush(heightAt);
  crush.bindBatch(batch, cells.map((c, i) => ({ box: c.box, instance: ids[i] })));
  const stoneCell = cells[0];
  const stone = buildFieldWallFine(desk.fine, stoneCell.key);
  crush.bindStones(() => (stone ? [{ box: stoneCell.box, geometry: stone }] : []));
  const pos = batch.geometry.getAttribute('position'), nor = batch.geometry.getAttribute('normal');
  const homeP = Float32Array.from(pos.array), homeN = Float32Array.from(nor.array);
  const stoneHome = stone ? Float32Array.from(stone.getAttribute('position').array) : null;
  // two neighbouring spans of one line
  const a = spans.findIndex((s, i) => i + 1 < spans.length && Math.hypot(s.cx - spans[i + 1].cx, s.cz - spans[i + 1].cz) < s.halfAlong + spans[i + 1].halfAlong + 0.5
    && cells.some((c) => c.box.minX <= s.cx && c.box.maxX >= s.cx && c.box.minZ <= s.cz && c.box.maxZ >= s.cz));
  assert.ok(a >= 0, `${name}: two neighbouring spans`);
  const A = spans[a], B = spans[a + 1];
  const reach = (span, x, z) => { const dx = x - span.cx, dz = z - span.cz; return Math.abs(dx * span.ux + dz * span.uz) <= span.halfAlong && Math.abs(-dx * span.uz + dz * span.ux) <= 0.95; };
  // the clutter carries the crush: records ghosted, the stone pressed
  const clutter = new CrushableClutter('field-wall', A.cx, A.y, A.cz, A.halfAlong, A.h, [A.obstacle], [A.collider]);
  assert.ok(clutter.activate(7), 'a span is a crushable');
  clutter.crushHooks.push((crushed) => crush.press(A, crushed));
  clutter.setCrushed(true);
  assert.ok(A.collider.dead && A.collider.crushed && A.obstacle.crushed, `${name}: a crushed span's shell record is ghosted`);
  let pressed = 0, untouched = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), g = heightAt(x, z), y = pos.getY(i), home = homeP[i * 3 + 1];
    if (reach(A, x, z)) { assert.ok(y <= Math.max(home, g) - Math.max(0, home - g) * 0.8 + 1e-4, `${name}: a reached vertex is pressed (${home.toFixed(2)} -> ${y.toFixed(2)} over ${g.toFixed(2)})`); if (home - g > 0.2) pressed++; }
    else { assert.equal(y, home, `${name}: a vertex out of reach stands`); untouched++; }
  }
  assert.ok(pressed > 20 && untouched > pressed, `${name}: the span's stone pressed (${pressed} vertices), the rest standing`);
  if (stone) {
    const sp = stone.getAttribute('position');
    let sPressed = 0;
    for (let i = 0; i < sp.count; i++) if (reach(A, sp.getX(i), sp.getZ(i)) && stoneHome[i * 3 + 1] - heightAt(sp.getX(i), sp.getZ(i)) > 0.2) { assert.ok(sp.getY(i) < stoneHome[i * 3 + 1], `${name}: the stone form pressed too`); sPressed++; }
    // a stone form built while the span lies crushed takes the press as it is built
    const again = buildFieldWallFine(desk.fine, stoneCell.key);
    crush.pressBuilt(again, stoneCell.box);
    assert.deepEqual(Array.from(again.getAttribute('position').array), Array.from(sp.array), `${name}: a stone form built later is pressed as the shown one (${sPressed} vertices)`);
  }
  // a second span over the same vertices, then the first stood again: the shared vertices stay pressed
  crush.press(B, true);
  clutter.setCrushed(false);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (reach(B, x, z)) assert.ok(pos.getY(i) <= homeP[i * 3 + 1], `${name}: a vertex the crushed neighbour reaches stays pressed`);
    else if (reach(A, x, z)) assert.equal(pos.getY(i), homeP[i * 3 + 1], `${name}: the stood span's own vertices stand`);
  }
  assert.ok(!A.collider.dead && !A.collider.crushed, `${name}: a stood span's records are back`);
  crush.press(B, false);
  assert.deepEqual(Array.from(pos.array), Array.from(homeP), `${name}: a rematch stands every vertex as it was`);
  assert.deepEqual(Array.from(nor.array), Array.from(homeN), `${name}: and every normal`);
  if (stone) assert.deepEqual(Array.from(stone.getAttribute('position').array), Array.from(stoneHome), `${name}: the stone form too`);
  }
}
assert.ok(breaches > 0, `breaches checked (${breaches})`);
console.log(`fieldWallCollision.selftest: ${slotsChecked} standing slots inside their spans' records, ${breaches} breaches with none, ${shells} shells stopped at the wall; `
  + 'on both tiers; a crush presses its span alone, shared vertices stand once neither span is crushed, a rematch restores every vertex');
