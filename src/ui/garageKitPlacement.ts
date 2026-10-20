import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { GarageVariant } from '../game/garageVariants.ts';
import { GARAGE_HERO_HEADING_RAD, garageViewPoint } from '../game/garagePresentationPose.ts';
import type { GeometryBuckets } from '../world/maps/exteriorDetailKit.ts';
import { KitBuilder, kitRandom, type KitBuildResult, type KitVec } from './garageKitGeometry.ts';
import { garageKitSkin } from './garageKitSkins.ts';
import { buildGarageProp, type KitPropParams } from './garagePropKit.ts';
import { buildGarageBenchPiece, type KitBenchParams } from './garageBenchKit.ts';
import {
  buildAFrameGantry, buildGableHoistBeam, buildJibCrane, buildMagnetHandler, buildMonorailBeam, buildOverheadCrane,
  buildPortalGantry, buildRailBreakdownCrane, buildRopewayPylon, type KitCraneLoad, type KitCraneReceipt,
  type OverheadCraneParams, type PortalGantryParams,
} from './garageCraneKit.ts';
import { buildWallRun, type KitWallKind, type KitWallRunParams } from './garageWallKit.ts';
import { buildABoard, buildGroundStencil, buildHangingSign, buildPostSign, buildSupergraphic, buildWallPlate } from './garageSignKit.ts';
import {
  buildComputerStation, buildFabricBanner, buildFramedPrint, buildMetalPlate, buildMonitor, buildNameboard, buildNoticeBoard,
  buildPoster, buildPvcBanner, buildSlideshowFrame, type KitSlideshowMount,
} from './garageDisplayKit.ts';
import { armGarageDisplayAtlas, createGarageDecalMaterial, createGarageDisplayMaterial, garageDisplayRect } from './garageDisplayAtlas.ts';
import { createGarageAtmosphere, type GarageAtmosphereRecipe } from './garageAtmosphereKit.ts';
import { GARAGE_SLIDESHOW_PLACEMENTS } from './garageSlideshowPlacement.ts';

/**
 * The garage r9 kit's arrangement: each Garage lists its kit pieces in a placement table (garageKitPlacements.ts), in
 * the opening view's frame (`at: [side, depth]`, metres; `yaw` relative to the yard grid, which runs parallel to the
 * hero), and this module builds them into the pack.
 *
 * - Each distinct piece (its kind, parameters and the Garage's skin) is built once per session and cached; placing it
 *   transforms a copy. A Garage switch never rebuilds kit geometry.
 * - Solids join the pack's baked bucket and textured surfaces their own buckets (no draws of their own); atlas faces
 *   form the pack's one DISPLAY-LIT mesh and decals its one DECAL mesh; the atmosphere recipe its one mesh.
 * - Every piece standing on the ground gets a contact blot (decal) a little wider than its footprint.
 */

/**
 * Every item may stand on the Garage datum (y = 0, the pads' level) instead of the terrain under it, and may carry a
 * `shade` (0-1): a piece deep in a bore or under a heavy roof keeps that occlusion in its baked colours (garage r9: the
 * crane in Glacier's tunnel read lit yellow straight behind the hero).
 */
type GarageKitItemBase = { readonly datum?: boolean; readonly shade?: number };

