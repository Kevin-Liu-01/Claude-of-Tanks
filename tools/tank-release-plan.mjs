import {isPhotoReference} from './photo-reference-policy.mjs';
import {FLEET_GROUP_BY_ID} from '../src/vehicles/fleetManifest.ts';
import {validateSelectedIds,partitionConceptIds} from './first-party-concept-policy.mjs';
/** Declarative release composition, tested without launching browser children. */
export function tankReleaseSteps(ids, gate, node = process.execPath) {
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
    cpu('gen-combat-anatomy','--check'),
    gpu('presentation-centering','--check',selected),
    gpu('module-visual-align-probe',selected,'--gate'),
    cpu('module-hit-probe',selected),
    gpu('tank-assets-check',selected),
    gpu('track-duplicate-audit',selected),
    gpu('muzzle-bore-probe',selected),
    gpu('turret-barrel-circularity',selected),
    {command:'npm',args:['test'],capture:false},
    {command:'npm',args:['run','build:private'],capture:true},
  ];
}

/**
 * Fast checks (2026-09-15): the same steps, grouped into stages the check runs one after the
 * other, with every step inside a stage running concurrently. Stage 1 is the load-sensitive
 * browser scoring (standard → sealed → fidelity) and stays serial. Stage 2 runs the fleet-wide
 * node probes side by side with the receipt suite and the production build: they read the same
 * tree, never write to it, and the GPU children still serialise through the capture queue.
 * A stage stops at its first failure; a later stage never starts after a failed one.
 */
export function tankReleaseStages(ids, gate, node = process.execPath) {
  const steps = tankReleaseSteps(ids, gate, node);
  const tool = (step) => (step.command === node ? step.args[0] : `${step.command} ${step.args.join(' ')}`);
  const serialTools = new Set(['tools/tank-standard-check.mjs', 'tools/tank-sealed-check.mjs', 'tools/procedural-fidelity.mjs']);
  const serial = steps.filter((step) => serialTools.has(tool(step)));
  const parallel = steps.filter((step) => !serialTools.has(tool(step)));
  return [
    { name: 'scoring', concurrency: 1, steps: serial },
    { name: 'fleet probes, receipts and build', concurrency: 4, steps: parallel },
  ];
}
