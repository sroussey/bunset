# bunset

A zero-dependency CLI tool that automates version bumping and changelog generation for Bun workspace monorepos and single packages.

It reads git commit messages since the last tag, categorizes them by type prefix (`[feat]`, `[fix]`, `[test]`), bumps semantic versions, updates `CHANGELOG.md` per package, and optionally commits and tags the result.

## Install

```bash
bun install
```

## Usage

```bash
bun src/index.ts [options]
```

Or link it globally:

```bash
bun link
bunset [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--patch` | Patch version bump (default) |
| `--minor` | Minor version bump |
| `--major` | Major version bump |
| `--all` | Update all workspace packages |
| `--changed` | Update only changed packages (default for workspaces) |
| `--commit` | Auto-commit changes to git |
| `--tag` | Tag the commit with new version |
| `--per-package-tags` | Use `pkg@1.2.3` tags instead of `v1.2.3` |

When bump type or scope flags are omitted, interactive prompts will ask.

### Commit Message Format

Commits are automatically matched against these patterns (case-insensitive):

```
[feat] Add user authentication
[fix]: Resolve crash on startup
test: Add unit tests for parser
```

All three styles work:
- `[type] description` — bracketed
- `[type]: description` — bracketed with colon
- `type: description` — conventional commits style

Recognized type keywords:
- `feat`, `feature` — listed under **Features**
- `fix`, `bug`, `bugfix` — listed under **Bug Fixes**
- `refactor` — listed under **Refactors**
- `perf` — listed under **Performance**
- `style` — listed under **Style**
- `test` — listed under **Tests**
- `docs` — listed under **Documentation**
- `build` — listed under **Build**
- `ops` — listed under **Ops**
- `chore` — listed under **Chores**

Commits without a recognized type keyword are excluded from the changelog.

### Config File

Place a `.bunset.toml` in your project root to set persistent defaults so you don't have to pass the same flags every time:

```toml
bump = "patch"           # "patch" | "minor" | "major"
scope = "changed"        # "all" | "changed"
commit = true
tag = true
per-package-tags = false
```

All fields are optional. CLI flags always take priority over config values. If `bump` or `scope` is set in config, the interactive prompt for that option is skipped.

## Testing

```bash
bun test
```
