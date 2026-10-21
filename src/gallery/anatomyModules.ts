// Gallery anatomy module models: one recognisable model per combat module part, fitted inside that part's hit shapes.
//
// The combat data owns where a module is and how big it is: each model is built in a box of the part's drawn bounds
// (anatomyData.moduleParts) and finally scaled, per axis and never up, so its bounds sit inside that box. The form
// name (internalLayoutRegistry visualForm), the module id, the gun calibre and the era choose the model's shape; no
// model adds a part count, a round count or a capacity that the data does not hold.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ModulePart } from './anatomyData.ts';
import { SYSTEM_COLORS } from './anatomyPalette.ts';
import { techMaterial, type TechMaterial } from './anatomyMaterials.ts';

type Tone = 'body' | 'accent' | 'brass' | 'glass';

interface Piece { geometry: THREE.BufferGeometry; tone: Tone }

interface Rounds {
  radius: number;
  length: number;
  placements: Array<{ x: number; y: number; z: number; axis: 'x' | 'y' | 'z' | 'radial'; angle?: number }>;
}

/** Collects primitive pieces in the part's local box (centre at the origin, size sx × sy × sz). */
class ModuleSketch {
  readonly pieces: Piece[] = [];
  readonly rounds: Rounds[] = [];
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  constructor(sx: number, sy: number, sz: number) {
    this.sx = sx; this.sy = sy; this.sz = sz;
  }

  add(geometry: THREE.BufferGeometry, tone: Tone, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): void {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(1, 1, 1),
    );
    geometry.applyMatrix4(matrix);
    this.pieces.push({ geometry: geometry.index ? geometry.toNonIndexed() : geometry, tone });
  }

  box(w: number, h: number, d: number, tone: Tone, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): void {
    this.add(new THREE.BoxGeometry(Math.max(w, 0.004), Math.max(h, 0.004), Math.max(d, 0.004)), tone, x, y, z, rx, ry, rz);
  }

  /** Cylinder along an axis. */
  cylinder(radius: number, length: number, axis: 'x' | 'y' | 'z', tone: Tone, x = 0, y = 0, z = 0, segments = 16, radiusTop = radius): void {
    const geometry = new THREE.CylinderGeometry(Math.max(radiusTop, 0.002), Math.max(radius, 0.002), Math.max(length, 0.004), segments);
    this.add(geometry, tone, x, y, z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? -Math.PI / 2 : 0);
  }

  ring(radius: number, tube: number, axis: 'x' | 'y' | 'z', tone: Tone, x = 0, y = 0, z = 0): void {
    const geometry = new THREE.TorusGeometry(Math.max(radius, 0.004), Math.max(tube, 0.002), 8, 28);
    this.add(geometry, tone, x, y, z, axis === 'y' ? Math.PI / 2 : 0, axis === 'x' ? Math.PI / 2 : 0, 0);
  }

  /** A box with chamfered vertical edges (an octagonal prism), the "machined casing" primitive. */
  casing(w: number, h: number, d: number, tone: Tone, x = 0, y = 0, z = 0, chamfer = 0.18): void {
    const c = Math.min(w, d) * chamfer;
    const shape = new THREE.Shape();
    const hw = w / 2, hd = d / 2;
    shape.moveTo(-hw + c, -hd); shape.lineTo(hw - c, -hd); shape.lineTo(hw, -hd + c); shape.lineTo(hw, hd - c);
    shape.lineTo(hw - c, hd); shape.lineTo(-hw + c, hd); shape.lineTo(-hw, hd - c); shape.lineTo(-hw, -hd + c);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: Math.max(h, 0.004), bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    // The rotation maps shape y to −z; the octagon is symmetric, so no mirror (which would invert the winding).
    geometry.translate(0, -h / 2, 0);
    this.add(geometry, tone, x, y, z);
  }
}

const AXES = ['x', 'y', 'z'] as const;
type Axis = typeof AXES[number];

function longestHorizontal(sx: number, sz: number): 'x' | 'z' { return sx > sz * 1.05 ? 'x' : 'z'; }

