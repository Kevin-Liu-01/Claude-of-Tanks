// fortKit.selftest — the field works' pillbox rebuilt (the fortifications lane, 2026-10-09; the owner: "the bunkers and
// pillboxes needs to be improved a lot"; gauntlet wave 315: "rough boxes with a tan trim band ... on brown plinths").
// Pinned:
//   1. every map's form builds, intact and destroyed: position, normal, uv and a colour per vertex, finite; deterministic
//      for its seed and drawing nothing from any stream; within its budget; the destroyed state nowhere higher than a
//      hull crosses (a broken prop has no collider: BROKEN_CAP, bars a little over it);
//   2. the forms are what they are drawn as: a stepped embrasure's dark throat on the front, the walls' board print
//      (concrete uvs at the print's scale), the colours in the print's frame (albedo over FORT_PRINT_MEAN);
//   3. the bank: its rows from the wall to the toe falling, the toe at grade, open at the rear; its contact proxy cut at
//      FORT_CONTACT_FLOOR_M (inside the full bank, no lower than it); the whole work's ground under the old pillbox's
//      reach (5.3 m), so the field works' seats and road checks stay in their scale;
//   4. the wiring: every map but the sangar's is in the table with a known form; the props spend the old pillbox's draws
//      before building; the bunker's shells meet its own slabs; the bank is a static earthwork laid after every pass.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FLAT_UV, FORT_CONTACT_FLOOR_M, FORT_GRADE, FORT_MAPS, FORT_PRINT_MEAN, TEETH, TEETH_MAPS, buildDragonsTeeth, buildPillbox,
  dragonsTeethSeats, fortFor, pillboxBerm, pillboxFootprintGeometry, pillboxFooting,
} from './fortKit.ts';
import { MAP_IDS } from './mapIds.ts';
import { deriveRuntimeStructureContactBand } from '../structureCollision.ts';

const STYLES = ['regelbau', 'dot', 'hex', 'logearth'];
const bbox = (g) => { g.computeBoundingBox(); return g.boundingBox; };
const finite = (arr) => { for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false; return true; };

// ---------------------------------------------------------------------------------------------- 1. the builds
for (const [mapId, entry] of Object.entries(FORT_MAPS)) {
  assert.ok(STYLES.includes(entry.style), `${mapId}: a known form (${entry.style})`);
  const f = fortFor(mapId);
  for (const broken of [false, true]) {
    const g = buildPillbox(f.style, f.tones, f.seed, broken);
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, c = g.attributes.color;
    assert.ok(p && n && uv && c && c.itemSize === 3 && !g.index, `${mapId}${broken ? ' destroyed' : ''}: non-indexed position, normal, uv, colour`);
    assert.ok(p.count === n.count && p.count === uv.count && p.count === c.count, `${mapId}: one of each per vertex`);
    assert.ok(finite(p.array) && finite(n.array) && finite(uv.array) && finite(c.array), `${mapId}: every number finite`);
    const tris = p.count / 3;
    assert.ok(tris <= 9000, `${mapId}${broken ? ' destroyed' : ''}: within its budget (${tris} triangles)`);
    const b = bbox(g);
    if (broken) {
      // the slabs, stubs and rubble under the cap; only thin bars may stand a little higher (a bar's face is a long
      // thin triangle: its height over its longest edge under 4 cm)
      let solidTop = 0;
      for (let i = 0; i < p.count; i += 3) {
        const q = [0, 1, 2].map((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)]);
        const e = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        const u = q[1].map((v, k) => v - q[0][k]), w = q[2].map((v, k) => v - q[0][k]);
        const area = Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
        const longest = Math.max(e(q[0], q[1]), e(q[1], q[2]), e(q[2], q[0]));
        if (longest > 0 && (2 * area) / longest > 0.04) solidTop = Math.max(solidTop, q[0][1], q[1][1], q[2][1]);
      }
      assert.ok(solidTop <= 0.62, `${mapId} destroyed: nothing solid higher than a hull crosses (${solidTop.toFixed(2)} m)`);
      assert.ok(b.max.y <= 0.9, `${mapId} destroyed: its bars too (${b.max.y.toFixed(2)} m)`);
    } else {
      assert.ok(b.max.y > 1.6 && b.max.y < 3.5, `${mapId}: a pillbox's height (${b.max.y.toFixed(2)} m)`);
      assert.ok(Math.max(-b.min.x, b.max.x) < 4 && Math.max(-b.min.z, b.max.z) < 4.8, `${mapId}: the body (the bank is not the destructible's)`);
    }
  }
}
{
  const f = fortFor('coastal');
  const a = buildPillbox(f.style, f.tones, f.seed, false), b = buildPillbox(f.style, f.tones, f.seed, false);
  assert.deepEqual(Array.from(a.attributes.position.array), Array.from(b.attributes.position.array), 'deterministic for its seed');
  assert.deepEqual(Array.from(a.attributes.color.array), Array.from(b.attributes.color.array), 'its weather too');
}

