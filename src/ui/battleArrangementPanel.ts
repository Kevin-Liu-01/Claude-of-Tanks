import { createPickerMenu } from './components/pickerMenu.ts';
import { segmented, setRoving, wireRoving } from './components/components.ts';
import { createNationMenu } from './nationSelect.ts';
import { pickerText } from './pickerText.ts';
import { t } from './i18n.ts';
import { ENEMY_NATION_OPTIONS, readTeamArrangement, readTeamNations, writeTeamArrangement, writeTeamNations } from '../game/teamArrangement.ts';
import { isWaveMode, matchRulesetFor, rulesetLines, RULESET_SCORE_TARGETS, TEAM_ARRANGEMENT_LIMITS } from '../sim/matchRuleset.ts';
import type { CountryId } from '../sim/countries.ts';
import type { GameModeId } from '../sim/matchModes.ts';
import { createTeamNationsControl } from './teamNationsControl.ts';

type Field = 'allies' | 'enemies' | 'waveSize' | 'waveStep' | 'scoreTarget' | 'respawnS' | 'holdS' | 'enemyNation' | 'juggernautRole';
const FIELDS: readonly Field[] = ['allies', 'enemies', 'waveSize', 'waveStep', 'scoreTarget', 'respawnS', 'holdS', 'enemyNation', 'juggernautRole'];
/** The settings of two to five values sit on the kit's segmented control; the counts, the winning score (up to six) and
 *  the enemy nation take the kit's picker menu. */
const SEGMENTED: Partial<Record<Field, readonly string[]>> = {
  respawnS: ['2', '3', '6', '10', '15'], waveStep: ['0', '1', '2', '3'], holdS: ['10', '20', '30', '45', '60'], juggernautRole: ['boss', 'hunter'],
};
const SCORE_TARGETS: Partial<Record<GameModeId, readonly number[]>> = {
  capture_the_flag: [1, 3, 5, 7, 9], turbo_ball: [3, 5, 7, 10, 15], drone: [5, 10, 20, 30, 50],
};

interface ArrangeField {
  readonly root: HTMLElement;
  /** Show the field's values (a menu's set changes with the mode) with `value` chosen. */
  show(values: readonly (readonly [string, string])[], value: string): void;
  close(): void;
}

