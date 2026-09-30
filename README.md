# upversion

A CLI utility for semantic version management in Node.js projects. It updates `package.json`, creates a git commit, generates a tag, and pushes to the remote — interactively or fully scriptable.

## Installation

```bash
npx upversion@latest
```

Or globally:

```bash
npm install -g upversion
```

## Usage

### Interactive mode

```bash
npx upversion@latest
```

A guided menu walks you through the release:

1. Select the bump type (patch, minor, major, prerelease, advanced…)
2. Optionally create a git tag `v<version>`
3. Optionally push to remote
4. Confirm before any changes are made

### Non-interactive mode (CI / scripts)

All decisions can be passed as flags for automated pipelines.

```bash
npx upversion@latest --non-interactive --bump patch --tag --push
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
| `--skip-changelog` | Do not check or update the CHANGELOG |
| `--no-auto-unreleased-bump` | In non-interactive mode, fail instead of adding a CHANGELOG section for the new version |

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

### From the CHANGELOG

`changelog` releases the highest version that already has a section in the [CHANGELOG](#changelog) (e.g. `## [1.3.0] - 2026-04-01`), whatever its position; `[Unreleased]` is ignored. It fails if there is no CHANGELOG, if it is not in Keep a Changelog format, if it has no release section, or if that version is not greater than the current one. In interactive mode, the same version is offered as the first menu entry when it is a valid target.

## Examples

```bash
# Interactive patch bump
npx upversion@latest

# Minor bump, create tag, push — no prompts
npx upversion@latest --non-interactive --bump minor --tag --push

# Set version explicitly to 2.0.0
npx upversion@latest --version 2.0.0

# Simulate a major bump with tag, no changes made
npx upversion@latest --dry-run --bump major --tag --push

# Finalize a prerelease (alpha.3 → stable)
npx upversion@latest --non-interactive --bump release --tag --push

# Patch bump including uncommitted files
npx upversion@latest --bump patch --commit
```

## Git behaviour

- The repository **must be clean** (no uncommitted changes) before running a version bump. Use `--commit` to bypass this check and include any uncommitted changes in the release commit.
- The commit message is `Release version <x.y.z>`.
- The tag follows the format `v<x.y.z>` (e.g. `v1.3.0-beta.2`).
- Push sends `origin main` and, if a tag was created, `origin v<x.y.z>`.

## `packageManager` field

On each run, the `packageManager` field in `package.json` is updated with the detected package manager (via `npm_config_user_agent` or the lock file present). This behaviour can be changed:

- `--ignore-pm`: leave the field unchanged
- `--no-pm`: remove the field entirely

## CHANGELOG

Each release checks the project's `CHANGELOG.md` (or `CHANGELOG`; `CHANGELOG.md` wins when both exist) for a `## [<version>]` section. The file is expected in [Keep a Changelog](https://keepachangelog.com) format.

- **Section already present**: the file is left untouched.
- **`[Unreleased]` has entries**: they are moved under a new `## [<version>] - YYYY-MM-DD` heading and an empty `## [Unreleased]` is kept.
- **`[Unreleased]` is empty or missing** (empty `### Added`-style subsections and HTML comments do not count as entries): a generic `## [<version>] - YYYY-MM-DD` section with the text `Release <version>` is added before the previous release.
- **No file**: interactive mode offers to create a `CHANGELOG.md` with a generic entry (default: no). Non-interactive mode does nothing.
- **File not in Keep a Changelog format** (including conventional-changelog files, whose headings are links such as `## [1.0.0](…)`): interactive mode asks whether to continue (default: no). Non-interactive mode does nothing.

When a section is added, the file is included in the release commit. If the tag is created, the compare links at the bottom (`[unreleased]: …/compare/vX...HEAD`) are updated too; a link in another form (e.g. inline in the heading) is left as is, with a warning. Line endings (LF or CRLF) are preserved. Interactive mode asks before adding a section; if you decline, it asks whether to release without a CHANGELOG entry (default: no). Non-interactive mode adds it (with a warning for a generic section) unless `--no-auto-unreleased-bump` is passed, in which case the release fails.

Releasing a stable version after prereleases (e.g. `1.2.0` with `1.2.0-beta.1` sections present) does **not** consolidate the prerelease sections. Interactive mode asks for confirmation; non-interactive mode prints a warning.

`--skip-changelog` disables all of the above.

## Development

```bash
pnpm install
pnpm tsx src/index.ts   # run in development
pnpm run build          # compile to dist/
pnpm run test           # run tests
pnpm run lint           # lint the code
```
