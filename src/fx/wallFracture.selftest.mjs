// Walls that break where they are struck and come down where they lose what holds them (fx/wallFracture.ts; the owner,
// 2026-10-10: "the destruction of buildings needs to be a lot better too, rn its way to sporadic and ugly instead of
// behaving like it would with physics"). A two-storey brick house: a round breaks its wall at its point (knocked
// through, the skin's recess round it, cracks further out), nothing breaks away from the point, damage adds up, the
// brickwork over a breach falls in a triangle, a window loses its lintel when a jamb goes, a breach at the foot of a wall
// brings the storey over it down, a gable end's grid runs up to its apex and falls with the wall blown out under it, and
// every outcome is the same twice.
import assert from 'node:assert/strict';
import {
  CELL_CRACKED, CELL_FALLEN, CELL_GONE, CELL_INTACT, CELL_OPENING, CELL_SPALLED, CELL_VOID, cellRect, createWallFracture,
  createWallStrikeOutcome, strikeWall, struckFace, wallFractureCensus,
} from './wallFracture.ts';

const brick = { material: 'brick', bucket: 'brick', tint: [1, 1, 1], thicknessM: 0.3, share: 1 };
function face(name, storey, origin, u, out, width, openings) {
  return { name, origin, u, out, width, height: 3, section: storey * 4 + ['front', 'right', 'back', 'left'].indexOf(name),
    bucket: 'brick', layers: [brick], openings, members: [], masonry: null };
}
function house() {
  const storeys = [0, 1].map((s) => {
    const y = s * 3;
    return { index: s, y0: y, y1: y + 3, jetty: [0, 0, 0, 0], framed: false, floor: null, faces: [
      face('front', s, [0, y, 5], [1, 0, 0], [0, 0, 1], 8, s === 0
        ? [{ kind: 'door', u: -2.5, w: 1, y0: 0, h: 2.1, reveal: 0.3 }, { kind: 'window', u: 2, w: 1.2, y0: 0.9, h: 1.2, reveal: 0.3 }]
        : [{ kind: 'window', u: -2.5, w: 1.2, y0: 0.9, h: 1.2, reveal: 0.3 }, { kind: 'window', u: 2, w: 1.2, y0: 0.9, h: 1.2, reveal: 0.3 }]),
      face('right', s, [4, y, 0], [0, 0, -1], [1, 0, 0], 10, []),
      face('back', s, [0, y, -5], [-1, 0, 0], [0, 0, -1], 8, []),
      face('left', s, [-4, y, 0], [0, 0, 1], [-1, 0, 0], 10, []),
    ] };
  });
  return { structureIdx: 7, kit: 'default', seed: 1234, massClass: 'house', placement: { x: 0, y: 0, z: 0, yaw: 0 }, w: 8, d: 10, h: 8,
    plinth: null, storeys, roof: null, chimneys: [], interior: { color: [0.02, 0.02, 0.02], open: false }, rubble: [brick],
    remnant: { stubHeightM: 0.8, corners: true, chimneys: false } };
}
const front0 = 0, front1 = 4;
const rect = [0, 0, 0, 0];
const centreOf = (grid, c) => { cellRect(grid, c, rect); return [(rect[0] + rect[1]) / 2, (rect[2] + rect[3]) / 2]; };

