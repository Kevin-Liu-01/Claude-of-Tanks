#!/usr/bin/env node
// i18nFormat.selftest.mjs — ICU and Intl formatting, the pseudo-locale and the catalog-shape check (BUI-F8).
//
//   - catalogText formats the ICU subset through Intl: plural categories per locale, exact (=N) branches, `#` as a
//     locale number, select, and calendar dates in UTC; plain `{name}` placeholders behave exactly as before;
//   - the pseudo-locale lengthens copy by at least 40 % and leaves every placeholder, ICU head, tag and entity
//     byte-equal, and every catalog message stays parseable once converted;
//   - the catalog-shape check fires on each failure it names (mutation cases) and passes on the repository.
import assert from 'node:assert/strict';
import { catalogText } from './i18nCatalog.ts';
import { registerLocaleDictionary } from './i18nDictionaries.ts';
import { PSEUDO_EXPANSION, pseudoDictionary, pseudoMessage } from './i18nPseudo.ts';
import {
  catalogFailures, messageArguments, parseMessage, repositoryShapeFailures, sourceDuplicationFailures, staticHostFailures,
} from '../../tools/i18n-catalog-shape.mjs';
import enUS from './i18nCatalog.en-US.json' with { type: 'json' };
import zhCN from './i18nCatalog.zh-CN.json' with { type: 'json' };

// --- ICU through Intl -------------------------------------------------------------------------------------------------
const probe = {
  'probe.plural': '{count, plural, =0 {No kills} one {# kill} other {# kills}}',
  'probe.select': '{side, select, alpha {Alpha holds} bravo {Bravo holds} other {Contested}}',
  'probe.nested': '{count, plural, one {{side, select, alpha {# Alpha tank} other {# tank}}} other {# tanks}}',
  'probe.date': 'Updated {when, date, long}',
  'probe.plain': 'Start {label} battle {missing}',
  'probe.tokens': '{{COT_BATTLEFIELDS}} maps, {count} live',
  'probe.prose': 'Use { and } freely; # is a hash',
};
registerLocaleDictionary('en-US', { ...enUS, ...probe });
registerLocaleDictionary('zh-CN', {
  ...zhCN,
  'probe.plural': '{count, plural, =0 {尚无击杀} other {# 次击杀}}',
  'probe.date': '更新于 {when, date, long}',
});
const en = (key, vars) => catalogText('en-US', key, vars);
const zh = (key, vars) => catalogText('zh-CN', key, vars);

assert.equal(en('probe.plural', { count: 0 }), 'No kills', 'an exact branch wins');
assert.equal(en('probe.plural', { count: 1 }), '1 kill', 'English "one"');
assert.equal(en('probe.plural', { count: 2 }), '2 kills');
assert.equal(en('probe.plural', { count: 12500 }), '12,500 kills', '# is a locale number');
assert.equal(zh('probe.plural', { count: 1 }), '1 次击杀', 'Chinese has only "other"');
assert.equal(zh('probe.plural', { count: 0 }), '尚无击杀');
assert.equal(en('probe.select', { side: 'bravo' }), 'Bravo holds');
assert.equal(en('probe.select', { side: 'gamma' }), 'Contested', 'select falls back to other');
assert.equal(en('probe.nested', { count: 1, side: 'alpha' }), '1 Alpha tank', '# reaches a select nested in a plural');
assert.equal(en('probe.nested', { count: 3, side: 'alpha' }), '3 tanks');
assert.equal(en('probe.date', { when: '2026-09-30' }), 'Updated September 30, 2026', 'ISO dates format in UTC');
assert.equal(zh('probe.date', { when: '2026-09-30' }), '更新于 2026年9月30日', 'the "30 SEPTEMBER 2026" bug is gone');
assert.equal(en('probe.date', { when: String(Date.UTC(2026, 8, 30)) }), 'Updated September 30, 2026', 'epoch strings too');
assert.equal(en('probe.date', { when: 'not a date' }), 'Updated {when, date, long}', 'an unreadable date stays as written');
assert.equal(en('probe.plain', { label: 'Zone Control' }), 'Start Zone Control battle {missing}', 'plain placeholders as before');
assert.equal(en('probe.plain'), 'Start {label} battle {missing}', 'no vars: the message as written');
assert.equal(en('probe.tokens', { count: 3 }), '{{COT_BATTLEFIELDS}} maps, 3 live', 'product-stat tokens pass through');
assert.equal(en('probe.prose', { count: 3 }), 'Use { and } freely; # is a hash', 'prose braces and hashes pass through');
assert.equal(en('probe.plural', { count: null }), probe['probe.plural'], 'a null value leaves the message as written');

// The migrated catalog plurals.
assert.equal(en('endScreen.kills', { count: 1 }), '1 kill');
assert.equal(en('endScreen.kills', { count: 4 }), '4 kills');
assert.equal(en('endScreen.deaths', { count: 1 }), '1 death');
assert.equal(zh('endScreen.deaths', { count: 2 }), '阵亡 2 次');
assert.equal(en('docs.evidence.fleetValue', { count: '220' }), 'vehicles', 'the docs unit word no longer repeats the count');

