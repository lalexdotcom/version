# Testing

- Tests execute `dist/index.js` (`CLI` const) via `spawnSync("node", …)` → always `pnpm run build` before `pnpm run test`, otherwise tests run a stale build.
- `createTempRepo(version)` makes a tmp git repo with package.json + initial commit; `afterEach` removes it.
- `run(args, cwd)` clears `npm_config_user_agent` so PM detection relies on lock files only.
- Most tests use `--non-interactive --dry-run` (+ `--ignore-pm` to avoid spawning a PM binary) and assert on ANSI-stripped stdout (`strip`) of the verbose non-interactive templates — changing those templates breaks tests.
- Real-run suites write package.json/commit/tag in the tmp repo; rollback suite pre-creates a tag to force failure.
- Interactive mode is not tested (clack needs a TTY).
