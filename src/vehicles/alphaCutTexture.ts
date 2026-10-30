// src/vehicles/alphaCutTexture.ts — straight-alpha finishing for the vehicles' alpha-cut textures: the suits'
// garnished net (camoNetTexture.ts), the fitted cover's cut-leaf fabric (ghillieSuit.ts) and the garnish atlases
// (vehicleFoliage.ts). three.js only, like camoNetTexture.ts, so the decor's nets can use it without the fleet.
//
// The ghillie render lane (263, 2026-10-28; the GPU-still critic on the Christian II and the Strv 121: "the net reads
// flat: no visible depth, sag or shadowing between the net and the hull", "black specks and dark fringes at grazing
// angles"). Three faults every suit shared:
// - A canvas stores premultiplied colour, so every transparent texel of a painted net read back black (0, 0, 0, 0).
//   Bilinear filtering at the cut and every mip level averaged that black into the cords' and strips' edges: a dark rim
//   round each strand up close, a net that darkened and speckled with range. A finished texture keeps straight alpha
//   in an ImageData and floods each transparent texel with the colour of the cloth beside it (floodClearTexels).
// - The GPU's box mips thinned the cut with range (and lighting.ts built its coverage mips from the same black): the
//   texture carries its own coverage-preserving chain (coverageMipChainSteps, the trees' rule).
// - Nothing in a net was shaded by what lay over it. The height map the bump reads already says which strip lies over
//   which: occlusion baked from it darkens what lies under the garnish, and the net's gaps under thick garnish take the
//   shade they would show, the hull in the garnish's shadow (shadeFromHeight), so a laid net reads as a layer standing
//   off the hull, not a print on it. Baked into the map, it costs no draw, sampler or shader variant.
import * as THREE from 'three';

export type MipImage = { data: Uint8ClampedArray; width: number; height: number };
export const mipImage = (size: number): MipImage => (typeof ImageData === 'function'
  ? new ImageData(size, size) as MipImage
  : { data: new Uint8ClampedArray(size * size * 4), width: size, height: size });

/**
 * The coverage-preserving mip chain of an ImageData atlas (lighting.ts buildCoverageMipmaps' rule, run on the straight
 * alpha directly: a canvas round trip would premultiply away the flood tone of the transparent texels). Each level is
 * a 2 x 2 box of the one above, then its alpha is remapped so the share of texels passing the cut matches level 0 —
 * a distant card keeps its leafy silhouette instead of thinning below the cut or resolving as a flood rectangle. A
 * power-of-two box never reads across the image's edge, so a repeating net tiles at every level.
 */
export function* coverageMipChainSteps(level0: MipImage, cutoff: number): Generator<void, MipImage[], void> {
  const cut = Math.round(cutoff * 255);
  const coverage = (d: Uint8ClampedArray): number => {
    let pass = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] >= cut) pass++;
    return pass / (d.length / 4);
  };
  const target = coverage(level0.data);
  const chain: MipImage[] = [level0];
  let prev = level0;
  for (let size = level0.width >> 1; size >= 1; size >>= 1) {
    const next = mipImage(size);
    const src = prev.data, dst = next.data, sw = size * 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const tl = ((y * 2) * sw + x * 2) * 4, bl = tl + sw * 4, o = (y * size + x) * 4;
      for (let c = 0; c < 4; c++) dst[o + c] = (src[tl + c] + src[tl + 4 + c] + src[bl + c] + src[bl + 4 + c] + 2) >> 2;
    }
    const now = coverage(dst);
    if (target > 0 && size >= 2 && (now < target * 0.7 || now > target * 1.3)) {
      // the alpha a descending sort would put at the target's rank, read from a 256-bin histogram (lighting.ts's)
      const histogram = new Uint32Array(256);
      for (let i = 3; i < dst.length; i += 4) histogram[dst[i]]++;
      const count = dst.length / 4, rank = Math.min(count - 1, Math.max(0, Math.round(target * count) - 1));
      let value = 0;
      for (let v = 255, seen = 0; v >= 0; v--) { seen += histogram[v]; if (seen > rank) { value = v; break; } }
      const quantile = Math.max(1, value);
      for (let i = 3; i < dst.length; i += 4) dst[i] = Math.max(0, Math.min(255, cut + (dst[i] - quantile) * 3));
    }
    chain.push(next);
    prev = next;
    // (boot-261) a step a level: the first, a quarter of the atlas, is most of the chain
    if (size >= 64) yield;
  }
  return chain;
}

