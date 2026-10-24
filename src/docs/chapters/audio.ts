// The Field Manual's sound chapter: what each sound tells you in battle. Copyright © 2026 Kevin B. Liu.
// The crew's calls are quoted from the caption script the game captions them with (src/audio/captionScript.generated.ts,
// the first take in the reader's language); the arrival delays from the audio engine's own propagation
// (src/audio/audioMath.ts); the crew languages from the voice packs (src/audio/vehicleAudioProfiles.ts), named by the
// reader's locale; the gun reports and their loudness from src/audio/weaponAudio.ts; the sliders and alarms from the
// Sound tab's own labels (src/ui/settings.ts). Node only (tools/docs-prerender.mjs).
import { CAPTION_SCRIPT } from '../../audio/captionScript.generated.ts';
import { ATMOSPHERES, propagationDelayS } from '../../audio/audioMath.ts';
import { CREW_LANGUAGES } from '../../audio/vehicleAudioProfiles.ts';
import { WEAPON_CLASSES } from '../../audio/weaponAudio.ts';
import { flagMarkup } from '../../presentation/publicShell.ts';
import { icon, type IconId } from '../../ui/icons/icon.ts';
import { getLocale, t } from '../../ui/i18n.ts';
import type { RichSection } from './types.ts';

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const p = (key: string, values: Record<string, string> = {}): string => `<p>${esc(t(key, values))}</p>`;

/** What the crew says for a call, every take, in the reader's language (the captions carry en-US and zh-CN). */
function quotes(call: string): string {
  const script = CAPTION_SCRIPT[call];
  if (!script) throw new Error(`docs: the caption script has no ${call}`);
  return (getLocale() === 'zh-CN' ? script['zh-CN'] : script['en-US']).map((take) => `<q>${esc(take)}</q>`).join('');
}

