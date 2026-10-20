// garage r9 display placement receipt: in every Garage with a kit, no display, sign, banner or atmosphere card enters
// the hero's halo in the canonical frame (the hero's screen box plus 8 %), no display face cuts into the scene's
// structures (the pack's buildings, facility frames and rock) by more than a centimetre, and no atmosphere card (a
// shaft by its visible core) stands in front of a display, print, banner or the slideshow's screen in the canonical
// frame (the r9 blind critic: Verdant's first shafts "grey out half the image" of its one screen).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { GARAGE_PRESENTATION_POSE } from '../game/garagePresentationPose.ts';
import { garageKitItemBounds, clearGarageKitCache } from './garageKitPlacement.ts';
import { GARAGE_KIT_PLACEMENTS } from './garageKitPlacements.ts';
import { GARAGE_VERDANT_SLIDESHOW, garageSlideshowPose } from './garageSlideshowPlacement.ts';
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
// the screen rect of a set of points (a card's or a face's own corners: their world box over-reaches when they run
// diagonally in the Garage frame, as everything square to the view does)
const screenRectPoints = (points) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, front = 0;
  for (const point of points) {
    const p = point.clone().applyMatrix4(camera.matrixWorldInverse);
    if (p.z > -0.1) continue;
    front += 1;
    const ndc = point.clone().project(camera);
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
const onScreen = (rect) => rect && rect.maxX > 0 && rect.minX < 1 && rect.maxY > 0 && rect.minY < 1;
const rectsMeet = (a, b) => onScreen(a) && onScreen(b) && a.maxX > b.minX && a.minX < b.maxX && a.maxY > b.minY && a.minY < b.maxY;
const viewRange = (box) => {
  let near = Infinity, far = 0;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const d = camera.position.distanceTo(new THREE.Vector3(x, y, z));
    near = Math.min(near, d); far = Math.max(far, d);
  }
  return { near, far };
};
/**
 * An atmosphere card's visible parts as boxes: a quad whole, a shaft ribbon by the rows whose core reaches 30 % of its
 * strip's peak (its feathered ends and sides fade to nothing).
 */
const cardBoxes = (card) => {
  const v = (p) => new THREE.Vector3(...p);
  if (!card.profile) return [new THREE.Box3().setFromPoints(card.corners.map(v))];
  const [bl, br, tr, tl] = card.corners.map(v);
  const rows = card.profile.length;
  const boxes = [];
  for (let k = 0; k < rows - 1; k += 1) {
    if (Math.max(card.profile[k], card.profile[k + 1]) < 0.3) continue;
    const t0 = k / (rows - 1), t1 = (k + 1) / (rows - 1);
    boxes.push(new THREE.Box3().setFromPoints([bl.clone().lerp(tl, t0), br.clone().lerp(tr, t0), bl.clone().lerp(tl, t1), br.clone().lerp(tr, t1)]));
  }
  return boxes;
};
/** The atmosphere stands in front of no display: each visible part against each display face nearer than the part. */
const assertAtmosphereClearOfDisplays = (label, cards, displayBoxes) => {
  for (const card of cards) {
    for (const part of cardBoxes(card)) {
      const partRect = screenRect(part), partRange = viewRange(part);
      for (const { name, box } of displayBoxes) {
        if (viewRange(box).far < partRange.near) continue; // the display stands in front of the card
        assert.ok(!rectsMeet(partRect, screenRect(box)), `${label}: an atmosphere ${card.strip} card stands in front of ${name}`);
      }
    }
  }
};

// triangle / box overlap (separating axes), the box shrunk by the centimetre the rule allows
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

