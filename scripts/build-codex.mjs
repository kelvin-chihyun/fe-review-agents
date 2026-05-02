import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { parse as parseToml } from "smol-toml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AGENTS_DIR = path.join(ROOT, "agents");
const CODEX_DIR = path.join(ROOT, "codex");

const tomlBasicString = (s) =>
  '"' +
  String(s)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t") +
  '"';

// Use TOML multiline LITERAL strings ('''...''') so backslashes and any
// other content pass through unchanged — no escape sequences to worry about.
// The only thing that can't appear in a literal string is the literal terminator
// itself (three single quotes), which is exceedingly rare in markdown bodies.
const tomlMultilineLiteral = (s) => {
  const text = String(s);
  if (text.includes("'''")) {
    throw new Error(
      "Source body contains ''' which would terminate a TOML literal string. " +
        "Rewrite the source to avoid that sequence.",
    );
  }
  const sep = text.startsWith("\n") ? "" : "\n";
  return `'''${sep}${text}\n'''`;
};

// Walk agents/ for lens-*.md files. The orchestrator agent (agents/orchestrator.md)
// is built separately below if it exists — for tools that don't have a slash-command
// orchestrator skill (Codex/Gemini), it provides an @orchestrator entry point.
function findLensAgentFiles() {
  if (!fs.existsSync(AGENTS_DIR) || !fs.statSync(AGENTS_DIR).isDirectory()) {
    return [];
  }
  return fs
    .readdirSync(AGENTS_DIR)
    .filter((entry) => entry.startsWith("lens-") && entry.endsWith(".md"))
    .filter((entry) => fs.statSync(path.join(AGENTS_DIR, entry)).isFile())
    .sort()
    .map((entry) => ({
      name: entry.replace(/\.md$/, ""),
      agentPath: path.join(AGENTS_DIR, entry),
    }));
}

const lensFiles = findLensAgentFiles();

if (lensFiles.length === 0) {
  console.error(
    `✗ No lens-*.md files found in ${path.relative(ROOT, AGENTS_DIR)}.`,
  );
  process.exit(1);
}

fs.mkdirSync(CODEX_DIR, { recursive: true });

let built = 0;
const failures = [];

function buildOne({ name, agentPath }) {
  const md = fs.readFileSync(agentPath, "utf-8");
  const { data, content } = matter(md);

  if (!data.name || !data.description) {
    failures.push(`${name}: missing required frontmatter (name, description)`);
    return;
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
    const parsed = parseToml(fs.readFileSync(outPath, "utf-8"));
    if (parsed.name !== data.name) {
      throw new Error(
        `name mismatch: wrote "${data.name}", parsed "${parsed.name}"`,
      );
    }
    if (
      typeof parsed.developer_instructions !== "string" ||
      parsed.developer_instructions.length === 0
    ) {
      throw new Error(
        "developer_instructions did not round-trip as a non-empty string",
      );
    }
  } catch (err) {
    failures.push(`${name}: TOML smoke test failed — ${err.message}`);
    return;
  }

  built += 1;
  console.log(`✓ ${path.relative(ROOT, outPath)}`);
}

for (const entry of lensFiles) buildOne(entry);

const orchestratorPath = path.join(AGENTS_DIR, "review-orchestrator.md");
if (fs.existsSync(orchestratorPath)) {
  buildOne({ name: "review-orchestrator", agentPath: orchestratorPath });
}

if (failures.length > 0) {
  console.error("\n✗ Build completed with errors:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `\nBuilt ${built} TOML lens file(s) into ${path.relative(ROOT, CODEX_DIR)}/`,
);
