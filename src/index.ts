import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import picomatch from 'picomatch';

/**
 * Conditional exports ordered from most specific to least specific.
 *
 * Conditions are matched based on order of the keys.
 */
export type ConditionalExports = {
  [condition: string]: ExportsEntry;
};

/**
 * Recursive exports entry.
 */
export type ExportsEntry = string | ConditionalExports | ExportsEntry[];

/**
 * Custom subpaths (with or without patterns).
 */
export type SubpathExports = Record<string, ExportsEntry | null>;

/**
 * The `"exports"` field of `package.json`.
 */
export type Exports = ExportsEntry | SubpathExports;

/**
 * Default supported conditions.
 */
const defaultConditions = ['node', 'import', 'default'];

/**
 * Checks if the `"exports"` field is well-formed.
 */
const checkExportsConfiguration = (exports: Exports) => {
  if (typeof exports === 'object') {
    if (Object.keys(exports).length === 0) {
      throw new Error('No entries found in exports map');
    }

    if (!Array.isArray(exports)) {
      const exportsKeys = Object.keys(exports);
      const keysStartingWithPeriod = exportsKeys.filter((key) => key.startsWith('.'));
      if (keysStartingWithPeriod.length !== 0 && keysStartingWithPeriod.length !== exportsKeys.length) {
        throw new Error('Invalid exports configuration');
      }
    }
  }
};

/**
 * Recursively matches nested conditions and returns a subpath (if found).
 */
const matchConditions = (exports: Exports | null, conditions: Set<string>): string | undefined | null => {
  if (Array.isArray(exports)) {
    if (exports.length === 0) {
      return null;
    }
    let lastError: Error | undefined;
    for (const subEntry of exports) {
      try {
        const value = matchConditions(subEntry, conditions);
        if (typeof value !== 'undefined') {
          return value;
        }
      } catch (error) {
        lastError = error;
      }
    }
    if (typeof lastError === 'object') {
      throw lastError;
    }
  } else if (exports && typeof exports === 'object') {
    for (const [key, subEntry] of Object.entries(exports)) {
      if (conditions.has(key)) {
        const value = matchConditions(subEntry, conditions);
        if (typeof value !== 'undefined') {
          return value;
        }
      }
    }
  } else if (typeof exports === 'string' && !exports.startsWith('./')) {
    throw new Error(`Invalid target '${exports}'`);
  } else {
    return exports;
  }
};

/**
 * Returns all subpath entries after expanding given wildcard pattern.
 */
const expandWildcardEntry = (key: string, value: string, cwd: string): Record<string, string> => {
  const expr = picomatch.makeRe(value, {
    capture: true,
    noglobstar: true,
  });

  const directoryName = path.dirname(value);
  const directoryFullPath = path.join(cwd, directoryName);
  const expandedWildcardEntries: Record<string, string> = {};
  if (existsSync(directoryFullPath)) {
    const fileNames = readdirSync(directoryFullPath).filter((filePath) =>
      statSync(path.join(directoryFullPath, filePath)).isFile()
    );

    for (const fileName of fileNames) {
      const relativeFilePath = path.join(directoryName, fileName);
      const match = expr.exec(relativeFilePath);

      if (match?.[1]) {
        const [matchingPath, matchGroup] = match;
        const normalizedKey = key.replace('*', matchGroup);

        const normalizedFilePath = `./${matchingPath}`;
        expandedWildcardEntries[normalizedKey] = normalizedFilePath;
      }
    }
  } else {
    throw new Error(`Directory '${directoryFullPath}' not found`);
  }
  return expandedWildcardEntries;
};

/**
 * Returns flattened entries after matching conditions recursively and resolving wildcard patterns.
 */
const getFlattenedEntries = (
  exports: Exports,
  conditions: Set<string>,
  cwd: string | undefined
): Record<string, string> => {
  let flattenedEntries: Record<string, string> = {};
  const singleSubpath = matchConditions(exports, conditions);
  if (typeof singleSubpath === 'string') {
    flattenedEntries['.'] = singleSubpath;
  } else {
    for (const [key, subEntry] of Object.entries(exports)) {
      if (!key.startsWith('.')) {
        continue;
      }

      const value = matchConditions(subEntry, conditions);
      if (typeof value !== 'string') {
        continue;
      }

      if (key.includes('*') && cwd) {
        flattenedEntries = {
          ...flattenedEntries,
          ...expandWildcardEntry(key, value, cwd),
        };
      } else {
        flattenedEntries[key] = value;
      }
    }
  }
  return flattenedEntries;
};

/**
 * Normalization options.
 */
export interface NormalizeExportsOptions {
  /**
   * Additional conditions that should be supported.
   *
   * By default, the following conditions are supported:
   * ```
   * ['node', 'import', 'default']
   * ```
   *
   * The order specified here does not matter. Conditions are always matched based on `"exports"` map's key order.
   */
  conditions?: string[];

  /**
   * Current working directory to resolve subpaths containing wildcard patterns.
   */
  cwd?: string;
}

/**
 * Normalizes the `"exports"` field of package.json and returns a flattened object.
 *
 * For example, for the below input:
 * ```json
 * {
 *   ".": {
 *     "import": "./dist/esm/index.js",
 *     "default": "./dist/index.js"
 *   },
 *   "./feature": "./dist/feature/index.js"
 * }
 * ```
 * following object is returned:
 * ```json
 * {
 *   ".": "./dist/esm/index.js",
 *   "./feature": "./dist/feature/index.js"
 * }
 * ```
 *
 * @param {Exports} exports Contents of `"exports"` field.
 * @param {NormalizeExportsOptions} options Options for normalization.
 * @returns {Record<string, string>} Normalized exports.
 */
export const normalizeExports = (exports: Exports, options?: NormalizeExportsOptions): Record<string, string> => {
  if (!exports) {
    throw new Error('Exports is not defined');
  }
  checkExportsConfiguration(exports);

  const conditions = new Set([...defaultConditions, ...(options?.conditions || [])]);
  const cwd = options?.cwd;
  const normalizedExports = getFlattenedEntries(exports, conditions, cwd);

  return normalizedExports;
};
