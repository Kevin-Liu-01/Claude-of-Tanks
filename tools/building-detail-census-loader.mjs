// building-detail-census-loader.mjs — the building-detail census's instrumentation (tools/building-detail-census.mjs;
// props Lane B, 2026-10-14, from the 10-12 B1 probe). A module hook that rewrites the shared detail modules' text in
// memory only (never on disk): each named export becomes a wrapper that reports its call (and its arguments) to
// globalThis.__bdcRecord before running the original, so the census can count which detail elements every regional
// builder actually lays. A run without the census's recorder installed behaves exactly as the plain modules.
const TARGETS = {
  'openings.ts': ['windowUnit', 'doorUnit', 'gateUnit'],
  'facade.ts': ['nalichnikCrest', 'nalichnikApron', 'thatchCourses', 'ridgeRiders', 'paintBand', 'paintSurround', 'sillStreaks', 'windowHead',
    'dressedQuoin', 'trimRun', 'doorCanopy', 'trimRing', 'pilaster', 'dentilCornice', 'roofDormers', 'balconette', 'carvedVerge', 'plinthPaint',
    'shopfrontJoinery', 'shopDisplay', 'innEmblem', 'gableWindows', 'renderedShaft', 'faceSlab'],
  'dressing.ts': ['mound', 'ridge', 'bloomDisc', 'flowerBox', 'bench', 'woodpile', 'roofLadder', 'tvAerial', 'wallLantern', 'pottedPlant',
    'washingLine', 'floweringShrub', 'hollyhocks'],
  'vernacular.ts': ['stilts', 'sheetWall', 'boardWall', 'veranda', 'ladder'],
  'house.ts': ['buildHouse', 'emitRoof', 'leanTo', 'placeShed', 'roofCrown', 'holedFace', 'holedPolygon'],
};

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  const match = url.match(/\/src\/world\/maps\/regional\/([a-zA-Z]+\.ts)$/);
  if (!match || !TARGETS[match[1]]) return result;
  let source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8');
  for (const name of TARGETS[match[1]]) {
    const head = new RegExp(`export function ${name}\\(`);
    if (!head.test(source)) continue;
    source = source.replace(head,
      `export function ${name}(...__bdcArgs) { globalThis.__bdcRecord?.('${match[1]}:${name}', __bdcArgs); return __bdcOriginal_${name}(...__bdcArgs); }\nfunction __bdcOriginal_${name}(`);
  }
  return { ...result, source };
}
