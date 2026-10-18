// garage r9 display placement receipt: in every Garage with a kit, no display, sign, banner or atmosphere card enters
// the hero's halo in the canonical frame (the hero's screen box plus 8 %), and no display face cuts into the scene's
// structures (the pack's buildings, facility frames and rock) by more than a centimetre.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { GARAGE_PRESENTATION_POSE } from '../game/garagePresentationPose.ts';
import { garageKitItemBounds, clearGarageKitCache } from './garageKitPlacement.ts';
import { GARAGE_KIT_PLACEMENTS } from './garageKitPlacements.ts';
import { garageSlideshowPose } from './garageSlideshowPlacement.ts';
import { buildGarageVerdantKit } from './garageVerdantKit.ts';
import {
  buildGarageEnvironment, createGarageEnvironmentAssetLibrary, prepareGarageEnvironmentAssets,
} from './garageEnvironmentKit.ts';

// The canonical camera as the showroom fits it at 1280 x 720 (measured in the garage r9 kit lane's capture, 2026-10-18:
// the stage at the origin), and the hero's silhouette as a hull, a turret and the gun to its muzzle (the T-90M the
// canonical captures stage): its screen box matches the captures' hero pixels (x 29-64 %, y 29-52 %).
const camera = new THREE.PerspectiveCamera(GARAGE_PRESENTATION_POSE.cameraFovDeg, 16 / 9, 0.5, 4000);
camera.position.set(13.45768, 2.35202, 13.45768);
camera.quaternion.set(-0.050636964, 0.382108203, 0.020974517, 0.922490807);
camera.updateMatrixWorld(true);
const heroPoints = [];
for (const [a, b] of [[[-1.8, 0.36, -3.4], [1.8, 2.2, 3.6]], [[-1.3, 2.0, -2.0], [1.3, 2.9, 1.5]]]) {
  for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) heroPoints.push(new THREE.Vector3(x, y, z));
}
heroPoints.push(new THREE.Vector3(0, 2.45, 5.9), new THREE.Vector3(0, 2.35, 5.9));
const heroBox = new THREE.Box3().setFromPoints(heroPoints);
const screenRect = (box) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, front = 0;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    if (p.z > -0.1) continue; // behind the camera
    front += 1;
    const ndc = new THREE.Vector3(x, y, z).project(camera);
    const sx = (ndc.x + 1) / 2, sy = (1 - ndc.y) / 2;
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  return front ? { minX, minY, maxX, maxY } : null;
};
const hero = (() => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of heroPoints) {
    const ndc = point.clone().project(camera);
    minX = Math.min(minX, (ndc.x + 1) / 2); maxX = Math.max(maxX, (ndc.x + 1) / 2);
    minY = Math.min(minY, (1 - ndc.y) / 2); maxY = Math.max(maxY, (1 - ndc.y) / 2);
  }
  return { minX, minY, maxX, maxY };
})();
assert.ok(Math.abs(hero.minX - 0.29) < 0.02 && Math.abs(hero.maxX - 0.635) < 0.02, 'the hero proxy matches the captures');
void heroBox;
const halo = { minX: hero.minX - 0.08, maxX: hero.maxX + 0.08, minY: hero.minY - 0.08, maxY: hero.maxY + 0.08 };
const inHalo = (rect) => rect && rect.maxX > halo.minX && rect.minX < halo.maxX && rect.maxY > halo.minY && rect.minY < halo.maxY
  && rect.maxX > 0 && rect.minX < 1 && rect.maxY > 0 && rect.minY < 1;

