/**
 * The replay viewer's composition (replay-system, docs/REPLAY.md §5), built on demand the first time a replay is
 * watched (main.ts keeps only the lazy owner). A replay is watched as a battle: the page enters the recording's
 * battle through its ordinary solo entry, set up as recorded (replaySetup.ts round the page's own setupBattle), then
 * `attach` turns it into a replay: the replay ruleset (Watch's drone and ride, no seat to take, no records), the
 * index built in a Worker from the page's own world, and from then on the battle frame poses it each frame through
 * `advance` instead of stepping it. The bar (ui/replayBar.ts) loads with it. A recording this build cannot replay
 * never enters a battle: `refusal` says so first and the bar shows its timeline alone (Kevin's decision 4).
 */
import type { ReplayRecording } from '../sim/replayFormat.ts';
import { replayRulesetFor, type MatchRuleset } from '../sim/matchRuleset.ts';
import type { WatchSession } from '../game/watchSeat.ts';
import { replayRefusal } from '../game/replay/replayBuild.ts';
import type { ReplayIndex } from '../game/replay/replayIndexer.ts';
import { indexReplayInWorker, type ReplayIndexTask } from '../game/replay/replayIndexerClient.ts';
import { rosterMismatch } from '../game/replay/replaySetup.ts';
import { replayCollisionManifest, REPLAY_TERRAIN_SEED } from '../game/replay/replayWorldManifest.ts';
import { createReplayViewer, type ReplayViewer } from '../game/replay/replayViewer.ts';
import type { PosedHull } from '../game/replay/replayPosing.ts';
import type { TimelineMark } from '../game/replay/replayTimeline.ts';
import { replayKeyAction } from '../game/replay/replayPlayback.ts';
import { createReplayBar, type ReplayBar } from '../ui/replayBar.ts';

/** A hull as the viewer reads and poses it, with the visual it shows or hides and wrecks. */
type ViewerHull = PosedHull & {
  team: string;
  specId: string;
  spec?: { name?: string } | null;
  visual?: { setVisible(visible: boolean): void; setDestroyed?(options: { pop?: boolean; ageS?: number }): void; resetDestroyed?(): void } | null;
};

interface ViewerGame {
  tanks: ViewerHull[];
  player: (ViewerHull & { id: string; team: string }) | null;
  ruleset: MatchRuleset;
  watch?: WatchSession | null;
}

type ManifestWorld = Parameters<typeof replayCollisionManifest>[0];

export interface ReplayViewerRuntimePorts {
  game: ViewerGame;
  /** Watch mode's controller once its chunk is up (the drone and ride the viewer drives). */
  watch(): { rideId(id: string): boolean; drone(): void; readonly focusId: string | null } | null;
  hud: { root(): HTMLElement | null; replayKill(kill: { id: string; killerId: string | null; cause?: string | null }): void };
  /** Leave the replay's battle for the Garage (the pause menu's own way out). */
  leave(): void;
  /** Settings or a modal own the keys. */
  isInputHeld(): boolean;
  reportError(message: string, error: unknown): void;
  /** The kit's segmented control for the bar (ui/replayBar.ts), handed in from the boot chunk that has it. */
  kit: Parameters<typeof createReplayBar>[1]['kit'];
}

export interface ReplayViewerRuntime {
  /** Why this build cannot replay `recording` (the version it came from), or null when it can. */
  refusal(recording: ReplayRecording): { recordedOn: string } | null;
  /** The bar alone over the Garage: a refused recording's timeline and the reason (no battle is entered). */
  showTimeline(index: ReplayIndex): void;
  /** The page set the recording's battle up: make it a replay and start indexing it on `world`. False: the battle seated
   *  another roster (the bar says the replay is unavailable). */
  attach(recording: ReplayRecording, file: Uint8Array, world: ManifestWorld): boolean;
  /** A replay battle is up (posed, never stepped): the battle frame's replay port. */
  isActive(): boolean;
  advance(realS: number): void;
  stop(): void;
}

