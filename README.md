# @lalex/version

A CLI utility for semantic version management in Node.js projects. It updates `package.json`, creates a git commit, generates a tag, and pushes to the remote — interactively or fully scriptable.

## Installation

```bash
npx @lalex/version
```

Or globally:

```bash
npm install -g @lalex/version
```

## Usage

### Interactive mode

```bash
npx @lalex/version
```

A guided menu walks you through the release:

1. Select the bump type (patch, minor, major, prerelease, advanced…)
2. Optionally create a git tag `v<version>`
3. Optionally push to remote
4. Confirm before any changes are made

### Non-interactive mode (CI / scripts)

All decisions can be passed as flags for automated pipelines.

```bash
npx @lalex/version --non-interactive --bump patch --tag --push
```

## Options

| Option | Description |
|---|---|
| `--bump <type>` | Bump type to apply (see table below) |
| `--version <x.y.z>` | Set version explicitly (e.g. `1.2.3` or `1.2.3-beta.1`) |
| `--tag` | Create a git tag `v<version>` |
| `--push` | Push the commit and tag to `origin main` |
| `--commit` | Include uncommitted files in the release commit |
| `--non-interactive` | Disable all prompts, use flags or defaults |
| `--dry-run` | Simulate all steps without making any changes (implies `--verbose`) |
| `--verbose` | Show detailed step-by-step output |
| `--ignore-pm` | Skip updating the `packageManager` field |
| `--no-pm` | Remove the `packageManager` field from `package.json` |

## Bump types (`--bump`)

### From a stable version

| Value | Example (`1.2.3 →`) |
|---|---|
| `patch` | `1.2.4` |
| `minor` | `1.3.0` |
| `major` | `2.0.0` |
| `prerelease` | `1.2.4-alpha.1` |
| `prerelease+alpha` | `1.2.4-alpha.1` |
| `prerelease+beta` | `1.2.4-beta.1` |
| `prerelease+rc` | `1.2.4-rc.1` |

### From a prerelease version

| Value | Example (`1.2.3-alpha.1 →`) |
|---|---|
| `prerelease` | `1.2.3-alpha.2` (increments the number) |
| `prerelease+next` | `1.2.3-beta.1` (advances to the next level: alpha → beta → rc) |
| `prerelease+rc` | `1.2.3-rc.1` (jumps directly to a higher level) |
| `release` | `1.2.3` (finalizes the release) |
| `patch` | `1.2.4-alpha.1` (starts a new patch prerelease cycle) |
| `minor` | `1.3.0-alpha.1` |
| `major` | `2.0.0-alpha.1` |

Prerelease levels follow the order `alpha` → `beta` → `rc`. Regressions are rejected.

## Examples

```bash
# Interactive patch bump
npx @lalex/version

# Minor bump, create tag, push — no prompts
npx @lalex/version --non-interactive --bump minor --tag --push

# Set version explicitly to 2.0.0
npx @lalex/version --version 2.0.0

# Simulate a major bump with tag, no changes made
npx @lalex/version --dry-run --bump major --tag --push

# Finalize a prerelease (alpha.3 → stable)
npx @lalex/version --non-interactive --bump release --tag --push

# Patch bump including uncommitted files
npx @lalex/version --bump patch --commit
```

## Git behaviour

- If the repository has **uncommitted changes**, the tool prompts to include them in the release commit (or use `--commit` to accept automatically).
- The commit message is `Release version <x.y.z>`.
- The tag follows the format `v<x.y.z>` (e.g. `v1.3.0-beta.2`).
- Push sends `origin main` and, if a tag was created, `origin v<x.y.z>`.

## `packageManager` field

On each run, the `packageManager` field in `package.json` is updated with the detected package manager (via `npm_config_user_agent` or the lock file present). This behaviour can be changed:

- `--ignore-pm`: leave the field unchanged
- `--no-pm`: remove the field entirely

## Development

```bash
pnpm install
pnpm tsx src/index.ts   # run in development
pnpm run build          # compile to dist/
pnpm run test           # run tests
pnpm run lint           # lint the code
```
