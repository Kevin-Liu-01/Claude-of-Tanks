/**
 * i18nCatalog.ts — assembles the runtime dictionary from per-locale files.
 *
 * Each locale lives in a General Translation-compatible JSON file under
 * `src/ui/i18nCatalog.<locale>.json`. This file re-exports the catalog and
 * self-registers it with the i18n runtime on first import.
 */
import type { SupportedLocale } from './i18n.ts';
import { registerCatalog } from './i18n.ts';
import enUS from './i18nCatalog.en-US.json' with { type: 'json' };
import zhCN from './i18nCatalog.zh-CN.json' with { type: 'json' };

export { enUS, zhCN };

export const CATALOG: Readonly<Record<SupportedLocale, Readonly<Record<string, string>>>> = {
  'en-US': enUS,
  'zh-CN': zhCN,
} as const;

// Self-register: the catalog owns the full English/Chinese tables, so it is
// the single source of truth at module-graph top-level. The registration runs
// once when this module is first imported, before any caller invokes `t()`.
registerCatalog({ CATALOG });
