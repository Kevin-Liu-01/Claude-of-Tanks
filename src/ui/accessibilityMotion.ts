/**
 * accessibilityMotion.ts — Reduce motion overriding the OS both ways (brand-ui SPEC 9 and 14; PLAN BUI-F9).
 * Copyright © 2026 Kevin B. Liu.
 *
 * Every reduced-motion path the game has is a `@media (prefers-reduced-motion: reduce)` rule: the tokens, motion.css and
 * some twenty component stylesheets. A media query cannot read a setting, so a player's explicit choice rewrites the
 * rules instead: Reduce motion On turns each one on ('all'), Off turns it off ('not all'), and System puts back the
 * authored query (a rule combining the feature with other conditions keeps them). The choice is data-motion on :root
 * (reduce or full; none is System). While a choice is in force the document head is watched, so the styles modules add
 * later (ensureStyle, lazily linked CSS) follow it too. Loaded only once a player has made a choice.
 */
import type { MotionMode } from './accessibilitySettings.ts';

type MotionRule = CSSRule & { readonly media?: MediaList; readonly cssRules?: CSSRuleList };
const originalMedia = new WeakMap<object, string>();
const MOTION_FEATURE = /\(\s*prefers-reduced-motion\s*:\s*(reduce|no-preference)\s*\)/gi;

/** The media text a prefers-reduced-motion rule takes under a motion mode (its original under 'system'). */
export function motionMediaText(original: string, mode: MotionMode): string {
  if (mode === 'system') return original;
  const single = /^\s*\(\s*prefers-reduced-motion\s*:\s*(reduce|no-preference)\s*\)\s*$/i.exec(original);
  const on = (feature: string): boolean => (feature.toLowerCase() === 'reduce') === (mode === 'reduce');
  if (single) return on(single[1]) ? 'all' : 'not all';
  // A query combining the feature with others keeps them: the feature becomes an always-true or never-true test.
  return original.replace(MOTION_FEATURE, (_, feature: string) => (on(feature) ? '(min-width: 0px)' : '(max-width: -1px)'));
}

/** Turn every prefers-reduced-motion rule in a list (nested groups included) to a motion mode; returns how many. */
export function overrideMotionRules(rules: ArrayLike<MotionRule> | null | undefined, mode: MotionMode): number {
  let touched = 0;
  for (let i = 0; rules && i < rules.length; i++) {
    const rule = rules[i];
    const media = rule.media;
    if (media) {
      const original = originalMedia.get(rule) ?? media.mediaText;
      if (/prefers-reduced-motion/i.test(original)) {
        if (!originalMedia.has(rule)) originalMedia.set(rule, original);
        const text = motionMediaText(original, mode);
        if (media.mediaText !== text) media.mediaText = text;
        touched++;
      }
    }
    if (rule.cssRules) touched += overrideMotionRules(rule.cssRules as ArrayLike<MotionRule>, mode);
  }
  return touched;
}

function overrideSheet(sheet: CSSStyleSheet | null | undefined, mode: MotionMode): void {
  let rules: CSSRuleList | null = null;
  try { rules = sheet?.cssRules ?? null; } catch { return; } // a cross-origin sheet (web fonts) has no readable rules
  overrideMotionRules(rules as ArrayLike<MotionRule> | null, mode);
}

let headObserver: MutationObserver | null = null;

/** The motion choice on :root: data-motion reduce or full, otherwise System. */
const motionOf = (doc: Document): MotionMode => {
  const choice = doc.documentElement?.dataset?.motion;
  return choice === 'reduce' || choice === 'full' ? choice : 'system';
};

/** Bring every stylesheet of a document to its motion choice, and keep the ones added later in step while it overrides. */
export function syncMotionRules(doc: Document | undefined): void {
  if (!doc) return;
  const mode = motionOf(doc);
  for (const sheet of Array.from(doc.styleSheets ?? [])) overrideSheet(sheet as CSSStyleSheet, mode);
  if (mode === 'system') { headObserver?.disconnect(); headObserver = null; return; }
  if (headObserver || typeof MutationObserver !== 'function' || !doc.head) return;
  headObserver = new MutationObserver((records) => {
    const motion = motionOf(doc);
    for (const record of records) {
      const target = record.target as Element;
      if (target.tagName === 'STYLE') overrideSheet((target as HTMLStyleElement).sheet, motion);
      for (const node of Array.from(record.addedNodes) as Element[]) {
        if (node.tagName === 'STYLE') overrideSheet((node as HTMLStyleElement).sheet, motion);
        else if (node.tagName === 'LINK') {
          const link = node as HTMLLinkElement;
          overrideSheet(link.sheet, motion);
          link.addEventListener('load', () => overrideSheet(link.sheet, motionOf(doc)), { once: true });
        }
      }
    }
  });
  headObserver.observe(doc.head, { childList: true, subtree: true });
}
