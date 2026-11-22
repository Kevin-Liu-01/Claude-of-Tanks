import type { Object3D } from 'three';
import type { MissionCarrierSpec } from '../sim/missionAttachment.ts';
import { JUGGERNAUT_SCALE } from '../sim/juggernautScale.ts';
import { clearJuggernautVisual, hasGarageTankEnergyVisual, pauseGarageTankEnergyVisual, syncTankEnergyVisual, TANK_ENERGY } from './juggernautVisual.ts';
import { clearMissionAttachment, syncFlagAttachment, syncMissionAttachment } from './missionAttachmentVisual.ts';
import { configureDroneMaterials } from '../fx/droneModel.ts';
import type { Material } from 'three';
import { buildPreviewAircraft, type PreviewAircraftVisual } from './previewAircraftBuild.ts';
import { MODE_AIRCRAFT } from '../vehicles/previewVehicles.ts';

/**
 * (endscreen-modes-275; the owner: "when we select ac 130 game mode the tank previews should have a ac 130 presented like
 * the tanks") A mode that flies the player (MODE_AIRCRAFT) stands its aircraft on the pedestal in the tank's place: the
 * real airframe (previewAircraftBuild.ts), scaled to the stage the tanks fill and parented to the pedestal's root, so it
 * turns, lights and frames as the tank does; the tank's own parts hide meanwhile and come back as the mode leaves.
 */
/** The aircraft's larger extent against the tank it stands in for (the Garage camera frames that tank's hull). */
const STAGE_SPAN_K = 1.45;
const aircraftFor = (mode: string): string | null => (Object.hasOwn(MODE_AIRCRAFT, mode) ? MODE_AIRCRAFT[mode]! : null);

const dockedDrone = Object.freeze({ kind: 'drone' as const, active: false, cooldownS: 0 });
const energyMode = (mode: string) => mode === 'juggernaut' || mode === 'infected' || mode === 'capture_the_flag';
function needsNewPreviewPrograms(root:Object3D|null,mode:string):boolean {
  if(mode==='capture_the_flag'||mode==='drone'||aircraftFor(mode))return true;
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
/** The Garage engine's lit-material registration, so the previewed dock and drone light like the hull under them. */
interface PreviewEngine { setupShadowMaterial?(material: Material): unknown; releaseShadowMaterial?(material: Material): unknown }
export function createGarageModePreview(engine?: PreviewEngine) {
  if (engine?.setupShadowMaterial) {
    configureDroneMaterials({ setup: (m) => engine.setupShadowMaterial?.(m), release: (m) => engine.releaseShadowMaterial?.(m) });
  }
  const hooks = engine?.setupShadowMaterial
    ? { setup: (m: Material) => { engine.setupShadowMaterial?.(m); }, release: (m: Material) => { engine.releaseShadowMaterial?.(m); } } : null;
  let root: Object3D | null = null, mode = '', timeS = 0;
  let aircraft: PreviewAircraftVisual | null = null;
  const hidden: Object3D[] = [];
  function dropAircraft(): void {
    for (const part of hidden) part.visible = true;
    hidden.length = 0;
    aircraft?.dispose();
    aircraft = null;
  }
  function standAircraft(on: Object3D, id: string, stage: { hullLengthM: number; widthM: number }): void {
    if (aircraft?.id === id && aircraft.root.parent === on) return;
    dropAircraft();
    for (const part of on.children) if (part.visible) { part.visible = false; hidden.push(part); }
    aircraft = buildPreviewAircraft(id, hooks);
    const { spanM, lengthM } = aircraft.aircraft;
    // the parent's own scale (a tank's build scale) undone, so the stage size is in metres
    const parentScale = Math.max(1e-6, on.scale.x);
    const stageM = Math.max(stage.hullLengthM, stage.widthM) * STAGE_SPAN_K;
    aircraft.root.scale.setScalar(stageM / Math.max(spanM, lengthM) / parentScale);
    on.add(aircraft.root);
  }
  function clear() {
    dropAircraft();
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
        dropAircraft();
        if(root){pauseGarageTankEnergyVisual(root);clearMissionAttachment(root);}
        root=nextRoot;mode='';timeS=0;
      }
      if (mode !== nextMode) {
        // All aura patterns share one shader. Keep its compiled materials and
        // change uniforms instead of disposing/relinking on each mode click.
        if (root && energyMode(mode) && !energyMode(nextMode)) pauseGarageTankEnergyVisual(root);
        if (root && (mode === 'drone' || mode === 'capture_the_flag')) clearMissionAttachment(root);
        if (aircraftFor(mode) && !aircraftFor(nextMode)) dropAircraft();
        mode = nextMode; timeS = 0;
      }
      if (!root || !spec) return;
      const flown = aircraftFor(mode);
      if (flown) { standAircraft(root, flown, spec.dims); return needsWarm; }
      timeS += Math.max(0, Math.min(dt, .1));
      animatePreview(root,spec,mode,timeS,dt);
      return needsWarm;
    },
  };
}
