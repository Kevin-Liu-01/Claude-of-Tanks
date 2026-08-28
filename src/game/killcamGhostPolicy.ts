/**
 * Return true only for meshes that contribute pixels to the normal color pass.
 *
 * Tank visuals also contain authored convex shadow casters. Those meshes are
 * deliberately visible to Three.js so they can cast, but their materials have
 * colorWrite disabled. Replacing those materials in the kill-cam exposes the
 * coarse hulls as giant translucent wedges around guns and roof fittings.
 */
interface GhostMaterial {
  visible?: boolean;
  colorWrite?: boolean;
  transparent?: boolean;
  opacity?: number;
}

interface GhostSurface {
  isMesh?: boolean;
  userData?: { authoredShadowProxy?: boolean };
  material?: GhostMaterial | GhostMaterial[] | null;
}

export function isKillcamGhostSurface(object: GhostSurface | null | undefined): boolean {
  if (!object?.isMesh || object.userData?.authoredShadowProxy) return false;
  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];
  return materials.some((material) => !material || (
    material.visible !== false
    && material.colorWrite !== false
    && (!material.transparent || Number(material.opacity ?? 1) > 0)
  ));
}
