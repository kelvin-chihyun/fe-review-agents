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

// Tool layouts.
//   claude-code: copy each skills/<name>/SKILL.md → .claude/skills/<name>/SKILL.md
//                (orchestrator + every lens; each becomes its own /<name> slash command).
//   gemini-cli:  copy each skills/lens-*/SKILL.md → .gemini/agents/lens-<name>.md
//                (lenses only, flattened; orchestrator skipped — invoke via natural language).
//   codex-cli:   copy each codex/lens-*.toml → .codex/agents/lens-*.toml
//                (pre-built TOML lenses; orchestrator skipped — invoke via natural language).
const TOOLS = {
  'claude-code': {
    name: 'Claude Code',
    dir: '.claude',
    mode: 'claude-skills',
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
Parallel frontend code review across multiple lenses, each in its own context.

Usage:
  npx fe-review-skills install <tool> [--global] [--dry-run]
  npx fe-review-skills --help
  npx fe-review-skills --version

Tools:
  claude-code   Install orchestrator + lenses as skills (.claude/skills/<name>/)
  gemini-cli    Install lenses as agents (.gemini/agents/)
  codex-cli     Install lenses as TOML agents (.codex/agents/)

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

After install, the 6 starter lenses live in your tool's directory. Add your own
by dropping a new lens-<name> folder in — see docs/adding-a-lens.md.
The orchestrator discovers whatever's installed, so the lens set is yours to shape.

Manual install (no Node required): https://github.com/huurray/fe-review-skills/tree/main/docs
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

// List subdirectories of `srcDir` that contain a SKILL.md.
// Returns array of { name, skillPath } sorted by name.
function listSkillDirs(srcDir, { lensOnly = false } = {}) {
  if (!fs.existsSync(srcDir)) return [];
  return fs
    .readdirSync(srcDir)
    .filter((entry) => {
      const abs = path.join(srcDir, entry);
      if (!fs.statSync(abs).isDirectory()) return false;
      if (lensOnly && !entry.startsWith('lens-')) return false;
      return fs.existsSync(path.join(abs, 'SKILL.md'));
    })
    .sort()
    .map((name) => ({
      name,
      skillPath: path.join(srcDir, name, 'SKILL.md'),
    }));
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

function installClaudeCode(baseDir, isDryRun, results) {
  const skillsSrc = path.join(PACKAGE_ROOT, 'skills');
  const dirs = listSkillDirs(skillsSrc);
  if (dirs.length === 0) {
    process.stderr.write(`✗ No skill directories found in package skills/\n`);
    process.exit(1);
  }
  for (const { name, skillPath } of dirs) {
    const dstAbs = path.join(baseDir, 'skills', name, 'SKILL.md');
    copyFileWithLog(skillPath, dstAbs, isDryRun, results);
  }
}

function installGeminiAgents(baseDir, isDryRun, results) {
  const skillsSrc = path.join(PACKAGE_ROOT, 'skills');
  const dirs = listSkillDirs(skillsSrc, { lensOnly: true });
  if (dirs.length === 0) {
    process.stderr.write(`✗ No lens-* directories found in package skills/\n`);
    process.exit(1);
  }
  for (const { name, skillPath } of dirs) {
    // Flatten: skills/lens-bugs/SKILL.md → .gemini/agents/lens-bugs.md
    const dstAbs = path.join(baseDir, 'agents', `${name}.md`);
    copyFileWithLog(skillPath, dstAbs, isDryRun, results);
  }
}

function installCodexAgents(baseDir, isDryRun, results) {
  const codexSrc = path.join(PACKAGE_ROOT, 'codex');
  const files = listFiles(
    codexSrc,
    (name) => name.startsWith('lens-') && name.endsWith('.toml'),
  );
  if (files.length === 0) {
    process.stderr.write(
      `✗ No lens-*.toml files found in package codex/\n`,
    );
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
    `\nInstalling fe-review-skills v${VERSION} for ${tool.name} (${scope})${tag}\n`,
  );
  process.stdout.write(`  target: ${displayPath(baseDir)}\n\n`);

  const results = [];

  if (tool.mode === 'claude-skills') {
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
    process.stdout.write(`  /diff-review\n`);
    process.stdout.write(
      `Or ask in natural language: "Review my staged changes."\n`,
    );
    process.stdout.write(
      `Single lens shortcut: /lens-a11y, /lens-react-perf, etc.\n`,
    );
  } else {
    process.stdout.write(
      `Next: in ${tool.name}, ask in natural language:\n`,
    );
    process.stdout.write(
      `  "Review my changes with every lens in parallel."\n`,
    );
    process.stdout.write(
      `Note: ${tool.name} doesn't have skill discovery, so the orchestrator wasn't installed.\n`,
    );
    process.stdout.write(
      `      Claude Code is the primary target for full orchestration. See docs/install-${toolName.replace('-cli', '-cli')}.md for details.\n`,
    );
  }

  process.stdout.write(
    `\nThe 6 starter lenses are an opinionated set — edit any of them, replace one,\n`,
  );
  process.stdout.write(
    `or add your own by dropping a new lens-<name> folder in.\n`,
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