// triangle / box overlap (separating axes), the box shrunk by the centimetre the rule allows; an oriented box (a display
// quad's own frame: across, up and its normal) is tested by carrying the triangle into its frame
const overlap = (() => {
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const e = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const n = new THREE.Vector3(), axis = new THREE.Vector3();
  const project = (half) => {
    const r = half.x * Math.abs(axis.x) + half.y * Math.abs(axis.y) + half.z * Math.abs(axis.z);
    const p = v.map((point) => point.dot(axis));
    return Math.min(...p) > r || Math.max(...p) < -r;
  };
  return (a, b, c, center, half) => {
    v[0].copy(a).sub(center); v[1].copy(b).sub(center); v[2].copy(c).sub(center);
    for (let i = 0; i < 3; i += 1) {
      const lo = Math.min(v[0].getComponent(i), v[1].getComponent(i), v[2].getComponent(i));
      const hi = Math.max(v[0].getComponent(i), v[1].getComponent(i), v[2].getComponent(i));
      if (lo > half.getComponent(i) || hi < -half.getComponent(i)) return false;
    }
    e[0].subVectors(v[1], v[0]); e[1].subVectors(v[2], v[1]); e[2].subVectors(v[0], v[2]);
    n.crossVectors(e[0], e[1]);
    axis.copy(n); if (axis.lengthSq() > 1e-12 && project(half)) return false;
    for (const edge of e) for (const unit of axes) {
      axis.crossVectors(edge, unit);
      if (axis.lengthSq() > 1e-12 && project(half)) return false;
    }
    return true;
  };
})();

