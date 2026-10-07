import type { AchievementDef, MedalDef, MedalGroup, MedalTier } from '../game/serviceRecord.ts';
import { uiIconSVG } from './uiIcons.ts';
// Medal and achievement artwork, drawn as inline SVG so the Service Record,
// the debrief and the battle toast share one authored set at 28-96 px. A medal
// is a striped ribbon (its group's colours) over a medallion whose shape says
// the tier: bronze disc, silver notched rim, gold starburst, and the hexagon
// of the reasoning set. Achievements are shields that take on their tier's metal.

const RIBBON: Readonly<Record<MedalGroup, readonly [string, string, string]>> = {
  // base, outer stripes, centre stripe
  reasoning: ['#e8962a', '#3a1d05', '#ffe2a6'],
  gunnery: ['#a5302a', '#220b09', '#ebc47c'],
  survival: ['#2e5d8c', '#0b1622', '#d4e0ea'],
  fieldcraft: ['#4d6e31', '#121a0b', '#dfcf8f'],
  operations: ['#58479a', '#120f22', '#dccffb'],
};

const METAL: Readonly<Record<MedalTier, readonly [string, string, string]>> = {
  // highlight, body, shadow
  signature: ['#fff3d2', '#f0a030', '#7a3f06'],
  gold: ['#fff2bf', '#e6b14a', '#875811'],
  silver: ['#ffffff', '#c4ced7', '#5d6974'],
  bronze: ['#ffd9b6', '#c07845', '#5b3014'],
};

const LOCKED: readonly [string, string, string] = ['#56616b', '#353e47', '#1b2228'];

const TIER_METAL: readonly MedalTier[] = ['bronze', 'silver', 'gold'];

/** Bespoke emblems for the reasoning set; every other medal wears its shared UI icon. */
const EMBLEMS: Readonly<Record<string, string>> = {
  chain_of_thought: '<g fill="none" stroke="currentColor" stroke-width="1.9"><ellipse cx="6.6" cy="15.5" rx="4.3" ry="3"/>' +
    '<ellipse cx="12" cy="15.5" rx="4.3" ry="3"/><ellipse cx="17.4" cy="15.5" rx="4.3" ry="3"/></g>' +
    '<circle cx="8.6" cy="8.4" r="1.2" fill="currentColor"/><circle cx="12.6" cy="6.3" r="1.6" fill="currentColor"/>' +
    '<circle cx="17.6" cy="4.6" r="2.1" fill="currentColor"/>',
  step_by_step: '<path d="M3 20.5h5V16h4.5v-4.5H17V7h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="19" cy="3.6" r="1.7" fill="currentColor"/><path d="M8 20.5V16m4.5 0v-4.5M17 11.5V7" stroke="currentColor" stroke-width="1.2" opacity=".55"/>',
  zero_shot: '<circle cx="12" cy="12" r="6.6" fill="none" stroke="currentColor" stroke-width="2.1"/>' +
    '<path d="M4.6 19.4 19.4 4.6" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
  few_shot: '<path d="M4.5 20.5v-8.6c0-2.3.9-4.4 2.4-5.9 1.5 1.5 2.4 3.6 2.4 5.9v8.6Zm5.1 0v-8.6c0-2.3.9-4.4 2.4-5.9 1.5 1.5 2.4 3.6 2.4 5.9v8.6Zm5.1 0v-8.6c0-2.3.9-4.4 2.4-5.9 1.5 1.5 2.4 3.6 2.4 5.9v8.6Z" fill="currentColor"/>' +
    '<path d="M4.5 17.6h4.8m.3 0h4.8m.3 0h4.8" stroke="#000" stroke-opacity=".38" stroke-width="1.1"/>',
};

let uid = 0;

function emblem(id: string, icon: string, size: number, color: string): string {
  const custom = EMBLEMS[id];
  if (custom) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" style="color:${color}">${custom}</svg>`;
  }
  return uiIconSVG(icon, size, color);
}

function star(cx: number, cy: number, outer: number, inner: number, points: number): string {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / points - Math.PI / 2;
    out.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return out.join(' ');
}

function hexagon(cx: number, cy: number, r: number): string {
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    out.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return out.join(' ');
}

interface MedalArtOptions {
  /** Not yet earned: drawn in dark steel. */
  locked?: boolean;
  className?: string;
}