/** A display quad's oriented box: its plane's frame, its extents in it, a centimetre less each way, 5 mm thick. */
function quadFrame(corners) {
  const centroid = corners.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / corners.length);
  const u = new THREE.Vector3().subVectors(corners[1], corners[0]);
  const w = new THREE.Vector3().subVectors(corners[2], corners[0]);
  const n = new THREE.Vector3().crossVectors(u, w);
  if (u.lengthSq() < 1e-12 || n.lengthSq() < 1e-12) return null;
  u.normalize(); n.normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  const basis = new THREE.Matrix4().makeBasis(u, v, n).setPosition(centroid);
  const toLocal = basis.clone().invert();
  const extent = new THREE.Vector3();
  for (const p of corners) {
    const local = p.clone().applyMatrix4(toLocal);
    extent.set(Math.max(extent.x, Math.abs(local.x)), Math.max(extent.y, Math.abs(local.y)), 0.005);
  }
  return { center: centroid, toLocal, half: new THREE.Vector3(Math.max(0.001, extent.x - 0.01), Math.max(0.001, extent.y - 0.01), 0.005) };
}
/** A piece's oriented box (its own bounds under its placement), a centimetre less each way. */
function obbFrame({ matrix, box }) {
  const localCentre = box.getCenter(new THREE.Vector3());
  const basis = matrix.clone().multiply(new THREE.Matrix4().makeTranslation(localCentre.x, localCentre.y, localCentre.z));
  return { center: new THREE.Vector3().setFromMatrixPosition(basis), toLocal: basis.clone().invert(),
    half: box.getSize(new THREE.Vector3()).multiplyScalar(0.5).subScalar(0.01).max(new THREE.Vector3(0.001, 0.001, 0.001)) };
}

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
  for (const { item, solid, quads, quadCorners, solidObb } of bounds) {
    const isDisplay = item.kind === 'display' || item.kind === 'sign' || (item.kind === 'wall' && item.params?.mural);
    if (!isDisplay) continue;
    // the slideshow by its screen (the dressing's one screen at the shared pose; its frame is the support) and against
    // the structures by its whole frame; everything else by its faces and decals. The structure test takes each face's
    // own oriented box (its plane, a centimetre thick: garage r9, the g1 lane: a plate on a wall square to the view runs
    // diagonally in the Garage frame, so its axis-aligned box always reached into the wall behind it)
    let boxes = quads.length ? quads : [solid];
    const frames = quads.length ? quadCorners.map(quadFrame) : [solidObb ? obbFrame(solidObb) : null];
    if (item.kind === 'display' && item.display === 'slideshow') {
      const pose = garageSlideshowPose(architecture);
      const across = new THREE.Vector3(Math.cos(pose.yaw), 0, -Math.sin(pose.yaw)).multiplyScalar(pose.width / 2);
      const centre = new THREE.Vector3(...pose.position);
      const screen = new THREE.Box3().setFromPoints([
        centre.clone().add(across).setY(centre.y - pose.height / 2), centre.clone().sub(across).setY(centre.y + pose.height / 2),
      ]);
      assert.ok(!inHalo(screenRect(screen)), `${architecture}: the slideshow's screen enters the hero's halo`);
      boxes = [solid];
      frames.length = 0;
      frames.push(solidObb ? obbFrame(solidObb) : null);
    }
    for (const [boxIndex, box] of boxes.entries()) {
    const frame = frames[boxIndex] ?? null;
    // 1. the halo
    if (!(item.kind === 'display' && item.display === 'slideshow')) {
      const corners = quads.length ? quadCorners[boxIndex] : null;
      assert.ok(!inHalo(corners ? screenRectPoints(corners) : screenRect(box)), `${architecture}: ${item.kind}/${item.display ?? item.sign ?? item.wall} enters the hero's halo`);
    }
    // 2. the structures: its display faces (or its sign plate) never cut into them
    const center = frame ? frame.center : box.getCenter(new THREE.Vector3());
    const half = frame ? frame.half : box.getSize(new THREE.Vector3()).multiplyScalar(0.5).subScalar(0.01).max(new THREE.Vector3(0.001, 0.001, 0.001));
    const reach = half.length() + 0.5;
    const toLocal = frame ? frame.toLocal : null;
    const origin = new THREE.Vector3();
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
        if (!mesh.isInstancedMesh && sphere && sphere.center.distanceTo(center) > sphere.radius + reach) break;
        if (mesh.isInstancedMesh) {
          const p = new THREE.Vector3().setFromMatrixPosition(instanceMatrix);
          const s = new THREE.Vector3().setFromMatrixScale(instanceMatrix);
          if (p.distanceTo(center) > s.length() + reach) continue;
        }
        for (let t = 0; t < count; t += 3) {
          for (let c = 0; c < 3; c += 1) {
            triangle[c].fromBufferAttribute(position, index ? index.getX(t + c) : t + c).applyMatrix4(instanceMatrix);
            if (toLocal) triangle[c].applyMatrix4(toLocal);
          }
          if (overlap(triangle[0], triangle[1], triangle[2], toLocal ? origin : center, half)) { hit = true; break; }
        }
      }
      if (hit) offenders.push(`${item.kind}/${item.display ?? item.sign ?? item.wall} cuts ${mesh.name}`);
    }
    if (hit) intrusions += 1;
    }
  }
  assert.equal(intrusions, 0, `${architecture}: displays cut into structures: ${offenders.join('; ')}`);
  // 3. the atmosphere: no card over the halo (each strip is at least 6 % opaque at its peak), none over a display
  for (const card of placement.atmosphere?.cards ?? []) {
    assert.ok(!inHalo(screenRectPoints(card.corners.map((p) => new THREE.Vector3(...p)))), `${architecture}: an atmosphere ${card.strip} card covers the hero's halo`);
  }
  const displayBoxes = [];
  for (const { item, quads } of bounds) {
    const isDisplay = item.kind === 'display' || item.kind === 'sign' || (item.kind === 'wall' && item.params?.mural);
    if (isDisplay) for (const box of quads) displayBoxes.push({ name: `${item.kind}/${item.display ?? item.sign ?? item.wall}`, box });
  }
  assertAtmosphereClearOfDisplays(architecture, placement.atmosphere?.cards ?? [], displayBoxes);
  bare.dispose();
}