function along(axis: Axis, a: number, lateral: number, y: number): [number, number, number] {
  return axis === 'x' ? [a, y, lateral] : axis === 'z' ? [lateral, y, a] : [lateral, a, y];
}

// --- powerplant -------------------------------------------------------------------------------------------------

function dieselEngine(s: ModuleSketch, front: boolean): void {
  const axis = longestHorizontal(s.sx, s.sz);
  const L = axis === 'x' ? s.sx : s.sz, W = axis === 'x' ? s.sz : s.sx, H = s.sy;
  const dims = (l: number, w: number): [number, number] => (axis === 'x' ? [l, w] : [w, l]);
  const [pw, pd] = dims(L * 0.86, W * 0.5);
  s.casing(pw, H * 0.26, pd, 'accent', 0, -H * 0.36);
  const [bw, bd] = dims(L * 0.8, W * 0.46);
  s.box(bw, H * 0.22, bd, 'body', 0, -H * 0.14);
  // Two cylinder banks in a V about the crank axis, rocker covers on top.
  for (const side of [-1, 1]) {
    const tilt = side * 0.52;
    const [x, y, z] = along(axis, 0, side * W * 0.15, H * 0.06);
    const [cw, cd] = dims(L * 0.74, W * 0.24);
    s.box(cw, H * 0.3, cd, 'body', x, y, z, axis === 'x' ? tilt : 0, 0, axis === 'z' ? -tilt : 0);
    const [rx, ry, rz] = along(axis, 0, side * W * 0.25, H * 0.2);
    const [kw, kd] = dims(L * 0.7, W * 0.11);
    s.box(kw, H * 0.06, kd, 'accent', rx, ry, rz, axis === 'x' ? tilt : 0, 0, axis === 'z' ? -tilt : 0);
  }
  // Intake manifold between the banks, turbochargers and the flywheel housing at the output end.
  const [mx, my, mz] = along(axis, 0, 0, H * 0.12);
  s.cylinder(Math.min(W, H) * 0.07, L * 0.66, axis, 'accent', mx, my, mz, 12);
  const out = front ? -1 : 1;
  for (const side of [-1, 1]) {
    const [tx, ty, tz] = along(axis, -out * L * 0.36, side * W * 0.2, H * 0.24);
    s.cylinder(Math.min(W, H) * 0.09, Math.min(W, H) * 0.12, axis === 'x' ? 'z' : 'x', 'accent', tx, ty, tz, 14);
  }
  const [fx, fy, fz] = along(axis, out * L * 0.43, 0, -H * 0.12);
  s.cylinder(Math.min(W * 0.36, H * 0.34), L * 0.08, axis, 'accent', fx, fy, fz, 20);
  // Cooling fans on top where the box leaves room above the banks.
  if (H > 0.7) {
    const fan = Math.min(W * 0.18, L * 0.16);
    for (const offset of [-0.22, 0.22]) {
      const [cx, cy, cz] = along(axis, offset * L, 0, H * 0.42);
      s.ring(fan, fan * 0.12, 'y', 'accent', cx, cy, cz);
      s.cylinder(fan * 0.92, H * 0.03, 'y', 'body', cx, cy, cz, 18);
    }
  }
}

function gasTurbine(s: ModuleSketch): void {
  const axis = longestHorizontal(s.sx, s.sz);
  const L = axis === 'x' ? s.sx : s.sz, W = axis === 'x' ? s.sz : s.sx, H = s.sy;
  const radius = Math.min(W, H) * 0.3;
  const [cx, cy, cz] = along(axis, -L * 0.1, 0, -H * 0.05);
  s.cylinder(radius, L * 0.56, axis, 'body', cx, cy, cz, 22);
  for (let index = -2; index <= 2; index += 1) {
    const [rx, ry, rz] = along(axis, -L * 0.1 + index * L * 0.1, 0, -H * 0.05);
    s.ring(radius * 1.02, radius * 0.07, axis, 'accent', rx, ry, rz);
  }
  // Recuperator at the rear end, accessory gearbox below the front.
  const [rx, ry, rz] = along(axis, L * 0.3, 0, 0);
  const [rw, rd] = axis === 'x' ? [L * 0.34, W * 0.82] : [W * 0.82, L * 0.34];
  s.casing(rw, H * 0.82, rd, 'body', rx, ry, rz, 0.1);
  const [gx, gy, gz] = along(axis, -L * 0.34, 0, -H * 0.32);
  const [gw, gd] = axis === 'x' ? [L * 0.22, W * 0.5] : [W * 0.5, L * 0.22];
  s.box(gw, H * 0.26, gd, 'accent', gx, gy, gz);
  const [ex, ey, ez] = along(axis, L * 0.3, 0, H * 0.43);
  s.cylinder(Math.min(W, L) * 0.12, H * 0.12, 'y', 'accent', ex, ey, ez, 16);
}

