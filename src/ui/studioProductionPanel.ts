/** Director workspace: curated scenes and camera tools, backed by the same Studio API as captures. */
import { PRODUCTION_PRESETS, productionAspect, productionPreset, productionShotNames, type ProductionFormat } from '../game/studioProduction.ts';
import { sceneLinkPath } from '../game/studioSceneLink.ts';
import type { StudioPanelApi } from './studioPanel.ts';
import type { NoticeSeverity } from './components/notice.ts';
import { uiIconSVG } from './uiIcons.ts';
import { wireRovingKeys } from './components/components.ts';
import { createPickerMenu } from './components/pickerMenu.ts';
import { pickerText } from './pickerText.ts';
import { tankThumbUrl } from './icons.ts';
import { getLocale, t } from './i18n.ts';
import { resolveTankId } from '../vehicles/tankIdAliases.ts';
import { SCENE_LINK_GLYPHS, browserSceneLinkEnv, copySceneLink } from './studioSceneLinkUi.ts';
import { sequenceTemplates, takeTemplates, type SiteTake, type StudioTemplate, type TemplateWords } from './studioTemplates.ts';
import { createTemplateSheet } from './studioTemplateSheet.ts';

/**
 * The site's takes (owner 2026-10-12: "show them as presets u can access in /studio"): the fifty takes filmed for the
 * site, each the scene its 4K final was rendered from. tools/media-r5/site-media.mjs writes the index beside the
 * collection and site-media-wire.mjs keeps this path on the current one.
 */
const SITE_TAKES_INDEX = '/media/site50-r14/scenes/index.json';

interface SiteTakesIndex { takes: SiteTake[]; tankIdSchema?: unknown }
/**
 * The index's takes with each fleet vehicle in today's spelling: the media index names vehicles under the tank id schema
 * it was written in (`tankIdSchema`, missing = 1), so a renamed tank keeps its take and a swapped id never offers
 * another tank's (SSOT 2.19, tankIdAliases.ts).
 */
function siteTakes(index: SiteTakesIndex): SiteTake[] {
  return index.takes.map((take) => (take.group === 'fleet' && typeof take.vehicle === 'string'
    ? { ...take, vehicle: resolveTankId(take.vehicle, index.tankIdSchema) } : take));
}

/** The Director's words: the catalogs' studio.director.ui.* (the Studio's demand-loaded slice). */
type CopyKey = 'director' | 'scene' | 'actors' | 'effects' | 'timeline' | 'output' | 'templates' | 'stage' | 'staging' |
  'ready' | 'format' | 'landscape' | 'portrait' | 'square' | 'card' | 'subject' | 'defaultTank' | 'shotlist' |
  'camera' | 'hero' | 'track' | 'rear' | 'overhead' | 'detail' | 'lens' | 'wide' | 'natural' | 'tight' | 'guides' |
  'play' | 'pause' | 'restart' | 'scrub' | 'export' | 'photo' | 'video' | 'stop' | 'saved' | 'unsupported' |
  'workspace' | 'hide' | 'show' | 'takes' | 'takesLoading' | 'takesUnavailable' | 'takeLoading' | 'takeLoaded';

export function productionLabel(key: CopyKey): string {
  return t(`studio.director.ui.${key}`);
}

/**
 * A camera shot's name as the reader sees it: the timeline names an unnamed key "Shot N" in the scene file
 * (studioTimeline.ts), and that default reads in the reader's language; a name someone gave a shot stays as written.
 */
export function shotLabel(label: string): string {
  const unnamed = /^Shot (\d+)$/.exec(label);
  return unnamed ? t('studio.ws.shotDefault', { n: unnamed[1] }) : label;
}

/** A shot: the run of camera keys under one name (a directed sequence keys each shot's start and its end), from its first
 *  key to the next shot's. */
export interface ShotRun<Key extends { readonly id: string; readonly label: string; readonly tMs: number }> {
  readonly first: Key;
  readonly keys: readonly Key[];
  readonly startMs: number;
  readonly endMs: number;
}

