import type { Object3D } from 'three';
import type { MissionCarrierSpec } from '../sim/missionAttachment.ts';
import { JUGGERNAUT_SCALE } from '../sim/juggernautScale.ts';
import { clearJuggernautVisual, syncTankEnergyVisual, TANK_ENERGY } from './juggernautVisual.ts';
import { clearMissionAttachment, syncFlagAttachment, syncMissionAttachment } from './missionAttachmentVisual.ts';

const dockedDrone = Object.freeze({ kind: 'drone' as const, active: false, cooldownS: 0 });
export function createGarageModePreview() {
  let root: Object3D | null = null, mode = '', timeS = 0;
  function clear() {
    if (root) { clearJuggernautVisual(root, true); clearMissionAttachment(root); }
    root = null; mode = ''; timeS = 0;
  }
  return {
    clear,
    update(nextRoot: Object3D | null, spec: MissionCarrierSpec | null, nextMode: string, dt: number) {
      if (root !== nextRoot || mode !== nextMode) { clear(); root = nextRoot; mode = nextMode; }
      if (!root || !spec) return;
      timeS += Math.max(0, Math.min(dt, .1));
      if (mode === 'juggernaut') {
        // Keep the showroom's authored floor seat and framing; preview the energy skin.
        syncTankEnergyVisual(root, spec.dims, JUGGERNAUT_SCALE, 1, 1, dt, false);
      } else if (mode === 'infected' || mode === 'capture_the_flag') {
        syncTankEnergyVisual(root, spec.dims, JUGGERNAUT_SCALE, 1, 1, dt, false, mode === 'infected' ? TANK_ENERGY.infected : TANK_ENERGY.flagOwn);
        if (mode === 'capture_the_flag') syncFlagAttachment(root, spec, timeS);
      } else if (mode === 'drone') syncMissionAttachment(root, spec, dockedDrone, false);

    },
  };
}
