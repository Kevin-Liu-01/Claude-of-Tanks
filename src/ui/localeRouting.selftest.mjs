import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localizeHtmlDocument } from '../presentation/localizedHtml.ts';
import {
  currentLocationHrefForLocale,
  hrefForLocale,
  pathForLocale,
  PUBLIC_ROUTE_RECORDS,
  resolveLocalePath,
  synchronizeLocaleRoute,
} from './localeRouting.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

assert.equal(resolveLocalePath('/cn').pathname, '/');
assert.equal(resolveLocalePath('/cn/').locale, 'zh-CN');
assert.equal(resolveLocalePath('/cn/docs/build/').route?.id, 'docsBuild');
assert.equal(resolveLocalePath('/docs/build').locale, null);
assert.equal(resolveLocalePath('/zh/docs').route, null, 'unsupported locale aliases must 404');
assert.equal(pathForLocale('/cn/gallery', 'en-US'), '/gallery');
assert.equal(pathForLocale('/gallery', 'zh-CN'), '/cn/gallery');
assert.equal(hrefForLocale('/docs/models?view=rig#tracks', 'zh-CN'), '/cn/docs/models?view=rig#tracks');
assert.equal(hrefForLocale('/cn/docs/models', 'zh-CN'), '/cn/docs/models');
assert.equal(hrefForLocale('https://github.com/Kevin-Liu-01/claude-of-tanks', 'zh-CN'),
  'https://github.com/Kevin-Liu-01/claude-of-tanks');
assert.equal(hrefForLocale('/api/github-stars', 'zh-CN'), '/api/github-stars');
assert.equal(hrefForLocale('/media/battle-reels-v3/trailer.mp4', 'zh-CN'),
  '/media/battle-reels-v3/trailer.mp4', 'asset links must not be mistaken for locale routes');
assert.equal(hrefForLocale('/llms.txt', 'zh-CN'), '/llms.txt');
assert.equal(currentLocationHrefForLocale({ pathname: '/studio', search: '?map=steppe', hash: '#camera' }, 'zh-CN'),
  '/cn/studio?map=steppe#camera');

let replacement = '';
assert.equal(synchronizeLocaleRoute('zh-CN', {
  pathname: '/docs', search: '?topic=worlds', hash: '', replace: (href) => { replacement = href; },
}), true);
assert.equal(replacement, '/cn/docs?topic=worlds');
assert.equal(synchronizeLocaleRoute('zh-CN', {
  pathname: '/cn/docs', search: '', hash: '', replace: () => assert.fail('must not redirect'),
}), false);

const routeIds = new Set(PUBLIC_ROUTE_RECORDS.map(({ id }) => id));
assert.equal(routeIds.size, PUBLIC_ROUTE_RECORDS.length, 'public route ids must remain unique');
for (const route of PUBLIC_ROUTE_RECORDS) {
  assert.ok(readFileSync(join(ROOT, route.sourceHtml), 'utf8'), `${route.sourceHtml} must exist`);
  const localized = localizeHtmlDocument(readFileSync(join(ROOT, route.sourceHtml), 'utf8'), route, 'zh-CN');
  assert.match(localized, /<html\b[^>]*lang="zh-CN"/i, `${route.id} needs canonical HTML language`);
  assert.match(localized, new RegExp(`<title>${route.id === 'notFound' ? '未找到路线' : '[^<]+'}`),
    `${route.id} needs localized title metadata`);
  if (route.indexable) {
    assert.match(localized, /hreflang="en-US"/);
    assert.match(localized, /hreflang="zh-CN"/);
    assert.match(localized, /hreflang="x-default"/);
    assert.match(localized, new RegExp(`rel="canonical" href="https://cot\\.kevinliu\\.studio/cn${route.pathname === '/' ? '/' : route.pathname}"`));
  }
}

console.log(`localeRouting.selftest: ${PUBLIC_ROUTE_RECORDS.length} locale-prefixed routes verified`);
