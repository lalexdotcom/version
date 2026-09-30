import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../.scratchpad");

const LINKS = `[unreleased]: https://github.com/o/r/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/o/r/releases/tag/v1.0.0
`;

const RELEASED = `## [1.0.0] - 2026-01-01

### Added

- Initial release
`;

const WITH_UNRELEASED = `# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- New feature

### Fixed

- Some bug

${RELEASED}
${LINKS}`;

interface Fixture {
	version: string;
	files: Record<string, string>;
}

const FIXTURES: Record<string, Fixture> = {
	"no-changelog": { version: "1.0.0", files: {} },
	unreleased: { version: "1.0.0", files: { "CHANGELOG.md": WITH_UNRELEASED } },
	"unreleased-empty": {
		version: "1.0.0",
		files: {
			"CHANGELOG.md": `# Changelog\n\n## [Unreleased]\n\n### Added\n\n### Fixed\n\n${RELEASED}\n${LINKS}`,
		},
	},
	"section-exists": {
		version: "1.0.0",
		files: {
			"CHANGELOG.md": WITH_UNRELEASED.replace(
				"## [1.0.0]",
				"## [1.0.1] - 2026-02-01\n\n### Fixed\n\n- Patch fix\n\n## [1.0.0]",
			),
		},
	},
	prereleases: {
		version: "1.1.0-rc.1",
		files: {
			"CHANGELOG.md": WITH_UNRELEASED.replace(
				"## [1.0.0]",
				"## [1.1.0-rc.1] - 2026-03-01\n\n### Fixed\n\n- RC fix\n\n" +
					"## [1.1.0-beta.1] - 2026-02-15\n\n### Added\n\n- Beta feature\n\n## [1.0.0]",
			),
		},
	},
	"changelog-version": {
		version: "1.0.0",
		files: {
			"CHANGELOG.md": WITH_UNRELEASED.replace(
				"## [1.0.0]",
				"## [1.1.0] - 2026-04-01\n\n### Added\n\n- Prepared by hand\n\n## [1.0.0]",
			),
		},
	},
	"no-extension": { version: "1.0.0", files: { CHANGELOG: WITH_UNRELEASED } },
	"both-files": {
		version: "1.0.0",
		files: { "CHANGELOG.md": WITH_UNRELEASED, CHANGELOG: WITH_UNRELEASED },
	},
	"not-keep-a-changelog": {
		version: "1.0.0",
		files: { "CHANGELOG.md": "# History\n\n1.0.0: initial release\n" },
	},
};

const git = (cwd: string, args: string) => execSync(`git ${args}`, { cwd, stdio: "pipe" });

fs.rmSync(ROOT, { recursive: true, force: true });
for (const [name, { version, files }] of Object.entries(FIXTURES)) {
	const dir = path.join(ROOT, name);
	// The CLI pushes to "origin main": a local bare repo lets the push step succeed
	const remote = path.join(ROOT, ".remotes", `${name}.git`);
	fs.mkdirSync(dir, { recursive: true });
	fs.mkdirSync(remote, { recursive: true });
	git(remote, "init --bare -b main");

	fs.writeFileSync(
		path.join(dir, "package.json"),
		`${JSON.stringify({ name, version }, null, "\t")}\n`,
	);
	for (const [file, content] of Object.entries(files)) {
		fs.writeFileSync(path.join(dir, file), content);
	}

	// Without its own repo, git would resolve to the upversion repo and the release would commit there
	git(dir, "init -b main");
	git(dir, 'config user.email "scratch@example.com"');
	git(dir, 'config user.name "Scratch"');
	git(dir, `remote add origin ${remote}`);
	git(dir, "add .");
	git(dir, 'commit -m "init"');
	git(dir, "push -u origin main");
	console.log(`${name} (${version})`);
}
