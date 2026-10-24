#!/usr/bin/env node
// The Deploy screen's mode tiles (brand-ui 245, the owner's UI sweep: our actual images in place of flat rows).
// Copyright © 2026 Kevin B. Liu.
// Each tile's picture is a centre cut of that mode's in-engine still (public/media/site50-r14/home/modes/<id>.webp,
// 1280x720): the cut keeps the battle and leaves out the HUD round the frame's edges, then scales to 480x270 (the tile
// shows about 220x124 at 1920, so this is sharp at 2x). Writes public/media/deploy-r1/<id>-480.webp and the rows of
// public/media/deploy-r1/manifest.json. Run: node tools/deploy-mode-art.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'public/media/deploy-r1');
const MANIFEST = join(OUT, 'manifest.json');
const SOURCE = 'public/media/site50-r14/home/modes';
/** The rows' modes; Proving Ground has no still yet (its tile keeps the glyph). */
const MODES = ['turbo_ball', 'gun_game', 'mars', 'juggernaut', 'infected', 'endless_horde', 'realistic', 'drone', 'ac130'];
/** The cut, as fractions of the 1280x720 still: 68 % of its width and height round a centre a little above the middle. */
const CUT = { w: 0.68, cx: 0.5, cy: 0.47 };
const SIZE = { w: 480, h: 270 };

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const scratch = mkdtempSync(join(tmpdir(), 'deploy-mode-art-'));
try {
  for (const id of MODES) {
    const source = `${SOURCE}/${id}.webp`;
    const png = join(scratch, `${id}.png`);
    const file = `${id}-${SIZE.w}.webp`;
    // ffmpeg's crop takes the cut in pixels of the input (iw, ih), so one expression serves any still size
    const w = `iw*${CUT.w}`, h = `iw*${CUT.w}*9/16`;
    const x = `iw*${CUT.cx}-iw*${CUT.w}/2`, y = `ih*${CUT.cy}-iw*${CUT.w}*9/32`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(ROOT, source),
      '-vf', `crop=${w}:${h}:${x}:${y},scale=${SIZE.w}:${SIZE.h}:flags=lanczos`, '-frames:v', '1', png]);
    execFileSync('cwebp', ['-quiet', '-q', '80', '-m', '6', png, '-o', join(OUT, file)]);
    const row = { id: `${id}-tile`, file, mode: id, source, cut: CUT, width: SIZE.w, height: SIZE.h };
    const at = manifest.items.findIndex((item) => item.id === row.id);
    if (at >= 0) manifest.items[at] = row; else manifest.items.push(row);
    console.log('deploy-mode-art:', file);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
manifest.count = manifest.items.length;
manifest.description = "The Deploy screen's mode pictures (brand-ui S3 and 245, the Premiere direction's 04-deploy page): each core mode's "
  + 'picture, a 640x360 cut of the approved in-engine still the direction chose for it, and each other mode\'s tile, a '
  + '480x270 centre cut of its in-engine still (tools/deploy-mode-art.mjs).';
manifest.generatedBy = 'ffmpeg (scale lanczos; the tiles: centre crop) + cwebp -q 80 -m 6';
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
