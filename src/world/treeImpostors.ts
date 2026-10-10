// src/world/treeImpostors.ts — Round 77b (2026-09-26, the second vegetation pass): the far forests as impostors of
// the near trees.
//
// Beyond the 260 / 290 m hysteresis band the far tier drew opaque lobe clouds (buildOakFarGeometry & co.): better lit
// since round 77, but a different tree — a forest edge changed character at the LOD switch, and every far tree cost
// its lobes' triangles and two draws per species and far variant. This module bakes, once per world, an atlas of the
// ACTUAL near-LOD trees (the trunk and the cards, the species' own leaf atlas and the bark sheet, the vertex shade)
// from eight azimuths at a 10° elevation — one row per species and near variant, so the impostor a tree dissolves
// into is the same silhouette, colour and height its cards had — into two render targets: linear albedo with a
// coverage alpha, and the capture-space normal (the cards' sphere normals and the bark's, so the impostor keeps a lit
// side and a shade side under the sun and lights through the same matte wrap and translucency as the lobes did).
// The far tier then draws one camera-facing quad per tree (the two nearest azimuths cross-dissolved by the view
// angle, the second far variant mirrored for variety), lit by the standard pipeline: two triangles per tree instead
// of a lobe cloud, one draw per species and far variant instead of two.
//
// Round 77c: the atlas gains an elevated ring — one row per species (its first near variant) from the same eight
// azimuths at 45° — where that keeps the row cap and the tile the ground ring alone takes (every 3-species map); the
// program dissolves the tile toward it over 20°–45° of view elevation and tilts the card back to face the view. The
// horizon ring's forest (horizonForestImpostors.ts) draws from the same atlas through `applyProgram`, and the bake
// joins the covered warm through vegetation.ts `warmImpostors()`.
//
// The bake runs where a renderer exists (vegetation.ts calls ensureBaked from its per-frame update, outside any
// render pass — never inside one) and again after a GPU suspension disposes the atlas; without a renderer (the
// receipts, Node) the library still resolves its layout, budget and digest, and the material, quads and rows are
// exact, so every input of the bake is pinned. The tile size follows the texture budget: the largest of 128 / 96 /
// 64 px per direction whose albedo + half-resolution normal atlas (with mips) stays under TREE_IMPOSTOR_BUDGET_BYTES.
// The mobile tier keeps the lobe tier (vegetation.ts passes no renderer there).
import * as THREE from 'three';

type MaterialShader = Parameters<THREE.Material['onBeforeCompile']>[0];
type MaterialShaderHook = (shader: MaterialShader) => void;

export const TREE_IMPOSTOR_DIRECTIONS = 8;
/** The capture elevation: ground cameras see a tree at 300–900 m from a few degrees up; the crown top shows a little. */
export const TREE_IMPOSTOR_ELEVATION_RAD = 10 * Math.PI / 180;
/** Near variants baked per species (the near tier's three silhouettes). */
export const TREE_IMPOSTOR_VARIANTS = 3;
/** The gutter each side of a tile, as a share of the cell: keeps the mips of one tile out of its neighbours. */
export const TREE_IMPOSTOR_MARGIN = 0.06;
export const TREE_IMPOSTOR_BUDGET_BYTES = 6 * 1024 * 1024;
export const TREE_IMPOSTOR_TILES = Object.freeze([128, 96, 64] as const);
export const TREE_IMPOSTOR_MAX_ROWS = 16;
export const TREE_IMPOSTOR_PROGRAM_KEY = 'world-tree-impostor-v3'; // round 77c: the elevated ring; p2 trees lane: the gust lift
/** Round 77c: the elevated capture ring — one row per species (its first near variant) from eight azimuths at 45°,
 * added where the atlas keeps its ground tile and the row cap; above ~20° of view elevation the tile dissolves
 * toward it and the card tilts back to face the view, so a bird view no longer sees the side view laid flat. */
export const TREE_IMPOSTOR_ELEVATED_RAD = 45 * Math.PI / 180;
/** The view elevation band over which the ground ring dissolves into the elevated ring. */
const TREE_IMPOSTOR_ELEVATED_BLEND_RAD = Object.freeze([20 * Math.PI / 180, 45 * Math.PI / 180] as const);
/** The bake's alpha cut on the cards (the near material's own) and the impostor's own. */
export const TREE_IMPOSTOR_BAKE_ALPHA_TEST = 0.38;
export const TREE_IMPOSTOR_ALPHA_TEST = 0.5;
/** The quad's top flutters like a lobe crown top (paintCanopy's flexTop band). */
export const TREE_IMPOSTOR_TOP_FLEX = 0.3;

