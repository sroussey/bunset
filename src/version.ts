import type { BumpType } from "./types.ts";

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
