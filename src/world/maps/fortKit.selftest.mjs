// fortKit.selftest — the field works' pillbox rebuilt (the fortifications lane, 2026-10-09; the owner: "the bunkers and
// pillboxes needs to be improved a lot"; gauntlet wave 315: "rough boxes with a tan trim band ... on brown plinths").
// Pinned:
//   1. every map's form builds, intact and destroyed: position, normal, uv and a colour per vertex, finite; deterministic
//      for its seed and drawing nothing from any stream; within its budget; its destroyed state its own pieces settled
//      into a wreck with volume (round 2: fractureSettle.ts; standing over its bank, never higher than a tipped plate
//      of its slab; a log-and-earth work's logs over the slumped soil of its cover);
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
  FLAT_UV, FORT_CONTACT_FLOOR_M, FORT_GRADE, FORT_MAPS, FORT_PRINT_MEAN, buildPillbox, fortFor, pillboxBerm, pillboxFootprintGeometry,
  pillboxFooting,
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
    const settled = broken;
    assert.ok(tris <= (settled ? 12500 : 9000), `${mapId}${broken ? ' destroyed' : ''}: within its budget (${tris} triangles)`);
    const b = bbox(g);
    if (settled) {
      assert.ok(b.max.y >= (f.style === 'logearth' ? 0.9 : 1.2), `${mapId} destroyed: the wreck stands over its bank (${b.max.y.toFixed(2)} m)`);
      assert.ok(b.max.y <= 4.5, `${mapId} destroyed: no higher than a tipped plate of its slab (${b.max.y.toFixed(2)} m)`);
      assert.ok(b.min.y >= -0.7, `${mapId} destroyed: nothing under its room's floor (${b.min.y.toFixed(2)} m)`);
    } else if (broken) {
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
  const wa = buildPillbox(f.style, f.tones, f.seed, true), wb = buildPillbox(f.style, f.tones, f.seed, true);
  assert.deepEqual(Array.from(wa.attributes.position.array), Array.from(wb.attributes.position.array), 'its wreck settles the same');
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
  assert.match(props, /\/\/ the fortifications lane: the pillboxes' earthworks, once every pass has placed its pieces \(above\), before the\n[^\n]*\n\s*pillboxEarthworks\(\);\n\s*\/\/ Construction-only spans are now sealed[^\n]*\n[^\n]*\n\s*wallSpans\.clear\(\);/,
    'the bank\'s collision laid after every placement pass, while the placement graph still stands (wallSpanPlacement slices the runtime from its clear), before the runtime indexes the records');
  assert.ok(props.indexOf('pillboxEarthworks();') < props.indexOf('  const D_CELL = 8;'),
    'outside the runtime the destructible receipts evaluate (destructibleAuthority slices from D_CELL)');
  assert.match(props, /ob\.kind = 'earthwork';/, 'as an earthwork, not the destructible');
}
console.log('fortKit.selftest: every map\'s pillbox (Regelbau, DOT, hex, log and earth) builds intact and settles into its own wreck, its embrasures dark in board-formed concrete, its bank falling to the toe with its contact cut at 0.35 m, the old draws spent, shells on its slabs, the bank a static earthwork');

