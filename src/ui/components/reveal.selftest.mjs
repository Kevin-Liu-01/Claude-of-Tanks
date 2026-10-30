// The kit's reveal (src/ui/components/reveal.ts): a media box is marked for the fade from the first paint, takes
// data-ready once its image decodes or its video can play through, and data-failed (its tone stays) when the file never
// arrives; components.css draws the fade. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class FakeElement {
  constructor() { this.attrs = new Map(); this.listeners = {}; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  hasAttribute(name) { return this.attrs.has(name); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  addEventListener(kind, fn) { (this.listeners[kind] ??= []).push(fn); }
  fire(kind) { for (const fn of this.listeners[kind] ?? []) fn(); }
}
class FakeImage extends FakeElement {
  constructor({ complete = false, naturalWidth = 0, src = 'a.webp', decode = 'resolve' } = {}) {
    super(); this.complete = complete; this.naturalWidth = naturalWidth; this.currentSrc = src; this.decoding = decode;
  }
  decode() { return this.decoding === 'resolve' ? Promise.resolve() : Promise.reject(new Error('EncodingError')); }
}
class FakeVideo extends FakeElement { constructor(readyState = 0) { super(); this.readyState = readyState; } }
globalThis.HTMLVideoElement = FakeVideo;
globalThis.HTMLImageElement = FakeImage;
const { revealWhenReady } = await import('./reveal.ts');
const tick = () => new Promise((done) => setTimeout(done, 0));
const boxFor = (media) => Object.assign(new FakeElement(), { querySelector: () => media });

// an image still on the wire: marked at once, ready once decoded
{
  const img = new FakeImage();
  const box = boxFor(img);
  revealWhenReady(box);
  assert.ok(box.hasAttribute('data-reveal'), 'the box is marked for the fade from its first paint');
  assert.ok(!box.hasAttribute('data-ready'), 'and stays on its tone until the image can be drawn');
  await tick();
  assert.ok(box.hasAttribute('data-ready'), 'a decoded image fades in');
}
// an image already drawn (cached): ready at once, no fade wait
{
  const box = boxFor(new FakeImage({ complete: true, naturalWidth: 640 }));
  revealWhenReady(box);
  assert.ok(box.hasAttribute('data-ready'), 'a cached image is ready at once');
}
// an image that failed to load: the tone stays, nothing broken is shown
{
  const box = boxFor(new FakeImage({ complete: true, naturalWidth: 0 }));
  revealWhenReady(box);
  assert.ok(box.hasAttribute('data-failed') && !box.hasAttribute('data-ready'), 'a broken file leaves the tone');
  const img = new FakeImage({ decode: 'reject' });
  const late = boxFor(img);
  revealWhenReady(late);
  img.fire('error');
  await tick();
  assert.ok(late.hasAttribute('data-failed') && !late.hasAttribute('data-ready'), 'a load error on the wire leaves the tone');
}
// a video: ready once it can play through, failed on an error
{
  const video = new FakeVideo(1);
  const box = boxFor(video);
  revealWhenReady(box);
  assert.ok(!box.hasAttribute('data-ready'));
  video.fire('canplaythrough');
  assert.ok(box.hasAttribute('data-ready'), 'a video fades in once it can play through');
  const broken = new FakeVideo(0);
  const other = boxFor(broken);
  revealWhenReady(other);
  broken.fire('error');
  assert.ok(other.hasAttribute('data-failed'), 'a video that cannot load leaves the poster or tone');
}
// a box re-revealed for a new file starts over
{
  const box = boxFor(new FakeImage({ complete: true, naturalWidth: 10 }));
  revealWhenReady(box);
  revealWhenReady(box, new FakeImage());
  assert.ok(!box.hasAttribute('data-ready'), 'a new file returns the box to its tone until it decodes');
}
const css = await readFile(new URL('./components.css', import.meta.url), 'utf8');
assert.match(css, /\[data-reveal\]>:is\(img,video,picture\)\{opacity:0;transition:opacity var\(--dur-base\) var\(--ease-enter\)\}/,
  'the kit draws the media transparent until ready, fading on the motion tokens (reduced motion collapses them)');
assert.match(css, /\[data-reveal\]\[data-ready\]>:is\(img,video,picture\)\{opacity:1\}/);
assert.match(css, /@media \(scripting:none\)\{\[data-reveal\]>:is\(img,video,picture\)\{opacity:1\}\}/,
  'a box served with data-reveal never hides its pictures from a page without scripting');
assert.ok(css.indexOf('[data-reveal]') > css.indexOf('@layer components{') && css.indexOf('[data-reveal]') < css.lastIndexOf('}'),
  'inside the components layer');
console.log('reveal.selftest: media boxes hold their tone until decoded, fade in, and keep the tone when a file never arrives');
