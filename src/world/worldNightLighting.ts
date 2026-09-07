import { DynamicDrawUsage, InstancedBufferAttribute, Matrix4, Vector3,
  type Group, type InstancedMesh, type MeshStandardMaterial } from 'three';
import { registerNightLightEmitters, type NightLightEmitter } from '../engine/nightLightingRuntime.ts';
import { installNightEmissionMask } from '../engine/nightEmissionMaterial.ts';

export const WORLD_LAMP_ACTIVE_ATTRIBUTE = 'nightFixtureActive';

/** Call after the world's ordinary CSM/grime hooks have been installed. */
export function configureWorldLampMaterial(material: MeshStandardMaterial): void {
  installNightEmissionMask(material, { instanceActiveAttribute: WORLD_LAMP_ACTIVE_ATTRIBUTE });
}

interface StreetLampRecord {
  readonly kind: string;
  readonly slot: number;
  readonly state: number;
}

/** Register existing dedicated panes and fixtures once after instance assembly.
 * The lighting owner restores original materials on day/Garage transitions.
 */
export function registerWorldNightLighting(
  root: Group,
  curtain: MeshStandardMaterial,
  records: readonly StreetLampRecord[],
  mapId: string,
): void {
  // Ruined-city panes remain abandoned, not an occupied illuminated skyline.
  if (mapId !== 'ruinspires' && mapId !== 'blackglass') {
    curtain.userData.nightLightKind = 'window';
    registerNightLightEmitters(root, [{
      kind: 'marker', position: [0, 0, 0],
      emission: { material: curtain, color: 0xffbd72, intensity: 0.55 },
    }]);
  }
  const object = root.getObjectByName('destructible-lamp');
  if (!object || !(object as InstancedMesh).isInstancedMesh) return;
  const mesh = object as InstancedMesh;
  if (Array.isArray(mesh.material) || !(mesh.material as MeshStandardMaterial).isMeshStandardMaterial) {
    throw new TypeError('Streetlamps require their dedicated masked material');
  }
  const material = mesh.material as MeshStandardMaterial;
  // A byte per existing instance turns a broken bulb off without splitting the
  // draw or allocating materials. Upload only on a destruction/reset transition.
  const active = new InstancedBufferAttribute(new Uint8Array(mesh.count).fill(1), 1);
  active.setUsage(DynamicDrawUsage);
  mesh.geometry.setAttribute(WORLD_LAMP_ACTIVE_ATTRIBUTE, active);
  const matrix = new Matrix4();
  const lens = new Vector3();
  const emitters: NightLightEmitter[] = [];
  for (const record of records) {
    if (record.kind !== 'lamp') continue;
    if (!Number.isInteger(record.slot) || record.slot < 0 || record.slot >= mesh.count) {
      throw new RangeError('Streetlamp light requires its authored instance slot');
    }
    mesh.getMatrixAt(record.slot, matrix);
    // bLamp lens center transformed with the actual scale and terrain tilt.
    lens.set(0.98, 3.895, 0).applyMatrix4(matrix);
    emitters.push({
      kind: 'building', position: [lens.x, lens.y, lens.z],
      color: 0xffc889, intensity: 24, range: 17,
      emission: { material, color: 0xffffff, intensity: 3 },
      isActive: () => {
        const enabled = record.state === 0 ? 1 : 0;
        if (active.getX(record.slot) !== enabled) {
          active.setX(record.slot, enabled);
          active.addUpdateRange(record.slot, 1);
          active.needsUpdate = true;
        }
        return enabled === 1;
      },
    });
  }
  registerNightLightEmitters(mesh, emitters);
}
