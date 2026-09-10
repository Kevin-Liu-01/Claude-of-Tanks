interface AmmunitionCard {
  name?: string;
  type?: string;
  dmg?: number;
  penLabel?: string | number;
  count?: number;
}

type TextNode = Pick<HTMLElement, 'textContent'>;
type StyledNode = Pick<HTMLElement, 'style'>;

export interface AmmunitionSlotElements {
  button: Pick<HTMLButtonElement,
    'classList' | 'setAttribute' | 'removeAttribute' | 'style' | 'tabIndex'>;
  type: TextNode & StyledNode;
  underline: StyledNode;
  name: TextNode;
  penetration: TextNode;
  damage: TextNode;
  count: TextNode;
  cooldown: StyledNode;
}

interface AmmunitionSlotOptions {
  index: number;
  elements: AmmunitionSlotElements;
  locale(): string;
  drawIcon(type: string): void;
  typeLabel(type: string): string;
  count(shell: AmmunitionCard): number;
  selectionLabel(name: string, count: number, selected: boolean, pending: boolean): string;
  typeColors: Readonly<Record<string, string>>;
  underlineColors: Readonly<Record<string, string>>;
}

export interface RetainedAmmunitionSlot {
  readonly selected: boolean;
  render(shell: AmmunitionCard, selected: boolean, pending?: boolean): void;
  select(selected: boolean): void;
  layout(touch: boolean, open: boolean, rank: number): void;
  setCooldown(height: string): void;
}

/**
 * Retain only copied primitive presentation values, never a live ammunition
 * object. The simulation and frozen/spectator views can mutate the same card
 * in place. Event-time selection and frame-time reconciliation share the same
 * class owner, while accessibility continues to follow the rendered state.
 */