type GarageKitItem = GarageKitItemBase & (
  | { readonly kind: 'prop'; readonly name: string; readonly at: readonly [number, number]; readonly yaw?: number; readonly y?: number;
    readonly params?: KitPropParams; readonly blot?: boolean }
  | { readonly kind: 'bench'; readonly name: string; readonly at: readonly [number, number]; readonly yaw?: number; readonly y?: number;
    readonly params?: KitBenchParams }
  | { readonly kind: 'crane'; readonly crane: 'overhead'; readonly at: readonly [number, number]; readonly yaw?: number; readonly y?: number;
    readonly params: OverheadCraneParams }
  | { readonly kind: 'crane'; readonly crane: 'portal'; readonly at: readonly [number, number]; readonly yaw?: number; readonly y?: number;
    readonly params: PortalGantryParams }
  | { readonly kind: 'crane'; readonly crane: 'jib' | 'aframe' | 'monorail' | 'gable' | 'breakdown' | 'magnet' | 'ropeway';
    readonly at: readonly [number, number]; readonly yaw?: number; readonly y?: number;
    readonly params: Readonly<Record<string, number | string | boolean | KitCraneLoad | KitVec | null | undefined>> }
  | { readonly kind: 'wall'; readonly wall: KitWallKind; readonly points: ReadonlyArray<readonly [number, number]>; readonly y?: number;
    readonly params?: KitWallRunParams }
  | { readonly kind: 'sign'; readonly sign: 'plate' | 'post' | 'hanging' | 'aboard' | 'supergraphic' | 'stencil'; readonly rect: string;
    readonly at: readonly [number, number]; readonly yaw?: number; readonly y?: number; readonly size: readonly [number, number] }
  | { readonly kind: 'display'; readonly display: 'print' | 'poster' | 'banner' | 'pvc' | 'plate' | 'monitor';
    readonly rect: string; readonly at: readonly [number, number]; readonly yaw?: number; readonly y?: number;
    readonly size: readonly [number, number]; readonly options?: Readonly<Record<string, number | string | boolean>> }
  | { readonly kind: 'display'; readonly display: 'nameboard'; readonly at: readonly [number, number]; readonly yaw?: number;
    readonly y?: number; readonly width: number; readonly posts?: number }
  | { readonly kind: 'display'; readonly display: 'board'; readonly rects: readonly string[]; readonly at: readonly [number, number];
    readonly yaw?: number; readonly y?: number; readonly size: readonly [number, number]; readonly posts?: number }
  | { readonly kind: 'display'; readonly display: 'station'; readonly at: readonly [number, number]; readonly yaw?: number;
    readonly y?: number; readonly screens: readonly string[]; readonly width?: number; readonly rugged?: boolean }
  | { readonly kind: 'display'; readonly display: 'slideshow'; readonly at: readonly [number, number]; readonly yaw?: number;
    readonly y?: number; readonly width: number; readonly mount: 'freestanding' | 'wall' | 'column' | 'trailer'; readonly bottomY?: number });

export interface GarageKitPlacement {
  readonly items: readonly GarageKitItem[];
  readonly atmosphere?: GarageAtmosphereRecipe;
}

/** The slideshow's resolved pose in the Garage frame, for the dressing to place its screen. */
interface GarageSlideshowPose {
  readonly position: KitVec;
  readonly yaw: number;
  readonly width: number;
  readonly height: number;
}

export interface GarageKitBuild {
  readonly meshes: readonly THREE.Mesh[];
  readonly materials: readonly THREE.Material[];
  readonly stats: Readonly<{
    kitPieces: number;
    kitTriangles: number;
    displayTriangles: number;
    decalTriangles: number;
    atmosphereTriangles: number;
    cranes: readonly KitCraneReceipt[];
    brandPieces: number;
    tankImages: number;
    stations: number;
    stationMonitors: number;
    nameboards: number;
    displayRects: readonly string[];
  }>;
  readonly slideshow: GarageSlideshowPose | null;
  /** Each grounded piece's footprint (world x, z and radius) for the pack's vegetation to keep clear of. */
  readonly footprints: ReadonlyArray<{ readonly x: number; readonly z: number; readonly radius: number }>;
}

interface CachedPiece {
  readonly result: KitBuildResult;
  readonly crane?: KitCraneReceipt;
  readonly slideshow?: KitSlideshowMount;
  /** The piece's ground footprint (x/z half extents) for its contact blot. */
  readonly footprint: readonly [number, number] | null;
}

const pieceCache = new Map<string, CachedPiece>();