/** Mode-specific controls share the exact stored arrangement read by battle creation. */
export function createBattleArrangementPanel(host: HTMLElement, { playerCountry = () => null }: { playerCountry?: () => CountryId | null } = {}): { render(mode: GameModeId): void; close(): void } {
  let mode: GameModeId = 'standard';
  const controls = document.createElement('div'); controls.className = 'cot-mode-settings';
  const readout = document.createElement('div'); readout.className = 'cot-mode-features';
  readout.setAttribute('aria-live', 'polite');
  // TEAM NATIONS (gameplay-modes-228): one preference for every mode, MONO's enemy country per mode below it
  const teams = createTeamNationsControl({
    read: () => readTeamNations(), write: (value) => { writeTeamNations(value); render(mode); },
    playerCountry, enemyCountry: () => readTeamArrangement(mode)?.enemyNation ?? null,
  });
  teams.root.classList.add('cot-nation-field');
  controls.append(teams.root);
  const shown = new Map<Field, string>();
  const commit = (name: Field, value: string): void => {
    if (shown.get(name) === value) return;
    const current = readTeamArrangement(mode);
    writeTeamArrangement(mode, { ...current, [name]: name === 'enemyNation' || name === 'juggernautRole' ? value || null : Number(value) });
    render(mode);
  };
  const label = (name: Field): string => t(`playMenu.arrange.${name === 'enemyNation' ? 'nation' : name}`);
  const optionLabel = (name: Field, value: string): string => (name === 'juggernautRole' ? t(`playMenu.arrange.${value}`) : value);
  const fields = new Map<Field, ArrangeField>(FIELDS.map((name): [Field, ArrangeField] => {
    const root = document.createElement('div'); root.className = 'cot-arrange-field'; root.dataset.modeField = name;
    const caption = document.createElement('span'); caption.textContent = label(name);
    root.append(caption);
    controls.append(root);
    const fixed = SEGMENTED[name];
    if (fixed) {
      root.insertAdjacentHTML('beforeend', segmented({ label: label(name), className: 'cot-arrange-seg', value: fixed[0],
        options: fixed.map((value) => ({ value, label: optionLabel(name, value) })) }));
      const group = root.querySelector<HTMLElement>('.cot-arrange-seg')!;
      wireRoving(group, (value) => commit(name, value));
      return [name, { root, show: (_values, value) => setRoving(group, value), close: () => {} }];
    }
    const menuHost = document.createElement('div');
    root.append(menuHost);
    if (name === 'enemyNation') {
      root.classList.add('cot-nation-field');
      const menu = createNationMenu(menuHost, label(name), [], '', (value) => commit(name, value));
      const nationOf = (id: string): string | undefined => ENEMY_NATION_OPTIONS.find((option) => option.id === id)?.specNations[0];
      return [name, { root, close: () => menu.close(),
        show: (values, value) => menu.setChoices(values.map(([id, text]) => ({ value: id, name: text, nation: nationOf(id) })), value) }];
    }
    const menu = createPickerMenu(menuHost, { id: 'deploy-arrangement', label: label(name), items: [], value: null, layout: 'list',
      text: pickerText(), onChoose: (item) => commit(name, item.id) });
    return [name, { root, close: () => menu.close(), show: (values, value) => menu.setItems(values.map(([id, text]) => ({ id, name: text })), value) }];
  }));
  const close = (): void => fields.forEach((field) => field.close());
  host.append(controls, readout);
  function render(next: GameModeId): void {
    if (mode !== next) close();
    mode = next;
    const arrangement = readTeamArrangement(mode);
    const rules = matchRulesetFor(mode, null, arrangement);
    const random = rules.teamNations === 'random';
    const ownCountry = playerCountry();
    teams.render();
    for (const [name, field] of fields) {
      field.root.hidden = name === 'juggernautRole' ? mode !== 'juggernaut' : name === 'waveSize' || name === 'waveStep' ? mode !== 'endless_horde'
        : name === 'holdS' ? mode !== 'frontline_assault'
        : name === 'scoreTarget' || name === 'respawnS' ? !RULESET_SCORE_TARGETS[mode]
        // MONO's enemy country (AUTO first); RANDOM seats any vehicle, so the field is hidden and ignored
        : name === 'enemyNation' ? random
        : !isWaveMode(mode);
      if (field.root.hidden) continue;
      const values: Array<[string, string]> = SEGMENTED[name] ? SEGMENTED[name].map((value) => [value, optionLabel(name, value)])
        : name === 'scoreTarget' ? (SCORE_TARGETS[mode] ?? [250, 500, 750, 1000, 1500, 2000]).map((value) => [String(value), String(value)])
        // the player's own country is never the enemy under MONO
        : name === 'enemyNation' ? [['', t('teams.auto')], ...ENEMY_NATION_OPTIONS.filter(({ id }) => id !== ownCountry)
          .map(({ id }): [string, string] => [id, t(`campaign.enemy.${id}`)])]
        : (() => {
          const [lo, hi] = name === 'waveSize' ? TEAM_ARRANGEMENT_LIMITS.waveSize
            : TEAM_ARRANGEMENT_LIMITS[name as 'allies' | 'enemies'][mode];
          return Array.from({ length: hi - lo + 1 }, (_, i): [string, string] => [String(lo + i), String(lo + i)]);
        })();
      const value = name === 'juggernautRole' ? arrangement?.juggernautRole || 'boss' : name === 'enemyNation' ? (arrangement?.enemyNation && arrangement.enemyNation !== ownCountry ? arrangement.enemyNation : '')
        : String(name === 'waveSize' ? rules.horde?.waveSize : name === 'waveStep' ? rules.horde?.waveStep
          : name === 'holdS' ? rules.assault?.holdS : name === 'respawnS' ? rules.respawnS
          : name === 'scoreTarget' ? rules.scoreTarget ?? RULESET_SCORE_TARGETS[mode] : rules[name as 'allies' | 'enemies']);
      shown.set(name, value);
      field.show(values, value);
    }
    readout.replaceChildren(...rulesetLines(rules).map(({ key, values }) => {
      const chip = document.createElement('span');
      chip.textContent = t(`rules.line.${key}`, key === 'enemyNation' ? { value: t(`campaign.enemy.${values.value}`) }
        : key === 'teamsMono' ? { scope: t(`rules.teams.scope.${values.scope}`) } : { ...values });
      return chip;
    }));
  }
  return { render, close };
}
