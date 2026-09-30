import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { isCancel, select } from "@clack/prompts";
import { Command, InvalidArgumentError } from "commander";

interface VersionParts {
	major: number;
	minor: number;
	patch: number;
}

const PRERELEASE_LEVELS = ["alpha", "beta", "rc"] as const;
type PrereleaseLevel = (typeof PRERELEASE_LEVELS)[number];

interface CLIOptions {
	dryRun: boolean;
	verbose: boolean;
	nonInteractive: boolean;
	tag: boolean;
	push: boolean;
	bump: string | undefined;
	version: string | undefined;
	commit: boolean;
	ignorePm: boolean;
	pm: boolean;
	skipChangelog: boolean;
	autoUnreleasedBump: boolean;
}

const program = new Command();
program
	.name("release")
	.description("Version bump utility")
	.option("--dry-run", "Run without making changes (implies --verbose)", false)
	.option("--verbose", "Show detailed step-by-step output", false)
	.option("--non-interactive", "Disable all prompts, use defaults or flags", false)
	.option("--tag", "Create a git tag", false)
	.option("--push", "Push commit and tag to remote", false)
	.option(
		"--bump <type>",
		"Bump type: patch, minor, major, prerelease[+alpha|beta|rc|next], release, changelog",
	)
	.option(
		"--version <version>",
		"Set version explicitly (e.g. 1.2.3 or 1.2.3-alpha.1)",
		(value: string) => {
			const validation = validateVersion(value);
			if (!validation.valid) throw new InvalidArgumentError(validation.error ?? "Invalid version");
			return value;
		},
	)
	.option("--commit", "Commit uncommitted changes together with the version bump", false)
	.option("--ignore-pm", "Skip updating the packageManager field", false)
	.option("--no-pm", "Remove the packageManager field")
	.option("--skip-changelog", "Do not check or update the CHANGELOG", false)
	.option(
		"--no-auto-unreleased-bump",
		"In non-interactive mode, fail instead of adding a CHANGELOG section for the new version",
	)
	.parse();

function parseCLIOptions(): CLIOptions {
	return program.opts<CLIOptions>();
}

const options = parseCLIOptions();
const isNonInteractive = options.nonInteractive;

// Parse version from package.json
function getCurrentVersion(): string {
	const packagePath = path.join(process.cwd(), "package.json");
	const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
	return packageJson.version;
}

// Parse version into components
function parseVersion(version: string): VersionParts {
	const baseVersion = version.replace(/-.*$/, "");
	const [major, minor, patch] = baseVersion.split(".").map(Number);
	return { major, minor, patch };
}

// Check if version is a prerelease
function isPrerelease(version: string): boolean {
	return /-/.test(version);
}

// Extract prerelease type
function getPrereleaseType(version: string): PrereleaseLevel | "stable" {
	const match = version.match(/-([a-z]+)/);
	return (match?.[1] as PrereleaseLevel) || "stable";
}

// Extract prerelease number
function getPrereleaseNumber(version: string): number {
	const match = version.match(/-([a-z]+)\.(\d+)/);
	return match ? Number(match[2]) : 0;
}

// Check if newVer is strictly greater than currentVer
function isVersionGreater(newVer: string, currentVer: string): boolean {
	const np = parseVersion(newVer);
	const cp = parseVersion(currentVer);
	if (np.major !== cp.major) return np.major > cp.major;
	if (np.minor !== cp.minor) return np.minor > cp.minor;
	if (np.patch !== cp.patch) return np.patch > cp.patch;
	// Same base version: stable > any prerelease
	const nt = getPrereleaseType(newVer);
	const ct = getPrereleaseType(currentVer);
	if (nt === "stable" && ct !== "stable") return true;
	if (nt !== "stable" && ct === "stable") return false;
	if (nt === "stable" && ct === "stable") return false;
	// Both prerelease: compare levels then numbers
	const ni = PRERELEASE_LEVELS.indexOf(nt as PrereleaseLevel);
	const ci = PRERELEASE_LEVELS.indexOf(ct as PrereleaseLevel);
	if (ni !== ci) return ni > ci;
	return getPrereleaseNumber(newVer) > getPrereleaseNumber(currentVer);
}

// Get next prerelease level (null if already at the last level)
function getNextPrereleaseLevel(current: PrereleaseLevel): PrereleaseLevel | null {
	const idx = PRERELEASE_LEVELS.indexOf(current);
	return idx < PRERELEASE_LEVELS.length - 1 ? PRERELEASE_LEVELS[idx + 1] : null;
}

// Extract version for a given PM name from npm_config_user_agent, or run the binary as fallback
function resolvePackageManagerVersion(pm: string): string {
	const userAgent = process.env.npm_config_user_agent;
	if (userAgent) {
		// Format: "pnpm/9.1.0 npm/? node/v20.0.0 ..."
		const match = userAgent.match(/^([\w-]+)\/([^\s]+)/);
		if (match && match[1] === pm) {
			return match[2];
		}
	}
	// Use a dedicated sandbox dir so neither corepack nor pnpm finds a package.json
	// with a conflicting packageManager field and refuses to run.
	const sandboxDir = path.join(os.tmpdir(), "@lalex-version-sandbox");
	fs.mkdirSync(sandboxDir, { recursive: true });
	const sandboxPkg = path.join(sandboxDir, "package.json");
	if (fs.existsSync(sandboxPkg)) {
		fs.rmSync(sandboxPkg);
	}
	return execSync(`${pm} --version`, {
		encoding: "utf-8",
		cwd: sandboxDir,
		env: { ...process.env, COREPACK_ENABLE_PROJECT_SPEC: "0" },
	}).trim();
}

