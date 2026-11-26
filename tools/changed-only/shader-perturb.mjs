// Preload for the shader proof (tools/changed-only/closure-trace.mjs --shaders): `node --import <this file>` with
// COT_SHADER_PERTURB=1 changes the text of every declared shader constant (steps.mjs SHADER_TEXT) and removes every splice,
// switch and define region (279) as its module loads, so a build whose ledger digest stays put does not follow them (the
// CPU and world keys mask them). First-party tooling: Kevin B. Liu.
import { registerHooks } from 'node:module';
import { perturbShaderText } from './shader-text.mjs';
import { SHADER_TEXT } from './steps.mjs';

if (process.env.COT_SHADER_PERTURB === '1') {
  const files = Object.entries(SHADER_TEXT);
  registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      const match = files.find(([file]) => url.endsWith(`/${file}`));
      if (!match) return result;
      return { ...result, source: perturbShaderText(String(result.source), match[0], match[1]) };
    },
  });
}