/**
 * Flood every texel under `floor` alpha with the colour of the cloth nearest it (a few rings of dilation from the
 * texels at or over it, then the image's mean cloth colour, of its texels at or over `solid`, for what the rings never
 * reach), keeping its alpha: filtering at the cut and the mips then blend the cloth with its own colour, never with
 * black. `wrap`: the image repeats (a net), so the rings run across its edges. `fillRest` false: texels the rings never
 * reach keep their colour (an atlas whose tiles carry their own mean-tone flood).
 */
export function floodClearTexels(d: Uint8ClampedArray, size: number,
  { floor = 48, solid = 128, rings = 6, wrap = true, fillRest = true } = {}): void {
  const n = size * size;
  const known = new Uint8Array(n);
  let mr = 0, mg = 0, mb = 0, count = 0, clear = 0;
  for (let p = 0; p < n; p++) {
    const a = d[p * 4 + 3];
    if (a >= solid) { mr += d[p * 4]; mg += d[p * 4 + 1]; mb += d[p * 4 + 2]; count++; }
    if (a >= floor) known[p] = 1; else clear++;
  }
  const mean = count ? [mr / count, mg / count, mb / count] : [70, 72, 52];
  // the texels still to flood: each ring reads only them, and keeps those it could not reach yet
  const pending = new Int32Array(clear);
  let held = 0;
  for (let p = 0; p < n; p++) if (!known[p]) pending[held++] = p;
  const grown = new Int32Array(clear);
  for (let ring = 0; ring < rings && held > 0; ring++) {
    let rest = 0, grew = 0;
    for (let k = 0; k < held; k++) {
      const p = pending[k], x = p % size, y = (p - x) / size;
      let r = 0, g = 0, b = 0, w = 0;
      for (let dy = -1; dy <= 1; dy++) {
        let qy = y + dy;
        if (qy < 0 || qy >= size) { if (!wrap) continue; qy = qy < 0 ? size - 1 : 0; }
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          let qx = x + dx;
          if (qx < 0 || qx >= size) { if (!wrap) continue; qx = qx < 0 ? size - 1 : 0; }
          const q = qy * size + qx;
          if (!known[q]) continue;
          const kw = dx && dy ? 0.7 : 1;
          r += d[q * 4] * kw; g += d[q * 4 + 1] * kw; b += d[q * 4 + 2] * kw; w += kw;
        }
      }
      if (!w) { pending[rest++] = p; continue; }
      d[p * 4] = r / w; d[p * 4 + 1] = g / w; d[p * 4 + 2] = b / w;
      grown[grew++] = p;
    }
    // a ring reads only the texels known before it
    for (let k = 0; k < grew; k++) known[grown[k]] = 1;
    held = rest;
    if (!grew) break;
  }
  if (fillRest) for (let k = 0; k < held; k++) { const p = pending[k]; d[p * 4] = mean[0]; d[p * 4 + 1] = mean[1]; d[p * 4 + 2] = mean[2]; }
}

/** A repeating box blur of one channel (a sliding window along each axis; radius r). */
function blurWrap(src: Float32Array, size: number, r: number): Float32Array {
  const out = Float32Array.from(src), line = new Float32Array(size + 2 * r + 1);
  const span = 2 * r + 1;
  const pass = (data: Float32Array, stride: number, step: number): void => {
    for (let l = 0; l < size; l++) {
      const base = l * stride;
      // the line with r texels of its own far end on either side (the tile repeats)
      for (let k = 0; k < size; k++) line[k + r] = data[base + k * step];
      for (let k = 0; k < r; k++) { line[k] = line[size + k]; line[size + r + k] = line[r + k]; }
      line[size + 2 * r] = line[2 * r];
      let sum = 0;
      for (let k = 0; k < span; k++) sum += line[k];
      for (let k = 0; k < size; k++) {
        data[base + k * step] = sum / span;
        sum += line[k + span] - line[k];
      }
    }
  };
  pass(out, size, 1);
  pass(out, 1, size);
  return out;
}

