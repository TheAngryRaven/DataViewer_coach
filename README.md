# Eye in the Sky

[![Lint](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/lint.yml/badge.svg)](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/lint.yml)
[![Typecheck](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/typecheck.yml/badge.svg)](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/typecheck.yml)
[![Test](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/test.yml/badge.svg)](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/test.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/TheAngryRaven/DataViewer_coach/badges/coverage-badge.json)](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/coverage.yml)

`@theangryraven/eye-in-the-sky` — an AI driver coach framework, packaged as a
plugin for [DataViewer](https://github.com/TheAngryRaven/DataViewer_coach).

> Status: early scaffold. The plugin currently registers itself and contributes
> a placeholder diagnostic. The coaching framework is not yet implemented.

## Install

From the public npm registry (no registry config needed):

```
npm install @perchwerks/eye-in-the-sky
```

The same release is also mirrored to GitHub Packages (`npm.pkg.github.com`)
under the repo owner's scope, `@theangryraven/eye-in-the-sky`.

## Usage

The package default-exports a `DataViewerPlugin`. The host app loads it and calls
`setup(ctx)` during initialization:

```ts
import plugin from "@theangryraven/eye-in-the-sky";

plugin.setup(ctx); // ctx provided by the DataViewer host
```

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
