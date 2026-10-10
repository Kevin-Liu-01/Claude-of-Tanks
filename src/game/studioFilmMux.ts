/**
 * studioFilmMux.ts — minimal, dependency-free containers for the Studio's
 * offline film export (WebCodecs output). Pure: Node-testable, no DOM.
 *
 * - muxMp4: ISO BMFF with the movie box before the media ("fast start"):
 *   one H.264 video track (avc1 + avcC from the encoder's decoder config,
 *   optional nclx colour box) and an optional AAC track (mp4a + esds). Every
 *   sample of a track sits in one contiguous chunk; constant frame duration.
 * - muxWebm: Matroska/WebM with one VP9 video track (and optional Opus
 *   audio), SimpleBlocks in clusters that open on keyframes, and Cues.
 *
 * Both return an array of byte parts (header + the encoded chunks, not
 * copied) that a caller hands to `new Blob(parts)`.
 */

export interface MuxSample {
  readonly data: Uint8Array;
  readonly key: boolean;
}

export interface MuxColor {
  /** ISO/IEC 23091-2 code points (1 = BT.709). */
  readonly primaries: number;
  readonly transfer: number;
  readonly matrix: number;
  readonly fullRange: boolean;
}

export interface Mp4VideoTrack {
  readonly width: number;
  readonly height: number;
  /** Constant integer frame rate. */
  readonly fps: number;
  /** AVCDecoderConfigurationRecord (EncodedVideoChunkMetadata.decoderConfig.description). */
  readonly description: Uint8Array;
  readonly samples: readonly MuxSample[];
  readonly color?: MuxColor | null;
}

export interface MuxAudioTrack {
  readonly sampleRate: number;
  readonly channels: number;
  /** AAC AudioSpecificConfig (MP4) or OpusHead (WebM), from the encoder's decoder config. */
  readonly description: Uint8Array;
  /** Each chunk with its duration in samples at `sampleRate`. */
  readonly samples: ReadonlyArray<MuxSample & { readonly frames: number }>;
  /** Encoder priming at the start of the stream (samples); MP4 trims it with an edit list. */
  readonly primingFrames?: number;
}

// --- byte helpers -----------------------------------------------------------------

type Bytes = Uint8Array;

function concat(parts: readonly Bytes[]): Bytes {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

const u8 = (value: number): Bytes => Uint8Array.of(value & 0xff);
const u16 = (value: number): Bytes => Uint8Array.of((value >>> 8) & 0xff, value & 0xff);
const u24 = (value: number): Bytes => Uint8Array.of((value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
function u32(value: number): Bytes {
  if (!(value >= 0 && value <= 0xffffffff) || !Number.isInteger(value)) throw new RangeError(`u32 out of range: ${value}`);
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}
function u64(value: number): Bytes {
  if (!(value >= 0 && value <= Number.MAX_SAFE_INTEGER) || !Number.isInteger(value)) throw new RangeError(`u64 out of range: ${value}`);
  const high = Math.floor(value / 0x100000000), low = value % 0x100000000;
  return concat([u32(high), u32(low)]);
}
function ascii(text: string): Bytes {
  const out = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) out[index] = text.charCodeAt(index) & 0x7f;
  return out;
}
const zeros = (count: number): Bytes => new Uint8Array(count);

function box(type: string, ...payload: Bytes[]): Bytes {
  const body = concat(payload);
  return concat([u32(8 + body.length), ascii(type), body]);
}

function fullBox(type: string, version: number, flags: number, ...payload: Bytes[]): Bytes {
  return box(type, u8(version), u24(flags), ...payload);
}

const UNITY_MATRIX = concat([
  u32(0x00010000), u32(0), u32(0),
  u32(0), u32(0x00010000), u32(0),
  u32(0), u32(0), u32(0x40000000),
]);

// --- MP4 ------------------------------------------------------------------------

function sampleTable(entry: Bytes, deltas: { count: number; delta: number }[], samples: readonly MuxSample[], chunkOffset: number, sync: boolean): Bytes {
  const keys: Bytes[] = [];
  let keyCount = 0;
  samples.forEach((sample, index) => { if (sample.key) { keys.push(u32(index + 1)); keyCount++; } });
  const sizes = samples.map((sample) => u32(sample.data.length));
  const parts = [
    fullBox('stsd', 0, 0, u32(1), entry),
    fullBox('stts', 0, 0, u32(deltas.length), ...deltas.flatMap((run) => [u32(run.count), u32(run.delta)])),
  ];
  if (sync && keyCount < samples.length) parts.push(fullBox('stss', 0, 0, u32(keyCount), ...keys));
  parts.push(
    fullBox('stsc', 0, 0, u32(1), u32(1), u32(samples.length), u32(1)),
    fullBox('stsz', 0, 0, u32(0), u32(samples.length), ...sizes),
    fullBox('stco', 0, 0, u32(1), u32(chunkOffset)),
  );
  return box('stbl', ...parts);
}

function dataInformation(): Bytes {
  return box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1)));
}

