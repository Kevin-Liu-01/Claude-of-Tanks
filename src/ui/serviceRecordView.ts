import { shotAccuracy } from './battleReportMedia.ts';
import { iconUrl } from './icons.ts';
import { killPresentation } from './killPresentation.ts';
import { killSourceIdentity } from './killSourceIdentity.ts';
import { campaignSummary } from '../game/campaignOperations.ts';
import { frontlineSummary } from '../game/campaignProgress.ts';
import { getPlayerRecord } from '../game/profile.ts';
import {
  MEDALS, getServiceRecord,
  type AchievementProgress, type MedalGroup, type ServiceBattle, type ServiceRecordView,
} from '../game/serviceRecord.ts';
import { formatDate, formatNumber, t } from './i18n.ts';
import { achievementSVG, medalSVG } from './medalArt.ts';
import { uiIconSVG, type UiIconId } from './uiIcons.ts';
import { emptyState, statTile, tag } from './components/components.ts';
import type { IconId } from './icons/icon.ts';
// The garage's Service Record: career totals, the medal case, achievement
// tiers and the last battles, each with its kills laid out as a chain of
// thought. Rendered on demand into the record dialog (serviceRecordDialog.ts
// owns the dialog, its header plate, tabs and focus); everything here reads
// local records only. The last battle heads the dialog as a plate: its map
// behind, its tank's render beside the result.

export type RecordTab = 'overview' | 'medals' | 'achievements' | 'history';
export const RECORD_TABS: readonly RecordTab[] = ['overview', 'medals', 'achievements', 'history'];

/** The tab an arrow, Home or End key moves to from `current` (roving focus), or null for any other key. */
export function recordTabForKey(key: string, current: RecordTab): RecordTab | null {
  if (key === 'Home') return RECORD_TABS[0];
  if (key === 'End') return RECORD_TABS[RECORD_TABS.length - 1];
  const step = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
  if (!step) return null;
  const index = Math.max(0, RECORD_TABS.indexOf(current));
  return RECORD_TABS[(index + step + RECORD_TABS.length) % RECORD_TABS.length];
}

/** Where Tab must land to keep focus inside the dialog (the wrapped end), or null to let the browser move it. */
export function recordFocusWrap<T>(focusable: readonly T[], active: T | null, inside: boolean, backwards: boolean): T | null {
  if (!focusable.length) return null;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!inside) return backwards ? last : first;
  if (backwards && active === first) return last;
  if (!backwards && active === last) return first;
  return null;
}

export interface RecordViewNames {
  vehicle(id: string): string;
  map(id: string): string;
  modeIcon(mode: string): string;
}

const GROUP_ORDER: readonly MedalGroup[] = ['reasoning', 'gunnery', 'survival', 'fieldcraft', 'operations'];
const ROMAN = ['', 'I', 'II', 'III'];
/** Kills this close together are drawn linked in a battle's trace (the Chain of Thought window). */
const LINK_S = 10;

const num = (value: number) => formatNumber(value);

function safe(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[char] ?? char);
}

/** (ac130-fx-228 r3) a battle flown in the AC-130 shows the aircraft (its icon, its name), never the garage tank */
function battleVehicleArt(entry: { vehicleId: string; aircraft?: boolean }): string {
  return entry.aircraft ? `<span class="cot-record-vehicle aircraft">${uiIconSVG('modeAc130', 40)}</span>` : vehicleArt(entry.vehicleId);
}
function battleVehicleName(entry: { vehicleId: string; aircraft?: boolean }, names: RecordViewNames): string {
  return entry.aircraft ? (killSourceIdentity('ac130')?.label ?? names.vehicle(entry.vehicleId)) : names.vehicle(entry.vehicleId);
}

