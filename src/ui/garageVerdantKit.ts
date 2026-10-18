import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { KitBuilder, kitRandom, type KitBuildResult } from './garageKitGeometry.ts';
import { garageKitSkin } from './garageKitSkins.ts';
import { buildComputerStation, buildFabricBanner, buildFramedPrint } from './garageDisplayKit.ts';
import { buildGarageProp } from './garagePropKit.ts';
import { buildGarageBenchPiece } from './garageBenchKit.ts';
import { buildJibCrane } from './garageCraneKit.ts';
import { buildDeckLedStrip, buildLongSpanRacking, buildMezzanineOffice } from './garageVerdantFinish.ts';
import { createGarageDecalMaterial, createGarageDisplayMaterial, ensureGarageDisplayAtlas } from './garageDisplayAtlas.ts';
import { atmosphereMotes, atmosphereShaft, createGarageAtmosphere } from './garageAtmosphereKit.ts';

/**
 * Verdant's share of the garage r9 kit, in the dressing's frame (the hall's world-local axes: the west wall at x = -23
 * on the canonical frame's left, the wall behind the mezzanine at z = -23 on its right). The brand and the game's
 * battlefields on the hall's walls: two column banners in the frame's left and right thirds (the west wall beside the
 * slideshow; the far wall above the mezzanine rails, both hung high), the wordmark banner high on the far wall, a "hall
 * of fame" of framed prints with picture lights on a high rail right of the slideshow, a diagnostics station at the slideshow's foot, and daylight
 * shafts with dust motes under the roof lights clear of the hero.
 *
 * Built once with the dressing (static, Verdant only): one vertex-colour mesh, one DISPLAY-LIT mesh, one decal mesh and
 * one atmosphere mesh, each on a program the Verdant boot already compiles.
 */
export function buildGarageVerdantKit(params: {
  readonly setupShadowMaterial?: ((material: THREE.Material) => void) | null;
  readonly anisotropy?: number;
}): { readonly meshes: readonly THREE.Mesh[]; readonly materials: readonly THREE.Material[];
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
  const prints = ['media.desert', 'media.winter', 'media.coastal'] as const;
  // a picture rail high on the wall, above the services and clear of the hero's halo
  prints.forEach((rect, index) => add(110 + index, WEST, 6.62, -2.5 - index * 1.95, Math.PI / 2, (b) => buildFramedPrint(b, rect, 1.6, 0.9)));
  // the diagnostics station at the slideshow's foot: readouts and the Verdant Fields map, cabled to its floor box
  add(120, -19.6, 0, 7.4, Math.PI / 2, (b) => {
    buildComputerStation(b, { screens: ['readout.armor.abrams', 'map.verdant', 'readout.modules.abrams'], width: 2.0 });
  });
  add(121, -18.8, 0, 9.4, Math.PI / 2 + 0.3, (b) => buildGarageProp(b, 'extinguisher'));
  // the hall of fame's second run, left of the slideshow and its station (garage r9 g3: six prints in all)
  const morePrints = ['media.urban', 'media.monsoon', 'media.railyard'] as const;
  morePrints.forEach((rect, index) => add(140 + index, WEST, 6.62, 8.4 + index * 1.95, Math.PI / 2, (b) => buildFramedPrint(b, rect, 1.6, 0.9)));

  // the mezzanine's finish (garage r9 g3; the brief: "today an empty deck"): the glass-fronted operations office on the
  // deck's right end with its monitor wall (readouts and the Verdant Fields map), long-span racking along the rest of it
  // with bins, a pallet of track links and one of road wheels, and the warm LED strip along the deck's fascia. The deck
  // (garageDressing.ts buildFactoryStructure, turned with the hall) spans x -18.5..18.5, z -20.45..-16.85, its top at
  // 4.52 m; the office stands right of the hero's halo in the canonical frame.
  const DECK_Y = 4.52;
  add(150, 2.1, DECK_Y, -18.775, 0, (b) => buildMezzanineOffice(b, {
    width: 9, depth: 3.05, height: 2.7,
    screens: ['readout.armor.k2', 'map.verdant', 'readout.modules.burlak', 'readout.armor.leopard'],
  }));
  add(151, 12.4, DECK_Y, -19.6, 0, (b) => buildLongSpanRacking(b, { length: 10 }));
  add(152, 8.0, 4.33, -16.82, 0, (b) => buildDeckLedStrip(b, 20));
  // a pillar jib crane parked beside the K2's rotisserie, its arm swung to the east wall
  add(153, 20.2, 0, 12.6, 0, (b) => { buildJibCrane(b, { height: 4.6, reach: 2.2, slew: 0, swl: 5 }); });
  // the Burlak cell's services against the east wall: the bunded oil rack, the spill kit, a pallet jack, two roll cabs
  add(154, 22.1, 0, -1.0, -Math.PI / 2, (b) => buildGarageProp(b, 'oilRack'));
  add(155, 22.2, 0, 1.4, -Math.PI / 2, (b) => buildGarageProp(b, 'spillBin'));
  add(156, 20.4, 0, -2.8, 0.4, (b) => buildGarageProp(b, 'palletJack'));
  add(157, 22.0, 0, -15.4, -Math.PI / 2, (b) => buildGarageBenchPiece(b, 'rollCab'));
  add(158, 22.0, 0, -14.1, -Math.PI / 2 + 0.08, (b) => buildGarageBenchPiece(b, 'rollCab'));
  // the Leopard's track spares in the hall's south-west corner
  add(159, -21.3, 0, 20.4, 0.15, (b) => buildGarageProp(b, 'trackPallet'));
  add(160, -21.1, 0, 18.9, -0.1, (b) => buildGarageProp(b, 'trackPallet'));
  add(161, -19.6, 0, 20.9, 0, (b) => { buildGarageProp(b, 'roadWheel'); b.at(0.04, 0.17, 0.02, 0.3, () => { buildGarageProp(b, 'roadWheel'); }); });

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
    mesh.onBeforeRender = () => { ensureGarageDisplayAtlas({ anisotropy: params.anisotropy }); };
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
  // daylight shafts under the roof lights, left and right of the hero, with motes hanging in the left one
  const atmosphere = createGarageAtmosphere({
    drift: 0.012,
    cards: [
      atmosphereShaft([-17.8, 9.7, 2.2], [-15.9, 0.05, 5.6], 2.2),
      atmosphereShaft([4.2, 9.7, -17.6], [5.6, 0.05, -14.2], 2.4, 0.37),
      ...atmosphereMotes([-16.9, 3.2, 5.2], 2.4),
    ],
  });
  materials.push(atmosphere.material as THREE.Material);
  finish(atmosphere, 'garage_verdant_kit_atmosphere');
  return {
    meshes, materials,
    stats: Object.freeze({ triangles, brandPieces: 3, tankImages: prints.length + morePrints.length, stations: 2, stationMonitors: 7 }),
  };
}
