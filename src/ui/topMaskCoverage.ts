/**
 * topMaskCoverage.ts — coverage-only materials for the damage panel's top-down mask passes (2026-10-12, the MP lane).
 *
 * The mask passes read ALPHA coverage alone (tankThumbs.ts maskCanvasFromPixels: alpha > 8 is the vehicle). They used to
 * render the tank's real materials in a light-less scene, so every entry compiled and linked about 38 physical+CSM
 * program variants of its own (two passes x the tank's ~19 materials) that no battle frame ever uses. On the loaded
 * multiplayer harness those links took ~15 s (about 0.4 s each), the 5 s mask wait always expired, and they sat at the
 * head of the GPU link queue ahead of the battle's own programs (diag runs 2026-10-12, panel 5.05 s on every entry).
 *
 * A mask pass now draws each mesh with a coverage stand-in that keeps every input that decides its alpha and depth:
 * - an opaque material (not transparent, NormalBlending, no alpha-to-coverage, alphaTest 0, no clipping) writes alpha 1
 *   on every fragment (three's OPAQUE define), so its stand-in is one shared untextured MeshBasicMaterial per side,
 *   visibility, colour-write and depth state;
 * - an alpha-relevant material (transparent, alphaTest, alphaHash, alpha-to-coverage, custom blending, clipping planes)
 *   gets its own stand-in carrying side, opacity, alphaTest, alphaHash, map and alphaMap (their alpha), vertex colours
 *   (their alpha), blending, depth and clipping state, refreshed from the source on every pass;
 * - colorWrite:false meshes keep writing depth and no colour, exactly as before (a depth-only occluder still occludes).
 * A material whose coverage a stand-in cannot reproduce keeps its real material: anything that is not a built-in mesh
 * material (ShaderMaterial, line, point and sprite materials), vertex displacement, transmission, and stencil writes.
 * Programs are shared by three's cache key, so a tank's two passes need a few basic programs instead of ~38 physical
 * ones, and later tanks reuse them.
 */
import * as THREE from 'three';

type CoverageSource = THREE.MeshBasicMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial
  | THREE.MeshStandardMaterial | THREE.MeshToonMaterial | THREE.MeshMatcapMaterial | THREE.MeshNormalMaterial;

type MaskRenderable = THREE.Object3D & { isMesh?: boolean; material?: THREE.Material | THREE.Material[] };

const sharedOpaque = new Map<string, THREE.MeshBasicMaterial>();
const perSource = new WeakMap<THREE.Material, THREE.MeshBasicMaterial>();

function isCoverageSource(material: THREE.Material): material is CoverageSource {
  return material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshLambertMaterial
    || material instanceof THREE.MeshPhongMaterial || material instanceof THREE.MeshStandardMaterial
    || material instanceof THREE.MeshToonMaterial || material instanceof THREE.MeshMatcapMaterial
    || material instanceof THREE.MeshNormalMaterial;
}

/** Coverage a stand-in cannot reproduce: the real material stays. */
function keepsSourceMaterial(material: THREE.Material): boolean {
  if (!isCoverageSource(material)) return true;
  const surface = material as THREE.Material & {
    displacementMap?: THREE.Texture | null; transmission?: number;
  };
  return !!surface.displacementMap || (surface.transmission ?? 0) > 0 || material.stencilWrite;
}

function alphaRelevant(material: THREE.Material): boolean {
  return material.transparent || material.alphaTest > 0 || material.alphaHash || material.alphaToCoverage
    || material.blending !== THREE.NormalBlending || !!material.clippingPlanes?.length;
}

function copyRasterState(target: THREE.MeshBasicMaterial, source: THREE.Material): void {
  target.side = source.side;
  target.visible = source.visible;
  target.colorWrite = source.colorWrite;
  target.depthWrite = source.depthWrite;
  target.depthTest = source.depthTest;
  target.depthFunc = source.depthFunc;
  target.polygonOffset = source.polygonOffset;
  target.polygonOffsetFactor = source.polygonOffsetFactor;
  target.polygonOffsetUnits = source.polygonOffsetUnits;
  target.forceSinglePass = source.forceSinglePass;
  target.wireframe = (source as THREE.Material & { wireframe?: boolean }).wireframe === true;
}

