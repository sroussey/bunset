import type { SurfaceChange } from "./types.ts";

type Manifest = Record<string, unknown>;

/**
 * Every `exports` subpath, and every condition reachable under it, as flat
 * keys: `"."`, `".:import"`, `"./ai:types"`. Nested condition objects are
 * walked, so dropping just the `bun` condition from one subpath is visible.
 */
function exportKeys(exports: unknown): Set<string> {
  const keys = new Set<string>();

  const walk = (node: unknown, subpath: string, condition: string): void => {
    // `null` is how a manifest spells "this subpath/condition no longer
    // resolves", so it contributes no key — which is what makes nulling one
    // out show up as a removal rather than as an unchanged export.
    if (node === null) return;
    if (typeof node !== "object" || Array.isArray(node)) {
      keys.add(condition ? `${subpath}:${condition}` : subpath);
      return;
    }
    for (const [key, value] of Object.entries(node as Manifest)) {
      if (subpath === "" && (key === "." || key.startsWith("./"))) {
        walk(value, key, "");
      } else {
        walk(value, subpath === "" ? "." : subpath, condition ? `${condition}.${key}` : key);
      }
    }
  };

  if (typeof exports === "string") {
    keys.add(".");
  } else if (exports !== null && typeof exports === "object") {
    walk(exports, "", "");
  }
  return keys;
}

function binKeys(bin: unknown, packageName: string): Set<string> {
  // A string `bin` installs under the package's unscoped name, so "@scope/p"
  // and { p: ... } name the same binary and must compare equal.
  if (typeof bin === "string") return new Set([packageName.split("/").pop()!]);
  if (bin !== null && typeof bin === "object") return new Set(Object.keys(bin as Manifest));
  return new Set();
}

/**
 * The lowest version a range admits, as a comparable tuple. A heuristic: it
 * reads the first version-looking token, which covers the shapes an `engines`
 * field actually uses (`>=24`, `^1.4.0`, `18.x`). Ranges it cannot read
 * compare equal, so they are reported as neither raised nor lowered.
 */
export function rangeFloor(range: string): [number, number, number] | null {
  const match = /(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?/.exec(range);
  if (!match) return null;
  const part = (raw: string | undefined): number =>
    raw === undefined || raw === "x" || raw === "*" ? 0 : Number(raw);
  return [Number(match[1]), part(match[2]), part(match[3])];
}

function isHigher(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  }
  return false;
}

function hasEntryPoint(pkg: Manifest): boolean {
  // An explicit `null` is how a manifest spells "this field is gone", so it
  // counts as absent rather than as a field that happens to be present.
  const present = (value: unknown): boolean => value !== undefined && value !== null;
  return present(pkg.exports) || present(pkg.main) || present(pkg.module);
}

/**
 * Incompatible changes between a package's manifest at the last release tag
 * and its manifest now.
 *
 * This reads the manifest only — it is not an API diff, so a changed function
 * signature is invisible to it. What it does see is the class of break that
 * is invisible to a commit message too: an entry point or export condition
 * that stopped resolving, a dropped binary, and a runtime floor that moved
 * under consumers who were never told.
 */
export function diffManifestSurface(oldPkg: Manifest, newPkg: Manifest): SurfaceChange[] {
  const changes: SurfaceChange[] = [];
  const name = (newPkg.name as string) ?? (oldPkg.name as string) ?? "package";

  if (oldPkg.private !== true && newPkg.private === true) {
    changes.push({
      kind: "unpublished",
      detail: `"private": true — ${name} was publishable at the last tag and is not now`,
    });
  }

  if (hasEntryPoint(oldPkg) && !hasEntryPoint(newPkg)) {
    changes.push({
      kind: "entry-point-removed",
      detail: `no "exports", "main" or "module" — importing ${name} no longer resolves`,
    });
  } else {
    const oldExports = exportKeys(oldPkg.exports);
    const newExports = exportKeys(newPkg.exports);
    for (const key of oldExports) {
      if (newExports.has(key)) continue;

      const split = key.indexOf(":");
      const subpath = split === -1 ? key : key.slice(0, split);
      const condition = split === -1 ? undefined : key.slice(split + 1);

      // A bare target under the subpath resolves for every condition, so it
      // covers whatever condition used to be spelled out. Collapsing
      // { types, import } down to one string broadens the export; it is not a
      // removal, and reporting it as one refuses a release that broke nothing.
      const newIsUnconditional = newExports.has(subpath);
      const newConditions = [...newExports].filter((k) => k.startsWith(`${subpath}:`));

      if (condition !== undefined) {
        if (newIsUnconditional) continue;
        changes.push(
          newConditions.length === 0
            ? { kind: "export-removed", detail: `exports["${subpath}"] was removed` }
            : {
                kind: "condition-removed",
                detail: `exports["${subpath}"] no longer resolves the "${condition}" condition`,
              },
        );
      } else if (newConditions.length > 0) {
        // The reverse narrowing: what resolved everywhere now resolves only
        // under named conditions, so any other resolver stops finding it.
        changes.push({
          kind: "condition-removed",
          detail:
            `exports["${subpath}"] no longer resolves unconditionally ` +
            `(only under ${newConditions.map((k) => `"${k.slice(subpath.length + 1)}"`).join(", ")})`,
        });
      } else {
        changes.push({ kind: "export-removed", detail: `exports["${subpath}"] was removed` });
      }
    }
  }

  const oldBins = binKeys(oldPkg.bin, name);
  const newBins = binKeys(newPkg.bin, name);
  for (const bin of oldBins) {
    if (!newBins.has(bin)) {
      changes.push({ kind: "bin-removed", detail: `the "${bin}" binary was removed` });
    }
  }

  const oldEngines = (oldPkg.engines ?? {}) as Record<string, string>;
  const newEngines = (newPkg.engines ?? {}) as Record<string, string>;
  for (const [engine, range] of Object.entries(newEngines)) {
    if (typeof range !== "string") continue;
    const previous = oldEngines[engine];
    if (previous === undefined) {
      changes.push({
        kind: "engines-added",
        detail: `engines.${engine} is now "${range}" — it was unconstrained at the last tag`,
      });
      continue;
    }
    const before = rangeFloor(previous);
    const after = rangeFloor(range);
    if (before && after && isHigher(after, before)) {
      changes.push({
        kind: "engines-raised",
        detail: `engines.${engine} moved from "${previous}" to "${range}"`,
      });
    }
  }

  return changes;
}

/** One message body naming the package, a line per change. */
export function describeSurfaceChanges(
  pkgName: string,
  changes: readonly SurfaceChange[],
): string {
  return [`${pkgName}:`, ...changes.map((c) => `  - ${c.detail}`)].join("\n");
}
