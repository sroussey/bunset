import type { BumpType, ParsedCommit } from "./types.ts";

/**
 * Thrown when a release would ship breaking changes under a bump that hides
 * them. Carries the offending commits so the caller can name them.
 */
export class BreakingChangeBumpError extends Error {
  readonly bump: BumpType;
  readonly commits: readonly ParsedCommit[];

  constructor(bump: BumpType, commits: readonly ParsedCommit[]) {
    const list = commits
      .map((c) => `  ${c.hash.slice(0, 7)} ${c.message.split("\n")[0]}`)
      .join("\n");
    super(
      `Breaking changes found, so a "${bump}" release is not allowed:\n${list}\n` +
        `Re-run with --minor or --major (or set bump in .bunset.toml).`,
    );
    this.name = "BreakingChangeBumpError";
    this.bump = bump;
    this.commits = commits;
  }
}

export function findBreakingCommits(
  commits: readonly ParsedCommit[],
): ParsedCommit[] {
  return commits.filter((c) => c.breaking);
}

/**
 * A `!` marker (or `BREAKING CHANGE:` footer) rules out a patch release —
 * semver reserves patch for backwards-compatible fixes, so publishing one
 * would hide the break from every consumer's version range.
 */
export function assertBumpAllowsBreakingChanges(
  commits: readonly ParsedCommit[],
  bump: BumpType,
): void {
  if (bump !== "patch") return;
  const breaking = findBreakingCommits(commits);
  if (breaking.length === 0) return;
  throw new BreakingChangeBumpError(bump, breaking);
}

export function parseSemver(version: string): [number, number, number] {
  const clean = version.startsWith("v") ? version.slice(1) : version;
  const [major, minor, patch] = clean.split(".").map(Number);
  return [major ?? 0, minor ?? 0, patch ?? 0];
}

export function bumpVersion(current: string, bump: BumpType): string {
  const [major, minor, patch] = parseSemver(current);
  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

export async function updatePackageVersion(
  packageJsonPath: string,
  bump: BumpType,
): Promise<{ oldVersion: string; newVersion: string }> {
  const file = Bun.file(packageJsonPath);
  const pkg = await file.json();
  const oldVersion = pkg.version ?? "0.0.0";
  const newVersion = bumpVersion(oldVersion, bump);
  pkg.version = newVersion;
  await Bun.write(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");
  return { oldVersion, newVersion };
}

export async function setPackageVersion(
  packageJsonPath: string,
  newVersion: string,
): Promise<{ oldVersion: string; newVersion: string }> {
  const file = Bun.file(packageJsonPath);
  const pkg = await file.json();
  const oldVersion = pkg.version ?? "0.0.0";
  pkg.version = newVersion;
  await Bun.write(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");
  return { oldVersion, newVersion };
}