function transmission(s: ModuleSketch): void {
  const { sx, sy, sz } = s;
  s.casing(sx * 0.42, sy * 0.72, sz * 0.82, 'body', 0, sy * 0.02);
  s.cylinder(sy * 0.2, sx * 0.94, 'x', 'accent', 0, -sy * 0.08, 0, 16);
  for (const side of [-1, 1]) {
    s.cylinder(Math.min(sy * 0.36, sz * 0.46), sx * 0.1, 'x', 'body', side * sx * 0.4, -sy * 0.08, 0, 20);
    s.ring(Math.min(sy * 0.3, sz * 0.4), Math.min(sy, sz) * 0.05, 'x', 'accent', side * sx * 0.455, -sy * 0.08, 0);
    s.box(sx * 0.12, sy * 0.4, sz * 0.5, 'accent', side * sx * 0.25, sy * 0.06, 0);
  }
}

function fuelTank(s: ModuleSketch, modern: boolean): void {
  const { sx, sy, sz } = s;
  const axis: Axis = sy > Math.max(sx, sz) * 1.15 ? 'y' : longestHorizontal(sx, sz);
  const length = axis === 'x' ? sx : axis === 'y' ? sy : sz;
  const across = axis === 'x' ? [sz, sy] : axis === 'y' ? [sx, sz] : [sx, sy];
  const cells = Math.max(1, Math.min(3, Math.round(length / Math.max(0.35, Math.min(...across) * 1.4))));
  const cellLength = length / cells;
  for (let index = 0; index < cells; index += 1) {
    const offset = -length / 2 + (index + 0.5) * cellLength;
    const [x, y, z] = axis === 'x' ? [offset, 0, 0] : axis === 'y' ? [0, offset, 0] : [0, 0, offset];
    if (modern) {
      const size = axis === 'x' ? [cellLength * 0.92, sy * 0.9, sz * 0.9] : axis === 'y' ? [sx * 0.9, cellLength * 0.92, sz * 0.9] : [sx * 0.9, sy * 0.9, cellLength * 0.92];
      s.casing(size[0], size[1], size[2], 'body', x, y, z, 0.14);
      // Strap bands around each cell.
      const band = axis === 'x' ? [cellLength * 0.06, sy * 0.94, sz * 0.94] : axis === 'y' ? [sx * 0.94, cellLength * 0.06, sz * 0.94] : [sx * 0.94, sy * 0.94, cellLength * 0.06];
      s.box(band[0], band[1], band[2], 'accent', x, y, z);
    } else {
      const radius = Math.min(...across) * 0.44;
      s.cylinder(radius, cellLength * 0.9, axis, 'body', x, y, z, 18);
      for (const end of [-0.36, 0.36]) {
        const [ex, ey, ez] = axis === 'x' ? [x + end * cellLength, y, z] : axis === 'y' ? [x, y + end * cellLength, z] : [x, y, z + end * cellLength];
        s.ring(radius * 1.01, radius * 0.06, axis, 'accent', ex, ey, ez);
      }
    }
  }
  // Filler neck on the top surface.
  const neck = Math.min(sx, sz) * 0.07;
  s.cylinder(neck, sy * 0.1, 'y', 'accent', sx * 0.18, sy * 0.44, 0, 12);
}

// --- ammunition ---------------------------------------------------------------------------------------------------

