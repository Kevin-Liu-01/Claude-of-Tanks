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
 * texture px for sprites). Colours arrive from sideColor / sideFill: own and
 * enemy in the team tokens under the player's colour preset (the HUD's blip
 * colours), neutral chalk and contested amber from OBJECTIVE_PALETTE.
 *
 * (UI-LOCKDOWN A) The glyphs draw no letters: a badge's or a lane mark's letter is text, so badgeLetter() and
 * laneLetter() say where it sits and how it is set, and an on-screen canvas places it as DOM over itself (canvasText.ts:
 * the HUD's map, the team strip's chips, the Deploy maps). A texture or the manual's SVG, which have no DOM over them,
 * set it with objectiveGlyphLetters.ts.
 */

import { TOKENS, liveToken } from './tokens/tokens.ts';
import { tokenEpoch } from './tokens/tokenSelection.ts';

export type ObjectiveSide = 'own' | 'enemy' | 'neutral' | 'contested';

/** `#rrggbb` at an alpha, as the rgba() canvas fills take. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** The brand tokens of the sides no team owns; the team sides follow the player's colour preset (sideColor). */
export const OBJECTIVE_PALETTE = Object.freeze({
  neutral: TOKENS['team-neutral'],
  contested: TOKENS.accent,
  neutralFill: withAlpha(TOKENS['team-neutral'], 0.16),
  contestedFill: withAlpha(TOKENS.accent, 0.34),
  keyline: withAlpha(TOKENS['graphite-950'], 0.86),
  /** the sector chip's hexagon well (drawObjectiveChip) */
  well: withAlpha(TOKENS['graphite-950'], 0.9),
  chalk: TOKENS['ink-1'],
  heal: TOKENS.ok,
  ammo: TOKENS.accent,
  ball: TOKENS['ink-1'],
});

/** Own and enemy in the team tokens under the player's colour preset (brand-ui H1: the HUD's blips and every team
 *  mark share them), re-read only when the preset changes. */
const TEAM = { epoch: -1, own: '', enemy: '', ownFill: '', enemyFill: '' };
function team(): typeof TEAM {
  const epoch = tokenEpoch();
  if (epoch !== TEAM.epoch) {
    TEAM.epoch = epoch;
    TEAM.own = liveToken('team-own');
    TEAM.enemy = liveToken('team-enemy');
    TEAM.ownFill = withAlpha(TEAM.own, 0.34);
    TEAM.enemyFill = withAlpha(TEAM.enemy, 0.34);
  }
  return TEAM;
}

export function sideColor(side: ObjectiveSide): string {
  return side === 'own' || side === 'enemy' ? team()[side] : OBJECTIVE_PALETTE[side];
}

export function sideFill(side: ObjectiveSide): string {
  return side === 'own' ? team().ownFill
    : side === 'enemy' ? team().enemyFill
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
  /** dashed ring: a contested or locked badge */
  dashed?: boolean;
  /** stroke weight of the coloured ring (the dark keyline is drawn under it) */
  ringWidth?: number;
}

/** Hexagonal badge with a dark keyline, coloured ring and translucent fill (its letter: badgeLetter()). */
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
  ctx.restore();
}

/** Where a glyph's letter sits and how it is set: centred (middle baseline) on (x, y), `px` its size in the glyph's
 *  units, `color` its ink over a halo of `halo` px in OBJECTIVE_PALETTE.keyline. */
export interface GlyphLetter {
  x: number;
  y: number;
  px: number;
  color: string;
  halo: number;
}

/** A hexagonal badge's letter (drawHexBadge's at (x, y), radius r), in `color` (the neutral chalk by default). */
export function badgeLetter(x: number, y: number, r: number, color: string, out: GlyphLetter): GlyphLetter {
  out.x = x;
  out.y = y + r * 0.06;
  out.px = Math.round(r * 1.05);
  out.color = color;
  out.halo = Math.max(1, r * 0.22);
  return out;
}

/** The letter's face where its caller names none: the badges' (the HUD's map sets its own condensed face). */
export function badgeLetterFont(px: number): string {
  return `700 ${px}px 'Cot UI', sans-serif`;
}

