// src/ui/garageStage.ts — procedural garage hangar environment for the
// tank-select screen: concrete floor with painted bay markings and grime,
// corrugated-steel walls, ceiling with trusses, wall-mounted flood fixtures
// with real lights, a hazard-striped display podium and workshop props.
// 100% generated (canvas textures + primitive geometry) — no assets.
//
// Usage (integration, src/main.ts):
//   const stage = createGarageStage(engineCtx, GARAGE_POS);
//   scene.add(stage.group);
// This replaces the bare pad + apron discs. The two integration-owned
// showcase spotlights can stay — the stage's own fixtures complement them.
import * as THREE from 'three';
import { getGarageVariant } from '../game/garageVariants.ts';
import {
  GARAGE_HERO_HEADING_RAD,
  GARAGE_PLATFORM_GEOMETRY,
} from '../game/garagePresentationPose.ts';
import {
  createGarageArchitectureController,
  type GarageArchitectureStats,
} from './garageArchitecture.ts';

type RandomSource = () => number;
type SignWear = [boolean, number, number, number, number];

interface CanvasTextureOptions {
  srgb?: boolean;
  aniso?: number;
  repeat?: readonly [number, number] | null;
}

interface TrackScuffLaneOptions {
  centerX: number;
  y0: number;
  y1: number;
  pixelsPerMeter: number;
  bodyAlpha: number;
  edgeAlpha: number;
  cleatAlpha: number;
  phaseY: number;
}

interface GarageStageEngineContext {
  anisotropy?: number;
  setupShadowMaterial?(material: THREE.Material): void;
}

export interface GarageStageRuntime {
  group: THREE.Group;
  setVariant(variantId: string): string;
  prepareSelector(): Promise<void>;
  prepareVariant(variantId: string): Promise<GarageArchitectureStats>;
  stats(): GarageArchitectureStats;
  dispose(): void;
}

function get2dContext(
  canvas: HTMLCanvasElement,
  settings?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', settings);
  if (!context) throw new Error('Canvas 2D context is unavailable');
  return context;
}

// Keep the restored floor and podium guides locked to the single canonical
// three-quarter hero heading owned by garagePresentationPose.ts.
export const GARAGE_TRACK_AXIS_YAW_RAD = GARAGE_HERO_HEADING_RAD;
export const GARAGE_PODIUM_TOP_Y_M = GARAGE_PLATFORM_GEOMETRY.topYM;
const PODIUM_TREAD_UV_YAW_OFFSET_RAD = -Math.PI / 2;
const GARAGE_FLOOR_SIZE_M = 46;
const GARAGE_PODIUM_RADIUS_M = GARAGE_PLATFORM_GEOMETRY.deckRadiusM;
const GARAGE_TRACK_CENTER_OFFSET_M = 1.55;
const GARAGE_TRACK_SCUFF_WIDTH_M = 0.78;
const GARAGE_TRACK_CLEAT_PITCH_M = 0.32;
const GARAGE_TRACK_CLEAT_THICKNESS_M = 0.065;

