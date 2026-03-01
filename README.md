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
| `--tag` | Tag the commit with new version (default) |
| `--per-package-tags` | Use `pkg@1.2.3` tags instead of `v1.2.3` |
| `--sections` | Comma-separated changelog sections (default: `feat,fix,perf`) |
| `--dry-run` | Preview changes without writing files, committing, or tagging |
| `--no-filter-by-package` | Include all commits in every package changelog (monorepo) |

When bump type or scope flags are omitted, interactive prompts will ask.

### Monorepo Per-Package Changelogs

In a monorepo, each package's changelog only includes commits that touched files within that package (enabled by default). A commit that modifies `packages/a/src/index.ts` will only appear in `packages/a/CHANGELOG.md`.

When `--per-package-tags` is set, packages with no matching commits are skipped entirely (no version bump, changelog, or tag). When `--per-package-tags` is not set, all packages are still bumped and get a changelog entry (which may be empty).

Use `--no-filter-by-package` to disable this and include all commits in every package's changelog.

### Commit Message Format

Commits are automatically matched against these patterns (case-insensitive):

```
[feat] Add user authentication
[fix]: Resolve crash on startup
test: Add unit tests for parser
feat(auth): Add login page
[fix(ui)]: Fix button alignment
```

All these styles work:
- `[type] description` — bracketed
- `[type]: description` — bracketed with colon
- `type: description` — conventional commits style
- `type(scope): description` — with optional scope
- `[type(scope)] description` — bracketed with optional scope

An optional scope groups commits under a `#### scope` sub-heading within their type section in the changelog.

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

Only sections listed in `--sections` (or the `sections` config option) appear in the changelog. The default is `feat,fix,perf`.

### Config File

Place a `.bunset.toml` in your project root to set persistent defaults so you don't have to pass the same flags every time:

```toml
bump = "patch"                              # "patch" | "minor" | "major"
scope = "changed"                           # "all" | "changed"
commit = true
tag = true
per-package-tags = false
sections = ["feat", "fix", "perf"]          # changelog sections and order
dry-run = false                             # preview without writing
filter-by-package = true                    # per-package commit filtering (monorepo)
```

All fields are optional. CLI flags always take priority over config values. If `bump` or `scope` is set in config, the interactive prompt for that option is skipped.

## Testing

```bash
bun test
```
