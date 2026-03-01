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
| `--no-commit` | Do not commit changes to git (commits by default) |
| `--no-tag` | Tag the commit with new version (default) |
| `--per-package-tags` | Use `pkg@1.2.3` tags instead of prefixed tags |
| `--tag-prefix` | Tag prefix (auto-detected from last tag, or `v` if no tags) |
| `--sections` | Comma-separated changelog sections (default: `feat,fix,perf`) |
| `--dry-run` | Preview changes without writing files, committing, or tagging |
| `--debug` | Show detailed inclusion/exclusion reasoning (implies `--dry-run`) |
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

Place a `.bunset.toml` in your project root to set persistent defaults so you don't have to pass the same flags every time. All fields are optional. CLI flags always take priority over config values.

```toml
bump = "patch"                          # "patch" | "minor" | "major"
scope = "changed"                       # "all" | "changed"
commit = true                           # auto-commit (default: true)
tag = true                              # create git tags (default: true)
per-package-tags = false                # pkg@version tags (monorepo)
tag-prefix = "v"                        # tag prefix (default: auto-detect)
sections = ["feat", "fix", "perf"]      # changelog sections and order
dry-run = false                         # preview without writing
debug = false                           # detailed reasoning (implies dry-run)
filter-by-package = true                # per-package filtering (monorepo)
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `bump` | `string` | _(prompt)_ | Version bump type: `"patch"`, `"minor"`, or `"major"`. Skips the interactive prompt when set. |
| `scope` | `string` | _(prompt)_ | Package scope: `"all"` or `"changed"`. Skips the interactive prompt when set (monorepo only). |
| `commit` | `boolean` | `true` | Whether to auto-commit the version bump and changelog changes. |
| `tag` | `boolean` | `true` | Whether to create git tags for released versions. |
| `per-package-tags` | `boolean` | `false` | Use `pkg@1.2.3` tags instead of prefixed tags. In a monorepo, packages with no matching commits are skipped entirely. |
| `tag-prefix` | `string` | _(auto)_ | Prefix for version tags. Auto-detected from the last git tag when not set (falls back to `"v"` if no tags exist). Set to `""` for bare version numbers, or e.g. `"project-v"` for `project-v1.2.3`. |
| `sections` | `string[]` | `["feat", "fix", "perf"]` | Which commit types to include in the changelog and in what order. Accepts any recognized type keyword. |
| `dry-run` | `boolean` | `false` | Preview all changes without writing files, committing, or tagging. |
| `debug` | `boolean` | `false` | Show detailed inclusion/exclusion reasoning. Implies `dry-run`. |
| `filter-by-package` | `boolean` | `true` | In a monorepo, only include commits that touched files within each package. Disable with `false` to include all commits in every changelog. |

## Testing

```bash
bun test
```
