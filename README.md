# Eye in the Sky

[![Lint](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/lint.yml/badge.svg)](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/lint.yml)
[![Typecheck](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/typecheck.yml/badge.svg)](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/typecheck.yml)
[![Test](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/test.yml/badge.svg)](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/test.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/TheAngryRaven/DataViewer_coach/badges/coverage-badge.json)](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/coverage.yml)

`@theangryraven/eye-in-the-sky` — an AI driver coach framework, packaged as a
plugin for [DataViewer](https://github.com/TheAngryRaven/DataViewer_coach).

> Status: early. The plugin contributes an "AI Coaching" panel to the host's
> dedicated **Coach** tab showing a deterministic, local, free session debrief —
> laps analysed (valid vs total), session-best lap, lap-time consistency, a
> stitched theoretical best when sectors are present, session top speed, and a
> plain-language takeaway. This is the Stage-1 (no-model) analysis core; the
> AI-powered Stage 2 — see [ARCHITECTURE.md](./ARCHITECTURE.md) and
> [ARCHITECTURE_addon2.md](./ARCHITECTURE_addon2.md) — is not yet implemented.

## Install

From the public npm registry (no registry config needed):

```
npm install @perchwerks/eye-in-the-sky
```

The same release is also mirrored to GitHub Packages (`npm.pkg.github.com`)
under the repo owner's scope, `@theangryraven/eye-in-the-sky`.

## Usage

The package default-exports a `DataViewerPlugin`. The host app loads it and calls
`setup(ctx)` during initialization; the plugin contributes its UI panel to the
host's `PANELS_POINT` registry point (Coach slot):

```ts
import plugin from "@perchwerks/eye-in-the-sky";

plugin.setup(ctx); // ctx provided by the DovesDataViewer host
```

Host integration types (`@/plugins/panels`, `@/types/racing`) are kept as local
compile-time stubs here so the package typechecks standalone; the host's real
modules resolve at runtime.

## Development

```
npm install            # install dev dependencies
npm run lint           # eslint (type-checked; bans `any`)
npm run typecheck      # tsc --noEmit
npm test               # vitest (watch mode)
npm run test:run       # vitest run (single pass)
npm run test:coverage  # run tests with a coverage report
```

The coverage badge is self-hosted: the `Coverage` workflow generates a
[shields.io endpoint](https://shields.io/endpoint) JSON and publishes it to the
`badges` branch — no third-party coverage service is involved.

## License

[GPL-3.0-or-later](./LICENSE).
