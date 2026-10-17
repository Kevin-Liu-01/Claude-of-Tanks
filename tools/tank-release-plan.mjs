import {isPhotoReference} from './photo-reference-policy.mjs';
import {FLEET_GROUP_BY_ID} from '../src/vehicles/fleetManifest.ts';
import {validateSelectedIds,partitionConceptIds} from './first-party-concept-policy.mjs';
/**
 * The command line of tools/tank-release-check.mjs, parsed here so the selftest exercises it.
 * `--lane` (lane mode, 2026-10-16, test-speed R8e) runs only the steps scoped to the selected ids; the
 * default integrator mode is unchanged. `--dry-run` prints the plan and runs nothing.
 */
export function tankReleaseArgs(argv) {
  const idArg = argv.find((arg) => arg.startsWith('--ids=')) || argv.find((arg) => arg.startsWith('--tanks='));
  return {
    ids: idArg ? idArg.slice(idArg.indexOf('=') + 1) : null,
    gate: argv.includes('--gate'),
    lane: argv.includes('--lane'),
    dryRun: argv.includes('--dry-run'),
  };
}

/**
 * Declarative release composition, tested without launching browser children.
 *
 * Lane mode (`{lane:true}`, 2026-10-16, test-speed R8e): a lane landing runs only the per-id steps.
 * It drops the embedded `npm test` and `npm run build:private` (the release gate runs the whole
 * suite and both builds once per release, docs/DEVELOPMENT.md "Fast checks") and scopes the
 * combat-anatomy freshness check to the selected ids (`gen-combat-anatomy --check --ids`: those
 * tanks re-measured, every other row as committed). Every other step, flag and id scope is the
 * integrator mode's, byte for byte. The integrator mode (the default) keeps all of it.
 */
export function tankReleaseSteps(ids, gate, node = process.execPath, {lane = false} = {}) {
  if (!ids.split(',').every(id=>id.trim().length>0)) throw new Error('release requires nonempty tank IDs');
  const selectedIds=validateSelectedIds(ids.split(','),Object.keys(FLEET_GROUP_BY_ID));
  const comparisons=partitionConceptIds(selectedIds).comparisons.filter(id=>!isPhotoReference(id));
  const selected=`--ids=${ids}`;
  // Fleet construction and builds share the resource queue with rendering.
  // Only children that already queue their own phases bypass this wrapper.
  const cpu=(tool,...args)=>({command:node,args:[`tools/${tool}.mjs`,...args],capture:true});
  const gpu=(tool,...args)=>({...cpu(tool,...args),capture:true});
  return [
    // Reject fitting/outline/continuity defects before full-fleet anatomy and
    // the integrated test/build tail. Same assertions and fresh measurements;
    // only ordering changes. This child already queues its render phases.
    {...cpu('tank-standard-check',selected,...(gate?['--gate']:[])),capture:false},
    // Sealed hull (2026-09-13): no view may look into the tank through a culled
    // or missing face; each id is held to docs/geometry-gate/sealed.json.
    cpu('tank-sealed-check',selected,'--ledger=docs/geometry-gate/sealed.json',...(gate?['--gate']:[])),
    ...(gate && comparisons.length ? [gpu('procedural-fidelity',`--ids=${comparisons.join(',')}`,'--check','--board','--neutral-board')] : []),
    // Fleet-wide in the integrator mode; the selected ids only in lane mode (the integrator mode and
    // `npm run tank:anatomy:check` re-measure the fleet).
    cpu('gen-combat-anatomy','--check',...(lane?[selected]:[])),
    // 2026-10-11 (217's closure; 211's TTS before it): a geometry change could pass this check and then
    // fail the closure's ledger and mission-seat checks. Both receipts now gate here, scoped to the ids.
    cpu('fleet-geometry-ledger','--check',selected),
    cpu('gen-mission-attachment-seats','--check',selected),
    gpu('presentation-centering','--check',selected),
    gpu('module-visual-align-probe',selected,'--gate'),
    cpu('module-hit-probe',selected),
    // VEH-13 (2026-10-15): every spare-track run measured afresh, equal to its ledger row and clean
    cpu('spare-track-placement-check',selected,'--ledger=docs/geometry-gate/spare-track.json',...(gate?['--gate']:[])),
    gpu('tank-assets-check',selected),
    gpu('track-duplicate-audit',selected),
    gpu('muzzle-bore-probe',selected),
    gpu('turret-barrel-circularity',selected),
    // Integrator mode only: lane mode leaves the whole suite and the private build to the release gate.
    ...(lane ? [] : [
      {command:'npm',args:['test'],capture:false},
      {command:'npm',args:['run','build:private'],capture:true},
    ]),
  ];
}

