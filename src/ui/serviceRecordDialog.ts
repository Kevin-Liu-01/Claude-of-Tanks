import { createModal } from './modal.ts';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
import { createRichTooltip } from './richTooltip.ts';
import { getServiceRecord, markServiceRecordSeen } from '../game/serviceRecord.ts';
import { awardDetails } from './awardDetails.ts';
import { RECORD_TABS, recordSummary, recordTabForKey, recordTabMarkup, type RecordTab, type RecordViewNames } from './serviceRecordView.ts';

const TAB_ICONS = { overview: 'battleRecord', medals: 'gold', achievements: 'stamp', history: 'clock' } as const;
export function createServiceRecordDialog(names: RecordViewNames, onClose: () => void) {
  let selected: RecordTab = 'overview', unseen: string[] = [];
  const modal = createModal({ title:t('garage.record.heading'), eyebrow:t('garage.record.eyebrow'),
    subtitle:t('garage.record.description'), size:'wide', closeLabel:t('garage.record.close'),
    onClose:()=>{ tooltip.hide(); onClose(); } });
  modal.root.classList.add('cot-service-record');
  modal.panel.id = 'cot-record-modal'; modal.panel.classList.add('cot-record-dialog');
  const summary = document.createElement('div'); summary.className = 'cot-record-summary';
  const tabs = document.createElement('div'); tabs.className = 'cot-record-tabs'; tabs.setAttribute('role','tablist');
  tabs.setAttribute('aria-label',t('garage.record.tabsAria'));
  tabs.innerHTML = RECORD_TABS.map(tab=>`<button class="cot-modal__button" type="button" role="tab" id="cot-record-tab-${tab}" data-record-tab="${tab}" aria-controls="cot-record-panel"><span>${uiIconSVG(TAB_ICONS[tab],18)}${t(`garage.record.tab.${tab}`)}</span><small></small></button>`).join('');
  const body = document.createElement('div'); body.className = 'cot-record-body'; body.id='cot-record-panel';
  body.setAttribute('role','tabpanel'); body.tabIndex=0;
  modal.body.append(summary,tabs,body);
  const note=document.createElement('span'); note.className='cot-record-footnote';note.textContent=t('garage.record.inspectHint');modal.footer.append(note);
  const close=document.createElement('button');close.type='button';close.className='cot-modal__button';close.textContent=t('garage.record.close');close.onclick=()=>modal.close();modal.footer.append(close);
  const tooltip=createRichTooltip(body,'[data-medal-tip],[data-achievement-tip]',awardDetails);
  function render(){
    tooltip.hide();
    const view={...getServiceRecord(),unseen}, totals=recordSummary(view);summary.innerHTML=totals.chips;
    for(const button of tabs.querySelectorAll<HTMLButtonElement>('button')){
      const tab=button.dataset.recordTab as RecordTab, active=tab===selected;
      const prefix=tab==='medals'?'medal:':tab==='achievements'?'achievement:':null;
      button.classList.toggle('has-new',!!prefix&&unseen.some(key=>key.startsWith(prefix)));
      button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
      button.querySelector('small')!.textContent=totals.counts[tab];
    }
    body.setAttribute('aria-labelledby',`cot-record-tab-${selected}`);body.innerHTML=recordTabMarkup(selected,names,view);body.scrollTop=0;
  }
  const select=(tab:RecordTab,focus=false)=>{selected=tab;render();if(focus)tabs.querySelector<HTMLButtonElement>(`[data-record-tab="${tab}"]`)?.focus();};
  tabs.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLElement>('[data-record-tab]');if(button)select(button.dataset.recordTab as RecordTab);});
  tabs.addEventListener('keydown',event=>{const next=recordTabForKey(event.key,selected);if(next){event.preventDefault();select(next,true);}});
  // Shared modal owns Tab/Escape. Keep all other keys off garage shortcuts.
  modal.panel.addEventListener('keydown',event=>event.stopPropagation());
  return {
    isOpen:modal.isOpen,
    open(trigger:HTMLElement){unseen=getServiceRecord().unseen;markServiceRecordSeen();render();modal.open({trigger});},
    close:modal.close,
    refresh(){if(modal.isOpen())render();},
    dispose(){tooltip.dispose();modal.dispose();},
  };
}
