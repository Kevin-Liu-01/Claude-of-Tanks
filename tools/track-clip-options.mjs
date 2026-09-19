/** Strict audit quality is explicit; the historical CLI/page default stays HIGH. */
export function trackClipQuality(value = 'high') {
  if (value !== 'high' && value !== 'low') throw new Error(`Invalid track audit quality: ${String(value)}`);
  return value;
}
export function trackClipOptions(args) {
  if (args.includes('--quality') || args.includes('--out-dir')) throw new Error('Track audit options require =value');
  const values = name => args.filter(arg => arg.startsWith(`--${name}=`)).map(arg => arg.slice(name.length + 3));
  const qualities = values('quality'), directories = values('out-dir');
  if (qualities.length > 1 || directories.length > 1) throw new Error('Duplicate track audit option');
  if (directories[0] === '') throw new Error('Empty track audit output directory');
  return { quality: trackClipQuality(qualities[0]), outDir: directories[0] ?? 'shots' };
}
export function createTrackClipTank(createTank, id, engineCtx, quality = 'high') {
  return createTank(id, engineCtx, { camoSeed: 4242, quality: trackClipQuality(quality), proceduralOnly: true });
}
