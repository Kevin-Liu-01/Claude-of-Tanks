#!/usr/bin/env node
// §B2 HIDDEN-GAP LEDGER (guards 229) — the fleet hidden-gap audit, committed.
//
// The hull-anchored lattice (tools/contig-grid.mjs) scans every sub-cell phase, so it finds enclosed 6-10 cm plan gaps
// the pre-227 AABB-framed raster only saw by luck of alignment. Those gaps are real and old: on integ/229 the audit
// (`node tools/contig-phase-audit.mjs --all`) reads them on dozens of tanks the old gate called clean. Turning the
// lattice on would fail each of those tanks the next time anything else about it is gated, for a gap nobody touched.
// This ledger lists exactly those gaps, per id, as the audit measured them on integ/229: the gaps the lattice sees and
// the old raster did not (`seenOnMain: false` in the audit rows). tank-standard-check's §B2 verdict reads every
// listed gap as known (a vehicle lane's work order, printed on every gate run) and fails on anything else: a gap the
// ledger does not hold, or a listed gap that grew past its box. A gap the old raster also saw is never listed: it was
// already red and stays red. A closed gap only leaves the ledger (--prune); a new one is a defect to fix.
//
// Boxes are exact. The lattice's pixels are CONTIG_CELL_M / 3 (2 cm) squares at fixed multiples from the tank root, so
// a gap's plan extent is an integer pixel box in the vehicle frame that an unrelated add-on cannot move (the 226 class).
//
//   node tools/contig-hidden-gaps.mjs --from=<audit.jsonl> --init [--audited=<text>]   write the ledger (refuses if present)
//   node tools/contig-hidden-gaps.mjs --from=<audit.jsonl> --prune --ids=a,b           drop listed gaps the audit no longer reads
//   node tools/contig-hidden-gaps.mjs --from=<audit.jsonl> --accept=<id>[,<id>]:<reason>
//        record an id's current unlisted gaps with a reason (an explicit decision; the default for a new gap is a fix)
//   node tools/contig-hidden-gaps.mjs --report                                         the listed gaps, per id
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONTIG_CELL_M } from './contig-grid.mjs';

export const CONTIG_HIDDEN_LEDGER = 'docs/geometry-gate/contig-hidden.json';
const PIXEL_M = CONTIG_CELL_M / 3;
const localDate = () => new Date().toLocaleDateString('en-CA');

/** The vehicle-frame pixel box [ix0, iz0, ix1, iz1] (inclusive, 2 cm pixels) of a gap reported as centre and plan
 * extent in metres (contigScan's gaps / phaseOnlyGaps, the audit's gaps: x, z, w, d). */
export function gapPixelBox({ x, z, w, d }) {
  if (![x, z, w, d].every(Number.isFinite) || !(w > 0) || !(d > 0)) throw new Error('Expected a gap with finite x, z, w, d');
  return [Math.round((x - w / 2) / PIXEL_M), Math.round((z - d / 2) / PIXEL_M),
    Math.round((x + w / 2) / PIXEL_M) - 1, Math.round((z + d / 2) / PIXEL_M) - 1];
}

/** The pixel box of a primary-phase hole cell (a lattice cell centre x, z). */
export const cellPixelBox = ({ x, z }) => gapPixelBox({ x, z, w: CONTIG_CELL_M, d: CONTIG_CELL_M });
const within = (a, b) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
const overlaps = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/**
 * Apply an id's ledger row (an array of `{ box }`) to the page's anchored scan. Returns `scan`, the scan the openings
 * policy and contiguityPassed judge: the primary hole cells that lie inside a listed box removed, and phaseOnlyCells
 * counting only the phase-only gaps no listed box contains; `listed`, the listed boxes the scan still reads;
 * `closed`, the listed boxes it no longer reads (prune them); `unlisted`, the phase-only gaps outside every box.
 * A scan the ledger does not touch is returned as it is.
 */