function sharedOpaqueStandIn(source: THREE.Material): THREE.MeshBasicMaterial {
  const wireframe = (source as THREE.Material & { wireframe?: boolean }).wireframe === true;
  const key = [source.side, source.visible, source.colorWrite, source.depthWrite, source.depthTest, source.depthFunc,
    source.polygonOffset, source.polygonOffsetFactor, source.polygonOffsetUnits, source.forceSinglePass, wireframe].join('|');
  let standIn = sharedOpaque.get(key);
  if (!standIn) {
    standIn = new THREE.MeshBasicMaterial({ color: 0x000000 });
    standIn.name = 'cot:top-mask-coverage';
    copyRasterState(standIn, source);
    sharedOpaque.set(key, standIn);
  }
  return standIn;
}

function alphaStandIn(source: CoverageSource): THREE.MeshBasicMaterial {
  let standIn = perSource.get(source);
  if (!standIn) {
    const created = new THREE.MeshBasicMaterial({ color: 0x000000 });
    created.name = 'cot:top-mask-coverage-alpha';
    perSource.set(source, created);
    source.addEventListener('dispose', () => { perSource.delete(source); created.dispose(); });
    standIn = created;
  }
  copyRasterState(standIn, source);
  const textured = source as CoverageSource & { map?: THREE.Texture | null; alphaMap?: THREE.Texture | null };
  standIn.transparent = source.transparent;
  standIn.opacity = source.opacity;
  standIn.alphaTest = source.alphaTest;
  standIn.alphaHash = source.alphaHash;
  standIn.alphaToCoverage = source.alphaToCoverage;
  standIn.premultipliedAlpha = source.premultipliedAlpha;
  standIn.blending = source.blending;
  standIn.blendSrc = source.blendSrc;
  standIn.blendDst = source.blendDst;
  standIn.blendEquation = source.blendEquation;
  standIn.blendSrcAlpha = source.blendSrcAlpha;
  standIn.blendDstAlpha = source.blendDstAlpha;
  standIn.blendEquationAlpha = source.blendEquationAlpha;
  standIn.blendColor.copy(source.blendColor);
  standIn.blendAlpha = source.blendAlpha;
  standIn.vertexColors = source.vertexColors;
  standIn.clippingPlanes = source.clippingPlanes;
  standIn.clipIntersection = source.clipIntersection;
  if (standIn.map !== (textured.map ?? null) || standIn.alphaMap !== (textured.alphaMap ?? null)) {
    standIn.map = textured.map ?? null;
    standIn.alphaMap = textured.alphaMap ?? null;
    standIn.needsUpdate = true;
  }
  return standIn;
}

/** The coverage stand-in for one source material, or the source itself when a stand-in cannot match its coverage. */
export function topMaskCoverageMaterial(source: THREE.Material): THREE.Material {
  if (keepsSourceMaterial(source)) return source;
  return alphaRelevant(source) ? alphaStandIn(source as CoverageSource) : sharedOpaqueStandIn(source);
}

/**
 * Swap every mesh under `root` onto its coverage stand-in for the duration of the mask passes. The returned function
 * puts each original material (or material array) back; call it before the hierarchy is disposed or reused.
 */
export function applyTopMaskCoverage(root: THREE.Object3D): () => void {
  const swapped: [MaskRenderable, THREE.Material | THREE.Material[]][] = [];
  const restore = (): void => {
    for (let index = swapped.length - 1; index >= 0; index--) swapped[index][0].material = swapped[index][1];
    swapped.length = 0;
  };
  try {
    root.traverse((object) => {
      const mesh = object as MaskRenderable;
      if (mesh.isMesh !== true || !mesh.material) return;
      const original = mesh.material;
      const next = Array.isArray(original) ? original.map(topMaskCoverageMaterial) : topMaskCoverageMaterial(original);
      if (Array.isArray(original) ? (next as THREE.Material[]).every((material, index) => material === original[index])
        : next === original) return;
      swapped.push([mesh, original]);
      mesh.material = next;
    });
  } catch (error) {
    restore();
    throw error;
  }
  return restore;
}