/** Build (or fetch) one piece in its own frame. Exported for the kit sheet and the receipts. */
function buildGarageKitPiece(item: GarageKitItem, architecture: GarageVariant['architecture'], mapId: string): CachedPiece {
  const skin = garageKitSkin(architecture);
  const { at: _at, yaw: _yaw, y: _y, ...shape } = item as GarageKitItem & { at?: unknown; yaw?: unknown; y?: unknown };
  const key = `${skin.id}|${mapId}|${JSON.stringify(shape)}`;
  const cached = pieceCache.get(key);
  if (cached) return cached;
  const b = new KitBuilder(kitRandom(hash(key)), skin);
  let crane: KitCraneReceipt | undefined;
  let slideshow: KitSlideshowMount | undefined;
  let grounded = true;
  switch (item.kind) {
    case 'prop': buildGarageProp(b, item.name, item.params); grounded = item.blot !== false; break;
    case 'bench': buildGarageBenchPiece(b, item.name, item.params); break;
    case 'crane': {
      const p = item.params as never;
      switch (item.crane) {
        case 'overhead': crane = buildOverheadCrane(b, p); break;
        case 'portal': crane = buildPortalGantry(b, p); break;
        case 'jib': crane = buildJibCrane(b, p); break;
        case 'aframe': crane = buildAFrameGantry(b, p); break;
        case 'monorail': crane = buildMonorailBeam(b, p); break;
        case 'gable': crane = buildGableHoistBeam(b, p); grounded = false; break;
        case 'breakdown': crane = buildRailBreakdownCrane(b, p); break;
        case 'magnet': crane = buildMagnetHandler(b, p); break;
        case 'ropeway': buildRopewayPylon(b, p); break;
        default: break;
      }
      break;
    }
    case 'wall': buildWallRun(b, item.wall, item.points.map(([side, depth]) => [side, -depth] as const), item.params); grounded = false; break;
    case 'sign': {
      const [w, h] = item.size;
      grounded = item.sign === 'post' || item.sign === 'aboard';
      if (item.sign === 'plate') buildWallPlate(b, item.rect, w, h);
      else if (item.sign === 'post') buildPostSign(b, item.rect, w, h);
      else if (item.sign === 'hanging') buildHangingSign(b, item.rect, w, h);
      else if (item.sign === 'aboard') buildABoard(b, item.rect);
      else if (item.sign === 'supergraphic') buildSupergraphic(b, item.rect, w, h, h / 2);
      else buildGroundStencil(b, item.rect, w, h);
      break;
    }
    case 'display': {
      grounded = false;
      switch (item.display) {
        case 'print': buildFramedPrint(b, item.rect, item.size[0], item.size[1], item.options?.light !== false); break;
        case 'poster': buildPoster(b, item.rect, item.size[0], item.size[1], item.options?.paste ? 'paste' : 'board'); break;
        case 'banner': buildFabricBanner(b, item.rect, item.size[0], item.size[1], { hang: Number(item.options?.hang ?? 0) || undefined }); break;
        case 'pvc': buildPvcBanner(b, item.rect, item.size[0], item.size[1], item.size[1], Number(item.options?.gap ?? 0.25)); break;
        case 'plate': buildMetalPlate(b, item.rect, item.size[0], item.size[1]); break;
        case 'monitor': buildMonitor(b, item.rect, item.size[0], (item.options?.mount as 'desk' | 'wall' | 'none') ?? 'wall'); break;
        case 'nameboard': buildNameboard(b, mapId, item.width, item.posts ?? 0); grounded = (item.posts ?? 0) > 0; break;
        case 'station': buildComputerStation(b, { screens: item.screens, width: item.width, rugged: item.rugged }); grounded = true; break;
        case 'board': buildNoticeBoard(b, item.rects, item.size[0], item.size[1], item.posts ?? 0.9); grounded = (item.posts ?? 0.9) > 0; break;
        case 'slideshow': slideshow = buildSlideshowFrame(b, { width: item.width, mount: item.mount, bottomY: item.bottomY }); grounded = item.mount === 'freestanding' || item.mount === 'trailer'; break;
        default: break;
      }
      break;
    }
    default: break;
  }
  const result = b.build();
  if (item.shade !== undefined && item.shade < 1) {
    const color = result.solid.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < color.array.length; i += 1) (color.array as Float32Array)[i] *= item.shade;
    color.needsUpdate = true;
  }
  const box = result.solid.boundingBox;
  const footprint: readonly [number, number] | null = grounded && box && !box.isEmpty() && box.min.y < 0.2
    ? [Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), Math.max(Math.abs(box.min.z), Math.abs(box.max.z))]
    : null;
  const piece: CachedPiece = { result, crane, slideshow, footprint };
  pieceCache.set(key, piece);
  return piece;
}

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

/** Drop the session cache (tests). */
export function clearGarageKitCache(): void {
  for (const piece of pieceCache.values()) {
    piece.result.solid.dispose();
    piece.result.display?.dispose();
    piece.result.decal?.dispose();
    for (const surface of piece.result.surfaces.values()) surface.dispose();
  }
  pieceCache.clear();
}

