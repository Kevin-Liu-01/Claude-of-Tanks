const MEDIA_ROOT = '/media/battle-reels-v3';

export const BATTLE_REELS = Object.freeze([
  ['01_m1a2_sepv3_vs_t90m_verdant', 'M1A2 Abrams SEPv3 vs T-90M', 'Verdant Fields'],
  ['02_strv122_vs_k2_desert', 'Strv 122 vs K2 Black Panther', 'Sirocco Wadi'],
  ['03_challenger_3_vs_leo2a7v_winter', 'Challenger 3 vs Leopard 2A7V', 'Frosthollow'],
  ['04_type10b_vs_ztz99a2_urban', 'Type 10B vs ZTZ-99A2', 'Steinburg'],
  ['05_leclerc_xlr_vs_t14_coastal', 'Leclerc XLR vs T-14 Armata', 'Saltmere Bay'],
  ['06_kf51b_vs_abramsx_autumn', 'KF51B Panther vs AbramsX', 'Amberford'],
  ['07_m1a2_tusk_vs_t90sm_steppe', 'M1A2 TUSK vs T-90SM', 'Tarkhan Steppe'],
  ['08_ua_t84_oplot_m_vs_pt91_twardy_railyard', 'T-84 Oplot-M vs PT-91 Twardy', 'Cinder Junction'],
  ['09_pl01_105_vs_k2b_frontier', 'PL-01 105 vs K2B', 'Frontier Basin'],
  ['10_merkava4b_vs_ariete_c2_fjord', 'Merkava Mk.4B vs Ariete C2', 'Nordhavn Fjord'],
  ['11_m1a2_sepv2_vs_type99a_delta', 'M1A2 Abrams SEPv2 vs Type 99A', 'Jade River Delta'],
  ['12_leo2_revolution_vs_t72b3m_badlands', 'Leopard 2 Revolution vs T-72B3M', 'Redrock Divide'],
  ['13_challenger2_vs_leclerc_monsoon', 'Challenger 2 vs Leclerc', 'Monsoon Ridge'],
  ['14_type10_vs_k1a1_alpine', 'Type 10 vs K1A1', 'Glacier Pass'],
  ['15_m1a1ha_vs_t80u_caldera', 'M1A1HA Abrams vs T-80U', 'Obsidian Caldera'],
  ['16_ua_m1a1_vs_ua_t64bv_foundry', 'Ukrainian M1A1 vs T-64BV', 'Ironworks'],
  ['17_leo2a6m_vs_t90ms_desert', 'Leopard 2A6M vs T-90MS', 'Desert engagement'],
  ['18_merkava3d_vs_amx40_winter', 'Merkava Mk.3D vs AMX-40', 'Winter engagement'],
  ['19_type90a_vs_pt91m_verdant', 'Type 90A vs PT-91M', 'Verdant engagement'],
  ['20_m1a2_vs_ua_t80u_kursk_coastal', 'M1A2 Abrams vs T-80U Kursk', 'Coastal engagement'],
].map(([id, title, map]) => Object.freeze({
  id,
  title,
  map,
  video: `${MEDIA_ROOT}/${id}.mp4`,
  poster: `${MEDIA_ROOT}/${id}.webp`,
})));

function reelNumber(index) {
  return String(index + 1).padStart(2, '0');
}

export function mountBattleReels(scope = document) {
  const root = scope.querySelector('[data-battle-reels]');
  if (!root) return;

  const video = root.querySelector('[data-battle-reel-video]');
  const source = video?.querySelector('source');
  const grid = root.querySelector('[data-battle-reel-grid]');
  const title = root.querySelector('[data-battle-reel-title]');
  const map = root.querySelector('[data-battle-reel-map]');
  const count = root.querySelector('[data-battle-reel-count]');
  if (!video || !source || !grid || !title || !map || !count) return;

  grid.innerHTML = BATTLE_REELS.map((reel, index) => `
    <button class="battle-reel-card" type="button" data-battle-reel-index="${index}" aria-pressed="${index === 0}">
      <img src="${reel.poster}" alt="" loading="lazy" decoding="async">
      <span><b>${reelNumber(index)}</b><strong>${reel.title}</strong><small>${reel.map}</small></span>
    </button>
  `).join('');

  const buttons = [...grid.querySelectorAll('[data-battle-reel-index]')];
  let activeIndex = 0;

  const selectReel = (index, play = true) => {
    const reel = BATTLE_REELS[index];
    if (!reel) return;

    buttons.forEach((button, buttonIndex) => {
      button.setAttribute('aria-pressed', String(buttonIndex === index));
    });
    title.textContent = reel.title;
    map.textContent = `${reel.map} // 14.7 seconds // 720p`;
    count.textContent = `${reelNumber(index)} / ${BATTLE_REELS.length}`;
    video.setAttribute('aria-label', `${reel.title} at ${reel.map}`);

    if (activeIndex !== index) {
      video.pause();
      source.src = reel.video;
      video.poster = reel.poster;
      video.load();
      activeIndex = index;
    }
    if (play) video.play().catch(() => {});
  };

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-battle-reel-index]');
    if (!button) return;
    selectReel(Number(button.dataset.battleReelIndex));
  });

  grid.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const current = buttons.indexOf(scope.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const columns = matchMedia('(max-width: 620px)').matches ? 2 : 4;
    const offset = event.key === 'ArrowLeft' ? -1
      : event.key === 'ArrowRight' ? 1
        : event.key === 'ArrowUp' ? -columns : columns;
    const next = Math.max(0, Math.min(buttons.length - 1, current + offset));
    buttons[next].focus();
  });
}
