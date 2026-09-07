# bunset

A zero-dependency CLI tool that automates version bumping and changelog generation for Bun workspace monorepos and single packages.

It reads git commit messages since the last tag, categorizes them by type prefix (`feat:`, `fix:`, `test:`), bumps semantic versions, updates `CHANGELOG.md` per package, and optionally commits and tags the result.

## Install

```bash
bun add bunset
```

## Usage

```bash
bunx bunset [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--patch` | Patch version bump (default) |
| `--minor` | Minor version bump |
| `--major` | Major version bump |
| `--auto` | Derive the bump per package from its commits |
| `--all` | Update all workspace packages |
| `--changed` | Update only changed packages (default for workspaces) |
| `--no-commit` | Do not commit changes to git (commits by default) |
| `--no-tag` | Tag the commit with new version (default) |
| `--per-package-tags` | Use `pkg@1.2.3` tags instead of prefixed tags |
| `--tag-prefix` | Tag prefix (auto-detected from last tag, or `v` if no tags) |
| `--sections` | Comma-separated changelog sections, or `all` (default: `all`) |
| `--dry-run` | Preview changes without writing files, committing, or tagging |
| `--debug` | Show detailed inclusion/exclusion reasoning (implies `--dry-run`) |
| `--no-filter-by-package` | Include all commits in every package changelog (monorepo) |
| `--include-private` | Version private packages alongside published ones (skipped by default) |
| `--skip-unchanged` | Skip packages with no matching commits, even under shared tags |
| `--no-surface-check` | Do not diff each `package.json` against the last tag |
| `--push` | Push the release commit and tags to the remote |
| `--release` | Create a GitHub release per tag with the changelog entry as the release notes (requires `--push` and the `gh` CLI) |

When bump type or scope flags are omitted, interactive prompts will ask.

### Choosing the Bump

`--auto` makes the version a function of what changed rather than of whichever
flag the release script was written with. Per package:

| Evidence since the last tag | Bump |
|---|---|
| A breaking commit, or a manifest break (see below) | the **break slot** |
| Any `feat` | minor |
| Anything else | patch |

Under shared tags every package moves to one version, so the bump is the
strongest any released package calls for.

### The Break Slot

A breaking change has to land where a consumer's range will not silently
resolve it. `^1.2.3` admits everything below `2.0.0`, so on a released line
that is the **major**. `^0.4.8` admits only `0.4.x`, so on a 0.x line the
**minor** is already outside every caret range — a 0.x break does not need a
1.0.0.

bunset refuses any bump below that slot and names the offending commits,
including under `--dry-run`. This is the check that catches a break marked
`feat!:` and released as `0.4.9`.

### Undeclared Breaking Changes

The check above only sees what a commit message declared. Before each release
bunset also compares every package's `package.json` against the one at the last
tag, and refuses a bump below the break slot when the manifest lost something a
consumer resolves against:

- an `exports` subpath, or one condition under a subpath (`bun`, `import`, …)
- the last entry point — no `exports`, `main` or `module` left
- a `bin` entry
- a runtime floor: an `engines` field that was absent before, or whose minimum
  version moved up
- `"private": true` on a package that was publishable at the last tag

This is a manifest diff, not an API diff — a changed function signature is
invisible to it, and catching those needs a TypeScript parser bunset does not
have. What it does cover is the class of break that is invisible to a commit
message too, because nothing about it looks like a breaking edit.

Under an explicit `--patch`/`--minor`/`--major` a finding below the break slot
fails the release: you asserted a number, and overriding it silently would be
the failure this check exists to catch. Under `--auto` it instead raises the
derived bump to the break slot, which is what "derive it from what changed"
means when the manifest is the thing that changed.

Disable with `--no-surface-check` when a finding is not a break.

### Monorepo Per-Package Changelogs

In a monorepo, each package's changelog only includes commits that touched files within that package (enabled by default). A commit that modifies `packages/a/src/index.ts` will only appear in `packages/a/CHANGELOG.md`.

When `--per-package-tags` is set, packages with no matching commits are skipped entirely (no version bump, changelog, or tag). Under shared tags they are bumped anyway by default, since they share one version line; pass `--skip-unchanged` to skip them there too rather than accrue changelog sections for releases in which nothing about them changed.

Packages marked `"private": true` are skipped: they are never published, so a version number on one records a release no consumer could install. This applies only where something else in the repo *is* published — a workspace whose packages are all private is a private product, and its version numbers are the whole point, so nothing is skipped there. Pass `--include-private` to version private packages alongside published ones.

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

#### Breaking Changes

