import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

// Permanent fitted stock keeps its existing material and armor/equipment
// ownership. Only the ordinary empty-far presentation wrapper is removed;
// canonical wheel, shoe and track LODs remain in charge of their own stock.
const PERMANENT_BUCKETS = ['hullDetail', 'hullExternalArmor', 'hullDark', 'hullGlass',
  'turretDetail', 'turretExternalArmor', 'turretDark', 'turretGlass'] as const;

export function retainArieteXStructuralLod(P: TankBuilderPort): void {
  const previous = P.postAssemble;
  P.postAssemble = rig => {
    previous?.(rig);
    for (const name of PERMANENT_BUCKETS) {
      const mesh = rig.root.getObjectByName(name), wrapper = mesh?.parent;
      if (!(mesh instanceof THREE.Mesh) || !(wrapper instanceof THREE.LOD) || !wrapper.parent)
        throw new Error(`Ariete permanent stock ${name} requires its expected detail wrapper`);
      if (!wrapper.matrix.equals(new THREE.Matrix4()) || wrapper.levels.some(level =>
        level.object !== mesh && (level.object instanceof THREE.Mesh || level.object.children.length)))
        throw new Error(`Ariete unexpected transformed or populated detail wrapper for ${name}`);
      const owner = wrapper.parent, index = owner.children.indexOf(wrapper);
      wrapper.remove(mesh); wrapper.levels.length = 0; wrapper.clear(); wrapper.removeFromParent();
      owner.add(mesh);
      owner.children.splice(index, 0, owner.children.pop()!);
      mesh.visible = true;
    }
  };
}
