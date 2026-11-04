// Receipt (gun-reports-269, 2026-11-04): every file a critic bank ships was passed by the ear proxy as it ships. The
// owner heard the 11-03 cannons as guns; tools/audio/build-sfx.mjs now judges each file it would ship (the mastered
// WebM of its take's cut, tools/audio/critic.mjs) and writes the verdict, the take and the cut to
// tools/audio/sfx-verdicts.json. Checked here without the critic: every catalog entry that names a `critic` class has
// one passing verdict per shipped variant, bound to the shipped bytes by SHA-256, so a rebuilt, hand-swapped or
// unjudged file fails until build-sfx judges it again; the listening page reads the same record.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SFX_ASSETS } from './sfxManifest.generated.ts';
import { SFX_CATALOG } from '../../tools/audio/sfx-catalog.mjs';
import { SINGLE_SHOT } from '../../tools/audio/sfx-qa.mjs';

const record = JSON.parse(readFileSync(new URL('../../tools/audio/sfx-verdicts.json', import.meta.url), 'utf8'));
const judged = SFX_CATALOG.filter((entry) => entry.critic);
assert.ok(judged.length >= 100, `the gun, autocannon, machine-gun and rocket banks name a critic class (${judged.length})`);

let files = 0;
for (const entry of judged) {
  const shipped = SFX_ASSETS[entry.id];
  const rec = record[entry.id];
  assert.ok(shipped, `${entry.id} ships`);
  assert.ok(rec, `${entry.id}: its shipped files are judged (node tools/audio/build-sfx.mjs --ids ${entry.id})`);
  assert.equal(rec.class, entry.critic, `${entry.id}: judged as its catalog class`);
  assert.equal(rec.variants.length, shipped.n, `${entry.id}: one verdict per shipped variant`);
  rec.variants.forEach((v, i) => {
    const name = `${entry.id}_${i}`;
    const bytes = readFileSync(new URL(`../../public/audio/sfx/${shipped.g}/${name}.webm`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), v.sha256, `${name}: the judged bytes are the shipped bytes`);
    assert.equal(v.pass, true, `${name}: passed by the ear proxy (${v.single.best} ${v.single.bestScore} vs ${v.single.against} ${v.single.againstScore})`);
    assert.equal(v.class, entry.critic, `${name}: its verdict's class`);
    assert.ok(/^[0-9a-f]{24}\.pcm$/.test(v.source), `${name}: names the take it was cut from (${v.source})`);
    // a single-shot bank ships the take cut before its second report, never a bare click
    if (SINGLE_SHOT.test(entry.id)) assert.ok(v.cutS >= 0.25, `${name}: its cut is ${v.cutS} s`);
    if (entry.critic === 'mg') assert.ok(v.burst, `${name}: a machine gun is judged as its burst too`);
    files++;
  });
}
for (const id of Object.keys(record)) assert.ok(judged.some((entry) => entry.id === id), `${id}: a verdict for an asset without a critic class`);
console.log(`sfxVerdicts.selftest: ${judged.length} judged banks, ${files} shipped files, every one passed by the ear proxy as it ships, bound by hash`);
