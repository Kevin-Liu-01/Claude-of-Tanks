// Shard 3 of 4 of the envelope census (264, envelope honesty; tools/envelope-census.mjs): every fourth playable tank from
// roster index 2, built as the anatomy generator measures it, holds its primary turret and hull buckets to
// docs/geometry-gate/envelope-allowance.json. A new thin or small part standing past its authored plates fails (with
// its builder line); a frame that needs less than its row fails until the row is lowered.
import { assertEnvelopeShard } from '../../tools/envelope-census.mjs';

const { ids } = await assertEnvelopeShard(3, 4);
console.log(`envelopeCensusShard3.selftest: ${ids.length} tanks' turret and hull envelopes within the allowance PASS`);
