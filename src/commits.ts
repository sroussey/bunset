import type { CommitType, ParsedCommit, GroupedCommits } from "./types.ts";

const TYPE_MAP: Record<string, CommitType> = {
  feat: "feature",
  feature: "feature",
  bug: "bugfix",
  fix: "bugfix",
  bugfix: "bugfix",
  test: "test",
};

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
  const features: ParsedCommit[] = [];
  const bugfixes: ParsedCommit[] = [];
  const tests: ParsedCommit[] = [];

  for (const commit of commits) {
    switch (commit.type) {
      case "feature":
        features.push(commit);
        break;
      case "bugfix":
        bugfixes.push(commit);
        break;
      case "test":
        tests.push(commit);
        break;
    }
  }

  return { features, bugfixes, tests };
}
