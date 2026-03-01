import type { GroupedCommits, UpdatedDependency } from "./types.ts";

export function buildChangelogEntry(
  version: string,
  groups: GroupedCommits,
  updatedDeps: UpdatedDependency[] = [],
): string {
  const lines: string[] = [`## ${version}`, ""];

  if (groups.features.length > 0) {
    lines.push("### Features", "");
    for (const c of groups.features) {
      lines.push(`- ${c.description}`);
    }
    lines.push("");
  }

  if (groups.bugfixes.length > 0) {
    lines.push("### Bug Fixes", "");
    for (const c of groups.bugfixes) {
      lines.push(`- ${c.description}`);
    }
    lines.push("");
  }

  if (groups.tests.length > 0) {
    lines.push("### Tests", "");
    for (const c of groups.tests) {
      lines.push(`- ${c.description}`);
    }
    lines.push("");
  }

  if (updatedDeps.length > 0) {
    lines.push("### Updated Dependencies", "");
    for (const dep of updatedDeps) {
      lines.push(`- \`${dep.name}\`: ${dep.newVersion}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function writeChangelog(
  dir: string,
  entry: string,
): Promise<void> {
  const path = `${dir}/CHANGELOG.md`;
  const file = Bun.file(path);
  const exists = await file.exists();

  if (!exists) {
    await Bun.write(path, `# Changelog\n\n${entry}`);
    return;
  }

  const content = await file.text();
  const headerEnd = content.indexOf("\n");

  if (headerEnd === -1) {
    await Bun.write(path, `${content}\n\n${entry}`);
    return;
  }

  const header = content.slice(0, headerEnd);
  const rest = content.slice(headerEnd + 1);
  await Bun.write(path, `${header}\n\n${entry}${rest}`);
}
