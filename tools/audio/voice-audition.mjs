#!/usr/bin/env node
// tools/audio/voice-audition.mjs — audition Voice Library candidates for the
// national crews. Every candidate reads one urgent commander call and one
// crisp crew call in its crew language through eleven_v4; each take is then
// measured (pitch, brightness, level, dead air) and round-tripped through
// speech-to-text so a voice that mispronounces or drifts out of the language
// is rejected on evidence, not on its catalogue description.
//
//   ELEVENLABS_API_KEY_FILE=… node tools/audio/voice-audition.mjs [--langs de,ru] [--out report.json]
//
// The reviewed result is the cast in tools/audio/crew-voices.json.

import { writeFileSync, readFileSync } from 'node:fs';
import { speech, transcribe } from './elevenlabs.mjs';
import { s16ToFloat, wavFromS16, medianPitchHz, spectralCentroid, silenceBounds, peakDb, rmsDb } from './pcm.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Test calls: [commander (urgent), crew (crisp)].
const TEST_LINES = {
  'en-US': ['Enemy tank, twelve o\'clock! Fire!', 'Up! Ready to fire!'],
  'en-GB': ['Enemy tank, twelve o\'clock! Fire!', 'Loaded! Ready!'],
  de: ['Feindpanzer, zwölf Uhr! Feuer!', 'Geladen! Feuerbereit!'],
  ru: ['Танк противника, на двенадцать часов! Огонь!', 'Заряжено! Готов к выстрелу!'],
  uk: ['Ворожий танк, на дванадцяту! Вогонь!', 'Заряджено! Готовий до пострілу!'],
  zh: ['发现敌方坦克，正前方！开火！', '装填完毕！准备射击！'],
  fr: ['Char ennemi, à midi ! Feu !', 'Chargé ! Prêt à tirer !'],
  sv: ['Fientlig stridsvagn, klockan tolv! Eld!', 'Laddat! Klar att skjuta!'],
  ja: ['敵戦車、正面！撃て！', '装填完了！射撃用意よし！'],
  ko: ['적 전차, 12시 방향! 발사!', '장전 완료! 사격 준비!'],
  it: ['Carro nemico, ore dodici! Fuoco!', 'Caricato! Pronto al fuoco!'],
  pl: ['Czołg wroga, na godzinie dwunastej! Ognia!', 'Załadowane! Gotowy do strzału!'],
  he: ['טנק אויב, שעה שתים עשרה! אש!', 'טעון! מוכן לירי!'],
};

const LANGUAGE_CODE = { 'en-US': 'en', 'en-GB': 'en', de: 'de', ru: 'ru', uk: 'uk', zh: 'zh', fr: 'fr', sv: 'sv', ja: 'ja', ko: 'ko', it: 'it', pl: 'pl', he: 'he' };

