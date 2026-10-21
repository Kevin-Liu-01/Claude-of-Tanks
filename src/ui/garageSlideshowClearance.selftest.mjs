// garage 231 slideshow clearance receipt. The owner, 2026-10-17: "remove that screen glitching through the floor" (the
// archive monitor inside Verdant's mezzanine, its deck, column and rails slicing the picture); 2026-10-21: "make it a crt
// screen like the one we removed". In every Garage the slideshow's CRT stands clear: no foreign triangle (a structure, a
// deck, rail, column, wall or roof, another kit piece, a tree) enters its housing (bezel, case, tube and neck) or the
// space in front of its glass (the picture's aperture out to 0.75 m), each volume a centimetre less each way. The kit's
// own triangles are counted out by building the monitor alone at its pose; Verdant's hall shell, decks, rails, columns,
// crane and clutter are the dressing's own core chunk and the stage's hall parts, built here as the Garage builds them.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { buildSlideshowFrame } from './garageDisplayKit.ts';
import { KitBuilder, kitRandom } from './garageKitGeometry.ts';
import { buildGarageKitDressing, clearGarageKitCache, garageKitItemBounds } from './garageKitPlacement.ts';
import { GARAGE_KIT_PLACEMENTS } from './garageKitPlacements.ts';
import { garageKitSkin } from './garageKitSkins.ts';
import {
  GARAGE_SLIDESHOW_GLASS_BULGE, GARAGE_SLIDESHOW_PLACEMENTS, GARAGE_VERDANT_SLIDESHOW, garageSlideshowHousing, garageSlideshowPose,
} from './garageSlideshowPlacement.ts';
import { buildVerdantHallParts } from './garageVerdantHall.ts';
import {
  buildGarageEnvironment, createGarageEnvironmentAssetLibrary, prepareGarageEnvironmentAssets,
} from './garageEnvironmentKit.ts';

// triangle / box overlap by separating axes, the triangle already in the box's frame
const overlap = (() => {
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const e = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const axis = new THREE.Vector3();
  const separated = (half) => {
    const r = half.x * Math.abs(axis.x) + half.y * Math.abs(axis.y) + half.z * Math.abs(axis.z);
    const a = v[0].dot(axis), b = v[1].dot(axis), c = v[2].dot(axis);
    return Math.min(a, b, c) > r || Math.max(a, b, c) < -r;
  };
  return (a, b, c, center, half) => {
    v[0].copy(a).sub(center); v[1].copy(b).sub(center); v[2].copy(c).sub(center);
    for (let i = 0; i < 3; i += 1) {
      const lo = Math.min(v[0].getComponent(i), v[1].getComponent(i), v[2].getComponent(i));
      const hi = Math.max(v[0].getComponent(i), v[1].getComponent(i), v[2].getComponent(i));
      if (lo > half.getComponent(i) || hi < -half.getComponent(i)) return false;
    }
    e[0].subVectors(v[1], v[0]); e[1].subVectors(v[2], v[1]); e[2].subVectors(v[0], v[2]);
    axis.crossVectors(e[0], e[1]);
    if (axis.lengthSq() > 1e-12 && separated(half)) return false;
    for (const edge of e) for (const unit of axes) {
      axis.crossVectors(edge, unit);
      if (axis.lengthSq() > 1e-12 && separated(half)) return false;
    }
    return true;
  };
})();

/**
 * The monitor's two volumes in its screen's frame (origin on the glass's face plane at the picture's centre, +Z out of
 * the glass, +X across, +Y up): its housing from the neck's end to the rack handles, and the glass's aperture (inside
 * the bezel's inner rim) from just behind the face plane to 0.75 m in front; each a centimetre less each way.
 */
function monitorVolumes(mount, width, bottomY) {
  const h = width * 9 / 16, housing = garageSlideshowHousing(mount, width);
  const cy = bottomY + (h + 0.16) / 2, top = cy + h / 2 + housing.border + 0.015, base = cy - h / 2 - housing.chin - 0.015;
  const front = width * GARAGE_SLIDESHOW_GLASS_BULGE + 0.02 + width * 0.045;
  const xo = width / 2 + housing.border + 0.015, ix = width / 2 - width * 0.006, iy = h / 2 - width * 0.006;
  const box = (x0, x1, y0, y1, z0, z1) => ({
    center: new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
    half: new THREE.Vector3((x1 - x0) / 2 - 0.01, (y1 - y0) / 2 - 0.01, (z1 - z0) / 2 - 0.01),
  });
  return [
    { name: 'housing', ...box(-xo, xo, base - cy, top - cy, -housing.depth, front) },
    { name: 'glass', ...box(-ix, ix, -iy, iy, -0.015, 0.75) },
  ];
}

/** The screen's frame in the Garage frame (its world-to-screen matrix), from its glass centre and yaw. */
function screenFrame(position, yaw) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...position),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)).invert();
}

