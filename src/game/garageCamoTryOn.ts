import * as THREE from 'three';
import { scratchCanvas } from '../ui/uiCanvas.ts';

/**
 * The Garage's camo try-on (INTERACTION-REDESIGN B, owner 2026-10-26: "make ... camo much more intuitive"): hovering
 * or focusing a paint shows it on the hero at once, and leaving puts the worn paint back with no side effect.
 *
 * The worn paint is a 1024-2048 px bake that takes hundreds of milliseconds to repaint and upload; a try-on paints the
 * same recipe (the hull's plate features, seed and pattern stream: materials.paintCamoTryOn) into a 256 px tile and
 * swaps the hull materials' `map` to it. The worn texture stays resident, so putting it back is a pointer swap with
 * no repaint and no upload. `preview` returns at once (the picker contract: under 8 ms); the tile paints on the next
 * task, and a newer call cancels a paint not yet run. The last tiles are kept, so a pointer sweeping back over a row
 * repaints nothing.
 */

const TRY_ON_PX = 256;
const TRY_ON_KEEP = 12;

interface TryOnTile { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture }

export interface GarageCamoTryOn {
  /** Try `selection` (a pattern id, 'auto' or 'custom') on `root`, the Garage hero; null (or no root) puts the worn
   *  paint back. */
  preview(root: THREE.Object3D | null, selection: string | null): void;
  /** A press wore `selection`: its tile stands in on `root` until its full bake lands (settle), whatever the pointer
   *  does meanwhile, so the hero never shows the old paint between the press and the bake. */
  wear(root: THREE.Object3D | null, selection: string): void;
  /** The worn paint has been repainted with `selection`: its tile gives way to it. A try-on of another paint stays. */
  settle(selection: string): void;
  /** The selection on the hero's tile (tried or being worn), or null. */
  readonly trying: string | null;
}

interface TryOnOptions {
  /** Paints `selection` as the hull whose albedo is `worn` would wear it into `canvas`; false when `worn` is no camo
   *  albedo (materials.paintCamoTryOn). */
  paint(worn: THREE.Texture, selection: string, canvas: HTMLCanvasElement): boolean;
  /** The hero's materials changed: the still Garage draws a frame. */
  onChange(): void;
  /** Run `callback` on a later task; returns its cancel (default: a zero-delay timer). */
  schedule?(callback: () => void): () => void;
  /** A tile canvas (default: a document canvas). */
  createCanvas?(): HTMLCanvasElement;
  /** Timings for the perf receipts (click-timeline's camo paths): a try-on's paint and swap ('try'), and a worn
   *  paint's press to its bake ('wear'), in milliseconds. */
  onTiming?(kind: 'try' | 'wear', ms: number, selection: string): void;
  now?(): number;
}

type MappedMaterial = THREE.Material & { map: THREE.Texture | null };

const hasMap = (material: THREE.Material): material is MappedMaterial =>
  'map' in material && (material as MappedMaterial).map instanceof THREE.Texture;

