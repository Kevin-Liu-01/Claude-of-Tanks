#!/usr/bin/env node
/**
 * black-world-repro-summary.mjs — the repro rate per target / scenario / map across black-world-repro parts, the black-
 * world guard's incidents on natural runs, and its heal proofs (2026-10-18/19, black-screen-228).
 *   node tools/black-world-repro-summary.mjs <part dir> [<part dir> ...]
 * Reads each part's summary.json (and report.jsonl for the per-frame series) and prints one row per
 * (target, chrome, scenario, dsf, map): runs, BLACK-WORLD runs, suspect runs, harness errors, guard incidents, black frames,
 * the longest black stretch and the first black time; then one row per injected fault: the class the guard named, the rung
 * that healed it, when it opened and when the world was back.
 *
 * A frame is BLACK-WORLD when at least the part's --zero-frac (0.8; the owner's frame reads 0.812) of the world region is
 * exactly 0,0,0 while the HUD shows, or (round 2, D3) at least its --black-world-frac (0.8) near-black: the harness's JPEG
 * samples never keep exact zeros (its positive control read near-black 0.98, exact-zero 0.000), and the owner's frame
 * reads 0.846 near-black. A sample re-read from a lossless PNG counts on its own exact-zero share too. Control and
 * injection frames never count as natural.
 *
 * (Round 2) A harness-error row (an unwatched window) still counts its guard incidents and any black frame it did see:
 * natural incidents are never dropped with the window. The target column is the build the page ran (prod, dev,
 * local-prod: a production build served on this machine), not the host.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_ZERO_FRAC = 0.8;
export const DEFAULT_BLACK_WORLD_FRAC = 0.8;
const SUSPECT_BLACK_FRAC = 0.35;

/** Whether one sampled frame is BLACK-WORLD (`zeroFrac` and `blackWorldFrac` the part's thresholds). */
export function frameIsBlack(frame, zeroFrac = DEFAULT_ZERO_FRAC, blackWorldFrac = DEFAULT_BLACK_WORLD_FRAC) {
  if (!frame || frame.st?.hud === false) return false;
  return (frame.zeroFrac != null && frame.zeroFrac >= zeroFrac) || (frame.pngZeroFrac != null && frame.pngZeroFrac >= zeroFrac)
    || (frame.blackFrac != null && frame.blackFrac >= blackWorldFrac);
}

/** The build a part ran: its recorded kind, else the CLI target (a URL on this machine is a local build, never 'dev'). */
export function targetKind(summary) {
  if (summary.targetKind) return summary.targetKind;
  if (summary.target === 'prod' || summary.target === 'dev') return summary.target;
  return /127\.0\.0\.1|localhost/.test(String(summary.target ?? '')) ? 'local' : String(summary.target ?? 'unknown');
}

/** The natural frames of one run: control windows and injected faults excluded. */
export function naturalFrames(frames, control = false) {
  return (frames ?? []).filter((frame) => !frame.ctl && !(control && frame.st?.camMask === 2 ** 30));
}

/**
 * Whether a natural window was actually watched: at least MIN_VALID_SAMPLES readable frames whose span covers at least
 * MIN_SPAN_SHARE of the window. A run whose page detached or whose grabs all failed must never pass as 'ok' with nothing
 * sampled (cold-maps-p3b 001 whiteout: 100 detached-frame errors, verdict ok before this rule).
 */
export const MIN_VALID_SAMPLES = 8;
export const MIN_SPAN_SHARE = 0.8;
export function sampleCoverage(frames, windowS) {
  const valid = (frames ?? []).filter((frame) => frame.mean != null);
  const times = valid.map((frame) => frame.at);
  const spanS = times.length ? +(times[times.length - 1] - times[0]).toFixed(2) : 0;
  let maxGapS = 0, prev = 0;
  for (const at of [...times, windowS]) { maxGapS = Math.max(maxGapS, at - prev); prev = at; }
  const ok = valid.length >= MIN_VALID_SAMPLES && spanS >= MIN_SPAN_SHARE * windowS;
  return { valid: valid.length, errors: (frames ?? []).filter((frame) => frame.error).length, spanS, maxGapS: +maxGapS.toFixed(2), ok };
}

/** The longest run of consecutive black frames, in samples. */
export function longestBlackRun(frames, zeroFrac = DEFAULT_ZERO_FRAC, blackWorldFrac = DEFAULT_BLACK_WORLD_FRAC) {
  let current = 0, longest = 0;
  for (const frame of frames) {
    if (frameIsBlack(frame, zeroFrac, blackWorldFrac)) { current++; longest = Math.max(longest, current); } else current = 0;
  }
  return longest;
}

