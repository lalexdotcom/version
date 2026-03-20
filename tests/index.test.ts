import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from '@rstest/core';

const CLI = path.resolve(import.meta.dirname, '../dist/index.js');
// biome-ignore lint/suspicious/noControlCharactersInRegex: \x1b is the ANSI escape character
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function strip(s: string): string {
  return s.replace(ANSI_RE, '');
}

function createTempRepo(version = '1.0.0'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-test-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name: 'test-pkg', version }, null, '\t')}\n`,
  );
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', {
    cwd: dir,
    stdio: 'pipe',
  });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  execSync('git add .', { cwd: dir, stdio: 'pipe' });
  execSync('git commit -m "init"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

function run(args: string[], cwd: string) {
  const { stdout, stderr, status } = spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf-8',
    // Clear user agent so PM detection relies only on lock files
    env: { ...process.env, npm_config_user_agent: undefined },
  });
  return { stdout: stdout ?? '', stderr: stderr ?? '', status: status ?? 1 };
}

// ─── Stable bumps ─────────────────────────────────────────────────────────────

describe('version bumps (dry-run)', () => {
  let dir: string;
  beforeEach(() => {
    dir = createTempRepo('1.0.0');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('--bump patch', () => {
    const { stdout, status } = run(
      ['--non-interactive', '--dry-run', '--bump', 'patch', '--ignore-pm'],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain('version update: 1.0.0 => 1.0.1');
  });

  test('--bump minor', () => {
    const { stdout, status } = run(
      ['--non-interactive', '--dry-run', '--bump', 'minor', '--ignore-pm'],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain('version update: 1.0.0 => 1.1.0');
  });

  test('--bump major', () => {
    const { stdout, status } = run(
      ['--non-interactive', '--dry-run', '--bump', 'major', '--ignore-pm'],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain('version update: 1.0.0 => 2.0.0');
  });

  test('--bump prerelease (defaults to alpha)', () => {
    const { stdout, status } = run(
      ['--non-interactive', '--dry-run', '--bump', 'prerelease', '--ignore-pm'],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain('version update: 1.0.0 => 1.0.1-alpha.1');
  });

  test('--bump prerelease+beta', () => {
    const { stdout, status } = run(
      [
        '--non-interactive',
        '--dry-run',
        '--bump',
        'prerelease+beta',
        '--ignore-pm',
      ],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain('version update: 1.0.0 => 1.0.1-beta.1');
  });

  test('--version explicit', () => {
    const { stdout, status } = run(
      ['--non-interactive', '--dry-run', '--version', '3.0.0', '--ignore-pm'],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain('version update: 1.0.0 => 3.0.0');
  });
});

// ─── Prerelease bumps ─────────────────────────────────────────────────────────

describe('prerelease bumps (dry-run)', () => {
  let dir: string;
  beforeEach(() => {
    dir = createTempRepo('1.0.0-alpha.1');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('--bump prerelease increments number', () => {
    const { stdout, status } = run(
      ['--non-interactive', '--dry-run', '--bump', 'prerelease', '--ignore-pm'],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain(
      'version update: 1.0.0-alpha.1 => 1.0.0-alpha.2',
    );
  });

  test('--bump prerelease+next promotes to next level', () => {
    const { stdout, status } = run(
      [
        '--non-interactive',
        '--dry-run',
        '--bump',
        'prerelease+next',
        '--ignore-pm',
      ],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain(
      'version update: 1.0.0-alpha.1 => 1.0.0-beta.1',
    );
  });

  test('--bump release drops prerelease suffix', () => {
    const { stdout, status } = run(
      ['--non-interactive', '--dry-run', '--bump', 'release', '--ignore-pm'],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain('version update: 1.0.0-alpha.1 => 1.0.0');
  });

  test('--bump prerelease+alpha stays on same level', () => {
    const { stdout, status } = run(
      [
        '--non-interactive',
        '--dry-run',
        '--bump',
        'prerelease+alpha',
        '--ignore-pm',
      ],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain(
      'version update: 1.0.0-alpha.1 => 1.0.0-alpha.2',
    );
  });
});

// ─── packageManager field ─────────────────────────────────────────────────────

describe('packageManager field (dry-run)', () => {
  let dir: string;
  beforeEach(() => {
    dir = createTempRepo('1.0.0');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('--ignore-pm leaves field unchanged', () => {
    const { stdout, status } = run(
      ['--non-interactive', '--dry-run', '--bump', 'patch', '--ignore-pm'],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain('packageManager field unchanged');
  });

  test('--no-pm removes the field', () => {
    const { stdout, status } = run(
      ['--non-interactive', '--dry-run', '--bump', 'patch', '--no-pm'],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain('packageManager field removed');
  });

  test('detects pnpm from pnpm-lock.yaml', () => {
    fs.writeFileSync(
      path.join(dir, 'pnpm-lock.yaml'),
      'lockfileVersion: "9.0"\n',
    );
    const { stdout, status } = run(
      ['--non-interactive', '--dry-run', '--bump', 'patch'],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toMatch(/packageManager set to pnpm@\d+\.\d+\.\d+/);
  });
});

// ─── Tags and push ────────────────────────────────────────────────────────────

describe('tags and push (dry-run)', () => {
  let dir: string;
  beforeEach(() => {
    dir = createTempRepo('1.0.0');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('--tag shows tag created message', () => {
    const { stdout, status } = run(
      [
        '--non-interactive',
        '--dry-run',
        '--bump',
        'patch',
        '--ignore-pm',
        '--tag',
      ],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain('tag #v1.0.1 created');
  });

  test('--tag --push shows commit and tag pushed message', () => {
    const { stdout, status } = run(
      [
        '--non-interactive',
        '--dry-run',
        '--bump',
        'patch',
        '--ignore-pm',
        '--tag',
        '--push',
      ],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain('commit and tag #v1.0.1 pushed');
  });

  test('--push without --tag shows commit only pushed message', () => {
    const { stdout, status } = run(
      [
        '--non-interactive',
        '--dry-run',
        '--bump',
        'patch',
        '--ignore-pm',
        '--push',
      ],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain('commit pushed');
  });
});

// ─── Error cases ──────────────────────────────────────────────────────────────

describe('error cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = createTempRepo('1.0.0');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('version regression exits with code 1', () => {
    const { stderr, status } = run(
      ['--non-interactive', '--dry-run', '--version', '0.9.0', '--ignore-pm'],
      dir,
    );
    expect(status).toBe(1);
    expect(stderr).toContain('0.9.0');
  });

  test('invalid version format exits with code 1', () => {
    const { status } = run(
      [
        '--non-interactive',
        '--dry-run',
        '--version',
        'not-a-version',
        '--ignore-pm',
      ],
      dir,
    );
    expect(status).toBe(1);
  });

  test('unknown bump type exits with code 1', () => {
    const { stderr, status } = run(
      ['--non-interactive', '--dry-run', '--bump', 'invalid', '--ignore-pm'],
      dir,
    );
    expect(status).toBe(1);
    expect(stderr).toContain('Unknown bump type');
  });

  test('prerelease+next on last level exits with code 1', () => {
    fs.rmSync(dir, { recursive: true, force: true });
    dir = createTempRepo('1.0.0-rc.1');
    const { stderr, status } = run(
      [
        '--non-interactive',
        '--dry-run',
        '--bump',
        'prerelease+next',
        '--ignore-pm',
      ],
      dir,
    );
    expect(status).toBe(1);
    expect(stderr).toContain('last level');
  });

  test('--bump release on stable version exits with code 1', () => {
    const { stderr, status } = run(
      ['--non-interactive', '--dry-run', '--bump', 'release', '--ignore-pm'],
      dir,
    );
    expect(status).toBe(1);
    expect(stderr).toContain('stable version');
  });

  test('uncommitted changes without --commit exits with code 1', () => {
    const pkgPath = path.join(dir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    pkg.description = 'dirty';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, '\t') + '\n');
    const { stderr, status } = run(
      ['--non-interactive', '--dry-run', '--bump', 'patch', '--ignore-pm'],
      dir,
    );
    expect(status).toBe(1);
    expect(stderr).toContain('uncommitted changes');
  });

  test('uncommitted changes with --commit proceeds normally', () => {
    const pkgPath = path.join(dir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    pkg.description = 'dirty';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, '\t') + '\n');
    const { stdout, status } = run(
      [
        '--non-interactive',
        '--dry-run',
        '--bump',
        'patch',
        '--ignore-pm',
        '--commit',
      ],
      dir,
    );
    expect(status).toBe(0);
    expect(strip(stdout)).toContain('version update: 1.0.0 => 1.0.1');
  });
});

// ─── Non-interactive without dry-run (real writes) ───────────────────────────

describe('non-interactive real run', () => {
  let dir: string;
  beforeEach(() => {
    dir = createTempRepo('1.0.0');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('outputs summary line and writes new version to package.json', () => {
    const { stdout, status } = run(
      ['--non-interactive', '--bump', 'patch', '--ignore-pm'],
      dir,
    );
    expect(status).toBe(0);
    expect(stdout.trim()).toBe('1.0.0 => 1.0.1');
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'),
    );
    expect(pkg.version).toBe('1.0.1');
  });

  test('summary includes tag label when --tag is used', () => {
    const { stdout, status } = run(
      ['--non-interactive', '--bump', 'patch', '--ignore-pm', '--tag'],
      dir,
    );
    expect(status).toBe(0);
    expect(stdout.trim()).toBe('1.0.0 => 1.0.1 (tag)');
  });

  test('--no-pm removes packageManager field from package.json', () => {
    // First write a packageManager field
    const pkgPath = path.join(dir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    pkg.packageManager = 'npm@10.0.0';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, '\t') + '\n');
    execSync('git add .', { cwd: dir, stdio: 'pipe' });
    execSync('git commit -m "add packageManager"', { cwd: dir, stdio: 'pipe' });

    const { status } = run(
      ['--non-interactive', '--bump', 'patch', '--no-pm'],
      dir,
    );
    expect(status).toBe(0);
    const updated = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(updated.packageManager).toBeUndefined();
  });
});

// ─── Rollback on error ────────────────────────────────────────────────────────

describe('rollback on error', () => {
  let dir: string;
  beforeEach(() => {
    dir = createTempRepo('1.0.0');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('existing tag rolls back commit and package.json', () => {
    // Pre-create the tag that will conflict
    execSync('git tag v1.0.1', { cwd: dir, stdio: 'pipe' });

    const pkgPath = path.join(dir, 'package.json');
    const { stderr, status } = run(
      ['--non-interactive', '--bump', 'patch', '--ignore-pm', '--tag'],
      dir,
    );

    expect(status).toBe(1);
    expect(stderr).toContain('create tag');

    // package.json must be back to original version
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.version).toBe('1.0.0');

    // The release commit must have been rolled back (only the initial commit)
    const log = execSync('git log --oneline', { cwd: dir, encoding: 'utf-8' });
    expect(log.trim().split('\n')).toHaveLength(1);
  });
});
