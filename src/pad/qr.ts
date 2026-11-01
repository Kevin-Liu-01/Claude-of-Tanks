/**
 * A small QR Code encoder for the phone controller's pairing link (docs/PHONE-CONTROLLER.md): byte mode, error
 * correction level M, versions 1-10 (up to 213 bytes; a pairing link is about 40). Written from ISO/IEC 18004's
 * construction: data and padding codewords, Reed-Solomon over GF(256) (0x11D), block interleaving, the function
 * patterns, the zig-zag placement, the eight masks scored by the four penalty rules, and the BCH-coded format and
 * version information. Pure; the desktop draws the matrix as one SVG path (never a canvas: the UI canvas rule).
 */

/** Per version 1-10 at level M: error-correction codewords per block and the number of blocks. */
const ECC_PER_BLOCK_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const MAX_VERSION = 10;
/** Level M's two format bits. */
const FORMAT_M = 0;

export interface QrMatrix {
  readonly size: number;
  readonly version: number;
  readonly mask: number;
  /** Row-major dark modules. */
  readonly dark: Uint8Array;
}

function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

const dataCodewords = (version: number): number =>
  Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK_M[version]! * BLOCKS_M[version]!;

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j]!, root);
      if (j + 1 < degree) result[j]! ^= result[j + 1]!;
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i]! ^= gfMultiply(divisor[i]!, factor);
  }
  return result;
}

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = version * 4 + 17 - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

/** The data codewords (mode, count, bytes, terminator, padding) for a version. */
function encodeData(bytes: Uint8Array, version: number): number[] | null {
  const capacityBits = dataCodewords(version) * 8;
  const countBits = version < 10 ? 8 : 16;
  const bits: number[] = [];
  const put = (value: number, length: number) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, countBits);
  for (const byte of bytes) put(byte, 8);
  if (bits.length > capacityBits) return null;
  put(0, Math.min(4, capacityBits - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j++) value = (value << 1) | bits[i + j]!;
    words.push(value);
  }
  for (let pad = 0xec; words.length < capacityBits / 8; pad ^= 0xec ^ 0x11) words.push(pad);
  return words;
}

function interleave(data: number[], version: number): number[] {
  const blocks = BLOCKS_M[version]!;
  const eccLen = ECC_PER_BLOCK_M[version]!;
  const raw = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortLen = Math.floor(raw / blocks);
  const divisor = rsDivisor(eccLen);
  const all: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const length = shortLen - eccLen + (i < shortBlocks ? 0 : 1);
    const block = data.slice(k, k + length);
    k += length;
    const ecc = rsRemainder(block, divisor);
    if (i < shortBlocks) block.push(0); // a placeholder so every block has one length while interleaving
    all.push(block.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < all[0]!.length; i++) {
    for (let j = 0; j < all.length; j++) {
      if (i !== shortLen - eccLen || j >= shortBlocks) result.push(all[j]![i]!);
    }
  }
  return result;
}

class Grid {
  readonly size: number;
  readonly dark: Uint8Array;
  readonly fixed: Uint8Array;
  constructor(size: number) {
    this.size = size;
    this.dark = new Uint8Array(size * size);
    this.fixed = new Uint8Array(size * size);
  }
  set(x: number, y: number, dark: boolean): void {
    this.dark[y * this.size + x] = dark ? 1 : 0;
    this.fixed[y * this.size + x] = 1;
  }
  get(x: number, y: number): boolean { return this.dark[y * this.size + x] === 1; }
}

function drawFormat(grid: Grid, mask: number): void {
  const data = (FORMAT_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  const size = grid.size;
  for (let i = 0; i <= 5; i++) grid.set(8, i, bit(i));
  grid.set(8, 7, bit(6));
  grid.set(8, 8, bit(7));
  grid.set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) grid.set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) grid.set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) grid.set(8, size - 15 + i, bit(i));
  grid.set(8, size - 8, true); // the dark module
}

function drawFunctionPatterns(grid: Grid, version: number): void {
  const size = grid.size;
  for (let i = 0; i < size; i++) { grid.set(6, i, i % 2 === 0); grid.set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        grid.set(x, y, ring !== 2 && ring !== 4);
      }
    }
  }
  const align = alignmentPositions(version);
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) grid.set(align[i]! + dx, align[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  drawFormat(grid, 0); // reserved now, written with the chosen mask
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      grid.set(a, b, dark);
      grid.set(b, a, dark);
    }
  }
}

function drawCodewords(grid: Grid, codewords: readonly number[]): void {
  const size = grid.size;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (grid.fixed[y * size + x] || i >= codewords.length * 8) continue;
        grid.dark[y * size + x] = (codewords[i >>> 3]! >>> (7 - (i & 7))) & 1;
        i++;
      }
    }
  }
}

const MASKS: ReadonlyArray<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(grid: Grid, mask: number): void {
  const test = MASKS[mask]!;
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      if (!grid.fixed[y * grid.size + x] && test(x, y)) grid.dark[y * grid.size + x] ^= 1;
    }
  }
}

/** The four penalty rules (runs, blocks, finder-like patterns, balance) over a line reader. */
function penalty(grid: Grid): number {
  const size = grid.size;
  let score = 0;
  const finderLike = (line: boolean[]): number => {
    let hits = 0;
    const pattern = [true, false, true, true, true, false, true];
    for (let i = 0; i + 7 <= line.length; i++) {
      if (!pattern.every((dark, k) => line[i + k] === dark)) continue;
      const lightBefore = [1, 2, 3, 4].every((k) => i - k < 0 || !line[i - k]);
      const lightAfter = [0, 1, 2, 3].every((k) => i + 7 + k >= line.length || !line[i + 7 + k]);
      if (lightBefore || lightAfter) hits++;
    }
    return hits;
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < size; a++) {
      const line: boolean[] = [];
      for (let b = 0; b < size; b++) line.push(pass === 0 ? grid.get(b, a) : grid.get(a, b));
      let run = 1;
      for (let b = 1; b <= size; b++) {
        if (b < size && line[b] === line[b - 1]) { run++; continue; }
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
      score += finderLike(line) * 40;
    }
  }
  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const c = grid.get(x, y);
      if (c === grid.get(x + 1, y) && c === grid.get(x, y + 1) && c === grid.get(x + 1, y + 1)) score += 3;
    }
  }
  let dark = 0;
  for (const module of grid.dark) dark += module;
  const total = size * size;
  score += Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** Encode text (UTF-8) as a QR matrix at level M, the smallest version that holds it; null when it is too long. */
export function encodeQr(text: string): QrMatrix | null {
  const bytes = new TextEncoder().encode(text);
  for (let version = 1; version <= MAX_VERSION; version++) {
    const data = encodeData(bytes, version);
    if (!data) continue;
    const codewords = interleave(data, version);
    const size = version * 4 + 17;
    let best: QrMatrix | null = null;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const grid = new Grid(size);
      drawFunctionPatterns(grid, version);
      drawCodewords(grid, codewords);
      applyMask(grid, mask);
      drawFormat(grid, mask);
      const score = penalty(grid);
      if (score < bestScore) { bestScore = score; best = { size, version, mask, dark: grid.dark }; }
    }
    return best;
  }
  return null;
}

/** The dark modules as one SVG path in module units (a 4-module quiet zone is the caller's viewBox margin). */
export function qrSvgPath(matrix: QrMatrix): string {
  let d = '';
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size;) {
      if (!matrix.dark[y * matrix.size + x]) { x++; continue; }
      let run = 1;
      while (x + run < matrix.size && matrix.dark[y * matrix.size + x + run]) run++;
      d += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return d;
}
