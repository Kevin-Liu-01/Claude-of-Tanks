// Refresh the repository summary from registry-checked, boot-safe product facts.
// --github explicitly publishes the same description to this repository's About field.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PRODUCT_DESCRIPTION } from '../src/productStats.ts';
const readme = new URL('../README.md', import.meta.url);
const source = readFileSync(readme, 'utf8');
const block = `<!-- product-summary:start -->\n${PRODUCT_DESCRIPTION}\n<!-- product-summary:end -->`;
const updated = source.replace(/<!-- product-summary:start -->[\s\S]*?<!-- product-summary:end -->/, block);
if (!source.includes('<!-- product-summary:start -->')) throw new Error('README summary markers missing');
if (process.argv.includes('--check')) {
 if (source !== updated) throw new Error('README summary is stale; run tools/sync-product-summary.mjs');
} else if (source !== updated) writeFileSync(readme, updated);
if (process.argv.includes('--github')) {
 execFileSync('gh', ['repo', 'edit', '--description', PRODUCT_DESCRIPTION], {cwd:new URL('..',import.meta.url),stdio:'inherit'});
 const actual = execFileSync('gh', ['repo', 'view', '--json', 'description', '--jq', '.description'], {cwd:new URL('..',import.meta.url),encoding:'utf8'}).trim();
 if(actual !== PRODUCT_DESCRIPTION) throw new Error('GitHub description verification failed');
}
console.log(PRODUCT_DESCRIPTION);
