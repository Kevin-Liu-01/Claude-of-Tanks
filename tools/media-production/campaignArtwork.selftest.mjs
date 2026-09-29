import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { setupFonts, posterTextLayout } from './campaignArtwork.mjs';
setupFonts(process.cwd());
const ctx = createCanvas(1, 1).getContext('2d');
for (const [width, height] of [[3840, 2160], [1080, 1920], [1920, 1920]]) {
  for (const title of ['Steel pursuit', 'Desert crossfire', 'Coastal reconnaissance']) {
    const layout = posterTextLayout(ctx, width, height, { cta: 'Play free in your browser' }, { title });
    assert.equal(layout.lines.length, 4);
    for (const [index, line] of layout.lines.entries()) {
      assert.ok(line.top > 0 && line.bottom < height, 'text stays inside image');
      assert.ok(line.left >= width * .05 && line.right <= width * .95, 'glyph bounds fit safe horizontal margins');
      if (index) assert.ok(line.top - layout.lines[index - 1].bottom >= height * .017, `${width}×${height}: ${title} has distinct measured text rows`);
    }
    assert.ok(layout.rule.y + layout.rule.height < layout.lines[0].top, 'accent rule cannot strike through scene name');
  }
}
console.log('campaignArtwork.selftest: all9 title/format combinations have non-overlapping measured glyph bounds and safe margins');
