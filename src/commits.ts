import type { CommitType, ParsedCommit, GroupedCommits } from "./types.ts";

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

// Matches: [type] desc, [type]: desc, or type: desc
const COMMIT_PATTERN = /^\[([^\]]+)\]:?\s*(.*)$|^(\w+):\s+(.*)$/;

export function parseCommit(hash: string, message: string): ParsedCommit {
  const trimmed = message.trim();
  const match = COMMIT_PATTERN.exec(trimmed);

  if (!match) {
    return { hash, message: trimmed, type: null, description: trimmed };
  }

  const keyword = (match[1] ?? match[3])!.trim().toLowerCase();
  const description = (match[2] ?? match[4])!.trim();
  const type = TYPE_MAP[keyword] ?? null;

  return { hash, message: trimmed, type, description };
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
