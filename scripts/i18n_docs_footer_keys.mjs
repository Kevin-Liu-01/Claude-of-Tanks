// Add 8 new keys (loading, footer.*) to both catalogs.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EN = {
  'docs.topic.loading': 'Loading technical manual…',
  'docs.topic.footer.manualIndex': 'Manual index',
  'docs.topic.footer.gallery': 'Tank Gallery',
  'docs.topic.footer.studio': 'Scene Studio',
  'docs.topic.footer.play': 'Play',
  'docs.topic.footer.mark': 'Technical manual // 2026',
};
const ZH = {
  'docs.topic.loading': '正在载入技术手册…',
  'docs.topic.footer.manualIndex': '手册首页',
  'docs.topic.footer.gallery': '战车展厅',
  'docs.topic.footer.studio': '场景工作室',
  'docs.topic.footer.play': '开始游戏',
  'docs.topic.footer.mark': '技术手册 // 2026',
};

const jsquote = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function insert(file, locale) {
  const path = resolve(process.cwd(), file);
  let text = readFileSync(path, 'utf8');
  // remove any pre-existing key occurrences
  for (const k of Object.keys(EN)) {
    const re = new RegExp(`^  '${k.replace(/\./g, '\\.')}': '[^']*',\\n`, 'm');
    text = text.replace(re, '');
  }
  // remove the trailing };\n
  text = text.replace(/\};\s*$/, '');
  const dict = locale === 'en' ? EN : ZH;
  const lines = Object.keys(EN).map(k => `  '${k}': '${jsquote(dict[k])}',`).join('\n');
  text += '\n  // docs subpage footer + loading (docs-*.html) ------------------------------\n' + lines + '\n};\n';
  writeFileSync(path, text, 'utf8');
  console.log(`updated ${file}: +${Object.keys(EN).length} keys`);
}

insert('src/ui/i18nCatalog.en-US.ts', 'en');
insert('src/ui/i18nCatalog.zh-CN.ts', 'zh');
