export type BumpType = "patch" | "minor" | "major";
export type PackageScope = "all" | "changed";
export type CommitType = "feature" | "bugfix" | "test";

export interface CliOptions {
  scope: PackageScope;
  bump: BumpType;
  commit: boolean;
  tag: boolean;
  perPackageTags: boolean;
  delimiter: string;
}

export interface ParsedCommit {
  hash: string;
  message: string;
  type: CommitType | null;
  description: string;
}

export interface GroupedCommits {
  features: ParsedCommit[];
  bugfixes: ParsedCommit[];
  tests: ParsedCommit[];
}

export interface PackageInfo {
  name: string;
  path: string;
  packageJsonPath: string;
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface UpdatedDependency {
  name: string;
  newVersion: string;
}
