import { describe, expect, it } from 'vitest';
import mockFs from 'mock-fs';

import type { Exports } from './index.js';
import { normalizeExports } from './index.js';

describe('normalizeExports', () => {
  it('should check exports configuration', () => {
    expect(() => normalizeExports(null as unknown as Exports)).toThrow('Exports is not defined');

    expect(() => normalizeExports('')).toThrow('Exports is not defined');

    expect(() => normalizeExports({})).toThrow('No entries found in exports map');

    expect(() => normalizeExports([])).toThrow('No entries found in exports map');

    expect(() =>
      normalizeExports({
        '.': './dist/index.js',
        node: './dist/node/index.js',
      })
    ).toThrow('Invalid exports configuration');
  });

  it('should apply conditions to string input', () => {
    expect(normalizeExports('./dist/index.js')).toStrictEqual({ '.': './dist/index.js' });
  });

  it('should apply conditions in order to object input', () => {
    expect(
      normalizeExports({
        import: './dist/esm/index.js',
        default: './dist/index.js',
      })
    ).toStrictEqual({ '.': './dist/esm/index.js' });

    expect(
      normalizeExports({
        require: './dist/cjs/index.js',
        default: './dist/index.js',
      })
    ).toStrictEqual({ '.': './dist/index.js' });

    expect(
      normalizeExports(
        {
          require: './dist/cjs/index.js',
          import: './dist/esm/index.js',
          default: './dist/index.js',
        },
        {
          conditions: ['require'],
        }
      )
    ).toStrictEqual({ '.': './dist/cjs/index.js' });

    expect(
      normalizeExports({
        require: './dist/cjs/index.js',
      })
    ).toStrictEqual({});
  });

  it('should apply conditions in order to array input', () => {
    expect(normalizeExports(['./dist/index.js'])).toStrictEqual({ '.': './dist/index.js' });

    expect(
      normalizeExports([
        {
          default: './dist/index.js',
          import: './dist/esm/index.js',
        },
      ])
    ).toStrictEqual({ '.': './dist/index.js' });

    expect(
      normalizeExports(
        [
          {
            worker: './dist/node/index.js',
          },
          {
            require: './dist/cjs/index.js',
          },
          {
            browser: './dist/umd/index.js',
          },
        ],
        {
          conditions: ['browser'],
        }
      )
    ).toStrictEqual({ '.': './dist/umd/index.js' });

    expect(
      normalizeExports(
        [
          {
            require: [],
          },
          './dist/index.js',
        ],
        {
          conditions: ['require'],
        }
      )
    ).toStrictEqual({});

    expect(
      normalizeExports([
        {
          import: 'dist/esm/index.js',
        },
        {
          default: './dist/index.js',
        },
      ])
    ).toStrictEqual({ '.': './dist/index.js' });

    expect(() =>
      normalizeExports([
        {
          import: 'dist/esm/index.js',
        },
        {
          worker: './dist/index.js',
        },
      ])
    ).toThrow(`Invalid target 'dist/esm/index.js'`);
  });

  it('should throw error for invalid target', () => {
    expect(() => normalizeExports('dist/index.js')).toThrow(`Invalid target 'dist/index.js'`);

    expect(() => normalizeExports({ '.': 'dist/index.js' })).toThrow(`Invalid target 'dist/index.js'`);
  });

  it('should skip unsupported conditions', () => {
    expect(
      normalizeExports({
        worker: './dist/node/index.js',
      })
    ).toStrictEqual({});
  });

  it('should not expand wildcard pattern if cwd is not provided', () => {
    expect(
      normalizeExports({
        './features/*': './dist/features/*.js',
      })
    ).toStrictEqual({
      './features/*': './dist/features/*.js',
    });
  });

  it('should throw error if cwd does not exist', () => {
    mockFs();

    expect(() =>
      normalizeExports(
        {
          './features/*': './dist/features/*.js',
        },
        {
          cwd: '/Volumes/test',
        }
      )
    ).toThrow(`Directory '/Volumes/test/dist/features' not found`);

    mockFs.restore();
  });

  it('should expand wildcard pattern', () => {
    mockFs({
      '/Volumes/test/dist/features': {
        'someFeature.js': '',
        'anotherFeature.js': '',
      },
    });

    expect(
      normalizeExports(
        {
          './features/*': './dist/features/*.js',
        },
        {
          cwd: '/Volumes/test',
        }
      )
    ).toStrictEqual({
      './features/someFeature': './dist/features/someFeature.js',
      './features/anotherFeature': './dist/features/anotherFeature.js',
    });

    mockFs.restore();
  });

  it('should normalize exports', () => {
    mockFs({
      '/Volumes/test/dist/components/esm': {
        'someComponent.js': '',
      },
    });

    expect(
      normalizeExports({
        '.': './dist/index.js',
        './someFeature': './dist/someFeature.js',
        './features/private-internal/*': null,
      })
    ).toStrictEqual({
      '.': './dist/index.js',
      './someFeature': './dist/someFeature.js',
    });

    expect(
      normalizeExports(
        {
          '.': {
            import: './dist/esm/index.js',
            default: './dist/index.js',
          },
          './someFeature': {
            require: './dist/cjs/someFeature.js',
            default: './dist/someFeature.js',
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
            worker: './dist/node/yetAnotherFeature.js',
          },
          './components/*': [
            {
              node: {
                deno: './dist/components/deno/*.js',
                import: './dist/components/esm/*.js',
              },
            },
          ],
        },
        {
          conditions: ['require', 'browser'],
          cwd: '/Volumes/test',
        }
      )
    ).toStrictEqual({
      '.': './dist/esm/index.js',
      './someFeature': './dist/cjs/someFeature.js',
      './anotherFeature': './dist/umd/anotherFeature.js',
      './components/someComponent': './dist/components/esm/someComponent.js',
    });

    mockFs.restore();
  });
});
