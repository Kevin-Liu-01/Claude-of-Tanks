import * as THREE from 'three';

/** Event-only sheet-metal damage. This is not armor or soft-body simulation. */
export const EQUIPMENT_DAMAGE_LIMITS = Object.freeze({
  vehicles: 8,
  partsPerVehicle: 8,
  verticesPerPart: 36,
  maxContactDistanceM: 0.30,
  maxAngleRad: 0.10,
  maxDisplacementM: 0.04,
});

type OwnerFrame = 'hull' | 'turret';
type Vec3 = readonly number[];

export interface EquipmentDamageEvent {
  impactFrame?: string;
  impactLocalPos?: Vec3 | null;
  impactLocalNormal?: Vec3 | null;
  caliberMm?: number;
  kind?: string;
}

// A geometry identity opt-in survives the existing in-place profile transforms.
// No topology, attributes, shader, material or gameplay receipt is modified.
const sheetMetalLids = new WeakSet<THREE.BufferGeometry>();
const activeVehicles = new Set<EquipmentDamage>();

export function markEquipmentLid<T extends THREE.BufferGeometry>(geometry: T): T {
  sheetMetalLids.add(geometry);
  return geometry;
}

interface GeometryOwner {
  geometry: THREE.BufferGeometry;
  changed: boolean;
  box: THREE.Box3 | null;
  sphere: THREE.Sphere | null;
}

interface PartRange {
  owner: GeometryOwner;
  frame: OwnerFrame;
  start: number;
  position: THREE.BufferAttribute;
  normal: THREE.BufferAttribute;
  min: THREE.Vector3;
  max: THREE.Vector3;
  hinge: THREE.Vector3;
  axis: THREE.Vector3;
  up: THREE.Vector3;
  forward: THREE.Vector3;
  originalPosition: Float32Array | null;
  originalNormal: Float32Array | null;
}

function finiteVector(value: Vec3 | null | undefined): value is Vec3 {
  return Array.isArray(value) && value.length === 3
    && Number.isFinite(value[0]) && Number.isFinite(value[1]) && Number.isFinite(value[2]);
}

function isOwnerFrame(frame: string | undefined): frame is OwnerFrame {
  return frame === 'hull' || frame === 'turret';
}

function isEquipmentRole(role: string): boolean {
  return role === 'equipment' || role === 'nonArmor';
}

interface LocalEquipmentHit extends EquipmentDamageEvent {
  impactFrame: OwnerFrame;
  impactLocalPos: Vec3;
  impactLocalNormal: Vec3;
  caliberMm: number;
}

function isLocalEquipmentHit(event: EquipmentDamageEvent): event is LocalEquipmentHit {
  return finiteVector(event.impactLocalPos) && finiteVector(event.impactLocalNormal)
    && isOwnerFrame(event.impactFrame)
    && Number.isFinite(event.caliberMm) && Number(event.caliberMm) >= 20
    && ['pen', 'he_pen', 'nonpen', 'ricochet', 'spaced_absorb', 'he_splash'].includes(event.kind || '');
}

function ownFloatPosition(geometry: THREE.BufferGeometry, name: string): THREE.BufferAttribute | null {
  const attribute = geometry.getAttribute(name);
  return attribute instanceof THREE.BufferAttribute && attribute.itemSize === 3
    && attribute.array instanceof Float32Array ? attribute : null;
}

function markChanged(attribute: THREE.BufferAttribute, start: number, count: number): void {
  // Repeated reset/reuse before a GPU upload must not grow pending ranges.
  // Only eight fixed disjoint lid ranges can be registered on an owned buffer.
  for (const range of attribute.updateRanges) {
    if (range.start <= start && range.start + range.count >= start + count) {
      attribute.needsUpdate = true;
      return;
    }
  }
  attribute.addUpdateRange(start, count);
  attribute.needsUpdate = true;
}

function nearestRange(ranges: readonly PartRange[], frame: OwnerFrame, p: Vec3): PartRange | null {
  let closest: PartRange | null = null;
  let distanceSq = EQUIPMENT_DAMAGE_LIMITS.maxContactDistanceM ** 2;
  for (const range of ranges) {
    if (range.frame !== frame) continue;
    const x = range.axis.x * p[0] + range.axis.y * p[1] + range.axis.z * p[2];
    const y = range.up.x * p[0] + range.up.y * p[1] + range.up.z * p[2];
    const z = range.forward.x * p[0] + range.forward.y * p[1] + range.forward.z * p[2];
    const dx = Math.max(range.min.x - x, 0, x - range.max.x);
    const dy = Math.max(range.min.y - y, 0, y - range.max.y);
    const dz = Math.max(range.min.z - z, 0, z - range.max.z);
    const candidate = dx * dx + dy * dy + dz * dz;
    if (candidate <= distanceSq && (!closest || candidate < distanceSq)) {
      closest = range;
      distanceSq = candidate;
    }
  }
  return closest;
}

