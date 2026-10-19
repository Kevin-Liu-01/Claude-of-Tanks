/**
 * gunshipAirframe.ts — the AC-130 the player flies, as every view outside its own gimbal lens sees it (a teammate's
 * camera, the killcam, the ending's replay and orbit, the Studio) (lane ac130-fx-228 r2, 2026-10-19; the engineering
 * critic: "it puts a placeholder-grade airframe at the centre of every ending orbit").
 *
 * Its own chunk: gunshipVisual.ts (the boot set's flight anchor) loads it with an AC-130 battle, and the covered entry
 * builds it and compiles its programs before the reveal. Procedural and first-party, at the C-130J-30's proportions
 * (29.8 m long, 40.4 m span): the lofted fuselage with its rounded-square section, the cockpit glazing and radome, the
 * upswept tail cone; the high wing with its dihedral and black de-icing boots; four turboprop nacelles slung under it with
 * six-bladed props (yellow tips); the landing-gear sponsons; the tall fin and the tailplane; on the port side (the side
 * that faces the target in the left-hand pylon turn) the 30 mm cannon forward of the wing, the 152 mm howitzer aft of
 * the sponson and the sensor ball under the nose. Gunship grey in vertex colours on one lit material (its cascade setup
 * through the hooks gunshipVisual.ts holds), the body one merged draw, each prop one more.
 */
import * as THREE from 'three';

interface GunshipMaterialHooks { setup(material: THREE.Material): void; release(material: THREE.Material): void }

/** A built airframe: its root (nose +Z, port wing +X, up +Y), its props' spin, and its release. */
interface BuiltAirframe { root: THREE.Group; spin(dt: number): void; dispose(): void }

const GREY = 0x5d6468, RADOME = 0x4c5357, BOOT = 0x26292c, GLASS = 0x14181b, DARK = 0x222528, PROP = 0x1d2022,
  TIP = 0xc89a26, EXHAUST = 0x34302d;
/** prop speed (rad/s): read as turning at 60 fps and as a blur at a film's 30 fps, never wagon-wheeling back */
const PROP_RAD_S = 26;
/** the wing's chord plane: on the fuselage's roof at the root, 2.5 degrees of dihedral out to the tips */
const WING_Y = 2.85;
const wingY = (x: number): number => WING_Y + Math.abs(x) * Math.tan(THREE.MathUtils.degToRad(2.5));

const _c = new THREE.Color();
const lin = (hex: number): [number, number, number] => { _c.setHex(hex); return [_c.r, _c.g, _c.b]; };

/** A part's triangles (non-indexed position, normal and colour arrays) collected for one merged geometry. */
class Parts {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly col: number[] = [];
  add(geometry: THREE.BufferGeometry, rgb: (x: number, y: number, z: number, i: number) => readonly number[]): void {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      this.pos.push(x, y, z);
      this.nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      const c = rgb(x, y, z, i);
      this.col.push(c[0]!, c[1]!, c[2]!);
    }
    if (g !== geometry) g.dispose();
    geometry.dispose();
  }
  geometry(): THREE.BufferGeometry {
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    out.computeBoundingSphere();
    return out;
  }
}

/** A lofted body along z: rings of a rounded-square section (centre y, half width, half height) and, per ring, a
 *  colour band; equal z at two rings makes a crisp band edge. Indexed, smooth normals. */
interface Station { z: number; cy: number; rx: number; ry: number; band?: number }
function loft(stations: readonly Station[], seg: number, cx = 0, power = 2.6,
  colourOf: (s: Station, sx: number, sy: number) => readonly number[] = () => lin(GREY)):
  { geometry: THREE.BufferGeometry; colours: number[] } {
  const pos: number[] = [], colours: number[] = [], index: number[] = [];
  for (const s of stations) {
    for (let k = 0; k < seg; k++) {
      const t = (k / seg) * Math.PI * 2;
      const c = Math.cos(t), sn = Math.sin(t);
      // a superellipse: flat-ish sides, rounded corners (the C-130's section)
      const sx = Math.sign(c) * Math.pow(Math.abs(c), 2 / power), sy = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / power);
      pos.push(cx + sx * s.rx, s.cy + sy * s.ry, s.z);
      const col = colourOf(s, sx, sy);
      colours.push(col[0]!, col[1]!, col[2]!);
    }
  }
  for (let i = 0; i < stations.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * seg + k, b = i * seg + (k + 1) % seg, c = (i + 1) * seg + k, d = (i + 1) * seg + (k + 1) % seg;
      // wound so the outward face is front-facing (the angle turns +x to +y, z falls station to station)
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return { geometry, colours };
}
function addLoft(parts: Parts, stations: readonly Station[], seg: number, cx = 0, power = 2.6,
  colourOf?: (s: Station, sx: number, sy: number) => readonly number[]): void {
  const { geometry, colours } = loft(stations, seg, cx, power, colourOf);
  // the indexed colours, carried through the non-indexed expansion by the index
  const idx = geometry.index!;
  let n = 0;
  parts.add(geometry, () => { const v = idx.getX(n++); return [colours[v * 3]!, colours[v * 3 + 1]!, colours[v * 3 + 2]!]; });
}