// Detect the package manager name and version from the running process
function detectPackageManager(): string {
	// Check lock files first — they reflect the project's actual package manager,
	// regardless of how this tool was invoked (e.g. via npx sets npm_config_user_agent=npm).
	const cwd = process.cwd();
	if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
		return `pnpm@${resolvePackageManagerVersion("pnpm")}`;
	}
	if (fs.existsSync(path.join(cwd, "yarn.lock"))) {
		return `yarn@${resolvePackageManagerVersion("yarn")}`;
	}
	if (fs.existsSync(path.join(cwd, "bun.lockb")) || fs.existsSync(path.join(cwd, "bun.lock"))) {
		return `bun@${resolvePackageManagerVersion("bun")}`;
	}
	// Fallback: use npm_config_user_agent (reliable when no lock file exists)
	const userAgent = process.env.npm_config_user_agent;
	if (userAgent) {
		const match = userAgent.match(/^([\w-]+)\/([^\s]+)/);
		if (match) {
			return `${match[1]}@${match[2]}`;
		}
	}
	return `npm@${resolvePackageManagerVersion("npm")}`;
}

// Check if git is installed and the cwd is inside a git repository
function isGitRepo(): boolean {
	try {
		execSync("git rev-parse --git-dir", { stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

// Validate semantic version format
function validateVersion(version: string): { valid: boolean; error?: string } {
	// Format: x.y.z or x.y.z-<level>.<n>
	const levels = PRERELEASE_LEVELS.join("|");
	const versionRegex = new RegExp(`^[0-9]+\\.[0-9]+\\.[0-9]+(-(${levels})\\.([0-9]+))?$`);
	const match = versionRegex.exec(version);

	if (!match) {
		return {
			valid: false,
			error: `Invalid version format: "${version}". Expected format: x.y.z or x.y.z-<level>.<n> (e.g. 1.2.3-alpha.1). Valid prerelease levels: ${PRERELEASE_LEVELS.join(", ")}`,
		};
	}

	return { valid: true };
}

// Get manual version input from user
async function selectManualVersion(): Promise<string> {
	const { text } = await import("@clack/prompts");

	let version = "";
	let isValid = false;

	while (!isValid) {
		const input = await text({
			message: "Enter version (e.g., 1.0.0 or 1.0.0-alpha.1):",
			validate: (value) => {
				const validation = validateVersion(value ?? "");
				if (!validation.valid) {
					return validation.error;
				}
				return undefined;
			},
		});

		if (isCancel(input)) {
			console.log("Released cancelled");
			process.exit(0);
		}

		const validation = validateVersion(input);
		if (validation.valid) {
			version = input;
			isValid = true;
		}
	}

	return version;
}

// Resolve new version from CLI --bump flag
function resolveVersionFromCLIBump(current: string, bump: string): string {
	if (bump === "changelog") return getChangelogVersion();
	const [base, preid] = bump.split("+");
	const parts = parseVersion(current);
	const currentType = getPrereleaseType(current);
	const currentNumber = getPrereleaseNumber(current);
	const baseVersion = current.replace(/-.*$/, "");
	const firstLevel = PRERELEASE_LEVELS[0];

	if (isPrerelease(current)) {
		switch (base) {
			case "patch":
				return `${parts.major}.${parts.minor}.${parts.patch + 1}-${firstLevel}.1`;
			case "minor":
				return `${parts.major}.${parts.minor + 1}.0-${firstLevel}.1`;
			case "major":
				return `${parts.major + 1}.0.0-${firstLevel}.1`;
			case "release":
				return baseVersion;
			case "prerelease": {
				if (!preid) {
					return `${baseVersion}-${currentType}.${currentNumber + 1}`;
				}
				if (preid === "next") {
					const currentIdx = PRERELEASE_LEVELS.indexOf(currentType as PrereleaseLevel);
					if (currentIdx === PRERELEASE_LEVELS.length - 1) {
						throw new Error(
							`Cannot bump to next prerelease level: "${currentType}" is already the last level (${PRERELEASE_LEVELS.join(" → ")})`,
						);
					}
					return `${baseVersion}-${PRERELEASE_LEVELS[currentIdx + 1]}.1`;
				}
				if (!PRERELEASE_LEVELS.includes(preid as PrereleaseLevel)) {
					throw new Error(
						`Unknown prerelease type: "${preid}". Valid types: ${PRERELEASE_LEVELS.join(", ")}`,
					);
				}
				const targetIdx = PRERELEASE_LEVELS.indexOf(preid as PrereleaseLevel);
				const currentIdx = PRERELEASE_LEVELS.indexOf(currentType as PrereleaseLevel);
				if (targetIdx < currentIdx) {
					throw new Error(`Cannot regress prerelease type from "${currentType}" to "${preid}"`);
				}
				if (targetIdx === currentIdx) {
					return `${baseVersion}-${currentType}.${currentNumber + 1}`;
				}
				return `${baseVersion}-${preid}.1`;
			}
			default:
				throw new Error(`Unknown bump type: "${bump}"`);
		}
	} else {
		switch (base) {
			case "patch":
				return `${parts.major}.${parts.minor}.${parts.patch + 1}`;
			case "minor":
				return `${parts.major}.${parts.minor + 1}.0`;
			case "major":
				return `${parts.major + 1}.0.0`;
			case "release":
				throw new Error(`Cannot use --bump release on a stable version "${current}"`);
			case "prerelease": {
				if (preid === "next") {
					throw new Error("Cannot use --bump prerelease+next on a stable version");
				}
				if (preid && !PRERELEASE_LEVELS.includes(preid as PrereleaseLevel)) {
					throw new Error(
						`Unknown prerelease type: "${preid}". Valid types: ${PRERELEASE_LEVELS.join(", ")}`,
					);
				}
				const tag = preid ?? firstLevel;
				return `${parts.major}.${parts.minor}.${parts.patch + 1}-${tag}.1`;
			}
			default:
				throw new Error(`Unknown bump type: "${bump}"`);
		}
	}
}

// Show bump type menu for stable versions
async function selectBumpTypeStable(currentVersion: string): Promise<string> {
	const parts = parseVersion(currentVersion);
	const firstLevel = PRERELEASE_LEVELS[0];
	const patchVer = `${parts.major}.${parts.minor}.${parts.patch + 1}`;
	const minorVer = `${parts.major}.${parts.minor + 1}.0`;
	const majorVer = `${parts.major + 1}.0.0`;
	const preVer = `${patchVer}-${firstLevel}.1`;

	const choice = await select({
		message: "Select version bump type:",
		options: [
			...changelogMenuOption(currentVersion),
			{ value: "patch", label: `Patch     (${currentVersion} → ${patchVer})` },
			{ value: "minor", label: `Minor     (${currentVersion} → ${minorVer})` },
			{ value: "major", label: `Major     (${currentVersion} → ${majorVer})` },
			{
				value: "prerelease",
				label: `Prerelease (${currentVersion} → ${preVer})`,
			},
			{ value: "advanced", label: "Advanced..." },
		],
	});

	if (isCancel(choice)) {
		console.log("Release cancelled");
		process.exit(0);
	}

	if (choice === "advanced") return selectAdvancedMenuStable(currentVersion);
	return choice;
}

// Show advanced options for stable versions
async function selectAdvancedMenuStable(currentVersion: string): Promise<string> {
	const parts = parseVersion(currentVersion);
	const patchVer = `${parts.major}.${parts.minor}.${parts.patch + 1}`;

	const options: Array<{ value: string; label: string }> = PRERELEASE_LEVELS.map((level) => ({
		value: `prerelease+${level}`,
		label: `Prerelease ${level.padEnd(5)} (${currentVersion} → ${patchVer}-${level}.1)`,
	}));
	options.push({ value: "manual", label: "Manual version" });
	options.push({ value: "back", label: "Back" });

	const choice = await select({ message: "Advanced options:", options });

	if (isCancel(choice)) {
		console.log("Release cancelled");
		process.exit(0);
	}

	if (choice === "back") return selectBumpTypeStable(currentVersion);
	if (choice === "manual") return selectManualVersion();
	return choice;
}

// Show bump type menu for prerelease versions
async function selectBumpTypePrerelease(currentVersion: string): Promise<string> {
	const type = getPrereleaseType(currentVersion) as PrereleaseLevel;
	const number = getPrereleaseNumber(currentVersion);
	const baseVersion = currentVersion.replace(/-.*$/, "");
	const nextLevel = getNextPrereleaseLevel(type);

	const incrVer = `${baseVersion}-${type}.${number + 1}`;

	const options: Array<{ value: string; label: string }> = [
		...changelogMenuOption(currentVersion),
		{
			value: "prerelease",
			label: `Increment  (${currentVersion} → ${incrVer})`,
		},
	];

	if (nextLevel !== null) {
		const nextVer = `${baseVersion}-${nextLevel}.1`;
		options.push({
			value: "prerelease+next",
			label: `Next level (${currentVersion} → ${nextVer})`,
		});
	}

	options.push({
		value: "release",
		label: `Release    (${currentVersion} → ${baseVersion})`,
	});
	options.push({ value: "advanced", label: "Advanced..." });

	const choice = await select({
		message: "Select version bump type:",
		options,
	});

	if (isCancel(choice)) {
		console.log("Release cancelled");
		process.exit(0);
	}

	if (choice === "advanced") return selectAdvancedMenuPrerelease(currentVersion);
	return choice;
}

// Show advanced options for prerelease versions
async function selectAdvancedMenuPrerelease(currentVersion: string): Promise<string> {
	const type = getPrereleaseType(currentVersion) as PrereleaseLevel;
	const currentIdx = PRERELEASE_LEVELS.indexOf(type);
	const baseVersion = currentVersion.replace(/-.*$/, "");
	const parts = parseVersion(currentVersion);
	const firstLevel = PRERELEASE_LEVELS[0];

	const options: Array<{ value: string; label: string }> = [];

	// Only levels strictly above current (no regression)
	for (const level of PRERELEASE_LEVELS) {
		if (PRERELEASE_LEVELS.indexOf(level) > currentIdx) {
			options.push({
				value: `prerelease+${level}`,
				label: `Jump to ${level.padEnd(5)} (${currentVersion} → ${baseVersion}-${level}.1)`,
			});
		}
	}

	const patchVer = `${parts.major}.${parts.minor}.${parts.patch + 1}-${firstLevel}.1`;
	const minorVer = `${parts.major}.${parts.minor + 1}.0-${firstLevel}.1`;
	const majorVer = `${parts.major + 1}.0.0-${firstLevel}.1`;

	options.push({
		value: "patch",
		label: `Patch bump (${currentVersion} → ${patchVer})`,
	});
	options.push({
		value: "minor",
		label: `Minor bump (${currentVersion} → ${minorVer})`,
	});
	options.push({
		value: "major",
		label: `Major bump (${currentVersion} → ${majorVer})`,
	});
	options.push({ value: "manual", label: "Manual version" });
	options.push({ value: "back", label: "Back" });

	const choice = await select({ message: "Advanced options:", options });

	if (isCancel(choice)) {
		console.log("Release cancelled");
		process.exit(0);
	}

	if (choice === "back") return selectBumpTypePrerelease(currentVersion);
	if (choice === "manual") return selectManualVersion();
	return choice;
}

// Show version bump menu — entry point (dispatches to stable or prerelease variant)
async function selectBumpType(currentVersion: string): Promise<string> {
	// In non-interactive mode, auto-select a sensible default
	if (isNonInteractive) {
		if (isPrerelease(currentVersion)) {
			return "prerelease";
		}
		return "patch";
	}

	if (isPrerelease(currentVersion)) {
		return selectBumpTypePrerelease(currentVersion);
	}
	return selectBumpTypeStable(currentVersion);
}

// ─── CHANGELOG (Keep a Changelog) ─────────────────────────────────────────────
const CHANGELOG_HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`;

interface ChangelogUpdate {
	path: string;
	// null when the file is created, so rollback deletes it instead of restoring it
	original: string | null;
	updated: string;
	change: string;
}

function findChangelog(): string | null {
	for (const name of ["CHANGELOG.md", "CHANGELOG"]) {
		const file = path.join(process.cwd(), name);
		if (fs.existsSync(file)) return file;
	}
	return null;
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// conventional-changelog links its headings ("## [1.0.0](url) (date)") and writes patches as
// "### [1.0.1](url)": editing such a file as Keep a Changelog would misplace the new section
function isKeepAChangelog(content: string): boolean {
	if (/^#{2,3} \[\d[^\]]*\]\(/m.test(content)) return false;
	return /^## \[(unreleased|\d+\.\d+\.\d+[^\]]*)\]/im.test(content);
}

function hasVersionSection(content: string, version: string): boolean {
	return new RegExp(`^## \\[${escapeRegExp(version)}\\]`, "m").test(content);
}

// The body also ends at link references: [Unreleased] may be the last section of the file
function findUnreleased(content: string): { headingEnd: number; body: string } | null {
	const heading = /^## \[unreleased\][^\n]*/im.exec(content);
	if (!heading) return null;
	const headingEnd = heading.index + heading[0].length;
	const rest = content.slice(headingEnd);
	const end = rest.search(/^(## |\[[^\]]+\]:)/m);
	return { headingEnd, body: end === -1 ? rest : rest.slice(0, end) };
}

// Empty template subsections ("### Added") and HTML comment placeholders are not entries
function hasEntries(body: string): boolean {
	return body
		.replace(/<!--[\s\S]*?-->/g, "")
		.split("\n")
		.some((line) => line.trim() !== "" && !line.startsWith("### "));
}

function findPrereleaseSections(content: string, version: string): string[] {
	const re = new RegExp(`^## \\[(${escapeRegExp(version)}-[^\\]]+)\\]`, "gm");
	return Array.from(content.matchAll(re), (m) => m[1]);
}

// The highest version rather than the first heading, so a misordered file cannot pick an older release;
// throws the reason so --bump changelog can report it and the menus can hide the option
function getChangelogVersion(): string {
	const file = findChangelog();
	if (!file) throw new Error("no CHANGELOG found");
	const name = path.basename(file);
	const content = fs.readFileSync(file, "utf-8");
	if (!isKeepAChangelog(content)) throw new Error(`${name} is not in Keep a Changelog format`);
	const versions = Array.from(content.matchAll(/^## \[([^\]]+)\]/gm), (m) => m[1]).filter(
		(v) => validateVersion(v).valid,
	);
	if (versions.length === 0) throw new Error(`${name} has no release section`);
	return versions.reduce((highest, v) => (isVersionGreater(v, highest) ? v : highest));
}

function changelogMenuOption(currentVersion: string): Array<{ value: string; label: string }> {
	try {
		const version = getChangelogVersion();
		if (isVersionGreater(version, currentVersion)) {
			return [{ value: "changelog", label: `Changelog  (${currentVersion} → ${version})` }];
		}
	} catch {}
	return [];
}

// Local date, not toISOString(): a release made late in the evening must not be dated tomorrow
function localDate(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function assignUnreleased(content: string, version: string): string {
	const unreleased = findUnreleased(content);
	if (!unreleased) return content;
	const { headingEnd } = unreleased;
	return `${content.slice(0, headingEnd)}\n\n## [${version}] - ${localDate()}${content.slice(headingEnd)}`;
}

function genericSection(version: string): string {
	return `## [${version}] - ${localDate()}\n\nRelease ${version}`;
}

// Searching from the first "## " heading keeps link definitions of the intro out of the match;
// empty [Unreleased] subsections stay where they are
function addGenericSection(content: string, version: string): string {
	const start = Math.max(content.search(/^## /m), 0);
	const next = /^(## \[(?!unreleased\])|\[[^\]]+\]:)/im.exec(content.slice(start));
	const at = next ? start + next.index : content.length;
	const before = content.slice(0, at).replace(/\n*$/, "\n\n");
	const after = content.slice(at);
	const section = genericSection(version);
	return after ? `${before}${section}\n\n${after}` : `${before}${section}\n`;
}

// null when an [unreleased] link exists in a form this cannot rewrite (e.g. inline in the heading),
// so the caller can say so instead of leaving a stale link unnoticed
function updateCompareLinks(content: string, version: string): string | null {
	const link = /^\[(unreleased)\]:[ \t]*(\S+\/compare\/)(\S+?)\.\.\.(\S+)[ \t]*$/im;
	if (link.test(content)) {
		return content.replace(
			link,
			(_, label, base, previous, target) =>
				`[${label}]: ${base}v${version}...${target}\n[${version}]: ${base}${previous}...v${version}`,
		);
	}
	return /\[unreleased\][:(]/i.test(content) ? null : content;
}

// Decide the CHANGELOG change before any write, so a refusal aborts with nothing to roll back
async function resolveChangelog(newVersion: string): Promise<ChangelogUpdate | null> {
	if (options.skipChangelog) return null;

	const { confirm } = await import("@clack/prompts");
	const ask = async (message: string, initialValue: boolean): Promise<boolean> => {
		const result = await confirm({ message, active: "Yes", inactive: "No", initialValue });
		if (isCancel(result)) {
			console.log("Release cancelled");
			process.exit(0);
		}
		return result;
	};
	const abort = (): never => {
		console.log("\x1b[33m◆ Aborted.\x1b[0m");
		process.exit(0);
	};

	const file = findChangelog();
	if (!file) {
		// Creating a file nobody asked for is fine behind a prompt, not silently in CI
		if (isNonInteractive) return null;
		const create = await ask(
			`No CHANGELOG found. Create one with a generic "Release ${newVersion}" entry?`,
			false,
		);
		if (!create) return null;
		return {
			path: path.join(process.cwd(), "CHANGELOG.md"),
			original: null,
			updated: `${CHANGELOG_HEADER}## [Unreleased]\n\n${genericSection(newVersion)}\n`,
			change: `created with a generic ${newVersion} section`,
		};
	}

	const name = path.basename(file);
	const original = fs.readFileSync(file, "utf-8");
	// Edit with \n only and convert back, so inserted lines match the file's line endings
	const crlf = original.includes("\r\n");
	const content = crlf ? original.replace(/\r\n/g, "\n") : original;
	if (!isKeepAChangelog(content)) {
		if (isNonInteractive) return null;
		if (!(await ask(`${name} is not in Keep a Changelog format. Continue anyway?`, false))) abort();
		return null;
	}
	if (hasVersionSection(content, newVersion)) return null;

	let updated: string | null = null;
	let change = "";
	const unreleased = findUnreleased(content);
	if (unreleased && hasEntries(unreleased.body)) {
		const assign = isNonInteractive
			? options.autoUnreleasedBump
			: await ask(`Assign [Unreleased] in ${name} to ${newVersion}?`, true);
		if (assign) {
			updated = assignUnreleased(content, newVersion);
			change = `[Unreleased] assigned to ${newVersion}`;
		}
	} else {
		const add = isNonInteractive
			? options.autoUnreleasedBump
			: await ask(
					`${name} has no entries for ${newVersion}. Add a generic "Release ${newVersion}" section?`,
					true,
				);
		if (add) {
			if (isNonInteractive) {
				const outcome = options.dryRun ? "will be added" : "added";
				console.warn(`${name} has no entries for ${newVersion}: generic section ${outcome}`);
			}
			updated = addGenericSection(content, newVersion);
			change = `generic ${newVersion} section added`;
		}
	}

	if (updated === null) {
		if (isNonInteractive) {
			console.error(
				`${name} has no section for ${newVersion}. use --skip-changelog to release without it.`,
			);
			process.exit(1);
		}
		if (!(await ask(`Release without a CHANGELOG entry for ${newVersion}?`, false))) abort();
		return null;
	}

	const prereleases = isPrerelease(newVersion) ? [] : findPrereleaseSections(content, newVersion);
	if (prereleases.length > 0) {
		const found = `${prereleases.join(", ")} in ${name}`;
		if (isNonInteractive) {
			console.warn(`found ${found}: they will not be consolidated into ${newVersion}`);
		} else if (!(await ask(`Found ${found} — they will not be consolidated. Continue?`, false))) {
			abort();
		}
	}

	return {
		path: file,
		original,
		updated: crlf ? updated.replace(/\n/g, "\r\n") : updated,
		change,
	};
}

// Applied once the tag prompt is answered, not in resolveChangelog: the changelog questions must
// come before tag and push, yet without the tag a link to v<version> would point to nothing
function linkChangelog(update: ChangelogUpdate, version: string): ChangelogUpdate {
	const crlf = update.updated.includes("\r\n");
	const linked = updateCompareLinks(
		crlf ? update.updated.replace(/\r\n/g, "\n") : update.updated,
		version,
	);
	if (linked === null) {
		const message = `compare links in ${path.basename(update.path)} not updated: unsupported [unreleased] link format`;
		if (isNonInteractive) console.warn(message);
		else console.log(`\x1b[33m⚠ ${message}\x1b[0m`);
		return update;
	}
	return { ...update, updated: crlf ? linked.replace(/\n/g, "\r\n") : linked };
}

// ─── Logger / template system ─────────────────────────────────────────────────
type MessageKey =
	| "workingDirClean"
	| "newVersion"
	| "updatingPackageJson"
	| "packageManagerSet"
	| "packageManagerRemoved"
	| "packageManagerUnchanged"
	| "changelogUpdated"
	| "committing"
	| "committed"
	| "creatingTag"
	| "tagCreated"
	| "pushing"
	| "pushed"
	| "summary";

type TemplateVars = Record<string, string>;
type TemplateFn = (vars: TemplateVars) => string;
type TemplateMap = Partial<Record<MessageKey, string | TemplateFn>>;

interface ModeConfig {
	log: TemplateMap;
	warn: TemplateMap;
	dryRunPrefix: string;
	showBlanks: boolean;
	dryRunOmit?: MessageKey[];
}

function resolveTemplate(tpl: string | TemplateFn, vars: TemplateVars): string {
	return typeof tpl === "function" ? tpl(vars) : tpl;
}

function createLogger(config: ModeConfig, dryRun: boolean, active: boolean) {
	const prefix = dryRun ? config.dryRunPrefix : "";
	const fmt = (msg: string) => `${prefix}${msg}`;

	const warn = (key: MessageKey, vars: TemplateVars = {}): void => {
		const tpl = config.warn[key];
		if (tpl !== undefined) console.warn(resolveTemplate(tpl, vars));
	};

	const log = (key?: MessageKey, vars: TemplateVars = {}): void => {
		if (!active) return;
		if (!key) {
			if (config.showBlanks && !dryRun) console.log();
			return;
		}
		if (dryRun && config.dryRunOmit?.includes(key)) return;
		const tpl = config.log[key];
		if (tpl !== undefined) console.log(fmt(resolveTemplate(tpl, vars)));
	};

	return { log, warn };
}

const interactiveConfig: ModeConfig = {
	dryRunPrefix: "\x1b[2;33m◆ dry-run\x1b[0m  ",
	showBlanks: true,
	dryRunOmit: ["updatingPackageJson", "committing", "creatingTag", "pushing"],
	log: {
		workingDirClean: "✓ Working directory is clean",

		updatingPackageJson: "→ Updating version in package.json...",
		packageManagerSet: ({ pm }) => `✓ packageManager set to ${pm}`,
		packageManagerRemoved: "✓ packageManager field removed",
		packageManagerUnchanged: "✓ packageManager field unchanged",
		changelogUpdated: ({ file, change }) => `✓ ${file}: ${change}`,
		committing: "→ Committing changes...",
		committed: "✓ Changes committed",
		creatingTag: "→ Creating git tag...",
		tagCreated: ({ version }) => `✓ Tag #v${version} created`,
		pushing: "→ Pushing to remote...",
		pushed: ({ withTag, version }) =>
			withTag === "true" ? `✓ Commit and tag #v${version} pushed` : "✓ Commit pushed",
	},
	warn: {},
};

const nonInteractiveConfig: ModeConfig = {
	dryRunPrefix: "\x1b[33m[dry-run]\x1b[0m ",
	showBlanks: false,
	log: {
		summary: ({ from, to, extras }) =>
			extras ? `${from} => ${to} (${extras})` : `${from} => ${to}`,
	},
	warn: {},
};

const nonInteractiveVerboseConfig: ModeConfig = {
	...nonInteractiveConfig,
	dryRunOmit: ["updatingPackageJson", "committing", "creatingTag", "pushing"],
	log: {
		workingDirClean: "working directory is clean",
		newVersion: ({ from, to }) => `version update: ${from} => ${to}`,
		updatingPackageJson: "updating version in package.json...",
		packageManagerSet: ({ pm }) => `packageManager set to ${pm}`,
		packageManagerRemoved: "packageManager field removed",
		packageManagerUnchanged: "packageManager field unchanged",
		changelogUpdated: ({ file, change }) => `${file}: ${change}`,
		committing: "committing changes...",
		committed: "changes committed",
		creatingTag: ({ version }) => `creating git tag #v${version}...`,
		tagCreated: ({ version }) => `tag #v${version} created`,
		pushing: "pushing to remote...",
		pushed: ({ withTag, version }) =>
			withTag === "true" ? `commit and tag #v${version} pushed` : "commit pushed",
	},
};

// Main function
async function main() {
	const dryRun = options.dryRun === true;
	const verbose = dryRun || options.verbose === true;
	const modeConfig = isNonInteractive
		? verbose
			? nonInteractiveVerboseConfig
			: nonInteractiveConfig
		: interactiveConfig;
	const loggerActive = isNonInteractive || verbose;
	const { log, warn } = createLogger(modeConfig, dryRun, loggerActive);

	const gitAvailable = isGitRepo();

	if (!isNonInteractive) {
		console.log(dryRun ? "\n=== Release Script (DRY RUN) ===" : "\n=== Release Script ===");
		if (!gitAvailable) {
			console.log("\x1b[33m⚠ Not in a git repository — git operations will be skipped.\x1b[0m");
		}
	} else if (!gitAvailable && verbose) {
		console.warn("git not available — skipping commit, tag and push");
	}

	// ── Phase 1: Gather all inputs (silently) ───────────────────────────────
	const currentVersion = getCurrentVersion();

	const abortRegression = (v: string) => {
		if (isNonInteractive) {
			console.error(`version "${v}" must be strictly greater than "${currentVersion}"`);
			process.exit(1);
		}
		console.log(
			`\x1b[33m◆ Aborted — ${v} is not greater than current version ${currentVersion}.\x1b[0m`,
		);
		process.exit(0);
	};

	// Early regression check when version is known upfront (no prompts needed)
	if (options.version && !isVersionGreater(options.version, currentVersion))
		abortRegression(options.version);
	if (options.bump) {
		try {
			const v = resolveVersionFromCLIBump(currentVersion, options.bump);
			if (!isVersionGreater(v, currentVersion)) abortRegression(v);
		} catch (e) {
			console.error(isNonInteractive ? (e as Error).message : `✗ ${(e as Error).message}`);
			process.exit(1);
		}
	}

	let hasUncommittedChanges = false;
	if (gitAvailable) {
		// Check whether HEAD exists (repo may have no commits yet)
		const hasHead = (() => {
			try {
				execSync("git rev-parse --verify HEAD", { stdio: "pipe" });
				return true;
			} catch {
				return false;
			}
		})();

		if (hasHead) {
			// git status --porcelain refreshes the index before comparing, avoiding
			// false positives from stale stat cache (e.g. after npx touches file mtimes)
			const statusOutput = execSync("git status --porcelain", {
				encoding: "utf-8",
				stdio: "pipe",
			});
			hasUncommittedChanges = statusOutput.trim().length > 0;

			if (hasUncommittedChanges && !options.commit) {
				if (isNonInteractive) {
					console.error("cannot proceed with uncommitted changes. use --commit to include them.");
				} else {
					console.log("\x1b[33m◆ Aborted — please commit your changes first.\x1b[0m");
				}
				process.exit(1);
			}
		}
	}

	let newVersion: string;
	if (options.version) {
		newVersion = options.version;
	} else if (options.bump) {
		newVersion = resolveVersionFromCLIBump(currentVersion, options.bump);
	} else {
		const bumpOrVersion = await selectBumpType(currentVersion);
		if (/^\d+\.\d+\.\d+/.test(bumpOrVersion)) {
			newVersion = bumpOrVersion;
		} else {
			newVersion = resolveVersionFromCLIBump(currentVersion, bumpOrVersion);
		}
		if (!isVersionGreater(newVersion, currentVersion)) abortRegression(newVersion);
	}

	const { confirm, log: clackLog } = await import("@clack/prompts");

	// Show resolved version in clack style when flags bypass the menu
	if (!isNonInteractive && (options.version || options.bump)) {
		clackLog.step(`Version update: ${currentVersion} → ${newVersion}`);
	}

	const resolvedChangelog = await resolveChangelog(newVersion);

	let createTag = gitAvailable && options.tag;
	if (gitAvailable && !isNonInteractive && !options.tag) {
		const result = await confirm({
			message: `Create git tag #v${newVersion}?`,
			active: "Yes",
			inactive: "No",
		});
		if (isCancel(result)) {
			console.log("Release cancelled");
			process.exit(0);
		}
		createTag = result;
	}

	let pushToRemote = gitAvailable && options.push;
	if (gitAvailable && !isNonInteractive && !options.push) {
		const result = await confirm({
			message: "Push to remote?",
			active: "Yes",
			inactive: "No",
		});
		if (isCancel(result)) {
			console.log("Release cancelled");
			process.exit(0);
		}
		pushToRemote = result;
	}

	const changelog =
		resolvedChangelog && createTag
			? linkChangelog(resolvedChangelog, newVersion)
			: resolvedChangelog;

	// ── Phase 2: Confirmation (interactive, non-dry-run) ────────────────────
	if (!isNonInteractive && !dryRun) {
		const extras: string[] = [];
		if (createTag) extras.push(`tag #v${newVersion}`);
		if (pushToRemote) extras.push("push");
		const suffix = extras.length > 0 ? ` (+${extras.join(" +")})` : "";
		const result = await confirm({
			message: `Proceed with update to version ${newVersion}?${suffix}`,
			active: "Yes",
			inactive: "No",
		});
		if (isCancel(result) || !result) {
			console.log("\x1b[33m◆ Aborted.\x1b[0m");
			process.exit(0);
		}
	}

	// ── Phase 3: Execute ─────────────────────────────────────────────────────
	log();
	if (gitAvailable && !hasUncommittedChanges) {
		log("workingDirClean");
	}
	log("newVersion", { from: currentVersion, to: newVersion });
	log();

	const packagePath = path.join(process.cwd(), "package.json");
	const originalPackageJson = fs.readFileSync(packagePath, "utf-8");
	let packageJsonUpdated = false;
	let changelogUpdated = false;
	let committed = false;
	let tagged = false;
	let staged: string[] = [];

	const rollback = (step: string, err: Error): never => {
		try {
			if (tagged) execSync(`git tag -d v${newVersion}`, { stdio: "pipe" });
		} catch {}
		try {
			if (committed) execSync("git reset HEAD~1", { stdio: "pipe" });
			// A rejected commit (e.g. by a pre-commit hook) leaves the bumped files staged; only the
			// release files are unstaged, so what the user staged with --commit stays as it was
			else if (staged.length > 0)
				execSync(`git reset -q -- ${staged.join(" ")}`, { stdio: "pipe" });
		} catch {}
		try {
			if (packageJsonUpdated) fs.writeFileSync(packagePath, originalPackageJson);
		} catch {}
		try {
			if (changelog && changelogUpdated) {
				if (changelog.original === null) fs.rmSync(changelog.path);
				else fs.writeFileSync(changelog.path, changelog.original);
			}
		} catch {}
		const rolledBack = packageJsonUpdated || changelogUpdated || committed || tagged;
		if (isNonInteractive) {
			console.error(`error at "${step}": ${err.message}`);
		} else {
			console.log(`\n\x1b[31m✗ Error at "${step}": ${err.message}\x1b[0m`);
			if (rolledBack) console.log("\x1b[33m◆ Changes have been rolled back.\x1b[0m");
		}
		process.exit(1);
	};

	log("updatingPackageJson");
	if (!dryRun) {
		try {
			const packageJson = JSON.parse(originalPackageJson);
			packageJson.version = newVersion;
			if (options.pm === false) {
				delete packageJson.packageManager;
			} else if (!options.ignorePm) {
				packageJson.packageManager = detectPackageManager();
			}
			fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, "\t")}\n`);
			packageJsonUpdated = true;
		} catch (e) {
			rollback("update package.json", e as Error);
		}
	}
	if (options.pm === false) {
		log("packageManagerRemoved");
	} else if (options.ignorePm) {
		log("packageManagerUnchanged");
	} else {
		log("packageManagerSet", { pm: detectPackageManager() });
	}

	if (changelog) {
		if (!dryRun) {
			try {
				fs.writeFileSync(changelog.path, changelog.updated);
				changelogUpdated = true;
			} catch (e) {
				rollback("update changelog", e as Error);
			}
		}
		log("changelogUpdated", { file: path.basename(changelog.path), change: changelog.change });
	}

	if (gitAvailable) {
		log("committing");
		if (!dryRun) {
			try {
				const releaseFiles = ["package.json"];
				const lockFile = "pnpm-lock.yaml";
				if (fs.existsSync(path.join(process.cwd(), lockFile))) {
					releaseFiles.push(lockFile);
				}
				if (changelog) releaseFiles.push(path.basename(changelog.path));
				execSync(hasUncommittedChanges ? "git add ." : `git add ${releaseFiles.join(" ")}`, {
					stdio: "pipe",
				});
				staged = releaseFiles;
				execSync(`git commit -m "Release version ${newVersion}"`, {
					stdio: "pipe",
				});
				committed = true;
			} catch (e) {
				rollback("commit", e as Error);
			}
		}
		log("committed");
	}

	if (createTag) {
		log("creatingTag", { version: newVersion });
		if (!dryRun) {
			try {
				execSync(`git tag v${newVersion}`, { stdio: "pipe" });
				tagged = true;
			} catch (e) {
				rollback("create tag", e as Error);
			}
		}
		log("tagCreated", { version: newVersion });
	}

	if (pushToRemote) {
		log("pushing");
		if (!dryRun) {
			try {
				execSync("git push origin main", { stdio: "pipe" });
				if (createTag) {
					execSync(`git push origin v${newVersion}`, { stdio: "pipe" });
				}
			} catch (e) {
				rollback("push", e as Error);
			}
		}
		log("pushed", { withTag: String(createTag), version: newVersion });
	}

	// ── Final summary ────────────────────────────────────────────────────────
	if (isNonInteractive) {
		const extras: string[] = [];
		if (createTag) extras.push("tag");
		if (pushToRemote) extras.push("push");
		if (!verbose) {
			log("summary", {
				from: currentVersion,
				to: newVersion,
				extras: extras.join(", "),
			});
		}
	} else {
		console.log();
		console.log(dryRun ? "=== Dry Run Complete ===" : "=== Release Complete ===");
		console.log(`Version: ${currentVersion} → ${newVersion}`);
		if (createTag) console.log(`Tag:     #v${newVersion}`);
		if (pushToRemote) console.log(`Pushed:  ${createTag ? "commit + tag" : "commit only"}`);
		console.log();
	}
}

main().catch(console.error);
