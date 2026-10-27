// The technical drawings' studio (258; the owner, 2026-10-26: "make all technical drawings much better and much higher
// quality and update that whole system"). For one tank and each view (side, top, front) it renders:
//   - the plate: the shipped model in the technical look (src/engine/technicalPass.ts: graphite form shading, cavity,
//     engraved part edges, a light silhouette, hatching in the shade) on a transparent ground; supersampled 2x, at the
//     view's frame size (the 2x asset) and half of it (the 1x asset); no text;
//   - the overlay data: the Gallery's own anatomy (src/gallery/anatomyScene.ts, the scene its 3D Armor, Modules and Crew
//     layers draw, in the combat frames, so a presentation-only rig scale moves nothing): each armour surface, module
//     part and crew station in its own flat ID colour with depth testing, the ID buffer traced into polygons
//     (tools/technicalDrawingTrace.ts), each with the Gallery's key (H01, M04.2, C1), its tone, values and label point,
//     in the frame's pixels.
// The vehicle fills the frame to DRAWING_FILL of its width (less where its height binds); the scale (px per metre) is
// recorded for the viewer's scale bar. Driven by tools/genDrawings.mjs through window.__drawTank(id, views).
// First-party: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { getSpec } from '../src/vehicles/specs.ts';
import { createTechnicalCompositeMaterial } from '../src/engine/technicalPass.ts';
import { buildAnatomyScene, type AnatomyPick } from '../src/gallery/anatomyScene.ts';
import { plateMetricMm, type AnatomyArmor } from '../src/gallery/anatomyData.ts';
import { isPostwarVehicleEra } from '../src/sim/vehicleEras.ts';
import { technicalToneHex } from '../src/ui/technicalDiagramLegend.ts';
import { cleanLoops, labelPoint, loopsToPath, traceIdBuffer } from './technicalDrawingTrace.ts';

type View = 'side' | 'top' | 'front';
type Kind = 'armor' | 'modules' | 'crew';

/** Each view's frame (the 2x asset's pixels), the direction the camera looks from, and the frame's up. Side and top keep
 * the vehicle's front to the right; the front view looks at the bow. */
const VIEWS: Readonly<Record<View, { size: readonly [number, number]; from: readonly [number, number, number]; up: readonly [number, number, number] }>> = {
  side: { size: [2048, 683], from: [-1, 0, 0], up: [0, 1, 0] },
  top: { size: [2048, 853], from: [0, 1, 0], up: [1, 0, 0] },
  front: { size: [1536, 1536], from: [0, 0, 1], up: [0, 1, 0] },
};
/** The share of the frame's width the vehicle fills, and the most of its height. */
const DRAWING_FILL = 0.88;
const DRAWING_FILL_HEIGHT = 0.84;
/** Supersampling of every pass (the plate is downsampled; the ID buffer is traced at this resolution). */
const SS = 2;
/** Trace cleanup at the supersampled resolution: simplification tolerance and the smallest region kept (px, px²). */
const TRACE_TOLERANCE = 1.1;
const TRACE_MIN_AREA = 24;

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);

// ------------------------------------------------------------------------------------------------ framing and camera

function visibleMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    // the plate draws the vehicle: not its field net and foliage (scattered cards that hide the form), its marking
    // decals or its shadow proxies
    if (mesh.userData.fieldSuit || mesh.userData.vehicleFoliage || mesh.userData.markingFilm || mesh.userData.shadowOnly) return;
    for (let o: THREE.Object3D | null = mesh; o; o = o.parent) if (!o.visible) return;
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.Material[];
    if (materials.length && materials.every((m) => !m || m.colorWrite === false || m.visible === false || m.opacity <= 0)) return;
    meshes.push(mesh);
  });
  return meshes;
}

function meshBounds(meshes: readonly THREE.Mesh[]): THREE.Box3 {
  const box = new THREE.Box3().makeEmpty();
  for (const mesh of meshes) {
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      (mesh as THREE.InstancedMesh).computeBoundingBox();
      const b = (mesh as THREE.InstancedMesh).boundingBox;
      if (b && !b.isEmpty()) box.union(b.clone().applyMatrix4(mesh.matrixWorld));
      continue;
    }
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  }
  return box;
}

