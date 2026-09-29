# upversion — core

Single-file CLI (npm package `upversion`, bin name `version`): bumps `package.json` version, updates `packageManager`, commits, tags `v<x.y.z>`, pushes. Repo dir is `version`; Serena project name `version`.

## Source map
- `src/index.ts` — whole CLI. Top-level side effects: commander `program.parse()` at module load, `main()` called at EOF. Importing it runs the CLI → no unit tests of helpers; tests are black-box.
- `tests/index.test.ts` — E2E: spawns `node dist/index.js` in temp git repos (`createTempRepo`). Details: `mem:testing`.
- `rslib.config.ts` — ESM, `node 18` syntax, no dts, BannerPlugin injects `#!/usr/bin/env node`.
- `rstest.config.ts` — extends rslib config but strips BannerPlugin (shebang breaks ESM test bundles).
- `.github/workflows/release.yaml` — on tag push `v*.*.*` → `lalexdotcom/action-release-and-publish@v1` (npm publish + GH release; tokens as action inputs).
- `.devcontainer/`, `.claude/`, `AGENTS.md` — agent tooling scaffold (from `lalexdotcom/claude-scaffold`), not product code.
- `TODO.md` — backlog (e.g. re-tag same version).

## main() flow (src/index.ts)
1. Gather inputs: current version, early regression check for `--version`/`--bump`, dirty-tree check (`git status --porcelain`; abort unless `--commit`; skipped if no HEAD), resolve new version (flags or clack menus), tag/push confirms.
2. Interactive confirmation (skipped in non-interactive and dry-run).
3. Execute: write package.json (tab indent + trailing `\n`) → `git add` (package.json + pnpm-lock.yaml, or `git add .` with `--commit`) → commit `Release version <v>` → `git tag v<v>` → `git push origin main` (+ tag). Any failure → `rollback()` undoes tag, `git reset HEAD~1`, restores package.json, exit 1.
- Not in a git repo → git steps silently skipped.
- Push target hardcoded to `origin main`.

## Invariants
- New version must be strictly greater (`isVersionGreater`): stable > prerelease of same base; prerelease levels ordered `alpha` < `beta` < `rc` (`PRERELEASE_LEVELS`).
- Non-interactive errors → stderr lowercase, exit 1; interactive aborts → colored stdout, exit 0 (regression/cancel) or 1 (dirty tree, errors).
- All output goes through the logger/template system; see `mem:conventions` before adding messages.
- `detectPackageManager`: lock file first (pnpm/yarn/bun), then `npm_config_user_agent`, else npm; version resolved via user agent or running `<pm> --version` in a sandbox tmp dir with `COREPACK_ENABLE_PROJECT_SPEC=0`.

## Other memories
- Stack, versions, build tooling: `mem:tech_stack`.
- Daily commands (build/test/lint, running the CLI locally): `mem:suggested_commands`.
- Code style, logger message conventions, commit style: `mem:conventions`.
- E2E test harness and its build prerequisite: `mem:testing`.
- Checks to run before declaring a task done: `mem:task_completion`.