// ---------------------------------------------------------------------------------------------- 2. the forms
for (const style of ['regelbau', 'dot', 'hex']) {
  const f = fortFor(style === 'regelbau' ? 'autumn' : style === 'dot' ? 'steppe' : 'blackglass');
  const g = buildPillbox(f.style, f.tones, f.seed, false);
  const p = g.attributes.position, c = g.attributes.color, uv = g.attributes.uv;
  let darkFront = 0, printed = 0, plain = 0;
  for (let i = 0; i < p.count; i++) {
    const l = (c.getX(i) + c.getY(i) + c.getZ(i)) / 3 * FORT_PRINT_MEAN;
    if (l < 0.02 && p.getZ(i) > 1.0 && p.getY(i) > 0.6 && p.getY(i) < 1.6) darkFront++;
    if (Math.abs(uv.getX(i) - FLAT_UV[0]) < 1e-6 && Math.abs(uv.getY(i) - FLAT_UV[1]) < 1e-6) plain++; else printed++;
  }
  assert.ok(darkFront >= 6, `${style}: an embrasure's dark throat in its front (${darkFront} vertices)`);
  assert.ok(printed > p.count * 0.5, `${style}: most of it the board-formed concrete (print uvs on ${printed} of ${p.count})`);
  assert.ok(plain > 0, `${style}: the turf, the bags and the steel on the print's plain texel`);
}

// ---------------------------------------------------------------------------------------------- 3. the bank
for (const style of STYLES) {
  const f = fortFor(style === 'regelbau' ? 'coastal' : style === 'dot' ? 'steppe' : style === 'hex' ? 'oasis' : 'monsoon');
  const footing = pillboxFooting(f.style, f.tones, f.seed);
  assert.ok(footing.length >= 40, `${style}: the bank sampled round the plan (${footing.length})`);
  let banked = 0, open = 0;
  for (const s of footing) {
    assert.equal(s.rows.length, 9, `${style}: eight rows from the wall to the toe, and the skirt`);
    if (s.h < 0.02) { open++; continue; }
    banked++;
    for (let r = 1; r < 7; r++) assert.ok(s.rows[r][1] <= s.rows[r - 1][1] + 0.08, `${style}: the bank falls from the wall to its toe`);
    assert.ok(Math.abs(s.rows[6][1] - FORT_GRADE) < 1e-6, `${style}: its toe at grade`);
    assert.ok(s.rows[8][1] < FORT_GRADE - 0.5, `${style}: its skirt under the ground`);
  }
  assert.ok(banked > footing.length * 0.6 && open > 0, `${style}: banked round most of it, open at the rear (${banked} / ${open})`);
  const full = pillboxBerm(f.style, f.tones, f.seed), clipped = pillboxBerm(f.style, f.tones, f.seed, { clip: FORT_CONTACT_FLOOR_M });
  const bf = bbox(full), bc = bbox(clipped);
  assert.ok(bc.max.x <= bf.max.x + 1e-6 && bc.min.z >= bf.min.z - 1e-6 && bc.max.z <= bf.max.z + 1e-6, `${style}: the contact proxy inside the bank`);
  assert.ok(bc.max.z < bf.max.z - 0.4, `${style}: cut back from the toe where the bank is lower than a hull climbs`);
  const phone = pillboxBerm(f.style, f.tones, f.seed, { forBaked: true }), pc = phone.attributes.color, dc = full.attributes.color;
  assert.ok(Math.abs(pc.getX(10) - dc.getX(10) * FORT_PRINT_MEAN) < 1e-5, `${style}: the phones' bank in plain albedo`);
  const ground = pillboxFootprintGeometry(f.style, f.tones, f.seed);
  const band = deriveRuntimeStructureContactBand({ baked: [ground] });
  let reach = 0;
  for (const part of band.parts) {
    if (part.points) for (let i = 0; i < part.points.length; i += 2) reach = Math.max(reach, Math.hypot(part.points[i], part.points[i + 1]));
  }
  assert.ok(reach > 3 && reach < 5.8, `${style}: the whole work's ground in the old pillbox's scale (${reach.toFixed(2)} m)`);
}