function roundRadius(caliberMm: number, fallback: number): number {
  return caliberMm > 0 ? (caliberMm / 2000) * 1.12 : fallback;
}

/** Rounds lying radially in tiers about the vertical axis (AZ/MZ carousels, ring conveyors). */
function carousel(s: ModuleSketch, caliberMm: number, rammer: boolean): void {
  const { sx, sy, sz } = s;
  const outer = Math.min(sx, sz) / 2 * 0.94;
  const r = Math.min(roundRadius(caliberMm, 0.05), sy * 0.22, outer * 0.12);
  const tiers = Math.max(1, Math.min(2, Math.floor(sy / (r * 2.6))));
  const count = Math.max(8, Math.min(28, Math.floor((Math.PI * 2 * outer * 0.62) / (r * 2.5))));
  const inner = outer * 0.24;
  const length = outer - inner;
  s.cylinder(outer, sy * 0.06, 'y', 'accent', 0, -sy / 2 + sy * 0.03, 0, 32);
  s.cylinder(inner * 0.8, sy * 0.86, 'y', 'accent', 0, 0, 0, 16);
  for (let tier = 0; tier < tiers; tier += 1) {
    const y = -sy / 2 + sy * 0.06 + r + tier * r * 2.3;
    const placements: Rounds['placements'] = [];
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      const mid = inner + length / 2;
      placements.push({ x: Math.cos(angle) * mid, y, z: Math.sin(angle) * mid, axis: 'radial', angle });
    }
    s.rounds.push({ radius: r, length: length * 0.96, placements });
  }
  s.ring(outer * 0.98, Math.min(r * 0.35, sy * 0.05), 'y', 'accent', 0, -sy / 2 + sy * 0.12, 0);
  if (rammer) s.box(Math.min(sx, sz) * 0.08, sy * 0.1, Math.min(sx, sz) * 0.46, 'accent', 0, sy * 0.38, sz * 0.18);
}

/** Rounds stowed side by side along one axis in a grid (bustle racks, hull racks, magazines). */
function rack(s: ModuleSketch, caliberMm: number, axis: Axis, blowOff: boolean): void {
  const { sx, sy, sz } = s;
  const length = axis === 'x' ? sx : axis === 'y' ? sy : sz;
  const [a, b] = axis === 'x' ? [sz, sy] : axis === 'y' ? [sx, sz] : [sx, sy];
  const r0 = roundRadius(caliberMm, 0.055);
  const columns = Math.max(1, Math.min(10, Math.floor(a / (r0 * 2.5))));
  const rows = Math.max(1, Math.min(6, Math.floor(b / (r0 * 2.5))));
  const r = Math.min(r0, (a / columns) * 0.4, (b / rows) * 0.4);
  const placements: Rounds['placements'] = [];
  for (let i = 0; i < columns; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const u = -a / 2 + (i + 0.5) * (a / columns);
      const v = -b / 2 + (j + 0.5) * (b / rows);
      const [x, y, z] = axis === 'x' ? [0, v, u] : axis === 'y' ? [u, 0, v] : [u, v, 0];
      placements.push({ x, y, z, axis });
    }
  }
  s.rounds.push({ radius: r, length: length * 0.84, placements });
  // Rack frame: end plates across the round axis and shelf rails between the rows.
  for (const end of [-1, 1]) {
    const [x, y, z] = axis === 'x' ? [end * sx * 0.46, 0, 0] : axis === 'y' ? [0, end * sy * 0.46, 0] : [0, 0, end * sz * 0.46];
    const size = axis === 'x' ? [sx * 0.04, sy * 0.96, sz * 0.96] : axis === 'y' ? [sx * 0.96, sy * 0.04, sz * 0.96] : [sx * 0.96, sy * 0.96, sz * 0.04];
    s.box(size[0], size[1], size[2], 'accent', x, y, z);
  }
  if (blowOff && axis !== 'y') s.box(sx * 0.96, sy * 0.035, sz * 0.96, 'glass', 0, sy * 0.47, 0);
}

