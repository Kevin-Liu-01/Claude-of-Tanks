// src/ui/flags.js — crisp procedural nation flags/insignia as inline SVG.
// No external images: every mark is drawn from primitives so it stays sharp
// at any UI scale (tank cards and carousel chips).
//
// Era handling: modern nations use their current flags; for WWII Germany the
// era flag is sensitive, so we render the neutral military vehicle insignia
// (Balkenkreuz-style bar cross on field grey) instead; WWII USSR uses the
// Red Army star on the red field rather than the full state emblem.

let uid = 0;

function star(cx, cy, rOut, fill) {
  const rIn = rOut * 0.42;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}

// All faces drawn in a 30x20 box, then framed + glossed uniformly.
const FACES = {
  usa() {
    let s = '';
    for (let i = 0; i < 13; i++) {
      s += `<rect x="0" y="${(i * 20 / 13).toFixed(3)}" width="30" height="${(20 / 13 + 0.02).toFixed(3)}" fill="${i % 2 ? '#e8edf2' : '#b22234'}"/>`;
    }
    s += '<rect x="0" y="0" width="13" height="10.77" fill="#3c3b6e"/>';
    for (let r = 0; r < 4; r++) {
      const n = r % 2 === 0 ? 5 : 4;
      const off = r % 2 === 0 ? 1.4 : 2.7;
      for (let c = 0; c < n; c++) {
        s += `<circle cx="${(off + c * 2.6).toFixed(2)}" cy="${(1.6 + r * 2.55).toFixed(2)}" r="0.62" fill="#eef2f5"/>`;
      }
    }
    return s;
  },
  germanyModern() {
    return '<rect x="0" y="0" width="30" height="6.67" fill="#1b1b1e"/>' +
      '<rect x="0" y="6.67" width="30" height="6.67" fill="#c9302a"/>' +
      '<rect x="0" y="13.33" width="30" height="6.67" fill="#e7b31c"/>';
  },
  germanyWw2() {
    // neutral vehicle insignia: white-flanked bar cross on field grey
    return '<rect x="0" y="0" width="30" height="20" fill="#4b5157"/>' +
      '<rect x="11" y="3" width="8" height="14" fill="#e6eaee"/>' +
      '<rect x="8" y="6" width="14" height="8" fill="#e6eaee"/>' +
      '<rect x="12.6" y="3" width="4.8" height="14" fill="#17191c"/>' +
      '<rect x="8" y="7.6" width="14" height="4.8" fill="#17191c"/>';
  },
  ussr() {
    // Red Army star with gold bordure on the red field
    return '<rect x="0" y="0" width="30" height="20" fill="#b3252b"/>' +
      star(8.2, 7.6, 5.2, '#f2c14e') +
      star(8.2, 7.85, 3.1, '#b3252b');
  },
  russia() {
    return '<rect x="0" y="0" width="30" height="6.67" fill="#e8edf2"/>' +
      '<rect x="0" y="6.67" width="30" height="6.67" fill="#2d55a5"/>' +
      '<rect x="0" y="13.33" width="30" height="6.67" fill="#c93b3b"/>';
  },
  sweden() {
    // Nordic cross on the 5:2:9 / 4:2:4 spec grid, palette-matched to the
    // UI's muted golds (raw #FECC00 vibrates against the dark slate chrome)
    return '<rect x="0" y="0" width="30" height="20" fill="#2f5d9e"/>' +
      '<rect x="9.38" y="0" width="3.75" height="20" fill="#e7c11c"/>' +
      '<rect x="0" y="8" width="30" height="4" fill="#e7c11c"/>';
  },
  uk() {
    // simplified Union Jack: blue field, white diagonals, red cross + saltire
    return '<rect x="0" y="0" width="30" height="20" fill="#2b4a8b"/>' +
      '<path d="M0 0 30 20M30 0 0 20" stroke="#e8edf2" stroke-width="4"/>' +
      '<path d="M0 0 30 20M30 0 0 20" stroke="#c9302a" stroke-width="1.6"/>' +
      '<rect x="12" y="0" width="6" height="20" fill="#e8edf2"/>' +
      '<rect x="0" y="7" width="30" height="6" fill="#e8edf2"/>' +
      '<rect x="13.4" y="0" width="3.2" height="20" fill="#c9302a"/>' +
      '<rect x="0" y="8.4" width="30" height="3.2" fill="#c9302a"/>';
  },
  france() {
    return '<rect x="0" y="0" width="10" height="20" fill="#2d55a5"/>' +
      '<rect x="10" y="0" width="10" height="20" fill="#e8edf2"/>' +
      '<rect x="20" y="0" width="10" height="20" fill="#c93b3b"/>';
  },
  israel() {
    // white field, two blue bands, Star of David (two overlaid triangles)
    const tri = (dir) => {
      const y0 = dir > 0 ? 6.4 : 13.6;
      const y1 = dir > 0 ? 13.6 : 6.4;
      return `<polygon points="15,${y0} 11.2,${y1} 18.8,${y1}" fill="none" ` +
        `stroke="#2f5d9e" stroke-width="1.1"/>`;
    };
    return '<rect x="0" y="0" width="30" height="20" fill="#eef2f5"/>' +
      '<rect x="0" y="1.6" width="30" height="2.6" fill="#2f5d9e"/>' +
      '<rect x="0" y="15.8" width="30" height="2.6" fill="#2f5d9e"/>' +
      tri(1) + tri(-1);
  },
  china() {
    return '<rect x="0" y="0" width="30" height="20" fill="#c8352b"/>' +
      star(6, 7, 4.2, '#f2c14e') +
      star(12.5, 2.6, 1.3, '#f2c14e') + star(14.8, 5.4, 1.3, '#f2c14e') +
      star(14.8, 9.0, 1.3, '#f2c14e') + star(12.5, 11.8, 1.3, '#f2c14e');
  },
  southKorea() {
    // white field + taegeuk roundel (red over blue) + corner trigram bars
    let s = '<rect x="0" y="0" width="30" height="20" fill="#eef2f5"/>' +
      '<circle cx="15" cy="10" r="5" fill="#c9302a"/>' +
      '<path d="M10 10a5 5 0 0 0 10 0a2.5 2.5 0 0 0 -5 0a2.5 2.5 0 0 1 -5 0Z" fill="#2d55a5"/>';
    for (const [cx, cy, a] of [[4.6, 4.4, -33], [25.4, 4.4, 33], [4.6, 15.6, 33], [25.4, 15.6, -33]]) {
      s += `<g transform="rotate(${a} ${cx} ${cy})" fill="#1b1b1e">` +
        `<rect x="${cx - 2.4}" y="${cy - 1.9}" width="4.8" height="1"/>` +
        `<rect x="${cx - 2.4}" y="${cy - 0.5}" width="4.8" height="1"/>` +
        `<rect x="${cx - 2.4}" y="${cy + 0.9}" width="4.8" height="1"/></g>`;
    }
    return s;
  },
  japan() {
    return '<rect x="0" y="0" width="30" height="20" fill="#eef2f5"/>' +
      '<circle cx="15" cy="10" r="6" fill="#c9302a"/>';
  },
  italy() {
    return '<rect x="0" y="0" width="10" height="20" fill="#2f7d4f"/>' +
      '<rect x="10" y="0" width="10" height="20" fill="#e8edf2"/>' +
      '<rect x="20" y="0" width="10" height="20" fill="#c93b3b"/>';
  },
  poland() {
    return '<rect x="0" y="0" width="30" height="10" fill="#eef2f5"/>' +
      '<rect x="0" y="10" width="30" height="10" fill="#cf2e3e"/>';
  },
  ukraine() {
    // blue-over-gold bicolor, palette-matched to the UI's muted tones (same
    // rule as sweden above: raw #FFD700 vibrates against the dark chrome) —
    // added for the scout-gen2 T-84 Oplot (userdrops7.js, nation 'Ukraine')
    return '<rect x="0" y="0" width="30" height="10" fill="#2d55a5"/>' +
      '<rect x="0" y="10" width="30" height="10" fill="#e7b31c"/>';
  },
  community() {
    // deliberate COMMUNITY WORKSHOP insignia (gear ring + gold star) — the
    // sourced roster wears a maker's mark, not a missing-flag grey box
    let s = '<rect x="0" y="0" width="30" height="20" fill="#3d4650"/>';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const cx = 15 + Math.cos(a) * 6.4, cy = 10 + Math.sin(a) * 6.4;
      s += `<rect x="${(cx - 1.05).toFixed(2)}" y="${(cy - 1.05).toFixed(2)}" width="2.1" height="2.1" ` +
        `fill="#9aa7b4" transform="rotate(${((a * 180) / Math.PI).toFixed(1)} ${cx.toFixed(2)} ${cy.toFixed(2)})"/>`;
    }
    return s +
      '<circle cx="15" cy="10" r="5.9" fill="#4a545f" stroke="#9aa7b4" stroke-width="1.4"/>' +
      star(15, 10.2, 3.9, '#e7b31c');
  },
};

