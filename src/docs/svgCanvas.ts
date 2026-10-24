// A canvas-2D recorder that writes SVG (the Field Manual's diagrams). Copyright © 2026 Kevin B. Liu.
// The game draws its objective markers in one canvas language (src/ui/objectiveGlyphs.ts); the manual draws the same
// glyphs, through the same functions, by handing them this context instead of a canvas: each fill, stroke and text call
// becomes an SVG element. It covers what the glyphs use (paths with lines, arcs and one quadratic curve, rectangles,
// dashes, alpha, text) and no transforms. DOM-free, so tools/docs-prerender.mjs runs it in Node.

const fmt = (n: number): string => String(Math.round(n * 100) / 100);
const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface PaintState {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
  dash: number[];
}

export class SvgCanvas {
  fillStyle = '#000';
  strokeStyle = '#000';
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  font = '10px sans-serif';
  textAlign = 'start';
  textBaseline = 'alphabetic';
  globalAlpha = 1;
  private dash: number[] = [];
  private stack: PaintState[] = [];
  private path = '';
  private x = 0;
  private y = 0;
  private open = false;
  private readonly out: string[] = [];

  save(): void {
    this.stack.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, lineCap: this.lineCap,
      lineJoin: this.lineJoin, font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline,
      globalAlpha: this.globalAlpha, dash: [...this.dash] });
  }

  restore(): void {
    const state = this.stack.pop();
    if (!state) return;
    ({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, lineCap: this.lineCap,
      lineJoin: this.lineJoin, font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline,
      globalAlpha: this.globalAlpha } = state);
    this.dash = state.dash;
  }

  setLineDash(segments: number[]): void { this.dash = [...segments]; }

  beginPath(): void { this.path = ''; this.open = false; }

  moveTo(x: number, y: number): void { this.path += `M${fmt(x)} ${fmt(y)}`; this.x = x; this.y = y; this.open = true; }

  lineTo(x: number, y: number): void {
    this.path += `${this.open ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`;
    this.x = x; this.y = y; this.open = true;
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    if (!this.open) this.moveTo(cx, cy);
    this.path += `Q${fmt(cx)} ${fmt(cy)} ${fmt(x)} ${fmt(y)}`;
    this.x = x; this.y = y;
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.path += `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}Z`;
    this.x = x; this.y = y; this.open = true;
  }

  /** canvas arc(): a line to its start when a subpath is open, then the arc (a full turn as two halves). */
  arc(cx: number, cy: number, r: number, start: number, end: number, counterclockwise = false): void {
    const sx = cx + r * Math.cos(start), sy = cy + r * Math.sin(start);
    this.path += `${this.open ? 'L' : 'M'}${fmt(sx)} ${fmt(sy)}`;
    let sweep = counterclockwise ? start - end : end - start;
    if (sweep < 0) sweep += Math.PI * 2 * Math.ceil(-sweep / (Math.PI * 2));
    const flag = counterclockwise ? 0 : 1;
    if (sweep >= Math.PI * 2 - 1e-6) {
      const mx = cx - (sx - cx), my = cy - (sy - cy);
      this.path += `A${fmt(r)} ${fmt(r)} 0 1 ${flag} ${fmt(mx)} ${fmt(my)}A${fmt(r)} ${fmt(r)} 0 1 ${flag} ${fmt(sx)} ${fmt(sy)}`;
      this.x = sx; this.y = sy;
    } else {
      const ex = cx + r * Math.cos(end), ey = cy + r * Math.sin(end);
      this.path += `A${fmt(r)} ${fmt(r)} 0 ${sweep > Math.PI ? 1 : 0} ${flag} ${fmt(ex)} ${fmt(ey)}`;
      this.x = ex; this.y = ey;
    }
    this.open = true;
  }

  closePath(): void { if (this.open) this.path += 'Z'; }

  private alpha(): string { return this.globalAlpha < 1 ? ` opacity="${fmt(this.globalAlpha)}"` : ''; }

  private strokeAttrs(): string {
    return ` stroke="${esc(this.strokeStyle)}" stroke-width="${fmt(this.lineWidth)}" stroke-linecap="${this.lineCap}"`
      + ` stroke-linejoin="${this.lineJoin}"${this.dash.length ? ` stroke-dasharray="${this.dash.map(fmt).join(' ')}"` : ''}`;
  }

  fill(): void { if (this.path) this.out.push(`<path d="${this.path}" fill="${esc(this.fillStyle)}"${this.alpha()}/>`); }

  stroke(): void { if (this.path) this.out.push(`<path d="${this.path}" fill="none"${this.strokeAttrs()}${this.alpha()}/>`); }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.out.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="${esc(this.fillStyle)}"${this.alpha()}/>`);
  }

  private textAttrs(x: number, y: number): string {
    const size = /(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? '10';
    const weight = /\b([1-9]00|bold)\b/.exec(this.font)?.[1];
    const anchor = this.textAlign === 'center' ? 'middle' : this.textAlign === 'right' || this.textAlign === 'end' ? 'end' : 'start';
    const baseline = this.textBaseline === 'middle' ? 'central' : this.textBaseline === 'top' ? 'hanging' : 'alphabetic';
    return ` x="${fmt(x)}" y="${fmt(y)}" font-size="${size}"${weight ? ` font-weight="${weight}"` : ''} text-anchor="${anchor}"`
      + ` dominant-baseline="${baseline}"`;
  }

  fillText(text: string, x: number, y: number): void {
    this.out.push(`<text${this.textAttrs(x, y)} fill="${esc(this.fillStyle)}"${this.alpha()}>${esc(text)}</text>`);
  }

  strokeText(text: string, x: number, y: number): void {
    this.out.push(`<text${this.textAttrs(x, y)} fill="none"${this.strokeAttrs()}${this.alpha()}>${esc(text)}</text>`);
  }

  /** The elements drawn so far. */
  markup(): string { return this.out.join(''); }
}