/** A medal: ribbon, suspension ring and medallion with its emblem. Height is 1.3125 x the width. */
export function medalSVG(def: MedalDef, width = 48, { locked = false, className = '' }: MedalArtOptions = {}): string {
  const id = `cm${++uid}`;
  const [base, outer, centre] = locked ? ['#2b333b', '#171d22', '#4a545d'] : RIBBON[def.group];
  const [hi, body, shade] = locked ? LOCKED : METAL[def.tier];
  const cls = `cot-medal-art${locked ? ' is-locked' : ''}${className ? ` ${className}` : ''}`;
  const cx = 32, cy = 57;
  let medallion: string;
  if (def.tier === 'signature') {
    medallion =
      `<polygon points="${hexagon(cx, cy, 24.5)}" fill="url(#${id}m)" stroke="${shade}" stroke-width="1.2"/>` +
      `<polygon points="${hexagon(cx, cy, 19.5)}" fill="url(#${id}e)" stroke="${hi}" stroke-opacity=".55" stroke-width="1"/>`;
  } else if (def.tier === 'gold') {
    medallion =
      `<polygon points="${star(cx, cy, 25, 19, 8)}" fill="url(#${id}m)" stroke="${shade}" stroke-width=".8"/>` +
      `<circle cx="${cx}" cy="${cy}" r="18" fill="url(#${id}e)" stroke="${hi}" stroke-opacity=".6" stroke-width="1"/>`;
  } else if (def.tier === 'silver') {
    medallion =
      `<circle cx="${cx}" cy="${cy}" r="23" fill="url(#${id}m)" stroke="${shade}" stroke-width="1"/>` +
      `<circle cx="${cx}" cy="${cy}" r="20.6" fill="none" stroke="${shade}" stroke-width="1.4" stroke-dasharray="1.6 2.1"/>` +
      `<circle cx="${cx}" cy="${cy}" r="17.5" fill="url(#${id}e)" stroke="${hi}" stroke-opacity=".55" stroke-width="1"/>`;
  } else {
    medallion =
      `<circle cx="${cx}" cy="${cy}" r="22" fill="url(#${id}m)" stroke="${shade}" stroke-width="1"/>` +
      `<circle cx="${cx}" cy="${cy}" r="17.5" fill="url(#${id}e)" stroke="${hi}" stroke-opacity=".5" stroke-width="1"/>`;
  }
  const leaves = [-1, 1].map(side => `<g transform="translate(32 57) scale(${side} 1)" fill="${body}" stroke="${hi}" stroke-width=".35"><path d="M-5 18C-20 14-23 2-19-8" fill="none" stroke-width=".8"/>` +
    Array.from({length:5},(_,i)=>{const y=12-i*4.4,x=-12-Math.sin((i+1)*.43)*9;return `<path d="M${x} ${y}q-6-1-6-6q6 0 6 6m0 0q1-6 6-6q0 5-6 6"/>`;}).join('')+'</g>').join('');
  const engraving = `<path d="M26 77h12M28 79h8" stroke="${hi}" stroke-width=".6" opacity=".6"/>`;
  const glyphColor = locked ? '#6d7882' : hi;
  const glyph = `<g transform="translate(${cx - 12} ${cy - 12})">${emblem(def.id, def.icon, 24, glyphColor)}</g>`;
  const glow = !locked && def.tier === 'signature'
    ? `<circle cx="${cx}" cy="${cy}" r="30" fill="url(#${id}g)"/>` : '';
  return `<svg class="${cls}" viewBox="0 0 64 84" width="${width}" height="${Math.round(width * 1.3125)}" aria-hidden="true">` +
    `<defs><linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${hi}"/><stop offset=".48" stop-color="${body}"/><stop offset="1" stop-color="${shade}"/></linearGradient>` +
    `<radialGradient id="${id}e" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#1d262f"/><stop offset="1" stop-color="#06090c"/></radialGradient>` +
    `<radialGradient id="${id}g"><stop offset=".55" stop-color="${body}" stop-opacity=".34"/><stop offset="1" stop-color="${body}" stop-opacity="0"/></radialGradient>` +
    `<clipPath id="${id}r"><polygon points="17,0 47,0 47,25 32,33 17,25"/></clipPath></defs>` +
    `<g clip-path="url(#${id}r)"><rect x="17" y="0" width="30" height="34" fill="${base}"/>` +
    `<rect x="20.5" y="0" width="3.2" height="34" fill="${outer}"/><rect x="40.3" y="0" width="3.2" height="34" fill="${outer}"/>` +
    `<rect x="30.2" y="0" width="3.6" height="34" fill="${centre}"/>` +
    `<rect x="17" y="0" width="30" height="34" fill="url(#${id}m)" opacity=".16"/></g>` +
    `<circle cx="32" cy="31.5" r="3.2" fill="none" stroke="${body}" stroke-width="1.8"/>` +
    `<path d="M18 1h28v4H18zM18 24l14 9 14-9" fill="url(#${id}m)" stroke="${shade}" stroke-width=".7"/>` +
    `<path d="M25 5v20m3-20v22m8-22v22m3-22v20" stroke="${hi}" stroke-width=".5" opacity=".28"/>` +
    `${glow}${medallion}${leaves}${engraving}${glyph}</svg>`;
}

/** An achievement shield at its tier (0 = not yet reached), with three tier pips. Height is 1.0833 x the width. */
export function achievementSVG(def: AchievementDef, tier: number, width = 40, className = ''): string {
  const id = `ca${++uid}`;
  const reached = Math.max(0, Math.min(3, Math.floor(tier)));
  const [hi, body, shade] = reached ? METAL[TIER_METAL[reached - 1]] : LOCKED;
  const cls = `cot-achievement-art${reached ? '' : ' is-locked'}${className ? ` ${className}` : ''}`;
  let pips = '';
  for (let i = 0; i < 3; i++) {
    const x = 16 + i * 8;
    pips += `<polygon points="${x},40 ${x + 2.6},42.6 ${x},45.2 ${x - 2.6},42.6" fill="${i < reached ? hi : '#0b0f13'}" ` +
      `stroke="${i < reached ? shade : '#56616b'}" stroke-width=".8"/>`;
  }
  return `<svg class="${cls}" viewBox="0 0 48 52" width="${width}" height="${Math.round(width * 1.0833)}" aria-hidden="true">` +
    `<defs><linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/>` +
    `<stop offset=".5" stop-color="${body}"/><stop offset="1" stop-color="${shade}"/></linearGradient>` +
    `<radialGradient id="${id}e" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#1c252e"/><stop offset="1" stop-color="#070a0d"/></radialGradient></defs>` +
    `<path d="M12 2h24l9 9v19L24 50 3 30V11Z" fill="url(#${id}m)" stroke="${shade}" stroke-width="1"/>` +
    `<path d="M14 6h20l7 7v15L24 45 7 28V13Z" fill="url(#${id}e)"/>` +
    `<g transform="translate(14 13)">${uiIconSVG(def.icon, 20, reached ? hi : '#6d7882')}</g>${pips}</svg>`;
}
