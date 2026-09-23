/**
 * Objective glyphs (tactical map batch, 2026-09-15). One canvas-2D language
 * for every objective marker the game draws: the HUD minimap paints these
 * directly, and the world presentation rasterises the same glyphs into
 * sprite textures that float above the objectives in the battlefield, so a
 * zone hexagon, a flag pennant or a supply cache reads identically on the
 * map and in the world.
 *
 * Every function draws centred on (x, y) in the current transform; `r` is
 * the glyph's nominal radius in the caller's units (CSS px on the minimap,
 * texture px for sprites). Colours arrive from OBJECTIVE_PALETTE: own team
 * green, enemy red, neutral chalk, contested amber — the HUD's blip colours.
 */

export type ObjectiveSide = 'own' | 'enemy' | 'neutral' | 'contested';

export const OBJECTIVE_PALETTE = Object.freeze({
  own: '#7ee87e',
  enemy: '#f05a5a',
  neutral: '#e8eef3',
  contested: '#f3a536',
  ownFill: 'rgba(126,232,126,0.34)',
  enemyFill: 'rgba(240,90,90,0.34)',
  neutralFill: 'rgba(232,238,243,0.16)',
  contestedFill: 'rgba(243,165,54,0.34)',
  keyline: 'rgba(6,9,12,0.86)',
  chalk: '#f4f8fc',
  heal: '#65e68a',
  ammo: '#f3a536',
  ball: '#f6f9fc',
});

export function sideColor(side: ObjectiveSide): string {
  return OBJECTIVE_PALETTE[side];
}

export function sideFill(side: ObjectiveSide): string {
  return side === 'own' ? OBJECTIVE_PALETTE.ownFill
    : side === 'enemy' ? OBJECTIVE_PALETTE.enemyFill
      : side === 'contested' ? OBJECTIVE_PALETTE.contestedFill
        : OBJECTIVE_PALETTE.neutralFill;
}

type Ctx = CanvasRenderingContext2D;

