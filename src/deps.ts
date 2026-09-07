import type { UpdatedDependency } from "./types.ts";

/**
 * Dependencies whose declared range moved between two manifests.
 *
 * Pure: both manifests are passed in, because the caller has already read each
 * one and re-fetching them here meant two `git show` spawns and two file reads
 * per package for data already in hand.
 */
export function getUpdatedDependencies(
  oldPkg: Record<string, unknown> | null,
  currentPkg: Record<string, unknown>,
): UpdatedDependency[] {
  if (!oldPkg) return [];

  const updated: UpdatedDependency[] = [];
  const sections = ["dependencies", "devDependencies"] as const;

  for (const section of sections) {
    const before = (oldPkg[section] ?? {}) as Record<string, string>;
    const after = (currentPkg[section] ?? {}) as Record<string, string>;
    for (const [name, version] of Object.entries(after)) {
      if (before[name] && before[name] !== version) {
        updated.push({ name, newVersion: version });
      }
    }
  }

  return updated;
}
