/** Original deterministic synthesis; no samples, recordings, music or external licenses. */
export function synthesizeSoundtrack(duration, events, sampleRate = 48000) {
  const frames = Math.ceil(duration * sampleRate), samples = new Float32Array(frames);
  let seed = 0x434f54, low = 0;
  const noise = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2147483648 - 1; };
  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate, fade = Math.min(1, t / .6, (duration - t) / 1.2);
    low += .05 * (noise() - low);
    const engine = Math.sin(2 * Math.PI * 43 * t + Math.sin(t * .8) * 1.8) + .32 * Math.sin(2 * Math.PI * 86 * t);
    samples[i] = (engine * .022 + low * .045) * Math.max(0, fade);
  }
  for (const event of events) addReport(samples, sampleRate, event, noise);
  let peak = 0, energy = 0;
  for (let i = 0; i < frames; i++) { samples[i] = Math.tanh(samples[i] * 1.3) * .82; peak = Math.max(peak, Math.abs(samples[i])); energy += samples[i] ** 2; }
  const wav = Buffer.alloc(44 + frames * 4);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 4, 28);
  wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) { const value = Math.round(samples[i] * 32767); wav.writeInt16LE(value, 44 + i * 4); wav.writeInt16LE(value, 46 + i * 4); }
  return { wav, metrics: { sampleRate, channels: 2, frames, peak, rms: Math.sqrt(energy / frames), provenance: 'Original deterministic engine harmonics, filtered noise, impact transients and decaying reports synthesized by campaignAudio.mjs. No external recordings or music.' } };
}
function addReport(samples, sampleRate, event, noise) {
  const start = Math.round(event.at * sampleRate), span = Math.min(2.5, event.end - event.at);
  const impact = /impact|explosion|kill/.test(event.type), mg = event.type === 'mg_burst';
  let low = 0;
  for (let j = 0; j < span * sampleRate && start + j < samples.length; j++) {
    const t = j / sampleRate, n = noise(); low += .15 * (n - low);
    const attack = (1 - Math.exp(-t * 1800)), decay = Math.exp(-t * (mg ? 11 : 3.4));
    const body = Math.sin(2 * Math.PI * (impact ? 42 : 62) * t - t * t * 24);
    const crack = n * Math.exp(-t * 65), tail = low * Math.exp(-t * 2.8);
    const cutFade = Math.min(1, Math.max(0, (span - t) / .08));
    samples[start + j] += (body * .37 * decay + crack * .48 + tail * .40) * attack * cutFade * (mg ? .4 : 1);
  }
}
