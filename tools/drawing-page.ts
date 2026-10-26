// The technical drawings' studio (258; the owner, 2026-10-26: "make all technical drawings much better and much higher
// quality and update that whole system"). For one tank and each view (side, top, front) it renders:
//   - the plate: the shipped model as a technical drawing on a transparent ground, graphite body with soft form shading,
//     light ink lines where depth or surface direction breaks (silhouette, panel and part edges), fine hatching in the
//     shade; supersampled 2x, at the view's frame size (the 2x asset) and half of it (the 1x asset); no text;
//   - the overlay data: each armour plate (the combat collision shell's exact faces and the detail plates), module and
//     crew seat drawn in its own flat ID colour with depth testing, the ID buffer traced into polygons
//     (tools/technicalDrawingTrace.ts), each with its key, tone, values and label point, in the frame's pixels.
// The vehicle fills the frame to DRAWING_FILL of its width (less where its height binds); the scale (px per metre) is
// recorded for the viewer's scale bar. Driven by tools/genDrawings.mjs through window.__drawTank(id, views).
// First-party: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { getSpec } from '../src/vehicles/specs.ts';
import { createInspectionOverlay } from '../src/gallery/overlays.ts';
import { technicalToneOf } from '../src/ui/technicalDiagramLegend.ts';
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

/** The view's camera: orthographic, the vehicle's bounds centred and filling DRAWING_FILL of the width (or
 * DRAWING_FILL_HEIGHT of the height, whichever binds). `upMax` caps the bounds along the frame's up (the body's top: the
 * masts and whips above it run off the frame's top edge). */
function frameView(view: View, box: THREE.Box3, upMax = Infinity): Frame {
  const { size: [width, height], from, up } = VIEWS[view];
  const dir = new THREE.Vector3(...from), upV = new THREE.Vector3(...up);
  const right = new THREE.Vector3().crossVectors(dir.clone().negate(), upV).normalize();
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const across = corners.map((c) => c.dot(right)), along = corners.map((c) => Math.min(c.dot(upV), upMax));
  const spanX = Math.max(...across) - Math.min(...across), spanY = Math.max(...along) - Math.min(...along);
  const pxPerM = Math.min(DRAWING_FILL * width / spanX, DRAWING_FILL_HEIGHT * height / spanY);
  const center = box.getCenter(new THREE.Vector3());
  const midX = (Math.max(...across) + Math.min(...across)) / 2, midY = (Math.max(...along) + Math.min(...along)) / 2;
  const target = center.clone().addScaledVector(right, midX - center.dot(right)).addScaledVector(upV, midY - center.dot(upV));
  const halfW = width / 2 / pxPerM, halfH = height / 2 / pxPerM, depth = box.getSize(new THREE.Vector3()).length() * 2 + 10;
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.05, depth * 2);
  camera.position.copy(target).addScaledVector(dir, depth);
  camera.up.copy(upV);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return { camera, pxPerM, width, height, target };
}

/** A row of the silhouette at least this wide (m) is the body; thinner rows above it are masts and whip antennas. */
const BODY_ROW_M = 0.3;
const coverageMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

/** The body's top along the frame's up (m, the up axis's coordinate): the highest row of a quarter-size coverage pass
 * at least BODY_ROW_M wide. Whips and masts are merged into their material buckets, so no mesh name can leave them out. */
function bodyTop(root: THREE.Object3D, meshes: readonly THREE.Mesh[], frame: Frame): number {
  const w = Math.round(frame.width / 4), h = Math.round(frame.height / 4), pxPerM = frame.pxPerM / 4;
  const target = new THREE.WebGLRenderTarget(w, h);
  const scene = new THREE.Scene();
  try {
    scene.add(root);
    withMaterial(meshes, coverageMaterial, () => { renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, frame.camera); });
    scene.remove(root);
    renderer.setRenderTarget(null);
    const pixels = readTarget(target, w, h);
    for (let row = h - 1; row >= 0; row--) {
      let covered = 0;
      for (let x = 0; x < w; x++) if (pixels[(row * w + x) * 4 + 3]! > 0) covered++;
      if (covered / pxPerM >= BODY_ROW_M) return frame.target.dot(frame.camera.up) + frame.camera.bottom + (row + 1) / h * (frame.camera.top - frame.camera.bottom);
    }
    return Infinity;
  } finally { target.dispose(); }
}

