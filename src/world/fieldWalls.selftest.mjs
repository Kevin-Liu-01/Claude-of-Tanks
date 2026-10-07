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
//   2b. the stone form (b17; gauntlet wave 121: "a smooth extruded strip with a blue-grey crazy-paving texture",
//      "mortared, not dry-stone"): a cell's near form stone by stone, built when the camera comes near — its stones
//      proud of the body's darkened faces (the dry joints), courses bigger at the foot, through-stones jutting from both
//      faces, a coping of slabs on edge over the body, never above a metre, within the wall's band; the same stones
//      whichever cell is laid first and however often; a cell's stones in its own square; within its triangle budget; the
//      phones without it;
//   3. the wiring: the walls on their own lit material (the print, the cascades), no shadow cast, the banks on the rock
//      material; the stone tier built on demand near the camera, one cell a frame, the mid form hidden under it;
//      Saltwind's tone set for the print; the field-stone and mud prints uploaded the GPU's way round;
//   4. the uploads (the ground lane's orientation audit, 2026-10-05): the three wall prints built by their real code
//      (props.ts makeFieldStone, makeFieldMud, makeDryWall: the painters, the reversal, the canvas upload) and read the
//      way WebGL samples them, against the painters' own rows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { buildFieldWallFine, buildFieldWallFineSteps, buildFieldWorks, trimFieldWorksOvershoots } from './fieldWorks.ts';
import { DRY_WALL_CROWN_V, DRY_WALL_FACE_V, DRY_WALL_STONE_MID_V, DRY_WALL_STONE_V, DRY_WALL_TILE_M, paintDryWallBuffers } from './fieldWallFace.ts';
import { FIELD_STONE_HEARTING_V, liftFieldStoneMean, paintFieldStoneBuffers } from './fieldStoneSurface.ts';
import { FIELD_MUD_PLAIN_V, mudEarthOfGround, paintFieldMudBuffers, tintFieldMudToEarth } from './fieldMudSurface.ts';
import { normalTextureFromHeight, textureFromRgbaPixels } from './proceduralTexture.ts';

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
  // (b17) the stone band: one stone's skin for the stone form's stones — no joint, no cell edge, a pale mottled stone;
  // its own band, clear of the face's and the crown's, room for the tallest stone (0.34 m) about its middle
  assert.ok(DRY_WALL_FACE_V[1] < DRY_WALL_CROWN_V[0] && DRY_WALL_CROWN_V[1] < DRY_WALL_STONE_V[0] && DRY_WALL_STONE_V[1] <= 1, 'three bands, apart');
  assert.ok(DRY_WALL_STONE_MID_V - 0.17 / DRY_WALL_TILE_M >= DRY_WALL_STONE_V[0] - 1e-9 && DRY_WALL_STONE_MID_V + 0.17 / DRY_WALL_TILE_M <= DRY_WALL_STONE_V[1] + 1e-9,
    'a 0.34 m stone fits the stone band about its middle');
  let skinJoints = 0, skinLum = 0, skinN = 0, steps = 0;
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    if (v < DRY_WALL_STONE_V[0] || v > DRY_WALL_STONE_V[1]) continue;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      skinJoints += a.joint[i]; skinN++;
      const l = (a.px[i * 4] + a.px[i * 4 + 1] + a.px[i * 4 + 2]) / 765;
      skinLum += l;
      // a joint is a sharp dark step along u: none in a stone's skin
      if (x > 0) { const p = ((a.px[(i - 1) * 4] + a.px[(i - 1) * 4 + 1] + a.px[(i - 1) * 4 + 2]) / 765); if (p - l > 0.25) steps++; }
    }
  }
  assert.equal(skinJoints, 0, 'no joint in the stone band');
  assert.ok(steps < skinN * 0.002, `no cell edge either: no sharp dark step across it (${steps} of ${skinN})`);
  assert.ok(skinLum / skinN > 0.62 && skinLum / skinN < 0.86, `a pale stone under the map's tone (${(skinLum / skinN).toFixed(3)})`);
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
const lay = (lines, mobile = false) => drain(buildFieldWorks(fieldOf(lines), noise, { walls: true, banks: false, spawns: [{ x: 0, z: -400 }], mobile, merged: true }));
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
  // the cells: each a near form and a far form in the same place, the far a fraction of the near; the far form keeps
  // the wall's line and its height, and draws no fallen stone
  assert.ok(built.wallCells.length >= 6 && built.receipt.cells === built.wallCells.length, `the wall laid by cell (${built.wallCells.length} cells of 64 m)`);
  for (const cell of built.wallCells) {
    assert.ok(cell.near && cell.far, 'a cell of a whole wall has both forms');
    const a = cell.near.boundingBox, b = cell.far.boundingBox;
    assert.ok(a.min.x >= cell.box.minX - 1e-6 && a.max.x <= cell.box.maxX + 1e-6 && b.min.x >= cell.box.minX - 1e-6 && b.max.x <= cell.box.maxX + 1e-6, 'the box holds both forms');
    assert.ok(Math.abs((a.min.x + a.max.x) - (b.min.x + b.max.x)) < 4, 'the far form stands where the near form does');
    assert.ok(cell.box.maxX - cell.box.minX < 64 + 3, 'a cell is no longer than its side (and a slot)');
  }
  assert.ok(built.receipt.farTriangles < built.receipt.triangles * 0.25, `the far form a quarter of the near or less (${built.receipt.farTriangles} against ${built.receipt.triangles})`);
  const fp = built.wallFarGeometry.attributes.position.array;
  let farOff = 0, farHigh = 0;
  // (the foot's half width reaches 0.51 m: 0.43 + 0.04 of wander + 0.04 of a station's own)
  for (let i = 0; i < fp.length; i += 3) { if (Math.abs(fp[i + 2]) > 0.52) farOff++; if (fp[i + 1] - 2 > 1.0) farHigh++; }
  assert.equal(farOff, 0, 'the far form is the wall alone: no fallen stone, within its foot');
  assert.equal(farHigh, 0, 'the far form never above a metre');
  assert.ok(phone.receipt.farTriangles < built.receipt.farTriangles, 'the phones\' far form is fewer still');
  for (const b of [built, again, phone]) {
    b.wallGeometry.dispose(); b.wallFarGeometry.dispose();
    for (const c of b.wallCells) { c.near?.dispose(); c.far?.dispose(); }
  }
}
// (b17) the stone form: every cell of the long wall laid stone by stone, as the camera's coming near lays it
{
  const built = lay([[-200, 0, 200, 0]]);
  assert.ok(built.fine && built.fine.lines.length === 1, 'the stone form\'s source: the wall lines and the cells they touch');
  assert.equal(lay([[-200, 0, 200, 0]], true).fine, null, 'none on a phone');
  const keys = built.wallCells.map((c) => c.key);
  const forms = keys.map((key) => buildFieldWallFine(built.fine, key));
  // the same stones whichever cell is laid first, and however often
  const again = [...keys].reverse().map((key) => buildFieldWallFine(built.fine, key)).reverse();
  forms.forEach((g, i) => assert.deepEqual(Array.from(g?.attributes.position.array ?? []), Array.from(again[i]?.attributes.position.array ?? []), 'deterministic, cell by cell'));
  let tris = 0, high = 0, off = 0, outOfCell = 0, copeTops = 0, jut = 0;
  const faceLum = [];
  const CELL = 64;
  forms.forEach((g, i) => {
    if (!g) return;
    tris += g.index.count / 3;
    const p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color.array;
    const cx = (Math.floor(keys[i] / 1024) - 512) * CELL;
    for (let v = 0; v < p.length / 3; v++) {
      const x = p[v * 3], y = p[v * 3 + 1] - 2, z = p[v * 3 + 2];
      if (y > 1.0) high++;
      if (Math.abs(z) > 0.9) off++;
      if (x < cx - 1 || x > cx + CELL + 1) outOfCell++;
      // the faces seen across the wall (|normal.z| high): the body's (dark, the joint) and the stones' (bright, proud)
      if (Math.abs(n[v * 3 + 2]) > 0.8 && y > 0.1 && y < 0.6) {
        faceLum.push((0.2126 * c[v * 3] + 0.7152 * c[v * 3 + 1] + 0.0722 * c[v * 3 + 2]) / 255);

      }
      // the coping's top edges, over the body (whose crown and stones stand a coping's height lower)
      if (n[v * 3 + 1] > 0.85 && y > 0.75) copeTops++;
      // a through-stone's sides: faces along the wall, out past the body's faces, under the coping and off the heads (the
      // stones on the faces have no sides, only their faces and their bevels)
      if (Math.abs(n[v * 3]) > 0.9 && y > 0.1 && y < 0.55 && Math.abs(z) > 0.22 && Math.abs(x) < 195) jut++;
    }
  });
  const metres = built.receipt.wallM;
  assert.ok(forms.filter(Boolean).length >= built.wallCells.length - 1, 'every cell of a whole wall has its stone form');
  assert.equal(high, 0, 'never above a metre');
  assert.equal(off, 0, 'within 0.9 m of the wall\'s line');
  assert.equal(outOfCell, 0, 'a cell\'s stones in its own square (a stone over its edge belongs to the cell of its middle)');
  // the faces seen across the wall: the stones' (most of them) and, in the joints between, the body's at JOINT_SHADE of
  // the stone (the dark of a dry joint, about half as bright as the stones round it)
  faceLum.sort((a, b) => a - b);
  const med = faceLum[faceLum.length >> 1], dark = faceLum.filter((l) => l < med * 0.6);
  const darkMean = dark.reduce((a, b) => a + b, 0) / Math.max(1, dark.length);
  assert.ok(dark.length > 0 && dark.length < faceLum.length * 0.35 && darkMean < med * 0.62,
    `the stones over the body's darkened faces, the dark only in the joints (${dark.length} of ${faceLum.length} face vertices at ${(darkMean / med).toFixed(2)} of the median)`);
  assert.ok(jut >= metres * 3, `through-stones jut from both faces (${jut} side vertices over ${metres.toFixed(0)} m)`);
  assert.ok(copeTops >= metres * 6, `a coping of slabs on edge along the top (${copeTops} top vertices over 0.75 m over ${metres.toFixed(0)} m)`);
  assert.ok(tris / metres < 330, `within its budget (${(tris / metres).toFixed(0)} triangles a metre)`);
  assert.ok(tris > built.receipt.triangles * 3, `stone by stone: several times the mid form (${tris} against ${built.receipt.triangles})`);
  // built in slices (the props' switch runs them within a frame budget): every few dozen stones a slice
  {
    const steps = buildFieldWallFineSteps(built.fine, keys[2]);
    let slices = 0, step = steps.next();
    while (!step.done) { slices++; step = steps.next(); }
    const stones = step.value.index.count / 3 / 8;
    assert.ok(slices >= stones / 80, `the stone form in slices (${slices} slices for about ${stones.toFixed(0)} stones)`);
    step.value.dispose();
  }
  for (const g of [...forms, ...again]) g?.dispose();
  built.wallGeometry.dispose(); built.wallFarGeometry.dispose();
  for (const c of built.wallCells) { c.near?.dispose(); c.far?.dispose(); }
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
  built.wallFarGeometry.dispose();
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
  built.wallGeometry.dispose(); built.wallFarGeometry.dispose();
}

