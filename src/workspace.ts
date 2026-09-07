import { $ } from "bun";
import { join } from "node:path";
import type { PackageInfo } from "./types.ts";

export async function isWorkspace(rootDir: string): Promise<boolean> {
  const pkg = await Bun.file(join(rootDir, "package.json")).json();
  return Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0;
}

export async function getAllPackages(rootDir: string): Promise<PackageInfo[]> {
  const rootPkg = await Bun.file(join(rootDir, "package.json")).json();
  const patterns: string[] = rootPkg.workspaces ?? [];

  if (patterns.length === 0) {
    return [packageInfoFromJson(rootPkg, rootDir)];
  }

  const packages: PackageInfo[] = [];

  for (const pattern of patterns) {
    const glob = new Bun.Glob(`${pattern}/package.json`);
    for await (const match of glob.scan({ cwd: rootDir, absolute: true })) {
      const dir = match.replace(/\/package\.json$/, "");
      const pkg = await Bun.file(match).json();
      packages.push(packageInfoFromJson(pkg, dir));
    }
  }

  return packages;
}

function packageInfoFromJson(pkg: Record<string, unknown>, dir: string): PackageInfo {
  return {
    name: (pkg.name as string) ?? "unknown",
    path: dir,
    packageJsonPath: join(dir, "package.json"),
    version: (pkg.version as string) ?? "0.0.0",
    private: pkg.private === true,
    dependencies: (pkg.dependencies as Record<string, string>) ?? {},
    devDependencies: (pkg.devDependencies as Record<string, string>) ?? {},
  };
}

/**
 * The packages a release should version.
 *
 * A `private: true` package is never published, so a version number on one
 * records a release no consumer could install. But that only holds where
 * something else in the repo IS published: a workspace whose packages are all
 * private is a private product, and its version numbers are the whole point.
 * So private packages are dropped only when a publishable one remains.
 *
 * `workspace` is what answers that question and defaults to `packages`. They
 * differ under `--changed`, where `packages` is only what this release touched:
 * a release that happens to touch nothing but the private packages must not
 * read as a private workspace and start versioning them.
 */
export function selectVersionablePackages(
  packages: readonly PackageInfo[],
  includePrivate: boolean,
  workspace: readonly PackageInfo[] = packages,
): { versionable: PackageInfo[]; skipped: PackageInfo[] } {
  if (includePrivate) return { versionable: [...packages], skipped: [] };
  if (!workspace.some((p) => !p.private)) {
    return { versionable: [...packages], skipped: [] };
  }
  return {
    versionable: packages.filter((p) => !p.private),
    skipped: packages.filter((p) => p.private),
  };
}

export async function getChangedPackages(
  rootDir: string,
  allPackages: PackageInfo[],
  sinceRef: string | null,
): Promise<PackageInfo[]> {
  if (!sinceRef) return allPackages;

  let result;
  try {
    result =
      await $`git -C ${rootDir} diff --name-only ${sinceRef}..HEAD`.quiet();
  } catch {
    return allPackages;
  }

  const changedFiles = result
    .text()
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((f) => join(rootDir, f));

  return allPackages.filter((pkg) =>
    changedFiles.some((f) => f.startsWith(pkg.path)),
  );
}
