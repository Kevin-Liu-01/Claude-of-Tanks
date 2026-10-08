// Moving-part clearance air (2026-10-06), shared by the interior-fill generator (tools/gen-interior-fills.mjs) and the
// watertight measurement (tools/tank-watertight-measure.mjs, read by the CLI and the fleet gate).
//
// The gun, its mount and its mantlet move relative to the turret, so the air between them and the fixed body can be
// filled in neither frame: turret-frame stock would stop the gun's travel and gun-frame stock would sweep through the
// fixed deck. The generator therefore leaves two kinds of air open on purpose, and the measurement reports both apart
// from the leak, as it reports track lanes and declared bores, so nothing is hidden:
//
// 1. Pockets under the moving group. A leak voxel whose first shell above or below belongs to the moving group, and
//    which lies outside both the turret proper's column span (authored turret* shells) and the moving group's own span,
//    sits ON the turret beneath the gun: the slot under an M1A1 mantlet's lower plate, the depression gap under a
//    Bradley's raised gun mount. The deep-interior test reads it as enclosed because the moving group closes it from
//    above, yet water poured into the turret never reaches it: it lies above the turret's own top shell in its column.
//    The generator has always skipped these voxels (it fills the turret-proper and moving-span cases with turret- or
//    gun-frame stock instead). Main's mantlet rebuilds of 2026-10-04/05 opened 0.06-3.9 L of them per hull. Whatever
//    turret interior such a pocket opens onto stays inside the turret proper's span and is still counted as a leak.
// 2. Declared finite clearance. A profile with a measured gun sweep (tools/m1a1-fill-clearance.mjs, the seven legacy
//    M1A1 mounts) has its generated fill cut back wherever the moving stock pitches or recoils through it. The
//    generator records exactly the cells it cut, on its own lattice, in docs/geometry-gate/moving-clearance-air.json;
//    the measurement reports deep water in those cells apart. A record whose lattice no longer matches the body is
//    stale and exempts nothing, so a geometry change still fails the gate until the fills are regenerated.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Shell groups that move with the gun: the generator's moving test (gun-frame fill included, as it is a gun-frame shell). */
export const MOVING_GROUP = /^(gun|gunMount|mantlet)/i;
const FILL_GROUP = /InteriorFill$/;
const TURRET_PROPER = /^turret/i;

/** Per-column [minY, maxY] of the authored shells whose group name passes `test` (generated fills never count). */
function columnSpans(grid, test) {
  const { shell, nx, ny, nz, groups } = grid;
  const member = new Uint8Array(groups.length + 1);
  for (let g = 0; g < groups.length; g++) member[g + 1] = test.test(groups[g]) && !FILL_GROUP.test(groups[g]) ? 1 : 0;
  const minY = new Int16Array(nx * nz).fill(32767), maxY = new Int16Array(nx * nz).fill(-1);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const g = shell[(z * ny + y) * nx + x]; if (!g || !member[g]) continue;
    const k = z * nx + x; if (y < minY[k]) minY[k] = y; if (y > maxY[k]) maxY[k] = y;
  }
  return { minY, maxY };
}

/** The two column spans the pocket rule reads: the turret proper (turret* shells) and the moving group. The generator
 * computes them once, before any fill exists; the measurement computes them on the authored shells alone, so both read
 * the same spans with or without the shipped fills in the grid. */
export function movingClearanceSpans(grid) {
  return { proper: columnSpans(grid, TURRET_PROPER), moving: columnSpans(grid, MOVING_GROUP) };
}

/** True when voxel (x, y, z) lies strictly inside a column span. */
export function insideSpan(span, grid, x, y, z) {
  const k = z * grid.nx + x;
  return span.minY[k] < y && y < span.maxY[k];
}

/** True when the first shell above or below the voxel belongs to a part that moves relative to the turret body. */
export function underMovingPart(grid, x, y, z) {
  const { shell, nx, ny, groups } = grid;
  for (const dir of [1, -1]) {
    for (let yy = y + dir; yy >= 0 && yy < ny; yy += dir) {
      const g = shell[(z * ny + yy) * nx + x];
      if (g) { if (MOVING_GROUP.test(groups[g - 1])) return true; break; }
    }
  }
  return false;
}

