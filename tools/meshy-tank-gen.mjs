#!/usr/bin/env node
// meshy-tank-gen.mjs — Meshy AI image→3D candidate generator (EXPLORATION r1).
//
// Turns 1–4 photos of a real tank into a GLB candidate under
// public/models/tanks/candidates-gen2/meshy/<id>/, using Meshy's
// (Multi-)Image-to-3D API. This produces a *candidate* only — Meshy output is
// a fused mesh (its rigging API is humanoid-only and there is no semantic
// part-segmentation endpoint as of Aug 2026), so a generated tank must still
// be segmented into turret/gun and given TurretPivot/GunPivot groups offline
// before it can pass the modelLoader.js articulation contract. See
// docs/research/genai-asset-pipelines.md for the full evaluation and the
// segmentation options (meshy-t2 connected-component islands + heuristics,
// Tripo3D Segmentation API, Hunyuan3D-Part local).
//
// API facts this script encodes (docs.meshy.ai, checked 2026-08):
//   - auth: Authorization: Bearer msy_...            (MESHY_API_KEY env var)
//   - POST /openapi/v1/image-to-3d        (single image)
//   - POST /openapi/v1/multi-image-to-3d  (2–4 images of the SAME vehicle)
//   - poll GET  …/:id  until status SUCCEEDED|FAILED|CANCELED
//   - result model_urls are SIGNED + EXPIRE, files purged after ~3 days →
//     everything worth keeping is downloaded immediately, task JSON included.
//   - credits: meshy-6 textured ≈ 30 cr (~$0.60 on Pro); meshy-t2
//     smart-topology textured ≈ 15 cr. Balance: GET /openapi/v1/balance.
//   - test mode: msy_dummy_api_key_for_test_mode_12345678 returns canned
//     results and consumes no credits (--test flag).
//
// Usage:
//   export MESHY_API_KEY=msy_...
//   node tools/meshy-tank-gen.mjs --id t72_meshy \
//     --images shots/ref/t72_front.jpg,shots/ref/t72_side.jpg [options]
//
//   --id <slug>            output dir name (required)
//   --images <a,b,c>       1–4 local files or https URLs (required)
//   --smart                use smart-topology / meshy-t2 (game-density tris,
//                          natively separated connected components) instead
//                          of standard meshy-6 remesh path
//   --polycount <n>        target faces (smart: 100–15000 default 12000;
//                          standard: 100–300000 default 100000)
//   --pbr                  request metallic/roughness/normal maps
//   --texture-prompt <s>   optional texture steering, ≤600 chars
//   --test                 use Meshy's dummy key / canned response, 0 credits
//
// Local image files are inlined as base64 data URIs (documented input form),
// so nothing needs hosting. Output per run:
//   candidates-gen2/meshy/<id>/model.glb        the mesh (+ pre-remeshed GLB
//   candidates-gen2/meshy/<id>/task.json         if the API returned one)
//   candidates-gen2/meshy/<id>/thumb_*.png       provenance + preview
// plus a ready-to-paste ATTRIBUTION.md row on stdout (generated assets are
// owner-owned on paid tiers; record provenance anyway, same as sourced GLBs).
//
// (Node via nvm on this machine: export NVM_DIR="$HOME/.nvm" &&
//  . "$NVM_DIR/nvm.sh" first. Node ≥18 for global fetch.)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.meshy.ai';
const TEST_KEY = 'msy_dummy_api_key_for_test_mode_12345678';
const POLL_MS = 5000;

// --- args ------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};

const id = opt('id');
const imagesArg = opt('images');
const smart = flag('smart');
const test = flag('test');
const pbr = flag('pbr');
const texturePrompt = opt('texture-prompt');
const polycount = opt('polycount')
  ? Number(opt('polycount'))
  : (smart ? 12000 : 100000);

const KEY = test ? TEST_KEY : process.env.MESHY_API_KEY;
if (!id || !imagesArg || !KEY) {
  console.error('usage: MESHY_API_KEY=msy_... node tools/meshy-tank-gen.mjs'
    + ' --id <slug> --images <1-4 files/urls> [--smart] [--polycount n]'
    + ' [--pbr] [--texture-prompt s] [--test]');
  process.exit(1);
}

const images = imagesArg.split(',').map((s) => s.trim()).filter(Boolean);
if (images.length < 1 || images.length > 4) {
  console.error(`need 1-4 images, got ${images.length}`);
  process.exit(1);
}

// --- helpers ---------------------------------------------------------------
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
// Never let the raw key reach logs/error output (CI logs, stack traces, etc.).
const redact = (s) => (KEY ? s.split(KEY).join('***REDACTED***') : s);

