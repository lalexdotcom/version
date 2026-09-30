# Task completion checklist

1. `pnpm run check` — Biome lint + format with fixes (AGENTS.md: run after every modification).
2. `get_diagnostics_for_file` on edited TS files (type errors; no separate tsc script exists).
3. `pnpm run build` then `pnpm run test` (tests run the built `dist/`, see `mem:testing`).
4. If CLI flags, bump tokens or behaviour changed: update README tables/sections.
5. Commit only when the user asks; Conventional Commits.

## "On clôture" (user's closing command)
Means, without presenting the finishing-a-development-branch menu, in this order:
1. Commit whatever is still pending on the feature branch (split into Conventional Commits).
2. Merge it into `main` locally with `git merge --no-ff` (superpowers option 1: run the tests on the merged result, then delete the branch).
3. Update the Serena memories on `main`, after the merge, and commit them there.
Do not push.
