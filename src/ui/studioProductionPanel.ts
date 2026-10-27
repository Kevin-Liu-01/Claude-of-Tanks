/** Director workspace: curated scenes and camera tools, backed by the same Studio API as captures. */
import { PRODUCTION_PRESETS, productionAspect, type ProductionFormat } from '../game/studioProduction.ts';
import { sceneLinkPath } from '../game/studioSceneLink.ts';
import type { StudioPanelApi } from './studioPanel.ts';
import type { NoticeSeverity } from './components/notice.ts';
import { uiIconSVG } from './uiIcons.ts';
import { wireRovingKeys } from './components/components.ts';
import { createPickerMenu } from './components/pickerMenu.ts';
import { pickerText } from './pickerText.ts';
import { getLocale, t } from './i18n.ts';
import { LAST_TANK_STORAGE_KEY } from '../game/tankIdStorageMigration.ts';
import { resolveTankId } from '../vehicles/tankIdAliases.ts';
import { SCENE_LINK_GLYPHS, browserSceneLinkEnv, copySceneLink } from './studioSceneLinkUi.ts';

/**
 * The site's takes (owner 2026-10-12: "show them as presets u can access in /studio"): the fifty takes filmed for the
 * site, each the scene its 4K final was rendered from. tools/media-r5/site-media.mjs writes the index beside the
 * collection and site-media-wire.mjs keeps this path on the current one.
 */
const SITE_TAKES_INDEX = '/media/site50-r14/scenes/index.json';

interface SiteTakesIndex { takes: SiteTake[]; tankIdSchema?: unknown }
/**
 * The index's fleet takes with each vehicle in today's spelling: the media index names vehicles under the tank id schema
 * it was written in (`tankIdSchema`, missing = 1), so a renamed tank keeps its take and a swapped id never offers
 * another tank's (SSOT 2.19, tankIdAliases.ts).
 */
function siteFleetTakes(index: SiteTakesIndex): SiteTake[] {
  return index.takes.filter((take) => take.group === 'fleet' && typeof take.vehicle === 'string')
    .map((take) => ({ ...take, vehicle: resolveTankId(take.vehicle as string, index.tankIdSchema) }));
}
interface SiteTake {
  id: string; title: { en: string; zh: string }; short: { en: string; zh: string };
  map: string; durationMs: number | null; scene: string; thumb?: string;
  /** 'fleet': one production vehicle's own take (src/ui/fleetTakes.ts); the default list is every other take. */
  group?: string; vehicle?: string;
}
// Every tank's own take is reached by a search, at most this many cards at a time, never as a 220-card list.
const FLEET_RESULTS = 6;

