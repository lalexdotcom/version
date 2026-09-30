import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const CLI = path.resolve(import.meta.dirname, "../dist/index.js");
// biome-ignore lint/suspicious/noControlCharactersInRegex: \x1b is the ANSI escape character
const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function strip(s: string): string {
	return s.replace(ANSI_RE, "");
}

export function createTempRepo(version = "1.0.0"): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "version-test-"));
	fs.writeFileSync(
		path.join(dir, "package.json"),
		`${JSON.stringify({ name: "test-pkg", version }, null, "\t")}\n`,
	);
	execSync("git init", { cwd: dir, stdio: "pipe" });
	execSync('git config user.email "test@test.com"', {
		cwd: dir,
		stdio: "pipe",
	});
	execSync('git config user.name "Test"', { cwd: dir, stdio: "pipe" });
	execSync("git add .", { cwd: dir, stdio: "pipe" });
	execSync('git commit -m "init"', { cwd: dir, stdio: "pipe" });
	return dir;
}

export function run(args: string[], cwd: string) {
	const { stdout, stderr, status } = spawnSync("node", [CLI, ...args], {
		cwd,
		encoding: "utf-8",
		// Clear user agent so PM detection relies only on lock files
		env: { ...process.env, npm_config_user_agent: undefined },
	});
	return { stdout: stdout ?? "", stderr: stderr ?? "", status: status ?? 1 };
}

export const LINKS =
	"[unreleased]: https://github.com/o/r/compare/v1.0.0...HEAD\n" +
	"[1.0.0]: https://github.com/o/r/releases/tag/v1.0.0\n";

export const CHANGELOG_WITH_UNRELEASED = `# Changelog

## [Unreleased]

### Added

- New feature

## [1.0.0] - 2026-01-01

- Initial release

${LINKS}`;

export function today(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function commitFile(dir: string, name: string, content: string): string {
	const file = path.join(dir, name);
	fs.writeFileSync(file, content);
	execSync("git add .", { cwd: dir, stdio: "pipe" });
	execSync(`git commit -m "add ${name}"`, { cwd: dir, stdio: "pipe" });
	return file;
}