/**
 * Build a Garage's placed kit into its pack: solids into `buckets.baked`, surfaces into their buckets, and the display,
 * decal and atmosphere meshes returned for the pack to own. `groundAtWorld` seats each piece on the pack's terrain
 * (`y` adds to it; `datum: y` items on pads use y = 0 by giving `y` relative to that ground).
 */
export function buildGarageKitDressing(params: {
  readonly variant: GarageVariant;
  readonly placement: GarageKitPlacement;
  readonly buckets: GeometryBuckets;
  readonly groundAtWorld: (x: number, z: number) => number;
  readonly setupShadowMaterial?: ((material: THREE.Material) => void) | null;
  readonly anisotropy?: number;
}): GarageKitBuild {
  const { variant, placement, buckets, groundAtWorld } = params;
  const displays: THREE.BufferGeometry[] = [];
  const decals: THREE.BufferGeometry[] = [];
  const cranes: KitCraneReceipt[] = [];
  const displayRects: string[] = [];
  let kitTriangles = 0, displayTriangles = 0, decalTriangles = 0;
  let brandPieces = 0, tankImages = 0, stations = 0, stationMonitors = 0, nameboards = 0;
  let slideshow: GarageSlideshowPose | null = null;
  const footprints: Array<{ x: number; z: number; radius: number }> = [];
  const blotRect = garageDisplayRect('decal.blot');
  const matrix = new THREE.Matrix4();
  const countRect = (rect: string): void => {
    displayRects.push(rect);
    if (/^(brand\.|stencil\.(crest|wordmark))/.test(rect)) brandPieces += 1;
    if (/^still\./.test(rect)) tankImages += 1;
  };
  const items = garageKitItems(variant, placement);
  for (const item of items) {
    const piece = buildGarageKitPiece(item, variant.architecture, variant.mapId);
    const yaw = kitItemMatrix(item, groundAtWorld, matrix);
    const solid = placedCopy(piece.result.solid, matrix);
    if (item.kind === 'wall') seatOnGround(solid, groundAtWorld, item.y ?? 0);
    (buckets.baked ||= []).push(solid);
    kitTriangles += piece.result.solidTriangles;
    for (const [bucket, surface] of piece.result.surfaces) {
      const placed = placedCopy(surface, matrix);
      if (item.kind === 'wall') seatOnGround(placed, groundAtWorld, item.y ?? 0);
      ((buckets as Record<string, THREE.BufferGeometry[]>)[bucket] ||= []).push(placed);
      kitTriangles += surface.getAttribute('position').count / 3;
    }
    if (piece.result.display) {
      const placed = placedCopy(piece.result.display, matrix);
      if (item.kind === 'wall') seatOnGround(placed, groundAtWorld, item.y ?? 0);
      displays.push(placed);
      displayTriangles += piece.result.displayTriangles;
    }
    if (piece.result.decal) {
      const placed = placedCopy(piece.result.decal, matrix);
      if (item.kind === 'wall') seatOnGround(placed, groundAtWorld, item.y ?? 0);
      decals.push(placed);
      decalTriangles += piece.result.decalTriangles;
    }
    if (piece.footprint) {
      const [hx, hz] = piece.footprint;
      const blot = new THREE.PlaneGeometry(hx * 2 * 1.25 + 0.3, hz * 2 * 1.25 + 0.3);
      blot.rotateX(-Math.PI / 2);
      const uv = blot.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i += 1) {
        uv.setXY(i, blotRect.u0 + uv.getX(i) * (blotRect.u1 - blotRect.u0), blotRect.v0 + uv.getY(i) * (blotRect.v1 - blotRect.v0));
      }
      blot.translate(0, 0.02, 0);
      blot.applyMatrix4(matrix);
      decals.push(blot);
      decalTriangles += 2;
    }
    if (item.kind !== 'wall' && item.kind !== 'sign') {
      const box = piece.result.solid.boundingBox;
      if (box && !box.isEmpty()) {
        const centre = box.getCenter(new THREE.Vector3()).applyMatrix4(matrix);
        footprints.push({ x: centre.x, z: centre.z, radius: Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2 });
      }
    }
    if (piece.crane) cranes.push(piece.crane);
    if (item.kind === 'sign' || (item.kind === 'display' && 'rect' in item)) countRect((item as { rect: string }).rect);
    if (item.kind === 'display' && item.display === 'nameboard') nameboards += 1;
    if (item.kind === 'display' && item.display === 'board') for (const rect of item.rects) countRect(rect);
    if (item.kind === 'wall' && item.params?.mural) countRect(item.params.mural);
    if (item.kind === 'display' && item.display === 'station') {
      stations += 1;
      stationMonitors += Math.min(3, Math.max(2, item.screens.length));
      for (const screen of item.screens) displayRects.push(screen);
    }
    if (item.kind === 'display' && item.display === 'slideshow' && piece.slideshow) {
      const center = new THREE.Vector3(...piece.slideshow.center).applyMatrix4(matrix);
      slideshow = { position: [center.x, center.y, center.z], yaw, width: piece.slideshow.width, height: piece.slideshow.height };
    }
  }
  const meshes: THREE.Mesh[] = [];
  const materials: THREE.Material[] = [];
  if (displays.length) {
    const merged = mergeGeometries(displays, false);
    for (const geometry of displays) geometry.dispose();
    if (merged) {
      const material = createGarageDisplayMaterial(params.setupShadowMaterial);
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = 'garage_kit_displays';
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      // the shared atlas loads on the first frame a display is drawn: after the Garage presents
      armGarageDisplayAtlas(mesh, params.anisotropy);
      meshes.push(mesh);
      materials.push(material);
    }
  }
  if (decals.length) {
    const merged = mergeGeometries(decals.map((geometry) => {
      // decals carry no normals of their own once merged with the blots
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      return geometry.index ? geometry.toNonIndexed() : geometry;
    }), false);
    for (const geometry of decals) geometry.dispose();
    if (merged) {
      const material = createGarageDecalMaterial();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = 'garage_kit_decals';
      mesh.renderOrder = 2;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      armGarageDisplayAtlas(mesh, params.anisotropy);
      meshes.push(mesh);
      materials.push(material);
    }
  }
  let atmosphereTriangles = 0;
  if (placement.atmosphere?.cards.length) {
    const mesh = createGarageAtmosphere(placement.atmosphere);
    atmosphereTriangles = mesh.userData.atmosphereTriangles;
    meshes.push(mesh);
    materials.push(mesh.material as THREE.Material);
  }
  return {
    meshes, materials, slideshow, footprints,
    stats: Object.freeze({
      kitPieces: items.length, kitTriangles, displayTriangles, decalTriangles, atmosphereTriangles,
      cranes: Object.freeze(cranes), brandPieces, tankImages, stations, stationMonitors, nameboards,
      displayRects: Object.freeze(displayRects),
    }),
  };
}

