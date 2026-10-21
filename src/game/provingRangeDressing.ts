/**
 * The proving ground's furniture (2026-10-20; owner 2026-10-17: "build out all the options": proving ground / test drive).
 * Copyright © 2026 Kevin B. Liu. Loaded with the mode presentation (matchModeWorldPresentation.ts, a lazy chunk), built
 * once per range and redrawn only when the player's strikes change:
 *
 *  - the plate rack: each reference plate a slab of its own thickness on a painted steel frame, its face stencilled
 *    with its thickness (and its angle when laid back), and every strike of the player's left on it: a hole where a
 *    round went through, a bright gouge where one stopped, a scrape where one glanced off;
 *  - range boards every 100 m down the right of the lanes, their numerals facing the firing line;
 *  - the drive course: a grade board at each feature (its pictogram and figure), edge poles along the graded band and
 *    a gate at its start.
 *
 * Everything here is presentation: the plates the rounds strike and the ground the hull drives are the simulation's
 * (sim/provingGround.ts, sim/terrainDeformation.ts). Lit materials join the cascades through the presentation's hook;
 * nothing allocates on a frame that changes nothing.
 */
import * as THREE from 'three';
import type { ProvingPlatePresentation, ProvingRangePresentation } from '../sim/matchModes.ts';
import { PROVING_DISPLAY, loadProvingType } from '../ui/provingType.ts';

interface DressingOptions {
  groundHeight?: (x: number, z: number) => number;
  setupMaterial?: (material: THREE.Material) => void;
  releaseMaterial?: (material: THREE.Material) => void;
}

export interface ProvingRangeDressing {
  readonly root: THREE.Group;
  /** Show the range's furniture (built on its first range), or hide it (null). */
  update(range: ProvingRangePresentation | null): void;
  dispose(): void;
}

/** Range boards: every BOARD_STEP_M down the range to BOARD_LAST_M, BOARD_LATERAL_M across (the shooter's right). */
const BOARD_STEP_M = 100;
const BOARD_LAST_M = 800;
const BOARD_LATERAL_M = -27;
/** Course edge poles: one every POLE_STEP_M along each edge, POLE_OUT_M past the graded band. */
const POLE_STEP_M = 8;
const POLE_OUT_M = 1.2;
/** A plate laid back this far (deg) or more gets a plaque at its foot. */
const PLAQUE_MIN_DEG = 45;
const PLATE_TEX_W = 256;
const STEEL = '#4b5258';
const PAINT_WHITE = '#f4f6f1';
const PAINT_AMBER = '#f0a030';
const SIGN_YELLOW = '#f2b233';
const INK = '#151a1e';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _basis = new THREE.Matrix4();

/** A small deterministic hash noise (a plate's mill scale), so every plate's face looks the same each battle. */
function hash(i: number, j: number, seed: number): number {
  let h = Math.imul(i ^ 0x27d4eb2f, 0x9e3779b1) ^ Math.imul(j ^ 0x165667b1, 0x85ebca77) ^ Math.imul(seed, 0xc2b2ae3d);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return ((h >>> 0) & 0xffff) / 0xffff;
}

/**
 * A unit box whose +z face is its own last group (material 1) after one group of the other five (material 0): a board's
 * or a plate's painted face and its plain edges in two draws, not six.
 */
function faceBox(): THREE.BoxGeometry {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const index = box.getIndex()!;
  const source = Array.from(index.array as ArrayLike<number>);
  // BoxGeometry's groups run px, nx, py, ny, pz, nz, six indices each: move pz after nz
  const order = [...source.slice(0, 24), ...source.slice(30, 36), ...source.slice(24, 30)];
  box.setIndex(order);
  box.clearGroups();
  box.addGroup(0, 30, 0);
  box.addGroup(30, 6, 1);
  return box;
}

/** A beam's matrix from `a` to `b` with a square section `w` x `d` (its local y along the beam). */
function beamMatrix(a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, out: THREE.Matrix4): THREE.Matrix4 {
  _mid.addVectors(a, b).multiplyScalar(0.5);
  _dir.subVectors(b, a);
  const length = _dir.length();
  _q.setFromUnitVectors(UP, length > 1e-6 ? _dir.multiplyScalar(1 / length) : UP);
  _s.set(w, Math.max(1e-3, length), d);
  return out.compose(_mid, _q, _s);
}

