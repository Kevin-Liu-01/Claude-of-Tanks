// The Field Manual's air support section (in the modes chapter): how a crew calls a strike, earns the points, sees one
// coming and brings an aircraft down. Copyright © 2026 Kevin B. Liu.
// Every number is the game's own: the ruleset (src/sim/matchRuleset.ts AIR_SUPPORT_RULES, AIR_STRIKE_WEAPONS,
// AIR_CRASH_RULES, airCrashClassOf), the strike view's keys (src/game/input.ts DEFAULT_BINDINGS: strikeView, the shell
// and kit slots that pick the call-ins in src/game/playerBattleActions.ts, fire that calls, freeCamera and the menu that
// lower) and the HUD's own names for the slots (src/ui/airSupportHud.ts: airSupport.*). Node only (tools/docs-prerender.mjs).
import {
  AIR_CRASH_RULES, AIR_STRIKE_KINDS, AIR_STRIKE_WEAPONS, AIR_SUPPORT_RULES as R, airCrashClassOf, type AirStrikeKind,
} from '../../sim/matchRuleset.ts';
import { DEFAULT_BINDINGS, labelForCode, type ActionId } from '../../game/input.ts';
import { icon, type IconId } from '../../ui/icons/icon.ts';
import { t } from '../../ui/i18n.ts';
import type { RichSection } from './types.ts';

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const kbd = (label: string): string => `<kbd class="cot-c-kbd"${/[㐀-鿿]/.test(label) ? ' data-cjk' : ''}>${esc(label)}</kbd>`;
const key = (id: ActionId): string => kbd(labelForCode(DEFAULT_BINDINGS[id] ?? null));

/** A catalog line whose {placeholders} take markup (key caps) or text (numbers): the line itself is escaped. */
function line(id: string, values: Readonly<Record<string, string>>, markup: Readonly<Record<string, string>> = {}): string {
  const tokens = Object.fromEntries(Object.keys(markup).map((name, i) => [name, `\u0000${i}\u0000`]));
  let text = esc(t(id, { ...values, ...tokens }));
  Object.values(markup).forEach((html, i) => { text = text.split(`\u0000${i}\u0000`).join(html); });
  return text;
}

/** Each call-in's glyph, as the HUD's strike slots draw it (src/ui/airSupportHud.ts STRIKE_ICON). */
const STRIKE_GLYPH: Readonly<Record<AirStrikeKind, IconId>> = {
  recon: 'strikeRecon', artillery: 'strikeArtillery', strafe: 'strikeStrafe', bomb: 'strikeBomb', missile: 'rocket', gunship: 'modeAc130',
};

/** What each call-in does, with its numbers from its ruleset row. */
function effect(kind: AirStrikeKind): string {
  const values: Record<AirStrikeKind, Record<string, string>> = {
    recon: { track: String(R.recon.trackM), reveal: String(R.recon.revealM), seconds: String(R.recon.revealS) },
    artillery: { rounds: String(R.artillery.rounds), radius: String(R.artillery.radiusM), seconds: String(R.artillery.fireS) },
    strafe: { rounds: String(R.strafe.rounds), length: String(R.strafe.lengthM) },
    bomb: { miss: String(R.bomb.missAlongM), blast: String(AIR_STRIKE_WEAPONS.bomb.blastRadiusM ?? R.bomb.radiusM) },
    missile: { count: String(R.missile.missiles), radius: String(R.missile.radiusM) },
    gunship: { seconds: String(R.gunship.orbitS), radius: String(R.gunship.radiusM) },
  };
  return esc(t(`docs.air.effect.${kind}`, values[kind]));
}