function trackHeader(id: number, duration: number, width: number, height: number, audio: boolean): Bytes {
  return fullBox('tkhd', 0, 3,
    u32(0), u32(0), u32(id), u32(0), u32(duration), zeros(8),
    u16(0), u16(audio ? 1 : 0), u16(audio ? 0x0100 : 0), u16(0),
    UNITY_MATRIX, u32(width * 65536), u32(height * 65536));
}

function mediaHeader(timescale: number, duration: number): Bytes {
  // language 'und' packed as three 5-bit letters
  return fullBox('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0x55c4), u16(0));
}

function handler(type: string, name: string): Bytes {
  return fullBox('hdlr', 0, 0, u32(0), ascii(type), zeros(12), ascii(name), u8(0));
}

function avcSampleEntry(track: Mp4VideoTrack): Bytes {
  const compressor = zeros(32);
  const label = ascii('Claude of Tanks Studio');
  compressor[0] = label.length;
  compressor.set(label, 1);
  const children: Bytes[] = [box('avcC', track.description)];
  if (track.color) {
    children.push(box('colr', ascii('nclx'), u16(track.color.primaries), u16(track.color.transfer),
      u16(track.color.matrix), u8(track.color.fullRange ? 0x80 : 0)));
  }
  children.push(box('pasp', u32(1), u32(1)));
  return box('avc1',
    zeros(6), u16(1),
    u16(0), u16(0), zeros(12),
    u16(track.width), u16(track.height),
    u32(0x00480000), u32(0x00480000), u32(0),
    u16(1), compressor, u16(0x0018), u16(0xffff),
    ...children);
}

/** MPEG-4 descriptor with a 4-byte length (accepted by every reader). */
function descriptor(tag: number, ...payload: Bytes[]): Bytes {
  const body = concat(payload);
  const n = body.length;
  return concat([u8(tag), Uint8Array.of(0x80 | ((n >>> 21) & 0x7f), 0x80 | ((n >>> 14) & 0x7f), 0x80 | ((n >>> 7) & 0x7f), n & 0x7f), body]);
}

function aacSampleEntry(track: MuxAudioTrack): Bytes {
  const esds = fullBox('esds', 0, 0, descriptor(0x03, u16(2), u8(0),
    descriptor(0x04, u8(0x40), u8(0x15), u24(0), u32(0), u32(0), descriptor(0x05, track.description)),
    descriptor(0x06, u8(0x02))));
  return box('mp4a',
    zeros(6), u16(1),
    zeros(8), u16(track.channels), u16(16), u16(0), u16(0),
    u32(Math.round(track.sampleRate) * 65536 >>> 0),
    esds);
}

/** Video timescale: an integer multiple of the frame rate, exact for every frame. */
export function mp4VideoTimescale(fps: number): number {
  return Math.round(fps) * 1000;
}

/**
 * Fast-start MP4 (ftyp, moov, mdat). Returns byte parts in file order: the
 * header block, then every video chunk, then every audio chunk.
 */
export function muxMp4(video: Mp4VideoTrack, audio: MuxAudioTrack | null = null): Bytes[] {
  if (!video.samples.length) throw new RangeError('A film needs at least one frame');
  if (!video.samples[0].key) throw new RangeError('The first frame must be a keyframe');
  if (!(Number.isInteger(video.fps) && video.fps > 0)) throw new RangeError('Constant integer frame rate required');
  const timescale = mp4VideoTimescale(video.fps), delta = 1000;
  const mediaDuration = video.samples.length * delta;
  const movieDuration = Math.round(video.samples.length * 1000 / video.fps);
  const videoBytes = video.samples.reduce((sum, sample) => sum + sample.data.length, 0);
  const audioBytes = audio ? audio.samples.reduce((sum, sample) => sum + sample.data.length, 0) : 0;
  const audioFrames = audio ? audio.samples.reduce((sum, sample) => sum + sample.frames, 0) : 0;
  const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isom'), ascii('iso2'), ascii('avc1'), ascii('mp41'));
  const large = videoBytes + audioBytes + 16 > 0xffffffff;
  const build = (videoOffset: number, audioOffset: number): Bytes => {
    const traks = [box('trak',
      trackHeader(1, movieDuration, video.width, video.height, false),
      box('mdia', mediaHeader(timescale, mediaDuration), handler('vide', 'VideoHandler'),
        box('minf', fullBox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)), dataInformation(),
          sampleTable(avcSampleEntry(video), [{ count: video.samples.length, delta }], video.samples, videoOffset, true))))];
    if (audio && audio.samples.length) {
      const runs: { count: number; delta: number }[] = [];
      for (const sample of audio.samples) {
        const last = runs[runs.length - 1];
        if (last && last.delta === sample.frames) last.count++;
        else runs.push({ count: 1, delta: sample.frames });
      }
      const priming = Math.max(0, Math.round(audio.primingFrames ?? 0));
      const presented = Math.max(0, audioFrames - priming);
      const presentedMs = Math.round(presented * 1000 / audio.sampleRate);
      // The edit list starts presentation after the encoder's priming samples,
      // so the first decoded sample lines up with the first video frame.
      const edits = box('edts', fullBox('elst', 0, 0, u32(1), u32(presentedMs), u32(priming), u16(1), u16(0)));
      traks.push(box('trak',
        trackHeader(2, presentedMs, 0, 0, true),
        edits,
        box('mdia', mediaHeader(Math.round(audio.sampleRate), audioFrames), handler('soun', 'SoundHandler'),
          box('minf', fullBox('smhd', 0, 0, u16(0), u16(0)), dataInformation(),
            sampleTable(aacSampleEntry(audio), runs, audio.samples, audioOffset, false)))));
    }
    const mvhd = fullBox('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(movieDuration),
      u32(0x00010000), u16(0x0100), zeros(10), UNITY_MATRIX, zeros(24), u32(traks.length + 1));
    return box('moov', mvhd, ...traks);
  };
  const mdatHeaderSize = large ? 16 : 8;
  const moovSize = build(0, 0).length;
  const dataStart = ftyp.length + moovSize + mdatHeaderSize;
  const moov = build(dataStart, dataStart + videoBytes);
  if (moov.length !== moovSize) throw new Error('MP4 header size changed while patching offsets');
  const payload = videoBytes + audioBytes;
  const mdatHeader = large
    ? concat([u32(1), ascii('mdat'), u64(payload + 16)])
    : concat([u32(payload + 8), ascii('mdat')]);
  return [concat([ftyp, moov, mdatHeader]), ...video.samples.map((sample) => sample.data),
    ...(audio ? audio.samples.map((sample) => sample.data) : [])];
}