export interface CutTextureShade {
  /** The cut (0..1) the material tests: a texel at or over it is cloth. */
  readonly cutoff: number;
  /** A texel's shade at the lowest height of the cloth, relative to the highest (1: height does not shade). */
  readonly lowShade: number;
  /** How strongly cloth lying under its surroundings darkens (the strips over a cord, a bunch's foot). */
  readonly occlusion: number;
  /** The blur radii (texels) the occlusion reads its surroundings at, near and broad. */
  readonly radii: readonly [number, number];
  /**
   * The net's gaps under thick garnish. Each clear gap (its connected clear texels, the net repeating) closes whole or
   * not at all: one of up to `cell` texels (a mesh of the net) closes where the broad height over it reaches `fill[0]`
   * of full, a whole mesh by `fill[1]`, and a speck of a fifth of that anywhere. A closed gap takes `tone` (sRGB, the
   * hull in the garnish's shadow). A gap closed whole draws no edge of its own: a contour drawn through an open mesh
   * stepped and fringed under the cut (the 263 critic's "dark stair-step fringes"). A `cell` of the whole image closes
   * every gap (the fitted cover's cut-outs). Absent: every gap stays open.
   */
  readonly gaps?: { readonly tone: readonly [number, number, number]; readonly fill: readonly [number, number]; readonly cell: number };
}

/**
 * Bake the occlusion of a painted cut texture from its height map (straight-alpha `d`, `height` read from the bump
 * canvas, one grey channel): cloth darkens with depth and where its surroundings stand over it, and gaps under thick
 * garnish close with the shade beneath it. Returns the share of texels it closed.
 */
export function shadeFromHeight(d: Uint8ClampedArray, height: Uint8ClampedArray, size: number, shade: CutTextureShade): number {
  const n = size * size, cut = Math.round(shade.cutoff * 255);
  const h = new Float32Array(n);
  for (let p = 0; p < n; p++) h[p] = height[p * 4] / 255;
  const near = blurWrap(h, size, shade.radii[0]), broad = blurWrap(h, size, shade.radii[1]);
  for (let p = 0; p < n; p++) {
    const o = p * 4;
    if (d[o + 3] < cut) continue;
    const under = Math.max(0, 0.6 * near[p] + 0.4 * broad[p] - h[p]);
    const k = (shade.lowShade + (1 - shade.lowShade) * h[p]) * Math.max(0.3, 1 - shade.occlusion * under);
    d[o] *= k; d[o + 1] *= k; d[o + 2] *= k;
  }
  const gaps = shade.gaps;
  if (!gaps) return 0;
  // the clear gaps, each flooded out from its first texel (4-connected, across the repeat)
  const label = new Int32Array(n).fill(-1), queue = new Int32Array(n);
  let closed = 0;
  for (let start = 0; start < n; start++) {
    if (label[start] >= 0 || d[start * 4 + 3] >= cut) continue;
    let head = 0, tail = 0, sum = 0;
    queue[tail++] = start;
    label[start] = start;
    while (head < tail) {
      const p = queue[head++], x = p % size, y = (p - x) / size;
      sum += broad[p];
      const next = [y * size + (x + 1) % size, y * size + (x + size - 1) % size, ((y + 1) % size) * size + x, ((y + size - 1) % size) * size + x];
      for (const q of next) if (label[q] < 0 && d[q * 4 + 3] < cut) { label[q] = start; queue[tail++] = q; }
    }
    const area = tail, mean = sum / area;
    if (area > gaps.cell * (0.2 + 1.2 * THREE.MathUtils.smoothstep(mean, gaps.fill[0], gaps.fill[1]))) continue;
    for (let k = 0; k < tail; k++) {
      const p = queue[k], o = p * 4;
      // darkest under the garnish's middle
      const t = 1.15 - 0.35 * THREE.MathUtils.smoothstep(broad[p], gaps.fill[0], gaps.fill[1]);
      d[o] = gaps.tone[0] * t; d[o + 1] = gaps.tone[1] * t; d[o + 2] = gaps.tone[2] * t; d[o + 3] = 255;
    }
    closed += tail;
  }
  return closed / n;
}