/** A lane mark's number (drawLaneGlyph's at (x, y), radius r). */
export function laneLetter(x: number, y: number, r: number, out: GlyphLetter): GlyphLetter {
  out.x = x;
  out.y = y + r * 0.06;
  out.px = Math.round(r * 0.95);
  out.color = OBJECTIVE_PALETTE.chalk;
  out.halo = Math.max(1, r * 0.2);
  return out;
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

interface ChipStyle {
  side: ObjectiveSide;
  /** capture progress 0..1 toward `progressSide` (the ring's share) */
  progress: number;
  progressSide?: 'own' | 'enemy';
}

/**
 * The HUD's sector chip under the score (brand-ui H3, the direction's 06-battle-hud.html .sectors): the zone's hexagon
 * on a dark well, rimmed in its side's ink (its letter in that ink: badgeLetter()), inside a capture ring whose arc is the
 * progress toward its side. A contested zone's ring is dashed all round in the contested ink. `r` is the hexagon's radius;
 * the ring runs at 1.23 r.
 */
export function drawObjectiveChip(ctx: Ctx, x: number, y: number, r: number, chip: ChipStyle): void {
  const ring = r * 1.23;
  const width = r * 0.15;
  ctx.save();
  ctx.lineWidth = width + r * 0.06;
  ctx.strokeStyle = OBJECTIVE_PALETTE.keyline;
  ctx.beginPath();
  ctx.arc(x, y, ring, 0, Math.PI * 2);
  ctx.stroke();
  if (chip.side === 'contested') {
    ctx.setLineDash([r * 0.2, r * 0.13]);
    ctx.lineWidth = width;
    ctx.strokeStyle = sideColor('contested');
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  if (chip.side !== 'contested') {
    drawProgressArc(ctx, x, y, ring, chip.progress, sideColor(chip.progressSide ?? chip.side), width);
  }
  const color = sideColor(chip.side);
  drawHexBadge(ctx, x, y, r, { fill: OBJECTIVE_PALETTE.well, stroke: color, ringWidth: r * 0.11 });
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

/** Team spawn / base: a tank inside a return arrow, legible at minimap size. */
export function drawSpawnGlyph(
  ctx: Ctx, x: number, y: number, r: number, color: string, fill: string,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // A dark backing separates the symbol from bright terrain and tank clusters.
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = OBJECTIVE_PALETTE.keyline;
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.fill();

  // Clockwise return arrow; leave a gap beside the tank's barrel.
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, -Math.PI * 0.35, Math.PI * 1.35);
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.17;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.65, y - r * 0.32);
  ctx.lineTo(x - r * 0.16, y - r * 0.75);
  ctx.lineTo(x - r * 0.73, y - r * 0.89);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  // Upright top-down tank: two tracks, hull, turret and forward barrel.
  ctx.fillRect(x - r * 0.43, y - r * 0.22, r * 0.16, r * 0.64);
  ctx.fillRect(x + r * 0.27, y - r * 0.22, r * 0.16, r * 0.64);
  ctx.fillRect(x - r * 0.22, y - r * 0.19, r * 0.44, r * 0.53);
  ctx.fillStyle = OBJECTIVE_PALETTE.chalk;
  ctx.fillRect(x - r * 0.11, y - r * 0.15, r * 0.22, r * 0.24);
  ctx.fillRect(x - r * 0.06, y - r * 0.54, r * 0.12, r * 0.4);
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

/**
 * The proving ground's lane mark (v2 progression, 2026-10-17): a square target board on a dark keyline, a ring round
 * the aim point and the lane's number (laneLetter()), so a lane reads as a range lane on the map and over the field alike.
 */
export function drawLaneGlyph(ctx: Ctx, x: number, y: number, r: number): void {
  const half = r * 0.86;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.rect(x - half, y - half, half * 2, half * 2);
  ctx.fillStyle = 'rgba(14,20,24,0.82)';
  ctx.fill();
  ctx.lineWidth = Math.max(1.4, r * 0.3);
  ctx.strokeStyle = OBJECTIVE_PALETTE.keyline;
  ctx.stroke();
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.strokeStyle = OBJECTIVE_PALETTE.chalk;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(0.9, r * 0.12);
  ctx.strokeStyle = OBJECTIVE_PALETTE.contested;
  ctx.stroke();
  ctx.restore();
}