// Candidates per language: [voice_id, name, role-intent].
export const CANDIDATES = {
  'en-US': [['IRHApOXLvnW57QJPQH2P', 'Adam - Dark and Tough', 'commander'], ['EkK5I93UQWFDigLMpZcX', 'James - Husky and Bold', 'commander'], ['ZthjuvLPty3kTMaNKVKb', 'Peter', 'commander'], ['yl2ZDV1MzN4HbQJbMihG', 'Alex - Upbeat', 'crew'], ['s3TPKV1kjDlVtZbl4Ksh', 'Adam - Bright', 'crew'], ['15CVCzDByBinCIoCblXo', 'Lucan Rook', 'crew']],
  'en-GB': [['NYC9WEgkq1u4jiqBseQ9', 'Russell', 'commander'], ['wyWA56cQNU2KqUW4eCsI', 'Clyde', 'commander'], ['7p1Ofvcwsv7UBPoFNcpI', 'Julian', 'commander'], ['B5vjwBxGgp4GLTiUjDxM', 'Astro', 'crew'], ['Fahco4VZzobUeiPqni1S', 'Archer', 'crew'], ['2UMI2FME0FFUFMlUoRER', 'Hugh', 'crew']],
  de: [['Ay1WwRHxUsu3hEeAp8JZ', 'Anton', 'commander'], ['eJHgBguIWw9PtA4GHbSP', 'Clemens', 'commander'], ['Fghah4fztZORbiKfIGAs', 'Thomas Schendel', 'commander'], ['aTTiK3YzK3dXETpuDE2h', 'Ben', 'crew'], ['lx8LAX2EUAKftVz0Dk5z', 'Juan', 'crew'], ['fzqS9sNPYJhLlhsfDm0l', 'Mark', 'crew']],
  ru: [['TUQNWEvVPBLzMBSVDPUA', 'Alex Bell', 'commander'], ['rQOBu7YxCDxGiFdTm28w', 'Artem Lebedev', 'commander'], ['txnCCHHGKmYIwrn7HfHQ', 'Alexandr Vlasov', 'commander'], ['hU3rD0Yk7DoiYULTX1pD', 'Dmitry - Energetic', 'crew'], ['3EuKHIEZbSzrHGNmdYsx', 'Nikolay', 'crew'], ['MWyJiWDobXN8FX3CJTdE', 'Oleg', 'crew']],
  uk: [['hWHihsTve3RbzG4PHDBQ', 'Andriy Tkachenko', 'commander'], ['BFmokXObxZMCBXC0A9ny', 'Taras Boyko', 'commander'], ['h9NSQvWZaC4NFusYsxT9', 'Artem Klopotenko', 'commander'], ['B31Kx7rXmNnYqp1QWHR2', 'Volodymyr', 'crew'], ['WAkiH8uTgFArLLKVWgeS', 'Stanislav', 'crew'], ['9Sj8ugvpK1DmcAXyvi3a', 'Alex Nekrasov', 'crew']],
  zh: [['DowyQ68vDpgFYdWVGjc3', 'Jason Chen', 'commander'], ['pU9NaAwkoR3v0Mrg3uKz', 'Haoran', 'commander'], ['WuLq5z7nEcrhppO0ZQJw', 'Martin Li', 'commander'], ['pTOe8BQRdydOEIgv0wFL', 'LiuPing', 'crew'], ['agczkAUlHLowaNnL72Cc', 'Adrian', 'crew'], ['MI36FIkp9wRP7cpWKPTl', 'Evan Zhao', 'crew']],
  fr: [['AmMsHJaCw4BtwV3KoUXF', 'Nicolas Petit', 'commander'], ['Qrl71rx6Yg8RvyPYRGCQ', 'Guillaume', 'commander'], ['TTtB1x9U8PF0Vgf20IAP', 'Adrien', 'commander'], ['hv6gVog5LgtIUX88Nmq8', 'Tristan Grech', 'crew'], ['DbbNuBL7lf62XwY7arQb', 'Hugo', 'crew'], ['AfbuxQ9DVtS4azaxN1W7', 'Léo', 'crew']],
  sv: [['TIMFVcMCO4bdy7J79GWF', 'Andreas', 'commander'], ['x0u3EW21dbrORJzOq1m9', 'Adam Composer', 'commander'], ['CuaAIFbkzX2kaNH5EtHZ', 'Martin', 'commander'], ['1uZ0SLDbZd88cfCPzFQo', 'Mathias', 'crew'], ['9ambBcBMpHAeeFp1uJUB', 'Simon', 'crew'], ['oJEeOXECH9V31Oci9WHK', 'Peter', 'crew']],
  ja: [['sRYzP8TwEiiqAWebdYPJ', 'Hatake Kohei', 'commander'], ['H8ZPDxbrPcks5hEsi2fq', 'Koichi', 'commander'], ['Mv8AjrYZCBkdsmDHNwcB', 'Ishibashi', 'commander'], ['DOL4zlUH4vnnX1hByxsw', 'Akira', 'crew'], ['ss9cJxDAEMXP4wfQ3GPr', 'Daisuke', 'crew'], ['Bj4Malc5SZLoXfPtxRxH', 'Hiro', 'crew']],
  ko: [['4JJwo477JUAx3HV0T7n7', 'Yohan Koo', 'commander'], ['s07IwTCOrCDCaETjUVjx', 'Hyunbin', 'commander'], ['BbsagRO6ohd8MKPS2Ob0', 'Jin Geon Song', 'commander'], ['PDoCXqBQFGsvfO0hNkEs', 'Chris', 'crew'], ['nbrxrAz3eYm9NgojrmFK', 'Min-joon', 'crew'], ['m3gJBS8OofDJfycyA2Ip', 'Taehyung', 'crew']],
  it: [['W71zT1VwIFFx3mMGH2uZ', 'MarcoTrox', 'commander'], ['UlwxMDtxqMDYmG6pk2q6', 'Luca Brasi', 'commander'], ['CITWdMEsnRduEUkNWXQv', 'Thomas', 'commander'], ['fzDFBB4mgvMlL36gPXcz', 'Giovanni Rossi', 'crew'], ['t3hJ92dgZhDVtsff084B', 'Chris Basetta', 'crew'], ['MTgv1KRJpUnc34UMGTHK', 'Matteo', 'crew']],
  pl: [['JxVKcxm9wtnCYEs8V00p', 'Bruno Siak', 'commander'], ['hIssydxXZ1WuDorjx6Ic', 'Adam', 'commander'], ['g8ZOdhoD9R6eYKPTjKbE', 'Tomasz - Deep and Raspy', 'commander'], ['8qCMI2ZZW5ZGwmg0lM1l', 'Paweł Siwek', 'crew'], ['JWUOwsYG4XgR9Od3eeon', 'Tomasz - Loud and Calm', 'crew'], ['EmspiS7CSUabPeqBcrAP', 'Mikołaj', 'crew']],
  he: [['k77ZRVqAFg9Hd0ltAuON', 'Omer', 'commander'], ['uwHajH4FhtzVp6X17pr7', 'Amit', 'commander'], ['yGpVFXFoImvRvaURKypy', 'Tomer', 'commander'], ['JIxTgeeS5w0UQyBxEnrl', 'Itai', 'crew']],
};

