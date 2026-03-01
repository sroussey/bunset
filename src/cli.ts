import { parseArgs } from "node:util";
import type { BumpType, CliOptions, PackageScope } from "./types.ts";

export function resolveOptions(isWs: boolean): CliOptions | Promise<CliOptions> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      all: { type: "boolean", default: false },
      changed: { type: "boolean", default: false },
      patch: { type: "boolean", default: false },
      minor: { type: "boolean", default: false },
      major: { type: "boolean", default: false },
      commit: { type: "boolean", default: false },
      tag: { type: "boolean", default: false },
      "per-package-tags": { type: "boolean", default: false },
      delimiter: { type: "string", default: "[" },
    },
    strict: true,
  });

  const bump = resolveBump(values);
  const scope = resolveScope(values, isWs);

  if (bump && scope) {
    return {
      scope,
      bump,
      commit: values.commit!,
      tag: values.tag!,
      perPackageTags: values["per-package-tags"]!,
      delimiter: values.delimiter!,
    };
  }

  return promptForMissing(values, bump, scope, isWs);
}

function resolveBump(values: Record<string, unknown>): BumpType | null {
  if (values.major) return "major";
  if (values.minor) return "minor";
  if (values.patch) return "patch";
  return null;
}

function resolveScope(
  values: Record<string, unknown>,
  isWs: boolean,
): PackageScope | null {
  if (!isWs) return "all";
  if (values.all) return "all";
  if (values.changed) return "changed";
  return null;
}

async function promptForMissing(
  values: Record<string, unknown>,
  bump: BumpType | null,
  scope: PackageScope | null,
  isWs: boolean,
): Promise<CliOptions> {
  if (!scope && isWs) {
    process.stdout.write(
      "Update packages: (1) ALL packages  (2) Only CHANGED packages [default: 2]: ",
    );
    const answer = await readLine();
    scope = answer.trim() === "1" ? "all" : "changed";
  }

  if (!bump) {
    process.stdout.write(
      "Version bump: (1) patch  (2) minor  (3) major [default: 1]: ",
    );
    const answer = await readLine();
    const choice = answer.trim();
    if (choice === "3") bump = "major";
    else if (choice === "2") bump = "minor";
    else bump = "patch";
  }

  return {
    scope: scope ?? "all",
    bump,
    commit: values.commit as boolean,
    tag: values.tag as boolean,
    perPackageTags: values["per-package-tags"] as boolean,
    delimiter: values.delimiter as string,
  };
}

async function readLine(): Promise<string> {
  for await (const line of console) {
    return line;
  }
  return "";
}
