/**
 * Ambience director: plays an environment scene — the stereo bed, the water
 * or machinery layer, the distant-war bed in battle — and scatters the
 * scene's positional spot sounds around the listener (random bearing,
 * 40–380 m, never two in a row from the same id) so a battlefield never
 * sounds like a loop. Scene changes crossfade; nothing allocates per frame.
 */

import { clamp, dbToGain } from './audioMath.ts';
import type { AssetLibrary } from './assetLibrary.ts';
import type { EnvironmentScene } from './environmentScenes.ts';
import type { Mixer } from './mixer.ts';
import type { ActiveVoice, VoicePool } from './voicePool.ts';

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
}

export function sceneAssets(scene: EnvironmentScene, battle: boolean): string[] {
  const ids = [scene.bed, ...scene.spots.map(([id]) => id)];
  if (scene.layer) ids.push(scene.layer.asset);
  if (battle && scene.war > 0) ids.push('amb_distant_battle');
  return ids;
}

export function createAmbienceDirector({ mixer, library, pool, random }: AmbienceOptions): AmbienceDirector {
  let scene: EnvironmentScene | null = null;
  let loops: { voice: ActiveVoice | null; asset: string; gainDb: number }[] = [];
  let nextSpotAt = 0;
  let lastSpot = '';
  let battleMode = false;
  let spotsPlayed = 0;

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
      nextSpotAt = mixer.ctx.currentTime + next.spotEveryS[0] * 0.6;
    },
    stop(fadeS = 0.6) {
      stopLoops(fadeS);
      scene = null;
    },
    update(now, x, y, z) {
      if (!scene) return;
      ensureLoops();
      if (now < nextSpotAt) return;
      const [lo, hi] = scene.spotEveryS;
      nextSpotAt = now + lo + random() * (hi - lo);
      const id = pickSpot();
      if (!id) return;
      const bearing = random() * Math.PI * 2;
      const range = 40 + random() * 340;
      const height = id.includes('gulls') || id.includes('hawk') || id.includes('eagle') || id.includes('geese') || id.includes('lark')
        ? 25 + random() * 60 : random() * 6;
      const voice = pool.play(id, {
        x: x + Math.cos(bearing) * range, y: y + height, z: z + Math.sin(bearing) * range,
        gainDb: clamp(-2 - range / 160, -6, 0), propagate: false,
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
      };
    },
  };
}
