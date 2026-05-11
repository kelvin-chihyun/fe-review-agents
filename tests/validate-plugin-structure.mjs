import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const repoRoot = process.cwd();
const pluginRoot = path.join(repoRoot, "plugins", "fe-review-agents");

const requirePath = (relativePath) => {
  const absolutePath = path.join(repoRoot, relativePath);
  assert.ok(fs.existsSync(absolutePath), `Missing required path: ${relativePath}`);
  return absolutePath;
};

const readJson = (relativePath) => {
  const absolutePath = requirePath(relativePath);
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
};

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const paths = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    paths.push(absolutePath);
    if (entry.isDirectory()) {
      paths.push(...walk(absolutePath));
    }
  }

  return paths;
};

assert.ok(fs.existsSync(pluginRoot), "Plugin root must exist");
assert.ok(fs.statSync(pluginRoot).isDirectory(), "Plugin root must be a directory");

const pluginFiles = [
  "plugins/fe-review-agents/.codex-plugin/plugin.json",
  "plugins/fe-review-agents/plugin.lock.json",
  "plugins/fe-review-agents/README.md",
  "plugins/fe-review-agents/agents/openai.yaml",
  "plugins/fe-review-agents/agents/reviewer-react-perf.md",
  "plugins/fe-review-agents/agents/reviewer-quality.md",
  "plugins/fe-review-agents/agents/reviewer-bugs.md",
  "plugins/fe-review-agents/agents/reviewer-ts.md",
  "plugins/fe-review-agents/agents/reviewer-a11y.md",
  "plugins/fe-review-agents/agents/reviewer-security.md",
  "plugins/fe-review-agents/agents/synthesizer.md",
  "plugins/fe-review-agents/commands/diff-review.md",
  "plugins/fe-review-agents/commands/file-review.md",
  "plugins/fe-review-agents/skills/fe-review-agents/SKILL.md",
  "plugins/fe-review-agents/skills/fe-review-agents/agents/openai.yaml",
  "plugins/fe-review-agents/skills/fe-review-diff-review/SKILL.md",
  "plugins/fe-review-agents/skills/fe-review-diff-review/agents/openai.yaml",
  "plugins/fe-review-agents/skills/fe-review-file-review/SKILL.md",
  "plugins/fe-review-agents/skills/fe-review-file-review/agents/openai.yaml",
];

for (const relativePath of pluginFiles) {
  requirePath(relativePath);
}

for (const absolutePath of walk(pluginRoot)) {
  assert.notEqual(
    fs.lstatSync(absolutePath).isSymbolicLink(),
    true,
    `Plugin root must not contain symlinks: ${path.relative(repoRoot, absolutePath)}`,
  );
}

const pluginManifest = readJson("plugins/fe-review-agents/.codex-plugin/plugin.json");
assert.equal(pluginManifest.name, "fe-review-agents");
assert.equal(pluginManifest.skills, "./skills/");
assert.ok(Array.isArray(pluginManifest.interface.defaultPrompt));
assert.ok(
  pluginManifest.interface.defaultPrompt.some((prompt) => prompt.includes("$fe-review-agents")),
  "Default prompts should mention Codex skill usage",
);

const pluginLock = readJson("plugins/fe-review-agents/plugin.lock.json");
assert.equal(pluginLock.lockVersion, 1);
assert.equal(pluginLock.pluginId, "io.github.huurray.fe-review-agents");
assert.equal(pluginLock.pluginVersion, pluginManifest.version);
assert.deepEqual(
  pluginLock.skills.map((skill) => skill.id).sort(),
  ["fe-review-agents", "fe-review-diff-review", "fe-review-file-review"],
);

for (const skill of pluginLock.skills) {
  assert.ok(skill.vendoredPath.startsWith("skills/"), `Unexpected vendored path: ${skill.vendoredPath}`);
  requirePath(path.join("plugins/fe-review-agents", skill.vendoredPath, "SKILL.md"));
}

const marketplace = readJson(".agents/plugins/marketplace.json");
assert.equal(marketplace.plugins[0].source.path, "./plugins/fe-review-agents");

const mirroredFiles = [
  ["agents/reviewer-react-perf.md", "plugins/fe-review-agents/agents/reviewer-react-perf.md"],
  ["agents/reviewer-quality.md", "plugins/fe-review-agents/agents/reviewer-quality.md"],
  ["agents/reviewer-bugs.md", "plugins/fe-review-agents/agents/reviewer-bugs.md"],
  ["agents/reviewer-ts.md", "plugins/fe-review-agents/agents/reviewer-ts.md"],
  ["agents/reviewer-a11y.md", "plugins/fe-review-agents/agents/reviewer-a11y.md"],
  ["agents/reviewer-security.md", "plugins/fe-review-agents/agents/reviewer-security.md"],
  ["agents/synthesizer.md", "plugins/fe-review-agents/agents/synthesizer.md"],
  ["commands/diff-review.md", "plugins/fe-review-agents/commands/diff-review.md"],
  ["commands/file-review.md", "plugins/fe-review-agents/commands/file-review.md"],
];

for (const [rootRelativePath, pluginRelativePath] of mirroredFiles) {
  assert.equal(
    fs.readFileSync(requirePath(rootRelativePath), "utf8"),
    fs.readFileSync(requirePath(pluginRelativePath), "utf8"),
    `Root mirror is out of sync: ${rootRelativePath}`,
  );
}

const rootReadme = fs.readFileSync(requirePath("README.md"), "utf8");
assert.match(rootReadme, /\$fe-review-agents:fe-review-agents/);
assert.match(rootReadme, /\$fe-review-agents:fe-review-diff-review/);
assert.match(rootReadme, /\$fe-review-agents:fe-review-file-review/);
assert.equal(fs.existsSync(path.join(repoRoot, ".codex-plugin")), false, "Root .codex-plugin should be removed");
assert.equal(fs.existsSync(path.join(repoRoot, "skills")), false, "Root skills directory should be removed");

console.log("plugin structure validation passed");
