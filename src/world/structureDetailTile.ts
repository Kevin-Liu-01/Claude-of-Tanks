/**
 * The destructible building kit's neutral detail tiles (props.ts makeStructureDetail): their texels alone, without a
 * canvas, so the surface paint worker can paint them ahead of the props build (the time-to-battle lane, 2026-10-08:
 * moved here verbatim from props.ts with the loop that drives them).
 */
import type { SimplexNoise } from '../engine/simplexFast.ts';
import { paintTimberGrain } from './timberGrain.ts';

function clamp(x: number, a: number, b: number): number { return x < a ? a : x > b ? b : x; }
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Neutral detail atlases for the vertex-colored destructible building kit.
// Their RGB stays close to white so the kit palette remains authoritative;
// the texture contributes grain/weave/corrugation and its normal map adds the
// readable material response that flat vertex colors could not provide.
function sampleStructureDetail(
  noi: SimplexNoise,
  kind: 'wood' | 'canvas' | 'steel',
  x: number,
  y: number,
  sample: Float32Array,
): void {
  const grain = noi.noise(x * 0.17 + (kind === 'steel' ? 70 : 11), y * 0.06 - 31)
    * 0.5 + 0.5;
  // (the wood is painted by timberGrain.ts paintTimberGrain since round 6: paintStructureDetailBuffers)
  if (kind === 'canvas') {
    const warp = Math.sin(x * Math.PI * 0.52) * 0.5 + 0.5;
    const weft = Math.sin(y * Math.PI * 0.52) * 0.5 + 0.5;
    sample[0] = warp * 0.45 + weft * 0.45 + grain * 0.10;
    sample[1] = 0.88 + sample[0] * 0.10;
  } else {
    // Round 75: the light kit's sheet steel is a trapezoidal corrugation (the 256 px tile is 1.82 m of sheet at the
    // kit's 0.55 uv/m, so a 27 px period is the 0.19 m pitch of profiled cladding) with a panel seam every 0.91 m,
    // a rivet line under each seam, scratches, and a rust mask in sample[2] along the seams and the bottom lap.
    const p = ((x / 27) % 1 + 1) % 1;
    const corrugation = p < 0.34 ? 1 : p < 0.5 ? 1 - (p - 0.34) / 0.16 : p < 0.84 ? 0 : (p - 0.84) / 0.16;
    // a three-texel seam ramp: the surface receipt keeps every normal within 32 degrees of the wall plane
    const seamStep = x % 128;
    const seam = seamStep < 3 ? 1 - seamStep / 3 : 0;
    const rivet = !seam && seamStep >= 4 && seamStep < 8 && ((y + 6) % 24) < 5 ? 1 : 0;
    const scratch = smoothstep(0.72, 0.94,
      noi.noise(x * 0.09 + 91, y * 0.31 - 17) * 0.5 + 0.5);
    const lap = ((y % 128) < 3) ? 1 : 0;
    const rust = smoothstep(0.55, 0.9, noi.noise(x * 0.05 + 3, y * 0.05 - 41) * 0.5 + 0.5) * (seam || lap ? 0.9 : 0.25)
      + ((noi.noise(x * 0.4 + 17, y * 0.4 + 9) * 0.5 + 0.5) > 0.86 ? 0.7 : 0);
    sample[0] = corrugation * 0.72 + grain * 0.10 + 0.12 - seam * 0.30 - lap * 0.22 - rivet * 0.12;
    sample[1] = 0.92 + corrugation * 0.06 - scratch * 0.08 - seam * 0.25 - lap * 0.12 + rivet * 0.05;
    sample[2] = clamp(rust, 0, 1);
  }
}

/** One kind's tile: the albedo luminance, the height and (steel) the rust mask; 128 px for the canvas, 256 px otherwise. */
export interface StructureDetailBuffers { size: number; px: Uint8ClampedArray; hgt: Float32Array; rust: Float32Array | null }

export function paintStructureDetailBuffers(noi: SimplexNoise, kind: 'wood' | 'canvas' | 'steel'): StructureDetailBuffers {
  // (the facades lane, round 6; wave 241: "smeared-grain planks") the wood is hewn oak at 256 px, twice the texels over
  // the same 1.82 m tile, its grain painted seamless (timberGrain.ts paintTimberGrain); the canvas keeps 128 px
  const s = kind === 'canvas' ? 128 : 256, px = new Uint8ClampedArray(s * s * 4);
  const rust = kind === 'steel' ? new Float32Array(s * s) : null;
  const grain = kind === 'wood' ? paintTimberGrain(s, 0x0a4) : null;
  const hgt = grain ? grain.hgt : new Float32Array(s * s);
  const sample = new Float32Array(3);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    if (grain) {
      const v = clamp(grain.lum[i], 0.55, 1) * 255;
      px[j] = v; px[j + 1] = v; px[j + 2] = v; px[j + 3] = 255;
      continue;
    }
    sample[2] = 0;
    sampleStructureDetail(noi, kind, x, y, sample);
    const v = clamp(sample[1], 0.55, 1) * 255;
    px[j] = v; px[j + 1] = v; px[j + 2] = v; px[j + 3] = 255;
    hgt[i] = sample[0];
    if (rust) rust[i] = sample[2];
  }
  return { size: s, px, hgt, rust };
}