// ---- the grid: brick courses offset by half a cell, the openings marked ----------------------------------------
{
  const wall = createWallFracture(house());
  assert.equal(wall.faces.length, 8);
  const g = wall.faces[front0];
  assert.ok(g.bonded && g.rowY.length - 1 === 10, `ten bonded courses of 0.3 m (${g.rowY.length - 1})`);
  // every other row starts with a half cell (the bond), its joints a little uneven, never a ruled grid
  const cw = 8 / Math.round(8 / 0.46);
  for (let r = 0; r < g.rowY.length - 1; r++) {
    const first = g.cellU[2 * g.rowStart[r] + 1] - g.cellU[2 * g.rowStart[r]];
    if (r % 2) assert.ok(first > 0.25 * cw && first < 0.75 * cw, `row ${r} starts with half a cell (${(first / cw).toFixed(2)})`);
    else assert.ok(first > 0.75 * cw && first < 1.25 * cw, `row ${r} starts with a whole cell (${(first / cw).toFixed(2)})`);
  }
  const widths = [];
  for (let c = g.rowStart[0]; c < g.rowStart[1] - 1; c++) widths.push(g.cellU[2 * c + 1] - g.cellU[2 * c]);
  assert.ok(Math.max(...widths) - Math.min(...widths) > 0.02, 'the joints are uneven');
  const openings = Array.from(g.state).filter((s) => s === CELL_OPENING).length;
  assert.ok(openings >= 14 && openings <= 26, `the door and the window take their cells (${openings})`);
  assert.equal(struckFace(wall, 0, 1.5, 9), null, 'a point far from every face strikes none');
  assert.equal(struckFace(wall, 0.3, 1.2, 5.2).face, front0, 'a point before the front face strikes it');
  assert.equal(struckFace(wall, 0.3, 4.2, 5.1).face, front1, 'and the storey over it by height');
}

// ---- a round breaks the wall at its point, nowhere else --------------------------------------------------------
{
  const wall = createWallFracture(house());
  const out = createWallStrikeOutcome();
  assert.ok(strikeWall(wall, { x: 0, y: 1.2, z: 5.05, dirX: 0, dirZ: -1, radiusM: 0.6, kind: 'blast', seed: 99 }, out));
  const g = wall.faces[front0];
  assert.ok(out.knocked.length >= 5, `knocked through at the point (${out.knocked.length})`);
  assert.ok(out.spalled.length >= 6 && out.cracked.length >= 6, `the recess and the cracks round it (${out.spalled.length}, ${out.cracked.length})`);
  for (const c of out.knocked) {
    const [u, v] = centreOf(g, c);
    assert.ok(Math.hypot(u, v - 1.2) < 0.6 * 1.12 + 0.35, `knocked cells lie in the hole (${u.toFixed(2)}, ${v.toFixed(2)})`);
  }
  for (let c = 0; c < g.state.length; c++) {
    if (g.state[c] === CELL_INTACT || g.state[c] === CELL_OPENING || g.state[c] === CELL_FALLEN) continue;
    const [u, v] = centreOf(g, c);
    assert.ok(Math.hypot(u, v - 1.2) < 0.6 * 2.7 * 1.12 + 0.4, `nothing breaks away from the point (${u.toFixed(2)}, ${v.toFixed(2)})`);
  }
  for (const f of [1, 2, 3, 5, 6, 7]) assert.ok(wall.faces[f].state.every((s) => s === CELL_INTACT), `face ${f} untouched`);
}

// ---- the brickwork over a wide breach: a triangle (a corbel arch: each course stands on half a cell of the one under
// it at most), fewer cells a row going up --------------------------------------------------------------------------
{
  const wall = createWallFracture(house());
  const out = createWallStrikeOutcome();
  const g = wall.faces[front0];
  assert.ok(strikeWall(wall, { x: 0, y: 1.1, z: 5.05, dirX: 0, dirZ: -1, radiusM: 1.0, kind: 'blast', seed: 41 }, out));
  const fell = out.fallen.flat().filter((_, i) => i % 2 === 1);
  assert.ok(fell.length >= 2, `the courses over the breach fall (${fell.length})`);
  // the void over the strike (knocked through or fallen), row by row going up from it: never wider than the row under it
  const perRow = new Map();
  for (let c = 0; c < g.state.length; c++) {
    if (g.state[c] !== CELL_GONE && g.state[c] !== CELL_FALLEN) continue;
    const [u, v] = centreOf(g, c);
    if (v < 1.1 || Math.abs(u) > 3) continue;
    perRow.set(v.toFixed(2), (perRow.get(v.toFixed(2)) ?? 0) + 1);
  }
  const rows = [...perRow.entries()].sort((a, b) => +a[0] - +b[0]).map((e) => e[1]);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i] <= rows[i - 1] + 1, `a triangle: ${rows.join(' ')} cells a row going up`);
  assert.ok(rows[rows.length - 1] <= 2 && rows.length >= 4, `it closes over the breach: ${rows.join(' ')}`);
  for (const c of fell) assert.ok(centreOf(g, c)[1] > 1.1, 'what falls stood over the breach');
}

