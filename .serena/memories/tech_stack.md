# Tech stack

- TypeScript `^7` (native `tsgo`; VS Code uses `node_modules/typescript/lib`). `tsconfig.json`: strict, `noEmit`, bundler resolution, includes `src` only.
- Runtime deps: `commander` ^14 (CLI flags), `@clack/prompts` ^1 (interactive menus; `confirm`/`log` imported dynamically in `main`).
- Build: Rslib (`@rslib/core` ^1) → `dist/index.js` (ESM, syntax target node 18, shebang banner). Published files: `dist` + `CHANGELOG.md` (`files`), plus README/LICENSE/package.json that npm always packs.
- Runtime floor: `engines.node >=20`, imposed by `commander` 14 (the node 18 syntax target is lower, harmless).
- npm page metadata in package.json: `repository`, `homepage`, `bugs`, `keywords`.
- Test-only devDeps: `c8` (coverage), `@lydell/node-pty` (pinned beta, prebuilt pty for interactive tests).
- Tests: Rstest (`@rstest/core`, `@rstest/adapter-rslib` ^0.12).
- Lint/format: Biome 2.5.14 (pinned exactly): tabs, lineWidth 100, recommended rules, organize imports.
- `tsx` for running TS directly (`pnpm run version`, `scripts/*.ts`).
- Package manager: pnpm (`packageManager` field pinned; the tool itself rewrites it on release). `pnpm-workspace.yaml` only allows esbuild build script.
- Devcontainer: `node:24-trixie`, user `node`.
- Node built-ins only via `node:` prefix; git driven via `execSync`.
