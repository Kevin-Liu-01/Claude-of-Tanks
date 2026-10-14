// src/world/hinterland/mesh.ts — the Hinterland's one continuous land mesh (HL-3, the horizons stream, 2026-10-13;
// B-architecture §4.2): CDLOD over the height pyramid, direction-exact depth compression and the earth's curvature.
//
// One instanced draw: a 16 × 16 grid patch per quadtree node (lod.ts selects them each frame from the camera that is
// drawing, through onBeforeRender, so the scope refines its own cone), each vertex reading its height from the pyramid
// (the levels packed into one float texture; the finest level that holds the vertex, bilinear by texelFetch), morphing
// to the coarser grid as it nears its node's range (no cracks, no pops), its normal from the same heights, then moved
// down by the earth's drop and drawn at its compressed distance along its exact direction (project.ts). The battlefield
// square is the tree's hole; a node that overlaps the edge drops its fragments inside 511 m, so the hinterland meets the
// battlefield's own edge vertices (its heights there are the battlefield's: field.ts term 1) with a metre under it.
//
// The material is three's MeshStandardMaterial patched in onBeforeCompile, so the scene's light model, its cascades
// (engineCtx.setupShadowMaterial: the lit-material cascade rule), the sky light and the fog all apply as on the
// battlefield; the land's own colour comes from the surface hook (material.ts: the land material; a flat debug
// albedo by slope and height here). The post pass hazes by the depth it reads — the compressed one — so the fragment
// adds the extinction of the distance the compression took away (the true distance less the drawn one).
import * as THREE from 'three';
import { HINTERLAND_PROJECT_GLSL } from './project.ts';
import { HINTERLAND_LOD_DESKTOP, HINTERLAND_PATCH_QUADS, selectHinterlandNodes, type HinterlandLodOptions } from './lod.ts';
import type { HinterlandLevel, HinterlandPyramid } from './pyramid.ts';

/** The pyramid's levels packed into one float texture: each level a block, its origin in texels. */
export interface HinterlandHeightAtlas {
  texture: THREE.DataTexture;
  /** Per level: [x0, y0 of its block (texels), n (samples a side), texelM], and its half-extent (m). */
  blocks: { x0: number; y0: number; n: number; texelM: number; halfM: number }[];
  width: number; height: number;
}

/** Pack the levels: the finest first in a row, the rest shelved below it. */
export function packHinterlandHeights(levels: readonly HinterlandLevel[]): HinterlandHeightAtlas {
  const blocks: HinterlandHeightAtlas['blocks'] = [];
  let x = 0, y = 0, shelf = 0, width = 0;
  const rowWidth = levels.length ? levels[0].n + (levels[1]?.n ?? 0) : 1;
  for (const level of levels) {
    if (x > 0 && x + level.n > rowWidth) { x = 0; y += shelf; shelf = 0; }
    blocks.push({ x0: x, y0: y, n: level.n, texelM: level.texelM, halfM: level.halfM });
    x += level.n; shelf = Math.max(shelf, level.n); width = Math.max(width, x);
  }
  const height = y + shelf;
  const data = new Float32Array(width * height);
  levels.forEach((level, i) => {
    const b = blocks[i];
    for (let j = 0; j < level.n; j++) data.set(level.heights.subarray(j * level.n, (j + 1) * level.n), (b.y0 + j) * width + b.x0);
  });
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter; texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false; texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return { texture, blocks, width, height };
}

