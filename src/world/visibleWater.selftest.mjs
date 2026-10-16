// The tactical map's water is the water a player can see (visibleWater.ts; the Kestrel water plan's phase 2). A CPU
// parity receipt: it holds the raster against the CPU water mask (heightField.getWaterMaskAt, the material's own ramp)
// and the water sheet's REAL geometry (shallowWaterGeometrySteps, run here), not against GPU pixels. On each of the
// twelve liquid battlefields:
//   - the raster sits on the sheet's own 8 m grid (four cells a side per sheet cell) and uses the sheet's admission rule
//     (a cell is built when a corner or its centre carries a mask above WATER_SHEET_MIN_COVERAGE, 0.002) and its
//     discard (VISIBLE_WATER_MIN, 0.015) — shallowWater.ts imports all three from visibleWater.ts;
//   - every raster cell, all 512² of them, agrees with the truth: water where the built geometry holds the cell and the
//     mask at its centre reaches VISIBLE_WATER_MIN, else dry. That covers the raster's shortcuts (cells skipped by the
//     corner/centre rule, cells taken whole when every corner and the centre are deep);
//   - Tidegate Polders' canals (sheet water outside every lake and marsh contour) are on the raster; the flooded paddies
//     are not (the terrain material does not draw Jade River Delta's six as water: visibleWater.ts);
//   - nor the real paddies (2026-10-16): the sheet's lattice keeps out of every cell a paddy stands in (each draws its
//     own level surface) and the raster skips the same cells by the same predicate (paddySheetCell), on Delta's wet mask;
//   - the build is bounded: under a third of a brute-force 2 m raster's reads, timed per map (lazy, once per world).
// No area pins and no plate hash: plate freshness is the bake's business (tools/bake-minimap-assets.mjs).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAP_IDS } from './maps/mapIds.ts';
import { worldBuildConfig } from './worldBuildConfig.ts';
import { createHeightField, createLayout } from './terrain.ts';
import { shallowWaterGeometrySteps } from './shallowWater.ts';
import { shorelineDistance } from './shoreline.ts';
import {
  VISIBLE_WATER_MIN, WATER_SHEET_GRID_M, WATER_SHEET_MIN_COVERAGE, buildVisibleWaterRaster, glslFloat, paddySheetCell, visibleWaterAt,
} from './visibleWater.ts';

// ---- one grid, one admission, one discard: the sheet takes them from here ----
const sheetSource = await readFile(new URL('./shallowWater.ts', import.meta.url), 'utf8');
assert.match(sheetSource,
  /import \{\s*VISIBLE_WATER_MIN, WATER_SHEET_GRID_M as GRID_STEP_M, WATER_SHEET_MIN_COVERAGE as MIN_COVERAGE, glslFloat, paddySheetCell,\s*\} from '\.\/visibleWater\.ts';/,
  'the sheet imports its grid, admission, paddy cells and discard from visibleWater.ts');
assert.doesNotMatch(sheetSource, /const (GRID_STEP_M|MIN_COVERAGE|PADDY_CELL_PROBES) =/, 'the sheet keeps no grid, admission or paddy probes of its own');
assert.match(sheetSource, /const paddyCell = paddySheetCell\(field\);/, 'the sheet\'s paddy cells are the shared predicate');
assert.match(sheetSource, /if \(paddyCell\?\.\(x \* step - half, z \* step - half, step\)\) continue;/, 'the lattice keeps out of them');
assert.deepEqual(sheetSource.match(/discard;/g), ['discard;'], 'the sheet has one discard');
assert.match(sheetSource, /if \(wet < \$\{glslFloat\(VISIBLE_WATER_MIN\)\}\) discard;/, 'the sheet discards below VISIBLE_WATER_MIN');
assert.match(sheetSource, /const segments = Math\.ceil\(field\.size \/ GRID_STEP_M\);/, 'the sheet\'s grid is the shared one');
assert.match(sheetSource, /if \(corners <= MIN_COVERAGE\s*&& field\.getWaterMaskAt\(\(x \+ 0\.5\) \* step - half, \(z \+ 0\.5\) \* step - half\) <= MIN_COVERAGE\) continue;/,
  'the sheet admits a cell by its corners or its centre');
