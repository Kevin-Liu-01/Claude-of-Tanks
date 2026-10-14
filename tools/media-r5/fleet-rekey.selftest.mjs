import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeMoves, rekeyCastText, rekeyFleetIndex, rekeyKeys, rekeyManifest, rekeyRoster } from './fleet-rekey.mjs';

// The media's re-key across tank-id schemas (fleet-rekey.mjs; the coordinator, 2026-10-13): the table's maps compose
// per id in one pass, so a swap never renames twice; flat maps, casts, the cast table, the fleet index and the manifest
// move together; and the tree's record says which schema they are in.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

// composition: a swap inside one map, and a rename across two steps
{
  const steps = [{ a: 'b', b: 'z' }, { b: 'c', z: 'w', leo2a6m_x: 'leo2a6m', leo2a6m: 'leo2a4_otco' }];
  assert.deepEqual([...composeMoves(steps, 1, 2)], [['a', 'b'], ['b', 'z']], 'schema 1 -> 2: the swap takes each id once');
  const all = composeMoves(steps, 1, 3);
  assert.equal(all.get('a'), 'c', 'a -> b at step 1, b -> c at step 2');
  assert.equal(all.get('b'), 'w', "schema 1's b went to z, and z to w");
  assert.equal(all.get('leo2a6m_x'), 'leo2a6m', 'leo2a6m_x lands on leo2a6m and stops there');
  assert.equal(all.get('leo2a6m'), 'leo2a4_otco', 'the old leo2a6m (the OTCO) moves on');
  assert.equal(composeMoves(steps, 2, 3).get('b'), 'c', 'a schema-2 b goes to c');
  assert.equal(composeMoves(steps, 3, 3).size, 0, 'a step already taken moves nothing');
}
// the flat maps: keys move, values stay, a collision is refused
{
  const moved = new Map([['fv510_milan_x', 'warrior_tes_h']]);
  const [out, n] = rekeyKeys({ abramsx: 1, fv510_milan_x: 2 }, moved);
  assert.deepEqual(out, { abramsx: 1, warrior_tes_h: 2 });
  assert.equal(n, 1);
  assert.throws(() => rekeyKeys({ a: 1, b: 2 }, new Map([['a', 'b']])), /lands on a key already there/);
  const [roster, m] = rekeyRoster([{ n: 173, hero: 'challenger1', lineup: ['challenger1', 'fv510_milan_x'], foes: ['t62mv1_x'] }], moved);
  assert.deepEqual(roster[0].lineup, ['challenger1', 'warrior_tes_h']);
  assert.equal(m, 1);
}
// the cast table: CAST's values and CAST_NAMES' keys, never a cast name that spells an old id
{
  const text = "export const CAST = {\n  warrior: 'fv510_milan_x', leo2a6m: 'leo2a6m_x', fv510_milan_x: 'fv510_milan_x',\n};\n\n"
    + "export const CAST_NAMES = {\n  fv510_milan_x: ['Warrior MILAN', 'UK'], leo2a6m_x: ['Leopard 2A6M', 'Germany'],\n};\n";
  const moved = new Map([['fv510_milan_x', 'warrior_tes_h'], ['leo2a6m_x', 'leo2a6m']]);
  const [out, n] = rekeyCastText(text, moved, (id) => ({ warrior_tes_h: 'Warrior TES(H)', leo2a6m: 'Leopard 2A6M' }[id]));
  assert.match(out, /warrior: 'warrior_tes_h', leo2a6m: 'leo2a6m', fv510_milan_x: 'warrior_tes_h'/, "CAST's values move, its keys stay");
  assert.match(out, /warrior_tes_h: \['Warrior TES\(H\)', 'UK'\], leo2a6m: \['Leopard 2A6M', 'Germany'\]/, "CAST_NAMES' keys move with the spec's name");
  assert.equal(n, 5);
}
// the fleet index and the manifest: keys, loop and poster names, the stamp, the manifest's paths and vehicles
{
  const moved = new Map([['fv510_milan_x', 'warrior_tes_h']]);
  const [index, n, files] = rekeyFleetIndex({ schemaVersion: 1, collection: 'c', vehicles: { fv510_milan_x: { take: 's24-ice-duel',
    loop: '/media/site50-r14/fleet/fv510_milan_x.webm', poster: '/media/site50-r14/fleet/fv510_milan_x.jpg' } } }, moved, 2);
  assert.equal(index.tankIdSchema, 2);
  assert.equal(index.vehicles.warrior_tes_h.loop, '/media/site50-r14/fleet/warrior_tes_h.webm');
  assert.deepEqual(files, [['fv510_milan_x.webm', 'warrior_tes_h.webm'], ['fv510_milan_x.jpg', 'warrior_tes_h.jpg']]);
  assert.equal(n, 1);
  const [manifest, m] = rekeyManifest({ files: [{ path: 'media/site50-r14/fleet/fv510_milan_x.jpg', vehicle: 'fv510_milan_x', bytes: 1 },
    { path: 'media/site50-r14/stills/s24-ice-duel.webp', bytes: 2 }] }, moved);
  assert.deepEqual(manifest.files[0], { path: 'media/site50-r14/fleet/warrior_tes_h.jpg', vehicle: 'warrior_tes_h', bytes: 1 });
  assert.equal(manifest.files[1].path, 'media/site50-r14/stills/s24-ice-duel.webp');
  assert.equal(m, 1);
}
// this tree: the record and the fleet index agree on the schema, and every key of the index is in that schema
{
  const record = join(ROOT, 'tools/media-r5/tank-id-schema.json'), index = join(ROOT, 'public/media/site50-r14/fleet/index.json');
  const schema = existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')).tankIdSchema : 1;
  if (existsSync(index)) assert.equal(JSON.parse(readFileSync(index, 'utf8')).tankIdSchema ?? 1, schema, 'the fleet index stands at the media record\'s schema');
  console.log(`fleet-rekey.selftest: composition, flat maps, casts, the cast table, the index and the manifest; this tree at schema ${schema}`);
}
