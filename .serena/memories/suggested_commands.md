# Suggested commands

- `pnpm run build` — Rslib build to `dist/` (required before tests).
- `pnpm run dev` — build in watch mode.
- `pnpm run test` / `pnpm run test:watch` — Rstest (runs `dist/index.js`).
- `pnpm run coverage` — `COVERAGE=1` build (source maps) + c8 around rstest; report on `src/index.ts` in the terminal and `coverage/`. Leaves `dist/index.js.map` behind until the next `pnpm run build`.
- `pnpm run scratchpad` — regenerate `.scratchpad/` fixture repos (one git repo per CHANGELOG case) for manual interactive runs: `../../node_modules/.bin/tsx ../../src/index.ts` from a fixture.
- `pnpm run lint` — Biome lint.
- `pnpm run format` — Biome format (write).
- `pnpm run check` — Biome lint + format with fixes.
- `pnpm run version -- <flags>` — run CLI from source via tsx. Beware: acts on THIS repo's package.json/git; use `--dry-run` (and usually `--non-interactive --ignore-pm`).
- Try the built CLI safely: `node dist/index.js --non-interactive --dry-run --bump patch` inside a scratch git repo.
- Helper scripts: `pnpm exec tsx scripts/<name>.ts` (no bash, no `node -e`).