// --- WebM -------------------------------------------------------------------------

function ebmlId(id: number): Bytes {
  if (id <= 0xff) return u8(id);
  if (id <= 0xffff) return u16(id);
  if (id <= 0xffffff) return u24(id);
  return u32(id);
}

/** EBML variable-size integer, minimal width. */
function ebmlSize(size: number): Bytes {
  for (let width = 1; width <= 8; width++) {
    const limit = 2 ** (7 * width) - 1; // all-ones is reserved for "unknown"
    if (size < limit) {
      const out = new Uint8Array(width);
      let value = size;
      for (let index = width - 1; index >= 0; index--) { out[index] = value % 256; value = Math.floor(value / 256); }
      out[0] |= 1 << (8 - width);
      return out;
    }
  }
  throw new RangeError('EBML element too large');
}

function element(id: number, ...payload: Bytes[]): Bytes {
  const body = concat(payload);
  return concat([ebmlId(id), ebmlSize(body.length), body]);
}

function uintBytes(value: number): Bytes {
  if (value === 0) return u8(0);
  const out: number[] = [];
  let rest = value;
  while (rest > 0) { out.unshift(rest % 256); rest = Math.floor(rest / 256); }
  return Uint8Array.from(out);
}

const euint = (id: number, value: number): Bytes => element(id, uintBytes(value));
const estring = (id: number, value: string): Bytes => element(id, ascii(value));
function efloat(id: number, value: number): Bytes {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value);
  return element(id, bytes);
}

export interface WebmVideoTrack {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly codec: 'V_VP9';
  readonly samples: readonly MuxSample[];
}

