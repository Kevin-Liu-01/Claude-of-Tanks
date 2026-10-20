import {isPhotoReference} from './photo-reference-policy.mjs';
import {FLEET_GROUP_BY_ID} from '../src/vehicles/fleetManifest.ts';
import {validateSelectedIds,partitionConceptIds} from './first-party-concept-policy.mjs';
import {uniqueIds} from './id-list.mjs';
/**
 * The command line of tools/tank-release-check.mjs, parsed here so the selftest exercises it.
 * `--lane` (lane mode, 2026-10-16, test-speed R8e) skips the embedded `npm test` and
 * `npm run build:private`; the default integrator mode is unchanged. `--dry-run` prints the plan and runs nothing.
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
 * Lane mode (`{lane:true}`, 2026-10-16, test-speed R8e) drops exactly the embedded `npm test` and
 * `npm run build:private`: the release gate runs every receipt and `npm run build` (build:private's
 * commands plus the public strip) once per release, docs/DEVELOPMENT.md "Fast checks". Every other
 * step, flag and id scope is the integrator mode's, byte for byte. That includes the fleet-wide
 * combat-anatomy freshness check: a shared-builder edit can stale rows of tanks the lane did not
 * select, and nothing proves their inputs unchanged (the COVERAGE RULE), so it is never scoped here.
 */
