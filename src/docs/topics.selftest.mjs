import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCS_ICON_SPECS } from './docsIcons.ts';
import { TOPIC_ORDER, topicSectionId, topics } from './topics.ts';
import { CREW_LANGUAGES } from '../audio/vehicleAudioProfiles.ts';
import { WEAPON_CLASSES } from '../audio/weaponAudio.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const expected = [
  'build', 'models', 'simulation', 'vehicles', 'rendering', 'performance',
  'worlds', 'ai', 'multiplayer', 'audio', 'interface', 'studio', 'filming',
];

assert.deepEqual([...TOPIC_ORDER], expected, 'the manual keeps one deliberate public topic order');
assert.deepEqual(Object.keys(topics).sort(), [...expected].sort(), 'every topic is present in navigation');
assert.deepEqual(
  [0, 1, 2, 3, 4, 5].map(topicSectionId),
  ['topic-section-1', 'topic-section-2', 'topic-section-3', 'topic-section-4', 'topic-section-5', 'topic-section-6'],
  'topic anchors stay unique and locale-independent when headings are translated',
);

const landing = readFileSync(join(ROOT, 'site/docs.html'), 'utf8');
const docsCss = readFileSync(join(ROOT, 'src/docs/docs.css'), 'utf8');
const topicsSource = readFileSync(join(ROOT, 'src/docs/topics.ts'), 'utf8');
for (const id of TOPIC_ORDER) {
  const topic = topics[id];
  assert.ok(topic, `${id} has a topic definition`);
  assert.ok(Object.hasOwn(DOCS_ICON_SPECS, topic.icon), `${id} has a typed custom icon`);
  assert.ok(topic.sections.length >= 5, `${id} remains a substantive manual`);
  assert.equal(topic.sectionIcons.length, topic.sections.length, `${id} has an icon for every section`);
  for (const icon of topic.sectionIcons) {
    assert.ok(Object.hasOwn(DOCS_ICON_SPECS, icon), `${id} section icon ${icon} is registered`);
  }
  assert.equal(topic.media.length, 2, `${id} has two current visual evidence anchors`);
  const [firstFigureAt, secondFigureAt] = topic.mediaAt ?? [1, 3];
  assert.ok(firstFigureAt < secondFigureAt && secondFigureAt < topic.sections.length, `${id} places both figures after its own sections`);
  for (const asset of [topic.hero, ...topic.media.map(([src]) => src)]) {
    assert.ok(existsSync(join(ROOT, 'public', asset)), `${id}: referenced media exists (${asset})`);
  }
  assert.ok(existsSync(join(ROOT, `site/docs-${id}.html`)), `${id} has an independently indexed HTML entry`);
  assert.match(landing, new RegExp(`href="/docs/${id}"`), `${id} is discoverable from the manual index`);
}

assert.match(docsCss, /\.topic-nav \.shell\{display:grid;grid-template-columns:minmax\(120px,\.72fr\) repeat\(7,minmax\(0,1fr\)\)/, 'wide manuals expose every topic in a balanced two-row grid');
assert.match(docsCss, /\n\.topic-nav a:last-child\{grid-column:span 2\}\n/, 'the thirteenth topic closes the second row across its last two cells');
assert.equal(TOPIC_ORDER.length, 13, 'thirteen topics fill the two-row grid: seven, then five and one spanning two');
assert.match(docsCss, /\.topic-nav \.shell\{display:flex;gap:1px;overflow-x:auto;[^}]*scrollbar-width:thin\}/, 'narrow manuals keep an explicit scrollable topic strip');
assert.match(topicsSource, /navStrip\.scrollLeft = Math\.max\(0, activeTopic\.offsetLeft/, 'narrow manuals reveal their active topic without moving the page');
assert.doesNotMatch(topicsSource, /replace\(\/\[\^a-z0-9\]/, 'translated headings must not determine section anchors');

const buildText = [topics.build.lede, ...topics.build.sections.flat()].join(' ');
assert.match(buildText, /Claude Code and Codex/);
assert.match(buildText, /Git worktrees/);
assert.match(buildText, /origin\/main/);
assert.match(buildText, /AGENTS\.md/);

const modelText = [topics.models.lede, ...topics.models.sections.flat()].join(' ');
assert.match(modelText, /Kevin B\. Liu authored every playable tank|first-party procedural runtime geometry/);
assert.match(modelText, /Generate icons and technical cards/);
assert.match(modelText, /tank:anatomy:update/);
assert.match(modelText, /tank:release:check/);

// The audio manual is player-facing copy over docs/AUDIO.md; its counts follow the engine.
const audioText = [topics.audio.lede, ...topics.audio.sections.flat()].join(' ');
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const reportClasses = NUMBER_WORDS[Object.keys(WEAPON_CLASSES).length];
assert.ok(reportClasses, 'the weapon report-class count must be expressible in the manual');
assert.match(audioText, new RegExp(`\\b${reportClasses} report classes\\b`),
  'the audio manual states the engine weapon report-class count');
const CREW_LANGUAGE_NAMES = {
  'en-US': 'American', 'en-GB': 'British', de: 'German', ru: 'Russian', uk: 'Ukrainian', zh: 'Chinese',
  fr: 'French', sv: 'Swedish', ja: 'Japanese', ko: 'Korean', it: 'Italian', pl: 'Polish', he: 'Hebrew',
};
const crewRadioText = topics.audio.sections.find(([title]) => title === 'Crew radio')?.join(' ') ?? '';
for (const language of CREW_LANGUAGES) {
  const name = CREW_LANGUAGE_NAMES[language];
  assert.ok(name, `crew language ${language} needs a name in the audio manual`);
  assert.match(crewRadioText, new RegExp(`\\b${name}\\b`), `the audio manual names the ${name} crews`);
}
assert.match(audioText, /ElevenLabs/);
assert.match(audioText, /nothing is generated while you play/);
assert.match(audioText, /No interface sound tells you a shot hit/);
assert.match(audioText, /Short\. Adjusting\./);
assert.match(audioText, /National crews/);
assert.match(audioText, /13 existing national crews for every tank/);
assert.match(audioText, /saved across battles and reloads/);
assert.doesNotMatch(audioText, /selftest|node (?:src|tools)\//, 'the audio manual is written for players, not as a test checklist');

console.log(`topics.selftest: ${TOPIC_ORDER.length} indexed manuals with complete icon, workflow, and audio coverage passed`);
