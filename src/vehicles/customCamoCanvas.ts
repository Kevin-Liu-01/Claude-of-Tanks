// Deterministic custom-camouflage stroke renderer shared by the Garage editor
// and the material bake. It intentionally performs no DOM work and creates no
// runtime game objects; painting happens only while authoring or baking.

import { CUSTOM_CAMO_ASSETS, CUSTOM_CAMO_BRUSHES } from './camoPolicy.ts';
import type { CustomCamoAsset, CustomCamoBrush } from './camoPolicy.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';

export { CUSTOM_CAMO_ASSETS, CUSTOM_CAMO_BRUSHES } from './camoPolicy.ts';

interface CamoStrokeInput {
  color?: RuntimeValue;
  size?: RuntimeValue;
  brush?: RuntimeValue;
  asset?: RuntimeValue;
  rotation?: RuntimeValue;
  points?: ReadonlyArray<ReadonlyArray<number>>;
}

export interface CustomCamoPaintOptions {
  width: number;
  height: number;
  colorA: string;
  colorB: string;
  eraseColor: string;
}

function seededUnit(seed: number): number {
  let value = (seed | 0) ^ 0x9e3779b9;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function pointXY(point: ReadonlyArray<number>, width: number, height: number): [number, number] {
  return [(point[0] / 100) * width, (point[1] / 100) * height];
}

function drawAsset(
  ctx: CanvasRenderingContext2D,
  asset: CustomCamoAsset,
  x: number,
  y: number,
  size: number,
  rotation = 0,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.scale(size, size);
  ctx.beginPath();
  if (asset === 'chevron') {
    ctx.moveTo(-.52, -.45); ctx.lineTo(0, 0); ctx.lineTo(.52, -.45);
    ctx.lineTo(.52, -.08); ctx.lineTo(0, .38); ctx.lineTo(-.52, -.08);
  } else if (asset === 'leaf') {
    ctx.moveTo(-.52, .38); ctx.bezierCurveTo(-.34, -.5, .32, -.58, .54, -.42);
    ctx.bezierCurveTo(.38, .34, -.12, .58, -.52, .38);
    ctx.moveTo(-.42, .35); ctx.lineTo(.38, -.36);
  } else if (asset === 'hex') {
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 3 * i - Math.PI / 6;
      const px = Math.cos(angle) * .54, py = Math.sin(angle) * .54;
      if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  } else if (asset === 'cross') {
    ctx.rect(-.16, -.55, .32, 1.1); ctx.rect(-.55, -.16, 1.1, .32);
  } else {
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 ? .22 : .56;
      const angle = -Math.PI / 2 + Math.PI * 2 * i / 10;
      const px = Math.cos(angle) * radius, py = Math.sin(angle) * radius;
      if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Paint normalized vector strokes into one tile-sized canvas region. */
export function paintCustomCamoStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly CamoStrokeInput[] | null | undefined,
  {
  width, height, colorA, colorB, eraseColor,
  }: CustomCamoPaintOptions,
): void {
  const minSide = Math.min(width, height);
  const sourceStrokes = strokes || [];
  for (let strokeIndex = 0; strokeIndex < sourceStrokes.length; strokeIndex++) {
    const stroke = sourceStrokes[strokeIndex];
    const points = stroke.points || [];
    if (!points.length) continue;
    const brush: CustomCamoBrush = CUSTOM_CAMO_BRUSHES.includes(stroke.brush as CustomCamoBrush)
      ? stroke.brush as CustomCamoBrush
      : 'round';
    const color = brush === 'eraser' ? eraseColor : stroke.color === 1 ? colorB : colorA;
    const lineWidth = Math.max(1, (Number(stroke.size) || 8) / 100 * minSide);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = brush === 'flat' ? 'bevel' : 'round';
    ctx.lineCap = brush === 'flat' ? 'butt' : 'round';
    if (brush === 'stamp') {
      for (const point of points) {
        const [x, y] = pointXY(point, width, height);
        const asset: CustomCamoAsset = CUSTOM_CAMO_ASSETS.includes(stroke.asset as CustomCamoAsset)
          ? stroke.asset as CustomCamoAsset
          : 'star';
        drawAsset(ctx, asset, x, y, lineWidth, Number(stroke.rotation) || 0);
      }
    } else if (brush === 'spray') {
      for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
        const [x, y] = pointXY(points[pointIndex], width, height);
        const count = Math.max(7, Math.min(24, Math.round(lineWidth * .7)));
        for (let dot = 0; dot < count; dot++) {
          const seed = strokeIndex * 73856093 + pointIndex * 19349663 + dot * 83492791 + points[pointIndex][0] * 97 + points[pointIndex][1];
          const angle = seededUnit(seed) * Math.PI * 2;
          const radius = Math.sqrt(seededUnit(seed + 31)) * lineWidth * .52;
          const dotRadius = Math.max(.65, lineWidth * (.035 + seededUnit(seed + 73) * .065));
          ctx.beginPath();
          ctx.arc(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (brush === 'pixel') {
      const side = Math.max(2, lineWidth * .72);
      for (const point of points) {
        const [x, y] = pointXY(point, width, height);
        ctx.fillRect(Math.round(x / side) * side - side / 2, Math.round(y / side) * side - side / 2, side, side);
      }
    } else if (points.length === 1) {
      const [x, y] = pointXY(points[0], width, height);
      if (brush === 'flat') ctx.fillRect(x - lineWidth / 2, y - lineWidth / 2, lineWidth, lineWidth);
      else {
        ctx.beginPath(); ctx.arc(x, y, lineWidth / 2, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      const [x, y] = pointXY(points[0], width, height);
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let i = 1; i < points.length; i++) {
        const [px, py] = pointXY(points[i], width, height);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}
