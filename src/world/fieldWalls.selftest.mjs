// fieldWalls.selftest — the karst field walls laid as dry stone (the scenery lane, b13; gauntlet wave 87, Saltwind: "a
// smooth grey kerb-like strip of even width ... cast concrete rather than a drystone wall", "a wall built like stacked
// cinder blocks", and on corner-ne a wall that ran through the wall it met and ended in the open with its head drawn
// inside out). Pinned:
//   1. the face print (fieldWallFace.ts): deterministic; stones of many sizes between dark dry joints (a few per cent of
//      the face, never a mortar grid), bigger at the foot; near white so the map's tone sets the colour; periodic
//      along the wall;
//   2. the walls (fieldWorks.ts): a stepped, uneven crown (top stones of their own heights, never above a metre), its
//      heads wound to face out, fallen stretches and breaches along a long wall, fallen stones at its foot within the
//      line's band, a line that overshoots the wall it meets cut back to it, indexed, the phones' fewer and longer;
//   3. the wiring: the walls on their own lit material (the print, the cascades), no shadow cast, the banks on the rock
//      material; Saltwind's tone set for the print; the field-stone and mud prints uploaded the GPU's way round.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { buildFieldWorks, trimFieldWorksOvershoots } from './fieldWorks.ts';
import { DRY_WALL_FACE_V, DRY_WALL_TILE_M, paintDryWallBuffers } from './fieldWallFace.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const drain = (it) => { let s = it.next(); while (!s.done) s = it.next(); return s.value; };

// ---------------------------------------------------------------------------------------------- 1. the print
{
  const a = drain(paintDryWallBuffers(256)), b = drain(paintDryWallBuffers(256));
  assert.deepEqual(Array.from(a.px), Array.from(b.px), 'the print is deterministic');
  const size = 256, faceRows = [];
  for (let y = 0; y < size; y++) { const v = 1 - (y + 0.5) / size; if (v < DRY_WALL_FACE_V[1]) faceRows.push(y); }
  let joints = 0, lum = 0, n = 0;
  for (const y of faceRows) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    joints += a.joint[i]; n++;
    lum += (a.px[i * 4] + a.px[i * 4 + 1] + a.px[i * 4 + 2]) / 765;
  }
  const jointShare = joints / n, mean = lum / n;
  assert.ok(jointShare > 0.04 && jointShare < 0.14, `dry joints between the stones, not a mortar grid (${(jointShare * 100).toFixed(1)} % of the face)`);
  assert.ok(mean > 0.62 && mean < 0.86, `near-white stones under the map's tone (face mean ${mean.toFixed(3)})`);
  // stones of many sizes, the biggest at the foot
  const areas = a.stones.map((s) => (s.u1 - s.u0) * (s.y1 - s.y0)).filter((x) => x > 0.002);
  assert.ok(a.stones.length >= 30, `a tile is many stones (${a.stones.length})`);
  assert.ok(Math.max(...areas) / Math.min(...areas) > 4, 'stones of many sizes');
  const footH = a.stones.filter((s) => s.y1 < 0.3).map((s) => s.y1 - s.y0), topH = a.stones.filter((s) => s.y0 > 0.7).map((s) => s.y1 - s.y0);
  const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
  assert.ok(footH.length && topH.length && avg(footH) > avg(topH) * 1.25, `the biggest stones at the foot (${avg(footH).toFixed(3)} m against ${avg(topH).toFixed(3)} m)`);
  // periodic along the wall: the face band's first and last columns are neighbours
  let seam = 0, inner = 0;
  for (const y of faceRows) {
    const row = y * size;
    const d = (i, j) => Math.abs(a.px[i * 4] - a.px[j * 4]) + Math.abs(a.px[i * 4 + 1] - a.px[j * 4 + 1]);
    seam += d(row, row + size - 1); inner += d(row + 100, row + 101);
  }
  assert.ok(seam < inner * 2.5, `the print wraps along the wall (seam ${seam} against a column step ${inner})`);
  assert.equal(DRY_WALL_TILE_M, 2);
}