/** GLSL: the pyramid's height at a world point (the finest level that holds it), from the packed atlas. */
export function hinterlandHeightGlsl(blockCount: number): string {
  return /* glsl */`
uniform sampler2D uHlHeights;
uniform vec4 uHlBlock[${blockCount}]; // x0, y0, n, texelM
uniform float uHlHalf[${blockCount}];
float hlLevelHeight( int i, vec2 p ) {
  vec4 b = uHlBlock[i];
  vec2 f = clamp( ( p + uHlHalf[i] ) / b.w, vec2( 0.0 ), vec2( b.z - 1.001 ) );
  ivec2 c = ivec2( floor( f ) );
  vec2 t = f - vec2( c );
  ivec2 o = ivec2( b.xy ) + c;
  float h00 = texelFetch( uHlHeights, o, 0 ).r, h10 = texelFetch( uHlHeights, o + ivec2( 1, 0 ), 0 ).r;
  float h01 = texelFetch( uHlHeights, o + ivec2( 0, 1 ), 0 ).r, h11 = texelFetch( uHlHeights, o + ivec2( 1, 1 ), 0 ).r;
  return mix( mix( h00, h10, t.x ), mix( h01, h11, t.x ), t.y );
}
float hlHeight( vec2 p ) {
  float a = max( abs( p.x ), abs( p.y ) );
  for ( int i = 0; i < ${blockCount - 1}; i++ ) {
    if ( a < uHlHalf[i] - 2.0 * uHlBlock[i].w ) return hlLevelHeight( i, p );
  }
  return hlLevelHeight( ${blockCount - 1}, p );
}
`;
}

export interface HinterlandMeshOptions {
  pyramid: HinterlandPyramid;
  lod?: HinterlandLodOptions;
  /** Register the material with the scene's light model (engineCtx.setupShadowMaterial); it chains `hook` after its own. */
  setupMaterial?: (material: THREE.MeshStandardMaterial, hook: (shader: THREE.WebGLProgramParametersWithUniforms) => void) => void;
  /** The haze the fragment adds for the distance the compression took away: σ (1/m) and its colour. */
  hazeSigma?: number;
  hazeColor?: THREE.Color;
  /** The land material's fragment patch (material.ts); absent: the debug albedo by slope and height. */
  surface?: { uniforms: Record<string, THREE.IUniform>; fragmentPars: string; albedo: string } | null;
}

export interface HinterlandMeshHandle {
  mesh: THREE.Mesh;
  /** The nodes the last frame drew. */
  readonly nodes: number;
  /** The last selection's CPU time (ms). */
  readonly selectMs: number;
  dispose(): void;
}

/** Build the land mesh over a pyramid. */
export function createHinterlandMesh(options: HinterlandMeshOptions): HinterlandMeshHandle {
  const lod = options.lod ?? HINTERLAND_LOD_DESKTOP;
  const atlas = packHinterlandHeights(options.pyramid.levels);
  const Q = HINTERLAND_PATCH_QUADS;
  // the patch: (Q + 1)² vertices on [0, 1]², u in x and v in z
  const grid = new THREE.InstancedBufferGeometry();
  const positions = new Float32Array((Q + 1) * (Q + 1) * 3);
  for (let j = 0; j <= Q; j++) for (let i = 0; i <= Q; i++) {
    const k = (j * (Q + 1) + i) * 3;
    positions[k] = i / Q; positions[k + 1] = 0; positions[k + 2] = j / Q;
  }
  const index: number[] = [];
  for (let j = 0; j < Q; j++) for (let i = 0; i < Q; i++) {
    const a = j * (Q + 1) + i, b = a + 1, c = a + Q + 1, d = c + 1;
    // (alternating diagonals so a patch's triangles do not all lean one way)
    if ((i + j) % 2 === 0) index.push(a, c, b, b, c, d); else index.push(a, c, d, a, d, b);
  }
  grid.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  grid.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(positions.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  grid.setIndex(index);
  const nodeData = new Float32Array(lod.maxNodes * 4);
  const nodeAttr = new THREE.InstancedBufferAttribute(nodeData, 4);
  nodeAttr.setUsage(THREE.DynamicDrawUsage);
  grid.setAttribute('aHlNode', nodeAttr);
  grid.instanceCount = 0;
  // (the patch's bounds never cull: the nodes cull themselves)
  grid.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);

  const uniforms: Record<string, THREE.IUniform> = {
    uHlHeights: { value: atlas.texture },
    uHlBlock: { value: atlas.blocks.map((b) => new THREE.Vector4(b.x0, b.y0, b.n, b.texelM)) },
    uHlHalf: { value: atlas.blocks.map((b) => b.halfM) },
    uHlCam: { value: new THREE.Vector3() },
    uHlHazeSigma: { value: options.hazeSigma ?? 0.00026 },
    uHlHazeColor: { value: options.hazeColor ?? new THREE.Color(0.62, 0.7, 0.8) },
    ...(options.surface?.uniforms ?? {}),
  };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0, fog: true });
  material.name = 'hinterland-land';
  const heightGlsl = hinterlandHeightGlsl(atlas.blocks.length);
  const surface = options.surface ?? null;
  const patch = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aHlNode;