// Verdant's kit: its displays and shafts stay out of the halo too, and the shafts off every display and the slideshow
{
  const kit = buildGarageVerdantKit({});
  {
    const dressing = await readFile(new URL('../game/garageDressing.ts', import.meta.url), 'utf8');
    const [px, py, pz] = GARAGE_VERDANT_SLIDESHOW.position;
    assert.ok(dressing.includes(`screenRoot.position.set(${px}, ${py}, ${pz})`) && dressing.includes('screenRoot.rotation.y = Math.PI / 2')
      && GARAGE_VERDANT_SLIDESHOW.yaw === Math.PI / 2 && dressing.includes(`BATTLE_SCREEN_PANEL_W = ${GARAGE_VERDANT_SLIDESHOW.width};`),
    'the Verdant slideshow pose agrees with the dressing\'s');
  }
  const displayBoxes = [];
  {
    const { position: [px, py, pz], yaw, width } = GARAGE_VERDANT_SLIDESHOW;
    const across = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(width / 2);
    const centre = new THREE.Vector3(px, py, pz);
    displayBoxes.push({ name: 'the slideshow screen', box: new THREE.Box3().setFromPoints([
      centre.clone().add(across).setY(py - width * 9 / 32), centre.clone().sub(across).setY(py + width * 9 / 32),
    ]) });
  }
  for (const mesh of kit.meshes) {
    if (!/displays/.test(mesh.name)) continue;
    const position = mesh.geometry.getAttribute('position');
    for (let t = 0; t < position.count; t += 6) {
      const box = new THREE.Box3();
      for (let c = 0; c < 6 && t + c < position.count; c += 1) box.expandByPoint(new THREE.Vector3().fromBufferAttribute(position, t + c));
      displayBoxes.push({ name: `Verdant display quad ${t / 6}`, box });
    }
  }
  assert.ok(displayBoxes.length >= 10, 'Verdant: the slideshow, banners, prints and station screens are measured');
  assertAtmosphereClearOfDisplays('Verdant', kit.atmosphereCards, displayBoxes);
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
