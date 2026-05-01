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
): Promise<{ hash: string; message: string; body: string }[]> {
  const fmt = "%x00%H%x00%s%x00%b";
  let result;
  if (sinceRef) {
    result =
      await $`git -C ${cwd} log ${sinceRef}..HEAD --pretty=format:${fmt} --no-merges`.quiet();
  } else {
    result =
      await $`git -C ${cwd} log --pretty=format:${fmt} --no-merges`.quiet();
  }

  const text = result.text().trim();
  if (!text) return [];

  const commits: { hash: string; message: string; body: string }[] = [];
  // Split on the leading \x00 that starts each record
  const records = text.split("\x00");

  // records[0] is empty (before the first \x00), then groups of 3: hash, subject, body
  for (let i = 1; i + 2 < records.length; i += 3) {
    commits.push({
      hash: records[i]!.trim(),
      message: records[i + 1]!.trim(),
      body: records[i + 2]!.trim(),
    });
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
  files: string[] = [],
): Promise<void> {
  await $`git -C ${cwd} add ${files}`.quiet();
  await $`git -C ${cwd} commit -m ${message}`.quiet();
  const skipped: string[] = [];
  for (const tag of tags) {
    try {
      await $`git -C ${cwd} tag ${tag}`.quiet();
    } catch {
      skipped.push(tag);
    }
  }
  if (skipped.length > 0) {
    console.warn(`⚠ Skipped existing tags: ${skipped.join(", ")}`);
  }
}

export async function gitPush(
  cwd: string,
  tags: string[] = [],
): Promise<void> {
  await $`git -C ${cwd} push`.quiet();
  if (tags.length > 0) {
    await $`git -C ${cwd} push --tags`.quiet();
  }
}

export async function createGithubRelease(
  cwd: string,
  tag: string,
  notes: string,
): Promise<void> {
  await $`gh release create ${tag} --title ${tag} --notes ${notes}`
    .cwd(cwd)
    .quiet();
}
