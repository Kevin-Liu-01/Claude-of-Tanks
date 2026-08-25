import assert from 'node:assert/strict';

const previousDeploymentId = process.env.VERCEL_DEPLOYMENT_ID;
process.env.VERCEL_DEPLOYMENT_ID = 'dpl_reentry_regression';
const {
  default: config,
  deploymentPinnedAssetUrl,
} = await import(`../../vite.config.js?deployment-skew=${Date.now()}`);

assert.equal(
  deploymentPinnedAssetUrl(
    'assets/killcam-old.js',
    { type: 'asset', hostType: 'js' },
    'dpl_old_build',
  ),
  '/assets/killcam-old.js?dpl=dpl_old_build',
  'a lazy chunk must request the deployment that emitted its importing document',
);
assert.equal(
  deploymentPinnedAssetUrl('brand/logo.svg', { type: 'public' }, 'dpl_old_build'),
  undefined,
  'stable public-file URLs must remain same-origin root URLs',
);
assert.equal(
  deploymentPinnedAssetUrl('assets/main.js', { type: 'asset' }, ''),
  undefined,
  'local and non-Vercel builds must retain Vite default URL handling',
);

const renderBuiltUrl = config.experimental?.renderBuiltUrl;
assert.equal(typeof renderBuiltUrl, 'function',
  'Vercel builds must install deployment-aware URL rendering');
for (const hostType of ['html', 'js', 'css']) {
  assert.equal(
    renderBuiltUrl('assets/versioned.js', { type: 'asset', hostType }),
    '/assets/versioned.js?dpl=dpl_reentry_regression',
    `${hostType} asset references must carry one deployment id`,
  );
}

if (previousDeploymentId == null) delete process.env.VERCEL_DEPLOYMENT_ID;
else process.env.VERCEL_DEPLOYMENT_ID = previousDeploymentId;

console.log('deploymentSkew.selftest: generated assets stay pinned to one Vercel deployment');
