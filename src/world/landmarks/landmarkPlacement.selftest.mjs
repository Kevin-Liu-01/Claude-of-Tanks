// landmarkPlacement.selftest.mjs — every map's named set pieces stand in the world it ships (MAPS Lane A, 2026-10-17).
//
// 227's LOOKS pass found Jade River Delta's aat-chala temple missing from the game: the composer (compose.ts) refused it
// "solid structure", because the char village's corner shop twin (deltaVillage.ts, 2026-10-14) stood on its site, and
// only its brick court was laid. Nothing failed: the composer names every refusal in its receipt (props group
// userData.landmarks), but no receipt read it on the built maps, and landmarks.selftest.mjs's shard check ("a structure
// record within the piece's footprint") was met by the corner shop's own record.
//
// Here every map with set pieces (props.landmarks) is built in Node at the shards' seeds (tools/headlessWorldCollision.mjs,
// the build the collision shards are captured from), its base world and its assault-trenches variant, and the composer's
// receipt is read: every authored piece has its entry and stands, or is named in SKIPPED_ALLOWANCE with the reason the
// composer gives and why it is allowed. An allowance that no longer holds (the piece now stands, or is refused for
// another reason) fails too, so the list stays the true one. The two variants build in two child processes side by side.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MAP_IDS, getMapConfig } from '../maps/index.ts';

/**
 * The set pieces a map's build refuses, allowed: { [mapId]: [[name, composer's reason, why it is allowed]] } (both
 * variants; a key `${mapId}@assault-trenches` names the trenches variant's own). Empty on 2026-10-17: the fleet-wide run found only Delta's temple refused, and Delta's plan now vacates the
 * corner shop twin's site for it (deltaVillage.ts).
 */
const SKIPPED_ALLOWANCE = {};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const VARIANTS = [null, 'assault-trenches'];
const mapIds = MAP_IDS.filter((id) => getMapConfig(id).props?.landmarks?.length);
assert.ok(mapIds.includes('delta') && mapIds.length >= 10, `the maps with set pieces (${mapIds.join(', ')})`);
for (const key of Object.keys(SKIPPED_ALLOWANCE)) assert.ok(mapIds.includes(key.replace(/@assault-trenches$/, '')), `${key}: an allowance names a map with set pieces`);

const script = (variant) => `
  const { buildWorldCollisionData } = await import(${JSON.stringify(path.join(root, 'tools/headlessWorldCollision.mjs'))});
  for (const mapId of ${JSON.stringify(mapIds)}) {
    let receipt = null;
    await buildWorldCollisionData(mapId, { variant: ${JSON.stringify(variant)}, inspect: ({ dressing }) => { receipt = dressing.group.userData.landmarks ?? null; } });
    const pieces = (receipt?.pieces ?? []).map(({ kind, name, x, z, status, reason }) => ({ kind, name, x, z, status, reason: reason ?? null }));
    process.stdout.write('RECEIPT ' + JSON.stringify({ mapId, ran: !!receipt, placed: receipt?.placed ?? 0, skipped: receipt?.skipped ?? 0, pieces }) + '\\n');
  }
`;
const run = promisify(execFile);
const outputs = await Promise.all(VARIANTS.map((variant) => run(process.execPath, ['--input-type=module', '-e', script(variant)], {
  cwd: root, encoding: 'utf8', maxBuffer: 1 << 26,
  env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=4096' },
})));

const failures = [];
const check = (label, fn) => { try { fn(); } catch (error) { failures.push(`${label}: ${error.message.split('\n')[0]}`); } };
const summary = [];
for (const [v, { stdout }] of outputs.entries()) {
  const variant = VARIANTS[v];
  const receipts = new Map(stdout.split('\n').filter((line) => line.startsWith('RECEIPT ')).map((line) => {
    const receipt = JSON.parse(line.slice(8));
    return [receipt.mapId, receipt];
  }));
  for (const mapId of mapIds) {
    const label = `${mapId}${variant ? `@${variant}` : ''}`;
    const receipt = receipts.get(mapId);
    check(label, () => {
      assert.ok(receipt?.ran, 'the set-piece pass ran and left its receipt');
      assert.equal(receipt.placed + receipt.skipped, receipt.pieces.length, 'every piece counted once');
      // every authored piece has its entry (a square's centre piece follows its square as an entry of its own)
      for (const placement of getMapConfig(mapId).props.landmarks) {
        const name = placement.name ?? null;
        assert.ok(receipt.pieces.some((p) => p.kind === placement.kind && p.name === name && p.x === placement.x && p.z === placement.z),
          `${name ?? placement.kind} has its receipt entry`);
      }
    });
    if (!receipt?.ran) continue;
    const allowed = SKIPPED_ALLOWANCE[label] ?? SKIPPED_ALLOWANCE[mapId] ?? [];
    for (const piece of receipt.pieces) {
      if (piece.status === 'placed') continue;
      check(label, () => assert.ok(allowed.some(([name, reason]) => name === (piece.name ?? piece.kind) && reason === piece.reason),
        `${piece.name ?? piece.kind} (${piece.kind}) at (${piece.x}, ${piece.z}) is refused: ${piece.reason} — it must stand, or be named in SKIPPED_ALLOWANCE with that reason`));
    }
    for (const [name, reason] of allowed) {
      check(label, () => assert.ok(receipt.pieces.some((p) => (p.name ?? p.kind) === name && p.status === 'skipped' && p.reason === reason),
        `the allowance for ${name} (${reason}) no longer holds: drop it from SKIPPED_ALLOWANCE`));
    }
    if (!variant) summary.push(`${mapId} ${receipt.placed}${receipt.skipped ? ` (+${receipt.skipped} allowed)` : ''}`);
  }
}
assert.deepEqual(failures, [], `${failures.length} failures:\n${failures.join('\n')}`);
console.log(`landmarkPlacement selftest: ${mapIds.length} maps, base and assault-trenches, every set piece stands: ${summary.join(', ')}`);
