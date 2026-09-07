import type { UpdatedDependency } from "./types.ts";
import { readPackageJsonAtRef } from "./git.ts";

export async function getUpdatedDependencies(
  cwd: string,
  packageJsonPath: string,
  sinceRef: string | null,
): Promise<UpdatedDependency[]> {
  if (!sinceRef) return [];

  const oldPkg = await readPackageJsonAtRef(cwd, packageJsonPath, sinceRef);
  if (!oldPkg) return [];

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
