import { campaignSummary } from '../game/campaignOperations.ts';
import { frontlineSummary } from '../game/campaignProgress.ts';
import { getPlayerRecord } from '../game/profile.ts';
import {
  MEDALS, getServiceRecord,
  type AchievementProgress, type MedalGroup, type ServiceBattle, type ServiceRecordView,
} from '../game/serviceRecord.ts';
import { formatDate, formatNumber, t } from './i18n.ts';
import { achievementSVG, medalSVG } from './medalArt.ts';
import { uiIconSVG } from './uiIcons.ts';
// The garage's Service Record: career totals, the medal case, achievement
// tiers and the last battles, each with its kills laid out as a chain of
// thought. Rendered on demand into the record dialog (garage.ts owns the
// dialog, its tabs and focus); everything here reads local records only.

export type RecordTab = 'overview' | 'medals' | 'achievements' | 'history';
export const RECORD_TABS: readonly RecordTab[] = ['overview', 'medals', 'achievements', 'history'];

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

/** Header chips and tab counts for the current record. */
export function recordSummary(view: ServiceRecordView = getServiceRecord()): { chips: string; counts: Record<RecordTab, string> } {
  const distinct = Object.keys(view.medals).length;
  const chips =
    `<span class="cot-record-chip">${uiIconSVG('gold', 13)}<b>${num(view.medalsEarned)}</b><small>${t('garage.record.medalsEarned')}</small></span>` +
    `<span class="cot-record-chip">${uiIconSVG('stamp', 13)}<b>${num(view.tiersReached)} / ${num(view.achievements.length * 3)}</b>` +
    `<small>${t('garage.record.tiersReached')}</small></span>` +
    `<span class="cot-record-chip signature">${uiIconSVG('lightbulb', 13)}<b>${num(view.stats.bestChain)}</b><small>${t('garage.record.longestChain')}</small></span>`;
  return {
    chips,
    counts: {
      overview: '',
      medals: `${num(distinct)}/${num(MEDALS.length)}`,
      achievements: `${num(view.tiersReached)}/${num(view.achievements.length * 3)}`,
      history: view.history.length ? num(view.history.length) : '',
    },
  };
}

