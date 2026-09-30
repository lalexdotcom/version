# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Update a Keep a Changelog `CHANGELOG.md` (or `CHANGELOG`) on release: `[Unreleased]` is assigned to the new version, or a generic section is added when it has no entries.
- `--skip-changelog` and `--no-auto-unreleased-bump` options.
- `--bump changelog` and a "Changelog" menu entry to release the version already written in the CHANGELOG.

### Fixed

- A commit rejected by git (e.g. by a pre-commit hook) no longer leaves the release files staged after rollback.

### Removed

- `exports` and `types` fields from `package.json`: the package is a CLI and exports nothing.

## [1.1.1] - 2026-03-20

### Fixed

- Uncommitted changes detection no longer reports false positives from a stale git index (e.g. after `npx` touches file mtimes).

## [1.1.0] - 2026-03-20

### Added

- Run outside a git repository: commit, tag and push are skipped.

### Fixed

- Repositories without any commit no longer fail the uncommitted changes check.

## [1.0.1] - 2026-03-20

### Added

- Roll back the tag, the commit and `package.json` when a release step fails.

## [1.0.0] - 2026-03-20

### Added

- First release as `upversion` (previously `@lalex/version`): bump `package.json`, update `packageManager`, commit, tag and push, interactively or with `--non-interactive`.

[unreleased]: https://github.com/lalexdotcom/version/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/lalexdotcom/version/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/lalexdotcom/version/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/lalexdotcom/version/releases/tag/v1.0.1
[1.0.0]: https://github.com/lalexdotcom/version/tree/f638b62