function normalize(text) {
  return String(text).toLowerCase().normalize('NFKC').replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** 1 − normalised Levenshtein distance over characters. */
function similarity(a, b) {
  const x = [...normalize(a)];
  const y = [...normalize(b)];
  if (!x.length && !y.length) return 1;
  const prev = new Array(y.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

async function audition(lang, [voiceId, name, intent], tmp) {
  const takes = [];
  const lines = TEST_LINES[lang];
  for (let i = 0; i < lines.length; i++) {
    const tag = i === 0 ? '[shouting, urgent]' : '[crisp, focused]';
    const { file, cost } = await speech({
      voiceId, text: `${tag} ${lines[i]}`, modelId: 'eleven_v4',
      languageCode: LANGUAGE_CODE[lang], stability: 0.45, similarity: 0.8, outputFormat: 'pcm_24000',
    });
    const raw = readFileSync(file);
    const samples = s16ToFloat(raw);
    const wav = join(tmp, `${lang}-${voiceId}-${i}.wav`);
    writeFileSync(wav, wavFromS16(raw, 24000));
    let stt = { text: '', languageCode: null, cost: 0 };
    try { stt = await transcribe({ file: wav, languageCode: null }); } catch (error) { stt.error = String(error.message || error); }
    const bounds = silenceBounds(samples, 24000);
    takes.push({
      line: i, cost, sttCost: stt.cost || 0,
      durS: +(samples.length / 24000).toFixed(2),
      leadS: +bounds.startS.toFixed(2), tailS: +(bounds.durS - bounds.endS).toFixed(2),
      peakDb: +peakDb(samples).toFixed(1), rmsDb: +rmsDb(samples).toFixed(1),
      pitchHz: Math.round(medianPitchHz(samples, 24000) || 0),
      centroidHz: Math.round(spectralCentroid(samples, 24000)),
      sttText: stt.text, sttLang: stt.languageCode,
      sim: +similarity(stt.text, lines[i]).toFixed(2),
      sttError: stt.error,
    });
  }
  return { lang, voiceId, name, intent, takes,
    sim: +(takes.reduce((a, t) => a + t.sim, 0) / takes.length).toFixed(2),
    pitchHz: Math.round(takes.reduce((a, t) => a + t.pitchHz, 0) / takes.length),
    centroidHz: Math.round(takes.reduce((a, t) => a + t.centroidHz, 0) / takes.length),
  };
}

const args = process.argv.slice(2);
const langsArg = args.includes('--langs') ? args[args.indexOf('--langs') + 1].split(',') : Object.keys(CANDIDATES);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'voice-audition.json';
const tmp = mkdtempSync(join(tmpdir(), 'cot-audition-'));
const report = [];
let spent = 0;
await Promise.all(langsArg.flatMap((lang) => CANDIDATES[lang].map(async (candidate) => {
  try {
    const result = await audition(lang, candidate, tmp);
    spent += result.takes.reduce((a, t) => a + t.cost + t.sttCost, 0);
    report.push(result);
    console.log(`${lang.padEnd(5)} ${candidate[2].padEnd(9)} ${result.name.padEnd(24)} sim=${result.sim} f0=${result.pitchHz}Hz centroid=${result.centroidHz}Hz  ${result.takes.map((t) => `[${t.sttLang}] ${t.sttText}`).join(' | ')}`);
  } catch (error) {
    console.log(`${lang} ${candidate[1]}: FAILED ${error.message}`);
  }
})));
writeFileSync(out, JSON.stringify(report, null, 1));
console.log(`credits spent this run: ${spent}; report: ${out}; wavs: ${tmp}`);
