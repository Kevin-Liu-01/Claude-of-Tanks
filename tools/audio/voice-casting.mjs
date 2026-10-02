#!/usr/bin/env node
// tools/audio/voice-casting.mjs — find native crew voices in the ElevenLabs
// Voice Library for every crew language and write a candidate sheet.
//
//   node tools/audio/voice-casting.mjs --search        # list candidates per language
//   node tools/audio/voice-casting.mjs --add           # add the cast in crew-voices.json
//
// Candidates are native male voices with no credit multiplier and no live
// moderation (combat callouts must not be screened). The final cast is the
// hand-reviewed tools/audio/crew-voices.json; --add makes those library voices
// usable by this account (adding a library voice uses no voice slot).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchSharedVoices, addSharedVoice, listVoices } from './elevenlabs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CAST_FILE = join(HERE, 'crew-voices.json');

// Library language code + accent hint per crew language.
const LANGUAGE_QUERY = {
  'en-US': { language: 'en', accent: 'american' },
  'en-GB': { language: 'en', accent: 'british' },
  de: { language: 'de' },
  ru: { language: 'ru' },
  uk: { language: 'uk' },
  zh: { language: 'zh' },
  fr: { language: 'fr' },
  sv: { language: 'sv' },
  ja: { language: 'ja' },
  ko: { language: 'ko' },
  it: { language: 'it' },
  pl: { language: 'pl' },
  he: { language: 'he' },
};

async function search(outFile) {
  const sheet = {};
  for (const [lang, q] of Object.entries(LANGUAGE_QUERY)) {
    const seen = new Map();
    for (const sort of ['usage_character_count_1y', 'cloned_by_count']) {
      const voices = await searchSharedVoices({
        page_size: 60, language: q.language, gender: 'male', sort,
        include_live_moderated: false, include_custom_rates: false,
        ...(q.accent ? { accent: q.accent } : {}),
      });
      for (const v of voices) {
        if (seen.has(v.voice_id)) continue;
        if (v.live_moderation_enabled) continue;
        if (v.rate && v.rate > 1) continue;
        seen.set(v.voice_id, {
          voice_id: v.voice_id,
          public_owner_id: v.public_owner_id,
          name: v.name,
          accent: v.accent,
          age: v.age,
          descriptive: v.descriptive,
          use_case: v.use_case,
          category: v.category,
          language: v.language,
          locale: v.locale,
          usage_1y: v.usage_character_count_1y,
          cloned_by: v.cloned_by_count,
          notice_days: v.notice_period,
          free_users_allowed: v.free_users_allowed,
          verified: (v.verified_languages || []).map((x) => `${x.language}${x.accent ? `/${x.accent}` : ''}`).join(','),
          preview_url: v.preview_url,
          description: (v.description || '').slice(0, 220),
        });
      }
    }
    sheet[lang] = [...seen.values()];
    console.log(`${lang}: ${sheet[lang].length} candidates`);
  }
  writeFileSync(outFile, JSON.stringify(sheet, null, 1));
  console.log(`wrote ${outFile}`);
}

async function add() {
  const cast = JSON.parse(readFileSync(CAST_FILE, 'utf8'));
  const mine = new Set((await listVoices()).map((v) => v.voice_id));
  for (const [lang, roles] of Object.entries(cast.cast)) {
    for (const [role, voice] of Object.entries(roles)) {
      if (!voice.public_owner_id) continue;
      if (voice.account_voice_id && mine.has(voice.account_voice_id)) continue;
      const id = await addSharedVoice(voice.public_owner_id, voice.voice_id, `CoT ${lang} ${role}`);
      voice.account_voice_id = id;
      console.log(`${lang} ${role}: added ${voice.name} -> ${id}`);
    }
  }
  writeFileSync(CAST_FILE, `${JSON.stringify(cast, null, 2)}\n`);
}

const args = process.argv.slice(2);
if (args.includes('--search')) {
  const out = args[args.indexOf('--search') + 1] && !args[args.indexOf('--search') + 1].startsWith('--')
    ? args[args.indexOf('--search') + 1] : join(HERE, '..', '..', '.cache-voice-candidates.json');
  const dir = dirname(out);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await search(out);
} else if (args.includes('--add')) {
  await add();
} else {
  console.log('usage: voice-casting.mjs --search [out.json] | --add');
}
