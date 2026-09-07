// Original bare Mk5 casting interpreted from the dated Kubinka photograph.
// The longitudinal/section stations below are photo-led construction choices,
// not measurements of the AI reference. No Stillbrew or donor geometry.
import { sectionSolid } from './sectionSolid.ts';
import type * as THREE from 'three';

type Row = readonly [z: number, halfWidth: number, bottom: number, top: number];

function slope(rows: readonly Row[], i: number, field: number): number {
  if (i === 0) return (rows[1][field] - rows[0][field]) / (rows[1][0] - rows[0][0]);
  if (i === rows.length - 1) return (rows[i][field] - rows[i - 1][field]) / (rows[i][0] - rows[i - 1][0]);
  const a = (rows[i][field] - rows[i - 1][field]) / (rows[i][0] - rows[i - 1][0]);
  const b = (rows[i + 1][field] - rows[i][field]) / (rows[i + 1][0] - rows[i][0]);
  return a * b <= 0 ? 0 : 2 * a * b / (a + b);
}

function interpolate(rows: readonly Row[], i: number, t: number, field: number): number {
  const span = rows[i + 1][0] - rows[i][0], t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * rows[i][field] + (t3 - 2 * t2 + t) * span * slope(rows, i, field)
    + (-2 * t3 + 3 * t2) * rows[i + 1][field] + (t3 - t2) * span * slope(rows, i + 1, field);
}

function roundedRing(width: number, low: number, top: number, flatRoof: boolean): [number, number][] {
  const ring: [number, number][] = [], middle = (low + top) / 2, radius = (top - low) / 2;
  for (let i = 0; i < 32; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 16, x = Math.cos(a);
    let vertical = Math.sin(a);
    if (flatRoof && vertical > 0) {
      const shoulder = Math.max(0, (Math.abs(x) - .27) / .73);
      vertical = Math.sqrt(Math.max(0, 1 - shoulder * shoulder));
    }
    ring.push([x * width, middle + radius * vertical]);
  }
  return ring;
}

function cast(rows: readonly Row[], flatRoof: boolean): THREE.BufferGeometry {
  const sections = [];
  for (let i = 0; i < rows.length - 1; i++) for (let sample = 0; sample < 4; sample++) {
    const t = sample / 4;
    sections.push({ z: rows[i][0] + (rows[i + 1][0] - rows[i][0]) * t,
      ring: roundedRing(interpolate(rows, i, t, 1), interpolate(rows, i, t, 2),
        interpolate(rows, i, t, 3), flatRoof) });
  }
  const last = rows[rows.length - 1];
  sections.push({ z: last[0], ring: roundedRing(last[1], last[2], last[3], flatRoof) });
  return sectionSolid(sections);
}

export function chieftain5CastTurret(): THREE.BufferGeometry {
  // Keep the ring, rear stations and maximum 2.45 m roof. The forward face
  // no longer collapses into a thin sharp-edged lens around the main cradle.
  // The center underside stays above the actual driver/periscope assembly.
  return cast([[-2.19, .78, 1.96, 2.25], [-1.88, 1.115, 1.83, 2.355],
    [-1.20, 1.37, 1.727, 2.427], [-.31, 1.475, 1.705, 2.45],
    [.60, 1.443, 1.72, 2.435], [1.13, 1.295, 1.735, 2.40],
    [1.53, 1.018, 1.750, 2.34], [1.79, .69, 1.805, 2.265],
    [1.935, .29, 1.93, 2.19]], true);
}

export function chieftain5CastMantlet(): THREE.BufferGeometry {
  // A rounded, supported cradle/canvas envelope follows the gun pitch, not
  // recoil. The real barrel remains independently recoil-owned inside it.
  return cast([[1.44, .30, 1.875, 2.295], [1.57, .335, 1.847, 2.310],
    [1.79, .285, 1.855, 2.278], [2.00, .190, 1.876, 2.212],
    [2.13, .169, 1.878, 2.204]], false);
}