Append `!` before the colon (or closing bracket) to mark a commit as a breaking change, per [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
feat!: Remove old API
feat(auth)!: Change token format
[feat!] Remove old API
```

A `BREAKING CHANGE:` or `BREAKING-CHANGE:` footer in the commit body is also detected.

Breaking commits are collected into a **Breaking Changes** section at the top of each changelog entry, regardless of which `--sections` are configured.

A breaking change rules out any bump below the break slot for the line being released — the major on a released line, the minor on a 0.x one. bunset names the offending commits and exits without writing anything, including under `--dry-run`.

#### Recognized Type Keywords

- `feat`, `feature` — listed under **Features**
- `fix`, `bug`, `bugfix` — listed under **Bug Fixes**
- `refactor` — listed under **Refactors**
- `perf`, `performance` — listed under **Performance**
- `style` — listed under **Style**
- `test` — listed under **Tests**
- `docs`, `documentation` — listed under **Documentation**
- `build` — listed under **Build**
- `ops` — listed under **Ops**
- `chore` — listed under **Chores**
- `ci` — listed under **CI**

Only sections listed in `--sections` (or the `sections` config option) appear in the changelog. The default is `all` (every recognized type). Pass `--sections all` explicitly or use a comma-separated subset like `--sections feat,fix,perf`.

### Config File

Place a `.bunset.toml` in your project root to set persistent defaults so you don't have to pass the same flags every time. All fields are optional. CLI flags always take priority over config values.

```toml
bump = "patch"                          # "patch" | "minor" | "major" | "auto"
scope = "changed"                       # "all" | "changed"
commit = true                           # auto-commit (default: true)
tag = true                              # create git tags (default: true)
per-package-tags = false                # pkg@version tags (monorepo)
tag-prefix = "v"                        # tag prefix (default: auto-detect)
sections = "all"                          # changelog sections and order ("all" or array)
push = false                            # push after tagging (default: false)
release = false                         # create GitHub release per tag (default: false)
dry-run = false                         # preview without writing
debug = false                           # detailed reasoning (implies dry-run)
filter-by-package = true                # per-package filtering (monorepo)
include-private = false                 # version "private": true packages
skip-unchanged = false                  # skip packages with no matching commits
surface-check = true                    # diff each manifest against the last tag
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `bump` | `string` | _(prompt)_ | Version bump type: `"patch"`, `"minor"`, `"major"`, or `"auto"` to derive it per package from the commits. Skips the interactive prompt when set. |
| `scope` | `string` | _(prompt)_ | Package scope: `"all"` or `"changed"`. Skips the interactive prompt when set (monorepo only). |
| `commit` | `boolean` | `true` | Whether to auto-commit the version bump and changelog changes. |
| `tag` | `boolean` | `true` | Whether to create git tags for released versions. |
| `per-package-tags` | `boolean` | `false` | Use `pkg@1.2.3` tags instead of prefixed tags. In a monorepo, packages with no matching commits are skipped entirely. |
| `tag-prefix` | `string` | _(auto)_ | Prefix for version tags. Auto-detected from the last git tag when not set (falls back to `"v"` if no tags exist). Set to `""` for bare version numbers, or e.g. `"project-v"` for `project-v1.2.3`. |
| `sections` | `string[] \| "all"` | `"all"` | Which commit types to include in the changelog and in what order. Use `"all"` for every type, or an array of recognized type keywords. |
| `dry-run` | `boolean` | `false` | Preview all changes without writing files, committing, or tagging. |
| `debug` | `boolean` | `false` | Show detailed inclusion/exclusion reasoning. Implies `dry-run`. |
| `filter-by-package` | `boolean` | `true` | In a monorepo, only include commits that touched files within each package. Disable with `false` to include all commits in every changelog. |
| `include-private` | `boolean` | `false` | Version private packages alongside published ones. They are skipped by default, since no version of one is installable — unless every package in scope is private, in which case none is skipped. |
| `skip-unchanged` | `boolean` | `false` | Skip packages with no matching commits even under shared tags. Already implied by `per-package-tags`. |
| `surface-check` | `boolean` | `true` | Compare each `package.json` against the one at the last tag and refuse a bump that would hide a manifest-level break. |
| `push` | `boolean` | `false` | Push the release commit and tags to the remote after tagging. |
| `release` | `boolean` | `false` | Create a GitHub release for each tag with the changelog entry as the release notes. Requires `push = true` and the [`gh` CLI](https://cli.github.com/). When multiple packages share a tag, their entries are combined under per-package headings. |

## Testing

```bash
bun test
```
