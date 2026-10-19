#!/usr/bin/env node
/**
 * Receipt for tools/marketing-shots/capture-multiplayer-dual-screen.mjs (Node only, no browser): the published
 * dual-perspective WebP exists, is 2400×700, and is byte for byte the image its manifest.json names (bytes and SHA-256),
 * captured from one v2 match with the two players on opposite sides.
 *
 *   node tools/marketing-shots/capture-multiplayer-dual-screen.selftest.mjs
 *   node tools/marketing-shots/capture-multiplayer-dual-screen.selftest.mjs --dir=/tmp/dual   # a --out of the tool
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dirArg = process.argv.slice(2).find((entry) => entry.startsWith('--dir='));
const dir = dirArg ? resolve(dirArg.slice('--dir='.length)) : fileURLToPath(new URL('../../public/media/multiplayer-r1/', import.meta.url));
const manifestFile = join(dir, 'manifest.json');
assert.ok(existsSync(manifestFile), `${manifestFile} exists (written by capture-multiplayer-dual-screen.mjs)`);
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.tool, 'tools/marketing-shots/capture-multiplayer-dual-screen.mjs');
assert.ok(existsSync(fileURLToPath(new URL('./capture-multiplayer-dual-screen.mjs', import.meta.url))), 'the generator named by the manifest exists');
assert.equal(manifest.file, 'dual-perspective.webp');

const file = join(dir, manifest.file);
assert.ok(existsSync(file), `${file} exists`);
const bytes = readFileSync(file);
assert.equal(bytes.length, manifest.bytes, 'the WebP matches its manifest byte count');
assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256, 'the WebP matches its manifest SHA-256');

/** The canvas size from the RIFF header: extended (VP8X), lossy (VP8) or lossless (VP8L). */
function webpSize(data) {
  assert.equal(data.toString('ascii', 0, 4), 'RIFF', 'a RIFF container');
  assert.equal(data.toString('ascii', 8, 12), 'WEBP', 'a WebP image');
  assert.equal(data.readUInt32LE(4) + 8, data.length, 'the RIFF size covers the file');
  const chunk = data.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  if (chunk === 'VP8 ') {
    assert.equal(data.readUIntBE(23, 3), 0x9d012a, 'the VP8 key frame start code');
    return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    assert.equal(data[20], 0x2f, 'the VP8L signature');
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`unknown WebP chunk ${chunk}`);
}
assert.deepEqual(webpSize(bytes), { width: 2400, height: 700 }, 'the dual view is 2400×700');
assert.equal(manifest.width, 2400);
assert.equal(manifest.height, 700);

// one live v2 match, two players on opposite sides, each captured at 1280×720 from its own camera
assert.equal(manifest.multiplayer?.version, 2);
assert.equal(manifest.multiplayer?.sameMatch, true);
assert.match(String(manifest.multiplayer?.matchId), /\S/, 'the match is named');
assert.deepEqual(manifest.viewport, { width: 1280, height: 720, deviceScaleFactor: 1 });
assert.equal(manifest.players?.length, 2);
assert.deepEqual(manifest.players.map((player) => player.side).sort(), ['alpha', 'bravo'], 'one player on each side');
assert.notEqual(manifest.players[0].playerId, manifest.players[1].playerId, 'two different players');
for (const player of manifest.players) {
  assert.match(String(player.vehicle?.specId), /\S/, `${player.side} names its vehicle`);
  assert.equal(player.view?.opponentVisible, true, `${player.side} saw the other player`);
}
assert.match(String(manifest.map?.id), /\S/, 'the battlefield is named');

console.log(`capture-multiplayer-dual-screen.selftest: ${manifest.file} ${manifest.width}×${manifest.height}, ${manifest.bytes} bytes, `
  + `sha256 ${manifest.sha256.slice(0, 12)}…, match ${manifest.multiplayer.matchId} on ${manifest.map.id}: `
  + manifest.players.map((player) => `${player.side} ${player.vehicle.specId}`).join(' vs '));
