import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { KitBuilder, kitRandom, type KitBuildResult } from './garageKitGeometry.ts';
import { garageKitSkin } from './garageKitSkins.ts';
import { buildComputerStation, buildFabricBanner, buildFramedPrint } from './garageDisplayKit.ts';
import { buildGarageProp } from './garagePropKit.ts';
import { armGarageDisplayAtlas, createGarageDecalMaterial, createGarageDisplayMaterial } from './garageDisplayAtlas.ts';
import { atmosphereShaft, createGarageAtmosphere, type GarageAtmosphereRecipe } from './garageAtmosphereKit.ts';

/**
 * Verdant's share of the garage r9 kit, in the dressing's frame (the hall's world-local axes: the west wall at x = -23
 * on the canonical frame's left, the wall behind the mezzanine at z = -23 on its right). The brand and the game's
 * battlefields on the hall's walls: two column banners in the frame's left and right thirds (the west wall beside the
 * slideshow; the far wall above the mezzanine rails, both hung high), the wordmark banner high on the far wall, a "hall
 * of fame" of framed prints with picture lights on a high rail right of the slideshow, a diagnostics station at the slideshow's foot, and two
 * feathered daylight shafts in the frame's right band, clear of the hero and of every display.
 *
 * Built once with the dressing (static, Verdant only): one vertex-colour mesh, one DISPLAY-LIT mesh, one decal mesh and
 * one atmosphere mesh, each on a program the Verdant boot already compiles.
 */
