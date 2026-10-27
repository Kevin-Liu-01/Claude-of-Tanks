// The in-world markers over tanks (the hull bars over allies and enemies, the target plate over the enemy under the
// gun), shared by the battle HUD's receipts (battle-hud-overlap, battle-hud-layout). Copyright © 2026 Kevin B. Liu.
//
// No nation flag on any of them (owner 2026-10-26, "dont show flags inn inn game enemy markers (*or friends s)": the
// rosters, the load card, the scoreboard and the report keep theirs); each whole (a marker paints contained, so copy past
// its box is cut: the target plate measured itself hidden and cut its callsign and vehicle at both ends); and each side
// in shape and colour, never colour alone (INTERACTION-REDESIGN bar line 6): the enemy's diamond, the ally's chevron.
// Runs in the page: page.evaluate(markerProblems, staged), staged true where the state puts tanks of both sides in view
// and one under the gun (the layout fixture's ?state=markers).

/** The problems with the visible markers over tanks, as lines (empty when every one passes). */
export function markerProblems(staged) {
  const problems = [];
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const bars = [...document.querySelectorAll('.cot-hpbars .cot-hpb')].filter(shown);
  const plates = [...document.querySelectorAll('.cot-tgt')].filter(shown);
  const ally = (bar) => bar.classList.contains('ally');
  const label = (marker) => (marker.classList.contains('cot-tgt') ? 'target plate'
    : `${ally(marker) ? 'ally' : 'enemy'} hull bar "${marker.querySelector('.nm span')?.textContent ?? ''}"`);
  for (const marker of [...bars, ...plates]) {
    if (marker.querySelector('.cot-flag, .cot-c-flag, img, [class*="flag"], [class*="flg"], [data-nation]'))
      problems.push(`a flag on the ${label(marker)}`);
    const box = marker.getBoundingClientRect();
    for (const el of marker.querySelectorAll('*')) {
      if (![...el.childNodes].some((node) => node.nodeType === 3 && node.nodeValue.trim()) || !shown(el)) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      if (r.width < 1) continue;
      if (r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5)
        problems.push(`the ${label(marker)} cuts "${el.textContent.trim().slice(0, 40)}"`);
    }
  }
  for (const bar of bars) {
    const after = getComputedStyle(bar, '::after');
    const diamond = after.transform !== 'none' && parseFloat(after.width) > 0;
    const chevron = after.transform === 'none' && parseFloat(after.borderTopWidth) > 0;
    if (ally(bar) ? !chevron : !diamond) problems.push(`the ${label(bar)} has no ${ally(bar) ? 'chevron' : 'diamond'}`);
    if (bar.scrollHeight > bar.clientHeight + 0.5) problems.push(`the ${label(bar)} cuts its pointer`);
  }
  const inks = (side) => new Set(bars.filter((bar) => ally(bar) === side).map((bar) => getComputedStyle(bar.querySelector('.nm')).color));
  const own = inks(true);
  for (const color of inks(false)) if (own.has(color)) problems.push(`allies and enemies share the hull bar colour ${color}`);
  for (const plate of plates) {
    const anchor = plate.querySelector('.anch');
    if (!anchor || !shown(anchor) || getComputedStyle(anchor).transform === 'none') problems.push('the target plate has no diamond');
  }
  if (staged) {
    if (!bars.some(ally)) problems.push('no ally hull bar in view');
    if (!bars.some((bar) => !ally(bar))) problems.push('no enemy hull bar in view');
    if (!plates.length) problems.push('no target plate over the enemy under the gun');
  }
  return problems;
}