function canisters(s: ModuleSketch, count: number, axis: Axis): void {
  const { sx, sy, sz } = s;
  const length = axis === 'x' ? sx : axis === 'y' ? sy : sz;
  const [a, b] = axis === 'x' ? [sz, sy] : axis === 'y' ? [sx, sz] : [sx, sy];
  const columns = Math.max(1, Math.round(Math.sqrt((count * a) / Math.max(b, 1e-3))));
  const rows = Math.max(1, Math.ceil(count / columns));
  const radius = Math.min(a / columns, b / rows) * 0.42;
  let placed = 0;
  for (let j = 0; j < rows && placed < count; j += 1) {
    for (let i = 0; i < columns && placed < count; i += 1, placed += 1) {
      const u = -a / 2 + (i + 0.5) * (a / columns);
      const v = -b / 2 + (j + 0.5) * (b / rows);
      const [x, y, z] = axis === 'x' ? [0, v, u] : axis === 'y' ? [u, 0, v] : [u, v, 0];
      s.cylinder(radius, length * 0.92, axis, 'body', x, y, z, 14);
      const [ex, ey, ez] = axis === 'x' ? [length * 0.46, v, u] : axis === 'y' ? [u, length * 0.46, v] : [u, v, length * 0.46];
      s.ring(radius * 0.98, radius * 0.1, axis, 'accent', ex, ey, ez);
    }
  }
}

function ammoBoxes(s: ModuleSketch): void {
  const { sx, sy, sz } = s;
  const axis = longestHorizontal(sx, sz);
  const length = axis === 'x' ? sx : sz;
  const count = Math.max(1, Math.min(6, Math.round(length / Math.max(0.22, sy * 0.8))));
  const step = length / count;
  for (let index = 0; index < count; index += 1) {
    const offset = -length / 2 + (index + 0.5) * step;
    const [x, z] = axis === 'x' ? [offset, 0] : [0, offset];
    const [w, d] = axis === 'x' ? [step * 0.88, sz * 0.9] : [sx * 0.9, step * 0.88];
    s.box(w, sy * 0.82, d, 'body', x, -sy * 0.05, z);
    s.box(w * 1.02, sy * 0.08, d * 1.02, 'accent', x, sy * 0.38, z);
    s.box(Math.min(w, d) * 0.3, sy * 0.05, Math.min(w, d) * 0.08, 'accent', x, sy * 0.45, z);
  }
}

const COUNT_WORDS: Readonly<Record<string, number>> = Object.freeze({
  four: 4, eight: 8, twelve: 12, sixteen: 16, twentyFour: 24,
});

/** Launchers whose form names their tube count (eightCanisterLauncher …): the count is data, not decoration. */
function formTubeCount(form: string): number | null {
  const match = /^(four|eight|twelve|sixteen|twentyFour)(?:Canister|Tube)/.exec(form);
  return match ? COUNT_WORDS[match[1]] : null;
}

function ammunition(s: ModuleSketch, part: ModulePart, caliberMm: number): void {
  const form = part.form;
  const { sx, sy, sz } = s;
  const longest: Axis = sx >= sy && sx >= sz ? 'x' : sy >= sz ? 'y' : 'z';
  const horizontal = longestHorizontal(sx, sz);
  if (part.module === 'autoloader') {
    if (/carousel|basket/i.test(form)) carousel(s, caliberMm, true);
    else rack(s, caliberMm, 'x', false);
    return;
  }
  if (part.module === 'feedSystem') {
    s.casing(sx * 0.62, sy * 0.66, sz * 0.62, 'body', 0, -sy * 0.12, -sz * 0.08);
    for (const side of /dual/i.test(form) ? [-1, 1] : [0]) {
      s.ring(Math.min(sx, sy) * 0.2, Math.min(sx, sy) * 0.05, 'x', 'accent', side * sx * 0.22, sy * 0.18, sz * 0.18);
    }
    s.box(sx * 0.16, sy * 0.22, sz * 0.86, 'accent', 0, sy * 0.3, 0);
    return;
  }
  if (part.module === 'missileRack') {
    const tubes = formTubeCount(form);
    if (tubes) canisters(s, tubes, horizontal);
    else if (/vertical/i.test(form)) canisters(s, 2, 'y');
    else if (/gunLaunched/i.test(form)) rack(s, caliberMm, horizontal, false);
    else canisters(s, 2, horizontal);
    return;
  }
  if (/carousel|conveyor/i.test(form)) { carousel(s, caliberMm, false); return; }
  if (/Canisters|twoPart|mixed152|MissileBins|sealed/i.test(form)) { canisters(s, 2, longest === 'y' ? 'y' : horizontal); return; }
  if (/Boxes|BeltBoxes|AmmoBox|ReadyBins|bmp3/i.test(form)) { ammoBoxes(s); return; }
  rack(s, caliberMm, longest === 'y' && sy > Math.max(sx, sz) * 1.2 ? 'y' : horizontal, /blowOff|bustle/i.test(form));
}