assert.equal(VISIBLE_WATER_MIN, 0.015);
assert.equal(WATER_SHEET_GRID_M, 8);
assert.equal(WATER_SHEET_MIN_COVERAGE, 0.002);
assert.equal(glslFloat(VISIBLE_WATER_MIN), '0.015');
assert.equal(glslFloat(1), '1.0', 'a GLSL float always carries its point');
assert.equal(paddySheetCell({}), null, 'no paddies, no probe');
assert.equal(paddySheetCell({ getPaddyWaterLevelAt: () => 1, getPaddyWaterQuads: () => [] }), null, 'no paddy surfaces, no probe');
{
  const owns = paddySheetCell({ getPaddyWaterLevelAt: (x, z) => (Math.hypot(x - 8, z - 8) < 0.5 ? 1 : NaN), getPaddyWaterQuads: () => [{}] });
  assert.equal(owns(0, 0, 8), true, 'a paddy under a cell\'s corner owns the cell');
  assert.equal(owns(4, 4, 8), true, 'and under its centre');
  assert.equal(owns(16, 16, 8), false, 'clear of every probe, the sheet\'s');
}

/**
 * The sheet cells the real geometry builds: each admitted cell pushes six indices, its (−x, −z) corner first, then its
 * +z and +x neighbours one grid step off. The paddies' own surfaces follow the lattice in the same buffer (2 m cells,
 * turned with each paddy): they are not the lattice's cells, so a triangle whose edges are not the grid step is skipped.
 */
function sheetAdmission(field) {
  const segments = Math.ceil(field.size / WATER_SHEET_GRID_M), step = field.size / segments, half = field.size / 2;
  const admitted = new Uint8Array(segments * segments);
  const steps = shallowWaterGeometrySteps(field);
  let next;
  do next = steps.next(); while (!next.done);
  const sheet = next.value;
  if (!sheet) return { admitted, segments, step, cells: 0 };
  const index = sheet.geometry.getIndex().array, position = sheet.geometry.getAttribute('position');
  assert.equal(index.length % 6, 0, 'two triangles a sheet cell');
  let paddyCells = 0;
  for (let t = 0; t < index.length; t += 6) {
    const a = index[t], c = index[t + 1], b = index[t + 2];
    if (Math.abs(position.getX(b) - position.getX(a) - step) > 1e-3 || Math.abs(position.getZ(c) - position.getZ(a) - step) > 1e-3
      || position.getZ(b) !== position.getZ(a) || position.getX(c) !== position.getX(a)) { paddyCells++; continue; }
    const cx = Math.round((position.getX(index[t]) + half) / step), cz = Math.round((position.getZ(index[t]) + half) / step);
    assert.ok(cx >= 0 && cz >= 0 && cx < segments && cz < segments, 'a sheet cell inside the square');
    admitted[cz * segments + cx] = 1;
  }
  sheet.geometry.dispose();
  if (!field.getPaddyWaterQuads?.().length) assert.equal(paddyCells, 0, 'a map without paddies: every cell is the lattice\'s');
  return { admitted, segments, step, cells: index.length / 6 - paddyCells };
}