/** A row's own guard incidents (the row's count, else the older page totals less the part's injections so far). */
function ownIncidents(guard, injectedSoFar) {
  if (!guard) return 0;
  return guard.total !== undefined ? guard.incidents ?? 0 : Math.max(0, (guard.incidents ?? 0) - injectedSoFar);
}

function readPart(dir) {
  const file = path.join(dir, 'summary.json');
  if (!existsSync(file)) return null;
  const summary = JSON.parse(readFileSync(file, 'utf8'));
  const reports = new Map();
  const report = path.join(dir, 'report.jsonl');
  if (existsSync(report)) {
    for (const line of readFileSync(report, 'utf8').split('\n').filter(Boolean)) {
      const row = JSON.parse(line);
      reports.set(row.label, row);
    }
  }
  return { summary, reports };
}

/** Aggregate parts into the rate table, the injection table and the totals. */
export function summarizeParts(dirs) {
  const rows = new Map();
  const injections = [];
  for (const dir of dirs) {
    const part = readPart(dir);
    if (!part) continue;
    const { summary, reports } = part;
    const zeroFrac = summary.zeroFrac ?? DEFAULT_ZERO_FRAC;
    const blackWorldFrac = summary.blackWorldFrac ?? DEFAULT_BLACK_WORLD_FRAC;
    const black = (frame) => frameIsBlack(frame, zeroFrac, blackWorldFrac);
    const target = targetKind(summary);
    const chrome = `${summary.chrome ?? 'puppeteer'}${summary.preset && summary.preset !== 'auto' ? ` ${summary.preset}` : ''}`;
    const scenario = `${summary.scenario}${summary.plain ? '+plain' : ''}${summary.drive ? '+drive' : ''}${summary.realEsc ? '+realesc' : ''}`
      + `${summary.realFocus ? '+realfocus' : ''}${summary.awayDuringLoadS ? `+away${summary.awayDuringLoadS}s` : ''}`;
    // receipts the part's injected faults opened (a session's natural rows recorded before per-row counts carry them)
    let injectedSoFar = 0;
    for (const run of summary.runs) {
      const detail = reports.get(run.label) ?? {};
      if (String(run.action ?? '').startsWith('inject-')) {
        const heal = detail.guardHeal ?? run.guardHeal ?? null;
        injectedSoFar += heal?.receipts?.length ?? 0;
        const first = heal?.receipts?.[0] ?? null;
        injections.push({ part: path.basename(dir), map: run.map, fault: String(run.action).slice('inject-'.length),
          class: first?.class ?? null, healedBy: first?.healedBy ?? null, rungs: first?.steps ?? [], repeats: first?.repeats ?? 0,
          openedAfterMs: first?.openedAfterMs ?? null, healedAfterMs: first?.healedAfterMs ?? null,
          clearedBy: first?.clearedBy ?? null, afterFaultEndMs: first?.afterFaultEndMs ?? null,
          confirmedAfterMs: first?.confirmedAfterMs ?? first?.healedAfterMs ?? null, receipts: heal?.receipts?.length ?? 0,
          tinySizes: heal?.tinySizes ?? null, passErrors: heal?.passErrors?.length ?? 0,
          // a NaN fault's own readback: did a non-finite value reach its target (a fault that landed nothing proves nothing)
          landed: detail.nanLanded ? (detail.nanLanded.nonFinite ? `non-finite ${detail.nanLanded.target ?? ''}`.trim() : 'finite') : null });
        continue;
      }
      const key = `${target}|${chrome}|${scenario}|dsf${summary.dsf ?? 1}|${run.map}`;
      const row = rows.get(key) ?? { target, chrome, scenario, dsf: summary.dsf ?? 1, map: run.map, runs: 0, black: 0, suspect: 0,
        errors: 0, unwatched: 0, incidents: 0, incidentClasses: [], frames: 0, blackFrames: 0, longestS: 0, maxGapS: 0, emptyPassFrames: 0,
        firstAt: [], parts: new Set() };
      row.parts.add(path.basename(dir));
      rows.set(key, row);
      const guard = run.guard ?? detail.guard ?? null;
      const own = ownIncidents(guard, injectedSoFar);
      const noteIncidents = () => {
        if (!own) return;
        row.incidents += own;
        for (const receipt of (guard.receipts ?? []).slice(-own)) row.incidentClasses.push(`${receipt.class}:${receipt.healedBy ?? 'open'}`);
      };
      const frames = naturalFrames(detail.frames, summary.control);
      const seen = frames.filter(black).length;
      if (run.verdict === 'harness-error') {
        // (round 2, D3) an unwatched window still reports what it saw: the guard's incidents, any black frame
        row.errors++;
        noteIncidents();
        if (seen) { row.black++; row.blackFrames += seen; }
        continue;
      }
      const coverage = sampleCoverage(frames, summary.seconds ?? 25);
      // a window nobody watched (detached page, every grab failed) is a harness error, never a clean run
      if (!coverage.ok && !seen) { row.errors++; row.unwatched++; noteIncidents(); continue; }
      row.runs++;
      row.maxGapS = Math.max(row.maxGapS, coverage.maxGapS);
      // the harness's frame-accurate scene-pass monitor: battle frames presented (cover lifted) whose scene pass drew nothing
      row.emptyPassFrames += detail.scenePass?.presentedEmptyInWindow ?? (summary.scenario === 'cold'
        ? (detail.scenePass?.recent ?? []).filter((r) => r.cover === false).length : 0);
      const suspect = frames.filter((frame) => !black(frame) && frame.blackFrac > SUSPECT_BLACK_FRAC && frame.st?.hud !== false).length;
      if (seen) row.black++;
      else if (suspect) row.suspect++;
      row.frames += frames.filter((frame) => frame.mean != null).length;
      row.blackFrames += seen;
      row.longestS = Math.max(row.longestS, +(longestBlackRun(frames, zeroFrac, blackWorldFrac) * (summary.intervalMs ?? 250) / 1000).toFixed(2));
      const first = frames.find(black);
      if (first) row.firstAt.push(first.at);
      // per-row counts (guard.total present) are the row's own; older rows held the page's running total
      noteIncidents();
    }
  }
  const table = [...rows.values()].sort((a, b) => a.target.localeCompare(b.target) || a.scenario.localeCompare(b.scenario)
    || a.map.localeCompare(b.map));
  const totals = table.reduce((sum, row) => ({ runs: sum.runs + row.runs, black: sum.black + row.black, errors: sum.errors + row.errors,
    unwatched: sum.unwatched + row.unwatched, incidents: sum.incidents + row.incidents, frames: sum.frames + row.frames,
    blackFrames: sum.blackFrames + row.blackFrames, emptyPassFrames: sum.emptyPassFrames + row.emptyPassFrames }),
  { runs: 0, black: 0, errors: 0, unwatched: 0, incidents: 0, frames: 0, blackFrames: 0, emptyPassFrames: 0 });
  return { table, injections, totals };
}

