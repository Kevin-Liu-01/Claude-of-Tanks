import type { RuntimeValue } from '../runtimeTypes.ts';
import type { SourcedComposeOptions } from './sourcedTextureComposer.ts';

export const SOURCED_TEXTURE_COMPOSITION_PROTOCOL = 'sourced-texture-composition-v1';
export const SOURCED_TEXTURE_COMPOSITION_MAX_SIZE = 1024;
export type SourcedTextureCompositionPixels = Uint8ClampedArray<ArrayBuffer>;

export interface SourcedTextureCompositionRequest {
  type: 'compose';
  protocol: typeof SOURCED_TEXTURE_COMPOSITION_PROTOCOL;
  requestId: number;
  key: string;
  size: number;
  options: SourcedComposeOptions;
  includeSurface: boolean;
  bitmaps: { color: ImageBitmap; ao: ImageBitmap | null; rough: ImageBitmap | null };
}

export interface SourcedTextureCompositionReady {
  type: 'ready';
  protocol: typeof SOURCED_TEXTURE_COMPOSITION_PROTOCOL;
}

export interface SourcedTextureCompositionComplete {
  type: 'complete';
  protocol: typeof SOURCED_TEXTURE_COMPOSITION_PROTOCOL;
  requestId: number;
  key: string;
  size: number;
  albedo: SourcedTextureCompositionPixels;
  surface: SourcedTextureCompositionPixels | null;
  closedBitmaps: number;
}

export interface SourcedTextureCompositionError {
  type: 'error';
  protocol: typeof SOURCED_TEXTURE_COMPOSITION_PROTOCOL;
  requestId: number;
  key: string;
  error: string;
}

export type SourcedTextureCompositionReply = SourcedTextureCompositionComplete | SourcedTextureCompositionError;
export interface SourcedTextureCompositionExpectation {
  requestId: number;
  key: string;
  size: number;
  includeSurface: boolean;
  closedBitmaps: number;
}

export type SourcedTextureBitmapGuard = (value: RuntimeValue) => value is ImageBitmap;

export function isNativeSourcedTextureBitmap(value: RuntimeValue): value is ImageBitmap {
  return typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap;
}

function record(value: RuntimeValue): Record<string, RuntimeValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected protocol object');
  return value as Record<string, RuntimeValue>;
}

function fields(value: Record<string, RuntimeValue>, names: string[], required: string[] = names): void {
  if (Object.keys(value).some((name) => !names.includes(name))
    || required.some((name) => !Object.hasOwn(value, name))) throw new Error('Unexpected protocol fields');
}

function finiteRange(value: RuntimeValue, maximum: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum;
}

function validateOptions(value: RuntimeValue): SourcedComposeOptions {
  const options = record(value);
  fields(options, ['roughInAlpha', 'separateSurface', 'roughMul', 'tint', 'desat', 'lift'], []);
  for (const name of ['roughInAlpha', 'separateSurface']) {
    if (options[name] !== undefined && typeof options[name] !== 'boolean') throw new Error(`Invalid ${name}`);
  }
  for (const [name, maximum] of [['roughMul', 4], ['desat', 1], ['lift', 1]] as const) {
    if (options[name] !== undefined && !finiteRange(options[name], maximum)) throw new Error(`Invalid ${name}`);
  }
  const tint = options.tint;
  if (tint != null && (!Array.isArray(tint) || tint.length !== 3
    || ![0, 1, 2].every((index) => finiteRange(tint[index], 4)))) throw new Error('Invalid tint');
  return options as SourcedComposeOptions;
}

function validateIdentity(value: Record<string, RuntimeValue>): void {
  if (value.protocol !== SOURCED_TEXTURE_COMPOSITION_PROTOCOL) throw new Error('Wrong composition protocol');
  if (typeof value.requestId !== 'number' || !Number.isSafeInteger(value.requestId) || value.requestId <= 0) {
    throw new Error('Invalid composition requestId');
  }
  if (typeof value.key !== 'string' || value.key.length === 0 || value.key.length > 1024) {
    throw new Error('Invalid composition key');
  }
}

function validateSize(size: RuntimeValue): asserts size is number {
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0 || size > SOURCED_TEXTURE_COMPOSITION_MAX_SIZE) {
    throw new Error('Invalid composition size');
  }
}

