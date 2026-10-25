// The Field Manual's Scene Studio chapter: how to open it, set a scene, shoot it and take it away. Copyright © 2026
// Kevin B. Liu.
// Every list is the Studio's own: the times of day and the off-world maps (src/game/studioLight.ts), the sequence and film
// lengths (src/game/studioTimeline.ts), the speed ramp, film sizes and frame rates (src/game/studioFilmPlan.ts; the
// rates are the ones its validator accepts), the staged sequences (src/game/studioProduction.ts), and every name the
// Studio panel shows (studio.* in the catalogs: effects, tank states, rigs, lenses, transitions, blur, shake). The
// site's films come from the fleet's takes (public/media/site50-r14/fleet/index.json), each opening its scene in the
// Studio. The workspace picture shows once the media lane's still is in public/ (re-run the prerender). Node only.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUDIO_SPACE_MAPS, STUDIO_TIMES } from '../../game/studioLight.ts';
import { STUDIO_FILM_MAX_DURATION_MS, STUDIO_MAX_DURATION_MS, STUDIO_MIN_DURATION_MS } from '../../game/studioTimeline.ts';
import { FILM_MAX_SPEED, FILM_RESOLUTIONS, normalizeFilm } from '../../game/studioFilmPlan.ts';
import { PRODUCTION_PRESETS } from '../../game/studioProduction.ts';
import { pictureMarkup } from '../../presentation/responsivePicture.ts';
import { icon, type IconId } from '../../ui/icons/icon.ts';
import { getLocale, t } from '../../ui/i18n.ts';
import { hrefForLocale } from '../../ui/localeRouting.ts';
import type { RichSection } from './types.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const WORKSPACE_STILL = '/media/docs-r1/studio-workspace-1920.webp';
/** The landing's fleet wall leads with these takes (tools/home-premiere.mjs FLEET); the chapter shows the first six. */
const TAKE_IDS = ['t14', 'leo2a7v', 'm1a2_x', 'challenger1', 'strv122', 'type99a', 'type90', 'merkava2d'];

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const p = (key: string, values: Record<string, string> = {}): string => `<p>${esc(t(key, values))}</p>`;
const chips = (labels: readonly string[]): string => `<ul class="dm-chips">${labels.map((label) => `<li>${esc(label)}</li>`).join('')}</ul>`;
const facts = (rows: Array<[string, Record<string, string>]>): string => `<ul class="dm-facts">${rows.map(([key, values]) => `<li>${esc(t(key, values))}</li>`).join('')}</ul>`;
const secs = (ms: number): string => String(Math.round(ms / 1000));
/** Every name the Studio panel has under a catalog prefix (studio.ws.fx.*, studio.ws.state.*, …), in catalog order. */
function studioNames(prefix: string): string[] {
  const catalog = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.en-US.json'), 'utf8')) as Record<string, string>;
  return Object.keys(catalog).filter((key) => key.startsWith(prefix) && /^[a-z_-]+$/.test(key.slice(prefix.length))).map((key) => t(key));
}

interface Take { readonly title: { en: string; zh: string }; readonly short: { en: string; zh: string }; readonly poster: string; readonly scene: string }
function takesStrip(): string {
  const index = JSON.parse(readFileSync(join(ROOT, 'public/media/site50-r14/fleet/index.json'), 'utf8')) as { vehicles: Record<string, Take> };
  const zh = getLocale() === 'zh-CN';
  const takes = TAKE_IDS.map((id) => index.vehicles[id]).filter((take): take is Take => !!take).slice(0, 6);
  if (takes.length < 6) throw new Error('docs: fewer than six lead takes in the fleet index');
  return `<ul class="dm-takes">${takes.map((take) => `<li><a href="${hrefForLocale(`/studio?scene=${take.scene}`, getLocale())}">`
    + `<img src="${take.poster}" width="640" height="360" alt="" loading="lazy" decoding="async">`
    + `<span>${icon('studio', { size: 14 })}<b>${esc(zh ? take.short.zh : take.short.en)}</b></span></a></li>`).join('')}</ul>`;
}

function openSection(): string {
  const ways: Array<[IconId, string, string]> = [
    ['studio', 'docs.studio.way.bar.title', 'docs.studio.way.bar'],
    ['gallery', 'docs.studio.way.openScene', 'docs.studio.way.take'],
    ['copy', 'studio.sceneLink.copyButton', 'docs.studio.way.link'],
  ];
  const workspace = existsSync(join(ROOT, 'public', WORKSPACE_STILL))
    ? `<figure class="dm-figure">${pictureMarkup({ src: WORKSPACE_STILL, width: 1920, height: 1080, alt: t('docs.studio.workspaceAlt'), sizes: '(width < 1100px) 100vw, 60vw',
      rungs: [{ src: WORKSPACE_STILL.replace('-1920.', '-640.'), width: 640 }, { src: WORKSPACE_STILL, width: 1920 }] }, false)}</figure>` : '';
  return p('docs.studio.openLede') + workspace
    + `<ul class="dm-roles dm-roles--ways">${ways.map(([glyph, title, body]) => `<li>${icon(glyph, { size: 22 })}<div><b>${esc(t(title))}</b>`
      + `<p>${esc(t(body))}</p></div></li>`).join('')}</ul>`
    + `<h3>${esc(t('docs.studio.takes'))}</h3>${takesStrip()}`;
}

