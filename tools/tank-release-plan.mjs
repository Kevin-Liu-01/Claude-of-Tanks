/** Declarative release composition, tested without launching browser children. */
export function tankReleaseSteps(ids, gate, node = process.execPath) {
  if (!ids.split(',').every(id=>id.trim().length>0)) throw new Error('release requires nonempty tank IDs');
  const selected=`--ids=${ids}`;
  const cpu=(tool,...args)=>({command:node,args:[`tools/${tool}.mjs`,...args],capture:false});
  const gpu=(tool,...args)=>({...cpu(tool,...args),capture:true});
  return [
    cpu('gen-combat-anatomy','--check'),
    gpu('presentation-centering','--check',selected),
    gpu('module-visual-align-probe',selected,'--gate'),
    cpu('module-hit-probe',selected),
    gpu('tank-assets-check',selected),
    gpu('track-duplicate-audit',selected),
    gpu('muzzle-bore-probe',selected),
    gpu('turret-barrel-circularity',selected),
    // Strict source release requires BOTH outline/fidelity and geometry.
    ...(gate ? [gpu('procedural-fidelity',selected,'--check','--board','--neutral-board')] : []),
    // This child queues its individual render phases; never nest a lock.
    cpu('tank-standard-check',selected,...(gate?['--gate']:[])),
    {command:'npm',args:['test'],capture:false},
    {command:'npm',args:['run','build:private'],capture:false},
  ];
}