// ---- damage adds up: two rounds side by side, a third between them -----------------------------------------------
{
  const wall = createWallFracture(house());
  const out = createWallStrikeOutcome();
  const g = wall.faces[front0];
  const at = (u, seed, r = 0.42) => strikeWall(wall, { x: u, y: 1.5, z: 5.05, dirX: 0, dirZ: -1, radiusM: r, kind: 'blast', seed }, out);
  at(-0.85, 1); at(0.85, 2);
  const between = [];
  for (let c = 0; c < g.state.length; c++) { const [u, v] = centreOf(g, c); if (Math.abs(u) < 0.25 && Math.abs(v - 1.5) < 0.2) between.push(c); }
  assert.ok(between.length >= 1 && between.every((c) => g.state[c] !== CELL_GONE && g.state[c] >= CELL_CRACKED),
    'between two holes the courses are cracked or spalled, not gone');
  at(0, 3, 0.3);
  assert.ok(between.every((c) => g.state[c] === CELL_GONE || g.state[c] === CELL_FALLEN), 'a third round between them brings them down');
}

// ---- a window's lintel goes with its jamb ---------------------------------------------------------------------
{
  const wall = createWallFracture(house());
  const out = createWallStrikeOutcome();
  const g = wall.faces[front0];
  // the window at u 2 (1.2 wide, 0.9 to 2.1 up): over it, its lintel's courses
  const over = [];
  for (let c = 0; c < g.state.length; c++) { const [u, v] = centreOf(g, c); if (Math.abs(u - 2) < 0.3 && v > 2.1 && v < 2.5) over.push(c); }
  assert.ok(over.length >= 1);
  // knock out the pier between the door and the window, full height of the window
  strikeWall(wall, { x: 0.95, y: 1.4, z: 5.05, dirX: 0, dirZ: -1, radiusM: 0.75, kind: 'blast', seed: 5 }, out);
  assert.ok(over.every((c) => g.state[c] === CELL_FALLEN || g.state[c] === CELL_GONE), 'the lintel courses over the window fall with its jamb');
}

// ---- an opening stands in its jambs: one jamb gone leaves it, both gone bring it down -----------------------------
{
  const wall = createWallFracture(house());
  const out = createWallStrikeOutcome();
  const g = wall.faces[front0];
  const windowCells = [];
  for (let c = 0; c < g.state.length; c++) if (g.state[c] === CELL_OPENING && Math.abs(centreOf(g, c)[0] - 2) < 0.6) windowCells.push(c);
  assert.ok(windowCells.length >= 4, `the window's cells (${windowCells.length})`);
  // a round by its left jamb (the window spans 1.4 to 2.6 along the face)
  strikeWall(wall, { x: 0.95, y: 1.0, z: 5.05, dirX: 0, dirZ: -1, radiusM: 0.4, kind: 'blast', seed: 21 }, out);
  assert.ok(windowCells.every((c) => g.state[c] === CELL_OPENING), 'one jamb gone: the window stands in the other');
  // a heavy round on the window itself takes both jambs
  strikeWall(wall, { x: 2.0, y: 1.5, z: 5.05, dirX: 0, dirZ: -1, radiusM: 1.1, kind: 'blast', seed: 22 }, out);
  assert.ok(windowCells.some((c) => g.state[c] === CELL_FALLEN), 'both jambs gone: the window comes down with them');
  assert.ok(windowCells.every((c) => g.opening[c] === 1), 'a fallen opening is still known for one (its frame carries no caps)');
}

