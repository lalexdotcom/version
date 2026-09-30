# Task completion checklist

1. `pnpm run check` — Biome lint + format with fixes (AGENTS.md: run after every modification).
2. `get_diagnostics_for_file` on edited TS files (type errors; no separate tsc script exists).
3. `pnpm run build` then `pnpm run test` (tests run the built `dist/`, see `mem:testing`).
4. If CLI flags, bump tokens or behaviour changed: update README tables/sections.
5. Commit only when the user asks; Conventional Commits.

## "On clôture" (user's closing command)
Means, without presenting the finishing-a-development-branch menu: update the Serena memories, commit whatever is still uncommitted (split into Conventional Commits), then merge the feature branch into `main` locally (superpowers option 1: tests on the merged result, delete the branch). Do not push.