export function createGarageCamoTryOn(opts: TryOnOptions): GarageCamoTryOn {
  const schedule = opts.schedule ?? ((callback: () => void) => { const id = setTimeout(callback, 0); return () => clearTimeout(id); });
  const createCanvas = opts.createCanvas ?? (() => scratchCanvas(TRY_ON_PX, TRY_ON_PX));
  // each material the try-on re-mapped, with the worn texture it gives back
  const swapped = new Map<MappedMaterial, THREE.Texture>();
  let swappedRoot: THREE.Object3D | null = null;
  // the tiles, keyed by the worn texture and the selection, most recently used last; the hero's other maps (rubber,
  // tracks, kit) are no camo albedo and are never painted
  const tiles = new Map<string, TryOnTile>();
  const notCamo = new WeakSet<THREE.Texture>();
  let cancel: (() => void) | null = null;
  let trying: string | null = null;
  // the selection a press wore, shown on its tile until its bake lands, and when it was pressed
  let held: { root: THREE.Object3D; selection: string } | null = null;
  let wornAt: number | null = null;
  const now = opts.now ?? (() => performance.now());

  const restore = (): void => {
    if (!swapped.size) return;
    for (const [material, worn] of swapped) material.map = worn;
    swapped.clear();
    swappedRoot = null;
    opts.onChange();
  };

  /** The hero's mapped materials, each with the texture it wears (the worn one, under a try-on). */
  const wornMaps = (root: THREE.Object3D): Map<MappedMaterial, THREE.Texture> => {
    const out = new Map<MappedMaterial, THREE.Texture>();
    root.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      if (!material) return;
      for (const one of Array.isArray(material) ? material : [material]) {
        if (!hasMap(one) || out.has(one)) continue;
        out.set(one, swapped.get(one) ?? one.map as THREE.Texture);
      }
    });
    return out;
  };

  const tileFor = (worn: THREE.Texture, selection: string): TryOnTile | null => {
    if (notCamo.has(worn)) return null;
    const key = `${worn.uuid}|${selection}`;
    const kept = tiles.get(key);
    if (kept) { tiles.delete(key); tiles.set(key, kept); return kept; }
    const canvas = createCanvas();
    canvas.width = canvas.height = TRY_ON_PX;
    if (!opts.paint(worn, selection, canvas)) {
      canvas.width = canvas.height = 0;
      notCamo.add(worn);
      return null;
    }
    const texture = new THREE.CanvasTexture(canvas);
    // the worn texture's sampling, so the material keeps its program (no relink on a try-on)
    texture.colorSpace = worn.colorSpace;
    texture.wrapS = worn.wrapS;
    texture.wrapT = worn.wrapT;
    texture.repeat.copy(worn.repeat);
    texture.offset.copy(worn.offset);
    texture.center.copy(worn.center);
    texture.rotation = worn.rotation;
    texture.flipY = worn.flipY;
    texture.channel = worn.channel;
    texture.anisotropy = worn.anisotropy;
    const tile = { canvas, texture };
    tiles.set(key, tile);
    // the oldest tiles go, never one a material shows
    const shown = new Set([...swapped.keys()].map((material) => material.map));
    for (const [oldKey, old] of tiles) {
      if (tiles.size <= TRY_ON_KEEP) break;
      if (old === tile || shown.has(old.texture)) continue;
      tiles.delete(oldKey);
      old.texture.dispose();
      old.canvas.width = old.canvas.height = 0;
    }
    return tile;
  };

  const apply = (root: THREE.Object3D, selection: string): void => {
    const start = opts.onTiming ? now() : 0;
    cancel = null;
    if (swappedRoot && swappedRoot !== root) restore();
    let changed = false;
    for (const [material, worn] of wornMaps(root)) {
      const tile = tileFor(worn, selection);
      if (!tile) continue;
      if (!swapped.has(material)) swapped.set(material, worn);
      if (material.map !== tile.texture) { material.map = tile.texture; changed = true; }
    }
    if (swapped.size) swappedRoot = root;
    if (changed) opts.onChange();
    opts.onTiming?.('try', now() - start, selection);
  };

  const show = (root: THREE.Object3D | null, selection: string | null): void => {
    cancel?.();
    cancel = null;
    if (held && held.root !== root) held = null; // another tank: its bake is no longer on screen
    const target = root && selection !== null ? selection : held?.selection ?? null;
    const on = root ?? held?.root ?? null;
    trying = on && target !== null ? target : null;
    if (!on || target === null) { restore(); return; }
    cancel = schedule(() => apply(on, target));
  };

  return {
    get trying() { return trying; },
    preview: show,
    wear(root, selection) {
      held = root ? { root, selection } : null;
      wornAt = opts.onTiming ? now() : null;
      show(root, selection);
    },
    settle(selection) {
      if (wornAt !== null) { opts.onTiming?.('wear', now() - wornAt, selection); wornAt = null; }
      if (held?.selection === selection) held = null;
      if (trying !== selection) return;
      cancel?.();
      cancel = null;
      trying = null;
      restore();
    },
  };
}
