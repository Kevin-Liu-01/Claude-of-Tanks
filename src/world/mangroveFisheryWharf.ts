/** Construction-only Mangrove wharf: adapt one accepted fishery, never add parts. */
import { Box3, Matrix4, Vector3, type BufferGeometry } from 'three';
import { convexHull2, type CollisionRecord } from './collision.ts';
import { applyStructureCollisionBand, deriveRuntimeStructureCollisionProfile } from './structureCollision.ts';
import { planRiverLanding, type RiverLandingAnchor } from './maps/riverLandings.ts';

type Buckets = Record<string, BufferGeometry[]>;
interface Pose { x: number; y: number; z: number; yaw: number }
export interface FisheryPacket {
  buckets: Buckets;
  source: Pose;
  records: CollisionRecord[];
  feature: { x: number; z: number; rot: number };
}
export interface FisheryVegetation {
  treeObstacles: readonly CollisionRecord[];
  concealers: readonly { x: number; z: number; r: number }[];
}
interface Field {
  getHeightAt(x: number, z: number): number;
  getWaterMaskAt(x: number, z: number): number;
  _roadDist(x: number, z: number): number;
  _layout: {
    lakes: readonly { x: number; z: number; r: number; level?: number }[];
    spawns: { player: { x: number; z: number }; enemies: readonly { x: number; z: number }[] };
  };
}
interface Support { min: number; max: number }
interface WharfPlan extends Pose { annexBottom: number; step: number; ground: Support }
export interface FisheryWharfReceipt {
  status: 'placed' | 'unavailable' | 'blocked';
  reason: string;
  pose?: Pose;
  step?: number;
  annexBottom?: number;
  parts?: number;
}

function matrix(p: Pose): Matrix4 {
  return new Matrix4().makeRotationY(p.yaw).setPosition(p.x, p.y, p.z);
}

function support(field: Field, p: Pose, x0: number, x1: number, z0: number, z1: number): Support {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  let min = Infinity, max = -Infinity;
  const nx = Math.ceil((x1 - x0) / 0.25), nz = Math.ceil((z1 - z0) / 0.25);
  for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
    const u = x0 + (x1 - x0) * ix / nx, v = z0 + (z1 - z0) * iz / nz;
    const x = p.x + c * u + s * v, z = p.z - s * u + c * v;
    if (field._roadDist(x, z) < 8 || field.getWaterMaskAt(x, z) !== 0) {
      throw new Error('foundation touches road or visible water');
    }
    const y = field.getHeightAt(x, z);
    if (!Number.isFinite(y)) throw new Error('non-finite foundation height');
    min = Math.min(min, y); max = Math.max(max, y);
  }
  return { min, max };
}

function plan(field: Field, anchor: RiverLandingAnchor): WharfPlan {
  const landing = planRiverLanding(field, field._layout.lakes, anchor);
  if (!landing) throw new Error('authored creek landing is unavailable');
  const yaw = Math.atan2(Math.cos(landing.angle), Math.sin(landing.angle));
  // The long dock meets the west side of the existing jetty. The boat keeps
  // its complete east-side beach and approach; no landing kit is moved.
  const p = { x: landing.x - Math.cos(yaw) * 8.7 - Math.sin(yaw) * 9.75,
    z: landing.z + Math.sin(yaw) * 8.7 - Math.cos(yaw) * 9.75, y: 0, yaw };
  const ground = support(field, p, -5.1, 5.1, -7.75, 7.75);
  p.y = Math.max(landing.deckY - 0.405, ground.max - 0.35 + 0.02);
  const annex = support(field, p, -8.7, -4.5, -4.9, 0.1);
  const annexBottom = annex.min - 0.06 - p.y;
  const step = p.y + 0.45 - (landing.deckY + 0.045);
  // Existing 30 cm dock timber physically overlaps the 9 cm jetty deck;
  // this is one bounded working-dock step, not an unsupported gangway gap.
  if (step < -0.025 || step > 0.275 || p.y + 0.15 >= landing.deckY + 0.04
      || annexBottom < -0.9 || annexBottom > 0) throw new Error('dock/foundation adaptation exceeds existing members');
  return { ...p, annexBottom, step, ground };
}

