import type { CommitType, ParsedCommit, GroupedCommits } from "./types.ts";

const CLOSE_DELIMITERS: Record<string, string> = {
  "[": "]",
  "(": ")",
  "{": "}",
  "<": ">",
};

const TYPE_MAP: Record<string, CommitType> = {
  feat: "feature",
  feature: "feature",
  bug: "bugfix",
  fix: "bugfix",
  bugfix: "bugfix",
  test: "test",
};

export function parseCommit(
  hash: string,
  message: string,
  delimiter: string = "[",
): ParsedCommit {
  const trimmed = message.trim();

  if (!trimmed.startsWith(delimiter)) {
    return { hash, message: trimmed, type: null, description: trimmed };
  }

  const closeChar = CLOSE_DELIMITERS[delimiter] ?? delimiter;
  const closeIdx = trimmed.indexOf(closeChar, delimiter.length);

  if (closeIdx === -1) {
    return { hash, message: trimmed, type: null, description: trimmed };
  }

  const keyword = trimmed.slice(delimiter.length, closeIdx).trim().toLowerCase();
  const type = TYPE_MAP[keyword] ?? null;
  const description = trimmed.slice(closeIdx + closeChar.length).trim();

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