interface Frame { camera: THREE.OrthographicCamera; pxPerM: number; width: number; height: number; target: THREE.Vector3 }

/** The view's camera: orthographic, looking along the view's direction at the extents' centre (across and along the
 * frame, m), the extents filling DRAWING_FILL of the width (or DRAWING_FILL_HEIGHT of the height, whichever binds). */
function frameFrom(view: View, across: readonly [number, number], along: readonly [number, number], box: THREE.Box3): Frame {
  const { size: [width, height], from, up } = VIEWS[view];
  const dir = new THREE.Vector3(...from), upV = new THREE.Vector3(...up);
  const right = new THREE.Vector3().crossVectors(dir.clone().negate(), upV).normalize();
  const pxPerM = Math.min(DRAWING_FILL * width / (across[1] - across[0]), DRAWING_FILL_HEIGHT * height / (along[1] - along[0]));
  const center = box.getCenter(new THREE.Vector3());
  const target = center.clone().addScaledVector(right, (across[0] + across[1]) / 2 - center.dot(right))
    .addScaledVector(upV, (along[0] + along[1]) / 2 - center.dot(upV));
  const halfW = width / 2 / pxPerM, halfH = height / 2 / pxPerM, depth = box.getSize(new THREE.Vector3()).length() * 2 + 10;
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.05, depth * 2);
  camera.position.copy(target).addScaledVector(dir, depth);
  camera.up.copy(upV);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return { camera, pxPerM, width, height, target };
}

/** The bounds' frame: every corner of the vehicle's box, across and along the view. */
function frameView(view: View, box: THREE.Box3): Frame {
  const { from, up } = VIEWS[view];
  const dir = new THREE.Vector3(...from), upV = new THREE.Vector3(...up);
  const right = new THREE.Vector3().crossVectors(dir.clone().negate(), upV).normalize();
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const across = corners.map((c) => c.dot(right)), along = corners.map((c) => c.dot(upV));
  return frameFrom(view, [Math.min(...across), Math.max(...across)], [Math.min(...along), Math.max(...along)], box);
}

/** A row of the silhouette at least this wide (m) is the body; thinner rows above it are masts and whip antennas. */
const BODY_ROW_M = 0.3;
const coverageMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

/** What `frame` draws, measured on a quarter-size coverage pass: its extent across and along the frame (m, the axes'
 * coordinates), along to the body's top in an upright view (the highest row at least BODY_ROW_M wide: whips and masts
 * are merged into their material buckets, so no mesh name can leave them out). Fitting the frame to it, not to the
 * bounds, keeps parts the bounds count but the view never draws (a lattice panel edge-on from above) from shrinking the
 * drawing. */
function measureDrawn(root: THREE.Object3D, meshes: readonly THREE.Mesh[], frame: Frame, upright: boolean): { across: [number, number]; along: [number, number] } | null {
  const w = Math.round(frame.width / 4), h = Math.round(frame.height / 4);
  const target = new THREE.WebGLRenderTarget(w, h);
  const scene = new THREE.Scene();
  try {
    scene.add(root);
    withMaterial(meshes, coverageMaterial, () => { renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, frame.camera); });
    scene.remove(root);
    renderer.setRenderTarget(null);
    const pixels = readTarget(target, w, h);
    // rows from the top (GL rows count up from the bottom)
    let x0 = w, x1 = -1, top = -1, body = -1, bottom = -1;
    for (let r = 0; r < h; r++) {
      const row = h - 1 - r;
      let covered = 0;
      for (let x = 0; x < w; x++) {
        if (pixels[(row * w + x) * 4 + 3]! === 0) continue;
        covered++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
      }
      if (!covered) continue;
      if (top < 0) top = r;
      if (body < 0 && (!upright || covered / (frame.pxPerM / 4) >= BODY_ROW_M)) body = r;
      bottom = r;
    }
    if (x1 < 0 || body < 0) return null;
    const cam = frame.camera, metresPerPx = (cam.right - cam.left) / w;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = cam.up;
    const cx = frame.target.dot(right), cy = frame.target.dot(up);
    return {
      across: [cx + cam.left + x0 * metresPerPx, cx + cam.left + (x1 + 1) * metresPerPx],
      along: [cy + cam.top - (bottom + 1) * metresPerPx, cy + cam.top - body * metresPerPx],
    };
  } finally { target.dispose(); }
}

