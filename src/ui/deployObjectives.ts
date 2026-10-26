// The Deploy screen's objective map (brand-ui 242; the Premiere direction's 04-deploy page, its .bfield .mm). Copyright ©
// 2026 Kevin B. Liu.
// The chosen battlefield's opening objectives for the chosen mode (spawns, capture zones, flag bases, frontline sectors,
// goals), baked by tools/deploy-objectives-bake.mjs into public/minimaps/objectives.json through the battle's own
// placement and controller, drawn over its tactical map through the HUD's derivation and glyphs. Standard places no
// objective: its map shows the two spawns. A mode the bake leaves out shows the bare map.
import { objectiveMarkers, type ObjectiveMarker, type ObjectiveStateView } from './minimapObjectives.ts';
import { drawBallGlyph, drawGoalGlyph, drawHexBadge, drawPennant, drawSpawnGlyph, sideColor, sideFill } from './objectiveGlyphs.ts';
import { projectWorldToMinimap } from './minimapOrientation.ts';
import { uiCanvas } from './uiCanvas.ts';

interface BakedMap { readonly size: number; readonly modes: Readonly<Record<string, ObjectiveStateView>> }
interface Baked { readonly maps: Readonly<Record<string, BakedMap>> }

let baked: Promise<Baked | null> | null = null;
function load(): Promise<Baked | null> {
  baked ??= fetch('/minimaps/objectives.json')
    .then((response) => (response.ok ? response.json() as Promise<Baked> : null))
    .catch(() => null);
  return baked;
}

function markersOf(state: ObjectiveStateView): ObjectiveMarker[] {
  if (state.id !== 'standard') return objectiveMarkers(state);
  return (state.spawns ?? []).map((spawn): ObjectiveMarker => ({
    kind: 'spawn', x: spawn.x, z: spawn.z, side: spawn.team === 'alpha' ? 'own' : 'enemy', priority: 0,
  }));
}

const _point = [0, 0];

/** What each objective canvas shows (its drawing redraws from it at every box and ratio). */
const shown = new WeakMap<HTMLCanvasElement, { map: BakedMap | null; mode: string }>();

/** Draw `mapId`'s opening objectives for `mode` on `canvas` (sized to its box by uiCanvas, redrawn when the box or the
 *  ratio changes and when it shows again); cleared when there are none. */
export async function drawDeployObjectives(canvas: HTMLCanvasElement, mapId: string, mode: string): Promise<void> {
  const data = await load();
  shown.set(canvas, { map: data?.maps[mapId] ?? null, mode });
  uiCanvas(canvas, { draw: paintObjectives }).redraw();
}

function paintObjectives(ctx: CanvasRenderingContext2D, width: number, height: number, surface: { readonly canvas: HTMLCanvasElement }): void {
  ctx.clearRect(0, 0, width, height);
  const entry = shown.get(surface.canvas);
  const map = entry?.map;
  const state = entry && map ? map.modes[entry.mode] : undefined;
  if (!map || !state) return;
  const box = Math.min(width, height);
  // the badges scale with the map, as the direction's (a hex a tenth of its side)
  const r = Math.max(7, box * 0.05);
  for (const marker of markersOf(state)) {
    projectWorldToMinimap(marker.x, marker.z, map.size, box, _point);
    const x = Math.max(r, Math.min(box - r, _point[0])), y = Math.max(r, Math.min(box - r, _point[1]));
    const color = sideColor(marker.side), fill = sideFill(marker.side);
    switch (marker.kind) {
      case 'spawn': drawSpawnGlyph(ctx, x, y, r * 0.8, color, fill); break;
      case 'zone':
      case 'sector':
        drawHexBadge(ctx, x, y, r, { fill, stroke: color, label: marker.label, dashed: marker.status === 'locked' });
        break;
      case 'flagBase': drawPennant(ctx, x, y, r * 1.6, color); break;
      case 'goal': drawGoalGlyph(ctx, x, y, r * 0.8, color, fill); break;
      case 'ball': drawBallGlyph(ctx, x, y, r * 0.5); break;
      default: break;
    }
  }
}