// ---------------------------------------------------------------------------------------------- 4. the wiring
{
  const listed = new Set(Object.keys(FORT_MAPS));
  for (const id of MAP_IDS) {
    if (id === 'badlands') assert.ok(!listed.has(id), 'Redrock keeps its sangar');
    else assert.ok(listed.has(id), `${id}: its pillbox in the table`);
  }
  const props = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
  assert.match(props, /build: \(rng: \(\) => number\) => \{ DESTRUCTIBLE_TYPES\.bunker\.build\(rng\)\.dispose\(\); return buildPillbox\(/,
    'the build spends the old pillbox\'s draws first (every later pool keeps its shape)');
  assert.match(props, /broken: \(rng: \(\) => number\) => \{ DESTRUCTIBLE_TYPES\.bunker\.broken!\(rng\)\.dispose\(\); return buildPillbox\(/,
    'and so does the destroyed state');
  assert.match(props, /SLAB_SHELL_KINDS: ReadonlySet<string> = new Set\(\[[^\]]*'bunker'\]\)/, 'its shells meet its own slabs');
  assert.match(props, /\/\/ the fortifications lane: the pillboxes' earthworks, once every pass has placed its pieces \(above\), before the\n[^\n]*\n\s*pillboxEarthworks\(\);\n\s*\/\/ spatial hash over destructible records/,
    'the bank\'s collision laid after every placement pass, before the runtime indexes the records');
  assert.ok(props.indexOf('pillboxEarthworks();') < props.indexOf('  const D_CELL = 8;'),
    'outside the runtime the destructible receipts evaluate (destructibleAuthority slices from D_CELL)');
  assert.match(props, /ob\.kind = 'earthwork';/, 'as an earthwork, not the destructible');
}
// ---------------------------------------------------------------------------------------------- 5. the Westwall's teeth
{
  for (const id of TEETH_MAPS) assert.ok(FORT_MAPS[id], `${id}: a teeth map has its pillbox's tones`);
  const f = fortFor('reservoir');
  const seats = dragonsTeethSeats(24);
  assert.equal(new Set(seats.map((s) => s.row)).size, TEETH.rows, 'four rows');
  const rows = [...new Set(seats.map((s) => s.z))].sort((a, b) => b - a);
  assert.ok(rows[0] > rows[rows.length - 1], 'row 0 on the enemy\'s side (+z)');
  const slope = (x, z) => 0.05 * x + 0.02 * z;
  const g = buildDragonsTeeth(24, f.tones, 11, slope);
  assert.ok(g.attributes.position.count / 3 <= 3200, `a 24 m segment within its budget (${g.attributes.position.count / 3} triangles)`);
  // every tooth stands on its own ground: its foot below it, its top at its row's height over it (measured without the
  // grass: the same teeth, the same draws)
  const bare = buildDragonsTeeth(24, { ...f.tones, barren: true }, 11, slope), p = bare.attributes.position;
  for (const seat of seats.filter((_, i) => i % 7 === 0)) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const m = TEETH.baseHalf + 0.2;
      if (Math.abs(p.getX(i) - seat.x) > m || Math.abs(p.getZ(i) - seat.z) > m) continue;
      lo = Math.min(lo, p.getY(i)); hi = Math.max(hi, p.getY(i));
    }
    const ground = slope(seat.x, seat.z), h = TEETH.heights[seat.row];
    assert.ok(lo < ground - 0.15, `a tooth's footing below its ground (${(lo - ground).toFixed(2)} m)`);
    assert.ok(Math.abs(hi - ground - h) < h * 0.12 + 0.05, `its top at its row's height over its ground (${(hi - ground).toFixed(2)} of ${h})`);
  }
  // never painted: the Regelbau's camouflage stays on the casemates
  const camoMap = Object.entries(FORT_MAPS).find(([, e]) => e.camo === 'pattern')?.[0];
  const fc = fortFor(camoMap), plain = { ...fc.tones, camo: undefined };
  const a = buildDragonsTeeth(12, fc.tones, 5), b = buildDragonsTeeth(12, plain, 5);
  assert.deepEqual(Array.from(a.attributes.color.array), Array.from(b.attributes.color.array), 'the teeth never take the casemates\' paint');
  const props = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
  assert.match(props, /\n  placeDragonsTeeth\(\);\n  yield\* mergeMaterialBuckets\(\);/, 'laid after every seeded pass, before the buckets merge');
  assert.match(props, /appendStructureCollisionBand\(obstacles, profile\.contact, sg\.x, sg\.y, sg\.z, sg\.yaw\)\.kind = 'teeth';/,
    'its collision from its own teeth');
}
console.log('fortKit.selftest: every map\'s pillbox (Regelbau, DOT, hex, log and earth) builds intact and razed under a hull\'s reach, its embrasures dark in board-formed concrete, its bank falling to the toe with its contact cut at 0.35 m, the old draws spent, shells on its slabs, the bank a static earthwork; the Westwall\'s teeth in four rows, each on its own ground, unpainted');
