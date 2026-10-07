/**
 * Ambience director: plays an environment scene — the stereo bed, the water
 * or machinery layer, the distant-war bed in battle — and scatters the
 * scene's positional spot sounds around the listener (random bearing,
 * 40–380 m, never two in a row from the same id) so a battlefield never
 * sounds like a loop. On a map whose towers ring (scene.bells) it tolls the
 * nearest one now and then, in a quiet stretch only (BELL_POLICY). Scene
 * changes crossfade; nothing allocates per frame.
 */

import { clamp, dbToGain } from './audioMath.ts';
import type { AssetLibrary } from './assetLibrary.ts';
import { BELL_ASSET, BELL_POLICY, type EnvironmentScene } from './environmentScenes.ts';
import type { Mixer } from './mixer.ts';
import type { ActiveVoice, VoicePool } from './voicePool.ts';

/** A tower the scene's bells ring from: where its bells hang and how large they are (environmentScenes BELL_TOWERS). */
export interface BellTower {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rate: number;
  readonly gainDb: number;
  readonly kind: string;
}

export interface AmbienceDirector {
  play(scene: EnvironmentScene, battle: boolean): void;
  stop(fadeS?: number): void;
  update(now: number, x: number, y: number, z: number): void;
  readonly active: boolean;
  readonly scene: EnvironmentScene | null;
  state(): Record<string, unknown>;
}

interface AmbienceOptions {
  mixer: Mixer;
  library: AssetLibrary;
  pool: VoicePool;
  random: () => number;
  /** The current map's bell towers, asked for when a toll falls due (empty while the world has none or is not built). */
  getBellTowers?: () => readonly BellTower[];
  /** Whether the bells may ring now (the engine: once the battle has rolled out, so a frozen pre-battle never tolls). */
  bellsAllowed?: () => boolean;
}

export function sceneAssets(scene: EnvironmentScene, battle: boolean): string[] {
  const ids = [scene.bed, ...scene.spots.map(([id]) => id)];
  if (scene.layer) ids.push(scene.layer.asset);
  if (scene.bells) ids.push(BELL_ASSET[scene.bells]);
  if (battle && scene.war > 0) ids.push('amb_distant_battle');
  if (battle) for (const [id] of scene.flyovers) if (!ids.includes(id)) ids.push(id);
  return ids;
}