// ------------------------------------------------------------------------------------------------ the plate

const quadScene = new THREE.Scene();
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quadScene.add(quad);

/** The plate's composite: the technical look (src/engine/technicalPass.ts, the Gallery's 3D view draws the same) over
 * the plate's coverage, normal and depth passes. */
const plateComposite = createTechnicalCompositeMaterial();
plateComposite.uniforms.pxScale!.value = SS;
plateComposite.uniforms.orthographic!.value = true;

const passScene = new THREE.Scene();
const normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });

/** Swap the drawn meshes' material for one pass, and put them back (drawTank keeps every other mesh hidden). */
function withMaterial<T>(meshes: readonly THREE.Mesh[], material: THREE.Material, run: () => T): T {
  const saved = meshes.map((mesh) => mesh.material);
  meshes.forEach((mesh) => { mesh.material = material; });
  try { return run(); } finally { meshes.forEach((mesh, i) => { mesh.material = saved[i]!; }); }
}

function readTarget(target: THREE.WebGLRenderTarget, width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  return pixels;
}

/** The plate at the frame's size and half of it, as WebP data URLs (rows flipped to image order, downsampled from SS). */
function renderPlate(root: THREE.Object3D, meshes: readonly THREE.Mesh[], frame: Frame, view: View, bodyTopAlong: number): { full: string; half: string; box: [number, number, number, number]; body: [number, number, number, number] } {
  const w = frame.width * SS, h = frame.height * SS;
  const coverTarget = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
  const normalTarget = new THREE.WebGLRenderTarget(w, h, { depthTexture: new THREE.DepthTexture(w, h) });
  const outTarget = new THREE.WebGLRenderTarget(w, h);
  try {
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const cam = frame.camera;
    passScene.add(root);
    withMaterial(meshes, coverageMaterial, () => { renderer.setRenderTarget(coverTarget); renderer.clear(); renderer.render(passScene, cam); });
    withMaterial(meshes, normalMaterial, () => { renderer.setRenderTarget(normalTarget); renderer.clear(); renderer.render(passScene, cam); });
    passScene.remove(root);
    plateComposite.uniforms.tCover!.value = coverTarget.texture;
    plateComposite.uniforms.tNormal!.value = normalTarget.texture;
    plateComposite.uniforms.tDepth!.value = normalTarget.depthTexture;
    plateComposite.uniforms.texel!.value.set(1 / w, 1 / h);
    plateComposite.uniforms.near!.value = cam.near;
    plateComposite.uniforms.far!.value = cam.far;
    quad.material = plateComposite;
    renderer.setRenderTarget(outTarget);
    renderer.clear();
    renderer.render(quadScene, quadCamera);
    renderer.setRenderTarget(null);
    const pixels = readTarget(outTarget, w, h);
    const big = document.createElement('canvas');
    big.width = w; big.height = h;
    const image = big.getContext('2d')!.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const from = (h - 1 - y) * w * 4, row = pixels.subarray(from, from + w * 4);
      // un-premultiply for the canvas
      for (let x = 0; x < w * 4; x += 4) {
        const a = row[x + 3]!;
        const at = y * w * 4 + x;
        image.data[at] = a ? Math.min(255, Math.round(row[x]! * 255 / a)) : 0;
        image.data[at + 1] = a ? Math.min(255, Math.round(row[x + 1]! * 255 / a)) : 0;
        image.data[at + 2] = a ? Math.min(255, Math.round(row[x + 2]! * 255 / a)) : 0;
        image.data[at + 3] = a;
      }
    }
    big.getContext('2d')!.putImageData(image, 0, 0);
    // the drawing's extent in the frame's pixels (every texel with alpha over 8), and the body's: its top is the top of
    // the extent the frame was fitted to (measureDrawn: whips above it may run off the frame's top)
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (image.data[(y * w + x) * 4 + 3]! <= 8) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const box: [number, number, number, number] = [x0 / SS, y0 / SS, (x1 + 1) / SS, (y1 + 1) / SS];
    const fittedTop = Math.round((frame.camera.top - bodyTopAlong + frame.target.dot(frame.camera.up)) * frame.pxPerM * 10) / 10;
    const body: [number, number, number, number] = [x0 / SS, Math.min(Math.max(fittedTop, y0 / SS), (y1 + 1) / SS - 1), (x1 + 1) / SS, (y1 + 1) / SS];
    const scaled = (width: number, height: number): string => {
      const out = document.createElement('canvas');
      out.width = width; out.height = height;
      const c = out.getContext('2d')!;
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.drawImage(big, 0, 0, width, height);
      // keep fully transparent pixels at alpha 1 black (libwebp's transparent-area cleanup otherwise greys them)
      const data = c.getImageData(0, 0, width, height);
      for (let i = 3; i < data.data.length; i += 4) if (data.data[i] === 0) data.data[i] = 1;
      c.putImageData(data, 0, 0);
      return out.toDataURL('image/webp', 0.9);
    };
    void view;
    return { full: scaled(frame.width, frame.height), half: scaled(frame.width / 2, frame.height / 2), box, body };
  } finally {
    coverTarget.dispose(); normalTarget.depthTexture?.dispose(); normalTarget.dispose(); outTarget.dispose();
  }
}

