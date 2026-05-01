import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { parse as parseToml } from 'smol-toml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'skills');
const CODEX_DIR = path.join(ROOT, 'codex');

const tomlBasicString = (s) =>
  '"' +
  String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t') +
  '"';

const tomlMultilineLiteral = (s) => {
  const safe = String(s).replace(/"""/g, '""\\"');
  const sep = safe.startsWith('\n') ? '' : '\n';
  return `"""${sep}${safe}\n"""`;
};

// Walk skills/ for lens-* subdirectories that contain a SKILL.md.
// Orchestrator (skills/diff-review/) is intentionally skipped — Codex doesn't
// have a skill-discovery system, so users invoke lenses via natural language.
function findLensSkillDirs() {
  if (!fs.existsSync(SKILLS_DIR) || !fs.statSync(SKILLS_DIR).isDirectory()) {
    return [];
  }
  return fs
    .readdirSync(SKILLS_DIR)
    .filter((entry) => entry.startsWith('lens-'))
    .filter((entry) => {
      const abs = path.join(SKILLS_DIR, entry);
      if (!fs.statSync(abs).isDirectory()) return false;
      return fs.existsSync(path.join(abs, 'SKILL.md'));
    })
    .sort()
    .map((name) => ({
      name,
      skillPath: path.join(SKILLS_DIR, name, 'SKILL.md'),
    }));
}

const lensDirs = findLensSkillDirs();

if (lensDirs.length === 0) {
  console.error(
    `✗ No lens-* directories found in ${path.relative(ROOT, SKILLS_DIR)}.`,
  );
  process.exit(1);
}

fs.mkdirSync(CODEX_DIR, { recursive: true });

let built = 0;
const failures = [];

for (const { name, skillPath } of lensDirs) {
  const md = fs.readFileSync(skillPath, 'utf-8');
  const { data, content } = matter(md);

  if (!data.name || !data.description) {
    failures.push(
      `${name}: missing required frontmatter (name, description)`,
    );
    continue;
  }

  const toml =
    `name = ${tomlBasicString(data.name)}\n` +
    `description = ${tomlBasicString(data.description)}\n` +
    `model_reasoning_effort = "medium"\n` +
    `sandbox_mode = "read-only"\n` +
    `developer_instructions = ${tomlMultilineLiteral(content.trim())}\n`;

  const outPath = path.join(CODEX_DIR, `${name}.toml`);
  fs.writeFileSync(outPath, toml);

  try {
    const parsed = parseToml(fs.readFileSync(outPath, 'utf-8'));
    if (parsed.name !== data.name) {
      throw new Error(
        `name mismatch: wrote "${data.name}", parsed "${parsed.name}"`,
      );
    }
    if (
      typeof parsed.developer_instructions !== 'string' ||
      parsed.developer_instructions.length === 0
    ) {
      throw new Error(
        'developer_instructions did not round-trip as a non-empty string',
      );
    }
  } catch (err) {
    failures.push(`${name}: TOML smoke test failed — ${err.message}`);
    continue;
  }

  built += 1;
  console.log(`✓ ${path.relative(ROOT, outPath)}`);
}

if (failures.length > 0) {
  console.error('\n✗ Build completed with errors:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`\nBuilt ${built} TOML lens file(s) into ${path.relative(ROOT, CODEX_DIR)}/`);