export function createAmbienceDirector({ mixer, library, pool, random, getBellTowers, bellsAllowed }: AmbienceOptions): AmbienceDirector {
  let scene: EnvironmentScene | null = null;
  let loops: { voice: ActiveVoice | null; asset: string; gainDb: number }[] = [];
  let nextSpotAt = 0;
  let lastSpot = '';
  let battleMode = false;
  let spotsPlayed = 0;
  // Bells: when the next toll falls due, when the fighting was last loud enough to hold it, what has rung.
  let nextBellAt = Infinity;
  let lastLoudAt = -Infinity;
  let tolls = 0;
  let lastToll: { kind: string; strokes: number; distanceM: number } | null = null;

  function stopLoops(fadeS: number): void {
    const doomed = new Set(loops.map((l) => l.voice).filter(Boolean));
    if (doomed.size) pool.stop((v) => doomed.has(v), fadeS);
    loops = [];
  }

  function startLoop(asset: string, gainDb: number): void {
    loops.push({ voice: null, asset, gainDb });
  }

  function ensureLoops(): void {
    for (const loop of loops) {
      if (loop.voice && !loop.voice.dead) continue;
      loop.voice = pool.play(loop.asset, { loop: true, gainDb: loop.gainDb, bus: 'ambience', space: 'flat' });
    }
  }

  function pickSpot(): string | null {
    if (!scene || !scene.spots.length) return null;
    let total = 0;
    for (const [id, w] of scene.spots) total += id === lastSpot && scene.spots.length > 1 ? 0 : w;
    let roll = random() * total;
    for (const [id, w] of scene.spots) {
      const weight = id === lastSpot && scene.spots.length > 1 ? 0 : w;
      if (roll < weight) return id;
      roll -= weight;
    }
    return scene.spots[0][0];
  }

  const between = ([lo, hi]: readonly [number, number]) => lo + random() * (hi - lo);

  /** The nearest tower in earshot of the listener, or null. */
  function nearestTower(x: number, z: number): { tower: BellTower; distanceM: number } | null {
    let best: BellTower | null = null;
    let bestD: number = BELL_POLICY.maxM;
    for (const tower of getBellTowers?.() ?? []) {
      const d = Math.hypot(tower.x - x, tower.z - z);
      if (d < bestD) { best = tower; bestD = d; }
    }
    return best ? { tower: best, distanceM: bestD } : null;
  }

  /** One toll: a Western bell's one to three strokes, or an Orthodox tower's ring. */
  function toll(now: number, x: number, z: number): void {
    const tradition = scene?.bells;
    const near = tradition ? nearestTower(x, z) : null;
    if (!tradition || !near) { nextBellAt = now + BELL_POLICY.retryS; return; }
    const { tower } = near;
    const asset = BELL_ASSET[tradition];
    const strokes = tradition === 'orthodox' ? 1
      : BELL_POLICY.strokes[0] + Math.floor(random() * (BELL_POLICY.strokes[1] - BELL_POLICY.strokes[0] + 1));
    let at = 0;
    let rung = 0;
    for (let i = 0; i < strokes; i++) {
      if (pool.play(asset, { x: tower.x, y: tower.y, z: tower.z, rate: tower.rate, gainDb: tower.gainDb, delayS: at })) rung++;
      at += between(BELL_POLICY.strokeGapS);
    }
    nextBellAt = now + between(BELL_POLICY.everyS);
    if (rung) { tolls++; lastToll = { kind: tower.kind, strokes: rung, distanceM: Math.round(near.distanceM) }; }
  }

  return {
    play(next, battle) {
      if (scene === next && battleMode === battle && loops.length) return;
      stopLoops(1.2);
      scene = next;
      battleMode = battle;
      const ids = sceneAssets(next, battle);
      library.pin(ids);
      void library.load(ids);
      startLoop(next.bed, next.bedDb);
      if (next.layer) startLoop(next.layer.asset, next.layer.db);
      if (battle && next.war > 0) startLoop('amb_distant_battle', 20 * Math.log10(next.war) - 2);
      mixer.setReverb(next.reverb);
      const now = mixer.ctx.currentTime;
      nextSpotAt = now + next.spotEveryS[0] * 0.6;
      nextBellAt = next.bells ? now + between(BELL_POLICY.firstS) : Infinity;
      lastLoudAt = -Infinity;
    },
    stop(fadeS = 0.6) {
      stopLoops(fadeS);
      scene = null;
      nextBellAt = Infinity;
    },
    update(now, x, y, z) {
      if (!scene) return;
      ensureLoops();
      if (scene.bells) {
        // The fighting holds the bells: a loud event in the HDR window restarts the quiet the toll waits for.
        if (mixer.hdrTop >= BELL_POLICY.loudDb) lastLoudAt = now;
        if (now >= nextBellAt && now - lastLoudAt >= BELL_POLICY.quietS && (bellsAllowed?.() ?? true)) toll(now, x, z);
      }
      if (now < nextSpotAt) return;
      const [lo, hi] = scene.spotEveryS;
      nextSpotAt = now + lo + random() * (hi - lo);
      const id = pickSpot();
      if (!id) return;
      const bearing = random() * Math.PI * 2;
      const range = scene.indoor ? 3 + random() * 11 : 40 + random() * 340;
      const height = scene.indoor ? 1 + random() * 4
        : id.includes('gulls') || id.includes('hawk') || id.includes('eagle') || id.includes('geese') || id.includes('lark')
          ? 25 + random() * 60 : random() * 6;
      const voice = pool.play(id, {
        x: x + Math.cos(bearing) * range, y: y + height, z: z + Math.sin(bearing) * range,
        gainDb: scene.indoor ? 0 : clamp(-2 - range / 160, -6, 0), propagate: false,
      });
      if (voice) { lastSpot = id; spotsPlayed++; }
    },
    get active() { return !!scene; },
    get scene() { return scene; },
    state() {
      return {
        active: !!scene, bed: scene?.bed ?? null, layer: scene?.layer?.asset ?? null,
        loops: loops.map((l) => ({ asset: l.asset, playing: !!l.voice && !l.voice.dead, gain: +dbToGain(l.gainDb).toFixed(3) })),
        spotsPlayed, battle: battleMode, reverb: scene?.reverb ?? null,
        bells: scene?.bells ?? null, tolls, lastToll,
        nextTollInS: Number.isFinite(nextBellAt) ? +(nextBellAt - mixer.ctx.currentTime).toFixed(1) : null,
      };
    },
  };
}
