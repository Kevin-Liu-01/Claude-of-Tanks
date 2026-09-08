#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(ROOT, 'gt.config.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const workflow = readFileSync(join(ROOT, '.github/workflows/localization.yml'), 'utf8');

assert.equal(config.projectId, 'prj_pcdp8m3iftnnkr59wwep6e7k', 'GT project binding drifted');
assert.equal(config.defaultLocale, 'en-US');
assert.deepEqual(config.locales, ['zh-CN']);
assert.equal(config.requiresReview, true, 'GT output must retain the human review gate');
assert.equal(config.options?.saveLocal, true, 'reviewed local catalog edits must sync back to GT');
assert.deepEqual(config.files?.json?.include, ['src/ui/i18nCatalog.[locale].json']);
const keyedMetadata = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.en-US.metadata.json'), 'utf8'));
assert.match(keyedMetadata['metadata.room.description.hostLan']?.context || '', /Preserve \{host\} and \{room\}/,
  'GT keyed metadata must protect private user values');
assert.equal('apiKey' in config, false, 'GT credentials must remain environment-only');
assert.doesNotMatch(JSON.stringify(config), /gtx-api-|GT_API_KEY/i, 'GT secrets must never enter config');
assert.match(pkg.devDependencies?.gt || '', /^\^?2\./, 'the official GT CLI must remain installed');
assert.match(pkg.scripts?.['i18n:translate'] || '', /^gt translate .*--save-local$/);
assert.match(pkg.scripts?.['i18n:validate'] || '', /gt translate .*--dry-run/,
  'base JSON projects must use the supported offline dry-run parser gate');
assert.doesNotMatch(pkg.scripts?.['i18n:validate'] || '', /\bgt validate\b/,
  '`gt validate` is not registered for base non-framework projects');
for (const script of ['prebuild', 'prebuild:private', 'prebuild:public']) {
  assert.equal(pkg.scripts?.[script], 'npm run i18n:validate', `${script} must fail closed on GT/catalog drift`);
}
assert.match(workflow, /npm run i18n:check/, 'pull requests must run the GT-backed localization gate');

console.log('gt-enforcement.selftest: config, secrets boundary, builds, and CI gate verified');