export function createReplayViewerRuntime(ports: ReplayViewerRuntimePorts): ReplayViewerRuntime {
  const { game } = ports;
  let active = false;
  let task: ReplayIndexTask | null = null;
  let viewer: ReplayViewer | null = null;
  let bar: ReplayBar | null = null;
  let generation = 0;
  /** The bar shows a refused recording's timeline over the Garage: its Leave closes it (no battle was entered). */
  let timelineOnly = false;

  /** A wreck set as the battle showed it: an ammo-rack kill pops the turret; seeking past the kill shows it aged. */
  const lastKill = (id: string, timeS: number): TimelineMark | null => {
    let found: TimelineMark | null = null;
    for (const mark of viewer?.marks ?? []) if (mark.category === 'kill' && mark.subject === id && mark.timeS <= timeS + 1e-6) found = mark;
    return found;
  };

  let indexedTicks = 1;
  /** The bar as the viewer stands: its transport once the battle frame has posed the replay (the battle in view), until
   *  then the finished index (the entry's load screen still covers the battle and the bar). */
  const paint = (): void => {
    if (!viewer || !bar) return;
    if (viewer.posing) bar.update(viewer.bar, null);
    else bar.update(null, { tick: indexedTicks, lastTick: indexedTicks });
  };

  const ensureBar = (): ReplayBar => {
    // each press repaints at once (the play icon, the clock), not on the next frame
    bar ??= createReplayBar(() => ports.hud.root() ?? document.body, {
      key: (action) => { viewer?.key(action); paint(); },
      scrub: (timeS) => { viewer?.scrub(timeS); paint(); },
      pickMark: (mark) => { viewer?.pickMark(mark); paint(); },
      setFilter: (filter) => { viewer?.setFilter(filter); paint(); },
      leave: () => { if (timelineOnly) runtime.stop(); else ports.leave(); },
      kit: ports.kit,
      nameOf: (specId) => game.tanks.find((hull) => hull.specId === specId)?.spec?.name ?? specId,
    });
    return bar;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!active || !viewer?.posing || event.repeat || ports.isInputHeld()) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    const action = replayKeyAction(event.code);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    viewer.key(action);
    paint();
  };

  const begin = (index: ReplayIndex): void => {
    viewer = createReplayViewer(index, {
      hulls: game.tanks,
      watch: {
        rideId: (id) => ports.watch()?.rideId(id) ?? false,
        drone: () => ports.watch()?.drone(),
        get focusId() { return ports.watch()?.focusId ?? null; },
      },
      visuals: {
        setPresent: (hull, present) => hull.visual?.setVisible(present),
        setCondition: (hull, destroyed) => {
          if (!destroyed) { hull.visual?.resetDestroyed?.(); return; }
          const timeS = viewer?.clock.timeS ?? 0;
          const kill = lastKill(hull.id, timeS);
          hull.visual?.setDestroyed?.({ pop: kill?.label.cause === 'ammorack', ageS: kill ? Math.max(0, timeS - kill.timeS) : 0 });
        },
      },
      feed: { kill: (mark) => ports.hud.replayKill({ id: mark.subject, killerId: mark.actor || null, cause: mark.label.cause || null }) },
    });
    indexedTicks = Math.max(1, index.lastTick);
    ensureBar();
    paint();
  };

  const runtime: ReplayViewerRuntime = {
    refusal: (recording) => replayRefusal(recording.header.replayDigest, recording.header.build),

    showTimeline(index) {
      active = false;
      timelineOnly = true;
      const shown = createReplayViewer(index, {
        hulls: [], watch: { rideId: () => false, drone: () => {}, focusId: null },
        visuals: { setPresent: () => {}, setCondition: () => {} }, feed: { kill: () => {} },
      });
      ensureBar().showStatic(shown.bar);
    },

    attach(recording, file, world) {
      const run = ++generation;
      timelineOnly = false;
      const mismatch = rosterMismatch(game.tanks, recording.header);
      if (mismatch) {
        ports.reportError('[replay] the battle seated another roster', mismatch);
        return false;
      }
      game.ruleset = replayRulesetFor(game.ruleset);
      // Watch's session on the human seat, as a watched battle opens one (game/watchSeat.ts prepareWatchSeat)
      if (game.player) game.watch = { seatId: game.player.id, team: game.player.team, takenId: null, opened: false, parked: new Map() };
      active = true;
      window.addEventListener('keydown', onKeyDown, true);
      ensureBar().update(null, { tick: 0, lastTick: Math.max(1, recording.seatSteps.length) });
      try {
        task = indexReplayInWorker(file, { manifest: replayCollisionManifest(world), terrainSeed: REPLAY_TERRAIN_SEED }, {
          onProgress: (tick, lastTick) => { if (run === generation) bar?.update(null, { tick, lastTick }); },
        });
      } catch (error) {
        ports.reportError('[replay] the indexer did not start', error);
        return true;
      }
      task.done.then((index) => { if (run === generation) begin(index); },
        (error) => { if (run === generation) ports.reportError('[replay] indexing failed', error); });
      return true;
    },

    isActive: () => active,

    // the battle frame calls it only while the battle is in view (game/battleFrameRuntime.ts): the first call offers the
    // transport
    advance(realS) {
      if (!viewer) return;
      viewer.advance(realS);
      paint();
    },

    stop() {
      generation++;
      active = false;
      task?.cancel();
      task = null;
      viewer = null;
      window.removeEventListener('keydown', onKeyDown, true);
      bar?.dispose();
      bar = null;
      timelineOnly = false;
    },
  };
  return runtime;
}
