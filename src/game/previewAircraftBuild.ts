/**
 * previewAircraftBuild.ts — an aircraft built for a preview, as createTank builds a tank for one (endscreen-modes-275; the
 * owner: "the tank previews should have a ac 130 presented like the tanks").
 *
 * The preview surfaces ask vehicles/previewVehicles.ts which kind an id is; a tank comes from its fleet facade, an aircraft
 * from here: its real first-party airframe (gunshipAirframe.ts, the model the battle flies), in level flight with its props
 * at rest, centred on its own footprint like a tank's presentation anchor. The asset page (tools/aircraft-assets-page.html),
 * the hero-card page (tools/hero-cards-page.html) and the Garage pedestal build from this one function.
 */
import * as THREE from 'three';
import { buildGunshipAirframe } from './gunshipAirframe.ts';
import { previewAircraft, type PreviewAircraft } from '../vehicles/previewVehicles.ts';

interface MaterialHooks { setup(material: THREE.Material): void; release(material: THREE.Material): void }

export interface PreviewAircraftVisual {
  readonly kind: 'aircraft';
  readonly id: string;
  readonly aircraft: PreviewAircraft;
  /** The airframe (nose +Z, port wing +X, up +Y), its lowest point on y = 0, centred on its plan footprint. */
  readonly root: THREE.Group;
  /** The plan centre a preview frames on, as a tank visual's presentationAnchor. */
  readonly presentationAnchor: { readonly xM: number; readonly zM: number };
  dispose(): void;
}

const BUILDERS: Readonly<Record<PreviewAircraft['airframe'], (hooks: MaterialHooks | null) => { root: THREE.Group; dispose(): void }>> = Object.freeze({
  gunship: buildGunshipAirframe,
});

/** Build the aircraft a preview id names (throws for a tank id: build tanks from their fleet facade). */
export function buildPreviewAircraft(id: string, hooks: MaterialHooks | null = null): PreviewAircraftVisual {
  const aircraft = previewAircraft(id);
  if (!aircraft) throw new Error(`not a preview aircraft: ${id}`);
  const built = BUILDERS[aircraft.airframe](hooks);
  const root = new THREE.Group();
  root.name = `preview:${id}`;
  root.add(built.root);
  root.updateMatrixWorld(true);
  // sat on the ground plane and centred on its plan footprint, as a tank's preview stands on its tracks
  const box = new THREE.Box3().setFromObject(built.root);
  const centre = box.getCenter(new THREE.Vector3());
  built.root.position.set(-centre.x, -box.min.y, -centre.z);
  root.updateMatrixWorld(true);
  return Object.freeze({
    kind: 'aircraft' as const,
    id,
    aircraft,
    root,
    presentationAnchor: Object.freeze({ xM: 0, zM: 0 }),
    dispose() { root.removeFromParent(); built.dispose(); },
  });
}
