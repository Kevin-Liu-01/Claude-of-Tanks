/** Declarative release composition, tested without launching browser children. */
export function tankReleaseSteps(ids, gate, node = process.execPath) {
  if (!ids.split(',').every(id=>id.trim().length>0)) throw new Error('release requires nonempty tank IDs');
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
    ...(gate ? [gpu('procedural-fidelity',selected,'--check','--board','--neutral-board')] : []),
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