/** A lifting surface: an airfoil from root to tip along `span` (unit axis), its chords along -z from each leading edge. */
function surface(parts: Parts, root: { le: THREE.Vector3; chord: number; thick: number },
  tip: { le: THREE.Vector3; chord: number; thick: number }, thicknessAxis: THREE.Vector3, bootK: number): void {
  // a NACA-like section: x along the chord (0 leading edge), the half thickness
  const xs = [0, 0.02, 0.07, 0.16, 0.3, 0.5, 0.72, 1];
  const half = (x: number): number => 5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const ring: Array<[number, number]> = [];
  for (const x of xs) ring.push([x, half(x)]);
  for (let i = xs.length - 2; i >= 1; i--) ring.push([xs[i]!, -half(xs[i]!)]);
  const at = (end: typeof root, [x, h]: [number, number], out: THREE.Vector3): THREE.Vector3 =>
    out.copy(end.le).add(new THREE.Vector3(0, 0, -x * end.chord)).addScaledVector(thicknessAxis, h * end.thick);
  const pos: number[] = [], index: number[] = [], boot: number[] = [];
  const v = new THREE.Vector3();
  for (const end of [root, tip]) for (const p of ring) { at(end, p, v); pos.push(v.x, v.y, v.z); boot.push(p[0] < 0.05 ? 1 : 0); }
  const n = ring.length;
  for (let k = 0; k < n; k++) {
    const a = k, b = (k + 1) % n, c = n + k, d = n + (k + 1) % n;
    index.push(a, c, b, b, c, d);
  }
  // the tip's cap (a fan): the root sits inside the fuselage
  for (let k = 1; k < n - 1; k++) index.push(n, n + k + 1, n + k);
  // outward: the first upper-surface face's normal along the thickness axis, else every face turned over
  {
    const p0 = new THREE.Vector3(pos[0], pos[1], pos[2]), p1 = new THREE.Vector3(pos[3], pos[4], pos[5]);
    const pn = new THREE.Vector3(pos[n * 3], pos[n * 3 + 1], pos[n * 3 + 2]);
    const normal = pn.sub(p0).cross(p1.sub(p0));
    if (normal.dot(thicknessAxis) < 0) for (let t = 0; t < index.length; t += 3) { const k = index[t + 1]!; index[t + 1] = index[t + 2]!; index[t + 2] = k; }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(index);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  const grey = lin(GREY), dark = lin(BOOT);
  let i = 0;
  const idx = index;
  parts.add(flat, () => { const vtx = idx[i++]!; return bootK > 0 && boot[vtx] === 1 ? dark : grey; });
}

/** A cylinder along the local axis `dir` from `from`, radius r, length len (a barrel, an exhaust stack). */
function rod(parts: Parts, from: THREE.Vector3, dir: THREE.Vector3, r: number, len: number, hex: number, seg = 8): void {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  const c = lin(hex);
  parts.add(g, () => c);
}

function box(parts: Parts, w: number, h: number, d: number, x: number, y: number, z: number, hex: number): void {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const c = lin(hex);
  parts.add(g, () => c);
}

/** The six-bladed prop of one engine (its hub at the origin, turning about z): yellow-tipped, twisted at its root. */
function propGeometry(): THREE.BufferGeometry {
  const parts = new Parts();
  const dark = lin(PROP), tip = lin(TIP);
  for (let b = 0; b < 6; b++) {
    const blade = new THREE.BoxGeometry(0.3, 1.75, 0.07, 1, 4, 1);
    // taper to the tip, twisted ~25 degrees at the root easing to ~8 at the tip
    const p = blade.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + 0.875; // 0 root .. 1.75 tip
      const u = y / 1.75;
      const chordK = 1 - 0.35 * u;
      const twist = (0.44 - 0.3 * u);
      const x = p.getX(i) * chordK, z = p.getZ(i);
      p.setXYZ(i, x * Math.cos(twist) - z * Math.sin(twist), y + 0.32, x * Math.sin(twist) + z * Math.cos(twist));
    }
    blade.computeVertexNormals();
    blade.rotateZ((b / 6) * Math.PI * 2);
    parts.add(blade, (x, y) => (Math.hypot(x, y) > 1.9 ? tip : dark));
  }
  return parts.geometry();
}