export function applyHiddenGaps(scan, row) {
  const boxes = (row ?? []).map((gap) => gap.box);
  if (!scan || scan.error || !boxes.length) {
    return { scan, listed: [], closed: [], unlisted: scan?.phaseOnlyGaps ?? [], removedPrimary: 0 };
  }
  const gaps = scan.gaps ?? [];
  const live = boxes.filter((box) => gaps.some((gap) => overlaps(gapPixelBox(gap), box)));
  const closed = boxes.filter((box) => !live.includes(box));
  const samples = (scan.samples ?? []).filter((sample) => !boxes.some((box) => within(cellPixelBox(sample), box)));
  const unlisted = (scan.phaseOnlyGaps ?? []).filter((gap) => !boxes.some((box) => within(gapPixelBox(gap), box)));
  const removedPrimary = (scan.samples?.length ?? 0) - samples.length;
  return {
    scan: {
      ...scan, samples, holeCells: scan.holeCells - removedPrimary,
      phaseOnlyCells: unlisted.reduce((sum, gap) => sum + gap.cells, 0), phaseOnlyGaps: unlisted,
      // what the lattice read before the ledger, for the report
      ledger: { rawHoleCells: scan.holeCells, rawPhaseOnlyCells: scan.phaseOnlyCells, listedGaps: live.length },
    },
    listed: live, closed, unlisted, removedPrimary,
  };
}

// ---------------------------------------------------------------- the ledger file

function emptyHiddenLedger(audited) {
  return {
    schema: 1,
    tool: 'tools/contig-hidden-gaps.mjs',
    pixelM: PIXEL_M,
    audited,
    about: 'Per tank: the enclosed plan gaps the §B2 hull-anchored lattice (tools/contig-grid.mjs) reads and the pre-227 '
      + 'AABB raster did not, as tools/contig-phase-audit.mjs measured them. box = [ix0, iz0, ix1, iz1], inclusive pixel '
      + 'indices of the 2 cm vehicle-frame lattice (x lateral, z forward, from the tank root); at = centre (m), size = '
      + 'w x d (m), through = narrow width (m), phases = sub-cell phases that see it (of 9), walls = meshes 4 cm outside '
      + 'each side (-x, +x, -z, +z). tank-standard-check reads these as known work orders and fails on any other gap. '
      + 'Change rows only with tools/contig-hidden-gaps.mjs (--prune when a gap closes; --accept=<id>:<reason> for an '
      + 'explicit decision).',
    rows: {},
  };
}

/** A ledger entry from an audit gap. */
export function hiddenGapEntry(gap) {
  const round = (v) => Number(v.toFixed(3));
  return {
    box: gapPixelBox(gap), at: [round(gap.x), round(gap.z)], size: [round(gap.w), round(gap.d)], through: round(gap.gap),
    phases: gap.phases, walls: (gap.walls ?? []).map((w) => (w.mesh ? `${w.mesh}@${w.y.toFixed(2)}` : 'sky')).join(' / '),
  };
}

/** The ledger rows an audit's rows give: per id, its hidden gaps (seen by the lattice, not by the old raster), boxes
 * sorted. Throws on an error row: an id the audit could not scan has no measurement to record. */
export function hiddenRowsFromAudit(auditRows) {
  const rows = {};
  for (const row of auditRows) {
    if (row.error) throw new Error(`[contig-hidden] ${row.id}: the audit row is an error (${row.error}); re-scan it`);
    if (!Array.isArray(row.gaps)) throw new Error(`[contig-hidden] ${row.id}: the audit row has no gaps list`);
    const hidden = row.gaps.filter((gap) => gap.seenOnMain === false).map(hiddenGapEntry)
      .sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
    if (hidden.length) rows[row.id] = hidden;
  }
  return rows;
}

export function serializeHiddenLedger(ledger) {
  const { rows, ...head } = ledger;
  const ids = Object.keys(rows).sort();
  const body = ids.map((id, i) => `    ${JSON.stringify(id)}: ${JSON.stringify(rows[id])}${i < ids.length - 1 ? ',' : ''}`);
  const headLines = Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  return `{\n${headLines.join('\n')}\n  "rows": {\n${body.join('\n')}\n  }\n}\n`;
}

export function readHiddenLedger(root = process.cwd()) {
  const path = `${root}/${CONTIG_HIDDEN_LEDGER}`;
  if (!existsSync(path)) return null;
  const ledger = JSON.parse(readFileSync(path, 'utf8'));
  if (ledger.schema !== 1 || ledger.pixelM !== PIXEL_M || !ledger.rows || typeof ledger.rows !== 'object') {
    throw new Error(`[contig-hidden] ${CONTIG_HIDDEN_LEDGER}: unknown ledger shape`);
  }
  return ledger;
}