/** Add the triangles of `geometry` (under each of `matrices`) that enter each volume to `counts`, by volume name. */
function census(geometry, matrices, toScreen, volumes, reach, counts) {
  const position = geometry.getAttribute('position');
  if (!position) return;
  const index = geometry.index;
  const count = index ? index.count : position.count;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const sphere = new THREE.Sphere();
  const local = new THREE.Matrix4();
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (const matrix of matrices) {
    local.multiplyMatrices(toScreen, matrix);
    sphere.copy(geometry.boundingSphere).applyMatrix4(local);
    if (sphere.center.length() > sphere.radius + reach) continue;
    for (let t = 0; t + 2 < count; t += 3) {
      for (let c = 0; c < 3; c += 1) tri[c].fromBufferAttribute(position, index ? index.getX(t + c) : t + c).applyMatrix4(local);
      for (const volume of volumes) {
        if (overlap(tri[0], tri[1], tri[2], volume.center, volume.half)) counts[volume.name] = (counts[volume.name] ?? 0) + 1;
      }
    }
  }
}

/** Every mesh under `root` (instances expanded) into the census, skipping `skip(mesh)`; `counts.by` names the hits. */
function censusTree(root, toScreen, volumes, reach, counts, skip = () => false) {
  root.updateMatrixWorld(true);
  const instance = new THREE.Matrix4();
  root.traverse((object) => {
    if (!object.isMesh || skip(object)) return;
    const matrices = [];
    if (object.isInstancedMesh) {
      for (let k = 0; k < object.count; k += 1) {
        object.getMatrixAt(k, instance);
        matrices.push(object.matrixWorld.clone().multiply(instance));
      }
    } else matrices.push(object.matrixWorld);
    const own = {};
    census(object.geometry, matrices, toScreen, volumes, reach, own);
    for (const [name, value] of Object.entries(own)) {
      counts[name] = (counts[name] ?? 0) + value;
      (counts.by ??= []).push(`${object.name || object.parent?.name || 'mesh'} ${value} in the ${name}`);
    }
  });
}

/**
 * The monitor alone (solids and its power lamp) at a frame's pose, for counting its own triangles out of the kit's: placed
 * the way the kit places a piece (a transformed copy, then the census), so a face on a volume's edge rounds the same way.
 */
function monitorAlone(mount, width, bottomY, matrix, toScreen, volumes, reach) {
  const b = new KitBuilder(kitRandom(1), garageKitSkin('field_shed'));
  buildSlideshowFrame(b, { width, mount, bottomY });
  const result = b.build();
  const counts = {};
  for (const geometry of [result.solid, result.display]) {
    if (!geometry) continue;
    const placed = geometry.clone().applyMatrix4(matrix);
    census(placed, [new THREE.Matrix4()], toScreen, volumes, reach, counts);
    placed.dispose();
  }
  result.solid.dispose(); result.display?.dispose(); result.decal?.dispose();
  return counts;
}

const reachOf = (volumes) => Math.max(...volumes.map((v) => v.center.length() + v.half.length())) + 0.1;
const report = [];

// the outdoor Garages: the bare scene (structures, facility frames, rock, trees, terrain) and every other kit piece
const assets = createGarageEnvironmentAssetLibrary({});
for (const [architecture, slideshow] of Object.entries(GARAGE_SLIDESHOW_PLACEMENTS)) {
  clearGarageKitCache();
  const variant = GARAGE_VARIANTS.find((item) => item.architecture === architecture);
  const placement = GARAGE_KIT_PLACEMENTS[architecture];
  assert.ok(variant && placement, `${architecture}: a Garage with a kit`);
  await prepareGarageEnvironmentAssets(assets, variant);
  const pose = garageSlideshowPose(architecture);
  const toScreen = screenFrame(pose.position, pose.yaw);
  const bottomY = slideshow.bottomY ?? (slideshow.mount === 'trailer' ? 2.1 : slideshow.mount === 'freestanding' ? 1.4 : 2.2);
  const volumes = monitorVolumes(slideshow.mount, slideshow.width, bottomY);
  const reach = reachOf(volumes);
  const bare = buildGarageEnvironment({}, assets, variant, () => {}, { kitPlacement: null });
  const scene = {};
  censusTree(bare.root, toScreen, volumes, reach, scene);
  // the kit: every piece's solids, displays and decals, less the monitor's own
  const buckets = {};
  const kit = buildGarageKitDressing({ variant, placement, buckets, groundAtWorld: bare.groundAtWorld });
  const kitCounts = {};
  for (const geometry of buckets.baked ?? []) census(geometry, [new THREE.Matrix4()], toScreen, volumes, reach, kitCounts);
  for (const mesh of kit.meshes) {
    mesh.updateMatrixWorld(true);
    census(mesh.geometry, [mesh.matrixWorld], toScreen, volumes, reach, /atmosphere/.test(mesh.name) ? scene : kitCounts);
  }
  const frame = garageKitItemBounds(variant, placement, bare.groundAtWorld)
    .find(({ item }) => item.kind === 'display' && item.display === 'slideshow');
  assert.ok(frame?.solidObb, `${architecture}: the kit places the monitor`);
  const own = monitorAlone(slideshow.mount, slideshow.width, bottomY, frame.solidObb.matrix, toScreen, volumes, reach);
  assert.ok((own.housing ?? 0) > 100, `${architecture}: the monitor alone fills its housing (${own.housing ?? 0} tris)`);
  assert.equal(own.glass ?? 0, 0, `${architecture}: nothing of the monitor's own stands in front of its glass`);
  for (const { name } of volumes) {
    assert.equal(scene[name] ?? 0, 0, `${architecture}: ${scene[name]} scene triangles enter the monitor's ${name}: ${scene.by}`);
    assert.equal((kitCounts[name] ?? 0) - (own[name] ?? 0), 0,
      `${architecture}: ${(kitCounts[name] ?? 0) - (own[name] ?? 0)} triangles of other kit pieces enter the monitor's ${name}`);
  }
  report.push(`${architecture} ${slideshow.mount}`);
  for (const mesh of kit.meshes) mesh.geometry.dispose();
  for (const geometry of Object.values(buckets).flat()) geometry.dispose?.();
  bare.dispose();
}
assets.dispose();

