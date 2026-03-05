import path from "node:path";
import type { CliOptions, CommitType } from "./types.ts";
import { normalizeType, ALL_SECTIONS } from "./commits.ts";

const CONFIG_FILE = ".bunset.toml";

const VALID_BUMPS = new Set(["patch", "minor", "major"]);
const VALID_SCOPES = new Set(["all", "changed"]);

export async function loadConfig(
  cwd: string,
): Promise<Partial<CliOptions>> {
  const file = Bun.file(path.join(cwd, CONFIG_FILE));

  if (!(await file.exists())) return {};

  const raw = Bun.TOML.parse(await file.text()) as Record<string, unknown>;
  const config: Partial<CliOptions> = {};

  if (typeof raw.bump === "string" && VALID_BUMPS.has(raw.bump)) {
    config.bump = raw.bump as CliOptions["bump"];
  }

  if (typeof raw.scope === "string" && VALID_SCOPES.has(raw.scope)) {
    config.scope = raw.scope as CliOptions["scope"];
  }

  if (typeof raw.commit === "boolean") {
    config.commit = raw.commit;
  }

  if (typeof raw.tag === "boolean") {
    config.tag = raw.tag;
  }

  if (typeof raw["per-package-tags"] === "boolean") {
    config.perPackageTags = raw["per-package-tags"];
  }

  if (typeof raw["dry-run"] === "boolean") {
    config.dryRun = raw["dry-run"];
  }

  if (typeof raw["filter-by-package"] === "boolean") {
    config.filterByPackage = raw["filter-by-package"];
  }

  if (typeof raw["tag-prefix"] === "string") {
    config.tagPrefix = raw["tag-prefix"];
  }

  if (typeof raw.push === "boolean") {
    config.push = raw.push;
  }

  if (typeof raw.debug === "boolean") {
    config.debug = raw.debug;
  }

  if (raw.sections === "all") {
    config.sections = [...ALL_SECTIONS];
  } else if (Array.isArray(raw.sections)) {
    const sections: CommitType[] = [];
    for (const s of raw.sections) {
      if (typeof s === "string") {
        const type = normalizeType(s);
        if (type) sections.push(type);
      }
    }
    if (sections.length > 0) config.sections = sections;
  }

  return config;
}