const assets = createGarageEnvironmentAssetLibrary({});
for (const [architecture, placement] of Object.entries(GARAGE_KIT_PLACEMENTS)) {
  clearGarageKitCache();
  const variant = GARAGE_VARIANTS.find((item) => item.architecture === architecture);
  await prepareGarageEnvironmentAssets(assets, variant);
  // the scene without its kit: the structures every display must keep clear of
  const bare = buildGarageEnvironment({}, assets, variant, () => {}, { kitPlacement: null });
  const obstacles = [];
  bare.root.updateMatrixWorld(true);
  bare.root.traverse((object) => {
    if (!object.isMesh || !/^(authored_structures_(?!glass|route)|garage_facility_(?!contact))/.test(object.name)) return;
    obstacles.push(object);
  });
  assert.ok(obstacles.length >= 6, `${architecture}: the scene's structures are measured`);
  const bounds = garageKitItemBounds(variant, placement, bare.groundAtWorld);
  const triangle = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const instanceMatrix = new THREE.Matrix4();
  let intrusions = 0;
  const offenders = [];
  for (const { item, solid, quads, quadCorners } of bounds) {
    const isDisplay = item.kind === 'display' || item.kind === 'sign' || (item.kind === 'wall' && item.params?.mural);
    if (!isDisplay) continue;
    // the slideshow by its screen (the dressing's one screen at the shared pose; its frame is the support) and against
    // the structures by its whole frame; everything else by its faces and decals
    let boxes = quads.length ? quads : [solid];
    // each face as an oriented box in its own frame (its plane and edges), so a face turned off the world's axes is not
    // measured by its world box (the design: no display OBB cuts a structure by more than a centimetre)
    let frames = quads.length ? quadCorners.map(([a, b, c, d]) => {
      const center = new THREE.Vector3().add(a).add(b).add(c).add(d).multiplyScalar(0.25);
      const u = new THREE.Vector3().subVectors(b, a), v = new THREE.Vector3().subVectors(d, a);
      const width = u.length(), height = v.length();
      u.normalize(); v.normalize();
      const n = new THREE.Vector3().crossVectors(u, v).normalize();
      v.crossVectors(n, u).normalize();
      const toLocal = new THREE.Matrix4().makeBasis(u, v, n).setPosition(center).invert();
      return { toLocal, half: new THREE.Vector3(Math.max(0.001, width / 2 - 0.01), Math.max(0.001, height / 2 - 0.01), 0.004) };
    }) : null;
    if (item.kind === 'display' && item.display === 'slideshow') {
      const pose = garageSlideshowPose(architecture);
      const across = new THREE.Vector3(Math.cos(pose.yaw), 0, -Math.sin(pose.yaw)).multiplyScalar(pose.width / 2);
      const centre = new THREE.Vector3(...pose.position);
      const screen = new THREE.Box3().setFromPoints([
        centre.clone().add(across).setY(centre.y - pose.height / 2), centre.clone().sub(across).setY(centre.y + pose.height / 2),
      ]);
      assert.ok(!inHalo(screenRect(screen)), `${architecture}: the slideshow's screen enters the hero's halo`);
      boxes = [solid];
      frames = null;
    }
    for (const [boxIndex, box] of boxes.entries()) {
    const frame = frames ? frames[boxIndex] : null;
    // 1. the halo
    if (!(item.kind === 'display' && item.display === 'slideshow')) {
      assert.ok(!inHalo(screenRect(box)), `${architecture}: ${item.kind}/${item.display ?? item.sign ?? item.wall} enters the hero's halo`);
    }
    // 2. the structures: its display faces (or its sign plate) never cut into them
    const center = frame ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const half = frame ? frame.half : box.getSize(new THREE.Vector3()).multiplyScalar(0.5).subScalar(0.01).max(new THREE.Vector3(0.001, 0.001, 0.001));
    const worldCenter = box.getCenter(new THREE.Vector3());
    const reach = half.length() + 0.5;
    let hit = false;
    for (const mesh of obstacles) {
      if (hit) break;
      const sphere = mesh.geometry.boundingSphere ?? (mesh.geometry.computeBoundingSphere(), mesh.geometry.boundingSphere);
      const position = mesh.geometry.getAttribute('position');
      const index = mesh.geometry.index;
      const count = index ? index.count : position.count;
      const instances = mesh.isInstancedMesh ? mesh.count : 1;
      for (let k = 0; k < instances && !hit; k += 1) {
        if (mesh.isInstancedMesh) mesh.getMatrixAt(k, instanceMatrix); else instanceMatrix.copy(mesh.matrixWorld);
        if (!mesh.isInstancedMesh && sphere && sphere.center.distanceTo(worldCenter) > sphere.radius + reach) break;
        if (mesh.isInstancedMesh) {
          const p = new THREE.Vector3().setFromMatrixPosition(instanceMatrix);
          const s = new THREE.Vector3().setFromMatrixScale(instanceMatrix);
          if (p.distanceTo(worldCenter) > s.length() + reach) continue;
        }
        for (let t = 0; t < count; t += 3) {
          for (let c = 0; c < 3; c += 1) {
            triangle[c].fromBufferAttribute(position, index ? index.getX(t + c) : t + c).applyMatrix4(instanceMatrix);
            if (frame) triangle[c].applyMatrix4(frame.toLocal);
          }
          if (overlap(triangle[0], triangle[1], triangle[2], center, half)) { hit = true; break; }
        }
      }
      if (hit) offenders.push(`${item.kind}/${item.display ?? item.sign ?? item.wall} cuts ${mesh.name}`);
    }
    if (hit) intrusions += 1;
    }
  }
  assert.equal(intrusions, 0, `${architecture}: displays cut into structures: ${offenders.join('; ')}`);
  // 3. the atmosphere: no card over the halo (each strip is at least 6 % opaque at its peak)
  for (const card of placement.atmosphere?.cards ?? []) {
    const box = new THREE.Box3().setFromPoints(card.corners.map((p) => new THREE.Vector3(...p)));
    assert.ok(!inHalo(screenRect(box)), `${architecture}: an atmosphere ${card.strip} card covers the hero's halo`);
  }
  bare.dispose();
}

// Verdant's kit: its displays and shafts stay out of the halo too
{
  const kit = buildGarageVerdantKit({});
  for (const mesh of kit.meshes) {
    if (!/displays|atmosphere/.test(mesh.name)) continue;
    const position = mesh.geometry.getAttribute('position');
    // test each quad on its own (the mesh's merged bounds span the whole hall)
    for (let t = 0; t < position.count; t += 6) {
      const box = new THREE.Box3();
      for (let c = 0; c < 6 && t + c < position.count; c += 1) box.expandByPoint(new THREE.Vector3().fromBufferAttribute(position, t + c));
      assert.ok(!inHalo(screenRect(box)), `Verdant: ${mesh.name} quad ${t / 6} enters the hero's halo`);
    }
  }
}
console.log(`garageDisplayPlacement.selftest: halo ${(halo.minX * 100).toFixed(0)}-${(halo.maxX * 100).toFixed(0)} % x, ${(halo.minY * 100).toFixed(0)}-${(halo.maxY * 100).toFixed(0)} % y; displays clear of structures`);