// ------------------------------------------------------------------------------------------------ the overlays

const idMaterials = new Map<number, THREE.ShaderMaterial>();
function idMaterial(id: number): THREE.ShaderMaterial {
  let material = idMaterials.get(id);
  if (!material) {
    const color = new THREE.Vector3((id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255);
    material = new THREE.ShaderMaterial({
      uniforms: { idColor: { value: color } },
      vertexShader: '#include <common>\n#include <morphtarget_pars_vertex>\nvoid main(){\n#include <begin_vertex>\n#include <project_vertex>\n}',
      fragmentShader: 'uniform vec3 idColor; void main(){ gl_FragColor = vec4(idColor, 1.); }',
      side: THREE.DoubleSide, toneMapped: false,
    });
    idMaterials.set(id, material);
  }
  return material;
}

export interface DrawingElement {
  key: string; tone: string | null; d: string; at: [number, number] | null; area: number;
  keMm?: number; ceMm?: number; kind?: string; plate?: string; module?: string; crew?: string; title?: string;
}

const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const words = (value: string): string => value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).trim();
const pad2 = (n: number): string => String(n).padStart(2, '0');
/** A tone with a token, else the fallback (technicalToneHex throws for a tone without one). */
function toneOr(tone: string, fallback: string): string {
  try { technicalToneHex(tone); return tone; } catch { return fallback; }
}

/** An element's identity, tone and values: the Gallery's readout key (anatomyView.ts anatomyReadout) and the diagrams'
 * tones (the KE bands, ERA, spaced and external for armour; each module's and crew role's own). */
