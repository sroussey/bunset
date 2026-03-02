# Changelog

## 1.0.4

### Bug Fixes

- handle existing tags during commit and tagging process

## 1.0.3

### Bug Fixes

- show friendly error for unrecognized CLI options

## 1.0.2

### Bug Fixes

- link back to github

## 1.0.1

### Bug Fixes

- missing README

## 1.0.0

### Features

- align with Conventional Commits 1.0.0 breaking change detection

## 0.0.3

### Features

- automatically determine tag-prefix based on tag history
- add --debug option for detailed logging during execution

## 0.0.2

### Features

- add --tag-prefix option and default --commit/--tag to true
- enhance changelog generation for monorepos with per-package filtering
- add --dry-run option
- git tag is default
- add scopes, e.g. feaure(api): description
- user configurable sections and section ordering
- add new sections of changelog: refactor, style, docs, chore, ops, build, perf
- add local toml file for settings

## 0.0.1

### Features

- Initial code for changeset
