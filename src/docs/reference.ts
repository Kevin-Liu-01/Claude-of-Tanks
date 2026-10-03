import data from './reference.generated.json';
import {getLocale, t} from '../ui/i18n.ts';

const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, character =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
const text = (key: string): string => t(`docs.reference.${key}`);
const number = (value: number): string => new Intl.NumberFormat(getLocale(), {maximumFractionDigits:3}).format(value);
const pair = (label: string, value: unknown): string => `<div><dt>${text(label)}</dt><dd>${escape(value)}</dd></div>`;

export function mountReference(article: HTMLElement, slug: string): void {
  if (!['vehicles','worlds','simulation'].includes(slug)) return;
  const section = document.createElement('section');
  section.className = 'topic-section manual-reference'; section.id = 'reference';
  section.innerHTML = `<h2>${text(`${slug}.title`)}</h2><p>${text(`${slug}.intro`)}</p>
    <label class="manual-search">${text('search')}<input type="search" autocomplete="off" placeholder="${text('searchHint')}"></label>
    <p class="manual-count" role="status" aria-live="polite"></p><div class="manual-records"></div>`;
  const records = section.querySelector<HTMLElement>('.manual-records')!;
  if (slug === 'vehicles') {
    records.innerHTML = data.vehicles.map(v => {
      const systems = [v.smoke ? `${text('smoke')} (${v.smoke})` : '', v.lights ? text('lights') : '',
        v.roofGun ? text('roofGun') : '', v.missile ? text('missile') : '', v.suspension ? text('suspension') : ''].filter(Boolean);
      return `<details class="manual-record" data-search="${escape(`${v.name} ${v.nation} ${v.role}`)}">
        <summary><strong>${escape(v.name)}</strong><span>${escape(v.nation.toUpperCase())} · ${escape(v.role)} · ${v.tier}</span></summary>
        <dl>${pair('hp',number(v.hp))}${pair('speed',`${number(v.speed)} / ${number(v.reverse)} km/h`)}
        ${pair('hull',`${number(v.hull)} °/s`)}${pair('turret',`${number(v.turret)} °/s`)}
        ${pair('dispersion',`${number(v.dispersion)} m / 100 m`)}${pair('aim',`${number(v.aim)} s`)}
        ${pair('reload',`${number(v.reload)} s`)}${pair('view',`${number(v.view)} m`)}</dl>
        <p>${escape(systems.join(' · '))}</p></details>`;
    }).join('');
  } else if (slug === 'worlds') {
    records.classList.add('manual-atlas');
    records.innerHTML = data.maps.map(m => `<details class="manual-record" data-search="${escape(m.name)}">
      <summary><img src="/maps/thumbs/${m.id}.webp" width="512" height="288" loading="lazy" alt="${escape(m.name)}">
      <strong>${escape(m.name)}</strong><span>${text(m.random ? 'randomPool' : 'explicitMap')}</span></summary>
      <a href="/maps/${m.id}.webp" target="_blank" rel="noopener">${text('fullMap')}</a></details>`).join('');
  } else {
    records.innerHTML = data.modes.map(m => `<details class="manual-record" data-search="${escape(t(`playMenu.matchMode.${m.id}.label`))}" open>
      <summary><strong>${escape(t(`playMenu.matchMode.${m.id}.label`))}</strong></summary><p>${escape(t(`playMenu.matchMode.${m.id}.desc`))}</p><dl>
      ${pair('clock',m.clock == null ? text('none') : `${m.clock / 60} min`)}
      ${pair('respawn',m.respawn == null ? text('none') : `${m.respawn} s`)}
      ${pair('score',m.score ?? text('objective'))}${pair('speedScale',`${number(m.speed)}×`)}
      ${pair('hpScale',`${number(m.hp)}×`)}${pair('reloadScale',`${number(m.reload)}×`)}
      ${pair('equipment',m.equipment)}${pair('jump',m.jump == null ? text('none') : `${m.jump} m/s`)}</dl></details>`).join('');
  }
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
