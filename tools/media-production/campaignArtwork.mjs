import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { footageNotice } from './campaignPlan.mjs';

const ink = '#f6f5ee', gold = '#f4b346';
function font(ctx, size, weight = 'bold') { ctx.font = `${weight} ${Math.round(size)}px Campaign, sans-serif`; }
function fitText(ctx, text, size, width) {
  font(ctx, size); while (ctx.measureText(text).width > width && size > 10) font(ctx, --size);
}
export function setupFonts(root) {
  const file = join(root, 'public/fonts/abc-monument-grotesk/ABCMonumentGrotesk-Bold.woff2');
  if (existsSync(file)) GlobalFonts.registerFromPath(file, 'Campaign');
}
function shade(ctx, w, h, from = .57) {
  const gradient = ctx.createLinearGradient(0, h * from, 0, h);
  gradient.addColorStop(0, '#07101800'); gradient.addColorStop(1, '#071018f5');
  ctx.fillStyle = gradient; ctx.fillRect(0, h * from, w, h * (1 - from));
}
export function titleOverlay(path, width, height, scene) {
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d'), pad = width * .055;
  shade(ctx, width, height, .7);
  ctx.fillStyle = gold; ctx.fillRect(pad, height * .81, width * .035, height * .004);
  ctx.fillStyle = ink; fitText(ctx, scene.title.toUpperCase(), width * .028, width * .8); ctx.fillText(scene.title.toUpperCase(), pad, height * .885);
  ctx.fillStyle = '#c1cbd0'; fitText(ctx, footageNotice, width * .011, width * .88); ctx.fillText(footageNotice, pad, height * .93);
  writeFileSync(path, canvas.toBuffer('image/png'));
}
export async function endCard(path, plan, root) {
  const { width: w, height: h } = plan, canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(w * .5, h * .35, 0, w * .5, h * .35, w * .6);
  gradient.addColorStop(0, '#23313b'); gradient.addColorStop(1, '#070c10'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  const logo = await loadImage(join(root, 'public/brand/logo-mark.svg')); ctx.drawImage(logo, w * .455, h * .13, w * .09, w * .09);
  ctx.textAlign = 'center'; ctx.fillStyle = ink; fitText(ctx, 'CLAUDE OF TANKS', w * .064, w * .85); ctx.fillText('CLAUDE OF TANKS', w / 2, h * .50);
  ctx.fillStyle = gold; fitText(ctx, plan.cta.toUpperCase(), w * .018, w * .8); ctx.fillText(plan.cta.toUpperCase(), w / 2, h * .65);
  ctx.fillStyle = '#c3cdd3'; font(ctx, w * .021); ctx.fillText('cot.kevinliu.studio', w / 2, h * .74);
  ctx.fillStyle = '#86969e'; fitText(ctx, footageNotice, w * .011, w * .84); ctx.fillText(footageNotice, w / 2, h * .9);
  writeFileSync(path, canvas.toBuffer('image/png'));
}
/** Stack measured glyph bounds upward, so aspect-ratio changes cannot overlap labels. */
export function posterTextLayout(ctx, w, h, plan, scene) {
  const rows = [
    { key: 'notice', text: footageNotice, size: Math.min(w * .014, h * .018), color: '#a5b5bd' },
    { key: 'cta', text: plan.cta.toUpperCase(), size: Math.min(w * .021, h * .027), color: '#d8e0e3' },
    { key: 'brand', text: 'CLAUDE OF TANKS', size: Math.min(w * .068, h * .12), color: ink },
    { key: 'scene', text: scene.title.toUpperCase(), size: Math.min(w * .023, h * .036), color: gold },
  ];
  let bottom = h * .956;
  const gap = h * .018, left = w * .055;
  const lines = rows.map(row => {
    fitText(ctx, row.text, row.size, w * .89);
    const metrics = ctx.measureText(row.text);
    const baseline = bottom - metrics.actualBoundingBoxDescent;
    const line = { ...row, font: ctx.font, x: left, baseline,
      top: baseline - metrics.actualBoundingBoxAscent, bottom,
      left: left - metrics.actualBoundingBoxLeft, right: left + metrics.actualBoundingBoxRight };
    bottom = line.top - gap;
    return line;
  }).reverse();
  return { lines, rule: { x: left, y: bottom - h * .003, width: w * .06, height: Math.max(3, h * .003) } };
}
export async function campaignPoster(path, input, plan, scene) {
  const image = await loadImage(input.path), w = image.width, h = image.height;
  if (w !== input.width || h !== input.height) throw Error('Poster dimensions mismatch');
  const canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
  const layout = posterTextLayout(ctx, w, h, plan, scene);
  ctx.drawImage(image, 0, 0); shade(ctx, w, h, Math.max(.5, layout.rule.y / h - .13));
  ctx.fillStyle = gold; ctx.fillRect(layout.rule.x, layout.rule.y, layout.rule.width, layout.rule.height);
  for (const line of layout.lines) { ctx.fillStyle = line.color; ctx.font = line.font; ctx.fillText(line.text, line.x, line.baseline); }
  writeFileSync(path, canvas.toBuffer('image/webp', 94));
  return { width: w, height: h };
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function reviewPage(out, plan, outputs) {
  const href = file => escape(relative(out, file.path).split('/').map(encodeURIComponent).join('/'));
  const posters = outputs.filter(row => row.kind === 'poster');
  const videos = outputs.filter(row => row.kind === 'trailer' || row.kind === 'loop');
  const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(plan.title)} · Production review</title><style>body{margin:0;background:#091015;color:#eef0ec;font:16px/1.6 system-ui}main{max-width:1440px;margin:auto;padding:48px 6vw}small,h2{color:#f4b346}h1{font-size:clamp(32px,6vw,76px);line-height:1.1}p{color:#b0c0c8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:24px}figure{margin:0 0 32px}video,img{width:100%;background:#05090c}img{max-height:650px;object-fit:contain}a{color:#f4b346}figcaption{padding:12px 0}</style><main><small>CLAUDE OF TANKS / CAMPAIGN STUDIO</small><h1>${escape(plan.title)}</h1><p>${escape(plan.subtitle)}</p><p>${footageNotice}. Captured at native resolution; edited cuts, title cards and original synthesized sound design. These are staged scenes, not live competitive matches. Review the complete videos with sound before publication.</p>${videos.map(file => `<figure><video controls playsinline preload="metadata" src="${href(file)}"></video><figcaption>${escape(file.kind)} · ${file.probe.streams.find(s => s.codec_type === 'video').width} px · ${Number(file.probe.format.duration).toFixed(1)}s ${file.kind === 'loop' ? '· silent background loop' : '· original synthesized soundtrack'}</figcaption></figure>`).join('')}<h2>Native camera compositions</h2><div class="grid">${posters.map(file => `<figure><a href="${href(file)}"><img loading="lazy" src="${href(file)}" alt="${escape(file.title)}"></a><figcaption>${escape(file.title)} · ${escape(file.format)}</figcaption></figure>`).join('')}</div><p><a href="campaign-receipt.json">Production provenance and edit record</a> · <a href="contact-sheet.jpg">Contact sheet</a></p></main></html>`;
  writeFileSync(join(out, 'review.html'), page);
}
