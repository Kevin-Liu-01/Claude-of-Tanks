import { bakeCirrusPixels, bakeCumulusPixels } from './skyCloudBake.js';

self.onmessage = ({ data }) => {
  const { cumulusSize, cirrusSize, config } = data;
  const cirrus = bakeCirrusPixels(cirrusSize, cirrusSize, config);
  self.postMessage({ kind: 'cirrus', size: cirrusSize, pixels: cirrus }, [cirrus.buffer]);
  const cumulus = bakeCumulusPixels(cumulusSize, cumulusSize, config);
  self.postMessage({ kind: 'cumulus', size: cumulusSize, pixels: cumulus }, [cumulus.buffer]);
};