/** The take's shots: consecutive camera keys that share a name are one shot (the outliner, the camera lane, the shot list). */
export function shotRuns<Key extends { readonly id: string; readonly label: string; readonly tMs: number }>(
  keys: readonly Key[], durationMs: number,
): ShotRun<Key>[] {
  const runs: { first: Key; keys: Key[] }[] = [];
  for (const key of keys) {
    const last = runs[runs.length - 1];
    if (last && last.first.label === key.label) last.keys.push(key);
    else runs.push({ first: key, keys: [key] });
  }
  return runs.map((run, index) => ({ ...run, startMs: run.first.tMs, endMs: runs[index + 1]?.first.tMs ?? durationMs }));
}

/** A curated sequence's title or description in the reader's language (the preset's own English when the catalog has none). */
export function presetText(id: string, field: 'title' | 'description', fallback: string): string {
  const key = `studio.director.ui.preset.${id}.${field}`;
  const text = t(key);
  return text === key ? fallback : text;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text) element.textContent = text;
  return element;
}
/** A vehicle's name: capitalised or numbered words in a run (Leopard 2A6, M1A2 Abrams TUSK, T-14 Armata, T-90M): it never
 * breaks inside (the s16 critic: "Leopard" over "2A6", "M1A2 Abrams" over "TUSK"). */
// (a full-width comma or a pause after the name keeps to it: the s17 critic read "，工厂公路" starting a line)
const KEPT_NAME = /((?:[A-Z0-9][A-Za-z0-9./-]*(?: [A-Z0-9][A-Za-z0-9./-]*)+|[A-Za-z0-9]+(?:[-./][A-Za-z0-9]+)+)[，、,]?)/;
/** A card's caption: its hyphenated names stand whole in no-wrap spans (the s15 critic: "炮火下的 T-" over "90M 纵队"). */
function caption(text: string): HTMLElement {
  const parts = text.split(KEPT_NAME);
  if (parts.length === 1) return node('strong', '', text);
  const strong = node('strong');
  // the split's odd parts are the names it captured
  parts.forEach((part, index) => { if (part) strong.append(node('span', index % 2 ? 'nobr' : '', part)); });
  return strong;
}
/** A Director section's title with its glyph, as every other workspace's section titles carry theirs (the s17 critic). */
function heading(glyph: Parameters<typeof uiIconSVG>[0], text: string): HTMLElement {
  const title = node('h3');
  title.innerHTML = uiIconSVG(glyph, 16);
  title.append(node('span', '', text));
  return title;
}
/** The kit's controls (src/ui/components): a 36 px button, a primary, a chip. */
const KIT_BUTTON = 'cot-c-btn cot-c-btn--36';
const KIT_PRIMARY = 'cot-c-btn cot-c-btn--primary cot-c-btn--36';
const KIT_CHIP = 'cot-c-chip';

/** A workspace of the Studio: the Director and the five groups of studioPanel.ts. */
export type WorkspaceId = 'director' | 'battlefield' | 'tanks' | 'effects' | 'cinematics' | 'output';

/**
 * Where the Director's pieces go in the Studio's app grid (09-studio): each workspace's switch becomes the outliner's
 * head for it, the site's takes fill the shelf, the controls toggle and the frame guides join the header and the
 * viewport. Without hosts (the receipts) the switches form a tab row atop the dock and everything stays in the dock.
 */
interface StudioWorkspaceHosts {
  readonly head?: (id: WorkspaceId, head: HTMLButtonElement) => void;
  readonly takes?: HTMLElement;
  /** The shelf head's actions: the browser's second door, beside Field frames. */
  readonly browse?: HTMLElement;
  readonly toggle?: HTMLElement;
  readonly guides?: HTMLElement;
  /** The Studio's toast (the kit's notices): what an action did, or why it failed. */
  readonly notice?: (text: string, tone?: 'info' | 'error', detail?: string) => void;
}

function button(text: string, action: () => void, className = ''): HTMLButtonElement {
  const element = node('button', className, text);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
}

/**
 * A choice of a few (the frame, the lens): the kit's segmented control, every option in view (the interaction census: raw
 * selects), each a radio stamped data-<key>=<value>; the kit's roving keys move the choice.
 */
