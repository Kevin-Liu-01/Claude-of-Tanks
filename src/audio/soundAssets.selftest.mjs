import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { SFX_ASSETS } from './sfxManifest.generated.ts';
import { VOICE_PACKS } from './voiceManifest.generated.ts';
import { VOICE_LINES } from './voiceLines.ts';
import { MAP_SCENES, GARAGE_SCENE } from './environmentScenes.ts';
import { ENGINE_FAMILY_IDS, CREW_LANGUAGES } from './vehicleAudioProfiles.ts';
import { GROUP_PROFILES } from './soundCues.ts';
import { MAP_IDS } from '../world/maps/mapIds.ts';

const root = new URL('../../public/audio/', import.meta.url);

// ---- every manifest record is complete and its files are on disk.
let bytes = 0;
for (const [id, rec] of Object.entries(SFX_ASSETS)) {
  assert.ok(GROUP_PROFILES[rec.g], `${id}: group ${rec.g} has a playback profile`);
  assert.equal(rec.d.length, rec.n, `${id}: one duration per variant`);
  assert.ok(rec.n >= 1);
  for (let i = 0; i < rec.n; i++) {
    const file = new URL(`sfx/${rec.g}/${id}_${i}.webm`, root);
    assert.ok(existsSync(file), `${id}_${i}.webm exists`);
    bytes += statSync(file).size;
    assert.ok(rec.d[i] > 0.05 && rec.d[i] < 31, `${id}_${i} duration ${rec.d[i]}`);
  }
  if (rec.l) {
    assert.ok(rec.l[0] > 0 && rec.l[1] > rec.l[0], `${id}: loop points ordered`);
    assert.ok(rec.l[1] <= rec.d[0] + 1e-3, `${id}: loop end inside the file`);
  }
  assert.ok(rec.r === 24000 || rec.r === 48000, `${id}: decode rate`);
}
assert.ok(bytes < 20 * 1024 * 1024, `sound-effect payload ${(bytes / 1048576).toFixed(1)} MB within 20 MB`);

