# Testing

- Tests execute `dist/index.js` (`CLI` const) via `spawnSync("node", …)` → always `pnpm run build` before `pnpm run test`, otherwise tests run a stale build.
- `createTempRepo(version)` makes a tmp git repo with package.json + initial commit; `afterEach` removes it.
- `run(args, cwd)` clears `npm_config_user_agent` so PM detection relies on lock files only.
- Most tests use `--non-interactive --dry-run` (+ `--ignore-pm` to avoid spawning a PM binary) and assert on ANSI-stripped stdout (`strip`) of the verbose non-interactive templates — changing those templates breaks tests.
- Real-run suites write package.json/commit/tag in the tmp repo; rollback suite pre-creates a tag to force failure.
- Shared helpers (`CLI`, `run`, `createTempRepo`, `commitFile`, `today`, changelog fixtures) live in `tests/helpers.ts`.
- Interactive mode: `tests/interactive.test.ts` drives the CLI in a pseudo-terminal (`@lydell/node-pty`, prebuilt binaries, pinned beta). `runInteractive(args, cwd, steps)` waits for each prompt text in order, then sends keys (`ENTER`, `TOGGLE_ENTER`: any arrow flips a clack confirm); a missing or out-of-order prompt fails with the screen dump. Tests need an explicit timeout (third `test` arg).
- Coverage: `pnpm run coverage` (c8 sees the spawned CLI processes through `NODE_V8_COVERAGE`). Rslib's build cache ignores env vars, hence `performance.buildCache.cacheDigest: [COVERAGE]` in rslib.config.ts.