// Verdant: the stage's hall parts (turned with the indoor set), the dressing's core chunk (the mezzanine deck, its rails,
// columns and ladder, the inspection overhangs, the crane runways and lift stations, the wall clutter) and Verdant's kit
{
  const stubContext = new Proxy({}, {
    get(_, key) {
      if (key === 'measureText') return () => ({ width: 10 });
      if (/^create(Linear|Radial)Gradient$|^createPattern$/.test(String(key))) return () => ({ addColorStop() {} });
      if (key === 'getImageData' || key === 'createImageData') return (x, y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)) });
      return () => {};
    },
    set() { return true; },
  });
  globalThis.window ??= { setTimeout, clearTimeout, requestAnimationFrame: () => 0, cancelAnimationFrame() {} };
  globalThis.document ??= { hidden: false, createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => stubContext }) };
  globalThis.Image ??= class { set src(_) {} };
  const { createGarageDressing } = await import('../game/garageDressing.ts');
  const dressing = createGarageDressing({ anisotropy: 4, setupShadowMaterial() {} }, new THREE.Vector3(), { variantId: 'verdant_motor_pool' });
  await dressing.pump();
  const screen = dressing.group.getObjectByName('garage_slideshow_screen');
  assert.ok(screen, 'Verdant: the dressing builds the slideshow screen');
  dressing.group.updateMatrixWorld(true);
  const { position: [px, py, pz], yaw, width, glassZ } = GARAGE_VERDANT_SLIDESHOW;
  const glass = new THREE.Vector3(px + Math.sin(yaw) * glassZ, py, pz + Math.cos(yaw) * glassZ);
  assert.ok(screen.getWorldPosition(new THREE.Vector3()).distanceTo(glass) < 1e-6, 'Verdant: the screen stands on the shared pose');
  const toScreen = screenFrame(glass.toArray(), yaw);
  const bottomY = py - (width * 9 / 16 + 0.16) / 2;
  const volumes = monitorVolumes('freestanding', width, bottomY);
  const reach = reachOf(volumes);
  const scene = {};
  const hall = buildVerdantHallParts(23, 10);
  const halfTurn = new THREE.Matrix4().makeRotationY(Math.PI);
  for (const key of ['sheeting', 'roof', 'steel', 'concrete', 'glass', 'exterior']) {
    const geometry = hall[key].toGeometry({ uv: false, color: false });
    census(geometry, [halfTurn], toScreen, volumes, reach, scene);
    geometry.dispose();
  }
  const kitCounts = {};
  censusTree(dressing.group, toScreen, volumes, reach, scene, (mesh) => mesh === screen || /^garage_verdant_kit_(solids|displays|decals)$/.test(mesh.name));
  censusTree(dressing.group, toScreen, volumes, reach, kitCounts, (mesh) => !/^garage_verdant_kit_(solids|displays|decals)$/.test(mesh.name));
  const out = glassZ - garageSlideshowHousing('freestanding', width).faceZ;
  const frameMatrix = new THREE.Matrix4().compose(new THREE.Vector3(px + Math.sin(yaw) * out, 0, pz + Math.cos(yaw) * out),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
  const own = monitorAlone('freestanding', width, bottomY, frameMatrix, toScreen, volumes, reach);
  assert.ok((own.housing ?? 0) > 100, `Verdant: the monitor alone fills its housing (${own.housing ?? 0} tris)`);
  assert.equal(own.glass ?? 0, 0, 'Verdant: nothing of the monitor\'s own stands in front of its glass');
  for (const { name } of volumes) {
    assert.equal(scene[name] ?? 0, 0, `Verdant: ${scene[name]} hall, deck, rail, column or clutter triangles enter the monitor's ${name}: ${scene.by}`);
    assert.equal((kitCounts[name] ?? 0) - (own[name] ?? 0), 0,
      `Verdant: ${(kitCounts[name] ?? 0) - (own[name] ?? 0)} triangles of other kit pieces enter the monitor's ${name}`);
  }
  report.push('verdant freestanding');
  dressing.dispose();
}

console.log(`garageSlideshowClearance.selftest: the CRT clear of every structure and kit piece in ${report.length} Garages (${report.join(', ')})`);
