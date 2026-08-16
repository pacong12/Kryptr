#!/usr/bin/env node
/**
 * Worktree-aware installer for the `simple-git-hooks` config in
 * package.json.
 *
 * simple-git-hooks writes into `<checkout>/.git/hooks`, which fails in
 * linked git worktrees (`.git` is a file there → ENOTDIR). This script
 * writes the hooks into the COMMON hooks directory instead
 * (`git rev-parse --git-common-dir`), so normal clones and worktrees both
 * get the pre-commit gate.
 *
 * Runtime bypass (unchanged): SKIP_SIMPLE_GIT_HOOKS=1 git commit ...
 */
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VALID_HOOKS = [
  'pre-commit',
  'pre-push',
  'commit-msg',
  'prepare-commit-msg',
];

// Same prelude simple-git-hooks generates, so SKIP_SIMPLE_GIT_HOOKS and
// SIMPLE_GIT_HOOKS_RC keep working exactly as documented.
const PREPEND_SCRIPT = `#!/bin/sh

if [ "$SKIP_SIMPLE_GIT_HOOKS" = "1" ]; then
    echo "[INFO] SKIP_SIMPLE_GIT_HOOKS is set to 1, skipping hook."
    exit 0
fi

if [ -f "$SIMPLE_GIT_HOOKS_RC" ]; then
    . "$SIMPLE_GIT_HOOKS_RC"
fi

`;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const config = pkg['simple-git-hooks'];

if (!config || typeof config !== 'object') {
  console.error('[install-hooks] no "simple-git-hooks" block in package.json');
  process.exit(1);
}

const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

let commonDir;
try {
  commonDir = git('rev-parse', '--git-common-dir');
} catch {
  console.info('[install-hooks] no git repository found, skipping');
  process.exit(0);
}

const hooksDir = resolve(root, commonDir, 'hooks');
if (!existsSync(hooksDir)) {
  mkdirSync(hooksDir, { recursive: true });
}

for (const hook of VALID_HOOKS) {
  if (!Object.prototype.hasOwnProperty.call(config, hook)) {
    continue;
  }
  const hookPath = resolve(hooksDir, hook);
  writeFileSync(hookPath, PREPEND_SCRIPT + config[hook]);
  chmodSync(hookPath, 0o755);
  console.info(`[install-hooks] installed ${hook} -> ${hookPath}`);
}
