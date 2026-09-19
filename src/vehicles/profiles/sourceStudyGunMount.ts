import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** Keep an existing source-study finish when separating the pitching cradle
 * from its recoiling tube. Geometry, paint and disposal stay factory-owned. */
export function preserveSourceStudyGunMountAppearance(P: TankBuilderPort): void {
  const previous = P.postAssemble;
  P.postAssemble = rig => {
    previous?.(rig);
    const mount = rig.gunG.getObjectByName('gunMount');
    if (!(mount instanceof THREE.Mesh)) throw new Error(`${P.spec.id}: missing authored gun cradle`);
    mount.material = P.mats.barrel;

    const dark = rig.gunG.getObjectByName('gunMountDark');
    if (!dark) return;
    if (!(dark instanceof THREE.Mesh)) throw new Error(`${P.spec.id}: invalid dark gun cradle`);
    const wrapper = dark.parent;
    if (wrapper instanceof THREE.LOD) {
      // gunDark survived every distance before the ownership correction.
      // Remove its temporary detail wrapper completely: stale LOD levels
      // must never hide the now directly parented receiver or sight.
      if (wrapper.parent !== rig.gunG || wrapper.levels.some(level =>
        level.object !== dark && (level.object.children.length > 0 || level.object instanceof THREE.Mesh))) {
        throw new Error(`${P.spec.id}: unexpected dark gun cradle LOD contents`);
      }
      wrapper.remove(dark);
      wrapper.levels.length = 0;
      wrapper.clear();
      wrapper.removeFromParent();
      rig.gunG.add(dark);
    } else if (wrapper !== rig.gunG) {
      throw new Error(`${P.spec.id}: unexpected dark gun cradle parent`);
    }
    dark.visible = true;
    // This stock previously entered the gun shadow through gunDark. Preserve
    // that contribution without enrolling unrelated historical gunMountDark
    // fittings in the shared proxy source set.
    dark.userData.preserveRecoilShadowSource = true;
  };
}