export function createProvingRangeDressing(parent: THREE.Object3D, options: DressingOptions = {}): ProvingRangeDressing {
  const root = new THREE.Group();
  root.name = 'proving-range-dressing';
  root.visible = false;
  parent.add(root);
  const ground = (x: number, z: number): number => options.groundHeight?.(x, z) ?? 0;

  // shared for the dressing's life; a range's own faces and canvases go with it (a cached presentation's next battle)
  const lit: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  let rangeLit: THREE.Material[] = [];
  let textures: THREE.Texture[] = [];
  const material = (params: THREE.MeshStandardMaterialParameters, owner = lit): THREE.MeshStandardMaterial => {
    const made = new THREE.MeshStandardMaterial(params);
    options.setupMaterial?.(made);
    owner.push(made);
    return made;
  };
  const releaseRange = (): void => {
    for (const made of rangeLit) { options.releaseMaterial?.(made); made.dispose(); }
    for (const texture of textures) texture.dispose();
    root.traverse((object) => { if ((object as THREE.InstancedMesh).isInstancedMesh) (object as THREE.InstancedMesh).dispose(); });
    rangeLit = [];
    textures = [];
  };
  const geometry = <T extends THREE.BufferGeometry>(made: T): T => { geometries.push(made); return made; };
  const unitBox = geometry(new THREE.BoxGeometry(1, 1, 1));
  const panelBox = geometry(faceBox());
  const frameMaterial = material({ color: 0x4a5236, roughness: 0.78, metalness: 0.15 });
  // rolled plate: dark, matte mill scale (a bright metal read as frosted glass against the sky)
  const steelSide = material({ color: 0x3e4449, roughness: 0.68, metalness: 0.3, envMapIntensity: 0.5 });
  const postMaterial = material({ color: 0x3b4044, roughness: 0.82, metalness: 0.1 });
  const poleMaterial = material({ color: 0xe9ece6, roughness: 0.6, metalness: 0 });
  const capMaterial = material({ color: 0xd8462a, roughness: 0.55, metalness: 0 });

  /** A board facing `yaw` (its face's normal), `w` x `h`, its lower edge `lift` above the ground at (x, z), on posts
   *  (their matrices into `posts`: one instanced mesh for every board's posts). */
  const board = (group: THREE.Group, canvas: HTMLCanvasElement, x: number, z: number, yaw: number, w: number, h: number,
    lift: number, postCount: 1 | 2, posts: THREE.Matrix4[]): THREE.CanvasTexture => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.push(texture);
    const face = material({ map: texture, roughness: 0.72, metalness: 0 }, rangeLit);
    const y = ground(x, z);
    const panel = new THREE.Mesh(panelBox, [postMaterial, face]);
    panel.scale.set(w, h, 0.06);
    panel.position.set(x, y + lift + h / 2, z);
    panel.rotation.y = yaw;
    panel.castShadow = true;
    panel.receiveShadow = true;
    group.add(panel);
    const across = postCount === 2 ? [-w * 0.36, w * 0.36] : [0];
    for (const offset of across) {
      const px = x + Math.cos(yaw) * offset - Math.sin(yaw) * 0.06, pz = z - Math.sin(yaw) * offset - Math.cos(yaw) * 0.06;
      const top = y + lift + h * 0.9, foot = ground(px, pz) - 0.2;
      posts.push(beamMatrix(_a.set(px, foot, pz), _b.set(px, top, pz), 0.09, 0.09, new THREE.Matrix4()));
    }
    return texture;
  };

  // --- the canvases ------------------------------------------------------------------------------------------------
  const canvasOf = (w: number, h: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    return canvas;
  };

  /** A range board: a slate panel, an amber band along its top, the range in white. */
  const drawRangeBoard = (canvas: HTMLCanvasElement, rangeM: number): void => {
    const ctx = canvas.getContext('2d')!;
    const { width: w, height: h } = canvas;
    ctx.fillStyle = '#1f272c'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = PAINT_AMBER; ctx.fillRect(0, 0, w, h * 0.12);
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 4; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = PAINT_WHITE;
    ctx.font = `700 ${Math.round(h * 0.62)}px ${PROVING_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(rangeM), w * 0.46, h * 0.58);
    // the unit, small, after the figure
    const figureW = ctx.measureText(String(rangeM)).width;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(244,246,241,.7)';
    ctx.font = `600 ${Math.round(h * 0.26)}px ${PROVING_DISPLAY}`;
    ctx.fillText('m', w * 0.46 + figureW / 2 + h * 0.04, h * 0.7);
  };

  /** A plate's plaque: its thickness and the angle it is laid back, white and amber on slate. */
  const drawPlaque = (canvas: HTMLCanvasElement, mm: number, angle: number): void => {
    const ctx = canvas.getContext('2d')!;
    const { width: w, height: h } = canvas;
    ctx.fillStyle = '#1f272c'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = PAINT_AMBER; ctx.fillRect(0, 0, w, h * 0.1);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = PAINT_WHITE;
    ctx.font = `700 ${Math.round(h * 0.56)}px ${PROVING_DISPLAY}`;
    ctx.fillText(String(mm), w * 0.56, h * 0.58);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(244,246,241,.7)';
    ctx.font = `600 ${Math.round(h * 0.24)}px ${PROVING_DISPLAY}`;
    ctx.fillText('mm', w * 0.58, h * 0.4);
    ctx.fillStyle = PAINT_AMBER;
    ctx.font = `600 ${Math.round(h * 0.34)}px ${PROVING_DISPLAY}`;
    ctx.fillText(`${angle}°`, w * 0.58, h * 0.72);
  };

  /** A course board: a yellow diamond, the feature's pictogram over its figure. */
  const drawCourseBoard = (canvas: HTMLCanvasElement, kind: string, first: number): void => {
    const ctx = canvas.getContext('2d')!;
    const s = canvas.width;
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = '#20262a'; ctx.fillRect(0, 0, s, s);
    ctx.save();
    ctx.translate(s / 2, s / 2); ctx.rotate(Math.PI / 4);
    const d = s * 0.6;
    ctx.fillStyle = SIGN_YELLOW; ctx.fillRect(-d / 2, -d / 2, d, d);
    ctx.lineWidth = s * 0.03; ctx.strokeStyle = INK; ctx.strokeRect(-d / 2 + s * 0.035, -d / 2 + s * 0.035, d - s * 0.07, d - s * 0.07);
    ctx.restore();
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const cx = s / 2, cy = s * 0.43, k = s / 256;
    ctx.beginPath();
    if (kind === 'start') {
      // the way in: two chevrons pointing down the course
      for (const dy of [-18, 14]) {
        ctx.moveTo(cx - 42 * k, cy + (dy + 22) * k); ctx.lineTo(cx, cy + (dy - 14) * k); ctx.lineTo(cx + 42 * k, cy + (dy + 22) * k);
      }
      ctx.lineWidth = 14 * k; ctx.stroke();
    } else if (kind === 'ramp') {
      const rise = Math.tan(first * Math.PI / 180) * 70 * k;
      ctx.moveTo(cx - 60 * k, cy + 22 * k); ctx.lineTo(cx + 10 * k, cy + 22 * k - rise); ctx.lineTo(cx + 60 * k, cy + 22 * k - rise);
      ctx.lineTo(cx + 60 * k, cy + 22 * k); ctx.closePath(); ctx.fill();
    } else if (kind === 'ditch') {
      ctx.moveTo(cx - 62 * k, cy - 6 * k); ctx.lineTo(cx - 30 * k, cy - 6 * k); ctx.lineTo(cx - 16 * k, cy + 24 * k);
      ctx.lineTo(cx + 16 * k, cy + 24 * k); ctx.lineTo(cx + 30 * k, cy - 6 * k); ctx.lineTo(cx + 62 * k, cy - 6 * k);
      ctx.lineWidth = 9 * k; ctx.stroke();
    } else if (kind === 'moguls') {
      ctx.moveTo(cx - 62 * k, cy + 18 * k);
      for (let i = 0; i <= 48; i++) {
        const t = i / 48;
        ctx.lineTo(cx - 62 * k + t * 124 * k, cy + 18 * k - 20 * k * 0.5 * (1 - Math.cos(t * Math.PI * 2 * 3)));
      }
      ctx.lineWidth = 9 * k; ctx.stroke();
    } else {
      // the side slope: the ground tilted, a hull leaning on it
      const tilt = -first * Math.PI / 180;
      ctx.save(); ctx.translate(cx, cy + 10 * k); ctx.rotate(tilt);
      ctx.fillRect(-60 * k, 10 * k, 120 * k, 9 * k);
      ctx.fillRect(-30 * k, -10 * k, 60 * k, 18 * k);
      ctx.fillRect(-12 * k, -22 * k, 26 * k, 12 * k);
      ctx.fillRect(10 * k, -19 * k, 34 * k, 5 * k);
      ctx.restore();
    }
    if (kind === 'start') return;
    const figure = kind === 'ditch' || kind === 'moguls' ? `${first.toFixed(first % 1 ? 1 : 0)} m` : `${Math.round(first)}°`;
    ctx.font = `700 ${Math.round(38 * k)}px ${PROVING_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(figure, cx, s * 0.66);
  };

  /** A plate's face: mill-scaled steel, its thickness stencilled, every strike marked. */
  const drawPlateFace = (canvas: HTMLCanvasElement, plate: ProvingPlatePresentation): void => {
    const ctx = canvas.getContext('2d')!;
    const { width: w, height: h } = canvas;
    ctx.fillStyle = STEEL; ctx.fillRect(0, 0, w, h);
    // mill scale: soft overlapping blotches and a fine rolling grain, deterministic per plate (no hard cells)
    const blotches = Math.round((w * h) / 2200);
    for (let k = 0; k < blotches; k++) {
      const bx = hash(k, 1, plate.index + 1) * w, by = hash(k, 2, plate.index + 1) * h;
      const br = (0.12 + hash(k, 3, plate.index + 1) * 0.3) * Math.min(w, h);
      const light = hash(k, 4, plate.index + 1) > 0.55;
      const glow = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      glow.addColorStop(0, light ? 'rgba(214,222,228,.12)' : 'rgba(22,28,32,.16)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    for (let k = 0; k < h; k += 3) {
      ctx.fillStyle = `rgba(${hash(k, 5, plate.index + 1) > 0.5 ? '235,240,244' : '10,14,18'},${0.015 + hash(k, 6, plate.index + 1) * 0.035})`;
      ctx.fillRect(0, k, w, 1);
    }
    // the cut edge, a lighter rim
    ctx.strokeStyle = 'rgba(205,212,216,.5)'; ctx.lineWidth = 5; ctx.strokeRect(2.5, 2.5, w - 5, h - 5);
    // the stencil: the thickness (and the angle laid back)
    const px = w / plate.widthM;
    ctx.fillStyle = PAINT_WHITE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const size = Math.min(w * 0.36, h * 0.22);
    ctx.font = `700 ${Math.round(size)}px ${PROVING_DISPLAY}`;
    // a stencil: crisp white paint with a dark keyline so it reads at range
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.08);
    ctx.strokeStyle = 'rgba(12,15,18,.85)';
    ctx.strokeText(String(plate.mm), w / 2, h * 0.26);
    ctx.fillText(String(plate.mm), w / 2, h * 0.26);
    // its unit under it (and the angle it is laid back, in amber)
    ctx.font = `600 ${Math.round(size * 0.42)}px ${PROVING_DISPLAY}`;
    ctx.lineWidth = Math.max(2, size * 0.05);
    ctx.strokeText('mm', w / 2, h * 0.26 + size * 0.72);
    ctx.fillText('mm', w / 2, h * 0.26 + size * 0.72);
    if (plate.angleDeg) {
      ctx.fillStyle = PAINT_AMBER;
      ctx.font = `600 ${Math.round(size * 0.55)}px ${PROVING_DISPLAY}`;
      ctx.strokeText(`${plate.angleDeg}°`, w / 2, h * 0.26 + size * 1.25);
      ctx.fillText(`${plate.angleDeg}°`, w / 2, h * 0.26 + size * 1.25);
    }
    // the strikes: u across from the centre (right +), v up the face from the centre
    for (const mark of plate.strikes) {
      const x = w / 2 + mark.u * px, y = h / 2 - mark.v * px;
      if (mark.kind === 'pen') {
        ctx.fillStyle = 'rgba(18,14,10,.55)';
        ctx.beginPath(); ctx.arc(x, y, 0.13 * px, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c9cdd0';
        ctx.beginPath(); ctx.arc(x, y, 0.065 * px, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#050505';
        ctx.beginPath(); ctx.arc(x, y, 0.05 * px, 0, Math.PI * 2); ctx.fill();
      } else if (mark.kind === 'nonpen') {
        ctx.fillStyle = 'rgba(24,20,16,.4)';
        ctx.beginPath(); ctx.arc(x, y, 0.12 * px, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d7dbdc';
        ctx.beginPath(); ctx.arc(x, y, 0.06 * px, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8a8f92';
        ctx.beginPath(); ctx.arc(x, y, 0.03 * px, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = '#e0e4e6'; ctx.lineWidth = 0.04 * px; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - 0.2 * px, y + 0.05 * px); ctx.lineTo(x + 0.12 * px, y - 0.03 * px); ctx.stroke();
        ctx.strokeStyle = 'rgba(20,20,20,.35)'; ctx.lineWidth = 0.015 * px;
        ctx.beginPath(); ctx.moveTo(x - 0.18 * px, y + 0.07 * px); ctx.lineTo(x + 0.12 * px, y - 0.01 * px); ctx.stroke();
      }
    }
  };

  // --- the build ---------------------------------------------------------------------------------------------------
  interface PlateView { plate: ProvingPlatePresentation; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; drawn: string }
  let built: ProvingRangePresentation | null = null;
  let plates: PlateView[] = [];
  let redraw: (() => void) | null = null;

  const build = (range: ProvingRangePresentation): void => {
    releaseRange();
    root.clear();
    plates = [];
    const group = new THREE.Group();
    root.add(group);
    const frames: THREE.Matrix4[] = [];
    const plaqueCanvases: Array<[HTMLCanvasElement, number, number]> = [];
    const plaquePosts: THREE.Matrix4[] = [];

    // the plate rack
    for (const plate of range.plates) {
      const thickness = Math.max(0.03, plate.mm / 1000);
      const yaw = plate.yaw, lay = plate.angleDeg * Math.PI / 180;
      const n = new THREE.Vector3(Math.sin(yaw) * Math.cos(lay), Math.sin(lay), Math.cos(yaw) * Math.cos(lay));
      const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const u = new THREE.Vector3().crossVectors(n, r);
      const centre = new THREE.Vector3(plate.x, plate.y, plate.z);
      const canvas = canvasOf(PLATE_TEX_W, Math.round(PLATE_TEX_W * plate.heightM / plate.widthM));
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      textures.push(texture);
      // the stencil reads like retroreflective range paint: the face's own canvas lights it faintly (the dark steel
      // stays dark, the white paint carries)
      const face = material({ map: texture, roughness: 0.64, metalness: 0.3, envMapIntensity: 0.5,
        emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.24 }, rangeLit);
      const slab = new THREE.Mesh(panelBox, [steelSide, face]);
      _basis.makeBasis(r, u, n);
      slab.quaternion.setFromRotationMatrix(_basis);
      slab.scale.set(plate.widthM, plate.heightM, thickness);
      slab.position.copy(centre).addScaledVector(n, -thickness / 2);
      slab.castShadow = true; slab.receiveShadow = true;
      slab.name = `range-plate-${plate.index + 1}`;
      group.add(slab);
      plates.push({ plate, canvas, texture, drawn: '' });
      // a plate laid far back shows the line little of its face: a plaque at its foot names it, upright, facing the line
      if (plate.angleDeg >= PLAQUE_MIN_DEG) {
        const foot = _a.copy(centre).addScaledVector(u, -plate.heightM / 2).addScaledVector(n, 0.35);
        const canvas = canvasOf(256, 128);
        board(group, canvas, foot.x + Math.sin(yaw) * 0.25, foot.z + Math.cos(yaw) * 0.25, yaw, 0.9, 0.45, 0.12, 1, plaquePosts);
        plaqueCanvases.push([canvas, plate.mm, plate.angleDeg]);
      }
      // the frame: a stile up each side behind the plate, a leg from each stile's foot to the ground, a raker from each
      // stile's head back to the ground (an upright or leaning plate), and a sill along the ground under it
      const back = thickness + 0.06;
      for (const side of [-1, 1]) {
        const across = side * (plate.widthM / 2 - 0.12);
        const foot = _a.copy(centre).addScaledVector(r, across).addScaledVector(u, -plate.heightM / 2).addScaledVector(n, -back);
        const head = _b.copy(centre).addScaledVector(r, across).addScaledVector(u, plate.heightM / 2).addScaledVector(n, -back);
        frames.push(beamMatrix(foot, head, 0.08, 0.08, new THREE.Matrix4()));
        const leg = new THREE.Vector3(foot.x, ground(foot.x, foot.z) - 0.15, foot.z);
        frames.push(beamMatrix(leg, foot, 0.08, 0.08, new THREE.Matrix4()));
        if (plate.angleDeg < 60) {
          const reach = 0.55 * plate.heightM + 0.4;
          const heel = new THREE.Vector3(head.x - Math.sin(yaw) * reach, 0, head.z - Math.cos(yaw) * reach);
          heel.y = ground(heel.x, heel.z) - 0.1;
          frames.push(beamMatrix(head, heel, 0.07, 0.07, new THREE.Matrix4()));
        } else {
          // laid far back: a prop straight down from the stile's head
          const prop = new THREE.Vector3(head.x, ground(head.x, head.z) - 0.15, head.z);
          frames.push(beamMatrix(prop, head, 0.08, 0.08, new THREE.Matrix4()));
        }
      }
      const sillA = new THREE.Vector3().copy(centre).addScaledVector(r, -plate.widthM / 2 - 0.1).addScaledVector(u, -plate.heightM / 2).addScaledVector(n, -back);
      const sillB = new THREE.Vector3().copy(centre).addScaledVector(r, plate.widthM / 2 + 0.1).addScaledVector(u, -plate.heightM / 2).addScaledVector(n, -back);
      sillA.y = ground(sillA.x, sillA.z) + 0.08; sillB.y = ground(sillB.x, sillB.z) + 0.08;
      frames.push(beamMatrix(sillA, sillB, 0.16, 0.16, new THREE.Matrix4()));
    }
    const frameMesh = new THREE.InstancedMesh(unitBox, frameMaterial, frames.length);
    frames.forEach((matrix, index) => frameMesh.setMatrixAt(index, matrix));
    frameMesh.castShadow = true; frameMesh.receiveShadow = true;
    frameMesh.name = 'range-plate-frames';
    group.add(frameMesh);

    // range boards, down the right of the lanes, facing the firing line
    const yaw = range.course.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
    const boardCanvases: Array<[HTMLCanvasElement, number]> = [];
    const boardPosts: THREE.Matrix4[] = [];
    for (let along = BOARD_STEP_M; along <= BOARD_LAST_M; along += BOARD_STEP_M) {
      const x = range.origin.x + fx * along + lx * BOARD_LATERAL_M, z = range.origin.z + fz * along + lz * BOARD_LATERAL_M;
      if (Math.abs(x) > 500 || Math.abs(z) > 500) break;
      const canvas = canvasOf(256, 160);
      board(group, canvas, x, z, Math.atan2(range.origin.x - x, range.origin.z - z), 2.2, 1.375, 1.1, 2, boardPosts);
      boardCanvases.push([canvas, along]);
    }

    // the drive course: a gate at its start, a board at each feature, poles along both edges of the graded band
    const course = range.course;
    const cf = { x: Math.sin(course.yaw), z: Math.cos(course.yaw) }, cl = { x: Math.cos(course.yaw), z: -Math.sin(course.yaw) };
    const edge = course.widthM / 2 + POLE_OUT_M;
    const courseCanvases: Array<[HTMLCanvasElement, string, number]> = [];
    {
      // the start board, before the gate
      const x = course.start.x - cf.x * 9 - cl.x * (edge + 1.2), z = course.start.z - cf.z * 9 - cl.z * (edge + 1.2);
      const canvas = canvasOf(256, 256);
      board(group, canvas, x, z, course.yaw + Math.PI, 1.3, 1.3, 0.9, 1, boardPosts);
      courseCanvases.push([canvas, 'start', 0]);
    }
    for (const feature of course.features) {
      const x = feature.x0 - cf.x * 3 - cl.x * (edge + 1.2), z = feature.z0 - cf.z * 3 - cl.z * (edge + 1.2);
      const canvas = canvasOf(256, 256);
      board(group, canvas, x, z, course.yaw + Math.PI, 1.3, 1.3, 0.9, 1, boardPosts);
      courseCanvases.push([canvas, feature.kind, feature.first]);
    }
    const length = Math.hypot(course.end.x - course.start.x, course.end.z - course.start.z);
    const poles: THREE.Matrix4[] = [], caps: THREE.Matrix4[] = [];
    for (let along = -4; along <= length + 4; along += POLE_STEP_M) {
      for (const side of [-1, 1]) {
        const x = course.start.x + cf.x * along + cl.x * side * edge, z = course.start.z + cf.z * along + cl.z * side * edge;
        const y = ground(x, z);
        poles.push(beamMatrix(_a.set(x, y - 0.2, z), _b.set(x, y + 1.05, z), 0.06, 0.06, new THREE.Matrix4()));
        caps.push(beamMatrix(_a.set(x, y + 1.05, z), _b.set(x, y + 1.35, z), 0.065, 0.065, new THREE.Matrix4()));
      }
    }
    // the gate: two tall posts either side of the start, red-capped
    for (const side of [-1, 1]) {
      const x = course.start.x - cf.x * 6 + cl.x * side * (edge + 0.4), z = course.start.z - cf.z * 6 + cl.z * side * (edge + 0.4);
      const y = ground(x, z);
      // the edge poles' own style, taller: the gate is two of them
      poles.push(beamMatrix(_a.set(x, y - 0.2, z), _b.set(x, y + 1.9, z), 0.08, 0.08, new THREE.Matrix4()));
      caps.push(beamMatrix(_a.set(x, y + 1.9, z), _b.set(x, y + 2.3, z), 0.085, 0.085, new THREE.Matrix4()));
    }
    const instanced = (matrices: THREE.Matrix4[], mat: THREE.Material, name: string): void => {
      const mesh = new THREE.InstancedMesh(unitBox, mat, matrices.length);
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.castShadow = true;
      mesh.name = name;
      group.add(mesh);
    };
    instanced(poles, poleMaterial, 'range-course-poles');
    instanced([...boardPosts, ...plaquePosts], postMaterial, 'range-board-posts');
    instanced(caps, capMaterial, 'range-course-caps');

    // draw now (fallback faces), again once the range's type has loaded
    redraw = () => {
      for (const [canvas, along] of boardCanvases) drawRangeBoard(canvas, along);
      for (const [canvas, mm, angle] of plaqueCanvases) drawPlaque(canvas, mm, angle);
      for (const [canvas, kind, first] of courseCanvases) drawCourseBoard(canvas, kind, first);
      for (const view of plates) { view.drawn = ''; }
      for (const texture of textures) texture.needsUpdate = true;
      refreshPlates();
    };
    redraw();
    void loadProvingType().then(() => { if (built === range) redraw?.(); });
  };

  /** A plate's face redraws when its strikes change (a hit, a reset). */
  const refreshPlates = (): void => {
    for (const view of plates) {
      const strikes = view.plate.strikes;
      const key = strikes.length ? `${strikes.length}:${strikes[strikes.length - 1].u}:${strikes[strikes.length - 1].v}` : '0';
      if (key === view.drawn) continue;
      view.drawn = key;
      drawPlateFace(view.canvas, view.plate);
      view.texture.needsUpdate = true;
    }
  };

  let lastSerial = -1;
  let lastStrikes = -1;
  const update = (range: ProvingRangePresentation | null): void => {
    if (!range) { root.visible = false; return; }
    if (range !== built) { build(range); built = range; lastSerial = -1; lastStrikes = -1; }
    root.visible = true;
    // a hit or a reset moves the serial or the strike count; nothing to redraw otherwise
    const serial = range.lastShot?.serial ?? 0;
    let strikes = 0;
    for (const plate of range.plates) strikes += plate.strikes.length;
    if (serial !== lastSerial || strikes !== lastStrikes) {
      lastSerial = serial;
      lastStrikes = strikes;
      refreshPlates();
    }
  };

  const dispose = (): void => {
    releaseRange();
    for (const made of lit) { options.releaseMaterial?.(made); made.dispose(); }
    for (const made of geometries) made.dispose();
    root.removeFromParent();
    built = null;
    plates = [];
    redraw = null;
  };

  return { root, update, dispose };
}
