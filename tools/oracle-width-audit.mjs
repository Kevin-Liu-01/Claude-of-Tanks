// tools/oracle-width-audit.mjs — the loose-part class detector (release 270, Main 2026-11-06: "a small audit over every
// registered oracle that compares whole-file width with the main body's width and lists any print off by more than 3 %").
// The reference loader fits every uncertified print to the spec's published width over the WHOLE file
// (tools/reference-glb-loader.ts normalizeReferenceWidth), so a part modelled clear of the vehicle (the M3A3 print's
// spare TOW rounds on the ground beside its hull) shrinks the whole reference: the gate then measures a smaller vehicle.
// For each registered oracle this reads the file in the frame the loader widens it in (after the registration's
// yawOffset), finds the main body (the largest mesh, grown by every mesh whose box meets the body's box) and reports the
// whole-file width against the body's. Read-only: it writes no ledger, record or file unless --json names one.
//   node tools/oracle-width-audit.mjs [--ids=a,b] [--limit=3] [--json=<path>] [--public=<dir>[,<dir>...]]
// --public reads the oracle files from other checkouts' public/ folders too (read-only; this checkout's registry decides
// the files and yaws), since the gitignored oracles are seldom all present in a lane. A file is read only when its
// sha256 is its pin (tools/oracle-pins.mjs); another version is listed as such, never measured.
// A hit goes through the §E excision route (tools/oracle-excision.mjs) in its own lane. The detector sees separate
// meshes only: a loose part fused into one mesh with the vehicle is not separated (a whole-file width equal to the body's).
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
/** Box overlap tolerance, as a fraction of the whole file's box diagonal. */
export const TOUCH_FRACTION = 0.01;

const meets = (a, b, tol) => [0, 1, 2].every((k) => a.min[k] <= b.max[k] + tol && b.min[k] <= a.max[k] + tol);
const volume = (b) => [0, 1, 2].reduce((v, k) => v * Math.max(b.max[k] - b.min[k], 1e-9), 1);

/**
 * The main body of a print from its meshes' world boxes ({ min: [x,y,z], max: [x,y,z] }): the largest box, grown by every
 * box that meets the body's box (within `touch` metres) until none does. Returns the whole box, the body box and the
 * indices left outside it.
 */
export function mainBody(boxes, touchFraction = TOUCH_FRACTION) {
  const live = boxes.filter((b) => b && [...b.min, ...b.max].every(Number.isFinite));
  if (!live.length) return null;
  const whole = { min: [0, 1, 2].map((k) => Math.min(...live.map((b) => b.min[k]))), max: [0, 1, 2].map((k) => Math.max(...live.map((b) => b.max[k]))) };
  const touch = touchFraction * Math.hypot(...[0, 1, 2].map((k) => whole.max[k] - whole.min[k]));
  let seed = 0;
  live.forEach((b, i) => { if (volume(b) > volume(live[seed])) seed = i; });
  const body = { min: [...live[seed].min], max: [...live[seed].max] };
  const inBody = new Set([seed]);
  for (let grew = true; grew;) {
    grew = false;
    live.forEach((b, i) => {
      if (inBody.has(i) || !meets(b, body, touch)) return;
      inBody.add(i); grew = true;
      for (let k = 0; k < 3; k++) { body.min[k] = Math.min(body.min[k], b.min[k]); body.max[k] = Math.max(body.max[k], b.max[k]); }
    });
  }
  return { whole, body, outside: live.map((_, i) => i).filter((i) => !inBody.has(i)) };
}

/** Whole-file width against the body's, in percent of the body's (x after the registration's yaw). */
export function widthDeparture(whole, body) {
  const w = whole.max[0] - whole.min[0], b = body.max[0] - body.min[0];
  return { wholeWidth: w, bodyWidth: b, pct: b > 0 ? (w / b - 1) * 100 : Infinity };
}

/** The page's own reference table (tools/procedural-fidelity.html LOCAL_REFERENCE_OVERRIDES), spreads and literals. */
export async function pageOverrides() {
  const page = fs.readFileSync(path.join(repo, 'tools', 'procedural-fidelity.html'), 'utf8');
  const start = page.indexOf('const LOCAL_REFERENCE_OVERRIDES = {');
  const end = page.indexOf('\n};', start);
  if (start < 0 || end < 0) throw new Error('procedural-fidelity.html: no LOCAL_REFERENCE_OVERRIDES table');
  const literal = page.slice(start + 'const LOCAL_REFERENCE_OVERRIDES = '.length, end + 2);
  const imports = [...page.matchAll(/^import \{ ([A-Za-z0-9_, ]+) \} from '\/tools\/([^']+)';/gm)];
  const scope = {};
  for (const [, names, file] of imports) {
    const wanted = names.split(',').map((n) => n.trim()).filter((n) => new RegExp(`\\b${n}\\b`).test(literal));
    if (!wanted.length) continue;
    const mod = await import(pathToFileURL(path.join(repo, 'tools', file)).href);
    for (const name of wanted) scope[name] = mod[name];
  }
  return new Function(...Object.keys(scope), `return (${literal});`)(...Object.values(scope));
}

