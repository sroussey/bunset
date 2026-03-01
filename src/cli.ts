import { parseArgs } from "node:util";
import type { BumpType, CliOptions, CommitType, PackageScope } from "./types.ts";
import { normalizeType, DEFAULT_SECTIONS } from "./commits.ts";

export function printHelp(): void {
  console.log(`bunset - Version bumping and changelog generation for Bun projects

Usage: bunset [options]

Options:
  --patch              Bump patch version (x.y.Z)
  --minor              Bump minor version (x.Y.0)
  --major              Bump major version (X.0.0)
  --all                Update all packages (monorepo)
  --changed            Update only changed packages (monorepo)
  --no-commit          Do not commit the version bump and changelog
  --no-tag             Do not create git tags for released versions
  --per-package-tags   Use package-scoped tags (pkg@version) instead of prefixed
  --tag-prefix <str>   Tag prefix (auto-detected from last tag, or "v" if no tags)
  --sections <list>    Comma-separated changelog sections (default: feat,fix,perf)
  --dry-run            Preview changes without writing files, committing, or tagging
  --debug              Show detailed inclusion/exclusion reasoning (implies --dry-run)
  --no-filter-by-package
                       Include all commits in every package changelog (monorepo)
  --help, -h           Show this help message

When --patch/--minor/--major is omitted, you will be prompted interactively.
In a monorepo, you will be prompted for --all or --changed if neither is given.

Commit format:
  Commits are matched against these patterns (case-insensitive):
    [type] description          e.g. [feat] Add auth
    [type]: description         e.g. [feat]: Add auth
    type: description           e.g. feat: Add auth
    type(scope): description    e.g. feat(auth): Add login
    [type(scope)] description   e.g. [feat(auth)] Add login

  An optional scope groups commits under a sub-heading in the changelog.

  Recognized type keywords:
    feat, feature          → Features
    fix, bug, bugfix       → Bug Fixes
    refactor               → Refactors
    perf                   → Performance
    style                  → Style
    test                   → Tests
    docs                   → Documentation
    build                  → Build
    ops                    → Ops
    chore                  → Chores
  Only sections listed in --sections (or config) are included in the changelog.
  Default sections: feat, fix, perf.

Config file (.bunset.toml):
  Place a .bunset.toml in your project root to set persistent defaults.
  All fields are optional. CLI flags always override config values.

  Example:
    bump = "patch"                          # "patch" | "minor" | "major"
    scope = "changed"                       # "all" | "changed"
    commit = true                           # auto-commit (default: true)
    tag = true                              # create git tags (default: true)
    per-package-tags = false                # pkg@version tags (monorepo)
    tag-prefix = "v"                        # tag prefix (default: auto-detect)
    sections = ["feat", "fix", "perf"]      # changelog sections and order
    dry-run = false                         # preview without writing
    debug = false                           # detailed reasoning (implies dry-run)
    filter-by-package = true                # per-package filtering (monorepo)`);
}

export function resolveOptions(
  isWs: boolean,
  config: Partial<CliOptions> = {},
): CliOptions | Promise<CliOptions> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      all: { type: "boolean", default: false },
      changed: { type: "boolean", default: false },
      patch: { type: "boolean", default: false },
      minor: { type: "boolean", default: false },
      major: { type: "boolean", default: false },
      commit: { type: "boolean", default: true },
      tag: { type: "boolean", default: true },
      "per-package-tags": { type: "boolean", default: false },
      sections: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "filter-by-package": { type: "boolean", default: true },
      "tag-prefix": { type: "string" },
      debug: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const cliBump = resolveBump(values);
  const cliScope = resolveScope(values, isWs);

  const bump = cliBump ?? config.bump ?? null;
  const scope = cliScope ?? config.scope ?? (isWs ? null : "all");

  const commit = values.commit === false ? false : (config.commit ?? true);
  const tag = values.tag === false ? false : (config.tag ?? true);
  const perPackageTags = values["per-package-tags"]
    ? true
    : (config.perPackageTags ?? false);

  const sections = parseSections(values.sections as string | undefined)
    ?? config.sections
    ?? DEFAULT_SECTIONS;

  const debug = values.debug ? true : (config.debug ?? false);
  const dryRun = debug || values["dry-run"] ? true : (config.dryRun ?? false);

  const filterByPackage = values["filter-by-package"] === false
    ? false
    : (config.filterByPackage ?? true);

  const tagPrefix = values["tag-prefix"] as string | undefined
    ?? config.tagPrefix
    ?? null;

  if (bump && scope) {
    return { scope, bump, commit, tag, perPackageTags, sections, dryRun, filterByPackage, tagPrefix, debug };
  }

  return promptForMissing(
    { commit, tag, perPackageTags, sections, dryRun, filterByPackage, tagPrefix, debug },
    bump,
    scope,
    isWs,
  );
}

function resolveBump(values: Record<string, unknown>): BumpType | null {
  if (values.major) return "major";
  if (values.minor) return "minor";
  if (values.patch) return "patch";
  return null;
}

function resolveScope(
  values: Record<string, unknown>,
  isWs: boolean,
): PackageScope | null {
  if (!isWs) return "all";
  if (values.all) return "all";
  if (values.changed) return "changed";
  return null;
}

function parseSections(raw: string | undefined): CommitType[] | null {
  if (!raw) return null;
  const result: CommitType[] = [];
  for (const part of raw.split(",")) {
    const type = normalizeType(part.trim());
    if (type) result.push(type);
  }
  return result.length > 0 ? result : null;
}

interface MergedDefaults {
  commit: boolean;
  tag: boolean;
  perPackageTags: boolean;
  sections: CommitType[];
  dryRun: boolean;
  filterByPackage: boolean;
  tagPrefix: string | null;
  debug: boolean;
}

async function promptForMissing(
  merged: MergedDefaults,
  bump: BumpType | null,
  scope: PackageScope | null,
  isWs: boolean,
): Promise<CliOptions> {
  if (!scope && isWs) {
    process.stdout.write(
      "Update packages: (1) ALL packages  (2) Only CHANGED packages [default: 2]: ",
    );
    const answer = await readLine();
    scope = answer.trim() === "1" ? "all" : "changed";
  }

  if (!bump) {
    process.stdout.write(
      "Version bump: (1) patch  (2) minor  (3) major [default: 1]: ",
    );
    const answer = await readLine();
    const choice = answer.trim();
    if (choice === "3") bump = "major";
    else if (choice === "2") bump = "minor";
    else bump = "patch";
  }

  return {
    scope: scope ?? "all",
    bump,
    ...merged,
  };
}

async function readLine(): Promise<string> {
  for await (const line of console) {
    return line;
  }
  return "";
}
