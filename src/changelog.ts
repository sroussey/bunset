import type { CommitType, GroupedCommits, ParsedCommit, UpdatedDependency } from "./types.ts";
import { DEFAULT_SECTIONS } from "./commits.ts";

/**
 * What an entry says when it would otherwise be a bare version heading.
 *
 * A version with nothing under it reads as a mistake. These say which of the
 * two reasons it was: the package genuinely did not change and moved because
 * the workspace shares one version line, or it did change and `--sections`
 * renders none of those types.
 */
export const NO_CHANGES_NOTE = "_No changes in this package._";
export const NO_RENDERED_SECTIONS_NOTE =
  "_No changes in the sections this changelog renders._";

const PLACEHOLDER_NOTES = new Set([NO_CHANGES_NOTE, NO_RENDERED_SECTIONS_NOTE]);

/** Whether an entry body carries nothing but one of the notes above. */
export function isPlaceholderEntry(body: string): boolean {
  return PLACEHOLDER_NOTES.has(body.trim());
}

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
  repoWideBreaking: readonly ParsedCommit[] = [],
): string {
  const lines: string[] = [`## ${version}`, ""];
  const heading = lines.length;

  const own = Object.values(groups).flat();
  const claimed = new Set(own.map((c) => c.hash));

  // Breaking changes ignore `sections` and survive an otherwise empty entry:
  // the one thing a reader must not have to go looking for is what broke.
  // `repoWideBreaking` carries breaks that touched no package directory — they
  // gate every package in the release, so they belong in every package's entry.
  const breakingCommits = [
    ...own.filter((c) => c.breaking),
    ...repoWideBreaking.filter((c) => !claimed.has(c.hash)),
  ];
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

  if (lines.length === heading) {
    lines.push(own.length === 0 ? NO_CHANGES_NOTE : NO_RENDERED_SECTIONS_NOTE, "");
  }

  return lines.join("\n");
}

export function buildReleaseNotes(
  entries: Iterable<{ pkgName: string; entry: string }>,
): string {
  const stripVersion = (e: string) => e.replace(/^## [^\n]*\n+/, "");
  // A placeholder note is not content: a package carried along by a shared
  // version line still has nothing to announce in the release notes.
  const nonEmpty = [...entries].filter(({ entry }) => {
    const body = stripVersion(entry).trim();
    return body !== "" && !isPlaceholderEntry(body);
  });
  if (nonEmpty.length === 0) return "";
  if (nonEmpty.length === 1) return stripVersion(nonEmpty[0]!.entry);
  return nonEmpty
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
