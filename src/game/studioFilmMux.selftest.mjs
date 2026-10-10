import assert from 'node:assert/strict';
import { muxMp4, muxWebm, mp4VideoTimescale } from './studioFilmMux.ts';

const join = (parts) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};
const view = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const fourcc = (bytes, at) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

/** Walk ISO BMFF boxes; containers recurse. Returns {type, start, size, body, children}. */
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf', 'edts']);
function parseBoxes(bytes, start = 0, end = bytes.length) {
  const boxes = [];
  for (let at = start; at < end;) {
    let size = view(bytes).getUint32(at);
    const type = fourcc(bytes, at + 4);
    let header = 8;
    if (size === 1) { size = Number(view(bytes).getBigUint64(at + 8)); header = 16; }
    assert.ok(size >= header && at + size <= end, `${type} box fits its parent`);
    const entry = { type, start: at, size, body: at + header };
    if (CONTAINERS.has(type)) entry.children = parseBoxes(bytes, at + header, at + size);
    boxes.push(entry);
    at += size;
  }
  assert.equal(boxes.reduce((sum, item) => sum + item.size, 0), end - start, 'boxes tile their parent exactly');
  return boxes;
}
const find = (boxes, path) => {
  let level = boxes, found = null;
  for (const type of path.split('/')) {
    found = level.find((item) => item.type === type);
    assert.ok(found, `missing ${path}`);
    level = found.children ?? [];
  }
  return found;
};
const findAll = (boxes, type) => boxes.filter((item) => item.type === type);

// Synthetic film: 7 frames, keyframes at 0 and 4, distinct payload bytes.
const frames = Array.from({ length: 7 }, (_, index) => ({
  key: index === 0 || index === 4,
  data: Uint8Array.from({ length: 50 + index * 13 }, (_, byte) => (index * 31 + byte) & 0xff),
}));
const avcC = Uint8Array.of(1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 4, 0x67, 0x64, 0, 0x28, 1, 0, 2, 0x68, 0xee);
const mp4 = join(muxMp4({
  width: 1920, height: 1080, fps: 30, description: avcC, samples: frames,
  color: { primaries: 1, transfer: 1, matrix: 1, fullRange: false },
}));
const top = parseBoxes(mp4);
assert.deepEqual(top.map((item) => item.type), ['ftyp', 'moov', 'mdat'], 'fast start: movie box precedes the media');
assert.equal(fourcc(mp4, find(top, 'ftyp').body), 'isom');
const moov = find(top, 'moov');
assert.equal(findAll(moov.children, 'trak').length, 1);
const mvhd = find(top, 'moov/mvhd');
assert.equal(view(mp4).getUint32(mvhd.body + 12), 1000, 'movie timescale');
assert.equal(view(mp4).getUint32(mvhd.body + 16), Math.round(7 * 1000 / 30), 'movie duration');
const mdhd = find(top, 'moov/trak/mdia/mdhd');
assert.equal(view(mp4).getUint32(mdhd.body + 12), mp4VideoTimescale(30));
assert.equal(view(mp4).getUint32(mdhd.body + 16), 7000, 'media duration = frames x delta');
assert.equal(fourcc(mp4, find(top, 'moov/trak/mdia/hdlr').body + 8), 'vide');
const tkhd = find(top, 'moov/trak/tkhd');
assert.equal(view(mp4).getUint32(tkhd.body + 76), 1920 * 65536, 'track width 16.16');
assert.equal(view(mp4).getUint32(tkhd.body + 80), 1080 * 65536, 'track height 16.16');
const stbl = find(top, 'moov/trak/mdia/minf/stbl');
const stsd = find(stbl.children, 'stsd');
const entryStart = stsd.body + 8;
assert.equal(fourcc(mp4, entryStart + 4), 'avc1');
assert.equal(view(mp4).getUint16(entryStart + 8 + 24), 1920, 'sample entry width');
assert.equal(view(mp4).getUint16(entryStart + 8 + 26), 1080, 'sample entry height');
const entryChildren = parseBoxes(mp4, entryStart + 8 + 78, entryStart + view(mp4).getUint32(entryStart));
assert.deepEqual(entryChildren.map((item) => item.type), ['avcC', 'colr', 'pasp']);
assert.deepEqual([...mp4.subarray(entryChildren[0].body, entryChildren[0].start + entryChildren[0].size)], [...avcC], 'avcC carries the decoder record verbatim');
assert.equal(fourcc(mp4, entryChildren[1].body), 'nclx');
const stts = find(stbl.children, 'stts');
assert.deepEqual([view(mp4).getUint32(stts.body + 4), view(mp4).getUint32(stts.body + 8), view(mp4).getUint32(stts.body + 12)], [1, 7, 1000], 'constant frame duration');
const stss = find(stbl.children, 'stss');
assert.deepEqual([view(mp4).getUint32(stss.body + 4), view(mp4).getUint32(stss.body + 8), view(mp4).getUint32(stss.body + 12)], [2, 1, 5], 'sync samples are 1-based keyframes');
const stsz = find(stbl.children, 'stsz');
assert.equal(view(mp4).getUint32(stsz.body + 8), 7);
frames.forEach((frame, index) => assert.equal(view(mp4).getUint32(stsz.body + 12 + index * 4), frame.data.length));
const stco = find(stbl.children, 'stco');
const chunk = view(mp4).getUint32(stco.body + 8);
const mdat = find(top, 'mdat');
assert.equal(chunk, mdat.body, 'the chunk offset points at the first frame');
let cursor = chunk;
for (const frame of frames) {
  assert.deepEqual([...mp4.subarray(cursor, cursor + frame.data.length)], [...frame.data], 'frames are stored in order');
  cursor += frame.data.length;
}
assert.equal(cursor, mp4.length, 'mdat ends the file');
assert.throws(() => muxMp4({ width: 16, height: 16, fps: 30, description: avcC, samples: [{ key: false, data: frames[1].data }] }), /keyframe/);
assert.throws(() => muxMp4({ width: 16, height: 16, fps: 29.97, description: avcC, samples: frames }), /integer frame rate/);

