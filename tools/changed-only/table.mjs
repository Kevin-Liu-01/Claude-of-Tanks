// The step table a changed-only run uses: the repository's (tools/changed-only/steps.mjs) or a fixture module with the
// same exports (tools/changed-only/chain.selftest.mjs runs the real chain on a fixture fleet). First-party tooling:
// Kevin B. Liu.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_CONFIG } from './fingerprint.mjs';
import * as REPOSITORY from './steps.mjs';

/**
 * { path, STEPS, TABLES, CPU_FIXPOINT_STEPS, PRE_AGGREGATES, POST_AGGREGATES, config, stepByName }. A fixture module
 * exports STEPS, TABLES and CONFIG (computeState's config: tables, aggregates, fleet entries, loader files, the group
 * loaders file, declarations, accessors); the order and aggregate lists default from STEPS and to none.
 */
export async function loadTable(path = null) {
  const module = path ? await import(pathToFileURL(resolve(path)).href) : REPOSITORY;
  const STEPS = module.STEPS;
  const CPU_FIXPOINT_STEPS = module.CPU_FIXPOINT_STEPS
    ?? Object.freeze(STEPS.filter((step) => step.device === 'cpu' && !step.after).map((step) => step.name));
  return {
    path: path ? resolve(path) : null,
    STEPS, TABLES: module.TABLES, CPU_FIXPOINT_STEPS,
    PRE_AGGREGATES: module.PRE_AGGREGATES ?? [], POST_AGGREGATES: module.POST_AGGREGATES ?? [],
    config: module.CONFIG ?? DEFAULT_CONFIG,
    stepByName: (name) => STEPS.find((step) => step.name === name),
  };
}