function validateBitmaps(value: RuntimeValue, size: number, isBitmap: SourcedTextureBitmapGuard): void {
  const bitmaps = record(value);
  fields(bitmaps, ['color', 'ao', 'rough']);
  const owners = new Set<ImageBitmap>();
  for (const role of ['color', 'ao', 'rough']) {
    const bitmap = bitmaps[role];
    if (role !== 'color' && bitmap === null) continue;
    if (!isBitmap(bitmap)) throw new Error(`Invalid native bitmap: ${role}`);
    if (!Number.isInteger(bitmap.width) || !Number.isInteger(bitmap.height)
      || bitmap.width < 1 || bitmap.width > 1024 || bitmap.height < 1 || bitmap.height > 1024
      || (role === 'color' && bitmap.width < size)) {
      throw new Error(`Invalid bitmap dimensions: ${role}`);
    }
    if (owners.has(bitmap)) throw new Error('Aliased bitmap roles');
    owners.add(bitmap);
  }
}

/** Native identity is injectable only for headless ownership tests. */
export function validateSourcedTextureCompositionRequest(
  value: RuntimeValue,
  isBitmap: SourcedTextureBitmapGuard = isNativeSourcedTextureBitmap,
): SourcedTextureCompositionRequest {
  const request = record(value);
  fields(request, ['type', 'protocol', 'requestId', 'key', 'size', 'options', 'includeSurface', 'bitmaps']);
  validateIdentity(request);
  if (request.type !== 'compose') throw new Error('Expected compose request');
  validateSize(request.size);
  const options = validateOptions(request.options);
  if (typeof request.includeSurface !== 'boolean' || (request.includeSurface && !options.separateSurface)) {
    throw new Error('Invalid surface output request');
  }
  validateBitmaps(request.bitmaps, request.size, isBitmap);
  return request as RuntimeValue as SourcedTextureCompositionRequest;
}

function validatePixels(value: RuntimeValue, size: number): asserts value is SourcedTextureCompositionPixels {
  const bytes = size * size * 4;
  if (!(value instanceof Uint8ClampedArray) || !(value.buffer instanceof ArrayBuffer)
    || value.byteOffset !== 0 || value.byteLength !== bytes || value.buffer.byteLength !== bytes) {
    throw new Error('Invalid composition RGBA buffer');
  }
}

export function validateSourcedTextureCompositionReply(
  value: RuntimeValue,
  expected: SourcedTextureCompositionExpectation,
): SourcedTextureCompositionReply {
  const reply = record(value);
  validateIdentity(reply);
  if (reply.requestId !== expected.requestId || reply.key !== expected.key) throw new Error('Wrong composition reply identity');
  if (reply.type === 'error') {
    fields(reply, ['type', 'protocol', 'requestId', 'key', 'error']);
    if (typeof reply.error !== 'string' || reply.error.length === 0 || reply.error.length > 2048) throw new Error('Invalid worker error');
    return reply as RuntimeValue as SourcedTextureCompositionError;
  }
  fields(reply, ['type', 'protocol', 'requestId', 'key', 'size', 'albedo', 'surface', 'closedBitmaps']);
  if (reply.type !== 'complete' || reply.size !== expected.size) throw new Error('Wrong composition output contract');
  validateSize(reply.size);
  validatePixels(reply.albedo, reply.size);
  if (expected.includeSurface) {
    validatePixels(reply.surface, reply.size);
    if (reply.surface.buffer === reply.albedo.buffer) throw new Error('Aliased composition outputs');
  } else if (reply.surface !== null) throw new Error('Unexpected surface output');
  if (!Number.isInteger(reply.closedBitmaps) || reply.closedBitmaps !== expected.closedBitmaps
    || expected.closedBitmaps < 1 || expected.closedBitmaps > 3) throw new Error('Incomplete bitmap cleanup');
  return reply as RuntimeValue as SourcedTextureCompositionComplete;
}

export function isSourcedTextureCompositionReady(value: RuntimeValue): value is SourcedTextureCompositionReady {
  if (!value || typeof value !== 'object') return false;
  const ready = value as Record<string, RuntimeValue>;
  return ready.type === 'ready' && ready.protocol === SOURCED_TEXTURE_COMPOSITION_PROTOCOL
    && Object.keys(ready).length === 2;
}