// All-keyframe streams omit stss; AAC adds a second, separately chunked track.
const aac = Uint8Array.of(0x11, 0x90);
const audioChunks = Array.from({ length: 5 }, (_, index) => ({ key: true, frames: 1024, data: Uint8Array.of(0xa0 + index, 1, 2) }));
const withAudio = join(muxMp4(
  { width: 64, height: 64, fps: 24, description: avcC, samples: frames.map((frame) => ({ ...frame, key: true })) },
  { sampleRate: 48000, channels: 2, description: aac, samples: audioChunks, primingFrames: 2112 },
));
const avTop = parseBoxes(withAudio);
const traks = findAll(find(avTop, 'moov').children, 'trak');
assert.equal(traks.length, 2);
assert.equal(findAll(find([traks[0]], 'trak/mdia/minf/stbl').children, 'stss').length, 0, 'all-key video omits stss');
const audioStbl = find([traks[1]], 'trak/mdia/minf/stbl');
assert.equal(fourcc(withAudio, find(audioStbl.children, 'stsd').body + 12), 'mp4a');
const audioOffset = view(withAudio).getUint32(find(audioStbl.children, 'stco').body + 8);
const videoBytes = frames.reduce((sum, frame) => sum + frame.data.length, 0);
assert.equal(audioOffset, find(avTop, 'mdat').body + videoBytes, 'audio follows the video chunk');
assert.equal(withAudio[audioOffset], 0xa0);
const elst = find([traks[1]], 'trak/edts/elst');
assert.equal(view(withAudio).getUint32(elst.body + 4), 1, 'one edit');
assert.equal(view(withAudio).getUint32(elst.body + 8), Math.round((5 * 1024 - 2112) * 1000 / 48000), 'edit spans the presented audio (movie ms)');
assert.equal(view(withAudio).getUint32(elst.body + 12), 2112, 'presentation starts after the encoder priming');
assert.equal(view(withAudio).getUint16(elst.body + 16), 1, 'normal rate');
assert.equal(findAll(traks[0].children, 'edts').length, 0, 'video needs no edit list');
const audioMdhd = find([traks[1]], 'trak/mdia/mdhd');
assert.equal(view(withAudio).getUint32(audioMdhd.body + 12), 48000);
assert.equal(view(withAudio).getUint32(audioMdhd.body + 16), 5 * 1024);