// ---------------------------------------------------------------------------------------------- 2. the walls
const noise = new SimplexNoise({ random: mulberry32(9299) });
/** A flat field at y = 2 with the given field lines (edgeM the distance to the nearest), no roads, no village. */
const fieldOf = (lines) => ({
  getHeightAt: () => 2, getNormalAt: () => ({ y: 1 }), getWaterMaskAt: () => 0, _villageMask: () => 0, _roadDist: () => 99,
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
const lay = (lines, mobile = false) => drain(buildFieldWorks(fieldOf(lines), noise, { walls: true, banks: false, spawns: [{ x: 0, z: -400 }], mobile }));
// a long straight wall: its crown, its fallen stretches and breaches, its fallen stones
{
  const built = lay([[-200, 0, 200, 0]]);
  const g = built.wallGeometry;
  assert.ok(g && g === built.geometry && built.bankGeometry === null, 'a wall, no bank');
  for (const name of ['position', 'normal', 'color', 'uv']) assert.ok(g.attributes[name], `the wall carries ${name}`);
  assert.ok(g.index && g.index.count === built.receipt.triangles * 3, 'indexed (a quad is four vertices)');
  assert.ok(g.attributes.color.array instanceof Uint8Array && g.attributes.color.normalized, 'its colours in bytes');
  const p = g.attributes.position.array, nrm = g.attributes.normal.array;
  // the crown: the tops (vertices over 0.3 m, on up-facing faces) along the wall
  const tops = [];
  let off = 0, beyond = 0, high = 0;
  for (let i = 0; i < p.length; i += 3) {
    const y = p[i + 1] - 2;
    if (Math.abs(p[i + 2]) > 0.9) off++;
    if (Math.abs(p[i + 2]) > 0.5) beyond++;
    if (y > 1.0) high++;
    if (nrm[i + 1] > 0.85 && y > 0.3 && Math.abs(p[i + 2]) < 0.3) tops.push(y);
  }
  assert.equal(off, 0, 'every stone within 0.9 m of the wall\'s line, the fallen ones too');
  assert.ok(beyond > 0, 'fallen stones lie at the foot, out past the wall\'s faces');
  assert.equal(high, 0, 'never above a metre');
  const mean = tops.reduce((a, b) => a + b, 0) / tops.length;
  const sd = Math.sqrt(tops.reduce((a, b) => a + (b - mean) ** 2, 0) / tops.length);
  assert.ok(mean > 0.6 && mean < 0.95, `a wall a little under a metre (crown mean ${mean.toFixed(3)} m)`);
  assert.ok(sd > 0.03, `its crown uneven, top stone by top stone (sd ${sd.toFixed(3)} m)`);
  assert.ok(tops.some((y) => y < 0.5), 'a stretch has fallen in');
  assert.ok(built.receipt.wallPieces >= 3, `breaches open along it (${built.receipt.wallPieces} pieces)`);
  assert.ok(built.receipt.wallM > 330 && built.receipt.wallM < 400, `the wall's length laid, its breaches left out (${built.receipt.wallM.toFixed(0)} m)`);
  const again = lay([[-200, 0, 200, 0]]);
  assert.deepEqual(Array.from(again.wallGeometry.attributes.position.array), Array.from(p), 'deterministic');
  const phone = lay([[-200, 0, 200, 0]], true);
  assert.ok(phone.receipt.triangles < built.receipt.triangles * 0.5, `the phones' walls are fewer triangles (${phone.receipt.triangles} < ${built.receipt.triangles})`);
  for (const b of [built, again, phone]) b.wallGeometry.dispose();
}
// a short wall (no breach, no fallen stretch): its two heads face out of it
{
  const built = lay([[-1.9, 0, 1.9, 0]]);
  const g = built.wallGeometry, p = g.attributes.position.array, idx = g.index.array;
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i + 2]) < 0.5) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); }
  let heads = 0, inward = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]].map((k) => [p[k * 3], p[k * 3 + 1], p[k * 3 + 2]]);
    const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], wx = v[2][0] - v[0][0], wy = v[2][1] - v[0][1], wz = v[2][2] - v[0][2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz) || 1;
    const cx = (v[0][0] + v[1][0] + v[2][0]) / 3, cz = (v[0][2] + v[1][2] + v[2][2]) / 3;
    if (Math.abs(nx / l) < 0.9 || Math.abs(cz) > 0.5) continue;
    const atStart = Math.abs(cx - x0) < 0.12, atEnd = Math.abs(cx - x1) < 0.12;
    if (!atStart && !atEnd) continue;
    heads++;
    if ((atStart && nx > 0) || (atEnd && nx < 0)) inward++;
    void ny;
  }
  assert.ok(heads >= 4, `the wall's two heads are drawn (${heads} faces)`);
  assert.equal(inward, 0, 'every head faces out of the wall (none drawn inside out)');
  g.dispose();
}
// a T on the lines themselves (Saltwind corner-ne: the chain of one wall ran on 2 m through the wall it met): the stub
// is cut at the crossing, so the meeting wall's head stands inside the wall it meets; a crossing farther from an end
// (an X, both arms long) is left
{
  const along = (x0, z0, x1, z1, step) => {
    const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / step), pts = [];
    for (let k = 0; k <= n; k++) pts.push(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n);
    return pts;
  };
  const lines = [
    { pts: along(-10, 0.05, 10, 0.05, 1.4), wall: true },
    { pts: along(0.1, -2.1, 0.1, 10, 1.3), wall: true }, // its start 2.1 m south of the first: a stub
    { pts: along(20, -6, 20, 12, 1.4), wall: true }, // an X with the next, both arms long
    { pts: along(12, 3, 28, 3, 1.4), wall: true },
  ];
  const before = lines.map((l) => l.pts.slice());
  trimFieldWorksOvershoots(lines);
  assert.ok(Math.abs(lines[1].pts[1] - 0.05) < 1e-6 && Math.abs(lines[1].pts[0] - 0.1) < 1e-6, `the stub cut at the crossing (it starts at ${lines[1].pts[0].toFixed(2)}, ${lines[1].pts[1].toFixed(2)})`);
  assert.ok(lines[1].pts.length < before[1].length, 'its south points gone');
  assert.deepEqual(lines[0].pts, before[0], 'the wall it meets is untouched');
  assert.deepEqual(lines[2].pts, before[2], 'an X with both arms long is left');
  assert.deepEqual(lines[3].pts, before[3], 'and so is its other arm');
}
// a T laid through the works: the meeting wall stands north of the wall it meets and nothing south of it
{
  const built = lay([[-20, 0, 20, 0], [0, -2, 0, 20]]);
  const p = built.wallGeometry.attributes.position.array;
  let stub = 0;
  for (let i = 0; i < p.length; i += 3) if (p[i + 2] < -0.95 && Math.abs(p[i]) < 0.5) stub++;
  assert.equal(stub, 0, 'no stub of the meeting wall south of the wall it meets');
  let north = 0;
  for (let i = 0; i < p.length; i += 3) if (p[i + 2] > 3 && Math.abs(p[i]) < 0.6) north++;
  assert.ok(north > 0, 'the meeting wall stands north of the T');
  built.wallGeometry.dispose();
}

