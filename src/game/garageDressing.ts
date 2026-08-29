// src/game/garageDressing.ts — WORKSHOP SET DRESSING for the garage hangar
// (garage-scene r1). The bay read as a clean showroom: podium + a handful of
// crates. This module turns it into a WORKING tank workshop — benches with
// tools, pegboards, shell racks, real fleet tanks and their turret/gun rigs,
// turret and hull teardown states, armor racks, oil drums, jerrycans, welding cart with a faint
// arc glow, cable reels, an engine hoist with a hanging engine block, a big
// wall fan, extra hanging work lamps, two partial tanks and a recovered wreck.
//
// Contract with the rest of the game:
//  - FLEET-EXACT EXHIBITS: Verdant preserves its original T-90A Burlak, Abrams,
//    T-90M and K2 repair choreography. The nine newer environments retain the
//    Abrams, T-90M and Leclerc layout. Every vehicle comes from the same
//    first-party createTank builders as the playable fleet, loaded only after
//    the garage becomes quiet.
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
import { DECOR_KITS } from '../vehicles/decorations.js';
import { optimizeGarageDressing } from './garageDressingOptimization.ts';
import { getGarageVariant } from './garageVariants.ts';
import {
  countWorkshopTriangles,
  createWorkshopPartLibrary,
  type WorkshopPartKind,
} from './workshopParts.ts';
import { auditGarageWallBays, garageWallTransform } from './garageWallLayout.ts';

export interface GarageDressingEngineContext {
  readonly anisotropy?: number;
  readonly renderer?: THREE.WebGLRenderer;
  readonly scene?: THREE.Scene;
  readonly camera?: THREE.Camera;
  setupShadowMaterial?(material: THREE.Material): void;
}

export interface GarageWorkshopVisual {
  readonly root: THREE.Group;
  resetForGaragePresentation?(): void;
  dispose(): void;
}

export interface GarageWorkshopFleet {
  createVisual(
    specId: string,
    options?: Readonly<Record<string, unknown>>,
  ): GarageWorkshopVisual;
}

export interface GarageDressingExisting {
  readonly group?: THREE.Group;
  readonly bayFill?: THREE.PointLight;
  readonly variantId?: string;
  readonly workshopFleet?: GarageWorkshopFleet;
}

export interface GarageDressingRuntime {
  readonly group: THREE.Group;
  pump(): boolean;
  ensureBuilt(): void;
  isBuilt(): boolean;
  setVariant(variantId: string): string;
  dispose(): void;
}

type Scale3 = number | [number, number, number];
type TrackedResource = { dispose(): void };

const WORKSHOP_FLEET_IDS = Object.freeze([
  't90a_burlak', 'm1a2', 't90m', 'k2', 'leclerc',
] as const);

