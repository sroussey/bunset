# changeset

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
changeset [options]
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
| `--delimiter` | Commit message prefix delimiter (default: `[`) |

When bump type or scope flags are omitted, interactive prompts will ask.

### Commit Message Format

Prefix commit messages with a type in brackets:

```
[feat] Add user authentication
[fix] Resolve crash on startup
[test] Add unit tests for parser
```

Recognized types:
- `feat`, `feature` — listed under **Features**
- `fix`, `bug`, `bugfix` — listed under **Bug Fixes**
- `test` — listed under **Tests**

Commits without a recognized prefix are excluded from the changelog.

## Testing

```bash
bun test
```
