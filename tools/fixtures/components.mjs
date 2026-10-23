// The component sheet (brand-ui SPEC §6, BUI-F5): every shared component in every state, for blind critics and visual
// diffs. Dev only (tools/fixtures/components.html); never shipped. ?lang=zh-CN renders the Chinese catalog.
import '../../src/ui/tokens/tokens.css';
import '../../src/ui/motion.css';
import {
  button, chip, ensureComponentStyles, keycap, scaleCells, segmented, statRow, tabs, tag, toggle, vehicle, wireRoving,
} from '../../src/ui/components/components.ts';
import { t } from '../../src/ui/i18n.ts';

ensureComponentStyles();
const section = (title, body) => `<section><h2>${title}</h2><div class="row">${body}</div></section>`;
const variants = ['primary', 'secondary', 'ghost', 'quiet', 'danger'];
const sizes = [36, 48, 56, 64];
const html = [
  section('Buttons', variants.map((variant) => button({ label: t('garage.battle'), variant, icon: 'deploy' })).join('')),
  section('Sizes', sizes.map((size) => button({ label: t('garage.battle'), variant: 'primary', size, key: 'Enter' })).join('')),
  section('States', [
    button({ label: t('garage.nav.gallery'), icon: 'gallery', attrs: { 'data-state': 'hover' } }),
    button({ label: t('garage.nav.gallery'), icon: 'gallery', attrs: { 'data-state': 'focus' } }),
    button({ label: t('garage.nav.gallery'), icon: 'gallery', attrs: { disabled: true } }),
    button({ label: t('settings.title'), icon: 'settings', iconOnly: true }),
    keycap('B'), keycap('F8'),
  ].join('')),
  section('Chips and tags', [
    chip({ label: 'MBT', icon: 'shield' }), chip({ label: 'MBT', icon: 'shield', pressed: true, count: 38 }),
    chip({ label: 'Germany', nation: 'germany', pressed: false, compact: true }),
    chip({ label: 'United Kingdom', nation: 'uk', pressed: true, compact: true }),
    tag('New', 'accent'), tag('Ready', 'ok'), tag('3 / 6'), tag('Damaged', 'warn'), tag('Destroyed', 'danger'),
  ].join('')),
  section('Choice', [
    segmented({ label: t('garage.battle.sides'), value: '7v7', options: [
      { value: '7v7', label: t('garage.battle.sides7') }, { value: '14v14', label: t('garage.battle.sides14') },
      { value: 'custom', label: t('garage.battle.sidesCustom') }] }),
    segmented({ label: 'Time', value: 'day', options: [
      { value: 'day', label: 'Day', icon: 'timeDay', iconOnly: true }, { value: 'sunset', label: 'Sunset', icon: 'timeSunset', iconOnly: true },
      { value: 'night', label: 'Night', icon: 'regionNight', iconOnly: true }] }),
    toggle({ label: 'Cinematic FX', checked: true, onWord: t('settings.on'), offWord: t('settings.off') }),
    toggle({ label: 'Cinematic FX', checked: false, onWord: t('settings.on'), offWord: t('settings.off') }),
  ].join('')),
  section('Tabs', tabs({ label: 'Deploy', selected: 'quick', tabs: [
    { id: 'quick', label: 'Quick battle', icon: 'modeStandard' }, { id: 'campaign', label: 'Campaign', icon: 'modeFrontline', count: '3 / 6' },
    { id: 'private', label: 'Private room', icon: 'battlePrivate' }, { id: 'lan', label: 'Local network', icon: 'battleLan' }] })),
  section('Stats', `<div class="stats">${[
    statRow({ label: 'Penetration', value: '900', unit: 'mm', icon: 'penetration', cells: scaleCells(900, 0, 1000), rivalCells: scaleCells(891, 0, 1000), delta: '+9', better: true }),
    statRow({ label: 'Reload', value: '5.7', unit: 's', icon: 'reload', cells: scaleCells(5.7, 12, 3), rivalCells: scaleCells(6, 12, 3), delta: '−0.3', better: true }),
    statRow({ label: 'Top speed', value: '60', unit: 'km/h', icon: 'speed', cells: scaleCells(60, 0, 80), rivalCells: scaleCells(63, 0, 80), delta: '−3', better: false }),
  ].join('')}</div>`),
  section('Vehicles', [
    vehicle({ id: 'challenger3', nation: 'uk', name: 'Challenger 3' }),
    vehicle({ id: 'leopard2a7v', nation: 'germany', name: 'Leopard 2A7V', className: 'own' }),
    vehicle({ id: 't90m', nation: 'russia', name: 'T-90M Proryv', className: 'enemy' }),
  ].join('')),
  section('Plates', '<div class="cot-c-plate pad">Plate</div><div class="cot-c-plate cot-c-plate--raised pad">Raised</div><div class="cot-c-plate cot-c-plate--hud pad">HUD</div>'),
].join('');
document.querySelector('main').innerHTML = html;
for (const host of document.querySelectorAll('[role=tablist],[role=radiogroup]')) wireRoving(host, () => {});
for (const el of document.querySelectorAll('[data-state=focus]')) el.focus();
document.documentElement.dataset.ready = '1';
