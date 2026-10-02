import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

interface CrownAnchor { point: THREE.Vector3; flex: number }
interface Attachment { root: number[]; tip: number[]; gap: number }

/** Card centres must be sampled on the bent plane, not at its pre-bend aCard station. */
function cardAnchors(cards: THREE.BufferGeometry): CrownAnchor[] {
  const positions = cards.getAttribute('position');
  const stations = cards.getAttribute('aCard');
  const flex = cards.getAttribute('aFlex');
  const uv = cards.getAttribute('uv');
  const anchors: CrownAnchor[] = [];
  const seen = new Set<string>();
  const triangle = new THREE.Triangle();
  const centre = new THREE.Vector3(.5, .5, 0), bary = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 3) {
    const key = `${stations.getX(i)},${stations.getY(i)},${stations.getZ(i)}`;
    if (seen.has(key)) continue;
    triangle.a.set(uv.getX(i), uv.getY(i), 0);
    triangle.b.set(uv.getX(i + 1), uv.getY(i + 1), 0);
    triangle.c.set(uv.getX(i + 2), uv.getY(i + 2), 0);
    if (!triangle.getBarycoord(centre, bary) || Math.min(bary.x, bary.y, bary.z) < -1e-5) continue;
    const point = new THREE.Vector3();
    for (let k = 0; k < 3; k++) point.addScaledVector(new THREE.Vector3().fromBufferAttribute(positions, i + k), bary.getComponent(k));
    anchors.push({ point, flex: flex.getX(i) });
    seen.add(key);
  }
  return anchors;
}

/** Closest physical surface, including the tree's crook and secondary forks. */
function nearestBark(trunk: THREE.BufferGeometry, point: THREE.Vector3): { point: THREE.Vector3; flex: number; color: THREE.Color } {
  const uv = trunk.getAttribute('uv');
  const pos = trunk.getAttribute('position'), colors = trunk.getAttribute('color'), flex = trunk.getAttribute('aFlex');
  const triangle = new THREE.Triangle(), candidate = new THREE.Vector3(), root = new THREE.Vector3(), bary = new THREE.Vector3();
  let best = Infinity, base = 0;
  for (let i = 0; i < pos.count; i += 3) {
    if (uv.getX(i) < 0) continue; // Snow is a load, never a parent branch.
    triangle.a.fromBufferAttribute(pos, i); triangle.b.fromBufferAttribute(pos, i + 1); triangle.c.fromBufferAttribute(pos, i + 2);
    triangle.closestPointToPoint(point, candidate);
    const distance = candidate.distanceToSquared(point);
    if (distance >= best) continue;
    best = distance; root.copy(candidate); base = i;
  }
  triangle.a.fromBufferAttribute(pos, base); triangle.b.fromBufferAttribute(pos, base + 1); triangle.c.fromBufferAttribute(pos, base + 2);
  triangle.getBarycoord(root, bary);
  const color = new THREE.Color(0, 0, 0);
  let wind = 0;
  for (let k = 0; k < 3; k++) {
    const weight = bary.getComponent(k);
    wind += flex.getX(base + k) * weight;
    color.r += colors.getX(base + k) * weight;
    color.g += colors.getY(base + k) * weight;
    color.b += colors.getZ(base + k) * weight;
  }
  return { point: root, flex: wind, color };
}

function branchGeometry(root: ReturnType<typeof nearestBark>, anchor: CrownAnchor): THREE.BufferGeometry {
  const delta = anchor.point.clone().sub(root.point), length = delta.length();
  // Start inside the parent surface. Thin tapered branchlets remain in the
  // existing instanced bark draw; they add neither objects nor frame work.
  const radius = Math.min(.055, .016 + length * .012);
  const g = new THREE.CylinderGeometry(.009, radius, length + radius, 3, 1, true);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3), flex = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, (pos.getY(i) + (length + radius) / 2 - radius) / length));
    flex[i] = root.flex + (anchor.flex - root.flex) * t;
    colors.set([root.color.r, root.color.g, root.color.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('aFlex', new THREE.BufferAttribute(flex, 1));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  g.translate(...root.point.clone().addScaledVector(delta, (length - radius) / 2).toArray());
  const flat = g.toNonIndexed(); g.dispose();
  return flat;
}

/** Construction-only attachment pass shared by battle, Garage and baked impostors. */
export function attachTreeCards(pair: { trunk: THREE.BufferGeometry; cards: THREE.BufferGeometry }): typeof pair {
  const anchors = cardAnchors(pair.cards);
  const snow = pair.trunk.getAttribute('uv'), pos = pair.trunk.getAttribute('position');
  const flex = pair.trunk.getAttribute('aFlex');
  // Snow lobes are nonindexed 20-face icosahedra marked by the bark atlas.
  for (let i = 0; i < pos.count; i++) {
    if (snow.getX(i) >= 0) continue;
    const point = new THREE.Vector3();
    for (let k = 0; k < 60; k++) point.add(new THREE.Vector3().fromBufferAttribute(pos, i + k));
    anchors.push({point: point.multiplyScalar(1 / 60), flex: flex.getX(i)});
    i += 59;
  }
  return attachAnchors(pair, anchors);
}

function attachAnchors<T extends {trunk: THREE.BufferGeometry}>(pair: T, anchors: CrownAnchor[]): T {
  const parts = [pair.trunk];
  const originalVertices = pair.trunk.getAttribute('position').count;
  const attachments: Attachment[] = [];
  for (const anchor of anchors) {
    const root = nearestBark(pair.trunk, anchor.point);
    const gap = root.point.distanceTo(anchor.point);
    if (gap > .015) parts.push(branchGeometry(root, anchor));
    attachments.push({ root: root.point.toArray(), tip: anchor.point.toArray(), gap });
  }
  if (parts.length > 1) {
    const trunk = mergeGeometries(parts, false);
    if (!trunk) throw new Error('Tree attachment attributes must match bark geometry');
    trunk.userData = { ...pair.trunk.userData };
    for (const part of parts) part.dispose();
    pair.trunk = trunk;
  }
  pair.trunk.userData.crownAttachments = attachments;
  pair.trunk.userData.originalTrunkVertices = originalVertices;
  return pair;
}


/** Far/mobile opaque lobes need support too; joined triangle corners identify
 * each authored crown lobe without relying on primitive vertex-count guesses. */
export function attachTreeLobes<T extends {trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry}>(pair: T): T {
  const p = pair.canopy.getAttribute('position'), flex = pair.canopy.getAttribute('aFlex');
  const parents = Array.from({length: p.count / 3}, (_, i) => i);
  const find = (i: number): number => {
    while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; }
    return i;
  };
  const corners = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i)*1e5)},${Math.round(p.getY(i)*1e5)},${Math.round(p.getZ(i)*1e5)}`;
    const owner = corners.get(key), face = Math.floor(i / 3);
    if (owner !== undefined) parents[find(face)] = find(owner);
    else corners.set(key, face);
  }
  const islands = new Map<number, {point: THREE.Vector3; flex: number; count: number}>();
  for (let i = 0; i < p.count; i++) {
    const root = find(Math.floor(i / 3));
    let island = islands.get(root);
    if (!island) { island = {point: new THREE.Vector3(), flex: flex.getX(i), count: 0}; islands.set(root, island); }
    island.point.x += p.getX(i); island.point.y += p.getY(i); island.point.z += p.getZ(i); island.count++;
  }
  return attachAnchors(pair, [...islands.values()].map(island => ({point: island.point.multiplyScalar(1 / island.count), flex: island.flex})));
}