async function api(method, p, body) {
  const res = await fetch(`${API}${p}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  if (!res.ok) {
    throw new Error(redact(`${method} ${p} -> HTTP ${res.status}: ${json?.message || text.slice(0, 300)}`));
  }
  return json;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
function toImageUrl(src) {
  if (/^https?:\/\//i.test(src)) return src;
  const abs = path.resolve(ROOT, src);
  if (!existsSync(abs)) throw new Error(`image not found: ${src}`);
  const mime = MIME[path.extname(abs).toLowerCase()];
  if (!mime) throw new Error(`unsupported image type (need jpg/png): ${src}`);
  return `data:${mime};base64,${readFileSync(abs).toString('base64')}`;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed HTTP ${res.status}: ${url.slice(0, 120)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return buf.length;
}

const kib = (n) => `${(n / 1024).toFixed(0)} KiB`;

// --- run -------------------------------------------------------------------
const outDir = path.join(ROOT, 'public', 'models', 'tanks', 'candidates-gen2', 'meshy', id);
mkdirSync(outDir, { recursive: true });

let balanceBefore = null;
if (!test) {
  try { balanceBefore = (await api('GET', '/openapi/v1/balance')).balance; } catch { /* non-fatal */ }
}

const multi = images.length > 1;
const endpoint = multi ? '/openapi/v1/multi-image-to-3d' : '/openapi/v1/image-to-3d';
const payload = {
  ...(multi ? { image_urls: images.map(toImageUrl) } : { image_url: toImageUrl(images[0]) }),
  ...(smart
    ? { model_type: 'smart-topology', ai_model: 'meshy-t2' }
    : { ai_model: 'meshy-6', should_remesh: true, topology: 'triangle' }),
  target_polycount: polycount,
  should_texture: true,
  enable_pbr: pbr,
  texture_resolution: '2k',
  ...(texturePrompt ? { texture_prompt: texturePrompt } : {}),
  target_formats: ['glb'],
  // meshy-6 photo hygiene: strip baked lighting, let Meshy sharpen inputs.
  ...(smart ? {} : { remove_lighting: true, image_enhancement: true }),
};

console.log(`[meshy] ${multi ? 'multi-image' : 'image'}-to-3d "${id}" — ${images.length} image(s), `
  + `${smart ? 'meshy-t2 smart-topology' : 'meshy-6 standard'}, ${polycount} faces, pbr=${pbr}${test ? ' [TEST MODE]' : ''}`);

const created = await api('POST', endpoint, payload);
const taskId = created.result;
console.log(`[meshy] task ${taskId} created, polling every ${POLL_MS / 1000}s…`);

let task;
for (;;) {
  task = await api('GET', `${endpoint}/${taskId}`);
  if (task.status === 'SUCCEEDED' || task.status === 'FAILED' || task.status === 'CANCELED') break;
  const queue = task.preceding_tasks ? ` (${task.preceding_tasks} ahead in queue)` : '';
  process.stdout.write(`\r[meshy] ${task.status} ${task.progress ?? 0}%${queue}   `);
  await new Promise((r) => setTimeout(r, POLL_MS));
}
process.stdout.write('\n');

if (task.status !== 'SUCCEEDED') {
  console.error(`[meshy] task ${task.status}: ${task.task_error?.message || 'no error message'}`);
  process.exit(1);
}

// Signed URLs expire and files are purged server-side (~3 days) — grab
// everything now. task.json is the provenance record (attribution + params).
writeFileSync(path.join(outDir, 'task.json'), JSON.stringify({ request: { endpoint, ...payload, image_urls: undefined, image_url: undefined, source_images: images }, task }, null, 2));

const glbBytes = await download(task.model_urls.glb, path.join(outDir, 'model.glb'));
console.log(`[meshy] model.glb ${kib(glbBytes)}`);
if (task.model_urls.pre_remeshed_glb) {
  const n = await download(task.model_urls.pre_remeshed_glb, path.join(outDir, 'model.pre-remeshed.glb'));
  console.log(`[meshy] model.pre-remeshed.glb ${kib(n)}`);
}
for (const [view, url] of Object.entries(task.thumbnail_urls || {})) {
  try { await download(url, path.join(outDir, `thumb_${view}.png`)); } catch { /* preview only */ }
}
if (!task.thumbnail_urls && task.thumbnail_url) {
  try { await download(task.thumbnail_url, path.join(outDir, 'thumb.png')); } catch { /* preview only */ }
}

let balanceAfter = null;
if (!test) {
  try { balanceAfter = (await api('GET', '/openapi/v1/balance')).balance; } catch { /* non-fatal */ }
}
const spent = task.consumed_credits
  ?? (balanceBefore != null && balanceAfter != null ? balanceBefore - balanceAfter : '?');
console.log(`[meshy] done — ${spent} credits consumed${balanceAfter != null ? `, ${balanceAfter} remaining` : ''}`);

console.log(`
[meshy] candidate written to ${path.relative(ROOT, outDir)}/
[meshy] NEXT STEPS (this is a fused-mesh candidate, not a roster model):
  1. eyeball thumbs, then inspect islands/scale in the browser harness
  2. segment turret+gun and bake TurretPivot/GunPivot (see exploration doc)
  3. run the usual gates: npm run model:audit && npm run model:rig
[meshy] ATTRIBUTION.md row (paid-tier Meshy output is owner-owned; keep provenance):
| ${id} (AI-generated) | Meshy ${smart ? 'T2' : '6'} output, prompted with ${images.length} owner-supplied photo(s) | https://meshy.ai (task ${taskId}) | Meshy paid-tier ToU: generated assets owned by the account holder | \`public/models/tanks/candidates-gen2/meshy/${id}/\` |`);