/** A table of calls: the glyph, what the crew says, and what it means. */
function callTable(rows: ReadonlyArray<readonly [string, IconId]>, aria: string): string {
  const body = rows.map(([call, glyph]) => `<tr><th scope="row"><span class="dm-cell dm-cell--quotes">${icon(glyph, { size: 16 })}<span>${quotes(call)}</span></span></th>`
    + `<td>${esc(t(`docs.audio.call.${call}`))}</td></tr>`).join('');
  return `<div class="dm-table dm-table--wrap" tabindex="0" role="region" aria-label="${esc(aria)}"><table><thead><tr>`
    + `<th scope="col">${esc(t('docs.audio.col.says'))}</th><th scope="col">${esc(t('docs.audio.col.means'))}</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

const RESULT_CALLS = [
  ['penetration', 'penetration'], ['nonpen', 'blocked'], ['ricochet', 'ricochet'], ['miss', 'scope'], ['enemy_crit', 'critical'],
  ['enemy_ammo_rack', 'ammoRack'], ['enemy_engine_hit', 'engine'], ['enemy_immobilized', 'track'], ['enemy_crew_hit', 'crew'],
  ['target_destroyed', 'detonation'],
] as const satisfies ReadonlyArray<readonly [string, IconId]>;

const WARNING_CALLS = [
  ['were_hit', 'damage'], ['bounced_us', 'shield'], ['fire', 'statusFire'], ['ammo_rack', 'ammoRack'], ['engine_damaged', 'engine'],
  ['track_gone', 'track'], ['gun_damaged', 'gun'], ['low_hp', 'heartbeat'], ['sixth_sense', 'lightbulb'], ['missile_incoming', 'rocket'],
  ['drone_incoming', 'modeDrone'],
] as const satisfies ReadonlyArray<readonly [string, IconId]>;

/** How late a shot is heard: the engine's own delay at three ranges, on Earth and on Mars. */
function delays(): string {
  const ranges = [100, 500, 1000];
  const row = (world: 'earth' | 'mars'): string => `<li><b>${esc(t(`docs.audio.world.${world}`))}</b>${ranges.map((m) => `<span class="num">`
    + `${esc(t('docs.audio.delay', { range: String(m), seconds: propagationDelayS(m, ATMOSPHERES[world]).toFixed(1) }))}</span>`).join('')}</li>`;
  return `<ul class="dm-delays" aria-label="${esc(t('docs.audio.delaysAria'))}">${row('earth')}${row('mars')}</ul>`;
}

/** The crew languages, each with its nation's flag and its name in the reader's locale. */
const LANGUAGE_FLAGS: Readonly<Record<string, string>> = {
  'en-US': 'us', 'en-GB': 'gb', de: 'de', ru: 'ru', uk: 'ua', zh: 'cn', fr: 'fr', sv: 'se', ja: 'jp', ko: 'kr', it: 'it', pl: 'pl', he: 'il',
};
function languages(): string {
  const names = new Intl.DisplayNames([getLocale()], { type: 'language' });
  return `<ul class="dm-nations">${CREW_LANGUAGES.map((language) => {
    const flag = LANGUAGE_FLAGS[language];
    if (!flag) throw new Error(`docs: no flag for the ${language} crew`);
    return `<li>${flagMarkup(flag, 'cot-c-flag cot-c-flag--md')}<span>${esc(names.of(language) ?? language)}</span></li>`;
  }).join('')}</ul>`;
}

/** Each gun report's name: the AC-130's three and the two machine guns by name, the rest by calibre and kind. */
function reportName(id: string): string {
  const calibre = /^(ac|gun)_(\d+)$/.exec(id);
  if (calibre) return t('docs.audio.calibre', { mm: calibre[2], kind: t(`docs.audio.kind.${calibre[1]}`) });
  return t(`docs.audio.class.${id}`);
}
/** The reports drawn as loudness bars, one scale from the quietest to the loudest. */
function reports(): string {
  const classes = Object.values(WEAPON_CLASSES).sort((a, b) => a.loudDb - b.loudDb);
  const floor = classes[0].loudDb - 6, top = classes.at(-1)!.loudDb;
  return `<ul class="dm-bars dm-bars--wide" aria-label="${esc(t('docs.audio.reportsAria'))}">${classes.map((report) => `<li><b>${esc(reportName(report.id))}</b>`
    + `<span class="dm-bar" style="--dm-bar:${((report.loudDb - floor) / (top - floor)).toFixed(3)}"></span><span class="num">${esc(t('docs.audio.db', { db: String(report.loudDb) }))}</span></li>`).join('')}</ul>`;
}

/** The Sound tab: its six sliders and two alarms, by their own labels. */
function settingsSection(): string {
  const rows: Array<[IconId, string]> = [
    ['sound', 'settings.sound.master'], ['engine', 'settings.sound.engine'], ['fireGun', 'settings.sound.combat'],
    ['ambience', 'settings.sound.ambience'], ['music', 'settings.sound.ui'], ['crewCommander', 'settings.sound.voice'],
    ['heartbeat', 'settings.alarms.heartbeat'], ['soundOff', 'settings.alarms.concussion'],
  ];
  return p('docs.audio.settingsLede') + `<ul class="dm-roles dm-roles--rows">${rows.map(([glyph, key]) => `<li>${icon(glyph, { size: 20 })}<div><p>${esc(t(key))}</p></div></li>`).join('')}</ul>`;
}

export function audioSections(): RichSection[] {
  const mars = ATMOSPHERES.mars, moon = ATMOSPHERES.vacuum;
  const facts = (keys: Array<[string, Record<string, string>]>): string => `<ul class="dm-facts">${keys.map(([key, values]) => `<li>${esc(t(key, values))}</li>`).join('')}</ul>`;
  const sections: Array<[string, string, string]> = [
    ['hits', t('docs.audio.hits'), p('docs.audio.hitsLede') + callTable(RESULT_CALLS, t('docs.audio.hitsAria')) + `<h3>${esc(t('docs.audio.delaysTitle'))}</h3>` + delays()],
    ['warnings', t('docs.audio.warnings'), p('docs.audio.warningsLede') + callTable(WARNING_CALLS, t('docs.audio.warningsAria'))],
    ['radio', t('docs.audio.radio'), p('docs.audio.radioLede', { languages: String(CREW_LANGUAGES.length) }) + languages()
      + facts([['docs.audio.fact.oneAtATime', {}], ['docs.audio.fact.damagedRadio', {}], ['docs.audio.fact.crewSetting', { languages: String(CREW_LANGUAGES.length) }]])],
    ['gunfire', t('docs.audio.gunfire'), p('docs.audio.gunfireLede', { classes: String(Object.keys(WEAPON_CLASSES).length) }) + reports()
      + facts([['docs.audio.fact.hills', {}], ['docs.audio.fact.mars', { speed: String(mars.speedOfSoundMps), db: String(-mars.transmissionDb) }],
        ['docs.audio.fact.moon', { db: String(-moon.transmissionDb) }], ['docs.audio.fact.sight', {}]])],
    ['engines', t('docs.audio.engines'), facts([['docs.audio.fact.powertrain', {}], ['docs.audio.fact.tracks', {}], ['docs.audio.fact.drone', {}]])],
    ['settings', t('docs.audio.settings'), settingsSection() + p('docs.audio.made')],
  ];
  return sections.map(([id, title, html]) => ({ id, title, html, text: plain(html) }));
}
