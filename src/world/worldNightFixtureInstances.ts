// Existing structure/glass draw owners only. Cosmetic activity changes at
// destruction/reset transitions, never by scanning buildings every frame.
import { DynamicDrawUsage, InstancedBufferAttribute,
  type BufferGeometry, type InstancedMesh, type MeshStandardMaterial } from 'three';
import { installNightEmissionMask, NIGHT_EMISSION_ATTRIBUTE } from '../engine/nightEmissionMaterial.ts';
import { ensureWorldNightEmissionMask } from './worldNightEmissionGeometry.ts';

export const WORLD_FIXTURE_ACTIVE_ATTRIBUTE = 'nightFixtureActive';

function hasAuthoredEmission(geometry: BufferGeometry): boolean {
  const mask = geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE);
  if (!mask) return false;
  for (let index = 0; index < mask.count; index++) if (mask.getX(index) > .5) return true;
  return false;
}

/** Called once on the existing family material after ordinary CSM/grime hooks. */
export function prepareWorldStructureNightFixture(mesh: InstancedMesh, intact: boolean): void {
  ensureWorldNightEmissionMask(mesh.geometry);
  const count = mesh.instanceMatrix.count;
  const active = new InstancedBufferAttribute(new Uint8Array(count).fill(intact ? 1 : 0), 1);
  active.setUsage(DynamicDrawUsage);
  mesh.geometry.setAttribute(WORLD_FIXTURE_ACTIVE_ATTRIBUTE, active);
  if (!intact || !hasAuthoredEmission(mesh.geometry)) return;
  if (Array.isArray(mesh.material) || !(mesh.material as MeshStandardMaterial).isMeshStandardMaterial) {
    throw new TypeError('Authored structure fixture requires one existing standard material');
  }
  const material = mesh.material as MeshStandardMaterial;
  installNightEmissionMask(material, { instanceActiveAttribute: WORLD_FIXTURE_ACTIVE_ATTRIBUTE });
  material.userData.nightLightKind = 'fixture';
}

/** Real authored lanterns share the original glass draw; all other glass is 0. */
export function prepareWorldStaticNightFixture(geometries: readonly BufferGeometry[], material: MeshStandardMaterial): void {
  if (!geometries.some(hasAuthoredEmission)) return;
  for (const geometry of geometries) ensureWorldNightEmissionMask(geometry);
  installNightEmissionMask(material);
  material.userData.nightLightKind = 'fixture';
}

/** No-op for ordinary props. No upload on unchanged state and no new objects. */
export function setWorldNightFixtureActive(mesh: InstancedMesh, slot: number, enabled: boolean): void {
  const attribute = mesh.geometry.getAttribute(WORLD_FIXTURE_ACTIVE_ATTRIBUTE);
  if (!(attribute instanceof InstancedBufferAttribute)) return;
  if (!Number.isInteger(slot) || slot < 0 || slot >= attribute.count) throw new RangeError('Invalid authored fixture instance slot');
  const value = enabled ? 1 : 0;
  if (attribute.getX(slot) === value) return;
  attribute.setX(slot, value);
  attribute.addUpdateRange(slot, 1);
  attribute.needsUpdate = true;
}