/** Every registered comparison oracle as the page builds its registry: id -> { path, yawOffset, widthFit, anchor }. */
export async function registeredOracles() {
  await import('../src/vehicles/fleetRegistration.ts'); // the whole roster, as the page's specs import registers it
  const { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } = await import('../src/vehicles/specs.ts');
  const { SOURCE_WORLD_FRAMES } = await import('./source-world-registration.mjs');
  const { validatedPreservationOracle } = await import('./preservation-oracle.ts');
  const local = await pageOverrides();
  const sourceIds = ALL_TANK_IDS.filter((id) => MODEL_SOURCE[id]?.source === 'glb');
  const ids = [...new Set([...sourceIds, ...Object.keys(local)])].filter((id) => TANK_SPECS[id])
    .filter((id) => (local[id] || MODEL_SOURCE[id])?.glb?.gateEligible !== false);
  return Object.fromEntries(ids.map((id) => {
    const source = local[id] || MODEL_SOURCE[id], glb = source?.glb ?? {};
    const certified = Boolean(SOURCE_WORLD_FRAMES[id]) || Boolean(validatedPreservationOracle(source, id));
    return [id, { path: glb.path ?? null, yawOffset: Number(glb.yawOffset || 0), widthFit: !certified,
      anchor: glb.fidelityScaleAnchor === 'hullLength' ? 'hullLength' : 'width' }];
  }).filter(([, row]) => row.path));
}

/** Mesh world boxes of a GLB in the loader's frame (the registration's yaw about +Y). */
export async function meshBoxes(file, yawOffset) {
  const THREE = await import('three');
  const { loadSource } = await import('./source-x-oracle.mjs');
  const { scene } = await loadSource(file);
  const root = new THREE.Group();
  root.rotation.y = yawOffset;
  root.add(scene);
  root.updateMatrixWorld(true);
  const boxes = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    if (!b.isEmpty()) boxes.push({ name: o.name, min: b.min.toArray(), max: b.max.toArray() });
  });
  return boxes;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=?(.*)$/.exec(a); return m ? [m[1], m[2]] : [a, '']; }));
  const limit = Number(args.limit ?? 3);
  const { ORACLE_PINS } = await import('./oracle-pins.mjs');
  const oracles = await registeredOracles();
  const wanted = args.ids ? new Set(args.ids.split(',')) : null;
  const byPath = new Map();
  for (const [id, row] of Object.entries(oracles)) if (!wanted || wanted.has(id)) {
    const key = `${row.path}@${row.yawOffset}`;
    if (!byPath.has(key)) byPath.set(key, { ...row, ids: [] });
    byPath.get(key).ids.push(id);
  }
  const rows = [], missing = [], failed = [];
  for (const row of byPath.values()) {
    const roots = [path.join(repo, 'public'), ...(args.public ? args.public.split(',').map((d) => path.resolve(d)) : [])];
    const pin = ORACLE_PINS[row.path]?.sha256;
    const candidates = roots.map((root) => path.join(root, row.path.slice(1))).filter((f) => fs.existsSync(f));
    const file = candidates.find((f) => !pin || crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') === pin);
    if (!candidates.length) { missing.push({ ids: row.ids, path: row.path }); continue; }
    if (!file) { failed.push({ ids: row.ids, path: row.path, error: `no copy matches the pin ${pin.slice(0, 12)}… (${candidates.join(', ')})` }); continue; }
    try {
      const boxes = await meshBoxes(file, row.yawOffset);
      const found = mainBody(boxes);
      const d = widthDeparture(found.whole, found.body);
      rows.push({ ids: row.ids, path: row.path, file, pinned: Boolean(pin), widthFit: row.widthFit, anchor: row.anchor,
        wholeWidth: +d.wholeWidth.toFixed(4), bodyWidth: +d.bodyWidth.toFixed(4), pct: +d.pct.toFixed(2),
        outside: found.outside.map((i) => boxes.filter((b) => b && [...b.min, ...b.max].every(Number.isFinite))[i].name) });
    } catch (error) { failed.push({ ids: row.ids, path: row.path, error: String(error?.message ?? error) }); }
  }
  rows.sort((a, b) => b.pct - a.pct);
  const hits = rows.filter((r) => r.pct > limit);
  for (const r of hits) console.log(`[hit] ${r.ids.join(',')}  ${r.path}  whole ${r.wholeWidth}  body ${r.bodyWidth}  +${r.pct}%`
    + `${r.widthFit ? '' : '  (certified: not width-fit)'}${r.anchor === 'hullLength' ? '  (hull-length anchored)' : ''}  outside: ${r.outside.slice(0, 6).join(' ')}${r.outside.length > 6 ? ` +${r.outside.length - 6}` : ''}`);
  for (const m of missing) console.log(`[missing] ${m.ids.join(',')}  ${m.path}`);
  for (const f of failed) console.log(`[unreadable] ${f.ids.join(',')}  ${f.path}  ${f.error}`);
  console.log(`oracle-width-audit: ${rows.length} oracle files read, ${hits.length} wider than their body by more than ${limit}%, `
    + `${missing.length} missing here, ${failed.length} unreadable`);
  if (args.json) fs.writeFileSync(path.resolve(args.json), `${JSON.stringify({ limit, hits, rows, missing, failed }, null, 1)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
