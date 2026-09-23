#!/usr/bin/env node
// Re-pin a receipt's frozen literals from the receipt's own failure output.
//
// Frozen whole-model / material-inclusive digests are the fleet's change detectors: after an intended fleet-wide
// geometry change (a wheel standard, a muzzle rebuild, a camo density) dozens of them move at once, and re-basing
// them by hand was the slowest and most error-prone step of every landing (2026-09-22, rounds 35 and 38). This tool
// runs one receipt, reads node's assert diff, and rewrites exactly the literal the diff names — nothing else — then
// runs the receipt again until it passes or fails for a non-literal reason. It never invents a value: every new
// literal comes from the receipt's own measurement of the current build, so it must only be used for a change the
// author intended and reviewed (the diff is the review; commit it with a dated note).
//
//   node tools/receipt-repin.mjs <receipt.selftest.mjs> [--dry] [--max-rounds=40]
//   node tools/receipt-repin.mjs --from-log=<suite log> [--dry]     # every "[selftests] … FAIL <file>" line
//
// Handled literals: quoted 64-hex digests (every quoted occurrence), quoted 8..63-hex fingerprints (only when the
// expected token occurs exactly once in the file), the numbers of a [count, digest] tuple on the digest's own line,
// and flat numeric arrays compared with deepStrictEqual (whole `[a, b, c]` literal swap). Anything else — a missing
// mesh, a moved seat, a count outside a tuple — is reported and left alone. Exit 0 = every receipt passes; 1 = a
// receipt still fails for a reason this tool must not touch; 2 = usage.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const HEX64 = /[0-9a-f]{64}/g;
const HEX_ANY = /^'([0-9a-f]{8,64})'$/;
const NUMBER = /^-?\d+(?:\.\d+)?(?:e-?\d+)?$/;

/** Every `+ actual` / `- expected` payload line of node's assert diff, header lines dropped. */
export function diffLines(output) {
  const plus = [], minus = [];
  for (const raw of output.split('\n')) {
    const m = /^([+-])\s(.*)$/.exec(raw);
    if (!m) continue;
    const text = m[2].trim().replace(/,$/, '');
    if (/^(actual( - expected)?|expected)$/.test(text) || text === '') continue;
    (m[1] === '+' ? plus : minus).push(text);
  }
  return { plus, minus };
}

/** Literal edits named by the diff: [{expected, actual, kind: 'hex' | 'num'}]. */
export function planEdits(output) {
  const { plus, minus } = diffLines(output);
  const edits = [];
  if (!plus.length || !minus.length) return edits;
  if (plus.length === minus.length) {
    for (let i = 0; i < plus.length; i++) {
      const a = plus[i], e = minus[i];
      if (a === e) continue;
      const ah = HEX_ANY.exec(a), eh = HEX_ANY.exec(e);
      if (ah && eh) { edits.push({ expected: eh[1], actual: ah[1], kind: 'hex' }); continue; }
      if (NUMBER.test(a) && NUMBER.test(e)) { edits.push({ expected: e, actual: a, kind: 'num' }); continue; }
      const ahs = a.match(HEX64) ?? [], ehs = e.match(HEX64) ?? [];
      if (ahs.length === 1 && ehs.length === 1) edits.push({ expected: ehs[0], actual: ahs[0], kind: 'hex' });
    }
  } else {
    const ahs = plus.join('\n').match(HEX64) ?? [], ehs = minus.join('\n').match(HEX64) ?? [];
    if (ahs.length === 1 && ehs.length === 1) edits.push({ expected: ehs[0], actual: ahs[0], kind: 'hex' });
  }
  return edits;
}

/** deepStrictEqual on a flat numeric array: the `actual: [ … ]` / `expected: [ … ]` summary lines. */
export function planArraySwap(output) {
  const a = /actual: \[ ([^\]]*) \]/.exec(output), e = /expected: \[ ([^\]]*) \]/.exec(output);
  if (!a || !e) return null;
  const actual = a[1].split(',').map((x) => x.trim()), expected = e[1].split(',').map((x) => x.trim());
  if (actual.length !== expected.length || ![...actual, ...expected].every((x) => NUMBER.test(x))) return null;
  return { actual, expected };
}

