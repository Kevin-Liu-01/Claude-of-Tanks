// tools/audio/sfxBank.mjs — one asset's shipped bank (public/audio/sfx/<group>/<id>_<n>.webm) and its two records (the
// manifest entry and the verdict of record), rebuilt as one transaction (round 8 Y9 s1-11, 2026-11-08).
//
// build-sfx.mjs used to delete the shipped files first and master every candidate straight to its final name, so a
// rebuild where no candidate passed the ear proxy, a pin that named no take, or a master or critic that threw left the
// bank deleted and its records gone (223f3c7198 meant "with none passed, the asset keeps its files and the build fails";
// f0cb4f92bb's verdict-as-shipped moved the refusal after the delete). Now each rebuild moves through declared states,
// owned here alone (sfxBank.selftest.mjs censuses build-sfx.mjs for any other bank write):
//
//   staging ──→ committing ──→ replaced     every candidate mastered and judged in <stageRoot>/<id>-<pid>; at least
//      │             │                       one shipped: the old take files move aside, the staged ones move in, the
//      │             │                       records are replaced and persisted (fewer than wanted is a warning)
//      └──→ refused ←┘                       nothing shipped, the chosen list was empty, a step threw, or the swap
//                                            failed (rolled back): the files, manifest[id] and the verdict stay as they
//                                            were; build-sfx fails the run
//
// The stage is outside public/ (a killed run never leaves a stray file to publish) and on the repository's volume (the
// swap is renames). The critic matches verdicts by the exact path it was given, and a file's SHA-256 survives the
// rename, so judging in the stage is judging the shipped bytes.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import { verdictRecord } from './critic.mjs';

/** Exactly one asset's take files (`<id>_<n>.webm|m4a`): never a longer id sharing the prefix. */
export const takeFileOf = (id) => new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d+\\.(webm|m4a)$`);

/** A bank rebuild's states and the moves between them; bankMove refuses any other. */
export const BANK_MOVES = Object.freeze({
  staging: Object.freeze(['committing', 'refused']),
  committing: Object.freeze(['replaced', 'refused']),
  replaced: Object.freeze([]),
  refused: Object.freeze([]),
});

export function bankMove(from, to) {
  if (!BANK_MOVES[from]?.includes(to)) throw new Error(`sfx bank: no move ${from} -> ${to}`);
  return to;
}

/** Remove the stages a killed run left (`<id>-<pid>` of a pid that is gone): returns their names. */
export function sweepStages(stageRoot) {
  let names;
  try { names = readdirSync(stageRoot); } catch { return []; }
  const removed = [];
  for (const name of names) {
    const pid = Number(/-(\d+)$/.exec(name)?.[1]);
    if (!pid) continue;
    let live = pid === process.pid;
    if (!live) try { process.kill(pid, 0); live = true; } catch (error) { live = error.code === 'EPERM'; }
    if (live) continue;
    rmSync(join(stageRoot, name), { recursive: true, force: true });
    removed.push(name);
  }
  return removed;
}

/**
 * Rebuild one asset's bank from its chosen candidates, in rank order: master each into the stage
 * (`master(pick, outBase)` writes `<outBase>.webm`, and `.m4a` with --aac, and returns its facts and `cutS`), drop one
 * that masters more than `floor.under` LU under its preset's momentary target `floor.target` (null for a pinned bank),
 * judge a critic bank's file as it ships (`judge(file)`), stop at `want` files; then swap the bank in and `persist()`
 * the records, or refuse. Returns { outcome: 'replaced' | 'refused', files, reason }.
 */
export function commitBank({ entry, dir, candidates, want, floor = null, master, judge, records, stageRoot, persist = () => {},
  rename = renameSync, log = console }) {
  const { id } = entry;
  const stage = join(stageRoot, `${id}-${process.pid}`);
  let state = 'staging';
  let keepStage = false;
  const refuse = (reason) => {
    state = bankMove(state, 'refused');
    return { outcome: state, files: [], reason };
  };
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  try {
    if (!candidates.length) return refuse('no candidate to master (a pin names no take that exists)');
    const files = [];
    try {
      for (const pick of candidates) {
        if (files.length >= want) break;
        const outBase = join(stage, `${id}_${files.length}`);
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
    } catch (error) {
      return refuse(`a step threw: ${error.message}`);
    }
    if (!files.length) return refuse('no candidate shipped');
    state = bankMove(state, 'committing');
    // The swap: every take file of the asset moves aside, the staged ones move in; a failure moves them back.
    const prev = join(stage, 'prev');
    mkdirSync(prev);
    const moved = [];
    const placed = [];
    try {
      for (const name of readdirSync(dir)) if (takeFileOf(id).test(name)) { rename(join(dir, name), join(prev, name)); moved.push(name); }
      for (const name of readdirSync(stage)) if (takeFileOf(id).test(name)) { rename(join(stage, name), join(dir, name)); placed.push(name); }
    } catch (error) {
      try {
        for (const name of placed) rmSync(join(dir, name), { force: true });
        for (const name of moved) rename(join(prev, name), join(dir, name));
      } catch (undo) {
        keepStage = true;
        throw new Error(`${id}: the swap failed (${error.message}) and so did its undo (${undo.message}); the old files are in ${prev}`);
      }
      return refuse(`the swap failed and was rolled back: ${error.message}`);
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
    state = bankMove(state, 'replaced');
    persist();
    // Fewer variants rather than a click or a refused take is policy (gun-reports-269), said out loud.
    if (files.length < want) log.warn(`${id}: ships ${files.length} of ${want} variants`);
    return { outcome: state, files };
  } finally {
    if (!keepStage) rmSync(stage, { recursive: true, force: true });
  }
}

/** An asset dropped from the catalog: its take files and both records go. */
export function removeBank({ id, dir, records }) {
  if (existsSync(dir)) for (const name of readdirSync(dir)) if (takeFileOf(id).test(name)) rmSync(join(dir, name));
  delete records.manifest[id];
  delete records.verdicts[id];
}