/**
 * Render a nation mark as an inline SVG string.
 * @param {string} nation 'USA' | 'Germany' | 'USSR' | 'Russia' | 'Sweden' | 'Community'
 * @param {?string} era 'ww2' | 'modern' | null — picks era-appropriate marks
 * @param {number} [w=24] css width px
 * @param {number} [h] css height px (defaults to 2:3 ratio)
 * @returns {string} svg markup
 */
export function flagSVG(nation, era, w = 24, h = 0) {
  const H = h || Math.round((w * 20) / 30);
  let face;
  if (nation === 'USA') face = FACES.usa();
  else if (nation === 'Germany') face = era === 'ww2' ? FACES.germanyWw2() : FACES.germanyModern();
  else if (nation === 'USSR') face = FACES.ussr();
  else if (nation === 'Russia' || nation === 'USSR/Russia') face = FACES.russia();
  else if (nation === 'Sweden') face = FACES.sweden();
  else if (nation === 'UK') face = FACES.uk();
  else if (nation === 'France') face = FACES.france();
  else if (nation === 'Israel') face = FACES.israel();
  else if (nation === 'China') face = FACES.china();
  else if (nation === 'South Korea') face = FACES.southKorea();
  else if (nation === 'Japan') face = FACES.japan();
  else if (nation === 'Italy') face = FACES.italy();
  else if (nation === 'Poland') face = FACES.poland();
  else if (nation === 'Ukraine') face = FACES.ukraine();
  else if (nation === 'Community') face = FACES.community();
  else face = '<rect x="0" y="0" width="30" height="20" fill="#54606b"/>';
  const id = `cotfg${uid++}`;
  return `<svg class="cot-flag" width="${w}" height="${H}" viewBox="0 0 30 20" ` +
    `xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" aria-hidden="true">` +
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#fff" stop-opacity=".16"/>` +
    `<stop offset=".45" stop-color="#fff" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs>` +
    face +
    `<rect x="0" y="0" width="30" height="20" fill="url(#${id})"/>` +
    `<rect x="0.5" y="0.5" width="29" height="19" fill="none" stroke="rgba(10,14,18,.55)" stroke-width="1"/>` +
    `</svg>`;
}