// --- pseudo-locale -----------------------------------------------------------------------------------------------------
const plainLength = (text) => text.replace(/\{[^{}]*\}|<[^>]*>|&[#\w]+;/g, '').trim().length;
for (const source of ['Deploy', 'Battle results', 'Track R damaged · 6 s', 'Settings']) {
  const pseudo = pseudoMessage(source);
  assert.ok(plainLength(pseudo) >= Math.ceil(source.length * PSEUDO_EXPANSION) - 1,
    `"${source}" -> "${pseudo}" is at least ${PSEUDO_EXPANSION}x`);
  assert.notEqual(pseudo, source);
  assert.ok([...pseudo].every((ch) => ch.codePointAt(0) <= 0xff || ch === '·' || '→—–…×'.includes(ch)),
    `"${pseudo}" stays inside Latin-1 (the brand faces' subsets)`);
}
assert.equal(pseudoMessage('—'), '—', 'no Latin letters, nothing to expand');
assert.match(pseudoMessage('Start {label} battle'), /\{label\}/, 'placeholders stay byte-equal');
assert.match(pseudoMessage('Battle begins in <b>{n}</b>'), /<b>\{n\}<\/b>/, 'tags stay byte-equal');
assert.match(pseudoMessage('Maps &amp; modes'), /&amp;/, 'entities stay byte-equal');
assert.match(pseudoMessage('{{COT_BATTLEFIELDS}} maps'), /^\{\{COT_BATTLEFIELDS\}\}/, 'product-stat tokens stay byte-equal');
const icuPseudo = pseudoMessage(probe['probe.plural']);
assert.match(icuPseudo, /^\{count, plural, =0 \{/, 'the ICU head stays');
assert.deepEqual(parseMessage(icuPseudo).errors, [], 'the converted plural still parses');
registerLocaleDictionary('en-US', { 'probe.plural': icuPseudo });
assert.match(catalogText('en-US', 'probe.plural', { count: 2 }), /^2 /, 'and still formats through Intl');
const pseudoCatalog = pseudoDictionary(enUS);
assert.deepEqual(Object.keys(pseudoCatalog), Object.keys(enUS), 'the pseudo catalog has the same keys');
for (const [key, value] of Object.entries(pseudoCatalog)) {
  assert.deepEqual(parseMessage(value).errors, [], `${key}: parses after conversion`);
  assert.deepEqual([...messageArguments(value)].sort(), [...messageArguments(enUS[key])].sort(), `${key}: same arguments`);
}

// --- catalog-shape check: each rule fires ------------------------------------------------------------------------------
const fail = (enTable, zhTable) => catalogFailures(enTable, zhTable);
assert.match(fail({ a: '{n, plural, one {# x}}' }, { a: '{n, plural, other {#}}' }).join('\n'), /no "other" branch/);
assert.match(fail({ a: '{n, rhyme}' }, { a: '{n, rhyme}' }).join('\n'), /unknown argument type/);
assert.match(fail({ a: '{n} {n} vehicles' }, { a: '{n} 辆' }).join('\n'), /prints \{n\} twice in a row/, 'the "220 220" shape');
assert.match(fail({ a: 'Hit {name}' }, { a: '命中' }).join('\n'), /drops the argument \{name\}/);
assert.match(fail({ a: 'Hit' }, { a: '命中 {name}' }).join('\n'), /invents the argument \{name\}/);
assert.match(fail({ 'x.killsOne': '1 kill', 'x.killsMany': '{n} kills' }, { 'x.killsOne': '1', 'x.killsMany': '{n}' }).join('\n'),
  /ad-hoc plural pair/);
assert.match(fail({ 'x.one': 'family', 'x.other': 'families' }, { 'x.one': '类', 'x.other': '类' }).join('\n'), /ad-hoc plural pair/);
assert.deepEqual(fail({ a: '{n, plural, one {# kill} other {# kills}}' }, { a: '{n, plural, other {# 次}}' }), []);
const render = (key, vars) => catalogText('en-US', key, vars);
registerLocaleDictionary('en-US', { 'probe.dup': '{count} vehicles', 'probe.unit': '{count, plural, one {vehicle} other {vehicles}}' });
const dupPage = `<dd>220 <span data-i18n="probe.dup" data-i18n-vars='{"count":"220"}'>vehicles</span></dd>`;
const dup = staticHostFailures('page.html', dupPage, render, (text) => text).join('\n');
assert.match(dup, /falls back to "vehicles" but renders "220 vehicles"/, 'the docs facts-strip bug fails');
assert.match(dup, /prints "220" beside the host and again inside it/);
assert.deepEqual(staticHostFailures('page.html',
  `<dd>220 <span data-i18n="probe.unit" data-i18n-vars='{"count":"220"}'>vehicles</span></dd>`, render, (text) => text), [],
  'the fixed shape (unit word chosen by an ICU plural) passes');
assert.match(sourceDuplicationFailures('x.ts', 'el.textContent = `${n} ${t(\'probe.dup\', { count: n })}`;').join('\n'),
  /prints \$\{n\} beside probe.dup/);
registerLocaleDictionary('en-US', enUS);
registerLocaleDictionary('zh-CN', zhCN);

const repository = await repositoryShapeFailures();
assert.deepEqual(repository, [], `the repository is shaped for ICU and Intl:\n  ${repository.join('\n  ')}`);

console.log('i18nFormat.selftest: ICU plural/select/date through Intl, pseudo-locale (+40 %, structure byte-equal), catalog-shape rules fire and the repository passes');
