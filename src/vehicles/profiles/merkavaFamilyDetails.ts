// Merkava family detail parts (release 262, the owner 2026-10-27: "these look bad and need much more detail and geometry
// and need to match the geometry of these" — the supplied Mk 1B, 2B, 2D, 3C, 3D and 4B source models). Every detail the
// sources carry (hatches, the add-on turret packages, the skirt panels and sponson boxes, stowage, lights, smoke
// launchers, sights) is drawn as a first-party primitive at its measured centre, size and attitude
// (merkavaFamilySource.ts): a rounded box, or a cylinder for the round hatches. Add-on turret armour is the spec's
// removable package (destructibleCluster), its side by the part's x.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { tankSeedId } from '../tankIdAliases.ts';
import type { SourcePart } from './merkavaFamilySource.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** Detail roles as the source fit names them (merkavaFamilySource.ts SourcePart role). */
const ROLE = Object.freeze({ hatch: 1, hullArmor: 2, turretArmor: 3, stowage: 4, lantern: 5, smoke: 6, optic: 7 });

const q = new THREE.Quaternion(), e = new THREE.Euler();
/** A loft's canonical frame (sections u, v along w) into the part's own frame, by its long axis; each a rotation. */
const LOFT_BASES = [
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)),
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)),
  new THREE.Matrix4(),
];

/** A loft part's solid in its own frame: its back and front end sections joined along its long axis. */
function loftGeometry(p: SourcePart): THREE.BufferGeometry {
  const ax = p[13]!, t0 = p[14]!, t1 = p[15]!;
  const ring = (at: number): SectionPoint[] => Array.from({ length: 6 }, (_, k): SectionPoint => [p[at + k * 2]!, p[at + k * 2 + 1]!]);
  return sectionSolid([{ z: t0, ring: ring(16) }, { z: t1, ring: ring(28) }], { sideQuadDiagonal: 'convex' })
    .applyMatrix4(LOFT_BASES[ax]!);
}

/** The part's geometry in its own frame (centred, axis-aligned), oriented and placed in the owner's frame. */
function partGeometry(p: SourcePart, offset: readonly [number, number, number], seg: number): THREE.BufferGeometry {
  const [kind, , cx, cy, cz, sx, sy, sz, qx, qy, qz, qw] = p as readonly number[] as [number, number, number, number,
    number, number, number, number, number, number, number, number];
  let g: THREE.BufferGeometry;
  if (kind === 1) g = KIT.cylY(Math.max(sx, sz) / 2, Math.max(sx, sz) / 2, sy, seg);
  else if (kind === 4) {
    try { g = loftGeometry(p); } catch { g = KIT.box(sx, sy, sz); }
  } else g = KIT.box(sx, sy, sz);
  q.set(qx, qy, qz, qw).normalize();
  e.setFromQuaternion(q);
  return KIT.xform(g, cx - offset[0], cy - offset[1], cz - offset[2], e.x, e.y, e.z);
}

/** Lens and tube faces need their own geometry: the part's front (+Z) face in the owner's frame. */
function frontFace(p: SourcePart, offset: readonly [number, number, number], inset: number,
  build: (w: number, h: number) => THREE.BufferGeometry): THREE.BufferGeometry {
  const [, , cx, cy, cz, sx, sy, sz, qx, qy, qz, qw] = p as readonly number[] as [number, number, number, number, number,
    number, number, number, number, number, number, number];
  const g = KIT.xform(build(sx, sy), 0, 0, sz / 2 + inset);
  q.set(qx, qy, qz, qw).normalize();
  e.setFromQuaternion(q);
  return KIT.xform(g, cx - offset[0], cy - offset[1], cz - offset[2], e.x, e.y, e.z);
}

/** Draws a mark's measured details: hull parts in the hull frame, turret parts in the turret frame (pivot subtracted). */
export function buildMerkavaSourceDetails(P: TankBuilderPort, parts: readonly SourcePart[], pivot: readonly [number, number, number]): void {
  const seg = P.q ? 20 : 12, none: readonly [number, number, number] = [0, 0, 0];
  const turretArmor: Record<'R' | 'L', SourcePart[]> = { R: [], L: [] };
  for (const p of parts) {
    const owner = p[1]!, cx = p[2]!, sx = p[5]!, sy = p[6]!, sz = p[7]!, role = p[12]!;
    const onTurret = owner === 1, off = onTurret ? pivot : none;
    switch (role) {
      case ROLE.hatch:
        P.add(onTurret ? 'turretHatch' : 'hullHatch', partGeometry(p, off, seg));
        break;
      case ROLE.hullArmor: {
        // skirt panels outboard of the track lane ride the track-guard buckets; sponson boxes and plates are appliqué
        const skirt = Math.abs(cx) > 1.70 && sy > 0.30 && sz > 0.30 && sx < 0.30;
        P.addExternalArmor(skirt ? (cx > 0 ? 'hullTrackGuardL' : 'hullTrackGuardR') : 'hull', partGeometry(p, none, seg));
        break;
      }
      case ROLE.turretArmor:
        if (onTurret) turretArmor[cx > 0 ? 'R' : 'L'].push(p);
        else P.addExternalArmor('hull', partGeometry(p, none, seg));
        break;
      case ROLE.lantern:
        P.add(onTurret ? 'turretDetail' : 'hullDetail', partGeometry(p, off, seg));
        P.addEquipment(onTurret ? 'turretGlass' : 'hullGlass', markVehicleNightLens(
          frontFace(p, off, 0.004, (w, h) => KIT.box(Math.max(0.04, w * 0.7), Math.max(0.03, h * 0.6), 0.008)), 'headlight'));
        break;
      case ROLE.smoke: {
        // the launcher block and its tubes, each with its own forward aperture
        P.add('turretDetail', partGeometry(p, off, seg));
        const cols = Math.max(1, Math.min(4, Math.round(sx / 0.11))), rows = Math.max(1, Math.min(3, Math.round(sy / 0.11)));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const dx = (c - (cols - 1) / 2) * (sx / cols), dy = (r - (rows - 1) / 2) * (sy / rows);
            const tube = markSmokeTube(KIT.cylZ(Math.min(0.045, sx / cols * 0.4), 0.06, 12));
            P.add('turretDetail', frontFace(p, off, 0.02, () => KIT.xform(tube, dx, dy, 0)));
          }
        }
        break;
      }
      case ROLE.optic:
        P.add(onTurret ? 'turretDetail' : 'hullDetail', partGeometry(p, off, seg));
        P.add(onTurret ? 'turretGlass' : 'hullGlass',
          frontFace(p, off, 0.003, (w, h) => KIT.box(Math.max(0.03, w * 0.7), Math.max(0.02, h * 0.35), 0.008)));
        break;
      case ROLE.stowage:
        P.add(onTurret ? 'turretPaintedDetail' : 'hullPaintedDetail', partGeometry(p, off, seg));
        break;
      default:
        if (sx * sy * sz > 1e-6) P.add(onTurret ? 'turretPaintedDetail' : 'hullPaintedDetail', partGeometry(p, off, seg));
    }
  }
  // the add-on turret armour: the spec's two removable packages (schema-1 names, tankIdAliases.ts; `_R` on +X)
  for (const side of ['R', 'L'] as const) {
    if (!turretArmor[side].length) continue;
    const sector = `merkava_${tankSeedId(P.spec.id)}_turret_era_${side}`;
    P.destructibleCluster(sector, () => {
      for (const p of turretArmor[side]) P.addExternalArmor('turret', partGeometry(p, pivot, seg));
    });
  }
}