function bounds(geometries: readonly BufferGeometry[]): Box3 {
  const out = new Box3();
  for (const g of geometries) { g.computeBoundingBox(); out.union(g.boundingBox!); }
  return out;
}

function clearRecords(box: Box3, records: readonly CollisionRecord[], ignored: ReadonlySet<CollisionRecord>): void {
  for (const ob of records) {
    if (ignored.has(ob)) continue;
    if (box.max.x + 0.3 > ob.min[0] && box.min.x - 0.3 < ob.max[0]
      && box.max.z + 0.3 > ob.min[2] && box.min.z - 0.3 < ob.max[2]) {
      throw new Error(`occupied by ${ob.kind || 'prop'} at ${ob.min[0]},${ob.min[2]}`);
    }
  }
}

function clearVegetation(box: Box3, vegetation: FisheryVegetation): void {
  clearRecords(box, vegetation.treeObstacles, new Set());
  for (const disc of vegetation.concealers) {
    // Tree concealment discs use 80% of the authored crown radius. Inflate
    // back to the actual crown envelope; bushes are conservatively included.
    const dx = Math.max(box.min.x - disc.x, 0, disc.x - box.max.x);
    const dz = Math.max(box.min.z - disc.z, 0, disc.z - box.max.z);
    if (Math.hypot(dx, dz) < disc.r / 0.8 + 0.3) throw new Error('occupied by vegetation crown');
  }
}

function hull(g: BufferGeometry): number[] {
  const a = g.attributes.position, points: [number, number][] = [];
  for (let i = 0; i < a.count; i++) points.push([a.getX(i), a.getZ(i)]);
  return convexHull2(points);
}

function separated(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i += 2) {
    const j = (i + 2) % a.length, nx = a[j + 1] - a[i + 1], nz = a[i] - a[j];
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let k = 0; k < a.length; k += 2) { const q = a[k] * nx + a[k + 1] * nz; a0 = Math.min(a0, q); a1 = Math.max(a1, q); }
    for (let k = 0; k < b.length; k += 2) { const q = b[k] * nx + b[k + 1] * nz; b0 = Math.min(b0, q); b1 = Math.max(b1, q); }
    if (a1 <= b0 || b1 <= a0) return true;
  }
  return false;
}

function clearBoat(parts: readonly BufferGeometry[], dressing: readonly BufferGeometry[], field: Field, anchor: RiverLandingAnchor): void {
  const landing = planRiverLanding(field, field._layout.lakes, anchor)!;
  const center = new Vector3();
  const boat = dressing.filter(g => {
    g.computeBoundingBox(); g.boundingBox!.getCenter(center);
    return Math.hypot(center.x - landing.boatX, center.z - landing.boatZ) < 4.5;
  });
  if (boat.length !== 10) throw new Error('expected complete unchanged ten-part creek boat');
  for (const a of parts) for (const b of boat) {
    if (!a.boundingBox!.intersectsBox(b.boundingBox!)) continue;
    const ah = hull(a), bh = hull(b);
    if (!separated(ah, bh) && !separated(bh, ah)) throw new Error('fishery intersects creek boat');
  }
}

