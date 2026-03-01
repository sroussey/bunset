import { $ } from "bun";

export async function getLastTag(cwd: string): Promise<string | null> {
  try {
    const result = await $`git -C ${cwd} describe --tags --abbrev=0`.quiet();
    return result.text().trim() || null;
  } catch {
    return null;
  }
}

export async function getCommitsSince(
  cwd: string,
  sinceRef: string | null,
): Promise<{ hash: string; message: string }[]> {
  let result;
  if (sinceRef) {
    result =
      await $`git -C ${cwd} log ${sinceRef}..HEAD --pretty=format:%H%n%s --no-merges`.quiet();
  } else {
    result =
      await $`git -C ${cwd} log --pretty=format:%H%n%s --no-merges`.quiet();
  }

  const text = result.text().trim();
  if (!text) return [];

  const lines = text.split("\n");
  const commits: { hash: string; message: string }[] = [];

  for (let i = 0; i < lines.length - 1; i += 2) {
    commits.push({ hash: lines[i]!, message: lines[i + 1]! });
  }

  return commits;
}

export async function getCommitFiles(
  cwd: string,
  hash: string,
): Promise<string[]> {
  try {
    const result =
      await $`git -C ${cwd} diff-tree --no-commit-id --name-only -r ${hash}`.quiet();
    return result
      .text()
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function commitAndTag(
  cwd: string,
  message: string,
  tags: string[] = [],
): Promise<void> {
  await $`git -C ${cwd} add -A`.quiet();
  await $`git -C ${cwd} commit -m ${message}`.quiet();
  for (const tag of tags) {
    await $`git -C ${cwd} tag ${tag}`.quiet();
  }
}
