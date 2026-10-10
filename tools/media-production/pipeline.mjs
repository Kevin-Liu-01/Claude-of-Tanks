import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
/** Hash capture inputs, including uncommitted code. Published derivatives and tests are not rendering inputs. */
export function sourceDigest(root = process.cwd()) {
  const hash = createHash('sha256');
  function visit(dir) {
    for (const entry of readdirSync(join(root, dir), {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:ts|js|mjs|json|css|glsl)$/.test(path) && !path.includes('.selftest.') && !path.includes('TestOracle.')) {
        hash.update(path); hash.update('\0'); hash.update(readFileSync(join(root,path)));
      }
    }
  }
  visit('src'); visit('tools/media-production');
  for (const path of ['index.html','package-lock.json','vite.config.ts']) {hash.update(path);hash.update(readFileSync(join(root,path)));}
  return hash.digest('hex');
}
/** cinema --lease-min (2026-10-07): endBefore() is asked before each film and says the lease ends there. Its estimate is
 *  the longest take so far (a film and the still-only jobs after it), so a lease never ends between a film and its stills
 *  and always renders at least one film. */
export function leaseClock(leaseMs, heldSince, now = Date.now) {
  let takeStart = 0, longestTake = 0;
  return {
    get longestTake() { return longestTake; },
    endBefore() {
      if (!leaseMs) return false;
      const t = now();
      if (takeStart) longestTake = Math.max(longestTake, t - takeStart);
      if (takeStart && t - heldSince + longestTake > leaseMs) return true;
      takeStart = t;
      return false;
    },
  };
}

export function verifyFile(file) {
  if (!existsSync(file.path) || digest(readFileSync(file.path)) !== file.sha256) throw Error(`Capture changed or missing: ${file.path}`);
}
/** Full-size review frames are compact WebP; publication masters stay PNG.
 * Preserve both hashes so the receipt identifies the raw render and the
 * exact reviewed file without retaining hundreds of redundant PNGs. */
