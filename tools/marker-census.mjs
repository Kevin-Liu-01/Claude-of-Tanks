// The in-world markers over tanks (the hull bars over allies and enemies, the target plate over the enemy under the
// gun), shared by the battle HUD's receipts (battle-hud-overlap, battle-hud-layout). Copyright © 2026 Kevin B. Liu.
//
// No nation flag on any of them (owner 2026-10-26, "dont show flags inn inn game enemy markers (*or friends s)": the
// rosters, the load card, the scoreboard and the report keep theirs); each whole (a marker paints contained, so copy past
// its box is cut: the target plate measured itself hidden and cut its callsign and vehicle at both ends); and each side
// in shape and colour, never colour alone (INTERACTION-REDESIGN bar line 6): the enemy's diamond, the ally's chevron.
// Each carries a name line (owner 2026-10-27, "always have names their even if not (this is in proving ground) and make
// the elemetns be adaptive"): the target plate is one block centred on its diamond, its bar the text block's width and
// its points directly under the bar. Where a band seat slid the plate along its row (hud.ts targetPlateBand, the phones'
// markers r20), its diamond stands off the centre by the offset the plate carries (--tgt-anch-dx), inside the plate.
// Runs in the page: page.evaluate(markerProblems, staged), staged true where the state puts tanks of both sides in view
// and one under the gun (the layout fixture's ?state=markers). The bars are decluttered (hud.ts updateHpBars): two that
// would cross never both show.

/** The problems with the visible markers over tanks, as lines (empty when every one passes). */
export function markerProblems(staged) {
  const problems = [];
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const bars = [...document.querySelectorAll('.cot-hpbars .cot-hpb')].filter(shown);
  const plates = [...document.querySelectorAll('.cot-tgt')].filter(shown);
  const ally = (bar) => bar.classList.contains('ally');
  const label = (marker) => (marker.classList.contains('cot-tgt') ? 'target plate'
    : `${ally(marker) ? 'ally' : 'enemy'} hull bar "${marker.querySelector('.nm')?.textContent.trim() ?? ''}"`);
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
    if (!bar.querySelector('.nm')?.textContent.trim()) problems.push(`the ${label(bar)} has no name line`);
  }
  const inks = (side) => new Set(bars.filter((bar) => ally(bar) === side).map((bar) => getComputedStyle(bar.querySelector('.nm')).color));
  const own = inks(true);
  for (const color of inks(false)) if (own.has(color)) problems.push(`allies and enemies share the hull bar colour ${color}`);
  for (const plate of plates) {
    const anchor = plate.querySelector('.anch');
    if (!anchor || !shown(anchor) || getComputedStyle(anchor).transform === 'none') problems.push('the target plate has no diamond');
    const nick = plate.querySelector('.nick');
    if (!nick || !shown(nick) || !nick.textContent.trim()) problems.push('the target plate has no name line');
    const box = plate.getBoundingClientRect(), mid = (r) => (r.left + r.right) / 2;
    const off = (el, what) => {
      if (!el || !shown(el)) return;
      const r = el.getBoundingClientRect();
      if (Math.abs(mid(r) - mid(box)) > 1) problems.push(`the target plate's ${what} stands ${(mid(r) - mid(box)).toFixed(1)} px off its centre`);
    };
    // (the diamond at the centre, or at the offset a band seat gave it, and inside the plate either way)
    const slid = parseFloat(getComputedStyle(plate).getPropertyValue('--tgt-anch-dx')) || 0;
    if (anchor && shown(anchor)) {
      const a = anchor.getBoundingClientRect();
      if (Math.abs(mid(a) - mid(box) - slid) > 1) problems.push(`the target plate's diamond stands ${(mid(a) - mid(box)).toFixed(1)} px off its centre (its offset ${slid} px)`);
      if (a.left < box.left - 0.5 || a.right > box.right + 0.5) problems.push('the target plate\'s diamond stands outside the plate');
    }
    off(plate.querySelector('.pl'), 'name line'); off(plate.querySelector('.mt'), 'vehicle line');
    const track = plate.querySelector('.tr'), points = plate.querySelector('.hp');
    if (track && shown(track)) {
      off(track, 'bar');
      const t = track.getBoundingClientRect();
      // (the block is its text: the widest of the name, the vehicle line and the points; the silhouette hangs before it)
      const text = Math.max(...['.nick', '.mt', '.hp'].map((s) => plate.querySelector(s)).filter((el) => el && shown(el))
        .map((el) => el.getBoundingClientRect().width));
      if (t.width < text - 1) problems.push(`the target plate's bar (${t.width.toFixed(0)} px) is narrower than its text (${text.toFixed(0)} px)`);
      if (points && shown(points)) {
        const p = points.getBoundingClientRect();
        if (p.top < t.bottom - 0.5 || p.top - t.bottom > 6 || p.left < t.left - 0.5 || p.right > t.right + 0.5)
          problems.push('the target plate\'s points are not directly under its bar');
      }
    }
  }
  // (staged: the plate over the enemy under the gun and a hull bar beside it; of the bars that would cross, an enemy's
  // shows before an ally's and a nearer before a farther, so a phone's narrow view keeps fewer of them, and under 300 px
  // tall the panels leave a bar no place)
  if (staged) {
    if (!bars.length && innerHeight >= 300) problems.push('no hull bar in view');
    if (!plates.length) problems.push('no target plate over the enemy under the gun');
  }
  return problems;
}
