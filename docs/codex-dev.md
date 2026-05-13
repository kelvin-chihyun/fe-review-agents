# Codex Local Dev and Packaging

This document is for maintainers validating a local checkout of `fe-review-agents` in Codex. It is **not** the main end-user install guide.

End-user docs live in [README.md](../README.md) and [README.en.md](../README.en.md). Those READMEs describe the user-facing contract as: add this repository as a Codex GitHub marketplace source, install the `FE Review Agents` plugin, then run the namespaced skills it exposes.

## What each artifact means

- `plugins/fe-review-agents/` — canonical Codex plugin package root.
- `plugins/fe-review-agents/.codex-plugin/plugin.json` — canonical Codex manifest for the packaged plugin.
- `.agents/plugins/marketplace.json` — repo-scoped marketplace file used by Codex for GitHub marketplace-source installs and local packaging verification.
- `agents/` and `commands/` — Claude Code compatibility mirrors kept in sync from the canonical package.

## Local verification loop

1. Edit the canonical Codex package under `plugins/fe-review-agents/`.
2. If you changed `agents/` or `commands/`, run:

   ```bash
   node scripts/sync-claude-surface.mjs
   ```

3. Register the current checkout as a local Codex marketplace source:

   ```bash
   codex plugin marketplace add "$(pwd)"
   ```

4. Restart Codex so it reloads marketplace state.
5. Install or enable `fe-review-agents` from the repo-scoped entry exposed by this checkout.
6. Verify the namespaced skills:

   ```text
   $fe-review-agents:fe-review-agents Review my staged frontend changes
   $fe-review-agents:fe-review-diff-review branch:main
   $fe-review-agents:fe-review-file-review src/components/Header.tsx
   ```

## Packaging rules

- Treat `plugins/fe-review-agents/` as the source of truth for the Codex package.
- Treat `.agents/plugins/marketplace.json` as the repo marketplace catalog. For public usage it is read through the GitHub marketplace-source install path; for local development it points Codex at this checkout.
- Keep Codex terminology precise: the install unit is the plugin, and the execution entry points are namespaced skills such as `$fe-review-agents:fe-review-file-review`.

## Related docs

- [README.md](../README.md)
- [README.en.md](../README.en.md)
- [adding-a-reviewer.md](./adding-a-reviewer.md)
- [codex-runtime-repro.md](./codex-runtime-repro.md)