function elementOf(pick: AnatomyPick): Omit<DrawingElement, 'd' | 'at' | 'area'> | null {
  if (pick.kind === 'armor') {
    const { plate, frame, layer } = pick.surface;
    const ke = plateMetricMm(plate, 'ke'), ce = plateMetricMm(plate, 'ce');
    const tone = layer === 'era' ? 'armor-era' : layer === 'spaced' ? 'armor-spaced' : layer === 'external' || layer === 'housing' ? 'armor-external'
      : `armor-ke-${ke >= 650 ? 4 : ke >= 350 ? 3 : ke >= 180 ? 2 : ke >= 80 ? 1 : 0}`;
    return { key: `${frame[0]!.toUpperCase()}${pad2(pick.index + 1)}`, tone, keMm: Math.round(ke), ceMm: Math.round(ce), kind: layer,
      ...(plate.name ? { plate: String(plate.name), title: words(String(plate.name)) } : {}) };
  }
  if (pick.kind === 'module') {
    const { part } = pick;
    return { key: `M${pad2(part.index + 1)}${part.parts > 1 ? `.${part.part + 1}` : ''}`, tone: toneOr(`module-${kebab(part.module)}`, 'module-radio'), module: part.module };
  }
  if (pick.kind === 'crew') {
    const { station } = pick;
    return { key: `C${station.index + 1}`, tone: toneOr(`crew-${kebab(station.crew)}`, 'crew-other'), crew: station.crew };
  }
  return null;
}

/** One kind's elements in one view: the Gallery's anatomy for the vehicle as posed, each surface, part or station in its
 * ID colour (nothing else drawn: what the plate shows is not an occluder), the ID buffer traced. */
function traceKind(spec: { readonly armor?: unknown; readonly era?: unknown; readonly gun?: { readonly caliberMm?: number; readonly shells?: readonly { readonly caliberMm?: number }[] } },
  visual: { root: THREE.Object3D }, kind: Kind, frame: Frame): DrawingElement[] {
  const anatomy = buildAnatomyScene(spec.armor as AnatomyArmor, {
    caliberMm: Number(spec.gun?.shells?.[0]?.caliberMm || spec.gun?.caliberMm || 0),
    modern: isPostwarVehicleEra(spec.era as Parameters<typeof isPostwarVehicleEra>[0]),
  });
  const w = frame.width * SS, h = frame.height * SS;
  const target = new THREE.WebGLRenderTarget(w, h);
  const idScene = new THREE.Scene();
  const owned: { dispose(): void }[] = [];
  try {
    visual.root.updateMatrixWorld(true);
    const root = anatomy.frames.root;
    root.matrixAutoUpdate = false;
    root.matrix.copy(visual.root.matrixWorld);
    anatomy.syncPose(visual.root.getObjectByName('rig_turret')?.rotation.y || 0, -(visual.root.getObjectByName('rig_gun')?.rotation.x || 0));
    anatomy.setToggles({ armor: false, addOns: false, hits: false, modules: kind === 'modules', crew: kind === 'crew' });
    anatomy.groups.barrel.visible = false;
    const picks: AnatomyPick[] = [];
    const idOf = new Map<AnatomyPick, number>();
    const take = (pick: AnatomyPick): number => {
      let id = idOf.get(pick);
      if (id === undefined) { picks.push(pick); id = picks.length; idOf.set(pick, id); }
      return id;
    };
    if (kind === 'armor') {
      // every surface its own mesh in its frame, one-sided as the sim strikes it
      const frames = { hull: anatomy.frames.hull, turret: anatomy.frames.turret, gun: anatomy.frames.gun };
      anatomy.surfaces.forEach((surface, index) => {
        if (surface.positions.length < 9) return;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3));
        owned.push(geometry);
        const material = idMaterial(take({ kind: 'armor', surface, index })).clone();
        material.side = THREE.FrontSide;
        owned.push(material);
        frames[surface.frame].add(new THREE.Mesh(geometry, material));
      });
    } else {
      root.traverse((object) => {
        const mesh = object as THREE.Mesh, pick = mesh.userData?.anatomyPick as AnatomyPick | undefined;
        if (!mesh.isMesh) return;
        if (!pick || pick.kind !== (kind === 'modules' ? 'module' : 'crew')) { mesh.visible = false; return; }
        mesh.material = idMaterial(take(pick));
      });
    }
    idScene.add(root);
    root.updateMatrixWorld(true);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(idScene, frame.camera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 0);
    idScene.remove(root);
    const pixels = readTarget(target, w, h);
    const ids = new Uint32Array(w * h);
    for (let y = 0; y < h; y++) {
      const from = (h - 1 - y) * w;
      for (let x = 0; x < w; x++) {
        const i = (from + x) * 4;
        ids[y * w + x] = pixels[i]! | (pixels[i + 1]! << 8) | (pixels[i + 2]! << 16);
      }
    }
    const elements: DrawingElement[] = [];
    for (const [id, loops] of traceIdBuffer(ids, w, h)) {
      const pick = picks[id - 1], meta = pick ? elementOf(pick) : null;
      if (!meta) continue;
      const clean = cleanLoops(loops, TRACE_TOLERANCE, TRACE_MIN_AREA);
      if (!clean.length) continue;
      const area = clean.reduce((sum: number, points: number[]) => {
        let twice = 0;
        for (let i = 0, n = points.length; i < n; i += 2) { const j = (i + 2) % n; twice += points[i]! * points[j + 1]! - points[j]! * points[i + 1]!; }
        return sum + twice / 2;
      }, 0) / (SS * SS);
      const at = labelPoint(clean);
      elements.push({ ...meta, d: loopsToPath(clean, 1 / SS, 1),
        at: at ? [Number((at[0] / SS).toFixed(1)), Number((at[1] / SS).toFixed(1))] : null, area: Math.round(area) });
    }
    elements.sort((a, b) => b.area - a.area);
    return elements;
  } finally {
    target.dispose();
    for (const resource of owned) resource.dispose();
    anatomy.dispose();
  }
}

