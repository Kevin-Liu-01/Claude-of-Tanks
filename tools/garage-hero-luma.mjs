// tools/garage-hero-luma.mjs — the hero's brightness as the Garage shows it (garage-env-276): the median display luma
// (0-255, Rec. 709) of the inner 60 % of the hull's box on screen, in photo mode (P: every panel away), at the default
// pose. The rubric's hero floor reads it (src/ui/garageQualityRubric.ts GARAGE_HERO_LUMA_FLOOR), so later lighting work
// cannot sink a hero into the dark unnoticed. The page must be the Garage with the showroom up; it leaves photo mode as
// it found it.
/** @param {import('puppeteer').Page} page @returns {Promise<{ median: number, p95: number, box: number[] }>} */
export async function measureGarageHeroLuma(page) {
  await page.evaluate(() => window.__DEBUG.showroom.reset());
  const wasOn = await page.evaluate(() => document.body.classList.contains('cot-photo-on'));
  if (!wasOn) {
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => document.body.classList.contains('cot-photo-on'), { timeout: 15_000 });
  }
  await new Promise((resolve) => setTimeout(resolve, 1200));
  try {
    const box = await page.evaluate(() => {
      const state = window.__DEBUG.showroom.debugState(), camera = window.__DEBUG.camera, V = camera.position.constructor;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y, z] of state.corners ?? []) {
        const p = new V(x, y, z).project(camera);
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      return [x0, x1, y0, y1];
    });
    if (!box.every(Number.isFinite)) throw new Error('garage-hero-luma: the showroom has no hero box');
    const shot = await page.screenshot({ encoding: 'base64', type: 'png' });
    return await page.evaluate(async (data, [x0, x1, y0, y1]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const px = (nx) => (nx + 1) / 2 * img.width, py = (ny) => (1 - ny) / 2 * img.height;
      const left = px(x0), right = px(x1), top = py(y1), bottom = py(y0);
      const inX = (right - left) * 0.2, inY = (bottom - top) * 0.2;
      const cx0 = Math.max(0, Math.round(left + inX)), cx1 = Math.min(img.width, Math.round(right - inX));
      const cy0 = Math.max(0, Math.round(top + inY)), cy1 = Math.min(img.height, Math.round(bottom - inY));
      const d = g.getImageData(cx0, cy0, Math.max(1, cx1 - cx0), Math.max(1, cy1 - cy0)).data;
      const lumas = new Float32Array(d.length / 4);
      for (let i = 0; i < lumas.length; i += 1) lumas[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
      lumas.sort();
      return { median: +lumas[lumas.length >> 1].toFixed(1), p95: +lumas[Math.floor(lumas.length * 0.95)].toFixed(1),
        box: [cx0, cy0, cx1, cy1] };
    }, shot, box);
  } finally {
    if (!wasOn) {
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.body.classList.contains('cot-photo-on'), { timeout: 15_000 });
    }
  }
}
