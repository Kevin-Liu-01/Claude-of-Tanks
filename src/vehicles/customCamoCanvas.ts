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

type CustomCamoAssetPainter = (ctx: CanvasRenderingContext2D) => void;

const CUSTOM_CAMO_ASSET_PAINTERS: Readonly<Record<CustomCamoAsset, CustomCamoAssetPainter>> = {
  chevron(ctx) {
    ctx.moveTo(-.52, -.45); ctx.lineTo(0, 0); ctx.lineTo(.52, -.45);
    ctx.lineTo(.52, -.08); ctx.lineTo(0, .38); ctx.lineTo(-.52, -.08);
  },
  leaf(ctx) {
    ctx.moveTo(-.52, .38); ctx.bezierCurveTo(-.34, -.5, .32, -.58, .54, -.42);
    ctx.bezierCurveTo(.38, .34, -.12, .58, -.52, .38);
    ctx.moveTo(-.42, .35); ctx.lineTo(.38, -.36);
  },
  hex(ctx) {
    for (let index = 0; index < 6; index += 1) {
      const angle = Math.PI / 3 * index - Math.PI / 6;
      const px = Math.cos(angle) * .54;
      const py = Math.sin(angle) * .54;
      if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  },
  cross(ctx) {
    ctx.rect(-.16, -.55, .32, 1.1);
    ctx.rect(-.55, -.16, 1.1, .32);
  },
  star(ctx) {
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 ? .22 : .56;
      const angle = -Math.PI / 2 + Math.PI * 2 * index / 10;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  },
};

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
  CUSTOM_CAMO_ASSET_PAINTERS[asset](ctx);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function resolveBrush(value: RuntimeValue): CustomCamoBrush {
  return CUSTOM_CAMO_BRUSHES.includes(value as CustomCamoBrush)
    ? value as CustomCamoBrush
    : CUSTOM_CAMO_BRUSHES[0];
}

function resolveAsset(value: RuntimeValue): CustomCamoAsset {
  return CUSTOM_CAMO_ASSETS.includes(value as CustomCamoAsset)
    ? value as CustomCamoAsset
    : 'star';
}

function paintStampStroke(
  ctx: CanvasRenderingContext2D,
  stroke: CamoStrokeInput,
  points: ReadonlyArray<ReadonlyArray<number>>,
  width: number,
  height: number,
  lineWidth: number,
): void {
  const asset = resolveAsset(stroke.asset);
  const rotation = Number(stroke.rotation) || 0;
  for (const point of points) {
    const [x, y] = pointXY(point, width, height);
    drawAsset(ctx, asset, x, y, lineWidth, rotation);
  }
}

function paintSprayStroke(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<ReadonlyArray<number>>,
  width: number,
  height: number,
  lineWidth: number,
  strokeIndex: number,
): void {
  const count = Math.max(7, Math.min(24, Math.round(lineWidth * .7)));
  for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
    const point = points[pointIndex];
    const [x, y] = pointXY(point, width, height);
    for (let dot = 0; dot < count; dot++) {
      const seed = strokeIndex * 73856093 + pointIndex * 19349663
        + dot * 83492791 + point[0] * 97 + point[1];
      const angle = seededUnit(seed) * Math.PI * 2;
      const radius = Math.sqrt(seededUnit(seed + 31)) * lineWidth * .52;
      const dotRadius = Math.max(
        .65,
        lineWidth * (.035 + seededUnit(seed + 73) * .065),
      );
      ctx.beginPath();
      ctx.arc(
        x + Math.cos(angle) * radius,
        y + Math.sin(angle) * radius,
        dotRadius,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

function paintPixelStroke(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<ReadonlyArray<number>>,
  width: number,
  height: number,
  lineWidth: number,
): void {
  const side = Math.max(2, lineWidth * .72);
  for (const point of points) {
    const [x, y] = pointXY(point, width, height);
    ctx.fillRect(
      Math.round(x / side) * side - side / 2,
      Math.round(y / side) * side - side / 2,
      side,
      side,
    );
  }
}

function paintSinglePoint(
  ctx: CanvasRenderingContext2D,
  brush: CustomCamoBrush,
  point: ReadonlyArray<number>,
  width: number,
  height: number,
  lineWidth: number,
): void {
  const [x, y] = pointXY(point, width, height);
  if (brush === 'flat') {
    ctx.fillRect(x - lineWidth / 2, y - lineWidth / 2, lineWidth, lineWidth);
    return;
  }
  ctx.beginPath();
  ctx.arc(x, y, lineWidth / 2, 0, Math.PI * 2);
  ctx.fill();
}

function paintLineStroke(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<ReadonlyArray<number>>,
  width: number,
  height: number,
): void {
  const [x, y] = pointXY(points[0], width, height);
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let index = 1; index < points.length; index++) {
    const [px, py] = pointXY(points[index], width, height);
    ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function paintStrokeGeometry(
  ctx: CanvasRenderingContext2D,
  stroke: CamoStrokeInput,
  brush: CustomCamoBrush,
  points: ReadonlyArray<ReadonlyArray<number>>,
  width: number,
  height: number,
  lineWidth: number,
  strokeIndex: number,
): void {
  if (brush === 'stamp') {
    paintStampStroke(ctx, stroke, points, width, height, lineWidth);
  } else if (brush === 'spray') {
    paintSprayStroke(ctx, points, width, height, lineWidth, strokeIndex);
  } else if (brush === 'pixel') {
    paintPixelStroke(ctx, points, width, height, lineWidth);
  } else if (points.length === 1) {
    paintSinglePoint(ctx, brush, points[0], width, height, lineWidth);
  } else {
    paintLineStroke(ctx, points, width, height);
  }
}

/** Paint normalized vector strokes into one tile-sized canvas region. */
export function paintCustomCamoStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly CamoStrokeInput[] | null | undefined,
  {
  width, height, colorA, colorB, eraseColor,
  }: CustomCamoPaintOptions,
): void {
  if (!strokes) return;
  const minSide = Math.min(width, height);
  for (let strokeIndex = 0; strokeIndex < strokes.length; strokeIndex++) {
    const stroke = strokes[strokeIndex];
    const points = stroke.points || [];
    if (!points.length) continue;
    const brush = resolveBrush(stroke.brush);
    const color = brush === 'eraser' ? eraseColor : stroke.color === 1 ? colorB : colorA;
    const lineWidth = Math.max(1, (Number(stroke.size) || 8) / 100 * minSide);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = brush === 'flat' ? 'bevel' : 'round';
    ctx.lineCap = brush === 'flat' ? 'butt' : 'round';
    paintStrokeGeometry(
      ctx,
      stroke,
      brush,
      points,
      width,
      height,
      lineWidth,
      strokeIndex,
    );
    ctx.restore();
  }
}
