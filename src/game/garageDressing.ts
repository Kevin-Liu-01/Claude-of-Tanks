// src/game/garageDressing.ts — WORKSHOP SET DRESSING for the garage hangar
// (garage-scene r1). The bay read as a clean showroom: podium + a handful of
// crates. This module turns it into a WORKING tank workshop — benches with
// tools, pegboards, shell racks, real fleet tanks and their turret/gun rigs,
// turret and hull teardown states, armor racks, oil drums, jerrycans, welding cart with a faint
// arc glow, cable reels, an engine hoist with a hanging engine block, a big
// wall fan, extra hanging work lamps, two partial tanks and a recovered wreck.
//
// Contract with the rest of the game:
//  - FLEET-EXACT EXHIBITS: every Garage environment carries the same original T-90A
//    Burlak, Abrams, T-90M and K2 repair choreography. Every vehicle comes from
//    the same first-party createTank builders as the playable fleet, loaded
//    only after the garage becomes quiet.
//  - BUILDS IN CHUNKS: first paint pumps only the static workshop shell, then
//    streams one real vehicle/component display per garage-idle window.
//    Deterministic captures still call ensureBuilt(). This keeps the complete
//    authored workshop without putting any background tank build on boot/switch.
//  - PEDESTAL READABILITY IS SACRED: everything sits outside the painted
//    KEEP-CLEAR ring, in the r≥14 m wall/corner band, dim (low-albedo mats,
//    one whisper-level fill light, emissive-faked lamp pools) — the hero on
//    the turntable stays the brightest, cleanest read in frame.
//  - CAMERA SAFE: the showroom orbit reaches r≈19.3 m at y≥3.1 m — anything
//    taller than ~2.9 m keeps its whole footprint beyond r≈20 m (the corner
//    bays sit at r 23-26 m), so a free 360° orbit never clips into dressing.
//  - BATTLE COST ZERO: main.ts toggles group.visible with the garage spots;
//    hidden subtrees (the dim fill light included) drop out of the render
//    list entirely, so battle frames never cull or draw any of this.
import * as THREE from 'three';
import {
  mulberry32, canvasTexture, dither, makeSignTexture, makeHazardTexture, SIGN_FONT,
} from '../ui/garageStage.ts';
import { FEATURED_SHOTS } from '../ui/featuredShots.ts';
import { DECOR_KITS } from '../vehicles/decorations.ts';
import { optimizeGarageDressing } from './garageDressingOptimization.ts';
import { getGarageVariant } from './garageVariants.ts';
import { VERDANT_GANTRY } from './garageGantry.ts';
import { auditGarageWallBays, garageWallTransform } from './garageWallLayout.ts';
import { getGarageWorkshopLayoutPose } from './garageWorkshopLayout.ts';

export interface GarageDressingEngineContext {
  readonly anisotropy?: number;
  readonly renderer?: THREE.WebGLRenderer;
  readonly scene?: THREE.Scene;
  readonly camera?: THREE.Camera;
  setupShadowMaterial?(material: THREE.Material): void;
  releaseShadowMaterial?(material: THREE.Material): boolean;
}

export interface GarageWorkshopVisual {
  readonly root: THREE.Group;
  resetForGaragePresentation?(): void;
  dispose(): void;
}

interface GarageWorkshopVisualOptions {
  readonly camoSeed?: number;
  readonly quality?: 'high' | 'ai' | 'low' | 'preview';
  readonly geometryQuality?: 'high' | 'low';
  readonly staticPreview?: boolean;
  readonly decor?: boolean;
  readonly deferStaticBatch?: boolean;
}

export interface GarageWorkshopFleet {
  ensureVisualBuilder(specId: string): Promise<void>;
  createVisual(
    specId: string,
    options?: Readonly<GarageWorkshopVisualOptions>,
  ): Promise<GarageWorkshopVisual>;
  dispose?(): void;
}

export interface GarageDressingExisting {
  readonly group?: THREE.Group;
  readonly bayFill?: THREE.PointLight;
  readonly variantId?: string;
  readonly workshopFleet?: GarageWorkshopFleet;
}

export interface GarageDressingRuntime {
  readonly group: THREE.Group;
  pump(): Promise<boolean>;
  ensureBuilt(): Promise<void>;
  isBuilt(): boolean;
  setVariant(variantId: string): string;
  dispose(): void;
}

type Scale3 = number | [number, number, number];
type TrackedResource = { dispose(): void };

function countWorkshopTriangles(root: THREE.Object3D): number {
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    const one = (geometry.index?.count || geometry.getAttribute('position')?.count || 0) / 3;
    triangles += one * (object instanceof THREE.InstancedMesh ? object.count : 1);
  });
  return Math.round(triangles);
}

const WORKSHOP_FLEET_IDS = Object.freeze([
  't90a_burlak', 'm1a2', 't90m', 'k2',
] as const);
const WORKSHOP_FLEET_ID_SET = new Set<string>(WORKSHOP_FLEET_IDS);
const WORKSHOP_PRESENTATION_OPTIONS = Object.freeze({
  // Full authored geometry and fittings with a fixed national delivery coat.
  // The worker path uses a map-free PBR palette; this explicit Factory choice
  // also prevents the recovery path from inheriting player/signature paint.
  quality: 'ai',
  camoPattern: 'factory',
  geometryQuality: 'high',
  staticPreview: true,
  decor: true,
  deferStaticBatch: true,
} as const);
const WORKSHOP_CHUNK_VEHICLE_IDS = Object.freeze([
  null, 't90a_burlak', 'm1a2', 't90m', 'k2', null, null,
] as const);
const WORKSHOP_CHUNK_LABELS = Object.freeze([
  'core', 'burlak-bay', 'abrams-bay', 't90m-bay', 'k2-bay',
  'finalize', 'optimize',
] as const);
const SHARED_MAINTENANCE_BAY_IDS = Object.freeze([
  'burlak_gantry', 'abrams_welding', 't90m_relikt', 'rolled_k2',
] as const);
const SHARED_MAINTENANCE_BAY_QUADRANTS = Object.freeze([
  'north-east', 'south-east', 'south-west', 'north-west',
] as const);

// The workshop monitor is a field archive, not a location preview. Reuse the
// canonical player-facing captures so filenames cannot drift from disk, but
// keep the rotation compact: only one current and one incoming texture are
// resident at a time.
const GARAGE_BATTLE_SCREEN_SHOTS = Object.freeze(
  FEATURED_SHOTS.filter((shot) => !shot.handmade && shot.maps?.length).slice(0, 6),
);
const BATTLE_SCREEN_HOLD_MS = 6_500;
const BATTLE_SCREEN_SCROLL_MS = 720;

/** Load only the real fleet families used by the optional workshop. */
export async function prepareGarageDressing(
  engineCtx: GarageDressingEngineContext,
): Promise<GarageWorkshopFleet> {
  const { createGarageWorkshopTransfer } = await import('./garageWorkshopTransfer.ts');
  const transfer = createGarageWorkshopTransfer(engineCtx);
  return {
    async ensureVisualBuilder(specId: string) {
      if (!WORKSHOP_FLEET_ID_SET.has(specId)) {
        throw new Error(`Garage workshop does not own '${specId}'`);
      }
    },
    async createVisual(specId: string, options: Readonly<GarageWorkshopVisualOptions> = {}) {
      const camoSeed = typeof options.camoSeed === 'number' ? options.camoSeed : 4200;
      try {
        return await transfer.createVisual(specId, camoSeed);
      } catch (error) {
        // Module workers are supported by every production target, but keep a
        // deterministic recovery path for restrictive embedded browsers. Only
        // this exceptional path loads a playable builder on the render thread.
        console.warn('[garageDressing] workshop worker unavailable; using main-thread fallback', error);
        const { createTank, ensureTankBuilder } = await import('../vehicles/fleetFactory.ts');
        await ensureTankBuilder(specId);
        return createTank(specId, engineCtx, {
          ...WORKSHOP_PRESENTATION_OPTIONS,
          ...options,
          camoSeed,
          // Recovery must obey the same non-signature finish contract as the
          // worker path even if an internal caller accidentally passes paint.
          camoPattern: 'factory',
        });
      }
    },
    dispose() { transfer.dispose(); },
  };
}

/**
 * Build the (initially empty) workshop dressing rig.
 * @param {{anisotropy:number,setupShadowMaterial:Function}} engineCtx
 * @param {THREE.Vector3} pos garage stage center (ground level)
 * @param {{group?:THREE.Group,bayFill?:THREE.PointLight}} [existing]
 * @returns {{group:THREE.Group, pump:()=>boolean, ensureBuilt:()=>void,
 *            isBuilt:()=>boolean, dispose:()=>void}}
 */
