// src/ui/garageStage.ts — lightweight hero turntable for authentic Garage packs.
//
// The former indoor hangar was constructed in full and then hidden behind
// every outdoor Garage variant. This owner now creates only the objects that
// are actually visible: the textured hero podium, its rim, and the bounded
// authentic environment controller. Garage lighting is owned once by
// garagePhasePresentationRuntime, so this module adds no duplicate live lights.
import * as THREE from 'three';
import { getGarageVariant } from '../game/garageVariants.ts';
import { GARAGE_HERO_HEADING_RAD } from '../game/garagePresentationPose.ts';
import {
  createGarageArchitectureController,
  type GarageArchitectureStats,
} from './garageArchitecture.ts';

type RandomSource = () => number;

interface GarageStageEngineContext {
  anisotropy?: number;
  setupShadowMaterial?(material: THREE.Material): void;
}

export interface GarageStageRuntime {
  group: THREE.Group;
  setVariant(variantId: string): string;
  stats(): GarageArchitectureStats;
  dispose(): void;
}

export const GARAGE_TRACK_AXIS_YAW_RAD = GARAGE_HERO_HEADING_RAD;
export const GARAGE_PODIUM_TOP_Y_M = 0.36;
const PODIUM_TREAD_UV_YAW_OFFSET_RAD = -Math.PI / 2;
const GARAGE_PODIUM_RADIUS_M = 6;
const GARAGE_TRACK_CENTER_OFFSET_M = 1.55;
const GARAGE_TRACK_SCUFF_WIDTH_M = 0.78;
const GARAGE_TRACK_CLEAT_PITCH_M = 0.32;
const GARAGE_TRACK_CLEAT_THICKNESS_M = 0.065;

