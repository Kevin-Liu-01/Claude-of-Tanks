const { createDedicatedWorldCollision } = await import('../server/dedicatedWorldCollision.ts');
const w = createDedicatedWorldCollision('verdant', { retain: true });
const keys = Object.keys(w); console.log('keys', keys.slice(0, 30).join(' '));
const hf = w.heightField ?? w.ground ?? w.terrain;
const h = (x, z) => (hf?.getHeightAt ? hf.getHeightAt(x, z) : hf?.heightAt ? hf.heightAt(x, z) : w.groundAt?.(x, z));
for (const [x, z] of [[190, 391], [180, 391], [200, 391], [190, 381], [190, 401], [196, 396], [184, 386]]) console.log(x, z, h(x, z)?.toFixed?.(3));
