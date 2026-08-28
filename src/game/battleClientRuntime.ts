export { createAimController } from './aimController.ts';
export {
  computeDispersionRadM,
  shotRecoilScale,
} from '../sim/movement.ts';
export {
  tankPoseFromState,
  traceTank,
} from '../sim/armor.js';
export {
  selectShell,
  resolveShellHit,
  createCombatState,
  magazineReloadDenialReason,
  repairAllModules,
  startMagazineReload,
} from '../sim/damage.js';
export { createShell } from '../sim/ballistics.ts';
export {
  activateSpecialAction,
  specialActionLocksShell,
} from '../sim/specialActions.ts';
export { isPostwarVehicleEra } from '../vehicles/taxonomy.ts';
export {
  cooldownRemaining,
  resetConsumableCooldowns,
  startConsumableCooldown,
} from './consumables.ts';
export { CONSUMABLE_RULES } from './consumables.ts';
export {
  advancePreBattleCountdown,
  resolveVisiblePreBattleSeconds,
} from './preBattleCountdown.ts';
export {
  advanceTankPresentationPose,
  createTankPresentationPose,
  resetTankPresentationPose,
  sampleTankPresentationPose,
} from './presentationPose.ts';
export {
  mobileAutoAimCenter,
  pickMobileAutoAimTarget,
} from './mobileAutoAim.ts';