/**
 * Fast checks (2026-09-15): the same steps, grouped into stages the check runs one after the
 * other, with every step inside a stage running concurrently. Stage 1 is the load-sensitive
 * browser scoring (standard → sealed → fidelity) and stays serial. Stage 2 runs the fleet-wide
 * node probes side by side with the receipt suite and the production build: they read the same
 * tree, never write to it, and the GPU children still serialise through the capture queue.
 * A stage stops at its first failure; a later stage never starts after a failed one.
 * Lane mode has the same two stages; the second holds only the per-id probes.
 */
export function tankReleaseStages(ids, gate, node = process.execPath, {lane = false} = {}) {
  const steps = tankReleaseSteps(ids, gate, node, {lane});
  const tool = (step) => (step.command === node ? step.args[0] : `${step.command} ${step.args.join(' ')}`);
  const serialTools = new Set(['tools/tank-standard-check.mjs', 'tools/tank-sealed-check.mjs', 'tools/procedural-fidelity.mjs']);
  const serial = steps.filter((step) => serialTools.has(tool(step)));
  const parallel = steps.filter((step) => !serialTools.has(tool(step)));
  return [
    { name: 'scoring', concurrency: 1, steps: serial },
    { name: lane ? 'per-id probes' : 'fleet probes, receipts and build', concurrency: 4, steps: parallel },
  ];
}

/**
 * Everything tools/tank-release-check.mjs decides before it runs a step, as data, so the selftest
 * covers the command line in process (the CLI only prints this and runs `stages`).
 * Lane mode never stands in for the suite, the build or a fleet-wide anatomy check: `notes` say so
 * before the run and after a PASS. gen-combat-anatomy's own PASS line counts every row, re-measured or not.
 */
export function tankReleaseInvocation(argv, node = process.execPath) {
  const { ids, gate, lane, dryRun } = tankReleaseArgs(argv);
  if (!ids) return { usage: 'usage: node tools/tank-release-check.mjs --ids=a,b [--gate] [--lane] [--dry-run]' };
  const mode = lane ? 'lane' : 'integrator';
  return {
    ids, gate, lane, dryRun, mode,
    header: `${mode} mode${gate ? ' --gate' : ''}: ${ids}`,
    notes: lane ? [
      'npm test and npm run build:private NOT RUN (lane mode; the release gate runs both)',
      `combat anatomy re-measured for ${ids} only; every other row is compared as committed (the integrator mode re-measures the fleet)`,
    ] : [],
    stages: tankReleaseStages(ids, gate, node, { lane }),
  };
}

export const tankReleaseLabel = ({ command, args }) => `${command} ${args.join(' ')}`;

/** The plan as `--dry-run` prints it: each stage, then its steps' command lines. */
export function tankReleasePlanLines({ stages }) {
  return stages.flatMap((stage) => [
    `[tank-release] stage "${stage.name}": ${stage.steps.length} step(s), ${Math.min(stage.concurrency, stage.steps.length)} at a time`,
    ...stage.steps.map((step) => `  ${tankReleaseLabel(step)}`),
  ]);
}