// ---- a breach at the foot brings the storey over it down -------------------------------------------------------
{
  const wall = createWallFracture(house());
  const out = createWallStrikeOutcome();
  strikeWall(wall, { x: -0.2, y: 1.5, z: 5.05, dirX: 0, dirZ: -1, radiusM: 1.6, kind: 'blast', seed: 8 }, out);
  const upper = out.fallen.some((cluster) => cluster.some((v, i) => i % 2 === 0 && v === front1));
  assert.ok(upper, 'a breach through the ground storey\'s height drops the wall of the storey over it');
  const census = wallFractureCensus(wall);
  assert.ok(census.fallen > 10 && census.gone > 10, `${JSON.stringify(census)}`);
}

// ---- a gable end: its grid runs up to the apex, and a wall blown out under it drops it (wave 388a: "the gable can't
//      hang over a blown-out wall: the load path has to drop it") -----------------------------------------------------
{
  const gabled = () => ({ ...house(), roof: { kind: 'gable', section: 8, pitchDeg: 32, eaveY: 6, ridgeY: 8.5, thicknessM: 0.2,
    covering: brick, structure: brick, battenPitchM: 0.35, rafterPitchM: 0.9, slabs: [] } });
  const wall = createWallFracture(gabled());
  const g = wall.faces[front1];
  assert.ok(g.gableTop && g.height > 5.4 && g.wallHeight === 3, `the front's top storey runs up its gable (${g.height.toFixed(2)} m)`);
  assert.ok(!wall.faces[front1 + 1].gableTop, 'an eaves wall carries no gable');
  const gableCells = [];
  let voids = 0;
  for (let r = 0; r + 1 < g.rowY.length; r++) for (let c = g.rowStart[r]; c < g.rowStart[r + 1]; c++) {
    if (g.state[c] === CELL_VOID) { voids++; assert.ok(g.rowY[r] >= g.wallHeight - 1e-4, 'only over the wall is anything void'); }
    else if (g.rowY[r] >= g.wallHeight - 1e-4) gableCells.push(c);
  }
  assert.ok(voids > 10 && gableCells.length > 20, `its sloping edges void, its triangle cells (${voids} void, ${gableCells.length} cells)`);
  assert.equal(struckFace(wall, 0.2, 7.4, 5.1)?.face, front1, 'a round on the gable strikes it');
  // the wall's top two metres blown out from end to end: the gable over it has nothing left to stand on
  const out = createWallStrikeOutcome();
  for (const x of [-3.4, -2, -0.6, 0.8, 2.2, 3.5]) strikeWall(wall, { x, y: 4.6, z: 5.05, dirX: 0, dirZ: -1, radiusM: 1.2, kind: 'blast', seed: 40 + Math.round(x * 10) }, out);
  const left = gableCells.filter((c) => g.state[c] !== CELL_FALLEN && g.state[c] !== CELL_GONE);
  assert.equal(left.length, 0, `nothing of the gable hangs over the blown-out wall (${left.length} of ${gableCells.length} still up)`);
}

// ---- the same twice -------------------------------------------------------------------------------------------
{
  const run = () => {
    const wall = createWallFracture(house());
    const out = createWallStrikeOutcome();
    const log = [];
    for (const [x, y, s, r, kind] of [[0.4, 1.0, 11, 0.55, 'blast'], [-1.2, 1.9, 12, 0.3, 'kinetic'], [0.9, 4.4, 13, 0.6, 'shaped']]) {
      strikeWall(wall, { x, y, z: 5.04, dirX: 0, dirZ: -1, radiusM: r, kind, seed: s }, out);
      log.push(JSON.stringify(out));
    }
    return { states: wall.faces.map((g) => Array.from(g.state).join('')), log };
  };
  assert.deepEqual(run(), run(), 'deterministic in the anatomy and the strikes');
}
console.log('wallFracture.selftest: a round breaks its wall at its point (through, recess, cracks), damage adds up, the courses '
  + 'over a breach fall in a triangle, a lintel goes with its jamb, a breach at the foot drops the storey over it, a gable falls '
  + 'with the wall under it, the same twice');