const rows = [];
let liquidMaps = 0, worstMs = 0, worstMsMap = '';
for (const id of MAP_IDS) {
  const config = worldBuildConfig(id);
  const liquid = !!config.splat?.seaLake && !createLayout(config).terrain?.frozenMarshes;
  if (!liquid) continue;
  liquidMaps++;
  const field = createHeightField(1337, config);
  assert.equal(typeof field._waterWetnessAt, 'function', `${id}: the terrain builds its liquid sheet (terrain.ts liquidWater)`);
  let maskReads = 0;
  const source = { size: field.size, getWaterMaskAt: (x, z) => { maskReads++; return field.getWaterMaskAt(x, z); },
    getPaddyWaterLevelAt: field.getPaddyWaterLevelAt, getPaddyWaterQuads: field.getPaddyWaterQuads };
  const t0 = performance.now();
  const raster = buildVisibleWaterRaster(source);
  const ms = performance.now() - t0;
  if (ms > worstMs) { worstMs = ms; worstMsMap = id; }
  const { admitted, segments, step, cells: sheetCells } = sheetAdmission(field);
  assert.ok(sheetCells > 0, `${id}: the sheet builds`);
  assert.equal(raster.size, field.size, `${id}: the raster covers the square`);
  assert.equal(raster.cells, segments * 4, `${id}: four raster cells a side per sheet cell`);
  assert.equal(raster.cellM, step / 4, `${id}: a quarter of the sheet's cell (${raster.cellM} m)`);
  assert.ok(raster.cellM <= 2, `${id}: 2 m or finer`);
  assert.ok(raster.samples <= raster.cells * raster.cells / 3, `${id}: bounded (${raster.samples} reads, a brute-force 2 m raster ${raster.cells ** 2})`);
  assert.equal(maskReads, raster.samples, `${id}: every read is counted`);

  // every cell against the truth: the built sheet's cells and the mask at the centre
  const n = raster.cells, half = field.size / 2, cellM = raster.cellM;
  const mismatches = [];
  let mismatched = 0, sheetWater = 0, outsideDiscs = 0, paddyWet = 0;
  const paddyCell = paddySheetCell(field);
  const discs = [...field._layout.marshes, ...field._layout.lakes];
  for (let j = 0; j < n; j++) {
    const z = -half + (j + 0.5) * cellM;
    for (let i = 0; i < n; i++) {
      const x = -half + (i + 0.5) * cellM;
      const sheetCell = admitted[Math.floor(j / 4) * segments + Math.floor(i / 4)];
      const truth = sheetCell && field.getWaterMaskAt(x, z) >= VISIBLE_WATER_MIN ? 1 : 0;
      const got = raster.water[j * n + i];
      // a paddy's sheet cell: dry on the raster though the mask reads visible water there
      if (paddyCell?.(Math.floor(i / 4) * step - half, Math.floor(j / 4) * step - half, step)) {
        assert.equal(got, 0, `${id}: (${x.toFixed(1)}, ${z.toFixed(1)}) a paddy's cell is not the sheet's water`);
        if (field.getWaterMaskAt(x, z) >= VISIBLE_WATER_MIN) paddyWet++;
      }
      if (got !== truth && mismatched++ < 8) mismatches.push(`(${x.toFixed(1)}, ${z.toFixed(1)}) raster ${got} world ${truth}`);
      if (truth) {
        sheetWater++;
        if (!discs.some((d) => Math.abs(x - d.x) < d.r * 2 && Math.abs(z - d.z) < d.r * 2 && shorelineDistance(d, x, z, 1) <= 1)) outsideDiscs++;
      }
    }
  }
  assert.equal(mismatched, 0, `${id}: every raster cell is the world's (${mismatched} differ: ${mismatches.join('; ')})`);
  assert.ok(sheetWater > 0, `${id}: the sheet's water is on the raster`);
  assert.equal(visibleWaterAt(raster, -half - 1, 0), false, `${id}: nothing past the square`);
  rows.push({ id, sheetM2: sheetWater * cellM * cellM, outsideDiscsM2: outsideDiscs * cellM * cellM, paddyWet, reads: raster.samples, ms });
}
assert.equal(liquidMaps, 12, 'twelve liquid battlefields');
const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
assert.ok(byId.polders.outsideDiscsM2 > 0, 'Tidegate Polders: its canals (water outside every lake and marsh) are on the raster');
assert.ok(byId.delta.paddyWet > 0, `Jade River Delta: the paddies' wet mask is read and left off the raster (${byId.delta.paddyWet} cells)`);
assert.ok(worstMs < 1500, `the raster is built lazily once per world in tens of milliseconds (worst ${worstMsMap} ${worstMs.toFixed(0)} ms)`);

const k = (m2) => `${(m2 / 1000).toFixed(1)}k`;
console.log(`visibleWater.selftest: ${liquidMaps} liquid maps, every 2 m cell = the sheet's real geometry + the CPU mask; `
  + rows.map((r) => `${r.id} ${k(r.sheetM2)}${r.outsideDiscsM2 ? ` (${k(r.outsideDiscsM2)} outside discs)` : ''}${r.paddyWet ? ` (${r.paddyWet} paddy cells left to the paddies)` : ''} ${r.reads} reads ${r.ms.toFixed(0)} ms`).join('; '));
