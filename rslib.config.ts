import { defineConfig } from "@rslib/core";

export default defineConfig({
	lib: [
		{
			format: "esm",
			syntax: ["node 18"],
			dts: false,
		},
	],
	// Tests run dist/index.js: source maps let c8 report on src/index.ts, and are kept out of
	// the published build, which ships dist/ as is
	output: { sourceMap: process.env.COVERAGE ? { js: "source-map" } : false },
	// Rslib turns the build cache on, and its key ignores env vars: without this, a coverage build
	// is served the cached output without source map
	performance: { buildCache: { cacheDigest: [process.env.COVERAGE] } },
	tools: {
		rspack: (config, { rspack }) => {
			config.plugins ??= [];
			config.plugins.push(
				new rspack.BannerPlugin({
					banner: "#!/usr/bin/env node",
					raw: true,
					entryOnly: true,
				}),
			);
			return config;
		},
	},
});