/** Load only the real fleet families used by the optional workshop. */
export async function prepareGarageDressing(
  engineCtx: GarageDressingEngineContext,
): Promise<GarageWorkshopFleet> {
  const { createTank, ensureTankBuilders } = await import('../vehicles/fleetFactory.ts');
  await ensureTankBuilders(WORKSHOP_FLEET_IDS);
  return {
    createVisual(specId: string, options: Readonly<Record<string, unknown>> = {}) {
      return createTank(specId, engineCtx, {
        camoSeed: 4200,
        quality: 'ai',
        geometryQuality: 'high',
        staticPreview: true,
        ...options,
      });
    },
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
  const partLibrary = createWorkshopPartLibrary(engineCtx);
  const variantAssemblies: THREE.Group[] = [];
  const variantOnlyRoots: THREE.Group[] = [];
  const workshopVisuals: GarageWorkshopVisual[] = [];
  const workshopVisualById = new Map<string, GarageWorkshopVisual>();
  const workshopFleet = existing.workshopFleet;
  let currentVariant = getGarageVariant(existing.variantId);
  const legacyVerdantRoot = new THREE.Group();
  legacyVerdantRoot.name = 'garage_verdant_original_workshop';
  legacyVerdantRoot.userData.variantSwitchOwner = true;
  legacyVerdantRoot.userData.layoutReceipt = 'pre-6c7b07533-original';
  legacyVerdantRoot.visible = currentVariant.id === 'verdant_motor_pool';
  group.add(legacyVerdantRoot);
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

  function wallSignAtForVariants(text: string, wallBayId: string): void {
    const bay = garageWallTransform(wallBayId);
    const root = new THREE.Group();
    root.name = `garage_variant_sign_${wallBayId}`;
    root.userData.variantSwitchOwner = true;
    root.visible = currentVariant.id !== 'verdant_motor_pool';
    group.add(root);
    variantOnlyRoots.push(root);
    wallSign(text, bay.x, bay.y, bay.z, bay.yaw,
      bay.width - 0.12, bay.height - 0.12, wallBayId, root);
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

  function createLegacyVisual(
    specId: 't90a_burlak' | 'k2',
    camoSeed: number,
  ): GarageWorkshopVisual {
    if (!workshopFleet) throw new Error('garage workshop fleet was not prepared');
    const visual = workshopFleet.createVisual(specId, {
      camoSeed,
      quality: 'ai',
      geometryQuality: 'high',
      staticPreview: true,
    });
    visual.resetForGaragePresentation?.();
    workshopVisuals.push(visual);
    workshopVisualById.set(specId, visual);
    return visual;
  }

  /** Clone an already-built exact fleet visual without duplicating GPU assets. */
  function clonePreparedVisualRoot(specId: 'm1a2' | 't90m'): THREE.Group {
    const source = workshopVisualById.get(specId);
    if (!source) throw new Error(`${specId} is missing its prepared workshop visual`);
    const clone = source.root.clone(true);
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.scale.setScalar(1);
    return clone;
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

  // Assembly positions all stay outside the showroom orbit envelope. Each of
  // the ten workshop layouts rotates and mirrors this list, producing a real
  // scene-composition change without retaining ten copies of the geometry.
  const assemblySlots: readonly (readonly [number, number, number])[] = [
    [-16.8, 14.8, 2.62], [-20.2, 2.5, 1.25], [16.8, 14.8, -2.62],
    [20.2, 2.5, -1.25], [-20.2, -8.0, 1.82], [20.2, -8.0, -1.82],
    [-14.2, -16.0, 2.55], [14.2, -16.0, -2.55], [0, 20.4, Math.PI],
  ];
  let mapBackdropMaterial: THREE.MeshBasicMaterial | null = null;
  let mapBackdropTexture: THREE.Texture | null = null;
  let backdropGeneration = 0;

  function poseAssembly(root: THREE.Group, logicalSlot: number): void {
    const layout = currentVariant.layout;
    const [x0, z0, yaw0] = assemblySlots[logicalSlot % assemblySlots.length];
    const mirrored = layout % 2 === 1;
    const driftX = Math.sin((layout + logicalSlot) * 1.7) * 0.8;
    const driftZ = Math.cos((layout * 1.3) + logicalSlot) * 0.7;
    root.position.set((mirrored ? -x0 : x0) + driftX, 0, z0 + driftZ);
    const bayYaw = (mirrored ? -yaw0 : yaw0) + (layout % 3 - 1) * 0.08;
    // The original proxy tanks were aligned to the bay but pointed out of it.
    // Preserve the painted-bay axis and turn complete vehicles toward the
    // service end; turret cradles and support racks retain their authored yaw.
    root.rotation.y = bayYaw + (root.userData.completeFleetTank ? Math.PI : 0);
    root.visible = currentVariant.id !== 'verdant_motor_pool';
    root.userData.garageVariantId = currentVariant.id;
    root.userData.logicalSlot = logicalSlot;
    root.updateMatrix();
    root.updateMatrixWorld(true);
  }

  function addSupportAssembly(
    kind: WorkshopPartKind,
    logicalSlot: number,
    scale = 1,
  ): THREE.Group {
    const root = partLibrary.createAssembly(kind, { name: `dressing_${kind}` });
    root.userData.variantSwitchOwner = true;
    root.scale.setScalar(scale);
    poseAssembly(root, logicalSlot);
    group.add(root);
    variantAssemblies.push(root);
    return root;
  }

  function addFleetExhibit(
    specId: 'm1a2' | 't90m' | 'leclerc',
    family: 'abrams' | 't90' | 'leclerc',
    component: 'complete_vehicle' | 'turret_and_gun',
    logicalSlot: number,
    scale: number,
  ): THREE.Group {
    if (!workshopFleet) throw new Error('garage workshop fleet was not prepared');
    const exhibit = new THREE.Group();
    exhibit.name = `dressing_tank_${specId}_${component}`;
    exhibit.userData.workshopPart = true;
    exhibit.userData.workshopLod = 'playable-fleet-exact';
    exhibit.userData.family = family;
    exhibit.userData.sourceVehicleId = specId;
    exhibit.userData.component = component;
    exhibit.userData.completeFleetTank = component === 'complete_vehicle';
    let visualRoot: THREE.Object3D;
    let measuredRoot: THREE.Object3D;
    if (component === 'complete_vehicle') {
      const visual = workshopFleet.createVisual(specId);
      visual.resetForGaragePresentation?.();
      visual.root.scale.setScalar(scale);
      workshopVisuals.push(visual);
      workshopVisualById.set(specId, visual);
      visualRoot = visual.root;
      measuredRoot = visual.root;
    } else {
      const source = workshopVisualById.get(specId);
      const sourceTurret = source?.root.getObjectByName('rig_turret');
      if (!sourceTurret) throw new Error(`${specId} is missing its prepared turret rig`);
      // Exact clone, shared geometry/materials: no substitute mesh and no
      // second createTank/material allocation for the service-bay display.
      visualRoot = sourceTurret.clone(true);
      visualRoot.scale.setScalar(scale);
      measuredRoot = visualRoot;
    }
    exhibit.add(visualRoot);

    exhibit.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(measuredRoot, true);
    const center = bounds.getCenter(new THREE.Vector3());
    const seatY = component === 'turret_and_gun' ? 0.92 : 0.02;
    visualRoot.position.set(-center.x, seatY - bounds.min.y, -center.z);

    poseAssembly(exhibit, logicalSlot);
    group.add(exhibit);
    exhibit.updateMatrixWorld(true);
    compileWorkshopObject(exhibit);
    variantAssemblies.push(exhibit);
    return exhibit;
  }

  function compileWorkshopObject(root: THREE.Object3D): void {
    if (engineCtx.renderer && engineCtx.camera && engineCtx.scene) {
      // WebGLRenderer.compile respects Object3D.visible. Both the fixed
      // Verdant set and the additive set can be hidden while the other layout
      // is selected, so make this one root force-visible only for submission.
      // Otherwise the first garage switch pays all of its shader births.
      const wasVisible = root.visible;
      root.visible = true;
      root.updateMatrixWorld(true);
      engineCtx.renderer.compile(root, engineCtx.camera, engineCtx.scene);
      root.visible = wasVisible;
    }
  }

  function updateMapBackdrop(): void {
    if (!mapBackdropMaterial) return;
    const generation = ++backdropGeneration;
    mapBackdropMaterial.color.setHex(currentVariant.wallTint).multiplyScalar(1.35);
    new THREE.TextureLoader().load(
      `/maps/thumbs/${currentVariant.mapId}.webp`,
      (texture) => {
        if (generation !== backdropGeneration) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(4, aniso);
        mapBackdropTexture?.dispose();
        mapBackdropTexture = texture;
        mapBackdropMaterial!.map = texture;
        mapBackdropMaterial!.color.setHex(0xffffff);
        mapBackdropMaterial!.needsUpdate = true;
      },
      undefined,
      () => {},
    );
  }

  function setVariant(variantId: string): string {
    currentVariant = getGarageVariant(variantId);
    group.userData.garageVariantId = currentVariant.id;
    group.userData.garageMapId = currentVariant.mapId;
    mat.safety.color.setHex(currentVariant.accent);
    bayFill.color.setHex(currentVariant.lightTint);
    const isVerdant = currentVariant.id === 'verdant_motor_pool';
    legacyVerdantRoot.visible = isVerdant;
    for (const root of variantOnlyRoots) root.visible = !isVerdant;
    for (const root of variantAssemblies) poseAssembly(root, root.userData.logicalSlot || 0);
    group.userData.verdantOriginalVisible = isVerdant && legacyVerdantRoot.children.length > 0;
    group.userData.workshopTriangleCount = isVerdant
      ? (group.userData.verdantOriginalTriangleCount || 0)
      : (group.userData.variantWorkshopTriangleCount || 0);
    group.userData.workshopExhibitCount = isVerdant ? 4 : 6;
    updateMapBackdrop();
    return currentVariant.id;
  }

  const chunks: Array<() => void> = [];

  // ==========================================================================
  // CHUNK 1 — static workshop clutter on every wall + floor decals
  // ==========================================================================
  chunks.push(function buildCore() {
    // A framed exterior monitor/door panel uses the selected workshop's real
    // battlefield thumbnail. It is the only per-variant texture and streams
    // after readiness; the fallback tint paints immediately.
    mapBackdropMaterial = track(new THREE.MeshBasicMaterial({
      color: currentVariant.wallTint, side: THREE.DoubleSide,
    }));
    const mapBay = garageWallTransform('south_location');
    const backdropFrame = put(track(new THREE.BoxGeometry(mapBay.width + 0.28, mapBay.height + 0.28, 0.16)), mat.steelDark,
      mapBay.x, mapBay.y, mapBay.z - 0.10, mapBay.yaw, 0, 0, 1, group, false);
    backdropFrame.userData.wallBayId = mapBay.id;
    const backdrop = put(track(new THREE.PlaneGeometry(mapBay.width, mapBay.height)), mapBackdropMaterial,
      mapBay.x, mapBay.y, mapBay.z - 0.20, mapBay.yaw, 0, 0, 1, group, false);
    backdrop.name = 'garage_map_location_preview';
    backdrop.userData.mapId = currentVariant.mapId;
    backdrop.userData.wallBayId = mapBay.id;
    updateMapBackdrop();
    // --- EAST WALL (left of frame from the hero cam) ------------------------
    workbench(21.95, -7, -Math.PI / 2);
    pegboardAt('east_tools');
    workLamp(21.6, -7);
    // steel locker pair
    for (const lz of [-11.9, -10.9]) {
      put(track(new THREE.BoxGeometry(0.55, 1.9, 0.95)), mat.olive, 22.35, 0.95, lz, 0, 0, 0, 1);
      put(track(new THREE.BoxGeometry(0.04, 1.7, 0.8)), mat.steelDark, 22.05, 0.95, lz, 0, 0, 0, 1, group, false);
    }
    // shell rack: frame + two rows of standing rounds (instanced)
    {
      const rack = new THREE.Group();
      rack.position.set(22.1, 0, 1.8);
      rack.rotation.y = -Math.PI / 2;
      group.add(rack);
      put(track(new THREE.BoxGeometry(2.3, 0.08, 0.8)), mat.steelMid, 0, 0.06, 0, 0, 0, 0, 1, rack);
      put(track(new THREE.BoxGeometry(2.3, 0.06, 0.7)), mat.steelMid, 0, 0.62, 0, 0, 0, 0, 1, rack);
      const post = track(new THREE.BoxGeometry(0.07, 1.25, 0.07));
      for (const px of [-1.1, 1.1]) {
        put(post, mat.safety, px, 0.62, -0.3, 0, 0, 0, 1, rack);
        put(post, mat.safety, px, 0.62, 0.3, 0, 0, 0, 1, rack);
      }
      const bodies = new THREE.InstancedMesh(G.shellBody, mat.olive, 12);
      const tips = new THREE.InstancedMesh(G.shellTip, mat.brass, 12);
      const M4 = new THREE.Matrix4();
      let i = 0;
      for (const rz of [-0.18, 0.18]) {
        for (let k = 0; k < 6; k++) {
          const sx = -0.95 + k * 0.38 + (rng() - 0.5) * 0.05;
          M4.makeTranslation(sx, 0.46, rz);
          bodies.setMatrixAt(i, M4);
          M4.makeTranslation(sx, 0.93, rz);
          tips.setMatrixAt(i, M4);
          i++;
        }
      }
      bodies.castShadow = tips.castShadow = true;
      rack.add(bodies, tips);
      track(bodies); track(tips);
      // two loose rounds lying on a pallet beside the rack
      put(track(new THREE.BoxGeometry(1.1, 0.1, 0.8)), mat.timberDark, 0.2, 0.05, 0.95, 0.2, 0, 0, 1, rack);
      put(G.shellBody, mat.olive, 0.05, 0.16, 0.95, 0.2, 0, Math.PI / 2, 1, rack);
      put(G.shellBody, mat.olive, 0.35, 0.16, 1.02, 0.35, 0, Math.PI / 2, 1, rack);
    }
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
    // Spare armor assemblies arrive in the later low-poly component slice.
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
  });

  // ==========================================================================
  // CHUNK 2 — ORIGINAL VERDANT BAY A: T-90A Burlak on jack stands with its
  // turret lifted under the gantry. Positions are the pre-overhaul coordinates.
  // ==========================================================================
  chunks.push(function buildOriginalVerdantBurlakBay() {
    const visual = createLegacyVisual('t90a_burlak', 777);
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
    const legGeometry = track(new THREE.BoxGeometry(0.14, 4.9, 0.14));
    for (const [lx, lz] of [[-2.4, -3.2], [2.4, -3.2], [-2.4, 3.2], [2.4, 3.2]]) {
      put(legGeometry, mat.safety, lx, 2.45, lz,
        0, 0, lx > 0 ? -0.06 : 0.06, 1, gantry);
    }
    const braceGeometry = track(new THREE.BoxGeometry(0.09, 2.6, 0.09));
    for (const lz of [-3.2, 3.2]) {
      put(braceGeometry, mat.steelMid, -1.2, 1.3, lz, 0, 0, 1.08, 1, gantry);
      put(braceGeometry, mat.steelMid, 1.2, 1.3, lz, 0, 0, -1.08, 1, gantry);
    }
    put(track(new THREE.BoxGeometry(0.26, 0.3, 7.1)), beamMaterial,
      0, 4.92, 0, 0, 0, 0, 1, gantry);
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
    compileWorkshopObject(tank);
  });

  // ==========================================================================
  // CHUNK 3 — current alternate-garage Abrams exhibit plus ORIGINAL VERDANT
  // BAY B: M1A2 with its side skirts pulled, tools, creeper and welding cable.
  // ==========================================================================
  chunks.push(function buildAbramsAndOriginalVerdantBay() {
    addFleetExhibit('m1a2', 'abrams', 'complete_vehicle', 0, 0.82);
    addSupportAssembly('powerpack', 1, 1.0);
    wallSignAtForVariants('ABRAMS LINE', 'north_final');

    const tank = markModernPart(clonePreparedVisualRoot('m1a2'), 'm1a2', 'skirt_repair_vehicle');
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
    workLamp(15.9, 16.6, 0, 7.4, legacyVerdantRoot);
    compileWorkshopObject(tank);
  });

  // ==========================================================================
  // CHUNK 4 — alternate-garage T-90M plus ORIGINAL VERDANT T-90M turret,
  // exact gun rig, timber cradle and Relikt service rack.
  // ==========================================================================
  chunks.push(function buildT90AndOriginalVerdantComponents() {
    addFleetExhibit('t90m', 't90', 'complete_vehicle', 2, 0.86);
    addSupportAssembly('weapon_rack', 3, 0.95);
    wallSignAtForVariants('T-90M LINE', 'south_suspension');

    const tank = markModernPart(clonePreparedVisualRoot('t90m'), 't90m', 'turret_cradle');
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
    cassettes.userData.sourceGeometry = 'profiles/t90.js:Proryv Relikt fan';
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
    compileWorkshopObject(tank);
  });

  // ==========================================================================
  // CHUNK 5 — ORIGINAL VERDANT K2 teardown: rolled source hull, its exact
  // road wheels and shoes, timber cradle, and the M2/DShK service table.
  // ==========================================================================
  chunks.push(function buildOriginalVerdantK2Teardown() {
    const visual = createLegacyVisual('k2', 172);
    const tank = markModernPart(visual.root, 'k2', 'side_hull');
    const hull = tank.getObjectByName('rig_hull');
    const turret = tank.getObjectByName('rig_turret');
    const tires = tank.getObjectByName('gearRoadWheelTires') as THREE.Mesh | undefined;
    const discs = (tank.getObjectByName('gearRoadWheelDiscs')
      || tank.getObjectByName('gearRoadWheelDiscsRecessed')) as THREE.Mesh | undefined;
    const pads = tank.getObjectByName('gearTrackPads') as THREE.Mesh | undefined;
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
    tank.position.set(-16.25, 0, -16.85);
    tank.rotation.set(0, 0.35, THREE.MathUtils.degToRad(68));
    legacyVerdantRoot.add(tank);
    seatVisibleRoot(tank, 0.20);

    const cradle = markModernPart(new THREE.Group(), 'k2', 'hull_support');
    cradle.position.set(-16.25, 0, -16.85);
    cradle.rotation.y = 0.35;
    legacyVerdantRoot.add(cradle);
    const beamGeometry = track(new THREE.BoxGeometry(2.55, 0.24, 0.58));
    put(beamGeometry, mat.timber, 0, 0.12, -2.05,
      0, 0, 0, 1, cradle);
    put(beamGeometry, mat.timber, 0, 0.12, 2.05,
      0, 0, 0, 1, cradle);
    const chockGeometry = track(new THREE.BoxGeometry(0.36, 0.42, 0.52));
    for (const z of [-2.05, 2.05]) {
      put(chockGeometry, mat.timberDark, -1.1, 0.32, z,
        0, 0, -0.28, 1, cradle);
      put(chockGeometry, mat.timberDark, 1.1, 0.32, z,
        0, 0, 0.28, 1, cradle);
    }

    if (tires?.geometry && discs?.geometry) {
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

    if (pads?.geometry) {
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
    compileWorkshopObject(tank);
  });

  // ==========================================================================
  // CHUNK 6 — real playable-fleet Leclerc assembly + reactive-armor rack for
  // the nine additive garage environments.
  // ==========================================================================
  chunks.push(function buildLeclercBay() {
    addFleetExhibit('leclerc', 'leclerc', 'complete_vehicle', 4, 0.84);
    addSupportAssembly('armor_rack', 5, 0.92);
    wallSignAtForVariants('LECLERC / ARMOR', 'south_turret_armor');
  });

  // ==========================================================================
  // CHUNKS 7-9 — real turret/gun rigs, one build + compile per quiet slice.
  // ==========================================================================
  chunks.push(function buildAbramsTurretService() {
    addFleetExhibit('m1a2', 'abrams', 'turret_and_gun', 6, 0.82);
  });
  chunks.push(function buildT90TurretService() {
    addFleetExhibit('t90m', 't90', 'turret_and_gun', 7, 0.88);
  });
  chunks.push(function buildLeclercTurretService() {
    addFleetExhibit('leclerc', 'leclerc', 'turret_and_gun', 8, 0.84);
    group.userData.variantWorkshopTriangleCount = variantAssemblies.reduce(
      (sum, root) => sum + countWorkshopTriangles(root), 0,
    );
    group.userData.verdantOriginalTriangleCount = countWorkshopTriangles(legacyVerdantRoot);
    let exhibitCount = 0;
    const families = new Set<string>();
    const sourceVehicleIds = new Set<string>();
    for (const root of variantAssemblies) {
      const family = root.userData.family;
      if (typeof family === 'string' && family !== 'support') {
        exhibitCount++;
        families.add(family);
      }
      const sourceVehicleId = root.userData.sourceVehicleId;
      if (typeof sourceVehicleId === 'string') sourceVehicleIds.add(sourceVehicleId);
    }
    group.userData.variantWorkshopExhibitCount = exhibitCount;
    group.userData.verdantOriginalExhibitCount = 4;
    group.userData.verdantOriginalExhibitIds = ['t90a_burlak', 'm1a2', 't90m', 'k2'];
    group.userData.verdantOriginalSetPieces = [
      'turret_gantry', 'jack_stands', 'removed_side_skirts', 'welding_cable',
      'turret_cradle', 'relikt_service_rack', 'rolled_k2_hull',
      'road_wheel_stacks', 'track_shoe_pallet', 'weapon_service_rack',
    ];
    group.userData.workshopForwardCorrectionRad = Math.PI;
    group.userData.workshopFamilies = [...families];
    group.userData.workshopSourceVehicleIds = [
      ...new Set([...sourceVehicleIds, 't90a_burlak', 'k2']),
    ];
    wallSignAtForVariants('TURRET SERVICE', 'north_teardown');
    setVariant(currentVariant.id);
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
    /** Build the next chunk. @returns {boolean} true while more chunks remain */
    pump() {
      if (next >= chunks.length) return false;
      const fn = chunks[next];
      const startedAt = performance.now();
      try {
        fn();
        next++;
        group.userData.lastBuildError = null;
        (group.userData.buildTimings ||= []).push({
          chunk: fn.name,
          ms: Math.round(performance.now() - startedAt),
        });
        if (next >= chunks.length) optimizeGarageDressing(group);
      } catch (error: unknown) {
        const message = (error as { message: string }).message;
        group.userData.lastBuildError = { chunk: fn.name, message };
        console.warn(`[garageDressing] chunk '${fn.name}' failed —`, message);
        throw error;
      }
      return next < chunks.length;
    },
    /** Force-finish every chunk (deterministic __SHOTS garage capture). */
    ensureBuilt() {
      while (this.pump()) { /* drain */ }
    },
    isBuilt() { return next >= chunks.length; },
    setVariant,
    dispose() {
      if (group.parent) group.parent.remove(group);
      backdropGeneration++;
      mapBackdropTexture?.dispose();
      mapBackdropTexture = null;
      for (const visual of workshopVisuals) visual.dispose();
      workshopVisuals.length = 0;
      for (const o of group.userData.optimizationDisposables || []) o.dispose?.();
      group.userData.optimizationDisposables = [];
      for (const o of disposables) if (o && o.dispose) o.dispose();
      disposables.length = 0;
      partLibrary.dispose();
    },
  };
}
