import assert from 'node:assert/strict';

const archiveShot = { src: '/archive.webp', title: 'Archive', alt: 'Archive', map: 'coastal', feature: 'world system' };
const freshShot = { ...archiveShot, src: '/fresh.webp', previewSrc: '/fresh-preview.webp', title: 'Fresh' };
const baseRecipes = { media: { '/archive.webp': 'old' }, recipes: { old: { map: 'coastal' } } };
const production = { shots: [freshShot], media: { '/fresh.webp': 'new' }, recipes: { new: { map: 'reservoir' } } };
const response = (value) => ({ ok: true, status: 200, json: async () => value });
const scenarios = [
  ['unpublished', async () => ({ ok: false, status: 404 }), false],
  ['offline', async () => { throw new Error('network unavailable'); }, false],
  ['html fallback', async () => ({ ok: true, json: async () => { throw new SyntaxError('HTML, not JSON'); } }), false],
  ['published', async () => response(production), true],
];

// Exercise the public mount boundary with a small DOM, including the image
// selected for an archive card, without substituting either manifest loader.
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.dataset = {}; this.classList = { add() {} }; }
  setAttribute() {}
  addEventListener() {}
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = children; }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(selector === child.tagName ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
}

const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
try {
  for (const [name, freshResponse, published] of scenarios) {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      return url.includes('production-r1') ? freshResponse() : response(baseRecipes);
    };
    const module = await import(`./captureRecipes.ts?recipes=${encodeURIComponent(name)}`);
    const catalog = await module.loadCaptureRecipes();
    assert.deepEqual(module.recipeForMedia(catalog, '/archive.webp'), baseRecipes.recipes.old, `${name}: keep old recipes`);
    assert.deepEqual(module.recipeForMedia(catalog, '/fresh.webp'), published ? production.recipes.new : null, `${name}: optional recipes`);
    await module.loadCaptureRecipes();
    assert.equal(calls.length, 2, `${name}: reuse settled requests`);
  }

  for (const [name, freshResponse, published] of scenarios) {
    globalThis.fetch = async (url) => {
      if (url.includes('production-r1')) return freshResponse();
      return response(url.includes('capture-recipes') ? { media: {}, recipes: {} } : { shots: [archiveShot] });
    };
    globalThis.document = { createElement: (tag) => new Element(tag) };
    const { mountMediaArchive } = await import(`./mediaArchive.ts?archive=${encodeURIComponent(name)}`);
    const root = new Element();
    const result = await mountMediaArchive(root, { filters: false });
    assert.deepEqual(result.manifest.shots, published ? [freshShot, archiveShot] : [archiveShot], `${name}: render usable archive`);
    const images = root.querySelectorAll('img');
    assert.deepEqual(images.map((image) => image.src), published ? ['/fresh-preview.webp', '/archive.webp'] : ['/archive.webp']);
  }

  globalThis.fetch = async () => ({ ok: false, status: 503 });
  const recipes = await import('./captureRecipes.ts?required-failure');
  await assert.rejects(recipes.loadCaptureRecipes(), /Capture recipes unavailable \(503\)/);
  const archive = await import('./mediaArchive.ts?required-failure');
  await assert.rejects(archive.mountMediaArchive(new Element()), /Presentation archive unavailable \(503\)/);
} finally {
  globalThis.fetch = originalFetch;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
}
console.log('optionalProduction.selftest: missing/offline/HTML batches preserve archive and recipes; published batch merges; required failures stay visible');
