// src/fx/flipbookOrientation.selftest.mjs — the particle flipbook plays its frames in order (2026-10-05).
//
// makeFlipbookTextureSteps paints a 4x4 atlas row-major with frame 0 at the canvas's top-left, and THREE.CanvasTexture
// uploads with flipY, so canvas row r lands in the texture band v in [(T-1-r)/T, (T-r)/T). The puff vertex shader
// picks a frame's cell from its row; counting rows up from v = 0 played them last-first (12-15, 8-11, 4-7, 0-3), so a
// puff started eroded and finished dense. This receipt reads the shader's own cell formula out of particles.ts and
// replays it through the upload's flip for every frame.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./particles.ts', import.meta.url), 'utf8');
const lineA = source.split('\n').find((line) => /^\s*vUvA = /.test(line));
const lineB = source.split('\n').find((line) => /^\s*vUvB = /.test(line));
assert.ok(lineA && lineB, 'the puff shader defines both flipbook cells');
assert.ok(source.includes('frame 0 top-left'), 'the atlas painter still documents its row-major, top-left frame order');
assert.ok(/new THREE\.CanvasTexture\(cv\)/.test(source) && !/flipY\s*=\s*false/.test(source),
  'the flipbook atlas still uploads as a CanvasTexture with the default flipY');

// The cell's row term, as the shader writes it, evaluated in JS.
const rowTerm = (line, f) => {
  const match = line.match(/vec2\(\s*mod\(\s*f[01],\s*uTiles\s*\),\s*(.+?)\s*\)\s*\+\s*uv\s*\)/);
  assert.ok(match, `the cell formula parses: ${line.trim()}`);
  const expr = match[1].replace(/f[01]/g, String(f)).replace(/uTiles/g, 'T').replace(/floor/g, 'Math.floor');
  return Function('T', `return (${expr});`)(TILES);
};
const TILES = 4;
for (const line of [lineA, lineB]) {
  for (let frame = 0; frame < TILES * TILES; frame++) {
    const row = rowTerm(line, frame);
    // the texture band [row/T, (row+1)/T) holds canvas row T-1-row after the upload's flip
    const canvasRow = TILES - 1 - row;
    assert.equal(canvasRow, Math.floor(frame / TILES), `frame ${frame} samples canvas row ${Math.floor(frame / TILES)}`);
  }
}
console.log(`flipbookOrientation.selftest: ${TILES * TILES} frames each sample their own canvas row through the upload's flip`);