// --- electronics and firepower -----------------------------------------------------------------------------------

function periscope(s: ModuleSketch): void {
  const { sx, sy, sz } = s;
  const head = sy * 0.36;
  s.casing(sx * 0.86, head, sz * 0.86, 'body', 0, sy / 2 - head / 2, 0, 0.2);
  s.box(sx * 0.7, head * 0.5, sz * 0.06, 'glass', 0, sy / 2 - head / 2, sz * 0.43);
  s.cylinder(Math.min(sx, sz) * 0.28, sy - head, 'y', 'accent', 0, -head / 2, 0, 12);
}

function radio(s: ModuleSketch): void {
  const { sx, sy, sz } = s;
  s.casing(sx * 0.9, sy * 0.78, sz * 0.86, 'body', 0, -sy * 0.08, 0, 0.08);
  s.box(sx * 0.8, sy * 0.5, sz * 0.03, 'glass', 0, -sy * 0.04, sz * 0.44);
  for (let index = 0; index < 3; index += 1) {
    s.cylinder(Math.min(sx, sy) * 0.05, sz * 0.06, 'z', 'accent', -sx * 0.25 + index * sx * 0.25, -sy * 0.24, sz * 0.46, 10);
  }
  s.cylinder(Math.min(sx, sz) * 0.06, sy * 0.14, 'y', 'accent', sx * 0.3, sy * 0.4, -sz * 0.2, 10);
}

function breech(s: ModuleSketch): void {
  const { sx, sy, sz } = s;
  const r = Math.min(sx, sy);
  s.casing(sx * 0.72, sy * 0.72, sz * 0.3, 'body', 0, 0, -sz * 0.33, 0.12);
  s.box(sx * 0.42, sy * 0.4, sz * 0.12, 'accent', 0, -sy * 0.06, -sz * 0.44);
  s.cylinder(r * 0.22, sz * 0.66, 'z', 'body', 0, 0, sz * 0.16, 18);
  for (const side of [-1, 1]) s.cylinder(r * 0.09, sz * 0.5, 'z', 'accent', side * sx * 0.26, sy * 0.28, -sz * 0.02, 10);
  s.box(sx * 0.9, sy * 0.12, sz * 0.24, 'accent', 0, -sy * 0.3, -sz * 0.1);
}

function turretRing(s: ModuleSketch): void {
  const { sx, sy, sz } = s;
  const radius = Math.min(sx, sz) / 2;
  s.ring(radius * 0.94, Math.min(sy * 0.32, radius * 0.05), 'y', 'body', 0, sy * 0.1, 0);
  s.ring(radius * 0.88, Math.min(sy * 0.22, radius * 0.035), 'y', 'accent', 0, -sy * 0.18, 0);
  s.box(Math.min(sx, sz) * 0.12, sy * 0.7, Math.min(sx, sz) * 0.12, 'accent', radius * 0.8, 0, 0);
}

function roofWeapon(s: ModuleSketch): void {
  const { sx, sy, sz } = s;
  const axis = longestHorizontal(sx, sz);
  const L = axis === 'x' ? sx : sz;
  const [rw, rd] = axis === 'x' ? [L * 0.4, sz * 0.6] : [sx * 0.6, L * 0.4];
  const [rx, rz] = axis === 'x' ? [-L * 0.25, 0] : [0, -L * 0.25];
  s.box(rw, sy * 0.6, rd, 'body', rx, -sy * 0.05, rz);
  const [bx, bz] = axis === 'x' ? [L * 0.2, 0] : [0, L * 0.2];
  s.cylinder(Math.min(sy, axis === 'x' ? sz : sx) * 0.12, L * 0.58, axis, 'accent', bx, sy * 0.05, bz, 10);
}