// ---------------------------------------------------------------------------------------------- 3. the wiring
{
  const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
  assert.match(props, /const print = yield\* makeDryWall\(aniso, mobileProps \? 256 : 512\);/, 'the walls paint their print (half size on the phones)');
  assert.match(props, /map: print\.albedo, normalMap: print\.normal, roughnessMap: print\.surface, aoMap: print\.surface,\n\s*vertexColors: true,/, 'on their own material, the vertex tone over the print');
  assert.match(props, /engineCtx\.setupShadowMaterial\(wallMaterial, \(shader\) => \{ grimeHook\(shader\); applyStoneWallHook\(shader, stoneShape\); \}\);/, 'a lit material on the cascades, under the grime and the lichen by world place');
  assert.match(props, /works\.castShadow = false;\n\s*works\.receiveShadow = true;/, 'no shadow cast, shadows received');
  assert.match(props, /if \(built\.bankGeometry\) place\(built\.bankGeometry, mats\.rock,/, 'the banks on the rock material');
  // near-only detail: the cells' near forms and far forms in two batches, the near shown within the quality's distance
  assert.match(props, /const near = batchOf\(built\.wallCells\.map\(\(c\) => c\.near\), 'props-field-works'\);/, 'the near forms one batch');
  assert.match(props, /const far = batchOf\(built\.wallCells\.map\(\(c\) => c\.far\), 'props-field-works-far'\);/, 'the far forms another');
  assert.match(props, /batch\.castShadow = false;\n\s*batch\.receiveShadow = true;/, 'neither casts a shadow');
  assert.match(props, /batch\.perObjectFrustumCulled = true;/, 'a cell outside the frustum is culled');
  assert.match(props, /updateFineDetail\(cameraPos\);\n\s*updateFieldWallLod\(cameraPos\);/, 'the switch runs with the props\' other distances');
  assert.match(props, /const midShown = show && !cell\.stones;\n\s*if \(midShown !== cell\.midShown\) \{ cell\.midShown = midShown; if \(near && cell\.near >= 0\) near\.setVisibleAt\(cell\.near, midShown\); \}/,
    'a cell shows its stone form, its mid form or its far form: the mid hidden under the stones');
  assert.match(props, /if \(far && cell\.far >= 0\) far\.setVisibleAt\(cell\.far, !show\);/, 'the far form past the near distance');
  // (b17) the stone tier: built when the camera comes within its distance, one cell a frame, let go when it leaves
  assert.match(props, /if \(wantStones && cell\.stones === null && !wallJob && lod\.fine\) \{\n\s*wallJob = \{ cell, steps: buildFieldWallFineSteps\(lod\.fine, cell\.key\) \};/, 'one cell\'s stone form at a time');
  assert.match(props, /while \(!step\.done && performance\.now\(\) - start < FIELD_WALL_STONE_BUDGET_MS\) step = wallJob\.steps\.next\(\);/, 'built a few milliseconds a frame');
  assert.ok(Number(/const FIELD_WALL_STONE_BUDGET_MS = (\d+(?:\.\d+)?);/.exec(props)[1]) <= 3, 'within a small share of a frame');
  assert.match(props, /\} else if \(!wantStones && wallJob\?\.cell === cell\) \{\n\s*wallJob\.steps\.return\(null\);/, 'dropped when the camera turns away before it is done');
  assert.match(props, /if \(cell\.stones\) \{ group\.remove\(cell\.stones\); cell\.stones\.geometry\.dispose\(\); \}/, 'let go (its geometry, never the shared material) when the camera leaves');
  assert.match(props, /mesh\.castShadow = false; mesh\.receiveShadow = true; mesh\.matrixAutoUpdate = false;/, 'casting no shadow, as the other forms');
  // the readiness the probes wait on: the cells still to build, as the grass's work state (a snapshot, no work done)
  assert.match(props, /if \(wantStones && cell\.stones === null\) pending\+\+;/, 'the cells still wanting their stones counted');
  assert.match(props, /lod\.pending = pending;/, 'at every switch');
  const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
  assert.match(map, /getFieldWallWorkState: \(\) => \(\{ pending: \(props\.group\.userData\.fieldWallLod as \{ pending\?: number \} \| undefined\)\?\.pending \?\? 0 \}\),/,
    'the world reports them (a capture waits for the stones before it shoots)');
  const fineTable = /const FIELD_WALL_FINE_M: Readonly<Record<string, number>> = \{([^}]+)\}/.exec(props)[1];
  const fine = Object.fromEntries([...fineTable.matchAll(/'?([a-z-]+)'?: (\d+)/g)].map((m) => [m[1], Number(m[2])]));
  assert.ok(fine.high > 0 && fine.high <= 30 && fine.ultra <= 45 && fine.low === 0 && fine['mobile-high'] === 0 && fine.mobile === 0 && fine['mobile-low'] === 0,
    `the stones within a shorter radius than the mid form, none at Low or on a phone (${JSON.stringify(fine)})`);
  const table = /const FIELD_WALL_NEAR_M: Readonly<Record<string, number>> = \{([^}]+)\}/.exec(props)[1];
  const near = Object.fromEntries([...table.matchAll(/'?([a-z-]+)'?: (\d+)/g)].map((m) => [m[1], Number(m[2])]));
  assert.ok(near.high <= 80 && near.ultra <= 110 && near['mobile-high'] <= 45 && near.mobile <= 35 && near['mobile-low'] <= 25,
    `the near form within a short radius, shorter on the phones (${JSON.stringify(near)})`);
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

// ---------------------------------------------------------------------------------------------- 4. the uploads
// A canvas texture uploads flipped (its top row at v = 1; a DataTexture as written). The field-stone and mud painters
// lay their bands with v down the image from row 0 (v = (row + 0.5) / size) and the props reverse their rows before the
// upload (b13); the dry-wall painter paints the GPU's way round (v = 1 - (row + 0.5) / size) and uploads as painted.
// Each print is built here by props.ts's own code — its builder, the reversal and the surface helper read out of the
// source and run against the real painters and the real canvas upload (textureFromRgbaPixels) — and sampled as WebGL
// samples it (bilinear between texel centres, repeat-wrapped, the source's rows bottom-up under flipY) against its
// painter's rows at the painter's v; the same read turned over must differ, so the check tells the mirror apart.
{
  /** WebGL's bilinear sample of an uploaded RGBA8 source (rows top-down) at (u, v), repeat-wrapped. */
  const glSample = (bytes, w, h, channel, flipY, u, v) => {
    const x = u * w - 0.5, y = v * h - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const col = (c) => ((c % w) + w) % w;
    const row = (r) => { const t = ((r % h) + h) % h; return flipY ? h - 1 - t : t; };
    const at = (c, r) => bytes[(row(r) * w + col(c)) * 4 + channel] / 255;
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx, b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
  const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('props.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declarations = (names) => names.map((name) => {
    const found = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.equal(found.length, 1, `props.ts: one declaration of ${name}`);
    return found[0].getText(ast);
  }).join('\n');
  globalThis.ImageData = class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
  globalThis.document = { createElement() { const canvas = { width: 0, height: 0 }; canvas.getContext = () => ({ putImageData(image) { canvas.pixels = image.data; } }); return canvas; } };
  try {
    const api = new Function('THREE', 'toTexture', 'normalFromHeight', 'applyTone', 'paintFieldStoneBuffers', 'liftFieldStoneMean',
      'paintFieldMudBuffers', 'tintFieldMudToEarth', 'paintDryWallBuffers', stripTypeScriptTypes(
        declarations(['clamp', 'surfaceFromHeight', 'flipPrintRows', 'makeFieldStone', 'makeFieldMud', 'makeDryWall'])
      ) + '\nreturn { makeFieldStone, makeFieldMud, makeDryWall };')(THREE, textureFromRgbaPixels, normalTextureFromHeight,
      (px, tone) => { assert.equal(tone, null, 'no tone law here: a tone colours the texels, it moves no row'); return px; },
      paintFieldStoneBuffers, liftFieldStoneMean, paintFieldMudBuffers, tintFieldMudToEarth, paintDryWallBuffers);
    const S = 128, earth = mudEarthOfGround(0xad9b7c);
    // the painters' own rows (the stone lifted and the mud tinted as their builders do, before any reversal)
    const stone = drain(paintFieldStoneBuffers(S)).px.slice(); liftFieldStoneMean(stone, S);
    const mud = drain(paintFieldMudBuffers(S)).px.slice(); tintFieldMudToEarth(mud, S, earth);
    const dryWall = drain(paintDryWallBuffers(S)).px;
    const cases = [
      ['the field-stone print', drain(api.makeFieldStone(4, null, S)), stone, false, FIELD_STONE_HEARTING_V],
      ['the mud print', drain(api.makeFieldMud(4, null, S, earth)), mud, false, FIELD_MUD_PLAIN_V],
      ['the dry-wall print', drain(api.makeDryWall(4, S)), dryWall, true, DRY_WALL_FACE_V],
    ];
    let state = 0x51f7a3;
    const rnd = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    for (const [label, built, painted, paintedFlipped, band] of cases) {
      const uploaded = built.albedo.image.pixels;
      assert.equal(built.albedo.image.width, S, `${label}: its size`);
      let worst = 0, mirrored = 0, bandWorst = 0;
      const N = 2500;
      for (let k = 0; k < N; k++) {
        const u = rnd(), v = rnd(), inBand = band[0] + (band[1] - band[0]) * rnd();
        for (let c = 0; c < 3; c++) {
          worst = Math.max(worst, Math.abs(glSample(uploaded, S, S, c, built.albedo.flipY, u, v) - glSample(painted, S, S, c, paintedFlipped, u, v)));
          bandWorst = Math.max(bandWorst, Math.abs(glSample(uploaded, S, S, c, built.albedo.flipY, u, inBand) - glSample(painted, S, S, c, paintedFlipped, u, inBand)));
        }
        mirrored += Math.abs(glSample(uploaded, S, S, 0, !built.albedo.flipY, u, v) - glSample(painted, S, S, 0, paintedFlipped, u, v));
      }
      assert.ok(worst <= 1 / 255 && bandWorst <= 1 / 255, `${label}: the GPU reads the painter's texel at the painter's v (worst |Δ| ${(worst * 255).toFixed(2)}/255, in its band ${(bandWorst * 255).toFixed(2)}/255)`);
      assert.ok(mirrored / N > 0.02, `${label}: the check tells the mirror apart (mean |Δ| turned over ${(mirrored / N).toFixed(3)})`);
      // (the relief and the surface go up with the albedo's rows: a texel's height under its colour)
      assert.equal(built.normal.flipY, built.albedo.flipY, `${label}: the relief uploads the albedo's way`);
      assert.equal(built.surface.flipY, built.albedo.flipY, `${label}: the surface uploads the albedo's way`);
    }
  } finally { delete globalThis.ImageData; delete globalThis.document; }
}

console.log('fieldWalls.selftest: the print\'s stones and dry joints, a stepped uneven crown, heads facing out, fallen stretches, breaches and stones, the T cut back, the phones\' fewer, the wiring; the three prints read by the GPU at their painters\' v');
