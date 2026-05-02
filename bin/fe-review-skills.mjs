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
const PLUGIN_NAME = 'fe-review-skills';

// Tool layouts.
//   claude-code: copy plugin tree (.claude-plugin/, agents/, skills/diff-review/)
//                → .claude/plugins/<plugin-name>/  (project-level by default)
//                or ~/.claude/plugins/<plugin-name>/  with --global
//                The orchestrator skill is registered as /<plugin-name>:diff-review.
//                Lenses are auto-registered as subagent_type=lens-<name>.
//   gemini-cli:  copy each agents/lens-*.md and agents/review-orchestrator.md
//                → .gemini/agents/  (or ~/.gemini/agents/ with --global)
//   codex-cli:   copy each codex/lens-*.toml and codex/review-orchestrator.toml
//                → .codex/agents/  (or ~/.codex/agents/ with --global)
const TOOLS = {
  'claude-code': {
    name: 'Claude Code',
    dir: '.claude',
    mode: 'claude-plugin',
  },
  'gemini-cli': {
    name: 'Gemini CLI',
    dir: '.gemini',
    mode: 'gemini-agents',
  },
  'codex-cli': {
    name: 'Codex CLI',
    dir: '.codex',
    mode: 'codex-agents',
  },
};

function help() {
  process.stdout.write(`fe-review-skills v${VERSION}
Multi-lens frontend code review with isolated per-lens context.

Usage:
  npx fe-review-skills install <tool> [--global] [--dry-run]
  npx fe-review-skills --help
  npx fe-review-skills --version

Tools:
  claude-code   Install plugin (.claude/plugins/${PLUGIN_NAME}/)
  gemini-cli    Install lens + orchestrator agents (.gemini/agents/)
  codex-cli     Install lens + orchestrator TOML agents (.codex/agents/)

Options:
  --global       Install under ~/<tool-dir> instead of ./<tool-dir>
  --dry-run      Show what would be written without writing
  --tool=<name>  Alternative to positional tool argument
  --help, -h     Show this help
  --version, -v  Show version

Examples:
  npx fe-review-skills install claude-code              # project-level
  npx fe-review-skills install claude-code --global
  npx fe-review-skills install gemini-cli --dry-run

After install:
  - Claude Code:  /${PLUGIN_NAME}:diff-review
  - Codex CLI:    @review-orchestrator (or natural language: "review my staged diff")
  - Gemini CLI:   @review-orchestrator (or natural language: "review my staged diff")

Customize: drop a new lens-<name> into your tool's agents directory and (in Claude Code)
register a triage rule + roster row in skills/diff-review/SKILL.md.
See: https://github.com/huurray/fe-review-skills/blob/main/docs/adding-a-lens.md
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

// List flat files in `srcDir` matching `predicate(name)`. Returns sorted absolute paths.
function listFiles(srcDir, predicate) {
  if (!fs.existsSync(srcDir)) return [];
  return fs
    .readdirSync(srcDir)
    .filter((entry) => {
      const abs = path.join(srcDir, entry);
      return fs.statSync(abs).isFile() && predicate(entry);
    })
    .sort()
    .map((name) => ({ name, abs: path.join(srcDir, name) }));
}

// Copy a directory subtree from src → dst, preserving structure.
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
  // Plugin tree: .claude-plugin/, agents/, skills/diff-review/
  const pluginDst = path.join(baseDir, 'plugins', PLUGIN_NAME);

  const manifestSrc = path.join(PACKAGE_ROOT, '.claude-plugin');
  const agentsSrc = path.join(PACKAGE_ROOT, 'agents');
  const skillSrc = path.join(PACKAGE_ROOT, 'skills', 'diff-review');

  if (!fs.existsSync(manifestSrc)) {
    process.stderr.write(`✗ Missing .claude-plugin/ in package — invalid distribution.\n`);
    process.exit(1);
  }
  if (!fs.existsSync(agentsSrc)) {
    process.stderr.write(`✗ Missing agents/ in package — invalid distribution.\n`);
    process.exit(1);
  }
  if (!fs.existsSync(skillSrc)) {
    process.stderr.write(`✗ Missing skills/diff-review/ in package — invalid distribution.\n`);
    process.exit(1);
  }

  copyTree(manifestSrc, path.join(pluginDst, '.claude-plugin'), isDryRun, results);
  copyTree(agentsSrc, path.join(pluginDst, 'agents'), isDryRun, results);
  copyTree(skillSrc, path.join(pluginDst, 'skills', 'diff-review'), isDryRun, results);
}

function installGeminiAgents(baseDir, isDryRun, results) {
  const agentsSrc = path.join(PACKAGE_ROOT, 'agents');
  const files = listFiles(
    agentsSrc,
    (name) => name.endsWith('.md') && (name.startsWith('lens-') || name === 'review-orchestrator.md'),
  );
  if (files.length === 0) {
    process.stderr.write(`✗ No agent files found in package agents/\n`);
    process.exit(1);
  }
  for (const { name, abs } of files) {
    const dstAbs = path.join(baseDir, 'agents', name);
    copyFileWithLog(abs, dstAbs, isDryRun, results);
  }
}

function installCodexAgents(baseDir, isDryRun, results) {
  const codexSrc = path.join(PACKAGE_ROOT, 'codex');
  const files = listFiles(
    codexSrc,
    (name) =>
      name.endsWith('.toml') &&
      (name.startsWith('lens-') || name === 'review-orchestrator.toml'),
  );
  if (files.length === 0) {
    process.stderr.write(`✗ No agent TOML files found in package codex/\n`);
    process.stderr.write(
      `  This usually means the package was published without running the build.\n`,
    );
    process.stderr.write(
      `  Maintainers: run "npm run build" before publishing.\n`,
    );
    process.exit(1);
  }
  for (const { name, abs } of files) {
    const dstAbs = path.join(baseDir, 'agents', name);
    copyFileWithLog(abs, dstAbs, isDryRun, results);
  }
}

function install(toolName, isGlobal, isDryRun) {
  const tool = TOOLS[toolName];
  if (!tool) {
    process.stderr.write(`✗ Unknown tool: "${toolName}"\n`);
    process.stderr.write(
      `  Choose one of: ${Object.keys(TOOLS).join(', ')}\n`,
    );
    process.exit(1);
  }

  const baseDir = isGlobal
    ? path.join(os.homedir(), tool.dir)
    : path.join(process.cwd(), tool.dir);

  const scope = isGlobal ? 'global' : 'project-level';
  const tag = isDryRun ? ' [dry-run]' : '';
  process.stdout.write(
    `\nInstalling ${PLUGIN_NAME} v${VERSION} for ${tool.name} (${scope})${tag}\n`,
  );
  process.stdout.write(`  target: ${displayPath(baseDir)}\n\n`);

  const results = [];

  if (tool.mode === 'claude-plugin') {
    installClaudeCode(baseDir, isDryRun, results);
  } else if (tool.mode === 'gemini-agents') {
    installGeminiAgents(baseDir, isDryRun, results);
  } else if (tool.mode === 'codex-agents') {
    installCodexAgents(baseDir, isDryRun, results);
  }

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
    `✓ Installed ${results.length} file(s) for ${tool.name}.\n\n`,
  );

  if (toolName === 'claude-code') {
    process.stdout.write(`Next: in ${tool.name}, type:\n`);
    process.stdout.write(`  /${PLUGIN_NAME}:diff-review\n`);
    process.stdout.write(
      `Or ask in natural language: "Review my staged changes."\n`,
    );
    process.stdout.write(
      `Single lens shortcut: invoke @lens-bugs / @lens-a11y / etc. directly.\n`,
    );
  } else {
    process.stdout.write(`Next: in ${tool.name}:\n`);
    process.stdout.write(`  @review-orchestrator   (orchestrates triage + dispatch)\n`);
    process.stdout.write(`  @lens-bugs / @lens-a11y / ...   (single-lens reviews)\n`);
    process.stdout.write(
      `Or ask in natural language: "Review my staged changes."\n`,
    );
  }

  process.stdout.write(
    `\nThe 6 starter lenses are an opinionated set — edit any of them, replace one,\n`,
  );
  process.stdout.write(
    `or add your own by dropping a new lens-<name>.md into your tool's agents directory.\n`,
  );
  process.stdout.write(
    `Customization guide: https://github.com/huurray/fe-review-skills/blob/main/docs/adding-a-lens.md\n`,
  );
}

function main() {
  const { positionals, flags, opts } = parseArgs(process.argv);

  if (flags.has('--help') || flags.has('-h')) {
    help();
    return;
  }
  if (flags.has('--version') || flags.has('-v')) {
    process.stdout.write(VERSION + '\n');
    return;
  }
  if (positionals.length === 0 && !opts.tool) {
    help();
    return;
  }

  const command = positionals[0];
  if (command !== 'install') {
    process.stderr.write(`✗ Unknown command: "${command}"\n`);
    process.stderr.write(`  Run "npx fe-review-skills --help" for usage.\n`);
    process.exit(1);
  }

  const tool = positionals[1] || opts.tool;
  if (!tool) {
    process.stderr.write(`✗ Missing tool argument.\n`);
    process.stderr.write(
      `  Example: npx fe-review-skills install claude-code\n`,
    );
    process.stderr.write(
      `  Run "npx fe-review-skills --help" for the full list.\n`,
    );
    process.exit(1);
  }

  install(tool, flags.has('--global'), flags.has('--dry-run'));
}

main();
