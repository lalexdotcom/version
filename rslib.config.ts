import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      format: 'esm',
      syntax: ['node 18'],
      dts: false,
    },
  ],
  tools: {
    rspack: (config, { rspack }) => {
      config.plugins ??= [];
      config.plugins.push(
        new rspack.BannerPlugin({
          banner: '#!/usr/bin/env node',
          raw: true,
          entryOnly: true,
        }),
      );
      return config;
    },
  },
});