// deterministic PRNG (mulberry32) so the hangar is identical every boot
// (exported: garageDressing.ts shares the stage's texture/prop language)
export function mulberry32(a: number): RandomSource {
  return function (): number {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(
  c: HTMLCanvasElement,
  { srgb = true, aniso = 4, repeat = null }: CanvasTextureOptions = {},
): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// fine noise dither pass — kills flat-fill banding under light falloff
export function dither(
  c2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: RandomSource,
  alpha = 0.05,
): void {
  const img = c2d.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 255 * alpha;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  c2d.putImageData(img, 0, 0);
}

/** Draw one straight, dimensioned tread lane in texture space. */
function drawTrackScuffLane(g: CanvasRenderingContext2D, {
  centerX, y0, y1, pixelsPerMeter, bodyAlpha, edgeAlpha, cleatAlpha, phaseY,
}: TrackScuffLaneOptions): void {
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const width = GARAGE_TRACK_SCUFF_WIDTH_M * pixelsPerMeter;
  const half = width / 2;
  const edge = Math.max(1, 0.055 * pixelsPerMeter);
  const pitch = GARAGE_TRACK_CLEAT_PITCH_M * pixelsPerMeter;
  const cleatH = Math.max(1, GARAGE_TRACK_CLEAT_THICKNESS_M * pixelsPerMeter);

  // Feathered rubber body: crisp enough to read as a guide, soft enough to
  // remain a worn floor contact patch instead of painted UI geometry.
  const body = g.createLinearGradient(centerX - half, 0, centerX + half, 0);
  body.addColorStop(0, 'rgba(20,24,28,0)');
  body.addColorStop(0.14, `rgba(20,24,28,${bodyAlpha * 0.72})`);
  body.addColorStop(0.32, `rgba(20,24,28,${bodyAlpha})`);
  body.addColorStop(0.68, `rgba(20,24,28,${bodyAlpha})`);
  body.addColorStop(0.86, `rgba(20,24,28,${bodyAlpha * 0.72})`);
  body.addColorStop(1, 'rgba(20,24,28,0)');
  g.fillStyle = body;
  g.fillRect(centerX - half, top, width, bottom - top);

  // Parallel contact edges keep the floor and podium lanes visually locked.
  g.fillStyle = `rgba(14,18,22,${edgeAlpha})`;
  g.fillRect(centerX - half * 0.72, top, edge, bottom - top);
  g.fillRect(centerX + half * 0.72 - edge, top, edge, bottom - top);

  // Identical world-space pitch on both canvases makes every cleat continue
  // through the platform seam instead of changing scale or slant.
  const first = phaseY + Math.ceil((top - phaseY) / pitch) * pitch;
  g.fillStyle = `rgba(10,14,18,${cleatAlpha})`;
  for (let y = first; y <= bottom; y += pitch) {
    g.fillRect(centerX - half * 0.82, y - cleatH / 2, width * 0.82, cleatH);
  }
}

// --- concrete floor texture: grime, expansion joints, painted bay, treads ---
function makeFloorTexture(rng: RandomSource): HTMLCanvasElement {
  // 512² keeps the same authored grime/marking language while cutting the
  // synchronous boot canvas work and upload footprint to one quarter.
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = get2dContext(c, { willReadFrequently: true });
  g.fillStyle = '#4e5154'; // r5: a step darker — keeps the key-spot pool below clip
  g.fillRect(0, 0, S, S);
  // large tonal blotches
  for (let i = 0; i < 90; i++) {
    const x = rng() * S, y = rng() * S, r = 30 + rng() * 130;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const dk = rng() < 0.5;
    grad.addColorStop(0, dk ? 'rgba(38,40,42,0.16)' : 'rgba(120,124,128,0.10)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // oil stains near center bay
  for (let i = 0; i < 7; i++) {
    const x = S / 2 + (rng() - 0.5) * 380, y = S / 2 + (rng() - 0.5) * 380;
    const r = 12 + rng() * 42;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(18,18,20,0.34)');
    grad.addColorStop(0.7, 'rgba(18,18,20,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // expansion joints (4x4 slabs)
  g.strokeStyle = 'rgba(24,26,28,0.75)';
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 1; i < 4; i++) {
    g.moveTo((S / 4) * i, 0); g.lineTo((S / 4) * i, S);
    g.moveTo(0, (S / 4) * i); g.lineTo(S, (S / 4) * i);
  }
  g.stroke();
  g.strokeStyle = 'rgba(150,154,158,0.25)'; // joint highlight edge
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 1; i < 4; i++) {
    g.moveTo((S / 4) * i + 2, 0); g.lineTo((S / 4) * i + 2, S);
    g.moveTo(0, (S / 4) * i + 2); g.lineTo(S, (S / 4) * i + 2);
  }
  g.stroke();
  // painted service-bay box around the podium (worn yellow)
  g.strokeStyle = 'rgba(196,164,44,0.55)';
  g.lineWidth = 9;
  g.setLineDash([46, 26]);
  g.strokeRect(S * 0.22, S * 0.22, S * 0.56, S * 0.56);
  g.setLineDash([]);
  // white guide line leading to the bay door
  g.strokeStyle = 'rgba(208,212,216,0.4)';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(S / 2, S * 0.78); g.lineTo(S / 2, S * 0.98);
  g.stroke();
  // Straight approach scuffs share the podium's real-world spacing, width,
  // and cleat pitch. They overlap beneath the disc so no gap can open at its
  // edge, even at grazing camera angles.
  const floorPxPerM = S / GARAGE_FLOOR_SIZE_M;
  const floorTrackOffsetPx = GARAGE_TRACK_CENTER_OFFSET_M * floorPxPerM;
  const floorTrackTop = S / 2 - (GARAGE_PODIUM_RADIUS_M + 0.5) * floorPxPerM;
  for (const side of [-1, 1]) {
    drawTrackScuffLane(g, {
      centerX: S / 2 + side * floorTrackOffsetPx,
      y0: floorTrackTop,
      y1: S,
      pixelsPerMeter: floorPxPerM,
      bodyAlpha: 0.28,
      edgeAlpha: 0.28,
      cleatAlpha: 0.36,
      phaseY: S / 2,
    });
  }
  // speckle
  for (let i = 0; i < 2600; i++) {
    const v = rng();
    g.fillStyle = v < 0.5 ? 'rgba(30,32,34,0.2)' : 'rgba(150,155,160,0.14)';
    g.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  dither(g, S, S, rng, 0.06);
  return c;
}

// --- corrugated steel wall texture (vertical ribs + girders + grime) --------
function makeWallTexture(rng: RandomSource): HTMLCanvasElement {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = get2dContext(c, { willReadFrequently: true });
  // base panel color
  g.fillStyle = '#3d4349';
  g.fillRect(0, 0, W, H);
  // vertical corrugation ribs (light/shadow pairs, 16px pitch)
  for (let x = 0; x < W; x += 16) {
    const lg = g.createLinearGradient(x, 0, x + 16, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0.10)');
    lg.addColorStop(0.35, 'rgba(255,255,255,0.02)');
    lg.addColorStop(0.6, 'rgba(0,0,0,0.16)');
    lg.addColorStop(1, 'rgba(0,0,0,0.05)');
    g.fillStyle = lg;
    g.fillRect(x, 0, 16, H);
  }
  // horizontal panel seams + girder shadow lines
  for (const y of [H * 0.3, H * 0.62]) {
    g.fillStyle = 'rgba(14,16,18,0.5)';
    g.fillRect(0, y, W, 4);
    g.fillStyle = 'rgba(190,200,210,0.10)';
    g.fillRect(0, y + 4, W, 2);
  }
  // concrete wainscot base band
  g.fillStyle = '#4a4c4e';
  g.fillRect(0, H * 0.86, W, H * 0.14);
  g.fillStyle = 'rgba(20,22,24,0.55)';
  g.fillRect(0, H * 0.86, W, 3);
  // hazard stripe strip on the wainscot
  for (let x = 0; x < W; x += 40) {
    g.fillStyle = (x / 40) % 2 ? '#8a7420' : '#26282a';
    g.beginPath();
    g.moveTo(x, H * 0.905); g.lineTo(x + 20, H * 0.905);
    g.lineTo(x + 40, H * 0.955); g.lineTo(x + 20, H * 0.955);
    g.closePath(); g.fill();
  }
  // rust streaks from seams
  for (let i = 0; i < 26; i++) {
    const x = rng() * W, y0 = H * (0.28 + rng() * 0.36), len = 20 + rng() * 90;
    const lg = g.createLinearGradient(0, y0, 0, y0 + len);
    lg.addColorStop(0, 'rgba(96,62,34,0.30)');
    lg.addColorStop(1, 'rgba(96,62,34,0)');
    g.fillStyle = lg;
    g.fillRect(x, y0, 2 + rng() * 3, len);
  }
  // per-panel tonal drift + soft grime blotches: breaks the long smooth
  // light-falloff gradient that banded on the big flat wall planes
  for (let x = 0; x < W; x += 128) {
    g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(210,220,230,0.04)';
    g.fillRect(x, 0, 128, H);
  }
  for (let i = 0; i < 22; i++) {
    const x = rng() * W, y = rng() * H, r = 40 + rng() * 120;
    const bg = g.createRadialGradient(x, y, 0, x, y, r);
    const dk = rng() < 0.6;
    bg.addColorStop(0, dk ? 'rgba(12,14,16,0.12)' : 'rgba(150,162,172,0.07)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // top grime gradient
  const tg = g.createLinearGradient(0, 0, 0, 90);
  tg.addColorStop(0, 'rgba(10,12,14,0.5)');
  tg.addColorStop(1, 'rgba(10,12,14,0)');
  g.fillStyle = tg;
  g.fillRect(0, 0, W, 90);
  dither(g, W, H, rng, 0.09);
  return c;
}

// Stenciled workshop signage uses real safety categories instead of painting
// every board yellow: blue identifies bays, red marks hazards, green marks
// service equipment, and amber remains the general caution accent.
// Inter has no condensed cut: bake at 44px but shrink-to-fit against the
// plate's inner width (the old 79%-width face fit 'NO SMOKING' at 44px flat).
export const SIGN_FONT = "700 44px 'ABC Monument Grotesk', 'Arial Narrow', Arial, sans-serif";
export function makeSignTexture(rng: RandomSource, text: string): HTMLCanvasElement {
  const W = 256, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = get2dContext(c);
  // wear specks precomputed so the rng stream stays deterministic even when
  // the plate re-bakes after the webfont resolves (draw() below is re-run).
  const wear: SignWear[] = [];
  for (let i = 0; i < 260; i++) {
    wear.push([rng() < 0.6, rng() * W, rng() * H, 1 + rng() * 3, 1 + rng() * 2]);
  }
  const upper = text.toUpperCase();
  const ink = /NO SMOKING|FLAMMABLE|FIRE/.test(upper)
    ? '#c95145'
    : /^BAY\b/.test(upper)
      ? '#4d8fb8'
      : /SERVICE|RELikt|TEARDOWN/i.test(upper)
        ? '#66a17a'
        : '#c9a22c';
  const inkBright = /NO SMOKING|FLAMMABLE|FIRE/.test(upper)
    ? '#e06a5c'
    : /^BAY\b/.test(upper)
      ? '#68a8ce'
      : /SERVICE|RELikt|TEARDOWN/i.test(upper)
        ? '#7fba8f'
        : '#d8b23a';
  const draw = () => {
    g.fillStyle = '#23282c';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = ink;
    g.lineWidth = 6;
    g.strokeRect(7, 7, W - 14, H - 14);
    // hazard chevron strip along the bottom
    g.save();
    g.beginPath(); g.rect(14, H - 34, W - 28, 20); g.clip();
    for (let x = 0; x < W + 40; x += 28) {
      g.fillStyle = (x / 28) % 2 ? ink : '#1c1e20';
      g.beginPath();
      g.moveTo(x, H - 14); g.lineTo(x + 14, H - 34); g.lineTo(x + 28, H - 34); g.lineTo(x + 14, H - 14);
      g.closePath(); g.fill();
    }
    g.restore();
    g.font = SIGN_FONT;
    g.textAlign = 'center';
    // shrink-to-fit: Inter is wider than the retired condensed cut, and the
    // longest plate ('NO SMOKING') would otherwise run through the keyline.
    const maxW = W - 44;
    const w0 = g.measureText(text).width;
    if (w0 > maxW) {
      g.font = SIGN_FONT.replace('44px', `${Math.max(24, Math.floor((44 * maxW) / w0))}px`);
    }
    g.fillStyle = inkBright;
    g.fillText(text, W / 2, 62);
    // wear: chips + grime so the stencil never reads as crisp UI text
    for (const [dark, x, y, w, h] of wear) {
      g.fillStyle = dark ? 'rgba(20,22,24,0.35)' : 'rgba(160,150,120,0.12)';
      g.fillRect(x, y, w, h);
    }
  };
  draw();
  // font mandate: bake in Inter — redraw once if the face lands
  // after the first bake (caller flips needsUpdate on the wrapping texture).
  if (document.fonts && !document.fonts.check(SIGN_FONT)) {
    document.fonts.ready.then(draw).catch(() => {});
  }
  return c;
}

// hazard-stripe band for the podium rim
export function makeHazardTexture(): HTMLCanvasElement {
  const W = 512, H = 64;
  const wearRng = mulberry32(60211);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = get2dContext(c);
  // Neutral light stripes let one shared texture take on each location's
  // authored accent through the material multiplier—no per-switch canvas
  // repaint, upload, or additional shader program.
  g.fillStyle = '#e7e4dc';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1c1e20';
  for (let x = -H; x < W + H; x += 64) {
    g.beginPath();
    g.moveTo(x, H); g.lineTo(x + 32, 0); g.lineTo(x + 64, 0); g.lineTo(x + 32, H);
    g.closePath(); g.fill();
  }
  // wear
  for (let i = 0; i < 240; i++) {
    g.fillStyle = 'rgba(70,72,74,0.35)';
    g.fillRect(wearRng() * W, wearRng() * H, 2, 2);
  }
  return c;
}

/**
 * Build the hangar environment group centered on the garage pedestal.
 * @param {{setupShadowMaterial:Function,anisotropy:number}} engineCtx
 * @param {THREE.Vector3} pos - garage stage center (ground level)
 * @param {string} [initialVariantId] persisted workshop environment id
 * @returns {{group:THREE.Group, setVariant:(variantId:string)=>string,
 *            stats:()=>import('./garageArchitecture.ts').GarageArchitectureStats,
 *            dispose:Function}}
 */
export function createGarageStage(
  engineCtx: GarageStageEngineContext,
  pos: THREE.Vector3,
  initialVariantId = '',
  requestRender: () => void = () => {},
): GarageStageRuntime {
  const rng = mulberry32(90210);
  const group = new THREE.Group();
  group.position.copy(pos);
  const aniso = (engineCtx && engineCtx.anisotropy) || 4;
  const shadowMat = <T extends THREE.Material>(m: T): T => {
    if (engineCtx && engineCtx.setupShadowMaterial) engineCtx.setupShadowMaterial(m);
    return m;
  };
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(o: T): T => { disposables.push(o); return o; };

  const HW = GARAGE_FLOOR_SIZE_M / 2; // camera at +8.2/+8.8 stays well inside
  const WALL_H = 10;

  // --- floor ---------------------------------------------------------------
  // NOTE ON FILL LIGHT: the hangar previously fell to PURE BLACK at the
  // ceiling and floor extents. Rather than adding more live lights (every
  // light costs every shader in the scene), the big static surfaces carry a
  // whisper of self-illumination — a fake bounce/ambient floor that keeps
  // structure barely visible without flattening the keyed lighting.
  const floorTex = track(canvasTexture(makeFloorTexture(rng), { aniso }));
  const floorMat = shadowMat(new THREE.MeshStandardMaterial({
    map: floorTex, roughness: 0.62, metalness: 0.08, envMapIntensity: 0.55,
    emissive: 0x11151a, emissiveIntensity: 0.5,
  }));
  track(floorMat);
  const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(HW * 2, HW * 2)), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = GARAGE_PLATFORM_GEOMETRY.groundSurfaceYM;
  floor.receiveShadow = true;
  group.add(floor);

  // Compile the one textured + normal-mapped Standard/CSM program used by all
  // nine outdoor packs during the already-covered first Verdant frame. A
  // two-centimetre receiver under the opaque podium is submitted but can never
  // contribute color; its 1x1 local textures add no network/decode work. This
  // prevents ANGLE from charging a 100–150 ms first-link stall to the first
  // environment selection on implementations without parallel shader compile.
  const outdoorSeedColor = track(new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat,
  ));
  outdoorSeedColor.colorSpace = THREE.SRGBColorSpace;
  outdoorSeedColor.needsUpdate = true;
  const outdoorSeedNormal = track(new THREE.DataTexture(
    new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat,
  ));
  outdoorSeedNormal.needsUpdate = true;
  const outdoorSeedMaterial = track(shadowMat(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: outdoorSeedColor,
    normalMap: outdoorSeedNormal,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.94,
    metalness: 0,
    colorWrite: false,
    depthWrite: false,
  })));
  outdoorSeedMaterial.name = 'garage:outdoor-shader-seed';
  const outdoorSeed = new THREE.Mesh(
    track(new THREE.PlaneGeometry(0.02, 0.02)),
    outdoorSeedMaterial,
  );
  outdoorSeed.name = 'garage_outdoor_shader_seed';
  outdoorSeed.rotation.x = -Math.PI / 2;
  outdoorSeed.position.set(0, 0.02, 0);
  outdoorSeed.receiveShadow = true;
  outdoorSeed.castShadow = false;
  outdoorSeed.frustumCulled = false;
  group.add(outdoorSeed);

  const outdoorSeedGeometry = track(new THREE.PlaneGeometry(0.02, 0.02));
  outdoorSeedGeometry.setAttribute('color', new THREE.Float32BufferAttribute([
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  ], 3));
  const addOutdoorSeed = (
    name: string,
    material: THREE.Material,
    { instanced = false, instanceColor = false } = {},
  ): void => {
    material.name = `garage:outdoor-seed:${name}`;
    const mesh = instanced
      ? new THREE.InstancedMesh(outdoorSeedGeometry, material, 1)
      : new THREE.Mesh(outdoorSeedGeometry, material);
    mesh.name = `garage_outdoor_shader_seed_${name}`;
    if (mesh instanceof THREE.InstancedMesh) {
      mesh.setMatrixAt(0, new THREE.Matrix4());
      if (instanceColor) mesh.setColorAt(0, new THREE.Color(0xffffff));
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.02, 0);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    group.add(mesh);
  };
  const seedStandard = (parameters: THREE.MeshStandardMaterialParameters) => (
    track(shadowMat(new THREE.MeshStandardMaterial({
      ...parameters,
      colorWrite: false,
      depthWrite: false,
    })))
  );
  addOutdoorSeed('baked', seedStandard({
    color: 0xffffff, vertexColors: true, roughness: 0.88, metalness: 0.06,
  }));
  addOutdoorSeed('glass', seedStandard({
    color: 0x6b8790, roughness: 0.16, metalness: 0.08, transparent: true, opacity: 0.78,
  }));
  addOutdoorSeed('wreck-instance', seedStandard({
    color: 0x24201c, roughness: 0.96, metalness: 0.14,
  }), { instanced: true });
  addOutdoorSeed('tree-instance', seedStandard({
    color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0,
  }), { instanced: true });
  addOutdoorSeed('tree-alpha-instance', seedStandard({
    color: 0xffffff,
    map: outdoorSeedColor,
    alphaTest: 0.38,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  }), { instanced: true });
  addOutdoorSeed('ground-instance-color', seedStandard({
    color: 0xffffff,
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  }), { instanced: true, instanceColor: true });
  addOutdoorSeed('facility-instance-color', seedStandard({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.06,
  }), { instanced: true, instanceColor: true });
  const skySeedMaterial = track(new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    colorWrite: false,
  }));
  addOutdoorSeed('sky', skySeedMaterial);
  const horizonSeedMaterial = track(new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    colorWrite: false,
  }));
  addOutdoorSeed('horizon', horizonSeedMaterial);

  // subtle contact-glow pool under the podium (fake bounce light)
  const poolC = document.createElement('canvas');
  poolC.width = poolC.height = 256;
  const pg = get2dContext(poolC);
  const pgrad = pg.createRadialGradient(128, 128, 10, 128, 128, 128);
  pgrad.addColorStop(0, 'rgba(255,238,205,0.30)');
  pgrad.addColorStop(0.55, 'rgba(255,238,205,0.10)');
  pgrad.addColorStop(1, 'rgba(255,238,205,0)');
  pg.fillStyle = pgrad;
  pg.fillRect(0, 0, 256, 256);
  const poolTex = track(canvasTexture(poolC));
  const poolMat = track(new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(20, 20)), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.03;
  group.add(pool);

  // --- podium (hazard-striped rim + concrete top) ---------------------------
  const hazTex = track(canvasTexture(makeHazardTexture(), { aniso, repeat: [6, 1] }));
  const podSideMat = shadowMat(new THREE.MeshStandardMaterial({
    map: hazTex, roughness: 0.7, metalness: 0.05,
  }));
  // r5: darker/rougher top — at 0x54575b/rough .5 the integration key spot
  // clipped the whole turntable to a uniform white disc with a hard edge.
  // r4: the bare disc read as "featureless charcoal with one soft blob"
  // (critique) — the top now carries painted turntable markings: a worn
  // alignment ring with radial ticks, a center datum cross, twin tread wear
  // bands where the tanks drive on, and grime speckle.
  const podTopC = document.createElement('canvas');
  const podiumTextureSize = 512;
  podTopC.width = podTopC.height = podiumTextureSize;
  function paintPodiumTexture(): void {
    const g = get2dContext(podTopC, { willReadFrequently: true });
    const C = podiumTextureSize / 2;
    const px = podiumTextureSize / 1024;
    g.fillStyle = '#45484c';
    g.fillRect(0, 0, podiumTextureSize, podiumTextureSize);
    // broad tonal drift so the disc never reads as one flat fill
    for (let i = 0; i < 40; i++) {
      const x = rng() * podiumTextureSize, y = rng() * podiumTextureSize;
      const r = 30 + rng() * 100;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, rng() < 0.5 ? 'rgba(30,32,34,0.10)' : 'rgba(120,124,128,0.07)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // Twin podium lanes use the exact same physical dimensions and cleat
    // phase as the surrounding floor scuffs.
    const podiumPxPerM = podiumTextureSize / (GARAGE_PODIUM_RADIUS_M * 2);
    const podiumTrackOffsetPx = GARAGE_TRACK_CENTER_OFFSET_M * podiumPxPerM;
    for (const side of [-1, 1]) {
      drawTrackScuffLane(g, {
        centerX: C + side * podiumTrackOffsetPx,
        y0: 0,
        y1: podiumTextureSize,
        pixelsPerMeter: podiumPxPerM,
        bodyAlpha: 0.34,
        edgeAlpha: 0.34,
        cleatAlpha: 0.42,
        phaseY: C,
      });
    }
    // worn painted alignment ring + radial ticks
    g.strokeStyle = 'rgba(188,192,198,0.34)';
    g.lineWidth = 7 * px;
    g.beginPath(); g.arc(C, C, 430 * px, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4 * px;
    g.beginPath(); g.arc(C, C, 300 * px, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 6 * px;
    g.beginPath();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.moveTo(C + Math.cos(a) * 402 * px, C + Math.sin(a) * 402 * px);
      g.lineTo(C + Math.cos(a) * 438 * px, C + Math.sin(a) * 438 * px);
    }
    g.stroke();
    // center datum cross
    g.lineWidth = 7 * px;
    g.strokeStyle = 'rgba(188,192,198,0.28)';
    g.beginPath();
    g.moveTo(C - 60 * px, C); g.lineTo(C + 60 * px, C);
    g.moveTo(C, C - 60 * px); g.lineTo(C, C + 60 * px);
    g.stroke();
    // paint wear: chip the markings back to deck color
    for (let i = 0; i < 900; i++) {
      g.fillStyle = 'rgba(69,72,76,0.9)';
      const a = rng() * Math.PI * 2, rr = (rng() < 0.5 ? 430 : 300) * px;
      g.fillRect(C + Math.cos(a) * (rr + (rng() - 0.5) * 8 * px) - 1,
        C + Math.sin(a) * (rr + (rng() - 0.5) * 8 * px) - 1, 1 + rng() * 2, 1 + rng() * 2);
    }
    // oil spotting + speckle
    for (let i = 0; i < 6; i++) {
      const x = C + (rng() - 0.5) * 500 * px;
      const y = C + (rng() - 0.5) * 500 * px;
      const r = 7 + rng() * 20;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(16,16,18,0.30)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = rng() < 0.5 ? 'rgba(28,30,32,0.18)' : 'rgba(140,145,150,0.10)';
      g.fillRect(rng() * podiumTextureSize, rng() * podiumTextureSize, 1 + rng() * 2, 1 + rng() * 2);
    }
    dither(g, podiumTextureSize, podiumTextureSize, rng, 0.05);
  }
  paintPodiumTexture();
  const podTopMat = shadowMat(new THREE.MeshStandardMaterial({
    map: track(canvasTexture(podTopC, { aniso })),
    color: 0xffffff, roughness: 0.64, metalness: 0.1, envMapIntensity: 0.5,
  }));
  track(podSideMat); track(podTopMat);
  const podium = new THREE.Mesh(
    track(new THREE.CylinderGeometry(
      GARAGE_PODIUM_RADIUS_M,
      GARAGE_PLATFORM_GEOMETRY.baseRadiusM,
      GARAGE_PODIUM_TOP_Y_M,
      56,
    )),
    [podSideMat, podTopMat, podTopMat],
  );
  podium.position.y = GARAGE_PODIUM_TOP_Y_M / 2;
  // Cylinder cap UVs lay the baked tread guides along local X, 90 degrees
  // across tank-forward. Offset the podium so its guides continue the two
  // world-Z tread scuffs painted onto the surrounding garage floor.
  podium.rotation.y = GARAGE_TRACK_AXIS_YAW_RAD + PODIUM_TREAD_UV_YAW_OFFSET_RAD;
  podium.receiveShadow = true;
  podium.castShadow = true;
  group.add(podium);
  // rim light on the turntable edge: a thin self-lit ring along the top lip
  // keeps the disc's far edge readable where the key lights fall off — the
  // silhouette of the podium must never dissolve into the floor shadow.
  const rimRingMat = track(new THREE.MeshStandardMaterial({
    color: 0x2b2d30, roughness: 0.4, metalness: 0.6,
    emissive: 0xd9c9a6, emissiveIntensity: 0.55,
  }));
  const rimRing = new THREE.Mesh(track(new THREE.TorusGeometry(6.0, 0.035, 8, 96)), rimRingMat);
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.y = GARAGE_PODIUM_TOP_Y_M + 0.002;
  group.add(rimRing);
  // stripe self-lift so the hazard band reads ALL the way around the dais —
  // r4: 0.07 was below the key light's falloff and the band fell to black
  // for ~3/4 of the circumference, reading as a texture seam that
  // "terminates mid-arc" (critique). 0.3 keeps every stripe legible in the
  // shadowed sectors while the lit sector still carries the key.
  podSideMat.emissive = new THREE.Color(0xffffff);
  podSideMat.emissiveMap = hazTex;
  podSideMat.emissiveIntensity = 0.3;

  // --- walls + ceiling -------------------------------------------------------
  const wallTexBase = makeWallTexture(rng);
  const wallMat = shadowMat(new THREE.MeshStandardMaterial({
    map: track(canvasTexture(wallTexBase, { aniso, repeat: [3, 1] })),
    roughness: 0.78, metalness: 0.25, envMapIntensity: 0.35,
    emissive: 0x0d1115, emissiveIntensity: 0.45,
  }));
  track(wallMat);
  const wallGeo = track(new THREE.PlaneGeometry(HW * 2, WALL_H));
  const baseWalls: THREE.Mesh[] = [];
  function addHangarWalls(): void {
    for (const [rx, ry, x, z] of [
      [0, 0, 0, -HW],            // north (faces +z, behind the tank in frame)
      [0, Math.PI, 0, HW],       // south
      [0, Math.PI / 2, -HW, 0],  // west (left in frame)
      [0, -Math.PI / 2, HW, 0],  // east
    ]) {
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.rotation.set(rx, ry, 0);
      wall.position.set(x, WALL_H / 2, z);
      wall.receiveShadow = true;
      group.add(wall);
      baseWalls.push(wall);
    }
  }
  addHangarWalls();
  const ceilMat = shadowMat(new THREE.MeshStandardMaterial({
    color: 0x1e2124, roughness: 0.95, metalness: 0.1,
    emissive: 0x151b22, emissiveIntensity: 0.65,
  }));
  track(ceilMat);
  const ceiling = new THREE.Mesh(track(new THREE.PlaneGeometry(HW * 2, HW * 2)), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_H;
  group.add(ceiling);
  // roof trusses (slight self-lift so they silhouette against the ceiling)
  const trussMat = shadowMat(new THREE.MeshStandardMaterial({
    color: 0x33383d, roughness: 0.6, metalness: 0.5,
    emissive: 0x171c22, emissiveIntensity: 0.45,
  }));
  track(trussMat);
  const trussGeo = track(new THREE.BoxGeometry(HW * 2, 0.5, 0.22));
  const roofTrusses: THREE.Mesh[] = [];
  function addRoofTrusses(): void {
    for (let index = -1; index <= 1; index++) {
      const truss = new THREE.Mesh(trussGeo, trussMat);
      truss.position.set(0, WALL_H - 0.35, index * 12);
      group.add(truss);
      roofTrusses.push(truss);
    }
  }
  addRoofTrusses();
  const architecture = createGarageArchitectureController(engineCtx || {}, group, requestRender);
  const verdantLights: THREE.Light[] = [];

  // --- light fixtures (visible housings + real lights) -----------------------
  const housingMat = shadowMat(new THREE.MeshStandardMaterial({
    color: 0x26292c, roughness: 0.5, metalness: 0.6,
  }));
  const lampMat = track(new THREE.MeshBasicMaterial({ color: 0xfff2d4 }));
  track(housingMat);
  const target = new THREE.Object3D();
  target.position.set(0, 1.2, 0);
  group.add(target);

  // two hanging highbay lamps over the bay (cone shade + glowing disc)
  const shadeGeo = track(new THREE.CylinderGeometry(0.16, 0.85, 0.6, 20));
  const glowGeo = track(new THREE.CylinderGeometry(0.66, 0.66, 0.06, 20));
  const cableGeo = track(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6));
  function addHighbayLamps(): void {
    for (const [x, z] of [[-4.5, -3.5], [5, 2.5]]) {
      const shade = new THREE.Mesh(shadeGeo, housingMat);
      shade.position.set(x, 7.6, z);
      const glow = new THREE.Mesh(glowGeo, lampMat);
      glow.position.set(x, 7.32, z);
      const cable = new THREE.Mesh(cableGeo, housingMat);
      cable.position.set(x, 8.7, z);
      group.add(shade, glow, cable);
      // reach the hangar's far corners (~33 m) so the floor never dies to black
      const pointLight = new THREE.PointLight(0xf3f1ea, 36, 42, 1.9); // camo_spotting r2: neutral highbay cast
      pointLight.position.set(x, 7.1, z);
      verdantLights.push(pointLight);
      group.add(pointLight);
    }
  }
  addHighbayLamps();

  // hud_ui r5: third highbay DIRECTLY over the turntable (dressing only — no
  // extra live light) carrying a faint volumetric cone down to the podium, so
  // the bright pool under the tank reads as a physical spotlight beam instead
  // of an emissive floor decal. The cone is an open cylinder with a vertical
  // alpha-gradient texture (dense at the fixture, zero at the floor),
  // additive, double-sided, non-depth-writing.
  {
    const shade = new THREE.Mesh(shadeGeo, housingMat);
    shade.position.set(0, 7.6, 0);
    const glow = new THREE.Mesh(glowGeo, lampMat);
    glow.position.set(0, 7.32, 0);
    const cable = new THREE.Mesh(cableGeo, housingMat);
    cable.position.set(0, 8.7, 0);
    group.add(shade, glow, cable);
    // r6: the flat alpha-gradient texture put HARD STRAIGHT EDGES on the
    // beam's silhouette against the back wall (critique: "flat alpha
    // triangle"). A view-dependent fresnel term feathers the tube's sides to
    // zero exactly at the silhouette, while the vertical ramp keeps the beam
    // dense at the fixture and dissolved before the floor — a soft
    // volumetric cone from every orbit angle.
    const coneMat = track(new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(1.0, 0.925, 0.784) } },
      vertexShader: /* glsl */ `
        varying float vV; varying vec3 vN; varying vec3 vE;
        void main() {
          vV = uv.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalMatrix * normal;
          vE = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vV; varying vec3 vN; varying vec3 vE;
        void main() {
          // silhouette feather: surface normal ⟂ view at the tube's edge
          float fres = abs(dot(normalize(vE), normalize(vN)));
          float edge = pow(fres, 1.8);
          // dense at the fixture (uv.y 1), fully dissolved toward the floor
          float grad = pow(clamp(vV, 0.0, 1.0), 1.7);
          gl_FragColor = vec4(uColor, edge * grad * 0.22);
        }`,
    }));
    const cone = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.68, 5.6, 6.9, 48, 1, true)), coneMat);
    cone.position.y = 7.3 - 6.9 / 2;
    group.add(cone);
  }

  // three wall floods on the visible (north/west) walls, aimed at the podium.
  // Proper industrial fixtures: wall bracket + finned housing shell + framed
  // emissive lens behind guard bars — never a bare glowing quad on the wall.
  // (the third housing is dressing only — keeps the scene's total live light
  // count low since three.js evaluates every light in every shader)
  const bracketMat = shadowMat(new THREE.MeshStandardMaterial({
    color: 0x4b5158, roughness: 0.45, metalness: 0.7,
  }));
  track(bracketMat);
  const lensMat = track(new THREE.MeshStandardMaterial({
    color: 0x0c0d0e, emissive: 0xffe2b0, emissiveIntensity: 2.0,
    roughness: 0.4, metalness: 0,
  }));
  const plateGeo = track(new THREE.BoxGeometry(0.5, 0.62, 0.07)); // wall plate
  const armGeo = track(new THREE.BoxGeometry(0.09, 0.09, 0.42));
  const shellGeo = track(new THREE.BoxGeometry(0.92, 0.58, 0.34)); // housing shell
  const rimGeo = track(new THREE.BoxGeometry(0.98, 0.64, 0.06));   // face rim
  const finGeo = track(new THREE.BoxGeometry(0.92, 0.05, 0.4));    // cooling fins
  const hoodGeo = track(new THREE.BoxGeometry(0.98, 0.07, 0.5));   // top visor
  // r6: CIRCULAR lens disc + radial-gradient halo sprite — the old bare
  // 0.72x0.4 emissive plane bloomed into a square glow patch on the wall
  // (critique: "the wall lamp is a square glow sprite")
  const lensGeo = track(new THREE.CircleGeometry(0.22, 24));
  const lampHaloC = document.createElement('canvas');
  lampHaloC.width = 128; lampHaloC.height = 128;
  {
    const hg = get2dContext(lampHaloC);
    const hgrad = hg.createRadialGradient(64, 64, 2, 64, 64, 62);
    hgrad.addColorStop(0, 'rgba(255,232,190,0.85)');
    hgrad.addColorStop(0.22, 'rgba(255,226,176,0.40)');
    hgrad.addColorStop(0.55, 'rgba(255,220,168,0.12)');
    hgrad.addColorStop(1, 'rgba(255,220,168,0)');
    hg.fillStyle = hgrad;
    hg.fillRect(0, 0, 128, 128);
  }
  const lampHaloMat = track(new THREE.SpriteMaterial({
    map: track(canvasTexture(lampHaloC)), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const barGeo = track(new THREE.BoxGeometry(0.03, 0.62, 0.03));   // lens guard
  const floods = [
    // hud_ui r2: floor peak right of the tank clipped to pure white with the
    // stage floods at 55 stacked on the integration key spot — held to 44
    // so the turntable pool stays below clipping
    { p: new THREE.Vector3(-6, 6.8, -HW + 0.3), i: 44 },
    { p: new THREE.Vector3(7, 6.8, -HW + 0.3), i: 44 },
    { p: new THREE.Vector3(-HW + 0.3, 6.8, 4), i: 0 },
  ];
  function addWallFloods(): void {
    for (const flood of floods) {
      const holder = new THREE.Group();
      holder.position.copy(flood.p);
      const plate = new THREE.Mesh(plateGeo, bracketMat);
      plate.position.z = 0.0;
      const arm = new THREE.Mesh(armGeo, bracketMat);
      arm.position.z = 0.24;
      const shell = new THREE.Mesh(shellGeo, bracketMat);
      shell.position.z = 0.55;
      const rim = new THREE.Mesh(rimGeo, housingMat);
      rim.position.z = 0.72;
      const hood = new THREE.Mesh(hoodGeo, bracketMat);
      hood.position.set(0, 0.33, 0.6);
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.z = 0.755;
      const halo = new THREE.Sprite(lampHaloMat); // circular camera-facing glow
      halo.scale.set(1.7, 1.7, 1);
      halo.position.z = 0.80;
      holder.add(plate, arm, shell, rim, hood, lens, halo);
      for (let finIndex = 0; finIndex < 4; finIndex++) { // heat-sink fins along the shell top
        const fin = new THREE.Mesh(finGeo, bracketMat);
        fin.position.set(0, 0.3, 0.42 + finIndex * 0.09);
        holder.add(fin);
      }
      for (const barX of [-0.18, 0.18]) { // guard bars across the lens
        const bar = new THREE.Mesh(barGeo, bracketMat);
        bar.position.set(barX, 0, 0.78);
        holder.add(bar);
      }
      group.add(holder);
      // aim the housing at the podium (lookAt works in world space)
      holder.lookAt(new THREE.Vector3(0, 1.2, 0).add(group.position));
      if (flood.i > 0) {
        const spot = new THREE.SpotLight(0xefeee8, flood.i, 46, 0.62, 0.55, 1.5); // camo_spotting r2: neutral wall flood
        spot.position.copy(flood.p);
        spot.target = target;
        verdantLights.push(spot);
        group.add(spot);
      }
    }
  }
  addWallFloods();

  // --- wall dressing: pipes, signage, second light pool (west + north) -------
  // The camera frames the north/west corner; without dressing the upper-left
  // of the shot is a flat dark gradient. Pipes + a lit stencil sign + a floor
  // light pool under the west flood fill that region at zero extra light cost.
  const pipeMat = shadowMat(new THREE.MeshStandardMaterial({
    color: 0x54584e, roughness: 0.42, metalness: 0.62,
  }));
  track(pipeMat);
  const pipeRunGeo = track(new THREE.CylinderGeometry(0.1, 0.1, HW * 2 - 2, 12));
  function addWallPipeRuns(): void {
    for (const [pipeY, radiusScale] of [[4.85, 1], [5.35, 0.55]]) {
      const pipe = new THREE.Mesh(pipeRunGeo, pipeMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(-HW + 0.42, pipeY, 0);
      pipe.scale.set(radiusScale, 1, radiusScale);
      pipe.castShadow = true;
      group.add(pipe);
    }
  }
  addWallPipeRuns();
  // pipe brackets pinning the runs to the wall
  const pbGeo = track(new THREE.BoxGeometry(0.3, 0.16, 0.5));
  function addWallPipeBrackets(): void {
    for (const bracketZ of [-16, -8, 0, 8, 16]) {
      const b1 = new THREE.Mesh(pbGeo, bracketMat);
      b1.position.set(-HW + 0.24, 4.85, bracketZ);
      const b2 = new THREE.Mesh(pbGeo, bracketMat);
      b2.position.set(-HW + 0.24, 5.35, bracketZ);
      group.add(b1, b2);
    }
  }
  addWallPipeBrackets();
  // vertical drop with a valve wheel near the workbench
  const dropGeo = track(new THREE.CylinderGeometry(0.09, 0.09, 4.3, 10));
  const drop = new THREE.Mesh(dropGeo, pipeMat);
  drop.position.set(-HW + 0.42, 2.65, 5.6);
  drop.castShadow = true;
  group.add(drop);
  const valveGeo = track(new THREE.TorusGeometry(0.18, 0.035, 8, 18));
  const valve = new THREE.Mesh(valveGeo, track(shadowMat(new THREE.MeshStandardMaterial({
    color: 0x8a2f26, roughness: 0.5, metalness: 0.4,
  }))));
  valve.rotation.y = Math.PI / 2;
  valve.position.set(-HW + 0.7, 1.7, 5.6);
  group.add(valve);

  // stenciled bay signs, mounted FLUSH to the wall: a soft AO halo painted
  // directly behind each board plus a proud steel backing plate kill the
  // "floating billboard" read; glow held low so they look room-lit, not lit.
  const haloC = document.createElement('canvas');
  haloC.width = haloC.height = 128;
  {
    const hg = get2dContext(haloC);
    const hgrad = hg.createRadialGradient(64, 64, 18, 64, 64, 64);
    hgrad.addColorStop(0, 'rgba(0,0,0,0.5)');
    hgrad.addColorStop(0.7, 'rgba(0,0,0,0.22)');
    hgrad.addColorStop(1, 'rgba(0,0,0,0)');
    hg.fillStyle = hgrad;
    hg.fillRect(0, 0, 128, 128);
  }
  const haloTex = track(canvasTexture(haloC));
  const haloMat = track(new THREE.MeshBasicMaterial({
    map: haloTex, transparent: true, depthWrite: false,
  }));
  const plateMat = track(shadowMat(new THREE.MeshStandardMaterial({
    color: 0x1b1e21, roughness: 0.55, metalness: 0.55,
  })));
  const signGeoBig = track(new THREE.PlaneGeometry(3.6, 1.8));
  const signGeoSmall = track(new THREE.PlaneGeometry(2.2, 1.1));
  const signTex1 = track(canvasTexture(makeSignTexture(rng, 'BAY 01'), { aniso }));
  const signTex2 = track(canvasTexture(makeSignTexture(rng, 'NO SMOKING'), { aniso }));
  // sign plates re-bake themselves on fonts.ready (see makeSignTexture) —
  // this pushes the refreshed canvases to the GPU.
  function refreshSignsAfterFontLoad(): void {
    if (!document.fonts || document.fonts.check(SIGN_FONT)) return;
    document.fonts.ready
      .then(() => { signTex1.needsUpdate = true; signTex2.needsUpdate = true; })
      .catch(() => {});
  }
  refreshSignsAfterFontLoad();
  const signMat1 = track(shadowMat(new THREE.MeshStandardMaterial({
    map: signTex1, emissive: 0xffffff, emissiveMap: signTex1, emissiveIntensity: 0.16,
    roughness: 0.6, metalness: 0.2,
  })));
  const signMat2 = track(shadowMat(new THREE.MeshStandardMaterial({
    map: signTex2, emissive: 0xffffff, emissiveMap: signTex2, emissiveIntensity: 0.14,
    roughness: 0.6, metalness: 0.2,
  })));
  // north-wall sign (faces +z): halo on the wall, plate, then the board
  const halo1 = new THREE.Mesh(track(new THREE.PlaneGeometry(4.6, 2.6)), haloMat);
  halo1.position.set(-13.5, 5.55, -HW + 0.015);
  const plate1 = new THREE.Mesh(track(new THREE.BoxGeometry(3.72, 1.92, 0.05)), plateMat);
  plate1.position.set(-13.5, 5.6, -HW + 0.045);
  const sign1 = new THREE.Mesh(signGeoBig, signMat1);
  sign1.position.set(-13.5, 5.6, -HW + 0.075);
  group.add(halo1, plate1, sign1);
  // west-wall sign (faces +x)
  const halo2 = new THREE.Mesh(track(new THREE.PlaneGeometry(2.9, 1.7)), haloMat);
  halo2.rotation.y = Math.PI / 2;
  halo2.position.set(-HW + 0.015, 3.37, -6);
  const plate2 = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 1.2, 2.3)), plateMat);
  plate2.position.set(-HW + 0.045, 3.4, -6);
  const sign2 = new THREE.Mesh(signGeoSmall, signMat2);
  sign2.rotation.y = Math.PI / 2;
  sign2.position.set(-HW + 0.075, 3.4, -6);
  group.add(halo2, plate2, sign2);

  // low hangar fill (hud_ui r2): the west-wall props (tool chest, bench,
  // tires, pipes) crushed to near-black under the podium-keyed lighting. One
  // wide dim point light lifts that corner ~a stop without flattening the
  // key — finite range keeps it out of the battlefield shaders' hot path.
  const fill = new THREE.PointLight(0xc2cedd, 13, 32, 1.7);
  fill.position.set(-15, 5.6, -1);
  verdantLights.push(fill);
  group.add(fill);

  // content_breadth r6 (critic minor: "lower hull/running gear falls into
  // shadow"): low bounce fill aimed at the hull lower third / running gear —
  // parked near the podium front-right, tuned so tracks/wheels read under
  // the moody key without flattening it.
  const gearFill = new THREE.PointLight(0xcfd8e6, 14, 9, 2);
  gearFill.position.set(2.6, 0.55, 2.2);
  gearFill.castShadow = false;
  verdantLights.push(gearFill);
  group.add(gearFill);
  // lighting_post r6 (optional minor): low-intensity cool rim behind-left of
  // the pedestal so the vehicle silhouette separates from the back wall.
  const coolRim = new THREE.PointLight(0x9fb8d8, 8, 18, 1.8);
  coolRim.position.set(-4.5, 3.2, -6.5);
  coolRim.castShadow = false;
  verdantLights.push(coolRim);
  group.add(coolRim);

  // second light pool: warm additive splash on the floor under the west-wall
  // flood housing (its lens is emissive) — fakes the third fixture being live
  // without adding a real light to every shader
  const pool2 = new THREE.Mesh(track(new THREE.PlaneGeometry(14, 14)), poolMat);
  pool2.rotation.x = -Math.PI / 2;
  pool2.position.set(-15.5, 0.04, 4);
  pool2.material = track(new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    opacity: 0.55,
  }));
  group.add(pool2);

  // --- props: crates, barrels, tires, tool cabinet, workbench ----------------
  const addWorkshopProps = (): void => {
  const crateTexC = document.createElement('canvas');
  crateTexC.width = crateTexC.height = 128;
  {
    const g = get2dContext(crateTexC);
    // tank_models r5 (minor #8): from the locked garage camera the crate
    // stack sits exactly on the rear-deck line of every carousel vehicle —
    // bright raw pine read as a copy-pasted deck prop on the tanks. Repaint
    // to weathered olive/grey wood (~0.55x albedo, desaturated) so it recedes
    // into the set dressing instead of glowing against the armor tones.
    g.fillStyle = '#403c30';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(40,30,16,0.8)';
    g.lineWidth = 5;
    g.strokeRect(4, 4, 120, 120);
    g.beginPath();
    g.moveTo(4, 4); g.lineTo(124, 124); g.moveTo(124, 4); g.lineTo(4, 124);
    g.stroke();
    for (let i = 0; i < 250; i++) {
      g.fillStyle = rng() < 0.5 ? 'rgba(24,22,14,0.25)' : 'rgba(96,92,74,0.2)';
      g.fillRect(rng() * 128, rng() * 128, 2, 6);
    }
  }
  const crateMat = shadowMat(new THREE.MeshStandardMaterial({
    map: track(canvasTexture(crateTexC, { aniso })), roughness: 0.85, metalness: 0,
  }));
  track(crateMat);
  const crateGeo = track(new THREE.BoxGeometry(1.5, 1.5, 1.5));
  for (const [cx2, cy2, cz2, ry2, s] of [
    [-13, 0.75, -20.5, 0.2, 1],
    [-14.8, 0.6, -19.2, -0.35, 0.8],
    [-13.4, 2.0, -20.3, 0.5, 0.75],
    [16, 0.75, -19.8, 0.1, 1],
  ]) {
    const crate = new THREE.Mesh(crateGeo, crateMat);
    crate.position.set(cx2, cy2, cz2);
    crate.rotation.y = ry2;
    crate.scale.setScalar(s);
    crate.castShadow = true;
    crate.receiveShadow = true;
    group.add(crate);
  }
  const barrelGeo = track(new THREE.CylinderGeometry(0.42, 0.42, 1.15, 16));
  for (const [bx, bz, col] of [[-9.5, -20.8, 0x7a2e26], [-8.6, -20.4, 0x2e4d6b], [-9.0, -19.6, 0x5a5f4a]]) {
    const bm = shadowMat(new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.35 }));
    track(bm);
    const barrel = new THREE.Mesh(barrelGeo, bm);
    barrel.position.set(bx, 0.58, bz);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
  }
  // tire stack
  const tireMat = shadowMat(new THREE.MeshStandardMaterial({ color: 0x181a1c, roughness: 0.95, metalness: 0 }));
  track(tireMat);
  const tireGeo = track(new THREE.TorusGeometry(0.55, 0.22, 10, 22));
  for (let i = 0; i < 3; i++) {
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.x = Math.PI / 2;
    tire.position.set(-20.6, 0.24 + i * 0.42, -12 + i * 0.06);
    tire.castShadow = true;
    group.add(tire);
  }
  // red rolling tool chest along the west wall — drawer bank with real drawer
  // faces/handles and a worn painted-steel texture (was: a bare red box)
  const cabTexC = document.createElement('canvas');
  cabTexC.width = 256; cabTexC.height = 256;
  {
    const g = get2dContext(cabTexC);
    g.fillStyle = '#7e2a24'; // worn signal red
    g.fillRect(0, 0, 256, 256);
    // panel shading top->bottom
    const lg = g.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, 'rgba(255,220,200,0.10)');
    lg.addColorStop(0.5, 'rgba(0,0,0,0)');
    lg.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = lg;
    g.fillRect(0, 0, 256, 256);
    // scuffs and chips
    for (let i = 0; i < 160; i++) {
      g.fillStyle = rng() < 0.5 ? 'rgba(40,16,12,0.25)' : 'rgba(220,190,180,0.10)';
      g.fillRect(rng() * 256, rng() * 256, 1 + rng() * 4, 1 + rng() * 2);
    }
    g.fillStyle = 'rgba(30,12,10,0.35)'; // grime at the base
    g.fillRect(0, 236, 256, 20);
  }
  const cabTex = track(canvasTexture(cabTexC, { aniso }));
  const cabMat = shadowMat(new THREE.MeshStandardMaterial({
    map: cabTex, roughness: 0.42, metalness: 0.45,
  }));
  const cabDark = shadowMat(new THREE.MeshStandardMaterial({
    color: 0x571d18, roughness: 0.5, metalness: 0.4,
  }));
  const cabSteel = shadowMat(new THREE.MeshStandardMaterial({
    color: 0xb9c2ca, roughness: 0.3, metalness: 0.85,
  }));
  track(cabMat); track(cabDark); track(cabSteel);
  const chest = new THREE.Group();
  chest.position.set(-21.8, 0, -4);
  chest.rotation.y = Math.PI / 2; // drawers face the bay
  // body + slightly proud top lip and base plinth (reads as beveled trim)
  const cabBody = new THREE.Mesh(track(new THREE.BoxGeometry(1.35, 1.34, 0.78)), cabMat);
  cabBody.position.y = 0.82;
  const cabTop = new THREE.Mesh(track(new THREE.BoxGeometry(1.43, 0.07, 0.86)), cabDark);
  cabTop.position.y = 1.53;
  const cabBase = new THREE.Mesh(track(new THREE.BoxGeometry(1.39, 0.1, 0.82)), cabDark);
  cabBase.position.y = 0.2;
  chest.add(cabBody, cabTop, cabBase);
  // drawer faces (proud of the body) with steel pull handles
  const drawerGeo = track(new THREE.BoxGeometry(1.23, 0.24, 0.05));
  const handleGeo = track(new THREE.BoxGeometry(0.6, 0.035, 0.035));
  for (let di = 0; di < 4; di++) {
    const dy = 1.36 - di * 0.3;
    const face = new THREE.Mesh(drawerGeo, cabMat);
    face.position.set(0, dy, 0.415);
    const handle = new THREE.Mesh(handleGeo, cabSteel);
    handle.position.set(0, dy + 0.055, 0.455);
    chest.add(face, handle);
  }
  // caster wheels
  const castGeo = track(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 10));
  for (const [wx, wz] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) {
    const wheel = new THREE.Mesh(castGeo, cabDark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.08, wz);
    chest.add(wheel);
  }
  chest.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  group.add(chest);
  const benchTopMat = shadowMat(new THREE.MeshStandardMaterial({ color: 0x6d5a38, roughness: 0.8 }));
  const benchLegMat = shadowMat(new THREE.MeshStandardMaterial({ color: 0x2c2f32, roughness: 0.55, metalness: 0.5 }));
  track(benchTopMat); track(benchLegMat);
  const benchTop = new THREE.Mesh(track(new THREE.BoxGeometry(3.4, 0.12, 1)), benchTopMat);
  benchTop.position.set(-21.6, 1.0, 1.5);
  benchTop.castShadow = true;
  group.add(benchTop);
  const legGeo = track(new THREE.BoxGeometry(0.1, 1.0, 0.1));
  for (const [lx, lz] of [[-1.55, -0.4], [1.55, -0.4], [-1.55, 0.4], [1.55, 0.4]]) {
    const leg = new THREE.Mesh(legGeo, benchLegMat);
    leg.position.set(-21.6 + lx, 0.5, 1.5 + lz);
    group.add(leg);
  }
  };
  addWorkshopProps();

  // --- foreground staging (r4): the camera-side floor below the dais edge
  // rendered as featureless charcoal (critique: "dead empty floor"). WoT
  // hangars fill that zone with floor markings, cable runs and shop clutter:
  //   1. worn dashed KEEP-CLEAR ring painted around the turntable,
  //   2. rubber power cables snaking from the bay to the dais base,
  //   3. extra oil staining in the camera foreground,
  //   4. wheel chocks + a traffic cone at the frame's lower corners.
  // Decals are depthWrite-false quads a few mm over the floor plane.
  const addForegroundStaging = (): void => {
    // 1. painted ring decal (dashed, worn)
    const ringC = document.createElement('canvas');
    ringC.width = ringC.height = 512;
    const rg = get2dContext(ringC);
    rg.translate(256, 256);
    rg.strokeStyle = 'rgba(202,170,52,0.6)';
    rg.lineWidth = 9;
    rg.setLineDash([34, 22]);
    rg.beginPath();
    rg.arc(0, 0, 232, 0, Math.PI * 2);
    rg.stroke();
    rg.setLineDash([]);
    // wear: chip the paint with floor-colored nicks
    for (let i = 0; i < 220; i++) {
      const a = rng() * Math.PI * 2, rr = 232 + (rng() - 0.5) * 10;
      rg.fillStyle = 'rgba(72,75,78,0.75)';
      rg.fillRect(Math.cos(a) * rr - 1.5, Math.sin(a) * rr - 1.5, 1 + rng() * 3, 1 + rng() * 2);
    }
    const ringMat = track(new THREE.MeshBasicMaterial({
      map: track(canvasTexture(ringC)), transparent: true, depthWrite: false,
    }));
    const ring = new THREE.Mesh(track(new THREE.PlaneGeometry(16.4, 16.4)), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.022;
    group.add(ring);

    // 2. rubber cable runs (camera side of the dais)
    const cableMat = track(shadowMat(new THREE.MeshStandardMaterial({
      color: 0x141618, roughness: 0.88, metalness: 0.05,
    })));
    const cableRuns = [
      [[11.2, 0.05, 6.6], [8.6, 0.04, 5.7], [6.9, 0.04, 4.4], [5.2, 0.06, 2.9]],
      [[2.4, 0.05, 11.0], [1.5, 0.04, 8.9], [0.9, 0.06, 6.4]],
    ];
    for (const pts of cableRuns) {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      const tube = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 32, 0.045, 8)), cableMat);
      tube.castShadow = true;
      group.add(tube);
    }
    // junction box the long run plugs into
    const jbox = new THREE.Mesh(track(new THREE.BoxGeometry(0.5, 0.42, 0.34)), bracketMat);
    jbox.position.set(11.45, 0.21, 6.7);
    jbox.rotation.y = -0.5;
    jbox.castShadow = true;
    group.add(jbox);

    // 3. foreground oil stains
    const stainC = document.createElement('canvas');
    stainC.width = stainC.height = 128;
    const sg = get2dContext(stainC);
    const sgrad = sg.createRadialGradient(64, 64, 4, 64, 64, 62);
    sgrad.addColorStop(0, 'rgba(14,14,16,0.5)');
    sgrad.addColorStop(0.6, 'rgba(14,14,16,0.22)');
    sgrad.addColorStop(1, 'rgba(14,14,16,0)');
    sg.fillStyle = sgrad;
    sg.fillRect(0, 0, 128, 128);
    const stainMat = track(new THREE.MeshBasicMaterial({
      map: track(canvasTexture(stainC)), transparent: true, depthWrite: false,
    }));
    for (const [sx, sz, ss] of [[5.9, 5.6, 2.6], [-4.3, 7.4, 1.9], [9.4, 3.2, 1.5]]) {
      const stain = new THREE.Mesh(track(new THREE.PlaneGeometry(ss, ss)), stainMat);
      stain.rotation.x = -Math.PI / 2;
      stain.rotation.z = rng() * Math.PI;
      stain.position.set(sx, 0.026, sz);
      group.add(stain);
    }

    // 4. wheel chocks (striped wedges) + traffic cone at the frame corners
    const chockMat = track(shadowMat(new THREE.MeshStandardMaterial({
      color: 0xb08a26, roughness: 0.7, metalness: 0.08,
    })));
    const chockGeo = track(new THREE.CylinderGeometry(0.26, 0.26, 0.4, 3));
    for (const [cx3, cz3, ry3] of [[3.3, 5.6, 0.5], [3.9, 5.2, 0.65]]) {
      const chock = new THREE.Mesh(chockGeo, chockMat);
      chock.rotation.set(Math.PI / 2, 0, ry3); // wedge lying on its side
      chock.position.set(cx3, 0.13, cz3);
      chock.castShadow = true;
      group.add(chock);
    }
    const coneMat2 = track(shadowMat(new THREE.MeshStandardMaterial({
      color: 0xc65a1e, roughness: 0.62, metalness: 0,
    })));
    const coneBandMat = track(new THREE.MeshBasicMaterial({ color: 0xe8e4da }));
    for (const [nx, nz] of [[-3.6, 7.9], [12.4, 4.1]]) {
      const body = new THREE.Mesh(track(new THREE.CylinderGeometry(0.035, 0.19, 0.52, 12)), coneMat2);
      body.position.set(nx, 0.26, nz);
      body.castShadow = true;
      const band = new THREE.Mesh(track(new THREE.CylinderGeometry(0.115, 0.145, 0.09, 12)), coneBandMat);
      band.position.set(nx, 0.28, nz);
      const base = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.035, 0.42)), coneMat2);
      base.position.set(nx, 0.018, nz);
      group.add(body, band, base);
    }
  };
  addForegroundStaging();

  // Everything authored above except the turntable and variant architecture
  // belongs to the original Verdant indoor set. Hiding this explicit owner
  // list prevents ceilings, corrugated walls, hanging lamps, and wall props
  // from leaking into the nine outdoor battlefield staging areas.
  const indoorStageObjects = group.children.filter((object) => (
    object !== podium
    && object !== rimRing
    && object !== architecture.group
    && object !== target
    && !(object instanceof THREE.Light)
  ));
  // The restored room was authored from the opposite end of the original
  // Verdant opening view. Rotate the complete static indoor set once around
  // the turntable instead of changing the canonical hero/camera pose or
  // maintaining a second set of hand-mirrored coordinates. The podium and
  // outdoor architecture stay direct children of `group`; the light target
  // remains at the turntable center, so every rotated fixture still aims at
  // the hero without any per-frame correction.
  const verdantIndoorSetRoot = new THREE.Group();
  verdantIndoorSetRoot.name = 'garage_verdant_indoor_half_turn';
  group.add(verdantIndoorSetRoot);
  for (const object of indoorStageObjects) verdantIndoorSetRoot.add(object);
  for (const light of verdantLights) verdantIndoorSetRoot.add(light);
  verdantIndoorSetRoot.rotation.y = Math.PI;
  verdantIndoorSetRoot.updateMatrix();
  verdantIndoorSetRoot.userData.layoutRotationRad = Math.PI;
  group.userData.verdantIndoorSetRotationRad = Math.PI;
  const verdantLightIntensities = new Map(
    verdantLights.map((light) => [light, light.intensity] as const),
  );
  let variantPresentationGeneration = 0;
  const ENVIRONMENT_REVEAL_ATTEMPTS = 3;
  const waitForEnvironmentRetry = (attempt: number): Promise<void> => (
    new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)))
  );

  const applyVariantSceneMode = (
    variantId: string,
    architectureStats: GarageArchitectureStats,
  ): void => {
    const isVerdant = variantId === 'verdant_motor_pool';
    for (const object of indoorStageObjects) object.visible = isVerdant;
    // Keep the light objects present in both modes so Three's light-count
    // defines stay invariant. Removing the Verdant fixtures forced every hero
    // tank and decoration material to synchronously relink on first reveal.
    for (const light of verdantLights) {
      light.visible = true;
      light.intensity = isVerdant ? (verdantLightIntensities.get(light) || 0) : 0;
    }
    architecture.group.visible = !isVerdant;
    group.userData.garageSceneMode = isVerdant ? 'verdant-workshop' : 'authentic-scene-pack';
    group.userData.garageRoofMode = isVerdant ? 'enclosed-original' : 'open-environment';
    group.userData.garageArchitecture = architectureStats;
    requestRender();
  };

  const setVariant = (variantId: string): string => {
    const variant = getGarageVariant(variantId);
    const presentationGeneration = ++variantPresentationGeneration;
    const neutral = new THREE.Color(0xffffff);
    group.userData.garageVariantId = variant.id;
    group.userData.garageMapId = variant.mapId;
    // Canvas albedo already carries the grime and corrugation. Blend the
    // location hue toward neutral before multiplication so climate identity
    // reads without crushing wall detail into black.
    floorMat.color.setHex(variant.floorTint).lerp(neutral, 0.42);
    wallMat.color.setHex(variant.wallTint).lerp(neutral, 0.34);
    const platformEdge = new THREE.Color(variant.accent).lerp(neutral, 0.12);
    podTopMat.color.setHex(variant.platformTint);
    podSideMat.color.copy(platformEdge);
    podSideMat.emissive.copy(platformEdge);
    rimRingMat.emissive.copy(platformEdge);
    lampMat.color.setHex(variant.lightTint);
    lensMat.emissive.setHex(variant.lightTint);
    const architectureStats = architecture.setVariant(variant);
    const isVerdant = variant.id === 'verdant_motor_pool';
    if (isVerdant || architectureStats.ready) {
      applyVariantSceneMode(variant.id, architectureStats);
    } else {
      // Keep the complete previous scene visible while the one requested pack
      // decodes and uploads offscreen. The visual handoff is atomic: no white
      // clear frame, missing horizon, or half-compiled material can appear.
      queueMicrotask(() => {
        if (presentationGeneration !== variantPresentationGeneration) return;
        void (async () => {
          let lastError = '';
          for (let attempt = 0; attempt < ENVIRONMENT_REVEAL_ATTEMPTS; attempt += 1) {
            try {
              const readyStats = await architecture.whenReady();
              if (presentationGeneration !== variantPresentationGeneration) return;
              if (readyStats.ready) {
                applyVariantSceneMode(variant.id, readyStats);
                group.userData.garageArchitectureError = '';
                group.userData.garageArchitectureAttempts = attempt + 1;
                return;
              }
            } catch (error) {
              lastError = error instanceof Error ? error.message : String(error);
            }
            if (presentationGeneration !== variantPresentationGeneration) return;
            if (attempt + 1 < ENVIRONMENT_REVEAL_ATTEMPTS) {
              await waitForEnvironmentRetry(attempt);
            }
          }
          // Preserve the last complete Garage instead of exposing the clear
          // color. Diagnostics retain the failure so a later selection can
          // retry rather than silently declaring the empty frame ready.
          group.userData.garageArchitectureError = lastError || 'environment did not become ready';
          group.userData.garageArchitectureAttempts = ENVIRONMENT_REVEAL_ATTEMPTS;
          requestRender();
        })();
      });
    }
    return variant.id;
  };
  setVariant(initialVariantId);

  return {
    group,
    setVariant,
    prepareSelector() {
      return architecture.prepareSelector();
    },
    prepareVariant(variantId: string) {
      return architecture.prepareVariant(getGarageVariant(variantId));
    },
    stats: () => architecture.stats(),
    dispose() {
      architecture.dispose();
      for (const o of disposables) if (o && o.dispose) o.dispose();
    },
  };
}
