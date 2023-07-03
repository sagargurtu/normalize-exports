# normalize-exports

<a href="https://npmjs.com/package/normalize-exports"><img src="https://img.shields.io/npm/v/normalize-exports" alt="npm package"></a>

Normalizes the `"exports"` field of `package.json`.

## Install

```sh
$ npm install normalize-exports
```

## Usage

> See [`src/index.test.ts`](src/index.test.ts) for examples.

```ts
import { normalizeExports } from 'normalize-exports';

const exportsField = {
  '.': {
    import: './dist/esm/index.js',
    default: './dist/index.js',
  },
  './feature': {
    require: './dist/cjs/feature.js',
    default: './dist/feature.js',
  },
  './anotherFeature': [
    {
      worker: './dist/node/anotherFeature.js',
    },
    {
      browser: './dist/umd/anotherFeature.js',
    },
  ],
  './yetAnotherFeature': {
    node: {
      deno: './dist/deno/yetAnotherFeature.js',
      worker: './dist/node/yetAnotherFeature.js',
    },
  },
};

normalizeExports(exportsField);
/* =>
{
  '.': './dist/esm/index.js',
  './feature': './dist/cjs/feature.js'
}
*/

normalizeExports(exportsField, { conditions: ['import', 'require', 'browser'] });
/* =>
{
  '.': './dist/esm/index.js',
  './feature': './dist/cjs/feature.js',
  './anotherFeature': './dist/umd/anotherFeature.js'
}
*/

normalizeExports(exportsField, { conditions: ['import', 'node', 'worker', 'default'] });
/* =>
{
  '.': './dist/esm/index.js',
  './feature': './dist/feature.js',
  './anotherFeature': './dist/node/anotherFeature.js',
  './yetAnotherFeature': './dist/node/yetAnotherFeature.js'
}
*/
```

## API Specification

### normalizeExports(exports, options?)

Returns `object`

Normalizes the `"exports"` field of `package.json` and returns a flattened object after matching nested conditions and
resolving wildcard patterns.

Empty `object` will be returned if none of the conditions match.

May throw an error if:

- `"exports"` is `undefined` or empty.
- `"exports"` is not well-formed.
- A subpath target is invalid.

#### exports

Type: `object` \
Required: `true`

The `"exports"` field of `package.json`.

#### options.conditions

Type: `string[]` \
Required: `false`

Export conditions that should be matched. Following conditions are supported by default:
`['node-addons', 'node', 'import', 'require', 'default']` as per
https://nodejs.org/api/packages.html#conditional-exports. Providing a non-empty array will override the default
conditions.

The order specified here does not matter. Conditions are always matched based on `"exports"` map's key order.

For example,

```ts
normalizeExports({
  worker: './dist/node/index.js',
  production: './dist/prod/index.js',
});

/* =>
{}
*/

normalizeExports({
  worker: './dist/node/index.js',
  default: './dist/index.js',
});

/* =>
{
  '.': './dist/index.js'
}
*/

normalizeExports(
  {
    worker: './dist/node/index.js',
    production: './dist/prod/index.js',
  },
  { conditions: ['worker', 'production'] }
);

/* =>
{
  '.': './dist/node/index.js'
}
*/

normalizeExports(
  {
    worker: './dist/node/index.js',
    production: './dist/prod/index.js',
  },
  { conditions: ['production'] }
);

/* =>
{
  '.': './dist/prod/index.js'
}
*/
```

#### options.cwd

Type: `string` \
Required: `false`

Current working directory to resolve subpaths containing wildcard patterns.

For example,

```ts
normalizeExports({
  './features/*.js': './dist/features/*.js',
});

/* =>
{
  './features/*.js': './dist/features/*.js'
}
*/

normalizeExports(
  {
    './features/*.js': './dist/features/*.js',
  },
  {
    cwd: '/Volumes/test',
  }
);

/* =>
{
  './features/someFeature.js': './dist/features/someFeature.js',
  './features/anotherFeature.js': './dist/features/anotherFeature.js'
}
*/
```

## License

[MIT](LICENSE)