function vehicleArt(id: string, className = 'cot-record-vehicle'): string {
  return /^[a-zA-Z0-9_-]+$/.test(id)
    ? `<img class="${className}" src="${iconUrl(id, 'angle')}" alt="" loading="lazy" decoding="async">` : '';
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function when(at: number): string {
  const date = at ? new Date(at) : null;
  return date && !Number.isNaN(date.getTime())
    ? formatDate(date, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : t('garage.record.localSession');
}

function medalName(id: string): string {
  return t(`service.medal.${id}.name`);
}

function resultLabel(result: string): string {
  return result === 'victory' ? t('garage.record.victory') : result === 'draw' ? t('garage.record.draw') : t('garage.record.defeat');
}

/** The header plate (the last battle: its tank, result, map and time) and the tab counts for the current record. */
export function recordSummary(names: RecordViewNames, view: ServiceRecordView = getServiceRecord()): { plate: string; counts: Record<RecordTab, string> } {
  const distinct = Object.keys(view.medals).length;
  const last = getPlayerRecord().lastBattle;
  const plate = last
    ? `<div class="cot-record-plate result-${safe(last.result)}">${battleVehicleArt(last)}<p><span class="cot-record-result">${safe(resultLabel(last.result))}</span>` +
      `<b>${safe(battleVehicleName(last, names))}</b><small>${safe(names.map(last.mapId))} · <span class="cot-record-when">${safe(when(last.completedAt))}</span></small></p></div>`
    : '<div class="cot-record-plate is-empty"></div>'; // the tabs' empty states say what will fill them
  return {
    plate,
    counts: {
      overview: '',
      medals: `${num(distinct)}/${num(MEDALS.length)}`,
      achievements: `${num(view.tiersReached)}/${num(view.achievements.length * 3)}`,
      history: num(view.history.length),
    },
  };
}

function statLabel(label: string, icon: UiIconId): string {
  return `<span class="cot-record-stat-label" data-stat-icon="${icon}">${uiIconSVG(icon, 16)}${label}</span>`;
}

/** A record figure: the kit's stat tile (cot-record-metric is the layouts' and the browser receipts' hook). */
function metric(label: string, value: string, icon: IconId, note = ''): string {
  return statTile({ label, value, icon, note, className: 'cot-record-metric' });
}

/** Victories, draws and defeats as one bar, each part as long as its count (an empty record draws an empty track). */
function splitBar(wins: number, draws: number, losses: number): string {
  const part = (kind: string, count: number) => (count ? `<i class="${kind}" style="flex-grow:${count}"></i>` : '');
  return `<span class="cot-record-split" aria-hidden="true">${part('win', wins)}${part('draw', draws)}${part('loss', losses)}</span>`;
}

function overview(view: ServiceRecordView): string {
  const record = getPlayerRecord();
  const pct = record.matches ? Math.round((record.wins / record.matches) * 100) : 0;
  const avgDamage = record.matches ? Math.round(record.damage / record.matches) : 0;
  // a figure with nothing behind it yet reads as a dash, the counts as their zero
  const figure = (value: number, text = num(value)) => (value ? text : '–');
  const career = `<div class="cot-record-overview"><div class="cot-record-outcomes">` +
    `<div class="cot-record-outcome win-rate">${statLabel(t('garage.record.winrate'), 'statWinRate')}<strong>${record.matches ? `${pct}%` : '–'}</strong>` +
    `${record.matches ? splitBar(record.wins, record.draws, record.losses) : ''}</div>` +
    `<div class="cot-record-outcome${record.wins ? ' win' : ''}">${statLabel(t('garage.record.victories'), 'statVictory')}<strong>${num(record.wins)}</strong></div>` +
    `<div class="cot-record-outcome${record.losses ? ' loss' : ''}">${statLabel(t('garage.record.defeats'), 'statDefeat')}<strong>${num(record.losses)}</strong></div>` +
    `<div class="cot-record-outcome">${statLabel(t('garage.record.draws'), 'statDraw')}<strong>${num(record.draws)}</strong></div></div>` +
    `<div class="cot-record-metrics">` +
    metric(t('garage.record.battles'), num(record.matches), 'battleRecord') +
    metric(t('garage.record.destroyed'), num(record.kills), 'skull') +
    metric(t('garage.record.totalDamage'), num(record.damage), 'damage') +
    metric(t('garage.record.avgDamage'), figure(avgDamage), 'statAverage') +
    metric(t('garage.record.bestDamage'), figure(record.bestDamage), 'statBest') +
    metric(t('garage.record.longestKill'), figure(view.stats.longestKillM, `${num(view.stats.longestKillM)} m`), 'statRange') +
    `</div></div>`;

  // The reasoning set leads the record: the commander's own Chain of Thought.
  const reasoning = MEDALS.filter((medal) => medal.group === 'reasoning');
  const reasoningTiles = reasoning.map((medal) => {
    const tally = view.medals[medal.id];
    return `<button type="button" class="cot-record-reason${tally ? ' is-earned' : ' is-locked'}" data-medal-tip="${medal.id}">${medalSVG(medal, 56, { locked: !tally })}` +
      `<div><strong>${medalName(medal.id)}</strong>${tally ? `<small>${t('garage.record.earnedCount', { count: num(tally.count) })}</small>` : `<small class="cot-record-sr">${t('garage.record.notEarned')}</small>`}</div></button>`;
  }).join('');
  const reasoningCard = `<section class="cot-record-card cot-record-reasoning">` +
    `<header class="cot-record-card-head">${uiIconSVG('lightbulb', 15)}<strong>${t('service.group.reasoning')}</strong></header>` +
    `<div class="cot-record-reason-row">${reasoningTiles}</div>` +
    `<div class="cot-record-reason-stats">` +
    `<div>${statLabel(t('garage.record.longestChain'), 'statChain')}<b>${figure(view.stats.bestChain, t('garage.record.chainKills', { count: num(view.stats.bestChain) }))}</b></div>` +
    `<div>${statLabel(t('garage.record.bestStreak'), 'statVictory')}<b>${figure(view.stats.bestStreak, t('garage.record.streakRounds', { count: num(view.stats.bestStreak) }))}</b></div>` +
    `<div>${statLabel(t('garage.record.bestKills'), 'skull')}<b>${figure(view.stats.bestKills, t('garage.record.chainKills', { count: num(view.stats.bestKills) }))}</b></div></div></section>`;

  const latest = MEDALS
    .filter((medal) => medal.group !== 'reasoning' && view.medals[medal.id])
    .sort((a, b) => (view.medals[b.id]?.last ?? 0) - (view.medals[a.id]?.last ?? 0))
    .slice(0, 8);
  const latestCard = `<section class="cot-record-card cot-record-latest">` +
    `<header class="cot-record-card-head">${uiIconSVG('gold', 15)}<strong>${t('garage.record.latestMedals')}</strong></header>` +
    (latest.length
      ? `<div class="cot-record-latest-row">${latest.map((medal) =>
        `<button type="button" class="cot-record-latest-medal" data-medal-tip="${medal.id}">${medalSVG(medal, 56)}` +
        `<span>${medalName(medal.id)}</span></button>`).join('')}</div>`
      : emptyState({ text: t('garage.record.noMedals'), className: 'cot-record-empty' })) +
    `</section>`;

  // batch 19/20 (2026-09-14): the campaign ladder's standing — operations cleared, stars, best push
  const ladder = campaignSummary();
  const front = frontlineSummary();
  const standing = front.attempts
    ? `<div class="cot-record-campaign-grid">` +
      `<div>${statLabel(t('garage.record.campaignOperations'), 'battleRecord')}<b>${num(ladder.cleared)}/${num(ladder.total)}</b></div>` +
      `<div>${statLabel(t('garage.record.campaignStars'), 'star')}<b>${num(ladder.stars)}/${num(ladder.maxStars)}</b></div>` +
      `<div>${statLabel(t('garage.record.campaignPush'), 'moveForward')}<b>${num(front.bestLine)}/${num(front.total)}</b></div>` +
      `<div>${statLabel(t('garage.record.campaignHeld'), 'shield')}<b>${num(front.held)}</b></div></div>`
    : emptyState({ text: t('garage.record.campaignNone'), className: 'cot-record-empty' });
  const campaign = `<section class="cot-record-card cot-record-campaign"><header class="cot-record-card-head">${uiIconSVG('battleRecord', 15)}` +
    `<strong>${t('garage.record.campaign')}</strong>${front.attempts ? `<small>${safe(t(`campaign.op.${ladder.next.id}.title`))}</small>` : ''}</header>${standing}</section>`;
  return `${career}<div class="cot-record-cards">${reasoningCard}${latestCard}</div>${campaign}`;
}

function medals(view: ServiceRecordView): string {
  const unseen = new Set(view.unseen);
  return GROUP_ORDER.map((group) => {
    const list = MEDALS.filter((medal) => medal.group === group);
    const earned = list.filter((medal) => view.medals[medal.id]).length;
    const cards = list.map((medal) => {
      const tally = view.medals[medal.id];
      const fresh = unseen.has(`medal:${medal.id}`);
      return `<article class="cot-record-medal${tally ? ' is-earned' : ' is-locked'}${fresh ? ' is-new' : ''}" data-medal="${medal.id}">` +
        `<div class="cot-record-medal-art"><button type="button" class="cot-record-medal-inspect" data-medal-tip="${medal.id}" aria-label="${safe(medalName(medal.id))}: ${safe(t('garage.record.requirement'))}">${medalSVG(medal, 88, { locked: !tally })}</button></div>` +
        `<div class="cot-record-medal-copy"><strong>${medalName(medal.id)}</strong>` +
        (tally
          ? `<span class="cot-record-medal-count">${t('garage.record.earnedCount', { count: num(tally.count) })}<small>${t('garage.record.firstEarned', { date: when(tally.first) })}</small></span>`
          : `<span class="cot-record-medal-count none cot-record-sr">${t('garage.record.notEarned')}</span>`) +
        `</div>${fresh ? tag(t('garage.record.new'), 'ok', 'cot-record-new') : ''}</article>`;
    }).join('');
    return `<section class="cot-record-medal-group" data-group="${group}">` +
      `<h3><span>${t(`service.group.${group}`)}</span><small>${num(earned)}/${num(list.length)}</small></h3>` +
      `<div class="cot-record-medal-grid">${cards}</div></section>`;
  }).join('');
}

function achievementCard(entry: AchievementProgress, fresh: boolean): string {
  const { def, tier, value, next } = entry;
  const target = next ?? def.tiers[2];
  // the bar reads as the count beside it does: the value toward the next tier's target
  const pct = next == null ? 100 : Math.max(0, Math.min(100, (value / Math.max(1, next)) * 100));
  return `<article class="cot-record-ach tier-${tier}${fresh ? ' is-new' : ''}" data-achievement="${def.id}">` +
    `<button type="button" class="cot-record-ach-art" data-achievement-tip="${def.id}" data-award-tier="${tier || 1}" aria-label="${safe(t(`service.achievement.${def.id}.name`))}">${achievementSVG(def, tier, 64)}</button>` +
    `<div class="cot-record-ach-copy"><div class="cot-record-ach-title"><strong>${t(`service.achievement.${def.id}.name`)}</strong>` +
    `${fresh ? tag(t('garage.record.new'), 'ok', 'cot-record-new') : ''}${tier ? `<span class="cot-record-tier">${ROMAN[tier]}</span>` : ''}</div>` +
    `<div class="cot-record-bar" role="progressbar" aria-label="${safe(t(`service.achievement.${def.id}.name`))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct.toFixed(1)}%"></i></div>` +
    `<div class="cot-record-ach-meta"><span>${num(Math.min(value, target))}/${num(target)}</span>` +
    `<span>${next == null ? t('garage.record.complete') : t('garage.record.nextTier', { tier: ROMAN[tier + 1] })}</span></div></div></article>`;
}

function achievements(view: ServiceRecordView): string {
  const unseen = view.unseen;
  return `<div class="cot-record-ach-grid">${view.achievements.map((entry) =>
    achievementCard(entry, unseen.some((key) => key.startsWith(`achievement:${entry.def.id}:`)))).join('')}</div>`;
}

function trace(battle: ServiceBattle, names: RecordViewNames): string {
  if (!battle.trace.length) return `<div class="cot-record-trace-empty">${t('garage.record.traceEmpty')}</div>`;
  const steps = battle.trace.map((step, index) => {
    const gap = index > 0 ? step.t - battle.trace[index - 1].t : Infinity;
    const linked = gap <= LINK_S;
    return `<li class="${linked ? 'linked' : ''}"><span class="cot-record-step">${t('garage.record.traceStep', { n: num(index + 1) })}</span>` +
      `<span class="cot-record-step-time">${clock(step.t)}</span>` +
      `<b class="cot-record-trace-vehicle">${vehicleArt(step.specId, 'cot-record-trace-icon')}${safe(step.specId ? names.vehicle(step.specId) : t('endScreen.enemyVehicle'))}</b>` +
      `<small>${uiIconSVG(killSourceIdentity(step.source)?.icon ?? killPresentation({ cause: step.cause, victimId: '' }).icon, 14)}${[
        step.distM ? `${num(step.distM)} m` : '', killPresentation({ cause: step.cause, drone: step.cause === 'drone', victimId: '' }).label,
        // (ac130-fx-228) the AC-130's kill names the aircraft that made it
        killSourceIdentity(step.source)?.source === 'ac130' ? killSourceIdentity(step.source)?.label : '']
        .filter(Boolean).join(' · ')}</small>` +
      `<span class="cot-record-step-gap">${linked ? t('garage.record.traceGap', { seconds: num(Math.round(gap)) }) : ''}</span></li>`;
  }).join('');
  return `<ol class="cot-record-trace">${steps}</ol>`;
}

/** How many of a battle's medals its row shows; the rest are counted, and the opened row lists them all. */
const ROW_MEDALS = 4;

function history(view: ServiceRecordView, names: RecordViewNames): string {
  if (!view.history.length) return emptyState({ text: t('garage.record.historyEmpty'), icon: 'clock', className: 'cot-record-empty' });
  const rows = view.history.map((battle) => {
    const awarded = battle.medals.map((id) => MEDALS.find((entry) => entry.id === id)).filter((medal) => medal != null);
    const rowMedals = awarded.slice(0, ROW_MEDALS).map((medal) => medalSVG(medal, 28)).join('') +
      (awarded.length > ROW_MEDALS ? `<small>+${num(awarded.length - ROW_MEDALS)}</small>` : '');
    const awards = awarded.length
      ? `<div class="cot-record-battle-awards">${awarded.map((medal) =>
        `<button type="button" data-medal-tip="${medal.id}" aria-label="${safe(medalName(medal.id))}">${medalSVG(medal, 40)}</button>`).join('')}</div>`
      : '';
    const accuracy = battle.shots ? `${num(battle.hits)}/${num(battle.shots)}` : '–';
    return `<li><details class="cot-record-battle result-${battle.result}">` +
      `<summary><span class="cot-record-battle-row">${battleVehicleArt(battle)}` +
      `<span class="cot-record-battle-what"><span class="cot-record-result">${resultLabel(battle.result)}</span><b>${safe(battleVehicleName(battle, names))}</b>` +
      `<small>${uiIconSVG(names.modeIcon(battle.mode), 11)}${safe(names.map(battle.mapId))} · ${safe(t(`playMenu.matchMode.${battle.mode}.label`))}</small>` +
      `<time>${safe(when(battle.at))}</time></span>` +
      `<span class="cot-record-battle-num kills"><b>${num(battle.kills)}</b><small>${statLabel(t('garage.record.kills'), 'skull')}</small></span>` +
      `<span class="cot-record-battle-num damage"><b>${num(battle.damage)}</b><small>${statLabel(t('garage.record.damage'), 'damage')}</small></span>` +
      `<span class="cot-record-battle-medals" aria-hidden="true">${rowMedals}</span>` +
      `<span class="cot-record-expand" aria-hidden="true">${uiIconSVG('chevronDown', 20)}</span></span></summary>` +
      `<div class="cot-record-battle-body"><div class="cot-record-battle-metrics">` +
      metric(t('garage.record.accuracy'), `${shotAccuracy(battle.hits, battle.shots)}%`, 'scope', accuracy) +
      metric(t('garage.record.duration'), clock(battle.durationS), 'clock') +
      metric(t('garage.record.longestChain'), num(battle.bestChain), 'statChain') +
      statTile({ label: t('garage.record.tankStatus'), value: t(battle.survived ? 'garage.record.survived' : 'garage.record.destroyedStatus'),
        icon: battle.survived ? 'shield' : 'skull', className: 'cot-record-metric' }) +
      `</div>${awards}<div class="cot-record-trace-head">${uiIconSVG('lightbulb', 13)}<strong>${t('garage.record.traceHeading')}</strong></div>` +
      `${trace(battle, names)}</div></details></li>`;
  }).join('');
  return `<ol class="cot-record-history">${rows}</ol>`;
}

/** The markup for one tab of the record. */
export function recordTabMarkup(tab: RecordTab, names: RecordViewNames, view: ServiceRecordView = getServiceRecord()): string {
  switch (tab) {
    case 'medals': return medals(view);
    case 'achievements': return achievements(view);
    case 'history': return history(view, names);
    default: return overview(view);
  }
}