/** Apply the planned edits to `source`; returns { source, changes } or { error }. */
export function applyEdits(source, edits) {
  const changes = [];
  const hexEdits = edits.filter((edit) => edit.kind === 'hex'), numEdits = edits.filter((edit) => edit.kind === 'num');
  if (!hexEdits.length && numEdits.length) return { error: 'numbers without a digest anchor' };
  const anchorLines = new Set();
  for (const { expected, actual } of hexEdits) {
    let count = 0;
    for (const quote of ['"', "'"]) {
      const token = quote + expected + quote;
      const occurrences = source.split(token).length - 1;
      if (!occurrences) continue;
      if (expected.length < 64 && occurrences !== 1) return { error: `short token ${expected} occurs ${occurrences} times` };
      source.split('\n').forEach((line, index) => { if (line.includes(token)) anchorLines.add(index); });
      source = source.split(token).join(quote + actual + quote);
      count += occurrences;
    }
    if (!count) return { error: `digest ${expected.slice(0, 8)}… not found in the file` };
    changes.push(`${expected.slice(0, 8)}→${actual.slice(0, 8)} ×${count}`);
  }
  if (numEdits.length) {
    // The numbers belong to the tuple on the replaced digest's own line; neighbouring rows often share counts.
    const lines = source.split('\n');
    for (const { expected, actual } of numEdits) {
      let done = false;
      for (const index of [...anchorLines].sort((x, y) => x - y)) {
        // never inside a quoted literal: a count "75" also occurs inside hex digests ("…528a75cb…") — the first cut
        // rewrote the digest instead of the count and looped (round 40, Chieftain Mk5 rows)
        const parts = lines[index].split(/('[^']*'|"[^"]*")/);
        const pattern = new RegExp(`(?<![\\d.])${expected.replace('.', '\\.')}(?![\\d.])`);
        const hit = parts.findIndex((part, i) => i % 2 === 0 && pattern.test(part));
        if (hit >= 0) { parts[hit] = parts[hit].replace(pattern, actual); lines[index] = parts.join(''); changes.push(`${expected}→${actual} @${index + 1}`); done = true; break; }
      }
      if (!done) return { error: `number ${expected} is not on the re-pinned digest's line` };
    }
    source = lines.join('\n');
  }
  return { source, changes };
}

export function applyArraySwap(source, swap) {
  for (const separator of [', ', ',']) {
    const before = '[' + swap.expected.join(separator) + ']', after = '[' + swap.actual.join(separator) + ']';
    const occurrences = source.split(before).length - 1;
    if (occurrences === 1) return { source: source.replace(before, after), changes: [`${before.slice(0, 32)}… → ${after.slice(0, 32)}…`] };
    if (occurrences > 1) return { error: `array literal ${before.slice(0, 32)}… occurs ${occurrences} times` };
  }
  return { error: 'expected array literal not found in the file' };
}

function runReceipt(file) {
  const result = spawnSync(process.execPath, [file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status ?? 1, output: (result.stdout ?? '') + (result.stderr ?? '') };
}

/** Re-pin one receipt in place. Returns { file, rounds, changes, ok, reason }. */
export function repinReceipt(file, { dry = false, maxRounds = 40, run = runReceipt, log = () => {} } = {}) {
  const changes = [];
  for (let round = 0; round < maxRounds; round++) {
    const { status, output } = run(file);
    if (status === 0) return { file, rounds: round, changes, ok: true };
    let edits = planEdits(output);
    if (edits.length && edits.every((edit) => edit.kind === 'num')) edits = [];
    const source = readFileSync(file, 'utf8');
    const applied = edits.length ? applyEdits(source, edits) : (() => { const swap = planArraySwap(output); return swap ? applyArraySwap(source, swap) : { error: 'non-literal failure' }; })();
    if (applied.error) {
      const reason = output.split('\n').filter((line) => /Assertion|Error:|actual|expected/.test(line)).slice(0, 8).join('\n');
      return { file, rounds: round, changes, ok: false, reason: `${applied.error}\n${reason}` };
    }
    changes.push(...applied.changes);
    log(`  round ${round}: ${applied.changes.join('; ')}`);
    if (dry) return { file, rounds: round + 1, changes, ok: false, reason: 'dry run' };
    writeFileSync(file, applied.source);
  }
  return { file, rounds: maxRounds, changes, ok: false, reason: 'round limit' };
}

/** Failing receipt paths named by a run-selftests log. */
export function failedReceiptsFromLog(text) {
  const files = new Set();
  for (const line of text.split('\n')) {
    const m = /^\[selftests\] (?:[a-z]+ \d+\/\d+ )?FAIL (\S+?):?(?:\s|$)/.exec(line);
    if (m) files.add(m[1].replace(/:$/, ''));
  }
  return [...files];
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1].replace(/^(?!\/)/, `${process.cwd()}/`)) {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const maxRounds = Number(args.find((a) => a.startsWith('--max-rounds='))?.slice(13) ?? 40);
  const fromLog = args.find((a) => a.startsWith('--from-log='))?.slice(11);
  const files = fromLog ? failedReceiptsFromLog(readFileSync(fromLog, 'utf8')) : args.filter((a) => !a.startsWith('--'));
  if (!files.length) { console.error('usage: node tools/receipt-repin.mjs <receipt.selftest.mjs>… [--dry] | --from-log=<log> [--dry]'); process.exit(2); }
  let failed = 0;
  for (const file of files) {
    const result = repinReceipt(file, { dry, maxRounds, log: (line) => console.log(line) });
    if (result.ok) console.log(`${file}: PASS after ${result.rounds} re-pin round(s)`);
    else { failed++; console.log(`${file}: ${result.reason.split('\n')[0]}${dry ? '' : ' — left for manual review'}`); if (!dry) console.log(result.reason.split('\n').slice(1).map((l) => '    ' + l).join('\n')); }
  }
  process.exit(failed && !dry ? 1 : 0);
}