/** The placed items, the Garage's one slideshow frame (from the shared slideshow table, on the datum) included. */
function garageKitItems(variant: GarageVariant, placement: GarageKitPlacement): readonly GarageKitItem[] {
  const slideshow = GARAGE_SLIDESHOW_PLACEMENTS[variant.architecture];
  return slideshow
    ? [...placement.items, { kind: 'display', display: 'slideshow', at: slideshow.at, yaw: slideshow.yaw,
      width: slideshow.width, mount: slideshow.mount, bottomY: slideshow.bottomY, y: slideshow.y ?? 0, datum: true }]
    : placement.items;
}

/** One item's placement matrix in the Garage frame (written into `out`); returns its yaw. */
function kitItemMatrix(item: GarageKitItem, groundAtWorld: (x: number, z: number) => number, out: THREE.Matrix4): number {
  const up = new THREE.Vector3(0, 1, 0);
  const yaw = GARAGE_HERO_HEADING_RAD + ('yaw' in item ? item.yaw ?? 0 : 0);
  if (item.kind === 'wall') {
    // a wall run's points are view coordinates, built as [side, -depth] so the frame stays right-handed (side right,
    // up, toward the camera): a run drawn left to right faces the camera. Map it through the view frame's rotation.
    const sideAxis = garageViewPoint(1, 0), depthAxis = garageViewPoint(0, 1);
    out.makeBasis(new THREE.Vector3(sideAxis.x, 0, sideAxis.z), up, new THREE.Vector3(-depthAxis.x, 0, -depthAxis.z));
    return yaw;
  }
  const point = garageViewPoint(item.at[0], item.at[1]);
  const ground = item.datum ? 0 : groundAtWorld(point.x, point.z);
  out.compose(new THREE.Vector3(point.x, ground + (item.y ?? 0), point.z),
    new THREE.Quaternion().setFromAxisAngle(up, yaw), new THREE.Vector3(1, 1, 1));
  return yaw;
}

