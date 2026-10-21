// Pixel reads for tools/hud-ammo-states.browser.mjs, in Node, on the PNG bytes a capture saved (owner 2026-10-17: out
// of ammo and unlimited rounds; critic r4b: five phone frames lost the tray slot's count, label, strike and ∞ while
// every DOM check passed, because the DOM was read and the pixels were not).
//  - decodePng / encodePng: 8-bit, non-interlaced RGB(A) PNGs, as Chrome's screenshots are.
//  - slotFrameFindings: every mark the DOM says a tray slot shows (its count, type label, empty strike, the phone's
//    selection chevron and an opaque top edge) is present in the saved frame, read in its own box; a white count reads
//    at full brightness (never under the reload shade).
//  - inkGap: the least distance between the ink two marks add to a bare slot (the tray's no-touching-marks bar).
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** RGBA pixels of an 8-bit, non-interlaced truecolour PNG (with or without alpha). */
export function decodePng(buffer) {
  if (!SIGNATURE.equals(buffer.subarray(0, 8))) throw new Error('not a PNG');
  let offset = 8;
  let width = 0; let height = 0; let depth = 0; let colour = -1; let interlace = 0;
  const parts = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; colour = body[9]; interlace = body[12];
    } else if (type === 'IDAT') parts.push(body);
    else if (type === 'IEND') break;
    offset += length + 12;
  }
  if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) {
    throw new Error(`unsupported PNG (depth ${depth}, colour type ${colour}, interlace ${interlace})`);
  }
  const channels = colour === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(parts));
  const data = new Uint8ClampedArray(width * height * 4);
  let previous = new Uint8Array(stride);
  let current = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x];
      const corner = x >= channels ? previous[x - channels] : 0;
      let value = raw[start + 1 + x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - corner);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      } else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      current[x] = value & 255;
    }
    for (let x = 0, o = y * width * 4; x < width; x++, o += 4) {
      data[o] = current[x * channels]; data[o + 1] = current[x * channels + 1]; data[o + 2] = current[x * channels + 2];
      data[o + 3] = channels === 4 ? current[x * channels + 3] : 255;
    }
    [previous, current] = [current, previous];
  }
  return { width, height, data };
}

