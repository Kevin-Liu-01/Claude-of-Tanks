import type { Object3D } from 'three';
import type { MissionCarrierSpec } from '../sim/missionAttachment.ts';
import { JUGGERNAUT_SCALE } from '../sim/juggernautScale.ts';
import { clearJuggernautVisual, hasGarageTankEnergyVisual, pauseGarageTankEnergyVisual, syncTankEnergyVisual, TANK_ENERGY } from './juggernautVisual.ts';
import { clearMissionAttachment, syncFlagAttachment, syncMissionAttachment } from './missionAttachmentVisual.ts';

const dockedDrone = Object.freeze({ kind: 'drone' as const, active: false, cooldownS: 0 });
const energyMode = (mode: string) => mode === 'juggernaut' || mode === 'infected' || mode === 'capture_the_flag';
function needsNewPreviewPrograms(root:Object3D|null,mode:string):boolean {
  if(mode==='capture_the_flag'||mode==='drone')return true;
  return energyMode(mode)&&!!root&&!hasGarageTankEnergyVisual(root);
}
function animatePreview(root:Object3D,spec:MissionCarrierSpec,mode:string,timeS:number,dt:number):void {
  if(energyMode(mode)) {
    const style=mode==='juggernaut'?TANK_ENERGY.juggernaut:mode==='infected'?TANK_ENERGY.infected:TANK_ENERGY.flagOwn;
    // Keep the showroom's authored floor seat and framing; preview only its energy skin.
    syncTankEnergyVisual(root,spec.dims,JUGGERNAUT_SCALE,1,1,dt,false,style,true);
  }
  if(mode==='capture_the_flag')syncFlagAttachment(root,spec,timeS);
  else if(mode==='drone')syncMissionAttachment(root,spec,dockedDrone,false);
}
export function createGarageModePreview() {
  let root: Object3D | null = null, mode = '', timeS = 0;
  function clear() {
    if (root) { clearJuggernautVisual(root, true); clearMissionAttachment(root); }
    root = null; mode = ''; timeS = 0;
  }
  return {
    clear,
    update(nextRoot: Object3D | null, spec: MissionCarrierSpec | null, nextMode: string, dt: number) {
      const sameRoot = root === nextRoot;
      const changed = !sameRoot || mode !== nextMode;
      const needsWarm = changed && needsNewPreviewPrograms(nextRoot,nextMode);
      if (root !== nextRoot) {
        if(root){pauseGarageTankEnergyVisual(root);clearMissionAttachment(root);}
        root=nextRoot;mode='';timeS=0;
      }
      if (mode !== nextMode) {
        // All aura patterns share one shader. Keep its compiled materials and
        // change uniforms instead of disposing/relinking on each mode click.
        if (root && energyMode(mode) && !energyMode(nextMode)) pauseGarageTankEnergyVisual(root);
        if (root && (mode === 'drone' || mode === 'capture_the_flag')) clearMissionAttachment(root);
        mode = nextMode; timeS = 0;
      }
      if (!root || !spec) return;
      timeS += Math.max(0, Math.min(dt, .1));
      animatePreview(root,spec,mode,timeS,dt);
      return needsWarm;
    },
  };
}