/** The Director's words: the catalogs' studio.director.ui.* (the Studio's demand-loaded slice). */
type CopyKey = 'director' | 'scene' | 'actors' | 'effects' | 'timeline' | 'output' | 'library' | 'stage' | 'staging' |
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
): { refresh(): void; setVisible(visible: boolean): void; activate(id: WorkspaceId): void } {
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
  const librarySection = node('section');
  librarySection.append(heading('film', productionLabel('library')));
  const library = node('div', 'production-library');
  const cards = new Map<string, HTMLButtonElement>();
  function selectPreset(id: string): void {
    selectedId = id;
    for (const [cardId, card] of cards) card.setAttribute('aria-pressed', String(cardId === id));
  }
  for (const preset of PRODUCTION_PRESETS) {
    const card = button('', () => selectPreset(preset.id), 'production-card');
    card.dataset.productionPreset = preset.id;
    card.title = presetText(preset.id, 'description', preset.description);
    // the sequence's own frame, rendered by the engine (public/media/studio-r1, its manifest); its battlefield's card if
    // a still is missing. Sized, so the library never shifts as the pictures arrive.
    const photo = node('img');
    photo.src = `/media/studio-r1/sequence-${preset.id}-640.webp`;
    photo.width = 640;
    photo.height = 400;
    photo.addEventListener('error', () => { photo.src = `/maps/cards/${preset.map}.webp`; }, { once: true });
    photo.alt = '';
    photo.loading = 'lazy';
    photo.decoding = 'async';
    card.append(photo, node('span', 'production-duration', t('studio.ws.seconds', { s: Math.round(preset.durationMs / 1000) })), caption(presetText(preset.id, 'title', preset.title)),
      node('small', '', `${S.getMapInfo(preset.map).name} · ${t('studio.director.ui.shotCount', { count: preset.shots.length })}`));
    cards.set(preset.id, card);
    library.append(card);
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
      return { id, name: info.name, ...(info.nation ? { facts: [t(`nation.${info.nation}`)] } : {}) };
    })],
    onChoose: (item) => {
      featured = item.id;
      if (fleetTakes.length && !fleetSearch.value.trim()) renderFleetTakes();
    },
  });
  frameLabel.append(frame.group); tankLabel.append(tankHost);
  // in the Studio app the frame is the header's (and on a phone the palette's): one datum, one control (the s15 critic:
  // the Director's frame row repeated the header's switch); the receipts' bare dock keeps its own
  if (hosts.head) fields.append(tankLabel); else fields.append(frameLabel, tankLabel);
  const stage = button(productionLabel('stage'), () => {
    if (staging || S.recordingStatus().active) return;
    staging = true; refresh(); say(productionLabel('staging'));
    S.directProduction({ presetId: selectedId, format, ...(featuredTank() ? { vehicleId: featuredTank() } : {}) })
      .then(() => { say(productionLabel('ready')); refreshAll(); })
      .catch(failure)
      .finally(() => { staging = false; refresh(); });
  }, `${KIT_PRIMARY} production-stage`);
  stage.dataset.productionStage = '';
  librarySection.append(library, fields, stage);
  selectPreset(selectedId);
  director.append(librarySection);

  // The site's takes: fetched the first time the Director opens; a card stages its take exactly as filmed (S.load, as
  // Load JSON does), ready to play, change and film again.
  const takesSection = node('section', 'production-takes');
  if (!hosts.takes) takesSection.append(heading('play', productionLabel('takes')));
  const takesLibrary = node('div', 'production-library');
  // the index's loading and its failure stand in for the cards, as the kit's inline notice
  const takesStatus = node('div', 'production-takes-status');
  takesSection.append(takesLibrary, takesStatus);
  (hosts.takes ?? director).append(takesSection);
  const takeCards = new Map<string, HTMLButtonElement>();
  let takesRequested = false;
  let loadingTake = false;
  let stagedTake = '';
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
  function mapName(id: string): string {
    try { return S.getMapInfo(id).name; } catch (_) { return id; }
  }
  function takeCard(take: SiteTake): HTMLButtonElement {
    const zh = getLocale() === 'zh-CN';
    const card = button('', () => loadSiteTake(take), 'production-card');
    card.dataset.siteTake = take.id;
    card.title = zh ? take.title.zh : take.title.en;
    card.setAttribute('aria-pressed', String(take.id === stagedTake));
    const photo = node('img');
    photo.src = take.thumb || `/maps/cards/${take.map}.webp`;
    photo.alt = '';
    photo.loading = 'lazy';
    photo.decoding = 'async';
    card.append(photo, node('span', 'production-duration', t('studio.ws.seconds', { s: ((take.durationMs ?? 0) / 1000).toFixed(1) })),
      caption(zh ? take.short.zh : take.short.en), node('small', '', mapName(take.map)));
    takeCards.set(take.id, card);
    return card;
  }
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
        for (const take of index.takes) if (take.group !== 'fleet') takesLibrary.append(takeCard(take));
        listFleetTakes(siteFleetTakes(index));
        takeStatus('');
        refresh();
      })
      .catch(() => { takesRequested = false; fleetSection.hidden = true; takeStatus(productionLabel('takesUnavailable'), 'warning'); });
  }

  // Every tank's own take (owner 2026-10-12): the index's fleet entries stay out of the list above and are reached by
  // a search instead. With no query the finder offers the take of the Director's featured tank, else of the tank last
  // selected in the Garage.
  const fleetSection = node('section', 'production-takes production-fleet');
  // the section holds its place from the first layout (its search waits for the index): appearing once the index arrived,
  // it pushed the shot list 75 px down on a cold entry (248)
  const fleetSearchLabel = node('div', 'production-fleet-search');
  const fleetSearch = node('input');
  fleetSearch.type = 'search';
  fleetSearch.setAttribute('aria-label', t('studio.director.fleet.search'));
  fleetSearch.autocomplete = 'off';
  fleetSearch.spellcheck = false;
  fleetSearch.placeholder = t('studio.director.fleet.placeholder');
  fleetSearch.dataset.fleetSearch = '';
  fleetSearch.disabled = true;
  fleetSearchLabel.append(fleetSearch);
  const fleetLibrary = node('div', 'production-library');
  const fleetStatus = node('div', 'production-hint');
  fleetStatus.setAttribute('role', 'status');
  fleetStatus.setAttribute('aria-live', 'polite');
  fleetSection.append(heading('vehicle', t('studio.director.fleet.heading')), fleetSearchLabel, fleetLibrary, fleetStatus);
  director.append(fleetSection);
  let fleetTakes: SiteTake[] = [];
  const fleetText = new Map<string, string>();
  function garageTank(): string {
    try { return localStorage.getItem(LAST_TANK_STORAGE_KEY) || ''; } catch (_) { return ''; }
  }
  function listFleetTakes(takes: SiteTake[]): void {
    fleetTakes = takes;
    for (const take of takes) {
      const vehicle = take.vehicle ?? '';
      let name = vehicle;
      try { name = S.getSpecInfo(vehicle).name; } catch (_) { /* a vehicle this build lacks keeps its id */ }
      fleetText.set(take.id, [vehicle, name, take.title.en, take.title.zh, take.short.en, take.short.zh, take.map,
        mapName(take.map)].join(' ').toLocaleLowerCase());
    }
    fleetSearch.setAttribute('aria-description', t('studio.director.fleet.intro', { count: takes.length }));
    fleetSearch.disabled = !takes.length;
    fleetSection.hidden = !takes.length;
    if (takes.length) renderFleetTakes();
  }
  function renderFleetTakes(): void {
    const typed = fleetSearch.value.trim();
    const query = typed.toLocaleLowerCase();
    const tank = featuredTank() || garageTank();
    const matches = query
      ? fleetTakes.filter((take) => fleetText.get(take.id)?.includes(query))
      : fleetTakes.filter((take) => take.vehicle === tank);
    for (const take of fleetTakes) takeCards.delete(take.id);
    fleetLibrary.replaceChildren(...matches.slice(0, FLEET_RESULTS).map(takeCard));
    fleetStatus.textContent = !query
      ? (matches.length ? t('studio.director.fleet.yourTank') : '')
      : !matches.length ? t('studio.director.fleet.none', { query: typed })
      : matches.length > FLEET_RESULTS ? t('studio.director.fleet.more', { shown: FLEET_RESULTS, count: matches.length }) : '';
    refresh();
  }
  fleetSearch.addEventListener('input', renderFleetTakes);
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
        stagedTake = take.id;
        for (const [id, card] of takeCards) card.setAttribute('aria-pressed', String(id === take.id));
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
    for (const element of cards.values()) element.disabled = locked;
    for (const element of takeCards.values()) element.disabled = locked || loadingTake;
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
  return { refresh, setVisible, activate };
}
