import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "@lydell/node-pty";
import { afterEach, beforeEach, describe, expect, test } from "@rstest/core";
import { CHANGELOG_WITH_UNRELEASED, CLI, commitFile, createTempRepo, today } from "./helpers";

const ENTER = "\r";
// clack's confirm flips its value on any arrow key
const TOGGLE_ENTER = "\x1b[D\r";
const TIMEOUT = 20_000;

// biome-ignore lint/suspicious/noControlCharactersInRegex: \x1b is the ANSI escape character
const TERMINAL_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

interface Step {
	prompt: string;
	keys: string;
}

// clack needs a TTY: the CLI runs in a pseudo-terminal and each step waits for its prompt, so a
// prompt missing or asked out of order fails with the screen so far instead of hanging
function runInteractive(
	args: string[],
	cwd: string,
	steps: Step[],
): Promise<{ output: string; status: number }> {
	return new Promise((resolve, reject) => {
		const env: Record<string, string> = {};
		for (const [key, value] of Object.entries(process.env)) {
			if (value !== undefined && key !== "npm_config_user_agent") env[key] = value;
		}
		const pty = spawn("node", [CLI, ...args], { cwd, cols: 200, rows: 50, env });
		const pending = [...steps];
		let raw = "";
		let searchFrom = 0;
		const screen = () => raw.replace(TERMINAL_RE, "");
		const timer = setTimeout(() => {
			pty.kill();
			const waited = pending[0] ? `no prompt "${pending[0].prompt}"` : "unexpected prompt";
			reject(new Error(`${waited} after:\n${screen()}`));
		}, TIMEOUT - 2_000);

		pty.onData((data) => {
			raw += data;
			const next = pending[0];
			if (!next) return;
			const at = screen().indexOf(next.prompt, searchFrom);
			if (at === -1) return;
			searchFrom = at + next.prompt.length;
			pending.shift();
			// Keys sent in the same tick as the first render can be read before clack listens
			setTimeout(() => pty.write(next.keys), 50);
		});
		pty.onExit(({ exitCode }) => {
			clearTimeout(timer);
			if (pending.length > 0) {
				reject(new Error(`exited before prompt "${pending[0].prompt}":\n${screen()}`));
			} else {
				resolve({ output: screen(), status: exitCode });
			}
		});
	});
}

const noTagNoPushProceed: Step[] = [
	{ prompt: "Create git tag", keys: TOGGLE_ENTER },
	{ prompt: "Push to remote?", keys: TOGGLE_ENTER },
	{ prompt: "Proceed with update", keys: ENTER },
];

