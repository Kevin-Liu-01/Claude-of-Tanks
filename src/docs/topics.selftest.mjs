import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCS_ICON_SPECS } from './docsIcons.ts';
import { TOPIC_ORDER, topics } from './topics.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const expected = [
  'build', 'models', 'simulation', 'vehicles', 'rendering', 'performance',
  'worlds', 'ai', 'multiplayer', 'audio', 'interface', 'studio',
];

assert.deepEqual([...TOPIC_ORDER], expected, 'the manual keeps one deliberate public topic order');
assert.deepEqual(Object.keys(topics).sort(), [...expected].sort(), 'every topic is present in navigation');

const landing = readFileSync(join(ROOT, 'docs.html'), 'utf8');
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
  assert.ok(existsSync(join(ROOT, `docs-${id}.html`)), `${id} has an independently indexed HTML entry`);
  assert.match(landing, new RegExp(`href="/docs/${id}"`), `${id} is discoverable from the manual index`);
}

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

console.log('topics.selftest: 12 indexed manuals with complete icon and workflow coverage passed');
