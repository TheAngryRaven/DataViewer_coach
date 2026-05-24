# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.2] - 2026-05-24

### Changed

- Publish workflow now releases to the public npm registry (via `NPM_TOKEN`) in
  addition to GitHub Packages on `v*` tags. Removed `publishConfig.registry`
  so each publish job targets its own registry. The npm release is published
  as `@perchwerks/eye-in-the-sky` (the job rewrites the scope at publish time);
  GitHub Packages keeps `@theangryraven/eye-in-the-sky` to match the repo owner.

### Added

- Plugin scaffold: `index.ts` entrypoint default-exporting a `DataViewerPlugin`
  that contributes a placeholder `diagnostics` message, with a local
  `plugins/types.ts` stub of the host interfaces.
- Tooling: Vitest with v8 coverage and a smoke test; strict TypeScript;
  type-checked ESLint that bans `any`.
- CI pipelines (`lint`, `typecheck`, `test`, `coverage`) and a tag-triggered
  `publish` workflow for GitHub Packages.
- Self-hosted coverage badge published to the `badges` branch.
- GPL-3.0-or-later license, README, and project notes.
