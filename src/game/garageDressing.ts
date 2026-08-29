// src/game/garageDressing.ts — WORKSHOP SET DRESSING for the garage hangar
// (garage-scene r1). The bay read as a clean showroom: podium + a handful of
// crates. This module turns it into a WORKING tank workshop — benches with
// tools, pegboards, shell racks, low-poly gun/road-wheel/track assemblies,
// turret and hull teardown states, armor racks, oil drums, jerrycans, welding cart with a faint
// arc glow, cable reels, an engine hoist with a hanging engine block, a big
// wall fan, extra hanging work lamps, two partial tanks and a recovered wreck.
//
// Contract with the rest of the game:
//  - 100% procedural (canvas textures + a dedicated low-poly workshop kit) —
//    no downloads, GLB jobs, fleet builders or playable tank scene graphs
//    via the helpers exported from ui/garageStage.js.
//  - BUILDS IN CHUNKS: first paint pumps only the static workshop shell, then
//    streams low-poly assembly/component displays during garage-idle windows.
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
} from '../ui/garageStage.js';
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
  setupShadowMaterial?(material: THREE.Material): void;
}

export interface GarageDressingExisting {
  readonly group?: THREE.Group;
  readonly bayFill?: THREE.PointLight;
  readonly variantId?: string;
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
  group.userData.workshopPartSource = 'garage-low-poly-library';
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
  let currentVariant = getGarageVariant(existing.variantId);
  group.userData.garageVariantId = currentVariant.id;
  group.userData.garageMapId = currentVariant.mapId;

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
  function workLamp(x: number, z: number, poolScale = 5.5, y = 7.4): void {
    put(G.lampShade, mat.steelDark, x, y, z);
    const glow = put(G.lampGlow, mat.lamp, x, y - 0.26, z, 0, 0, 0, 1, group, false);
    glow.castShadow = false;
    put(G.lampCable, mat.steelDark, x, y + 0.26 + (10 - y - 0.26) / 2, z, 0, 0, 0, [1, (10 - y - 0.26), 1], group, false);
    if (poolScale > 0.01) {
      const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1)), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.032, z);
      pool.scale.setScalar(poolScale);
      group.add(pool);
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
  ): THREE.Group {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    t.rotation.y = ry;
    t.scale.setScalar(s);
    group.add(t);
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
  ): void {
    const tex = track(canvasTexture(makeSignTexture(rng, text), { aniso }));
    signTextures.push(tex);
    const m = track(shadowMat(new THREE.MeshStandardMaterial({
      map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.13,
      roughness: 0.6, metalness: 0.2,
    })));
    const back = put(track(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.05)), mat.steelDark, x, y, z, ry, 0, 0, 1, group, false);
    back.userData.wallBayId = wallBayId;
    const board = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), m);
    board.position.set(x, y, z);
    board.rotation.y = ry;
    board.translateZ(0.032);
    board.userData.wallBayId = wallBayId;
    group.add(board);
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
    root.rotation.y = (mirrored ? -yaw0 : yaw0) + (layout % 3 - 1) * 0.08;
    root.userData.garageVariantId = currentVariant.id;
    root.userData.logicalSlot = logicalSlot;
  }

  function addAssembly(
    kind: WorkshopPartKind,
    logicalSlot: number,
    scale = 1,
  ): THREE.Group {
    const root = partLibrary.createAssembly(kind, { name: `dressing_${kind}` });
    root.scale.setScalar(scale);
    poseAssembly(root, logicalSlot);
    group.add(root);
    variantAssemblies.push(root);
    return root;
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
    for (const root of variantAssemblies) poseAssembly(root, root.userData.logicalSlot || 0);
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
  // CHUNK 2 — recognizable Abrams final assembly + Leclerc power pack.
  // workshop duplicates, not playable vehicle builds.
  // ==========================================================================
  chunks.push(function buildBayA() {
    addAssembly('abrams_assembly', 0, 0.82);
    addAssembly('powerpack', 1, 1.0);
    wallSignAt('ABRAMS LINE', 'north_final');
  });

  // ==========================================================================
  // CHUNK 3 — recognizable T-90M assembly + three-family gun bench.
  // ==========================================================================
  chunks.push(function buildBayB() {
    addAssembly('t90_assembly', 2, 0.86);
    addAssembly('weapon_rack', 3, 0.95);
    wallSignAt('T-90M LINE', 'south_suspension');
  });

  // ==========================================================================
  // CHUNK 4 — recognizable Leclerc assembly + reactive-armor rack.
  // ==========================================================================
  chunks.push(function buildLeclercBay() {
    addAssembly('leclerc_assembly', 4, 0.84);
    addAssembly('armor_rack', 5, 0.92);
    wallSignAt('LECLERC / ARMOR', 'south_turret_armor');
  });

  // ==========================================================================
  // CHUNK 5 — distinct Abrams, T-90M and Leclerc turret/gun service cradles.
  // ==========================================================================
  chunks.push(function buildTurretService() {
    addAssembly('abrams_turret_cradle', 6, 0.82);
    addAssembly('t90_turret_cradle', 7, 0.88);
    addAssembly('leclerc_turret_cradle', 8, 0.84);
    group.userData.workshopTriangleCount = variantAssemblies.reduce(
      (sum, root) => sum + countWorkshopTriangles(root), 0,
    );
    group.userData.workshopFamilies = [...new Set(variantAssemblies
      .map((root) => root.userData.family).filter((family) => family && family !== 'support'))];
    group.userData.workshopSourceVehicleIds = [...new Set(variantAssemblies
      .map((root) => root.userData.sourceVehicleId).filter(Boolean))];
    wallSignAt('TURRET SERVICE', 'north_teardown');
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
      for (const o of group.userData.optimizationDisposables || []) o.dispose?.();
      group.userData.optimizationDisposables = [];
      for (const o of disposables) if (o && o.dispose) o.dispose();
      disposables.length = 0;
      partLibrary.dispose();
    },
  };
}
