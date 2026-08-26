export { createAimController } from './aimController.ts';
export {
  computeDispersionRadM,
  shotRecoilScale,
} from '../sim/movement.js';
export {
  tankPoseFromState,
  traceTank,
} from '../sim/armor.js';
export {
  selectShell,
  resolveShellHit,
  createCombatState,
  repairAllModules,
  startMagazineReload,
} from '../sim/damage.js';
export { createShell } from '../sim/ballistics.js';
export {
  activateSpecialAction,
  specialActionLocksShell,
} from '../sim/specialActions.js';
export { isPostwarVehicleEra } from '../vehicles/taxonomy.js';
