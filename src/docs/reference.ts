import data from './reference.generated.json';
import {getLocale, t} from '../ui/i18n.ts';
import {watchVehicleTakes} from './referenceTakes.ts';

const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, character =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
const text = (key: string): string => t(`docs.reference.${key}`);
const number = (value: number): string => new Intl.NumberFormat(getLocale(), {maximumFractionDigits:3}).format(value);
const pair = (label: string, value: unknown): string => `<div><dt>${text(label)}</dt><dd>${escape(value)}</dd></div>`;
/** A catalog name, or the raw value when the catalog has none (a nation or class added after the copy). */
const named = (key: string, fallback: string): string => { const value = t(key); return value === key ? fallback : value; };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function mountReference(article: HTMLElement, slug: string): void {
  // the tanks chapter's fleet reference: every production vehicle's base values (tools/generate-manual-reference.mjs)
  if (slug !== 'tanks') return;
  const section = document.createElement('section');
  section.className = 'topic-section manual-reference'; section.id = 'reference';
  section.innerHTML = `<h2>${text('vehicles.title')}</h2><p>${text('vehicles.intro')}</p>
    <label class="manual-search">${text('search')}<input type="search" autocomplete="off" placeholder="${text('searchHint')}"></label>
    <p class="manual-count" role="status" aria-live="polite"></p><div class="manual-records"></div>`;
  const records = section.querySelector<HTMLElement>('.manual-records')!;
  records.innerHTML = data.vehicles.map(v => {
    const systems = [v.smoke ? `${text('smoke')} (${v.smoke})` : '', v.lights ? text('lights') : '',
      v.roofGun ? text('roofGun') : '', v.missile ? text('missile') : '', v.suspension ? text('suspension') : ''].filter(Boolean);
    // the nation and the class by the reader's catalog (nation.*, docs.reference.class.*: the Filter panel's fleet.class.*
    // strings load only with the panel), the tier as the fleet writes it
    const nation = named(`nation.${v.nation}`, v.nation), role = named(`docs.reference.class.${v.role}`, v.role);
    const tier = t('killcam.tier', { tier: ROMAN[v.tier] ?? String(v.tier) });
    return `<details class="manual-record" data-vehicle="${escape(v.id)}" data-search="${escape(`${v.name} ${nation} ${role} ${v.nation} ${v.role}`)}">
      <summary><strong>${escape(v.name)}</strong><span>${escape(nation)} · ${escape(role)} · ${escape(tier)}</span></summary>
      <dl>${pair('hp',number(v.hp))}${pair('speed',`${number(v.speed)} / ${number(v.reverse)} km/h`)}
      ${pair('hull',`${number(v.hull)} °/s`)}${pair('turret',`${number(v.turret)} °/s`)}
      ${pair('dispersion',`${number(v.dispersion)} m / 100 m`)}${pair('aim',`${number(v.aim)} s`)}
      ${pair('reload',`${number(v.reload)} s`)}${pair('view',`${number(v.view)} m`)}</dl>
      <p>${escape(systems.join(' · '))}</p></details>`;
  }).join('');
  watchVehicleTakes(records); // an opened record shows the vehicle's own take (referenceTakes.ts)
  const input = section.querySelector<HTMLInputElement>('input')!, count = section.querySelector<HTMLElement>('.manual-count')!;
  const items = [...section.querySelectorAll<HTMLElement>('.manual-record')];
  const filter = (): void => {
    const query = input.value.trim().toLocaleLowerCase(); let shown = 0;
    for (const item of items) { item.hidden = !item.dataset.search!.toLocaleLowerCase().includes(query); if (!item.hidden) shown++; }
    count.textContent = `${shown} / ${items.length}`;
  };
  input.addEventListener('input',filter); filter(); article.append(section);
  if (location.hash === '#reference') section.scrollIntoView();
}
