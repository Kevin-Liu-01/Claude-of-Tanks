// Outdoor Garage service-yard wear (the owner, 2026-10-09: "make garages look a lot lot better, more detailed ...
// better textures"). One shared canvas texture lays the working history of a tank service apron over each outdoor
// pack's paved hardstand: track lanes worn in from the approach road with their cleat marks, the grime ring the
// turntable traffic leaves, oil and hydraulic stains, and worn painted bay lines with a stencilled bay number.
//
// The texture is drawn once per page (about 15 ms, first outdoor pack only) and shared by every pack; each pack adds
// one transparent, shadow-receiving decal plane aligned to its own approach road. Plain Node (receipts) has no
// canvas, so the decal is skipped there.
import * as THREE from 'three';

const YARD_WIDTH_M = 29;
const YARD_DEPTH_M = 24;
const CANVAS_W = 1024;
const CANVAS_H = Math.round((CANVAS_W * YARD_DEPTH_M) / YARD_WIDTH_M);
const PX_PER_M = CANVAS_W / YARD_WIDTH_M;
/** Everything the decal paints fades out by this radius, inside the hardstand's 12 m half-depth in any yaw. */
const YARD_RADIUS_M = 11.8;
const YARD_FADE_START_M = 10.2;

let sharedTexture: THREE.CanvasTexture | null = null;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Canvas coordinates of a yard point (metres: x right, y toward the approach road; the turntable at the origin). */
function px(xM: number, yM: number): [number, number] {
  return [CANVAS_W / 2 + xM * PX_PER_M, CANVAS_H / 2 - yM * PX_PER_M];
}