export function buildGunshipAirframe(hooks: GunshipMaterialHooks | null): BuiltAirframe {
  const root = new THREE.Group();
  root.name = 'AC-130 gunship';
  const parts = new Parts();
  const grey = lin(GREY), radome = lin(RADOME), glass = lin(GLASS), dark = lin(DARK);

  // ---- the fuselage: nose +z, the upswept tail cone; band 1 the cockpit glazing, band 2 the radome ----
  const WINDOW = 1, NOSE = 2;
  addLoft(parts, [
    { z: 15.0, cy: 0.1, rx: 0, ry: 0, band: NOSE },
    { z: 14.8, cy: 0.08, rx: 0.5, ry: 0.48, band: NOSE },
    { z: 14.35, cy: 0.08, rx: 0.98, ry: 0.92, band: NOSE },
    { z: 13.75, cy: 0.12, rx: 1.42, ry: 1.38, band: NOSE },
    { z: 13.75, cy: 0.12, rx: 1.42, ry: 1.38 },
    { z: 13.55, cy: 0.16, rx: 1.58, ry: 1.56 },
    { z: 13.55, cy: 0.16, rx: 1.58, ry: 1.56, band: WINDOW },
    { z: 12.75, cy: 0.24, rx: 1.88, ry: 1.92, band: WINDOW },
    { z: 12.1, cy: 0.28, rx: 2.02, ry: 2.1, band: WINDOW },
    { z: 12.1, cy: 0.28, rx: 2.02, ry: 2.1 },
    { z: 10.6, cy: 0.32, rx: 2.18, ry: 2.28 },
    { z: -3.5, cy: 0.32, rx: 2.2, ry: 2.3 },
    { z: -6.0, cy: 0.56, rx: 2.06, ry: 2.06 },
    { z: -8.5, cy: 0.96, rx: 1.72, ry: 1.6 },
    { z: -11.0, cy: 1.42, rx: 1.28, ry: 1.06 },
    { z: -13.2, cy: 1.82, rx: 0.82, ry: 0.6 },
    { z: -14.6, cy: 2.06, rx: 0.42, ry: 0.3 },
    { z: -14.95, cy: 2.12, rx: 0, ry: 0 },
  ], 20, 0, 2.6, (s, sx, sy) => {
    if (s.band === NOSE && sy < 0.55) return radome;
    // the glazing: the windscreen and the cockpit's side windows, above the shoulder
    if (s.band === WINDOW && sy > 0.42 && sy < 0.9 && Math.abs(sx) < 0.93) return glass;
    return grey;
  });
  // the landing-gear sponsons, low on both sides
  for (const side of [-1, 1]) {
    addLoft(parts, [
      { z: 3.6, cy: -1.25, rx: 0, ry: 0 },
      { z: 3.0, cy: -1.28, rx: 0.5, ry: 0.55 },
      { z: 2.0, cy: -1.32, rx: 0.78, ry: 0.84 },
      { z: -3.0, cy: -1.32, rx: 0.78, ry: 0.84 },
      { z: -4.1, cy: -1.25, rx: 0.48, ry: 0.52 },
      { z: -4.6, cy: -1.2, rx: 0, ry: 0 },
    ], 14, side * 1.78, 2.2);
  }

  // ---- the high wing (dihedral 2.5 degrees, black boots on the outer leading edges) ----
  const up = new THREE.Vector3(0, 1, 0);
  for (const side of [-1, 1]) {
    surface(parts, { le: new THREE.Vector3(0, WING_Y, 3.5), chord: 4.9, thick: 0.85 },
      { le: new THREE.Vector3(side * 20.2, wingY(20.2), 2.55), chord: 2.6, thick: 0.38 }, up, 1);
  }
  // ---- the tailplane, and the fin (its span up, its thickness across) ----
  for (const side of [-1, 1]) {
    surface(parts, { le: new THREE.Vector3(0, 2.18, -11.2), chord: 3.3, thick: 0.45 },
      { le: new THREE.Vector3(side * 8.0, 2.18, -12.65), chord: 1.75, thick: 0.2 }, up, 1);
  }
  surface(parts, { le: new THREE.Vector3(0, 2.3, -8.2), chord: 6.4, thick: 0.75 },
    { le: new THREE.Vector3(0, 9.3, -12.5), chord: 2.9, thick: 0.3 }, new THREE.Vector3(1, 0, 0), 1);

  // ---- four turboprop nacelles slung under the wing, their intakes dark, exhausts sooted ----
  const COWL = 3;
  const engines = [-9.9, -5.1, 5.1, 9.9];
  for (const x of engines) {
    const y = wingY(x) - 0.55;
    addLoft(parts, [
      { z: 6.25, cy: y, rx: 0, ry: 0 },
      { z: 6.05, cy: y, rx: 0.2, ry: 0.2 },
      { z: 5.62, cy: y, rx: 0.4, ry: 0.4 },
      { z: 5.5, cy: y - 0.04, rx: 0.52, ry: 0.6, band: COWL },
      { z: 5.3, cy: y - 0.08, rx: 0.6, ry: 0.78, band: COWL },
      { z: 5.3, cy: y - 0.08, rx: 0.6, ry: 0.78 },
      { z: 2.4, cy: y - 0.1, rx: 0.64, ry: 0.86 },
      { z: -0.4, cy: y + 0.02, rx: 0.56, ry: 0.72 },
      { z: -2.4, cy: y + 0.24, rx: 0.24, ry: 0.28 },
      { z: -2.75, cy: y + 0.3, rx: 0, ry: 0 },
    ], 16, x, 2.3, (s, _sx, sy) => (s.band === COWL && sy < 0.2 ? dark : grey));
    // the exhaust on the nacelle's outboard flank
    box(parts, 0.08, 0.5, 1.4, x + Math.sign(x) * 0.62, y - 0.1, 1.3, EXHAUST);
  }

  // ---- the port side's guns and sensor (port = +x, toward the orbit's centre) ----
  const port = new THREE.Vector3(1, -0.18, 0).normalize();
  box(parts, 0.42, 0.7, 1.0, 2.12, -0.35, 6.2, DARK); // the 30 mm's gun port
  rod(parts, new THREE.Vector3(2.0, -0.38, 6.2), port, 0.075, 1.7, DARK);
  box(parts, 0.5, 0.9, 1.3, 2.1, -0.7, -5.0, DARK); // the 152 mm howitzer's port
  rod(parts, new THREE.Vector3(1.9, -0.72, -5.0), port, 0.11, 2.6, DARK, 10);
  rod(parts, new THREE.Vector3(1.9, -0.72, -5.0).addScaledVector(port, 2.55), port, 0.18, 0.38, DARK, 10);
  {
    const ball = new THREE.SphereGeometry(0.46, 14, 10);
    ball.translate(1.15, -1.95, 10.6);
    const c = dark;
    parts.add(ball, () => c);
  }

  const material = new THREE.MeshStandardMaterial({ name: 'ac130-airframe', vertexColors: true, metalness: 0.32, roughness: 0.6 });
  hooks?.setup(material);
  const body = new THREE.Mesh(parts.geometry(), material);
  body.name = 'ac130-airframe-body';
  root.add(body);
  const propGeo = propGeometry();
  const props: THREE.Mesh[] = [];
  for (const x of engines) {
    const prop = new THREE.Mesh(propGeo, material);
    prop.name = 'ac130-prop';
    prop.position.set(x, wingY(x) - 0.55, 5.58);
    prop.rotation.z = x * 0.37; // the four props out of phase
    root.add(prop);
    props.push(prop);
  }
  return {
    root,
    spin(dt) { for (let i = 0; i < props.length; i++) props[i]!.rotation.z += dt * PROP_RAD_S * (i % 2 ? 1 : 1.03); },
    dispose() {
      root.removeFromParent();
      body.geometry.dispose();
      propGeo.dispose();
      hooks?.release(material);
      material.dispose();
    },
  };
}