/** Pointy-top hexagon path (the capture-zone / sector badge shape). */
function hexPath(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 3;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

interface BadgeStyle {
  fill: string;
  stroke: string;
  label?: string;
  labelColor?: string;
  font?: string;
  /** dashed ring: a contested or locked badge */
  dashed?: boolean;
  /** stroke weight of the coloured ring (the dark keyline is drawn under it) */
  ringWidth?: number;
}

/** Hexagonal badge with a dark keyline, coloured ring, translucent fill and an optional letter. */
export function drawHexBadge(ctx: Ctx, x: number, y: number, r: number, style: BadgeStyle): void {
  const ringWidth = style.ringWidth ?? r * 0.2;
  ctx.save();
  ctx.lineJoin = 'round';
  hexPath(ctx, x, y, r);
  ctx.fillStyle = style.fill;
  ctx.fill();
  ctx.lineWidth = ringWidth + r * 0.16;
  ctx.strokeStyle = OBJECTIVE_PALETTE.keyline;
  ctx.stroke();
  if (style.dashed) ctx.setLineDash([r * 0.42, r * 0.28]);
  ctx.lineWidth = ringWidth;
  ctx.strokeStyle = style.stroke;
  ctx.stroke();
  ctx.setLineDash([]);
  if (style.label) {
    ctx.font = style.font || `700 ${Math.round(r * 1.05)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(1, r * 0.22);
    ctx.strokeStyle = OBJECTIVE_PALETTE.keyline;
    ctx.strokeText(style.label, x, y + r * 0.06);
    ctx.fillStyle = style.labelColor || OBJECTIVE_PALETTE.chalk;
    ctx.fillText(style.label, x, y + r * 0.06);
  }
  ctx.restore();
}

/** Progress arc around a badge: `fraction` 0..1 clockwise from 12 o'clock. */
export function drawProgressArc(
  ctx: Ctx, x: number, y: number, r: number, fraction: number, color: string, width: number,
): void {
  const f = Math.max(0, Math.min(1, fraction));
  if (f <= 0.005) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = width + 1.6;
  ctx.strokeStyle = OBJECTIVE_PALETTE.keyline;
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Swallow-tail pennant on a pole; `h` is the pole height, the pennant hangs from its top. */
export function drawPennant(ctx: Ctx, x: number, y: number, h: number, color: string): void {
  const poleW = Math.max(1.1, h * 0.09);
  const flagW = h * 0.62;
  const flagH = h * 0.38;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // dark halo under everything
  ctx.strokeStyle = OBJECTIVE_PALETTE.keyline;
  ctx.lineWidth = poleW + 2.2;
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.28);
  ctx.lineTo(x, y - h * 0.72);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - h * 0.72);
  ctx.lineTo(x + flagW, y - h * 0.72 + flagH * 0.18);
  ctx.lineTo(x + flagW * 0.66, y - h * 0.72 + flagH * 0.5);
  ctx.lineTo(x + flagW, y - h * 0.72 + flagH * 0.82);
  ctx.lineTo(x, y - h * 0.72 + flagH);
  ctx.closePath();
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  // chalk pole over the halo, base pip
  ctx.strokeStyle = OBJECTIVE_PALETTE.chalk;
  ctx.lineWidth = poleW;
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.28);
  ctx.lineTo(x, y - h * 0.72);
  ctx.stroke();
  ctx.fillStyle = OBJECTIVE_PALETTE.chalk;
  ctx.beginPath();
  ctx.arc(x, y + h * 0.28, poleW * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Team spawn / base: keylined ring with four cardinal ticks, tinted cap and the pennant. */
export function drawSpawnGlyph(
  ctx: Ctx, x: number, y: number, r: number, color: string, fill: string, pennant = true,
): void {
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = r * 0.36;
  ctx.strokeStyle = OBJECTIVE_PALETTE.keyline;
  ctx.stroke();
  ctx.lineWidth = r * 0.2;
  ctx.strokeStyle = color;
  ctx.stroke();
  // cardinal ticks outside the ring
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    ctx.moveTo(x + Math.cos(angle) * (r + r * 0.16), y + Math.sin(angle) * (r + r * 0.16));
    ctx.lineTo(x + Math.cos(angle) * (r + r * 0.42), y + Math.sin(angle) * (r + r * 0.42));
  }
  ctx.strokeStyle = OBJECTIVE_PALETTE.keyline;
  ctx.lineWidth = r * 0.3;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.14;
  ctx.stroke();
  if (pennant) drawPennant(ctx, x, y + r * 0.1, r * 1.3, color);
  ctx.restore();
}

/** Turbo Ball goal: keylined ring with a goal mouth (two posts and a crossbar) in the team colour. */
export function drawGoalGlyph(ctx: Ctx, x: number, y: number, r: number, color: string, fill: string): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = r * 0.34;
  ctx.strokeStyle = OBJECTIVE_PALETTE.keyline;
  ctx.stroke();
  ctx.lineWidth = r * 0.18;
  ctx.strokeStyle = color;
  ctx.stroke();
  // goal frame: posts down from a crossbar, net hatching
  const gw = r * 0.62;
  const gh = r * 0.52;
  ctx.lineWidth = r * 0.16;
  ctx.strokeStyle = OBJECTIVE_PALETTE.keyline;
  ctx.beginPath();
  ctx.moveTo(x - gw, y + gh * 0.6); ctx.lineTo(x - gw, y - gh * 0.5);
  ctx.lineTo(x + gw, y - gh * 0.5); ctx.lineTo(x + gw, y + gh * 0.6);
  ctx.stroke();
  ctx.lineWidth = r * 0.09;
  ctx.strokeStyle = OBJECTIVE_PALETTE.chalk;
  ctx.stroke();
  ctx.lineWidth = r * 0.05;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) {
    ctx.moveTo(x + i * gw * 0.4, y - gh * 0.5);
    ctx.lineTo(x + i * gw * 0.4, y + gh * 0.4);
  }
  ctx.moveTo(x - gw, y); ctx.lineTo(x + gw, y);
  ctx.stroke();
  ctx.restore();
}

/** The turbo ball: chalk disc with a dark keyline and a specular crescent. */
export function drawBallGlyph(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = OBJECTIVE_PALETTE.ball;
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, r * 0.26);
  ctx.strokeStyle = OBJECTIVE_PALETTE.keyline;
  ctx.stroke();
  // seam
  ctx.lineWidth = Math.max(0.8, r * 0.12);
  ctx.strokeStyle = 'rgba(20,30,40,0.55)';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.restore();
}

/** Supply cache disc: chalk disc, keyline, and a heal cross or three shells. */
export function drawPickupGlyph(ctx: Ctx, x: number, y: number, r: number, kind: 'heal' | 'ammo'): void {
  const color = kind === 'heal' ? OBJECTIVE_PALETTE.heal : OBJECTIVE_PALETTE.ammo;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(14,20,24,0.78)';
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, r * 0.22);
  ctx.strokeStyle = OBJECTIVE_PALETTE.keyline;
  ctx.stroke();
  ctx.lineWidth = Math.max(0.9, r * 0.12);
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = color;
  if (kind === 'heal') {
    const arm = r * 0.58;
    const thick = r * 0.28;
    ctx.fillRect(x - thick / 2, y - arm, thick, arm * 2);
    ctx.fillRect(x - arm, y - thick / 2, arm * 2, thick);
  } else {
    const w = r * 0.24;
    const h = r * 0.98;
    for (let i = -1; i <= 1; i++) {
      const cx = x + i * w * 1.55;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, y + h / 2);
      ctx.lineTo(cx - w / 2, y - h * 0.12);
      ctx.quadraticCurveTo(cx, y - h * 0.62, cx + w / 2, y - h * 0.12);
      ctx.lineTo(cx + w / 2, y + h / 2);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Check mark for a taken sector. */
export function drawCheck(ctx: Ctx, x: number, y: number, s: number, color: string): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.55, y + s * 0.02);
  ctx.lineTo(x - s * 0.12, y + s * 0.45);
  ctx.lineTo(x + s * 0.6, y - s * 0.45);
  ctx.lineWidth = s * 0.42;
  ctx.strokeStyle = OBJECTIVE_PALETTE.keyline;
  ctx.stroke();
  ctx.lineWidth = s * 0.22;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}
