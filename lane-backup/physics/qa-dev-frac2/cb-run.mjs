globalThis.__NO_STATIC_BOX = process.env.NOSB === '1';
await import('../src/fx/collapseBodies.selftest.mjs');
