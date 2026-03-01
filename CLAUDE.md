# Changeset CLI

A zero-dependency CLI tool that automates version bumping and changelog generation for Bun workspace monorepos and single packages. Reads git commit history, categorizes by type prefix, bumps semver, updates CHANGELOG.md, and optionally commits/tags.

## Tech

- **Runtime**: Bun (not Node.js)
- **Zero external dependencies** — uses only Bun built-ins (`Bun.$`, `Bun.file`, `Bun.write`, `Bun.Glob`) and `node:util`
- **Testing**: `bun test` with `bun:test`

## Commands

- `bun test` — run all tests
- `bun src/index.ts` — run the CLI

## Project Structure

```
src/
  types.ts          - Shared interfaces and type aliases
  version.ts        - Semver parsing and bumping (pure functions)
  commits.ts        - Commit message parsing and grouping (pure functions)
  changelog.ts      - Changelog entry building and file writing
  git.ts            - Git operations via Bun.$
  deps.ts           - Dependency update detection
  workspace.ts      - Workspace detection and package discovery
  cli.ts            - Argument parsing (util.parseArgs) + interactive prompts
  index.ts          - Entry point orchestrator
```

## Conventions

- Use `Bun.file` / `Bun.write` for file I/O, not `node:fs`
- Use `Bun.$` for shell commands, not `child_process` or `execa`
- Use `Bun.Glob` for file discovery, not `glob` or `fast-glob`
- Keep core logic as pure functions (commits.ts, version.ts) separate from I/O (git.ts, changelog.ts)
- Test files live alongside source files as `*.test.ts`
- Commit messages follow `[type] description` format where type is `feat`/`fix`/`test`