// ------------------------------------------------------------------------------------------------ the plate

const quadScene = new THREE.Scene();
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quadScene.add(quad);

/** The plate's composite: graphite form shading from the view-space normals (a key from the upper left toward the viewer,
 * a sky fill from above) darkened by a cavity term (a neighbour nearer the camera by 1.5 to 120 cm within 5 or 11 px
 * occludes: the wheels behind the skirts, the recesses between plates), ink where depth or normal breaks, hatching in
 * the shade. */
const plateComposite = new THREE.ShaderMaterial({
  uniforms: {
    tShade: { value: null }, tNormal: { value: null }, tDepth: { value: null },
    texel: { value: new THREE.Vector2() }, near: { value: 0.05 }, far: { value: 100 }, ss: { value: SS },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    uniform sampler2D tShade; uniform sampler2D tNormal; uniform sampler2D tDepth;
    uniform vec2 texel; uniform float near; uniform float far; uniform float ss;
    varying vec2 vUv;
    float metresAt(vec2 uv){ return texture2D(tDepth, uv).x * (far - near); }
    vec3 normalAt(vec2 uv){ return normalize(texture2D(tNormal, uv).xyz * 2. - 1.); }
    float coverAt(vec2 uv){ return texture2D(tShade, uv).a; }
    void main(){
      vec4 shade = texture2D(tShade, vUv);
      // silhouette: coverage breaks within two texels (a heavier line), part edges: depth or normal breaks
      float silhouette = 0.;
      for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) {
        if (i * i + j * j > 5) continue;
        float c = coverAt(vUv + vec2(float(i), float(j)) * texel);
        silhouette = max(silhouette, abs(c - shade.a));
      }
      float m0 = metresAt(vUv);
      vec3 n0 = normalAt(vUv);
      float crease = 0.;
      for (int k = 0; k < 4; k++) {
        vec2 o = k == 0 ? vec2(texel.x, 0.) : k == 1 ? vec2(-texel.x, 0.) : k == 2 ? vec2(0., texel.y) : vec2(0., -texel.y);
        if (coverAt(vUv + o) < .5) continue;
        crease = max(crease, smoothstep(.04, .14, abs(metresAt(vUv + o) - m0)));
        crease = max(crease, smoothstep(.10, .28, 1. - dot(normalAt(vUv + o), n0)));
      }
      float occ = 0.;
      for (int k = 0; k < 12; k++) {
        float a = float(k) * .5236;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * texel * ss * (k - (k / 2) * 2 == 0 ? 5. : 11.);
        if (coverAt(uv) < .5) continue;
        float nearer = m0 - metresAt(uv);
        occ += smoothstep(.015, .12, nearer) * (1. - smoothstep(.6, 1.2, nearer));
      }
      float cavity = occ / 12.;
      vec3 light = normalize(vec3(-.5, .65, .58));
      float key = smoothstep(-.35, 1., dot(n0, light));
      float lum = (.10 + .64 * key + .16 * (.5 + .5 * n0.y)) * (1. - .62 * cavity) * mix(.84, 1.06, vUv.y);
      // fine 45 deg hatching where the form turns from the light or sits in a recess
      float hatch = step(fract((gl_FragCoord.x + gl_FragCoord.y) / (4. * ss)), .22) * (1. - smoothstep(.16, .30, lum));
      vec3 body = mix(vec3(.07, .085, .10), vec3(.43, .48, .52), smoothstep(.0, .9, lum));
      body = mix(body, vec3(.05, .06, .075), hatch * .5);
      // part edges engraved dark into the body, the silhouette drawn light round it
      vec3 rgb = mix(body, vec3(.035, .045, .06), crease * .7);
      rgb = mix(rgb, vec3(.80, .85, .89), silhouette * .95);
      float alpha = max(shade.a, silhouette * .95);
      gl_FragColor = vec4(rgb * alpha, alpha);
    }`,
  depthTest: false, depthWrite: false, premultipliedAlpha: true, transparent: true,
});

const shadeScene = new THREE.Scene();
shadeScene.add(new THREE.HemisphereLight(0xffffff, 0x3a4048, 1.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
shadeScene.add(keyLight, keyLight.target);
const shadeMaterial = new THREE.MeshLambertMaterial({ color: 0xb8bfc5, side: THREE.DoubleSide });
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
function renderPlate(root: THREE.Object3D, meshes: readonly THREE.Mesh[], frame: Frame, view: View): { full: string; half: string; box: [number, number, number, number]; body: [number, number, number, number] } {
  const w = frame.width * SS, h = frame.height * SS;
  const shadeTarget = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
  const normalTarget = new THREE.WebGLRenderTarget(w, h, { depthTexture: new THREE.DepthTexture(w, h) });
  const outTarget = new THREE.WebGLRenderTarget(w, h);
  try {
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    // the key light comes from the upper front-left of the viewer, the same for every view
    const cam = frame.camera, right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion), toward = new THREE.Vector3(0, 0, 1).applyQuaternion(cam.quaternion);
    keyLight.position.copy(cam.position).addScaledVector(right, -0.45 * 40).addScaledVector(camUp, 0.8 * 40).addScaledVector(toward, 40);
    keyLight.target.position.copy(cam.position).addScaledVector(toward, -40);
    keyLight.target.updateMatrixWorld();
    shadeScene.add(root);
    withMaterial(meshes, shadeMaterial, () => { renderer.setRenderTarget(shadeTarget); renderer.clear(); renderer.render(shadeScene, cam); });
    withMaterial(meshes, normalMaterial, () => { renderer.setRenderTarget(normalTarget); renderer.clear(); renderer.render(shadeScene, cam); });
    shadeScene.remove(root);
    plateComposite.uniforms.tShade!.value = shadeTarget.texture;
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
    // the drawing's extent in the frame's pixels (every texel with alpha over 8) and the body's (from the first row at
    // least BODY_ROW_M wide: the frame is fitted to it, the whips above it may run off the top)
    let x0 = w, y0 = h, x1 = -1, y1 = -1, bodyY0 = -1;
    for (let y = 0; y < h; y++) {
      let covered = 0;
      for (let x = 0; x < w; x++) {
        if (image.data[(y * w + x) * 4 + 3]! <= 8) continue;
        covered++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (bodyY0 < 0 && covered >= BODY_ROW_M * frame.pxPerM * SS) bodyY0 = y;
    }
    const box: [number, number, number, number] = [x0 / SS, y0 / SS, (x1 + 1) / SS, (y1 + 1) / SS];
    const body: [number, number, number, number] = [x0 / SS, Math.max(bodyY0, y0) / SS, (x1 + 1) / SS, (y1 + 1) / SS];
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
    shadeTarget.dispose(); normalTarget.depthTexture?.dispose(); normalTarget.dispose(); outTarget.dispose();
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

function pickerMeta(picker: THREE.Mesh): Omit<DrawingElement, 'd' | 'at' | 'area' | 'tone'> {
  const inspection = (picker.userData.inspection || {}) as Record<string, unknown>;
  const meta: Omit<DrawingElement, 'd' | 'at' | 'area' | 'tone'> = { key: String(inspection.id || '') };
  if (inspection.mode === 'armor') {
    meta.keMm = Math.round(Number(inspection.keMm || 0));
    meta.ceMm = Math.round(Number(inspection.ceMm || 0));
    meta.kind = String(inspection.kind || 'main');
    if (inspection.plateName) meta.plate = String(inspection.plateName);
  } else if (inspection.mode === 'modules') meta.module = String(inspection.module || '');
  else meta.crew = String(inspection.crew || '');
  if (inspection.title) meta.title = String(inspection.title);
  return meta;
}

function pickerTone(picker: THREE.Mesh): string | null {
  const visual = (picker.userData.inspectionVisual || picker) as THREE.Object3D;
  let color: string | null = null;
  visual.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (color || !(mesh.isMesh || (object as THREE.LineSegments).isLineSegments)) return;
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as (THREE.Material & { color?: THREE.Color })[];
    const material = materials.find((m) => m?.color && (m.userData?.galleryAnatomyLine || m.userData?.galleryAnatomyFill || m.colorWrite !== false));
    if (material?.color) color = `#${material.color.getHexString()}`;
  });
  return color ? technicalToneOf(color) : null;
}