function bodySupportMembers(local: Buckets, p: WharfPlan, field: Field): BufferGeometry[] {
  const piles = local.wood.filter(g => {
    const b = g.boundingBox!;
    return Math.abs(b.min.y + 1.7) < 0.001 && Math.abs(b.max.y - 0.5) < 0.001
      && Math.abs(b.min.z - 9.625) < 0.001 && Math.abs(b.max.z - 9.875) < 0.001;
  });
  if (piles.length !== 4) throw new Error('expected four original connected dock piles');
  for (const g of piles) {
    const b = g.boundingBox!, oldX = (b.min.x + b.max.x) / 2;
    if (Math.abs(oldX) > 6) continue; // the two outer dock supports stay exact
    const x = Math.sign(oldX) * 4.85, z = oldX < 0 ? 3.8 : -5.5;
    const ground = support(field, p, x - 0.125, x + 0.125, z - 0.125, z + 0.125);
    const bottom = ground.min - p.y - 0.08, top = 0.39;
    if (top - bottom < 0.12 || top - bottom > 2.2) throw new Error('body support exceeds original pile length');
    const position = g.attributes.position, uv = g.attributes.uv, normal = g.attributes.normal;
    // The visible west-side gap lies in front of the annex; the other post
    // supports the opposite rear corner. Both remain recessed 12.5 cm inside
    // the wall and penetrate the closed floor underside by 4 cm. The annex
    // and front dock provide the remaining rear/forward ground load paths.
    for (let i = 0; i < position.count; i++) {
      const oldY = position.getY(i), y = oldY > -0.6 ? top : bottom;
      position.setXYZ(i, position.getX(i) + x - oldX, y, position.getZ(i) + z - 9.75);
      if (Math.abs(normal.getY(i)) < 0.5) uv.setY(i, uv.getY(i) + (y - oldY) * 0.55);
    }
    g.computeBoundingBox();
  }
  return piles;
}

function checkMembers(local: Buckets, p: WharfPlan, field: Field, dressing: readonly BufferGeometry[],
  anchor: RiverLandingAnchor, piles: readonly BufferGeometry[]): void {
  const point = new Vector3(), pose = matrix(p);
  for (const pile of piles) {
    const b = pile.boundingBox!;
    for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) {
      point.set(x, b.min.y, z).applyMatrix4(pose);
      const ground = field.getHeightAt(point.x, point.z);
      if (point.y > ground - 0.05 || p.y + b.max.y < ground + 0.05
        || field._roadDist(point.x, point.z) < 8) throw new Error('dock pile lacks ground contact or route clearance');
    }
    const bodyPost = Math.abs((b.min.x + b.max.x) / 2) < 6;
    if (bodyPost && (b.min.x < -5.1 || b.max.x > 5.1 || b.min.z < -7.75 || b.max.z > 7.75
      || Math.abs(b.max.y - 0.39) > 0.0001)) throw new Error('body post lacks recessed floor contact');
  }
  const dock = local.wood.find(g => Math.abs(g.boundingBox!.min.z - 7.75) < 0.001
    && Math.abs(g.boundingBox!.max.z - 11.75) < 0.001 && Math.abs(g.boundingBox!.max.x - 8.2) < 0.001);
  if (!dock) throw new Error('expected complete original fishery dock');
  const landing = planRiverLanding(field, field._layout.lakes, anchor)!;
  const deck = dressing.filter(g => {
    g.computeBoundingBox(); const b = g.boundingBox!; b.getCenter(point);
    return Math.abs(b.max.y - b.min.y - 0.09) < 0.001
      && Math.hypot(point.x - landing.x, point.z - landing.z) < 1.5;
  });
  if (deck.length !== 1) throw new Error('expected actual first jetty deck');
  const a = hull(dock).map((q, i, values) => i % 2 === 0
    ? p.x + Math.cos(p.yaw) * q + Math.sin(p.yaw) * values[i + 1]
    : p.z - Math.sin(p.yaw) * values[i - 1] + Math.cos(p.yaw) * q);
  const b = hull(deck[0]);
  const vertical = Math.min(p.y + dock.boundingBox!.max.y, deck[0].boundingBox!.max.y)
    - Math.max(p.y + dock.boundingBox!.min.y, deck[0].boundingBox!.min.y);
  if (vertical < 0.02 || separated(a, b) || separated(b, a)) throw new Error('actual dock and jetty have no solid contact');
}

