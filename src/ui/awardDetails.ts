import { MEDALS, ACHIEVEMENTS, getServiceRecord } from '../game/serviceRecord.ts';
import { medalSVG, achievementSVG } from './medalArt.ts';
import { t, formatNumber, formatDate } from './i18n.ts';
/** Canonical award requirements shared by the record and battle debrief. */
export function awardDetails(target: HTMLElement): HTMLElement | null {
  const medal=MEDALS.find(m=>m.id===target.dataset.medalTip);
  const achievement=ACHIEVEMENTS.find(a=>a.id===target.dataset.achievementTip);
  if(!medal&&!achievement)return null;
  const view=getServiceRecord(), tally=medal?view.medals[medal.id]:null;
  const tier=Math.max(1,Math.min(3,Number(target.dataset.awardTier)||1));
  const card=document.createElement('div');
  const add=(tag:'div'|'small'|'h3'|'p',cls:string,text?:string)=>{const el=document.createElement(tag);el.className=cls;if(text)el.textContent=text;card.append(el);return el;};
  add('div','tooltip-art').innerHTML=medal?medalSVG(medal,64):achievementSVG(achievement!,tier,64);
  add('small','tooltip-kicker',medal?t(`service.group.${medal.group}`):t('garage.record.tab.achievements'));
  add('h3','',medal?t(`service.medal.${medal.id}.name`):t(`service.achievement.${achievement!.id}.name`));
  add('p','tooltip-meta',medal?(tally?t('garage.record.awardedCount',{count:formatNumber(tally.count)}):t(target.dataset.awardEarned==='true'?'endScreen.awardedThisBattle':'garage.record.notEarned')):['I','II','III'][tier-1]);
  const requirement=add('div','tooltip-requirement');
  const label=document.createElement('strong');label.textContent=t('garage.record.requirement');
  const desc=document.createElement('p');desc.textContent=medal?t(`service.medal.${medal.id}.desc`):t(`service.achievement.${achievement!.id}.desc`,{target:formatNumber(achievement!.tiers[tier-1])});
  requirement.append(label,desc);
  if(tally?.first)add('p','tooltip-meta',t('garage.record.firstEarned',{date:formatDate(new Date(tally.first),{month:'short',day:'numeric',year:'numeric'})}));
  return card;
}
