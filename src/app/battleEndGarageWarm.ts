/**
 * battleEndGarageWarm.ts — the Garage return paid behind the battle report (perf-246).
 *
 * The click-perf trace measured the first Return to Garage at 10.4 s, 48 program links under the transition veil.
 * The report is now opaque: it covers the scene with the battlefield's end still, or a frozen copy of the battle's
 * last frame that this owner supplies (src/ui/reportBackdrop.ts). Once the report has the screen and its entrance
 * has played, the real Garage swap and program warm run on the canvas behind it (garageReturnRuntime.prepare), so
 * the Return is only its handoff.
 *
 * The return runtime owns every edge: Battle Again abandons a preparation in flight and skips the restore of a
 * fresh return; a live multiplayer room is never touched (prepare refuses, and so does `isEligible` here); a Return
 * clicked before the warm starts takes the ordinary covered return. `?garagePrewarm=0` keeps the old return for the
 * owed A/B; the frozen-frame backdrop stays.
 */
import type { RuntimeValue } from '../runtimeTypes.ts';
import { setReportBackdropOwner } from '../ui/reportBackdrop.ts';

interface BattleEndGarageWarmBus {
  on(type: string, handler: (payload?: RuntimeValue) => void): unknown;
}

interface BattleEndGarageWarmStats {
  /** Reports that followed a battle (each one a backdrop and, when eligible, a warm). */
  reports: number;
  frozenFrames: number;
  started: number;
  prepared: number;
  refused: number;
  failed: number;
  /** Wall time of the last completed preparation behind the report. */
  lastPrepareMs: number | null;
}

interface BattleEndGarageWarmOptions {
  bus: BattleEndGarageWarmBus;
  /** Swap and warm the Garage under the report; false when refused or abandoned. */
  prepare(): Promise<boolean>;
  /** A solo or watched battle is over and nothing else owns the screen (room, transition, entry, Studio, device). */
  isEligible(): boolean;
  /** Render the battle's current frame and return its canvas, in the same task (the drawing buffer is valid). */
  renderFrame(): HTMLCanvasElement | null;
  createCanvas?: (width: number, height: number) => HTMLCanvasElement | null;
  enabled?: boolean;
  delayMs?: number;
  setTimer?: (callback: () => void, milliseconds: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
  reportError?: (message: string, error: RuntimeValue) => void;
}

interface BattleEndGarageWarm {
  /** The report's backdrop owner: the still, else a frozen last frame; each battle's report also starts the warm. */
  backdrop(still: string | null): string | null;
  readonly stats: Readonly<BattleEndGarageWarmStats>;
}

// The report sits under a dark grade; a phone-sized copy keeps the data URL small and the encode short.
const FROZEN_FRAME_MAX_WIDTH = 960;
const FROZEN_FRAME_QUALITY = 0.82;
// The report's entrance (staggered panels, count-ups of about 1.3 s) plays first: links during it would stutter it.
const REPORT_SETTLE_MS = 700;

function createDocumentCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function installBattleEndGarageWarm({
  bus,
  prepare,
  isEligible,
  renderFrame,
  createCanvas = createDocumentCanvas,
  enabled = true,
  delayMs = REPORT_SETTLE_MS,
  setTimer = (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now = () => performance.now(),
  reportError = () => {},
}: BattleEndGarageWarmOptions): BattleEndGarageWarm {
  if (!bus || typeof prepare !== 'function' || typeof isEligible !== 'function'
    || typeof renderFrame !== 'function') {
    throw new TypeError('battle-end Garage warm requires its bus, prepare, eligibility and frame ports');
  }
  const stats: BattleEndGarageWarmStats = {
    reports: 0, frozenFrames: 0, started: 0, prepared: 0, refused: 0, failed: 0, lastPrepareMs: null,
  };
  let battleEnded = false;
  let frozen: string | null = null;
  let timer: unknown = null;

  const cancelTimer = (): void => {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
  };
  bus.on('battle:ended', () => {
    battleEnded = true;
    frozen = null;
  });
  // A new battle (Battle Again, the campaign's next operation, any entry) or a phase change retires a pending start;
  // a preparation already running is the return runtime's to abandon.
  for (const type of ['ui:battleStart', 'ui:battleAgain', 'ui:campaignNext', 'phase:change']) {
    bus.on(type, () => {
      battleEnded = false;
      cancelTimer();
    });
  }

  const frozenFrame = (): string | null => {
    try {
      const source = renderFrame();
      if (!source || !(source.width > 0) || !(source.height > 0)) return null;
      const scale = Math.min(1, FROZEN_FRAME_MAX_WIDTH / source.width);
      const width = Math.max(1, Math.round(source.width * scale));
      const height = Math.max(1, Math.round(source.height * scale));
      const still = createCanvas(width, height);
      const context = still?.getContext('2d');
      if (!still || !context) return null;
      context.drawImage(source, 0, 0, width, height);
      stats.frozenFrames += 1;
      return still.toDataURL('image/jpeg', FROZEN_FRAME_QUALITY);
    } catch (error) {
      reportError('battle report frozen frame', error instanceof Error ? error : String(error));
      return null;
    }
  };

  const start = (): void => {
    timer = null;
    if (!isEligible()) {
      stats.refused += 1;
      return;
    }
    stats.started += 1;
    const startedAt = now();
    prepare().then((prepared) => {
      if (!prepared) {
        stats.refused += 1;
        return;
      }
      stats.prepared += 1;
      stats.lastPrepareMs = Math.round(now() - startedAt);
    }, (error) => {
      stats.failed += 1;
      reportError('battle-end Garage warm', error instanceof Error ? error : String(error));
    });
  };

  const warm: BattleEndGarageWarm = {
    backdrop(still) {
      // A report with no battle behind it (a capture harness) has no frame to freeze and nothing to warm; a report
      // shown again keeps its battle's frozen frame.
      if (!battleEnded) return still ?? frozen;
      battleEnded = false;
      stats.reports += 1;
      if (!still) frozen = frozenFrame();
      if (enabled) {
        cancelTimer();
        timer = setTimer(start, delayMs);
      }
      return still ?? frozen;
    },
    stats,
  };
  setReportBackdropOwner(warm.backdrop);
  return warm;
}