function lowerAnnex(buckets: Buckets, bottom: number): void {
  const annex = buckets.stone.filter(g => {
    const b = g.boundingBox!;
    return Math.abs(b.min.x + 8.7) < 0.001 && Math.abs(b.max.x + 4.5) < 0.001
      && Math.abs(b.min.z + 4.9) < 0.001 && Math.abs(b.max.z - 0.1) < 0.001;
  });
  if (annex.length !== 1) throw new Error('expected one original fishery annex');
  const g = annex[0], a = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < a.count; i++) {
    if (a.getY(i) > 0.001) continue;
    a.setY(i, bottom);
    // Preserve the existing jitter offset and metric density on vertical
    // foundation faces; the unchanged horizontal underside stays buried.
    if (Math.abs(n.getY(i)) < 0.5) uv.setY(i, uv.getY(i) + bottom * 0.55);
  }
  g.computeBoundingBox();
}

function cloneLocal(packet: FisheryPacket, local: Buckets): void {
  const inverse = matrix(packet.source).invert();
  for (const [key, values] of Object.entries(packet.buckets)) {
    local[key] = values.map(g => g.clone().applyMatrix4(inverse));
    for (const g of local[key]) g.computeBoundingBox();
  }
}

function commitGeometry(packet: FisheryPacket, local: Buckets): void {
  for (const [key, values] of Object.entries(local)) for (let i = 0; i < values.length; i++) {
    const from = values[i], to = packet.buckets[key][i];
    for (const key of Object.keys(from.attributes)) to.attributes[key].array.set(from.attributes[key].array);
    to.computeBoundingBox();
  }
}

/** Failure is explicit and atomic; no candidate search, resampling or fallback. */
export function composeMangroveFisheryWharf(mapId: string, field: Field, packet: FisheryPacket | null,
  anchor: RiverLandingAnchor | undefined, blockers: readonly CollisionRecord[],
  vegetation: FisheryVegetation | null, dressing: readonly BufferGeometry[]): FisheryWharfReceipt | null {
  if (mapId !== 'mangrove') return null;
  if (!packet || !anchor || !vegetation) return { status: 'unavailable', reason: 'missing accepted fishery, landing or vegetation input' };
  const local: Buckets = {};
  try {
    const p = plan(field, anchor);
    cloneLocal(packet, local);
    lowerAnnex(local, p.annexBottom);
    const piles = bodySupportMembers(local, p, field);
    checkMembers(local, p, field, dressing, anchor, piles);
    const profile = deriveRuntimeStructureCollisionProfile(local);
    if (profile.shell.length + 1 !== packet.records.length) throw new Error('adaptation changes collision-band allocation');
    const target = matrix(p), parts = Object.values(local).flat();
    for (const g of parts) g.applyMatrix4(target);
    const box = bounds(parts), spawns = field._layout.spawns;
    for (const s of [spawns.player, ...spawns.enemies]) {
      const dx = Math.max(box.min.x - s.x, 0, s.x - box.max.x), dz = Math.max(box.min.z - s.z, 0, s.z - box.max.z);
      if (Math.hypot(dx, dz) < 32) throw new Error('fishery enters deployment clearance');
    }
    clearRecords(box, blockers, new Set(packet.records));
    clearVegetation(box, vegetation);
    clearBoat(parts, dressing, field, anchor);
    // Commit only after all geometry, support and occupancy checks succeed.
    commitGeometry(packet, local);
    const bands = [profile.contact, ...profile.shell];
    bands.forEach((band, i) => {
      const ob = packet.records[i];
      ob.min[1] = p.y + band.minY; ob.max[1] = p.y + band.maxY;
      applyStructureCollisionBand(ob, band, p.x, p.z, p.yaw);
    });
    Object.assign(packet.feature, { x: p.x, z: p.z, rot: p.yaw });
    return { status: 'placed', reason: '', pose: { x: p.x, y: p.y, z: p.z, yaw: p.yaw },
      step: p.step, annexBottom: p.annexBottom, parts: parts.length };
  } catch (error) {
    return { status: 'blocked', reason: error instanceof Error ? error.message : String(error) };
  } finally {
    for (const values of Object.values(local)) for (const g of values) g.dispose();
  }
}