function foldLid(range: PartRange, caliberMm: number): void {
  const first = range.start * 3;
  const last = first + EQUIPMENT_DAMAGE_LIMITS.verticesPerPart * 3;
  const positions = range.position.array as Float32Array;
  const normals = range.normal.array as Float32Array;
  range.originalPosition = positions.slice(first, last);
  range.originalNormal = normals.slice(first, last);
  const angle = Math.min(EQUIPMENT_DAMAGE_LIMITS.maxAngleRad, Number(caliberMm) / 1600);
  const cos = Math.cos(angle), sin = -Math.sin(angle);
  const axis = range.axis, hinge = range.hinge;
  for (let offset = first; offset < last; offset += 3) {
    // Rodrigues rotation around the rear lid hinge. Both positions and
    // normals use the same rigid fold; authored topology/UVs remain exact.
    for (let attribute = 0; attribute < 2; attribute++) {
      const array = attribute === 0 ? positions : normals;
      const hx = attribute === 0 ? hinge.x : 0;
      const hy = attribute === 0 ? hinge.y : 0;
      const hz = attribute === 0 ? hinge.z : 0;
      const x = array[offset] - hx, y = array[offset + 1] - hy, z = array[offset + 2] - hz;
      const dot = axis.x * x + axis.y * y + axis.z * z;
      array[offset] = hx + x * cos + (axis.y * z - axis.z * y) * sin + axis.x * dot * (1 - cos);
      array[offset + 1] = hy + y * cos + (axis.z * x - axis.x * z) * sin + axis.y * dot * (1 - cos);
      array[offset + 2] = hz + z * cos + (axis.x * y - axis.y * x) * sin + axis.z * dot * (1 - cos);
    }
  }
  markChanged(range.position, first, last - first);
  markChanged(range.normal, first, last - first);
}

function expandDamagedBounds(owner: GeometryOwner): void {
  if (owner.changed) return;
  owner.changed = true;
  owner.box = owner.geometry.boundingBox;
  owner.sphere = owner.geometry.boundingSphere;
  // Never scan the full merged mesh on an impact. Existing bounds get a
  // conservative expansion; absent bounds are computed normally on draw.
  if (owner.box) {
    owner.geometry.boundingBox = owner.box.clone();
    owner.geometry.boundingBox.expandByScalar(EQUIPMENT_DAMAGE_LIMITS.maxDisplacementM);
  }
  if (owner.sphere) {
    owner.geometry.boundingSphere = owner.sphere.clone();
    owner.geometry.boundingSphere.radius += EQUIPMENT_DAMAGE_LIMITS.maxDisplacementM;
  }
}

/** At most eight affected vehicles; releasing/resetting one makes its slot reusable. */
export function resetEquipmentDamage(): void {
  for (const vehicle of activeVehicles) vehicle.reset();
}

export function equipmentDamageStats(): { activeVehicles: number; parts: number; savedBytes: number } {
  let parts = 0;
  for (const vehicle of activeVehicles) parts += vehicle.damagedParts;
  return { activeVehicles: activeVehicles.size, parts,
    savedBytes: parts * EQUIPMENT_DAMAGE_LIMITS.verticesPerPart * 3 * 4 * 2 };
}

export class EquipmentDamage {
  private readonly ranges: PartRange[] = [];
  private readonly owners: GeometryOwner[] = [];
  private disposed = false;
  damagedParts = 0;

  /** Bind only owned merged equipment buffers, while their part offsets still exist. */
  bindMerged(
    parts: readonly THREE.BufferGeometry[],
    merged: THREE.BufferGeometry,
    frame: string,
    role: string,
  ): void {
    if (this.disposed || !isOwnerFrame(frame) || !isEquipmentRole(role) || merged.index) return;
    const position = ownFloatPosition(merged, 'position');
    const normal = ownFloatPosition(merged, 'normal');
    if (!position || !normal || normal.count !== position.count) return;
    let owner: GeometryOwner | null = null;
    let start = 0;
    for (const part of parts) {
      const count = part.index?.count ?? part.getAttribute('position')?.count ?? 0;
      if (sheetMetalLids.has(part) && count === EQUIPMENT_DAMAGE_LIMITS.verticesPerPart
          && this.ranges.length < EQUIPMENT_DAMAGE_LIMITS.partsPerVehicle
          && start + count <= position.count) {
        owner = this.bindLidRange(merged, owner, frame, start, position, normal);
      }
      start += count;
    }
  }

