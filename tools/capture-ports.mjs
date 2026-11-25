// The ports a capture hold's servers bind (capture-slot-ports-277, 2026-11-25). The render class runs two holds at once
// (capture-lock RENDER_SLOTS); two render tickets that both started `vite preview` on 4178/4179 collided, and the
// two-peer tool's rooms service sat on the LAN helper's 8792 in both. Each slot now owns a port block: the holder hands
// it to its children (capture-lock nestedEnv: COT_CAPTURE_SLOT and the block's variables), and the launchers bind inside
// it. Work outside a hold (no slot) binds port 0, an OS-assigned port, and reports what it bound.
//   slot k: preview ports PREVIEW_BASE + k * PREVIEW_SPAN .. + PREVIEW_SPAN - 1, rooms port ROOMS_BASE + k
// A shell script under tools/with-capture-lock.mjs reads $COT_CAPTURE_PREVIEW_PORT (the block's first) and
// $COT_CAPTURE_ROOMS_PORT; a built client dials that rooms port with `?roomsPort=` (src/mp/session/endpoint.ts, loopback
// pages only). tools/with-preview.mjs serves a dist inside the block and stops only the server it started.

export const CAPTURE_SLOT_ENV = 'COT_CAPTURE_SLOT';
export const PREVIEW_PORTS_ENV = 'COT_CAPTURE_PREVIEW_PORTS';
export const PREVIEW_PORT_ENV = 'COT_CAPTURE_PREVIEW_PORT';
export const ROOMS_PORT_ENV = 'COT_CAPTURE_ROOMS_PORT';

const PREVIEW_BASE = 4400;
const PREVIEW_SPAN = 20;
const ROOMS_BASE = 8800;
/** More slots than the lock gives (RENDER_SLOTS is 2): a block is defined for each, and no two overlap. */
const MAX_SLOTS = 8;

/** Slot `slot`'s block: { slot, previewPorts: [first..last], rooms }; throws for a slot out of range. */
export function slotPortBlock(slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SLOTS) throw new RangeError(`capture slot ${slot}: expected 0-${MAX_SLOTS - 1}`);
  const first = PREVIEW_BASE + slot * PREVIEW_SPAN;
  return { slot, previewPorts: Array.from({ length: PREVIEW_SPAN }, (_, index) => first + index), rooms: ROOMS_BASE + slot };
}

/** The variables a hold on `slot` hands its children. */
export function portBlockEnv(slot) {
  const { previewPorts, rooms } = slotPortBlock(slot);
  return { [CAPTURE_SLOT_ENV]: String(slot), [PREVIEW_PORTS_ENV]: `${previewPorts[0]}-${previewPorts.at(-1)}`,
    [PREVIEW_PORT_ENV]: String(previewPorts[0]), [ROOMS_PORT_ENV]: String(rooms) };
}

/** This process's block, from COT_CAPTURE_SLOT (the other variables are its shell form), or null outside a hold. */
export function capturePortBlock(env = process.env) {
  const raw = String(env[CAPTURE_SLOT_ENV] ?? '').trim();
  if (!/^\d+$/.test(raw) || Number(raw) >= MAX_SLOTS) return null;
  return slotPortBlock(Number(raw));
}

/** The preview ports to try, in order: the block's, or [0] (OS-assigned) outside a hold. */
export function previewPortCandidates(env = process.env) {
  return capturePortBlock(env)?.previewPorts ?? [0];
}

/** The rooms port a tool's own rooms service binds: the block's, or 0 (OS-assigned) outside a hold. */
export function roomsPortFor(env = process.env) {
  return capturePortBlock(env)?.rooms ?? 0;
}

/** Whether `error` says the port was taken (node's EADDRINUSE, or Vite's strictPort message). */
function portInUse(error) {
  return error?.code === 'EADDRINUSE' || /\bport \d+ is (?:already )?in use\b|EADDRINUSE/i.test(String(error?.message ?? ''));
}

/**
 * Bind on the first free port: `bind(port)` starts a server on exactly that port (strictPort) and resolves with it.
 * Tries `ports` (default: the block's preview ports), then port 0, and resolves with { server, port: the port tried }
 * (0 for the OS-assigned fallback: read the bound one from the server). Any failure but a taken port throws at once.
 */
export async function bindFirstFree(bind, { ports = null, env = process.env, fallback = true } = {}) {
  const candidates = [...(ports ?? capturePortBlock(env)?.previewPorts ?? [])];
  if (fallback || !candidates.length) candidates.push(0);
  let last = null;
  for (const port of candidates) {
    try { return { server: await bind(port), port }; } catch (error) {
      if (!portInUse(error) || port === 0) throw error;
      last = error;
    }
  }
  throw last ?? new Error('bindFirstFree: no port to try');
}