// ---------------------------------------------------------------------------------------------- 3. the wiring
{
  const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
  assert.match(props, /const print = yield\* makeDryWall\(aniso, mobileProps \? 256 : 512\);/, 'the walls paint their print (half size on the phones)');
  assert.match(props, /map: print\.albedo, normalMap: print\.normal, roughnessMap: print\.surface, aoMap: print\.surface,\n\s*vertexColors: true,/, 'on their own material, the vertex tone over the print');
  assert.match(props, /engineCtx\.setupShadowMaterial\(wallMaterial\);/, 'a lit material on the cascades');
  assert.match(props, /works\.castShadow = false;\n\s*works\.receiveShadow = true;/, 'no shadow cast, shadows received');
  assert.match(props, /if \(built\.bankGeometry\) place\(built\.bankGeometry, mats\.rock,/, 'the banks on the rock material');
  // (the field-stone and mud prints are painted with v down the image from row 0, but a canvas texture is flipped on
  // upload, row 0 landing at v = 1 — measured in swiftshader: v = 0.9 sampled the top row — so they upload reversed;
  // the dry-wall print paints the GPU's way round and uploads as it is)
  const flips = props.match(/flipPrintRows\(px, size, 4\); flipPrintRows\(hgt, size, 1\);/g) ?? [];
  assert.equal(flips.length, 2, 'the field-stone and mud prints upload row-reversed, so the GPU\'s v is the painters\' v');
  assert.match(props, /liftFieldStoneMean\(px, size\);[^\n]*\n\s*yield \{ fine: true, stage: 'field-stone-tone' \};\n\s*flipPrintRows\(px, size, 4\);/,
    'the lift reads the painter\'s rows before the reversal');
  assert.match(props, /if \(earth\) tintFieldMudToEarth\(px, size, earth\);[^\n]*\n\s*yield \{ fine: true, stage: 'field-mud-tone' \};\n\s*flipPrintRows\(px, size, 4\);/,
    'the mud print reversed after its tint');
  const dry = props.slice(props.indexOf('function* makeDryWall('), props.indexOf('function* makeDryWall(') + 900);
  assert.ok(!dry.includes('flipPrintRows'), 'the dry-wall print is painted the GPU\'s way round');
  const saltwind = readFileSync(new URL('./maps/saltwind.ts', import.meta.url), 'utf8');
  const tone = /fieldWorks: \{ walls: true, wallTone: \[([^\]]+)\] \}/.exec(saltwind)[1].split(',').map(Number);
  assert.ok(tone[2] >= 0.7 && tone[2] <= 0.9 && tone[1] <= 0.1, `Saltwind's limestone tone set for the print (${tone})`);
}

console.log('fieldWalls.selftest: the print\'s stones and dry joints, a stepped uneven crown, heads facing out, fallen stretches, breaches and stones, the T cut back, the phones\' fewer, the wiring');
