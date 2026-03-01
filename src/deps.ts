import { $ } from "bun";
import type { UpdatedDependency } from "./types.ts";

export async function getUpdatedDependencies(
  cwd: string,
  packageJsonPath: string,
  sinceRef: string | null,
): Promise<UpdatedDependency[]> {
  if (!sinceRef) return [];

  let oldPkg: Record<string, unknown>;
  try {
    const relativePath = packageJsonPath.startsWith(cwd)
      ? packageJsonPath.slice(cwd.length + 1)
      : packageJsonPath;
    const result =
      await $`git -C ${cwd} show ${sinceRef}:${relativePath}`.quiet();
    oldPkg = JSON.parse(result.text());
  } catch {
    return [];
  }

  const currentPkg = await Bun.file(packageJsonPath).json();
  const updated: UpdatedDependency[] = [];

  const oldDeps = (oldPkg.dependencies ?? {}) as Record<string, string>;
  const oldDevDeps = (oldPkg.devDependencies ?? {}) as Record<string, string>;
  const newDeps = (currentPkg.dependencies ?? {}) as Record<string, string>;
  const newDevDeps = (currentPkg.devDependencies ?? {}) as Record<
    string,
    string
  >;

  for (const [name, version] of Object.entries(newDeps)) {
    if (oldDeps[name] && oldDeps[name] !== version) {
      updated.push({ name, newVersion: version });
    }
  }

  for (const [name, version] of Object.entries(newDevDeps)) {
    if (oldDevDeps[name] && oldDevDeps[name] !== version) {
      updated.push({ name, newVersion: version });
    }
  }

  return updated;
}