/**
 * The world bounds of each placed item's solids and of its display faces (the placement receipts test them against the
 * hero's halo and the structures). Wall runs are seated per module, so their bounds take the terrain's range.
 */
export function garageKitItemBounds(variant: GarageVariant, placement: GarageKitPlacement,
  groundAtWorld: (x: number, z: number) => number): Array<{
    readonly item: GarageKitItem; readonly solid: THREE.Box3; readonly display: THREE.Box3 | null;
    /** Each display face and decal quad on its own (a wall's murals, a board's prints, a station's screens). */
    readonly quads: readonly THREE.Box3[];
    /** Each quad's six corners in the Garage frame (its oriented box: the placement receipt's structure test). */
    readonly quadCorners: ReadonlyArray<readonly THREE.Vector3[]>;
    /** The piece's oriented bounds (its own box under its placement), or null for a wall run seated per module. */
    readonly solidObb: { readonly matrix: THREE.Matrix4; readonly box: THREE.Box3 } | null;
  }> {
  const matrix = new THREE.Matrix4();
  return garageKitItems(variant, placement).map((item) => {
    const piece = buildGarageKitPiece(item, variant.architecture, variant.mapId);
    kitItemMatrix(item, groundAtWorld, matrix);
    const place = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
      const placed = geometry.clone().applyMatrix4(matrix);
      if (item.kind === 'wall') seatOnGround(placed, groundAtWorld, item.y ?? 0);
      return placed;
    };
    const boxOf = (geometry: THREE.BufferGeometry): THREE.Box3 => {
      const placed = place(geometry);
      placed.computeBoundingBox();
      const box = placed.boundingBox!.clone();
      placed.dispose();
      return box;
    };
    const quads: THREE.Box3[] = [];
    const quadCorners: THREE.Vector3[][] = [];
    for (const geometry of [piece.result.display, piece.result.decal]) {
      if (!geometry) continue;
      const placed = place(geometry);
      const position = placed.getAttribute('position');
      for (let i = 0; i < position.count; i += 6) {
        const box = new THREE.Box3();
        const corners: THREE.Vector3[] = [];
        for (let k = 0; k < 6 && i + k < position.count; k += 1) {
          const corner = new THREE.Vector3().fromBufferAttribute(position, i + k);
          box.expandByPoint(corner);
          corners.push(corner);
        }
        quads.push(box);
        quadCorners.push(corners);
      }
      placed.dispose();
    }
    const own = piece.result.solid.boundingBox;
    const solidObb = item.kind !== 'wall' && own && !own.isEmpty() ? { matrix: matrix.clone(), box: own.clone() } : null;
    return { item, solid: boxOf(piece.result.solid), display: piece.result.display ? boxOf(piece.result.display) : null, quads, quadCorners, solidObb };
  });
}

/** Seat a wall run's vertices on the terrain (each vertex rises by the ground under its own x/z). */
/**
 * A cached piece's geometry placed by `matrix`, without bounds: placed copies only feed the pack's merge, which bounds
 * the merged mesh, and a copy carrying the piece's bounds recomputed both on every transform (garage r9 g1 r4: a tenth
 * of a cold pack bake).
 */
function placedCopy(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const copy = geometry.clone();
  copy.boundingBox = null;
  copy.boundingSphere = null;
  return copy.applyMatrix4(matrix);
}

function seatOnGround(geometry: THREE.BufferGeometry, groundAtWorld: (x: number, z: number) => number, lift: number): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  // seat by module: group vertices by a 0.6 m cell so a module stays rigid on sloping ground
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i), z = position.getZ(i);
    const cx = Math.round(x / 0.6) * 0.6, cz = Math.round(z / 0.6) * 0.6;
    position.setY(i, position.getY(i) + groundAtWorld(cx, cz) + lift);
  }
  position.needsUpdate = true;
  // bounds stay as the copy had them (none: placedCopy); the merge bounds the pack's mesh
  if (geometry.boundingBox) geometry.computeBoundingBox();
  if (geometry.boundingSphere) geometry.computeBoundingSphere();
}
