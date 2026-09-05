import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  collectSurfacePickTargets,
  coplanarPatch,
  faceCount,
  ownershipOf,
  SURFACE_MARKUP_OVERLAY_STYLE,
} from './surfaceMarkup.ts';
import '../ui/i18nCatalog.ts';

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute([
  0, 0, 0, 1, 0, 0, 1, 1, 0,
  0, 0, 0, 1, 1, 0, 0, 1, 0,
  1, 0, 0, 1, 0, 1, 1, 1, 0,
], 3));

assert.equal(faceCount(geometry), 3, 'triangle count follows the position buffer');
assert.deepEqual(coplanarPatch(geometry, 0, 5), [0, 1], 'connected coplanar triangles form one patch');
assert.deepEqual(coplanarPatch(geometry, 2, 5), [2], 'a perpendicular triangle remains outside the patch');

const hull = new THREE.Group();
hull.name = 'rig_hull';
const turret = new THREE.Group();
turret.name = 'rig_turret';
const gun = new THREE.Group();
gun.name = 'rig_gun';
const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
hull.add(turret);
turret.add(gun);
gun.add(mesh);
assert.equal(ownershipOf(mesh), 'gun', 'nearest articulation owner wins');

const fitting = new THREE.Group();
fitting.name = 'fitting_spareTrackLinks';
fitting.userData.fittingRoot = true;
const selectablePrimitive = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.06, 0.15),
  new THREE.MeshBasicMaterial(),
);
selectablePrimitive.name = 'fitting_spareTrackLinks_spareTrack';
selectablePrimitive.userData.fitting = 'spareTrackLinks';
fitting.add(selectablePrimitive);
turret.add(fitting);

const legacyNamedPrimitive = new THREE.Mesh(
  new THREE.BoxGeometry(0.2, 0.2, 0.2),
  new THREE.MeshBasicMaterial(),
);
legacyNamedPrimitive.name = 'commanderShadowSightHousing';
turret.add(legacyNamedPrimitive);

const shadowProxy = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshBasicMaterial({ colorWrite: false }),
);
shadowProxy.name = 'procShadow_turret';
shadowProxy.userData.authoredShadowProxy = true;
turret.add(shadowProxy);

const hiddenMaterialPrimitive = new THREE.Mesh(
  new THREE.BoxGeometry(0.2, 0.2, 0.2),
  new THREE.MeshBasicMaterial(),
);
hiddenMaterialPrimitive.material.visible = false;
turret.add(hiddenMaterialPrimitive);

const transparentPrimitive = new THREE.Mesh(
  new THREE.BoxGeometry(0.2, 0.2, 0.2),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
);
turret.add(transparentPrimitive);

const primitiveParent = selectablePrimitive.parent;
const primitiveVisible = selectablePrimitive.visible;
const targets = collectSurfacePickTargets(hull);
assert.ok(targets.includes(selectablePrimitive),
  'nested fitting primitives are selectable Studio surfaces');
assert.ok(targets.includes(legacyNamedPrimitive),
  'visible primitives are selected by render semantics rather than name exceptions');
assert.ok(!targets.includes(shadowProxy),
  'explicit colorless shadow proxies stay outside Studio surface picking');
assert.ok(!targets.includes(hiddenMaterialPrimitive),
  'material-hidden primitives stay outside Studio surface picking');
assert.ok(!targets.includes(transparentPrimitive),
  'fully transparent primitives stay outside Studio surface picking');
assert.equal(selectablePrimitive.parent, primitiveParent,
  'surface collection never reparents a visible fitting');
assert.equal(selectablePrimitive.visible, primitiveVisible,
  'surface collection never mutates source visibility');
assert.equal(SURFACE_MARKUP_OVERLAY_STYLE.depthTest, true,
  'markup overlays respect source depth instead of painting through fittings');
assert.ok(SURFACE_MARKUP_OVERLAY_STYLE.selectionOpacity < 0.3,
  'selection tint preserves visible source detail');

geometry.dispose();
mesh.geometry.dispose();
mesh.material.dispose();
selectablePrimitive.geometry.dispose();
selectablePrimitive.material.dispose();
legacyNamedPrimitive.geometry.dispose();
legacyNamedPrimitive.material.dispose();
shadowProxy.geometry.dispose();
shadowProxy.material.dispose();
hiddenMaterialPrimitive.geometry.dispose();
hiddenMaterialPrimitive.material.dispose();
transparentPrimitive.geometry.dispose();
transparentPrimitive.material.dispose();

console.log('surfaceMarkup.selftest: patch grouping, rig ownership, visible fitting selection, and source-preserving overlays passed');