/** The six call-ins: price, the caller's reload, the warning, the aircraft's hit points and what it does. */
function strikesTable(): string {
  const seconds = (s: number): string => t('docs.air.seconds', { n: String(s) });
  const rows = AIR_STRIKE_KINDS.map((kind, i) => {
    const row = R[kind];
    return `<tr><th scope="row">${kbd(String(i + 1))} ${icon(STRIKE_GLYPH[kind], { size: 18 })}<span>${esc(t(`airSupport.kind.${kind}`))}</span></th>`
      + `<td>${esc(t('docs.air.points', { n: String(row.cost) }))}</td><td>${esc(seconds(row.cooldownS))}</td><td>${esc(seconds(row.warningS))}</td>`
      + `<td>${row.hp > 0 ? esc(String(row.hp)) : '–'}</td><td>${effect(kind)}</td></tr>`;
  }).join('');
  const head = ['strike', 'cost', 'reload', 'warning', 'aircraft', 'effect'].map((col) => `<th scope="col">${esc(t(`docs.air.col.${col}`))}</th>`).join('');
  return `<div class="dm-table dm-table--wrap" tabindex="0" role="region" aria-label="${esc(t('docs.air.strikes'))}"><table>`
    + `<thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function callSection(): string {
  const picks = `${kbd('1')}–${kbd(String(AIR_STRIKE_KINDS.length))}`;
  const steps = [
    line('docs.air.step.raise', { slot: t('airSupport.short.view') }, { key: key('strikeView') }),
    line('docs.air.step.pick', {}, { keys: picks }),
    line('docs.air.step.aim', { range: String(R.callRangeM) }),
    line('docs.air.step.call', { call: t('airSupport.call') }, { fire: key('fire'), lower: key('freeCamera'), menu: key('settingsMenu') }),
  ];
  return `<p>${line('docs.air.lede', { airSupport: t('playMenu.matchMode.air_support.label'), combinedArms: t('playMenu.matchMode.combined_arms.label') })}</p>`
    + `<ol class="dm-steps">${steps.map((body, i) => `<li><span class="dm-steps__n">${i + 1}</span><p>${body}</p></li>`).join('')}</ol>`
    + `<p>${esc(t('docs.air.pad', { action: t('airSupport.view') }))}</p>`
    + `<p>${esc(t('docs.air.refused', { air: String(R.teamAirCap) }))}</p>`;
}

function pointsSection(): string {
  const p = R.points;
  const rows: Array<[IconId, string, Record<string, string>]> = [
    ['damage', 'docs.air.earn.damage', { points: String(Math.round(p.perDamageHp * 100)) }],
    ['skull', 'docs.air.earn.kill', { points: String(p.kill), support: String(p.supportKill) }],
    ['modeZones', 'docs.air.earn.capture', { points: String(p.capture) }],
    ['eqBinoculars', 'docs.air.earn.spot', { points: String(p.spot), seconds: String(p.spotRepeatS) }],
    ['modeAirSupport', 'docs.air.earn.downed', { points: String(p.downed) }],
    ['clock', 'docs.air.earn.trickle', { seconds: String(p.trickleS) }],
  ];
  return `<ul class="dm-roles dm-roles--rows">${rows.map(([glyph, id, values]) => `<li>${icon(glyph, { size: 20 })}<div><p>${esc(t(id, values))}</p></div></li>`).join('')}</ul>`
    + `<p>${esc(t('docs.air.earn.bank', { start: String(p.start), cap: String(p.cap) }))}</p>`;
}

function warnSection(): string {
  const warnings = AIR_STRIKE_KINDS.map((kind) => R[kind].warningS);
  return `<ul class="dm-facts"><li>${esc(t('docs.air.warn.plate'))}</li>`
    + `<li>${esc(t('docs.air.warn.time', { min: String(Math.min(...warnings)), max: String(Math.max(...warnings)) }))}</li></ul>`;
}

function downSection(): string {
  const flying = AIR_STRIKE_KINDS.filter((kind) => airCrashClassOf(kind) !== null);
  const blasts = flying.map((kind) => AIR_CRASH_RULES[airCrashClassOf(kind) ?? 'jet'].blastRadiusM);
  const jetHp = Math.max(...flying.filter((kind) => kind !== 'gunship').map((kind) => R[kind].hp));
  const facts = [
    t('docs.air.down.any'),
    t('docs.air.down.roof', { scale: String(R.counterAir.rangeScale) }),
    t(R.counterAir.droneHit >= jetHp ? 'docs.air.down.drone' : 'docs.air.down.droneWeak',
      { hit: String(R.counterAir.droneHit), drones: String(Math.ceil(R.gunship.hp / R.counterAir.droneHit)) }),
    t('docs.air.down.crash', { min: String(Math.min(...blasts)), max: String(Math.max(...blasts)), seconds: String(AIR_CRASH_RULES.wreck.lifeS) }),
  ];
  return `<ul class="dm-facts">${facts.map((fact) => `<li>${esc(fact)}</li>`).join('')}</ul>`;
}

/** The modes chapter's air support sections, after its mode cards. */
export function airSupportSections(): RichSection[] {
  const sections: Array<[string, string, string]> = [
    ['air', t('docs.air.call'), callSection()],
    ['air-points', t('docs.air.earn'), pointsSection()],
    ['air-strikes', t('docs.air.strikes'), `${strikesTable()}<p>${esc(t('docs.air.limits', { air: String(R.teamAirCap), gunships: String(R.teamGunshipCap) }))}</p>`],
    ['air-warning', t('docs.air.warn'), warnSection()],
    ['air-down', t('docs.air.down'), downSection()],
  ];
  return sections.map(([id, title, html]) => ({ id, title, html, text: plain(html) }));
}