// ------------------------------------------------------------------------------------------------ one tank

export interface DrawingView {
  size: [number, number]; pxPerM: number;
  /** The plate's measured extent and its body's (frame px); genDrawings adds the published files' hashes. */
  plate: { box: [number, number, number, number]; body: [number, number, number, number] };
  layers: Record<Kind, DrawingElement[]>;
}

async function drawTank(id: string, views: readonly View[] = ['side', 'top', 'front']) {
  const spec = getSpec(id);
  const visual = createTank(id, null, { camoSeed: 4100, quality: 'high' });
  const root = visual.root;
  root.updateMatrixWorld(true);
  const meshes = visibleMeshes(root);
  const box = meshBounds(meshes);
  // every other mesh (the nets, decals and shadow proxies visibleMeshes leaves out) stays hidden while the plates draw
  const kept = new Set<THREE.Object3D>(meshes), parked: THREE.Object3D[] = [];
  root.traverse((object) => { if ((object as THREE.Mesh).isMesh && object.visible && !kept.has(object)) { object.visible = false; parked.push(object); } });
  const files: Record<string, string> = {};
  const data: { schema: 2; id: string; views: Partial<Record<View, DrawingView>> } = { schema: 2, id, views: {} };
  try {
    for (const view of views) {
      const bounds = frameView(view, box), drawn = measureDrawn(root, meshes, bounds, VIEWS[view].up[1] === 1);
      const frame = drawn ? frameFrom(view, drawn.across, drawn.along, box) : bounds;
      const plate = renderPlate(root, meshes, frame, view, drawn ? drawn.along[1] : frame.target.dot(frame.camera.up) + frame.camera.top);
      files[`${id}_drawing_${view}.webp`] = plate.full;
      files[`${id}_drawing_${view}_1x.webp`] = plate.half;
      const layers = {} as Record<Kind, DrawingElement[]>;
      for (const kind of ['armor', 'modules', 'crew'] as const) layers[kind] = traceKind(spec, visual, kind, frame);
      data.views[view] = { size: [frame.width, frame.height], pxPerM: Number(frame.pxPerM.toFixed(3)), plate: { box: plate.box, body: plate.body }, layers };
    }
  } finally {
    for (const object of parked) object.visible = true;
    visual.dispose?.();
  }
  return { files, data };
}

(window as unknown as { __drawTank: typeof drawTank; __drawingReady: boolean }).__drawTank = drawTank;
(window as unknown as { __drawingReady: boolean }).__drawingReady = true;
