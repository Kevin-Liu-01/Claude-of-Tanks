// The technical drawings' receipts (258; the owner, 2026-10-26: "make all technical drawings much better and much higher
// quality and update that whole system"). Every <id>_drawing.json in public/icons (COT_DRAWINGS_DIR for a review run)
// and its plates:
//  1. resolution: each view's 2x plate is its frame (side 2048 wide), its 1x plate half of it, read from the WebP headers;
//  2. the plates are the measured ones: each file's sha-256 is the one recorded beside the extent measured from it;
//  3. fill: the drawing's body (below any whip that runs off the top) fills 88 % of the frame's width or 84 % of its
//     height (whichever binds, within 3 %), centred to 2 %;
//  4. overlay agreement: every armour, module and crew outline lies on the plate's extent (4 px slack), and the armour
//     outlines span at least half the body's width in the side and top views (the shell covers the hull; the gun overhangs);
//  5. legibility: the numbered elements (as the viewer numbers them: numberedElements) are 64 px² or more of the 2x
//     frame, the side view numbers some armour, and each numbered element has its label in English and Chinese;
//  6. no text: the plate studio draws no glyphs (no fillText, strokeText, font or text geometry in tools/drawing-page.ts).
// Negative controls: a shrunken extent, an outline off the plate and a replaced plate each fail.
// First-party: Kevin B. Liu (NOTICE.md).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { numberedElements, parseTechnicalDrawing, technicalPlateFile, TECHNICAL_KINDS, TECHNICAL_MIN_NUMBERED_AREA } from './technicalDrawingData.ts';
import { technicalLabelText } from './technicalDiagramLabels.ts';
import { setLocale } from './i18n.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const DIR = resolve(process.env.COT_DRAWINGS_DIR ?? join(ROOT, 'public/icons'));
const FILL = { width: 0.88, height: 0.84 }, FILL_SLACK = 0.03, CENTRE_SLACK = 0.02, EDGE_SLACK_PX = 4;

/** A WebP's canvas size from its header (VP8X, VP8L or VP8). */
export function webpSize(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') throw new Error('not a WebP');
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3)];
  if (chunk === 'VP8L') { const bits = buffer.readUInt32LE(21); return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]; }
  if (chunk === 'VP8 ') return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  throw new Error(`unknown WebP chunk ${chunk}`);
}

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 16);

/** Known hit-volume misfits (combat armour where the model draws nothing), each the most frame px its outline may stand
 * off the plate, for that drawing, view and armour key. The list only shrinks: an entry that grows fails, and one that
 * no longer stands off fails until it is removed. Emptied by vehicles-hit-volume-fit-258 (the Sheridan, Namer, M60A3 and
 * Leo 2A4M CAN entries the overlay-agreement check found, 2026-10-26). */
