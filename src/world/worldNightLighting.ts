import { DynamicDrawUsage, InstancedBufferAttribute, Matrix4, Vector3,
  type Group, type InstancedMesh, type MeshStandardMaterial } from 'three';
import { registerNightLightEmitters, type NightLightEmitter } from '../engine/nightLightingRuntime.ts';
import { installNightEmissionMask } from '../engine/nightEmissionMaterial.ts';

export const WORLD_LAMP_ACTIVE_ATTRIBUTE = 'nightFixtureActive';
/** A street lamp's pooled point light (candela): its pool reads on the pavement and the facade beside it (228: the s228 calibration, 45 / 90 / 180 cd). */
export const STREET_LAMP_CANDELA = 150;

/** Call after the world's ordinary CSM/grime hooks have been installed. */
export function configureWorldLampMaterial(material: MeshStandardMaterial): void {
  installNightEmissionMask(material, { instanceActiveAttribute: WORLD_LAMP_ACTIVE_ATTRIBUTE });
}

interface StreetLampRecord {
  readonly kind: string;
  readonly slot: number;
  readonly state: number;
}

interface WorldFixtureMaterial {
  readonly material: MeshStandardMaterial;
  readonly intensity: number;
}

/** Register existing dedicated panes and fixtures once after instance assembly.
 * The lighting owner restores original materials on day/Garage transitions.
 */
export function registerWorldNightLighting(
  root: Group,
  curtain: MeshStandardMaterial,
  records: readonly StreetLampRecord[],
  mapId: string,
  fixtures: readonly WorldFixtureMaterial[] = [],
): void {
  const markers: NightLightEmitter[] = [];
  // Ruined-city panes remain abandoned, not an occupied illuminated skyline.
  if (mapId !== 'ruinspires' && mapId !== 'blackglass') {
    // Panes, unlit fabric and red obstruction bulbs retain one material/draw;
    // only authored aperture vertices participate in night emission.
    installNightEmissionMask(curtain);
    curtain.userData.nightLightKind = 'window';
    markers.push({
      kind: 'marker', position: [0, 0, 0],
      // Occupied panes are dimmer diffuse interiors, not exposed lamp bulbs.
      // Two stops below the former input; keep authored masks/tint untouched.
      emission: { material: curtain, color: 0xffffff, intensity: 0.225 },
    });
  }
  // Intact service structures and actual lanterns remain eligible even in a
  // ruined district. Their authored masks/activity slots exclude debris.
  for (const { material, intensity } of fixtures) {
    if (material.userData.nightEmissionMask !== true || material.userData.nightLightKind !== 'fixture') continue;
    markers.push({ kind: 'marker', position: [0, 0, 0], emission: { material, color: 0xffffff, intensity } });
  }
  registerNightLightEmitters(root, markers);
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
  // (a shot-out lamp's form has no glass and no seat for a light: it stays dark)
  const lensAt = (mesh.geometry.userData.lampLens === undefined ? [0.98, 3.895, 0] : mesh.geometry.userData.lampLens) as [number, number, number] | null;
  if (!lensAt) return;
  // (228 r2) the form's own candela where it names one (a map's gas lantern), else the street lamp's
  const candela = typeof mesh.geometry.userData.lampCandela === 'number' ? mesh.geometry.userData.lampCandela as number : STREET_LAMP_CANDELA;
  const emitters: NightLightEmitter[] = [];
  for (const record of records) {
    if (record.kind !== 'lamp') continue;
    if (!Number.isInteger(record.slot) || record.slot < 0 || record.slot >= mesh.count) {
      throw new RangeError('Streetlamp light requires its authored instance slot');
    }
    mesh.getMatrixAt(record.slot, matrix);
    // the lamp form's lens centre (props lane A #14: each map's lamp says where its glass is; bLamp's by default)
    // transformed with the actual scale and terrain tilt.
    lens.set(lensAt[0], lensAt[1], lensAt[2]).applyMatrix4(matrix);
    emitters.push({
      kind: 'building', position: [lens.x, lens.y, lens.z],
      // Restrain nearby facade spill from the existing unshadowed point.
      // The visible bulb keeps its original radiance and physical seat.
      // (the looks lane, 228: at 6 cd a lamp lit 0.4 lux under itself, a twentieth of a headlight's pool, and no
      // pool showed at any pose) the lamp's pool reads on the pavement beside a headlight's; its range still bounds the
      // unshadowed spill to the lamp's own stretch of street
      color: 0xffc889, intensity: candela, range: 17,
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
