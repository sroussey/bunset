import type { CommitType, ParsedCommit, GroupedCommits } from "./types.ts";

export const DEFAULT_SECTIONS: CommitType[] = ["feature", "bugfix", "perf"];

const TYPE_MAP: Record<string, CommitType> = {
  feat: "feature",
  feature: "feature",
  fix: "bugfix",
  bug: "bugfix",
  bugfix: "bugfix",
  refactor: "refactor",
  perf: "perf",
  style: "style",
  test: "test",
  docs: "docs",
  build: "build",
  ops: "ops",
  chore: "chore",
};

export const COMMIT_TYPES: CommitType[] = [
  "feature",
  "bugfix",
  "refactor",
  "perf",
  "style",
  "test",
  "docs",
  "build",
  "ops",
  "chore",
];

export function normalizeType(keyword: string): CommitType | null {
  return TYPE_MAP[keyword.toLowerCase()] ?? null;
}

// Matches: [type(scope)] desc, [type]: desc, type(scope): desc, type: desc
const COMMIT_PATTERN = /^\[([^\]]+)\]:?\s*(.*)$|^(\w+(?:\([^)]*\))?):\s+(.*)$/;
const SCOPE_PATTERN = /^(\w+)\(([^)]*)\)$/;

export function parseCommit(hash: string, message: string): ParsedCommit {
  const trimmed = message.trim();
  const match = COMMIT_PATTERN.exec(trimmed);

  if (!match) {
    return { hash, message: trimmed, type: null, commitScope: null, description: trimmed };
  }

  const raw = (match[1] ?? match[3])!.trim();
  const description = (match[2] ?? match[4])!.trim();

  const scopeMatch = SCOPE_PATTERN.exec(raw);
  const keyword = scopeMatch ? scopeMatch[1]! : raw;
  const commitScope = scopeMatch ? scopeMatch[2]!.trim() : null;

  const type = TYPE_MAP[keyword.toLowerCase()] ?? null;

  return { hash, message: trimmed, type, commitScope, description };
}

export function groupCommits(commits: ParsedCommit[]): GroupedCommits {
  const groups = Object.fromEntries(
    COMMIT_TYPES.map((t) => [t, [] as ParsedCommit[]]),
  ) as GroupedCommits;

  for (const commit of commits) {
    if (commit.type) {
      groups[commit.type].push(commit);
    }
  }

  return groups;
}