export interface TreeImpostorRowSource {
  species: string;
  variant: number;
  trunk: THREE.BufferGeometry;
  cards: THREE.BufferGeometry;
  /** The species' leaf atlas (alpha-tested at the near material's threshold in the bake). */
  foliage: THREE.Texture;
}

export interface TreeImpostorRow {
  species: string;
  variant: number;
  /** The tile's edge in world metres at instance scale 1 (the tree plus the gutters). */
  cellM: number;
  /** The base point's height within the tile (0 = tile bottom, 1 = top). */
  baseV: number;
  radiusM: number;
  heightM: number;
  /** The capture elevation of the row (the ground ring's or the elevated ring's). */
  elevation: number;
}

/** The renderer surface the bake needs; the receipts hand a recording stub, production the WebGLRenderer. */
export interface TreeImpostorRenderer {
  getRenderTarget(): THREE.WebGLRenderTarget | null;
  setRenderTarget(target: THREE.WebGLRenderTarget | null): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  clear(color?: boolean, depth?: boolean, stencil?: boolean): void;
  getClearColor(target: THREE.Color): THREE.Color;
  getClearAlpha(): number;
  setClearColor(color: THREE.ColorRepresentation, alpha?: number): void;
  autoClear: boolean;
  shadowMap: { autoUpdate: boolean };
  xr?: { enabled: boolean };
}

export interface TreeImpostorOptions {
  /** Species × variant rows in atlas order (row 0 at the atlas bottom). */
  rows: readonly TreeImpostorRowSource[];
  /** The bark sheet the trunks bake with. */
  bark: THREE.Texture;
  /** The linear mean canopy tone the gutters flood with, so the mips never darken toward black. */
  flood: THREE.Color;
  /** The far canopy's wind / dissolve / scope / matte-wrap hook the impostor material chains through first. */
  hook: MaterialShaderHook;
  setupMaterial(material: THREE.Material, hook: MaterialShaderHook): void;
  renderer: TreeImpostorRenderer | null;
  anisotropy?: number;
}

export interface TreeImpostorLibrary {
  readonly rows: readonly TreeImpostorRow[];
  /** Near variants baked per species: three where the row cap allows (every authored map), fewer on many-species worlds. */
  readonly variants: number;
  /** Round 77c: the ground rows (species × variants); the elevated rows, one per species, follow them. */
  readonly groundRows: number;
  /** Round 77c: true where the elevated ring fits (the row cap and the ground tile kept: every 3-species map). */
  readonly elevated: boolean;
  readonly tile: number;
  readonly width: number;
  readonly height: number;
  /** The retained texture bytes of both atlases with their mips. */
  readonly bytes: number;
  readonly material: THREE.MeshStandardMaterial;
  readonly albedo: THREE.WebGLRenderTarget;
  readonly normal: THREE.WebGLRenderTarget;
  readonly baked: boolean;
  readonly bakes: number;
  /** Round 77c: the wall-clock milliseconds the last bake took (0 until baked) — the activation warm's measure. */
  readonly bakeMs: number;
  /** Round 77c: the impostor program on another material that samples this atlas (the horizon ring's forest). */
  applyProgram(shader: MaterialShader): void;
  /** The first atlas row of a species. */
  rowBase(species: string): number;
  /** A fresh quad for one species pool (its own instanced attributes are attached by the pool). */
  quadGeometry(species: string, mirror: boolean): THREE.BufferGeometry;
  /** Bake when a renderer is present and the atlas is not baked; true when the atlas is baked after the call. */
  ensureBaked(): boolean;
  /** A digest of every bake input: the layout, the geometry bytes, the leaf atlases' pixels. */
  digest(): string;
}

/** The albedo atlas plus the half-resolution normal atlas, with mips. */
export function treeImpostorAtlasBytes(tile: number, rows: number): number {
  const width = tile * TREE_IMPOSTOR_DIRECTIONS, height = tile * rows;
  const albedo = width * height * 4, normal = (width / 2) * (height / 2) * 4;
  return Math.round((albedo + normal) * 4 / 3);
}

/** The largest tile whose atlases stay under the budget; the smallest tile when none does. */
export function resolveTreeImpostorTile(rows: number, budgetBytes = TREE_IMPOSTOR_BUDGET_BYTES): number {
  for (const tile of TREE_IMPOSTOR_TILES) if (treeImpostorAtlasBytes(tile, rows) <= budgetBytes) return tile;
  return TREE_IMPOSTOR_TILES[TREE_IMPOSTOR_TILES.length - 1];
}

