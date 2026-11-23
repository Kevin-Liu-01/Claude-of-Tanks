// What "a world's records are its shard's" means, read by collisionRecordCodec.selftest and the shard drift check
// (tools/capture-world-collision-manifests.mjs, COT_CANONICAL_RECORDS=1). First-party tooling: Kevin B. Liu.
import { isDeepStrictEqual } from 'node:util';
import { unpackCollisionRecord } from './collisionRecordCodec.ts';

/** The geometry the movement solve, the support field and the casts read from a record (flags and links aside). */
export function recordGeometry(record) {
  return {
    min: [...record.min], max: [...record.max], shape2: record.shape2 ?? null,
    crushMin: record.crushMin ?? null, crushKeep: record.crushKeep ?? null,
  };
}

/**
 * The first record of a world's lists whose geometry is not, bit for bit (Object.is: -0 is not 0), its packed record
 * read back, with how many were compared: `world` in its build's order (a tree trunk in both lists), `packed` in the
 * shard's (trees once, in the obstacles).
 */
export function canonicalRecordMismatch(world, packed) {
  const lists = [
    ['obstacles', world.obstacles, packed.obstacles],
    ['colliders', world.colliders.filter((record) => record.treeIdx == null), packed.colliders],
  ];
  let compared = 0;
  for (const [name, records, shard] of lists) {
    if (records.length !== shard.length) return { compared, mismatch: `${name}: ${records.length} records, ${shard.length} packed` };
    for (let i = 0; i < records.length; i++) {
      compared++;
      if (!isDeepStrictEqual(recordGeometry(records[i]), recordGeometry(unpackCollisionRecord(shard[i])))) {
        return { compared, mismatch: `${name}[${i}] ${records[i].kind ?? ''}` };
      }
    }
  }
  return { compared, mismatch: null };
}
