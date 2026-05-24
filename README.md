# Eye in the Sky

`@theangryraven/eye-in-the-sky` — an AI driver coach framework, packaged as a
plugin for [DataViewer](https://github.com/TheAngryRaven/DataViewer_coach).

> Status: early scaffold. The plugin currently registers itself and contributes
> a placeholder diagnostic. The coaching framework is not yet implemented.

## Install

This package is published to the GitHub Packages npm registry:

```
npm install @theangryraven/eye-in-the-sky
```

## Usage

The package default-exports a `DataViewerPlugin`. The host app loads it and calls
`setup(ctx)` during initialization:

```ts
import plugin from "@theangryraven/eye-in-the-sky";

plugin.setup(ctx); // ctx provided by the DataViewer host
```

## Development

```
npm install        # install dev dependencies
npm run typecheck  # tsc --noEmit
npm test           # run the test suite
npm run coverage   # run tests with a coverage report
```

## License

[GPL-3.0-or-later](./LICENSE).