/** The generator's skip rule: a voxel under the moving group, outside both the turret proper's and the moving group's
 * column spans, is a pocket on the turret beneath the gun and is never filled. */
export function movingClearancePocket(grid, spans, x, y, z) {
  return underMovingPart(grid, x, y, z) && !insideSpan(spans.proper, grid, x, y, z) && !insideSpan(spans.moving, grid, x, y, z);
}

// ---- declared finite clearance (docs/geometry-gate/moving-clearance-air.json) ----

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The generated record of the cells each declared clearance cut from its tank's fills. */
export const CLEARANCE_AIR_FILE = resolve(ROOT, 'docs/geometry-gate/moving-clearance-air.json');
let declared = null;

function readDeclared(file = CLEARANCE_AIR_FILE) {
  if (file !== CLEARANCE_AIR_FILE) return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { tanks: {} };
  declared ??= existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { tanks: {} };
  return declared;
}

/** Base64 little-endian Uint16 sextets of inclusive voxel spans, the fill records' own encoding. */
export function encodeSpans(spans) {
  const u16 = new Uint16Array(spans);
  return Buffer.from(u16.buffer, u16.byteOffset, u16.byteLength).toString('base64');
}
function decodeSpans(text) {
  const bytes = Buffer.from(text, 'base64');
  return new Uint16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

/** The declared clearance record of one tank, or null. */
export function declaredClearanceRecord(id, file) {
  return readDeclared(file).tanks?.[id] ?? null;
}

/**
 * Voxel mask of a tank's declared clearance cells over a measurement grid, or null when the tank declares none. The
 * record's lattice must coincide with the grid's (same voxel, origin offset a whole number of voxels); otherwise the
 * record is stale and the result carries `stale: true` with an empty mask, so nothing is exempted.
 */
export function declaredClearanceMask(id, grid, file) {
  const record = declaredClearanceRecord(id, file);
  if (!record) return null;
  const { nx, ny, nz, origin } = grid, voxel = grid.voxel;
  const mask = new Uint8Array(nx * ny * nz);
  const shift = record.o.map((v, k) => (v - origin[k]) / voxel);
  const aligned = Math.abs(record.v - voxel) < 1e-9 && shift.every((s) => Math.abs(s - Math.round(s)) < 1e-3);
  if (!aligned) return { mask, stale: true, voxels: 0 };
  const [dx, dy, dz] = shift.map(Math.round);
  const spans = decodeSpans(record.spans); let voxels = 0;
  for (let b = 0; b < spans.length; b += 6) {
    for (let z = spans[b + 2]; z <= spans[b + 5]; z++) for (let y = spans[b + 1]; y <= spans[b + 4]; y++) for (let x = spans[b]; x <= spans[b + 3]; x++) {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) return { mask: new Uint8Array(nx * ny * nz), stale: true, voxels: 0 };
      mask[(Z * ny + Y) * nx + X] = 1; voxels++;
    }
  }
  return { mask, stale: false, voxels };
}

/** Merge regenerated tanks into the declared clearance record: a tank with clearance cells gets its entry, a
 * regenerated tank without any loses a stale one. `entries` maps id -> record | null. */
export function writeDeclaredClearance(entries, file = CLEARANCE_AIR_FILE) {
  const current = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const tanks = { ...(current.tanks ?? {}) };
  for (const [id, record] of Object.entries(entries)) { if (record) tanks[id] = record; else delete tanks[id]; }
  const sorted = Object.fromEntries(Object.keys(tanks).sort().map((id) => [id, tanks[id]]));
  const out = {
    note: 'Generated by tools/gen-interior-fills.mjs. Do not hand-edit. The cells a declared finite gun clearance '
      + '(tools/m1a1-fill-clearance.mjs) cut from each tank\'s interior fills, as base64 little-endian Uint16 sextets of '
      + 'inclusive voxel spans on the record\'s lattice (v, o). The watertight measurement (tools/moving-clearance-air.mjs) '
      + 'reports deep water in these cells apart and ignores a record whose lattice no longer matches the body.',
    tanks: sorted,
  };
  writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
  if (file === CLEARANCE_AIR_FILE) declared = null;
}
