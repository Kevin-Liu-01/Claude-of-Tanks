import { createEnemyNationSelect } from './enemyNationSelect.ts';
import { t } from './i18n.ts';
import { ENEMY_NATION_OPTIONS, readTeamArrangement, writeTeamArrangement } from '../game/teamArrangement.ts';
import { isWaveMode, matchRulesetFor, rulesetLines, RULESET_SCORE_TARGETS, TEAM_ARRANGEMENT_LIMITS } from '../sim/matchRuleset.ts';
import type { GameModeId } from '../sim/matchModes.ts';

/** Mode-specific controls share the exact stored arrangement read by battle creation. */
export function createBattleArrangementPanel(host: HTMLElement): { render(mode: GameModeId): void; close(): void } {
  let mode: GameModeId = 'standard';
  const fields = new Map<string, { label: HTMLLabelElement; select: HTMLSelectElement }>();
  const controls = document.createElement('div'); controls.className = 'cot-mode-settings';
  const readout = document.createElement('div'); readout.className = 'cot-mode-features';
  readout.setAttribute('aria-live', 'polite');
  for (const name of ['allies', 'enemies', 'waveSize', 'waveStep', 'scoreTarget', 'respawnS', 'holdS', 'enemyNation']) {
    const label = document.createElement('label');
    const text = document.createElement('span'); text.textContent = t(`playMenu.arrange.${name === 'enemyNation' ? 'nation' : name}`);
    const select = document.createElement('select'); select.dataset.modeField = name;
    label.append(text, select); controls.append(label); fields.set(name, { label, select });
    select.addEventListener('change', () => {
      const current = readTeamArrangement(mode);
      writeTeamArrangement(mode, { ...current, [name]: name === 'enemyNation' ? select.value || null : Number(select.value) });
      render(mode);
    });
  }
  const nation = createEnemyNationSelect(fields.get('enemyNation')!.select);
  host.append(controls, readout);
  function render(next: GameModeId): void {
    if (mode !== next) nation.close();
    mode = next;
    const arrangement = readTeamArrangement(mode);
    const rules = matchRulesetFor(mode, null, arrangement);
    for (const [name, { label, select }] of fields) {
      label.hidden = name === 'waveSize' || name === 'waveStep' ? mode !== 'endless_horde'
        : name === 'holdS' ? mode !== 'frontline_assault'
        : name === 'scoreTarget' || name === 'respawnS' ? !RULESET_SCORE_TARGETS[mode]
        : name !== 'enemyNation' && !isWaveMode(mode);
      if (label.hidden) continue;
      const objectiveChoices: Record<string, number[]> = {
        scoreTarget: mode === 'capture_the_flag' ? [1, 3, 5, 7, 9] : mode === 'turbo_ball' ? [3, 5, 7, 10, 15] : [250, 500, 750, 1000, 1500, 2000],
        respawnS: [2, 3, 6, 10, 15], waveStep: [0, 1, 2, 3], holdS: [10, 20, 30, 45, 60],
      };
      const values: Array<[string, string]> = objectiveChoices[name]
        ? objectiveChoices[name].map(value => [String(value), String(value)]) : name === 'enemyNation'
        ? [['', t('playMenu.arrange.mixed')], ...ENEMY_NATION_OPTIONS.map(({ id }): [string, string] => [id, t(`campaign.enemy.${id}`)])]
        : (() => {
          const [lo, hi] = name === 'waveSize' ? TEAM_ARRANGEMENT_LIMITS.waveSize
            : TEAM_ARRANGEMENT_LIMITS[name as 'allies' | 'enemies'][mode];
          return Array.from({ length: hi - lo + 1 }, (_, i): [string, string] => [String(lo + i), String(lo + i)]);
        })();
      select.replaceChildren(...values.map(([value, text]) => new Option(text, value)));
      select.value = name === 'enemyNation' ? arrangement?.enemyNation || ''
        : String(name === 'waveSize' ? rules.horde?.waveSize : name === 'waveStep' ? rules.horde?.waveStep
          : name === 'holdS' ? rules.assault?.holdS : name === 'respawnS' ? rules.respawnS
          : name === 'scoreTarget' ? rules.scoreTarget ?? RULESET_SCORE_TARGETS[mode] : rules[name as 'allies' | 'enemies']);
    }
    nation.refresh();
    readout.replaceChildren(...rulesetLines(rules).map(({ key, values }) => {
      const chip = document.createElement('span'); chip.textContent = t(`rules.line.${key}`, key === 'enemyNation' ? { value: t(`campaign.enemy.${values.value}`) } : { ...values }); return chip;
    }));
  }
  return { render, close: nation.close };
}
