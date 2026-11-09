// tools/audio/sfxBank.mjs — one asset's shipped bank (public/audio/sfx/<group>/<id>_<n>.webm) and its two records
// (the manifest entry and the verdict of record), as build-sfx.mjs rebuilds it. Factored out of build-sfx.mjs's loop
// unchanged (round 8 Y9 s1-11), so a selftest can drive it without ffmpeg or the ear proxy.

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import { verdictRecord } from './critic.mjs';

/** Exactly one asset's take files (`<id>_<n>.webm|m4a`): never a longer id sharing the prefix. */
export const takeFileOf = (id) => new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d+\\.(webm|m4a)$`);

/**
 * Rebuild one asset's bank from its chosen candidates, in rank order: master each (`master(pick, outBase)` writes
 * `<outBase>.webm`, and `.m4a` with --aac, and returns its facts and `cutS`), drop one that masters more than
 * `floor.under` LU under its preset's momentary target `floor.target` (null for a pinned bank), judge a critic bank's
 * file as it ships (`judge(file)`), stop at `want` files. Returns the outcome.
 */
export function commitBank({ entry, dir, candidates, want, floor = null, master, judge, records, log = console }) {
  const { id } = entry;
  for (const name of readdirSync(dir)) if (takeFileOf(id).test(name)) rmSync(join(dir, name));
  const files = [];
  for (const pick of candidates) {
    if (files.length >= want) break;
    const outBase = join(dir, `${id}_${files.length}`);
    const drop = () => { for (const ext of ['webm', 'm4a']) rmSync(`${outBase}.${ext}`, { force: true }); };
    const facts = master(pick, outBase);
    if (floor && facts.mMax != null && facts.mMax < floor.target - floor.under) {
      log.warn(`${id}: take ${pick.take} masters to ${facts.mMax} LUFS against ${floor.target}; skipped`);
      drop();
      continue;
    }
    let verdict = null;
    if (entry.critic) {
      const v = judge(`${outBase}.webm`);
      if (!v.pass) {
        log.warn(`${id}: take ${pick.take} fails the critic as shipped (${v.single.best} ${v.single.bestScore} vs ${v.single.against} ${v.single.againstScore}${v.burst ? `; burst ${v.burst.best} ${v.burst.bestScore} vs ${v.burst.against} ${v.burst.againstScore}` : ''}); skipped`);
        drop();
        continue;
      }
      verdict = verdictRecord(v);
    }
    files.push({ ...facts, take: pick.take, source: basename(pick.file), verdict,
      sha256: createHash('sha256').update(readFileSync(`${outBase}.webm`)).digest('hex') });
  }
  if (!files.length) {
    delete records.manifest[id];
    delete records.verdicts[id];
    return { outcome: 'refused', files, reason: 'no candidate shipped' };
  }
  if (entry.critic) {
    records.verdicts[id] = {
      class: entry.critic,
      variants: files.map((f) => ({ source: f.source, cutS: f.cutS, sha256: f.sha256, ...f.verdict })),
    };
  } else delete records.verdicts[id];
  records.manifest[id] = {
    g: entry.group,
    n: files.length,
    d: files.map((f) => f.dur),
    c: files[0].ch,
    r: files.every((f) => f.hf < 0.008) ? 24000 : 48000,
    ...(files[0].loop ? { l: [files[0].loop.start, +(files[0].loop.end).toFixed(6)] } : {}),
    kb: Math.round(files.reduce((a, f) => a + f.bytes, 0) / 1024),
  };
  return { outcome: 'replaced', files };
}

/** An asset dropped from the catalog: its take files and both records go. */
export function removeBank({ id, dir, records }) {
  if (existsSync(dir)) for (const name of readdirSync(dir)) if (takeFileOf(id).test(name)) rmSync(join(dir, name));
  delete records.manifest[id];
  delete records.verdicts[id];
}
