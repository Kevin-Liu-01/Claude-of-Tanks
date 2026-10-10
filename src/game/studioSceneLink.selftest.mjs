// Scene links: `/studio?scene=<path>` opens a scene JSON on this site, and nothing else (studioSceneLink.ts).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sceneLinkPath } from './studioSceneLink.ts';

for (const ok of ['/media/filming-r1/s05-barn-advance.scene.json', '/scenes/a_b-c.json', '/x.json']) {
  assert.equal(sceneLinkPath(ok), ok, `${ok} opens`);
}
assert.equal(sceneLinkPath('  /media/a.json '), '/media/a.json', 'surrounding space is trimmed');
for (const bad of [null, undefined, '', 'a.json', 'media/a.json', 'https://example.com/a.json', '//example.com/a.json',
  '/media/a.txt', '/media/a.json?x=1', '/media/../secret.json', '/media\\a.json', 'javascript:alert(1)//.json', '/a b.json']) {
  assert.equal(sceneLinkPath(bad), null, `${String(bad)} is refused`);
}

// The Studio's auto-entry reads the link: it enters on the scene's own map and loads the scene, as Load JSON does.
const studio = readFileSync(new URL('./studio.ts', import.meta.url), 'utf8');
assert.match(studio, /import \{ sceneLinkPath \} from '\.\/studioSceneLink\.ts';/);
assert.match(studio, /const scenePath = sceneLinkPath\(urlParam\('scene'\)\);/);
assert.match(studio, /enter\(\{ map: json\.map \|\| map \}\)\.then\(\(\) => load\(json\)\)/);
// Leaving the Studio drops the link from the address, so a refresh in the garage stays in the garage.
assert.match(studio, /sp\.delete\('studio'\);\n\s+if \(!inStudio\) sp\.delete\('scene'\);/);

console.log('studioSceneLink.selftest: same-origin scene paths open, every other link is refused, auto-entry loads the scene');