// ---- every asset the engine and its rigs ask for exists.
const engine = readFileSync(new URL('./audioEngine.ts', import.meta.url), 'utf8');
const rig = readFileSync(new URL('./vehicleRig.ts', import.meta.url), 'utf8');
const radio = readFileSync(new URL('./crewRadio.ts', import.meta.url), 'utf8');
const literal = /(?:\bplay|library\.has|library\.pick)\('([a-z0-9_]+)'/g;
const referenced = new Set();
for (const source of [engine, rig, radio]) for (const m of source.matchAll(literal)) referenced.add(m[1]);
for (const block of engine.matchAll(/const (?:CORE_BATTLE|PLAYER_HULL|UI_SET|MODE_SET|RADIO_SET) = \[([\s\S]*?)\];/g)) {
  for (const m of block[1].matchAll(/'([a-z0-9_]+)'/g)) referenced.add(m[1]);
}
for (const block of engine.matchAll(/const WEAPON_(?:CLOSE|FAR)[^=]*= Object\.freeze\(\{([\s\S]*?)\}\);/g)) {
  for (const m of block[1].matchAll(/: '([a-z0-9_]+)'/g)) referenced.add(m[1]);
}
for (const m of rig.matchAll(/'((?:track|water|engine|turret|elevation|interior|fire|gear|electric|turbo)_[a-z0-9_]+_loop)'/g)) referenced.add(m[1]);
for (const id of ['blast_punch_light', 'blast_punch_medium', 'blast_punch_heavy', 'blast_sub', 'hull_thud_sub', 'gear_whine_loop',
  'electric_drive_loop', 'turbo_whistle_loop', 'alarm_fire_loop', 'alarm_ammo', 'heartbeat_loop', 'loading_bed_loop',
  'radio_key_in', 'radio_key_out', 'radio_static_loop']) assert.ok(referenced.has(id), `the scan sees ${id}`);
for (const id of referenced) assert.ok(SFX_ASSETS[id], `engine references a shipped asset: ${id}`);
// Every sound is a recording (2026-10-03): no oscillator, synthesized fallback or rendered buffer anywhere in the
// sound engine or the interface, so a missing asset is silent rather than replaced by a tone.
{
  const { readdirSync } = await import('node:fs');
  const sources = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.ts')).map((f) => `src/audio/${f}`).concat(['src/ui/hud.ts']);
  for (const file of sources) {
    const text = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.ok(!/createOscillator\s*\(/.test(text), `${file} synthesizes no tone`);
  }
  assert.ok(!SFX_ASSETS.muzzle_blast, 'no rendered muzzle blast id');
}
assert.ok(referenced.size > 120, `engine reference scan found ${referenced.size} assets`);
for (const tail of ['open', 'forest', 'urban', 'mountain']) assert.ok(SFX_ASSETS[`tail_${tail}`], `tail_${tail}`);
for (const kind of ['interior_medium', 'interior_large', 'interior_heavy']) assert.ok(SFX_ASSETS[`gun_${kind}`]);

// ---- every powertrain has its full bank, every hull its running gear.
for (const family of ENGINE_FAMILY_IDS) {
  for (const band of ['idle', 'low', 'mid', 'high', 'start', 'stop']) assert.ok(SFX_ASSETS[`engine_${family}_${band}`], `engine_${family}_${band}`);
  for (const band of ['idle', 'low', 'mid', 'high']) assert.ok(SFX_ASSETS[`engine_${family}_${band}`].l, `engine_${family}_${band} loops`);
}
for (const cls of ['light', 'heavy']) for (const surface of ['earth', 'hard', 'sand', 'snow', 'mud']) for (const speed of ['slow', 'fast']) {
  const id = `tracks_${cls}_${surface}_${speed}`;
  assert.ok(SFX_ASSETS[id]?.l, `${id} loops`);
}

// ---- every battlefield has a complete scene.
for (const mapId of MAP_IDS) {
  const scene = MAP_SCENES[mapId];
  assert.ok(scene, `${mapId} has an environment scene`);
  assert.ok(SFX_ASSETS[scene.bed]?.l, `${mapId}: bed ${scene.bed} loops`);
  if (scene.layer) assert.ok(SFX_ASSETS[scene.layer.asset]?.l, `${mapId}: layer ${scene.layer.asset}`);
  for (const [spot] of scene.spots) assert.ok(SFX_ASSETS[spot], `${mapId}: spot ${spot}`);
}
assert.ok(SFX_ASSETS[GARAGE_SCENE.bed]?.l);
for (const [spot] of GARAGE_SCENE.spots) assert.ok(SFX_ASSETS[spot], `garage spot ${spot}`);

// ---- crew radio: script, catalog and the thirteen national packs agree.
const script = JSON.parse(readFileSync(new URL('../../tools/audio/crew-lines.json', import.meta.url), 'utf8'));
const scriptIds = new Set(script.lines.map((line) => line.id));
for (const id of Object.keys(VOICE_LINES)) assert.ok(scriptIds.has(id), `catalog line ${id} is scripted`);
for (const id of scriptIds) assert.ok(VOICE_LINES[id], `scripted line ${id} has radio discipline`);
assert.deepEqual([...script.languages].sort(), [...CREW_LANGUAGES].sort(), 'script languages = crew languages');
for (const lang of CREW_LANGUAGES) {
  const pack = VOICE_PACKS[lang];
  assert.ok(pack, `${lang} voice pack`);
  let langBytes = 0;
  for (const line of script.lines) {
    const takes = pack[line.id];
    assert.ok(takes && takes.length === line[lang].length, `${lang}/${line.id}: ${takes?.length} of ${line[lang].length} takes shipped`);
    takes.forEach((dur, i) => {
      const file = new URL(`voice/${lang}/${line.id}_${i}.webm`, root);
      assert.ok(existsSync(file), `${lang}/${line.id}_${i}.webm`);
      langBytes += statSync(file).size;
      assert.ok(dur > 0.15 && dur < 6, `${lang}/${line.id}_${i} duration ${dur}`);
    });
  }
  assert.ok(langBytes < 2.5 * 1024 * 1024, `${lang} pack ${(langBytes / 1048576).toFixed(2)} MB`);
}

console.log(`soundAssets.selftest: ${Object.keys(SFX_ASSETS).length} assets (${(bytes / 1048576).toFixed(1)} MB), ${referenced.size} engine references, ${MAP_IDS.length} scenes, ${CREW_LANGUAGES.length} crew packs × ${scriptIds.size} lines passed`);
