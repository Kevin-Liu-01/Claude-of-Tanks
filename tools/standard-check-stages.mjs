// tank-standard-check --stages (2026-10-16, test-speed R4b part 1): run and report EVERY stage for every id.
// In 226 `tank-standard-check --gate` stopped at the forced geometry phase (red since August), so B2-B4 never ran on
// most ids and ten contiguity/decor regressions surfaced only at 20:45. With --stages a failing stage is recorded and
// the next stage still runs; the exit stays non-zero when any gated stage fails for any id, or any stage itself fails.
// Without --stages the tool keeps its old behaviour and stops at the first failing stage.

/** Every stage in report order. An id's A stage is one of geometry / concept / photo, by its class. */
export const STANDARD_STAGES = Object.freeze([
  Object.freeze({ key: 'geometry', label: 'A geometry gate' }),
  Object.freeze({ key: 'concept', label: 'A concept proof' }),
  Object.freeze({ key: 'photo', label: 'A photo proof' }),
  Object.freeze({ key: 'clip', label: 'B4 track clip' }),
  Object.freeze({ key: 'contiguity', label: 'B2 contiguity' }),
  Object.freeze({ key: 'decor', label: 'B3 decor' }),
]);
const A_STAGES = Object.freeze(['geometry', 'concept', 'photo']);
const B_STAGES = Object.freeze(['clip', 'contiguity', 'decor']);
/** PASS and FAIL are gated verdicts; SKIP (--no-render) and N/A (no registered comparison) never fail a run. */
const STAGE_STATUSES = Object.freeze(['PASS', 'FAIL', 'SKIP', 'N/A']);

/** The status of one gated check: a verdict when it ran, SKIP when the run left it out. */
export function stageStatus(ran, passed) {
  if (!ran) return 'SKIP';
  return passed ? 'PASS' : 'FAIL';
}

/**
 * Wrap each stage of the tool. Without `runAll` a stage failure propagates exactly as the bare code did (the tool
 * stops at the first failing stage). With `runAll` the failure is recorded with its stage and id, and the caller
 * moves on to the next stage; a recorded failure always fails the run.
 */
export function createStageRunner({ runAll = false, log = () => {} } = {}) {
  const failures = [];
  function fail(stage, error, id = null) {
    if (!STANDARD_STAGES.some(entry => entry.key === stage) && stage !== 'render')
      throw new Error(`unknown standard-check stage ${stage}`);
    const reason = String(error?.message ?? error).slice(0, 240);
    failures.push({ stage, id, reason });
    log(`[standard-check] stage ${stage}${id ? ` ${id}` : ''} FAILED: ${reason} (--stages: the next stage still runs)`);
  }
  async function run(stage, task, id = null) {
    if (!runAll) return task();
    try {
      return await task();
    } catch (error) {
      fail(stage, error, id);
      return undefined;
    }
  }
  return { runAll, failures, fail, run };
}

/** Each row must carry exactly one A stage and all three B stages: a stage that was never reported fails loudly. */
function assertCompleteRow(row) {
  if (typeof row?.id !== 'string' || !row.id) throw new Error('stage row without an id');
  const keys = Object.keys(row.stages ?? {});
  const a = keys.filter(key => A_STAGES.includes(key));
  if (a.length !== 1) throw new Error(`${row.id}: expected exactly one A stage, got ${a.join(',') || 'none'}`);
  for (const key of B_STAGES) if (!keys.includes(key)) throw new Error(`${row.id}: stage ${key} was not reported`);
  for (const key of keys) {
    if (!A_STAGES.includes(key) && !B_STAGES.includes(key)) throw new Error(`${row.id}: unknown stage ${key}`);
    if (!STAGE_STATUSES.includes(row.stages[key])) throw new Error(`${row.id}: unknown ${key} status ${row.stages[key]}`);
  }
  if (row.stages.clip === 'SKIP' || row.stages.clip === 'N/A' || row.stages[a[0]] === 'SKIP')
    throw new Error(`${row.id}: the A stage and B4 always run`);
}

/** Per-stage pass/fail/skip id lists (complete, never truncated) and the exit verdict. */
export function summarizeStages(rows, failures = []) {
  const seen = new Set();
  for (const row of rows) {
    assertCompleteRow(row);
    if (seen.has(row.id)) throw new Error(`${row.id}: reported twice`);
    seen.add(row.id);
  }
  const stages = STANDARD_STAGES.map(({ key, label }) => {
    const ids = { PASS: [], FAIL: [], SKIP: [], 'N/A': [] };
    for (const row of rows) if (Object.hasOwn(row.stages, key)) ids[row.stages[key]].push(row.id);
    return { key, label, pass: ids.PASS, fail: ids.FAIL, skip: ids.SKIP, notApplicable: ids['N/A'] };
  }).filter(stage => stage.pass.length + stage.fail.length + stage.skip.length + stage.notApplicable.length > 0);
  const failedIds = rows.filter(row => Object.values(row.stages).includes('FAIL')).map(row => row.id);
  const passed = failedIds.length === 0 && failures.length === 0;
  return { ids: rows.length, stages, failures: failures.map(failure => ({ ...failure })), failedIds, passed,
    exitCode: passed ? 0 : 2 };
}

/** The console block printed after the per-tank table. */
export function formatStageSummary(summary) {
  const lines = [`[standard-check] --stages: every stage ran for ${summary.ids} id${summary.ids === 1 ? '' : 's'}`];
  for (const stage of summary.stages) {
    const counts = [`${stage.pass.length} pass`, `${stage.fail.length} FAIL`];
    if (stage.skip.length) counts.push(`${stage.skip.length} skipped`);
    if (stage.notApplicable.length) counts.push(`${stage.notApplicable.length} n/a`);
    lines.push(`  ${stage.label.padEnd(16)} ${counts.join(', ')}${stage.fail.length ? `: ${stage.fail.join(', ')}` : ''}`);
  }
  for (const failure of summary.failures)
    lines.push(`  stage error      ${failure.stage}${failure.id ? ` ${failure.id}` : ''}: ${failure.reason}`);
  lines.push(`[standard-check] --stages verdict: ${summary.passed ? 'PASS' : 'FAIL'}` +
    ` (${summary.failedIds.length} id${summary.failedIds.length === 1 ? '' : 's'} fail a gated stage,` +
    ` ${summary.failures.length} stage error${summary.failures.length === 1 ? '' : 's'})`);
  return lines;
}
