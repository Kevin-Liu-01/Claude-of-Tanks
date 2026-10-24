// The Deploy screen's objective map (brand-ui 242; the Premiere direction's 04-deploy page, its .bfield .mm). Copyright ©
// 2026 Kevin B. Liu.
// The chosen battlefield's opening objectives for the chosen mode (spawns, capture zones, flag bases, frontline sectors,
// goals), baked by tools/deploy-objectives-bake.mjs into public/minimaps/objectives.json through the battle's own
// placement and controller, drawn over its tactical map through the HUD's derivation and glyphs. Standard places no
// objective: its map shows the two spawns. A mode the bake leaves out shows the bare map.
import { objectiveMarkers, type ObjectiveMarker, type ObjectiveStateView } from './minimapObjectives.ts';
import { drawBallGlyph, drawGoalGlyph, drawHexBadge, drawPennant, drawSpawnGlyph, sideColor, sideFill } from './objectiveGlyphs.ts';
import { projectWorldToMinimap } from './minimapOrientation.ts';

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

/** Draw `mapId`'s opening objectives for `mode` on `canvas`, sized to its box; cleared when there are none. */
export async function drawDeployObjectives(canvas: HTMLCanvasElement, mapId: string, mode: string): Promise<void> {
  const data = await load();
  const ctx = canvas.getContext('2d');
  const box = canvas.clientWidth;
  if (!ctx || !box) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.round(box * dpr);
  if (canvas.width !== px || canvas.height !== px) { canvas.width = px; canvas.height = px; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px, px);
  const map = data?.maps[mapId];
  const state = map?.modes[mode];
  if (!map || !state) return;
  ctx.scale(dpr, dpr);
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
