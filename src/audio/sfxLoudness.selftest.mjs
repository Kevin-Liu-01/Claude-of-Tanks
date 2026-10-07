// Receipt (2026-10-06): the shipped sound-effect files a round adds are what their mastering preset promises —
// measured as they ship (tools/audio/loudness-receipt.mjs: the decoded WebM/Opus on build-sfx's EBU R128 meter) and
// bound to the files by SHA-256, so a rebuilt or hand-swapped file fails until it is measured again. Checked here
// without ffmpeg: every recorded variant's hash, duration and channel count against the manifest, its container
// (WebM, Opus, the manifest's channels in its OpusHead), and its loudness and true peak against the preset, within
// the spread the shipped library itself shows (impact props −10.0 to −16.6 LUFS momentary max, true peaks to
// +0.6 dBTP after the Opus round trip on a −1 dBTP ceiling).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SFX_ASSETS } from './sfxManifest.generated.ts';
import { PRESETS } from '../../tools/audio/master.mjs';
import { SFX_CATALOG } from '../../tools/audio/sfx-catalog.mjs';

const record = JSON.parse(readFileSync(new URL('../../tools/audio/sfx-loudness.json', import.meta.url), 'utf8'));

/** The 2.0 revival's assets (2026-10-06): every one is measured. */
const REVIVAL = [
  'pole_snap', 'pole_wires', 'pole_fall', 'cart_break', 'straw_crush', 'tent_collapse', 'metal_topple', 'pottery_smash',
  'can_knock', 'fuel_drum_blast', 'amb_fjord', 'amb_adriatic', 'layer_creek', 'layer_station', 'flyover_piston',
  'flyover_bomber', 'spot_oystercatcher', 'spot_boat_creak', 'bell_toll', 'bell_orthodox',
];
for (const id of REVIVAL) assert.ok(record[id], `${id} is measured (node tools/audio/loudness-receipt.mjs --ids ${id})`);

/** Loudness-normalised presets land at most 1 LU over their target and at most 7 LU under it (a crest the true-peak
 * ceiling holds down); integrated beds within 1 LU; the Opus round trip may lift a true peak 2 dB over the ceiling. */
const OVER_LU = 1;
const UNDER_LU = 7;
const BED_LU = 1;
const OPUS_PEAK_DB = 2;

/** Container facts a decoder relies on: the EBML magic, the WebM doctype, the Opus codec, OpusHead's channel count. */
function container(bytes) {
  const find = (prefix, text) => {
    const needle = Buffer.concat([Buffer.from(prefix), Buffer.from(text, 'latin1')]);
    return bytes.indexOf(needle);
  };
  const head = bytes.indexOf(Buffer.from('OpusHead', 'latin1'));
  return {
    ebml: bytes.subarray(0, 4).toString('hex') === '1a45dfa3',
    webm: find([0x42, 0x82, 0x84], 'webm') >= 0,
    opus: find([0x86, 0x86], 'A_OPUS') >= 0,
    channels: head >= 0 ? bytes[head + 9] : null,
  };
}

let files = 0;
for (const [id, rec] of Object.entries(record)) {
  const shipped = SFX_ASSETS[id];
  const entry = SFX_CATALOG.find((e) => e.id === id);
  assert.ok(shipped && entry, `${id}: in the manifest and the catalog`);
  assert.equal(rec.group, shipped.g, `${id}: group`);
  assert.equal(rec.preset, entry.proc, `${id}: mastered with its catalog preset`);
  assert.equal(rec.channels, shipped.c, `${id}: channels`);
  assert.equal(rec.variants.length, shipped.n, `${id}: one measurement per shipped variant`);
  const preset = PRESETS[rec.preset];
  assert.ok(preset, `${id}: preset ${rec.preset}`);
  rec.variants.forEach((v, i) => {
    const name = `${id}_${i}`;
    const bytes = readFileSync(new URL(`../../public/audio/sfx/${shipped.g}/${name}.webm`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), v.sha256, `${name}: the measured bytes are the shipped bytes (re-run loudness-receipt.mjs after a rebuild)`);
    assert.equal(bytes.length, v.bytes);
    assert.ok(Math.abs(v.durS - shipped.d[i]) <= 0.03, `${name}: duration ${v.durS} s matches the manifest's ${shipped.d[i]} s`);
    const facts = container(bytes);
    assert.ok(facts.ebml && facts.webm && facts.opus, `${name}: WebM/Opus`);
    assert.equal(facts.channels, shipped.c, `${name}: OpusHead carries the manifest's ${shipped.c} channel(s)`);
    if (preset.integrated != null) {
      assert.ok(Math.abs(v.integrated - preset.integrated) <= BED_LU, `${name}: integrated ${v.integrated} LUFS on the ${rec.preset} target ${preset.integrated}`);
    } else if (preset.mMax != null) {
      assert.ok(v.mMax <= preset.mMax + OVER_LU && v.mMax >= preset.mMax - UNDER_LU,
        `${name}: momentary max ${v.mMax} LUFS within ${preset.mMax - UNDER_LU}..${preset.mMax + OVER_LU} (${rec.preset})`);
    } else if (preset.peakNorm != null) {
      assert.ok(v.truePeak <= preset.peakNorm + OPUS_PEAK_DB, `${name}: peak-normalised to ${preset.peakNorm} dBTP`);
    }
    assert.ok(v.truePeak <= preset.peak + OPUS_PEAK_DB, `${name}: true peak ${v.truePeak} dBTP under the ${preset.peak} dBTP ceiling plus the Opus round trip`);
    files++;
  });
}
console.log(`sfxLoudness.selftest: ${Object.keys(record).length} assets, ${files} files measured as they ship, bound by hash, on their presets`);