describe("interactive changelog", () => {
	let dir: string;
	beforeEach(() => {
		dir = createTempRepo("1.0.0");
	});
	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	test(
		"offers the changelog version as the first menu entry",
		async () => {
			commitFile(
				dir,
				"CHANGELOG.md",
				CHANGELOG_WITH_UNRELEASED.replace(
					"## [1.0.0]",
					"## [1.2.0] - 2026-04-01\n\n- Big feature\n\n## [1.0.0]",
				),
			);
			const { output, status } = await runInteractive(["--dry-run", "--ignore-pm"], dir, [
				{ prompt: "Select version bump type:", keys: ENTER },
				{ prompt: "Create git tag", keys: ENTER },
				{ prompt: "Push to remote?", keys: ENTER },
			]);
			expect(status).toBe(0);
			expect(output).toContain("Changelog  (1.0.0 → 1.2.0)");
			expect(output).toContain("Version: 1.0.0 → 1.2.0");
		},
		TIMEOUT,
	);

	test(
		"assigns [Unreleased], then asks tag and push last",
		async () => {
			const file = commitFile(dir, "CHANGELOG.md", CHANGELOG_WITH_UNRELEASED);
			const { output, status } = await runInteractive(["--bump", "patch", "--ignore-pm"], dir, [
				{ prompt: "Assign [Unreleased] in CHANGELOG.md to 1.0.1?", keys: ENTER },
				...noTagNoPushProceed,
			]);
			expect(status).toBe(0);
			expect(fs.readFileSync(file, "utf-8")).toContain(`## [1.0.1] - ${today()}`);
			const order = ["Assign [Unreleased]", "Create git tag", "Push to remote?", "Proceed with"];
			const positions = order.map((prompt) => output.indexOf(prompt));
			expect(positions).toEqual([...positions].sort((a, b) => a - b));
		},
		TIMEOUT,
	);

	test(
		"declining the assignment aborts unless releasing without an entry",
		async () => {
			const file = commitFile(dir, "CHANGELOG.md", CHANGELOG_WITH_UNRELEASED);
			const { output, status } = await runInteractive(["--bump", "patch", "--ignore-pm"], dir, [
				{ prompt: "Assign [Unreleased]", keys: TOGGLE_ENTER },
				{ prompt: "Release without a CHANGELOG entry for 1.0.1?", keys: ENTER },
			]);
			expect(status).toBe(0);
			expect(output).toContain("Aborted");
			expect(fs.readFileSync(file, "utf-8")).toBe(CHANGELOG_WITH_UNRELEASED);
			const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
			expect(pkg.version).toBe("1.0.0");
		},
		TIMEOUT,
	);

	test(
		"adds a generic section when [Unreleased] is empty",
		async () => {
			const file = commitFile(
				dir,
				"CHANGELOG.md",
				CHANGELOG_WITH_UNRELEASED.replace("- New feature\n", ""),
			);
			const { status } = await runInteractive(["--bump", "patch", "--ignore-pm"], dir, [
				{ prompt: 'Add a generic "Release 1.0.1" section?', keys: ENTER },
				...noTagNoPushProceed,
			]);
			expect(status).toBe(0);
			expect(fs.readFileSync(file, "utf-8")).toContain(
				`## [1.0.1] - ${today()}\n\nRelease 1.0.1\n`,
			);
		},
		TIMEOUT,
	);

	test(
		"a changelog in another format aborts by default",
		async () => {
			commitFile(dir, "CHANGELOG.md", "# History\n\n1.0.0: initial release\n");
			const { output, status } = await runInteractive(["--bump", "patch", "--ignore-pm"], dir, [
				{ prompt: "is not in Keep a Changelog format. Continue anyway?", keys: ENTER },
			]);
			expect(status).toBe(0);
			expect(output).toContain("Aborted");
		},
		TIMEOUT,
	);

	test(
		"creates a CHANGELOG on request",
		async () => {
			const { status } = await runInteractive(["--bump", "patch", "--ignore-pm"], dir, [
				{ prompt: "No CHANGELOG found. Create one", keys: TOGGLE_ENTER },
				...noTagNoPushProceed,
			]);
			expect(status).toBe(0);
			const created = fs.readFileSync(path.join(dir, "CHANGELOG.md"), "utf-8");
			expect(created).toContain("[Keep a Changelog]");
			expect(created).toContain(`## [Unreleased]\n\n## [1.0.1] - ${today()}\n\nRelease 1.0.1\n`);
		},
		TIMEOUT,
	);

	test(
		"rollback deletes a CHANGELOG it created",
		async () => {
			execSync("git tag v1.0.1", { cwd: dir, stdio: "pipe" });
			const { status } = await runInteractive(["--bump", "patch", "--ignore-pm", "--tag"], dir, [
				{ prompt: "No CHANGELOG found. Create one", keys: TOGGLE_ENTER },
				{ prompt: "Push to remote?", keys: TOGGLE_ENTER },
				{ prompt: "Proceed with update", keys: ENTER },
			]);
			expect(status).toBe(1);
			expect(fs.existsSync(path.join(dir, "CHANGELOG.md"))).toBe(false);
		},
		TIMEOUT,
	);
});

describe("interactive changelog after prereleases", () => {
	let dir: string;
	beforeEach(() => {
		dir = createTempRepo("1.0.1-beta.1");
	});
	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	test(
		"unconsolidated prerelease sections abort by default",
		async () => {
			const content = CHANGELOG_WITH_UNRELEASED.replace(
				"## [1.0.0]",
				"## [1.0.1-beta.1] - 2026-02-01\n\n- Beta fix\n\n## [1.0.0]",
			);
			const file = commitFile(dir, "CHANGELOG.md", content);
			const { output, status } = await runInteractive(["--bump", "release", "--ignore-pm"], dir, [
				{ prompt: "Assign [Unreleased]", keys: ENTER },
				{ prompt: "they will not be consolidated. Continue?", keys: ENTER },
			]);
			expect(status).toBe(0);
			expect(output).toContain("Aborted");
			expect(fs.readFileSync(file, "utf-8")).toBe(content);
		},
		TIMEOUT,
	);
});
