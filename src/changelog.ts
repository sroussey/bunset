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
  ci: "CI",
};

export function buildChangelogEntry(
  version: string,
  groups: GroupedCommits,
  updatedDeps: UpdatedDependency[] = [],
  sections: CommitType[] = DEFAULT_SECTIONS,
): string {
  const lines: string[] = [`## ${version}`, ""];

  // Collect breaking changes across all types
  const breakingCommits = Object.values(groups).flat().filter((c) => c.breaking);
  if (breakingCommits.length > 0) {
    lines.push("### Breaking Changes", "");
    for (const c of breakingCommits) {
      const typeLabel = c.type ? SECTION_HEADINGS[c.type].toLowerCase() : "unknown";
      const prefix = c.commitScope
        ? `**${typeLabel}(${c.commitScope})**`
        : `**${typeLabel}**`;
      lines.push(`- ${prefix}: ${c.description}`);
    }
    lines.push("");
  }

  for (const type of sections) {
    const commits = groups[type];
    if (commits.length === 0) continue;

    lines.push(`### ${SECTION_HEADINGS[type]}`, "");

    const unscoped = commits.filter((c) => !c.commitScope);
    const scoped = new Map<string, typeof commits>();
    for (const c of commits) {
      if (c.commitScope) {
        const list = scoped.get(c.commitScope);
        if (list) list.push(c);
        else scoped.set(c.commitScope, [c]);
      }
    }

    for (const c of unscoped) {
      lines.push(`- ${c.description}`);
    }
    if (unscoped.length > 0 && scoped.size > 0) {
      lines.push("");
    }

    for (const [scope, scopeCommits] of scoped) {
      lines.push(`#### ${scope}`, "");
      for (const c of scopeCommits) {
        lines.push(`- ${c.description}`);
      }
      lines.push("");
    }

    if (unscoped.length > 0 && scoped.size === 0) {
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

export function buildReleaseNotes(
  entries: { pkgName: string; entry: string }[],
): string {
  const stripVersion = (e: string) => e.replace(/^## [^\n]*\n+/, "");
  if (entries.length === 0) return "";
  if (entries.length === 1) return stripVersion(entries[0]!.entry);
  return entries
    .map(({ pkgName, entry }) => `## ${pkgName}\n\n${stripVersion(entry)}`)
    .join("\n\n");
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