/** A straight-alpha texture over a finished ImageData with its coverage-preserving mips (sRGB colour). */
export function straightAlphaTexture(image: MipImage, cutoff: number, name: string, repeat: boolean, anisotropy = 4): THREE.Texture {
  const texture = new THREE.Texture(image as unknown as HTMLImageElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  const steps = coverageMipChainSteps(image, cutoff);
  let next = steps.next();
  while (!next.done) next = steps.next();
  texture.mipmaps = next.value as unknown as typeof texture.mipmaps;
  texture.generateMipmaps = false;
  texture.name = name;
  texture.needsUpdate = true;
  return texture;
}

const cutDepths = new WeakMap<THREE.Material | THREE.Texture, THREE.MeshDepthMaterial>();
/**
 * The shadow depth material of an alpha-cut draw (a suit's net, cover or garnish): three copies the draw's map and alpha
 * test onto it at every shadow draw, and it reads the map's full-resolution level. (265; the 264b preview, the owner:
 * box-shaped shadows beside netted tanks.) At a cascade's texel size the shadow draw took a coarse level of the
 * coverage-preserving chain, whose texels still pass the cut in level 0's share but stand a strand or more wide, so a
 * laid net or drape cast a near-solid box beside the hull while the camera, close up, saw through it. One per cut
 * texture (the draw's map, else its alpha map; a material with neither has its own): three uploads a depth material's
 * map only when the map changes between draws, and a seat's builds, which share their net textures but not their
 * materials, share their depth draws as every other depth hook of the fleet does (264c: tankVisualClone's "two builds
 * of one seat" read leo2a7v's hull net through a second depth material).
 */
export function alphaCutDepthMaterial(material: THREE.Material): THREE.MeshDepthMaterial {
  const cut = material as THREE.Material & { map?: THREE.Texture | null; alphaMap?: THREE.Texture | null };
  const texture = cut.map ?? cut.alphaMap ?? null;
  const known = cutDepths.get(texture ?? material);
  if (known) return known;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.name = 'cot:alpha-cut-depth';
  depth.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
      '#ifdef USE_MAP\n\tdiffuseColor *= textureLod( map, vMapUv, 0.0 );\n#endif');
  };
  depth.customProgramCacheKey = () => 'cot:alpha-cut-depth-lod0';
  if (texture) {
    texture.addEventListener('dispose', () => { cutDepths.delete(texture); depth.dispose(); });
    cutDepths.set(texture, depth);
  } else {
    material.addEventListener('dispose', () => depth.dispose());
    cutDepths.set(material, depth);
  }
  return depth;
}

/** Whether a material cuts its draw by alpha (three's own rule for a cut shadow: a map or alpha map under an alpha test). */
export function isAlphaCut(material: THREE.Material): boolean {
  const m = material as THREE.Material & { map?: THREE.Texture | null; alphaMap?: THREE.Texture | null };
  return m.alphaTest > 0 && (!!m.map || !!m.alphaMap);
}

/**
 * A draw under an alpha test casts through its full-resolution cut (alphaCutDepthMaterial), its map there now or swapped
 * in later (a suit's finished net); any other is left as it is.
 */
export function castThroughAlphaCut(mesh: THREE.Mesh): void {
  const material = Array.isArray(mesh.material) ? null : mesh.material;
  if (material && material.alphaTest > 0) mesh.customDepthMaterial = alphaCutDepthMaterial(material);
}