export function createGarageDressing(
  engineCtx: GarageDressingEngineContext,
  pos: THREE.Vector3,
  existing: GarageDressingExisting = {},
): GarageDressingRuntime {
  const group = existing.group || new THREE.Group();
  group.name = 'garage_dressing';
  group.userData.perfOwner = 'garage/workshop';
  group.position.copy(pos);
  group.userData.workshopPartSource = 'playable-fleet-factory';
  group.userData.workshopModelMode = 'actual-fleet';
  group.userData.wallLayout = auditGarageWallBays();

  // Establish the dressing's final light set before the boot warm renders the
  // hero. Adding this light from a later build chunk changes Three's lighting
  // program keys and recompiles the already-visible tank mid-garage.
  const bayFill = existing.bayFill || new THREE.PointLight(0xb9c6d6, 10, 30, 1.8);
  if (!existing.bayFill) {
    bayFill.position.set(12.5, 6.2, 11.5);
    bayFill.castShadow = false;
    group.add(bayFill);
  }

  const rng = mulberry32(48151);
  const aniso = (engineCtx && engineCtx.anisotropy) || 4;
  const shadowMat = <T extends THREE.Material>(m: T): T => {
    if (engineCtx && engineCtx.setupShadowMaterial) engineCtx.setupShadowMaterial(m);
    return m;
  };
  const disposables: TrackedResource[] = [];
  const track = <T extends TrackedResource>(o: T): T => {
    disposables.push(o);
    return o;
  };
  const signTextures: THREE.Texture[] = [];
  const workshopVisuals: GarageWorkshopVisual[] = [];
  const workshopFleet = existing.workshopFleet;
  const preparedVehicleIds = new Set<string>();
  let pendingTankReveal: THREE.Object3D | null = null;
  const hidePendingTankReveal = (): void => {
    if (pendingTankReveal) pendingTankReveal.visible = false;
  };
  let currentVariant = getGarageVariant(existing.variantId);
  const legacyVerdantRoot = new THREE.Group();
  legacyVerdantRoot.name = 'garage_verdant_original_workshop';
  legacyVerdantRoot.userData.variantSwitchOwner = true;
  legacyVerdantRoot.userData.layoutReceipt = 'pre-6c7b07533-original';
  const verdantInteriorRoot = new THREE.Group();
  verdantInteriorRoot.name = 'garage_verdant_interior_clutter';
  verdantInteriorRoot.userData.variantSwitchOwner = true;
  // This wall-supported layer belongs to the restored indoor shell, which is
  // presented from the opposite end of its legacy authoring view. Rotate it
  // with the shell while leaving `legacyVerdantRoot` untouched: the shared
  // four-bay service set and field-record display must keep their canonical
  // relationship to the hero in all ten Garage environments.
  verdantInteriorRoot.rotation.y = Math.PI;
  verdantInteriorRoot.updateMatrix();
  verdantInteriorRoot.userData.layoutRotationRad = Math.PI;
  const initialVerdant = currentVariant.id === 'verdant_motor_pool';
  legacyVerdantRoot.visible = true;
  verdantInteriorRoot.visible = initialVerdant;
  group.add(legacyVerdantRoot, verdantInteriorRoot);
  group.userData.garageVariantId = currentVariant.id;
  group.userData.garageMapId = currentVariant.mapId;
  group.userData.verdantOriginalLayoutReceipt = legacyVerdantRoot.userData.layoutReceipt;

  // --- shared palette (kept LOW-ALBEDO so nothing competes with the hero) ---
  const mat = {
    steelDark: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x26292d, roughness: 0.52, metalness: 0.6 }))),
    steelMid: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x41474e, roughness: 0.46, metalness: 0.68 }))),
    steelBright: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.32, metalness: 0.85 }))),
    redCab: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x6e2621, roughness: 0.46, metalness: 0.42 }))),
    redCabDark: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x4b1a16, roughness: 0.5, metalness: 0.4 }))),
    blueSteel: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x2a4257, roughness: 0.48, metalness: 0.5 }))),
    olive: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x424636, roughness: 0.72, metalness: 0.18 }))),
    timber: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x5d4d31, roughness: 0.86, metalness: 0 }))),
    timberDark: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x413620, roughness: 0.88, metalness: 0 }))),
    rubber: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x131517, roughness: 0.94, metalness: 0 }))),
    brass: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x766330, roughness: 0.38, metalness: 0.8 }))),
    safety: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x8a7420, roughness: 0.62, metalness: 0.15 }))),
    extRed: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x77201a, roughness: 0.42, metalness: 0.35 }))),
    bottleGreen: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x2d4634, roughness: 0.4, metalness: 0.55 }))),
    bottleBlue: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x2c3f52, roughness: 0.4, metalness: 0.55 }))),
    oily: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.5, metalness: 0.72 }))),
    lamp: track(new THREE.MeshBasicMaterial({ color: 0xe8dcbd })),
  };

  // one-liner mesh placer: shared geometry, tracked once by the caller
  function put(
    geo: THREE.BufferGeometry,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
    ry = 0,
    rx = 0,
    rz = 0,
    s: Scale3 = 1,
    parent: THREE.Object3D = group,
    shadows = true,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    if (Array.isArray(s)) mesh.scale.set(s[0], s[1], s[2]);
    else mesh.scale.setScalar(s);
    if (shadows) { mesh.castShadow = true; mesh.receiveShadow = true; }
    parent.add(mesh);
    return mesh;
  }

  // --- tiny canvas textures ---------------------------------------------------
  // pegboard: dark board, peg-hole grid, painted hanging-tool silhouettes —
  // one textured quad reads as a whole wall of wrenches/hammers/pliers.
  function makePegboardTexture(): HTMLCanvasElement {
    const W = 256, H = 160;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2e3236';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1a1d20';
    g.lineWidth = 6;
    g.strokeRect(3, 3, W - 6, H - 6);
    g.fillStyle = 'rgba(14,16,18,0.8)';
    for (let y = 14; y < H - 8; y += 12) {
      for (let x = 12; x < W - 8; x += 12) g.fillRect(x, y, 2.4, 2.4);
    }
    // painted tool shadows first (slight offset), then the tools
    const tool = (draw: () => void): void => {
      g.save(); g.translate(2, 3); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.fillStyle = 'rgba(0,0,0,0.45)'; draw(); g.restore();
      g.strokeStyle = '#83898f'; g.fillStyle = '#83898f'; draw();
    };
    g.lineWidth = 5;
    // open-end wrenches (angled bars with C heads)
    for (const [x, y, l, a] of [[30, 26, 52, 0.12], [58, 24, 66, 0.06], [86, 28, 46, 0.16]]) {
      tool(() => {
        g.beginPath();
        g.moveTo(x, y); g.lineTo(x + Math.sin(a) * 14, y + l);
        g.stroke();
        g.beginPath(); g.arc(x, y - 3, 6, 0.6, Math.PI * 1.6); g.stroke();
      });
    }
    // hammer
    tool(() => {
      g.fillRect(120, 22, 8, 56);
      g.fillRect(108, 18, 32, 12);
    });
    // pliers (two arcs)
    tool(() => {
      g.beginPath(); g.moveTo(160, 26); g.quadraticCurveTo(154, 60, 150, 82); g.stroke();
      g.beginPath(); g.moveTo(166, 26); g.quadraticCurveTo(172, 60, 176, 82); g.stroke();
      g.beginPath(); g.arc(163, 24, 7, 0, Math.PI * 2); g.stroke();
    });
    // hand saw
    tool(() => {
      g.beginPath();
      g.moveTo(196, 30); g.lineTo(240, 30); g.lineTo(238, 44); g.lineTo(196, 40);
      g.closePath(); g.fill();
      g.fillRect(190, 26, 8, 22);
    });
    // hex keys + screwdrivers row
    g.lineWidth = 3.5;
    for (let i = 0; i < 7; i++) {
      const x = 34 + i * 14;
      tool(() => {
        g.beginPath(); g.moveTo(x, 104); g.lineTo(x, 128 + (i % 3) * 6); g.stroke();
      });
    }
    // coiled air hose
    tool(() => {
      g.lineWidth = 4;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(196, 116, 14 - i * 4, 0, Math.PI * 2); g.stroke(); }
    });
    // grime
    for (let i = 0; i < 240; i++) {
      g.fillStyle = rng() < 0.6 ? 'rgba(12,14,16,0.25)' : 'rgba(140,148,156,0.08)';
      g.fillRect(rng() * W, rng() * H, 1 + rng() * 2, 1 + rng() * 2);
    }
    dither(g, W, H, rng, 0.05);
    return c;
  }

  // soft radial pool for faked lamp light / under-bay work light
  function makePoolTexture(
    r0 = 'rgba(255,236,200,0.26)',
    r1 = 'rgba(255,236,200,0.08)',
  ): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 6, 64, 64, 63);
    grad.addColorStop(0, r0);
    grad.addColorStop(0.55, r1);
    grad.addColorStop(1, 'rgba(255,236,200,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return c;
  }

  // worn dashed white paint box — the side-bay floor outline decal
  function makeBayOutlineTexture(): HTMLCanvasElement {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(206,210,214,0.5)';
    g.lineWidth = 7;
    g.setLineDash([26, 18]);
    g.strokeRect(10, 10, S - 20, S - 20);
    g.setLineDash([]);
    // corner Ls painted heavier
    g.lineWidth = 10;
    for (const [x, y, dx, dy] of [[10, 10, 1, 1], [S - 10, 10, -1, 1], [10, S - 10, 1, -1], [S - 10, S - 10, -1, -1]]) {
      g.beginPath();
      g.moveTo(x + dx * 34, y); g.lineTo(x, y); g.lineTo(x, y + dy * 34);
      g.stroke();
    }
    for (let i = 0; i < 200; i++) { // chip the paint
      g.clearRect(rng() * S, rng() * S, 1 + rng() * 4, 1 + rng() * 2);
    }
    return c;
  }

  // rubber tread skid arc
  function makeSkidTexture(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d')!;
    for (const off of [-14, 14]) {
      g.strokeStyle = 'rgba(18,20,22,0.4)';
      g.lineWidth = 17;
      g.beginPath();
      g.moveTo(6, 118 + off * 0.4);
      g.quadraticCurveTo(120, 96 + off, 250, 22 + off * 0.6);
      g.stroke();
    }
    return c;
  }

  const poolTex = track(canvasTexture(makePoolTexture()));
  const poolMat = track(new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    opacity: 0.5,
  }));
  const stainC = makePoolTexture('rgba(13,13,15,0.5)', 'rgba(13,13,15,0.2)');
  const stainMat = track(new THREE.MeshBasicMaterial({
    map: track(canvasTexture(stainC)), transparent: true, depthWrite: false,
  }));

  // --- shared geometries -------------------------------------------------------
  const G = {
    box1: track(new THREE.BoxGeometry(1, 1, 1)),
    cyl: track(new THREE.CylinderGeometry(1, 1, 1, 14)),
    drum: track(new THREE.CylinderGeometry(0.42, 0.42, 1.15, 16)),
    shellBody: track(new THREE.CylinderGeometry(0.062, 0.062, 0.72, 10)),
    shellTip: track(new THREE.CylinderGeometry(0.004, 0.058, 0.22, 10)),
    caster: track(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10)),
    lampShade: track(new THREE.CylinderGeometry(0.14, 0.72, 0.52, 18)),
    lampGlow: track(new THREE.CylinderGeometry(0.56, 0.56, 0.05, 18)),
    lampCable: track(new THREE.CylinderGeometry(0.018, 0.018, 1, 6)),
    jerrycan: track(new THREE.BoxGeometry(0.34, 0.5, 0.17)),
  };

  /** hanging work lamp (dressing only — the pool quad fakes its throw). */
  function workLamp(
    x: number,
    z: number,
    poolScale = 5.5,
    y = 7.4,
    parent: THREE.Object3D = group,
  ): void {
    put(G.lampShade, mat.steelDark, x, y, z, 0, 0, 0, 1, parent);
    const glow = put(G.lampGlow, mat.lamp, x, y - 0.26, z, 0, 0, 0, 1, parent, false);
    glow.castShadow = false;
    put(G.lampCable, mat.steelDark, x, y + 0.26 + (10 - y - 0.26) / 2, z,
      0, 0, 0, [1, (10 - y - 0.26), 1], parent, false);
    if (poolScale > 0.01) {
      const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1)), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.032, z);
      pool.scale.setScalar(poolScale);
      parent.add(pool);
    }
  }

  /** worn steel workbench with clutter (vice, welder box, grinder, cans). */
  function workbench(x: number, z: number, ry: number): THREE.Group {
    const b = new THREE.Group();
    b.position.set(x, 0, z);
    b.rotation.y = ry;
    group.add(b);
    put(track(new THREE.BoxGeometry(3.1, 0.11, 0.95)), mat.timber, 0, 0.98, 0, 0, 0, 0, 1, b);
    put(track(new THREE.BoxGeometry(3.0, 0.07, 0.85)), mat.steelDark, 0, 0.5, 0, 0, 0, 0, 1, b); // lower shelf
    const legG = track(new THREE.BoxGeometry(0.09, 0.98, 0.09));
    for (const [lx, lz] of [[-1.42, -0.38], [1.42, -0.38], [-1.42, 0.38], [1.42, 0.38]]) {
      put(legG, mat.steelMid, lx, 0.49, lz, 0, 0, 0, 1, b);
    }
    // vice: base + jaw blocks + spindle
    put(track(new THREE.BoxGeometry(0.16, 0.1, 0.22)), mat.steelDark, -1.05, 1.09, 0.18, 0, 0, 0, 1, b);
    put(track(new THREE.BoxGeometry(0.22, 0.18, 0.14)), mat.blueSteel, -1.05, 1.22, 0.18, 0, 0, 0, 1, b);
    put(track(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8)), mat.steelBright, -1.05, 1.2, 0.34, 0, Math.PI / 2, 0, 1, b);
    // stick welder box w/ dial + handle
    put(track(new THREE.BoxGeometry(0.52, 0.34, 0.4)), mat.redCab, 0.15, 1.21, -0.05, 0.15, 0, 0, 1, b);
    put(track(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12)), mat.steelBright, 0.15, 1.27, 0.17, 0, 1.42, 0, 1, b);
    // angle grinder on its side
    put(track(new THREE.CylinderGeometry(0.055, 0.065, 0.34, 10)), mat.blueSteel, 0.95, 1.09, 0.22, 0, 0, Math.PI / 2, 1, b);
    put(track(new THREE.CylinderGeometry(0.11, 0.11, 0.018, 14)), mat.steelBright, 1.18, 1.09, 0.22, 0, 0.2, Math.PI / 2, 1, b);
    // oil can + rag pile
    put(track(new THREE.CylinderGeometry(0.07, 0.08, 0.2, 10)), mat.olive, 1.32, 1.14, -0.18, 0, 0, 0, 1, b);
    put(track(new THREE.BoxGeometry(0.3, 0.05, 0.24)), mat.timberDark, -0.42, 1.07, -0.24, 0.5, 0, 0, 1, b);
    return b;
  }

  /** pegboard quad + backing plate flush against a wall. */
  function pegboard(
    x: number,
    y: number,
    z: number,
    ry: number,
    w = 2.5,
    h = 1.55,
    wallBayId = '',
  ): void {
    const tex = track(canvasTexture(makePegboardTexture(), { aniso }));
    const m = track(shadowMat(new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.7, metalness: 0.15,
      emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.05,
    })));
    const back = put(track(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.05)), mat.steelDark, x, y, z, ry, 0, 0, 1, group, false);
    back.castShadow = false;
    back.userData.wallBayId = wallBayId;
    const boardGeo = track(new THREE.PlaneGeometry(w, h));
    const board = new THREE.Mesh(boardGeo, m);
    board.position.set(x, y, z);
    board.rotation.y = ry;
    board.translateZ(0.032);
    board.userData.wallBayId = wallBayId;
    group.add(board);
  }

  function pegboardAt(wallBayId: string): void {
    const bay = garageWallTransform(wallBayId);
    pegboard(bay.x, bay.y, bay.z, bay.yaw, bay.width - 0.12, bay.height - 0.12, wallBayId);
  }

  /** rolling drawer toolbox (colorway via mats). */
  function toolChest(
    x: number,
    z: number,
    ry: number,
    bodyMat: THREE.Material,
    trimMat: THREE.Material,
    s = 1,
    parent: THREE.Object3D = group,
  ): THREE.Group {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    t.rotation.y = ry;
    t.scale.setScalar(s);
    parent.add(t);
    put(track(new THREE.BoxGeometry(1.15, 1.1, 0.62)), bodyMat, 0, 0.72, 0, 0, 0, 0, 1, t);
    put(track(new THREE.BoxGeometry(1.22, 0.06, 0.68)), trimMat, 0, 1.3, 0, 0, 0, 0, 1, t);
    put(track(new THREE.BoxGeometry(1.18, 0.08, 0.64)), trimMat, 0, 0.2, 0, 0, 0, 0, 1, t);
    const face = track(new THREE.BoxGeometry(1.02, 0.2, 0.04));
    const handle = track(new THREE.BoxGeometry(0.5, 0.028, 0.028));
    for (let i = 0; i < 4; i++) {
      put(face, bodyMat, 0, 1.16 - i * 0.25, 0.33, 0, 0, 0, 1, t);
      put(handle, mat.steelBright, 0, 1.2 - i * 0.25, 0.36, 0, 0, 0, 1, t, false);
    }
    for (const [wx, wz] of [[-0.46, -0.24], [0.46, -0.24], [-0.46, 0.24], [0.46, 0.24]]) {
      put(G.caster, mat.steelDark, wx, 0.07, wz, 0, 0, Math.PI / 2, 1, t, false);
    }
    return t;
  }

  /** wall sign: steel plate + stencil board (garageStage language). */
  function wallSign(
    text: string,
    x: number,
    y: number,
    z: number,
    ry: number,
    w = 2.0,
    h = 1.0,
    wallBayId = '',
    parent: THREE.Object3D = group,
  ): void {
    const tex = track(canvasTexture(makeSignTexture(rng, text), { aniso }));
    signTextures.push(tex);
    const m = track(shadowMat(new THREE.MeshStandardMaterial({
      map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.13,
      roughness: 0.6, metalness: 0.2,
    })));
    const back = put(track(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.05)), mat.steelDark,
      x, y, z, ry, 0, 0, 1, parent, false);
    back.userData.wallBayId = wallBayId;
    const board = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), m);
    board.position.set(x, y, z);
    board.rotation.y = ry;
    board.translateZ(0.032);
    board.userData.wallBayId = wallBayId;
    parent.add(board);
  }

  function wallSignAt(text: string, wallBayId: string): void {
    const bay = garageWallTransform(wallBayId);
    wallSign(text, bay.x, bay.y, bay.z, bay.yaw,
      bay.width - 0.12, bay.height - 0.12, wallBayId);
  }

  /** fire extinguisher on a wall bracket. */
  function extinguisher(
    x: number,
    y: number,
    z: number,
    ry: number,
    wallBayId = '',
  ): void {
    const e = new THREE.Group();
    e.position.set(x, y, z);
    e.rotation.y = ry;
    e.userData.wallBayId = wallBayId;
    group.add(e);
    put(track(new THREE.BoxGeometry(0.05, 0.4, 0.2)), mat.steelDark, -0.09, 0, 0, 0, 0, 0, 1, e, false);
    put(track(new THREE.CylinderGeometry(0.085, 0.085, 0.48, 12)), mat.extRed, 0, 0, 0, 0, 0, 0, 1, e);
    put(track(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8)), mat.steelBright, 0, 0.28, 0, 0, 0, 0, 1, e, false);
    put(track(new THREE.TorusGeometry(0.07, 0.014, 6, 12, Math.PI * 1.3)), mat.rubber, 0.06, 0.16, 0, 0, Math.PI / 2, 0.6, 1, e, false);
  }

  function extinguisherAt(wallBayId: string): void {
    const bay = garageWallTransform(wallBayId);
    extinguisher(bay.x, bay.y, bay.z, bay.yaw, wallBayId);
  }

  /** Bounds only meshes that are actually visible through their parent chain. */
  function visibleWorldBounds(root: THREE.Object3D): THREE.Box3 {
    const bounds = new THREE.Box3();
    const local = new THREE.Box3();
    root.updateMatrixWorld(true);
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (mesh.userData.authoredShadowProxy || material?.colorWrite === false) return;
      for (let owner: THREE.Object3D | null = mesh;
        owner && owner !== root.parent; owner = owner.parent) {
        if (!owner.visible) return;
      }
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) return;
      local.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      bounds.union(local);
    });
    return bounds;
  }

  function seatVisibleRoot(root: THREE.Object3D, supportY: number): void {
    const bounds = visibleWorldBounds(root);
    if (bounds.isEmpty()) return;
    root.position.y += supportY - bounds.min.y;
    root.updateMatrixWorld(true);
  }

  function markModernPart<T extends THREE.Object3D>(
    object: T,
    sourceVehicleId: string,
    component: string,
  ): T {
    object.userData.sourceVehicleId = sourceVehicleId;
    object.userData.sourceEra = 'modern';
    object.userData.component = component;
    object.name = `dressing_${sourceVehicleId}_${component}`;
    return object;
  }

  function halfTurnAuthoredServiceBay(
    firstChildIndex: number,
    bayId: 'abrams_welding' | 'rolled_k2',
    sourceVehicleId: 'm1a2' | 'k2',
  ): THREE.Group {
    const authoredChildren = legacyVerdantRoot.children.slice(firstChildIndex);
    const bayRoot = markModernPart(
      new THREE.Group(), sourceVehicleId, `${bayId}_service_bay`,
    );
    bayRoot.name = `garage_${bayId}_half_turn`;
    bayRoot.rotation.y = Math.PI;
    bayRoot.userData.layoutRotationRad = Math.PI;
    bayRoot.userData.swappedWith = bayId === 'abrams_welding' ? 'rolled_k2' : 'abrams_welding';
    for (const child of authoredChildren) bayRoot.add(child);
    legacyVerdantRoot.add(bayRoot);
    bayRoot.updateMatrix();
    return bayRoot;
  }

  async function createLegacyVisual(
    specId: 't90a_burlak' | 'm1a2' | 't90m' | 'k2',
    camoSeed: number,
  ): Promise<GarageWorkshopVisual> {
    if (!workshopFleet) throw new Error('garage workshop fleet was not prepared');
    const visual = await workshopFleet.createVisual(specId, {
      camoSeed,
      ...WORKSHOP_PRESENTATION_OPTIONS,
    });
    (group.userData.workshopTransferTimings ||= []).push({
      specId,
      ...visual.root.userData.workshopTransferTimings,
      finish: visual.root.userData.workshopFinish,
      textureCount: visual.root.userData.workshopTextureCount,
      materialCount: visual.root.userData.workshopMaterialCount,
      payload: visual.root.userData.workshopTransferPayload,
    });
    visual.resetForGaragePresentation?.();
    pendingTankReveal = visual.root;
    workshopVisuals.push(visual);
    return visual;
  }

  function placeGunRig(
    source: THREE.Object3D | undefined,
    sourceVehicleId: string,
    x: number,
    y: number,
    z: number,
    scale = 1,
  ): THREE.Group | null {
    if (!source) return null;
    const holder = markModernPart(new THREE.Group(), sourceVehicleId, 'gun_assembly');
    holder.position.set(x, y, z);
    holder.rotation.y = Math.PI / 2;
    holder.scale.setScalar(scale);
    const gun = source.clone(true);
    gun.position.set(0, 0, 0);
    gun.rotation.set(0, 0, 0);
    gun.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    holder.add(gun);
    legacyVerdantRoot.add(holder);
    return holder;
  }

  function serviceMachineGun(
    parent: THREE.Object3D,
    variant: 'm2' | 'dshk',
    shield: boolean,
    x: number,
    seed: number,
  ): THREE.Group {
    const sourceId = variant === 'dshk' ? 't90m' : 'm1a2';
    const component = variant === 'dshk' ? 'dshk_service_mount' : 'm2_service_mount';
    const mg = markModernPart(new THREE.Group(), sourceId, component);
    mg.position.set(x, 1.02, 0);
    mg.rotation.y = Math.PI / 2;
    mg.scale.setScalar(1.18);
    const parts = DECOR_KITS.aamg({ rng: mulberry32(seed), v: variant, shield, ring: false });
    for (const part of parts) {
      const material = part.mat === 'kit' ? mat.olive : mat.oily;
      const mesh = new THREE.Mesh(track(part.geo), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mg.add(mesh);
    }
    parent.add(mg);
    return mg;
  }

  let battleScreenMaterial: THREE.ShaderMaterial | null = null;
  let battleScreenMesh: THREE.Mesh | null = null;
  let battleScreenFallbackTexture: THREE.Texture | null = null;
  let battleScreenCurrentTexture: THREE.Texture | null = null;
  let battleScreenNextTexture: THREE.Texture | null = null;
  let battleScreenTimer: number | null = null;
  let battleScreenFrame: number | null = null;
  let battleScreenGeneration = 0;
  let battleScreenIndex = 0;
  let battleScreenLoading = false;
  let battleScreenTransitionStartedAt = 0;
  const battleScreenLoader = new THREE.TextureLoader();

  function loadBattleScreenTexture(index: number): Promise<THREE.Texture | null> {
    const shot = GARAGE_BATTLE_SCREEN_SHOTS[index];
    if (!shot) return Promise.resolve(null);
    const generation = battleScreenGeneration;
    return new Promise((resolve) => {
      battleScreenLoader.load(shot.img, (texture) => {
        if (generation !== battleScreenGeneration) {
          texture.dispose();
          resolve(null);
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(4, aniso);
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        resolve(texture);
      }, undefined, () => resolve(null));
    });
  }

  function scheduleBattleScreenAdvance(delay = BATTLE_SCREEN_HOLD_MS): void {
    if (battleScreenTimer !== null || battleScreenFrame !== null || battleScreenLoading
        || !battleScreenMaterial || !battleScreenCurrentTexture) return;
    battleScreenTimer = window.setTimeout(() => {
      battleScreenTimer = null;
      // The garage phase owner removes this whole root from the scene during
      // battle. Stop here instead of polling; onBeforeRender restarts the
      // archive on the first garage-return frame, preserving zero battle cost.
      if (!group.parent || !group.visible || document.hidden) return;
      void advanceBattleScreen();
    }, delay);
  }

  function finishBattleScreenTransition(nextIndex: number): void {
    if (!battleScreenMaterial || !battleScreenNextTexture) return;
    if (battleScreenCurrentTexture
        && battleScreenCurrentTexture !== battleScreenNextTexture) {
      battleScreenCurrentTexture.dispose();
    }
    battleScreenCurrentTexture = battleScreenNextTexture;
    battleScreenNextTexture = null;
    battleScreenIndex = nextIndex;
    battleScreenMaterial.uniforms.uImageA.value = battleScreenCurrentTexture;
    battleScreenMaterial.uniforms.uImageB.value = battleScreenCurrentTexture;
    battleScreenMaterial.uniforms.uTransition.value = 0;
    battleScreenFrame = null;
    group.userData.battleScreenResidentImageCount = 1;
    group.userData.battleScreenCurrentImage =
      GARAGE_BATTLE_SCREEN_SHOTS[battleScreenIndex]?.img || '';
    if (group.parent && group.visible && !document.hidden) scheduleBattleScreenAdvance();
  }

  function animateBattleScreenTransition(now: number, nextIndex: number): void {
    if (!battleScreenMaterial || !battleScreenNextTexture) {
      battleScreenFrame = null;
      return;
    }
    if (!group.parent || !group.visible || document.hidden) {
      finishBattleScreenTransition(nextIndex);
      return;
    }
    const elapsed = Math.max(0, now - battleScreenTransitionStartedAt);
    const linear = Math.min(1, elapsed / BATTLE_SCREEN_SCROLL_MS);
    battleScreenMaterial.uniforms.uTransition.value = linear * linear * (3 - 2 * linear);
    if (linear >= 1) {
      finishBattleScreenTransition(nextIndex);
      return;
    }
    battleScreenFrame = window.requestAnimationFrame((time) => {
      animateBattleScreenTransition(time, nextIndex);
    });
  }

  async function advanceBattleScreen(): Promise<void> {
    if (!battleScreenMaterial || !battleScreenCurrentTexture
        || battleScreenFrame !== null || battleScreenLoading
        || GARAGE_BATTLE_SCREEN_SHOTS.length < 2) return;
    const nextIndex = (battleScreenIndex + 1) % GARAGE_BATTLE_SCREEN_SHOTS.length;
    battleScreenLoading = true;
    const texture = await loadBattleScreenTexture(nextIndex);
    battleScreenLoading = false;
    if (!texture || !battleScreenMaterial) {
      if (group.parent && group.visible && !document.hidden) scheduleBattleScreenAdvance(1_500);
      return;
    }
    battleScreenNextTexture = texture;
    group.userData.battleScreenResidentImageCount = 2;
    battleScreenMaterial.uniforms.uImageB.value = texture;
    battleScreenTransitionStartedAt = performance.now();
    battleScreenFrame = window.requestAnimationFrame((time) => {
      animateBattleScreenTransition(time, nextIndex);
    });
  }

  async function startBattleScreen(fallback: THREE.Texture): Promise<void> {
    if (!battleScreenMaterial || !GARAGE_BATTLE_SCREEN_SHOTS.length) return;
    battleScreenCurrentTexture = fallback;
    battleScreenLoading = true;
    const texture = await loadBattleScreenTexture(0);
    battleScreenLoading = false;
    if (!texture || !battleScreenMaterial) return;
    battleScreenCurrentTexture = texture;
    battleScreenMaterial.uniforms.uImageA.value = texture;
    battleScreenMaterial.uniforms.uImageB.value = texture;
    group.userData.battleScreenResidentImageCount = 1;
    group.userData.battleScreenCurrentImage = GARAGE_BATTLE_SCREEN_SHOTS[0].img;
    scheduleBattleScreenAdvance();
  }

  function setVariant(variantId: string): string {
    currentVariant = getGarageVariant(variantId);
    group.userData.garageVariantId = currentVariant.id;
    group.userData.garageMapId = currentVariant.mapId;
    mat.safety.color.setHex(currentVariant.accent);
    bayFill.color.setHex(currentVariant.lightTint);
    const [layoutX, layoutZ, layoutYaw] = getGarageWorkshopLayoutPose(currentVariant);
    legacyVerdantRoot.position.set(layoutX, 0, layoutZ);
    legacyVerdantRoot.rotation.y = layoutYaw;
    legacyVerdantRoot.updateMatrix();
    const isVerdant = currentVariant.id === 'verdant_motor_pool';
    // One demand-loaded four-bay exhibit is shared by every Garage. The four
    // diagonally opposed service stations already fill all quadrants, while
    // this tiny layout pose shifts/rotates the complete set against each
    // environment's landmark. Verdant alone keeps wall-mounted interior
    // clutter because only its enclosed shell provides real supporting walls;
    // the freestanding archive display and all four authored service bays are
    // part of this shared root and remain visible in every Garage.
    legacyVerdantRoot.visible = true;
    verdantInteriorRoot.visible = isVerdant;
    group.userData.battleScreenVisible = true;
    if (battleScreenCurrentTexture) scheduleBattleScreenAdvance();
    group.userData.verdantOriginalVisible = legacyVerdantRoot.children.length > 0;
    group.userData.workshopTriangleCount = group.userData.verdantOriginalTriangleCount || 0;
    group.userData.activeWorkshopTriangleCount =
      group.userData.verdantOriginalTriangleCount || 0;
    group.userData.workshopExhibitCount = 4;
    group.userData.sharedMaintenanceBayCount = 4;
    group.userData.sharedMaintenanceBayIds = [...SHARED_MAINTENANCE_BAY_IDS];
    group.userData.sharedMaintenanceBayQuadrants = [...SHARED_MAINTENANCE_BAY_QUADRANTS];
    group.userData.workshopOrbitCoverageDegrees = 360;
    group.userData.workshopSceneMode = isVerdant
      ? 'verdant-workshop' : 'environment-service-exhibits';
    return currentVariant.id;
  }

  function prepareK2TeardownHull(
    tank: THREE.Object3D,
    hull: THREE.Object3D | undefined,
    turret: THREE.Object3D | undefined,
  ): void {
    if (turret) turret.visible = false;
    if (hull) {
      const removedGear: THREE.Object3D[] = [];
      hull.traverse((object) => {
        if (object.userData.runningGear
            || /^(gear|hullRunningGear|k2_track_rubber)/.test(object.name || '')) {
          removedGear.push(object);
        }
      });
      const hiddenGearOwner = new THREE.Group();
      hiddenGearOwner.name = 'verdant_original_removed_k2_running_gear';
      hiddenGearOwner.visible = false;
      tank.add(hiddenGearOwner);
      for (const object of removedGear) hiddenGearOwner.attach(object);
    }
    tank.traverse((object) => {
      if (object.userData.authoredShadowProxy) object.visible = false;
    });
  }

  function addK2RoadWheelStacks(
    tires: THREE.Mesh | undefined,
    discs: THREE.Mesh | undefined,
  ): void {
    if (!tires?.geometry || !discs?.geometry) return;
    if (!tires.geometry.boundingBox) tires.geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    tires.geometry.boundingBox?.getSize(size);
    const rise = Math.max(0.14, size.x * 0.92);
    const wheelPositions: Array<readonly [number, number, number]> = [];
    for (const [x, z, count] of [[-21.25, -8.65, 4], [-20.20, -9.75, 4]] as const) {
      for (let index = 0; index < count; index++) {
        wheelPositions.push([x, 0.10 + rise * (index + 0.5), z]);
      }
    }
    const wheelTires = markModernPart(
      new THREE.InstancedMesh(tires.geometry, tires.material, wheelPositions.length),
      'k2',
      'road_wheel_tires',
    );
    const wheelDiscs = markModernPart(
      new THREE.InstancedMesh(discs.geometry, discs.material, wheelPositions.length),
      'k2',
      'road_wheel_discs',
    );
    const wheelRotation = new THREE.Euler(0, 0, Math.PI / 2);
    const wheelMatrix = new THREE.Matrix4();
    wheelPositions.forEach(([x, y, z], index) => {
      wheelMatrix.makeRotationFromEuler(wheelRotation).setPosition(x, y, z);
      wheelTires.setMatrixAt(index, wheelMatrix);
      wheelDiscs.setMatrixAt(index, wheelMatrix);
    });
    wheelTires.instanceMatrix.needsUpdate = true;
    wheelDiscs.instanceMatrix.needsUpdate = true;
    wheelTires.castShadow = wheelTires.receiveShadow = true;
    wheelDiscs.castShadow = wheelDiscs.receiveShadow = true;
    legacyVerdantRoot.add(wheelTires, wheelDiscs);
    track(wheelTires);
    track(wheelDiscs);
  }

  function addK2TrackShoePallet(pads: THREE.Mesh | undefined): void {
    if (!pads?.geometry) return;
    const pallet = markModernPart(new THREE.Group(), 'k2', 'track_shoe_pallet');
    pallet.position.set(-21.15, 0, -13.45);
    pallet.rotation.y = -0.12;
    legacyVerdantRoot.add(pallet);
    put(track(new THREE.BoxGeometry(1.75, 0.11, 1.15)), mat.timberDark,
      0, 0.06, 0, 0, 0, 0, 1, pallet);
    const shoes = markModernPart(
      new THREE.InstancedMesh(pads.geometry, pads.material, 8),
      'k2',
      'track_shoes',
    );
    const shoeRotation = new THREE.Euler();
    const shoeMatrix = new THREE.Matrix4();
    let shoeIndex = 0;
    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < 2; column++) {
        shoeRotation.set(Math.PI, column % 2 ? 0.035 : -0.035, 0);
        shoeMatrix.makeRotationFromEuler(shoeRotation).setPosition(
          -0.38 + column * 0.76,
          0.19,
          -0.35 + row * 0.23,
        );
        shoes.setMatrixAt(shoeIndex++, shoeMatrix);
      }
    }
    shoes.instanceMatrix.needsUpdate = true;
    shoes.castShadow = shoes.receiveShadow = true;
    pallet.add(shoes);
    track(shoes);
  }

  function addCoreShellRack(): void {
    const rack = new THREE.Group();
    rack.position.set(22.1, 0, 1.8);
    rack.rotation.y = -Math.PI / 2;
    group.add(rack);
    put(track(new THREE.BoxGeometry(2.3, 0.08, 0.8)), mat.steelMid,
      0, 0.06, 0, 0, 0, 0, 1, rack);
    put(track(new THREE.BoxGeometry(2.3, 0.06, 0.7)), mat.steelMid,
      0, 0.62, 0, 0, 0, 0, 1, rack);
    const post = track(new THREE.BoxGeometry(0.07, 1.25, 0.07));
    for (const px of [-1.1, 1.1]) {
      put(post, mat.safety, px, 0.62, -0.3, 0, 0, 0, 1, rack);
      put(post, mat.safety, px, 0.62, 0.3, 0, 0, 0, 1, rack);
    }
    const bodies = new THREE.InstancedMesh(G.shellBody, mat.olive, 12);
    const tips = new THREE.InstancedMesh(G.shellTip, mat.brass, 12);
    const matrix = new THREE.Matrix4();
    let index = 0;
    for (const rackZ of [-0.18, 0.18]) {
      for (let column = 0; column < 6; column++) {
        const shellX = -0.95 + column * 0.38 + (rng() - 0.5) * 0.05;
        matrix.makeTranslation(shellX, 0.46, rackZ);
        bodies.setMatrixAt(index, matrix);
        matrix.makeTranslation(shellX, 0.93, rackZ);
        tips.setMatrixAt(index, matrix);
        index++;
      }
    }
    bodies.castShadow = tips.castShadow = true;
    rack.add(bodies, tips);
    track(bodies);
    track(tips);
    // Two loose rounds lie on a pallet beside the rack.
    put(track(new THREE.BoxGeometry(1.1, 0.1, 0.8)), mat.timberDark,
      0.2, 0.05, 0.95, 0.2, 0, 0, 1, rack);
    put(G.shellBody, mat.olive,
      0.05, 0.16, 0.95, 0.2, 0, Math.PI / 2, 1, rack);
    put(G.shellBody, mat.olive,
      0.35, 0.16, 1.02, 0.35, 0, Math.PI / 2, 1, rack);
  }

  const chunks: Array<() => void | Promise<void>> = [];

  // ==========================================================================
  // CHUNK 1 — static workshop clutter on every wall + floor decals
  // ==========================================================================
  chunks.push(function buildCore() {
    // One freestanding field-record monitor scrolls through the canonical
    // battle archive in every Garage. It is centered on the hero's local -Z
    // axis, so the tank rear points physically toward it while the camera sees
    // the glacis. A shader moves two resident textures; it never uploads a
    // canvas every frame, and the timer sleeps completely while the garage is
    // detached for battle.
    const screenRoot = new THREE.Group();
    screenRoot.name = 'garage_battle_archive_monitor';
    screenRoot.position.set(0, 4.15, -18.25);
    screenRoot.rotation.y = 0;
    screenRoot.userData.mountMode = 'freestanding-shared';
    legacyVerdantRoot.add(screenRoot);

    put(track(new THREE.BoxGeometry(6.8, 3.82, 0.22)), mat.steelDark,
      0, 0, 0, 0, 0, 0, 1, screenRoot, false);
    put(track(new THREE.BoxGeometry(6.26, 3.50, 0.08)), mat.rubber,
      -0.22, 0, 0.13, 0, 0, 0, 1, screenRoot, false);
    put(track(new THREE.BoxGeometry(2.35, 0.14, 0.07)), mat.safety,
      -1.65, 1.74, 0.17, 0, 0, 0, 1, screenRoot, false);
    put(track(new THREE.BoxGeometry(0.42, 2.92, 0.10)), mat.steelMid,
      3.04, 0, 0.14, 0, 0, 0, 1, screenRoot, false);
    for (const y of [0.95, 0.38, -0.19, -0.76]) {
      put(track(new THREE.BoxGeometry(0.22, 0.08, 0.05)), mat.steelBright,
        3.04, y, 0.22, 0, 0, 0, 1, screenRoot, false);
    }
    const statusLedMaterial = track(new THREE.MeshBasicMaterial({ color: 0x78d891 }));
    for (const y of [1.38, -1.25]) {
      put(track(new THREE.SphereGeometry(0.055, 8, 6)), statusLedMaterial,
        3.04, y, 0.22, 0, 0, 0, 1, screenRoot, false);
    }
    // Connected legs, crossbar, feet and rear braces make this an honest
    // outdoor installation instead of a wall panel floating in scene packs.
    const displayPostGeometry = track(new THREE.BoxGeometry(0.18, 2.45, 0.18));
    for (const x of [-2.65, 2.65]) {
      put(displayPostGeometry, mat.steelMid,
        x, -3.04, -0.02, 0, 0, 0, 1, screenRoot);
      put(track(new THREE.BoxGeometry(1.15, 0.14, 1.05)), mat.steelDark,
        x, -4.08, -0.02, 0, 0, 0, 1, screenRoot);
      const brace = put(track(new THREE.BoxGeometry(0.13, 2.55, 0.13)), mat.steelDark,
        x, -3.05, -0.48, 0, 0.38, 0, 1, screenRoot);
      brace.castShadow = true;
    }
    put(track(new THREE.BoxGeometry(5.55, 0.16, 0.20)), mat.steelMid,
      0, -1.86, -0.02, 0, 0, 0, 1, screenRoot);

    const fallbackTexture = track(new THREE.DataTexture(
      new Uint8Array([10, 20, 18, 255]), 1, 1, THREE.RGBAFormat,
    ));
    battleScreenFallbackTexture = fallbackTexture;
    fallbackTexture.colorSpace = THREE.SRGBColorSpace;
    fallbackTexture.needsUpdate = true;
    battleScreenMaterial = track(new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: {
        uImageA: { value: fallbackTexture },
        uImageB: { value: fallbackTexture },
        uTransition: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 curved = position;
          vec2 centered = uv * 2.0 - 1.0;
          curved.z += (1.0 - dot(centered, centered) * 0.45) * 0.065;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(curved, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uImageA;
        uniform sampler2D uImageB;
        uniform float uTransition;
        uniform float uTime;
        varying vec2 vUv;

        vec2 bendUv(vec2 uv) {
          vec2 centered = uv * 2.0 - 1.0;
          centered *= 1.0 + dot(centered, centered) * 0.035;
          return centered * 0.5 + 0.5;
        }

        vec3 screenSample(sampler2D image, vec2 uv) {
          float inside = step(0.0, uv.x) * step(uv.x, 1.0)
            * step(0.0, uv.y) * step(uv.y, 1.0);
          return texture2D(image, clamp(uv, 0.001, 0.999)).rgb * inside;
        }

        void main() {
          vec2 uv = bendUv(vUv);
          vec2 outgoingUv = uv + vec2(0.0, uTransition);
          vec2 incomingUv = uv + vec2(0.0, uTransition - 1.0);
          vec3 color = screenSample(uImageA, outgoingUv)
            + screenSample(uImageB, incomingUv);

          float scanline = 0.92 + 0.08 * sin(gl_FragCoord.y * 3.14159);
          float grille = 0.975 + 0.025 * sin(gl_FragCoord.x * 2.0944);
          float flicker = 0.992 + 0.008 * sin(uTime * 33.0);
          float rollY = fract(vUv.y + uTime * 0.055);
          float rollDistance = (rollY - 0.5) * 15.0;
          float rollingGlow = exp(-(rollDistance * rollDistance)) * 0.06;
          vec2 centered = vUv * 2.0 - 1.0;
          float vignette = 1.0 - smoothstep(0.45, 1.45, dot(centered, centered)) * 0.48;
          color *= scanline * grille * flicker * vignette;
          color += color * rollingGlow;
          color *= vec3(0.95, 1.02, 0.98);
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
    }));
    const screenGeometry = track(new THREE.PlaneGeometry(5.70, 3.20, 24, 14));
    battleScreenMesh = put(screenGeometry, battleScreenMaterial,
      -0.22, 0, 0.20, 0, 0, 0, 1, screenRoot, false);
    battleScreenMesh.name = 'garage_battle_archive_screen';
    battleScreenMesh.userData.keepWorkshopMesh = true;
    battleScreenMesh.userData.mountMode = 'freestanding-shared';
    battleScreenMesh.onBeforeRender = () => {
      if (!battleScreenMaterial) return;
      battleScreenMaterial.uniforms.uTime.value = performance.now() * 0.001;
      if (battleScreenTimer === null && battleScreenFrame === null
          && group.userData.battleScreenCurrentImage) scheduleBattleScreenAdvance();
    };
    group.userData.mapImageCount = 0;
    group.userData.battleScreenMode = 'crt-scroll-slideshow';
    group.userData.battleScreenWallBay = 'freestanding-shared';
    group.userData.battleScreenImageCount = GARAGE_BATTLE_SCREEN_SHOTS.length;
    group.userData.battleScreenResidentImageLimit = 2;
    group.userData.battleScreenResidentImageCount = 0;
    void startBattleScreen(fallbackTexture);
    const interiorChildrenStart = group.children.length;
    // --- EAST WALL (left of frame from the hero cam) ------------------------
    workbench(21.95, -7, -Math.PI / 2);
    pegboardAt('east_tools');
    workLamp(21.6, -7);
    // steel locker pair
    for (const lz of [-11.9, -10.9]) {
      put(track(new THREE.BoxGeometry(0.55, 1.9, 0.95)), mat.olive, 22.35, 0.95, lz, 0, 0, 0, 1);
      put(track(new THREE.BoxGeometry(0.04, 1.7, 0.8)), mat.steelDark, 22.05, 0.95, lz, 0, 0, 0, 1, group, false);
    }
    // Shell rack: frame + two rows of standing rounds (instanced).
    addCoreShellRack();
    wallSignAt('BAY 02', 'east_bay_02');
    extinguisherAt('east_extinguisher');
    // oil drum cluster (one with a hand pump), plus a tipped drum
    for (const [dx, dz, c] of [
      [21.3, 7.6, mat.redCabDark], [20.5, 8.2, mat.blueSteel], [21.4, 8.7, mat.olive],
    ] as readonly [number, number, THREE.Material][]) {
      put(G.drum, c, dx, 0.58, dz, rng() * Math.PI);
    }
    put(track(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8)), mat.steelBright, 21.3, 1.35, 7.6, 0, 0, 0, 1, group, false);
    put(G.drum, mat.olive, 20.2, 0.42, 10.1, 0.4, 0, Math.PI / 2); // tipped
    wallSignAt('FLAMMABLE', 'east_flammable');

    // --- SOUTH WALL (right of frame from the hero cam) ----------------------
    // Timber X-trestles for the real T-90M gun rig built in the modern
    // component chunk below.
    {
      const tre = track(new THREE.BoxGeometry(0.1, 1.15, 0.12));
      for (const tx of [4.2, 7.6]) {
        for (const lean of [-0.42, 0.42]) {
          put(tre, mat.timber, tx, 0.52, 21.3, 0, 0, lean);
          put(tre, mat.timber, tx, 0.52, 21.7, 0, 0, -lean);
        }
        put(track(new THREE.BoxGeometry(0.12, 0.1, 0.7)), mat.timberDark, tx, 0.95, 21.5, 0, 0, 0, 1);
      }
      workLamp(5.9, 20.7, 5);
    }
    // Fleet-exact armor assemblies arrive with the later streamed component bay.
    // big workshop wall fan (static) + guard
    {
      const f = new THREE.Group();
      const fanBay = garageWallTransform('south_fan');
      f.position.set(fanBay.x, fanBay.y, fanBay.z - 0.14);
      f.userData.wallBayId = fanBay.id;
      group.add(f);
      put(track(new THREE.BoxGeometry(0.5, 0.5, 0.3)), mat.steelDark, 0, 0, 0.22, 0, 0, 0, 1, f);
      put(track(new THREE.TorusGeometry(0.95, 0.06, 8, 26)), mat.steelMid, 0, 0, 0, 0, 0, 0, 1, f);
      put(track(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 12)), mat.steelDark, 0, 0, 0, Math.PI / 2, 0, 0, 1, f);
      const bladeG = track(new THREE.BoxGeometry(0.26, 0.72, 0.035));
      for (let k = 0; k < 4; k++) {
        const blade = put(bladeG, mat.steelMid, 0, 0, 0.02, 0, 0, (k * Math.PI) / 2 + 0.5, 1, f);
        blade.translateY(0.48);
        blade.rotation.x = 0.28; // blade pitch
      }
      const barG = track(new THREE.BoxGeometry(0.025, 1.9, 0.025));
      for (let k = 0; k < 4; k++) put(barG, mat.steelDark, 0, 0, -0.14, 0, 0, (k * Math.PI) / 4, 1, f, false);
    }
    wallSignAt('KEEP CLEAR', 'south_keep_clear');
    // welding cart: gas bottles + frame + hose + FAINT ARC GLOW (emissive
    // + additive sprite only — no live light)
    {
      const wc = new THREE.Group();
      wc.position.set(11.4, 0, 19.9);
      wc.rotation.y = -0.7;
      group.add(wc);
      put(track(new THREE.BoxGeometry(0.8, 0.06, 0.5)), mat.steelDark, 0, 0.12, 0, 0, 0, 0, 1, wc);
      put(track(new THREE.BoxGeometry(0.06, 1.15, 0.06)), mat.steelDark, -0.34, 0.7, 0, 0, 0, 0, 1, wc);
      put(track(new THREE.CylinderGeometry(0.13, 0.13, 1.25, 12)), mat.bottleGreen, -0.15, 0.78, 0, 0, 0, 0, 1, wc);
      put(track(new THREE.CylinderGeometry(0.115, 0.115, 1.05, 12)), mat.bottleBlue, 0.18, 0.68, 0.02, 0, 0, 0, 1, wc);
      put(track(new THREE.CylinderGeometry(0.045, 0.13, 0.12, 10)), mat.bottleGreen, -0.15, 1.46, 0, 0, 0, 0, 1, wc, false);
      put(track(new THREE.CylinderGeometry(0.04, 0.115, 0.1, 10)), mat.bottleBlue, 0.18, 1.26, 0.02, 0, 0, 0, 1, wc, false);
      put(track(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8)), mat.brass, -0.15, 1.56, 0, 0, 0, 0.5, 1, wc, false);
      for (const [wx2, wz2] of [[-0.3, 0.28], [0.3, 0.28]]) {
        put(track(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 12)), mat.rubber, wx2, 0.11, wz2, 0, 0, Math.PI / 2, 1, wc);
      }
      // hose coil + stinger hanging off the frame
      put(track(new THREE.TorusGeometry(0.16, 0.022, 6, 16)), mat.rubber, -0.36, 0.95, 0.05, 0, Math.PI / 2, 0, 1, wc, false);
      // faint hot-metal glow where the torch was parked: emissive tip + halo
      const tip = put(track(new THREE.SphereGeometry(0.03, 8, 6)),
        track(new THREE.MeshBasicMaterial({ color: 0xffd9a0 })), 0.42, 0.2, 0.3, 0, 0, 0, 1, wc, false);
      tip.castShadow = false;
      const glowMat = track(new THREE.SpriteMaterial({
        map: track(canvasTexture(makePoolTexture('rgba(255,196,120,0.55)', 'rgba(255,150,60,0.16)'))),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const spark = new THREE.Sprite(glowMat);
      spark.scale.setScalar(0.85);
      spark.position.set(0.42, 0.22, 0.3);
      wc.add(spark);
    }

    // --- WEST + NORTH walls (seen when the free orbit swings behind) --------
    pegboardAt('west_tools');
    extinguisherAt('west_extinguisher');
    // jerrycan row (one tipped)
    {
      const cans = new THREE.InstancedMesh(G.jerrycan, mat.olive, 6);
      const M4 = new THREE.Matrix4();
      const E = new THREE.Euler();
      for (let i = 0; i < 6; i++) {
        if (i === 5) {
          E.set(Math.PI / 2, 0.5, 0);
          M4.makeRotationFromEuler(E).setPosition(-21.0, 0.11, -6.3);
        } else {
          E.set(0, (rng() - 0.5) * 0.4, 0);
          M4.makeRotationFromEuler(E).setPosition(-21.6 + (i % 3) * 0.42, 0.25 + Math.floor(i / 3) * 0.52, -8.4 + Math.floor(i / 3) * 0.05);
        }
        cans.setMatrixAt(i, M4);
      }
      cans.castShadow = true;
      group.add(cans);
      track(cans);
    }
    // cable reels: one upright, one flat with a coil
    {
      const discG = track(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 18));
      const coreG = track(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 14));
      const up = new THREE.Group();
      up.position.set(-21.2, 0.62, 10.3);
      up.rotation.z = Math.PI / 2;
      group.add(up);
      put(discG, mat.timber, 0, -0.29, 0, 0, 0, 0, 1, up);
      put(discG, mat.timber, 0, 0.29, 0, 0, 0, 0, 1, up);
      put(coreG, mat.timberDark, 0, 0, 0, 0, 0, 0, 1, up);
      const flat = new THREE.Group();
      flat.position.set(-20.4, 0.08, 12.1);
      group.add(flat);
      put(discG, mat.timber, 0, 0, 0, 0, 0, 0, 1, flat);
      put(track(new THREE.TorusGeometry(0.34, 0.05, 8, 18)), mat.rubber, 0, 0.1, 0, 0, 0, 0, 1, flat, false);
    }
    // stacked drums in the SW corner (2-tier on a board)
    {
      for (const [dx, dz, c] of [
        [-19.4, 19.3, mat.redCabDark], [-18.5, 19.7, mat.olive], [-19.9, 20.2, mat.blueSteel],
      ] as readonly [number, number, THREE.Material][]) {
        put(G.drum, c, dx, 0.58, dz, rng() * 2);
      }
      put(track(new THREE.BoxGeometry(1.9, 0.06, 1.1)), mat.timberDark, -19.2, 1.19, 19.7, 0.3);
      put(G.drum, mat.steelMid, -19.4, 1.8, 19.6, 1.2);
      put(G.drum, mat.redCabDark, -18.9, 1.8, 20.0, 2.2);
    }
    // engine hoist (shop crane) + hanging engine block, SW
    {
      const eh = new THREE.Group();
      eh.position.set(-14.4, 0, 20.4);
      eh.rotation.y = -2.55;
      group.add(eh);
      const legG = track(new THREE.BoxGeometry(0.09, 0.14, 1.7));
      put(legG, mat.safety, -0.45, 0.07, 0.55, 0, 0, 0, 1, eh);
      put(legG, mat.safety, 0.45, 0.07, 0.55, 0, 0, 0, 1, eh);
      put(track(new THREE.BoxGeometry(1.0, 0.14, 0.12)), mat.safety, 0, 0.07, -0.28, 0, 0, 0, 1, eh);
      put(track(new THREE.BoxGeometry(0.12, 1.7, 0.12)), mat.safety, 0, 0.92, -0.28, 0, 0, 0, 1, eh);
      const boom = put(track(new THREE.BoxGeometry(0.1, 0.14, 1.9)), mat.safety, 0, 1.86, 0.55, 0, 0, 0, 1, eh);
      boom.rotation.x = 0.18;
      put(track(new THREE.CylinderGeometry(0.045, 0.045, 0.9, 8)), mat.steelBright, 0, 1.25, 0.28, 0.62, 0, 0, 1, eh); // ram
      // chain + engine block (block + head + pulley)
      put(track(new THREE.CylinderGeometry(0.016, 0.016, 0.55, 6)), mat.steelDark, 0, 1.42, 1.38, 0, 0, 0, 1, eh, false);
      const eng = new THREE.Group();
      eng.position.set(0, 0.85, 1.38);
      eng.rotation.y = 0.4;
      eh.add(eng);
      put(track(new THREE.BoxGeometry(0.62, 0.5, 0.45)), mat.oily, 0, 0, 0, 0, 0, 0, 1, eng);
      put(track(new THREE.BoxGeometry(0.56, 0.16, 0.3)), mat.steelMid, 0, 0.33, 0, 0, 0, 0.06, 1, eng);
      put(track(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12)), mat.steelDark, 0, -0.05, 0.28, Math.PI / 2, 0, 0, 1, eng);
      // drip tray under it
      put(track(new THREE.BoxGeometry(0.8, 0.05, 0.6)), mat.steelDark, 0, 0.03, 1.38, 0, 0, 0, 1, eh);
    }
    // NORTH wall: second bench + red chest + engine on pallet + lamp
    workbench(3.2, -21.85, 0);
    pegboardAt('north_tools');
    toolChest(6.6, -21.4, 0.15, mat.redCab, mat.redCabDark);
    workLamp(3.2, -21.2);
    {
      put(track(new THREE.BoxGeometry(1.2, 0.11, 0.95)), mat.timberDark, 10.3, 0.06, -20.9, -0.15);
      const eng = new THREE.Group();
      eng.position.set(10.3, 0.42, -20.9);
      eng.rotation.y = 0.9;
      group.add(eng);
      put(track(new THREE.BoxGeometry(0.66, 0.52, 0.48)), mat.oily, 0, 0, 0, 0, 0, 0, 1, eng);
      put(track(new THREE.BoxGeometry(0.6, 0.17, 0.32)), mat.steelMid, 0, 0.34, 0, 0, 0, -0.05, 1, eng);
    }
    // The NW floor band stays open for the real K2 side-hull teardown in the
    // modern component chunk.

    // --- FLOOR: bay outlines, oil, skids, painted spur lane ------------------
    const outlineMat = track(new THREE.MeshBasicMaterial({
      map: track(canvasTexture(makeBayOutlineTexture())), transparent: true, depthWrite: false,
    }));
    for (const [bx, bz, ry2, w, h] of [[16.4, -13.6, -0.55, 9.4, 7.2], [15.3, 16.2, -2.03, 9.6, 7.4]]) {
      const q = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1)), outlineMat);
      q.rotation.set(-Math.PI / 2, 0, ry2);
      q.scale.set(w, h, 1);
      q.position.set(bx, 0.024, bz);
      group.add(q);
    }
    for (const [sx, sz, ss] of [[17.2, -13.2, 3.2], [15.6, 15.8, 3.6], [21.3, -6.4, 2.0], [11.6, 19.2, 1.7], [-14.2, 19.8, 2.2], [3.4, -20.7, 1.9]]) {
      const stain = new THREE.Mesh(track(new THREE.PlaneGeometry(ss, ss)), stainMat);
      stain.rotation.set(-Math.PI / 2, 0, rng() * Math.PI);
      stain.position.set(sx, 0.021 + rng() * 0.004, sz);
      group.add(stain);
    }
    const skidMat = track(new THREE.MeshBasicMaterial({
      map: track(canvasTexture(makeSkidTexture())), transparent: true, depthWrite: false,
    }));
    for (const [kx, kz, kry, kw] of [[8.2, 14.6, -1.15, 9], [12.8, -8.4, 2.5, 8]]) {
      const skid = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 0.5)), skidMat);
      skid.rotation.set(-Math.PI / 2, 0, kry);
      skid.scale.set(kw, kw, 1);
      skid.position.set(kx, 0.027, kz);
      group.add(skid);
    }
    // painted guide spur splitting from the center lane toward bay A
    {
      const laneC = document.createElement('canvas');
      laneC.width = 256; laneC.height = 32;
      const lg2 = laneC.getContext('2d')!;
      lg2.strokeStyle = 'rgba(196,164,44,0.42)';
      lg2.lineWidth = 12;
      lg2.setLineDash([30, 20]);
      lg2.beginPath();
      lg2.moveTo(0, 16); lg2.lineTo(256, 16);
      lg2.stroke();
      const laneMat = track(new THREE.MeshBasicMaterial({
        map: track(canvasTexture(laneC)), transparent: true, depthWrite: false,
      }));
      const lane = new THREE.Mesh(track(new THREE.PlaneGeometry(11, 1.2)), laneMat);
      lane.rotation.set(-Math.PI / 2, 0, 0.62);
      lane.position.set(11.2, 0.023, -6.8);
      group.add(lane);
    }
    // The scrolling battle display is already owned by the shared workshop
    // root. Everything authored after it is wall/floor clutter
    // from the original Verdant hangar and must disappear with that interior.
    for (const child of group.children.slice(interiorChildrenStart)) {
      verdantInteriorRoot.add(child);
    }
  });

  // ==========================================================================
  // CHUNK 2 — ORIGINAL VERDANT BAY A: T-90A Burlak on jack stands with its
  // turret lifted under the gantry. Positions are the pre-overhaul coordinates.
  // ==========================================================================
  chunks.push(async function buildOriginalVerdantBurlakBay() {
    const visual = await createLegacyVisual('t90a_burlak', 777);
    const tank = markModernPart(visual.root, 't90a_burlak', 'gantry_repair_vehicle');
    tank.name = 'dressing_tank_a';
    tank.rotation.y = -0.55;
    tank.position.set(17.8, 0.42, -15.5);
    legacyVerdantRoot.add(tank);
    const turret = tank.getObjectByName('rig_turret');
    if (turret) {
      turret.position.y += 0.55;
      turret.rotation.y += 0.14;
      turret.rotation.z += 0.025;
    }

    const standCone = track(new THREE.CylinderGeometry(0.14, 0.3, 0.42, 4));
    const standPost = track(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8));
    const holder = new THREE.Group();
    holder.name = 'verdant_original_jack_stands';
    holder.rotation.y = -0.55;
    holder.position.set(17.8, 0, -15.5);
    legacyVerdantRoot.add(holder);
    for (const [ox, oz] of [[-1.15, -2.2], [1.15, -2.2], [-1.15, 2.2], [1.15, 2.2]]) {
      const stand = new THREE.Group();
      stand.position.set(ox, 0, oz);
      stand.rotation.y = 0.4;
      holder.add(stand);
      put(standCone, mat.safety, 0, 0.21, 0, 0, 0, 0, 1, stand);
      put(standPost, mat.steelBright, 0, 0.5, 0, 0, 0, 0, 1, stand);
      put(track(new THREE.BoxGeometry(0.22, 0.06, 0.14)), mat.steelDark,
        0, 0.62, 0, 0, 0, 0, 1, stand);
    }

    const gantry = new THREE.Group();
    gantry.name = 'verdant_original_turret_gantry';
    gantry.position.set(17.8, 0, -15.5);
    gantry.rotation.y = -0.55;
    legacyVerdantRoot.add(gantry);
    const hazardTexture = track(canvasTexture(makeHazardTexture(), { aniso, repeat: [4, 1] }));
    const beamMaterial = track(shadowMat(new THREE.MeshStandardMaterial({
      map: hazardTexture, roughness: 0.6, metalness: 0.3,
    })));
    const gantrySpec = VERDANT_GANTRY;
    const legGeometry = track(new THREE.BoxGeometry(
      gantrySpec.postWidth, gantrySpec.postHeight, gantrySpec.postWidth,
    ));
    for (const [lx, lz] of [
      [-gantrySpec.postX, -gantrySpec.endZ], [gantrySpec.postX, -gantrySpec.endZ],
      [-gantrySpec.postX, gantrySpec.endZ], [gantrySpec.postX, gantrySpec.endZ],
    ]) {
      const leg = put(legGeometry, mat.safety, lx, gantrySpec.postHeight / 2, lz,
        0, 0, lx > 0 ? -0.06 : 0.06, 1, gantry);
      leg.name = 'verdant_gantry_connected_post';
      const foot = put(track(new THREE.BoxGeometry(
        0.48, gantrySpec.footThickness, 0.48,
      )), mat.steelDark, lx, gantrySpec.footThickness / 2, lz,
      0, 0, 0, 1, gantry);
      foot.name = 'verdant_gantry_ground_foot';
    }
    const braceGeometry = track(new THREE.BoxGeometry(0.09, 2.6, 0.09));
    for (const lz of [-gantrySpec.endZ, gantrySpec.endZ]) {
      put(braceGeometry, mat.steelMid, -1.2, 1.3, lz, 0, 0, 1.08, 1, gantry);
      put(braceGeometry, mat.steelMid, 1.2, 1.3, lz, 0, 0, -1.08, 1, gantry);
    }
    const crossheadGeometry = track(new THREE.BoxGeometry(
      gantrySpec.crossheadWidth, gantrySpec.crossheadHeight, 0.26,
    ));
    for (const lz of [-gantrySpec.endZ, gantrySpec.endZ]) {
      const crosshead = put(crossheadGeometry, mat.steelMid,
        0, gantrySpec.crossheadY, lz, 0, 0, 0, 1, gantry);
      crosshead.name = 'verdant_gantry_connected_crosshead';
    }
    const sideRailGeometry = track(new THREE.BoxGeometry(
      0.22, gantrySpec.sideRailHeight, gantrySpec.sideRailLength,
    ));
    for (const lx of [-gantrySpec.postX, gantrySpec.postX]) {
      const sideRail = put(sideRailGeometry, mat.steelMid,
        lx, gantrySpec.sideRailY, 0, 0, 0, 0, 1, gantry);
      sideRail.name = 'verdant_gantry_connected_side_rail';
    }
    const bridge = put(track(new THREE.BoxGeometry(
      0.26, gantrySpec.bridgeHeight, gantrySpec.bridgeLength,
    )), beamMaterial, 0, gantrySpec.bridgeY, 0, 0, 0, 0, 1, gantry);
    bridge.name = 'verdant_gantry_connected_bridge';
    put(track(new THREE.BoxGeometry(0.4, 0.06, 7.1)), mat.steelDark,
      0, 4.74, 0, 0, 0, 0, 1, gantry);
    put(track(new THREE.BoxGeometry(0.42, 0.3, 0.5)), mat.steelDark,
      0, 4.6, 0.4, 0, 0, 0, 1, gantry);
    const chainGeometry = track(new THREE.CylinderGeometry(0.02, 0.02, 0.85, 6));
    put(chainGeometry, mat.steelBright, -0.16, 4.1, 0.4, 0, 0, 0.12, 1, gantry, false);
    put(chainGeometry, mat.steelBright, 0.16, 4.1, 0.4, 0, 0, -0.12, 1, gantry, false);
    put(track(new THREE.BoxGeometry(0.3, 0.16, 0.16)), mat.steelDark,
      0, 3.72, 0.4, 0, 0, 0, 1, gantry);
    put(track(new THREE.CylinderGeometry(0.012, 0.012, 2.1, 6)), mat.rubber,
      0.05, 3.8, -1.4, 0, 0, 0, 1, gantry, false);
    const bulb = put(track(new THREE.SphereGeometry(0.06, 8, 6)), mat.lamp,
      0.05, 2.72, -1.4, 0, 0, 0, 1, gantry, false);
    bulb.castShadow = false;
    put(track(new THREE.CylinderGeometry(0.09, 0.07, 0.16, 10)), mat.steelDark,
      0.05, 2.82, -1.4, 0, 0, 0, 1, gantry, false);
    const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(7.5, 7.5)), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(17.4, 0.03, -14.9);
    legacyVerdantRoot.add(pool);
    toolChest(14.2, -18.6, -0.4, mat.blueSteel, mat.steelDark, 0.9, legacyVerdantRoot);
    const jack = new THREE.Group();
    jack.name = 'verdant_original_floor_jack';
    jack.position.set(15.2, 0, -12.4);
    jack.rotation.y = 0.7;
    legacyVerdantRoot.add(jack);
    put(track(new THREE.BoxGeometry(0.7, 0.12, 0.3)), mat.redCab,
      0, 0.09, 0, 0, 0, 0, 1, jack);
    put(track(new THREE.BoxGeometry(0.5, 0.08, 0.22)), mat.redCab,
      -0.05, 0.2, 0, 0, 0, 0.22, 1, jack);
    put(track(new THREE.CylinderGeometry(0.055, 0.055, 0.6, 8)), mat.steelDark,
      0.35, 0.32, 0, 0, 0, -0.9, 1, jack);
    for (const [wheelX, wheelZ] of [[-0.28, 0.12], [-0.28, -0.12], [0.3, 0.12], [0.3, -0.12]]) {
      put(G.caster, mat.steelDark, wheelX, 0.06, wheelZ,
        0, 0, Math.PI / 2, 1, jack, false);
    }
  });

  // ==========================================================================
  // CHUNK 3 — shared M1A2 bay with its side skirts pulled, tools, creeper and
  // welding cable.
  // ==========================================================================
  chunks.push(async function buildAbramsAndOriginalVerdantBay() {
    const firstBayChildIndex = legacyVerdantRoot.children.length;
    const visual = await createLegacyVisual('m1a2', 1440);
    const tank = markModernPart(visual.root, 'm1a2', 'skirt_repair_vehicle');
    tank.name = 'dressing_tank_b';
    tank.rotation.y = -2.03;
    tank.position.set(16.9, 0, 17.7);
    legacyVerdantRoot.add(tank);
    const turret = tank.getObjectByName('rig_turret');
    if (turret) turret.rotation.y -= 0.38;
    const gun = tank.getObjectByName('rig_gun');
    if (gun) gun.rotation.x -= 0.05;

    const skirts = new THREE.Group();
    skirts.name = 'verdant_original_removed_side_skirts';
    skirts.position.set(16.9, 0, 17.7);
    skirts.rotation.y = -2.03;
    legacyVerdantRoot.add(skirts);
    const plateGeometry = track(new THREE.BoxGeometry(1.7, 0.85, 0.045));
    const plateMaterial = track(shadowMat(new THREE.MeshStandardMaterial({
      color: 0x3a3d33, roughness: 0.6, metalness: 0.45,
    })));
    for (const [plateZ, lean] of [[-1.5, 0.34], [0.1, 0.3], [1.6, 0.38]]) {
      const plate = put(plateGeometry, plateMaterial,
        -2.05, 0.42, plateZ, 0, 0, 0, 1, skirts);
      plate.rotation.order = 'ZYX';
      plate.rotation.set(0, Math.PI / 2, -lean);
    }
    const flatPlate = put(plateGeometry, plateMaterial,
      -3.1, 0.03, 0.6, 0, 0, 0, 1, skirts);
    flatPlate.rotation.set(-Math.PI / 2, 0, 0.4);
    toolChest(12.6, 15.4, 2.6, mat.redCab, mat.redCabDark, 1, legacyVerdantRoot);
    toolChest(14.0, 20.6, -2.0, mat.olive, mat.steelDark, 0.72, legacyVerdantRoot);
    const tray = put(track(new THREE.BoxGeometry(0.5, 0.07, 0.32)), mat.steelBright,
      0.2, 1.72, -2.2, 0.3, 0, 0, 1, skirts);
    tray.castShadow = false;
    put(track(new THREE.CylinderGeometry(0.28, 0.32, 0.09, 14)), mat.oily,
      14.9, 0.05, 15.9, 0, 0, 0, 1, legacyVerdantRoot);
    const creeper = new THREE.Group();
    creeper.name = 'verdant_original_creeper';
    creeper.position.set(14.35, 0, 17.1);
    creeper.rotation.y = 1.1;
    legacyVerdantRoot.add(creeper);
    put(track(new THREE.BoxGeometry(0.55, 0.05, 1.35)), mat.redCabDark,
      0, 0.09, 0, 0, 0, 0, 1, creeper);
    for (const [wheelX, wheelZ] of [[-0.2, -0.55], [0.2, -0.55], [-0.2, 0.55], [0.2, 0.55]]) {
      put(G.caster, mat.steelDark, wheelX, 0.045, wheelZ,
        0, 0, Math.PI / 2, 0.7, creeper, false);
    }
    const cableMaterial = track(shadowMat(new THREE.MeshStandardMaterial({
      color: 0x141618, roughness: 0.88, metalness: 0.05,
    })));
    const cable = new THREE.CatmullRomCurve3([
      new THREE.Vector3(11.6, 0.22, 19.6),
      new THREE.Vector3(13.2, 0.05, 18.6),
      new THREE.Vector3(15.4, 0.05, 17.0),
      new THREE.Vector3(17.35, 0.4, 15.95),
    ]);
    const cableMesh = new THREE.Mesh(
      track(new THREE.TubeGeometry(cable, 24, 0.035, 7)), cableMaterial,
    );
    cableMesh.name = 'verdant_original_welding_cable';
    cableMesh.castShadow = true;
    legacyVerdantRoot.add(cableMesh);
    const weldTip = put(track(new THREE.SphereGeometry(0.028, 8, 6)),
      track(new THREE.MeshBasicMaterial({ color: 0xffe0b0 })),
      17.4, 0.45, 15.92, 0, 0, 0, 1, legacyVerdantRoot, false);
    weldTip.castShadow = false;
    const glowMaterial = track(new THREE.SpriteMaterial({
      map: track(canvasTexture(makePoolTexture(
        'rgba(255,208,140,0.5)', 'rgba(255,160,70,0.14)',
      ))),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    const spark = new THREE.Sprite(glowMaterial);
    spark.name = 'verdant_original_weld_glow';
    spark.scale.setScalar(0.7);
    spark.position.set(17.4, 0.47, 15.92);
    legacyVerdantRoot.add(spark);
    const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(7, 7)), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(15.9, 0.03, 16.6);
    legacyVerdantRoot.add(pool);
    // This fixture hangs from Verdant's roof. Outdoor environments use the
    // stable Garage sun and hero lights, so never leave it in open sky.
    workLamp(15.9, 16.6, 0, 7.4, verdantInteriorRoot);
    halfTurnAuthoredServiceBay(firstBayChildIndex, 'abrams_welding', 'm1a2');
  });

  // ==========================================================================
  // CHUNK 4 — shared T-90M turret, exact gun rig, timber cradle and Relikt
  // service rack.
  // ==========================================================================
  chunks.push(async function buildT90AndOriginalVerdantComponents() {
    const visual = await createLegacyVisual('t90m', 1540);
    const tank = markModernPart(visual.root, 't90m', 'turret_cradle');
    const hull = tank.getObjectByName('rig_hull');
    const turret = tank.getObjectByName('rig_turret');
    const gun = tank.getObjectByName('rig_gun');
    if (hull) hull.visible = false;
    tank.traverse((object) => {
      if (object.userData.authoredShadowProxy) object.visible = false;
    });
    tank.position.set(-6.6, 0, 20.5);
    tank.rotation.y = 2.4;
    legacyVerdantRoot.add(tank);
    seatVisibleRoot(tank, 0.50);

    const cradle = markModernPart(new THREE.Group(), 't90m', 'turret_support');
    cradle.position.set(-6.6, 0, 20.5);
    cradle.rotation.y = 2.4;
    legacyVerdantRoot.add(cradle);
    const blockGeometry = track(new THREE.BoxGeometry(0.68, 0.46, 0.68));
    for (const [blockX, blockZ] of [[-1.05, -0.84], [1.05, -0.84], [-1.05, 0.84], [1.05, 0.84]]) {
      put(blockGeometry, mat.timber, blockX, 0.23, blockZ,
        0, 0, 0, 1, cradle);
    }
    const bearerGeometry = track(new THREE.BoxGeometry(2.85, 0.16, 0.28));
    put(bearerGeometry, mat.timberDark, 0, 0.49, -0.70,
      0, 0, 0, 1, cradle);
    put(bearerGeometry, mat.timberDark, 0, 0.49, 0.70,
      0, 0, 0, 1, cradle);
    placeGunRig(gun, 't90m', 2.75, 1.08, 21.39, 0.92);

    const turretMesh = turret?.getObjectByName('turretCloth') as THREE.Mesh | undefined;
    const reliktMaterial = turretMesh?.material || mat.olive;
    const reliktDimensions = [
      [0.32, 0.27, 0.39], [0.38, 0.31, 0.43], [0.43, 0.34, 0.46],
      [0.47, 0.35, 0.45], [0.48, 0.34, 0.43], [0.40, 0.31, 0.40],
      [0.28, 0.27, 0.34],
    ] as const;
    const rack = markModernPart(new THREE.Group(), 't90m', 'relikt_service_rack');
    rack.position.set(-11.2, 0, 21.15);
    legacyVerdantRoot.add(rack);
    put(track(new THREE.BoxGeometry(2.7, 0.12, 0.90)), mat.timberDark,
      0, 0.06, 0, 0, 0, 0, 1, rack);
    const uprightGeometry = track(new THREE.BoxGeometry(0.06, 1.52, 0.06));
    const railGeometry = track(new THREE.BoxGeometry(2.35, 0.06, 0.06));
    for (const x of [-1.15, 1.15]) {
      put(uprightGeometry, mat.steelMid, x, 0.82, -0.30,
        0, 0, 0, 1, rack);
    }
    for (const y of [0.25, 0.76, 1.28, 1.56]) {
      put(railGeometry, mat.steelMid, 0, y, -0.30,
        0, 0, 0, 1, rack);
    }
    const cassetteGeometry = track(new THREE.BoxGeometry(1, 1, 1));
    const cassettes = markModernPart(
      new THREE.InstancedMesh(cassetteGeometry, reliktMaterial, 21),
      't90m',
      'relikt_cassettes',
    );
    cassettes.userData.sourceGeometry = 'profiles/t90.ts:Proryv Relikt fan';
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    let cassetteIndex = 0;
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 7; column++) {
        const [width, height, depth] = reliktDimensions[column];
        position.set(-1.02 + column * 0.34, 0.39 + row * 0.43, -0.34);
        scale.set(width, height, depth);
        matrix.compose(position, rotation, scale);
        cassettes.setMatrixAt(cassetteIndex++, matrix);
      }
    }
    cassettes.instanceMatrix.needsUpdate = true;
    cassettes.castShadow = true;
    cassettes.receiveShadow = true;
    rack.add(cassettes);
    track(cassettes);
    wallSign('T-90M / RELIKT', -8.7, 3.25, 22.86,
      Math.PI, 2.8, 0.9, '', legacyVerdantRoot);
  });

  // ==========================================================================
  // CHUNK 5 — ORIGINAL VERDANT K2 teardown: rolled source hull, its exact
  // road wheels and shoes, connected steel cradle, and M2/DShK service table.
  // ==========================================================================
  chunks.push(async function buildOriginalVerdantK2Teardown() {
    const firstBayChildIndex = legacyVerdantRoot.children.length;
    const visual = await createLegacyVisual('k2', 172);
    const tank = markModernPart(visual.root, 'k2', 'side_hull');
    const hull = tank.getObjectByName('rig_hull');
    const turret = tank.getObjectByName('rig_turret');
    const tires = tank.getObjectByName('gearRoadWheelTires') as THREE.Mesh | undefined;
    const discs = (tank.getObjectByName('gearRoadWheelDiscs')
      || tank.getObjectByName('gearRoadWheelDiscsRecessed')) as THREE.Mesh | undefined;
    const pads = tank.getObjectByName('gearTrackPads') as THREE.Mesh | undefined;
    prepareK2TeardownHull(tank, hull, turret);
    tank.position.set(-16.25, 0, -16.85);
    tank.rotation.set(0, 0.35, THREE.MathUtils.degToRad(68));
    legacyVerdantRoot.add(tank);
    seatVisibleRoot(tank, 0.20);

    const cradle = markModernPart(new THREE.Group(), 'k2', 'hull_support');
    cradle.position.set(-16.25, 0, -16.85);
    cradle.rotation.y = 0.35;
    legacyVerdantRoot.add(cradle);
    cradle.userData.supportMode = 'connected-steel-rollover-cradle';
    cradle.userData.contactPadCount = 2;
    const baseRailGeometry = track(new THREE.BoxGeometry(0.28, 0.20, 5.55));
    const crossmemberGeometry = track(new THREE.BoxGeometry(3.45, 0.18, 0.30));
    const groundFootGeometry = track(new THREE.BoxGeometry(0.72, 0.08, 0.72));
    for (const x of [-1.42, 1.42]) {
      const rail = put(baseRailGeometry, mat.steelDark, x, 0.14, 0,
        0, 0, 0, 1, cradle);
      rail.name = 'k2_cradle_base_rail';
      for (const z of [-2.46, 2.46]) {
        const foot = put(groundFootGeometry, mat.steelDark, x, 0.04, z,
          0, 0, 0, 1, cradle);
        foot.name = 'k2_cradle_ground_foot';
      }
    }
    for (const z of [-2.46, 2.46]) {
      const crossmember = put(crossmemberGeometry, mat.steelMid, 0, 0.20, z,
        0, 0, 0, 1, cradle);
      crossmember.name = 'k2_cradle_crossmember';
    }

    const frameBraceGeometry = track(new THREE.BoxGeometry(0.20, 1.92, 0.28));
    const saddleGeometry = track(new THREE.BoxGeometry(1.12, 0.16, 0.50));
    const contactPadGeometry = track(new THREE.BoxGeometry(0.88, 0.09, 0.42));
    for (const z of [-1.72, 1.72]) {
      for (const [x, roll] of [[-0.66, -0.72], [0.66, 0.72]] as const) {
        const brace = put(frameBraceGeometry, mat.safety, x, 0.88, z,
          0, 0, roll, 1, cradle);
        brace.name = 'k2_cradle_a_frame_brace';
      }
      const saddle = put(saddleGeometry, mat.steelMid, 0, 1.53, z,
        0, 0, 0, 1, cradle);
      saddle.name = 'k2_cradle_contact_saddle';
      const pad = put(contactPadGeometry, mat.rubber, 0, 1.65, z,
        0, 0, -0.12, 1, cradle);
      pad.name = 'k2_cradle_rubber_contact_pad';
    }
    const spine = put(track(new THREE.BoxGeometry(0.22, 0.22, 3.72)), mat.steelMid,
      0, 1.40, 0, 0, 0, 0, 1, cradle);
    spine.name = 'k2_cradle_connected_spine';

    addK2RoadWheelStacks(tires, discs);
    addK2TrackShoePallet(pads);

    const weaponRack = new THREE.Group();
    weaponRack.name = 'dressing_modern_machine_gun_service_rack';
    weaponRack.userData.sourceVehicleIds = ['m1a2', 't90m'];
    weaponRack.userData.sourceEra = 'modern';
    weaponRack.userData.component = 'machine_gun_service_rack';
    weaponRack.position.set(-6.4, 0, -21.35);
    legacyVerdantRoot.add(weaponRack);
    put(track(new THREE.BoxGeometry(3.9, 0.12, 0.95)), mat.steelMid,
      0, 0.84, 0, 0, 0, 0, 1, weaponRack);
    const legGeometry = track(new THREE.BoxGeometry(0.08, 0.84, 0.08));
    for (const [x, z] of [[-1.72, -0.36], [1.72, -0.36], [-1.72, 0.36], [1.72, 0.36]]) {
      put(legGeometry, mat.steelDark, x, 0.42, z,
        0, 0, 0, 1, weaponRack);
    }
    serviceMachineGun(weaponRack, 'm2', false, -1.20, 1901);
    serviceMachineGun(weaponRack, 'dshk', false, 0, 1902);
    serviceMachineGun(weaponRack, 'm2', true, 1.20, 1903);
    wallSign('K2 TEARDOWN', -16.35, 3.20, -22.86,
      0, 2.5, 0.9, '', legacyVerdantRoot);
    wallSign('WEAPON SERVICE', -6.4, 2.75, -22.86,
      0, 2.7, 0.8, '', legacyVerdantRoot);
    halfTurnAuthoredServiceBay(firstBayChildIndex, 'rolled_k2', 'k2');
  });

  // One canonical four-bay service set is shared across all ten environments.
  // Reusing one optimized static graph preserves the real models and complete
  // 360-degree composition without retaining ten copies of their geometry.
  chunks.push(function finalizeSharedMaintenanceBays() {
    group.userData.verdantOriginalTriangleCount = countWorkshopTriangles(legacyVerdantRoot);
    group.userData.verdantOriginalExhibitCount = 4;
    group.userData.verdantOriginalExhibitIds = ['t90a_burlak', 'm1a2', 't90m', 'k2'];
    group.userData.verdantOriginalSetPieces = [
      'field_record_display',
      'turret_gantry', 'jack_stands', 'removed_side_skirts', 'welding_cable',
      'turret_cradle', 'relikt_service_rack', 'rolled_k2_hull',
      'road_wheel_stacks', 'track_shoe_pallet', 'weapon_service_rack',
    ];
    group.userData.workshopForwardCorrectionRad = Math.PI;
    group.userData.workshopFamilies = ['burlak', 'abrams', 't90', 'k2'];
    group.userData.workshopSourceVehicleIds = ['t90a_burlak', 'm1a2', 't90m', 'k2'];
    group.userData.sharedMaintenanceBayCount = 4;
    group.userData.sharedMaintenanceBayIds = [...SHARED_MAINTENANCE_BAY_IDS];
    group.userData.sharedMaintenanceBayQuadrants = [...SHARED_MAINTENANCE_BAY_QUADRANTS];
    group.userData.swappedServiceBayIds = ['abrams_welding', 'rolled_k2'];
    group.userData.workshopOrbitCoverageDegrees = 360;
    setVariant(currentVariant.id);
  });

  // Finalization remains outside first paint and runs only after the complete
  // shared authored set exists.
  chunks.push(function optimizeWorkshopDisplays() {
    const sourceTriangles = group.userData.verdantOriginalTriangleCount || 0;
    optimizeGarageDressing(group, {
      staticDisplayOwners: [legacyVerdantRoot, verdantInteriorRoot],
      additionalResourceRoots: [legacyVerdantRoot, verdantInteriorRoot],
    });
    const optimizedTriangles = countWorkshopTriangles(legacyVerdantRoot);
    group.userData.optimizedWorkshopTriangleCount = optimizedTriangles;
    group.userData.optimizedWorkshopTriangleParity = optimizedTriangles === sourceTriangles;
    // Do not call WebGLRenderer.compile() here. On constrained ANGLE drivers a
    // synchronous compile for one decorative vehicle blocked the Garage for
    // 190-300 ms. The regular presentation render submits the already-visible
    // shared material programs incrementally, while the optimization pass
    // above preserves the exact static composition for subsequent variants.
  });

  // sign plates bake before the webfont settles — refresh them once it lands
  // (same contract as garageStage's own signs)
  if (document.fonts && !document.fonts.check(SIGN_FONT)) {
    document.fonts.ready
      .then(() => { for (const t of signTextures) t.needsUpdate = true; })
      .catch(() => {});
  }

  let next = 0;
  return {
    group,
    /** Build the next chunk. @returns {Promise<boolean>} true while more chunks remain */
    async pump() {
      if (pendingTankReveal) {
        const reveal = pendingTankReveal;
        pendingTankReveal = null;
        reveal.visible = true;
        reveal.updateMatrixWorld(true);
        (group.userData.buildTimings ||= []).push({
          chunk: 'reveal-tank',
          ms: 0,
          at: Math.round(performance.now()),
        });
        return next < chunks.length;
      }
      if (next >= chunks.length) return false;
      const requiredVehicleId = WORKSHOP_CHUNK_VEHICLE_IDS[next];
      if (requiredVehicleId && !preparedVehicleIds.has(requiredVehicleId)) {
        // Module parse/evaluation and geometry construction get independent
        // quiet leases. Combining them made a single background display cost
        // both jobs inside one visible frame on constrained browsers.
        if (!workshopFleet) throw new Error('garage workshop fleet was not prepared');
        const prepareStartedAt = performance.now();
        await workshopFleet.ensureVisualBuilder(requiredVehicleId);
        preparedVehicleIds.add(requiredVehicleId);
        (group.userData.buildTimings ||= []).push({
          chunk: `prepare:${requiredVehicleId}`,
          ms: Math.round(performance.now() - prepareStartedAt),
          at: Math.round(performance.now()),
        });
        return true;
      }
      const fn = chunks[next];
      const label = WORKSHOP_CHUNK_LABELS[next] || fn.name || `chunk-${next}`;
      const startedAt = performance.now();
      try {
        await fn();
        // Building and first drawing a new static tank in the same frame
        // combines CPU geometry work with shader/program submission. Finish
        // all seating/teardown edits first, then hide the completed object
        // until the following quiet lease so those costs cannot stack.
        hidePendingTankReveal();
        next++;
        group.userData.lastBuildError = null;
        (group.userData.buildTimings ||= []).push({
          chunk: label,
          ms: Math.round(performance.now() - startedAt),
          at: Math.round(performance.now()),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        group.userData.lastBuildError = { chunk: label, message };
        console.warn(`[garageDressing] chunk '${label}' failed —`, message);
        throw error;
      }
      return pendingTankReveal !== null || next < chunks.length;
    },
    /** Force-finish every chunk (deterministic __SHOTS garage capture). */
    async ensureBuilt() {
      while (await this.pump()) { /* drain */ }
    },
    isBuilt() { return next >= chunks.length && pendingTankReveal === null; },
    setVariant,
    dispose() {
      if (group.parent) group.parent.remove(group);
      battleScreenGeneration++;
      if (battleScreenTimer !== null) window.clearTimeout(battleScreenTimer);
      if (battleScreenFrame !== null) window.cancelAnimationFrame(battleScreenFrame);
      battleScreenTimer = null;
      battleScreenFrame = null;
      battleScreenLoading = false;
      if (battleScreenCurrentTexture
          && battleScreenCurrentTexture !== battleScreenFallbackTexture) {
        battleScreenCurrentTexture.dispose();
      }
      if (battleScreenNextTexture && battleScreenNextTexture !== battleScreenCurrentTexture) {
        battleScreenNextTexture.dispose();
      }
      battleScreenCurrentTexture = null;
      battleScreenNextTexture = null;
      battleScreenFallbackTexture = null;
      group.userData.battleScreenResidentImageCount = 0;
      if (battleScreenMesh) battleScreenMesh.onBeforeRender = () => {};
      battleScreenMesh = null;
      battleScreenMaterial = null;
      for (const visual of workshopVisuals) visual.dispose();
      workshopVisuals.length = 0;
      workshopFleet?.dispose?.();
      for (const o of group.userData.optimizationDisposables || []) o.dispose?.();
      group.userData.optimizationDisposables = [];
      for (const o of disposables) if (o && o.dispose) o.dispose();
      disposables.length = 0;
    },
  };
}
