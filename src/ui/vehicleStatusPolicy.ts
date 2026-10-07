import { REPAIR_S, type CombatState } from '../sim/damage.ts';
import type { ModuleId } from '../sim/moduleCatalog.ts';

export const MAX_VEHICLE_STATUS_BOXES = 4;
export interface ConcealmentStatus { spotted?: boolean; inBush?: boolean; fired?: boolean; camo?: number }
export interface VehicleStatus {
  id: string; icon: string; labelKey: string;
  tone: 'danger' | 'warning' | 'positive';
  progress: number | null; count: number; priority: number;
}
const MODULE_ORDER: readonly ModuleId[] = ['engine','gun','turretRing','missileRack','roofGun',
  'transmission','ammoRack','fuelTank','gunMount','autoloader','feedSystem','optics','radio'];
const compare = (a: VehicleStatus, b: VehicleStatus) => a.priority - b.priority;
export function vehicleStatusCapacity(width: number, touch: boolean): number {
  return Math.max(2, Math.min(MAX_VEHICLE_STATUS_BOXES, Math.floor((width + 4) / (touch ? 48 : 38))));
}
/** Retained records and output: safe to read from the HUD update without allocating. */
export function createVehicleStatusReader() {
  const item = (id: string, icon: string, labelKey: string): VehicleStatus =>
    ({id,icon,labelKey,tone:'danger',progress:null,count:1,priority:0});
  const fire = item('fire','statusFire','hud.status.fire');
  const tracks = item('tracks','track','hud.status.tracks');
  const crew = item('crew','crew','hud.status.crew');
  const conceal = item('conceal','statusConcealed','hud.status.concealed');
  const modules = MODULE_ORDER.map(id => item(id,id,`garage.module.${id}`));
  const active: VehicleStatus[] = [];
  const add = (entry: VehicleStatus, priority: number, tone: VehicleStatus['tone'], progress: number | null = null) => {
    entry.priority=priority;entry.tone=tone;entry.progress=progress;active.push(entry);
  };
  const progress = (value: number, combat: CombatState) => combat.modeModuleOnlyDamage || combat.moduleRepairProgressKnown===false || !Number.isFinite(value)
    ? null : Math.round(Math.max(0,Math.min(1,value/REPAIR_S))*100);
  function addTracks(combat: CombatState) {
    const left=combat.modules.trackL,right=combat.modules.trackR;
    if (left?.state==='red'||right?.state==='red') {
      const repair=Math.min(left?.state==='red'?left.repairT:Infinity,right?.state==='red'?right.repairT:Infinity);
      add(tracks,1,'danger',progress(repair,combat));
    } else if (left?.state==='yellow'||right?.state==='yellow') add(tracks,30,'warning');
  }
  function addCrew(combat: CombatState) {
    crew.count=0;
    for (const name in combat.crew) if (combat.crew[name]===false) crew.count++;
    if (crew.count) add(crew,20,'danger');
  }
  function addModules(combat: CombatState) {
    for (let i=0;i<MODULE_ORDER.length;i++) {
      const module=combat.modules[MODULE_ORDER[i]!];
      if (!module || module.state==='ok') continue;
      const red=module.state==='red';
      add(modules[i]!, (red?2:31)+i,red?'danger':'warning',red?progress(module.repairT,combat):null);
    }
  }
  return (combat: CombatState | null | undefined, spotting?: ConcealmentStatus | null): readonly VehicleStatus[] => {
    active.length=0;
    if (!combat || combat.destroyed) return active;
    if (combat.fire.burning) add(fire,0,'danger');
    addTracks(combat);addCrew(combat);addModules(combat);
    if (spotting&&!spotting.spotted&&((spotting.inBush&&!spotting.fired)||(spotting.camo??0)>=.40)) add(conceal,100,'positive');
    active.sort(compare);
    return active;
  };
}
