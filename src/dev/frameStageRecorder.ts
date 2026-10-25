import type { RuntimeValue } from '../runtimeTypes.ts';
import { FRAME_STAGE, FRAME_STAGE_NAMES, setFrameStageSink, type FrameStageSink } from '../game/frameStages.ts';

// The battle spike census's frame recorder (battle-spikes-253, docs/PERF-SPIKES.md; tools/battle-spike-census.mjs). It
// is the sink of the stage marks (game/frameStages.ts): every rendered frame's work split by stage, the simulation steps
// it ran, the programs, textures and geometries the renderer gained, the JS heap at its end, and the bus events whose
// listeners cost the most. Frames go to typed columns in a ring and events to fixed tables, so the recorder makes no
// garbage of its own after install; the census reads it back between battles. Loaded only by the debug surface.

const COLUMNS = Object.freeze([
  'tMs', 'rafMs', 'workMs', 'simSteps', 'programs', 'textures', 'geometries', 'heapMB', 'simS', 'flags', 'tanks', 'shells',
  'events', 'eventMs', 'topEvent0', 'topEventMs0', 'topEvent1', 'topEventMs1', 'topEvent2', 'topEventMs2',
  // WebGL work by kind (with `gl`): in the frame, then in the gap before it (idle callbacks, worker replies, timers)
  'links', 'linkMs', 'texMs', 'bufMs', 'gapLinks', 'gapLinkMs', 'gapTexMs', 'gapBufMs',
] as const);
const STAGE_BASE = COLUMNS.length;
const WIDTH = STAGE_BASE + FRAME_STAGE_NAMES.length;
const MAX_EVENT_NAMES = 192;
/** Frame flags: what the frame showed (`rendered`: it drew the scene; an entry veil's frames do not). */
const FLAG = Object.freeze({ battle: 1, countdown: 2, paused: 4, killcam: 8, result: 16, rendered: 32 });

interface RecorderGame {
  phase?: string;
  timeS?: number;
  preBattleS?: number;
  result?: RuntimeValue;
  tanks?: ReadonlyArray<{ combat?: { destroyed?: boolean } }>;
  shells?: { length: number };
}

interface RecorderRenderer {
  info: { programs?: { length: number } | null; memory: { textures: number; geometries: number } };
}

/** The WebGL calls the recorder times, by kind: program links (and the compile and status reads that wait on them), texture uploads, buffer uploads. */
const GL_KINDS = Object.freeze({
  link: ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog'],
  tex: ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D', 'compressedTexSubImage2D', 'texStorage2D', 'texStorage3D', 'generateMipmap'],
  buf: ['bufferData', 'bufferSubData'],
} as const);
type GlKind = keyof typeof GL_KINDS;

interface RecorderBus {
  emit(event: string, payload?: RuntimeValue): void;
}

interface FrameStageRecorderOptions {
  renderer: RecorderRenderer;
  game: RecorderGame;
  bus?: RecorderBus | null;
  isPaused?: () => boolean;
  isKillcam?: () => boolean;
  /** Time the WebGL program links and uploads (the census does; it wraps the context's methods until uninstall). */
  gl?: WebGL2RenderingContext | null;
  capacity?: number;
  now?: () => number;
}

interface FrameStageReadout {
  columns: readonly string[];
  stages: readonly string[];
  events: readonly string[];
  flags: Readonly<Record<string, number>>;
  frames: number[][];
  dropped: number;
  /** Each program linked (with `gl`): when, its shader's name (three's SHADER_NAME, else the first line), how long. */
  links: Array<{ tMs: number; name: string; ms: number; inFrame: boolean }>;
}

const MAX_LINK_ROWS = 1024;

/** A program's name: three's `#define SHADER_NAME` in its vertex or fragment source, else '(unnamed)'. */
function programName(gl: WebGL2RenderingContext, program: WebGLProgram): string {
  try {
    for (const shader of gl.getAttachedShaders(program) ?? []) {
      const match = /#define SHADER_NAME (.+)/.exec(gl.getShaderSource(shader) ?? '');
      if (match) return match[1].trim().slice(0, 80);
    }
  } catch { /* a lost context */ }
  return '(unnamed)';
}

