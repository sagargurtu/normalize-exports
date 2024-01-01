import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { Exports, NormalizeExportsOptions } from './types.js';
import { containsSingleAsterisk, isNonEmptyArray } from './utils.js';

/**
 * Default supported conditions.
 * @see https://nodejs.org/api/packages.html#conditional-exports
 */
const defaultConditions = ['node-addons', 'node', 'import', 'require', 'default'];

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
 * Returns all expansions of the given wildcard entry pair.
 */
const expandWildcardEntry = (wildcardKey: string, wildcardValue: string, cwd: string): Record<string, string> => {
  const [wildcardValueBase, wildcardValueTrail] = wildcardValue.split('*');
  const directoryToExpand = path.resolve(cwd, wildcardValueBase);
  if (!existsSync(directoryToExpand)) {
    throw new Error(`Directory '${directoryToExpand}' not found`);
  }

  const expandedEntries: Record<string, string> = {};
  const directoryEntries = readdirSync(directoryToExpand, { withFileTypes: true, recursive: true });
  for (const directoryEntry of directoryEntries) {
    if (directoryEntry.isFile()) {
      const expandedPath = path.join(directoryEntry.path, directoryEntry.name);
      const relativeExpandedPath = path.relative(directoryToExpand, expandedPath);

      if (relativeExpandedPath.endsWith(wildcardValueTrail)) {
        const patternMatch = relativeExpandedPath.slice(0, relativeExpandedPath.indexOf(wildcardValueTrail));
        expandedEntries[wildcardKey.replace('*', patternMatch)] = wildcardValue.replace('*', patternMatch);
      }
    }
  }
  return expandedEntries;
};

/**
 * Returns all subpath entries after expanding given wildcard pattern.
 */
const expandWildcardEntries = (
  flattenedEntries: Record<string, string | null>,
  cwd: string | undefined
): Record<string, string> => {
  let expandedEntries: Record<string, string> = {};
  const nonWildcardEntries: Record<string, string> = {};
  const excludedWildcardKeys: string[] = [];

  for (const [key, value] of Object.entries(flattenedEntries)) {
    if (key.includes('*') && cwd) {
      if (!containsSingleAsterisk(key)) {
        throw new Error(`Invalid subpath pattern '${key}'`);
      }

      if (value === null) {
        excludedWildcardKeys.push(key);
      } else if (!containsSingleAsterisk(value)) {
        throw new Error(`Multiple '*' in '${value}' are not supported`);
      } else {
        expandedEntries = {
          ...expandedEntries,
          ...expandWildcardEntry(key, value, cwd),
        };
      }
    } else if (value !== null) {
      nonWildcardEntries[key] = value;
    }
  }

  for (const excludedKey of excludedWildcardKeys) {
    const [excludedKeyBase, excludedKeyTrail] = excludedKey.split('*');
    for (const expandedKey of Object.keys(expandedEntries)) {
      if (
        expandedKey.startsWith(excludedKeyBase) &&
        expandedKey.endsWith(excludedKeyTrail) &&
        excludedKeyBase.length + excludedKeyTrail.length <= expandedKey.length
      ) {
        delete expandedEntries[expandedKey];
      }
    }
  }

  return {
    ...nonWildcardEntries,
    ...expandedEntries,
  };
};

/**
 * Returns flattened entries after matching conditions recursively and resolving wildcard patterns.
 */
const getFlattenedEntries = (
  exports: Exports,
  conditions: Set<string>,
  cwd: string | undefined
): Record<string, string> => {
  let flattenedEntries: Record<string, string | null> = {};
  const singleSubpath = matchConditions(exports, conditions);
  if (typeof singleSubpath === 'string') {
    flattenedEntries['.'] = singleSubpath;
  } else {
    for (const [key, subEntry] of Object.entries(exports)) {
      if (!key.startsWith('.')) {
        continue;
      }

      const value = matchConditions(subEntry, conditions);
      if (value !== undefined) {
        flattenedEntries[key] = value;
      }
    }
  }
  return expandWildcardEntries(flattenedEntries, cwd);
};

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

  const { conditions, cwd } = options || {};
  const normalizedExports = getFlattenedEntries(
    exports,
    new Set(isNonEmptyArray(conditions) ? conditions : defaultConditions),
    cwd
  );

  return normalizedExports;
};
