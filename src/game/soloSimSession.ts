/**
 * The page's side of a free sortie on the solo sim Worker (soloSimProtocol.ts; RUST-ENGINE-DECISION §7 step 5, the
 * rework of 2026-10-26). It boots the Worker with the sortie's planned seats and plays the player's seat through the
 * match client — interpolation, prediction, the stall clock — over an in-page loopback whose far end is the Worker's
 * channel. No room, session, host, signalling or ICE: the frames never leave the page. The presentation it binds draws
 * them; the solo entry owns the loading, the HUD, the pause menu and the debrief around it.
 */
import { MatchClient } from '../mp/match/matchClient.ts';
import type { MatchClientOptions, MatchFrame, PredictionProvider } from '../mp/match/matchClient.ts';
import { createLoopbackPair } from '../mp/transport/loopbackTransport.ts';
import { bindMatchPresentation } from '../mp/presentation/adapter.ts';
import type { PresentationAdapter } from '../mp/presentation/adapter.ts';
import type { WelcomeMessage } from '../mp/wire/messages.ts';
import { reportSimKernels } from '../world/simKernelsReport.ts';
import type { PageToSoloSim, SoloSimBoot, SoloSimPort, SoloSimToPage } from './soloSimProtocol.ts';

export interface SoloSimPresentation {
  adapter: PresentationAdapter;
  controls?: MatchClientOptions['controls'] | null;
  prediction?: PredictionProvider | null;
  /** The authority's welcome: the roster the presentation builds (its covered entry waits here). */
  onWelcome?(welcome: WelcomeMessage): void | Promise<void>;
}

export interface SoloSimSessionOptions {
  /** The page's end of the Worker's channel. */
  port: SoloSimPort<SoloSimToPage, PageToSoloSim>;
  boot: SoloSimBoot;
  presentation: SoloSimPresentation;
  clock?: () => number;
  clientBuild: string;
  /** The Worker failed to boot (the solo entry falls back to the page's own simulation). */
  onFailed?(error: string): void;
  /** An error the running Worker raised (its battle goes on; a link it loses ends the battle through the client's phase). */
  onError?(error: string): void;
}

export interface SoloSimSession {
  readonly client: MatchClient;
  /** The Worker's boot timings and the authority's first tick, once it runs. */
  readonly ready: Promise<{ tick: number; bootMs: number }>;
  readonly paused: boolean;
  /** One display frame: the loopback's frames, then the client's frame (null before the welcome). */
  update(nowMs: number, elapsedS: number): MatchFrame | null;
  /** Esc and the killcam: the authority's tick stands, and the client's clock with it. */
  setPaused(paused: boolean): void;
  /** The page revealed the battle: the held count runs. */
  releaseCountdown(): void;
  dispose(): void;
}

/** A sortie's client says hello with no credential: the Worker seats its one player. */
const SOLO_HELLO_TOKEN = 'solo';

export function createSoloSimSession({
  port,
  boot,
  presentation,
  clock = () => performance.now(),
  clientBuild,
  onFailed,
  onError,
}: SoloSimSessionOptions): SoloSimSession {
  let disposed = false;
  let paused = false;
  let ready = false;
  // a pause the page asked for before the authority ran waits for it
  let pendingPause: boolean | null = null;
  const loopback = createLoopbackPair({ clock, connectDelayMs: 0 });
  loopback.server.open();
  loopback.server.onFrame((bytes) => {
    const copy = bytes.slice();
    port.post({ type: 'frame', bytes: copy.buffer }, [copy.buffer]);
  });
  // the client's stall recovery opens a fresh connection: the Worker retires the old one and seats the new hello
  loopback.server.onState((change) => { if (change.state === 'open' && change.resumed) port.post({ type: 'reconnect' }); });

  const client = new MatchClient({
    transport: loopback.client,
    token: SOLO_HELLO_TOKEN,
    clock,
    clientBuild,
    controls: presentation.controls ?? null,
    prediction: presentation.prediction ?? null,
  });
  const unbind = bindMatchPresentation(client, presentation.adapter);
  client.onWelcome((welcome) => {
    void Promise.resolve(presentation.onWelcome?.(welcome)).then(() => {
      if (!disposed && presentation.prediction) client.enablePrediction(presentation.prediction);
    }).catch(() => { /* the presentation reports its own failures */ });
  });

  let settleReady: (value: { tick: number; bootMs: number }) => void = () => {};
  let failReady: (error: Error) => void = () => {};
  const readyPromise = new Promise<{ tick: number; bootMs: number }>((resolve, reject) => { settleReady = resolve; failReady = reject; });
  readyPromise.catch(() => {});

  const unsubscribe = port.onMessage((message) => {
    if (disposed) return;
    switch (message.type) {
      case 'ready':
        ready = true;
        reportSimKernels('solo', message.kernels);
        (globalThis as { __SOLO_SIM_BOOT?: unknown }).__SOLO_SIM_BOOT = message.timings;
        settleReady({ tick: message.tick, bootMs: message.timings.bootMs });
        if (pendingPause !== null) { port.post({ type: 'pause', paused: pendingPause }); pendingPause = null; }
        return;
      case 'boot_failed':
        // (the Worker's error event after its boot is a running battle's error, not a boot that failed)
        if (ready) { onError?.(message.error); return; }
        failReady(new Error(message.error));
        onFailed?.(message.error);
        return;
      case 'frame':
        loopback.server.send(new Uint8Array(message.bytes));
        loopback.pump(clock());
        return;
      case 'closed':
        loopback.server.close('server', message.detail);
        return;
      case 'paused':
        paused = message.paused;
        return;
      default: return;
    }
  });

  port.post({ type: 'boot', boot });
  client.connect();

  return {
    client,
    ready: readyPromise,
    get paused() { return paused; },
    update(nowMs, elapsedS) {
      if (disposed) return null;
      loopback.pump(nowMs);
      return client.update(nowMs, paused ? 0 : elapsedS);
    },
    setPaused(next) {
      if (disposed || next === paused) return;
      paused = next;
      if (ready) port.post({ type: 'pause', paused: next });
      else pendingPause = next;
    },
    releaseCountdown() {
      if (!disposed) port.post({ type: 'countdown', held: false });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      port.post({ type: 'stop' });
      unsubscribe();
      unbind();
      client.leave();
      client.dispose();
      loopback.server.close('client', 'sortie ended');
      port.close();
    },
  };
}