function genericCasing(s: ModuleSketch): void {
  s.casing(s.sx * 0.9, s.sy * 0.9, s.sz * 0.9, 'body', 0, 0, 0, 0.14);
}

function trackBelt(s: ModuleSketch): void {
  const { sx, sy, sz } = s;
  const thickness = Math.min(0.09, sy * 0.1);
  const radius = Math.min(sy / 2, sz / 4) * 0.96;
  const straight = Math.max(0.01, sz - radius * 2);
  // A belt loop in the z–y plane, extruded across x.
  const outer = new THREE.Shape();
  outer.absarc(straight / 2, 0, radius, -Math.PI / 2, Math.PI / 2, false);
  outer.absarc(-straight / 2, 0, radius, Math.PI / 2, Math.PI * 1.5, false);
  const inner = new THREE.Path();
  inner.absarc(straight / 2, 0, radius - thickness, -Math.PI / 2, Math.PI / 2, false);
  inner.absarc(-straight / 2, 0, radius - thickness, Math.PI / 2, Math.PI * 1.5, false);
  outer.holes.push(inner);
  const geometry = new THREE.ExtrudeGeometry(outer, { depth: sx * 0.92, bevelEnabled: false, curveSegments: 10 });
  geometry.translate(0, 0, -sx * 0.46);
  geometry.rotateY(Math.PI / 2);
  s.add(geometry, 'body');
}

// --- assembly ---------------------------------------------------------------------------------------------------

export interface ModuleModelOptions {
  caliberMm: number;
  modern: boolean;
}

function sketchPart(part: ModulePart, options: ModuleModelOptions): ModuleSketch {
  const size = [0, 1, 2].map((axis) => Math.max(0.01, part.max[axis] - part.min[axis]));
  const s = new ModuleSketch(size[0], size[1], size[2]);
  switch (part.module) {
    case 'engine':
      if (/gasTurbine/i.test(part.form)) gasTurbine(s);
      else dieselEngine(s, /front/i.test(part.form));
      break;
    case 'transmission': transmission(s); break;
    case 'fuelTank': fuelTank(s, options.modern); break;
    case 'ammoRack': case 'autoloader': case 'missileRack': case 'feedSystem': ammunition(s, part, options.caliberMm); break;
    case 'optics': periscope(s); break;
    case 'radio': radio(s); break;
    case 'gun': breech(s); break;
    case 'turretRing': turretRing(s); break;
    case 'roofGun': roofWeapon(s); break;
    case 'trackL': case 'trackR': trackBelt(s); break;
    default: genericCasing(s);
  }
  return s;
}

function shade(hex: string, factor: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(factor);
}

export interface ModuleModel {
  group: THREE.Group;
  materials: TechMaterial[];
  geometries: THREE.BufferGeometry[];
  triangles: number;
}

const ROUND_CASE = '#b8955a';

/**
 * One drawn module part: a group placed at the centre of the part's drawn bounds, holding merged body and accent
 * meshes plus instanced rounds. `userData.anatomy` records the combat identity the receipt checks.
 */
