import type { CommitType, GroupedCommits, UpdatedDependency } from "./types.ts";
import { DEFAULT_SECTIONS } from "./commits.ts";

const SECTION_HEADINGS: Record<CommitType, string> = {
  feature: "Features",
  bugfix: "Bug Fixes",
  refactor: "Refactors",
  perf: "Performance",
  style: "Style",
  test: "Tests",
  docs: "Documentation",
  build: "Build",
  ops: "Ops",
  chore: "Chores",
};

export function buildChangelogEntry(
  version: string,
  groups: GroupedCommits,
  updatedDeps: UpdatedDependency[] = [],
  sections: CommitType[] = DEFAULT_SECTIONS,
): string {
  const lines: string[] = [`## ${version}`, ""];

  for (const type of sections) {
    const commits = groups[type];
    if (commits.length > 0) {
      lines.push(`### ${SECTION_HEADINGS[type]}`, "");
      for (const c of commits) {
        lines.push(`- ${c.description}`);
      }
      lines.push("");
    }
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