function mulberry32(seed: number): RandomSource {
  return function random(): number {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function context2d(
  canvas: HTMLCanvasElement,
  settings?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', settings);
  if (!context) throw new Error('Canvas 2D context is unavailable');
  return context;
}

function canvasTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  repeat: readonly [number, number] | null = null,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

function dither(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  random: RandomSource,
): void {
  const image = context.getImageData(0, 0, width, height);
  for (let index = 0; index < image.data.length; index += 4) {
    const noise = (random() - 0.5) * 255 * 0.05;
    image.data[index] += noise;
    image.data[index + 1] += noise;
    image.data[index + 2] += noise;
  }
  context.putImageData(image, 0, 0);
}

function drawTrackScuffLane(
  context: CanvasRenderingContext2D,
  centerX: number,
  canvasSize: number,
): void {
  const pixelsPerMeter = canvasSize / (GARAGE_PODIUM_RADIUS_M * 2);
  const width = GARAGE_TRACK_SCUFF_WIDTH_M * pixelsPerMeter;
  const half = width / 2;
  const edge = Math.max(1, 0.055 * pixelsPerMeter);
  const pitch = GARAGE_TRACK_CLEAT_PITCH_M * pixelsPerMeter;
  const cleatHeight = Math.max(1, GARAGE_TRACK_CLEAT_THICKNESS_M * pixelsPerMeter);
  const body = context.createLinearGradient(centerX - half, 0, centerX + half, 0);
  body.addColorStop(0, 'rgba(20,24,28,0)');
  body.addColorStop(0.14, 'rgba(20,24,28,0.24)');
  body.addColorStop(0.32, 'rgba(20,24,28,0.34)');
  body.addColorStop(0.68, 'rgba(20,24,28,0.34)');
  body.addColorStop(0.86, 'rgba(20,24,28,0.24)');
  body.addColorStop(1, 'rgba(20,24,28,0)');
  context.fillStyle = body;
  context.fillRect(centerX - half, 0, width, canvasSize);
  context.fillStyle = 'rgba(14,18,22,0.34)';
  context.fillRect(centerX - half * 0.72, 0, edge, canvasSize);
  context.fillRect(centerX + half * 0.72 - edge, 0, edge, canvasSize);
  context.fillStyle = 'rgba(10,14,18,0.42)';
  const phase = canvasSize / 2;
  const first = phase + Math.ceil(-phase / pitch) * pitch;
  for (let y = first; y <= canvasSize; y += pitch) {
    context.fillRect(centerX - half * 0.82, y - cleatHeight / 2, width * 0.82, cleatHeight);
  }
}

function makeHazardTexture(): HTMLCanvasElement {
  const width = 512;
  const height = 64;
  const random = mulberry32(60211);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = context2d(canvas);
  context.fillStyle = '#c9a22c';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#1c1e20';
  for (let x = -height; x < width + height; x += 64) {
    context.beginPath();
    context.moveTo(x, height);
    context.lineTo(x + 32, 0);
    context.lineTo(x + 64, 0);
    context.lineTo(x + 32, height);
    context.closePath();
    context.fill();
  }
  for (let index = 0; index < 240; index += 1) {
    context.fillStyle = 'rgba(70,72,74,0.35)';
    context.fillRect(random() * width, random() * height, 2, 2);
  }
  return canvas;
}

function makePodiumTop(random: RandomSource): HTMLCanvasElement {
  const size = 512;
  const center = size / 2;
  const pixels = size / 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = context2d(canvas, { willReadFrequently: true });
  context.fillStyle = '#45484c';
  context.fillRect(0, 0, size, size);
  for (let index = 0; index < 40; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 30 + random() * 100;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, random() < 0.5
      ? 'rgba(30,32,34,0.10)' : 'rgba(120,124,128,0.07)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  const offset = GARAGE_TRACK_CENTER_OFFSET_M * (size / (GARAGE_PODIUM_RADIUS_M * 2));
  drawTrackScuffLane(context, center - offset, size);
  drawTrackScuffLane(context, center + offset, size);
  context.strokeStyle = 'rgba(188,192,198,0.34)';
  context.lineWidth = 7 * pixels;
  context.beginPath();
  context.arc(center, center, 430 * pixels, 0, Math.PI * 2);
  context.stroke();
  context.lineWidth = 4 * pixels;
  context.beginPath();
  context.arc(center, center, 300 * pixels, 0, Math.PI * 2);
  context.stroke();
  context.lineWidth = 6 * pixels;
  context.beginPath();
  for (let tick = 0; tick < 12; tick += 1) {
    const angle = (tick / 12) * Math.PI * 2;
    context.moveTo(center + Math.cos(angle) * 402 * pixels,
      center + Math.sin(angle) * 402 * pixels);
    context.lineTo(center + Math.cos(angle) * 438 * pixels,
      center + Math.sin(angle) * 438 * pixels);
  }
  context.stroke();
  context.strokeStyle = 'rgba(188,192,198,0.28)';
  context.lineWidth = 7 * pixels;
  context.beginPath();
  context.moveTo(center - 60 * pixels, center);
  context.lineTo(center + 60 * pixels, center);
  context.moveTo(center, center - 60 * pixels);
  context.lineTo(center, center + 60 * pixels);
  context.stroke();
  for (let index = 0; index < 900; index += 1) {
    context.fillStyle = 'rgba(69,72,76,0.9)';
    const angle = random() * Math.PI * 2;
    const radius = (random() < 0.5 ? 430 : 300) * pixels;
    context.fillRect(
      center + Math.cos(angle) * (radius + (random() - 0.5) * 8 * pixels) - 1,
      center + Math.sin(angle) * (radius + (random() - 0.5) * 8 * pixels) - 1,
      1 + random() * 2,
      1 + random() * 2,
    );
  }
  for (let index = 0; index < 1400; index += 1) {
    context.fillStyle = random() < 0.5
      ? 'rgba(28,30,32,0.18)' : 'rgba(140,145,150,0.10)';
    context.fillRect(random() * size, random() * size, 1 + random() * 2, 1 + random() * 2);
  }
  dither(context, size, size, random);
  return canvas;
}

/** Build the visible Garage hero stage and stream its selected scene pack. */
export function createGarageStage(
  engineCtx: GarageStageEngineContext,
  pos: THREE.Vector3,
  initialVariantId = '',
  requestRender: () => void = () => {},
): GarageStageRuntime {
  const group = new THREE.Group();
  group.name = 'garage_stage';
  group.position.copy(pos);
  group.userData.perfOwner = 'garage/visible-stage';
  const anisotropy = engineCtx.anisotropy || 4;
  const resources: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(resource: T): T => {
    resources.push(resource);
    return resource;
  };
  const shadowMaterial = <T extends THREE.Material>(material: T): T => {
    engineCtx.setupShadowMaterial?.(material);
    return track(material);
  };

  const hazard = track(canvasTexture(makeHazardTexture(), anisotropy, [6, 1]));
  const side = shadowMaterial(new THREE.MeshStandardMaterial({
    map: hazard,
    emissive: 0xffffff,
    emissiveMap: hazard,
    emissiveIntensity: 0.3,
    roughness: 0.7,
    metalness: 0.05,
  }));
  const top = shadowMaterial(new THREE.MeshStandardMaterial({
    map: track(canvasTexture(makePodiumTop(mulberry32(90210)), anisotropy)),
    color: 0xffffff,
    roughness: 0.64,
    metalness: 0.1,
    envMapIntensity: 0.5,
  }));
  const podium = new THREE.Mesh(
    track(new THREE.CylinderGeometry(GARAGE_PODIUM_RADIUS_M, 6.35,
      GARAGE_PODIUM_TOP_Y_M, 56)),
    [side, top, top],
  );
  podium.name = 'garage_hero_turntable';
  podium.position.y = GARAGE_PODIUM_TOP_Y_M / 2;
  podium.rotation.y = GARAGE_TRACK_AXIS_YAW_RAD + PODIUM_TREAD_UV_YAW_OFFSET_RAD;
  podium.receiveShadow = true;
  podium.castShadow = true;
  group.add(podium);

  const rimMaterial = shadowMaterial(new THREE.MeshStandardMaterial({
    color: 0x2b2d30,
    roughness: 0.4,
    metalness: 0.6,
    emissive: 0xd9c9a6,
    emissiveIntensity: 0.55,
  }));
  const rim = new THREE.Mesh(track(new THREE.TorusGeometry(6, 0.035, 8, 96)), rimMaterial);
  rim.name = 'garage_turntable_rim';
  rim.rotation.x = Math.PI / 2;
  rim.position.y = GARAGE_PODIUM_TOP_Y_M + 0.002;
  group.add(rim);

  const architecture = createGarageArchitectureController(engineCtx, group, requestRender);
  const setVariant = (variantId: string): string => {
    const variant = getGarageVariant(variantId);
    rimMaterial.emissive.setHex(variant.lightTint);
    const architectureStats = architecture.setVariant(variant);
    group.userData.garageVariantId = variant.id;
    group.userData.garageMapId = variant.mapId;
    group.userData.garageSceneMode = 'authentic-scene-pack';
    group.userData.garageRoofMode = 'open-environment';
    group.userData.garageArchitecture = architectureStats;
    group.userData.visibleStageObjects = 2;
    group.userData.legacyIndoorObjects = 0;
    group.userData.duplicateStageLights = 0;
    return variant.id;
  };
  setVariant(initialVariantId);

  return {
    group,
    setVariant,
    stats: () => architecture.stats(),
    dispose() {
      architecture.dispose();
      group.removeFromParent();
      for (const resource of resources) resource.dispose();
      resources.length = 0;
      group.clear();
    },
  };
}