export function createRetainedAmmunitionSlot({
  index, elements, locale, drawIcon, typeLabel, count, selectionLabel,
  typeColors, underlineColors,
}: AmmunitionSlotOptions): RetainedAmmunitionSlot {
  let initialized = false;
  let lastLocale = '';
  let lastType = '';
  let lastName: string | undefined;
  let lastPenetration: string | number | undefined;
  let lastDamage: number | undefined;
  let lastCount: number | undefined;
  let lastSelected = false;
  let lastPending = false;
  let selectedClass: boolean | undefined;
  let emptyClass: boolean | undefined;
  let displayedTypeLabel: string | undefined;
  let displayedName: string | undefined;
  let displayedPenetration: string | undefined;
  let displayedDamage: string | undefined;
  let displayedCount: number | undefined;
  let ariaPressed: string | undefined;
  let ariaBusy: string | undefined;
  let ariaLabel: string | undefined;
  let touchOffset: string | undefined;
  let tabIndex: number | undefined;
  let ariaHidden: string | null | undefined;
  let ariaExpanded: string | null | undefined;
  let cooldownHeight: string | undefined;

  const select = (selected: boolean): void => {
    if (selectedClass === selected) return;
    elements.button.classList.toggle('sel', selected);
    selectedClass = selected;
  };

  const sameCard = (shell: AmmunitionCard, type: string): boolean => (
    type === lastType && shell.name === lastName
      && Object.is(shell.penLabel, lastPenetration) && Object.is(shell.dmg, lastDamage)
      && Object.is(shell.count, lastCount)
  );

  const sameView = (currentLocale: string, selected: boolean, pending: boolean): boolean => (
    initialized && currentLocale === lastLocale
      && selected === lastSelected && pending === lastPending
  );

  const renderType = (type: string, currentLocale: string): void => {
    if (!initialized || type !== lastType) {
      drawIcon(type);
      elements.type.style.color = typeColors[type] || '#9fb0bf';
      elements.underline.style.background = underlineColors[type] || 'rgba(146,164,180,.4)';
    }
    if (!initialized || type !== lastType || currentLocale !== lastLocale) {
      const label = typeLabel(type);
      if (displayedTypeLabel !== label) {
        elements.type.textContent = label;
        displayedTypeLabel = label;
      }
    }
  };

  const renderNumbers = (shell: AmmunitionCard): number => {
    const penetration = shell.penLabel != null ? String(shell.penLabel) : '—';
    if (displayedPenetration !== penetration) {
      elements.penetration.textContent = penetration;
      displayedPenetration = penetration;
    }
    const damage = shell.dmg != null ? String(shell.dmg) : '—';
    if (displayedDamage !== damage) {
      elements.damage.textContent = damage;
      displayedDamage = damage;
    }
    const rounds = count(shell);
    if (displayedCount !== rounds) {
      elements.count.textContent = `${rounds}`;
      displayedCount = rounds;
    }
    const empty = rounds <= 0;
    if (emptyClass !== empty) {
      elements.button.classList.toggle('empty', empty);
      emptyClass = empty;
    }
    return rounds;
  };

  const renderSelection = (
    shell: AmmunitionCard, rounds: number, selected: boolean, pending: boolean,
  ): void => {
    const pressed = selected ? 'true' : 'false';
    if (ariaPressed !== pressed) {
      elements.button.setAttribute('aria-pressed', pressed);
      ariaPressed = pressed;
    }
    const busy = pending && selected ? 'true' : 'false';
    if (ariaBusy !== busy) {
      elements.button.setAttribute('aria-busy', busy);
      ariaBusy = busy;
    }
    const label = selectionLabel(
      shell.name || shell.type || `slot ${index + 1}`, rounds, selected, pending,
    );
    if (ariaLabel !== label) {
      elements.button.setAttribute('aria-label', label);
      ariaLabel = label;
    }
  };

  return {
    get selected() { return selectedClass === true; },
    select,
    render(shell, selected, pending = false) {
      // An optimistic event may have changed the class since the preceding
      // frame even when all authoritative card fields remain identical.
      select(selected);
      const type = shell.type || '';
      const currentLocale = locale();
      if (sameView(currentLocale, selected, pending) && sameCard(shell, type)) return;

      renderType(type, currentLocale);
      const name = shell.name || '—';
      if (displayedName !== name) {
        elements.name.textContent = name;
        displayedName = name;
      }
      const rounds = renderNumbers(shell);
      renderSelection(shell, rounds, selected, pending);
      initialized = true;
      lastLocale = currentLocale;
      lastType = type;
      lastName = shell.name;
      lastPenetration = shell.penLabel;
      lastDamage = shell.dmg;
      lastCount = shell.count;
      lastSelected = selected;
      lastPending = pending;
    },
    layout(touch, open, rank) {
      const selected = selectedClass === true;
      const offset = selected ? '0px' : `${-(rank * 56)}px`;
      if (touchOffset !== offset) {
        elements.button.style.setProperty('--touch-ammo-x', offset);
        touchOffset = offset;
      }
      const available = !touch || selected || open;
      const nextTabIndex = available ? 0 : -1;
      if (tabIndex !== nextTabIndex) {
        elements.button.tabIndex = nextTabIndex;
        tabIndex = nextTabIndex;
      }
      const hidden = available ? null : 'true';
      if (ariaHidden !== hidden) {
        if (hidden === null) elements.button.removeAttribute('aria-hidden');
        else elements.button.setAttribute('aria-hidden', hidden);
        ariaHidden = hidden;
      }
      const expanded = touch && selected ? (open ? 'true' : 'false') : null;
      if (ariaExpanded !== expanded) {
        if (expanded === null) elements.button.removeAttribute('aria-expanded');
        else elements.button.setAttribute('aria-expanded', expanded);
        ariaExpanded = expanded;
      }
    },
    setCooldown(height) {
      if (cooldownHeight === height) return;
      elements.cooldown.style.height = height;
      cooldownHeight = height;
    },
  };
}
