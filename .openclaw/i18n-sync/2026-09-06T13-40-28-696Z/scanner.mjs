import { readFileSync, existsSync } from 'node:fs';
const targets = process.argv.slice(2);
const candidates = [];
for (const f of targets) {
  if (!existsSync(f)) continue;
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
    let m = line.match(/\.textContent\s*=\s*['"]([A-Z][^'"]{3,})['"]/);
    if (m && m[1].includes(' ')) {
      candidates.push({ file: f, line: i + 1, value: m[1], kind: 'textContent' });
      continue;
    }
    m = line.match(/\.setStatus\(\s*['"]([A-Z][^'"]{3,})['"]/);
    if (m && m[1].includes(' ')) {
      candidates.push({ file: f, line: i + 1, value: m[1], kind: 'setStatus' });
    }
  }
}
console.log(JSON.stringify(candidates, null, 2));