function drawYardWear(g: CanvasRenderingContext2D): void {
  const rng = mulberry(20261010);
  g.clearRect(0, 0, CANVAS_W, CANVAS_H);
  const blot = (xM: number, yM: number, rM: number, rgba0: string, rgba1: string, squash = 1): void => {
    const [x, y] = px(xM, yM);
    const r = rM * PX_PER_M;
    g.save();
    g.translate(x, y);
    g.rotate(rng() * Math.PI);
    g.scale(1, squash);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, rgba0);
    grad.addColorStop(0.65, rgba1);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  // the traffic grime ring the turntable leaves (heaviest where hulls swing on and off)
  for (let i = 0; i < 140; i++) {
    const a = rng() * Math.PI * 2;
    const r = 6.6 + rng() * 2.8;
    blot(Math.cos(a) * r, Math.sin(a) * r, 0.7 + rng() * 1.3, 'rgba(26,24,21,0.16)', 'rgba(26,24,21,0.07)', 0.6);
  }
  // track lanes worn in from the approach road: two bands at the hull's track gauge, cleat marks across them
  const gauge = 2.85, band = 0.62;
  for (const side of [-1, 1]) {
    const x0 = side * gauge / 2;
    for (let yM = 6.3; yM < YARD_DEPTH_M / 2; yM += 0.05) {
      const fade = Math.min(1, (yM - 6.3) / 1.5) * (1 - Math.max(0, (yM - 10.5) / 1.6));
      const wobble = Math.sin(yM * 0.7 + side) * 0.06;
      const [x, y] = px(x0 + wobble - band / 2, yM);
      g.fillStyle = `rgba(30,27,24,${(0.13 * fade).toFixed(3)})`;
      g.fillRect(x, y, band * PX_PER_M, 0.05 * PX_PER_M + 1);
    }
    for (let yM = 6.6; yM < 11.5; yM += 0.17) {
      const [x, y] = px(x0 - band / 2 + 0.04, yM);
      g.fillStyle = 'rgba(22,20,18,0.16)';
      g.fillRect(x, y, (band - 0.08) * PX_PER_M, 0.055 * PX_PER_M);
    }
  }
  // a pivot-turn scuff arc where a hull neutral-steered off the turntable
  g.strokeStyle = 'rgba(28,25,22,0.12)';
  g.lineWidth = band * PX_PER_M;
  for (const r of [7.4, 7.4 + gauge]) {
    const [cx, cy] = px(-1.2, 7.2);
    g.beginPath(); g.arc(cx, cy, r * PX_PER_M * 0.42, Math.PI * 0.05, Math.PI * 0.62); g.stroke();
  }
  // oil, hydraulic fluid and coolant: the dark history of every pack pulled and every road wheel changed
  for (let i = 0; i < 34; i++) {
    const nearLane = rng() < 0.55;
    const xM = nearLane ? (rng() < 0.5 ? -1 : 1) * (gauge / 2 + (rng() - 0.5) * 1.4) : (rng() - 0.5) * (YARD_WIDTH_M - 4);
    const yM = nearLane ? 6.5 + rng() * 5 : (rng() - 0.5) * (YARD_DEPTH_M - 4);
    if (Math.hypot(xM, yM) < 6.6) continue;
    const r = 0.25 + rng() * (rng() < 0.2 ? 1.6 : 0.7);
    blot(xM, yM, r, 'rgba(16,14,13,0.42)', 'rgba(20,18,16,0.16)', 0.55 + rng() * 0.45);
    if (rng() < 0.35) blot(xM + (rng() - 0.5) * r, yM + (rng() - 0.5) * r, r * 0.45, 'rgba(36,30,22,0.22)', 'rgba(36,30,22,0.08)');
  }
  // worn painted bay: a dashed yellow box round the turntable, corner Ls, a white stop bar across the lanes
  const paint = (color: string, alpha: number, draw: () => void): void => {
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = color;
    g.fillStyle = color;
    draw();
    g.restore();
    // chip the paint: floor-coloured nicks erase it in places
    g.save();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(0,0,0,${(0.4 + rng() * 0.6).toFixed(2)})`;
      g.fillRect(rng() * CANVAS_W, rng() * CANVAS_H, 2 + rng() * 9, 1 + rng() * 4);
    }
    g.restore();
  };
  const half = 7.9;
  paint('rgb(206,170,52)', 0.5, () => {
    const [x0, y0] = px(-half, half);
    g.lineWidth = 0.16 * PX_PER_M;
    g.setLineDash([1.1 * PX_PER_M, 0.7 * PX_PER_M]);
    g.strokeRect(x0, y0, half * 2 * PX_PER_M, half * 2 * PX_PER_M);
    g.setLineDash([]);
    g.lineWidth = 0.22 * PX_PER_M;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const [cx, cy] = px(sx * half, sy * half);
      g.beginPath();
      g.moveTo(cx - sx * 1.4 * PX_PER_M, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * 1.4 * PX_PER_M);
      g.stroke();
    }
  });
  paint('rgb(214,216,212)', 0.36, () => {
    const [x0, y0] = px(-gauge / 2 - 0.9, 8.0);
    g.fillRect(x0, y0, (gauge + 1.8) * PX_PER_M, 0.3 * PX_PER_M);
  });
  // a stencilled bay number off to one side of the bay mouth, small and worn like the real thing
  paint('rgb(214,216,212)', 0.26, () => {
    g.font = `bold ${Math.round(0.62 * PX_PER_M)}px "Arial Narrow", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const [tx, ty] = px(half - 2.2, -half + 0.85);
    g.fillText('BAY 2', tx, ty);
  });
  // fine grit and tyre-dust speckle so the decal never reads as a clean overlay
  for (let i = 0; i < 2600; i++) {
    const [x, y] = [rng() * CANVAS_W, rng() * CANVAS_H];
    g.fillStyle = rng() < 0.7 ? 'rgba(20,18,16,0.10)' : 'rgba(180,170,150,0.06)';
    g.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
  }
  // a radial edge fade: whatever the pack's approach yaw, the decal stays inside the hardstand's 12 m half-depth
  g.save();
  g.globalCompositeOperation = 'destination-in';
  const [cx, cy] = px(0, 0);
  const edge = g.createRadialGradient(cx, cy, YARD_FADE_START_M * PX_PER_M, cx, cy, YARD_RADIUS_M * PX_PER_M);
  edge.addColorStop(0, 'rgba(0,0,0,1)');
  edge.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = edge;
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);
  g.restore();
}

/** The shared yard-wear texture, drawn on first use; null where no canvas exists (plain Node). */
export function garageYardWearTexture(anisotropy = 4): THREE.CanvasTexture | null {
  if (sharedTexture) return sharedTexture;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const g = canvas.getContext('2d');
  if (!g) return null;
  drawYardWear(g);
  sharedTexture = new THREE.CanvasTexture(canvas);
  sharedTexture.colorSpace = THREE.SRGBColorSpace;
  sharedTexture.anisotropy = anisotropy;
  sharedTexture.userData.sharedGarageYardWear = true;
  return sharedTexture;
}

/** Yard plane size (m) and the canvas it carries, for receipts. */
export const GARAGE_YARD_WEAR = Object.freeze({
  widthM: YARD_WIDTH_M, depthM: YARD_DEPTH_M, radiusM: YARD_RADIUS_M, canvasW: CANVAS_W, canvasH: CANVAS_H,
});