uniform vec3 uHlCam;
varying vec3 vHlWorld;
varying float vHlTrueD;
${heightGlsl}
${HINTERLAND_PROJECT_GLSL}`)
      .replace('#include <beginnormal_vertex>', `
  // CDLOD: the patch vertex in its node, morphed toward the coarser grid near its range, at its pyramid height
  float hlSize = aHlNode.z;
  vec2 hlGrid = position.xz * ${Q.toFixed(1)};
  vec2 hlWp = aHlNode.xy + position.xz * hlSize;
  float hlD0 = length( vec3( hlWp.x - uHlCam.x, hlHeight( hlWp ) - uHlCam.y, hlWp.y - uHlCam.z ) );
  float hlMorph = clamp( ( hlD0 - 1.5 * aHlNode.w * hlSize ) / ( 0.5 * aHlNode.w * hlSize ), 0.0, 1.0 );
  hlWp -= fract( hlGrid * 0.5 ) * 2.0 / ${Q.toFixed(1)} * hlSize * hlMorph;
  float hlH = hlHeight( hlWp );
  float hlE = max( 1.0, hlSize / ${Q.toFixed(1)} );
  vec3 objectNormal = normalize( vec3( hlHeight( hlWp - vec2( hlE, 0.0 ) ) - hlHeight( hlWp + vec2( hlE, 0.0 ) ), 2.0 * hlE,
    hlHeight( hlWp - vec2( 0.0, hlE ) ) - hlHeight( hlWp + vec2( 0.0, hlE ) ) ) );
  vHlWorld = vec3( hlWp.x, hlH, hlWp.y );
  #ifdef USE_TANGENT
  vec3 objectTangent = vec3( 1.0, 0.0, 0.0 );
  #endif`)
      .replace('#include <begin_vertex>', `
  float hlTrueD;
  vec3 transformed = hinterlandProject( vHlWorld, uHlCam, hlTrueD );
  vHlTrueD = hlTrueD;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vHlWorld;
varying float vHlTrueD;
uniform float uHlHazeSigma;
uniform vec3 uHlHazeColor;
${HINTERLAND_PROJECT_GLSL}
${surface?.fragmentPars ?? ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  // the battlefield is the square's own: the land starts a metre under its edge
  if ( max( abs( vHlWorld.x ), abs( vHlWorld.z ) ) < 511.0 ) discard;
  ${surface ? surface.albedo : `{
    vec3 hlN = normalize( vNormal );
    float hlSlope = 1.0 - clamp( dot( normalize( cross( dFdx( vHlWorld ), dFdy( vHlWorld ) ) ), vec3( 0.0, 1.0, 0.0 ) ), 0.0, 1.0 );
    vec3 hlGrass = vec3( 0.10, 0.16, 0.05 ), hlRock = vec3( 0.22, 0.21, 0.19 );
    diffuseColor.rgb = mix( hlGrass, hlRock, smoothstep( 0.18, 0.4, abs( hlSlope ) ) );
  }`}`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
  // the haze for the distance the compression took away (the post pass hazes by the drawn depth)
  {
    float hlLost = max( 0.0, vHlTrueD - hinterlandCompress( vHlTrueD ) );
    float hlT = exp( -uHlHazeSigma * hlLost );
    gl_FragColor.rgb = mix( uHlHazeColor, gl_FragColor.rgb, hlT );
  }`);
  };
  if (options.setupMaterial) options.setupMaterial(material, patch);
  else material.onBeforeCompile = patch;
  material.customProgramCacheKey = () => `hinterland-land-${atlas.blocks.length}-${surface ? 'land' : 'debug'}`;

  const mesh = new THREE.Mesh(grid, material);
  mesh.name = 'hinterland-land';
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.userData.hinterland = { atlasBytes: atlas.width * atlas.height * 4, levels: atlas.blocks.length };

  // the selection, per drawing camera
  const frustum = new THREE.Frustum(), proj = new THREE.Matrix4();
  const planes = frustum.planes;
  const visible = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean => {
    // the four side planes only: the compression keeps directions, so near and far do not apply
    for (let p = 0; p < 4; p++) {
      const n = planes[p].normal, c = planes[p].constant;
      const x = n.x > 0 ? maxX : minX, y = n.y > 0 ? maxY : minY, z = n.z > 0 ? maxZ : minZ;
      if (n.x * x + n.y * y + n.z * z + c < 0) return false;
    }
    return true;
  };
  const rangeCache = new Map<number, number>();
  const pyramid = options.pyramid;
  const heightRange = (x0: number, z0: number, size: number, out: [number, number]): [number, number] => {
    const key = ((Math.round(x0 / 64) + 2048) * 4096 + (Math.round(z0 / 64) + 2048)) * 16 + Math.round(Math.log2(size / 64));
    let packed = rangeCache.get(key);
    if (packed === undefined) {
      let lo = Infinity, hi = -Infinity;
      for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) {
        const h = samplePyramidAt(pyramid, x0 + (i / 4) * size, z0 + (j / 4) * size);
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      // (a margin for what the 5 × 5 samples miss between them)
      const pad = 10 + 0.08 * (hi - lo);
      lo -= pad; hi += pad;
      packed = Math.round(lo + 4096) * 16384 + Math.round(hi + 4096);
      rangeCache.set(key, packed);
    }
    out[0] = Math.floor(packed / 16384) - 4096; out[1] = (packed % 16384) - 4096;
    return out;
  };
  let nodes = 0, selectMs = 0;
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    const t0 = performance.now();
    camera.updateMatrixWorld();
    proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(proj);
    const cam = camera.position;
    const fov = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? (camera as THREE.PerspectiveCamera).fov / Math.max(1e-3, (camera as THREE.PerspectiveCamera).zoom) : 60;
    nodes = selectHinterlandNodes(cam.x, cam.y, cam.z, fov, (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? visible : null, heightRange, lod, nodeData);
    grid.instanceCount = nodes;
    nodeAttr.addUpdateRange(0, nodes * 4);
    nodeAttr.needsUpdate = true;
    (uniforms.uHlCam.value as THREE.Vector3).copy(cam);
    selectMs = performance.now() - t0;
  };

  return {
    mesh,
    get nodes() { return nodes; },
    get selectMs() { return selectMs; },
    dispose() { grid.dispose(); material.dispose(); atlas.texture.dispose(); rangeCache.clear(); },
  };
}

/** The pyramid's height at a point (the finest level holding it; bilinear). */
function samplePyramidAt(pyramid: HinterlandPyramid, x: number, z: number): number {
  const ax = Math.abs(x), az = Math.abs(z);
  let level = pyramid.levels[pyramid.levels.length - 1];
  for (const l of pyramid.levels) if (ax < l.halfM - l.texelM && az < l.halfM - l.texelM) { level = l; break; }
  const fx = Math.max(0, Math.min(level.n - 1.001, (x + level.halfM) / level.texelM)), fz = Math.max(0, Math.min(level.n - 1.001, (z + level.halfM) / level.texelM));
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * level.n + i, h = level.heights;
  return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - tz) + (h[k + level.n] * (1 - tx) + h[k + level.n + 1] * tx) * tz;
}
