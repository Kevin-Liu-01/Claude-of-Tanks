// How a browser tool opens the multiplayer rooms panel the way a player can (268). tools/mp-p2p-e2e.mjs pressed
// .cot-multiplayer-entry. The Garage's persistent panels hide that button (src/ui/showroom.css, since 9f448c5ef2), so at
// the tool's 1024x640 the 267 production smoke went red before it tested anything. The way in now comes from the page and
// the surface registry, not a selector per viewport: the page names its layout (body[data-cot-panels]: persistent is the
// registry's 'docked', overlay its 'folded'), and the rooms row of src/ui/transientSurfaceRegistry.ts gives that
// layout's recipe, the same one the surface census (tools/surface-pairs.mjs) opens it by. When the Garage changes its way
// in, the registry row changes with it (its census fails otherwise), and this follows. First-party tooling: Kevin B. Liu.
import { TRANSIENT_SURFACES } from '../src/ui/transientSurfaceRegistry.ts';

const LAYOUT_RECIPES = Object.freeze({ persistent: 'docked', overlay: 'folded' });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** The page's own control for `selector`: the first one shown (its box, and not hidden by visibility). */
const shownControl = (page, selector) => page.evaluateHandle((sel) => [...document.querySelectorAll(sel)]
  .find((node) => node.getClientRects().length && node.checkVisibility({ visibilityProperty: true })) ?? null, selector);

/**
 * Press `selector` as a player can: the first control of it the page shows (waited for up to `timeoutMs`), in view, and
 * not covered at its centre. `touch` taps, and a touch target must be at least 44 px (43.5 with rounding); otherwise the
 * mouse presses its centre.
 */
export async function pressControl(page, selector, { touch = false, timeoutMs = 30_000 } = {}) {
  const until = Date.now() + timeoutMs;
  let control = await shownControl(page, selector);
  while (!(await control.evaluate((node) => !!node)) && Date.now() < until) { await control.dispose(); await sleep(150); control = await shownControl(page, selector); }
  const element = control.asElement();
  if (!element) throw new Error(`no ${selector} is shown (${timeoutMs} ms)`);
  await element.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const box = await element.boundingBox();
  if (!box) throw new Error(`${selector} has no box`);
  if (touch && (box.width < 43.5 || box.height < 43.5)) throw new Error(`Mobile control too small: ${selector} ${JSON.stringify(box)}`);
  const reachable = await element.evaluate((node) => {
    const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!hit && (hit === node || node.contains(hit));
  });
  if (!reachable) throw new Error(`${touch ? 'Mobile control' : 'Control'} blocked: ${selector}`);
  if (touch) await element.tap();
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await element.dispose();
}

/** The registry's way into the rooms panel in the page's current layout: { layout, recipe }. */
export async function roomsRecipe(page) {
  const panels = await page.evaluate(() => document.body.dataset.cotPanels ?? null);
  const layout = LAYOUT_RECIPES[panels];
  if (!layout) throw new Error(`the Garage names no panel layout this tool knows (body[data-cot-panels]=${panels})`);
  const recipe = TRANSIENT_SURFACES.rooms.open[layout];
  if (!recipe?.length) throw new Error(`the surface registry has no way into the rooms panel in the ${layout} layout (src/ui/transientSurfaceRegistry.ts)`);
  return { layout, recipe };
}

/**
 * Open the rooms panel by the registry's recipe for the page's layout: each step pressed in turn (pressControl); a step
 * written `?sel` only when the page shows it. Resolves { layout, recipe, pressed }.
 */
export async function openRooms(page, { touch = false } = {}) {
  const { layout, recipe } = await roomsRecipe(page);
  const pressed = [];
  for (const step of recipe) {
    const optional = step.startsWith('?'), selector = step.replace(/^\?/, '');
    if (optional) {
      const shown = await shownControl(page, selector);
      const there = await shown.evaluate((node) => !!node);
      await shown.dispose();
      if (!there) continue;
    }
    await pressControl(page, selector, { touch });
    pressed.push(selector);
  }
  return { layout, recipe, pressed };
}