// ---------------------------------------------------------------------------------------------- 5. the pieces (round 2)
// The intact concrete work carries the destruction core's anatomy (fractureAnatomy.ts): its contract holds, the stubs,
// floor and threshold anchor it, every piece reaches them, and the pieces' boxes start apart (no two over 3 cm save
// the hexagon's corners: walls at 120 degrees, their cast joints linked); the edge art caps a snapped lift.
{
  const { checkKitFracture, FRACTURE_PIECE_CAP } = await import('../fractureAnatomy.ts');
  const { fortFractureEdge } = await import('./fortKit.ts');
  const rot = (q, v) => { const [x, y, z, w] = q; const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]); return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const overlap = (p, q) => {
    const ap = [0, 1, 2].map((k) => rot(p.q, [k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0]));
    const aq = [0, 1, 2].map((k) => rot(q.q, [k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0]));
    const axes = [...ap, ...aq];
    for (const x of ap) for (const y of aq) {
      const c = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]], l = Math.hypot(...c);
      if (l > 1e-3) axes.push(c.map((v) => v / l));
    }
    const d = [q.c[0] - p.c[0], q.c[1] - p.c[1], q.c[2] - p.c[2]];
    let least = Infinity;
    for (const n of axes) {
      least = Math.min(least, ap.reduce((s, x, i) => s + Math.abs(dot(x, n)) * p.h[i], 0) + aq.reduce((s, x, i) => s + Math.abs(dot(x, n)) * q.h[i], 0) - Math.abs(dot(d, n)));
      if (least <= 0) return 0;
    }
    return least;
  };
  let checked = 0, logs = 0;
  for (const [mapId, entry] of Object.entries(FORT_MAPS)) {
    const f = fortFor(mapId);
    const g = buildPillbox(f.style, f.tones, f.seed, false);
    const a = g.userData.fracture;
    assert.ok(a && a.kind === 'bunker', `${mapId}: the intact work carries its fracture anatomy`);
    assert.deepEqual(checkKitFracture(a, g.attributes.position.array, FRACTURE_PIECE_CAP.fortified), [], `${mapId}: the core's contract holds`);
    assert.ok(a.pieces.length >= 25 && a.pieces.length <= FRACTURE_PIECE_CAP.fortified, `${mapId}: ${a.pieces.length} pieces`);
    if (entry.style === 'logearth') {
      // (the log-and-earth work: its floor and four buried courses anchor it; its roof logs snap; its earth in sections)
      assert.ok(a.pieces.filter((p) => p.anchor).length >= 5, `${mapId}: the floor and the buried courses anchor it`);
      assert.ok(a.pieces.filter((p) => p.role === 'rafter' && p.scores?.length === 2).length >= 12, `${mapId}: the roof's logs snap at two scores`);
      assert.equal(a.pieces.filter((p) => p.role === 'roof' && p.material === 'earth').length, 4, `${mapId}: the earth in four sections`);
      logs++;
    } else assert.ok(a.pieces.filter((p) => p.anchor).length >= 8, `${mapId}: stubs, floor and threshold anchor it`);
    assert.ok(a.pieces.every((p) => p.bucket === 'fortConcrete'), `${mapId}: the kind's one bucket`);
    const linked = new Set(a.links.map((l) => `${Math.min(l.a, l.b)}-${Math.max(l.a, l.b)}`));
    for (let i = 0; i < a.pieces.length; i++) for (let j = i + 1; j < a.pieces.length; j++) {
      const p = a.pieces[i], q = a.pieces[j];
      if (p.anchor && q.anchor) continue;
      const depth = overlap(p, q);
      // (the hexagon's cast corners and the log walls' butted corners overlap where they are linked at their joints)
      const joint = linked.has(`${i}-${j}`) && p.role === 'wall' && q.role === 'wall';
      // (and the log work's members where they are linked at a joint: the earth heaped against the walls and frame it
      // covers, the door's posts nailed against the rear wall's log ends)
      const rests = f.style === 'logearth' && linked.has(`${i}-${j}`);
      const allowed = joint && f.style === 'hex' ? 0.4 : (joint && f.style === 'logearth') || rests ? 0.6 : 0.03;
      assert.ok(depth <= allowed, `${mapId}: ${p.role} ${i} and ${q.role} ${j} overlap by ${depth.toFixed(3)} m at the intact pose`);
    }
    checked++;
  }
  assert.ok(checked >= 27 && logs >= 6, `every map's work (${checked}, ${logs} of log and earth)`);
  // the edge art: a scored lift snaps with a ragged cap on both halves and its bars
  const f = fortFor('autumn'), g = buildPillbox(f.style, f.tones, f.seed, false);
  const lift = g.userData.fracture.pieces.find((p) => p.role === 'wall' && !p.anchor && p.scores?.length);
  const runs = [];
  const writer = {
    vertices: 0, capacity: 1e6, run: null,
    begin(bucket, role) { this.run = { bucket, role, v: [], t: 0 }; return true; },
    vertex(px, py, pz) { this.run.v.push([px, py, pz]); return this.vertices++; },
    triangle() { this.run.t++; },
    end() { runs.push(this.run); },
  };
  fortFractureEdge('concrete', lift, lift.scores[0], 0x4321, writer);
  assert.equal(runs.length, 2, 'a cap on each half');
  // (E1: the cap's grid by the break's size, a cell about 40 cm across, at least two along it and one through it, so the
  // wreck stays within 1.5 x the intact; its bars two triangles each)
  for (const run of runs) assert.ok(run.t >= 4 + 6 && run.role === 'rim', `a ragged cap with its bars (${run.t} triangles)`);
  const slab = g.userData.fracture.pieces.find((p) => p.role === 'slab' && !p.anchor);
  const big = [];
  fortFractureEdge('concrete', { ...slab, scoreAxis: 0 }, 0, 0x4321, { ...writer, end() { big.push(this.run); } });
  assert.ok(big[0].t > runs[0].t, 'a wider break draws a finer cap');
}