const KNOWN_OFF_PLATE = new Map(Object.entries({}));
const pathPoints = (d) => [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

/** Every problem with one drawing (data parsed, plates read through `plate(name)`), as sentences. */
export function drawingProblems(data, plate, labels = () => 'label', known = new Map()) {
  const problems = [];
  for (const [view, v] of Object.entries(data.views)) {
    const [w, h] = v.size, at = `${data.id} ${view}`;
    if (view === 'side' && w !== 2048) problems.push(`${at}: the side frame is ${w} px wide, not 2048`);
    for (const density of [2, 1]) {
      const name = technicalPlateFile(data.id, view, density), bytes = plate(name);
      if (!bytes) { problems.push(`${at}: ${name} is missing`); continue; }
      const [pw, ph] = webpSize(bytes), [ew, eh] = density === 2 ? [w, h] : [w / 2, h / 2];
      if (Math.abs(pw - ew) > 0.5 || Math.abs(ph - eh) > 0.5) problems.push(`${at}: ${name} is ${pw}x${ph}, not ${ew}x${eh}`);
      if (sha(bytes) !== v.plate.sha[density === 2 ? 0 : 1]) problems.push(`${at}: ${name} is not the plate the extent was measured on`);
    }
    const [bx0, by0, bx1, by1] = v.plate.body, fillW = (bx1 - bx0) / w / FILL.width, fillH = (by1 - by0) / h / FILL.height;
    if (Math.abs(Math.max(fillW, fillH) - 1) > FILL_SLACK) {
      problems.push(`${at}: fills ${(100 * (bx1 - bx0) / w).toFixed(1)} % of the width and ${(100 * (by1 - by0) / h).toFixed(1)} % of the height`);
    }
    if (Math.abs((bx0 + bx1) / 2 - w / 2) > CENTRE_SLACK * w || Math.abs((by0 + by1) / 2 - h / 2) > CENTRE_SLACK * h) problems.push(`${at}: off centre`);
    const [x0, y0, x1, y1] = v.plate.box;
    let armorX0 = Infinity, armorX1 = -Infinity;
    for (const kind of TECHNICAL_KINDS) {
      const layer = v.layers[kind];
      if (layer.some((element, i) => i > 0 && element.area > layer[i - 1].area)) problems.push(`${at} ${kind}: not in area order (the viewer numbers the first)`);
      for (const element of layer) {
        const points = pathPoints(element.d);
        const standOff = Math.max(...points.map(([x, y]) => Math.max(x0 - x, x - x1, y0 - y, y - y1)));
        const allowed = kind === 'armor' ? known.get(`${data.id} ${view} ${element.key}`) : undefined;
        if (allowed !== undefined) {
          known.delete(`${data.id} ${view} ${element.key}`);
          if (standOff > allowed) problems.push(`${at} ${kind} ${element.key}: a known misfit grew to ${standOff.toFixed(1)} px off the plate (at most ${allowed})`);
          else if (standOff <= EDGE_SLACK_PX) problems.push(`${at} ${kind} ${element.key}: fits now; take it off KNOWN_OFF_PLATE`);
        } else if (standOff > EDGE_SLACK_PX) {
          const off = points.find(([x, y]) => Math.max(x0 - x, x - x1, y0 - y, y - y1) === standOff);
          problems.push(`${at} ${kind} ${element.key}: outline at ${off.join(', ')} is off the plate`);
        }
        if (kind === 'armor') for (const [x] of pathPoints(element.d)) { armorX0 = Math.min(armorX0, x); armorX1 = Math.max(armorX1, x); }
      }
      for (const element of numberedElements(v, kind)) {
        if (element.area < TECHNICAL_MIN_NUMBERED_AREA) problems.push(`${at} ${kind} ${element.key}: numbered but ${element.area} px²`);
        if (!labels(element, kind)) problems.push(`${at} ${kind} ${element.key}: no label`);
      }
    }
    if (view !== 'front' && !(armorX1 - armorX0 >= 0.5 * (bx1 - bx0))) problems.push(`${at}: the armour outlines span ${Math.max(0, armorX1 - armorX0).toFixed(0)} of ${(bx1 - bx0).toFixed(0)} px`);
    if (view === 'side' && !numberedElements(v, 'armor').length) problems.push(`${at}: numbers no armour`);
  }
  return problems;
}

// 6. no text in the plate studio
const studio = readFileSync(join(ROOT, 'tools/drawing-page.ts'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
assert.doesNotMatch(studio, /fillText|strokeText|\.font\s*=|TextGeometry|FontLoader/, 'the plate studio draws text');

// the drawings
const files = existsSync(DIR) ? readdirSync(DIR).filter((name) => name.endsWith('_drawing.json')).sort() : [];
const labelsIn = async (locale) => { await setLocale(locale); return (element, kind) => technicalLabelText({ ...element, anchor: [0, 0], weight: 0, color: '' }, kind).trim(); };
const en = await labelsIn('en-US'), enLabels = new Map();
const problems = [], drawings = [], known = new Map(KNOWN_OFF_PLATE);
for (const file of files) {
  const id = file.slice(0, -'_drawing.json'.length);
  const data = parseTechnicalDrawing(JSON.parse(readFileSync(join(DIR, file), 'utf8')), id);
  drawings.push(data);
  problems.push(...drawingProblems(data, (name) => existsSync(join(DIR, name)) ? readFileSync(join(DIR, name)) : null, (element, kind) => {
    const text = en(element, kind); enLabels.set(`${id}|${kind}|${element.key}`, text); return text;
  }, known));
}
// a known misfit whose drawing is published but whose outline no longer exists is stale too
const published = new Set(drawings.map((d) => d.id));
for (const entry of known.keys()) if (published.has(entry.split(' ')[0])) problems.push(`${entry}: no longer drawn; take it off KNOWN_OFF_PLATE`);
const zh = await labelsIn('zh-CN');
for (const data of drawings) for (const v of Object.values(data.views)) for (const kind of TECHNICAL_KINDS) {
  for (const element of numberedElements(v, kind)) {
    if (!zh(element, kind)) problems.push(`${data.id} ${kind} ${element.key}: no Chinese label`);
  }
}
await setLocale('en-US');
assert.deepEqual(problems, [], `technical drawings:\n  ${problems.join('\n  ')}`);

// negative controls on the first drawing, or on a synthetic one (WebP headers only) while none is published
/** A WebP header (VP8X) of the given canvas size: all webpSize reads. */
function fakeWebp(w, h) {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(22, 4); b.write('WEBPVP8X', 8, 'ascii'); b.writeUInt32LE(10, 16);
  b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3);
  return b;
}
const synthetic = () => {
  const plates = new Map([[technicalPlateFile('fixture', 'side', 2), fakeWebp(2048, 683)], [technicalPlateFile('fixture', 'side', 1), fakeWebp(1024, 342)]]);
  const box = [122.9, 106.2, 1925.1, 576.8];
  const element = (key, x0, x1) => ({ key, tone: 'armor-ke-2', d: `M${x0} 200L${x1} 200L${x1} 500L${x0} 500Z`, at: [(x0 + x1) / 2, 350], area: (x1 - x0) * 300, keMm: 500, ceMm: 800, kind: 'main' });
  const data = { schema: 2, id: 'fixture', views: { side: { size: [2048, 683], pxPerM: 174, plate: { box, body: box, sha: [...plates.values()].map(sha) },
    layers: { armor: [element('hull', 130, 1900)], modules: [element('engine', 200, 400)], crew: [element('driver', 1500, 1600)] } } } };
  return { data, read: (name) => plates.get(name) ?? null };
};
const fixture = synthetic();
assert.deepEqual(drawingProblems(fixture.data, fixture.read), [], 'control: the synthetic drawing passes');
const [control, read] = drawings[0] ? [drawings[0], (name) => readFileSync(join(DIR, name))] : [fixture.data, fixture.read];
{
  const view = Object.keys(control.views)[0], v = control.views[view];
  const narrow = (b) => [b[0], b[1], b[0] + (b[2] - b[0]) * 0.7, b[1] + (b[3] - b[1]) * 0.7];
  const shrunk = { ...control, views: { [view]: { ...v, plate: { ...v.plate, box: narrow(v.plate.box), body: narrow(v.plate.body) } } } };
  assert.ok(drawingProblems(shrunk, read).some((p) => /fills/.test(p)), 'control: a shrunken extent fails the fill');
  const armor = v.layers.armor.map((e, i) => i ? e : { ...e, d: `M${v.size[0] - 1} 1L${v.size[0] - 1} 9L${v.size[0] - 9} 9Z` });
  const stray = { ...control, views: { [view]: { ...v, layers: { ...v.layers, armor } } } };
  assert.ok(drawingProblems(stray, read).some((p) => /off the plate/.test(p)), 'control: an outline off the plate fails');
  const swapped = { ...control, views: { [view]: { ...v, plate: { ...v.plate, sha: ['0000000000000000', v.plate.sha[1]] } } } };
  assert.ok(drawingProblems(swapped, read).some((p) => /not the plate/.test(p)), 'control: a replaced plate fails');
}
console.log(`technicalDrawing: ${drawings.length} drawings (${DIR === resolve(join(ROOT, 'public/icons')) ? 'public/icons' : DIR}), ${drawings.reduce((n, d) => n + Object.keys(d.views).length, 0)} views: resolution, measured plates, fill, overlay agreement, legibility, no text; 3 negative controls on ${drawings[0] ? drawings[0].id : 'a synthetic drawing'} PASS`);