/** WebM with keyframe-aligned clusters and Cues; timestamps in milliseconds. */
export function muxWebm(video: WebmVideoTrack, audio: MuxAudioTrack | null = null): Bytes[] {
  if (!video.samples.length) throw new RangeError('A film needs at least one frame');
  if (!video.samples[0].key) throw new RangeError('The first frame must be a keyframe');
  const frameNs = Math.round(1e9 / video.fps);
  const frameMs = (index: number) => Math.round(index * 1000 / video.fps);
  const durationMs = video.samples.length * 1000 / video.fps;
  const header = element(0x1a45dfa3,
    euint(0x4286, 1), euint(0x42f7, 1), euint(0x42f2, 4), euint(0x42f3, 8),
    estring(0x4282, 'webm'), euint(0x4287, 4), euint(0x4285, 2));
  const info = element(0x1549a966,
    euint(0x2ad7b1, 1000000), estring(0x4d80, 'Claude of Tanks Studio'), estring(0x5741, 'Claude of Tanks Studio'),
    efloat(0x4489, durationMs));
  const entries = [element(0xae,
    euint(0xd7, 1), euint(0x73c5, 1), euint(0x83, 1), estring(0x86, video.codec), euint(0x23e383, frameNs),
    element(0xe0, euint(0xb0, video.width), euint(0xba, video.height)))];
  if (audio) {
    entries.push(element(0xae,
      euint(0xd7, 2), euint(0x73c5, 2), euint(0x83, 2), estring(0x86, 'A_OPUS'),
      element(0x63a2, audio.description), euint(0x56aa, 6500000), euint(0x56bb, 80000000),
      element(0xe1, efloat(0xb5, audio.sampleRate), euint(0x9f, audio.channels))));
  }
  const tracks = element(0x1654ae6b, ...entries);
  // Audio blocks interleave by time into the video's clusters.
  const audioBlocks: { ms: number; data: Bytes }[] = [];
  if (audio) {
    let frames = 0;
    for (const sample of audio.samples) {
      audioBlocks.push({ ms: Math.round(frames * 1000 / audio.sampleRate), data: sample.data });
      frames += sample.frames;
    }
  }
  const clusterStarts: number[] = [];
  video.samples.forEach((sample, index) => {
    const start = clusterStarts.length ? frameMs(clusterStarts[clusterStarts.length - 1]) : -Infinity;
    if (index === 0 || (sample.key && frameMs(index) - start >= 1000) || frameMs(index) - start > 30000) clusterStarts.push(index);
  });
  const clusters: Bytes[][] = [];
  const cuePoints: { ms: number; offset: number }[] = [];
  let segmentOffset = info.length + tracks.length; // Cues follow the clusters
  let audioCursor = 0;
  for (let c = 0; c < clusterStarts.length; c++) {
    const first = clusterStarts[c], end = c + 1 < clusterStarts.length ? clusterStarts[c + 1] : video.samples.length;
    const baseMs = frameMs(first);
    const endMs = end < video.samples.length ? frameMs(end) : Infinity;
    const blocks: { ms: number; track: number; key: boolean; data: Bytes }[] = [];
    for (let index = first; index < end; index++) {
      blocks.push({ ms: frameMs(index), track: 1, key: video.samples[index].key, data: video.samples[index].data });
    }
    while (audioCursor < audioBlocks.length && audioBlocks[audioCursor].ms < endMs) {
      const block = audioBlocks[audioCursor++];
      blocks.push({ ms: Math.max(baseMs, block.ms), track: 2, key: true, data: block.data });
    }
    blocks.sort((a, b) => a.ms - b.ms || a.track - b.track);
    const parts: Bytes[] = [];
    for (const block of blocks) {
      const relative = block.ms - baseMs;
      if (relative > 32767) throw new RangeError('WebM cluster too long');
      const prefix = concat([u8(0x80 | block.track), u16(relative & 0xffff), u8(block.key ? 0x80 : 0)]);
      parts.push(concat([u8(0xa3), ebmlSize(prefix.length + block.data.length), prefix]), block.data);
    }
    const timecode = euint(0xe7, baseMs);
    const bodyLength = timecode.length + parts.reduce((sum, part) => sum + part.length, 0);
    const clusterHeader = concat([u32(0x1f43b675), ebmlSize(bodyLength), timecode]);
    cuePoints.push({ ms: baseMs, offset: segmentOffset });
    segmentOffset += clusterHeader.length + bodyLength - timecode.length;
    clusters.push([clusterHeader, ...parts]);
  }
  const cues = element(0x1c53bb6b, ...cuePoints.map((point) => element(0xbb,
    euint(0xb3, point.ms), element(0xb7, euint(0xf7, 1), euint(0xf1, point.offset)))));
  const segmentLength = info.length + tracks.length
    + clusters.reduce((sum, parts) => sum + parts.reduce((inner, part) => inner + part.length, 0), 0) + cues.length;
  const segmentHeader = concat([u32(0x18538067), ebmlSize(segmentLength)]);
  return [concat([header, segmentHeader, info, tracks]), ...clusters.flat(), cues];
}
