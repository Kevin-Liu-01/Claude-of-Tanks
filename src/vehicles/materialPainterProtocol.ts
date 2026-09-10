import type { RuntimeValue } from '../runtimeTypes.ts';
import type { MaterialVisual, PlateFeatures } from './materialPainter.ts';

export interface MaterialPainterDimensions { albedo: number; map: number }
export interface MaterialPainterRequest {
  identity: string;
  visual: MaterialVisual;
  seed: number;
  dimensions: MaterialPainterDimensions;
  plateLines: boolean;
}
export interface MaterialPainterResult {
  identity: string;
  dimensions: MaterialPainterDimensions;
  albedo: Uint8ClampedArray<ArrayBuffer>;
  normal: Uint8ClampedArray<ArrayBuffer>;
  roughness: Uint8ClampedArray<ArrayBuffer>;
  features: PlateFeatures;
}
export interface MaterialPainterMessage {
  requestId: number;
  fontUrl: string;
  request: MaterialPainterRequest;
}
export type MaterialPainterReply =
  | { requestId: number; ok: true; result: MaterialPainterResult }
  | { requestId: number; ok: false };

function record(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function dimension(value: RuntimeValue): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 2 && value <= 4096;
}
function dimensions(value: RuntimeValue): value is MaterialPainterDimensions {
  return record(value) && dimension(value.albedo) && dimension(value.map);
}
function finite(value: RuntimeValue): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function finiteTree(value: RuntimeValue, depth: number, budget: { left: number }): boolean {
  if (--budget.left < 0 || depth > 16) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 8192;
  if (value == null || typeof value === 'boolean') return true;
  if (typeof value !== 'object') return false;
  return Object.values(value).every(child => finiteTree(child, depth + 1, budget));
}

export function isMaterialPainterRequest(value: RuntimeValue): value is MaterialPainterRequest {
  if (!record(value) || !record(value.visual)) return false;
  return typeof value.identity === 'string' && value.identity.length > 0 && value.identity.length <= 8192
    && typeof value.visual.base === 'string' && finite(value.seed)
    && typeof value.plateLines === 'boolean' && dimensions(value.dimensions)
    && finiteTree(value.visual, 0, { left: 100_000 });
}
export function isMaterialPainterMessage(value: RuntimeValue): value is MaterialPainterMessage {
  return record(value) && Number.isSafeInteger(value.requestId) && Number(value.requestId) > 0
    && typeof value.fontUrl === 'string' && value.fontUrl.length <= 4096
    && isMaterialPainterRequest(value.request);
}

function list(value: RuntimeValue, test: (item: RuntimeValue) => boolean): boolean {
  return Array.isArray(value) && value.length <= 1024 && value.every(test);
}
function line(value: RuntimeValue): boolean {
  return record(value) && finite(value.p) && typeof value.weld === 'boolean'
    && typeof value.bolts === 'boolean' && list(value.gaps, gap =>
      Array.isArray(gap) && gap.length === 2 && gap.every(finite));
}
function ring(value: RuntimeValue): boolean {
  return record(value) && finite(value.x) && finite(value.y) && finite(value.r) && finite(value.n);
}
function chip(value: RuntimeValue): boolean {
  return record(value) && finite(value.x) && finite(value.y) && finite(value.r) && typeof value.metal === 'boolean';
}
function streak(value: RuntimeValue): boolean {
  return record(value) && finite(value.x) && finite(value.y) && finite(value.len) && finite(value.w);
}
export function isMaterialPlateFeatures(value: RuntimeValue): value is PlateFeatures {
  return record(value) && list(value.hLines, line) && list(value.vLines, line)
    && list(value.rings, ring) && list(value.chips, chip) && list(value.streaks, streak);
}
function pixels(value: RuntimeValue, size: number): value is Uint8ClampedArray<ArrayBuffer> {
  return value instanceof Uint8ClampedArray && value.buffer instanceof ArrayBuffer
    && value.byteOffset === 0 && value.byteLength === size * size * 4
    && value.buffer.byteLength === value.byteLength;
}

export function isMaterialPainterResult(
  value: RuntimeValue, request: MaterialPainterRequest,
): value is MaterialPainterResult {
  if (!record(value) || !dimensions(value.dimensions)) return false;
  if (value.identity !== request.identity || value.dimensions.albedo !== request.dimensions.albedo
    || value.dimensions.map !== request.dimensions.map) return false;
  if (!pixels(value.albedo, request.dimensions.albedo) || !pixels(value.normal, request.dimensions.map)
    || !pixels(value.roughness, request.dimensions.map) || !isMaterialPlateFeatures(value.features)) return false;
  return new Set([value.albedo.buffer, value.normal.buffer, value.roughness.buffer]).size === 3;
}

export function readMaterialPainterReply(
  value: RuntimeValue, requestId: number, request: MaterialPainterRequest,
): MaterialPainterResult | null {
  if (!record(value) || value.requestId !== requestId || value.ok !== true) return null;
  return isMaterialPainterResult(value.result, request) ? value.result : null;
}
