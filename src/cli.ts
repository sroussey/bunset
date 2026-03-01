import { parseArgs } from "node:util";
import type { BumpType, CliOptions, PackageScope } from "./types.ts";

export function printHelp(): void {
  console.log(`bunset - Version bumping and changelog generation for Bun projects

Usage: bunset [options]

Options:
  --patch              Bump patch version (x.y.Z)
  --minor              Bump minor version (x.Y.0)
  --major              Bump major version (X.0.0)
  --all                Update all packages (monorepo)
  --changed            Update only changed packages (monorepo)
  --commit             Commit the version bump and changelog
  --tag                Create git tags for released versions
  --per-package-tags   Use package-scoped tags (pkg@version) instead of v-prefixed
  --help, -h           Show this help message

When --patch/--minor/--major is omitted, you will be prompted interactively.
In a monorepo, you will be prompted for --all or --changed if neither is given.

Commit format:
  Commits are matched against these patterns (case-insensitive):
    [type] description     e.g. [feat] Add auth
    [type]: description    e.g. [feat]: Add auth
    type: description      e.g. feat: Add auth

  Recognized type keywords:
    feat, feature          → Features
    fix, bug, bugfix       → Bug Fixes
    test                   → Tests
  Commits without a recognized type are excluded from the changelog.

Config:
  Place a .bunset.toml in your project root to set persistent defaults.
  CLI flags always override config values. See README for format.`);
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
      commit: { type: "boolean", default: false },
      tag: { type: "boolean", default: false },
      "per-package-tags": { type: "boolean", default: false },
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

  const commit = values.commit ? true : (config.commit ?? false);
  const tag = values.tag ? true : (config.tag ?? false);
  const perPackageTags = values["per-package-tags"]
    ? true
    : (config.perPackageTags ?? false);

  if (bump && scope) {
    return { scope, bump, commit, tag, perPackageTags };
  }

  return promptForMissing(
    { commit, tag, perPackageTags },
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

interface MergedDefaults {
  commit: boolean;
  tag: boolean;
  perPackageTags: boolean;
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