/** An RGBA PNG of `image` (unfiltered rows; small crops only). */
export function encodePng({ width, height, data }) {
  const chunk = (type, body) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
    return Buffer.concat([head, body, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(rows, y * (width * 4 + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

/** The pixels of `image` inside `box` (device px, clamped to the image). */
export function cropImage(image, box) {
  const x0 = Math.max(0, Math.floor(box.x0)); const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(image.width, Math.ceil(box.x1)); const y1 = Math.min(image.height, Math.ceil(box.y1));
  const width = Math.max(0, x1 - x0); const height = Math.max(0, y1 - y0);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) data.set(image.data.subarray(((y0 + y) * image.width + x0) * 4, ((y0 + y) * image.width + x1) * 4), y * width * 4);
  return { width, height, data };
}

const luma = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
/** The danger ink (--hud-danger, 240/90/90), the reticle reader's class. */
const dangerInk = (r, g, b) => r > 170 && r - g > 65 && g < 150 && Math.abs(g - b) < 45;
/** The numeral's white (#e6edf3, luma 235) at full strength: the reload shade's .72 leaves it near luma 70. */
const numeralInk = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b >= 170;

/** Device-pixel bounds of a CSS box, grown by `pad` CSS px. */
const device = (box, scale, pad = 0) => ({ x0: Math.floor((box.x0 - pad) * scale), y0: Math.floor((box.y0 - pad) * scale),
  x1: Math.ceil((box.x1 + pad) * scale), y1: Math.ceil((box.y1 + pad) * scale) });
const inside = (box, x, y) => x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;

function pixels(image, box, skip) {
  const out = [];
  for (let y = Math.max(0, box.y0); y < Math.min(image.height, box.y1); y++) {
    for (let x = Math.max(0, box.x0); x < Math.min(image.width, box.x1); x++) {
      if (skip && inside(skip, x, y)) continue;
      const i = (y * image.width + x) * 4;
      out.push([image.data[i], image.data[i + 1], image.data[i + 2], luma(image.data, i), x, y]);
    }
  }
  return out;
}

/**
 * Glyph ink in a mark's box: pixels `rise` brighter than their own row's floor (its 25th-percentile brightness; the
 * reload shade's edge runs along a row) that pass `hue`, or every `hue` pixel when `rise` is null. Returns the ink
 * count, the share of the box's columns it reaches (text runs across its box; a stray shell tail does not), and the
 * box's pixel count.
 */
export function markInk(image, box, { rise = null, hue = null } = {}) {
  const list = pixels(image, box);
  const rows = new Map();
  for (const p of list) {
    if (!rows.has(p[5])) rows.set(p[5], []);
    rows.get(p[5]).push(p[3]);
  }
  const floors = new Map([...rows].map(([y, values]) => [y, values.sort((a, b) => a - b)[Math.floor(values.length * 0.25)]]));
  const columns = new Set();
  let ink = 0;
  for (const [r, g, b, l, x, y] of list) {
    if (rise != null && l < floors.get(y) + rise) continue;
    if (hue && !hue(r, g, b)) continue;
    ink++; columns.add(x);
  }
  const width = Math.max(1, Math.min(image.width, box.x1) - Math.max(0, box.x0));
  return { ink, reach: columns.size / width, area: list.length };
}

/**
 * What the saved frame is missing of each tray slot's marks. `slots` are read off the DOM right before the frame
 * (CSS px, viewport coordinates): { name, box, count: {box, danger}|null, label: {box}|null, strike: {box, length}|null,
 * chevron: {box}|null, edge: {box, rgb}|null }. Returns one line per missing mark.
 */
export function slotFrameFindings(image, slots, scale) {
  const findings = [];
  const need = (read) => Math.max(8, Math.round(read.area * 0.04));
  const text = (tag, what, read) => {
    if (read.ink < need(read) || read.reach < 0.5) {
      findings.push(`${tag}: ${what} is not in the frame (${read.ink} px, ${Math.round(read.reach * 100)} % of its width)`);
      return false;
    }
    return true;
  };
  for (const slot of slots) {
    const tag = `slot "${slot.name}"`;
    const countBox = slot.count ? device(slot.count.box, scale, 1) : null;
    if (slot.count) {
      const read = markInk(image, countBox, slot.count.danger ? { hue: dangerInk } : { rise: 30 });
      // A count in the numeral's white (a number or the ∞) reads at full brightness: the reload shade dims the slot's
      // picture, never its count (critic r7: a reloading 24 under the shade read rgb(67,70,74) on rgb(11,10,10)).
      if (text(tag, slot.count.danger ? 'its count in the danger ink' : 'its count', read) && !slot.count.danger) {
        const bright = markInk(image, countBox, { hue: numeralInk }).ink;
        if (bright < need(read)) findings.push(`${tag}: its count is dimmed in the frame (${bright} px at the numeral's brightness)`);
      }
    }
    if (slot.label) text(tag, 'its type label', markInk(image, device(slot.label.box, scale, 1), { rise: 25 }));
    if (slot.strike) {
      const list = pixels(image, device(slot.strike.box, scale, 1), countBox);
      const need = Math.max(10, Math.round(slot.strike.length * scale * 0.6));
      const ink = list.filter(([r, g, b]) => dangerInk(r, g, b)).length;
      if (ink < need) findings.push(`${tag}: its strike is not in the frame (${ink} < ${need} px)`);
    }
    if (slot.chevron) {
      // amber, dimmed or not by the reload shade over the slot's upper part
      const read = markInk(image, device(slot.chevron.box, scale, 1), { rise: 20, hue: (r, g, b) => r - b >= 25 && r >= g });
      const need = Math.max(4, Math.round(2 * scale * scale));
      if (read.ink < need) findings.push(`${tag}: its selection chevron is not in the frame (${read.ink} < ${need} px)`);
    }
    if (slot.edge) {
      // an opaque top edge keeps its colour along its best device row (critic r4b: a dark band covered the phone ∞
      // slot's frame)
      const x0 = Math.ceil((slot.edge.box.x0 + 3) * scale); const x1 = Math.floor((slot.edge.box.x1 - 3) * scale);
      const first = Math.floor(slot.edge.box.y0 * scale);
      let best = null;
      for (let row = first; row < Math.max(first + 1, Math.ceil(slot.edge.box.y1 * scale)); row++) {
        const list = pixels(image, { x0, x1, y0: row, y1: row + 1 });
        const off = list.filter(([r, g, b]) => Math.hypot(r - slot.edge.rgb[0], g - slot.edge.rgb[1], b - slot.edge.rgb[2]) > 60).length;
        if (list.length && (!best || off / list.length < best.off / best.of)) best = { off, of: list.length };
      }
      if (!best || best.off > best.of * 0.25) {
        findings.push(`${tag}: its top edge is not its colour in the frame (${best ? `${best.off}/${best.of}` : 'no'} px off)`);
      }
    }
  }
  return findings;
}

/**
 * The least distance (CSS px) between the ink `mark` adds to `bare` and the ink `icon` adds, inside `box` (CSS px).
 * Ink is brightness a shot adds over the bare slot (a text shadow only darkens it; an empty slot's icon is dimmed).
 * Neighbouring device pixels touch, so one pixel apart reads 0. Null when either adds no ink.
 */
export function inkGap({ bare, mark, icon }, box, scale, { markRise = 40, iconRise = 24 } = {}) {
  const area = device(box, scale);
  const ink = (shot, rise) => {
    const points = [];
    for (let y = Math.max(0, area.y0); y < Math.min(bare.height, area.y1); y++) {
      for (let x = Math.max(0, area.x0); x < Math.min(bare.width, area.x1); x++) {
        const i = (y * bare.width + x) * 4;
        if (luma(shot.data, i) - luma(bare.data, i) > rise) points.push(x, y);
      }
    }
    return points;
  };
  const a = ink(mark, markRise); const b = ink(icon, iconRise);
  if (!a.length || !b.length) return null;
  let best = Infinity;
  for (let i = 0; i < a.length; i += 2) {
    for (let j = 0; j < b.length; j += 2) {
      const d = (a[i] - b[j]) ** 2 + (a[i + 1] - b[j + 1]) ** 2;
      if (d < best) best = d;
    }
  }
  return Math.round((Math.max(0, Math.sqrt(best) - 1) / scale) * 10) / 10;
}
