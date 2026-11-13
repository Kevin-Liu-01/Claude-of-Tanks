import { createPickerMenu } from './components/pickerMenu.ts';
import { segmented, setRoving, wireRoving } from './components/components.ts';
import { createNationMenu } from './nationSelect.ts';
import { pickerText } from './pickerText.ts';
import { t } from './i18n.ts';
import { ENEMY_NATION_OPTIONS, readTeamArrangement, readTeamNations, writeTeamArrangement, writeTeamNations } from '../game/teamArrangement.ts';
import { arrangementChoices, isWaveMode, matchRulesetFor, rulesetLines, RULESET_SCORE_TARGETS, TEAM_ARRANGEMENT_LIMITS, type ArrangementChoices } from '../sim/matchRuleset.ts';
import type { CountryId } from '../sim/countries.ts';
import type { GameModeId } from '../sim/matchModes.ts';
import { createTeamNationsControl } from './teamNationsControl.ts';

type Field = 'allies' | 'enemies' | 'waveSize' | 'waveStep' | 'scoreTarget' | 'respawnS' | 'holdS' | 'enemyNation' | 'juggernautRole' | 'movingTargets';
const FIELDS: readonly Field[] = ['allies', 'enemies', 'waveSize', 'waveStep', 'scoreTarget', 'respawnS', 'holdS', 'enemyNation', 'juggernautRole', 'movingTargets'];
/** The settings of two to six values sit on the kit's segmented control; the counts, the winning score and the enemy
 *  nation take the kit's picker menu. Every value a mode offers is the ruleset's (sim/matchRuleset.ts arrangementChoices,
 *  improve-271 plan 027: Air Support's 8 s respawn had no option among a list written here). */
const SEGMENTED_FIELDS: ReadonlySet<Field> = new Set(['respawnS', 'waveStep', 'holdS', 'juggernautRole', 'movingTargets']);
/** The fields whose offered values (and whether the mode takes them at all) are the ruleset's. */
const CHOICE_FIELDS: ReadonlySet<Field> = new Set(['scoreTarget', 'respawnS', 'waveSize', 'waveStep', 'holdS', 'juggernautRole']);
/** The range's targets: still on their marks, or shuttling along their hull axes (the ruleset's patrol). */
const MOVING_TARGETS = ['off', 'on'] as const;

interface ArrangeField {
  readonly root: HTMLElement;
  /** Show the field's values (a menu's set changes with the mode) with `value` chosen. */
  show(values: readonly (readonly [string, string])[], value: string): void;
  close(): void;
}

/** Mode-specific controls share the exact stored arrangement read by battle creation. */
export function createBattleArrangementPanel(host: HTMLElement, { playerCountry = () => null, customSides = () => false }: {
  playerCountry?: () => CountryId | null;
  /** Deploy's sides are on Custom: the counts show for a symmetric mode too (a wave mode always shows them). */
  customSides?: () => boolean;
} = {}): { render(mode: GameModeId): void; close(): void } {
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
    // the range keeps its switch alone (sim/matchRuleset.ts normalizes its arrangement to it)
    if (name === 'movingTargets') writeTeamArrangement(mode, value === 'on' ? { movingTargets: true } : null);
    else writeTeamArrangement(mode, { ...current, [name]: name === 'enemyNation' || name === 'juggernautRole' ? value || null : Number(value) });
    render(mode);
  };
  // the range's switch speaks as its rule tile does (Targets: Still or Moving), one setting in one set of words
  const label = (name: Field): string => (name === 'movingTargets' ? t('garage.deploy.rule.moving')
    : t(`playMenu.arrange.${name === 'enemyNation' ? 'nation' : name}`));
  const captions = new Map<Field, HTMLElement>();
  const optionLabel = (name: Field, value: string): string => (name === 'juggernautRole' ? t(`playMenu.arrange.${value}`)
    : name === 'movingTargets' ? t(value === 'on' ? 'garage.deploy.targetsMoving' : 'garage.deploy.targetsStill') : value);
  const fields = new Map<Field, ArrangeField>(FIELDS.map((name): [Field, ArrangeField] => {
    const root = document.createElement('div'); root.className = 'cot-arrange-field'; root.dataset.modeField = name;
    const caption = document.createElement('span'); caption.textContent = label(name);
    captions.set(name, caption);
    root.append(caption);
    controls.append(root);
    if (SEGMENTED_FIELDS.has(name)) {
      root.insertAdjacentHTML('beforeend', segmented({ label: label(name), className: 'cot-arrange-seg', value: '', options: [] }));
      const group = root.querySelector<HTMLElement>('.cot-arrange-seg')!;
      wireRoving(group, (value) => commit(name, value));
      // the options are rebuilt only when the mode's set changes (the roving wiring reads the group's items live)
      let offered = '';
      return [name, { root, close: () => {}, show: (values, value) => {
        const signature = values.map(([id]) => id).join('|');
        if (signature !== offered) {
          offered = signature;
          const built = document.createElement('template');
          built.innerHTML = segmented({ label: label(name), className: 'cot-arrange-seg', value,
            options: values.map(([id, text]) => ({ value: id, label: text })) });
          group.replaceChildren(...built.content.firstElementChild!.childNodes);
        }
        setRoving(group, value);
      } }];
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
    // the range (the proving ground) is solo: no nations, no sides, its moving-target switch alone
    const range = rules.provingGround != null;
    teams.render();
    teams.root.hidden = range;
    // a field the mode does not take is absent from its choices (sim/matchRuleset.ts arrangementChoices)
    const choices = arrangementChoices(mode);
    for (const [name, field] of fields) {
      field.root.hidden = range ? name !== 'movingTargets' : name === 'movingTargets' ? true
        : CHOICE_FIELDS.has(name) ? !choices[name as keyof ArrangementChoices]
        // MONO's enemy country (AUTO first); RANDOM seats any vehicle, so the field is hidden and ignored
        : name === 'enemyNation' ? random
        : !isWaveMode(mode) && !customSides();
      if (field.root.hidden) continue;
      // Custom sides in a symmetric mode: its counts are its sides (a wave mode's are its allies and its enemy pool)
      if (name === 'allies' || name === 'enemies') {
        captions.get(name)!.textContent = isWaveMode(mode) ? label(name) : t(name === 'allies' ? 'garage.battle.sidesAllies' : 'garage.battle.sidesEnemies');
      }
      const offered = CHOICE_FIELDS.has(name) ? choices[name as keyof ArrangementChoices] : null;
      const values: Array<[string, string]> = offered ? offered.map((value): [string, string] => [String(value), optionLabel(name, String(value))])
        : name === 'movingTargets' ? MOVING_TARGETS.map((value): [string, string] => [value, optionLabel(name, value)])
        // the player's own country is never the enemy under MONO
        : name === 'enemyNation' ? [['', t('teams.auto')], ...ENEMY_NATION_OPTIONS.filter(({ id }) => id !== ownCountry)
          .map(({ id }): [string, string] => [id, t(`campaign.enemy.${id}`)])]
        : (() => {
          const [lo, hi] = TEAM_ARRANGEMENT_LIMITS[name as 'allies' | 'enemies'][mode];
          return Array.from({ length: hi - lo + 1 }, (_, i): [string, string] => [String(lo + i), String(lo + i)]);
        })();
      const value = name === 'movingTargets' ? (rules.provingGround?.moving ? 'on' : 'off')
        : name === 'juggernautRole' ? arrangement?.juggernautRole || 'boss' : name === 'enemyNation' ? (arrangement?.enemyNation && arrangement.enemyNation !== ownCountry ? arrangement.enemyNation : '')
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
