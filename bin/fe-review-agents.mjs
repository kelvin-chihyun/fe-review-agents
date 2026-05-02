#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');

const pkg = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
);
const VERSION = pkg.version;
const PLUGIN_NAME = 'fe-review-agents';

// Claude Code plugin install:
//   Copies the plugin tree (.claude-plugin/, agents/, commands/) into
//     .claude/plugins/<plugin-name>/   (project-level by default)
//   or
//     ~/.claude/plugins/<plugin-name>/  (with --global)
//
// Claude Code auto-registers the contents:
//   - agents/reviewer-*.md, agents/synthesizer.md → subagent_type=<plugin-name>:<name>
//   - commands/diff-review.md, commands/file-review.md → /<plugin-name>:diff-review, /<plugin-name>:file-review

function help() {
  process.stdout.write(`fe-review-agents v${VERSION}
Multi-reviewer Claude Code plugin for parallel frontend code review.

Usage:
  npx fe-review-agents install [--global] [--dry-run]
  npx fe-review-agents --help
  npx fe-review-agents --version

Options:
  --global       Install under ~/.claude/plugins/ instead of ./.claude/plugins/
  --dry-run      Show what would be written without writing
  --help, -h     Show this help
  --version, -v  Show version

Examples:
  npx fe-review-agents install              # project-level
  npx fe-review-agents install --global
  npx fe-review-agents install --dry-run

After install, in Claude Code:
  /${PLUGIN_NAME}:diff-review              # 6 reviewers on git diff
  /${PLUGIN_NAME}:file-review <file>       # 6 reviewers on a single file

Single reviewer shortcut: @reviewer-bugs / @reviewer-a11y / etc.

Customize: drop a new reviewer-<name> into the plugin's agents/ directory and
register it in commands/diff-review.md, commands/file-review.md, and the
synthesizer prompt section. See:
https://github.com/huurray/fe-review-agents/blob/main/docs/adding-a-reviewer.md
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = new Set();
  const opts = {};
  const positionals = [];
  for (const a of args) {
    if (a.startsWith('--') && a.includes('=')) {
      const eq = a.indexOf('=');
      opts[a.slice(2, eq)] = a.slice(eq + 1);
    } else if (a.startsWith('-')) {
      flags.add(a);
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags, opts };
}

function displayPath(abs) {
  const home = os.homedir();
  const cwd = process.cwd();
  if (abs.startsWith(home + path.sep) || abs === home)
    return '~' + abs.slice(home.length);
  if (abs.startsWith(cwd + path.sep) || abs === cwd)
    return '.' + abs.slice(cwd.length);
  return abs;
}

function copyFileWithLog(srcAbs, dstAbs, isDryRun, results) {
  if (isDryRun) {
    results.push({ path: dstAbs });
    return;
  }
  fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
  fs.copyFileSync(srcAbs, dstAbs);
  results.push({ path: dstAbs });
}

function copyTree(srcRoot, dstRoot, isDryRun, results) {
  if (!fs.existsSync(srcRoot)) return;
  const stack = [{ src: srcRoot, dst: dstRoot }];
  while (stack.length > 0) {
    const { src, dst } = stack.pop();
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(src).sort();
      for (const entry of entries) {
        stack.push({
          src: path.join(src, entry),
          dst: path.join(dst, entry),
        });
      }
    } else if (stat.isFile()) {
      copyFileWithLog(src, dst, isDryRun, results);
    }
  }
}

function installClaudeCode(baseDir, isDryRun, results) {
  const pluginDst = path.join(baseDir, 'plugins', PLUGIN_NAME);

  const manifestSrc = path.join(PACKAGE_ROOT, '.claude-plugin');
  const agentsSrc = path.join(PACKAGE_ROOT, 'agents');
  const commandsSrc = path.join(PACKAGE_ROOT, 'commands');

  for (const [label, src] of [
    ['.claude-plugin/', manifestSrc],
    ['agents/', agentsSrc],
    ['commands/', commandsSrc],
  ]) {
    if (!fs.existsSync(src)) {
      process.stderr.write(`✗ Missing ${label} in package — invalid distribution.\n`);
      process.exit(1);
    }
  }

  copyTree(manifestSrc, path.join(pluginDst, '.claude-plugin'), isDryRun, results);
  copyTree(agentsSrc, path.join(pluginDst, 'agents'), isDryRun, results);
  copyTree(commandsSrc, path.join(pluginDst, 'commands'), isDryRun, results);
}

function install(isGlobal, isDryRun) {
  const baseDir = isGlobal
    ? path.join(os.homedir(), '.claude')
    : path.join(process.cwd(), '.claude');

  const scope = isGlobal ? 'global' : 'project-level';
  const tag = isDryRun ? ' [dry-run]' : '';
  process.stdout.write(
    `\nInstalling ${PLUGIN_NAME} v${VERSION} for Claude Code (${scope})${tag}\n`,
  );
  process.stdout.write(`  target: ${displayPath(baseDir)}\n\n`);

  const results = [];
  installClaudeCode(baseDir, isDryRun, results);

  for (const r of results) {
    const marker = isDryRun ? '[dry-run]' : '✓';
    process.stdout.write(`  ${marker} ${displayPath(r.path)}\n`);
  }

  process.stdout.write('\n');
  if (isDryRun) {
    process.stdout.write(
      `Dry run complete. ${results.length} file(s) would be written.\n`,
    );
    process.stdout.write(`Re-run without --dry-run to install.\n`);
    return;
  }

  process.stdout.write(
    `✓ Installed ${results.length} file(s).\n\n`,
  );

  process.stdout.write(`Next: in Claude Code, type:\n`);
  process.stdout.write(`  /${PLUGIN_NAME}:diff-review\n`);
  process.stdout.write(`  /${PLUGIN_NAME}:file-review <path>\n`);
  process.stdout.write(
    `Or ask in natural language: "Review my staged changes."\n`,
  );
  process.stdout.write(
    `Single reviewer shortcut: @reviewer-bugs / @reviewer-a11y / etc.\n`,
  );

  process.stdout.write(
    `\nThe 6 starter reviewers are an opinionated set — edit any of them, replace one,\n`,
  );
  process.stdout.write(
    `or add your own (drop agents/reviewer-<name>.md into the installed plugin).\n`,
  );
  process.stdout.write(
    `Customization guide: https://github.com/huurray/fe-review-agents/blob/main/docs/adding-a-reviewer.md\n`,
  );
}

function main() {
  const { positionals, flags } = parseArgs(process.argv);

  if (flags.has('--help') || flags.has('-h')) {
    help();
    return;
  }
  if (flags.has('--version') || flags.has('-v')) {
    process.stdout.write(VERSION + '\n');
    return;
  }
  if (positionals.length === 0) {
    help();
    return;
  }

  const command = positionals[0];
  if (command !== 'install') {
    process.stderr.write(`✗ Unknown command: "${command}"\n`);
    process.stderr.write(`  Run "npx fe-review-agents --help" for usage.\n`);
    process.exit(1);
  }

  // Backward compat: old usage was `install claude-code`. Accept and ignore
  // any positional after `install` (or warn for non-claude-code values).
  const legacyTool = positionals[1];
  if (legacyTool && legacyTool !== 'claude-code') {
    process.stderr.write(
      `✗ Tool "${legacyTool}" is no longer supported (Claude Code only since v0.6.0).\n`,
    );
    process.stderr.write(`  Run: npx fe-review-agents install\n`);
    process.exit(1);
  }

  install(flags.has('--global'), flags.has('--dry-run'));
}

main();
