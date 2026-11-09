#!/usr/bin/env node
/**
 * Runs the Playwright CLI with the repo-local browser cache (never the user profile):
 *   PLAYWRIGHT_BROWSERS_PATH=<repo>/.devtools/ms-playwright
 * Usage (from web/):  node e2e/pw.mjs test            node e2e/pw.mjs install chromium
 * An explicitly set PLAYWRIGHT_BROWSERS_PATH wins.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve(here, '..', '..', '.devtools', 'ms-playwright');

const require = createRequire(import.meta.url);
const cli = path.join(path.dirname(require.resolve('@playwright/test/package.json')), 'cli.js');
const args = process.argv.slice(2);
// `test` runs with this folder's config unless one is given.
if (args[0] === 'test' && !args.some((a) => a === '-c' || a.startsWith('--config'))) {
  args.splice(1, 0, '-c', path.join(here, 'playwright.config.ts'));
}
const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
