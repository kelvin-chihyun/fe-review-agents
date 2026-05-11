import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const pluginRoot = path.join(repoRoot, "plugins", "fe-review-agents");

const syncDir = (fromRelative, toRelative) => {
  const sourceDir = path.join(pluginRoot, fromRelative);
  const targetDir = path.join(repoRoot, toRelative);

  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    fs.copyFileSync(sourcePath, targetPath);
  }
};

syncDir("agents", "agents");
syncDir("commands", "commands");

console.log("Synchronized Claude compatibility mirrors from plugins/fe-review-agents");
