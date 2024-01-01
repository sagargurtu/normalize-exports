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
 * Normalization options.
 */
export interface NormalizeExportsOptions {
  /**
   * Export conditions that should be matched.
   *
   * By default, the following conditions are supported:
   * ```
   * ['node-addons', 'node', 'import', 'require', 'default']
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
