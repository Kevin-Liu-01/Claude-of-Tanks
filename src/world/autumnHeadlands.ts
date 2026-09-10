/** Construction-only Autumn harvest sites, derived from emitted crop spans. */
import type { BufferGeometry } from 'three';

export interface AutumnCropRow {
  x0: number; z0: number; x1: number; z1: number;
  cx: number; cz: number; dx: number; dz: number;
  offset: number; eligible: boolean;
}
export interface AutumnHeadlandSite { x: number; z: number }

export function captureAutumnCropRow(rows: AutumnCropRow[], geometry: BufferGeometry,
  cx: number, cz: number, dx: number, dz: number, ordinal: number): void {
  const index = geometry.index, position = geometry.getAttribute('position');
  if (!index || index.count === 0) return;
  // appendCropRowGeometry emits each supported span as [a,b,a+1,a+1,b,b+1].
  // The full position buffer also contains UNSUPPORTED end stations: do not
  // use its first/last vertices or bounding box as evidence of planted rows.
  const first = index.getX(0), last = index.getX(index.count - 2);
  const x0 = position.getX(first), z0 = position.getZ(first);
  const x1 = position.getX(last), z1 = position.getZ(last);
  if (Math.hypot(x1 - x0, z1 - z0) < 3) return;
  rows.push({ x0, z0, x1, z1, cx, cz, dx, dz,
    offset: -(x0 - cx) * dz + (z0 - cz) * dx, eligible: ordinal % 3 === 1 });
}

export function autumnHeadlandSite(rows: readonly AutumnCropRow[], ordinal: number,
  radius: number): AutumnHeadlandSite | null {
  const row = rows[Math.floor(ordinal / 2)];
  // At most one donor per third row/end, with a clear 8m central approach.
  if (!row || !row.eligible || Math.abs(row.offset) < 4 + radius) return null;
  const outward = 2.2 + radius;
  if (ordinal % 2 === 0) return { x: row.x0 - row.dx * outward, z: row.z0 - row.dz * outward };
  return { x: row.x1 + row.dx * outward, z: row.z1 + row.dz * outward };
}

function blocksCropApproach(row: AutumnCropRow, site: AutumnHeadlandSite, radius: number): boolean {
  const along = (site.x - row.cx) * row.dx + (site.z - row.cz) * row.dz;
  const across = -(site.x - row.cx) * row.dz + (site.z - row.cz) * row.dx;
  const start = (row.x0 - row.cx) * row.dx + (row.z0 - row.cz) * row.dz;
  const end = (row.x1 - row.cx) * row.dx + (row.z1 - row.cz) * row.dz;
  return Math.abs(across) < 4 + radius && along > start - 8 && along < end + 8;
}

export function autumnHeadlandClearsRows(rows: readonly AutumnCropRow[], site: AutumnHeadlandSite,
  radius: number): boolean {
  for (const row of rows) {
    if (blocksCropApproach(row, site, radius)) return false;
    const dx = row.x1 - row.x0, dz = row.z1 - row.z0;
    const t = Math.max(0, Math.min(1,
      ((site.x - row.x0) * dx + (site.z - row.z0) * dz) / (dx * dx + dz * dz)));
    // Treat gaps BETWEEN emitted spans conservatively as planted too.
    if (Math.hypot(site.x - row.x0 - dx * t, site.z - row.z0 - dz * t) < radius + .8) return false;
  }
  return true;
}
