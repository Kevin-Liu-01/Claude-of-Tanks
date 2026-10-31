// npm run gate:repin -- --ids=a,b[,...] [--chunk=10]: re-pin the geometry gate's rows (body height, hull span and every
// other component) for ids whose geometry a merge moved. Each chunk is one tools/geometry-gate.mjs --repin run under one
// render capture ticket, so a hold stays short; an oracle missing from this checkout stops the run before anything is
// written, and the first failing chunk stops the rest. An id the page cannot measure keeps its previous row, marked
// repinError, and the run exits 1 naming it. Then each id's height and hull-length rows are printed from its record
// (docs/GEOMETRY-GATE.md). First-party tooling: Kevin B. Liu.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runCapturedCommand } from './capture-command.mjs';
import { uniqueIds } from './id-list.mjs';

/** `ids` in runs of `size` (each run is one capture ticket). */
export function repinChunks(ids, size = 10) {
  if (!Number.isInteger(size) || size < 1) throw new Error(`--chunk must be a positive integer (got ${size})`);
  const chunks = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

/** Run every chunk through `run(chunk)` in order; the first that throws stops the rest. */
export async function repinAll(ids, { size = 10, run }) {
  const chunks = repinChunks(ids, size);
  for (const [i, chunk] of chunks.entries()) {
    try { await run(chunk); } catch (error) {
      return { done: chunks.slice(0, i).flat(), failed: chunk, rest: chunks.slice(i + 1).flat(), error };
    }
  }
  return { done: chunks.flat(), failed: null, rest: [], error: null };
}

/** The ids among `ids` whose ledger row a re-pin could not replace (geometry-gate.mjs --repin marks them). */
export function notRepinned(ledger, ids) {
  const want = new Set(ids);
  return (ledger?.rows || []).filter((row) => want.has(row.id) && row.repinError).map((row) => ({ id: row.id, error: row.repinError }));
}

/** One record's height and hull-length rows, as the gate measured them. */
export function dimsSummary(record) {
  const pct = (row) => (Number.isFinite(row?.pct) ? `${row.pct.toFixed(1)}%` : 'n/a');
  const m = (v) => (Number.isFinite(v) ? v.toFixed(3) : '-');
  const rows = Object.fromEntries((record.dimRows || []).map((row) => [row.name, row]));
  const h = rows.heightM, l = rows.hullLengthM;
  const height = h ? `height ${m(h.actual)}${h.roofFittingsTop != null ? `..${m(h.roofFittingsTop)}` : ''} vs ${m(h.published)} ${pct(h)}` : 'height -';
  const hull = l ? `hull ${m(l.actual)} vs ${m(l.published)} ${pct(l)}${l.method ? ` (${l.method})` : ''}` : 'hull -';
  return `${record.id.padEnd(20)} geo ${String(record.geoMin).padStart(5)}/${record.requiredMinimum ?? 90} dims ${record.components?.dims ?? '-'}  ${height}  ${hull}`;
}

async function main() {
  const args = process.argv.slice(2);
  const idsArg = args.find((a) => a.startsWith('--ids='));
  const ids = uniqueIds(idsArg ? idsArg.slice(6).split(',').map((s) => s.trim()).filter(Boolean) : [], 'gate:repin --ids');
  if (!ids.length) throw new Error('usage: npm run gate:repin -- --ids=a,b[,...] [--chunk=10]');
  const chunkArg = args.find((a) => a.startsWith('--chunk='));
  const size = chunkArg ? Number(chunkArg.slice(8)) : 10;
  const run = (chunk) => runCapturedCommand(process.execPath, ['tools/geometry-gate.mjs', `--ids=${chunk.join(',')}`, '--repin'],
    { stdio: 'inherit' }, { lockClass: 'render', timeoutMs: 6 * 3600 * 1000 });
  const recordOf = (id) => { try { return fs.readFileSync(path.join('docs', 'geometry-gate', `${id}.json`), 'utf8'); } catch { return null; } };
  const before = new Map(ids.map((id) => [id, recordOf(id)]));
  const result = await repinAll(ids, { size, run });
  const kept = new Map(notRepinned(JSON.parse(fs.readFileSync(path.join('docs', 'geometry-gate', 'ledger.json'), 'utf8')), result.done)
    .map(({ id, error }) => [id, error]));
  for (const id of result.done) {
    const text = recordOf(id);
    // an unregistered id is skipped by the gate (it names them), so its record, if any, is left as it was
    if (kept.has(id)) console.log(`${id.padEnd(20)} not re-pinned (previous row kept): ${kept.get(id)}`);
    else console.log(text == null ? `${id.padEnd(20)} no record` : `${dimsSummary(JSON.parse(text))}  [${text === before.get(id) ? 'unchanged' : 'moved'}]`);
  }
  if (result.failed) {
    console.error(`[gate:repin] stopped at ${result.failed.join(',')}: ${result.error.message}`);
    if (result.rest.length) console.error(`[gate:repin] not run: ${result.rest.join(',')}`);
    process.exitCode = 1;
  } else if (kept.size) {
    console.error(`[gate:repin] ${result.done.length - kept.size} id(s) re-measured; ${kept.size} not re-pinned (${[...kept.keys()].join(', ')}): `
      + 'their rows keep the previous measurement, marked repinError, for their owners to fix');
    process.exitCode = 1;
  } else console.log(`[gate:repin] ${result.done.length} id(s) re-measured; commit docs/geometry-gate/ (records and ledger.json)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