function readAudit(file) {
  const byId = new Map();
  for (const line of readFileSync(file, 'utf8').split('\n')) if (line.trim()) { const row = JSON.parse(line); byId.set(row.id, row); }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------- command line

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const flag = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
  const from = flag('from');
  const ids = flag('ids')?.split(',').filter(Boolean) ?? null;
  if (argv.includes('--report')) {
    const ledger = readHiddenLedger();
    if (!ledger) { console.error(`[contig-hidden] no ${CONTIG_HIDDEN_LEDGER}`); process.exit(2); }
    for (const [id, gaps] of Object.entries(ledger.rows)) {
      for (const g of gaps) console.log(`${id.padEnd(24)} (${g.at.map((v) => v.toFixed(2)).join(', ')}) ${g.size.map((v) => Math.round(v * 100)).join(' x ')} cm, through ${Math.round(g.through * 100)} cm, ${g.phases}/9 phases, walls ${g.walls}`);
    }
    console.log(`[contig-hidden] ${Object.values(ledger.rows).flat().length} listed gaps on ${Object.keys(ledger.rows).length} ids (${ledger.audited})`);
    process.exit(0);
  }
  if (!from) { console.error('usage: contig-hidden-gaps.mjs --from=<audit.jsonl> --init|--prune|--accept=<ids>:<reason> | --report'); process.exit(2); }
  const audit = readAudit(from);
  const auditById = new Map(audit.map((row) => [row.id, row]));
  if (argv.includes('--init')) {
    if (readHiddenLedger()) { console.error(`[contig-hidden] ${CONTIG_HIDDEN_LEDGER} exists; use --prune or --accept`); process.exit(2); }
    const ledger = emptyHiddenLedger(flag('audited') ?? `tools/contig-phase-audit.mjs --all, ${localDate()}`);
    ledger.rows = hiddenRowsFromAudit(audit);
    writeFileSync(CONTIG_HIDDEN_LEDGER, serializeHiddenLedger(ledger));
    console.log(`[contig-hidden] wrote ${Object.values(ledger.rows).flat().length} hidden gaps on ${Object.keys(ledger.rows).length} of ${audit.length} audited ids`);
    process.exit(0);
  }
  const ledger = readHiddenLedger();
  if (!ledger) { console.error(`[contig-hidden] no ${CONTIG_HIDDEN_LEDGER}: --init it from a fleet audit`); process.exit(2); }
  const need = (id) => {
    const row = auditById.get(id);
    if (!row || row.error) { console.error(`[contig-hidden] ${id}: no audit row in ${from}`); process.exit(2); }
    return row;
  };
  if (argv.includes('--prune')) {
    let dropped = 0;
    for (const id of ids ?? Object.keys(ledger.rows)) {
      if (!ledger.rows[id]) continue;
      const boxes = need(id).gaps.map(gapPixelBox);
      const kept = ledger.rows[id].filter((gap) => boxes.some((box) => overlaps(box, gap.box)));
      dropped += ledger.rows[id].length - kept.length;
      if (kept.length) ledger.rows[id] = kept; else delete ledger.rows[id];
    }
    writeFileSync(CONTIG_HIDDEN_LEDGER, serializeHiddenLedger(ledger));
    console.log(`[contig-hidden] pruned ${dropped} closed gap(s)`);
    process.exit(0);
  }
  const accept = flag('accept');
  if (accept) {
    const colon = accept.indexOf(':');
    const acceptIds = (colon < 0 ? '' : accept.slice(0, colon)).split(',').filter(Boolean);
    const reason = colon < 0 ? '' : accept.slice(colon + 1).trim();
    if (!acceptIds.length || reason.length < 12) { console.error('[contig-hidden] --accept=<id>[,<id>]:<reason, at least 12 characters>'); process.exit(2); }
    let added = 0;
    for (const id of acceptIds) {
      const listed = ledger.rows[id] ?? [];
      const fresh = need(id).gaps.map(hiddenGapEntry).filter((gap) => !listed.some((l) => within(gap.box, l.box)));
      for (const gap of fresh) listed.push({ ...gap, accepted: { reason, date: localDate() } });
      added += fresh.length;
      if (listed.length) ledger.rows[id] = listed.sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
    }
    writeFileSync(CONTIG_HIDDEN_LEDGER, serializeHiddenLedger(ledger));
    console.log(`[contig-hidden] accepted ${added} gap(s) on ${acceptIds.join(', ')}`);
    process.exit(0);
  }
  console.error('[contig-hidden] nothing to do: --init, --prune or --accept');
  process.exit(2);
}