/** One kind's elements in one view: each picker's visible surfaces traced from the ID buffer. */
function traceKind(spec: unknown, visual: { root: THREE.Object3D }, kind: Kind, frame: Frame): DrawingElement[] {
  const overlay = createInspectionOverlay(spec as never, visual as never, kind);
  const w = frame.width * SS, h = frame.height * SS;
  const target = new THREE.WebGLRenderTarget(w, h);
  const idScene = new THREE.Scene();
  const parked: { object: THREE.Object3D; visible: boolean }[] = [];
  try {
    visual.root.updateMatrixWorld(true);
    // every mesh of the tank hidden but the pickers' own surfaces, each in its ID colour
    const drawn = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const owners: THREE.Mesh[] = [];
    overlay.pickables.forEach((picker: THREE.Mesh, index: number) => {
      const surface = (picker.userData.inspectionVisual || picker) as THREE.Object3D;
      const id = index + 1;
      owners[id] = picker;
      surface.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || mesh === picker && surface !== picker) return;
        if (!drawn.has(mesh)) drawn.set(mesh, mesh.material);
        mesh.material = idMaterial(id);
      });
    });
    visual.root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh || (object as THREE.LineSegments).isLineSegments || (object as THREE.Points).isPoints) {
        if (!drawn.has(object as THREE.Mesh)) { parked.push({ object, visible: object.visible }); object.visible = false; }
      }
    });
    // a picker's own box (the modules' and crew's) stays out: its visual model is what is drawn
    for (const picker of overlay.pickables) if (picker.userData.inspectionVisual && picker.userData.inspectionVisual !== picker) {
      parked.push({ object: picker, visible: picker.visible }); picker.visible = false;
    }
    idScene.add(visual.root);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(idScene, frame.camera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 0);
    idScene.remove(visual.root);
    for (const [mesh, material] of drawn) mesh.material = material;
    const pixels = readTarget(target, w, h);
    const ids = new Uint32Array(w * h);
    for (let y = 0; y < h; y++) {
      const from = (h - 1 - y) * w;
      for (let x = 0; x < w; x++) {
        const i = (from + x) * 4;
        ids[y * w + x] = pixels[i]! | (pixels[i + 1]! << 8) | (pixels[i + 2]! << 16);
      }
    }
    const traced = traceIdBuffer(ids, w, h);
    const elements: DrawingElement[] = [];
    for (const [id, loops] of traced) {
      const picker = owners[id];
      if (!picker) continue;
      const clean = cleanLoops(loops, TRACE_TOLERANCE, TRACE_MIN_AREA);
      if (!clean.length) continue;
      const area = clean.reduce((sum: number, points: number[]) => {
        let twice = 0;
        for (let i = 0, n = points.length; i < n; i += 2) { const j = (i + 2) % n; twice += points[i]! * points[j + 1]! - points[j]! * points[i + 1]!; }
        return sum + twice / 2;
      }, 0) / (SS * SS);
      const at = labelPoint(clean);
      elements.push({
        ...pickerMeta(picker), tone: pickerTone(picker), d: loopsToPath(clean, 1 / SS, 1),
        at: at ? [Number((at[0] / SS).toFixed(1)), Number((at[1] / SS).toFixed(1))] : null, area: Math.round(area),
      });
    }
    elements.sort((a, b) => b.area - a.area);
    return elements;
  } finally {
    for (const { object, visible } of parked) object.visible = visible;
    target.dispose();
    overlay.clear();
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
      let frame = frameView(view, box);
      if (VIEWS[view].up[1] === 1) frame = frameView(view, box, bodyTop(root, meshes, frame));
      const plate = renderPlate(root, meshes, frame, view);
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
