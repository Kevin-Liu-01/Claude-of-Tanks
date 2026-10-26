/**
 * objectiveGlyphLetters.ts — a glyph's letter set into a texture or an SVG (UI-LOCKDOWN A). Copyright © 2026 Kevin B. Liu.
 *
 * On screen a badge's or a lane mark's letter is DOM over its canvas (objectiveGlyphs.ts badgeLetter / laneLetter, placed
 * through canvasText.ts). Two places have no DOM over them and set the letter themselves: the battlefield's objective
 * sprites (matchModeWorldPresentation.ts, a texture in the 3D scene) and the Field Manual's mode diagrams
 * (src/docs/chapters/modes.ts, drawn through SvgCanvas into SVG text). src/ui/uiCanvasCensus.selftest.mjs keeps this
 * module to those two importers.
 */
import { OBJECTIVE_PALETTE, type GlyphLetter } from './objectiveGlyphs.ts';

type Ctx = CanvasRenderingContext2D;

/** Set `label` where `letter` says, in `font`, over its dark halo. */
export function drawGlyphLetter(ctx: Ctx, label: string, letter: GlyphLetter, font: string): void {
  if (!label) return;
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = letter.halo;
  ctx.strokeStyle = OBJECTIVE_PALETTE.keyline;
  ctx.strokeText(label, letter.x, letter.y);
  ctx.fillStyle = letter.color;
  ctx.fillText(label, letter.x, letter.y);
  ctx.restore();
}