export async function saveReviewCapture(path, capture) {
  const raw=Buffer.from(capture.dataURL.split(',')[1],'base64');
  const source=await loadImage(raw);
  if(source.width!==capture.width||source.height!==capture.height)throw Error('Capture dimensions mismatch');
  const canvas=createCanvas(source.width,source.height);
  canvas.getContext('2d').drawImage(source,0,0);
  const bytes=canvas.toBuffer('image/webp',92);
  mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);
  return {path,width:source.width,height:source.height,bytes:bytes.length,sha256:digest(bytes),renderSha256:digest(raw),format:'webp',quality:92};
}
export function requireReview(receipt, review) {
  if (receipt.errors.length || !receipt.finished || receipt.maps.some(row=>!row.complete)) throw Error('Capture batch is incomplete');
  if (review.sourceDigest !== receipt.sourceDigest) throw Error('Review is for a different source state');
  for (const row of receipt.maps) {
    const decision = review.maps[row.map];
    if (!decision?.accepted || !decision.notes?.trim()) throw Error(`Visual review required: ${row.map}`);
    const files = [...row.stills,...row.shore,...row.videos,...(row.posters??[])];
    for (const file of files) {verifyFile(file);if(!decision.hashes.includes(file.sha256))throw Error(`Unreviewed capture: ${file.path}`);}
    if (row.survey && row.survey.maxUncoveredM > row.survey.radiusM + .001) throw Error(`Incomplete shoreline coverage: ${row.map}`);
  }
}
export async function contactSheet(files,path,title) {
  const cols=3,cellW=640,cellH=390,canvas=createCanvas(cols*cellW,Math.ceil(files.length/cols)*cellH+56),ctx=canvas.getContext('2d');
  ctx.fillStyle='#11191e';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f2c788';ctx.font='22px sans-serif';ctx.fillText(title,18,36);
  for(let i=0;i<files.length;i++) {
    const image=await loadImage(files[i].path),x=i%cols*cellW,y=Math.floor(i/cols)*cellH+56;
    const scale=Math.min(640/image.width,360/image.height),w=image.width*scale,h=image.height*scale;
    ctx.drawImage(image,x+(640-w)/2,y+(360-h)/2,w,h);ctx.fillStyle='#dce4ea';ctx.font='16px sans-serif';ctx.fillText(files[i].label??String(i+1),x+8,y+382);
  }
  writeFileSync(path,canvas.toBuffer('image/jpeg',86));
}
export function writeReviewPage(out,receipt) {
  const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const href=file=>esc(relative(out,file.path).split('/').map(encodeURIComponent).join('/'));
  const rows=receipt.maps.map(row=>`<section data-map="${esc(row.map)}"><h2>${esc(row.map)}</h2><p>${row.survey?`${row.survey.samples} sampled shoreline points · ${row.shore.length} views · maximum spacing ${row.survey.maxUncoveredM.toFixed(1)} m`:'Saved cameras and lighting'}${row.error?' · CAPTURE ERROR':''}</p><div class="grid">${[...row.stills,...row.shore,...(row.posters??[])].map(file=>`<figure><a href="${href(file)}"><img loading="lazy" src="${href(file)}" alt="${esc(file.label??row.map)}"></a><figcaption>${esc(file.label??row.map)}</figcaption></figure>`).join('')}</div>${row.videos.map(file=>`<figure><video controls preload="none" src="${href(file)}"></video><figcaption>${esc(file.label)} · ${file.frames} frames at ${file.fps} fps · staged, silent</figcaption></figure>`).join('')}</section>`).join('');
  writeFileSync(join(out,'review.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Claude of Tanks · Production review</title><style>body{background:#10181d;color:#dbe6eb;font:16px/1.5 system-ui;margin:32px}h1,h2{color:#efc078}h1{font-size:32px}input{padding:12px;background:#253139;border:1px solid #69777f;color:white;font:inherit}section{margin:48px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}figure{margin:0 0 22px}img,video{width:100%;max-height:620px;object-fit:contain;background:#080c0f}figcaption{padding:8px;font-size:14px}p{color:#a9bac3}</style><h1>CLAUDE OF TANKS / PRODUCTION REVIEW</h1><p>Fresh game renders. Inspect full-size frames before publishing. Sample coverage is not visual acceptance.</p><label>Find a battlefield <input id="filter" type="search" placeholder="Map name"></label>${rows}<script>document.querySelector('#filter').oninput=e=>{for(const s of document.querySelectorAll('section'))s.hidden=!s.dataset.map.includes(e.target.value.toLowerCase())}</script>`);
}

/** Native-size promo cards retain the full camera framing, with a readable brand band. */
export async function promoCard(source, path, time) {
  const canvas=createCanvas(source.width,source.height),ctx=canvas.getContext('2d');
  const font=join(process.cwd(),'public/fonts/abc-monument-grotesk/ABCMonumentGrotesk-Bold.woff2');
  if(existsSync(font)) GlobalFonts.registerFromPath(font,'Monument');
  ctx.drawImage(await loadImage(source.path),0,0);
  const w=source.width,h=source.height,pad=w*.055;
  const shade=ctx.createLinearGradient(0,h*.60,0,h);shade.addColorStop(0,'#06101700');shade.addColorStop(1,'#061017f5');
  ctx.fillStyle=shade;ctx.fillRect(0,h*.60,w,h*.4);
  ctx.fillStyle='#efc078';ctx.fillRect(pad,h*.78,w*.07,Math.max(3,h*.003));
  ctx.font=`bold ${Math.round(w*.026)}px Monument, sans-serif`;ctx.fillText(`${time.toUpperCase()} / WATER IN MOTION`,pad,h*.83);
  ctx.fillStyle='#f4f6f5';ctx.font=`bold ${Math.round(w*.065)}px Monument, sans-serif`;ctx.fillText('CLAUDE OF TANKS',pad,h*.91);
  ctx.fillStyle='#c0cbd0';ctx.font=`${Math.round(w*.018)}px Monument, sans-serif`;ctx.fillText('PLAY IN YOUR BROWSER',pad,h*.95);
  const bytes=canvas.toBuffer('image/png');mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);
  return {path,width:w,height:h,bytes:bytes.length,sha256:digest(bytes)};
}