function segments<V extends string>(label: string, key: string, choices: readonly (readonly [V, string])[], value: V,
  onChoose: (value: V) => void): { readonly group: HTMLElement; set(value: V): void; lock(locked: boolean): void } {
  const group = node('div', 'cot-c-seg');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  wireRovingKeys(group);
  let current = value;
  const options = choices.map(([choice, text]) => {
    const option = button(text, () => { if (choice !== current) { set(choice); onChoose(choice); } }, 'cot-c-seg__opt');
    option.setAttribute('role', 'radio');
    option.dataset[key] = choice;
    group.append(option);
    return option;
  });
  function set(next: V): void {
    current = next;
    for (const option of options) {
      option.setAttribute('aria-checked', String(option.dataset[key] === next));
      option.tabIndex = option.dataset[key] === next ? 0 : -1;
    }
  }
  set(value);
  return { group, set, lock(locked) { for (const option of options) option.disabled = locked; } };
}

export function mountStudioProductionPanel(
  S: StudioPanelApi, root: HTMLElement, dock: HTMLElement, refreshAll: () => void, hosts: StudioWorkspaceHosts = {},
): { refresh(): void; setVisible(visible: boolean): void; activate(id: WorkspaceId): void; openTemplates(): void } {
  let visible = false;
  function syncPreviewViewport(): void {
    if (visible) document.body.dataset.studioWorkspace = root.dataset.controlsCollapsed === 'true' ? 'collapsed' : 'open';
    else delete document.body.dataset.studioWorkspace;
    // The renderer's existing viewport owner listens here; its ResizeObserver
    // only repairs boot-time zero-size layouts and is not a persistent observer.
    window.dispatchEvent(new Event('cot:layoutchange'));
  }
  function setVisible(next: boolean): void { visible = next; syncPreviewViewport(); if (next) loadSiteTakes(); }
  const director = node('section', 'director');
  director.dataset.group = 'director';
  let selectedId = PRODUCTION_PRESETS[0]?.id ?? '';
  let format: ProductionFormat = S.productionFormat;
  let staging = false;
  let shotSignature = '';
  const say = (text: string, error = false): void => { hosts.notice?.(text, error ? 'error' : 'info'); };
  const failure = (error: unknown): void => { say(error instanceof Error ? error.message : String(error), true); };
  const librarySection = node('section', 'production-templates');
  librarySection.append(heading('film', productionLabel('templates')));
  // The templates (owner 2026-10-27: "make template presentation a lotttt more and better"): the Director's sequences, the
  // site's filmed scenes and every tank's own take, one set (studioTemplates.ts). The inspector shows the current sequence
  // large with the way into the whole set, the shelf lays the sequences and the scenes out in a row, and the browser
  // (studioTemplateSheet.ts) holds all of them with search, chips and a moving preview.
  const words: TemplateWords = {
    zh: getLocale() === 'zh-CN',
    mapName: (id) => mapName(id),
    tankName: (id) => { try { return S.getSpecInfo(id).name; } catch (_) { return id; } },
    time: (id) => t(`atmosphere.${id}`),
    seconds: (ms) => t('studio.ws.seconds', { s: Math.round(ms) % 1000 ? (ms / 1000).toFixed(1) : String(Math.round(ms / 1000)) }),
    kind: (kind) => t(`studio.director.ui.kind.${kind}`),
    shots: (count) => t('studio.director.ui.shotCount', { count }),
    presetText,
    shotNames: (id) => productionShotNames(productionPreset(id)),
  };
  const sequences = sequenceTemplates(PRODUCTION_PRESETS, words);
  let takes: StudioTemplate[] = [];
  /** The template staged last ('seq:…' or 'take:…'): the browser opens on it and the shelf marks it. */
  let currentTemplate = `seq:${selectedId}`;
  const shelfCards = new Map<string, HTMLButtonElement>();
  // the current sequence, large: its still, its kind, its name and its facts; a press opens the browser on it
  const feature = button('', () => openTemplates(), 'production-feature');
  feature.dataset.productionFeature = '';
  const featurePhoto = node('img');
  featurePhoto.width = 640;
  featurePhoto.height = 400;
  featurePhoto.alt = '';
  featurePhoto.decoding = 'async';
  featurePhoto.addEventListener('error', () => {
    const map = productionPreset(selectedId).map;
    if (!featurePhoto.src.endsWith(`/maps/cards/${map}.webp`)) featurePhoto.src = `/maps/cards/${map}.webp`;
  });
  const featureKind = node('span', 'production-kind', words.kind('sequence'));
  const featureName = node('span', 'production-feature-name');
  const featureFacts = node('small');
  feature.append(featurePhoto, featureKind, featureName, featureFacts);
  const browse = button('', () => openTemplates(), `${KIT_BUTTON} production-browse`);
  browse.dataset.productionBrowse = '';
  browse.innerHTML = uiIconSVG('media', 16);
  const browseLabel = node('span');
  browse.append(browseLabel);
  // the shelf's door: a chip beside Field frames
  const shelfBrowse = button('', () => openTemplates(), 'cot-c-chip production-browse');
  shelfBrowse.dataset.uiSound = 'press';
  shelfBrowse.innerHTML = uiIconSVG('film', 16);
  const shelfBrowseLabel = node('span', 'cot-c-chip__label');
  shelfBrowse.append(shelfBrowseLabel);
  hosts.browse?.prepend(shelfBrowse);
  function countTemplates(): void {
    const label = t('studio.director.ui.browse', { count: sequences.length + takes.length });
    browseLabel.textContent = label;
    shelfBrowseLabel.textContent = label;
  }
  countTemplates();
  function selectPreset(id: string): void {
    selectedId = id;
    const template = sequences.find((item) => item.preset === id) ?? sequences[0];
    if (!template) return;
    featurePhoto.src = template.media?.poster ?? '';
    feature.title = template.summary;
    featureName.replaceChildren(caption(template.name));
    featureFacts.textContent = template.meta.slice(1).join(' · ');
  }
  function markCurrent(id: string): void {
    currentTemplate = id;
    for (const [cardId, card] of shelfCards) card.setAttribute('aria-pressed', String(cardId === id));
  }
  const sheet = createTemplateSheet({
    title: productionLabel('templates'),
    count: (count) => t('studio.director.ui.templateCount', { count }),
    stars: () => (featuredTank() ? t('studio.director.ui.stars', { tank: words.tankName(featuredTank()) }) : t('studio.director.ui.starsDefault')),
    text: pickerText(),
    filters: [
      { id: 'sequence', label: t('studio.director.ui.kinds.sequence'), icon: 'cameraPath' },
      { id: 'scene', label: t('studio.director.ui.kinds.scene'), icon: 'film' },
      { id: 'tank', label: t('studio.director.ui.kinds.tank'), icon: 'vehicle' },
      { id: 'showcase', label: t('studio.director.ui.category.showcase'), icon: 'toolPhoto' },
      { id: 'combat', label: t('studio.director.ui.category.combat'), icon: 'fireGun' },
      { id: 'environment', label: t('studio.director.ui.category.environment'), icon: 'regionWoodland' },
      { id: 'night', label: t('studio.director.ui.category.night'), icon: 'regionNight' },
    ],
    onChoose: (template) => useTemplate(template),
  });
  function openTemplates(): void {
    if (staging || loadingTake || S.recordingStatus().active) return;
    sheet.open([...sequences, ...takes], currentTemplate);
  }
  /** Stage a template: a sequence casts the featured tank, a take stages as filmed. */
  function useTemplate(template: StudioTemplate): void {
    if (template.kind === 'sequence' && template.preset) { selectPreset(template.preset); stageSequence(); }
    else if (template.take) loadSiteTake(template.take);
  }
  const fields = node('div', 'production-fields');
  const frameLabel = node('div', 'production-choice', productionLabel('format'));
  const frame = segments(productionLabel('format'), 'productionFormat',
    (['landscape', 'portrait', 'square', 'card'] as const).map((value) => [value, productionLabel(value)] as const), format,
    (next) => { setFormat(next); S.setProductionFormat(format); });
  // the featured tank is the kit's picker menu (pickerMenu.ts): the fleet by name with its nation, search and recents (a raw
  // select of about 220 in the census), the Director's default first
  const FEATURED_DEFAULT = 'default';
  let featured: string = FEATURED_DEFAULT;
  const featuredTank = (): string => (featured === FEATURED_DEFAULT ? '' : featured);
  const tankLabel = node('div', 'production-choice', productionLabel('subject'));
  const tankHost = node('div', 'production-tank');
  const tanks = createPickerMenu(tankHost, {
    id: 'studio-featured-tank', label: productionLabel('subject'), value: FEATURED_DEFAULT, layout: 'list', text: pickerText(),
    memory: 'studio-tank',
    items: [{ id: FEATURED_DEFAULT, name: productionLabel('defaultTank') }, ...S.TANK_IDS.map((id) => {
      const info = S.getSpecInfo(id);
      // each tank's portrait, as every list of tanks shows it (owner 2026-10-27)
      return { id, name: info.name, media: { poster: tankThumbUrl(id), tank: true }, ...(info.nation ? { facts: [t(`nation.${info.nation}`)] } : {}) };
    })],
    onChoose: (item) => { featured = item.id; },
  });
  frameLabel.append(frame.group); tankLabel.append(tankHost);
  // in the Studio app the frame is the header's (and on a phone the palette's): one datum, one control (the s15 critic:
  // the Director's frame row repeated the header's switch); the receipts' bare dock keeps its own
  if (hosts.head) fields.append(tankLabel); else fields.append(frameLabel, tankLabel);
  function stageSequence(): void {
    if (staging || S.recordingStatus().active) return;
    staging = true; refresh(); say(productionLabel('staging'));
    const presetId = selectedId;
    S.directProduction({ presetId, format, ...(featuredTank() ? { vehicleId: featuredTank() } : {}) })
      .then(() => { markCurrent(`seq:${presetId}`); say(productionLabel('ready')); refreshAll(); })
      .catch(failure)
      .finally(() => { staging = false; refresh(); });
  }
  const stage = button(productionLabel('stage'), stageSequence, `${KIT_PRIMARY} production-stage`);
  stage.dataset.productionStage = '';
  librarySection.append(feature, browse, fields, stage);
  selectPreset(selectedId);
  director.append(librarySection);

  // The shelf's row (the Studio app's hosts.takes, else the Director's own section): the sequences, then the site's filmed
  // scenes once the take index arrives; every tank's own take is the browser's (its search and its Every tank chip).
  const takesSection = node('section', 'production-takes');
  if (!hosts.takes) takesSection.append(heading('play', productionLabel('takes')));
  const takesLibrary = node('div', 'production-library');
  // the index's loading and its failure stand in for the cards, as the kit's inline notice
  const takesStatus = node('div', 'production-takes-status');
  takesSection.append(takesLibrary, takesStatus);
  (hosts.takes ?? director).append(takesSection);
  let takesRequested = false;
  let loadingTake = false;
  // the kit's inline notice (components/notice.ts notice(): its severity's glyph, the line, a status or an alert), built as
  // nodes so no Studio sink writes text as markup (studioSceneShare.selftest §10)
  const TAKE_NOTICE_GLYPH: Readonly<Record<NoticeSeverity, string>> = { info: 'info', success: 'check', warning: 'alert', error: 'alert', progress: 'clock' };
  function takeStatus(text: string, severity: NoticeSeverity = 'progress'): void {
    if (!text) { takesStatus.replaceChildren(); return; }
    const box = node('div', 'cot-c-notice');
    box.dataset.severity = severity;
    box.setAttribute('role', severity === 'error' ? 'alert' : 'status');
    const glyph = node('span', 'cot-c-notice__glyph');
    glyph.innerHTML = uiIconSVG(TAKE_NOTICE_GLYPH[severity], 20);
    const body = node('span', 'cot-c-notice__body');
    body.append(node('span', 'cot-c-notice__text', text));
    box.append(glyph, body);
    takesStatus.replaceChildren(box);
  }
  /** A battlefield's name in the reader's language (the catalog's map.<id>; the Studio's own name where it has none). */
  function mapName(id: string): string {
    const key = `map.${id}`;
    if (t(key) !== key) return t(key);
    try { return S.getMapInfo(id).name; } catch (_) { return id; }
  }
  /** A template on the shelf: its still with its length on the corner, its name under it; a press stages it. */
  function shelfCard(template: StudioTemplate): HTMLButtonElement {
    const card = button('', () => useTemplate(template), 'production-card');
    if (template.take) card.dataset.siteTake = template.take.id;
    if (template.preset) card.dataset.productionPreset = template.preset;
    card.dataset.templateKind = template.kind;
    card.title = template.summary;
    card.setAttribute('aria-pressed', String(template.id === currentTemplate));
    const photo = node('img');
    photo.src = template.media?.poster ?? '';
    photo.width = 640;
    photo.height = template.kind === 'sequence' ? 400 : 360;
    photo.addEventListener('error', () => { photo.src = `/maps/cards/${template.map}.webp`; }, { once: true });
    photo.alt = '';
    photo.loading = 'lazy';
    photo.decoding = 'async';
    card.append(photo, node('span', 'production-duration', template.meta[template.kind === 'sequence' ? 3 : 2] ?? ''),
      caption(template.name), node('small', '', template.facts?.[0] ?? ''));
    // a sequence wears the camera path on its still's corner: it directs your tank, where a scene stages as filmed
    if (template.kind === 'sequence') {
      const mark = node('span', 'production-mark');
      mark.innerHTML = uiIconSVG('cameraPath', 14);
      mark.setAttribute('aria-hidden', 'true');
      card.append(mark);
    }
    shelfCards.set(template.id, card);
    return card;
  }
  for (const template of sequences) takesLibrary.append(shelfCard(template));
  function loadSiteTakes(): void {
    if (takesRequested) return;
    takesRequested = true;
    takeStatus(productionLabel('takesLoading'));
    fetch(SITE_TAKES_INDEX)
      .then((response) => {
        if (!response.ok) throw new Error(`${SITE_TAKES_INDEX}: HTTP ${response.status}`);
        return response.json() as Promise<SiteTakesIndex>;
      })
      .then((index) => {
        takes = takeTemplates(siteTakes(index), words);
        for (const template of takes) if (template.kind === 'scene') takesLibrary.append(shelfCard(template));
        countTemplates();
        takeStatus('');
        refresh();
      })
      .catch(() => { takesRequested = false; takeStatus(productionLabel('takesUnavailable'), 'warning'); });
  }
  function loadSiteTake(take: SiteTake): void {
    const path = sceneLinkPath(take.scene); // this site's own files only, as a scene link
    if (!path || loadingTake || staging || S.recordingStatus().active) return;
    loadingTake = true;
    refresh();
    say(productionLabel('takeLoading'));
    fetch(path)
      .then((response) => {
        if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
        return response.json();
      })
      .then((json) => S.load(json))
      .then(() => {
        markCurrent(`take:${take.id}`);
        say(productionLabel('takeLoaded'));
        refreshAll();
      })
      .catch(failure)
      .finally(() => { loadingTake = false; refresh(); });
  }

  const sequence = node('section');
  sequence.append(heading('toolPhoto', productionLabel('shotlist')));
  const transport = node('div', 'production-transport');
  const play = button(productionLabel('play'), () => { if (S.playing) S.pause(); else S.play(); refresh(); }, KIT_BUTTON);
  const restart = button(productionLabel('restart'), () => { S.stop(); S.seek(0); refresh(); }, KIT_BUTTON);
  transport.append(play, restart);
  const scrub = node('input', 'production-scrub');
  scrub.type = 'range'; scrub.min = '0'; scrub.step = '10'; scrub.setAttribute('aria-label', productionLabel('scrub'));
  scrub.addEventListener('input', () => { S.pause(); S.seek(Number(scrub.value)); refresh(); });
  const shots = node('div', 'production-shots');
  // the scrub is named, not numbered: the playhead reads in the viewport's frame chip (UI-LOCKDOWN G14)
  const scrubRow = node('label', 'production-scrubrow', productionLabel('scrub'));
  scrubRow.append(scrub);
  sequence.append(transport, scrubRow, shots);
  director.append(sequence);

  const cameras = node('section'); cameras.append(heading('optics', productionLabel('camera')));
  const rigs = node('div', 'production-rigs');
  for (const rig of ['hero', 'track', 'rear', 'overhead', 'detail'] as const) {
    const control = button(productionLabel(rig), () => { S.pause(); S.applyProductionCamera(rig); S.addCameraShot(); refreshAll(); }, KIT_CHIP);
    control.dataset.productionRig = rig; rigs.append(control);
  }
  const lensLabel = node('div', 'production-lens', productionLabel('lens'));
  const lens = segments(productionLabel('lens'), 'productionLens',
    ([['wide', 58], ['natural', 42], ['tight', 28]] as const).map(([label, fov]) => [String(fov), productionLabel(label)] as const), '42',
    (fov) => { S.pause(); S.setCamera({ fov: Number(fov) }); S.addCameraShot(); refreshAll(); });
  lensLabel.append(lens.group);
  const guides = node('label', 'production-guide');
  const guideCheck = node('input'); guideCheck.type = 'checkbox'; guideCheck.checked = true; guideCheck.dataset.productionGuides = '';
  guides.append(guideCheck, node('span', '', productionLabel('guides')));
  const guideLayer = node('div', 'studio-frame-guides'); guideLayer.setAttribute('aria-hidden', 'true');
  const guide = node('div', 'studio-frame-guide'); guideLayer.append(guide);
  if (hosts.guides) hosts.guides.prepend(guideLayer); else root.prepend(guideLayer);
  function setFormat(next: ProductionFormat): void {
    format = next;
    frame.set(next);
    guide.style.setProperty('--frame-aspect', String(productionAspect(format)));
  }
  setFormat(format);
  guideCheck.addEventListener('change', () => { guideLayer.hidden = !guideCheck.checked; });
  cameras.append(rigs, lensLabel, guides);
  director.append(cameras);

  const exports = node('section'); exports.append(heading('deploy', productionLabel('export')));
  const exportButtons = node('div', 'production-exports');
  const photo = button(productionLabel('photo'), () => {
    const [width, height] = format === 'portrait' ? [2160, 3840] : format === 'square' ? [2880, 2880]
      : format === 'card' ? [3840, 2010] : [3840, 2160];
    Promise.resolve().then(() => S.capture({ width, height, download: true })).then(() => say(productionLabel('saved'))).catch(failure);
  }, KIT_BUTTON);
  const video = button(productionLabel('video'), () => {
    if (S.recordingStatus().active) { S.stopRecording(); return; }
    S.recordVideo({ fps: 30, download: true }).then(() => say(productionLabel('saved'))).catch(failure);
    refresh();
  }, KIT_BUTTON);
  exportButtons.append(photo, video);
  // Copy scene link (studioSceneLinkUi.ts): the staged scene itself rides in the link's #fragment, never a server.
  const linkButton = button('', () => {
    copySceneLink(S.state(), browserSceneLinkEnv())
      .then((result) => hosts.notice?.(result.message, result.ok ? 'info' : 'error', result.detail));
  }, `${KIT_BUTTON} production-link`);
  linkButton.innerHTML = SCENE_LINK_GLYPHS.link;
  linkButton.append(node('span', '', t('studio.sceneLink.copyButton')));
  linkButton.title = t('studio.sceneLink.copyTitle');
  linkButton.dataset.sceneLinkCopy = '';
  // the export captions stay under their buttons; the link button follows them
  exports.append(exportButtons, linkButton);
  director.append(exports);
  dock.prepend(director);

  const nav = node('nav', 'workspace-nav'); nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', productionLabel('workspace'));
  const workspaceIds: readonly WorkspaceId[] = ['director', 'battlefield', 'tanks', 'effects', 'cinematics', 'output'];
  // In the Studio's outliner the switches are plain buttons that mark the open workspace (aria-current); as a tab row they
  // are tabs.
  const outlined = !!hosts.head;
  const current = outlined ? 'aria-current' : 'aria-selected';
  const workspaceGroups = ['director', 'battlefield', 'tanks', 'effects', 'global', 'output'] as const;
  const labels = ['director', 'scene', 'actors', 'effects', 'timeline', 'output'] as const;
  const navButtons: HTMLButtonElement[] = [];
  function activate(id: WorkspaceId): void {
    const groupId = workspaceGroups[workspaceIds.indexOf(id)];
    for (const section of dock.querySelectorAll<HTMLElement>(':scope > [data-group]')) {
      const selected = section.dataset.group === groupId;
      section.dataset.workspaceHidden = String(!selected);
      section.hidden = !selected;
    }
    for (const tab of navButtons) {
      const selected = tab.dataset.workspace === id;
      tab.setAttribute(current, String(selected));
      if (!outlined) tab.tabIndex = selected ? 0 : -1;
    }
    dock.scrollTop = 0;
  }
  workspaceIds.forEach((id, index) => {
    const tab = button(productionLabel(labels[index]), () => activate(id));
    tab.dataset.workspace = id; tab.id = `studio-workspace-${id}`;
    tab.setAttribute('aria-controls', `studio-panel-${id}`);
    const panel = dock.querySelector<HTMLElement>(`:scope > [data-group="${workspaceGroups[index]}"]`);
    if (panel) { panel.id = `studio-panel-${id}`; panel.setAttribute('aria-labelledby', tab.id); }
    navButtons.push(tab);
    if (outlined) { hosts.head?.(id, tab); return; }
    tab.setAttribute('role', 'tab');
    panel?.setAttribute('role', 'tabpanel');
    tab.addEventListener('keydown', (event) => {
      const next = event.key === 'ArrowRight' ? (index + 1) % workspaceIds.length : event.key === 'ArrowLeft' ? (index + workspaceIds.length - 1) % workspaceIds.length : event.key === 'Home' ? 0 : event.key === 'End' ? workspaceIds.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); activate(workspaceIds[next]); navButtons[next]?.focus(); }
    });
    nav.append(tab);
  });
  if (!outlined) dock.prepend(nav);
  activate('director');
  const toggle = button(productionLabel('hide'), () => {
    const collapsed = root.dataset.controlsCollapsed !== 'true';
    root.dataset.controlsCollapsed = String(collapsed);
    syncPreviewViewport();
    toggle.textContent = productionLabel(collapsed ? 'show' : 'hide');
    toggle.setAttribute('aria-expanded', String(!collapsed));
  }, `${KIT_CHIP} studio-panel-toggle`);
  toggle.setAttribute('aria-expanded', 'true');
  (hosts.toggle ?? root).append(toggle);

  function refresh(): void {
    if (format !== S.productionFormat) setFormat(S.productionFormat);
    const recording = S.recordingStatus();
    const locked = staging || recording.active;
    toggle.disabled = recording.active;
    for (const element of [stage, play, restart, scrub, photo]) element.disabled = locked;
    tanks.setDisabled(locked);
    frame.lock(locked);
    lens.lock(locked);
    feature.disabled = locked || loadingTake;
    browse.disabled = locked || loadingTake;
    shelfBrowse.disabled = locked || loadingTake;
    for (const element of shelfCards.values()) element.disabled = locked || loadingTake;
    for (const element of rigs.querySelectorAll('button')) element.disabled = locked || S._internal.actors.length === 0;
    play.textContent = productionLabel(S.playing ? 'pause' : 'play');
    video.textContent = productionLabel(recording.active ? 'stop' : 'video');
    video.disabled = staging || !recording.supported;
    video.title = recording.supported ? '' : productionLabel('unsupported');
    scrub.max = String(S.durationMs);
    if (document.activeElement !== scrub) scrub.value = String(S.fxTimeMs);
    const storyboard = S.getStoryboard();
    const signature = JSON.stringify(storyboard.shots.map((shot) => [shot.id, shot.label, shot.tMs]));
    if (signature !== shotSignature) {
      shotSignature = signature; shots.replaceChildren();
      shotRuns(storyboard.shots, S.durationMs).forEach((run, index) => {
        const shot = run.first;
        const entry = button('', () => { S.pause(); S.seek(shot.tMs); S.selectCameraShot(shot.id); refreshAll(); }, 'production-shot');
        entry.dataset.productionShot = shot.id;
        entry.dataset.productionKeys = run.keys.map((key) => key.id).join(' ');
        entry.append(node('span', '', String(index + 1).padStart(2, '0')), node('span', '', shotLabel(shot.label)), node('span', '', t('studio.ws.seconds', { s: (shot.tMs / 1000).toFixed(1) })));
        shots.append(entry);
      });
    }
    for (const entry of shots.querySelectorAll<HTMLButtonElement>('button')) {
      entry.disabled = locked;
      entry.setAttribute('aria-current', String(!!S.selectedShotId && (entry.dataset.productionKeys ?? '').split(' ').includes(S.selectedShotId)));
    }
  }
  refresh();
  // the takes index is fetched as the panel is built, so the Director's lists are filled before it first shows: a list
  // arriving after the panel opened pushed every section under it 75 px down (248, a cold /studio)
  loadSiteTakes();
  return { refresh, setVisible, activate, openTemplates };
}