function metric(label: string, value: string, note: string): string {
  return `<div class="cot-record-metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
}

function overview(view: ServiceRecordView, names: RecordViewNames): string {
  const record = getPlayerRecord();
  const pct = record.matches ? Math.round((record.wins / record.matches) * 100) : 0;
  const avgDamage = record.matches ? Math.round(record.damage / record.matches) : 0;
  const avgKills = record.matches ? record.kills / record.matches : 0;
  const career = `<div class="cot-record-overview">` +
    `<div class="cot-record-ring" style="--record-pct:${pct}"><div class="cot-record-ring-copy">` +
    `<strong>${record.matches ? `${pct}%` : '—'}</strong><span>${t('garage.record.winrate')}</span></div></div>` +
    `<div><div class="cot-record-outcomes">` +
    `<div class="cot-record-outcome win"><span>${t('garage.record.victories')}</span><strong>${num(record.wins)}</strong></div>` +
    `<div class="cot-record-outcome"><span>${t('garage.record.defeats')}</span><strong>${num(record.losses)}</strong></div>` +
    `<div class="cot-record-outcome"><span>${t('garage.record.draws')}</span><strong>${num(record.draws)}</strong></div></div>` +
    `<div class="cot-record-metrics">` +
    metric(t('garage.record.battles'), num(record.matches), t('garage.record.completedLocally')) +
    metric(t('garage.record.destroyed'), num(record.kills), `${avgKills.toFixed(2)} ${t('garage.record.perBattle')}`) +
    metric(t('garage.record.totalDamage'), num(record.damage), t('garage.record.careerOutput')) +
    metric(t('garage.record.avgDamage'), num(avgDamage), t('garage.record.perBattle')) +
    metric(t('garage.record.bestDamage'), num(record.bestDamage), t('garage.record.singleBattle')) +
    metric(t('garage.record.longestKill'), view.stats.longestKillM ? `${num(view.stats.longestKillM)} m` : '—', t('garage.record.singleShot')) +
    `</div></div></div>`;

  // The reasoning set leads the record: the commander's own Chain of Thought.
  const reasoning = MEDALS.filter((medal) => medal.group === 'reasoning');
  const reasoningTiles = reasoning.map((medal) => {
    const tally = view.medals[medal.id];
    return `<div class="cot-record-reason${tally ? ' is-earned' : ''}">${medalSVG(medal, 46, { locked: !tally })}` +
      `<div><strong>${medalName(medal.id)}</strong><small>${tally ? `×${num(tally.count)}` : t('garage.record.notEarned')}</small></div></div>`;
  }).join('');
  const reasoningCard = `<section class="cot-record-card cot-record-reasoning">` +
    `<header class="cot-record-card-head">${uiIconSVG('lightbulb', 15)}<strong>${t('service.group.reasoning')}</strong>` +
    `<small>${t('garage.record.reasoningNote')}</small></header>` +
    `<div class="cot-record-reason-row">${reasoningTiles}</div>` +
    `<div class="cot-record-reason-stats">` +
    `<span>${t('garage.record.longestChain')}<b>${t('garage.record.chainKills', { count: num(view.stats.bestChain) })}</b></span>` +
    `<span>${t('garage.record.bestStreak')}<b>${t('garage.record.streakRounds', { count: num(view.stats.bestStreak) })}</b></span>` +
    `<span>${t('garage.record.bestKills')}<b>${num(view.stats.bestKills)}</b></span></div></section>`;

  const latest = MEDALS
    .filter((medal) => view.medals[medal.id])
    .sort((a, b) => (view.medals[b.id]?.last ?? 0) - (view.medals[a.id]?.last ?? 0))
    .slice(0, 8);
  const latestCard = `<section class="cot-record-card cot-record-latest">` +
    `<header class="cot-record-card-head">${uiIconSVG('gold', 15)}<strong>${t('garage.record.latestMedals')}</strong></header>` +
    (latest.length
      ? `<div class="cot-record-latest-row">${latest.map((medal) =>
        `<div class="cot-record-latest-medal" title="${safe(medalName(medal.id))}">${medalSVG(medal, 34)}` +
        `<span>${medalName(medal.id)}</span></div>`).join('')}</div>`
      : `<div class="cot-record-empty">${t('garage.record.noMedals')}</div>`) +
    `</section>`;

  let lastBattle = `<div class="cot-record-empty">${t('garage.record.empty')}</div>`;
  if (record.lastBattle) {
    const last = record.lastBattle;
    lastBattle = `<div class="cot-last-battle"><div class="cot-last-battle-head">` +
      `<strong>${safe(resultLabel(last.result))}</strong><time>${safe(when(last.completedAt))}</time></div>` +
      `<div class="cot-last-battle-grid">` +
      `<div><span>${t('garage.record.deployment')}</span><b>${safe(names.vehicle(last.vehicleId))} · ${safe(names.map(last.mapId))}</b></div>` +
      `<div><span>${t('garage.record.damage')}</span><b>${num(last.damage)}</b></div>` +
      `<div><span>${t('garage.record.kills')}</span><b>${num(last.kills)}</b></div>` +
      `<div><span>${t('garage.record.duration')}</span><b>${clock(last.durationS)}</b></div></div></div>`;
  }
  // batch 19/20 (2026-09-14): the campaign ladder's standing — operations cleared, stars, best push
  const ladder = campaignSummary();
  const front = frontlineSummary();
  const standing = front.attempts
    ? `<div class="cot-last-battle-grid">` +
      `<div><span>${t('garage.record.campaignOperations')}</span><b>${num(ladder.cleared)} / ${num(ladder.total)}</b></div>` +
      `<div><span>${t('garage.record.campaignStars')}</span><b>${num(ladder.stars)} / ${num(ladder.maxStars)}</b></div>` +
      `<div><span>${t('garage.record.campaignPush')}</span><b>${num(front.bestLine)} / ${num(front.total)}</b></div>` +
      `<div><span>${t('garage.record.campaignHeld')}</span><b>${num(front.held)}</b></div></div>`
    : `<div class="cot-record-empty">${t('garage.record.campaignNone')}</div>`;
  const campaign = `<div class="cot-last-battle cot-record-campaign"><div class="cot-last-battle-head">` +
    `<strong>${t('garage.record.campaign')}</strong><time>${safe(t(`campaign.op.${ladder.next.id}.title`))}</time></div>${standing}</div>`;
  return `${career}<div class="cot-record-cards">${reasoningCard}${latestCard}</div>${lastBattle}${campaign}`;
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
        `<div class="cot-record-medal-art">${medalSVG(medal, 52, { locked: !tally })}</div>` +
        `<div class="cot-record-medal-copy"><strong>${medalName(medal.id)}</strong>` +
        `<p>${t(`service.medal.${medal.id}.desc`)}</p>` +
        (tally
          ? `<span class="cot-record-medal-count">×${num(tally.count)}<small>${t('garage.record.firstEarned', { date: when(tally.first) })}</small></span>`
          : `<span class="cot-record-medal-count none">${t('garage.record.notEarned')}</span>`) +
        `</div>${fresh ? `<span class="cot-record-new">${t('garage.record.new')}</span>` : ''}</article>`;
    }).join('');
    return `<section class="cot-record-medal-group" data-group="${group}">` +
      `<h3><span>${t(`service.group.${group}`)}</span><small>${num(earned)} / ${num(list.length)}</small></h3>` +
      `<div class="cot-record-medal-grid">${cards}</div></section>`;
  }).join('');
}

function achievementCard(entry: AchievementProgress, fresh: boolean): string {
  const { def, tier, value, next } = entry;
  const target = next ?? def.tiers[2];
  const floor = tier > 0 ? def.tiers[tier - 1] : 0;
  const pct = next == null ? 100 : Math.max(0, Math.min(100, ((value - floor) / Math.max(1, next - floor)) * 100));
  return `<article class="cot-record-ach tier-${tier}${fresh ? ' is-new' : ''}" data-achievement="${def.id}">` +
    `<div class="cot-record-ach-art">${achievementSVG(def, tier, 42)}</div>` +
    `<div class="cot-record-ach-copy"><div class="cot-record-ach-title"><strong>${t(`service.achievement.${def.id}.name`)}</strong>` +
    `<span class="cot-record-tier">${tier ? ROMAN[tier] : '—'}</span></div>` +
    `<p>${t(`service.achievement.${def.id}.desc`, { target: num(target) })}</p>` +
    `<div class="cot-record-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct.toFixed(1)}%"></i></div>` +
    `<div class="cot-record-ach-meta"><span>${num(Math.min(value, target))} / ${num(target)}</span>` +
    `<span>${next == null ? t('garage.record.complete') : t('garage.record.nextTier', { tier: ROMAN[tier + 1] })}</span></div></div>` +
    `${fresh ? `<span class="cot-record-new">${t('garage.record.new')}</span>` : ''}</article>`;
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
      `<b>${safe(step.specId ? names.vehicle(step.specId) : t('endScreen.enemyVehicle'))}</b>` +
      `<small>${[step.distM ? `${num(step.distM)} m` : '', step.cause === 'ammorack' ? t('garage.record.causeAmmo') : step.cause === 'ram' ? t('garage.record.causeRam') : '']
        .filter(Boolean).join(' · ')}</small>` +
      `<span class="cot-record-step-gap">${linked ? t('garage.record.traceGap', { seconds: num(Math.round(gap)) }) : ''}</span></li>`;
  }).join('');
  return `<ol class="cot-record-trace">${steps}</ol>`;
}

function history(view: ServiceRecordView, names: RecordViewNames): string {
  if (!view.history.length) return `<div class="cot-record-empty">${t('garage.record.historyEmpty')}</div>`;
  const rows = view.history.map((battle) => {
    const medalArt = battle.medals.map((id) => {
      const medal = MEDALS.find((entry) => entry.id === id);
      return medal ? `<span title="${safe(medalName(id))}">${medalSVG(medal, 20)}</span>` : '';
    }).join('');
    const accuracy = battle.shots ? `${num(battle.hits)}/${num(battle.shots)}` : '—';
    return `<li><details class="cot-record-battle result-${battle.result}">` +
      `<summary><span class="cot-record-battle-row"><span class="cot-record-result">${resultLabel(battle.result)}</span>` +
      `<span class="cot-record-battle-what"><b>${safe(names.vehicle(battle.vehicleId))}</b>` +
      `<small>${uiIconSVG(names.modeIcon(battle.mode), 11)}${safe(names.map(battle.mapId))} · ${safe(t(`playMenu.matchMode.${battle.mode}.label`))}</small></span>` +
      `<span class="cot-record-battle-num kills"><b>${num(battle.kills)}</b><small>${t('garage.record.kills')}</small></span>` +
      `<span class="cot-record-battle-num damage"><b>${num(battle.damage)}</b><small>${t('garage.record.damage')}</small></span>` +
      `<span class="cot-record-battle-medals">${medalArt}</span>` +
      `<time>${safe(when(battle.at))}</time></span></summary>` +
      `<div class="cot-record-battle-body"><div class="cot-record-trace-head">${uiIconSVG('lightbulb', 13)}<strong>${t('garage.record.traceHeading')}</strong>` +
      `<span>${t('garage.record.accuracy')} ${accuracy} · ${t('garage.record.duration')} ${clock(battle.durationS)}</span></div>` +
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
    default: return overview(view, names);
  }
}
