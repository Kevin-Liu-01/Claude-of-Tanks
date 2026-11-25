// tools/webp-codec.mjs — the asset tools' WebP encode and RGBA decode through libwebp's own command-line tools (texture-diet-277).
//
// cwebp and dwebp (libwebp, `brew install webp`) are the encoder the repository's asset tools already call
// (tools/map-thumbs.mjs). Nothing here is a hand edit: a tool hands RGBA (or an image file) and the cwebp arguments, and gets
// the encoded bytes back; the version string goes in every ledger the tools write, since another libwebp may encode other
// bytes for the same pixels.
//   decodeRgba(file)            -> { width, height, rgba: Uint8Array } (JPEG, PNG or WebP; JPEG through cwebp's libjpeg)
//   encodeWebp(rgba, w, h, args) -> Buffer (the RGBA goes to cwebp as a PAM)
//   webpVersion()               -> 'cwebp 1.6.0 / dwebp 1.6.0'
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const run = (tool, args) => execFileSync(tool, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });

function scratch(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cot-webp-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** The libwebp tools' versions, recorded beside every encode. */
export function webpVersion() {
  const v = (tool) => run(tool, ['-version']).toString().split('\n')[0].trim();
  return `cwebp ${v('cwebp')} / dwebp ${v('dwebp')}`;
}

function parsePam(buf) {
  const end = buf.indexOf('ENDHDR\n');
  if (buf.subarray(0, 3).toString() !== 'P7\n' || end < 0) throw new Error('dwebp wrote no PAM');
  const head = buf.subarray(0, end).toString();
  const num = (key) => Number(new RegExp(`${key} (\\d+)`).exec(head)?.[1]);
  const width = num('WIDTH'), height = num('HEIGHT'), depth = num('DEPTH');
  if (depth !== 4) throw new Error(`PAM depth ${depth}, expected 4`);
  return { width, height, rgba: new Uint8Array(buf.subarray(end + 7, end + 7 + width * height * 4)) };
}

function pam(rgba, width, height) {
  return Buffer.concat([Buffer.from(`P7\nWIDTH ${width}\nHEIGHT ${height}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`),
    Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength)]);
}

/** Decode an image file to RGBA. A JPEG or PNG goes through cwebp's exact lossless transcode first (libjpeg / libpng). */
export function decodeRgba(file) {
  return scratch((dir) => {
    let webp = file;
    if (!/\.webp$/i.test(file)) {
      webp = path.join(dir, 'in.webp');
      run('cwebp', ['-quiet', '-lossless', '-exact', '-z', '0', '-metadata', 'none', file, '-o', webp]);
    }
    const out = path.join(dir, 'out.pam');
    run('dwebp', ['-quiet', webp, '-pam', '-o', out]);
    return parsePam(readFileSync(out));
  });
}

/** Encode RGBA with cwebp under `args` (e.g. ['-q', '92', '-sharp_yuv', '-m', '6']); no metadata is written. */
export function encodeWebp(rgba, width, height, args) {
  return scratch((dir) => {
    const input = path.join(dir, 'in.pam'), out = path.join(dir, 'out.webp');
    writeFileSync(input, pam(rgba, width, height));
    run('cwebp', ['-quiet', '-metadata', 'none', ...args, input, '-o', out]);
    return readFileSync(out);
  });
}
