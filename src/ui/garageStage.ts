// src/ui/garageStage.ts — procedural garage hangar environment for the
// tank-select screen: concrete floor with slab joints, stains and grime,
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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getGarageVariant } from '../game/garageVariants.ts';
import {
  GARAGE_HERO_HEADING_RAD,
  GARAGE_PLATFORM_GEOMETRY,
} from '../game/garagePresentationPose.ts';
import {
  createGarageArchitectureController,
  type GarageArchitectureStats,
} from './garageArchitecture.ts';
import { getDeviceTier } from '../engine/quality.ts';
import { getGarageWorkshopLayoutPose, VERDANT_K2_WORK_LIGHT } from '../game/garageWorkshopLayout.ts';
import {
  GARAGE_HARDSTAND_PROGRAM_KEY,
  garageHardstandDetailTexture,
  garageHardstandDetailUniform,
  garageHardstandGradedHook,
  garageHardstandGrainTexture,
} from './garageHardstandProgram.ts';
import type { HallMesh } from './garageHallKit.ts';
import { buildVerdantFloorAlbedo, VERDANT_FLOOR_TEXELS } from './garageVerdantFloor.ts';
import { buildVerdantHallParts, verdantHallShutter } from './garageVerdantHall.ts';
import { createGarageDisplayMaterial, ensureGarageDisplayAtlas, garageDisplayRect, garageDisplaySignRect } from './garageDisplayAtlas.ts';

type RandomSource = () => number;
type SignWear = [boolean, number, number, number, number];

interface CanvasTextureOptions {
  srgb?: boolean;
  aniso?: number;
  repeat?: readonly [number, number] | null;
}