function sceneSection(): string {
  const space = STUDIO_SPACE_MAPS.map((map) => t(`map.${map}`)).join(t('docs.mp.listJoin'));
  return p('docs.studio.sceneLede', { space })
    + `<h3>${esc(t('docs.studio.times'))}</h3>${chips(STUDIO_TIMES.map((time) => t(`atmosphere.${time}`)))}`
    + `<h3>${esc(t('docs.studio.states'))}</h3>${chips(studioNames('studio.ws.state.'))}`
    + `<h3>${esc(t('docs.studio.formats'))}</h3>${chips(['landscape', 'portrait', 'square'].map((format) => t(`studio.director.ui.${format}`)))}`;
}

function shotsSection(): string {
  const presets = PRODUCTION_PRESETS.map((preset) => `<li>${icon('cameraPath', { size: 20 })}<div><b>${esc(t(`studio.director.ui.preset.${preset.id}.title`))}</b>`
    + `<p>${esc(t(`studio.director.ui.preset.${preset.id}.description`))}</p>`
    + `<small>${esc(t('docs.studio.presetMeta', { map: t(`map.${preset.map}`), time: t(`atmosphere.${preset.timeOfDay}`), seconds: secs(preset.durationMs), shots: String(preset.shots.length) }))}</small>`
    + `</div></li>`).join('');
  return p('docs.studio.shotsLede')
    + `<h3>${esc(t('docs.studio.rigs'))}</h3>${chips(['hero', 'track', 'rear', 'overhead', 'detail'].map((rig) => t(`studio.director.ui.${rig}`)))}`
    + `<h3>${esc(t('docs.studio.lenses'))}</h3>${chips(['wide', 'natural', 'tight'].map((lens) => t(`studio.director.ui.${lens}`)))}`
    + `<h3>${esc(t('docs.studio.transitions'))}</h3>${chips(studioNames('studio.ws.transition.'))}`
    + facts([['docs.studio.fact.length', { min: secs(STUDIO_MIN_DURATION_MS), max: secs(STUDIO_MAX_DURATION_MS), film: secs(STUDIO_FILM_MAX_DURATION_MS) }],
      ['docs.studio.fact.speed', { speed: String(FILM_MAX_SPEED) }]])
    + `<h3>${esc(t('docs.studio.presets'))}</h3><ul class="dm-roles">${presets}</ul>`;
}

/** The frame rates the film validator accepts, probed so the list follows it. */
function filmRates(): number[] {
  return [12, 15, 24, 25, 30, 48, 50, 60, 90, 120].filter((fps) => {
    try { normalizeFilm({ fps }); return true; } catch { return false; }
  });
}

function filmSection(): string {
  const blur = ['Off', 'Draft', 'Good', 'Best', 'Master'].map((level) => t(`studio.film.blur${level}`));
  const shake = ['Full', 'Half', 'Quarter', 'Off'].map((level) => t(`studio.film.shake${level}`));
  return p('docs.studio.filmLede')
    + facts([['docs.studio.fact.png', {}], ['docs.studio.fact.offline', {}], ['docs.studio.fact.live', {}]])
    + `<h3>${esc(t('studio.film.size'))}</h3>${chips(FILM_RESOLUTIONS.map((height) => t('docs.studio.resolution', { height: String(height) })))}`
    + `<h3>${esc(t('studio.film.rate'))}</h3>${chips(filmRates().map((fps) => t('studio.film.fpsOption', { fps: String(fps) })))}`
    + `<h3>${esc(t('studio.film.blur'))}</h3>${chips(blur)}`
    + `<h3>${esc(t('studio.film.shake'))}</h3>${chips(shake)}`;
}

function shareSection(): string {
  const rows: Array<[IconId, string]> = [
    ['copy', 'docs.studio.share.link'], ['record', 'docs.studio.share.json'], ['stamp', 'docs.studio.share.slots'],
  ];
  return `<ul class="dm-roles dm-roles--rows">${rows.map(([glyph, key]) => `<li>${icon(glyph, { size: 20 })}<div><p>${esc(t(key))}</p></div></li>`).join('')}</ul>`;
}

export function studioSections(): RichSection[] {
  const sections: Array<[string, string, string]> = [
    ['open', t('docs.studio.open'), openSection()],
    ['scene', t('docs.studio.scene'), sceneSection()],
    ['shots', t('docs.studio.shots'), shotsSection()],
    ['effects', t('docs.studio.effects'), p('docs.studio.effectsLede') + chips(studioNames('studio.ws.fx.'))],
    ['film', t('docs.studio.film'), filmSection()],
    ['share', t('docs.studio.share'), shareSection()],
  ];
  return sections.map(([id, title, html]) => ({ id, title, html, text: plain(html) }));
}
