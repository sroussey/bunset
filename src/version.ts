import type { BumpType, ParsedCommit } from "./types.ts";

/**
 * Thrown when a release would ship breaking changes under a bump that hides
 * them. Carries the offending commits so the caller can name them.
 */
export class BreakingChangeBumpError extends Error {
  readonly bump: BumpType;
  readonly commits: readonly ParsedCommit[];

  constructor(bump: BumpType, commits: readonly ParsedCommit[], required: BumpType) {
    const list = commits
      .map((c) => `  ${c.hash.slice(0, 7)} ${c.message.split("\n")[0]}`)
      .join("\n");
    super(
      `Breaking changes found, so a "${bump}" release is not allowed:\n${list}\n` +
        `Re-run with --${required}${required === "minor" ? " or --major" : ""}, ` +
        `or --auto to let the commits choose.`,
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

const RANK: Record<BumpType, number> = { patch: 0, minor: 1, major: 2 };

/** The higher of two bumps, by severity. */
export function maxBump(a: BumpType, b: BumpType): BumpType {
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * The slot a breaking change has to land in to be visible to a caret range.
 *
 * `^1.2.3` admits anything below 2.0.0, so on a released line only the major
 * is outside it. `^0.4.8` admits only 0.4.x, so on a 0.x line the minor is
 * already the break slot — which is why a 0.x break does not need a 1.0.0.
 */
export function breakingBumpSlot(currentVersion: string): BumpType {
  const [major] = parseSemver(currentVersion);
  return major === 0 ? "minor" : "major";
}

/**
 * A `!` marker (or `BREAKING CHANGE:` footer) rules out any bump below the
 * break slot for the version being released: publishing one would hide the
 * break from every consumer's version range.
 *
 * `currentVersion` selects the slot. Omitted, the check falls back to refusing
 * a patch, which is right for every line but cannot tell a 1.x minor (which
 * hides the break) from a 0.x minor (which does not).
 */
export function assertBumpAllowsBreakingChanges(
  commits: readonly ParsedCommit[],
  bump: BumpType,
  currentVersion?: string,
): void {
  const required = currentVersion === undefined ? "minor" : breakingBumpSlot(currentVersion);
  if (RANK[bump] >= RANK[required]) return;
  const breaking = findBreakingCommits(commits);
  if (breaking.length === 0) return;
  throw new BreakingChangeBumpError(bump, breaking, required);
}

/**
 * The bump the commits themselves call for: a break lands in the break slot,
 * a feature in the minor, anything else in the patch. This is what `--auto`
 * uses, so the version number is a function of what changed rather than of
 * whichever flag the release script was written with.
 */
export function deriveBump(
  commits: readonly ParsedCommit[],
  currentVersion: string,
): BumpType {
  if (findBreakingCommits(commits).length > 0) return breakingBumpSlot(currentVersion);
  if (commits.some((c) => c.type === "feature")) return "minor";
  return "patch";
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
