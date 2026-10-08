import { t } from '../ui/i18n.ts';
import { uiIconSVG } from '../ui/uiIcons.ts';
import { technicalLabel } from './catalog.ts';
import type { DamageAction, DamageLab, DamageTarget } from './damageLab.ts';
import type { ArmorIntersection } from '../sim/armor.ts';

const kinds = ['era', 'equipment', 'module', 'crew'] as const;
const icons = { era: 'armorFlashlight', equipment: 'shield', module: 'engine', crew: 'crew' };
function targetLabel(target: DamageTarget): string {
  if (target.module) return t(`garage.module.${target.module}`);
  if (target.kind === 'crew') return t(`garage.crew.${target.name}`);
  return technicalLabel(target.name);
}
function button(label: string, icon: string, action: string): HTMLButtonElement {
  const element = document.createElement('button'); element.type = 'button'; element.dataset.damageAction = action;
  element.innerHTML = uiIconSVG(icon, 16); element.append(document.createTextNode(label)); return element;
}

export function createDamageWorkbench(host: HTMLElement, callbacks: {
  select(target: DamageTarget): void;
  change(action: string, target?: DamageTarget): void;
  overlay(): void;
  copy(): void;
}) {
  let lab: DamageLab | null = null;
  let kind: DamageTarget['kind'] = 'era';
  let hitboxes = false, probe = false;
  const panel = document.createElement('section'); panel.className = 'dossier-section damage-workbench';
  panel.innerHTML = `<div class="section-label"><span>${t('gallery.damage.heading')}</span></div><p class="damage-help"></p><div class="damage-kinds"></div><div class="damage-targets"></div><p class="damage-condition" role="status" aria-live="polite"></p><div class="damage-actions"></div><div class="damage-tools"></div><ol class="damage-ray" aria-live="polite"></ol>`;
  host.append(panel);
  const find = <T extends HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const help = find('.damage-help'), tabs = find('.damage-kinds'), targets = find('.damage-targets');
  const status = find('.damage-condition'), actions = find('.damage-actions'), tools = find('.damage-tools'), ray = find('.damage-ray');
  function refresh(): void {
    help.textContent = t(probe ? 'gallery.damage.probeHelp' : 'gallery.damage.help');
    if (!lab) { panel.hidden = true; return; }
    panel.hidden = false;
    const activeKey = (document.activeElement as HTMLElement | null)?.dataset.damageAction;
    const activeTarget = (document.activeElement as HTMLElement | null)?.dataset.damageTarget;
    const selected = lab.targets.find(target => target.key === lab!.selected);
    tabs.replaceChildren(...kinds.map(value => {
      const count = lab!.targets.filter(target => target.kind === value).length;
      const item = button(`${t(`gallery.damage.kind.${value}`)} · ${count}`, icons[value], `kind:${value}`);
      item.setAttribute('aria-pressed', String(kind === value)); item.disabled = !count; return item;
    }));
    targets.replaceChildren(...lab.targets.filter(target => target.kind === kind).map(target => {
      const item = document.createElement('button'); item.type = 'button'; item.dataset.damageTarget = target.key;
      item.setAttribute('aria-pressed', String(lab!.selected === target.key)); item.dataset.condition = lab!.condition(target);
      const label = document.createElement('span'); label.textContent = targetLabel(target);
      const state = document.createElement('small'); state.textContent = t(`gallery.damage.state.${lab!.condition(target)}`);
      item.append(label, state); return item;
    }));
    status.textContent = lab.combat.destroyed ? t('gallery.damage.wreckNotice') : selected ? `${targetLabel(selected)} · ${t(`gallery.damage.state.${lab.condition(selected)}`)}` : t('gallery.damage.empty');
    const choices: Array<[DamageAction, string]> = selected?.plate
      ? [['detonate', 'damage'], ['remove', 'trash'], ['repair', 'repair']]
      : selected?.kind === 'crew' ? [['disable', 'close'], ['repair', 'repair']]
      : [['damage', 'damage'], ['disable', 'close'], ['repair', 'repair']];
    actions.replaceChildren(...choices.map(([action, icon]) => {
      const item = button(t(`gallery.damage.${action}`), icon, action);
      item.disabled = !selected || lab!.combat.destroyed || (action === 'detonate' && selected.kind !== 'era')
        || (action === 'repair' ? lab!.condition(selected) === 'ok' : selected.plate ? lab!.condition(selected) === 'removed' : false);
      return item;
    }));
    tools.replaceChildren();
    for (const [action, icon] of [['hitboxes', 'graphics'], ['probe', 'scope'], ['removeAll', 'trash'], ['wreck', 'ammoRack'], ['reset', 'rematch'], ['copy', 'copy']]) {
      const item = button(t(`gallery.damage.${action}`), icon, action);
      if (action === 'hitboxes' || action === 'probe') item.setAttribute('aria-pressed', String(action === 'hitboxes' ? hitboxes : probe));
      if (action === 'wreck' || action === 'probe' || action === 'hitboxes') item.disabled = lab.combat.destroyed;
      if (action === 'removeAll') item.disabled = lab.combat.destroyed || !lab.targets.some(target => target.plate && lab!.condition(target) !== 'removed');
      tools.append(item);
    }
    restoreFocus(activeKey, activeTarget);
  }
  function restoreFocus(activeKey: string | undefined, activeTarget: string | undefined): void {
    const focus = activeTarget ? panel.querySelector<HTMLButtonElement>(`[data-damage-target="${CSS.escape(activeTarget)}"]`)
      : activeKey ? panel.querySelector<HTMLButtonElement>(`[data-damage-action="${CSS.escape(activeKey)}"]`) : null;
    if (focus && !focus.disabled) focus.focus({ preventScroll: true });
  }
  function select(key: string, navigate = true): void {
    const target = lab?.targets.find(part => part.key === key); if (!target || !lab) return;
    kind = target.kind; lab.select(key); refresh(); if (navigate) callbacks.select(target);
  }
  function act(action: string): void {
    if (!lab) return;
    if (action.startsWith('kind:')) { const target = lab.targets.find(part => part.kind === action.slice(5)); if (target) select(target.key); return; }
    if (action === 'hitboxes') { hitboxes = !hitboxes; refresh(); callbacks.overlay(); return; }
    if (action === 'probe') { probe = !probe; ray.replaceChildren(); refresh(); return; }
    if (action === 'copy') { callbacks.copy(); return; }
    const target = lab.targets.find(part => part.key === lab!.selected);
    if (action === 'reset') lab.reset();
    else if (action === 'wreck') { probe = false; lab.destroy(); }
    else if (action === 'removeAll') lab.removeAll();
    else if (!lab.apply(action as DamageAction)) return;
    ray.replaceChildren(); refresh(); callbacks.change(action, target);
  }
  panel.addEventListener('click', event => {
    const element = (event.target as Element).closest<HTMLButtonElement>('button');
    if (element?.dataset.damageTarget) select(element.dataset.damageTarget);
    else if (element?.dataset.damageAction) act(element.dataset.damageAction);
  });
  return {
    get hitboxes() { return hitboxes; }, get probe() { return probe; },
    attach(value: DamageLab | null) { lab = value; ray.replaceChildren(); if (lab) kind = lab.targets[0]?.kind || 'module'; refresh(); },
    select, refresh,
    showTrace(hits: readonly ArmorIntersection[]) {
      ray.replaceChildren();
      const title = document.createElement('li'); title.textContent = t(hits.length ? 'gallery.damage.traceResult' : 'gallery.damage.traceMiss', { count: hits.length }); ray.append(title);
      for (const hit of hits.slice(0, 16)) {
        const item = document.createElement('li');
        const label = hit.kind === 'plate' ? technicalLabel(hit.plate.name) : t(`garage.${hit.kind}.${hit.kind === 'module' ? hit.module : hit.crew}`);
        item.textContent = hit.kind === 'plate' ? `${label} · ${hit.plate.physicalMm} mm · ${hit.impactAngleDeg.toFixed(0)}°` : label;
        ray.append(item);
      }
    },
  };
}
