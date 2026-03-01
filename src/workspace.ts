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
    dependencies: (pkg.dependencies as Record<string, string>) ?? {},
    devDependencies: (pkg.devDependencies as Record<string, string>) ?? {},
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