/** Near variants baked per species under the row cap: three for every authored map (≤ 5 species), fewer beyond. */
export function resolveTreeImpostorVariants(speciesCount: number, maxRows = TREE_IMPOSTOR_MAX_ROWS): number {
  if (!(speciesCount > 0)) throw new Error('world/treeImpostors: at least one species');
  return Math.max(1, Math.min(TREE_IMPOSTOR_VARIANTS, Math.floor(maxRows / speciesCount)));
}

/** Round 77c: whether the elevated ring joins the atlas — only where the extra rows keep the row cap and the tile
 * the ground ring alone would take (the ground views' resolution is never traded for the bird views'). */
export function resolveTreeImpostorElevated(speciesCount: number, variants = resolveTreeImpostorVariants(speciesCount)): boolean {
  const ground = speciesCount * variants, rows = ground + speciesCount;
  return rows <= TREE_IMPOSTOR_MAX_ROWS && resolveTreeImpostorTile(rows) === resolveTreeImpostorTile(ground);
}

function mustReplace(src: string, anchor: string, replacement: string): string {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/treeImpostors: shader anchor missing: ${anchor}`);
  return out;
}

/** FNV-1a over bytes; folded with the running hash so the digest covers every input in order. */
function fnv1a(hash: number, bytes: Uint8Array): number {
  let h = hash >>> 0;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
function fnvText(hash: number, text: string): number {
  let h = hash >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
function bytesOf(array: ArrayLike<number> & { buffer?: ArrayBufferLike; byteOffset?: number; byteLength?: number }): Uint8Array {
  if (array instanceof Uint8Array) return array;
  if (ArrayBuffer.isView(array)) return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  return new Uint8Array(0);
}

/** The tile a row needs: the union of its trunk and cards projected at the capture elevation, plus the gutters. */
export function measureTreeImpostorRow(
  source: Pick<TreeImpostorRowSource, 'species' | 'variant' | 'trunk' | 'cards'>,
  elevation = TREE_IMPOSTOR_ELEVATION_RAD,
  margin = TREE_IMPOSTOR_MARGIN,
): TreeImpostorRow {
  let radius = 0, yMin = Infinity, yMax = -Infinity;
  for (const geometry of [source.trunk, source.cards]) {
    const p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      radius = Math.max(radius, Math.hypot(x, z));
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }
  // trees round 2: a facing cluster turns about its own axis (the bake's COT_BAKE_BILLBOARD), so each card vertex may
  // stand anywhere within its distance across the card from its point on that axis
  const axisA = source.cards.getAttribute('aAxis'), leafA = source.cards.getAttribute('aLeaf'), cardA = source.cards.getAttribute('aCard');
  if (axisA && leafA && cardA) {
    for (let i = 0; i < axisA.count; i++) {
      const reach = Math.abs(leafA.getX(i)), along = leafA.getY(i);
      const x = cardA.getX(i) + axisA.getX(i) * along, y = cardA.getY(i) + axisA.getY(i) * along - leafA.getZ(i);
      const z = cardA.getZ(i) + axisA.getZ(i) * along;
      radius = Math.max(radius, Math.hypot(x, z) + reach);
      if (y - reach < yMin) yMin = y - reach;
      if (y + reach > yMax) yMax = y + reach;
    }
  }
  if (!(radius > 0) || !Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    throw new Error(`world/treeImpostors: ${source.species}/${source.variant} has no measurable geometry`);
  }
  const ce = Math.cos(elevation), se = Math.sin(elevation);
  const vMin = yMin * ce - radius * se, vMax = yMax * ce + radius * se;
  const span = Math.max(2 * radius, vMax - vMin);
  const cellM = span / (1 - 2 * margin);
  const baseV = (margin * cellM - vMin) / cellM;
  return { species: source.species, variant: source.variant, cellM, baseV, radiusM: radius, heightM: yMax, elevation };
}

// Trees round 2 (2026-10-03): a grown crown's leaf clusters turn about their own axes to face the camera in the near
// material (vegetation.ts COT_LEAF_BILLBOARD); the bake turns them the same way toward each capture direction (the
// orthographic camera's own axis, carried into the copy's frame), so the far tier shows the crown the near tier does.
const BAKE_VERTEX = /* glsl */`
varying vec2 vBakeUv;
varying vec3 vBakeColor;
varying vec3 vBakeNormal;
#ifdef COT_BAKE_BILLBOARD
attribute vec3 aAxis;
attribute vec3 aLeaf;
attribute vec4 aCard;
#endif
void main() {
  vBakeUv = uv;
  vBakeColor = color;
  vBakeNormal = normalize( normalMatrix * normal );
  vec3 bakePosition = position;
  #ifdef COT_BAKE_BILLBOARD
  if ( dot( aAxis, aAxis ) > 0.5 ) {
    vec3 bakeToCamera = transpose( mat3( modelMatrix ) ) * vec3( viewMatrix[ 0 ][ 2 ], viewMatrix[ 1 ][ 2 ], viewMatrix[ 2 ][ 2 ] );
    vec3 bakeRight = cross( aAxis, bakeToCamera );
    float bakeRightL = length( bakeRight );
    if ( bakeRightL > 1e-4 ) bakePosition = aCard.xyz + bakeRight * ( aLeaf.x / bakeRightL ) + aAxis * aLeaf.y - vec3( 0.0, aLeaf.z, 0.0 );
  }
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * vec4( bakePosition, 1.0 );
}`;
const BAKE_FRAGMENT = /* glsl */`
uniform sampler2D map;
uniform float uAlphaTest;
uniform float uMode;
varying vec2 vBakeUv;
varying vec3 vBakeColor;
varying vec3 vBakeNormal;
void main() {
  vec4 tex = texture2D( map, vBakeUv );
  if ( tex.a < uAlphaTest ) discard;
  if ( uMode < 0.5 ) gl_FragColor = vec4( tex.rgb * vBakeColor, 1.0 );
  else gl_FragColor = vec4( normalize( vBakeNormal ) * 0.5 + 0.5, 1.0 );
}`;

function makeBakeMaterial(map: THREE.Texture, alphaTest: number, side: THREE.Side, billboard = false): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uAlphaTest: { value: alphaTest }, uMode: { value: 0 } },
    vertexShader: BAKE_VERTEX, fragmentShader: BAKE_FRAGMENT,
    vertexColors: true, side, depthTest: true, depthWrite: true, toneMapped: false,
    ...(billboard ? { defines: { COT_BAKE_BILLBOARD: '' } } : {}),
  });
  return material;
}

function makeAtlasTarget(width: number, height: number, anisotropy: number, name: string): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: true, stencilBuffer: false, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace, anisotropy,
  });
  target.texture.name = name;
  return target;
}

/** The uniforms one impostor program reads: the normal atlas, the row measures and the atlas layout. */
interface TreeImpostorProgramBinding {
  normal: THREE.Texture;
  rows: readonly THREE.Vector4[];
  atlas: THREE.Vector4;
}

/**
 * Round 77c: the impostor program on any MeshStandardMaterial that samples the atlas as its `map` — the camera-facing
 * billboard in instance space (before any wind block a caller installed after `begin_vertex`), the two nearest
 * azimuths cross-dissolved by the view angle, the mip coverage give-back before the alpha test and the baked normal
 * lit in the capture frame. The vegetation's far tier and the horizon ring's forest (horizonForestImpostors.ts)
 * share it, so a tree beyond the red line is lit and shaped by the same law as a tree inside it.
 */
function applyTreeImpostorProgram(shader: MaterialShader, binding: TreeImpostorProgramBinding): void {
  shader.uniforms.uImpNormal = { value: binding.normal };
  shader.uniforms.uImpRows = { value: binding.rows };
  shader.uniforms.uImpAtlas = { value: binding.atlas };
  shader.vertexShader = mustReplace(shader.vertexShader, '#include <common>', `#include <common>
uniform vec4 uImpRows[ ${TREE_IMPOSTOR_MAX_ROWS} ];
uniform vec4 uImpAtlas;
attribute float aImpRow;
attribute vec4 aImpCell;
varying vec2 vImpUv0;
varying vec2 vImpUv1;
varying vec2 vImpUvE0;
varying vec2 vImpUvE1;
varying float vImpW;
varying float vImpWE;
varying vec3 vImpR;
varying vec3 vImpU;
varying vec3 vImpF;
varying vec3 vImpUE;
varying vec3 vImpFE;`);
  // Before the wind block (the hook installed its block after the include; this one lands between them): the quad
  // becomes a camera-facing billboard in INSTANCE space, so the instance matrix (position, yaw, lean, scale) and the
  // wind law that follows (its lean by the unscaled height) apply exactly as they do to the cards.
  shader.vertexShader = mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`#include <begin_vertex>
    {
      float impRow = aImpCell.x + mod( aImpRow, aImpCell.z );
      vec4 impR = uImpRows[ int( impRow + 0.5 ) ];
      vec3 impS = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
      mat3 impRot = mat3( instanceMatrix[ 0 ].xyz / impS.x, instanceMatrix[ 1 ].xyz / impS.y, instanceMatrix[ 2 ].xyz / impS.z );
      vec3 impBase = ( modelMatrix * ( instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ) ).xyz;
      vec3 impRel = cameraPosition - impBase;
      vec2 impH = impRel.xz;
      float impHL = length( impH );
      impH = impHL > 1e-4 ? impH / impHL : vec2( 0.0, 1.0 );
      vec3 impFwd = vec3( impH.x, 0.0, impH.y );
      vec3 impRight = vec3( impH.y, 0.0, -impH.x );
      // round 77c: the elevated ring — over the blend band of view elevation the tile dissolves toward the 45°
      // capture and the card tilts back to face it (its base stays on the ground); aImpCell.w < 0 = no elevated row
      float impElRow = aImpCell.w;
      float impElev = atan( impRel.y, max( impHL, 1e-3 ) );
      float impWE = impElRow < 0.0 ? 0.0 : smoothstep( ${TREE_IMPOSTOR_ELEVATED_BLEND_RAD[0].toFixed(6)}, ${TREE_IMPOSTOR_ELEVATED_BLEND_RAD[1].toFixed(6)}, impElev );
      vec4 impRE = uImpRows[ int( max( impElRow, 0.0 ) + 0.5 ) ];
      float impCell = mix( impR.x, impRE.x, impWE );
      float impBaseV = mix( impR.y, impRE.y, impWE );
      float impTilt = impWE * ${TREE_IMPOSTOR_ELEVATED_RAD.toFixed(6)};
      vec3 impUp = vec3( -impFwd.x * sin( impTilt ), cos( impTilt ), -impFwd.z * sin( impTilt ) );
      vec3 impObj = transpose( impRot ) * impFwd;
      float impMir = aImpCell.y;
      float impAz = atan( impObj.x, impObj.z );
      impAz = mix( impAz, -impAz, impMir );
      float impDir = impAz * ${(TREE_IMPOSTOR_DIRECTIONS / (Math.PI * 2)).toFixed(8)};
      impDir -= ${TREE_IMPOSTOR_DIRECTIONS.toFixed(1)} * floor( impDir / ${TREE_IMPOSTOR_DIRECTIONS.toFixed(1)} );
      float impD0 = floor( impDir );
      float impW = impDir - impD0;
      float impD1 = impD0 + 1.0;
      impD1 -= ${TREE_IMPOSTOR_DIRECTIONS.toFixed(1)} * step( ${(TREE_IMPOSTOR_DIRECTIONS - 0.5).toFixed(1)}, impD1 );
      float impXZ = max( length( impObj.xz ), 1e-4 );
      float impWidth = impCell * sqrt( impS.x * impS.x * impObj.z * impObj.z + impS.z * impS.z * impObj.x * impObj.x ) / impXZ;
      float impHeight = impCell * impS.y;
      vec3 impOff = impRight * ( position.x * impWidth ) + impUp * ( ( position.y - impBaseV ) * impHeight );
      transformed = ( transpose( impRot ) * impOff ) / impS;
      float impU = mix( uv.x, 1.0 - uv.x, impMir );
      vImpUv0 = vec2( ( impD0 + impU ) * uImpAtlas.x, ( impRow + uv.y ) * uImpAtlas.y );
      vImpUv1 = vec2( ( impD1 + impU ) * uImpAtlas.x, ( impRow + uv.y ) * uImpAtlas.y );
      vImpUvE0 = vec2( ( impD0 + impU ) * uImpAtlas.x, ( max( impElRow, 0.0 ) + uv.y ) * uImpAtlas.y );
      vImpUvE1 = vec2( ( impD1 + impU ) * uImpAtlas.x, ( max( impElRow, 0.0 ) + uv.y ) * uImpAtlas.y );
      vImpW = impW;
      vImpWE = impWE;
      float impCe = cos( uImpAtlas.w ), impSe = sin( uImpAtlas.w );
      mat3 impView = mat3( viewMatrix );
      vImpR = impView * ( impRight * mix( 1.0, -1.0, impMir ) );
      vImpU = impView * vec3( -impFwd.x * impSe, impCe, -impFwd.z * impSe );
      vImpF = impView * vec3( impFwd.x * impCe, impSe, impFwd.z * impCe );
      vImpUE = impView * vec3( -impFwd.x * ${Math.sin(TREE_IMPOSTOR_ELEVATED_RAD).toFixed(6)}, ${Math.cos(TREE_IMPOSTOR_ELEVATED_RAD).toFixed(6)}, -impFwd.z * ${Math.sin(TREE_IMPOSTOR_ELEVATED_RAD).toFixed(6)} );
      vImpFE = impView * vec3( impFwd.x * ${Math.cos(TREE_IMPOSTOR_ELEVATED_RAD).toFixed(6)}, ${Math.sin(TREE_IMPOSTOR_ELEVATED_RAD).toFixed(6)}, impFwd.z * ${Math.cos(TREE_IMPOSTOR_ELEVATED_RAD).toFixed(6)} );
    }`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <common>', `#include <common>
uniform sampler2D uImpNormal;
varying vec2 vImpUv0;
varying vec2 vImpUv1;
varying vec2 vImpUvE0;
varying vec2 vImpUvE1;
varying float vImpW;
varying float vImpWE;
varying vec3 vImpR;
varying vec3 vImpU;
varying vec3 vImpF;
varying vec3 vImpUE;
varying vec3 vImpFE;`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <map_fragment>', /* glsl */`
    {
      vec4 impA = texture2D( map, vImpUv0 ), impB = texture2D( map, vImpUv1 );
      vec4 impC = mix( impA, impB, vImpW );
      if ( vImpWE > 0.001 ) impC = mix( impC, mix( texture2D( map, vImpUvE0 ), texture2D( map, vImpUvE1 ), vImpW ), vImpWE );
      diffuseColor *= impC;
    }`);
  // the coverage give-back of the cards' mip guard, on the tile's own texel derivatives
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <alphatest_fragment>', /* glsl */`
    {
      vec2 impTs = vec2( textureSize( map, 0 ) );
      vec2 impDx = dFdx( vImpUv0 * impTs ), impDy = dFdy( vImpUv0 * impTs );
      float impMip = 0.5 * log2( max( max( dot( impDx, impDx ), dot( impDy, impDy ) ), 1.0 ) );
      diffuseColor.a *= 1.0 + min( impMip, 3.5 ) * 0.25;
    }
    #include <alphatest_fragment>`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <normal_fragment_begin>', /* glsl */`#include <normal_fragment_begin>
    {
      vec3 impN0 = texture2D( uImpNormal, vImpUv0 ).xyz * 2.0 - 1.0;
      vec3 impN1 = texture2D( uImpNormal, vImpUv1 ).xyz * 2.0 - 1.0;
      vec3 impN = mix( impN0, impN1, vImpW );
      vec3 impNw = vImpR * impN.x + vImpU * impN.y + vImpF * impN.z;
      if ( vImpWE > 0.001 ) {
        vec3 impNE = mix( texture2D( uImpNormal, vImpUvE0 ).xyz, texture2D( uImpNormal, vImpUvE1 ).xyz, vImpW ) * 2.0 - 1.0;
        impNw = mix( impNw, vImpR * impNE.x + vImpUE * impNE.y + vImpFE * impNE.z, vImpWE );
      }
      normal = normalize( impNw );
      nonPerturbedNormal = normal;
    }`);
}

export function createTreeImpostorLibrary(options: TreeImpostorOptions): TreeImpostorLibrary {
  // The rows: every species in its order, its first `variants` near variants (three on every authored map).
  const speciesOrder: string[] = [];
  for (const source of options.rows) if (!speciesOrder.includes(source.species)) speciesOrder.push(source.species);
  if (speciesOrder.length === 0 || speciesOrder.length > TREE_IMPOSTOR_MAX_ROWS) {
    throw new Error(`world/treeImpostors: ${speciesOrder.length} species (1..${TREE_IMPOSTOR_MAX_ROWS})`);
  }
  const variants = resolveTreeImpostorVariants(speciesOrder.length);
  const sources: TreeImpostorRowSource[] = [];
  for (const species of speciesOrder) {
    for (let variant = 0; variant < variants; variant++) {
      const source = options.rows.find(row => row.species === species && row.variant === variant);
      if (!source) throw new Error(`world/treeImpostors: ${species} has no near variant ${variant}`);
      sources.push(source);
    }
  }
  const groundRows = sources.length;
  // round 77c: the elevated ring — one row per species (its first near variant) at 45°, after the ground rows,
  // where the row cap and the ground tile hold
  const elevated = resolveTreeImpostorElevated(speciesOrder.length, variants);
  if (elevated) for (const species of speciesOrder) sources.push(sources.find(source => source.species === species && source.variant === 0)!);
  const rows = sources.map((source, index) => measureTreeImpostorRow(source, index < groundRows ? TREE_IMPOSTOR_ELEVATION_RAD : TREE_IMPOSTOR_ELEVATED_RAD));
  const tile = resolveTreeImpostorTile(rows.length);
  const width = tile * TREE_IMPOSTOR_DIRECTIONS, height = tile * rows.length;
  const bytes = treeImpostorAtlasBytes(tile, rows.length);
  const anisotropy = options.anisotropy ?? 4;
  const albedo = makeAtlasTarget(width, height, anisotropy, 'treeImpostorAlbedo');
  const normal = makeAtlasTarget(width / 2, height / 2, anisotropy, 'treeImpostorNormal');
  const rowBaseOf = new Map<string, number>();
  rows.forEach((row, index) => { if (!rowBaseOf.has(row.species)) rowBaseOf.set(row.species, index); });
  const elevatedRowOf = new Map<string, number>();
  if (elevated) speciesOrder.forEach((species, index) => elevatedRowOf.set(species, groundRows + index));
  const rowVectors: THREE.Vector4[] = [];
  for (let i = 0; i < TREE_IMPOSTOR_MAX_ROWS; i++) {
    const row = rows[i];
    rowVectors.push(row ? new THREE.Vector4(row.cellM, row.baseV, row.heightM, row.radiusM) : new THREE.Vector4());
  }
  const atlasVector = new THREE.Vector4(1 / TREE_IMPOSTOR_DIRECTIONS, 1 / rows.length, rows.length, TREE_IMPOSTOR_ELEVATION_RAD);

  const binding: TreeImpostorProgramBinding = { normal: normal.texture, rows: rowVectors, atlas: atlasVector };
  // The impostor material: the far canopy's hook first (wind lean, LOD / occlusion / scope dissolve, the matte wrap
  // and the far translucency), then the shared impostor program (the billboard lands between the include and the
  // wind block, so the instance matrix and the wind law apply to the quad exactly as to the cards).
  const impostorHook = (shader: MaterialShader): void => {
    options.hook(shader);
    applyTreeImpostorProgram(shader, binding);
  };
  const material = new THREE.MeshStandardMaterial({
    map: albedo.texture, vertexColors: true, alphaTest: TREE_IMPOSTOR_ALPHA_TEST, alphaToCoverage: true,
    side: THREE.DoubleSide, roughness: 1.0, metalness: 0.0,
  });
  material.envMapIntensity = 1.0; // the far canopy's sky fill (2026-10-08: the full sky, as it always drew; materialEnvIntensity.ts)
  material.customProgramCacheKey = () => TREE_IMPOSTOR_PROGRAM_KEY;
  options.setupMaterial(material, impostorHook);

  let baked = false, bakes = 0, bakeMs = 0;
  // A GPU suspension (resourceLifetime) disposes the atlas textures: free the framebuffers with them and bake
  // again on the next frame that needs the tier.
  for (const target of [albedo, normal]) {
    target.texture.addEventListener('dispose', () => { baked = false; target.dispose(); });
  }

  function bake(renderer: TreeImpostorRenderer): void {
    // one scene per capture ring, each seen by its own tilted orthographic camera over the WHOLE atlas grid (the
    // target is the whole atlas, so every camera must map the full row range — a per-ring frustum would stretch its
    // rows over the target); a ring's copies sit at their own rows, the other ring's scene is not in view
    const barkMaterial = makeBakeMaterial(options.bark, 0, THREE.FrontSide);
    const foliageMaterials = new Map<THREE.Texture, THREE.ShaderMaterial>();
    const materials: THREE.ShaderMaterial[] = [barkMaterial];
    const rings: Array<{ scene: THREE.Scene; camera: THREE.OrthographicCamera }> = [];
    const ringOf = (elevation: number, first: number, last: number): void => {
      if (last <= first) return;
      const ce = Math.cos(elevation), se = Math.sin(elevation);
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(0, TREE_IMPOSTOR_DIRECTIONS, rows.length, 0, -50, 50);
      camera.position.set(0, 20 * se, 20 * ce);
      camera.up.set(0, ce, -se);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      for (let index = first; index < last; index++) {
        const row = rows[index], source = sources[index];
        let foliageMaterial = foliageMaterials.get(source.foliage);
        if (!foliageMaterial) {
          foliageMaterial = makeBakeMaterial(source.foliage, TREE_IMPOSTOR_BAKE_ALPHA_TEST, THREE.DoubleSide, true);
          foliageMaterials.set(source.foliage, foliageMaterial);
          materials.push(foliageMaterial);
        }
        for (let d = 0; d < TREE_IMPOSTOR_DIRECTIONS; d++) {
          const copy = new THREE.Group();
          copy.position.set(d + 0.5, (index + row.baseV) / ce, 0);
          copy.rotation.y = -(d / TREE_IMPOSTOR_DIRECTIONS) * Math.PI * 2;
          copy.scale.setScalar(1 / row.cellM);
          const trunk = new THREE.Mesh(source.trunk, barkMaterial);
          const cards = new THREE.Mesh(source.cards, foliageMaterial);
          trunk.frustumCulled = false; cards.frustumCulled = false;
          copy.add(trunk, cards);
          scene.add(copy);
        }
      }
      scene.updateMatrixWorld(true);
      rings.push({ scene, camera });
    };
    ringOf(TREE_IMPOSTOR_ELEVATION_RAD, 0, groundRows);
    ringOf(TREE_IMPOSTOR_ELEVATED_RAD, groundRows, rows.length);
    const previousTarget = renderer.getRenderTarget();
    const previousColor = renderer.getClearColor(new THREE.Color());
    const previousAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    const previousShadowUpdate = renderer.shadowMap.autoUpdate;
    const previousXr = renderer.xr?.enabled;
    try {
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
      if (renderer.xr) renderer.xr.enabled = false;
      const passes: Array<{ target: THREE.WebGLRenderTarget; mode: number; clear: THREE.Color }> = [
        { target: albedo, mode: 0, clear: options.flood },
        { target: normal, mode: 1, clear: new THREE.Color(0.5, 0.5, 1.0) },
      ];
      for (const pass of passes) {
        for (const bakeMaterial of materials) bakeMaterial.uniforms.uMode.value = pass.mode;
        renderer.setRenderTarget(pass.target);
        renderer.setClearColor(pass.clear, 0);
        renderer.clear(true, true, false);
        for (const ring of rings) renderer.render(ring.scene, ring.camera);
      }
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousColor, previousAlpha);
      renderer.autoClear = previousAutoClear;
      renderer.shadowMap.autoUpdate = previousShadowUpdate;
      if (renderer.xr && previousXr !== undefined) renderer.xr.enabled = previousXr;
      for (const bakeMaterial of materials) bakeMaterial.dispose();
      for (const ring of rings) ring.scene.clear();
    }
  }

  return {
    rows, variants, groundRows, elevated, tile, width, height, bytes, material, albedo, normal,
    get baked() { return baked; },
    get bakes() { return bakes; },
    get bakeMs() { return bakeMs; },
    applyProgram(shader) { applyTreeImpostorProgram(shader, binding); },
    rowBase(species) {
      const base = rowBaseOf.get(species);
      if (base === undefined) throw new Error(`world/treeImpostors: no rows for ${species}`);
      return base;
    },
    quadGeometry(species, mirror) {
      const base = this.rowBase(species);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(12).fill(1), 3));
      geometry.setAttribute('aFlex', new THREE.BufferAttribute(new Float32Array([0, 0, TREE_IMPOSTOR_TOP_FLEX, TREE_IMPOSTOR_TOP_FLEX]), 1));
      const m = mirror ? 1 : 0;
      // per vertex, constant over the quad: the species' first row, the mirror flag, the variants baked, the
      // species' elevated row (round 77c; -1 without the elevated ring)
      const e = elevatedRowOf.get(species) ?? -1;
      const cell = [base, m, variants, e];
      geometry.setAttribute('aImpCell', new THREE.BufferAttribute(new Float32Array([...cell, ...cell, ...cell, ...cell]), 4));
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeBoundingSphere();
      geometry.userData.treeImpostor = { species, base, mirror, variants, elevatedRow: e };
      return geometry;
    },
    ensureBaked() {
      if (baked) return true;
      const renderer = options.renderer;
      if (!renderer || typeof renderer.setRenderTarget !== 'function' || typeof renderer.render !== 'function') return false;
      const started = performance.now();
      bake(renderer);
      bakeMs = performance.now() - started;
      baked = true;
      bakes++;
      return true;
    },
    digest() {
      let h = 0x811c9dc5;
      h = fnvText(h, `impostor:${TREE_IMPOSTOR_DIRECTIONS}:${TREE_IMPOSTOR_ELEVATION_RAD.toFixed(6)}:${tile}:${width}x${height}:${TREE_IMPOSTOR_MARGIN}:${variants}:${elevated ? TREE_IMPOSTOR_ELEVATED_RAD.toFixed(6) : 'flat'}`);
      const hashed = new Set<THREE.Texture>();
      rows.forEach((row, index) => {
        const source = sources[index];
        h = fnvText(h, `${row.species}/${row.variant}:${row.cellM.toFixed(5)}:${row.baseV.toFixed(5)}:${row.elevation.toFixed(4)}`);
        for (const geometry of [source.trunk, source.cards]) {
          for (const name of ['position', 'normal', 'uv', 'color']) {
            const attribute = geometry.getAttribute(name);
            if (attribute) h = fnv1a(h, bytesOf(attribute.array as Float32Array));
          }
        }
        if (!hashed.has(source.foliage)) {
          hashed.add(source.foliage);
          const image = source.foliage.image as { data?: ArrayLike<number>; width?: number; height?: number } | null;
          h = fnvText(h, `atlas:${image?.width ?? 0}x${image?.height ?? 0}`);
          if (image?.data && ArrayBuffer.isView(image.data)) h = fnv1a(h, bytesOf(image.data as Uint8ClampedArray));
        }
      });
      return h.toString(16).padStart(8, '0');
    },
  };
}