export function formatSummary({ table, injections, totals }) {
  const lines = [];
  lines.push('| target | chrome | scenario | dsf | map | runs | BLACK-WORLD runs | suspect | harness errors | guard incidents | black frames / frames | longest black (s) | first black at (s) | max sample gap (s) | empty scene-pass frames | parts |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of table) {
    lines.push(`| ${r.target} | ${r.chrome} | ${r.scenario} | ${r.dsf} | ${r.map} | ${r.runs} | ${r.black} | ${r.suspect} | ${r.errors}${r.unwatched ? ` (${r.unwatched} unwatched)` : ''} | `
      + `${r.incidents}${r.incidentClasses.length ? ` (${r.incidentClasses.join(', ')})` : ''} | ${r.blackFrames} / ${r.frames} | ${r.longestS} | `
      + `${r.firstAt.join(', ') || '-'} | ${r.maxGapS} | ${r.emptyPassFrames} | ${[...r.parts].join(' ')} |`);
  }
  lines.push('');
  lines.push(`total: ${totals.black} BLACK-WORLD runs of ${totals.runs} (${totals.errors} harness errors, ${totals.unwatched} of them unwatched windows); `
    + `${totals.blackFrames} black frames of ${totals.frames}; ${totals.emptyPassFrames} presented empty scene-pass frames; `
    + `${totals.incidents} guard incidents on natural runs`);
  if (injections.length) {
    lines.push('');
    lines.push('| part | map | injected fault | guard class | healed by | rungs | opened after (ms) | world back after (ms) | confirmed after (ms) | cleared at the fault\'s end (ms after it) | tiny sizes | pass errors | fault landed |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of injections) {
      lines.push(`| ${r.part} | ${r.map} | ${r.fault} | ${r.class ?? 'none'} | ${r.healedBy ?? '-'} | ${r.rungs.join(' ') || '-'}${r.repeats ? ` (H1 x${r.repeats})` : ''} | `
        + `${r.openedAfterMs ?? '-'} | ${r.healedAfterMs ?? '-'} | ${r.confirmedAfterMs ?? '-'} | ${r.clearedBy === 'fault-end' ? (r.afterFaultEndMs ?? '-') : '-'} | `
        + `${r.tinySizes ?? '-'} | ${r.passErrors} | ${r.landed ?? '-'} |`);
    }
  }
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: black-world-repro-summary.mjs <part dir> ...'); process.exit(2); }
  console.log(formatSummary(summarizeParts(dirs)));
}
