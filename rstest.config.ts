import { withRslibConfig } from '@rstest/adapter-rslib';
import { defineConfig } from '@rstest/core';

export default defineConfig({
  extends: withRslibConfig(),
  tools: {
    rspack: (config) => {
      // Remove the BannerPlugin (shebang) injected by rslib — it breaks ESM test bundles
      config.plugins = config.plugins?.filter(
        (p) => p?.constructor?.name !== 'BannerPlugin',
      );
      return config;
    },
  },
});
