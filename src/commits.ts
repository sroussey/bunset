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
  ci: "ci",
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
  "ci",
];

export function normalizeType(keyword: string): CommitType | null {
  return TYPE_MAP[keyword.toLowerCase()] ?? null;
}

// Matches: [type(scope)!] desc, [type]: desc, type(scope)!: desc, type: desc
const COMMIT_PATTERN = /^\[([^\]]+)\]:?\s*(.*)$|^(\w+(?:\([^)]*\))?!?):\s+(.*)$/;
const SCOPE_PATTERN = /^(\w+)\(([^)]*)\)$/;

const BREAKING_FOOTER_PATTERN = /^BREAKING[ -]CHANGE:\s/m;

export function parseCommit(hash: string, message: string, body?: string): ParsedCommit {
  const trimmed = message.trim();
  const match = COMMIT_PATTERN.exec(trimmed);

  if (!match) {
    return { hash, message: trimmed, type: null, commitScope: null, description: trimmed, breaking: false, files: [] };
  }

  let raw = (match[1] ?? match[3])!.trim();
  const description = (match[2] ?? match[4])!.trim();

  // Detect trailing `!` breaking marker
  let breaking = false;
  if (raw.endsWith("!")) {
    breaking = true;
    raw = raw.slice(0, -1);
  }

  const scopeMatch = SCOPE_PATTERN.exec(raw);
  let keyword: string;
  let commitScope: string | null;

  if (scopeMatch) {
    keyword = scopeMatch[1]!;
    commitScope = scopeMatch[2]!.trim();
  } else {
    keyword = raw;
    commitScope = null;
  }

  const type = TYPE_MAP[keyword.toLowerCase()] ?? null;

  // Scan body for BREAKING CHANGE footer
  if (!breaking && body && BREAKING_FOOTER_PATTERN.test(body)) {
    breaking = true;
  }

  return { hash, message: trimmed, type, commitScope, description, breaking, files: [] };
}

export function filterCommitsForPackage(
  commits: ParsedCommit[],
  packagePath: string,
  rootDir: string,
): ParsedCommit[] {
  const relPkgPath = packagePath.startsWith(rootDir)
    ? packagePath.slice(rootDir.length + 1)
    : packagePath;
  return commits.filter(
    (c) => c.files.length === 0 || c.files.some((f) => f.startsWith(relPkgPath + "/")),
  );
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