export function buildGarageVerdantKit(params: {
  readonly setupShadowMaterial?: ((material: THREE.Material) => void) | null;
  readonly anisotropy?: number;
}): { readonly meshes: readonly THREE.Mesh[]; readonly materials: readonly THREE.Material[];
  /** The atmosphere's cards (the display placement receipt keeps them off every display). */
  readonly atmosphereCards: GarageAtmosphereRecipe['cards'];
  readonly stats: Readonly<{ triangles: number; brandPieces: number; tankImages: number; stations: number; stationMonitors: number }> } {
  const skin = garageKitSkin('field_shed');
  const pieces: Array<{ result: KitBuildResult; matrix: THREE.Matrix4 }> = [];
  const add = (seed: number, x: number, y: number, z: number, yaw: number, body: (b: KitBuilder) => void): void => {
    const b = new KitBuilder(kitRandom(seed), skin);
    body(b);
    pieces.push({ result: b.build(-y), matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1),
    ) });
  };
  const WEST = -22.78, FAR = -22.78;
  // the column banners: crest and wordmark on fabric, on bracket arms off the wall (clear of the crane runways inboard)
  // (both hung high, above the hero's halo in the canonical frame: the halo is the hero's screen box plus 8 %)
  add(101, WEST, 9.55, -9.6, Math.PI / 2, (b) => {
    buildFabricBanner(b, 'brand.banner.v', 1.1, 3.1, { sag: 0.04 });
    for (const y of [0.02, -3.12]) b.box(0, y, -0.11, 0.06, 0.06, 0.22, 0x2a2c2e, { bevel: 0 });
  });
  add(102, -10.6, 9.6, FAR, 0, (b) => {
    buildFabricBanner(b, 'brand.banner.v', 1.1, 3.2, { sag: 0.03 });
    for (const y of [0.02, -3.22]) b.box(0, y, -0.11, 0.06, 0.06, 0.22, 0x2a2c2e, { bevel: 0 });
  });
  // the wordmark banner high on the far wall
  add(103, -4.6, 8.6, FAR, 0, (b) => {
    buildFabricBanner(b, 'brand.banner.h', 7.6, 1.2, { sag: 0.05 });
    for (const x of [-3.7, 3.7]) b.box(x, 0.02, -0.11, 0.06, 0.06, 0.22, 0x2a2c2e, { bevel: 0 });
  });
  // the hall of fame: the battlefields' own stills, framed, with picture lights, right of the slideshow on the west wall
  const prints = ['still.desert', 'still.winter', 'still.coastal'] as const;
  // a picture rail high on the wall, above the services and clear of the hero's halo
  prints.forEach((rect, index) => add(110 + index, WEST, 6.62, -2.5 - index * 1.95, Math.PI / 2, (b) => buildFramedPrint(b, rect, 1.6, 0.9)));
  // the diagnostics station at the slideshow's foot: readouts and the Verdant Fields map, cabled to its floor box
  add(120, -19.6, 0, 7.4, Math.PI / 2, (b) => {
    buildComputerStation(b, { screens: ['readout.armor.abrams', 'map.verdant', 'readout.modules.abrams'], width: 2.0 });
  });
  add(121, -18.8, 0, 9.4, Math.PI / 2 + 0.3, (b) => buildGarageProp(b, 'extinguisher'));

  const solids: THREE.BufferGeometry[] = [], displays: THREE.BufferGeometry[] = [], decals: THREE.BufferGeometry[] = [];
  let triangles = 0;
  for (const { result, matrix } of pieces) {
    solids.push(result.solid.clone().applyMatrix4(matrix));
    if (result.display) displays.push(result.display.clone().applyMatrix4(matrix));
    if (result.decal) decals.push(result.decal.clone().applyMatrix4(matrix));
    triangles += result.triangles + result.displayTriangles + result.decalTriangles;
    result.solid.dispose(); result.display?.dispose(); result.decal?.dispose();
  }
  const meshes: THREE.Mesh[] = [];
  const materials: THREE.Material[] = [];
  const finish = (mesh: THREE.Mesh, name: string): void => {
    mesh.name = name;
    mesh.userData.keepWorkshopMesh = true; // its own static owner; never folded into the workshop merge
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    meshes.push(mesh);
  };
  const solidGeometry = mergeGeometries(solids, false);
  for (const geometry of solids) geometry.dispose();
  if (solidGeometry) {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.06 });
    params.setupShadowMaterial?.(material);
    material.name = 'garage:verdant-kit';
    materials.push(material);
    const mesh = new THREE.Mesh(solidGeometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    finish(mesh, 'garage_verdant_kit_solids');
  }
  const displayGeometry = mergeGeometries(displays, false);
  for (const geometry of displays) geometry.dispose();
  if (displayGeometry) {
    const material = createGarageDisplayMaterial(params.setupShadowMaterial);
    materials.push(material);
    const mesh = new THREE.Mesh(displayGeometry, material);
    mesh.receiveShadow = true;
    armGarageDisplayAtlas(mesh, params.anisotropy);
    finish(mesh, 'garage_verdant_kit_displays');
  }
  const decalGeometry = decals.length ? mergeGeometries(decals, false) : null;
  for (const geometry of decals) geometry.dispose();
  if (decalGeometry) {
    const material = createGarageDecalMaterial();
    materials.push(material);
    const mesh = new THREE.Mesh(decalGeometry, material);
    mesh.renderOrder = 2;
    finish(mesh, 'garage_verdant_kit_decals');
  }
  // Daylight shafts in the frame's right band only (screen x 84-98 %, right of the far wall's wordmark banner): two
  // parallel beams from the far wall's clerestories falling forward past the mezzanine's front, left of the east
  // inspection overhang, each a feathered ribbon that fades in below the roof and out above the floor
  // (garageAtmosphereKit.ts). The west wall keeps none: its slideshow, prints and station stay clear (the r9 blind critic
  // saw the first pass's shaft and motes "grey out half the image" of the one screen); the display placement receipt
  // checks every card against every display, banner and the slideshow.
  const shaftProfile = [0.1, 0.55, 0.9, 1, 0.7, 0.25, 0] as const;
  const atmosphereRecipe: GarageAtmosphereRecipe = {
    drift: 0.012,
    cards: [
      atmosphereShaft([2.8, 9.7, -18.2], [4.0, 0.05, -15.0], 1.9, 0, { profile: shaftProfile }),
      atmosphereShaft([5.6, 9.7, -16.4], [6.8, 0.05, -13.2], 2.0, 0.37, { profile: shaftProfile }),
    ],
  };
  const atmosphere = createGarageAtmosphere(atmosphereRecipe);
  materials.push(atmosphere.material as THREE.Material);
  finish(atmosphere, 'garage_verdant_kit_atmosphere');
  return {
    meshes, materials, atmosphereCards: atmosphereRecipe.cards,
    stats: Object.freeze({ triangles, brandPieces: 3, tankImages: prints.length, stations: 1, stationMonitors: 3 }),
  };
}
