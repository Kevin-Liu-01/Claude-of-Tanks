import { battleMapArt } from './battleReportMedia.ts';
import { createModal } from './modal.ts';
import { t } from './i18n.ts';
import { createRichTooltip } from './richTooltip.ts';
import { getServiceRecord, markServiceRecordSeen } from '../game/serviceRecord.ts';
import { awardDetails } from './awardDetails.ts';
import { listReplays } from '../game/replay/replayStore.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import { RECORD_TABS, recordSummary, recordTabForKey, recordTabMarkup, type RecordReplays, type RecordTab, type RecordViewNames } from './serviceRecordView.ts';

/**
 * `emit` (replay-system-275): the Garage's bus emit, for the replays tab's Watch and Download (ui:replayWatch and
 * ui:replayDownload with the recording's id); without it those buttons do nothing.
 */
export function createServiceRecordDialog(names: RecordViewNames, onClose: () => void,
  emit?: (event: string, payload: RuntimeValue) => void) {
  let selected: RecordTab = 'overview', unseen: string[] = [];
  // the saved recordings load as the replays tab first shows in an open (the store is async; it fails soft to none)
  let saved: RecordReplays = 'loading', replaysTicket = 0, replaysAsked = false;
  const modal = createModal({ surface:'service-record', title:t('garage.record.heading'), size:'wide', closeLabel:t('garage.record.close'),
    onClose:()=>{ tooltip.hide(); onClose(); } });
  modal.root.classList.add('cot-service-record');
  modal.panel.id = 'cot-record-modal'; modal.panel.classList.add('cot-record-dialog'); modal.panel.tabIndex = -1;
  // The header carries the last battle as a plate (its map behind, its tank beside the result); the X closes, so
  // the dialog keeps no footer.
  const plate = document.createElement('div'); plate.className = 'cot-record-plate-host';
  modal.header.insertBefore(plate, modal.closeButton);
  const tabs = document.createElement('div'); tabs.className = 'cot-record-tabs'; tabs.setAttribute('role','tablist');
  tabs.setAttribute('aria-label',t('garage.record.tabsAria'));
  tabs.innerHTML = RECORD_TABS.map(tab=>`<button class="cot-record-tab" type="button" role="tab" id="cot-record-tab-${tab}" data-record-tab="${tab}" aria-controls="cot-record-panel"><span>${t(`garage.record.tab.${tab}`)}</span><small></small></button>`).join('');
  const body = document.createElement('div'); body.className = 'cot-record-body'; body.id='cot-record-panel';
  body.setAttribute('role','tabpanel'); body.tabIndex=0;
  modal.body.append(tabs,body);
  const tooltip=createRichTooltip(body,'[data-medal-tip],[data-achievement-tip]',awardDetails);
  function render(){
    tooltip.hide();
    if(selected==='replays'&&!replaysAsked)loadReplays();
    const view={...getServiceRecord(),unseen}, totals=recordSummary(names,view,saved);plate.innerHTML=totals.plate;
    const art=battleMapArt(view.history[0]?.mapId);
    modal.root.style.setProperty('--record-map',art?`url("${art}")`:'none');
    modal.root.classList.toggle('no-map',!art);
    for(const button of tabs.querySelectorAll<HTMLButtonElement>('button')){
      const tab=button.dataset.recordTab as RecordTab, active=tab===selected;
      const prefix=tab==='medals'?'medal:':tab==='achievements'?'achievement:':null;
      button.classList.toggle('has-new',!!prefix&&unseen.some(key=>key.startsWith(prefix)));
      button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
      button.querySelector('small')!.textContent=totals.counts[tab];
    }
    body.setAttribute('aria-labelledby',`cot-record-tab-${selected}`);body.innerHTML=recordTabMarkup(selected,names,view,saved);body.scrollTop=0;
  }
  function loadReplays(){
    replaysAsked=true;const ticket=++replaysTicket;
    void listReplays().catch(()=>[]).then(list=>{if(ticket!==replaysTicket)return;saved=list;if(modal.isOpen())render();});
  }
  const select=(tab:RecordTab,focus=false)=>{selected=tab;render();if(focus)tabs.querySelector<HTMLButtonElement>(`[data-record-tab="${tab}"]`)?.focus();};
  tabs.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLElement>('[data-record-tab]');if(button)select(button.dataset.recordTab as RecordTab);});
  tabs.addEventListener('keydown',event=>{const next=recordTabForKey(event.key,selected);if(next){event.preventDefault();select(next,true);}});
  body.addEventListener('click',event=>{
    const target=event.target as Element, watch=target.closest<HTMLElement>('[data-replay-watch]'), download=target.closest<HTMLElement>('[data-replay-download]');
    if(!emit||(!watch&&!download))return;
    emit('ui:click',{});
    // Watch leaves the Garage for the viewer, so the record closes first; Download keeps it open
    if(watch){modal.close({restoreFocus:false});emit('ui:replayWatch',{id:Number(watch.dataset.replayWatch)});}
    else emit('ui:replayDownload',{id:Number(download!.dataset.replayDownload)});
  });
  // Shared modal owns Tab/Escape. Keep all other keys off garage shortcuts.
  modal.panel.addEventListener('keydown',event=>event.stopPropagation());
  return {
    isOpen:modal.isOpen,
    // the dialog itself takes focus on open (no ring lands on the X); Tab moves on to the X and the tabs
    open(trigger:HTMLElement){unseen=getServiceRecord().unseen;markServiceRecordSeen();saved='loading';replaysAsked=false;replaysTicket++;render();modal.open({trigger});
      requestAnimationFrame(()=>{if(modal.isOpen())modal.panel.focus({preventScroll:true});});},
    close:modal.close,
    refresh(){if(modal.isOpen())render();},
    dispose(){tooltip.dispose();modal.dispose();},
  };
}