// --- WebM -------------------------------------------------------------------
function readVint(bytes, at) {
  const first = bytes[at];
  let width = 1;
  while (width <= 8 && !(first & (0x80 >> (width - 1)))) width++;
  let value = first & (0xff >> width);
  for (let index = 1; index < width; index++) value = value * 256 + bytes[at + index];
  return { value, width };
}
function readId(bytes, at) {
  const first = bytes[at];
  const width = first & 0x80 ? 1 : first & 0x40 ? 2 : first & 0x20 ? 3 : 4;
  let id = 0;
  for (let index = 0; index < width; index++) id = id * 256 + bytes[at + index];
  return { id, width };
}
function parseEbml(bytes, start, end, depthIds = new Set([0x18538067, 0x1654ae6b, 0xae, 0x1f43b675, 0x1c53bb6b, 0xbb, 0xb7])) {
  const out = [];
  for (let at = start; at < end;) {
    const id = readId(bytes, at), size = readVint(bytes, at + id.width);
    const body = at + id.width + size.width;
    assert.ok(body + size.value <= end, `EBML 0x${id.id.toString(16)} fits its parent`);
    const item = { id: id.id, start: at, body, size: size.value };
    if (depthIds.has(id.id)) item.children = parseEbml(bytes, body, body + size.value, depthIds);
    out.push(item);
    at = body + size.value;
  }
  return out;
}
const longFrames = Array.from({ length: 75 }, (_, index) => ({ key: index % 30 === 0, data: Uint8Array.of(index, index ^ 0x55, 7) }));
const webm = join(muxWebm({ width: 1280, height: 720, fps: 30, codec: 'V_VP9', samples: longFrames }));
const ebml = parseEbml(webm, 0, webm.length);
assert.deepEqual(ebml.map((item) => item.id), [0x1a45dfa3, 0x18538067], 'EBML header then one Segment');
const segment = ebml[1];
assert.equal(segment.body + segment.size, webm.length, 'segment size covers the file');
const ids = segment.children.map((item) => item.id);
assert.equal(ids[0], 0x1549a966);
assert.equal(ids[1], 0x1654ae6b);
assert.equal(ids[ids.length - 1], 0x1c53bb6b, 'Cues close the segment');
const clusters = segment.children.filter((item) => item.id === 0x1f43b675);
assert.equal(clusters.length, 3, 'clusters open on the 1 s keyframes');
let blocks = 0;
clusters.forEach((cluster, index) => {
  const timecode = cluster.children.find((item) => item.id === 0xe7);
  const ms = timecode.size === 1 ? webm[timecode.body] : view(webm).getUint16(timecode.body);
  assert.equal(ms, Math.round(index * 30 * 1000 / 30));
  const simple = cluster.children.filter((item) => item.id === 0xa3);
  assert.equal(webm[simple[0].body + 3] & 0x80, 0x80, 'each cluster starts on a keyframe block');
  blocks += simple.length;
});
assert.equal(blocks, 75, 'every frame is one SimpleBlock');
const cues = segment.children[segment.children.length - 1];
for (const point of cues.children) {
  const positions = point.children.find((item) => item.id === 0xb7);
  const position = positions.children.find((item) => item.id === 0xf1);
  let offset = 0;
  for (let index = 0; index < position.size; index++) offset = offset * 256 + webm[position.body + index];
  assert.equal(readId(webm, segment.body + offset).id, 0x1f43b675, 'cue positions address clusters');
}

console.log('studioFilmMux.selftest: MP4 fast-start boxes, offsets, sync table, AAC track and WebM clusters/cues passed');
