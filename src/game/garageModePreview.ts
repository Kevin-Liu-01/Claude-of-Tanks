import type { Object3D } from 'three';
import type { MissionCarrierSpec } from '../sim/missionAttachment.ts';
import { JUGGERNAUT_SCALE } from '../sim/juggernautScale.ts';
import { clearJuggernautVisual, pauseGarageTankEnergyVisual, syncTankEnergyVisual, TANK_ENERGY } from './juggernautVisual.ts';
import { clearMissionAttachment, syncFlagAttachment, syncMissionAttachment } from './missionAttachmentVisual.ts';

const dockedDrone = Object.freeze({ kind: 'drone' as const, active: false, cooldownS: 0 });
const energyMode = (mode: string) => mode === 'juggernaut' || mode === 'infected' || mode === 'capture_the_flag';
export function createGarageModePreview() {
  let root: Object3D | null = null, mode = '', timeS = 0, energyInstalled = false;
  function clear() {
    if (root) { clearJuggernautVisual(root, true); clearMissionAttachment(root); }
    root = null; mode = ''; timeS = 0; energyInstalled = false;
  }
  return {
    clear,
    update(nextRoot: Object3D | null, spec: MissionCarrierSpec | null, nextMode: string, dt: number) {
      const sameRoot = root === nextRoot;
      const changed = !sameRoot || mode !== nextMode;
      const needsWarm = changed && (
        (energyMode(nextMode) && (!sameRoot || !energyInstalled))
        || nextMode === 'capture_the_flag' || nextMode === 'drone'
      );
      if (root !== nextRoot) { clear(); root = nextRoot; }
      if (mode !== nextMode) {
        // All aura patterns share one shader. Keep its compiled materials and
        // change uniforms instead of disposing/relinking on each mode click.
        if (root && energyMode(mode) && !energyMode(nextMode)) pauseGarageTankEnergyVisual(root);
        if (root && (mode === 'drone' || mode === 'capture_the_flag')) clearMissionAttachment(root);
        mode = nextMode; timeS = 0;
      }
      if (!root || !spec) return;
      timeS += Math.max(0, Math.min(dt, .1));
      if (mode === 'juggernaut') {
        // Keep the showroom's authored floor seat and framing; preview the energy skin.
        syncTankEnergyVisual(root, spec.dims, JUGGERNAUT_SCALE, 1, 1, dt, false, TANK_ENERGY.juggernaut, true);
        energyInstalled = true;
      } else if (mode === 'infected' || mode === 'capture_the_flag') {
        syncTankEnergyVisual(root, spec.dims, JUGGERNAUT_SCALE, 1, 1, dt, false, mode === 'infected' ? TANK_ENERGY.infected : TANK_ENERGY.flagOwn, true);
        energyInstalled = true;
        if (mode === 'capture_the_flag') syncFlagAttachment(root, spec, timeS);
      } else if (mode === 'drone') syncMissionAttachment(root, spec, dockedDrone, false);
      return needsWarm;
    },
  };
}