export function tankReleaseSteps(ids, gate, node = process.execPath, {lane = false} = {}) {
  if (!ids.split(',').every(id=>id.trim().length>0)) throw new Error('release requires nonempty tank IDs');
  // a repeated id fails by name before any step (2026-10-16, test-speed R4c; tools/id-list.mjs)
  const selectedIds=validateSelectedIds(uniqueIds(ids.split(','),'tank:release:check --ids'),Object.keys(FLEET_GROUP_BY_ID));
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
    // --stages (2026-10-16, test-speed R4b): a red geometry gate no longer hides
    // B2-B4; every stage reports for every id and any gated red still fails.
    {...cpu('tank-standard-check',selected,...(gate?['--gate']:[]),'--stages'),capture:false},
    // Sealed hull (2026-09-13): no view may look into the tank through a culled
    // or missing face; each id is held to docs/geometry-gate/sealed.json.
    cpu('tank-sealed-check',selected,'--ledger=docs/geometry-gate/sealed.json',...(gate?['--gate']:[])),
    ...(gate && comparisons.length ? [gpu('procedural-fidelity',`--ids=${comparisons.join(',')}`,'--check','--board','--neutral-board')] : []),
    // Fleet-wide in both modes: gen-combat-anatomy --check --ids would compare every unselected row
    // with itself, so a shared cage or barrel builder could leave other tanks' rows stale unseen.
    cpu('gen-combat-anatomy','--check'),
    // 2026-10-11 (217's closure; 211's TTS before it): a geometry change could pass this check and then
    // fail the closure's ledger and mission-seat checks. Both receipts now gate here, scoped to the ids.
    cpu('fleet-geometry-ledger','--check',selected),
    cpu('gen-mission-attachment-seats','--check',selected),
    gpu('presentation-centering','--check',selected),
    gpu('module-visual-align-probe',selected,'--gate'),
    cpu('module-hit-probe',selected),
    // VEH-13 (2026-10-15): every spare-track run measured afresh, equal to its ledger row and clean
    cpu('spare-track-placement-check',selected,'--ledger=docs/geometry-gate/spare-track.json',...(gate?['--gate']:[])),
    // 2026-10-17 (the wheel-band lane): every opaque lit material each id draws holds its own vehicle registration (an
    // untagged pixel under the belly line is ground to the aerial pass: the band through the road wheels)
    cpu('vehicle-material-registration',selected),
    // 227 gun-gaps (2026-10-18): every main gun line re-measured (4 mm, 12 directions, rest/limits/half travel), equal
    // to its ledger row and bound to the turret and gun geometry it was measured on
    cpu('gun-junction-census',selected,'--ledger=docs/geometry-gate/gun-junction.json','--check',...(gate?['--gate']:[])),
    gpu('tank-assets-check',selected),
    gpu('track-duplicate-audit',selected),
    gpu('muzzle-bore-probe',selected),
    gpu('turret-barrel-circularity',selected),
    // Integrator mode only: lane mode leaves the whole suite and the build to the release gate.
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
 * Lane mode has the same two stages; the second holds the same probes without the suite and the build.
 */
export function tankReleaseStages(ids, gate, node = process.execPath, {lane = false} = {}) {
  const steps = tankReleaseSteps(ids, gate, node, {lane});
  const tool = (step) => (step.command === node ? step.args[0] : `${step.command} ${step.args.join(' ')}`);
  const serialTools = new Set(['tools/tank-standard-check.mjs', 'tools/tank-sealed-check.mjs', 'tools/procedural-fidelity.mjs']);
  const serial = steps.filter((step) => serialTools.has(tool(step)));
  const parallel = steps.filter((step) => !serialTools.has(tool(step)));
  return [
    { name: 'scoring', concurrency: 1, steps: serial },
    { name: lane ? 'fleet probes' : 'fleet probes, receipts and build', concurrency: 4, steps: parallel },
  ];
}

/**
 * Everything tools/tank-release-check.mjs decides before it runs a step, as data.
 * Lane mode never stands in for the suite or the build: `notes` say so before the run and after a PASS.
 */
export function tankReleaseInvocation(argv, node = process.execPath) {
  const { ids, gate, lane, dryRun } = tankReleaseArgs(argv);
  if (!ids) return { usage: 'usage: node tools/tank-release-check.mjs --ids=a,b [--gate] [--lane] [--dry-run]' };
  const mode = lane ? 'lane' : 'integrator';
  return {
    ids, gate, lane, dryRun, mode,
    header: `${mode} mode${gate ? ' --gate' : ''}: ${ids}`,
    notes: lane ? [TANK_RELEASE_LANE_NOTE] : [],
    stages: tankReleaseStages(ids, gate, node, { lane }),
  };
}

/** What a lane run skipped, and where each skipped command still runs. */
export const TANK_RELEASE_LANE_NOTE = 'npm test and npm run build:private NOT RUN (lane mode): the integrator mode runs both; '
  + 'the release gate runs every receipt and npm run build (the same vite build and localized pages, plus the public strip)';

export const tankReleaseLabel = ({ command, args }) => `${command} ${args.join(' ')}`;

/** The plan as `--dry-run` prints it: each stage, then its steps' command lines. */
export function tankReleasePlanLines({ stages }) {
  return stages.flatMap((stage) => [
    `[tank-release] stage "${stage.name}": ${stage.steps.length} step(s), ${Math.min(stage.concurrency, stage.steps.length)} at a time`,
    ...stage.steps.map((step) => `  ${tankReleaseLabel(step)}`),
  ]);
}

/**
 * tools/tank-release-check.mjs after its imports, with the child runners injected so the selftest drives
 * the real control flow (output order, stages, failure reporting, exit status) with fake children; the CLI
 * passes the spawning runners from capture-command.mjs and exits with the returned status.
 * Returns 0 for a PASS or a dry run, 1 for usage, otherwise the earliest failed step's status (2 without one).
 * An unknown, repeated or empty id prints a FAIL line and returns 2 like a failed step, never a stack trace.
 */
export async function runTankRelease(argv, { runCommand, runCapturedCommand, node = process.execPath,
  log = console.log, error = console.error, now = () => performance.now() }) {
  let release;
  try { release = tankReleaseInvocation(argv, node); }
  catch (failure) {
    const { ids, lane } = tankReleaseArgs(argv);
    error(`\n[tank-release] FAIL (${lane ? 'lane' : 'integrator'} mode) ${ids}: ${failure.message}`);
    return failure.status || 2;
  }
  if (release.usage) { error(release.usage); return 1; }
  const printNotes = () => { for (const note of release.notes) log(`[tank-release] ${note}`); };
  log(`[tank-release] ${release.header}`);
  printNotes();
  if (release.dryRun) {
    for (const line of tankReleasePlanLines(release)) log(line);
    return 0;
  }

  const label = tankReleaseLabel;
  async function run(step) {
    log(`\n[tank-release] ${label(step)}`);
    // Standard checking manages its own render phases. Wrapping that entire
    // child would deadlock its queue; wrap only otherwise-unlocked probes.
    const execute = step.capture ? runCapturedCommand : runCommand;
    const started = now();
    try { await execute(step.command, step.args); }
    catch (failure) { failure.step = label(step); throw failure; }
    log(`\n[tank-release] done ${label(step)} (${((now() - started) / 1000).toFixed(0)} s)`);
  }

  // Fast checks (2026-09-15): stages run in order; the steps of a stage run concurrently
  // (bounded), every failure of a stage is reported, and the earliest failed step's status wins.
  async function runStage({ name, concurrency, steps }) {
    log(`\n[tank-release] stage "${name}": ${steps.length} step(s), ${Math.min(concurrency, steps.length)} at a time`);
    const failures = [];
    let next = 0;
    const worker = async () => {
      while (next < steps.length) {
        const index = next++;
        try { await run(steps[index]); }
        catch (failure) { failures.push({ index, failure }); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, steps.length) }, worker));
    if (failures.length) {
      failures.sort((a, b) => a.index - b.index);
      for (const { failure } of failures) error(`[tank-release] FAILED step: ${failure.step} (${failure.message})`);
      throw failures[0].failure;
    }
  }

  const started = now();
  try {
    for (const stage of release.stages) await runStage(stage);
  } catch (failure) {
    error(`\n[tank-release] FAIL (${release.mode} mode) ${release.ids}`);
    return failure.status || 2;
  }
  log(`\n[tank-release] PASS (${release.mode} mode) ${release.ids} (${((now() - started) / 60000).toFixed(1)} min)`);
  printNotes();
  return 0;
}