interface GarageStageEngineContext {
  anisotropy?: number;
  setupShadowMaterial?(material: THREE.Material, extraHook?: THREE.Material['onBeforeCompile'] | null): void;
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

// The hero stands on the single canonical three-quarter heading owned by garagePresentationPose.ts; the podium's
// painted datum turns with it.
//
// 2026-10-08 (the contact-shadow lane; the owner: "fix the contact shadows for tracks on ground which are staticly on
// ground and look bad"): the floor and the podium no longer carry painted track scuff lanes. They were baked at one
// gauge (centres ±1.55 m, 0.78 m wide) along this heading whatever the hero — the fleet's tracks run 0.37–0.64 m wide,
// the KV-2's centred at ±1.29 m, the M1A2's at ±1.43 m, the T-90M's at ±1.51 m — so they showed beside narrower or
// closer-set tracks and across the open podium ahead of and behind the hull, a static print that no tank made. The hero's own contact is live: it is
// one of the near hulls whose ground occlusion the aerial pass draws (vehicleGroundOcclusion.ts), on the podium as in
// battle, measured from its real shoes and following its drawn runs.
export const GARAGE_TRACK_AXIS_YAW_RAD = GARAGE_HERO_HEADING_RAD;
export const GARAGE_PODIUM_TOP_Y_M = GARAGE_PLATFORM_GEOMETRY.topYM;
const PODIUM_TREAD_UV_YAW_OFFSET_RAD = -Math.PI / 2;
const GARAGE_FLOOR_SIZE_M = 46;
const GARAGE_PODIUM_RADIUS_M = GARAGE_PLATFORM_GEOMETRY.deckRadiusM;

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
function dither(
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

// --- roof deck: corrugated sheeting seen from below, with lap seams and grime -------------------------------------
function makeRoofDeckTexture(rng: RandomSource): HTMLCanvasElement {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = get2dContext(c, { willReadFrequently: true });
  // the underside of galvanised liner sheets, warm grey (2026-10-14, GA.05: the ribs are geometry now, garageVerdantHall.ts)
  g.fillStyle = '#9fa2a1'; // a light grey liner (GA.05: the brown underside read as rust)
  g.fillRect(0, 0, S, S);
  // sheet laps across the ribs and soot from the heaters
  for (const y of [S * 0.5, S]) {
    g.fillStyle = 'rgba(12,14,16,0.45)';
    g.fillRect(0, y - 3, S, 3);
  }
  for (let i = 0; i < 18; i++) {
    const x = rng() * S, y = rng() * S, r = 20 + rng() * 60;
    const bg = g.createRadialGradient(x, y, 0, x, y, r);
    bg.addColorStop(0, 'rgba(14,16,18,0.18)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return c;
}

// --- corrugated steel wall texture (vertical ribs + girders + grime) --------
function makeWallTexture(rng: RandomSource): HTMLCanvasElement {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = get2dContext(c, { willReadFrequently: true });
  // base panel color: a painted warm grey sheet (2026-10-10, wave 357: "near-black navy walls"; 2026-10-11, wave 402:
  // "the hall drowned in a flat dark-navy cast")
  g.fillStyle = '#6a675f';
  g.fillRect(0, 0, W, H);
  // The ribs, the girts' lines, the concrete base and its hazard band were painted here until 2026-10-14 (GA.05, the
  // props standard: no painted detail); they are geometry now (garageVerdantHall.ts). The sheet keeps its weathering.
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
// Monument Grotesk has no condensed cut: bake at 44px but shrink-to-fit against the
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
        ? '#6f8f78' // a worn, greyed green (the re-judge, 2026-10-15: the TEARDOWN sign was saturated)
        : '#c9a22c';
  const inkBright = /NO SMOKING|FLAMMABLE|FIRE/.test(upper)
    ? '#e06a5c'
    : /^BAY\b/.test(upper)
      ? '#68a8ce'
      : /SERVICE|RELikt|TEARDOWN/i.test(upper)
        ? '#86a28d'
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
    // shrink-to-fit: Monument Grotesk is wider than the retired condensed cut, and the
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
  // font mandate: bake in Monument Grotesk — redraw once if the face lands
  // after the first bake (caller flips needsUpdate on the wrapping texture).
  if (document.fonts && !document.fonts.check(SIGN_FONT)) {
    document.fonts.load(SIGN_FONT).then(faces => { if (faces.length) draw(); }).catch(() => {});
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
/** The platform kit and the display atlas runtime, loaded at Garage idle (never on the boot path). */
const loadPlatformKit = async () => {
  const [platform, atlas] = await Promise.all([import('./garagePlatformKit.ts'), import('./garageDisplayAtlas.ts')]);
  return { platform, atlas };
};

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
  // The hall floor's look is the finished slab laid over this one (GA.05, addHallFloorFinish below); this plane keeps the
  // depth and the shadows under it. The old 512 px floor canvas drew 275,525 values from the stage's stream (90 blots,
  // 7 stains, 2,600 specks, a 512 x 512 dither); they are drawn and dropped so every later prop keeps its place.
  for (let skip = 0; skip < 275_525; skip += 1) rng();
  const floorMat = shadowMat(new THREE.MeshStandardMaterial({
    color: 0x57554f, roughness: 0.62, metalness: 0.08, // (2026-10-08: the full sky light it always took; materialEnvIntensity.ts)
    emissive: 0x14120e, emissiveIntensity: 0.5,
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
  // the garage r9 kit's DISPLAY-LIT key (garageDisplayAtlas.ts: banners, prints, plates, readouts, lenses), the wall
  // signs' map + emissive map program, so a boot that starts outdoors never compiles it on its first visit
  addOutdoorSeed('display-lit', seedStandard({
    color: 0xffffff, map: outdoorSeedColor, emissive: 0xffffff, emissiveMap: outdoorSeedColor, emissiveIntensity: 1,
    roughness: 0.6, metalness: 0.1,
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
  // p2 trees lane (2026-10-02): the desktop groves grow their trees (vegetation.ts buildGrownGarageTree), whose wood
  // reads the four-style bark sheet and its normals — one more instanced program, seeded under the same cover
  if (getDeviceTier() !== 'mobile') {
    addOutdoorSeed('tree-bark-instance', seedStandard({
      color: 0xffffff, map: outdoorSeedColor, normalMap: outdoorSeedNormal, vertexColors: true, roughness: 0.92, metalness: 0,
    }), { instanced: true });
  }
  addOutdoorSeed('ground-instance-color', seedStandard({
    color: 0xffffff,
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  }), { instanced: true, instanceColor: true });
  // the outdoor packs' graded hardstand (garageHardstandProgram.ts): transparent, writing no depth, its own program
  {
    const hardstandSeed = new THREE.MeshStandardMaterial({
      color: 0xffffff, map: outdoorSeedColor, normalMap: outdoorSeedNormal, normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.94, metalness: 0.02, transparent: true, depthWrite: false, colorWrite: false,
    });
    engineCtx?.setupShadowMaterial?.(hardstandSeed, garageHardstandGradedHook(outdoorSeedColor, 0) as THREE.Material['onBeforeCompile']);
    hardstandSeed.customProgramCacheKey = () => GARAGE_HARDSTAND_PROGRAM_KEY;
    addOutdoorSeed('hardstand-graded', track(hardstandSeed));
    // The shared grain the outdoor floors multiply in is generated once, in the browser's idle time after the Garage
    // settles, not on the first outdoor visit (the switch ABBA, 2026-10-14: Sirocco's first cold visit presented
    // later than main's). Never on the boot path: an idle callback, or a late timeout where there is none.
    // The concrete detail relief (six of the nine yards pour slabs) follows it in its own idle slice (GA.03, the critic
    // panel's detail layer); the other ground types are generated after their first visit's first frame.
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    const later = (work: () => void, timeout: number): void => {
      if (typeof idle === 'function') idle(work, { timeout });
      else setTimeout(work, timeout / 2);
    };
    const floorAnisotropy = aniso >= 8 ? 16 : aniso;
    const warmConcrete = (): void => { garageHardstandDetailTexture('concrete', floorAnisotropy); };
    const warmGrain = (): void => { garageHardstandGrainTexture(floorAnisotropy); later(warmConcrete, 8000); };
    later(warmGrain, 6000);
  }
  // The hall's finished floor (GA.05; the critic panel: "the floor is a smear ... a power-floated slab: saw-cut joints on
  // a ~6 m grid, a sheen that catches lamp and window highlights, track scuffs to the shutter, oil spots at the bays ...
  // a detail map so it stays sharp up close"): garageVerdantFloor.ts's 22 px/m slab albedo on the graded floor program
  // the outdoor seeds compile anyway (no new program), with the concrete detail relief (aggregate, crazing, a broomed
  // grain) and a lower roughness for the sheen; it lies 3 mm over the depth-writing floor, drawn first of the decals.
  const shutterSpan = verdantHallShutter(HW);
  function addHallFloorFinish(): void {
    const albedo = track(new THREE.DataTexture(
      buildVerdantFloorAlbedo({ halfWidthM: HW, shutterX: shutterSpan.x }),
      VERDANT_FLOOR_TEXELS, VERDANT_FLOOR_TEXELS, THREE.RGBAFormat,
    ));
    albedo.colorSpace = THREE.SRGBColorSpace;
    albedo.magFilter = THREE.LinearFilter;
    albedo.minFilter = THREE.LinearMipmapLinearFilter;
    albedo.generateMipmaps = true;
    albedo.anisotropy = aniso >= 8 ? 16 : aniso;
    albedo.needsUpdate = true;
    const finish = new THREE.MeshStandardMaterial({
      map: albedo, normalMap: outdoorSeedNormal, normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.54, metalness: 0.04, emissive: 0x14120e, emissiveIntensity: 0.5,
      transparent: true, depthWrite: false,
    });
    engineCtx?.setupShadowMaterial?.(finish, garageHardstandGradedHook(null, 0,
      { uniform: garageHardstandDetailUniform('concrete'), kind: 'concrete' }) as THREE.Material['onBeforeCompile']);
    finish.customProgramCacheKey = () => GARAGE_HARDSTAND_PROGRAM_KEY;
    finish.polygonOffset = true;
    finish.polygonOffsetFactor = -1;
    finish.polygonOffsetUnits = -1;
    track(finish);
    const geometry = track(new THREE.PlaneGeometry(HW * 2, HW * 2));
    geometry.rotateX(-Math.PI / 2);
    geometry.setAttribute('hardstandBlend', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count).fill(1), 1));
    const mesh = new THREE.Mesh(geometry, finish);
    mesh.name = 'garage_verdant_floor_finish';
    mesh.position.y = GARAGE_PLATFORM_GEOMETRY.groundSurfaceYM + 0.003;
    mesh.renderOrder = -1;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }
  addHallFloorFinish();

  // Daylight in the hall (GA.05; the critic panel: "the roof lights and clerestories show sky, but no daylight reaches the
  // floor ... a cool rect light or baked patch under each roof-light strip and the shutter opening"): soft patches of
  // cool skylight under the three roof lights, broken by the trusses' shadows, and a warmer wedge of daylight through the
  // shutter, added onto the floor in one draw on the decals' program (no new light, no new program).
  function addHallDaylight(): void {
    // a two-tint atlas (cool skylight above, warm sun below), each a soft-edged rectangle, so one map-only material (the
    // floor decals' program) draws every patch
    const S = 64;
    const data = new Uint8Array(S * S * 2 * 4);
    const tints: Array<readonly [number, number, number]> = [[0.62, 0.72, 0.86], [1.0, 0.93, 0.8]];
    for (let half = 0; half < 2; half++) {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const fx = Math.min(1, Math.min(x + 0.5, S - x - 0.5) / (S * 0.32));
          const fy = Math.min(1, Math.min(y + 0.5, S - y - 0.5) / (S * 0.22));
          const v = (fx * fx * (3 - 2 * fx)) * (fy * fy * (3 - 2 * fy));
          const at = ((half * S + y) * S + x) * 4;
          for (let c = 0; c < 3; c++) data[at + c] = Math.round(255 * v * tints[half][c]);
          data[at + 3] = 255;
        }
      }
    }
    const soft = track(new THREE.DataTexture(data, S, S * 2, THREE.RGBAFormat));
    soft.magFilter = THREE.LinearFilter;
    soft.minFilter = THREE.LinearFilter;
    soft.needsUpdate = true;
    const positions: number[] = [], uvs: number[] = [];
    const y = GARAGE_PLATFORM_GEOMETRY.groundSurfaceYM + 0.006;
    const quad = (corners: ReadonlyArray<readonly [number, number]>, half: 0 | 1): void => {
      const v0 = half * 0.5, v1 = v0 + 0.5;
      const uv = [[0, v0], [1, v0], [1, v1], [0, v1]];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        positions.push(corners[k][0], y, corners[k][1]);
        uvs.push(uv[k][0], uv[k][1]);
      }
    };
    // the roof lights run along z at x = -11.5, 0, 11.5 (2.4 m); their light lands a little wider, cut by the trusses
    const trussZ = [-18, -9, 0, 9, 18];
    for (const x of [-11.5, 0, 11.5]) {
      const edges = [-HW + 1.2, ...trussZ, HW - 1.2];
      for (let i = 0; i < edges.length - 1; i++) {
        const z0 = edges[i] + 0.35, z1 = edges[i + 1] - 0.35;
        quad([[x - 1.9, z1], [x + 1.9, z1], [x + 1.9, z0], [x - 1.9, z0]], 0);
      }
    }
    // the shutter's wedge: daylight through the opening, widening and fading into the hall (the drain at its foot)
    const [sx0, sx1] = shutterSpan.x;
    // (counter-clockwise seen from above: the first wedge faced down and was culled)
    quad([[sx0 - 0.15, HW - 0.15], [sx1 + 0.15, HW - 0.15], [sx1 + 0.9, HW - 6.2], [sx0 - 0.9, HW - 6.2]], 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    track(geometry);
    const material = track(new THREE.MeshBasicMaterial({
      map: soft, color: 0x8c9094, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'garage_verdant_daylight_on_floor';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }
  addHallDaylight();
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

  // subtle contact-glow pool under the podium (fake bounce light). Fleet lane round 2 (2026-10-08; waves 264-269:
  // "almost no contact shadow under the hull"): the pool peaked at its centre, exactly under the hull, and lit the floor
  // where the vehicle's contact shadow falls. It is now a ring of bounce round the podium, dark under the tank.
  const poolC = document.createElement('canvas');
  poolC.width = poolC.height = 256;
  const pg = get2dContext(poolC);
  const pgrad = pg.createRadialGradient(128, 128, 10, 128, 128, 128);
  pgrad.addColorStop(0, 'rgba(255,238,205,0)');
  pgrad.addColorStop(0.3, 'rgba(255,238,205,0.02)');
  pgrad.addColorStop(0.5, 'rgba(255,238,205,0.12)');
  pgrad.addColorStop(0.7, 'rgba(255,238,205,0.08)');
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
  // alignment ring with radial ticks, a center datum cross and grime speckle
  // (2026-10-08: its twin tread wear bands went with the floor's, see
  // GARAGE_TRACK_AXIS_YAW_RAD: the hero's live ground occlusion is its contact).
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
    color: 0xffffff, roughness: 0.64, metalness: 0.1,
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
  // Cylinder cap UVs lay the texture's vertical along local X, 90 degrees across tank-forward: the podium turns by the
  // hero's heading and that offset, so its painted datum stays square to the hull.
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

  // --- the garage r9 platform kit (garagePlatformKit.ts) -----------------------------------------------------------
  // The turntable's contract is untouched; the kit dresses it: one collar finish per Garage over the podium's side (the
  // hazard chevrons survive only in Verdant, on yellow epoxy), a dark slewing gap and a polished ring at the deck's edge,
  // 48 warm LED pucks set in the collar top (they replace the emissive rim torus), a trench cover to a control pedestal
  // off the hero's halo, and a segmented steel deck (1024 px albedo, 512 px normal) painted in idle slices and shared by
  // every Garage. The kit loads at idle, never on the boot path; the deck carries a flat normal until its own is painted,
  // so it compiles the outdoor seed's map + normal program from the start and the swap changes no program.
  podTopMat.normalMap = outdoorSeedNormal;
  podTopMat.normalScale = new THREE.Vector2(0.6, 0.6);
  const platformCollars = new Map<string, THREE.Group>();
  let platformKit: Awaited<ReturnType<typeof loadPlatformKit>> | null = null;
  let platformCollarShown: THREE.Group | null = null;
  let platformCollarWanted = getGarageVariant(initialVariantId).architecture as string;
  const platformCollarSolid = track(shadowMat(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.62, metalness: 0.3,
  })));
  platformCollarSolid.name = 'garage:platform-collar';
  let platformCollarDisplay: THREE.Material | null = null;
  const buildPlatformCollar = (kit: NonNullable<typeof platformKit>, architecture: string): THREE.Group => {
    let collar = platformCollars.get(architecture);
    if (!collar) {
      const built = kit.platform.buildGaragePlatformCollar(architecture as Parameters<typeof kit.platform.buildGaragePlatformCollar>[0],
        { pedestalAngle: 2.0, windAngle: 0.8 });
      collar = new THREE.Group();
      collar.name = `garage_platform_collar_${architecture}`;
      const solid = new THREE.Mesh(track(built.solid), platformCollarSolid);
      solid.receiveShadow = true;
      solid.castShadow = true;
      collar.add(solid);
      if (built.display) {
        platformCollarDisplay ||= track(kit.atlas.createGarageDisplayMaterial(shadowMat));
        const lights = new THREE.Mesh(track(built.display), platformCollarDisplay);
        lights.name = 'garage_platform_pucks';
        lights.onBeforeRender = () => { kit.atlas.ensureGarageDisplayAtlas({ anisotropy: aniso }); };
        collar.add(lights);
      }
      for (const mesh of collar.children) { mesh.matrixAutoUpdate = false; mesh.updateMatrix(); }
      collar.visible = false;
      platformCollars.set(architecture, collar);
      group.add(collar);
    }
    return collar;
  };
  const showPlatformCollar = (architecture: string): void => {
    platformCollarWanted = architecture;
    if (!platformKit) return;
    const collar = buildPlatformCollar(platformKit, architecture);
    if (platformCollarShown !== collar) {
      if (platformCollarShown) platformCollarShown.visible = false;
      collar.visible = true;
      platformCollarShown = collar;
    }
    rimRing.visible = false;
    group.userData.platformCollar = architecture;
    requestRender();
  };
  {
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    const later = (work: () => void, timeout: number): void => {
      if (typeof idle === 'function') idle(work, { timeout });
      else setTimeout(work, Math.min(timeout, 200));
    };
    const paintDeck = (): void => {
      if (!platformKit) return;
      const painter = platformKit.platform.createGarageDeckPainter(1024, 0);
      const step = (): void => {
        if (!painter.step(10)) { later(step, 300); return; }
        const albedo = track(new THREE.DataTexture(painter.albedo, painter.size, painter.size, THREE.RGBAFormat));
        albedo.colorSpace = THREE.SRGBColorSpace;
        albedo.generateMipmaps = true;
        albedo.minFilter = THREE.LinearMipmapLinearFilter;
        albedo.magFilter = THREE.LinearFilter;
        albedo.anisotropy = aniso >= 8 ? 16 : aniso;
        albedo.needsUpdate = true;
        const normal = track(new THREE.DataTexture(painter.normal, painter.size / 2, painter.size / 2, THREE.RGBAFormat));
        normal.generateMipmaps = true;
        normal.minFilter = THREE.LinearMipmapLinearFilter;
        normal.magFilter = THREE.LinearFilter;
        normal.needsUpdate = true;
        const previous = podTopMat.map;
        podTopMat.map = albedo;
        podTopMat.normalMap = normal;
        previous?.dispose();
        group.userData.platformDeck = 'segmented-steel-1024';
        requestRender();
      };
      later(step, 300);
    };
    if (typeof document !== 'undefined') {
      later(() => {
        void loadPlatformKit().then((kit) => {
          platformKit = kit;
          showPlatformCollar(platformCollarWanted);
          paintDeck();
          // the other Garages' collars, one per idle slice, so a switch never builds one
          const queue = Object.keys(kit.platform.GARAGE_PLATFORM_COLLARS).filter((key) => !platformCollars.has(key));
          const prebuild = (): void => {
            const next = queue.shift();
            if (!next) return;
            buildPlatformCollar(kit, next);
            later(prebuild, 300);
          };
          // all of it settles within a few seconds of the Garage presenting (the timing harness's warm frames follow)
          later(prebuild, 300);
        }).catch(() => {});
      }, 3000);
    }
  }

  // --- the hall: walls, roof and openings (garageVerdantHall.ts) --------------------------------------------------------
  // GA.05 (2026-10-14): the four painted wall planes and the flat ceiling became a building: a concrete upstand, profiled
  // sheeting on girts between I-section columns, clerestories and a roller shutter with the country beyond, roof lights
  // through a profiled roof. The wall and roof keep their maps (now weathering only) and so their programs; steel,
  // concrete and the country ride the outdoor packs' vertex-colour program and the glass theirs, all seeded under the
  // boot cover above, so the hall adds no shader program. The fake-bounce emissives are warm neutrals now (wave 402:
  // "the hall drowned in a flat dark-navy cast").
  const wallTexBase = makeWallTexture(rng);
  const wallMat = shadowMat(new THREE.MeshStandardMaterial({
    map: track(canvasTexture(wallTexBase, { aniso, repeat: [3, 1] })),
    roughness: 0.7, metalness: 0.3,
    emissive: 0x14120f, emissiveIntensity: 0.45,
  }));
  track(wallMat);
  const roofDeck = makeRoofDeckTexture(rng);
  // the roof's underside is a light grey liner (GA.05, the critic panel: "the roof underside is tinted brown and reads as
  // rust ... a white or grey liner panel; take the warmth from the lamp colour"): a neutral bounce, not a brown glow
  const ceilMat = shadowMat(new THREE.MeshStandardMaterial({
    map: track(canvasTexture(roofDeck, { aniso, repeat: [4, 4] })),
    roughness: 0.82, metalness: 0.2,
    emissive: 0x151617, emissiveIntensity: 0.65,
  }));
  track(ceilMat);
  const hall = buildVerdantHallParts(HW, WALL_H);
  const hallSteelMat = track(shadowMat(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.58, metalness: 0.4, emissive: 0x100e0b, emissiveIntensity: 0.5,
  })));
  const hallConcreteMat = track(shadowMat(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0.02, emissive: 0x100e0b, emissiveIntensity: 0.5,
  })));
  // milky wired glass and twin-wall roof lights (GA.05, the critic panel: "cyan glazing is the most saturated thing in
  // the frame ... milky twin-wall polycarbonate roof lights"): a pale grey, half opaque, so the sky behind reads soft
  const hallGlassMat = track(shadowMat(new THREE.MeshStandardMaterial({
    color: 0xd3d8d6, roughness: 0.35, metalness: 0.02, transparent: true, opacity: 0.52, depthWrite: false,
    emissive: 0x2c3034, emissiveIntensity: 0.6,
  })));
  const hallExteriorMat = track(shadowMat(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.96, metalness: 0,
  })));
  const addHallPart = (name: string, part: HallMesh, material: THREE.Material,
    { uv = false, color = true, cast = true, receive = true } = {}): THREE.Mesh => {
    const mesh = new THREE.Mesh(track(part.toGeometry({ uv, color })), material);
    mesh.name = name;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    return mesh;
  };
  function addHangarShell(): void {
    // The walls stop the garage sun (2026-10-10): without them it lit the floor straight through the shell. The roof
    // casts nothing, so the sun's key on the hero is unchanged; its lights let the sky show.
    addHallPart('garage_verdant_hall_sheeting', hall.sheeting, wallMat, { uv: true, color: false });
    addHallPart('garage_verdant_hall_roof', hall.roof, ceilMat, { uv: true, color: false, cast: false });
    addHallPart('garage_verdant_hall_steel', hall.steel, hallSteelMat);
    addHallPart('garage_verdant_hall_concrete', hall.concrete, hallConcreteMat);
    addHallPart('garage_verdant_hall_glass', hall.glass, hallGlassMat, { color: false, cast: false, receive: false });
    addHallPart('garage_verdant_country', hall.exterior, hallExteriorMat, { cast: false });
    group.userData.verdantHall = hall.stats;
  }
  addHangarShell();
  const trussMat = shadowMat(new THREE.MeshStandardMaterial({
    color: 0x4f514d, roughness: 0.6, metalness: 0.5,
    emissive: 0x15130f, emissiveIntensity: 0.45,
  }));
  track(trussMat);
  // The roof structure merges into one geometry (trusses, webs and purlins); the roof lights are real openings in the
  // profiled roof (garageVerdantHall.ts), framed and glazed.
  function addRoofTrusses(): void {
    const parts: THREE.BufferGeometry[] = [];
    const place = (geometry: THREE.BufferGeometry, x: number, y: number, z: number, rotationZ = 0): void => {
      const placed = geometry.clone();
      if (rotationZ) placed.rotateZ(rotationZ);
      placed.translate(x, y, z);
      parts.push(placed);
    };
    const chordGeo = new THREE.BoxGeometry(HW * 2, 0.24, 0.22);
    const panel = 2.3;
    const depth = 1.1;
    const webGeo = new THREE.BoxGeometry(0.11, Math.hypot(panel, depth), 0.11);
    const purlinGeo = new THREE.BoxGeometry(0.16, 0.2, HW * 2);
    const roofTop = WALL_H - 0.12;
    const panels = Math.floor((HW * 2) / panel);
    for (let index = -2; index <= 2; index++) {
      const z = index * 9;
      for (const y of [roofTop - 0.12, roofTop - 0.12 - depth]) place(chordGeo, 0, y, z);
      // Warren web: diagonals alternating across each 2.3 m panel
      for (let k = 0; k < panels; k++) {
        place(webGeo, -HW + (k + 0.5) * panel, roofTop - 0.12 - depth / 2, z, (k % 2 ? 1 : -1) * Math.atan2(panel, depth));
      }
    }
    for (let x = -HW + 1.5; x < HW; x += 3) place(purlinGeo, x, roofTop + 0.02, 0);
    const roof = new THREE.Mesh(track(mergeGeometries(parts, false)!), trussMat);
    roof.name = 'garage_verdant_roof_structure';
    group.add(roof);
    for (const part of parts) part.dispose();
    chordGeo.dispose(); webGeo.dispose(); purlinGeo.dispose();
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
  const highbayPools: Array<[number, number]> = [];
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
      // camo_spotting r2: the highbay cast; 2026-10-11 (wave 402: "a flat dark-navy cast"): a warm metal-halide white
      const pointLight = new THREE.PointLight(0xffe8cc, 40, 42, 1.9);
      pointLight.position.set(x, 7.1, z);
      verdantLights.push(pointLight);
      group.add(pointLight);
      // the pool it throws on the floor (wave 357: "the lamps light no pools on the floor"), on the shared pool program
      highbayPools.push([x, z]);
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
      // Fleet lane round 2 (2026-10-08; the veil probe: hiding the Garage's transparents turned a washed, evenly lit hero
      // into a crisp one; waves 264-269 "washed out", "no contact shadow"): the cone's NEAR wall stood between the lens
      // and the tank on every orbit and added its haze over the whole vehicle (the darks of the tracks, tyres and wheel
      // holes lifted to mid grey). Only the far wall draws now: the beam glows behind and around the tank, and the tank
      // occludes it.
      side: THREE.BackSide,
      uniforms: { uColor: { value: new THREE.Color(1.0, 0.925, 0.784) } },
      // Fleet lane 2026-10-08 (the fleet audit: every close, high Garage view of a vehicle sat INSIDE this cone, whose
      // walls then faced the lens all round and laid a pale wash over the whole tank): the beam is a volume seen from
      // outside; with the camera inside it (or within half a metre of its wall) it fades out.
      vertexShader: /* glsl */ `
        varying float vV; varying vec3 vN; varying vec3 vE; varying float vOutside;
        void main() {
          vV = uv.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalMatrix * normal;
          vE = -mv.xyz;
          // the camera in the cone's own frame: open tube, radius 5.6 at y -3.45 to 0.68 at y +3.45
          vec3 cam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
          float wall = mix(5.6, 0.68, clamp((cam.y + 3.45) / 6.9, 0.0, 1.0));
          float beyond = max(length(cam.xz) - wall, max(cam.y - 3.45, -3.45 - cam.y));
          vOutside = smoothstep(-0.5, 0.5, beyond);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vV; varying vec3 vN; varying vec3 vE; varying float vOutside;
        void main() {
          // silhouette feather: surface normal ⟂ view at the tube's edge
          float fres = abs(dot(normalize(vE), normalize(vN)));
          float edge = pow(fres, 1.8);
          // dense at the fixture (uv.y 1), fully dissolved toward the floor
          float grad = pow(clamp(vV, 0.0, 1.0), 1.7);
          gl_FragColor = vec4(uColor, edge * grad * 0.22 * vOutside);
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
      pipe.position.set(-HW + 0.62, pipeY, 0); // clear of the columns' inner flanges (0.48 m), GA.05
      pipe.scale.set(radiusScale, 1, radiusScale);
      pipe.castShadow = true;
      group.add(pipe);
    }
  }
  addWallPipeRuns();
  // pipe brackets clamping the runs to the wall columns (the truss lines, z -18 .. 18)
  const pbGeo = track(new THREE.BoxGeometry(0.3, 0.16, 0.36));
  function addWallPipeBrackets(): void {
    for (const bracketZ of [-18, -9, 0, 9, 18]) {
      const b1 = new THREE.Mesh(pbGeo, bracketMat);
      b1.position.set(-HW + 0.55, 4.85, bracketZ);
      const b2 = new THREE.Mesh(pbGeo, bracketMat);
      b2.position.set(-HW + 0.55, 5.35, bracketZ);
      group.add(b1, b2);
    }
  }
  addWallPipeBrackets();
  // vertical drop with a valve wheel near the workbench
  const dropGeo = track(new THREE.CylinderGeometry(0.09, 0.09, 4.3, 10));
  const drop = new THREE.Mesh(dropGeo, pipeMat);
  drop.position.set(-HW + 0.62, 2.65, 5.6);
  drop.castShadow = true;
  group.add(drop);
  const valveGeo = track(new THREE.TorusGeometry(0.18, 0.035, 8, 18));
  const valve = new THREE.Mesh(valveGeo, track(shadowMat(new THREE.MeshStandardMaterial({
    color: 0x8a2f26, roughness: 0.5, metalness: 0.4,
  }))));
  valve.rotation.y = Math.PI / 2;
  valve.position.set(-HW + 0.9, 1.7, 5.6);
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
  // The hall's two plates carry the atlas's bay numeral and no-smoking pictogram (garage r9 K3: "less text, more
  // pictograms"; type from the atlas generator, never the browser's canvas), fitted at their own aspect on the dark
  // plates, on the DISPLAY-LIT key the wall signs always used. The old canvas plates drew their wear from the stage's
  // random stream: the same draws are spent so everything after them keeps its place.
  for (let draw = 0; draw < 2600; draw += 1) rng();
  const signMat = track(createGarageDisplayMaterial((material) => { shadowMat(material); }));
  const signPlane = (legend: string, maxW: number, maxH: number): THREE.PlaneGeometry => {
    const rect = garageDisplayRect(garageDisplaySignRect(legend));
    const aspect = (rect.u1 - rect.u0) / (rect.v1 - rect.v0) * 2;
    const w = Math.min(maxW, maxH * aspect), h = w / aspect;
    const plane = track(new THREE.PlaneGeometry(w, h));
    const uv = plane.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, rect.u0 + uv.getX(i) * (rect.u1 - rect.u0), rect.v0 + uv.getY(i) * (rect.v1 - rect.v0));
    return plane;
  };
  const signGeoBig = signPlane('BAY 01', 3.4, 1.7);
  const signGeoSmall = signPlane('NO SMOKING', 2.1, 1.05);
  const signMat1 = signMat, signMat2 = signMat;
  // north-wall sign (faces +z): halo on the wall, plate, then the board
  const halo1 = new THREE.Mesh(track(new THREE.PlaneGeometry(4.6, 2.6)), haloMat);
  halo1.position.set(-13.5, 5.55, -HW + 0.05); // over the sheeting's crowns; the plate sits on the girts (GA.05)
  const plate1 = new THREE.Mesh(track(new THREE.BoxGeometry(3.72, 1.92, 0.05)), plateMat);
  plate1.position.set(-13.5, 5.6, -HW + 0.145);
  const sign1 = new THREE.Mesh(signGeoBig, signMat1);
  sign1.onBeforeRender = () => { ensureGarageDisplayAtlas({ anisotropy: aniso }); };
  sign1.position.set(-13.5, 5.6, -HW + 0.175);
  group.add(halo1, plate1, sign1);
  // west-wall sign (faces +x)
  const halo2 = new THREE.Mesh(track(new THREE.PlaneGeometry(2.9, 1.7)), haloMat);
  halo2.rotation.y = Math.PI / 2;
  halo2.position.set(-HW + 0.05, 3.37, -6);
  const plate2 = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 1.2, 2.3)), plateMat);
  plate2.position.set(-HW + 0.145, 3.4, -6);
  const sign2 = new THREE.Mesh(signGeoSmall, signMat2);
  sign2.onBeforeRender = () => { ensureGarageDisplayAtlas({ anisotropy: aniso }); };
  sign2.rotation.y = Math.PI / 2;
  sign2.position.set(-HW + 0.175, 3.4, -6);
  group.add(halo2, plate2, sign2);

  // The K2 bay's work lamp (2026-10-11). This was the low west-wall fill (hud_ui r2), then the K2 belly weld's light
  // while crews welded there; with no people in the Garages there is no arc, so it hangs over the parked hot-work
  // corner as a steady warm lamp in Verdant and is dark outdoors. Same light count, so no shader program changes. The
  // indoor set is half-turned, hence the negated Garage-frame point.
  const fill = new THREE.PointLight(0xffd9a6, 10, 9, 2);
  fill.name = 'garage_verdant_k2_work_light';
  fill.position.set(-VERDANT_K2_WORK_LIGHT.x, VERDANT_K2_WORK_LIGHT.y, -VERDANT_K2_WORK_LIGHT.z);
  fill.castShadow = false;
  verdantLights.push(fill);
  group.add(fill);

  // content_breadth r6 (critic minor: "lower hull/running gear falls into
  // shadow"): low bounce fill aimed at the hull lower third / running gear —
  // parked near the podium front-right, tuned so tracks/wheels read under
  // the moody key without flattening it.
  const gearFill = new THREE.PointLight(0xeee2d0, 14, 9, 2);
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
  // (a splash centred on the fixture's footprint, unlike the podium's ring: nothing stands under this one)
  const splashC = document.createElement('canvas');
  splashC.width = splashC.height = 256;
  {
    const sg = get2dContext(splashC);
    const sgrad = sg.createRadialGradient(128, 128, 10, 128, 128, 128);
    sgrad.addColorStop(0, 'rgba(255,238,205,0.30)');
    sgrad.addColorStop(0.55, 'rgba(255,238,205,0.10)');
    sgrad.addColorStop(1, 'rgba(255,238,205,0)');
    sg.fillStyle = sgrad;
    sg.fillRect(0, 0, 256, 256);
  }
  const pool2 = new THREE.Mesh(track(new THREE.PlaneGeometry(14, 14)), poolMat);
  pool2.rotation.x = -Math.PI / 2;
  pool2.position.set(-15.5, 0.04, 4);
  pool2.material = track(new THREE.MeshBasicMaterial({
    map: track(canvasTexture(splashC)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    opacity: 0.55,
  }));
  group.add(pool2);
  for (const [x, z] of highbayPools) {
    const lampPool = new THREE.Mesh(track(new THREE.PlaneGeometry(9, 9)), pool2.material);
    lampPool.rotation.x = -Math.PI / 2;
    lampPool.position.set(x, 0.038, z);
    lampPool.name = 'garage_verdant_highbay_pool';
    group.add(lampPool);
  }

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
    // 1. painted keep-clear ring, one continuous worn line (2026-10-10, wave 357: dashes read as a car park)
    const ringC = document.createElement('canvas');
    ringC.width = ringC.height = 512;
    const rg = get2dContext(ringC);
    rg.translate(256, 256);
    rg.strokeStyle = 'rgba(196,166,54,0.5)';
    rg.lineWidth = 7;
    rg.beginPath();
    rg.arc(0, 0, 232, 0, Math.PI * 2);
    rg.stroke();
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
    // one run, from the junction box to the dais's socket (GA.05, the critic panel: a second run ended loose on the
    // floor and read as "a stray black rod")
    const cableRuns = [
      [[11.2, 0.05, 6.6], [8.6, 0.04, 5.7], [6.9, 0.04, 4.4], [5.2, 0.06, 2.9]],
    ];
    for (const pts of cableRuns) {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      const tube = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 32, 0.045, 8)), cableMat);
      tube.castShadow = true;
      group.add(tube);
    }
    // junction box the long run plugs into, and the plug and socket box on the dais skirt where it ends
    const jbox = new THREE.Mesh(track(new THREE.BoxGeometry(0.5, 0.42, 0.34)), bracketMat);
    jbox.position.set(11.45, 0.21, 6.7);
    jbox.rotation.y = -0.5;
    jbox.castShadow = true;
    group.add(jbox);
    const socket = new THREE.Mesh(track(new THREE.BoxGeometry(0.26, 0.2, 0.18)), bracketMat);
    socket.position.set(5.05, 0.1, 2.8);
    socket.rotation.y = Math.atan2(5.05, 2.8);
    socket.castShadow = true;
    group.add(socket);

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
    showPlatformCollar(getGarageVariant(variantId).architecture);
    // Keep the light objects present in both modes so Three's light-count
    // defines stay invariant. Removing the Verdant fixtures forced every hero
    // tank and decoration material to synchronously relink on first reveal.
    for (const light of verdantLights) {
      light.visible = true;
      light.intensity = isVerdant ? (verdantLightIntensities.get(light) || 0) : 0;
    }
    // The K2 work lamp follows the shared exhibit's layout pose (Verdant's pose is the origin); the loop above already
    // leaves it dark outdoors.
    {
      const [layoutX, layoutZ, layoutYaw] = getGarageWorkshopLayoutPose(getGarageVariant(variantId));
      const c = Math.cos(layoutYaw), sn = Math.sin(layoutYaw);
      const lampX = layoutX + VERDANT_K2_WORK_LIGHT.x * c + VERDANT_K2_WORK_LIGHT.z * sn;
      const lampZ = layoutZ - VERDANT_K2_WORK_LIGHT.x * sn + VERDANT_K2_WORK_LIGHT.z * c;
      fill.position.set(-lampX, VERDANT_K2_WORK_LIGHT.y, -lampZ);
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
    // outdoors the turntable's hazard band is worn paint, not a lit saturated stripe (the re-judge, 2026-10-15: "the cyan
    // and black hazard ring is saturated; desaturate it to worn paint"): half the accent's saturation, a little darker,
    // a third of the glow; Verdant's hall keeps its own
    let edgeGlow = 1;
    if (variant.id !== 'verdant_motor_pool') {
      const hsl = { h: 0, s: 0, l: 0 };
      platformEdge.getHSL(hsl);
      platformEdge.setHSL(hsl.h, hsl.s * 0.5, hsl.l * 0.86);
      edgeGlow = 0.35;
    }
    podTopMat.color.setHex(variant.platformTint);
    podSideMat.color.copy(platformEdge);
    podSideMat.emissive.copy(platformEdge).multiplyScalar(edgeGlow);
    rimRingMat.emissive.copy(platformEdge).multiplyScalar(edgeGlow);
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