export interface FrameStageRecorder {
  read(): FrameStageReadout;
  clear(): void;
  uninstall(): void;
  readonly installed: boolean;
}

/** Install the recorder as the stage sink (replacing any earlier one) and return its handle. */
export function installFrameStageRecorder(options: FrameStageRecorderOptions): FrameStageRecorder {
  const { renderer, game, bus = null, isPaused = () => false, isKillcam = () => false, gl = null, capacity = 16384 } = options;
  const now = options.now ?? (() => performance.now());
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory ?? null;
  const rows = new Float64Array(capacity * WIDTH);
  const stageMs = new Float64Array(FRAME_STAGE_NAMES.length);
  let next = 0, size = 0, dropped = 0;
  let open = false, rendered = false, frameStart = 0, rafMs = 0, stage = 0, stageStart = 0, simSteps = 0;
  let events = 0, eventMs = 0;

  // bus listener time by event name (top-level emits only: a listener's own emits are inside its time)
  const eventNames: string[] = [];
  const eventIndex = new Map<string, number>();
  const eventFrameMs = new Float64Array(MAX_EVENT_NAMES);
  const touched = new Int32Array(MAX_EVENT_NAMES);
  const seen = new Uint8Array(MAX_EVENT_NAMES);
  let touchedCount = 0, emitDepth = 0;
  const originalEmit = bus ? bus.emit : null;
  const indexOfEvent = (name: string): number => {
    let index = eventIndex.get(name);
    if (index === undefined) {
      index = eventNames.length < MAX_EVENT_NAMES - 1 ? eventNames.length : MAX_EVENT_NAMES - 1;
      if (index === eventNames.length) eventNames.push(name);
      eventIndex.set(name, index);
    }
    return index;
  };
  indexOfEvent('(other)');
  if (bus && originalEmit) {
    bus.emit = function recordedEmit(this: RecorderBus, event: string, payload?: RuntimeValue): void {
      if (emitDepth > 0 || !open) { originalEmit.call(this, event, payload); return; }
      emitDepth++;
      const startedAt = now();
      try { originalEmit.call(this, event, payload); } finally {
        emitDepth--;
        const spent = now() - startedAt;
        const index = indexOfEvent(event);
        if (!seen[index]) { seen[index] = 1; touched[touchedCount++] = index; }
        eventFrameMs[index] += spent;
        events++;
        eventMs += spent;
      }
    };
  }

  // WebGL time by kind: [in-frame link, tex, buf, links, gap link, tex, buf, links]
  const glAcc = new Float64Array(8);
  const glRestore: Array<() => void> = [];
  const links: FrameStageReadout['links'] = [];
  if (gl) {
    const target = gl as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const kind of Object.keys(GL_KINDS) as GlKind[]) {
      const slot = kind === 'link' ? 0 : kind === 'tex' ? 1 : 2;
      for (const name of GL_KINDS[kind]) {
        const original = target[name];
        if (typeof original !== 'function') continue;
        const counted = name === 'linkProgram';
        // `arguments` straight into apply: no array a call (a rest parameter allocated one per upload, in the heap the
        // census measures)
        target[name] = function timedGlCall(this: unknown): unknown {
          const startedAt = now();
          // eslint-disable-next-line prefer-rest-params
          try { return original.apply(this, arguments as unknown as unknown[]); } finally {
            const spent = now() - startedAt;
            // in a frame the call's time leaves the stage it ran in: the stages and the WebGL kinds add up to the work
            if (open) stageMs[stage] -= spent;
            const base = open ? 0 : 4;
            glAcc[base + slot] += spent;
            if (counted) {
              glAcc[base + 3]++;
              if (links.length < MAX_LINK_ROWS) {
                // eslint-disable-next-line prefer-rest-params
                links.push({ tMs: Math.round(startedAt * 10) / 10, name: programName(gl, arguments[0] as WebGLProgram), ms: Math.round(spent * 100) / 100, inFrame: open });
              }
            }
          }
        };
        glRestore.push(() => { target[name] = original; });
      }
    }
  }

  const charge = (at: number): void => {
    stageMs[stage] += at - stageStart;
    stageStart = at;
  };

  const sink: FrameStageSink = {
    begin(nowMs: number): void {
      const at = now();
      open = true;
      frameStart = at; stageStart = at; stage = FRAME_STAGE.other; rafMs = nowMs; simSteps = 0; rendered = false;
      events = 0; eventMs = 0;
      stageMs.fill(0);
    },
    stage(entered: number): void {
      if (!open) return;
      charge(now());
      stage = entered;
      if (entered === FRAME_STAGE.spotting) simSteps++;
      else if (entered === FRAME_STAGE.post) rendered = true;
    },
    end(): void {
      if (!open) return;
      const at = now();
      charge(at);
      open = false;
      const base = next * WIDTH;
      rows[base] = frameStart;
      rows[base + 1] = rafMs;
      rows[base + 2] = at - frameStart;
      rows[base + 3] = simSteps;
      rows[base + 4] = renderer.info.programs?.length ?? 0;
      rows[base + 5] = renderer.info.memory.textures;
      rows[base + 6] = renderer.info.memory.geometries;
      rows[base + 7] = memory ? memory.usedJSHeapSize / 1048576 : 0;
      rows[base + 8] = game.timeS ?? 0;
      let flags = 0;
      if (game.phase === 'battle') flags |= FLAG.battle;
      if ((game.preBattleS ?? 0) > 0) flags |= FLAG.countdown;
      if (isPaused()) flags |= FLAG.paused;
      if (isKillcam()) flags |= FLAG.killcam;
      if (game.result) flags |= FLAG.result;
      if (rendered) flags |= FLAG.rendered;
      rows[base + 9] = flags;
      let alive = 0;
      const tanks = game.tanks;
      if (tanks) for (let i = 0; i < tanks.length; i++) if (!tanks[i].combat?.destroyed) alive++;
      rows[base + 10] = alive;
      rows[base + 11] = game.shells?.length ?? 0;
      rows[base + 12] = events;
      rows[base + 13] = eventMs;
      // the three costliest event names this frame
      for (let slot = 0; slot < 3; slot++) {
        let best = -1, bestMs = 0;
        for (let k = 0; k < touchedCount; k++) {
          const index = touched[k];
          if (eventFrameMs[index] > bestMs) { bestMs = eventFrameMs[index]; best = index; }
        }
        rows[base + 14 + slot * 2] = best;
        rows[base + 15 + slot * 2] = bestMs;
        if (best >= 0) eventFrameMs[best] = -eventFrameMs[best];
      }
      for (let k = 0; k < touchedCount; k++) { eventFrameMs[touched[k]] = 0; seen[touched[k]] = 0; }
      touchedCount = 0;
      rows[base + 20] = glAcc[3];
      rows[base + 21] = glAcc[0];
      rows[base + 22] = glAcc[1];
      rows[base + 23] = glAcc[2];
      rows[base + 24] = glAcc[7];
      rows[base + 25] = glAcc[4];
      rows[base + 26] = glAcc[5];
      rows[base + 27] = glAcc[6];
      glAcc.fill(0);
      for (let s = 0; s < stageMs.length; s++) rows[base + STAGE_BASE + s] = stageMs[s];
      next = (next + 1) % capacity;
      if (size === capacity) dropped++; else size++;
    },
  };
  setFrameStageSink(sink);
  let installed = true;

  return {
    read(): FrameStageReadout {
      const frames: number[][] = [];
      const start = size === capacity ? next : 0;
      for (let i = 0; i < size; i++) {
        const base = ((start + i) % capacity) * WIDTH;
        frames.push(Array.from(rows.subarray(base, base + WIDTH), (v) => Math.round(v * 1000) / 1000));
      }
      return { columns: COLUMNS, stages: FRAME_STAGE_NAMES, events: eventNames.slice(), flags: FLAG, frames, dropped, links: links.slice() };
    },
    clear(): void { next = 0; size = 0; dropped = 0; links.length = 0; },
    uninstall(): void {
      if (!installed) return;
      installed = false;
      setFrameStageSink(null);
      if (bus && originalEmit) bus.emit = originalEmit;
      for (const restore of glRestore) restore();
    },
    get installed() { return installed; },
  };
}
