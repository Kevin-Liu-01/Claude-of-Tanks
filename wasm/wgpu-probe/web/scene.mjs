// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// The probe scene, built once and handed to every renderer under test: a 512 m terrain of 256 × 256 cells, N tanks
// (a subdivided hull, turret and barrel, ~25 k triangles each, one mesh shared by every tank) standing on it in a grid
// before the camera, and their poses. Flat normals per face, so all renderers shade the same triangles.

export const CAMERA = { fovDeg: 50, near: 1, far: 2000, eye: [0, 60, 140], target: [0, 0, 0] };
export const LIGHT = { dir: [-0.4, -1, -0.3], distance: 200, half: 80, near: 1, far: 400, mapSize: 2048 };

export const terrainHeight = (x, z) => 18 * Math.sin(x * 0.012) * Math.cos(z * 0.015) + 6 * Math.sin(x * 0.05 + 1) * Math.sin(z * 0.043);

function terrain(cells, size) {
  const n = cells + 1, step = size / cells, half = size / 2;
  const positions = new Float32Array(n * n * 3), normals = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + i * step, z = -half + j * step, k = (j * n + i) * 3;
    positions[k] = x; positions[k + 1] = terrainHeight(x, z); positions[k + 2] = z;
    const dx = (terrainHeight(x + 0.5, z) - terrainHeight(x - 0.5, z)), dz = (terrainHeight(x, z + 0.5) - terrainHeight(x, z - 0.5));
    const l = Math.hypot(dx, 1, dz);
    normals[k] = -dx / l; normals[k + 1] = 1 / l; normals[k + 2] = -dz / l;
  }
  const indices = new Uint32Array(cells * cells * 6);
  let t = 0;
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    indices.set([a, c, b, b, c, d], t); t += 6;
  }
  return { positions, normals, indices };
}

/** A box of size (sx, sy, sz) centred at (cx, cy, cz), each face a d × d grid, appended to the lists. */
function box(out, [sx, sy, sz], [cx, cy, cz], d) {
  const faces = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const half = [sx / 2, sy / 2, sz / 2];
  for (const [nrm, u, v] of faces) {
    const base = out.positions.length / 3;
    for (let j = 0; j <= d; j++) for (let i = 0; i <= d; i++) {
      const s = i / d * 2 - 1, t = j / d * 2 - 1;
      for (let k = 0; k < 3; k++) out.positions.push((nrm[k] + u[k] * s + v[k] * t) * half[k] + [cx, cy, cz][k]);
      out.normals.push(...nrm);
    }
    for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) {
      const a = base + j * (d + 1) + i, b = a + 1, c = a + d + 1, e = c + 1;
      out.indices.push(a, b, c, b, e, c);
    }
  }
}

/** A barrel along +z: radius r, length l from (cx, cy, cz), `segments` round, `rings` along. */
function barrel(out, r, l, [cx, cy, cz], segments, rings) {
  const base = out.positions.length / 3;
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2;
    out.positions.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz + j / rings * l);
    out.normals.push(Math.cos(a), Math.sin(a), 0);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < segments; i++) {
    const a = base + j * (segments + 1) + i, b = a + 1, c = a + segments + 1, e = c + 1;
    out.indices.push(a, c, b, b, c, e);
  }
}

function tank(detail) {
  const out = { positions: [], normals: [], indices: [] };
  box(out, [3.6, 1.6, 7.2], [0, 0.8, 0], detail);
  box(out, [2.6, 0.9, 3.0], [0, 2.05, -0.3], detail >> 1);
  barrel(out, 0.12, 5, [0, 2.1, 1.2], 48, 6);
  return { positions: new Float32Array(out.positions), normals: new Float32Array(out.normals), indices: new Uint32Array(out.indices) };
}

export function buildScene({ tanks = 18, detail = 40, cells = 256, size = 512 } = {}) {
  const poses = new Float32Array(tanks * 4), colors = new Float32Array(tanks * 3);
  // a grid in front of the camera: 6 × 3 at 16 m × 14 m for the default 18, denser as the count grows
  const cols = Math.max(6, Math.ceil(Math.sqrt(tanks * 2))), rows = Math.ceil(tanks / cols);
  const dx = Math.min(16, 160 / cols), dz = Math.min(14, 90 / rows);
  for (let i = 0; i < tanks; i++) {
    const x = ((i % cols) - (cols - 1) / 2) * dx, z = (Math.floor(i / cols) - (rows - 1) / 2) * dz;
    poses.set([x, terrainHeight(x, z), z, i * 0.7], i * 4);
    colors.set([0.35 + 0.3 * ((i * 37) % 7) / 7, 0.38 + 0.2 * ((i * 11) % 5) / 5, 0.28], i * 3);
  }
  const t = tank(detail);
  const ground = terrain(cells, size);
  return { terrain: ground, tank: t, poses, colors, triangles: ground.indices.length / 3 + tanks * t.indices.length / 3 };
}