  private bindLidRange(
    merged: THREE.BufferGeometry, owner: GeometryOwner | null, frame: OwnerFrame,
    start: number, position: THREE.BufferAttribute, normal: THREE.BufferAttribute,
  ): GeometryOwner | null {
    // These exact box faces survive mergeAll's index expansion: +X at
    // vertex 0, +Y at 12 and +Z at 24. Derive the FINAL transformed hinge,
    // not the helper's pre-variant coordinates, after all profile edits.
    const axis = new THREE.Vector3().fromBufferAttribute(normal, start).normalize();
    const up = new THREE.Vector3().fromBufferAttribute(normal, start + 12).normalize();
    const forward = new THREE.Vector3().fromBufferAttribute(normal, start + 24).normalize();
    const handedness = new THREE.Vector3().crossVectors(axis, up).dot(forward);
    if (!(handedness > 0.999 && Math.abs(axis.dot(up)) < 1e-4
        && Math.abs(axis.dot(forward)) < 1e-4 && Math.abs(up.dot(forward)) < 1e-4)) return owner;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const point = new THREE.Vector3();
    const projected = new THREE.Vector3();
    for (let vertex = start; vertex < start + EQUIPMENT_DAMAGE_LIMITS.verticesPerPart; vertex++) {
      point.fromBufferAttribute(position, vertex);
      projected.set(point.dot(axis), point.dot(up), point.dot(forward));
      min.min(projected); max.max(projected);
    }
    const thickness = max.y - min.y;
    const reach = max.z - min.z;
    // Do not silently turn a heavily reshaped donor into eligible metal.
    if (!(thickness > 0 && thickness <= 0.05 && reach > 0 && reach <= 0.35)) return owner;
    if (!owner) {
      owner = { geometry: merged, changed: false, box: null, sphere: null };
      this.owners.push(owner);
    }
    const hinge = axis.clone().multiplyScalar((min.x + max.x) * 0.5);
    hinge.addScaledVector(up, (min.y + max.y) * 0.5);
    hinge.addScaledVector(forward, min.z);
    this.ranges.push({ owner, frame, start, position, normal, min, max, hinge, axis, up, forward,
      originalPosition: null, originalNormal: null });
    return owner;
  }

  /** One bounded nearest-part buckle per hit; no frame-loop work or mesh copies. */
  apply(event: EquipmentDamageEvent): boolean {
    if (this.disposed || !isLocalEquipmentHit(event)) return false;
    const closest = nearestRange(this.ranges, event.impactFrame, event.impactLocalPos);
    // Choose against REST bounds including already-damaged parts. A repeated
    // contact cannot walk to the next untouched lid, even without an event ID.
    if (!closest || closest.originalPosition) return false;
    if (!activeVehicles.has(this) && activeVehicles.size >= EQUIPMENT_DAMAGE_LIMITS.vehicles) return false;
    const normal = event.impactLocalNormal;
    const normalLengthSq = normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2;
    if (normalLengthSq < 1e-8) return false;
    foldLid(closest, event.caliberMm);
    expandDamagedBounds(closest.owner);
    this.damagedParts++;
    activeVehicles.add(this);
    return true;
  }

  reset(): void {
    for (const range of this.ranges) {
      if (!range.originalPosition || !range.originalNormal) continue;
      const first = range.start * 3;
      range.position.array.set(range.originalPosition, first);
      range.normal.array.set(range.originalNormal, first);
      markChanged(range.position, first, range.originalPosition.length);
      markChanged(range.normal, first, range.originalNormal.length);
      range.originalPosition = range.originalNormal = null;
    }
    for (const owner of this.owners) {
      if (!owner.changed) continue;
      owner.geometry.boundingBox = owner.box;
      owner.geometry.boundingSphere = owner.sphere;
      owner.box = owner.sphere = null;
      owner.changed = false;
    }
    this.damagedParts = 0;
    activeVehicles.delete(this);
  }

  dispose(): void {
    this.reset();
    this.disposed = true;
    this.ranges.length = 0;
    this.owners.length = 0;
  }
}