export function buildModuleModel(part: ModulePart, options: ModuleModelOptions): ModuleModel {
  const sketch = sketchPart(part, options);
  const color = SYSTEM_COLORS[part.system];
  const tones: Record<Tone, THREE.Color> = {
    body: new THREE.Color(color),
    accent: shade(color, 0.55),
    brass: new THREE.Color(ROUND_CASE),
    glass: shade(color, 1.25),
  };
  const group = new THREE.Group();
  group.name = `anatomy_module_${part.module}_${part.index}_${part.part}`;
  const materials: TechMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  let triangles = 0;
  for (const tone of ['body', 'accent', 'glass'] as const) {
    const pieces = sketch.pieces.filter((piece) => piece.tone === tone).map((piece) => {
      const geometry = piece.geometry;
      for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      return geometry;
    });
    if (!pieces.length) continue;
    const merged = mergeGeometries(pieces, false);
    pieces.forEach((piece) => piece.dispose());
    if (!merged) continue;
    const material = techMaterial({ color: tones[tone], flat: false });
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `${group.name}_${tone}`;
    group.add(mesh);
    materials.push(material);
    geometries.push(merged);
    triangles += merged.getAttribute('position').count / 3;
  }
  const placement = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const rounds of sketch.rounds) {
    const caseLength = rounds.length * 0.62, tipLength = rounds.length * 0.38;
    const caseGeometry = new THREE.CylinderGeometry(rounds.radius, rounds.radius, caseLength, 10);
    const tipGeometry = new THREE.CylinderGeometry(rounds.radius * 0.16, rounds.radius * 0.92, tipLength, 10);
    const caseMaterial = techMaterial({ color: tones.brass });
    const tipMaterial = techMaterial({ color: tones.body });
    const cases = new THREE.InstancedMesh(caseGeometry, caseMaterial, rounds.placements.length);
    const tips = new THREE.InstancedMesh(tipGeometry, tipMaterial, rounds.placements.length);
    rounds.placements.forEach((p, index) => {
      const direction = p.axis === 'radial'
        ? new THREE.Vector3(Math.cos(p.angle || 0), 0, Math.sin(p.angle || 0))
        : new THREE.Vector3(p.axis === 'x' ? 1 : 0, p.axis === 'y' ? 1 : 0, p.axis === 'z' ? 1 : 0);
      quaternion.setFromUnitVectors(up, direction);
      const center = new THREE.Vector3(p.x, p.y, p.z);
      placement.compose(center.clone().addScaledVector(direction, -rounds.length / 2 + caseLength / 2), quaternion, new THREE.Vector3(1, 1, 1));
      cases.setMatrixAt(index, placement);
      placement.compose(center.clone().addScaledVector(direction, rounds.length / 2 - tipLength / 2), quaternion, new THREE.Vector3(1, 1, 1));
      tips.setMatrixAt(index, placement);
    });
    for (const mesh of [cases, tips]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      mesh.name = `${group.name}_rounds`;
      group.add(mesh);
    }
    materials.push(caseMaterial, tipMaterial);
    geometries.push(caseGeometry, tipGeometry);
    const indexCount = (geometry: THREE.BufferGeometry) => (geometry.index ? geometry.index.count : geometry.getAttribute('position').count);
    triangles += rounds.placements.length * (indexCount(caseGeometry) + indexCount(tipGeometry)) / 3;
  }
  fitInside(group, sketch);
  group.position.set(
    (part.min[0] + part.max[0]) / 2,
    (part.min[1] + part.max[1]) / 2,
    (part.min[2] + part.max[2]) / 2,
  );
  group.userData.anatomy = {
    kind: 'module', module: part.module, index: part.index, part: part.part, parts: part.parts,
    system: part.system, frame: part.frame, form: part.form,
    bounds: { min: [...part.min], max: [...part.max] },
  };
  return { group, materials, geometries, triangles };
}

/** Scale the model down per axis (never up) so its bounds sit inside the part box, centred. */
function fitInside(group: THREE.Group, sketch: ModuleSketch): void {
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  group.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) {
      object.computeBoundingBox();
      if (object.boundingBox) bounds.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld));
    } else if (object instanceof THREE.Mesh) {
      object.geometry.computeBoundingBox();
      if (object.geometry.boundingBox) bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    }
  });
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const limit = [sketch.sx, sketch.sy, sketch.sz];
  const scale = [size.x, size.y, size.z].map((value, axis) => (value > limit[axis] ? limit[axis] / value : 1));
  const inner = new THREE.Group();
  inner.name = 'anatomy_module_fit';
  inner.scale.set(scale[0], scale[1], scale[2]);
  inner.position.set(-center.x * scale[0], -center.y * scale[1], -center.z * scale[2]);
  while (group.children.length) inner.add(group.children[0]);
  group.add(inner);
}
